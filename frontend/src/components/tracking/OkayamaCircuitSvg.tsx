"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * 向き: 衛星図と同じ（上が北、下側がメイン／ピットストレート、時計回り）。
 * S1〜S3 はオーバーレイ（S1=青・S2=赤・S3=緑）に沿った概形。精密な座標は /dev/circuit-map-editor で再トレース可。
 *
 * 将来: getPointAtLength() で車両マーカーをパス上に配置・移動
 */

import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

// --- セクター色（衛星オーバーレイと対応）---
const SECTOR_COLORS = {
  s1: "#3b82f6",
  s2: "#ef4444",
  s3: "#22c55e",
  pit: "#a1a1aa",
};

function stripLeadingMove(d: string): string {
  return d.replace(/^M\s+[\d.]+\s+[\d.]+\s+/, "");
}

// --- SVG パス（viewBox 0 0 1000 560）時計回り: FL → 西へメイン直線 → 左の大回り → 上のバックストレート → 右ヘアピン手前まで S1 ---

const PATH_S1 =
  "M 545 508 L 480 510 L 380 508 L 280 502 L 200 490 L 145 460 L 105 415 L 78 360 L 62 300 L 65 235 L 88 175 L 135 125 L 205 88 L 295 68 L 410 65 L 530 75 L 650 95 L 750 130 L 820 175 L 865 225 L 882 275 L 878 312";

const PATH_S2 =
  "M 878 312 L 900 345 L 910 395 L 895 445 L 855 485 L 780 510 L 680 522 L 580 526 L 520 528";

const PATH_S3 =
  "M 520 528 L 680 524 L 840 515 L 928 498 L 968 455 L 982 395 L 962 328 L 900 268 L 805 235 L 695 228 L 582 248 L 478 298 L 402 365 L 372 430 L 398 488 L 475 508 L 545 508";

const PATH_PIT =
  "M 798 490 L 640 478 L 520 466 L 400 472 L 242 476 L 222 488";

const FL_POINT = { x: 545, y: 508 };
const PIT_IN_POINT = { x: 798, y: 490 };
const PIT_OUT_POINT = { x: 222, y: 488 };

/** S1 終端 = S2 始端（右ヘアピン手前） */
const S1_END = { x: 878, y: 312 };
/** S2 終端 = S3 始端（メインストレート上） */
const S2_END = { x: 520, y: 528 };

/** 全周ラップ用 1 path（M/L のみ想定） */
export const PATH_FULL_CIRCUIT = `${PATH_S1} ${stripLeadingMove(PATH_S2)} ${stripLeadingMove(PATH_S3)}`;

type XY = { x: number; y: number };

function parseMlPath(d: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const m of d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)) {
    pts.push([Number(m[1]), Number(m[2])]);
  }
  return pts;
}

const MOCK_LAP_POINTS = parseMlPath(PATH_FULL_CIRCUIT);

function mockPointOnLap(t: number): XY {
  const pts = MOCK_LAP_POINTS;
  if (pts.length < 2) return { x: 500, y: 280 };
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push(len);
    total += len;
  }
  if (total < 1e-6) return { x: pts[0][0], y: pts[0][1] };
  let dist = (((t % 1) + 1) % 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] + 1e-9) {
      const len = segs[i];
      const ratio = len < 1e-6 ? 0 : dist / len;
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      return { x: x1 + (x2 - x1) * ratio, y: y1 + (y2 - y1) * ratio };
    }
    dist -= segs[i];
  }
  const [x, y] = pts[pts.length - 1];
  return { x, y };
}

/** FL 付近の接線に垂直なコントロールライン */
function flControlLine(): { x1: number; y1: number; x2: number; y2: number } {
  const pts = parseMlPath(PATH_S1);
  const p1 = pts[0] ?? [FL_POINT.x, FL_POINT.y];
  const p2 = pts[1] ?? p1;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 18;
  const ny = (dx / len) * 18;
  return {
    x1: FL_POINT.x - nx,
    y1: FL_POINT.y - ny,
    x2: FL_POINT.x + nx,
    y2: FL_POINT.y + ny,
  };
}

function sectorDashThrough(p: XY, color: string, key: string) {
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

const SECTOR_LABELS = [
  { x: 480, y: 118, label: "S1", color: SECTOR_COLORS.s1 },
  { x: 918, y: 338, label: "S2", color: SECTOR_COLORS.s2 },
  { x: 780, y: 468, label: "S3", color: SECTOR_COLORS.s3 },
];

const TIMING_POINTS: { x: number; y: number; label: string }[] = [
  { x: FL_POINT.x, y: FL_POINT.y, label: "FL" },
  { x: S1_END.x, y: S1_END.y, label: "S1" },
  { x: S2_END.x, y: S2_END.y, label: "S2" },
];

const flLine = flControlLine();

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
  return (
    <svg
      viewBox="0 0 1000 560"
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

      <path d={PATH_S1} fill="none" stroke="#27272a" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_S2} fill="none" stroke="#27272a" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_S3} fill="none" stroke="#27272a" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />

      <path d={PATH_S1} fill="none" stroke={SECTOR_COLORS.s1} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" filter="url(#glow)" />
      <path d={PATH_S2} fill="none" stroke={SECTOR_COLORS.s2} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" filter="url(#glow)" />
      <path d={PATH_S3} fill="none" stroke={SECTOR_COLORS.s3} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" filter="url(#glow)" />

      <path d={PATH_PIT} fill="none" stroke="#27272a" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_PIT} fill="none" stroke={SECTOR_COLORS.pit} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" strokeDasharray="6 4" />

      <line
        x1={flLine.x1}
        y1={flLine.y1}
        x2={flLine.x2}
        y2={flLine.y2}
        stroke="#ffffff"
        strokeWidth="2.5"
        opacity="0.95"
      />

      {sectorDashThrough(S1_END, SECTOR_COLORS.s1, "dash-s1")}
      {sectorDashThrough(S2_END, SECTOR_COLORS.s2, "dash-s2")}

      {SECTOR_LABELS.map((s) => (
        <text
          key={s.label}
          x={s.x}
          y={s.y}
          textAnchor="middle"
          fill={s.color}
          fontSize="18"
          fontWeight="bold"
          fontFamily="sans-serif"
          opacity="0.7"
          filter="url(#glow)"
        >
          {s.label}
        </text>
      ))}

      {TIMING_POINTS.map((p) => (
        <g key={p.label}>
          <rect
            x={p.x - 10}
            y={p.y - 18}
            width="20"
            height="12"
            rx="2"
            fill="#18181b"
            stroke="#f59e0b"
            strokeWidth="1"
            opacity="0.9"
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
            {p.label}
          </text>
        </g>
      ))}

      <text
        x="515"
        y="448"
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="9"
        fontFamily="sans-serif"
        opacity="0.5"
        fontWeight="600"
        letterSpacing="2"
      >
        PIT LANE
      </text>

      <text
        x={PIT_IN_POINT.x}
        y={PIT_IN_POINT.y + 18}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="8"
        fontFamily="sans-serif"
        opacity="0.55"
      >
        PIT IN
      </text>
      <text
        x={PIT_OUT_POINT.x}
        y={PIT_OUT_POINT.y - 12}
        textAnchor="middle"
        fill={SECTOR_COLORS.pit}
        fontSize="8"
        fontFamily="sans-serif"
        opacity="0.55"
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
          const { x, y } = mockPointOnLap(t);

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
