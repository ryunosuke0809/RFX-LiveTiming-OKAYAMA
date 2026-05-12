"use client";

import { useState, useCallback } from "react";
import SideMenu from "@/components/layout/SideMenu";
import OkayamaCircuitSvg from "@/components/tracking/OkayamaCircuitSvg";
import { mockClasses, mockSessionInfo, mockStandings, getTeamByStanding, getClassByStanding } from "@/data/mock";
import { formatTime } from "@/lib/format";

export default function TrackingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  const filteredStandings = classFilter
    ? mockStandings.filter((s) => getClassByStanding(s)?.nameE === classFilter)
    : mockStandings;

  const toggleHighlight = useCallback((teamId: string) => {
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const clearHighlights = useCallback(() => setHighlighted(new Set()), []);

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
          {highlighted.size > 0 && (
            <button
              onClick={clearHighlights}
              className="px-3 py-1 rounded-md text-[10px] font-semibold bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
            >
              Clear ({highlighted.size})
            </button>
          )}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-blue-500" />S1</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-red-500" />S2</span>
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
            <OkayamaCircuitSvg
              standings={filteredStandings}
              showCarMarkers
              highlightedTeamIds={highlighted}
              onMarkerClick={toggleHighlight}
            />
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
            const isActive = highlighted.has(s.teamId);
            return (
              <button
                key={s.teamId}
                onClick={() => toggleHighlight(s.teamId)}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 transition-colors text-left w-full ${
                  isActive
                    ? "bg-amber-600/10 border-l-2 border-l-amber-500"
                    : "hover:bg-zinc-800/60"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 transition-all ${
                    isActive ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : ""
                  }`}
                  style={{ backgroundColor: cls?.color || "#71717a" }}
                >
                  {team.no}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs truncate ${isActive ? "text-white font-bold" : "text-zinc-300"}`}>
                    {team.nameE}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {s.status === "in_pit" ? "IN PIT" : `P${s.position}`}
                    {s.bestTime ? ` · ${formatTime(s.bestTime)}` : ""}
                  </div>
                </div>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
