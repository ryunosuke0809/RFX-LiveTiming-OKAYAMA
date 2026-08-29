import type {
    CarClassVm,
    FastestLapVm,
    LapDataVm,
    LiveStateSnapshot,
    RaceControlMessageVm,
    SectorTimeVm,
    SessionInfoVm,
    StandingVm,
    TeamSummaryVm,
    TrackCountVm,
    TrackFlag,
} from "./types.js";

/** 管理画面からのエントリー名上書き。未指定フィールドは SMIS の値を使う。 */
export interface EntryNameOverride {
    teamNameJ?: string;
    teamNameE?: string;
    driverNameJ?: string;
    driverNameE?: string;
}

/** 現在ラップのセクター蓄積 (周またぎ混在を防ぐための一時状態)。 */
export interface TeamLapAccum {
    /** 進行中の周のセクター (表示用、未計測は null)。 */
    s1: SectorTimeVm | null;
    s2: SectorTimeVm | null;
    s3: SectorTimeVm | null;
    /** 各区間で最後に計測されたタイム [S1,S2,S3] (周をまたいで保持、参照用)。 */
    refTimes: Array<number | null>;
    /** S1 を記録したときの周回数 (完了周番号として使う)。 */
    s1Lap: number;
    /** 直近に処理したセクターキー "secNo:secTime"。重複処理を防ぐ。 */
    lastSecKey: string;
    /** 直近に見た LastLapTime。周完了 (=値の変化) 検知に使う。 */
    lastLapTime: number;
}

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

    /** 直近に受信したデータのタイムスタンプ (ISO)。経過時間はこれ基準で出す (再生でも正しい)。 */
    lastDataTs: string | null = null;
    /** 最後に Passing を受けた時刻 (ISO)。ELAPSED の停止判定用。 */
    lastPassingAt: string | null = null;

    /**
     * 現在のセッションを識別する署名 (competitionNameJ|categoryNameJ|roundNameJ)。
     * MOLA は SessionId を常に "1:1:1:1:1" で送るため、切替検知にはこの署名を使う。
     */
    sessionSignature: string | null = null;

    /** セッション種別。race = 周回レース (順位・ラップ差)、time = ベストタイム (予選/専有走行)。 */
    sessionMode: "race" | "time" = "time";

    readonly classes = new Map<string, CarClassVm>();
    readonly teams = new Map<string, TeamSummaryVm>();
    readonly standings = new Map<string, StandingVm>(); // teamId → standing
    readonly teamPersonalBest = new Map<string, number>(); // teamId → bestTime (1/10000s)
    readonly pitCount = new Map<string, number>(); // teamId → pit count
    /** teamId → In Pit になった壁時計 (ms)。PitOut で pitTime 確定に使う。 */
    readonly pitEnteredAtMs = new Map<string, number>();
    readonly lastPassingClockMs = new Map<string, number>(); // teamId → 最終受信時刻 (Date.now())
    /** teamId → 最終 Passing の「データ時刻」(ms)。再生でも正しく stall 判定するため wall clock ではなくデータ時刻を使う。 */
    readonly lastPassingDataMs = new Map<string, number>();
    readonly previousPosition = new Map<string, number>(); // teamId → 直前の position

    /** teamId → [S1,S2,S3] のベストセクター (1/10000s)。色分け判定用。 */
    readonly teamBestSector = new Map<string, Array<number | null>>();
    /** [S1,S2,S3] の全体ベストセクター (1/10000s)。 */
    overallBestSector: Array<number | null> = [null, null, null];

    /** teamId → 現在ラップのセクター蓄積状態 (周またぎ混在を防ぐ)。 */
    readonly teamLapAccum = new Map<string, TeamLapAccum>();
    /** teamId → 完了周のラップ履歴。 */
    readonly teamLaps = new Map<string, LapDataVm[]>();

    /** 管理画面で非表示にしたエントリー。SMIS が再送しても Live には出さない。 */
    readonly hiddenTeamIds = new Set<string>();
    /** 管理画面で上書きしたチーム名 / ドライバー名。 */
    readonly nameOverrides = new Map<string, EntryNameOverride>();

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
        this.pitEnteredAtMs.clear();
        this.lastPassingClockMs.clear();
        this.lastPassingDataMs.clear();
        this.previousPosition.clear();
        this.teamBestSector.clear();
        this.overallBestSector = [null, null, null];
        this.teamLapAccum.clear();
        this.teamLaps.clear();
        this.overallBest = null;
        this.fastestLap = null;
        this.flag = "green";
        this.sessionStartedAtMs = null;
        this.lastPassingAt = null;
        this.recentMessages.length = 0;
    }

    /**
     * セッション切替時 (Category 名が変わった時) の全リセット。
     * マスター (Class / Team) も破棄する。直後にマスターダンプが再送されるため、
     * 前セッションのエントリーが残らないようにする。
     */
    resetForSessionSwitch(): void {
        this.resetForNewSession();
        this.classes.clear();
        this.teams.clear();
        this.hiddenTeamIds.clear();
        this.nameOverrides.clear();
    }

    /**
     * 日付が変わったときの完全リセット。
     *
     * `resetForSessionSwitch()` に加えてセッション情報自体も破棄し、
     * 「まだ何も来ていない」状態に戻す。SMIS の Select が来ないまま日を跨いだとき、
     * 前日のリザルトがライブ画面に出続けるのを防ぐため。
     */
    resetForNewDay(): void {
        this.resetForSessionSwitch();
        this.session = null;
        this.sessionSignature = null;
        this.sessionMode = "time";
        this.lastDataTs = null;
        this.lastPassingAt = null;
    }

    pushRecentMessage(msg: RaceControlMessageVm): void {
        this.recentMessages.push(msg);
        if (this.recentMessages.length > this.recentMessageLimit) {
            this.recentMessages.splice(0, this.recentMessages.length - this.recentMessageLimit);
        }
    }

    /**
     * Standings 全件リストに含まれないチームを除去する。
     * セッション切替で TeamId が再利用されるため、前セッションのエントリーが残ると
     * リザルトに他クラスの選手が混ざる。
     */
    pruneToTeamIds(keepIds: Set<string>): void {
        for (const id of [...this.standings.keys()]) {
            if (!keepIds.has(id)) this.standings.delete(id);
        }
        for (const id of [...this.teams.keys()]) {
            if (!keepIds.has(id)) this.teams.delete(id);
        }
        for (const id of [...this.teamLaps.keys()]) {
            if (!keepIds.has(id)) this.teamLaps.delete(id);
        }
        for (const id of [...this.teamPersonalBest.keys()]) {
            if (!keepIds.has(id)) this.teamPersonalBest.delete(id);
        }
        for (const id of [...this.pitCount.keys()]) {
            if (!keepIds.has(id)) this.pitCount.delete(id);
        }
        for (const id of [...this.pitEnteredAtMs.keys()]) {
            if (!keepIds.has(id)) this.pitEnteredAtMs.delete(id);
        }
        for (const id of [...this.lastPassingClockMs.keys()]) {
            if (!keepIds.has(id)) this.lastPassingClockMs.delete(id);
        }
        for (const id of [...this.lastPassingDataMs.keys()]) {
            if (!keepIds.has(id)) this.lastPassingDataMs.delete(id);
        }
        for (const id of [...this.previousPosition.keys()]) {
            if (!keepIds.has(id)) this.previousPosition.delete(id);
        }
        for (const id of [...this.teamBestSector.keys()]) {
            if (!keepIds.has(id)) this.teamBestSector.delete(id);
        }
        for (const id of [...this.teamLapAccum.keys()]) {
            if (!keepIds.has(id)) this.teamLapAccum.delete(id);
        }

        // どの standing からも参照されないクラスは落とす
        const usedClassIds = new Set<string>();
        for (const s of this.standings.values()) {
            if (s.classId) usedClassIds.add(s.classId);
        }
        for (const t of this.teams.values()) {
            if (t.classId) usedClassIds.add(t.classId);
        }
        for (const id of [...this.classes.keys()]) {
            if (!usedClassIds.has(id)) this.classes.delete(id);
        }
    }

    /** 予選・専有などピットスタート時、まだ通過が無い車はピット待機とみなす。
     *  決勝 (race) はグリッドスタートなので未通過でも on_track のまま。 */
    private isGarageWaiting(s: StandingVm): boolean {
        if (this.sessionMode === "race") {
            return s.status === "in_pit";
        }
        if (s.status === "in_pit") return true;
        if (s.status !== "on_track" && s.status !== "pit_out") return false;
        return (
            (s.lastPassingTime == null || s.lastPassingTime <= 0) &&
            s.lap === 0 &&
            s.sectorNo === 0
        );
    }

    /** すべての standings を position 昇順で配列化。position 0 (未出走/無効) は末尾へ。 */
    standingsArray(): StandingVm[] {
        const rank = (pos: number) => (pos > 0 ? pos : Number.MAX_SAFE_INTEGER);
        return Array.from(this.standings.values())
            .map((s) => (this.isGarageWaiting(s) ? { ...s, status: "in_pit" as const } : s))
            .sort((a, b) => {
                const ra = rank(a.position);
                const rb = rank(b.position);
                if (ra !== rb) return ra - rb;
                return a.order - b.order;
            });
    }

    overlayTeam(team: TeamSummaryVm): TeamSummaryVm {
        const ov = this.nameOverrides.get(team.id);
        if (!ov) return team;
        return {
            ...team,
            nameJ: ov.teamNameJ !== undefined ? ov.teamNameJ : team.nameJ,
            nameE: ov.teamNameE !== undefined ? ov.teamNameE : team.nameE,
            drivers: team.drivers.map((d) => ({
                ...d,
                nameJ: ov.driverNameJ !== undefined ? ov.driverNameJ : d.nameJ,
                nameE: ov.driverNameE !== undefined ? ov.driverNameE : d.nameE,
            })),
        };
    }

    overlayStanding(s: StandingVm): StandingVm {
        const ov = this.nameOverrides.get(s.teamId);
        if (!ov) return s;
        return {
            ...s,
            teamNameJ: ov.teamNameJ !== undefined ? ov.teamNameJ : s.teamNameJ,
            teamNameE: ov.teamNameE !== undefined ? ov.teamNameE : s.teamNameE,
            driverNameJ: ov.driverNameJ !== undefined ? ov.driverNameJ : s.driverNameJ,
            driverNameE: ov.driverNameE !== undefined ? ov.driverNameE : s.driverNameE,
        };
    }

    trackCount(excludeIds?: ReadonlySet<string>): TrackCountVm {
        let onTrack = 0;
        let inPit = 0;
        let stopped = 0;
        let retired = 0;
        for (const s of this.standings.values()) {
            if (excludeIds?.has(s.teamId)) continue;
            const status = this.isGarageWaiting(s) ? "in_pit" : s.status;
            switch (status) {
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
        const hidden = this.hiddenTeamIds;
        const standings = this.standingsArray()
            .filter((s) => !hidden.has(s.teamId))
            .map((s) => this.overlayStanding(s));
        const teams = Array.from(this.teams.values())
            .filter((t) => !hidden.has(t.id))
            .map((t) => this.overlayTeam(t));
        const driverLaps: Record<string, LapDataVm[]> = {};
        for (const [id, laps] of this.teamLaps) {
            if (!hidden.has(id)) driverLaps[id] = laps;
        }
        let fastestLap = this.fastestLap;
        if (fastestLap && hidden.has(fastestLap.teamId)) fastestLap = null;
        else if (fastestLap) {
            const ov = this.nameOverrides.get(fastestLap.teamId);
            if (ov?.driverNameJ !== undefined) {
                fastestLap = { ...fastestLap, driverNameJ: ov.driverNameJ };
            }
        }
        return {
            serverTs,
            dataTs: this.lastDataTs,
            lastPassingAt: this.lastPassingAt,
            circuitId: this.circuitId,
            session: this.session ? { ...this.session, flag: this.flag } : null,
            standings,
            fastestLap,
            trackCount: this.trackCount(hidden),
            classes: Array.from(this.classes.values()),
            teams,
            recentMessages: this.recentMessages.slice(),
            driverLaps,
            bestSectors: [...this.overallBestSector],
        };
    }
}
