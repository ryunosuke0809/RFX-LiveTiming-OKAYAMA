import type { IngestEnvelope } from "../types/ingest.js";
import { LiveSessionState } from "../state/session-state.js";
import { SessionStateAggregator } from "../state/aggregator.js";
import type { LiveStateSnapshot } from "../state/types.js";

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
 * 1 日分の envelope を時系列再生し、セッション境界ごとに最終スナップショットを切り出す。
 *
 * 境界はライブと同じく:
 * - `Select` … 常にリセット
 * - `Category` … competition|category|round 署名が変わったとき
 */
export function rebuildSessionsFromMessages(
    dateYyyymmdd: string,
    envelopes: IngestEnvelope[],
): ArchiveSessionDetail[] {
    const dateIso = `${dateYyyymmdd.slice(0, 4)}-${dateYyyymmdd.slice(4, 6)}-${dateYyyymmdd.slice(6, 8)}`;
    const state = new LiveSessionState();
    const aggregator = new SessionStateAggregator(state);
    const out: ArchiveSessionDetail[] = [];
    let lastTs: string | null = null;

    const flush = (endedAt: string | null) => {
        if (state.teams.size === 0 && state.standings.size === 0) return;
        const snap = state.snapshot(new Date().toISOString());
        const session = snap.session;
        out.push({
            index: out.length,
            date: dateIso,
            competitionName:
                session?.competitionNameE || session?.competitionNameJ || "",
            categoryName: session?.categoryNameE || session?.categoryNameJ || "",
            sessionName: session?.sessionNameE || session?.sessionNameJ || "",
            roundName: session?.roundNameE || session?.roundNameJ || "",
            isRace: session?.isRace ?? false,
            startedAt: session?.sessionStartedAt ?? null,
            endedAt,
            carCount: snap.standings.filter((s) => s.position > 0 || s.lap > 0).length || snap.teams.length,
            circuitId: snap.circuitId,
            snapshot: snap,
        });
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

    return out;
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
