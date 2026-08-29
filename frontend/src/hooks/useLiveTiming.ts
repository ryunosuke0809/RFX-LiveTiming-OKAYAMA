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
import { asCarNo } from "@/lib/carNo";
import { setLiveEntities } from "@/lib/entityRegistry";
import {
  clearAllSectorEnters,
  clearSectorEnter,
  noteSectorEnter,
} from "@/lib/sectorEnterClock";
import { resolveLiveColumns } from "@/lib/liveColumns";
import { sanitizeElapsedIdle } from "@/lib/elapsedIdle";
import {
  fetchLiveDisplayColumns,
  setElapsedIdleConfig,
  setLiveDisplayColumns,
} from "@/lib/liveDisplaySync";

// ============================================================
// サーバー (/ws) が送る ViewModel 型 (server/src/state/types.ts と対応)
// ============================================================

interface StandingVm extends Omit<Standing, "sectors"> {
  teamNo: string | number;
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
  teamNo: string | number;
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
  no: string | number;
  nameJ: string;
  nameE: string;
  drivers: Array<{ no: number; nameJ: string; nameE: string }>;
}

interface StateSnapshot {
  serverTs: string;
  dataTs: string | null;
  lastPassingAt?: string | null;
  circuitId: string | null;
  session: SessionInfoVm | null;
  standings: StandingVm[];
  fastestLap: FastestLapVm | null;
  trackCount: TrackCount;
  classes: CarClassVm[];
  teams: TeamSummaryVm[];
  driverLaps: Record<string, LapData[]>;
  bestSectors?: Array<number | null>;
}

type LiveStatePatch =
  | { kind: "reset"; scope?: "all" | "timing" | "day" }
  | { kind: "session"; fields: Partial<SessionInfoVm> }
  | { kind: "flag"; flag: TrackFlag }
  | { kind: "class_upsert"; value: CarClassVm }
  | { kind: "team_upsert"; value: TeamSummaryVm }
  | { kind: "standing_upsert"; value: StandingVm }
  | { kind: "standing_remove"; teamId: string }
  | { kind: "fastest_lap"; value: FastestLapVm | null }
  | { kind: "best_sectors"; value: Array<number | null> }
  | { kind: "track_count"; value: TrackCount }
  | { kind: "driver_lap"; teamId: string; value: LapData }
  | { kind: "message"; value: unknown }
  | { kind: "display_live"; columns?: unknown; elapsed?: unknown };

type ServerMessage =
  | { type: "hello" }
  | { type: "state"; state: StateSnapshot }
  | { type: "patch"; patches: LiveStatePatch[]; dataTs: string | null; lastPassingAt?: string | null }
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
  /** 最後に Passing を受けた時刻 (ms)。ELAPSED 停止判定用。 */
  lastPassingAtMs: number | null;
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
  lastPassingAtMs: number | null;
  driverLaps: Map<string, LapData[]>;
  bestSectors: Array<number | null>;
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
    lastPassingAtMs: null,
    driverLaps: new Map(),
    bestSectors: [null, null, null],
  };
}

/** ローカル暦の日付キー。0 時をまたいだかどうかの判定に使う。 */
function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function resolveDefaultUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_LIVE_WS;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = window.location.port;
    // 本番（標準 80/443）: 同一オリジンの /ws（nginx 経由）
    // 開発（:3000 等）: バックエンド直結 :4000
    if (!port || port === "80" || port === "443") {
      return `${proto}//${window.location.host}/ws`;
    }
    return `${proto}//${host}:4000/ws`;
  }
  return "ws://localhost:4000/ws";
}

/** /api/ws-token のベース URL（開発時は :4000、本番は同一オリジン）。 */
function resolveApiBase(): string {
  if (typeof window === "undefined") return "";
  const port = window.location.port;
  if (!port || port === "80" || port === "443") {
    return "";
  }
  return `http://${window.location.hostname}:4000`;
}

/**
 * 短期 /ws トークンを取得する。認証オフなら null。
 * 正規ページ経由の視聴者は意識せず、接続前に自動で呼ばれる。
 */
async function fetchWsViewToken(signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${resolveApiBase()}/api/ws-token`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!res.ok) {
    throw new Error(`ws-token HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    authRequired?: boolean;
    token?: string | null;
  };
  if (!body.authRequired) return null;
  if (typeof body.token === "string" && body.token.length > 0) return body.token;
  throw new Error("ws-token missing");
}

function withToken(url: string, token: string | null): string {
  if (!token) return url;
  const u = new URL(url);
  u.searchParams.set("token", token);
  return u.toString();
}

/**
 * クラウドサーバー `/ws` に接続し、`state` + `patch` を適用して
 * フロントの表示型 (SessionInfo / Standing / CarClass / Team ...) に変換して返すフック。
 *
 * - 未接続 / データ未受信のときは `hasData=false`。呼び出し側は mock にフォールバックする。
 * - 切断時は指数バックオフで自動再接続。
 * - 本番で /ws 認証が有効なときは接続直前に /api/ws-token を自動取得する。
 */
export function useLiveTiming(url?: string): LiveTimingData {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0); // 再描画トリガ
  const stateRef = useRef<InternalState>(emptyInternal());
  const dirtyRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const targetBase = url ?? resolveDefaultUrl();
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const abort = new AbortController();

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
          // Select は timing のみ。Category 切替等は all (Team/Class も破棄)。
          // day は日付跨ぎで、セッション情報も捨てて未接続表示に戻す。
          s.standings.clear();
          s.driverLaps.clear();
          s.fastestLap = null;
          s.bestSectors = [null, null, null];
          s.trackCount = { onTrack: 0, inPit: 0, stopped: 0, retired: 0 };
          s.flag = "green";
          if (patch.scope !== "timing") {
            s.classes.clear();
            s.teams.clear();
          }
          if (patch.scope === "day") {
            s.session = null;
            s.dataTsMs = null;
          }
          s.lastPassingAtMs = null;
          clearAllSectorEnters();
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
        case "standing_upsert": {
          const prevSt = s.standings.get(patch.value.teamId);
          s.standings.set(patch.value.teamId, patch.value);
          if (
            !prevSt ||
            prevSt.lap !== patch.value.lap ||
            prevSt.sectorNo !== patch.value.sectorNo
          ) {
            noteSectorEnter(patch.value.teamId, patch.value.lap, patch.value.sectorNo);
          }
          break;
        }
        case "standing_remove":
          s.standings.delete(patch.teamId);
          s.teams.delete(patch.teamId);
          s.driverLaps.delete(patch.teamId);
          clearSectorEnter(patch.teamId);
          break;
        case "fastest_lap":
          s.fastestLap = patch.value;
          break;
        case "best_sectors":
          s.bestSectors = patch.value;
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
        case "display_live":
          if (patch.columns !== undefined) {
            setLiveDisplayColumns(resolveLiveColumns(patch.columns));
          }
          if (patch.elapsed !== undefined) {
            setElapsedIdleConfig(sanitizeElapsedIdle(patch.elapsed));
          }
          break;
        default:
          break;
      }
    };

    const connect = async () => {
      if (closedByUs) return;

      let token: string | null = null;
      try {
        token = await fetchWsViewToken(abort.signal);
      } catch {
        if (closedByUs || abort.signal.aborted) return;
        scheduleReconnect();
        return;
      }
      if (closedByUs || abort.signal.aborted) return;

      const target = withToken(targetBase, token);
      try {
        ws = new WebSocket(target);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        void fetchLiveDisplayColumns().catch(() => {
          /* 列設定は既定のまま */
        });
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
          const prevStandings = s.standings;
          s.session = msg.state.session;
          s.fastestLap = msg.state.fastestLap;
          s.trackCount = msg.state.trackCount;
          s.flag = msg.state.session?.flag ?? "green";
          s.standings = new Map(msg.state.standings.map((x) => [x.teamId, x]));
          s.classes = new Map(msg.state.classes.map((x) => [x.id, x]));
          s.teams = new Map(msg.state.teams.map((x) => [x.id, x]));
          s.driverLaps = new Map(Object.entries(msg.state.driverLaps ?? {}));
          s.bestSectors = msg.state.bestSectors ?? [null, null, null];
          s.dataTsMs = msg.state.dataTs ? Date.parse(msg.state.dataTs) || null : s.dataTsMs;
          s.lastPassingAtMs = msg.state.lastPassingAt
            ? Date.parse(msg.state.lastPassingAt) || null
            : null;
          // フル state では全車の進入時刻を now にしない（一斉ダッシュ防止）。
          // 既に持っている区間時計は維持し、接続中に周/区間が変わった分だけ更新する。
          for (const x of msg.state.standings) {
            const old = prevStandings.get(x.teamId);
            if (old && (old.lap !== x.lap || old.sectorNo !== x.sectorNo)) {
              noteSectorEnter(x.teamId, x.lap, x.sectorNo);
            }
          }
          scheduleFlush();
        } else if (msg.type === "patch") {
          for (const p of msg.patches) applyPatch(p);
          if (msg.dataTs) {
            const t = Date.parse(msg.dataTs);
            if (!Number.isNaN(t)) stateRef.current.dataTsMs = t;
          }
          if (msg.lastPassingAt !== undefined) {
            stateRef.current.lastPassingAtMs = msg.lastPassingAt
              ? Date.parse(msg.lastPassingAt) || null
              : null;
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
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    void connect();

    return () => {
      closedByUs = true;
      abort.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [url]);

  // ローカル日付が変わったら表示を空に戻す保険。
  // 通常はサーバーが reset(scope:"day") を配信するが、それを取りこぼしたタブや
  // スリープから復帰したタブでも前日のデータが残らないようにする。
  useEffect(() => {
    let currentDay = localDayKey();
    const timer = setInterval(() => {
      const today = localDayKey();
      if (today === currentDay) return;
      currentDay = today;
      stateRef.current = emptyInternal();
      clearAllSectorEnters();
      setVersion((v) => v + 1);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // version が変わるたびに ref から表示型を作り直す。
  const data = useMemo<LiveTimingData>(() => {
    void version; // 依存として参照
    const s = stateRef.current;

    // MOLA は英語名 (NameE) が空で日本語名 (NameJ) のみ送るため、空なら NameJ にフォールバック。
    const teams: Team[] = Array.from(s.teams.values()).map((t) => ({
      id: t.id,
      classId: t.classId,
      no: asCarNo(t.no),
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
    const standingMap = new Map(standings.map((st) => [st.teamId, st]));

    // 全体ベストセクター [S1,S2,S3]。null は 0 として渡し、表示側で "--:--" になる。
    const bestSectorArr = (s.bestSectors ?? [null, null, null]).map((v) => v ?? 0);
    const fastestLap: FastestLap | null = s.fastestLap
      ? {
          teamNo: asCarNo(s.fastestLap.teamNo),
          driverName: s.fastestLap.driverNameJ,
          lapTime: s.fastestLap.lapTime,
          lap: s.fastestLap.lap,
          sectors: bestSectorArr,
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
    // ELAPSED は壁時計で Start から計算する。
    // - Start 前: null（タイマー停止）
    // - 途中参加 / 再表示 / 終了後: いずれも now - startedAt（動き続ける）
    const sessionElapsedSec =
      startedAtMs !== null
        ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
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
      lastPassingAtMs: s.lastPassingAtMs,
      sessionLaps: s.session?.sessionLaps ?? 0,
      leaderLap,
      getTeamById: (id) => teamMap.get(id),
      getClassById: (id) => classMap.get(id),
      getPersonalData: (id) =>
        buildPersonalData(id, driverLapsMap.get(id) ?? [], standingMap.get(id)),
    };
  }, [version, connected]);

  return data;
}

const rank = (pos: number) => (pos > 0 ? pos : Number.MAX_SAFE_INTEGER);

/** FL 直後などで、表示中セクターが直前の完了周のコピーなら true。 */
function isLeftoverCompletedSectors(
  last: LapData,
  standingLap: number,
  s1: number | null,
  s2: number | null,
  s3: number | null,
): boolean {
  const allMatch =
    s1 === last.s1 &&
    s2 === last.s2 &&
    s3 === last.s3 &&
    (s1 != null || s2 != null || s3 != null);
  if (allMatch) return true;
  // ピット周: 完了ラップには算出 S3 があるが、表側 S3 がまだ空
  return (
    last.lap === standingLap &&
    s1 === last.s1 &&
    s2 === last.s2 &&
    s3 == null &&
    last.s3 != null
  );
}

/** ライブの周回履歴 (LapData[]) から DriverPersonalData を構築する。
 * 現在の standing が渡された場合は、集計中の「現在ラップ」を末尾に追加し、
 * セクタータイムや In Pit をリアルタイムに反映する。 */
function buildPersonalData(
  teamId: string,
  laps: LapData[],
  standing?: Standing,
): DriverPersonalData {
  const completed = [...laps].sort((a, b) => a.lap - b.lap);
  const sorted = [...completed];

  // 進行中ラップ: 完了周回 (standing.lap) の次の周を集計中として表示。
  if (standing && standing.status !== "retired" && standing.status !== "finished") {
    const sec = standing.sectors ?? [];
    let s1 = sec[0]?.time ?? null;
    let s2 = sec[1]?.time ?? null;
    let s3 = sec[2]?.time ?? null;
    let s1Type = sec[0]?.type ?? "none";
    let s2Type = sec[1]?.type ?? "none";
    let s3Type = sec[2]?.type ?? "none";
    const lastCompleted = completed[completed.length - 1];
    // FL 直後は standing.sectors が前周のまま残る。次周の行に流用しない。
    if (lastCompleted && isLeftoverCompletedSectors(lastCompleted, standing.lap, s1, s2, s3)) {
      s1 = null;
      s2 = null;
      s3 = null;
      s1Type = "none";
      s2Type = "none";
      s3Type = "none";
    }
    const inPit = standing.status === "in_pit";
    // 何かしら表示すべき情報 (セクター計測 or ピット中) がある時だけ現在ラップ行を出す。
    if (s1 !== null || s2 !== null || s3 !== null || inPit) {
      sorted.push({
        lap: standing.lap + 1,
        lapTime: null,
        s1,
        s2,
        s3,
        s1Type,
        s2Type,
        s3Type,
        lapTimeType: "none",
        isPit: inPit,
        position: standing.position,
        inProgress: true,
      });
    }
  }

  // 集計値 (Best/Avg/Pits) は完了周回のみで算出。進行中ラップは表示行だけに含める。
  const min = (vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => v !== null && v > 0);
    return nums.length ? Math.min(...nums) : null;
  };
  const lapTimes = completed.map((l) => l.lapTime);
  const bestLapTime = min(lapTimes);
  const bestLap = bestLapTime !== null ? (completed.find((l) => l.lapTime === bestLapTime)?.lap ?? 0) : 0;
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
    bestS1: min(completed.map((l) => l.s1)),
    bestS2: min(completed.map((l) => l.s2)),
    bestS3: min(completed.map((l) => l.s3)),
    totalPits: completed.filter((l) => l.isPit).length,
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
    pitEnteredAt: v.pitEnteredAt ?? null,
    positionChange: v.positionChange,
    blanked: v.blanked === true,
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
    elapsedTime:
      v.sessionStartedAt && !Number.isNaN(Date.parse(v.sessionStartedAt))
        ? Math.max(0, Math.floor((Date.now() - Date.parse(v.sessionStartedAt)) / 1000))
        : 0,
    sessionStartedAt: v.sessionStartedAt,
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
