export interface Competition {
  id: string;
  nameJ: string;
  nameE: string;
  startDate: string;
  endDate: string;
}

export interface Category {
  id: string;
  nameJ: string;
  nameE: string;
  courseName: string;
  courseLength: number; // cm
}

export interface Round {
  id: string;
  nameJ: string;
  nameE: string;
  type: "T" | "L"; // T:ベストタイムレース L:周回レース
}

export interface Session {
  id: string;
  nameJ: string;
  nameE: string;
  time: string; // HH:MM
  lap: number;
}

export interface CarClass {
  id: string;
  nameJ: string;
  nameE: string;
  record: string;
  color: string; // UI表示用
}

export interface Driver {
  no: number;
  nameJ: string;
  nameE: string;
  nation: string;
}

export interface Team {
  id: string;
  classId: string;
  no: number; // ゼッケン
  nameJ: string;
  nameE: string;
  engine: string;
  machine: string;
  tire: string;
  nation: string;
  drivers: Driver[];
}

export type CarStatus = "on_track" | "in_pit" | "pit_out" | "stopped" | "retired" | "finished";

export type TimeType = "overall_best" | "personal_best" | "current" | "none";

export interface SectorTime {
  time: number | null; // 1/10000秒
  type: TimeType;
}

export interface Standing {
  position: number;
  classPosition: number;
  classId: string;
  teamId: string;
  driverNo: number;
  lap: number;
  bestTime: number | null; // 1/10000秒
  bestTimeLap: number;
  lastLapTime: number | null; // 1/10000秒
  lastPassingTime: number | null; // 1/10000秒
  sectorNo: number; // 1-4
  sectorTime: number | null; // 1/10000秒
  order: number;

  // フロントエンド用の算出フィールド
  gap: string;
  interval: string;
  status: CarStatus;
  sectors: SectorTime[];
  bestTimeType: TimeType;
  lastLapTimeType: TimeType;
  pits: number;
  pitTime: number | null; // 最後のピット滞在時間 (1/10000秒)
  positionChange: number; // +/- 表示用
}

export type TrackFlag =
  | "green"
  | "yellow"
  | "red"
  | "white" // Safety Car
  | "fcy" // Full Course Yellow
  | "black"
  | "chequered";

export interface SessionInfo {
  competition: Competition;
  category: Category;
  round: Round;
  session: Session;
  flag: TrackFlag;
  remainingTime: number; // 秒
  elapsedTime: number; // 秒
  localTime: string;
}

export interface FastestLap {
  teamNo: number;
  driverName: string;
  lapTime: number; // 1/10000秒
  lap: number;
  sectors: number[]; // 各セクタータイム
}

export interface WeatherData {
  airTemp: number;
  trackTemp: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
}

export interface TrackCount {
  onTrack: number;
  inPit: number;
  stopped: number;
  retired: number;
}

export interface Message {
  type: "I" | "P" | "T"; // Info / Penalty / Track
  scope: "E" | "A"; // 関係者 / 全員
  text: string;
  timestamp: string;
}

export interface ScheduleEntry {
  event: string;
  session: string;
  localTime: string;
  hasResults: boolean;
}
