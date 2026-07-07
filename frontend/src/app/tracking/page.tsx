"use client";

import { useState, useCallback } from "react";
import SideMenu from "@/components/layout/SideMenu";
import OkayamaCircuitSvg from "@/components/tracking/OkayamaCircuitSvg";
import { mockClasses, mockSessionInfo, mockStandings, getTeamByStanding, getClassByStanding } from "@/data/mock";
import { formatTime } from "@/lib/format";
import { useLiveTiming } from "@/hooks/useLiveTiming";
import type { Standing } from "@/types/smis";

/** コース状況パネル用の CARNO のみのバッジ（丸み帯びた四角）。 */
function CarNoBadge({
  standing,
  active,
  onClick,
}: {
  standing: Standing;
  active: boolean;
  onClick: () => void;
}) {
  const team = getTeamByStanding(standing);
  const cls = getClassByStanding(standing);
  if (!team) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={team.nameE}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 transition-all ${
        active ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : "hover:brightness-110"
      }`}
      style={{ backgroundColor: cls?.color || "#71717a" }}
    >
      {team.no}
    </button>
  );
}

export default function TrackingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [entriesOpen, setEntriesOpen] = useState(false);

  // ライブ接続 (/ws)。データ受信時は mock の代わりにライブ順位を使う。
  const live = useLiveTiming();
  const isLive = live.hasData;
  const baseStandings = isLive ? live.standings : mockStandings;
  const classes = isLive ? live.classes : mockClasses;
  const competitionName = isLive && live.sessionInfo ? live.sessionInfo.competition.nameE : mockSessionInfo.competition.nameE;
  const sessionName = isLive && live.sessionInfo ? live.sessionInfo.session.nameE : mockSessionInfo.session.nameE;

  const filteredStandings = classFilter
    ? baseStandings.filter((s) => getClassByStanding(s)?.nameE === classFilter)
    : baseStandings;

  // IN PIT の車両はコースマップから消え、こちらの PitIn リストに表示する。
  const pitStandings = filteredStandings.filter((s) => s.status === "in_pit");
  const onTrackStandings = filteredStandings.filter((s) => s.status !== "in_pit");

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
        classes={classes}
        activeClassFilter={classFilter}
        onClassFilterChange={setClassFilter}
      />

      {/* ヘッダー */}
      <header
        className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-zinc-900 via-zinc-800/80 to-zinc-900 border-b border-zinc-700 transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "230px" : "56px" }}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold text-white tracking-wide truncate">Tracking</h1>
          <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 truncate">
            {competitionName} — {sessionName}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {highlighted.size > 0 && (
            <button
              onClick={clearHighlights}
              className="px-2 sm:px-3 py-1 rounded-md text-[10px] font-semibold bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
            >
              Clear ({highlighted.size})
            </button>
          )}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-red-500" />S1</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-yellow-500" />S2</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-green-500" />S3</span>
          </div>
          <button
            type="button"
            onClick={() => setEntriesOpen((v) => !v)}
            className={`px-2 sm:px-3 py-1 rounded-md text-[10px] font-semibold border transition-colors whitespace-nowrap ${
              entriesOpen
                ? "bg-amber-600 border-amber-500 text-white"
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            }`}
            aria-pressed={entriesOpen}
          >
            Entries · {filteredStandings.length}
          </button>
        </div>
      </header>

      {/* メイン: ページ全域がコースマップ。サイドパネルはトグルでオーバーレイ表示
          SideMenu と被らないよう padding-left を取り、その中で flex-1 で OkayamaCircuitSvg が自然にフィットする */}
      <div
        className="relative flex flex-1 overflow-hidden transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        <div className="relative flex-1 min-w-0">
          <OkayamaCircuitSvg
            standings={filteredStandings}
            showCarMarkers
            highlightedTeamIds={highlighted}
            onMarkerClick={toggleHighlight}
          />

          {/* コース状況パネル: On Track / Pit In を CARNO のみのバッジで一覧表示。
              IN PIT 中の車両はマップから消え、Pit In エリアに入る。 */}
          <div className="absolute bottom-2 right-2 z-10 w-52 max-w-[74vw] bg-zinc-900/85 backdrop-blur-md border border-zinc-700 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-2.5 py-1.5 border-b border-zinc-700 bg-green-900/25 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[11px] text-green-300 uppercase tracking-wider font-bold">
                On Track — {onTrackStandings.length}
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto p-1.5 flex flex-wrap gap-1">
              {onTrackStandings.length === 0 ? (
                <span className="text-[10px] text-zinc-600 px-1 py-0.5">—</span>
              ) : (
                onTrackStandings.map((s) => (
                  <CarNoBadge
                    key={s.teamId}
                    standing={s}
                    active={highlighted.has(s.teamId)}
                    onClick={() => toggleHighlight(s.teamId)}
                  />
                ))
              )}
            </div>

            <div className="px-2.5 py-1.5 border-y border-zinc-700 bg-red-900/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[11px] text-red-300 uppercase tracking-wider font-bold">
                Pit In — {pitStandings.length}
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto p-1.5 flex flex-wrap gap-1">
              {pitStandings.length === 0 ? (
                <span className="text-[10px] text-zinc-600 px-1 py-0.5">—</span>
              ) : (
                pitStandings.map((s) => (
                  <CarNoBadge
                    key={s.teamId}
                    standing={s}
                    active={highlighted.has(s.teamId)}
                    onClick={() => toggleHighlight(s.teamId)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* 右サイドパネル: 車両一覧（オーバーレイ）
            スマホでは max-w で画面幅の8割までに制限してマップが完全に隠れないようにする */}
        <aside
          className={`absolute top-0 right-0 h-full w-64 max-w-[80vw] bg-zinc-900/85 backdrop-blur-md border-l border-zinc-800 flex flex-col overflow-hidden transition-transform duration-200 z-20 shadow-2xl ${
            entriesOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={!entriesOpen}
        >
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
              Entries — {filteredStandings.length}
            </span>
            <button
              type="button"
              onClick={() => setEntriesOpen(false)}
              className="text-zinc-500 hover:text-zinc-200 text-base leading-none px-1"
              aria-label="Close entries"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
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
        </aside>
      </div>
    </div>
  );
}
