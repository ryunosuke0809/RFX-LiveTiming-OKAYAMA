"use client";

import { useState } from "react";
import SideMenu from "@/components/layout/SideMenu";
import OkayamaCircuitSvg from "@/components/tracking/OkayamaCircuitSvg";
import DriverDetailPanel from "@/components/shared/DriverDetailPanel";
import { mockClasses, mockSessionInfo, mockStandings, getTeamByStanding, getClassByStanding, getMockPersonalData } from "@/data/mock";
import { formatTime } from "@/lib/format";
import type { Standing } from "@/types/smis";

export default function TrackingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selectedStanding, setSelectedStanding] = useState<Standing | null>(null);

  const filteredStandings = classFilter
    ? mockStandings.filter((s) => getClassByStanding(s)?.nameE === classFilter)
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
      <header
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-zinc-900 via-zinc-800/80 to-zinc-900 border-b border-zinc-700 transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "230px" : "56px" }}
      >
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Tracking</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mockSessionInfo.competition.nameE} — {mockSessionInfo.session.nameE}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* セクター凡例 */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-red-500" />S1</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-blue-500" />S2</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-green-500" />S3</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-zinc-400" />Pit</span>
          </div>
        </div>
      </header>

      {/* メイン */}
      <div
        className="flex-1 flex overflow-hidden transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        {/* コースマップ */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div className="w-full max-w-3xl h-full flex items-center justify-center">
            <OkayamaCircuitSvg standings={filteredStandings} showCarMarkers />
          </div>
        </div>

        {/* 右サイドパネル: 車両一覧 */}
        <div className="w-64 hidden lg:flex flex-col border-l border-zinc-800 bg-zinc-900/60 overflow-y-auto">
          <div className="px-3 py-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Entries — {filteredStandings.length}
            </span>
          </div>
          {filteredStandings.map((s) => {
            const team = getTeamByStanding(s);
            const cls = getClassByStanding(s);
            if (!team) return null;
            return (
              <button
                key={s.teamId}
                onClick={() => setSelectedStanding(s)}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 hover:bg-zinc-800/60 transition-colors text-left w-full"
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
                    {s.bestTime ? ` · ${formatTime(s.bestTime)}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* パーソナルデータパネル */}
      {selectedStanding && (
        <DriverDetailPanel
          standing={selectedStanding}
          team={getTeamByStanding(selectedStanding)}
          carClass={getClassByStanding(selectedStanding)}
          personalData={getMockPersonalData(selectedStanding)}
          onClose={() => setSelectedStanding(null)}
        />
      )}
    </div>
  );
}
