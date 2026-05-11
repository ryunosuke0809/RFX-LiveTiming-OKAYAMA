"use client";

/**
 * 岡山国際サーキット SVG コースマップ
 *
 * コースレイアウト: PDF公式コース図の向き準拠
 * セクター区間:
 *   S1 (962m)  — コントロールライン → S1計測ライン (Williams後)
 *   S2 (1558m) — S1計測ライン → S2計測ライン (Hairpin後)
 *   S3 (1183m) — S2計測ライン → コントロールライン
 *
 * 将来: getPointAtLength() で車両マーカーをパス上に配置・移動
 */

import type { Standing } from "@/types/smis";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

// --- セクター色定義 ---
const SECTOR_COLORS = {
  s1: "#ef4444",   // 赤
  s2: "#3b82f6",   // 青
  s3: "#22c55e",   // 緑
  pit: "#a1a1aa",  // グレー
};

// --- SVG パスデータ (岡山国際サーキット — 衛星写真 & PDF準拠) ---
// コースは時計回り。ピットストレートは下側。

// S1: コントロールライン → S1計測ライン (First Corner, Williams Corner)
const PATH_S1 =
  "M 200,710 L 310,710 Q 370,708 420,700 Q 470,690 500,670 " +
  "Q 530,650 545,620 Q 560,585 555,545 Q 548,505 535,470 " +
  "Q 522,440 505,415";

// S2: S1計測ライン → S2計測ライン (Moss S, Attwood, Hairpin)
const PATH_S2 =
  "M 505,415 Q 488,390 465,365 Q 440,335 410,305 " +
  "Q 380,275 345,250 Q 310,225 280,210 " +
  "Q 250,195 225,185 Q 195,175 172,175 " +
  "Q 148,178 132,195 Q 115,215 108,250 " +
  "Q 100,290 98,335 Q 96,380 100,420 " +
  "Q 105,455 118,478 Q 132,500 152,510 Q 170,515 185,508";

// S3: S2計測ライン → コントロールライン (Revolver, Piper, Redman, Hobbs, Mike Knight, Last Corner)
const PATH_S3 =
  "M 185,508 Q 195,520 190,545 Q 182,575 170,600 " +
  "Q 158,625 145,648 Q 132,668 125,685 " +
  "Q 120,700 128,715 Q 138,730 155,738 " +
  "Q 175,742 200,710";

// ピットロード: メインストレートの内側を平行に走る
const PATH_PIT =
  "M 475,680 Q 450,700 420,715 L 320,728 Q 270,730 230,725 Q 200,720 185,710";

// 全周パス (アニメーション用 — 1本の連続パス)
export const PATH_FULL_CIRCUIT =
  PATH_S1.replace("M 200,710", "M 200,710") +
  " " + PATH_S2.replace("M 505,415", "") +
  " " + PATH_S3.replace("M 185,508", "").replace("Q 175,742 200,710", "Q 175,742 200,710");

// --- コーナー情報 ---
const CORNERS = [
  { x: 475, y: 680, label: "1", name: "First" },
  { x: 550, y: 555, label: "2", name: "Williams" },
  { x: 435, y: 325, label: "3", name: "Moss" },
  { x: 365, y: 268, label: "4", name: "" },
  { x: 300, y: 230, label: "5", name: "" },
  { x: 180, y: 190, label: "6", name: "Attwood" },
  { x: 100, y: 440, label: "7", name: "Hairpin" },
  { x: 188, y: 530, label: "8", name: "Revolver" },
  { x: 165, y: 610, label: "9", name: "Piper" },
  { x: 135, y: 665, label: "10", name: "Redman" },
  { x: 122, y: 698, label: "11", name: "Hobbs" },
  { x: 140, y: 735, label: "12", name: "M.Knight" },
  { x: 175, y: 730, label: "13", name: "Last" },
];

// --- セクターラベル位置 ---
const SECTOR_LABELS = [
  { x: 540, y: 600, label: "S1", color: SECTOR_COLORS.s1 },
  { x: 200, y: 320, label: "S2", color: SECTOR_COLORS.s2 },
  { x: 145, y: 640, label: "S3", color: SECTOR_COLORS.s3 },
];

// --- 計測ポイント ---
const TIMING_POINTS = [
  { x: 200, y: 700, label: "FL" },
  { x: 505, y: 405, label: "S1" },
  { x: 185, y: 500, label: "S2" },
];

interface OkayamaCircuitSvgProps {
  standings?: Standing[];
  showCarMarkers?: boolean;
  className?: string;
}

export default function OkayamaCircuitSvg({
  standings = [],
  showCarMarkers = false,
  className = "",
}: OkayamaCircuitSvgProps) {
  return (
    <svg
      viewBox="60 130 540 640"
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

      {/* コース路面 (太い暗色でアスファルト表現) */}
      <path d={PATH_S1} fill="none" stroke="#27272a" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_S2} fill="none" stroke="#27272a" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_S3} fill="none" stroke="#27272a" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />

      {/* セクター色付きライン */}
      <path d={PATH_S1} fill="none" stroke={SECTOR_COLORS.s1} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" filter="url(#glow)" />
      <path d={PATH_S2} fill="none" stroke={SECTOR_COLORS.s2} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" filter="url(#glow)" />
      <path d={PATH_S3} fill="none" stroke={SECTOR_COLORS.s3} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" filter="url(#glow)" />

      {/* ピットロード */}
      <path d={PATH_PIT} fill="none" stroke="#27272a" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH_PIT} fill="none" stroke={SECTOR_COLORS.pit} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" strokeDasharray="6 4" />

      {/* コントロールライン */}
      <line x1="200" y1="697" x2="200" y2="723" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />

      {/* セクター計測ライン */}
      <line x1="498" y1="403" x2="512" y2="427" stroke={SECTOR_COLORS.s1} strokeWidth="2" opacity="0.7" strokeDasharray="3 2" />
      <line x1="178" y1="498" x2="192" y2="518" stroke={SECTOR_COLORS.s2} strokeWidth="2" opacity="0.7" strokeDasharray="3 2" />

      {/* セクターラベル */}
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

      {/* コーナー番号と名前 */}
      {CORNERS.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r="7" fill="#18181b" stroke="#52525b" strokeWidth="1" opacity="0.8" />
          <text
            x={c.x}
            y={c.y + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#a1a1aa"
            fontSize="7"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {c.label}
          </text>
          {c.name && (
            <text
              x={c.x + 12}
              y={c.y - 10}
              fill="#71717a"
              fontSize="8"
              fontFamily="sans-serif"
            >
              {c.name}
            </text>
          )}
        </g>
      ))}

      {/* 計測ポイントマーカー */}
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

      {/* PIT LANE ラベル */}
      <text x="340" y="740" textAnchor="middle" fill={SECTOR_COLORS.pit} fontSize="9" fontFamily="sans-serif" opacity="0.5" fontWeight="600" letterSpacing="2">
        PIT LANE
      </text>

      {/* PIT IN / PIT OUT ラベル */}
      <text x="470" y="668" textAnchor="middle" fill={SECTOR_COLORS.pit} fontSize="7" fontFamily="sans-serif" opacity="0.4">
        PIT IN
      </text>
      <text x="195" y="698" textAnchor="end" fill={SECTOR_COLORS.pit} fontSize="7" fontFamily="sans-serif" opacity="0.4">
        PIT OUT
      </text>

      {/* 車両マーカー (Phase 4で実データ連携) */}
      {showCarMarkers && standings.slice(0, 15).map((s, i) => {
        const team = getTeamByStanding(s);
        const cls = getClassByStanding(s);
        if (!team) return null;

        // 仮配置: コース上に均等分散 (将来はgetPointAtLengthで正確配置)
        const t = i / 15;
        let x: number, y: number;
        if (t < 0.26) {
          const p = t / 0.26;
          x = 200 + p * 340;
          y = 710 - p * 300;
        } else if (t < 0.68) {
          const p = (t - 0.26) / 0.42;
          x = 540 - p * 440;
          y = 410 - 200 * Math.sin(p * Math.PI);
        } else {
          const p = (t - 0.68) / 0.32;
          x = 100 + p * 100;
          y = 508 + p * 202;
        }

        const fillColor = cls?.color || "#71717a";

        return (
          <g key={s.teamId} filter="url(#glow)">
            <circle cx={x} cy={y} r="9" fill={fillColor} opacity="0.95" stroke="#000" strokeWidth="1" />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="7"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              {team.no}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
