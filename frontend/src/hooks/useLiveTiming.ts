"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CarClass,
  DriverPersonalData,
  FastestLap,
  LapData,
  SessionInfo,
  Standing,
  Team,
  TrackCount,
  TrackFlag,
} from "@/types/smis";
import { formatLocalTime } from "@/lib/format";
import { setLiveEntities } from "@/lib/entityRegistry";

// ============================================================
// サーバー (/ws) が送る ViewModel 型 (server/src/state/types.ts と対応)
// ============================================================

interface StandingVm extends Omit<Standing, "sectors"> {
  teamNo: number;
  teamNameJ: string;
  teamNameE: string;
  driverNameJ: string;
  driverNameE: string;
  sectors: Standing["sectors"];
}

interface SessionInfoVm {
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
  isRace: boolean;
}

interface FastestLapVm {
  teamId: string;
  teamNo: number;
  driverNo: number;
  driverNameJ: string;
  lapTime: number;
  lap: number;
}

interface CarClassVm {
  id: string;
  nameJ: string;
  nameE: string;
  record: string;
  color: string;
}

interface TeamSummaryVm {
  id: string;
  classId: string;
  no: number;
  nameJ: string;
  nameE: string;
  drivers: Array<{ no: number; nameJ: string; nameE: string }>;
}

interface StateSnapshot {
  serverTs: string;
  dataTs: string | null;
  circuitId: string | null;
  session: SessionInfoVm | null;
  standings: StandingVm[];
  fastestLap: FastestLapVm | null;
  trackCount: TrackCount;
  classes: CarClassVm[];
  teams: TeamSummaryVm[];
  driverLaps: Record<string, LapData[]>;
}

type LiveStatePatch =
  | { kind: "reset" }
  | { kind: "session"; fields: Partial<SessionInfoVm> }
  | { kind: "flag"; flag: TrackFlag }
  | { kind: "class_upsert"; value: CarClassVm }
  | { kind: "team_upsert"; value: TeamSummaryVm }
  | { kind: "standing_upsert"; value: StandingVm }
  | { kind: "standing_remove"; teamId: string }
  | { kind: "fastest_lap"; value: FastestLapVm | null }
  | { kind: "track_count"; value: TrackCount }
  | { kind: "driver_lap"; teamId: string; value: LapData }
  | { kind: "message"; value: unknown };

type ServerMessage =
  | { type: "hello" }
  | { type: "state"; state: StateSnapshot }
  | { type: "patch"; patches: LiveStatePatch[]; dataTs: string | null }
  | { type: "smis" };

// ============================================================
// 公開する型
// ============================================================

export interface LiveTimingData {
  connected: boolean;
  hasData: boolean;
  sessionInfo: SessionInfo | null;
  standings: Standing[];
  classes: CarClass[];
  teams: Team[];
  fastestLap: FastestLap | null;
  trackCount: TrackCount;
  flag: TrackFlag;
  /** 周回レース=true / ベストタイム(予選・専有)=false。 */
  isRace: boolean;
  /** セッション開始からの経過秒 (データ時刻基準。再生でも正しい)。未確定時は null。 */
  sessionElapsedSec: number | null;
  /** 総周回数 (MOLA が送れば >0)。 */
  sessionLaps: number;
  /** リーダー(P1)の周回数。 */
  leaderLap: number;
  getTeamById: (teamId: string) => Team | undefined;
  getClassById: (classId: string) => CarClass | undefined;
  /** ライブの周回履歴から個別ドライバーデータを構築する。 */
  getPersonalData: (teamId: string) => DriverPersonalData;
}

// ============================================================
// 内部状態 (ref 上で編集し、rAF でまとめて再描画)
// ============================================================

interface InternalState {
  session: SessionInfoVm | null;
  standings: Map<string, StandingVm>;
  classes: Map<string, CarClassVm>;
  teams: Map<string, TeamSummaryVm>;
  fastestLap: FastestLapVm | null;
  trackCount: TrackCount;
  flag: TrackFlag;
  dataTsMs: number | null;
  driverLaps: Map<string, LapData[]>;
}

function emptyInternal(): InternalState {
  return {
    session: null,
    standings: new Map(),
    classes: new Map(),
    teams: new Map(),
    fastestLap: null,
    trackCount: { onTrack: 0, inPit: 0, stopped: 0, retired: 0 },
    flag: "green",
    dataTsMs: null,
    driverLaps: new Map(),
  };
}

function resolveDefaultUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_LIVE_WS;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined") {
    return `ws://${window.location.hostname}:4000/ws`;
  }
  return "ws://localhost:4000/ws";
}

/**
 * クラウドサーバー `/ws` に接続し、`state` + `patch` を適用して
 * フロントの表示型 (SessionInfo / Standing / CarClass / Team ...) に変換して返すフック。
 *
 * - 未接続 / データ未受信のときは `hasData=false`。呼び出し側は mock にフォールバックする。
 * - 切断時は指数バックオフで自動再接続。
 */
export function useLiveTiming(url?: string): LiveTimingData {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0); // 再描画トリガ
  const stateRef = useRef<InternalState>(emptyInternal());
  const dirtyRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = url ?? resolveDefaultUrl();
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleFlush = () => {
      if (dirtyRef.current) return;
      dirtyRef.current = true;
      rafRef.current = requestAnimationFrame(() => {
        dirtyRef.current = false;
        setVersion((v) => v + 1);
      });
    };

    const applyPatch = (patch: LiveStatePatch) => {
      const s = stateRef.current;
      switch (patch.kind) {
        case "reset":
          s.standings.clear();
          s.classes.clear();
          s.teams.clear();
          s.driverLaps.clear();
          s.fastestLap = null;
          s.trackCount = { onTrack: 0, inPit: 0, stopped: 0, retired: 0 };
          s.flag = "green";
          break;
        case "session":
          s.session = { ...(s.session ?? emptySessionVm()), ...patch.fields };
          break;
        case "flag":
          s.flag = patch.flag;
          if (s.session) s.session = { ...s.session, flag: patch.flag };
          break;
        case "class_upsert":
          s.classes.set(patch.value.id, patch.value);
          break;
        case "team_upsert":
          s.teams.set(patch.value.id, patch.value);
          break;
        case "standing_upsert":
          s.standings.set(patch.value.teamId, patch.value);
          break;
        case "standing_remove":
          s.standings.delete(patch.teamId);
          break;
        case "fastest_lap":
          s.fastestLap = patch.value;
          break;
        case "track_count":
          s.trackCount = patch.value;
          break;
        case "driver_lap": {
          const arr = s.driverLaps.get(patch.teamId) ?? [];
          if (!arr.some((l) => l.lap === patch.value.lap)) {
            arr.push(patch.value);
            s.driverLaps.set(patch.teamId, arr);
          }
          break;
        }
        default:
          break;
      }
    };

    const connect = () => {
      try {
        ws = new WebSocket(target);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "state") {
          const s = stateRef.current;
          s.session = msg.state.session;
          s.fastestLap = msg.state.fastestLap;
          s.trackCount = msg.state.trackCount;
          s.flag = msg.state.session?.flag ?? "green";
          s.standings = new Map(msg.state.standings.map((x) => [x.teamId, x]));
          s.classes = new Map(msg.state.classes.map((x) => [x.id, x]));
          s.teams = new Map(msg.state.teams.map((x) => [x.id, x]));
          s.driverLaps = new Map(Object.entries(msg.state.driverLaps ?? {}));
          s.dataTsMs = msg.state.dataTs ? Date.parse(msg.state.dataTs) || null : s.dataTsMs;
          scheduleFlush();
        } else if (msg.type === "patch") {
          for (const p of msg.patches) applyPatch(p);
          if (msg.dataTs) {
            const t = Date.parse(msg.dataTs);
            if (!Number.isNaN(t)) stateRef.current.dataTsMs = t;
          }
          scheduleFlush();
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) scheduleReconnect();
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedByUs) return;
      retry += 1;
      const delay = Math.min(1000 * 2 ** (retry - 1), 10000);
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [url]);

  // version が変わるたびに ref から表示型を作り直す。
  const data = useMemo<LiveTimingData>(() => {
    void version; // 依存として参照
    const s = stateRef.current;

    // MOLA は英語名 (NameE) が空で日本語名 (NameJ) のみ送るため、空なら NameJ にフォールバック。
    const teams: Team[] = Array.from(s.teams.values()).map((t) => ({
      id: t.id,
      classId: t.classId,
      no: t.no,
      nameJ: t.nameJ,
      nameE: t.nameE || t.nameJ,
      engine: "",
      machine: "",
      tire: "",
      nation: "",
      drivers: t.drivers.map((d) => ({
        no: d.no,
        nameJ: d.nameJ,
        nameE: d.nameE || d.nameJ,
        nation: "",
      })),
    }));
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const classes: CarClass[] = Array.from(s.classes.values()).map((c) => ({
      id: c.id,
      nameJ: c.nameJ,
      nameE: c.nameE || c.nameJ,
      record: c.record,
      color: c.color,
    }));
    const classMap = new Map(classes.map((c) => [c.id, c]));

    const standings: Standing[] = Array.from(s.standings.values())
      .map(vmToStanding)
      .sort((a, b) => rank(a.position) - rank(b.position) || a.order - b.order);

    const fastestLap: FastestLap | null = s.fastestLap
      ? {
          teamNo: s.fastestLap.teamNo,
          driverName: s.fastestLap.driverNameJ,
          lapTime: s.fastestLap.lapTime,
          lap: s.fastestLap.lap,
          sectors: [],
        }
      : null;

    const sessionInfo = s.session ? vmToSessionInfo(s.session) : null;
    const hasData = standings.length > 0 || teams.length > 0;
    const isRace = s.session?.isRace ?? false;
    const startedAtMs = s.session?.sessionStartedAt
      ? (() => {
          const t = Date.parse(s.session.sessionStartedAt);
          return Number.isNaN(t) ? null : t;
        })()
      : null;
    // 経過秒はデータ時刻 (dataTsMs) 基準。過去ログ再生でも正しい値になる。
    const sessionElapsedSec =
      startedAtMs !== null && s.dataTsMs !== null
        ? Math.max(0, Math.floor((s.dataTsMs - startedAtMs) / 1000))
        : null;
    const leaderLap = standings.length > 0 ? standings[0].lap : 0;
    const driverLapsMap = s.driverLaps;

    // mock のルックアップ関数がライブのチーム/クラスを解決できるよう登録する。
    if (hasData) {
      setLiveEntities(teamMap, classMap);
    } else {
      setLiveEntities(null, null);
    }

    return {
      connected,
      hasData,
      sessionInfo,
      standings,
      classes,
      teams,
      fastestLap,
      trackCount: s.trackCount,
      flag: s.flag,
      isRace,
      sessionElapsedSec,
      sessionLaps: s.session?.sessionLaps ?? 0,
      leaderLap,
      getTeamById: (id) => teamMap.get(id),
      getClassById: (id) => classMap.get(id),
      getPersonalData: (id) => buildPersonalData(id, driverLapsMap.get(id) ?? []),
    };
  }, [version, connected]);

  return data;
}

const rank = (pos: number) => (pos > 0 ? pos : Number.MAX_SAFE_INTEGER);

/** ライブの周回履歴 (LapData[]) から DriverPersonalData を構築する。 */
function buildPersonalData(teamId: string, laps: LapData[]): DriverPersonalData {
  const sorted = [...laps].sort((a, b) => a.lap - b.lap);
  const min = (vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => v !== null && v > 0);
    return nums.length ? Math.min(...nums) : null;
  };
  const lapTimes = sorted.map((l) => l.lapTime);
  const bestLapTime = min(lapTimes);
  const bestLap = bestLapTime !== null ? (sorted.find((l) => l.lapTime === bestLapTime)?.lap ?? 0) : 0;
  const validLapTimes = lapTimes.filter((v): v is number => v !== null && v > 0);
  const avgLapTime =
    validLapTimes.length > 0
      ? Math.round(validLapTimes.reduce((a, b) => a + b, 0) / validLapTimes.length)
      : null;
  return {
    teamId,
    laps: sorted,
    bestLapTime,
    bestLap,
    bestS1: min(sorted.map((l) => l.s1)),
    bestS2: min(sorted.map((l) => l.s2)),
    bestS3: min(sorted.map((l) => l.s3)),
    totalPits: sorted.filter((l) => l.isPit).length,
    avgLapTime,
  };
}

function vmToStanding(v: StandingVm): Standing {
  return {
    position: v.position,
    classPosition: v.classPosition,
    classId: v.classId,
    teamId: v.teamId,
    driverNo: v.driverNo,
    lap: v.lap,
    bestTime: v.bestTime,
    bestTimeLap: v.bestTimeLap,
    lastLapTime: v.lastLapTime,
    lastPassingTime: v.lastPassingTime,
    sectorNo: v.sectorNo,
    sectorTime: v.sectorTime,
    order: v.order,
    refSectors: v.refSectors,
    gap: v.gap,
    interval: v.interval,
    status: v.status,
    sectors: v.sectors ?? [],
    bestTimeType: v.bestTimeType,
    lastLapTimeType: v.lastLapTimeType,
    pits: v.pits,
    pitTime: v.pitTime,
    positionChange: v.positionChange,
  };
}

function vmToSessionInfo(v: SessionInfoVm): SessionInfo {
  let remainingTime = v.sessionRemainingSec ?? 0;
  if (remainingTime <= 0 && v.sessionStartedAt && v.sessionTime) {
    // sessionTime が "mm:ss" or "HH:mm" 形式ならざっくり残り時間を推定
    const total = parseSessionDurationSec(v.sessionTime);
    if (total > 0) {
      const started = Date.parse(v.sessionStartedAt);
      if (!Number.isNaN(started)) {
        remainingTime = Math.max(0, total - Math.floor((Date.now() - started) / 1000));
      }
    }
  }
  return {
    competition: {
      id: v.competitionId,
      nameJ: v.competitionNameJ,
      nameE: v.competitionNameE || v.competitionNameJ,
      startDate: "",
      endDate: "",
    },
    category: {
      id: v.categoryId,
      nameJ: v.categoryNameJ,
      nameE: v.categoryNameE || v.categoryNameJ,
      courseName: "",
      courseLength: 0,
    },
    round: {
      id: v.roundId,
      nameJ: v.roundNameJ,
      nameE: v.roundNameE || v.roundNameJ,
      type: "L",
    },
    session: {
      id: v.sessionId,
      nameJ: v.sessionNameJ || v.categoryNameJ,
      nameE: v.sessionNameE || v.categoryNameE || v.categoryNameJ,
      time: v.sessionTime,
      lap: v.sessionLaps,
    },
    flag: v.flag,
    remainingTime,
    elapsedTime: 0,
    localTime: formatLocalTime(),
  };
}

function parseSessionDurationSec(s: string): number {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function emptySessionVm(): SessionInfoVm {
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
