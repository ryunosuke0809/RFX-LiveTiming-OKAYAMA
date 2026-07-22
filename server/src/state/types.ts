/**
 * フロントエンド表示用の ViewModel 型。
 *
 * `frontend/src/types/smis.ts` の表示型と一致させているが、
 * サーバー側で「生 SMIS DTO に無い算出フィールド」を埋めて配信するのが目的。
 *
 * - 時間はすべて SMIS と同じ 1/10000 秒整数 (フロントで表示形式に変換)。
 * - `*Type` フィールドはセル色分け (マゼンタ/シアン/イエロー) に対応。
 */

export type CarStatus =
    | "on_track"
    | "in_pit"
    | "pit_out"
    | "stopped"
    | "retired"
    | "finished";

export type TimeType = "overall_best" | "personal_best" | "current" | "none";

export type TrackFlag =
    | "green"
    | "yellow"
    | "red"
    | "white" // Safety Car
    | "fcy" // Full Course Yellow
    | "black"
    | "chequered";

export interface SectorTimeVm {
    time: number | null;
    type: TimeType;
}

export interface StandingVm {
    position: number;
    classPosition: number;
    classId: string;
    teamId: string;
    teamNo: number;
    teamNameJ: string;
    teamNameE: string;
    driverNo: number;
    driverNameJ: string;
    driverNameE: string;
    lap: number;
    bestTime: number | null;
    bestTimeLap: number;
    lastLapTime: number | null;
    lastPassingTime: number | null;
    sectorNo: number;
    sectorTime: number | null;
    order: number;
    /** 各区間で最後に計測されたタイム [S1,S2,S3] (Tracking の移動時間などの参照用)。 */
    refSectors: Array<number | null>;

    // 算出フィールド
    gap: string; // "—" / "+2L" / "+1.234"
    interval: string;
    status: CarStatus;
    sectors: SectorTimeVm[];
    bestTimeType: TimeType;
    lastLapTimeType: TimeType;
    pits: number;
    pitTime: number | null;
    positionChange: number;
}

export interface SessionInfoVm {
    competitionId: string;
    competitionNameJ: string;
    competitionNameE: string;
    categoryId: string;
    categoryNameJ: string;
    categoryNameE: string;
    roundId: string;
    roundNameJ: string;
    roundNameE: string;
    sessionId: string;
    sessionNameJ: string;
    sessionNameE: string;
    sessionTime: string;
    sessionLaps: number;
    flag: TrackFlag;
    sessionStartedAt: string | null;
    sessionRemainingSec: number | null;
    /** true=周回レース (race)、false=ベストタイム (予選/専有走行)。gap 表示の切替に使う。 */
    isRace: boolean;
}

export interface FastestLapVm {
    teamId: string;
    teamNo: number;
    driverNo: number;
    driverNameJ: string;
    lapTime: number;
    lap: number;
}

export interface TrackCountVm {
    onTrack: number;
    inPit: number;
    stopped: number;
    retired: number;
}

export interface CarClassVm {
    id: string;
    nameJ: string;
    nameE: string;
    record: string;
    color: string;
}

export interface TeamSummaryVm {
    id: string;
    classId: string;
    no: number;
    nameJ: string;
    nameE: string;
    drivers: Array<{ no: number; nameJ: string; nameE: string }>;
}

export interface RaceControlMessageVm {
    type: "I" | "P" | "T";
    scope: "E" | "A";
    text: string;
    timestamp: string;
}

/**
 * 1 回のフル配信内容。
 *
 * フロントエンドは新規接続時にこれを 1 回受け取り、画面の初期描画を行う。
 * 以後の差分は `LiveStatePatch` で送られる。
 */
/** 1 周分のラップデータ (個別ドライバー表示用)。frontend の LapData と一致。 */
export interface LapDataVm {
    lap: number;
    lapTime: number | null;
    s1: number | null;
    s2: number | null;
    s3: number | null;
    s1Type: TimeType;
    s2Type: TimeType;
    s3Type: TimeType;
    lapTimeType: TimeType;
    isPit: boolean;
    position: number;
}

export interface LiveStateSnapshot {
    serverTs: string;
    /** 直近データのタイムスタンプ (ISO)。経過時間計算用。 */
    dataTs: string | null;
    circuitId: string | null;
    session: SessionInfoVm | null;
    standings: StandingVm[];
    fastestLap: FastestLapVm | null;
    trackCount: TrackCountVm;
    classes: CarClassVm[];
    teams: TeamSummaryVm[];
    recentMessages: RaceControlMessageVm[];
    /** teamId → 完了周のラップ履歴 (個別ドライバー表示用)。 */
    driverLaps: Record<string, LapDataVm[]>;
    /** セッション全体のベストセクター [S1,S2,S3] (理論ベスト表示用)。 */
    bestSectors: Array<number | null>;
}

/**
 * 差分更新。1 つの ingest envelope が 1〜複数の `LiveStatePatch` を生む。
 * フロントエンドは `kind` で switch して該当部分だけ書き換える。
 */
export type LiveStatePatch =
    /** scope: "timing" = ラップ系のみクリア (Team/Class は保持)。省略時は全クリア。 */
    | { kind: "reset"; scope?: "all" | "timing" }
    | { kind: "session"; fields: Partial<SessionInfoVm> }
    | { kind: "flag"; flag: TrackFlag }
    | { kind: "class_upsert"; value: CarClassVm }
    | { kind: "team_upsert"; value: TeamSummaryVm }
    | { kind: "standing_upsert"; value: StandingVm }
    | { kind: "standing_remove"; teamId: string }
    | { kind: "fastest_lap"; value: FastestLapVm | null }
    | { kind: "best_sectors"; value: Array<number | null> }
    | { kind: "track_count"; value: TrackCountVm }
    | { kind: "driver_lap"; teamId: string; value: LapDataVm }
    | { kind: "message"; value: RaceControlMessageVm };
