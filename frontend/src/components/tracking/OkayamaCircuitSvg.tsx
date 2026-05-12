"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * 各セクター（Sec1/Sec2/Sec3）はジオメトリ側でサンプリング＋Chaikin スムージング済みの
 * `d` を `geom.sectorDs` で受け取り、ワールド座標のままレンダリングする。マシンマーカーは
 * 同じくスムージング済みの `lapD` に沿って動く。ズームと回転は viewBox 中心を基準に <g> で適用。
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import {
  OKAYAMA_TRACK_CENTER,
  OKAYAMA_TRACK_VIEWBOX,
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

const TRACK_STROKE_WIDE = 38;
const TRACK_STROKE_LINE = 9;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;
const ZOOM_DEFAULT = 1.5;
const ROTATE_STEP = 15;
const PAN_DRAG_THRESHOLD = 4;

function sectorDashThrough(p: Vec2, color: string, key: string) {
  const len = 18;
  return (
    <line
      key={key}
      x1={p.x - len}
      y1={p.y - len * 0.35}
      x2={p.x + len}
      y2={p.y + len * 0.35}
      stroke={color}
      strokeWidth="2.5"
      opacity={0.85}
      strokeDasharray="3 2"
    />
  );
}

function flControlLine(timing: OkayamaLapGeometry["timing"]): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const { fl, flTangent } = timing;
  const nx = -flTangent.y * 22;
  const ny = flTangent.x * 22;
  return { x1: fl.x - nx, y1: fl.y - ny, x2: fl.x + nx, y2: fl.y + ny };
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
  const [geom, setGeom] = useState<OkayamaLapGeometry | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    startSvg: Vec2;
    panAtStart: Vec2;
    moved: boolean;
  } | null>(null);
  const panBlockClickRef = useRef(false);

  useLayoutEffect(() => {
    setGeom(buildOkayamaLapGeometry());
  }, []);

  const timing = geom?.timing;
  const samples = geom?.samples ?? [];
  const sectorCenters = geom?.sectorLabelCenters;
  const flLine = timing ? flControlLine(timing) : null;

  const onZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP));
  const onZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP));
  const onRotateLeft = () => setRotation((r) => r - ROTATE_STEP);
  const onRotateRight = () => setRotation((r) => r + ROTATE_STEP);
  const onReset = () => {
    setZoom(ZOOM_DEFAULT);
    setRotation(0);
    setPan({ x: 0, y: 0 });
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const start = screenToSvg(e.clientX, e.clientY);
      dragRef.current = { startSvg: start, panAtStart: pan, moved: false };
      panBlockClickRef.current = false;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [pan, screenToSvg],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const cur = screenToSvg(e.clientX, e.clientY);
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      if (!drag.moved && Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
      drag.moved = true;
      panBlockClickRef.current = true;
      setPan({ x: drag.panAtStart.x + dx, y: drag.panAtStart.y + dy });
    },
    [screenToSvg],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      dragRef.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      if (panBlockClickRef.current) {
        setTimeout(() => {
          panBlockClickRef.current = false;
        }, 0);
      }
    },
    [],
  );

  const center = OKAYAMA_TRACK_CENTER;
  const viewportTransform =
    `translate(${pan.x} ${pan.y}) ` +
    `translate(${center.x} ${center.y}) ` +
    `scale(${zoom}) rotate(${rotation}) ` +
    `translate(${-center.x} ${-center.y})`;

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <svg
        ref={svgRef}
        viewBox={OKAYAMA_TRACK_VIEWBOX}
        className="w-full h-full select-none touch-none"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
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

          {/* スタート/フィニッシュ コントロールライン */}
          {flLine && (
            <line
              x1={flLine.x1}
              y1={flLine.y1}
              x2={flLine.x2}
              y2={flLine.y2}
              stroke="#ffffff"
              strokeWidth="3"
              opacity={0.95}
            />
          )}

          {/* セクター切れ目のミニライン */}
          {timing && (
            <>
              {sectorDashThrough(timing.s1End, SECTOR_COLORS.s1, "dash-s1")}
              {sectorDashThrough(timing.s2End, SECTOR_COLORS.s2, "dash-s2")}
            </>
          )}

          {/* セクターラベル */}
          {sectorCenters && (
            <>
              <text
                x={sectorCenters.s1.x}
                y={sectorCenters.s1.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s1}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.7}
                filter="url(#glow)"
              >
                S1
              </text>
              <text
                x={sectorCenters.s2.x}
                y={sectorCenters.s2.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s2}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.7}
                filter="url(#glow)"
              >
                S2
              </text>
              <text
                x={sectorCenters.s3.x}
                y={sectorCenters.s3.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={SECTOR_COLORS.s3}
                fontSize="22"
                fontWeight="bold"
                fontFamily="sans-serif"
                opacity={0.7}
                filter="url(#glow)"
              >
                S3
              </text>
            </>
          )}

          {/* タイミング点ラベル（FL / S1 / S2） */}
          {timing &&
            [
              { p: timing.fl, label: "FL" },
              { p: timing.s1End, label: "S1" },
              { p: timing.s2End, label: "S2" },
            ].map(({ p, label }) => (
              <g key={label}>
                <rect
                  x={p.x - 12}
                  y={p.y - 22}
                  width="24"
                  height="14"
                  rx="2"
                  fill="#18181b"
                  stroke="#f59e0b"
                  strokeWidth="1"
                  opacity={0.9}
                />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#f59e0b"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {label}
                </text>
              </g>
            ))}

          {/* マシンマーカー（ラップ上に等間隔配置） */}
          {showCarMarkers && (() => {
            const total = standings.length;
            const highlighted = highlightedTeamIds ?? new Set<string>();
            const hasHighlights = highlighted.size > 0;

            const sorted = [...standings].sort((a, b) => {
              const aH = highlighted.has(a.teamId) ? 1 : 0;
              const bH = highlighted.has(b.teamId) ? 1 : 0;
              return aH - bH;
            });

            return sorted.map((s) => {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) return null;

              const origIdx = standings.findIndex((st) => st.teamId === s.teamId);
              const t = total > 1 ? origIdx / total : 0;
              const { x, y } =
                samples.length >= 2 ? pointOnLapSamples(samples, t) : { x: 800, y: 400 };

              const isHighlighted = highlighted.has(s.teamId);
              const fillColor = cls?.color || "#71717a";
              const dimmed = hasHighlights && !isHighlighted;
              const r = isHighlighted ? 16 : 12;

              return (
                <g
                  key={s.teamId}
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
                    fontSize={isHighlighted ? 11 : 9}
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

        <button
          type="button"
          onClick={onReset}
          disabled={zoom === ZOOM_DEFAULT && rotation === 0 && pan.x === 0 && pan.y === 0}
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
