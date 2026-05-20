import type {
    CarClassVm,
    FastestLapVm,
    LiveStateSnapshot,
    RaceControlMessageVm,
    SessionInfoVm,
    StandingVm,
    TeamSummaryVm,
    TrackCountVm,
    TrackFlag,
} from "./types.js";

/**
 * クラウドサーバーが保持する「いまレースで起きていること」の単一状態。
 *
 * - すべてオンメモリ。複数 worker での共有や永続化は今のところ不要 (1 サーキット運用)。
 * - 各 SMIS イベント受領時に Aggregator が読み書きする。
 * - スナップショット (`snapshot()`) は新規接続時の `state` メッセージとして送る。
 */
export class LiveSessionState {
    circuitId: string | null = null;
    session: SessionInfoVm | null = null;
    flag: TrackFlag = "green";
    sessionStartedAtMs: number | null = null;

    readonly classes = new Map<string, CarClassVm>();
    readonly teams = new Map<string, TeamSummaryVm>();
    readonly standings = new Map<string, StandingVm>(); // teamId → standing
    readonly teamPersonalBest = new Map<string, number>(); // teamId → bestTime (1/10000s)
    readonly pitCount = new Map<string, number>(); // teamId → pit count
    readonly lastPassingClockMs = new Map<string, number>(); // teamId → 最終受信時刻 (Date.now())
    readonly previousPosition = new Map<string, number>(); // teamId → 直前の position

    overallBest: number | null = null;
    fastestLap: FastestLapVm | null = null;

    readonly recentMessages: RaceControlMessageVm[] = [];
    readonly recentMessageLimit: number;

    constructor(recentMessageLimit = 50) {
        this.recentMessageLimit = recentMessageLimit;
    }

    /**
     * Select / Session 変更時にリセットする。
     * マスター (Competition / Class / Team) は保持し、ラップに関係するものだけ消す。
     */
    resetForNewSession(): void {
        this.standings.clear();
        this.teamPersonalBest.clear();
        this.pitCount.clear();
        this.lastPassingClockMs.clear();
        this.previousPosition.clear();
        this.overallBest = null;
        this.fastestLap = null;
        this.flag = "green";
        this.sessionStartedAtMs = null;
        this.recentMessages.length = 0;
    }

    pushRecentMessage(msg: RaceControlMessageVm): void {
        this.recentMessages.push(msg);
        if (this.recentMessages.length > this.recentMessageLimit) {
            this.recentMessages.splice(0, this.recentMessages.length - this.recentMessageLimit);
        }
    }

    /** すべての standings を position 昇順で配列化。 */
    standingsArray(): StandingVm[] {
        return Array.from(this.standings.values()).sort((a, b) => {
            if (a.position !== b.position) return a.position - b.position;
            return a.order - b.order;
        });
    }

    trackCount(): TrackCountVm {
        let onTrack = 0;
        let inPit = 0;
        let stopped = 0;
        let retired = 0;
        for (const s of this.standings.values()) {
            switch (s.status) {
                case "on_track":
                case "pit_out":
                    onTrack++;
                    break;
                case "in_pit":
                    inPit++;
                    break;
                case "stopped":
                    stopped++;
                    break;
                case "retired":
                case "finished":
                    retired++;
                    break;
            }
        }
        return { onTrack, inPit, stopped, retired };
    }

    /**
     * フル状態スナップショット (新規接続時に送る用)。
     */
    snapshot(serverTs: string): LiveStateSnapshot {
        return {
            serverTs,
            circuitId: this.circuitId,
            session: this.session ? { ...this.session, flag: this.flag } : null,
            standings: this.standingsArray(),
            fastestLap: this.fastestLap,
            trackCount: this.trackCount(),
            classes: Array.from(this.classes.values()),
            teams: Array.from(this.teams.values()),
            recentMessages: this.recentMessages.slice(),
        };
    }
}
