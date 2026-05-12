"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * 各セクターは独立した座標系で書き出されているため、`TRACK_OFFSETS` に従って
 * `<g transform>` でワールド座標に配置し、コース全体のレイアウトを構成する。
 * マシンマーカーは Sec1 → Sec2 → Sec3 を結合した `lapD`（`okayamaTrackGeometry`）に沿う。
 */

import { useLayoutEffect, useState } from "react";
import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import {
  OKAYAMA_TRACK_VIEWBOX,
  TRACK_OFFSETS,
  TRACK_PATH_PIT_IN,
  TRACK_PATH_S1,
  TRACK_PATH_S2,
  TRACK_PATH_S3,
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
  pit: "#a1a1aa",
};

/** PIT OUT ラベル近似位置（ラップ上の正規化距離。レイアウト調整用） */
const PIT_OUT_LAP_T = 0.92;

const TRACK_STROKE_WIDE = 36;
const TRACK_STROKE_LINE = 8;

function offsetTransform(o: Vec2): string {
  return `translate(${o.x}, ${o.y})`;
}

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

  useLayoutEffect(() => {
    setGeom(buildOkayamaLapGeometry());
  }, []);

  const timing = geom?.timing;
  const samples = geom?.samples ?? [];
  const sectorCenters = geom?.sectorLabelCenters;
  const pitInCenter = geom?.pitInCenter ?? { x: 760, y: 700 };
  const pitOutLabelPos = geom
    ? pointOnLapSamples(geom.samples, PIT_OUT_LAP_T)
    : { x: 400, y: 760 };

  const flLine = timing ? flControlLine(timing) : null;

  return (
    <svg
      viewBox={OKAYAMA_TRACK_VIEWBOX}
      className={`w-full h-full ${className}`}
      preserveAspectRatio="xMidYMid meet"
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

      {/* 太いグレーの路面（ワールド座標で結合した一周） */}
      {geom ? (
        <path
          d={geom.lapD}
          fill="none"
          stroke="#27272a"
          strokeWidth={TRACK_STROKE_WIDE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* セクター別カラーラインを各 SVG のオフセットで配置 */}
      <g transform={offsetTransform(TRACK_OFFSETS.s1)}>
        <path
          d={TRACK_PATH_S1}
          fill="none"
          stroke={SECTOR_COLORS.s1}
          strokeWidth={TRACK_STROKE_LINE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.92}
          filter="url(#glow)"
        />
      </g>
      <g transform={offsetTransform(TRACK_OFFSETS.s2)}>
        <path
          d={TRACK_PATH_S2}
          fill="none"
          stroke={SECTOR_COLORS.s2}
          strokeWidth={TRACK_STROKE_LINE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.92}
          filter="url(#glow)"
        />
      </g>
      <g transform={offsetTransform(TRACK_OFFSETS.s3)}>
        <path
          d={TRACK_PATH_S3}
          fill="none"
          stroke={SECTOR_COLORS.s3}
          strokeWidth={TRACK_STROKE_LINE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.92}
          filter="url(#glow)"
        />
      </g>

      {/* ピットレーン（点線） */}
      <g transform={offsetTransform(TRACK_OFFSETS.pitIn)}>
        <path
          d={TRACK_PATH_PIT_IN}
          fill="none"
          stroke={SECTOR_COLORS.pit}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
          strokeDasharray="6 4"
        />
      </g>

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

      {/* ピット系ラベル */}
      <text
        x={pitInCenter.x + 200}
        y={pitInCenter.y - 18}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="11"
        fontFamily="sans-serif"
        opacity={0.55}
        fontWeight="600"
        letterSpacing="2"
      >
        PIT LANE
      </text>
      <text
        x={pitInCenter.x + 220}
        y={pitInCenter.y + 16}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="10"
        fontFamily="sans-serif"
        opacity={0.6}
      >
        PIT IN
      </text>
      <text
        x={pitOutLabelPos.x}
        y={pitOutLabelPos.y - 14}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="10"
        fontFamily="sans-serif"
        opacity={0.6}
      >
        PIT OUT
      </text>

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
              onClick={onMarkerClick ? () => onMarkerClick(s.teamId) : undefined}
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
    </svg>
  );
}
