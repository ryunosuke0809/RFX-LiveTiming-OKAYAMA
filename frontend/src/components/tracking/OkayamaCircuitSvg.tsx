"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * レイアウト: /dev/circuit-map-editor で衛星トレースした path を反映
 * 投影バウンド: N=34.921274 S=34.910024 E=134.224646 W=134.218575
 *
 * 将来: getPointAtLength() で車両マーカーをパス上に配置・移動
 */

import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

// --- セクター色定義 ---
const SECTOR_COLORS = {
  s1: "#ef4444",
  s2: "#3b82f6",
  s3: "#22c55e",
  pit: "#a1a1aa",
};

function stripLeadingMove(d: string): string {
  return d.replace(/^M\s+[\d.]+\s+[\d.]+\s+/, "");
}

// --- SVG パス（viewBox 0 0 1000 560）---

const PATH_S1 =
  "M 58.3 348.0 L 37.0 248.4 L 77.7 236.2 L 137.7 232.6 L 253.6 245.2 L 416.1 274.8 L 510.6 276.1 L 576.0 264.3 L 657.3 218.5 L 712.0 179.3 L 680.2 135.7 L 717.3 98.7";

const PATH_S2 =
  "M 717.3 98.7 L 759.8 30.6 L 812.8 20.7 L 864.9 21.6 L 912.6 28.0 L 950.6 40.2 L 963.0 59.3 L 955.0 81.0 L 931.2 107.5 L 892.3 134.6 L 590.2 382.6 L 540.7 389.6 L 499.2 380.0 L 518.6 351.7 L 541.6 327.6 L 498.3 316.0 L 303.9 309.2 L 243.0 317.1 L 233.3 343.2 L 237.7 345.4";

const PATH_S3 =
  "M 237.7 345.4 L 262.4 450.3 L 310.1 460.6 L 372.9 448.1 L 425.9 419.4 L 468.3 415.3 L 513.3 425.8 L 478.0 504.4 L 438.2 521.1 L 196.2 539.3 L 120.2 527.9 L 99.0 492.8 L 58.3 348.0";

const PATH_PIT =
  "M 486.5 485.5 L 478.0 504.4 L 392.3 517.8 L 288.9 525.7 L 221.8 531.4 L 179.4 527.4 L 157.3 518.9 L 136.1 510.6 L 131.7 487.3 L 110.5 431.3 L 84.8 344.7 L 48.1 300.2";

const FL_POINT = { x: 58.3, y: 348.0 };
const PIT_IN_POINT = { x: 456.8, y: 507.7 };
const PIT_OUT_POINT = { x: 84.8, y: 344.7 };

/** S1 終端 = S2 始端（計測イメージ） */
const S1_END = { x: 717.3, y: 98.7 };
/** S2 終端 = S3 始端 */
const S2_END = { x: 237.7, y: 345.4 };

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
  { x: 377, y: 223, label: "S1", color: SECTOR_COLORS.s1 },
  { x: 598, y: 205, label: "S2", color: SECTOR_COLORS.s2 },
  { x: 285, y: 424, label: "S3", color: SECTOR_COLORS.s3 },
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
        x="268"
        y="498"
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
