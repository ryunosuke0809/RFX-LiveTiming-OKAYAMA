"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * セクター境界は書き出し SVG（S1/S2/S3）に準拠。一周ラップはクライアントで結合したパスを
 * サンプリングし、マーカーをそのライン上に配置する。
 */

import { useLayoutEffect, useState } from "react";
import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import {
  OKAYAMA_TRACK_VIEWBOX,
  TRACK_PATH_PIT_IN,
  TRACK_PATH_S1,
  TRACK_PATH_S2,
  TRACK_PATH_S3,
  TRACK_SECTOR_PATHS,
} from "@/lib/okayamaTrackAsset";
import {
  buildOkayamaLapGeometry,
  pointOnLapSamples,
  type OkayamaLapGeometry,
  type Vec2,
} from "@/lib/okayamaTrackGeometry";

const SECTOR_COLORS = {
  s1: "#3b82f6",
  s2: "#ef4444",
  s3: "#22c55e",
  pit: "#a1a1aa",
};

/** PIT OUT ラベル近似位置（ラップ上の正規化距離。レイアウト調整用） */
const PIT_OUT_LAP_T = 0.82;

const TRACK_STROKE_WIDE = 32;
const TRACK_STROKE_LINE = 7;

function sectorDashThrough(p: Vec2, color: string, key: string) {
  const len = 14;
  return (
    <line
      key={key}
      x1={p.x - len}
      y1={p.y - len * 0.35}
      x2={p.x + len}
      y2={p.y + len * 0.35}
      stroke={color}
      strokeWidth="2"
      opacity={0.75}
      strokeDasharray="3 2"
    />
  );
}

function flControlLine(timing: OkayamaLapGeometry["timing"]): { x1: number; y1: number; x2: number; y2: number } {
  const { fl, flTangent } = timing;
  const nx = (-flTangent.y) * 18;
  const ny = flTangent.x * 18;
  return {
    x1: fl.x - nx,
    y1: fl.y - ny,
    x2: fl.x + nx,
    y2: fl.y + ny,
  };
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
    setGeom(buildOkayamaLapGeometry(TRACK_SECTOR_PATHS));
  }, []);

  const timing = geom?.timing;
  const samples = geom?.samples ?? [];
  const sectorCenters = geom?.sectorLabelCenters;
  const pitInCenter = geom?.pitInCenter ?? { x: 280, y: 70 };
  const pitOutLabelPos = geom ? pointOnLapSamples(geom.samples, PIT_OUT_LAP_T) : { x: 400, y: 500 };

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

      <path
        d={TRACK_PATH_S1}
        fill="none"
        stroke="#27272a"
        strokeWidth={TRACK_STROKE_WIDE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={TRACK_PATH_S2}
        fill="none"
        stroke="#27272a"
        strokeWidth={TRACK_STROKE_WIDE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={TRACK_PATH_S3}
        fill="none"
        stroke="#27272a"
        strokeWidth={TRACK_STROKE_WIDE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d={TRACK_PATH_S1}
        fill="none"
        stroke={SECTOR_COLORS.s1}
        strokeWidth={TRACK_STROKE_LINE}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.88}
        filter="url(#glow)"
      />
      <path
        d={TRACK_PATH_S2}
        fill="none"
        stroke={SECTOR_COLORS.s2}
        strokeWidth={TRACK_STROKE_LINE}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.88}
        filter="url(#glow)"
      />
      <path
        d={TRACK_PATH_S3}
        fill="none"
        stroke={SECTOR_COLORS.s3}
        strokeWidth={TRACK_STROKE_LINE}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.88}
        filter="url(#glow)"
      />

      <path
        d={TRACK_PATH_PIT_IN}
        fill="none"
        stroke="#27272a"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

      {flLine && (
        <line
          x1={flLine.x1}
          y1={flLine.y1}
          x2={flLine.x2}
          y2={flLine.y2}
          stroke="#ffffff"
          strokeWidth="2.5"
          opacity={0.95}
        />
      )}

      {timing && (
        <>
          {sectorDashThrough(timing.s1End, SECTOR_COLORS.s1, "dash-s1")}
          {sectorDashThrough(timing.s2End, SECTOR_COLORS.s2, "dash-s2")}
        </>
      )}

      {sectorCenters && (
        <>
          <text
            x={sectorCenters.s1.x}
            y={sectorCenters.s1.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={SECTOR_COLORS.s1}
            fontSize="18"
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
            fontSize="18"
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
            fontSize="18"
            fontWeight="bold"
            fontFamily="sans-serif"
            opacity={0.7}
            filter="url(#glow)"
          >
            S3
          </text>
        </>
      )}

      {timing &&
        [
          { p: timing.fl, label: "FL" },
          { p: timing.s1End, label: "S1" },
          { p: timing.s2End, label: "S2" },
        ].map(({ p, label }) => (
          <g key={label}>
            <rect
              x={p.x - 10}
              y={p.y - 18}
              width="20"
              height="12"
              rx="2"
              fill="#18181b"
              stroke="#f59e0b"
              strokeWidth="1"
              opacity={0.9}
            />
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#f59e0b"
              fontSize="7"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              {label}
            </text>
          </g>
        ))}

      <text
        x={(sectorCenters?.s2.x ?? 600) + 40}
        y={(sectorCenters?.s2.y ?? 400) + 80}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="9"
        fontFamily="sans-serif"
        opacity={0.5}
        fontWeight="600"
        letterSpacing="2"
      >
        PIT LANE
      </text>

      <text
        x={pitInCenter.x}
        y={pitInCenter.y + 16}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="8"
        fontFamily="sans-serif"
        opacity={0.55}
      >
        PIT IN
      </text>
      <text
        x={pitOutLabelPos.x}
        y={pitOutLabelPos.y - 10}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="8"
        fontFamily="sans-serif"
        opacity={0.55}
      >
        PIT OUT
      </text>

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
            samples.length >= 2 ? pointOnLapSamples(samples, t) : { x: 600, y: 315 };

          const isHighlighted = highlighted.has(s.teamId);
          const fillColor = cls?.color || "#71717a";
          const dimmed = hasHighlights && !isHighlighted;
          const r = isHighlighted ? 13 : 9;

          return (
            <g
              key={s.teamId}
              filter={isHighlighted ? "url(#glow-strong)" : undefined}
              style={{ cursor: onMarkerClick ? "pointer" : undefined }}
              onClick={onMarkerClick ? () => onMarkerClick(s.teamId) : undefined}
            >
              {isHighlighted && (
                <circle cx={x} cy={y} r={r + 4} fill="none" stroke={fillColor} strokeWidth="2" opacity="0.4">
                  <animate attributeName="r" values={`${r + 2};${r + 8};${r + 2}`} dur="2s" repeatCount="indefinite" />
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
                fontSize={isHighlighted ? 9 : 7}
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
                    width={Math.max(team.nameE.length * 4.5, 60)}
                    height="16"
                    rx="3"
                    fill="#18181b"
                    stroke={fillColor}
                    strokeWidth="1"
                    opacity="0.9"
                  />
                  <text x={x + r + 8} y={y - 5} fill="#e4e4e7" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
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
