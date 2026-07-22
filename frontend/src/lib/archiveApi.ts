/** 本番同一オリジンの過去データ API クライアント。 */

export interface ArchiveSessionSummary {
  index: number;
  date: string;
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

export interface ArchiveStanding {
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
  refSectors: Array<number | null>;
  gap: string;
  interval: string;
  status: string;
  sectors: Array<{ time: number | null; type: string }>;
  bestTimeType: string;
  lastLapTimeType: string;
  pits: number;
  pitTime: number | null;
  pitEnteredAt?: string | null;
  positionChange: number;
}

export interface ArchiveResultPayload {
  index: number;
  date: string;
  competitionName: string;
  categoryName: string;
  sessionName: string;
  roundName: string;
  isRace: boolean;
  startedAt: string | null;
  endedAt: string | null;
  carCount: number;
  circuitId: string | null;
  snapshot: {
    session: {
      competitionNameJ: string;
      competitionNameE: string;
      categoryNameJ: string;
      categoryNameE: string;
      sessionNameJ: string;
      sessionNameE: string;
      roundNameJ: string;
      roundNameE: string;
      isRace: boolean;
    } | null;
    standings: ArchiveStanding[];
    classes: Array<{ id: string; nameJ: string; nameE: string; record: string; color: string }>;
    teams: Array<{
      id: string;
      classId: string;
      no: number;
      nameJ: string;
      nameE: string;
      drivers: Array<{ no: number; nameJ: string; nameE: string }>;
    }>;
    driverLaps: Record<
      string,
      Array<{
        lap: number;
        lapTime: number | null;
        s1: number | null;
        s2: number | null;
        s3: number | null;
        s1Type: string;
        s2Type: string;
        s3Type: string;
        lapTimeType: string;
        isPit: boolean;
        position: number;
      }>
    >;
    fastestLap: {
      teamNo: number;
      driverNameJ: string;
      lapTime: number;
      lap: number;
    } | null;
  };
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  return "";
}

export async function fetchArchiveDays(): Promise<string[]> {
  const res = await fetch(`${apiBase()}/api/archive/days`);
  if (!res.ok) throw new Error(`archive/days ${res.status}`);
  const json = (await res.json()) as { days: string[] };
  return json.days ?? [];
}

export async function fetchArchiveSessions(date: string): Promise<ArchiveSessionSummary[]> {
  const res = await fetch(
    `${apiBase()}/api/archive/sessions?date=${encodeURIComponent(date)}`,
  );
  if (!res.ok) throw new Error(`archive/sessions ${res.status}`);
  const json = (await res.json()) as { sessions: ArchiveSessionSummary[] };
  return json.sessions ?? [];
}

export async function fetchArchiveResult(
  date: string,
  sessionIndex: number,
): Promise<ArchiveResultPayload> {
  const res = await fetch(
    `${apiBase()}/api/archive/results?date=${encodeURIComponent(date)}&sessionIndex=${sessionIndex}`,
  );
  if (!res.ok) throw new Error(`archive/results ${res.status}`);
  return (await res.json()) as ArchiveResultPayload;
}

export function archiveCsvUrl(
  date: string,
  sessionIndex: number,
  kind: "classification" | "laps",
  teamId?: string,
): string {
  const q = new URLSearchParams({
    date,
    sessionIndex: String(sessionIndex),
    kind,
  });
  if (teamId) q.set("teamId", teamId);
  return `${apiBase()}/api/archive/csv?${q.toString()}`;
}
