import type { IngestEnvelope } from "../types/ingest.js";
import { LiveSessionState } from "../state/session-state.js";
import { SessionStateAggregator } from "../state/aggregator.js";
import type { LiveStateSnapshot, SessionInfoVm } from "../state/types.js";

export interface ArchiveSessionSummary {
    /** 日付内のインデックス (0 始まり)。API の sessionIndex に使う。 */
    index: number;
    date: string; // YYYY-MM-DD
    competitionName: string;
    categoryName: string;
    sessionName: string;
    roundName: string;
    isRace: boolean;
    startedAt: string | null;
    endedAt: string | null;
    carCount: number;
    circuitId: string | null;
}

export interface ArchiveSessionDetail extends ArchiveSessionSummary {
    snapshot: LiveStateSnapshot;
}

/**
 * 1 日分の envelope を時系列再生し、セッション境界ごとにスナップショットを切り出す。
 *
 * MOLA は同一セッションでも Competition / Category / Select / マスターを何度も再送するため、
 * 境界のたびに配列へ追加するとカレンダーが重複だらけになる。
 * そのため論理キー (大会|カテゴリ|ラウンド|セッション名|race) で **最新・最充実** の
 * 1 件だけを残す。
 */
export function rebuildSessionsFromMessages(
    dateYyyymmdd: string,
    envelopes: IngestEnvelope[],
): ArchiveSessionDetail[] {
    const dateIso = `${dateYyyymmdd.slice(0, 4)}-${dateYyyymmdd.slice(4, 6)}-${dateYyyymmdd.slice(6, 8)}`;
    const state = new LiveSessionState();
    const aggregator = new SessionStateAggregator(state);
    const byKey = new Map<string, ArchiveSessionDetail>();
    let lastTs: string | null = null;

    const flush = (endedAt: string | null) => {
        if (state.teams.size === 0 && state.standings.size === 0) return;
        const snap = state.snapshot(new Date().toISOString());
        const session = snap.session;
        const key = makeSessionKey(session);
        if (!key) return;

        const carCount =
            snap.standings.filter((s) => s.position > 0 || s.lap > 0 || (s.bestTime ?? 0) > 0)
                .length || snap.teams.length;

        // 名前も車も無い空マスターは一覧に出さない
        if (carCount === 0 && !displayName(session)) return;

        const candidate: ArchiveSessionDetail = {
            index: 0, // 後で振り直す
            date: dateIso,
            competitionName:
                session?.competitionNameE || session?.competitionNameJ || "",
            categoryName: session?.categoryNameE || session?.categoryNameJ || "",
            sessionName: session?.sessionNameE || session?.sessionNameJ || "",
            roundName: session?.roundNameE || session?.roundNameJ || "",
            isRace: session?.isRace ?? false,
            startedAt: session?.sessionStartedAt ?? null,
            endedAt,
            carCount,
            circuitId: snap.circuitId,
            snapshot: snap,
        };

        const prev = byKey.get(key);
        if (!prev || isRicher(candidate, prev)) {
            byKey.set(key, candidate);
        }
    };

    for (const env of envelopes) {
        if (willResetSession(state, env)) {
            flush(lastTs);
        }
        aggregator.apply(env);
        lastTs = env.ts;
        if (!state.circuitId && env.circuitId) {
            state.circuitId = env.circuitId;
        }
    }
    flush(lastTs);

    // 開始時刻・名前で安定ソートして index を振り直す
    const list = Array.from(byKey.values()).sort((a, b) => {
        const ta = a.startedAt || a.endedAt || "";
        const tb = b.startedAt || b.endedAt || "";
        if (ta !== tb) return ta.localeCompare(tb);
        return `${a.competitionName}|${a.categoryName}|${a.roundName}|${a.sessionName}`.localeCompare(
            `${b.competitionName}|${b.categoryName}|${b.roundName}|${b.sessionName}`,
        );
    });
    return list.map((s, i) => ({ ...s, index: i }));
}

/** 同一論理セッションのキー。SessionId は MOLA で使いまわされるため使わない。 */
function makeSessionKey(session: SessionInfoVm | null): string | null {
    if (!session) return null;
    const comp = session.competitionNameJ || session.competitionNameE || "";
    const cat = session.categoryNameJ || session.categoryNameE || "";
    const round = session.roundNameJ || session.roundNameE || "";
    const sess = session.sessionNameJ || session.sessionNameE || "";
    // 最低でもカテゴリかラウンド名が無いとキーにならない（空マスター除外）
    if (!comp && !cat && !round && !sess) return null;
    return `${comp}|${cat}|${round}|${sess}|${session.isRace ? "R" : "T"}`;
}

function displayName(session: SessionInfoVm | null): string {
    if (!session) return "";
    return (
        session.sessionNameE ||
        session.sessionNameJ ||
        session.roundNameE ||
        session.roundNameJ ||
        session.categoryNameE ||
        session.categoryNameJ ||
        ""
    );
}

/** より「結果らしい」スナップショットを優先する。 */
function isRicher(next: ArchiveSessionDetail, prev: ArchiveSessionDetail): boolean {
    const score = (s: ArchiveSessionDetail) => {
        const withTime = s.snapshot.standings.filter((x) => (x.bestTime ?? 0) > 0 || (x.lastLapTime ?? 0) > 0).length;
        const withLap = s.snapshot.standings.filter((x) => x.lap > 0).length;
        const lapRows = Object.values(s.snapshot.driverLaps).reduce((n, arr) => n + arr.length, 0);
        return withTime * 1000 + withLap * 100 + lapRows * 10 + s.carCount;
    };
    const sn = score(next);
    const sp = score(prev);
    if (sn !== sp) return sn > sp;
    // 同じ充実度なら後勝ち (より終盤の状態)
    return (next.endedAt || "") >= (prev.endedAt || "");
}

function willResetSession(state: LiveSessionState, env: IngestEnvelope): boolean {
    if (env.kind === "Select") {
        return state.teams.size > 0 || state.standings.size > 0 || state.sessionSignature !== null;
    }
    if (env.kind !== "Category") return false;

    const s = state.session;
    if (!s || state.sessionSignature === null) return false;
    const p = (env.payload ?? {}) as Record<string, unknown>;
    const nextCatJ = pickStr(p, "nameJ", "NameJ") ?? "";
    const nextSig = `${s.competitionNameJ}|${nextCatJ}|${s.roundNameJ}`;
    return nextSig !== state.sessionSignature;
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
    }
    return null;
}
