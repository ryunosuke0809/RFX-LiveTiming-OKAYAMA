"use client";

import { useState, useMemo } from "react";
import SideMenu from "@/components/layout/SideMenu";
import {
  mockStandings,
  mockClasses,
  mockSessionInfo,
  mockTeams,
  mockSchedule,
  getTeamByStanding,
  getClassByStanding,
} from "@/data/mock";
import { formatTime } from "@/lib/format";
import type { Standing } from "@/types/smis";

function generateCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

const EVENT_DATES: Record<string, string[]> = {
  "2026-04-19": ["Free Practice 1", "Free Practice 2", "Qualifying"],
  "2026-04-20": ["Race"],
  "2026-07-18": ["Free Practice 1", "Free Practice 2", "Qualifying"],
  "2026-07-19": ["Race"],
};

function getEventsForDate(year: number, month: number, day: number): string[] {
  const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return EVENT_DATES[key] || [];
}

function sortStandingsByBestTime(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (a.bestTime == null && b.bestTime == null) return 0;
    if (a.bestTime == null) return 1;
    if (b.bestTime == null) return -1;
    return a.bestTime - b.bestTime;
  });
}

function generateCsvContent(standings: Standing[]): string {
  const sorted = sortStandingsByBestTime(standings);
  const header = "Position,Class Position,No.,Class,Team,Best Time,Best Lap,Last Lap Time,Laps,S1,S2,S3,Pits,Status";
  const rows = sorted.map((s, idx) => {
    const team = getTeamByStanding(s);
    const cls = getClassByStanding(s);
    return [
      idx + 1,
      s.classPosition,
      team?.no ?? "",
      cls?.nameE ?? "",
      team?.nameE ?? "",
      formatTime(s.bestTime),
      s.bestTimeLap,
      formatTime(s.lastLapTime),
      s.lap,
      formatTime(s.sectors[0]?.time),
      formatTime(s.sectors[1]?.time),
      formatTime(s.sectors[2]?.time),
      s.pits,
      s.status.replace("_", " ").toUpperCase(),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ResultTab = "current" | "calendar";

export default function ResultPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("current");
  const [classFilter, setClassFilter] = useState<string | null>(null);

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calDays = useMemo(() => generateCalendarDays(calYear, calMonth), [calYear, calMonth]);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const sortedStandings = useMemo(() => {
    const base = classFilter
      ? mockStandings.filter((s) => getClassByStanding(s)?.nameE === classFilter)
      : mockStandings;
    return sortStandingsByBestTime(base);
  }, [classFilter]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return EVENT_DATES[selectedDate] || [];
  }, [selectedDate]);

  const handleDownloadCsv = () => {
    const session = mockSessionInfo.session.nameE.replace(/\s+/g, "_");
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `Result_${session}_${timestamp}.csv`;
    downloadCsv(filename, generateCsvContent(sortedStandings));
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

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
          <h1 className="text-lg font-bold text-white tracking-wide">Results</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mockSessionInfo.competition.nameE}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("current")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "current"
                  ? "bg-amber-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Live Results
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "calendar"
                  ? "bg-amber-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Calendar
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <div
        className="flex-1 overflow-auto transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        {activeTab === "current" ? (
          <CurrentResultView
            standings={sortedStandings}
            classFilter={classFilter}
            onDownload={handleDownloadCsv}
          />
        ) : (
          <CalendarView
            year={calYear}
            month={calMonth}
            days={calDays}
            monthNames={monthNames}
            dayNames={dayNames}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            selectedDateEvents={selectedDateEvents}
          />
        )}
      </div>
    </div>
  );
}

function CurrentResultView({
  standings,
  classFilter,
  onDownload,
}: {
  standings: Standing[];
  classFilter: string | null;
  onDownload: () => void;
}) {
  return (
    <div className="p-4">
      {/* セッション情報バー */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Live</span>
          </div>
          <span className="text-sm text-zinc-300 font-medium">
            {mockSessionInfo.session.nameE}
          </span>
          <span className="text-xs text-zinc-600">|</span>
          <span className="text-xs text-zinc-500">
            {mockSessionInfo.category.courseName}
          </span>
        </div>
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download CSV
        </button>
      </div>

      {/* クラスフィルターバッジ */}
      {classFilter && (
        <div className="mb-3">
          <span className="text-xs text-zinc-500">Filtered by: </span>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-zinc-700 text-white">
            {classFilter}
          </span>
        </div>
      )}

      {/* リザルトテーブル */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--timing-fs)" }}>
          <thead>
            <tr className="border-b-2 border-red-700 bg-zinc-800">
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-12">P</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-12">PIC</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-14">No.</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-16">Class</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Team</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-28">Best Time</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-16">Lap</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-24">Gap</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-24">Last Lap</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-20">S1</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-20">S2</th>
              <th className="py-2 px-3 text-right text-xs font-semibold text-white uppercase tracking-wider w-20">S3</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-14">Pits</th>
              <th className="py-2 px-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-14">Laps</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) return null;

              const leaderBest = standings[0]?.bestTime;
              const gap = idx === 0 || !s.bestTime || !leaderBest
                ? ""
                : `+${formatTime(s.bestTime - leaderBest)}`;

              return (
                <tr
                  key={s.teamId}
                  className={`border-b border-zinc-800/70 hover:bg-zinc-800/50 transition-colors ${
                    idx % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/20"
                  }`}
                >
                  <td className="py-1.5 px-2 text-center font-bold text-white font-mono">{idx + 1}</td>
                  <td className="py-1.5 px-2 text-center text-zinc-400 font-mono">{s.classPosition}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span
                      className="inline-block w-8 h-6 rounded text-white text-xs font-bold leading-6 text-center"
                      style={{ backgroundColor: cls?.color || "#71717a" }}
                    >
                      {team.no}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center text-xs text-zinc-400">{cls?.nameE}</td>
                  <td className="py-1.5 px-3 text-left text-zinc-200 truncate max-w-[200px]">{team.nameE}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-fuchsia-400">
                    {formatTime(s.bestTime)}
                  </td>
                  <td className="py-1.5 px-2 text-center text-zinc-500 font-mono text-xs">
                    {s.bestTimeLap > 0 ? `L${s.bestTimeLap}` : ""}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-400">{gap}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-yellow-300">
                    {formatTime(s.lastLapTime)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                    {formatTime(s.sectors[0]?.time)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                    {formatTime(s.sectors[1]?.time)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                    {formatTime(s.sectors[2]?.time)}
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono text-zinc-500">{s.pits}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-zinc-400">{s.lap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {standings.length === 0 && (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-lg">No data available</p>
          <p className="text-sm mt-1">Waiting for session data...</p>
        </div>
      )}
    </div>
  );
}

function CalendarView({
  year,
  month,
  days,
  monthNames,
  dayNames,
  onPrevMonth,
  onNextMonth,
  selectedDate,
  onSelectDate,
  selectedDateEvents,
}: {
  year: number;
  month: number;
  days: (number | null)[];
  monthNames: string[];
  dayNames: string[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  selectedDateEvents: string[];
}) {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* カレンダーヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-white tracking-wide">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={onNextMonth}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs text-zinc-500 font-semibold uppercase py-2">
            {d}
          </div>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-20" />;
          }

          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = getEventsForDate(year, month, day);
          const hasEvents = events.length > 0;
          const isSelected = selectedDate === dateKey;
          const isToday =
            year === new Date().getFullYear() &&
            month === new Date().getMonth() &&
            day === new Date().getDate();

          return (
            <button
              key={day}
              onClick={() => onSelectDate(isSelected ? null : dateKey)}
              className={`h-20 rounded-lg border transition-all text-left p-2 flex flex-col ${
                isSelected
                  ? "border-amber-500 bg-amber-600/10"
                  : hasEvents
                  ? "border-zinc-700 bg-zinc-800/60 hover:border-amber-600/50 hover:bg-zinc-800"
                  : "border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-900/50"
              }`}
            >
              <span
                className={`text-sm font-bold ${
                  isToday
                    ? "text-amber-400"
                    : isSelected
                    ? "text-white"
                    : hasEvents
                    ? "text-zinc-200"
                    : "text-zinc-600"
                }`}
              >
                {day}
              </span>
              {hasEvents && (
                <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                  {events.slice(0, 2).map((ev) => (
                    <span
                      key={ev}
                      className="text-[9px] text-amber-400/80 truncate leading-tight"
                    >
                      {ev}
                    </span>
                  ))}
                  {events.length > 2 && (
                    <span className="text-[9px] text-zinc-500">+{events.length - 2} more</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 選択した日のイベント詳細 */}
      {selectedDate && (
        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
            <h3 className="text-sm font-bold text-white">{selectedDate}</h3>
          </div>
          {selectedDateEvents.length > 0 ? (
            <div className="divide-y divide-zinc-800/50">
              {selectedDateEvents.map((session) => (
                <div
                  key={session}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                >
                  <div>
                    <span className="text-sm text-zinc-200">{session}</span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {mockSessionInfo.competition.nameE}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors">
                      View
                    </button>
                    <button className="px-3 py-1.5 rounded-md text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors">
                      CSV
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-zinc-600">
              <p className="text-sm">No sessions on this date</p>
            </div>
          )}
        </div>
      )}

      {/* 過去イベント一覧 */}
      <div className="mt-8">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Past Events</h3>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/50">
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Event</th>
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Session</th>
                <th className="py-2.5 px-4 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">Results</th>
              </tr>
            </thead>
            <tbody>
              {mockSchedule.map((entry, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                    idx % 2 === 0 ? "bg-zinc-900/40" : ""
                  }`}
                >
                  <td className="py-2.5 px-4 text-sm text-zinc-500 font-mono">{entry.localTime.split(" ")[0]}</td>
                  <td className="py-2.5 px-4 text-sm text-amber-400">{entry.event}</td>
                  <td className="py-2.5 px-4 text-sm text-zinc-300">{entry.session}</td>
                  <td className="py-2.5 px-4 text-center">
                    {entry.hasResults ? (
                      <button className="px-3 py-1 rounded text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors">
                        Results
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
