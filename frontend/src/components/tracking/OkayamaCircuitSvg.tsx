"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * 各セクター（Sec1/Sec2/Sec3）はジオメトリ側でサンプリング＋Chaikin スムージング済みの
 * `d` を `geom.sectorDs` で受け取り、ワールド座標のままレンダリングする。マシンマーカーは
 * 同じくスムージング済みの `lapD` に沿って動く。ズームと回転は viewBox 中心を基準に <g> で適用。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Standing, Team } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import {
  OKAYAMA_TRACK_CENTER,
  OKAYAMA_TRACK_VIEWBOX,
  SECTOR_LABEL_POSITIONS,
  TIMING_LABEL_OFFSET,
} from "@/lib/okayamaTrackAsset";
import {
  buildOkayamaLapGeometry,
  pointOnLapSamples,
  type OkayamaLapGeometry,
  type Vec2,
} from "@/lib/okayamaTrackGeometry";

/** 完成図に合わせ: S1=赤 / S2=黄 / S3=緑 */
const SECTOR_COLORS = {
  s1: "#ef4444",
  s2: "#eab308",
  s3: "#22c55e",
};

/** FL(スタート/フィニッシュ) と 一周終端の samples インデックス比率。S1/S2 境界は geom.bounds から取る。 */
const BOUND_CL = 0.0;
const BOUND_LAP = 1.0;
/** 区間ごとの既定移動時間(ms)。区間タイム未取得時のフォールバック。
 *  1周目・ピットアウト直後など基準が無いときは意図的に遅めにし、
 *  実測より先にゴールラインへ飛び込むのを防ぐ。 */
const DEFAULT_SEG_MS = [40000, 70000, 50000];

/**
 * sectorNo から「今いる区間の始点/終点/移動に使う区間index」を返す。
 * SectorNo は直近で通過した計測点: 1=S1通過(→S2走行), 2=S2通過(→S3走行), 3/0=CL通過(→S1走行)。
 *
 * 境界は色分けセクターパスと同じジオメトリ (`bounds` = samples インデックス比率) を使う。
 * 実距離比の固定値だと pointOnLapSamples の補間 (インデックス基準) と位置がずれ、
 * S2 通過済の車が黄色い S2 ゾーンの途中に描画される不具合になる。
 */
function segmentFor(
  sectorNo: number,
  bounds: { s1: number; s2: number },
): { start: number; target: number; durIdx: number } {
  switch (sectorNo) {
    case 1:
      return { start: bounds.s1, target: bounds.s2, durIdx: 1 }; // S2 を走行
    case 2:
      return { start: bounds.s2, target: BOUND_LAP, durIdx: 2 }; // S3 を走行
    default: // 3 or 0
      return { start: BOUND_CL, target: bounds.s1, durIdx: 0 }; // S1 を走行
  }
}

interface CarAnim {
  start: number;
  target: number;
  startT: number;
  durMs: number;
  /** この区間の「実秒ベース」推定時間(ms)。再生レート推定(実測/推定)に使う。 */
  estMs: number;
  leg: number;
}

/** 再生レート(実測壁時計 / 実秒推定) の許容範囲と平滑化係数。
 *  ライブ=1x なら ≈1、10倍速再生なら ≈0.1 に自動追従する。 */
const RATE_MIN = 0.02;
const RATE_MAX = 1.5;
const RATE_EMA = 0.35;
/** レート適用後の区間移動時間の下限(ms)。inf 再生でも視認できる程度は動かす。 */
const MIN_DUR_MS = 250;

const TRACK_STROKE_WIDE = 38;
const TRACK_STROKE_LINE = 9;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;
const ZOOM_DEFAULT = 0.83;
const ROTATE_STEP = 15;
const PAN_DRAG_THRESHOLD = 4;

/** 車番アイコンのサイズ倍率。ユーザーがサークル/ラベルを拡大縮小できる。 */
const MARKER_SCALE_MIN = 0.6;
const MARKER_SCALE_MAX = 2.2;
const MARKER_SCALE_STEP = 0.2;
const MARKER_SCALE_DEFAULT = 1.5;

/** マーカー: 実位置ドット / リード線 / CARNO ラベルの基準寸法 (markerScale=1・ワールド座標)。 */
const DOT_R = 4;
const LABEL_H = 18;
const LABEL_FONT = 11;
const LABEL_CHAR_W = 7.5;
const LABEL_PAD_X = 6;
/** ラベルと実位置ドットを結ぶリード線の最大長 (markerScale 倍)。 */
const LEADER_MAX = 46;

/** デクラッタ対象のラベル1件。実位置(x,y)とラベル中心(lx,ly)を分離して持つ。 */
interface LabelMark {
  s: Standing;
  team: Team;
  noStr: string;
  x: number;
  y: number;
  lx: number;
  ly: number;
  labelW: number;
  labelH: number;
  fill: string;
  isHi: boolean;
  dimmed: boolean;
  stopped: boolean;
}

/**
 * ラベル同士が重ならないよう AABB 反発でラベル位置(lx,ly)を調整する。
 * 実位置(ドット)からの距離が LEADER_MAX を超えないよう毎反復で引き戻す。
 * 集団でも CARNO が読めるようにするための簡易デクラッタ。
 */
function declutterLabels(marks: LabelMark[], markerScale: number): void {
  const ITER = 10;
  const gap = 3 * markerScale;
  const maxLead = LEADER_MAX * markerScale;
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const a = marks[i]!;
        const b = marks[j]!;
        const dx = b.lx - a.lx;
        const dy = b.ly - a.ly;
        const minX = (a.labelW + b.labelW) / 2 + gap;
        const minY = (a.labelH + b.labelH) / 2 + gap;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          // 重なりが小さい軸方向へ押し離す。
          if (ox < oy) {
            const push = (ox / 2) * (dx < 0 ? -1 : 1);
            a.lx -= push;
            b.lx += push;
          } else {
            const push = (oy / 2) * (dy < 0 ? -1 : 1);
            a.ly -= push;
            b.ly += push;
          }
        }
      }
    }
    for (const m of marks) {
      const dx = m.lx - m.x;
      const dy = m.ly - m.y;
      const d = Math.hypot(dx, dy);
      if (d > maxLead) {
        m.lx = m.x + (dx / d) * maxLead;
        m.ly = m.y + (dy / d) * maxLead;
      }
    }
  }
}

/** セクター境界を路面に対し直交で横断するオレンジ点線 */
const BOUNDARY_LINE_COLOR = "#f59e0b";
/** 路面ストロークが 38px なので、はみ出すよう半分の長さを 26px に */
const BOUNDARY_HALF_LEN = 26;

/**
 * 路面中心 `lapCenter` から外側へ `dist` ぶん押し出した座標を返す。
 * タイミング点ラベルを路面に被らせないために使う。
 */
function offsetOutside(p: Vec2, lapCenter: Vec2, dist: number): Vec2 {
  const dx = p.x - lapCenter.x;
  const dy = p.y - lapCenter.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / d) * dist, y: p.y + (dy / d) * dist };
}

/**
 * 接線 `tangent` に直交する方向で `p` を通る横断ラインを路面の幅より広く引く。
 * S1/S2/Sec3(FL) の境界に共通スタイル（オレンジ点線）で使う。
 */
function boundaryCrossLine(
  p: Vec2,
  tangent: Vec2,
  key: string,
  opts?: { dashed?: boolean; opacity?: number; strokeWidth?: number },
) {
  const { dashed = true, opacity = 0.85, strokeWidth = 2.5 } = opts ?? {};
  const nx = -tangent.y * BOUNDARY_HALF_LEN;
  const ny = tangent.x * BOUNDARY_HALF_LEN;
  return (
    <line
      key={key}
      x1={p.x - nx}
      y1={p.y - ny}
      x2={p.x + nx}
      y2={p.y + ny}
      stroke={BOUNDARY_LINE_COLOR}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      opacity={opacity}
      strokeDasharray={dashed ? "5 4" : undefined}
    />
  );
}

interface OkayamaCircuitSvgProps {
  standings?: Standing[];
  showCarMarkers?: boolean;
  highlightedTeamIds?: Set<string>;
  onMarkerClick?: (teamId: string) => void;
  className?: string;
}

export default function OkayamaCircuitSvg({
  standings = [],
  showCarMarkers = false,
  highlightedTeamIds,
  onMarkerClick,
  className = "",
}: OkayamaCircuitSvgProps) {
  // ジオメトリは document 依存 (SVG パスのサンプリング) のためクライアント専用。
  // SSR と初回クライアント描画はともに null にし、マウント後に構築することで
  // ハイドレーション不一致 (サーバーが出さない <path> をクライアントが出す) を防ぐ。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const geom = useMemo<OkayamaLapGeometry | null>(
    () => (mounted ? buildOkayamaLapGeometry() : null),
    [mounted],
  );
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  const [markerScale, setMarkerScale] = useState(MARKER_SCALE_DEFAULT);

  // 車両アニメーション: teamId ごとに「現区間の始点→終点を区間タイムかけて移動」する状態を保持し、
  // requestAnimationFrame で毎フレーム再描画する。
  const animRef = useRef<Map<string, CarAnim>>(new Map());
  // データ配信レート(=実測の区間所要壁時計 / 実秒推定)の平滑化値。
  // ライブなら ≈1、加速再生なら小さくなり、マーカー移動がデータ更新に追従する。
  const rateRef = useRef<number>(1);
  const [, setAnimFrame] = useState(0);
  useEffect(() => {
    if (!showCarMarkers) return;
    let raf = 0;
    const loop = () => {
      setAnimFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showCarMarkers]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    startSvg: Vec2;
    panAtStart: Vec2;
    moved: boolean;
  } | null>(null);
  const panBlockClickRef = useRef(false);
  // 2本指ピンチ用: 現在押されているポインタを pointerId で管理する。
  // iOS Safari でもピンチ操作で trackmap をズーム/パンできるようにするため、
  // 1点ドラッグと 2点ピンチを同じハンドラ系で扱う。
  const pointersRef = useRef<Map<number, { svg: Vec2; client: Vec2 }>>(new Map());
  const pinchRef = useRef<{
    startDist: number;
    startCenterSvg: Vec2;
    startZoom: number;
    startPan: Vec2;
  } | null>(null);

  const timing = geom?.timing;
  const samples = geom?.samples ?? [];
  const sectorCenters = geom?.sectorLabelCenters;

  const labelPositions = sectorCenters
    ? {
        s1: SECTOR_LABEL_POSITIONS.s1 ?? sectorCenters.s1,
        s2: SECTOR_LABEL_POSITIONS.s2 ?? sectorCenters.s2,
        s3: SECTOR_LABEL_POSITIONS.s3 ?? sectorCenters.s3,
      }
    : null;

  const onZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP));
  const onZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP));
  const onMarkerBigger = () =>
    setMarkerScale((m) => Math.min(MARKER_SCALE_MAX, +(m + MARKER_SCALE_STEP).toFixed(2)));
  const onMarkerSmaller = () =>
    setMarkerScale((m) => Math.max(MARKER_SCALE_MIN, +(m - MARKER_SCALE_STEP).toFixed(2)));
  const onRotateLeft = () => setRotation((r) => r - ROTATE_STEP);
  const onRotateRight = () => setRotation((r) => r + ROTATE_STEP);
  const onReset = () => {
    setZoom(ZOOM_DEFAULT);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setMarkerScale(MARKER_SCALE_DEFAULT);
  };

  const screenToSvg = useCallback((clientX: number, clientY: number): Vec2 => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  }, []);

  // ポインターイベントは <svg> ではなくラッパーの <div>(HTMLElement) で受ける。
  // iOS Safari は SVGSVGElement の setPointerCapture が不安定で、ドラッグ中の
  // pointermove が届かず「タッチが効かない」ように見える症状の主因になる。
  //
  // 1点 → ドラッグでパン / マーカーをタップして選択
  // 2点 → ピンチでズーム + 中心移動でパン
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const svgPt = screenToSvg(e.clientX, e.clientY);
      pointersRef.current.set(e.pointerId, {
        svg: svgPt,
        client: { x: e.clientX, y: e.clientY },
      });

      if (pointersRef.current.size === 1) {
        dragRef.current = { startSvg: svgPt, panAtStart: pan, moved: false };
        pinchRef.current = null;
        panBlockClickRef.current = false;
        // setPointerCapture はドラッグ確定後にのみ取得する。
        // ここで取得すると、軽いタップ時に pointerup/click が子要素(マシンマーカー)に
        // 届かなくなり、タッチ操作が一切効かないように見える。
      } else if (pointersRef.current.size === 2) {
        // 2本目が触れた瞬間にピンチ確定: 以降はドラッグ扱いせず、両点中心を基準にズーム
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[1].client.x - pts[0].client.x;
        const dy = pts[1].client.y - pts[0].client.y;
        const startDist = Math.hypot(dx, dy);
        const cx = (pts[0].client.x + pts[1].client.x) / 2;
        const cy = (pts[0].client.y + pts[1].client.y) / 2;
        pinchRef.current = {
          startDist: Math.max(1, startDist),
          startCenterSvg: screenToSvg(cx, cy),
          startZoom: zoom,
          startPan: pan,
        };
        dragRef.current = null;
        panBlockClickRef.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
    },
    [pan, screenToSvg, zoom],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ptr = pointersRef.current.get(e.pointerId);
      if (!ptr) return;
      ptr.client = { x: e.clientX, y: e.clientY };
      ptr.svg = screenToSvg(e.clientX, e.clientY);

      if (pointersRef.current.size >= 2 && pinchRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[1].client.x - pts[0].client.x;
        const dy = pts[1].client.y - pts[0].client.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const scale = dist / pinchRef.current.startDist;
        const nextZoom = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, pinchRef.current.startZoom * scale),
        );
        // 2点中心の SVG 座標を固定したまま zoom が変わるよう pan を補正
        const cx = (pts[0].client.x + pts[1].client.x) / 2;
        const cy = (pts[0].client.y + pts[1].client.y) / 2;
        const centerSvgNow = screenToSvg(cx, cy);
        const startCenter = pinchRef.current.startCenterSvg;
        const startPan = pinchRef.current.startPan;
        // 視覚的にピンチ中心が動かないように pan を微調整
        const nextPan = {
          x: startPan.x + (centerSvgNow.x - startCenter.x) * nextZoom,
          y: startPan.y + (centerSvgNow.y - startCenter.y) * nextZoom,
        };
        panBlockClickRef.current = true;
        setZoom(nextZoom);
        setPan(nextPan);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      const cur = ptr.svg;
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      if (!drag.moved && Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
      if (!drag.moved) {
        // 閾値を初めて超えた瞬間にキャプチャ取得（ドラッグ確定）
        drag.moved = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      panBlockClickRef.current = true;
      setPan({ x: drag.panAtStart.x + dx, y: drag.panAtStart.y + dy });
    },
    [screenToSvg],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = dragRef.current?.moved ?? false;
      const wasPinching = pinchRef.current !== null;
      pointersRef.current.delete(e.pointerId);

      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (pointersRef.current.size === 0) {
        dragRef.current = null;
      } else if (pointersRef.current.size === 1 && wasPinching) {
        // ピンチ→片手放しに移行した場合は残り1点を新たなドラッグ起点に
        const [last] = Array.from(pointersRef.current.values());
        dragRef.current = { startSvg: last.svg, panAtStart: pan, moved: false };
      }

      if (wasDragging || wasPinching) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      if (panBlockClickRef.current) {
        setTimeout(() => {
          panBlockClickRef.current = false;
        }, 0);
      }
    },
    [pan],
  );

  const center = OKAYAMA_TRACK_CENTER;
  const viewportTransform =
    `translate(${pan.x} ${pan.y}) ` +
    `translate(${center.x} ${center.y}) ` +
    `scale(${zoom}) rotate(${rotation}) ` +
    `translate(${-center.x} ${-center.y})`;

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing touch-pan-zoom ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        // touch-action: none をラッパー側に置くことで iOS Safari でも
        // ブラウザの既定ジェスチャ（パン/ピンチ）に奪われずポインタを受け取れる。
        // クラス touch-pan-zoom (globals.css) は子孫の SVG 要素にも touch-action: none を再適用する保険。
        touchAction: "none",
        WebkitUserSelect: "none",
      }}
    >
      <svg
        ref={svgRef}
        viewBox={OKAYAMA_TRACK_VIEWBOX}
        className="w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: "none", pointerEvents: "auto", display: "block" }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-strong">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={viewportTransform}>
          {/* 太いグレーの路面（スムージング済み一周） */}
          {geom && (
            <path
              d={geom.lapD}
              fill="none"
              stroke="#27272a"
              strokeWidth={TRACK_STROKE_WIDE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* セクター別カラーライン（スムージング済み・ワールド座標） */}
          {geom && (
            <>
              <path
                d={geom.sectorDs.s1}
                fill="none"
                stroke={SECTOR_COLORS.s1}
                strokeWidth={TRACK_STROKE_LINE}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
                filter="url(#glow)"
              />
              <path
                d={geom.sectorDs.s2}
                fill="none"
                stroke={SECTOR_COLORS.s2}
                strokeWidth={TRACK_STROKE_LINE}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
                filter="url(#glow)"
              />
              <path
                d={geom.sectorDs.s3}
                fill="none"
                stroke={SECTOR_COLORS.s3}
                strokeWidth={TRACK_STROKE_LINE}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
                filter="url(#glow)"
              />
            </>
          )}

          {/* セクター境界の横断ライン（FL / S1→S2 / S2→S3 すべて統一スタイル） */}
          {timing && (
            <>
              {boundaryCrossLine(timing.s1End, timing.s1EndTangent, "cross-s1")}
              {boundaryCrossLine(timing.s2End, timing.s2EndTangent, "cross-s2")}
            </>
          )}

          {/* FL（スタート/フィニッシュ）: 路面に白黒チェッカー帯 + コース外に緑クレセント＋FL ロゴ */}
          {timing && (() => {
            const fl = timing.fl;
            const tan = timing.flTangent;
            const angleDeg = (Math.atan2(tan.y, tan.x) * 180) / Math.PI;
            const halfBand = 22;
            const segH = 4;
            const segs = Math.max(2, Math.round((halfBand * 2) / segH));

            // FL ラインに直交する方向のうち、ラップ中心から離れる側（＝コース外側）を選ぶ
            const perpA = { x: tan.y, y: -tan.x };
            const dCOx = fl.x - center.x;
            const dCOy = fl.y - center.y;
            const sign = perpA.x * dCOx + perpA.y * dCOy >= 0 ? 1 : -1;
            const perpOut = { x: perpA.x * sign, y: perpA.y * sign };
            const labelDist = TIMING_LABEL_OFFSET + 14;
            const labelPos = {
              x: fl.x + perpOut.x * labelDist,
              y: fl.y + perpOut.y * labelDist,
            };
            return (
              <g key="fl-marker">
                <g transform={`translate(${fl.x} ${fl.y}) rotate(${angleDeg})`}>
                  <rect
                    x={-3.5}
                    y={-halfBand}
                    width={7}
                    height={halfBand * 2}
                    fill="#0a0a0a"
                  />
                  {Array.from({ length: segs }).map((_, i) => (
                    <rect
                      key={i}
                      x={-2.5}
                      y={-halfBand + i * segH}
                      width={5}
                      height={segH}
                      fill={i % 2 === 0 ? "#fafafa" : "#0a0a0a"}
                    />
                  ))}
                </g>
                {/* FL を視覚中心が labelPos に来るように左寄せ配置 */}
                <g transform={`translate(${labelPos.x} ${labelPos.y})`}>
                  <text
                    x={6}
                    y={1}
                    fill="#fafafa"
                    fontSize={18}
                    fontWeight={900}
                    fontFamily="sans-serif"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    style={{ paintOrder: "stroke" }}
                    stroke="#0a0a0a"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  >
                    FL
                  </text>
                </g>
              </g>
            );
          })()}

          {/* セクターラベル（位置は SECTOR_LABEL_POSITIONS で上書き可） */}
          {labelPositions && (
            <>
              <text
                x={labelPositions.s1.x}
                y={labelPositions.s1.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s1}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.75}
                filter="url(#glow)"
              >
                S1
              </text>
              <text
                x={labelPositions.s2.x}
                y={labelPositions.s2.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s2}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.75}
                filter="url(#glow)"
              >
                S2
              </text>
              <text
                x={labelPositions.s3.x}
                y={labelPositions.s3.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s3}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.75}
                filter="url(#glow)"
              >
                S3
              </text>
            </>
          )}

          {/* FL/S1/S2 の小ラベルは廃止（FL は上の独自デザイン、S1/S2 は横断ラインのみ） */}

          {/* マシンマーカー: 実位置ドット + リード線 + CARNO ラベル。
              集団でもラベルが重ならないよう declutter してから描画する。 */}
          {showCarMarkers && geom && (() => {
            const bounds = geom.bounds;
            const highlighted = highlightedTeamIds ?? new Set<string>();
            const hasHighlights = highlighted.size > 0;
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();

            // 1) 各車の実位置(ドット)を計算してマーカー候補を作る。
            const marks: LabelMark[] = [];
            for (const s of standings) {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) continue;

              // IN PIT はコースから消す（PitIn リストに表示）。
              if (s.status === "in_pit") {
                animRef.current.delete(s.teamId);
                continue;
              }

              // 実際の通過(Passing)がまだ無い車両は走行させない:
              //   - エントリーのみのプレースホルダー
              //   - グリッド/ピットスタートでまだ S1 等を通過していない車両
              //   - ピットアウトしていない車両
              // 通過があれば lastPassingTime>0、または区間通過(sectorNo>0)/周回(lap>0)で判定。
              // (これらだけでは 1 周目の走行車を消さない。)
              const hasPassed =
                (s.lastPassingTime != null && s.lastPassingTime > 0) ||
                s.sectorNo > 0 ||
                s.lap > 0;
              if (!hasPassed) {
                animRef.current.delete(s.teamId);
                continue;
              }

              // 停止/リタイア車は「走行中だった区間の終点=次の計測点」に固定表示する。
              const stopped = s.status === "stopped" || s.status === "retired";
              let t: number;
              if (stopped) {
                animRef.current.delete(s.teamId);
                t = segmentFor(s.sectorNo, bounds).target;
              } else {
                const seg = segmentFor(s.sectorNo, bounds);
                const legKey = s.lap * 4 + s.sectorNo; // (周,区間)が変わったら新レグ
                const prev = animRef.current.get(s.teamId);
                if (!prev || prev.leg !== legKey) {
                  // 新しい通過を検知した瞬間。直前レグの「実測壁時計 / 実秒推定」から
                  // 配信レートを推定し、平滑化しておく (加速再生でもマーカーが追従する)。
                  if (prev && prev.estMs > 0) {
                    const observed = (now - prev.startT) / prev.estMs;
                    if (observed > 0 && Number.isFinite(observed)) {
                      const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, observed));
                      rateRef.current =
                        rateRef.current * (1 - RATE_EMA) + clamped * RATE_EMA;
                    }
                  }
                  // 実秒ベースの推定移動時間は「1周前のその区間タイム」。未計測時のみ既定値。
                  const secTime = s.refSectors?.[seg.durIdx] ?? null;
                  const hasRef = secTime != null && secTime > 0;
                  const estMs = hasRef ? secTime / 10 : DEFAULT_SEG_MS[seg.durIdx];
                  // 基準タイムがあるときだけ配信レートを掛ける。
                  // 未計測時にレート(<1)を掛けるとデフォルトが更に短縮され高速に見える。
                  const rate = hasRef ? rateRef.current : 1;
                  const durMs = Math.max(MIN_DUR_MS, estMs * rate);
                  animRef.current.set(s.teamId, {
                    start: seg.start,
                    target: seg.target,
                    startT: now,
                    durMs,
                    estMs,
                    leg: legKey,
                  });
                }
                const a = animRef.current.get(s.teamId)!;
                const p = Math.max(0, Math.min(1, (now - a.startT) / a.durMs));
                t = a.start + (a.target - a.start) * p;
                if (t >= 1) t -= 1;
              }
              const { x, y } =
                samples.length >= 2 ? pointOnLapSamples(samples, t) : { x: 800, y: 400 };

              const isHi = highlighted.has(s.teamId);
              const noStr = String(team.no);
              const labelH = LABEL_H * markerScale;
              const labelW = (LABEL_PAD_X * 2 + noStr.length * LABEL_CHAR_W) * markerScale;
              marks.push({
                s,
                team,
                noStr,
                x,
                y,
                lx: x,
                ly: y - labelH * 1.6, // 初期はドットの少し上にラベルを置く
                labelW,
                labelH,
                fill: cls?.color || "#71717a",
                isHi,
                dimmed: hasHighlights && !isHi,
                stopped,
              });
            }

            // 2) ラベルの重なりを回避（集団でも CARNO が読めるように）。
            declutterLabels(marks, markerScale);

            // 3) 描画（ハイライトを前面に）。
            const ordered = [...marks].sort((a, b) => (a.isHi ? 1 : 0) - (b.isHi ? 1 : 0));
            return ordered.map((m) => {
              const { s, team, noStr, x, y, lx, ly, labelW, labelH, fill, isHi, dimmed, stopped } = m;
              const dotR = DOT_R * markerScale * (isHi ? 1.25 : 1);
              const fontSize = LABEL_FONT * markerScale * (isHi ? 1.1 : 1);
              // ラベルは常に正立（親の回転を打ち消す）。ドット/リード線は地図と一緒に回る。
              const counter = rotation % 360 !== 0 ? `rotate(${-rotation} ${lx} ${ly})` : undefined;
              return (
                <g
                  key={s.teamId}
                  filter={isHi ? "url(#glow-strong)" : undefined}
                  style={{ cursor: onMarkerClick ? "pointer" : undefined }}
                  onClick={
                    onMarkerClick
                      ? () => {
                          if (panBlockClickRef.current) return;
                          onMarkerClick(s.teamId);
                        }
                      : undefined
                  }
                >
                  {/* ハイライト時: 実位置ドットにパルスリング */}
                  {isHi && (
                    <circle cx={x} cy={y} r={dotR + 4} fill="none" stroke={fill} strokeWidth="2" opacity="0.4">
                      <animate attributeName="r" values={`${dotR + 2};${dotR + 9};${dotR + 2}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* リード線: 実位置(ドット) → ラベル */}
                  <line
                    x1={x}
                    y1={y}
                    x2={lx}
                    y2={ly}
                    stroke={fill}
                    strokeWidth={1.2 * markerScale}
                    opacity={dimmed ? 0.2 : 0.65}
                  />
                  {/* 実位置ドット */}
                  <circle
                    cx={x}
                    cy={y}
                    r={dotR}
                    fill={fill}
                    stroke={stopped ? "#f87171" : "#000"}
                    strokeWidth={1}
                    opacity={dimmed ? 0.35 : 1}
                  />
                  {/* CARNO ラベル（丸み帯びた四角・正立） */}
                  <g transform={counter}>
                    <rect
                      x={lx - labelW / 2}
                      y={ly - labelH / 2}
                      width={labelW}
                      height={labelH}
                      rx={labelH * 0.3}
                      ry={labelH * 0.3}
                      fill={fill}
                      opacity={dimmed ? 0.3 : stopped ? 0.7 : 0.95}
                      stroke={stopped ? "#f87171" : isHi ? "#fff" : "#000"}
                      strokeWidth={stopped ? 2 : isHi ? 1.5 : 1}
                      strokeDasharray={stopped ? "3 2" : undefined}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={fontSize}
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      opacity={dimmed ? 0.4 : 1}
                      stroke="#000"
                      strokeWidth={fontSize * 0.22}
                      strokeLinejoin="round"
                      style={{ paintOrder: "stroke" }}
                    >
                      {noStr}
                    </text>
                    {isHi && (
                      <g>
                        <rect
                          x={lx + labelW / 2 + 4}
                          y={ly - 9}
                          width={Math.max(team.nameE.length * 5.5, 80)}
                          height="18"
                          rx="3"
                          fill="#18181b"
                          stroke={fill}
                          strokeWidth="1"
                          opacity="0.9"
                        />
                        <text x={lx + labelW / 2 + 8} y={ly + 1} fill="#e4e4e7" fontSize="9" fontWeight="bold" fontFamily="sans-serif" dominantBaseline="middle">
                          {team.nameE}
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              );
            });
          })()}
        </g>
      </svg>

      <div className="absolute top-2 left-2 flex flex-col gap-1.5 select-none z-10">
        <div className="flex flex-col bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 rounded-md overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoom >= ZOOM_MAX - 1e-3}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg font-semibold transition-colors"
            aria-label="Zoom in"
            title="拡大"
          >
            +
          </button>
          <div className="text-center text-[10px] text-zinc-500 font-mono py-0.5 border-y border-zinc-700/60">
            {(zoom * 100).toFixed(0)}%
          </div>
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoom <= ZOOM_MIN + 1e-3}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg font-semibold transition-colors"
            aria-label="Zoom out"
            title="縮小"
          >
            −
          </button>
        </div>

        <div className="flex flex-col bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 rounded-md overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={onRotateLeft}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 text-base transition-colors"
            aria-label="Rotate left"
            title="左回転"
          >
            ⟲
          </button>
          <div className="text-center text-[10px] text-zinc-500 font-mono py-0.5 border-y border-zinc-700/60">
            {((((rotation % 360) + 360) % 360)).toFixed(0)}°
          </div>
          <button
            type="button"
            onClick={onRotateRight}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 text-base transition-colors"
            aria-label="Rotate right"
            title="右回転"
          >
            ⟳
          </button>
        </div>

        {/* 車番アイコン（サークル/ラベル）のサイズ調整 */}
        <div className="flex flex-col bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 rounded-md overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={onMarkerBigger}
            disabled={markerScale >= MARKER_SCALE_MAX - 1e-3}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Enlarge car icons"
            title="車番アイコンを拡大"
          >
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-zinc-200" />
          </button>
          <div className="text-center text-[10px] text-zinc-500 font-mono py-0.5 border-y border-zinc-700/60">
            {(markerScale * 100).toFixed(0)}%
          </div>
          <button
            type="button"
            onClick={onMarkerSmaller}
            disabled={markerScale <= MARKER_SCALE_MIN + 1e-3}
            className="w-9 h-9 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Shrink car icons"
            title="車番アイコンを縮小"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-200" />
          </button>
        </div>

        <button
          type="button"
          onClick={onReset}
          disabled={zoom === ZOOM_DEFAULT && rotation === 0 && pan.x === 0 && pan.y === 0 && markerScale === MARKER_SCALE_DEFAULT}
          className="w-9 h-7 flex items-center justify-center text-[10px] font-semibold rounded-md bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg transition-colors"
          aria-label="Reset view"
          title="リセット"
        >
          RESET
        </button>
      </div>
    </div>
  );
}
