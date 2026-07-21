import type { IngestEnvelope } from "../types/ingest.js";
import {
    classifyTimeType,
    deriveStatusFromLoop,
    formatGap,
    formatSecondsDiff,
    parseFlagFromMessage,
} from "./derive.js";
import type { LiveSessionState, TeamLapAccum } from "./session-state.js";
import type {
    CarClassVm,
    CarStatus,
    LapDataVm,
    LiveStatePatch,
    RaceControlMessageVm,
    SectorTimeVm,
    StandingVm,
    TeamSummaryVm,
    TrackFlag,
} from "./types.js";

/**
 * ingest envelope を受け取り、`LiveSessionState` を更新して
 * フロントエンドへ送る差分 (`LiveStatePatch[]`) を返す。
 *
 * - 副作用は state の変更だけ。フロントへの broadcast は呼び出し側が行う。
 * - DTO のフィールド名は `JsonNamingPolicy.CamelCase` で .NET から送られている前提
 *   (例: `Time` → `time`, `TeamId` → `teamId`)。
 */
/** 最終 Passing からこの時間(ms, データ時刻)経過で「停止」と判定。岡山1周 ~90-100s。 */
const STOP_MS = 90_000;

export class SessionStateAggregator {
    constructor(private readonly state: LiveSessionState) {}

    apply(envelope: IngestEnvelope): LiveStatePatch[] {
        this.state.circuitId = envelope.circuitId;
        if (envelope.ts) this.state.lastDataTs = envelope.ts;
        const p = envelope.payload as Record<string, unknown>;

        let patches: LiveStatePatch[];
        switch (envelope.kind) {
            case "Competition":
                patches = this.applyCompetition(p);
                break;
            case "Category":
                patches = this.applyCategory(p);
                break;
            case "Round":
                patches = this.applyRound(p);
                break;
            case "Session":
                patches = this.applySession(p);
                break;
            case "Class":
                patches = this.applyClass(p);
                break;
            case "Team":
                patches = this.applyTeam(p);
                break;
            case "Select":
                patches = this.applySelect(p);
                break;
            case "Start":
                patches = this.applyStart(p);
                break;
            case "Passing":
                patches = this.applyPassing(p);
                break;
            case "Standings":
                patches = this.applyStandings(p);
                break;
            case "Message":
                patches = this.applyMessage(p);
                break;
            default:
                patches = [];
        }

        // 一定時間 Passing が来ない車両は「停止 (stopped)」と判定する。
        // Passing/Standings のたびにデータ時刻が進むので、そのタイミングで再評価する。
        if (envelope.kind === "Passing" || envelope.kind === "Standings") {
            const stalled = this.checkStalled();
            if (stalled.length > 0) patches = patches.concat(stalled);
        }
        return patches;
    }

    /** データ時刻(ms)。lastDataTs から算出。未確定時は null。 */
    private currentDataMs(): number | null {
        if (!this.state.lastDataTs) return null;
        const t = Date.parse(this.state.lastDataTs);
        return Number.isNaN(t) ? null : t;
    }

    /**
     * 最終 Passing から STOP_MS 以上データ時刻が進んだ車両を stopped にする。
     * 復帰 (再度 Passing) 時は applyPassing 側で on_track に戻る。
     */
    private checkStalled(): LiveStatePatch[] {
        const nowMs = this.currentDataMs();
        if (nowMs === null) return [];
        const patches: LiveStatePatch[] = [];
        let anyChanged = false;
        for (const [teamId, st] of this.state.standings) {
            if (st.status !== "on_track" && st.status !== "pit_out") continue;
            const last = this.state.lastPassingDataMs.get(teamId);
            if (last === undefined) continue;
            if (nowMs - last >= STOP_MS) {
                st.status = "stopped";
                patches.push({ kind: "standing_upsert", value: { ...st } });
                anyChanged = true;
            }
        }
        if (anyChanged) patches.push({ kind: "track_count", value: this.state.trackCount() });
        return patches;
    }

    // ============================================================
    // Masters
    // ============================================================

    private applyCompetition(p: Record<string, unknown>): LiveStatePatch[] {
        const fields = {
            competitionId: str(p, "id") ?? "",
            competitionNameJ: str(p, "nameJ") ?? "",
            competitionNameE: str(p, "nameE") ?? "",
        };
        return this.mergeSessionInfo(fields);
    }

    private applyCategory(p: Record<string, unknown>): LiveStatePatch[] {
        const fields = {
            categoryId: str(p, "id") ?? "",
            categoryNameJ: str(p, "nameJ") ?? "",
            categoryNameE: str(p, "nameE") ?? "",
        };
        const patches = this.mergeSessionInfo(fields);

        // MOLA は SessionId が固定のため、Competition/Category 名で切替を検知する。
        // Category はマスターダンプの Class/Team より前に来るので、ここでリセットすれば
        // 直後に再送されるマスターで新セッションのエントリーが正しく構築される。
        const s = this.state.session;
        const signature = s
            ? `${s.competitionNameJ}|${s.categoryNameJ}|${s.roundNameJ}`
            : "";
        const isSwitch =
            this.state.sessionSignature !== null &&
            signature !== this.state.sessionSignature;
        this.state.sessionSignature = signature;
        if (isSwitch) {
            this.state.resetForSessionSwitch();
            return [{ kind: "reset" }, ...patches];
        }
        return patches;
    }

    private applyRound(p: Record<string, unknown>): LiveStatePatch[] {
        const nameJ = str(p, "nameJ") ?? "";
        const nameE = str(p, "nameE") ?? "";
        // MOLA の Round.Type は当該データでは常に "L" で信頼できないため、
        // ラウンド名から race / time を推定する (決勝・Race・Final → race、他は time)。
        this.state.sessionMode = deriveSessionMode(nameJ, nameE, str(p, "type"));
        const fields = {
            roundId: str(p, "id") ?? "",
            roundNameJ: nameJ,
            roundNameE: nameE,
            isRace: this.state.sessionMode === "race",
        };
        return this.mergeSessionInfo(fields);
    }

    private applySession(p: Record<string, unknown>): LiveStatePatch[] {
        const fields = {
            sessionId: str(p, "id") ?? "",
            sessionNameJ: str(p, "nameJ") ?? "",
            sessionNameE: str(p, "nameE") ?? "",
            sessionTime: str(p, "time") ?? "",
            sessionLaps: int(p, "lap") ?? 0,
        };
        return this.mergeSessionInfo(fields);
    }

    private applyClass(p: Record<string, unknown>): LiveStatePatch[] {
        const id = str(p, "id") ?? "";
        // MOLA は CarClass に色を持たないため、クラス ID から安定した配色を割り当てる。
        // 既存色 (前回割当) があればそれを維持する。
        const provided = str(p, "color");
        const existing = this.state.classes.get(id);
        const color = provided || existing?.color || pickClassColor(id);
        const value: CarClassVm = {
            id,
            nameJ: str(p, "nameJ") ?? "",
            nameE: str(p, "nameE") ?? "",
            record: str(p, "record") ?? "",
            color,
        };
        this.state.classes.set(value.id, value);
        return [{ kind: "class_upsert", value }];
    }

    private applyTeam(p: Record<string, unknown>): LiveStatePatch[] {
        const id = str(p, "id") ?? "";
        const no = int(p, "no") ?? 0;
        const existing = id ? this.state.teams.get(id) : undefined;

        // MOLA はセッションが変わっても TeamId (1:1:N) を使い回す。
        // Category より先に次セッションの Team が来ると車番だけ差し替わり、
        // 前セッションのタイムが別クラスの選手に紐づく。車番変更はエントリー入替として全リセットする。
        const remapped = Boolean(existing && existing.no !== no);
        if (remapped) {
            this.state.resetForSessionSwitch();
        }

        const drivers = Array.isArray(p["drivers"])
            ? (p["drivers"] as Array<Record<string, unknown>>).map((d) => ({
                no: int(d, "no") ?? 0,
                nameJ: str(d, "nameJ") ?? "",
                nameE: str(d, "nameE") ?? "",
            }))
            : [];

        const value: TeamSummaryVm = {
            id,
            classId: str(p, "classId") ?? "",
            no,
            nameJ: str(p, "nameJ") ?? "",
            nameE: str(p, "nameE") ?? "",
            drivers,
        };
        this.state.teams.set(value.id, value);
        const patches: LiveStatePatch[] = [];
        if (remapped) patches.push({ kind: "reset" });
        patches.push({ kind: "team_upsert", value });

        // エントリー(Team マスター)受信時点でプレースホルダー standing を作る。
        // これで S1 通過前(セッション選択直後)からタイミング表に全エントリーが並ぶ。
        // 実際の Standings/Passing が来たら upsertStanding が上書きする。
        const placeholder = this.ensurePlaceholderStanding(value);
        if (placeholder) {
            patches.push(placeholder);
            patches.push({ kind: "track_count", value: this.state.trackCount() });
        }
        return patches;
    }

    /**
     * まだ standing の無いチームに、タイム未計測のプレースホルダーを作る。
     * 走行データが無いので Tracking のコース上には出さない (lastPassingTime=null で判定)。
     */
    private ensurePlaceholderStanding(team: TeamSummaryVm): LiveStatePatch | null {
        if (this.state.standings.has(team.id)) return null;
        const driver = team.drivers[0];
        const standing: StandingVm = {
            position: 0,
            classPosition: 0,
            classId: team.classId,
            teamId: team.id,
            teamNo: team.no,
            teamNameJ: team.nameJ,
            teamNameE: team.nameE,
            driverNo: driver?.no ?? 0,
            driverNameJ: driver?.nameJ ?? "",
            driverNameE: driver?.nameE ?? "",
            lap: 0,
            bestTime: null,
            bestTimeLap: 0,
            lastLapTime: null,
            lastPassingTime: null,
            sectorNo: 0,
            sectorTime: null,
            order: team.no, // 走行前は車番順で並べる
            refSectors: [null, null, null],
            gap: "—",
            interval: "—",
            status: "on_track",
            sectors: [
                { time: null, type: "none" },
                { time: null, type: "none" },
                { time: null, type: "none" },
            ],
            bestTimeType: "none",
            lastLapTimeType: "none",
            pits: 0,
            pitTime: null,
            positionChange: 0,
        };
        this.state.standings.set(team.id, standing);
        return { kind: "standing_upsert", value: { ...standing } };
    }

    private applySelect(p: Record<string, unknown>): LiveStatePatch[] {
        const sessionId = str(p, "sessionId");
        const patches: LiveStatePatch[] = [];
        if (sessionId && this.state.session && this.state.session.sessionId !== sessionId) {
            this.state.resetForNewSession();
            patches.push({ kind: "session", fields: { sessionId } });
        }
        return patches;
    }

    private applyStart(p: Record<string, unknown>): LiveStatePatch[] {
        // SMIS Start.DateTime は "yyyy/MM/dd HH:mm.ss" (秒の前が '.', 末尾空白あり, JST)。
        const raw = str(p, "dateTime") ?? str(p, "startedAt") ?? str(p, "time") ?? null;
        const iso = parseSmisStartDateTime(raw);
        if (iso) {
            const ms = Date.parse(iso);
            if (!Number.isNaN(ms)) {
                this.state.sessionStartedAtMs = ms;
            }
        }
        return this.mergeSessionInfo({ sessionStartedAt: iso ?? raw ?? null });
    }

    // ============================================================
    // Live data
    // ============================================================

    private applyPassing(p: Record<string, unknown>): LiveStatePatch[] {
        const teamId = str(p, "teamId");
        const loopId = int(p, "loopId");
        if (!teamId || loopId === null) return [];

        const status = deriveStatusFromLoop(loopId);
        const dataMs = this.currentDataMs();
        if (dataMs !== null) this.state.lastPassingDataMs.set(teamId, dataMs);

        const existing = this.state.standings.get(teamId);
        if (!existing) {
            this.state.lastPassingClockMs.set(teamId, Date.now());
            return [];
        }

        const patches: LiveStatePatch[] = [];
        let changed = false;

        if (status !== null && status !== existing.status) {
            existing.status = status;
            changed = true;
        }

        if (loopId === 11) {
            const next = (this.state.pitCount.get(teamId) ?? 0) + 1;
            this.state.pitCount.set(teamId, next);
            existing.pits = next;
            changed = true;
        }

        this.state.lastPassingClockMs.set(teamId, Date.now());

        if (changed) {
            patches.push({ kind: "standing_upsert", value: { ...existing } });
            patches.push({ kind: "track_count", value: this.state.trackCount() });
        }
        return patches;
    }

    /**
     * SMIS Standings。
     *
     * MOLA は `<Standings>` に全車の `<Standing>` を内包して送る (envelope の payload は
     * `{ sessionId, items: [...] }`)。旧スモークテスト用に、items が無い単一 standing 形式も許容する。
     */
    private applyStandings(p: Record<string, unknown>): LiveStatePatch[] {
        const items = Array.isArray(p["items"])
            ? (p["items"] as Array<Record<string, unknown>>)
            : [p];

        const extraPatches: LiveStatePatch[] = [];
        let anyChanged = false;
        const keepIds = new Set<string>();

        for (const item of items) {
            const teamId = str(item, "teamId");
            if (!teamId) continue;
            keepIds.add(teamId);
            extraPatches.push(...this.upsertStanding(teamId, item));
            anyChanged = true;
        }

        if (!anyChanged) return [];

        // MOLA の Standings は当該セッションの全車リスト。リストに無い車は前セッションの残りなので除去する。
        if (Array.isArray(p["items"])) {
            this.state.pruneToTeamIds(keepIds);
        }

        // gap / interval を全車に対して再計算 (順位は SMIS が決めた position が真)
        const sorted = this.state.standingsArray();
        const patches: LiveStatePatch[] = [];
        const top = sorted[0];
        if (top) {
            if (this.state.sessionMode === "time") {
                // ベストタイムモード (予選/専有): トップのベストタイムとの差
                let prev = top;
                for (const cur of sorted) {
                    cur.gap = formatTimeGap(cur.bestTime, top.bestTime);
                    cur.interval = formatTimeGap(cur.bestTime, prev.bestTime);
                    prev = cur;
                }
            } else {
                // 周回レースモード: 周回差 / 同一周回のラップ差
                let prev = top;
                for (const cur of sorted) {
                    cur.gap = formatGap(cur.lap, cur.lastPassingTime, top.lap, top.lastPassingTime);
                    cur.interval = formatGap(cur.lap, cur.lastPassingTime, prev.lap, prev.lastPassingTime);
                    prev = cur;
                }
            }
        }

        // グループ更新では全車を送り直す (順位・gap がまとめて変わるため)
        for (const s of sorted) {
            patches.push({ kind: "standing_upsert", value: { ...s } });
        }
        patches.push({ kind: "track_count", value: this.state.trackCount() });
        patches.push(...extraPatches);

        return patches;
    }

    /**
     * 1 台分の standing を state に反映する。gap/interval は呼び出し側でまとめて再計算する。
     * fastest_lap / driver_lap の追加 patch を配列で返す。
     */
    private upsertStanding(
        teamId: string,
        p: Record<string, unknown>,
    ): LiveStatePatch[] {
        const newPosition = int(p, "position") ?? 0;
        const newClassPos = int(p, "classPosition") ?? 0;
        const newLap = int(p, "lap") ?? 0;
        const newBest = int(p, "bestTime");
        const newLast = int(p, "lastLapTime");
        const newLastPass = int(p, "lastPassingTime");
        const newSectorNo = int(p, "sectorNo") ?? 0;
        const newSectorTime = int(p, "sectorTime");

        const team = this.state.teams.get(teamId);
        const driverNo = int(p, "driverNo") ?? 0;
        const driver = team?.drivers.find((d) => d.no === driverNo) ?? team?.drivers[0];

        const prevPosition = this.state.previousPosition.get(teamId);
        const positionChange =
            prevPosition !== undefined && prevPosition !== 0 && newPosition !== 0
                ? prevPosition - newPosition
                : 0;
        if (newPosition !== 0) this.state.previousPosition.set(teamId, newPosition);

        const personalBefore = this.state.teamPersonalBest.get(teamId) ?? null;
        let overallBefore = this.state.overallBest;
        if (newBest !== null && newBest > 0) {
            if (personalBefore === null || newBest < personalBefore) {
                this.state.teamPersonalBest.set(teamId, newBest);
            }
            if (overallBefore === null || newBest < overallBefore) {
                this.state.overallBest = newBest;
                overallBefore = newBest;
            }
        }

        const bestTimeType = classifyTimeType(newBest, this.state.overallBest, personalBefore);
        const lastLapTimeType = classifyTimeType(newLast, this.state.overallBest, personalBefore);

        const existing = this.state.standings.get(teamId);
        const status: CarStatus = existing?.status ?? "on_track";

        // セクタータイム (S1/S2/S3) を「進行中の周」で集計する。
        // SMIS: S1→SectorNo=1, S2→SectorNo=2, S3→SectorNo=3 (S3 は Lap が +1 済で届く)。
        // ピット時は SectorNo=0 (S3 は来ない) → S3 はブランクのまま = 「S3・ラップ無し」。
        // 1 周の完了は LastLapTime の変化で検知する (通常の FL 通過も、ピットアウトの FL も拾える)。
        const extraPatches: LiveStatePatch[] = [];
        const accum = this.getLapAccum(teamId);
        const secKey = `${newSectorNo}:${newSectorTime ?? ""}`;

        if (
            newSectorNo >= 1 &&
            newSectorNo <= 3 &&
            newSectorTime !== null &&
            newSectorTime > 0 &&
            secKey !== accum.lastSecKey
        ) {
            accum.lastSecKey = secKey;
            const idx = newSectorNo - 1;

            // ベストセクター判定 (色分け用)。
            const teamBest = this.state.teamBestSector.get(teamId) ?? [null, null, null];
            const overallBest = this.state.overallBestSector;
            const prevTeamBest = teamBest[idx] ?? null;
            const prevOverallBest = overallBest[idx] ?? null;
            if (prevTeamBest === null || newSectorTime < prevTeamBest) {
                teamBest[idx] = newSectorTime;
                this.state.teamBestSector.set(teamId, teamBest);
            }
            if (prevOverallBest === null || newSectorTime < prevOverallBest) {
                overallBest[idx] = newSectorTime;
                extraPatches.push({ kind: "best_sectors", value: [...overallBest] });
            }
            const secType = classifyTimeType(newSectorTime, prevOverallBest, prevTeamBest);
            const sectorVm: SectorTimeVm = { time: newSectorTime, type: secType };

            // 各区間の「最後に計測したタイム」を保持 (周をまたいで参照用)。
            accum.refTimes[idx] = newSectorTime;

            if (newSectorNo === 1) {
                // 新しい周の始まり: 前周の S2/S3 をクリアして混在を防ぐ。
                accum.s1 = sectorVm;
                accum.s2 = null;
                accum.s3 = null;
                accum.s1Lap = newLap;
            } else if (newSectorNo === 2) {
                accum.s2 = sectorVm;
            } else if (newSectorNo === 3) {
                accum.s3 = sectorVm;
            }
        }

        // 1 周完了検知: LastLapTime が更新されたら、その時点の accum を 1 周として記録する。
        // 初回観測時は「基準値」だけ設定して記録しない (途中接続で前周の LastLapTime を
        // 誤って 1 周分カウントしてしまう off-by-one を防ぐ)。
        if (accum.lastLapTime === -1) {
            accum.lastLapTime = newLast ?? 0;
        } else if (newLast !== null && newLast > 0 && newLast !== accum.lastLapTime) {
            accum.lastLapTime = newLast;
            const isPitLap = accum.s3 === null; // S3 が無ければピット周 (S2 通過後にピットイン)
            // 完了周番号は MOLA が FL 通過で付けた値 = 1 始まり (タイムモードの 1 周目 = Lap 1)。
            const lapNo = newLap;
            const s1t = accum.s1?.time ?? null;
            const s2t = accum.s2?.time ?? null;
            let s3t = accum.s3?.time ?? null;
            // ピット周は S3 が来ないため、個別データには「S2 通過～ピットアウト FL」の時間
            // (= LapTime - S1 - S2) を S3 として入れる。
            if (isPitLap && s1t !== null && s2t !== null && newLast > s1t + s2t) {
                s3t = newLast - s1t - s2t;
            }
            const lapData: LapDataVm = {
                lap: lapNo,
                lapTime: newLast,
                s1: s1t,
                s2: s2t,
                s3: s3t,
                s1Type: accum.s1?.type ?? "none",
                s2Type: accum.s2?.type ?? "none",
                s3Type: isPitLap ? "current" : (accum.s3?.type ?? "none"),
                lapTimeType: classifyTimeType(newLast, this.state.overallBest, personalBefore),
                isPit: isPitLap,
                position: newPosition,
            };
            const laps = this.state.teamLaps.get(teamId) ?? [];
            if (!laps.some((l) => l.lap === lapNo)) {
                laps.push(lapData);
                this.state.teamLaps.set(teamId, laps);
                extraPatches.push({ kind: "driver_lap", teamId, value: lapData });
            }
        }

        // 表示は「進行中の周」の値。ピット等で未計測の区間はブランク。
        const sectors: SectorTimeVm[] = [
            accum.s1 ?? { time: null, type: "none" },
            accum.s2 ?? { time: null, type: "none" },
            accum.s3 ?? { time: null, type: "none" },
        ];

        const standing: StandingVm = {
            position: newPosition,
            classPosition: newClassPos,
            classId: team?.classId ?? existing?.classId ?? "",
            teamId,
            teamNo: team?.no ?? 0,
            teamNameJ: team?.nameJ ?? "",
            teamNameE: team?.nameE ?? "",
            driverNo,
            driverNameJ: driver?.nameJ ?? "",
            driverNameE: driver?.nameE ?? "",
            lap: newLap,
            bestTime: newBest,
            bestTimeLap: int(p, "bestTimeLap") ?? existing?.bestTimeLap ?? 0,
            lastLapTime: newLast,
            lastPassingTime: newLastPass,
            sectorNo: newSectorNo,
            sectorTime: newSectorTime,
            order: int(p, "order") ?? existing?.order ?? 0,
            refSectors: [...accum.refTimes],
            gap: existing?.gap ?? "—",
            interval: existing?.interval ?? "—",
            status,
            sectors,
            bestTimeType,
            lastLapTimeType,
            pits: this.state.pitCount.get(teamId) ?? existing?.pits ?? 0,
            pitTime: existing?.pitTime ?? null,
            positionChange,
        };

        this.state.standings.set(teamId, standing);

        if (newBest !== null && newBest > 0 && newBest === this.state.overallBest) {
            this.state.fastestLap = {
                teamId,
                teamNo: team?.no ?? 0,
                driverNo,
                driverNameJ: driver?.nameJ ?? "",
                lapTime: newBest,
                lap: newLap,
            };
            extraPatches.push({ kind: "fastest_lap", value: this.state.fastestLap });
        }
        return extraPatches;
    }

    /** teamId のラップ蓄積状態を取得 (無ければ初期化)。 */
    private getLapAccum(teamId: string): TeamLapAccum {
        let a = this.state.teamLapAccum.get(teamId);
        if (!a) {
            a = {
                s1: null, s2: null, s3: null,
                refTimes: [null, null, null],
                s1Lap: 0,
                lastSecKey: "",
                lastLapTime: -1,
            };
            this.state.teamLapAccum.set(teamId, a);
        }
        return a;
    }

    private applyMessage(p: Record<string, unknown>): LiveStatePatch[] {
        const msg: RaceControlMessageVm = {
            type: (str(p, "type") as "I" | "P" | "T") ?? "I",
            scope: (str(p, "scope") as "E" | "A") ?? "A",
            text: str(p, "text") ?? "",
            timestamp: new Date().toISOString(),
        };
        this.state.pushRecentMessage(msg);

        const patches: LiveStatePatch[] = [{ kind: "message", value: msg }];

        if (msg.type === "T") {
            const flag: TrackFlag | null = parseFlagFromMessage(msg.text);
            if (flag && flag !== this.state.flag) {
                this.state.flag = flag;
                if (this.state.session) {
                    this.state.session = { ...this.state.session, flag };
                }
                patches.push({ kind: "flag", flag });
            }
        }

        return patches;
    }

    // ============================================================
    // helpers
    // ============================================================

    private mergeSessionInfo(
        fields: Partial<NonNullable<LiveSessionState["session"]>>,
    ): LiveStatePatch[] {
        const base = this.state.session ?? emptySessionInfo();
        const merged = { ...base, ...fields };
        this.state.session = { ...merged, flag: this.state.flag };
        return [{ kind: "session", fields }];
    }
}

function emptySessionInfo(): NonNullable<LiveSessionState["session"]> {
    return {
        competitionId: "",
        competitionNameJ: "",
        competitionNameE: "",
        categoryId: "",
        categoryNameJ: "",
        categoryNameE: "",
        roundId: "",
        roundNameJ: "",
        roundNameE: "",
        sessionId: "",
        sessionNameJ: "",
        sessionNameE: "",
        sessionTime: "",
        sessionLaps: 0,
        flag: "green",
        sessionStartedAt: null,
        sessionRemainingSec: null,
        isRace: false,
    };
}

/**
 * ラウンド名からセッション種別を推定する。
 * 決勝 / Race / Final / レース / Heat 等 → "race"、それ以外 (予選・専有・フリー等) → "time"。
 */
function deriveSessionMode(
    nameJ: string,
    nameE: string,
    type: string | null,
): "race" | "time" {
    const text = `${nameJ} ${nameE}`.toLowerCase();
    if (/決勝|レース|race|final|heat|ヒート|grand prix|gp/.test(text)) return "race";
    // 予選・専有走行・フリー走行・練習・calibration などは time
    if (/予選|専有|フリー|練習|practice|qualif|warm|calib/.test(text)) return "time";
    // 名前で判断できない場合は SMIS Type にフォールバック (L=Lap=race, それ以外 time)
    if (type === "2" || type === "L") return "race";
    return "time";
}

/** クラス ID から安定した配色を選ぶ。MOLA が色を持たないため使用。
 * Tracking のセクターライン (S1=赤 / S2=黄 / S3=緑) と被らないよう、
 * 赤・黄・緑系を避けた青〜紫〜ピンク中心のパレット。白文字が載る前提で中〜暗トーン。 */
const CLASS_PALETTE = [
    "#2563eb", // blue
    "#9333ea", // purple
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#4f46e5", // indigo
    "#c026d3", // fuchsia
    "#0ea5e9", // sky
    "#7c3aed", // violet
    "#8b5cf6", // light violet
    "#db2777", // dark pink
];

function pickClassColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return CLASS_PALETTE[h % CLASS_PALETTE.length] ?? "#2563eb";
}

function str(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return null;
}

function int(obj: Record<string, unknown>, key: string): number | null {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/**
 * SMIS Start.DateTime ("yyyy/MM/dd HH:mm.ss", JST, 末尾空白あり) を
 * ISO8601 (+09:00) に変換する。パース不能なら null。
 */
function parseSmisStartDateTime(raw: string | null): string | null {
    if (!raw) return null;
    const m = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\.(\d{2})$/);
    if (!m) return null;
    const [, y, mo, d, hh, mm, ss] = m;
    return `${y}-${mo}-${d}T${hh}:${mm}:${ss}+09:00`;
}

/**
 * ベストタイムモードの gap/interval。基準タイムとの差を "+s.sss" で返す。
 * 自分がトップ / どちらか未計測なら "—"。
 */
function formatTimeGap(selfBest: number | null, refBest: number | null): string {
    if (selfBest === null || selfBest <= 0 || refBest === null || refBest <= 0) return "—";
    const diff = selfBest - refBest;
    if (diff <= 0) return "—";
    return formatSecondsDiff(diff);
}
