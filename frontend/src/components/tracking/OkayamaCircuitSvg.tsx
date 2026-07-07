"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * 各セクター（Sec1/Sec2/Sec3）はジオメトリ側でサンプリング＋Chaikin スムージング済みの
 * `d` を `geom.sectorDs` で受け取り、ワールド座標のままレンダリングする。マシンマーカーは
 * 同じくスムージング済みの `lapD` に沿って動く。ズームと回転は viewBox 中心を基準に <g> で適用。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Standing } from "@/types/smis";
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

// 岡山のセクター境界 (Loop 長 / 全長 3703m): S1末=962m(0.26) / S2末=2520m(0.68) / 一周=1.0。
const BOUND_CL = 0.0;
const BOUND_S1 = 0.2598;
const BOUND_S2 = 0.6805;
const BOUND_LAP = 1.0;
/** 区間ごとの既定移動時間(ms)。区間タイム未取得時のフォールバック。 */
const DEFAULT_SEG_MS = [22000, 42000, 33000];

/**
 * sectorNo から「今いる区間の始点/終点/移動に使う区間index」を返す。
 * SectorNo は直近で通過した計測点: 1=S1通過(→S2走行), 2=S2通過(→S3走行), 3/0=CL通過(→S1走行)。
 */
function segmentFor(sectorNo: number): { start: number; target: number; durIdx: number } {
  switch (sectorNo) {
    case 1:
      return { start: BOUND_S1, target: BOUND_S2, durIdx: 1 }; // S2 を走行
    case 2:
      return { start: BOUND_S2, target: BOUND_LAP, durIdx: 2 }; // S3 を走行
    default: // 3 or 0
      return { start: BOUND_CL, target: BOUND_S1, durIdx: 0 }; // S1 を走行
  }
}

interface CarAnim {
  start: number;
  target: number;
  startT: number;
  durMs: number;
  leg: number;
}

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
const MARKER_SCALE_DEFAULT = 1;

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
  // ジオメトリは純粋関数（SSR 時は document が無く null）なので useMemo で導出する。
  // （useEffect + setState はカスケード再レンダーを誘発するため避ける）
  const geom = useMemo<OkayamaLapGeometry | null>(
    () => buildOkayamaLapGeometry(),
    [],
  );
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  const [markerScale, setMarkerScale] = useState(MARKER_SCALE_DEFAULT);

  // 車両アニメーション: teamId ごとに「現区間の始点→終点を区間タイムかけて移動」する状態を保持し、
  // requestAnimationFrame で毎フレーム再描画する。
  const animRef = useRef<Map<string, CarAnim>>(new Map());
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

          {/* マシンマーカー（sectorNo からコース位置を推定して配置） */}
          {showCarMarkers && (() => {
            const highlighted = highlightedTeamIds ?? new Set<string>();
            const hasHighlights = highlighted.size > 0;

            const sorted = [...standings].sort((a, b) => {
              const aH = highlighted.has(a.teamId) ? 1 : 0;
              const bH = highlighted.has(b.teamId) ? 1 : 0;
              return aH - bH;
            });

            const now = typeof performance !== "undefined" ? performance.now() : Date.now();

            return sorted.map((s) => {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) return null;

              // IN PIT の車両はコース上から消す（トラッキングページの PitIn リストに表示する）。
              if (s.status === "in_pit") {
                animRef.current.delete(s.teamId);
                return null;
              }

              // 区間通過に応じてアニメーションのレグ(始点→終点)を更新する。
              // 移動時間は「直近の該当区間タイム」(sectors[durIdx]) を採用。
              let t: number;
              {
                const seg = segmentFor(s.sectorNo);
                const legKey = s.lap * 4 + s.sectorNo; // (周,区間)が変わったら新レグ
                const prev = animRef.current.get(s.teamId);
                if (!prev || prev.leg !== legKey) {
                  // 移動時間は「その区間で最後に計測したタイム」を採用 (前回最新通過タイム)。
                  const secTime = s.refSectors?.[seg.durIdx] ?? null;
                  const durMs = secTime && secTime > 0 ? secTime / 10 : DEFAULT_SEG_MS[seg.durIdx];
                  animRef.current.set(s.teamId, {
                    start: seg.start,
                    target: seg.target,
                    startT: now,
                    durMs,
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

              const isHighlighted = highlighted.has(s.teamId);
              const fillColor = cls?.color || "#71717a";
              const dimmed = hasHighlights && !isHighlighted;
              const r = (isHighlighted ? 16 : 12) * markerScale;
              const labelFont = (isHighlighted ? 11 : 9) * markerScale;

              // 位置は親 <g> の回転で地図と一緒に動くが、番号ラベルは常に正立させたい。
              // マーカー中心 (x,y) を軸に親の回転を打ち消す逆回転をかける。
              const counterRotate = rotation % 360 !== 0 ? `rotate(${-rotation} ${x} ${y})` : undefined;

              return (
                <g
                  key={s.teamId}
                  transform={counterRotate}
                  filter={isHighlighted ? "url(#glow-strong)" : undefined}
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
                  {isHighlighted && (
                    <circle cx={x} cy={y} r={r + 5} fill="none" stroke={fillColor} strokeWidth="2" opacity="0.4">
                      <animate attributeName="r" values={`${r + 2};${r + 10};${r + 2}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={fillColor}
                    opacity={dimmed ? 0.3 : 0.95}
                    stroke={isHighlighted ? "#fff" : "#000"}
                    strokeWidth={isHighlighted ? 2 : 1}
                  />
                  <text
                    x={x}
                    y={y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={labelFont}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    opacity={dimmed ? 0.4 : 1}
                  >
                    {team.no}
                  </text>
                  {isHighlighted && (
                    <g>
                      <rect
                        x={x + r + 4}
                        y={y - 14}
                        width={Math.max(team.nameE.length * 5.5, 80)}
                        height="18"
                        rx="3"
                        fill="#18181b"
                        stroke={fillColor}
                        strokeWidth="1"
                        opacity="0.9"
                      />
                      <text x={x + r + 8} y={y - 4} fill="#e4e4e7" fontSize="9" fontWeight="bold" fontFamily="sans-serif">
                        {team.nameE}
                      </text>
                    </g>
                  )}
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
