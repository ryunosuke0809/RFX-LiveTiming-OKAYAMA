import type {
  Competition, Category, Round, Session, CarClass, Team,
  Standing, SessionInfo, FastestLap, WeatherData, TrackCount,
  ScheduleEntry, TimeType, LapData, DriverPersonalData,
} from "@/types/smis";
import { resolveLiveTeam, resolveLiveClass } from "@/lib/entityRegistry";

// ============================================================
// このファイルは「ライブ未接続時のフォールバック用の空データ」。
// かつて含まれていた SUPER GT のサンプルデータはすべて削除済み。
// 実データは /ws (useLiveTiming) 経由で流し込む。
// ============================================================

// Mulberry32 PRNG — getMockPersonalData 用（現状ライブ接続時は未使用）
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mockCompetition: Competition = {
  id: "", nameJ: "", nameE: "", startDate: "", endDate: "",
};

export const mockCategory: Category = {
  id: "", nameJ: "", nameE: "", courseName: "OKAYAMA International Circuit", courseLength: 370300,
};

export const mockRound: Round = {
  id: "", nameJ: "", nameE: "", type: "T",
};

export const mockSession: Session = {
  id: "", nameJ: "", nameE: "", time: "", lap: 0,
};

export const mockClasses: CarClass[] = [];

export const mockTeams: Team[] = [];

export const mockStandings: Standing[] = [];

export const mockSessionInfo: SessionInfo = {
  competition: mockCompetition,
  category: mockCategory,
  round: mockRound,
  session: mockSession,
  flag: "green",
  remainingTime: 0,
  elapsedTime: 0,
  localTime: "",
};

export const mockFastestLap: FastestLap = {
  teamNo: 0,
  driverName: "",
  lapTime: 0,
  lap: 0,
  sectors: [],
};

export const mockWeather: WeatherData = {
  airTemp: 0,
  trackTemp: 0,
  humidity: 0,
  windSpeed: 0,
  pressure: 0,
};

export const mockSchedule: ScheduleEntry[] = [];

export function getMockTrackCount(standings: Standing[]): TrackCount {
  return {
    onTrack: standings.filter((s) => s.status === "on_track" || s.status === "pit_out").length,
    inPit: standings.filter((s) => s.status === "in_pit").length,
    stopped: standings.filter((s) => s.status === "stopped").length,
    retired: standings.filter((s) => s.status === "retired").length,
  };
}

export function getTeamByStanding(standing: Standing): Team | undefined {
  return (
    resolveLiveTeam(standing.teamId) ??
    mockTeams.find((t) => t.id === standing.teamId)
  );
}

export function getClassByStanding(standing: Standing): CarClass | undefined {
  return (
    resolveLiveClass(standing.classId) ??
    mockClasses.find((c) => c.id === standing.classId)
  );
}

export function getDriverName(standing: Standing, team?: Team): string {
  const t = team ?? getTeamByStanding(standing);
  const drivers = t?.drivers ?? [];
  // MOLA: Driver No=0 はチーム名の複製。実ドライバーは No>=1。
  const byNo =
    standing.driverNo !== 0
      ? drivers.find((d) => d.no === standing.driverNo)
      : undefined;
  const real = byNo ?? drivers.find((d) => d.no !== 0) ?? drivers[0];
  return real?.nameE || real?.nameJ || "---";
}

// ライブの周回履歴が無い場合のフォールバック（開発用）。実運用ではライブデータを使う。
function generateMockLapData(standing: Standing): DriverPersonalData {
  const rng = mulberry32(Number(standing.teamId.replace(/[^0-9]/g, "") || "1") + 100);
  const baseS1 = 220000, baseS2 = 410000, baseS3 = 330000;
  const lapCount = standing.lap || Math.max(3, 6 + Math.floor(rng() * 6));
  const laps: LapData[] = [];
  let bestLapTime: number | null = null, bestLap = 0;
  let bestS1: number | null = null, bestS2: number | null = null, bestS3: number | null = null;
  let sumLap = 0, validLaps = 0;

  for (let i = 1; i <= lapCount; i++) {
    const s1 = baseS1 + Math.floor((rng() - 0.4) * 12000);
    const s2 = baseS2 + Math.floor((rng() - 0.4) * 15000);
    const s3 = baseS3 + Math.floor((rng() - 0.4) * 10000);
    const lapTime = s1 + s2 + s3;
    const t: TimeType = "current";
    if (bestS1 === null || s1 < bestS1) bestS1 = s1;
    if (bestS2 === null || s2 < bestS2) bestS2 = s2;
    if (bestS3 === null || s3 < bestS3) bestS3 = s3;
    if (bestLapTime === null || lapTime < bestLapTime) { bestLapTime = lapTime; bestLap = i; }
    sumLap += lapTime; validLaps++;
    laps.push({ lap: i, lapTime, s1, s2, s3, s1Type: t, s2Type: t, s3Type: t, lapTimeType: t, isPit: false, position: standing.position });
  }

  return {
    teamId: standing.teamId,
    laps,
    bestLapTime,
    bestLap,
    bestS1, bestS2, bestS3,
    totalPits: 0,
    avgLapTime: validLaps > 0 ? Math.floor(sumLap / validLaps) : null,
  };
}

const _personalDataCache: Record<string, DriverPersonalData> = {};

export function getMockPersonalData(standing: Standing): DriverPersonalData {
  if (!_personalDataCache[standing.teamId]) {
    _personalDataCache[standing.teamId] = generateMockLapData(standing);
  }
  return _personalDataCache[standing.teamId];
}
