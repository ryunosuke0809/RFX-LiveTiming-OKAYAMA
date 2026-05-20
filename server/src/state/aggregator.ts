import type { IngestEnvelope } from "../types/ingest.js";
import {
    classifyTimeType,
    deriveStatusFromLoop,
    formatGap,
    parseFlagFromMessage,
} from "./derive.js";
import type { LiveSessionState } from "./session-state.js";
import type {
    CarClassVm,
    CarStatus,
    LiveStatePatch,
    RaceControlMessageVm,
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
export class SessionStateAggregator {
    constructor(private readonly state: LiveSessionState) {}

    apply(envelope: IngestEnvelope): LiveStatePatch[] {
        this.state.circuitId = envelope.circuitId;
        const p = envelope.payload as Record<string, unknown>;

        switch (envelope.kind) {
            case "Competition":
                return this.applyCompetition(p);
            case "Category":
                return this.applyCategory(p);
            case "Round":
                return this.applyRound(p);
            case "Session":
                return this.applySession(p);
            case "Class":
                return this.applyClass(p);
            case "Team":
                return this.applyTeam(p);
            case "Select":
                return this.applySelect(p);
            case "Start":
                return this.applyStart(p);
            case "Passing":
                return this.applyPassing(p);
            case "Standings":
                return this.applyStandings(p);
            case "Message":
                return this.applyMessage(p);
            default:
                return [];
        }
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
        return this.mergeSessionInfo(fields);
    }

    private applyRound(p: Record<string, unknown>): LiveStatePatch[] {
        const fields = {
            roundId: str(p, "id") ?? "",
            roundNameJ: str(p, "nameJ") ?? "",
            roundNameE: str(p, "nameE") ?? "",
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
        const value: CarClassVm = {
            id: str(p, "id") ?? "",
            nameJ: str(p, "nameJ") ?? "",
            nameE: str(p, "nameE") ?? "",
            record: str(p, "record") ?? "",
            color: str(p, "color") ?? "#888",
        };
        this.state.classes.set(value.id, value);
        return [{ kind: "class_upsert", value }];
    }

    private applyTeam(p: Record<string, unknown>): LiveStatePatch[] {
        const drivers = Array.isArray(p["drivers"])
            ? (p["drivers"] as Array<Record<string, unknown>>).map((d) => ({
                no: int(d, "no") ?? 0,
                nameJ: str(d, "nameJ") ?? "",
                nameE: str(d, "nameE") ?? "",
            }))
            : [];

        const value: TeamSummaryVm = {
            id: str(p, "id") ?? "",
            classId: str(p, "classId") ?? "",
            no: int(p, "no") ?? 0,
            nameJ: str(p, "nameJ") ?? "",
            nameE: str(p, "nameE") ?? "",
            drivers,
        };
        this.state.teams.set(value.id, value);
        return [{ kind: "team_upsert", value }];
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
        const startedAt = str(p, "startedAt") ?? str(p, "time") ?? null;
        if (startedAt) {
            const ms = Date.parse(startedAt);
            if (!Number.isNaN(ms)) {
                this.state.sessionStartedAtMs = ms;
            }
        }
        return this.mergeSessionInfo({ sessionStartedAt: startedAt ?? null });
    }

    // ============================================================
    // Live data
    // ============================================================

    private applyPassing(p: Record<string, unknown>): LiveStatePatch[] {
        const teamId = str(p, "teamId");
        const loopId = int(p, "loopId");
        if (!teamId || loopId === null) return [];

        const status = deriveStatusFromLoop(loopId);

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

    private applyStandings(p: Record<string, unknown>): LiveStatePatch[] {
        const teamId = str(p, "teamId");
        if (!teamId) return [];

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
            prevPosition !== undefined && prevPosition !== 0
                ? prevPosition - newPosition
                : 0;
        this.state.previousPosition.set(teamId, newPosition);

        // BestTime に対する TimeType を計算するため overallBest を先に更新
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

        const standing: StandingVm = {
            position: newPosition,
            classPosition: newClassPos,
            classId: team?.classId ?? "",
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
            gap: "—", // 後段で書き換える
            interval: "—",
            status,
            sectors: existing?.sectors ?? [],
            bestTimeType,
            lastLapTimeType,
            pits: this.state.pitCount.get(teamId) ?? existing?.pits ?? 0,
            pitTime: existing?.pitTime ?? null,
            positionChange,
        };

        this.state.standings.set(teamId, standing);

        // gap / interval を全車に対して再計算 (順位は SMIS が決めた position が真)
        const sorted = this.state.standingsArray();
        const top = sorted[0];
        const patches: LiveStatePatch[] = [];

        if (top) {
            let prev = top;
            for (const cur of sorted) {
                cur.gap = formatGap(cur.lap, cur.lastPassingTime, top.lap, top.lastPassingTime);
                cur.interval = formatGap(cur.lap, cur.lastPassingTime, prev.lap, prev.lastPassingTime);
                prev = cur;
            }
        }

        // 変化した standing だけ patch として送る (今回更新されたチームと先頭は必ず送る)
        const updated = this.state.standings.get(teamId);
        if (updated) {
            patches.push({ kind: "standing_upsert", value: { ...updated } });
        }
        if (top && top.teamId !== teamId) {
            patches.push({ kind: "standing_upsert", value: { ...top } });
        }

        // FastestLap の更新
        if (newBest !== null && newBest > 0 && newBest === this.state.overallBest) {
            this.state.fastestLap = {
                teamId,
                teamNo: team?.no ?? 0,
                driverNo,
                driverNameJ: driver?.nameJ ?? "",
                lapTime: newBest,
                lap: newLap,
            };
            patches.push({ kind: "fastest_lap", value: this.state.fastestLap });
        }

        return patches;
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
    };
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
