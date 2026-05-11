"use client";

import { useState } from "react";
import SideMenu from "@/components/layout/SideMenu";
import { mockClasses, mockSessionInfo, mockStandings } from "@/data/mock";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import { formatTime } from "@/lib/format";
import { getClassColor } from "@/lib/colors";

const OKAYAMA_SVG_VIEWBOX = "0 0 800 500";

function OkayamaCourseSvg({ standings }: { standings: typeof mockStandings }) {
  return (
    <svg viewBox={OKAYAMA_SVG_VIEWBOX} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3f3f46" />
          <stop offset="100%" stopColor="#27272a" />
        </linearGradient>
      </defs>

      {/* コース本体 (岡山国際サーキット簡略形状) */}
      <path
        d="M 200,80 L 550,80 Q 620,80 650,130 L 680,200 Q 700,250 680,300 L 620,380 Q 580,420 520,420 L 300,420 Q 240,420 210,380 L 140,280 Q 120,240 130,200 L 160,130 Q 175,90 200,80 Z"
        fill="none"
        stroke="url(#trackGrad)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 200,80 L 550,80 Q 620,80 650,130 L 680,200 Q 700,250 680,300 L 620,380 Q 580,420 520,420 L 300,420 Q 240,420 210,380 L 140,280 Q 120,240 130,200 L 160,130 Q 175,90 200,80 Z"
        fill="none"
        stroke="#52525b"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* セクター色分け */}
      {/* S1: Start/Finish → Turn 4 */}
      <path
        d="M 350,80 L 550,80 Q 620,80 650,130 L 680,200"
        fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="4 6" opacity="0.6"
      />
      {/* S2: Turn 4 → Hairpin */}
      <path
        d="M 680,200 Q 700,250 680,300 L 620,380 Q 580,420 520,420"
        fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="4 6" opacity="0.6"
      />
      {/* S3: Hairpin → Start/Finish */}
      <path
        d="M 520,420 L 300,420 Q 240,420 210,380 L 140,280 Q 120,240 130,200 L 160,130 Q 175,90 200,80 L 350,80"
        fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray="4 6" opacity="0.6"
      />

      {/* コーナー名ラベル */}
      {[
        { x: 370, y: 65, label: "FL", size: "10" },
        { x: 600, y: 100, label: "Williams", size: "8" },
        { x: 690, y: 170, label: "Moss-S", size: "8" },
        { x: 700, y: 260, label: "Atwood", size: "8" },
        { x: 640, y: 400, label: "Hairpin", size: "8" },
        { x: 420, y: 440, label: "Revolver", size: "8" },
        { x: 260, y: 420, label: "Piper", size: "8" },
        { x: 140, y: 320, label: "Redman", size: "8" },
        { x: 120, y: 220, label: "Hobbs", size: "8" },
        { x: 155, y: 120, label: "Mike Knight", size: "8" },
      ].map((c) => (
        <text
          key={c.label}
          x={c.x}
          y={c.y}
          textAnchor="middle"
          fill="#71717a"
          fontSize={c.size}
          fontFamily="sans-serif"
        >
          {c.label}
        </text>
      ))}

      {/* セクターラベル */}
      <text x="620" y="145" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold" opacity="0.8">S1</text>
      <text x="700" y="340" textAnchor="middle" fill="#3b82f6" fontSize="11" fontWeight="bold" opacity="0.8">S2</text>
      <text x="170" y="250" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="bold" opacity="0.8">S3</text>

      {/* PIT Lane */}
      <path
        d="M 300,80 Q 310,110 340,120 L 500,120 Q 530,110 540,80"
        fill="none" stroke="#a1a1aa" strokeWidth="2" strokeDasharray="3 3" opacity="0.4"
      />
      <text x="420" y="115" textAnchor="middle" fill="#a1a1aa" fontSize="8" opacity="0.5">PIT LANE</text>

      {/* 車両位置プレースホルダー (Phase 4で実データに置換) */}
      {standings.slice(0, 10).map((s, i) => {
        const team = getTeamByStanding(s);
        const cls = getClassByStanding(s);
        if (!team) return null;

        const angle = (i / 10) * Math.PI * 2 + Math.PI / 4;
        const rx = 220 + i * 5;
        const ry = 150 + i * 3;
        const cx = 410 + rx * Math.cos(angle) * 0.5;
        const cy = 250 + ry * Math.sin(angle) * 0.5;

        const classColor = cls ? getClassColor(cls.nameE) : getClassColor("default");
        const fillColor = cls?.color || "#71717a";

        return (
          <g key={s.teamId}>
            <circle cx={cx} cy={cy} r="10" fill={fillColor} opacity="0.9" />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="7"
              fontWeight="bold"
            >
              {team.no}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TrackingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  const filteredStandings = classFilter
    ? mockStandings.filter((s) => {
        const cls = getClassByStanding(s);
        return cls?.nameE === classFilter;
      })
    : mockStandings;

  return (
    <div className="h-full flex flex-col">
      <SideMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(!menuOpen)}
        classes={mockClasses}
        activeClassFilter={classFilter}
        onClassFilterChange={setClassFilter}
      />

      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 pl-14 py-3 bg-gradient-to-r from-zinc-900 via-zinc-800/80 to-zinc-900 border-b border-zinc-700 transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "230px" : "56px" }}>
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Tracking</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mockSessionInfo.competition.nameE} — {mockSessionInfo.session.nameE}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Okayama International Circuit
          </span>
        </div>
      </header>

      {/* メイン */}
      <div
        className="flex-1 flex overflow-hidden transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        {/* コースマップ */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div className="w-full max-w-4xl">
            <OkayamaCourseSvg standings={filteredStandings} />
          </div>
        </div>

        {/* 右サイドパネル: 車両一覧 */}
        <div className="w-64 hidden lg:flex flex-col border-l border-zinc-800 bg-zinc-900/60 overflow-y-auto">
          <div className="px-3 py-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">On Track</span>
          </div>
          {filteredStandings.map((s) => {
            const team = getTeamByStanding(s);
            const cls = getClassByStanding(s);
            if (!team) return null;
            return (
              <div
                key={s.teamId}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
              >
                <span
                  className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: cls?.color || "#71717a" }}
                >
                  {team.no}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-300 truncate">{team.nameE}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {s.status === "in_pit" ? "IN PIT" : `P${s.position}`}
                    {s.bestTime ? ` • ${formatTime(s.bestTime)}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
