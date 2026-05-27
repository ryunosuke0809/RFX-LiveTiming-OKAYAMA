"use client";

import { useState, useMemo } from "react";
import SideMenu from "@/components/layout/SideMenu";
import DriverDetailPanel from "@/components/shared/DriverDetailPanel";
import {
  mockStandings,
  mockClasses,
  mockSessionInfo,
  mockSchedule,
  getTeamByStanding,
  getClassByStanding,
  getMockPersonalData,
} from "@/data/mock";
import { formatTime } from "@/lib/format";
import { TIME_COLORS } from "@/lib/colors";
import type { Standing, DriverPersonalData } from "@/types/smis";

// --- CSV helpers ---

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sortStandingsByBestTime(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (a.bestTime == null && b.bestTime == null) return 0;
    if (a.bestTime == null) return 1;
    if (b.bestTime == null) return -1;
    return a.bestTime - b.bestTime;
  });
}

function generateClassificationCsv(standings: Standing[]): string {
  const header = "Position,Class Position,No.,Class,Team,Best Time,Best Lap,Last Lap Time,Laps,S1,S2,S3,Pits,Status";
  const rows = standings.map((s, idx) => {
    const team = getTeamByStanding(s);
    const cls = getClassByStanding(s);
    return [
      idx + 1, s.classPosition, team?.no ?? "", cls?.nameE ?? "", team?.nameE ?? "",
      formatTime(s.bestTime), s.bestTimeLap, formatTime(s.lastLapTime), s.lap,
      formatTime(s.sectors[0]?.time), formatTime(s.sectors[1]?.time), formatTime(s.sectors[2]?.time),
      s.pits, s.status.replace("_", " ").toUpperCase(),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function generateIndividualCsv(standing: Standing, data: DriverPersonalData): string {
  const team = getTeamByStanding(standing);
  const cls = getClassByStanding(standing);
  const info = [
    `# No.${team?.no} ${team?.nameE} (${cls?.nameE})`,
    `# Best Lap: ${formatTime(data.bestLapTime)} (Lap ${data.bestLap})`,
    `# Best S1: ${formatTime(data.bestS1)}  Best S2: ${formatTime(data.bestS2)}  Best S3: ${formatTime(data.bestS3)}`,
    "",
  ];
  const header = "Lap,Lap Time,S1,S2,S3,Position,Pit";
  const rows = data.laps.map((l) =>
    [l.lap, formatTime(l.lapTime), formatTime(l.s1), formatTime(l.s2), formatTime(l.s3), l.position > 0 ? l.position : "", l.isPit ? "YES" : ""].join(",")
  );
  return [...info, header, ...rows].join("\n");
}

function makeTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

// --- Calendar helpers ---

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

// --- Main ---

type ResultTab = "classification" | "individual" | "calendar";

export default function ResultPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("classification");
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selectedStanding, setSelectedStanding] = useState<Standing | null>(null);
  const [individualTarget, setIndividualTarget] = useState<Standing | null>(null);

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

  const handleDownloadClassification = () => {
    const session = mockSessionInfo.session.nameE.replace(/\s+/g, "_");
    downloadCsv(`Classification_${session}_${makeTimestamp()}.csv`, generateClassificationCsv(sortedStandings));
  };

  const handleDownloadIndividual = (s: Standing) => {
    const team = getTeamByStanding(s);
    const data = getMockPersonalData(s);
    downloadCsv(`Laps_No${team?.no}_${makeTimestamp()}.csv`, generateIndividualCsv(s, data));
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const tabs: { key: ResultTab; label: string }[] = [
    { key: "classification", label: "Classification" },
    { key: "individual", label: "Individual" },
    { key: "calendar", label: "Calendar" },
  ];

  return (
    <div className="h-full flex flex-col">
      <SideMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(!menuOpen)}
        classes={mockClasses}
        activeClassFilter={classFilter}
        onClassFilterChange={setClassFilter}
      />

      {/* ヘッダー: スマホでは Title 行とタブ行を縦並びにして折り返す */}
      <header
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-zinc-900 via-zinc-800/80 to-zinc-900 border-b border-zinc-700 transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "230px" : "56px" }}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold text-white tracking-wide truncate">Results</h1>
          <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 truncate">
            {mockSessionInfo.competition.nameE}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5 flex-shrink-0 self-start sm:self-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? "bg-amber-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* メインコンテンツ
          Individual タブはラップテーブルを画面いっぱいに伸ばしたいので overflow-hidden + flex で
          子側 (IndividualView) がスクロール領域を管理する。
          Classification / Calendar は縦に長いコンテンツを外側スクロールで読む。 */}
      <div
        className={`flex-1 transition-all duration-300 ${
          activeTab === "individual"
            ? "overflow-hidden flex flex-col min-h-0"
            : "overflow-auto"
        }`}
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        {activeTab === "classification" && (
          <ClassificationView
            standings={sortedStandings}
            classFilter={classFilter}
            onDownload={handleDownloadClassification}
            onRowClick={(s) => setSelectedStanding(s)}
          />
        )}
        {activeTab === "individual" && (
          <IndividualView
            standings={sortedStandings}
            target={individualTarget}
            onSelectTarget={setIndividualTarget}
            onDownload={handleDownloadIndividual}
          />
        )}
        {activeTab === "calendar" && (
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
            onViewSession={() => setActiveTab("classification")}
          />
        )}
      </div>

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

// ========== Classification (全体順位リザルト) ==========

function ClassificationView({
  standings, classFilter, onDownload, onRowClick,
}: {
  standings: Standing[];
  classFilter: string | null;
  onDownload: () => void;
  onRowClick: (s: Standing) => void;
}) {
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Live</span>
          </div>
          <span className="text-xs sm:text-sm text-zinc-300 font-medium truncate">{mockSessionInfo.session.nameE}</span>
          <span className="text-xs text-zinc-600 hidden sm:inline">|</span>
          <span className="text-xs text-zinc-500 truncate hidden sm:inline">{mockSessionInfo.category.courseName}</span>
        </div>
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex-shrink-0"
        >
          <DownloadIcon />
          <span className="hidden sm:inline">Download </span>CSV
        </button>
      </div>

      {classFilter && (
        <div className="mb-3">
          <span className="text-xs text-zinc-500">Filtered by: </span>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-zinc-700 text-white">{classFilter}</span>
        </div>
      )}

      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full border-collapse min-w-[760px]" style={{ fontSize: "var(--timing-fs)" }}>
          <thead>
            <tr className="border-b-2 border-red-700 bg-zinc-800">
              {["P","PIC","No.","Class","Team","Best Time","Lap","Gap","Last Lap","S1","S2","S3","Pits","Laps"].map((h) => (
                <th key={h} className={`py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider ${h === "Team" ? "text-left px-3" : h === "Best Time" || h === "Gap" || h === "Last Lap" || h === "S1" || h === "S2" || h === "S3" ? "text-right px-3" : "text-center"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) return null;
              const leaderBest = standings[0]?.bestTime;
              const gap = idx === 0 || !s.bestTime || !leaderBest ? "" : `+${formatTime(s.bestTime - leaderBest)}`;
              return (
                <tr
                  key={s.teamId}
                  onClick={() => onRowClick(s)}
                  className={`border-b border-zinc-800/70 hover:bg-zinc-800/50 transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/20"}`}
                >
                  <td className="py-1.5 px-2 text-center font-bold text-white font-mono">{idx + 1}</td>
                  <td className="py-1.5 px-2 text-center text-zinc-400 font-mono">{s.classPosition}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span className="inline-block w-8 h-6 rounded text-white text-xs font-bold leading-6 text-center" style={{ backgroundColor: cls?.color || "#71717a" }}>{team.no}</span>
                  </td>
                  <td className="py-1.5 px-2 text-center text-xs text-zinc-400">{cls?.nameE}</td>
                  <td className="py-1.5 px-3 text-left text-zinc-200 truncate max-w-[200px]">{team.nameE}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-fuchsia-400">{formatTime(s.bestTime)}</td>
                  <td className="py-1.5 px-2 text-center text-zinc-500 font-mono text-xs">{s.bestTimeLap > 0 ? `L${s.bestTimeLap}` : ""}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-400">{gap}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-yellow-300">{formatTime(s.lastLapTime)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">{formatTime(s.sectors[0]?.time)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">{formatTime(s.sectors[1]?.time)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-zinc-300">{formatTime(s.sectors[2]?.time)}</td>
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

// ========== Individual (個別ドライバーリザルト) ==========

function IndividualView({
  standings,
  target,
  onSelectTarget,
  onDownload,
}: {
  standings: Standing[];
  target: Standing | null;
  onSelectTarget: (s: Standing | null) => void;
  onDownload: (s: Standing) => void;
}) {
  const personalData = target ? getMockPersonalData(target) : null;
  const team = target ? getTeamByStanding(target) : null;
  const cls = target ? getClassByStanding(target) : null;

  return (
    // スマホは縦並び、md (768px) 以上で左右 2 ペイン。
    // スマホでの選択リストは水平 chips（横スクロール）に切り替えて、画面幅を奪わない。
    <div className="p-3 sm:p-4 flex flex-col md:flex-row md:gap-4 gap-3 h-full min-h-0">
      {/* PC: 左サイドの縦リスト */}
      <div className="hidden md:flex w-72 flex-shrink-0 flex-col border border-zinc-700 rounded-xl bg-zinc-900/80 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-700 bg-zinc-800/50">
          <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Select Driver</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {standings.map((s) => {
            const t = getTeamByStanding(s);
            const c = getClassByStanding(s);
            if (!t) return null;
            const isActive = target?.teamId === s.teamId;
            return (
              <button
                key={s.teamId}
                onClick={() => onSelectTarget(isActive ? null : s)}
                className={`flex items-center gap-2.5 px-4 py-2 border-b border-zinc-800/50 w-full text-left transition-colors ${
                  isActive ? "bg-amber-600/15 border-l-2 border-l-amber-500" : "hover:bg-zinc-800/50"
                }`}
              >
                <span
                  className="w-7 h-7 rounded flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c?.color || "#71717a" }}
                >
                  {t.no}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs truncate ${isActive ? "text-white font-bold" : "text-zinc-300"}`}>
                    {t.nameE}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {formatTime(s.bestTime) || "---"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* スマホ: 水平スクロールの chips リスト */}
      <div className="md:hidden flex-shrink-0 border border-zinc-700 rounded-xl bg-zinc-900/80 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Select Driver</span>
          <span className="text-[10px] text-zinc-500">{standings.length} drivers</span>
        </div>
        <div className="flex gap-1.5 px-2 py-2 overflow-x-auto">
          {standings.map((s) => {
            const t = getTeamByStanding(s);
            const c = getClassByStanding(s);
            if (!t) return null;
            const isActive = target?.teamId === s.teamId;
            return (
              <button
                key={s.teamId}
                onClick={() => onSelectTarget(isActive ? null : s)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border flex-shrink-0 transition-colors ${
                  isActive
                    ? "bg-amber-600/20 border-amber-500 text-white"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <span
                  className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: c?.color || "#71717a" }}
                >
                  {t.no}
                </span>
                <div className="flex flex-col items-start min-w-0">
                  <span className={`text-[11px] leading-tight truncate max-w-[120px] ${isActive ? "font-bold" : ""}`}>
                    {t.nameE}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-mono leading-tight">
                    {formatTime(s.bestTime) || "---"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右 (PC) / 下 (スマホ): 個別リザルト詳細 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!target || !personalData || !team ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <div className="text-center text-zinc-600">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-xs sm:text-sm">Select a driver to view individual results</p>
            </div>
          </div>
        ) : (
          <>
            {/* ドライバー情報ヘッダー: スマホでは縦並び＆メタ情報を折り返し可能に */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border border-zinc-700 rounded-xl bg-zinc-900/80 mb-3 sm:mb-4 flex-shrink-0">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <span
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0"
                  style={{ backgroundColor: cls?.color || "#71717a" }}
                >
                  {team.no}
                </span>
                <div className="min-w-0">
                  <div className="text-white font-bold text-sm truncate">{team.nameE}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-zinc-400">
                    <span className="truncate max-w-[180px]">{team.drivers[1]?.nameE || "---"}</span>
                    <span className="text-zinc-600">|</span>
                    <span>{cls?.nameE}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="truncate max-w-[140px]">{team.machine}</span>
                    <span className="text-zinc-600">|</span>
                    <span>{team.tire}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDownload(target)}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex-shrink-0 self-end sm:self-auto"
              >
                <DownloadIcon />
                CSV
              </button>
            </div>

            {/* サマリー
                スマホ (< md): カードを横スクロールの chips に分解して 1 行で表示。
                  - grid だと SideMenu 開時に各カードが 30〜80px まで狭まり値が切れるため。
                  - 横スクロールで指で送れば全項目見えるし、縦方向は ~46px しか使わない。
                PC (md ≥): 従来の grid（lg で 5 列、md で 3 列）。 */}
            <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1.5 mb-2 flex-shrink-0 -mx-3 px-3">
              <MetricChip label="Pos" value={`P${target.position}`} />
              <MetricChip label="PIC" value={String(target.classPosition)} />
              <MetricChip label="Best" value={formatTime(personalData.bestLapTime)} accent />
              <MetricChip label="Avg" value={formatTime(personalData.avgLapTime)} />
              <MetricChip label="Laps" value={String(personalData.laps.length)} />
              <MetricChip label="Pits" value={String(personalData.totalPits)} />
              <MetricChip label="S1" value={formatTime(personalData.bestS1)} accent />
              <MetricChip label="S2" value={formatTime(personalData.bestS2)} accent />
              <MetricChip label="S3" value={formatTime(personalData.bestS3)} accent />
            </div>
            <div className="hidden md:grid grid-cols-3 lg:grid-cols-5 gap-3 mb-4 flex-shrink-0">
              <SummaryCard label="Position" value={`P${target.position}`} sub={`PIC ${target.classPosition}`} />
              <SummaryCard label="Best Lap" value={formatTime(personalData.bestLapTime)} sub={personalData.bestLap > 0 ? `Lap ${personalData.bestLap}` : "---"} accent />
              <SummaryCard label="Average" value={formatTime(personalData.avgLapTime)} sub="valid laps" />
              <SummaryCard label="Laps" value={String(personalData.laps.length)} sub={`${personalData.totalPits} pits`} />
              <div className="col-span-3 lg:col-span-1 bg-zinc-800/60 rounded-lg px-3 py-2.5 border border-zinc-700/50">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Best Sectors</div>
                <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs font-mono">
                  <span className="text-fuchsia-400 font-bold">{formatTime(personalData.bestS1)}</span>
                  <span className="text-fuchsia-400 font-bold">{formatTime(personalData.bestS2)}</span>
                  <span className="text-fuchsia-400 font-bold">{formatTime(personalData.bestS3)}</span>
                  <span className="text-[10px] text-zinc-600">S1</span>
                  <span className="text-[10px] text-zinc-600">S2</span>
                  <span className="text-[10px] text-zinc-600">S3</span>
                </div>
              </div>
            </div>

            {/* ラップテーブル: flex-1 で残りの高さを全部使う。横スクロールも維持。 */}
            <div className="flex-1 overflow-auto border border-zinc-700 rounded-xl min-h-[200px]">
              <table className="w-full border-collapse text-[11px] sm:text-xs min-w-[440px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-zinc-800 border-b border-zinc-700">
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider w-12 sm:w-14">Lap</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">Time</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S1</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S2</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S3</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider w-10 sm:w-14">Pos</th>
                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider w-8 sm:w-10">Pit</th>
                  </tr>
                </thead>
                <tbody>
                  {personalData.laps.map((lap) => (
                    <tr
                      key={lap.lap}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors ${
                        lap.lap % 2 === 0 ? "bg-zinc-900/40" : ""
                      } ${lap.isPit ? "bg-blue-900/10" : ""}`}
                    >
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center font-mono text-zinc-400">{lap.lap}</td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono font-bold ${TIME_COLORS[lap.lapTimeType]}`}>
                        {formatTime(lap.lapTime)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${TIME_COLORS[lap.s1Type]}`}>
                        {formatTime(lap.s1)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${TIME_COLORS[lap.s2Type]}`}>
                        {formatTime(lap.s2)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${TIME_COLORS[lap.s3Type]}`}>
                        {formatTime(lap.s3)}
                      </td>
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center font-mono text-zinc-500">
                        {lap.position > 0 ? lap.position : ""}
                      </td>
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center">
                        {lap.isPit && <span className="text-cyan-400 font-bold text-[10px]">P</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ========== Calendar (カレンダー) ==========

function CalendarView({
  year, month, days, monthNames, dayNames,
  onPrevMonth, onNextMonth, selectedDate, onSelectDate, selectedDateEvents,
  onViewSession,
}: {
  year: number; month: number; days: (number | null)[];
  monthNames: string[]; dayNames: string[];
  onPrevMonth: () => void; onNextMonth: () => void;
  selectedDate: string | null; onSelectDate: (d: string | null) => void;
  selectedDateEvents: string[];
  onViewSession: (session: string) => void;
}) {
  return (
    <div className="p-3 sm:p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <button onClick={onPrevMonth} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="text-base sm:text-xl font-bold text-white tracking-wide">{monthNames[month]} {year}</h2>
        <button onClick={onNextMonth} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-[10px] sm:text-xs text-zinc-500 font-semibold uppercase py-1 sm:py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="h-14 sm:h-20" />;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = getEventsForDate(year, month, day);
          const hasEvents = events.length > 0;
          const isSelected = selectedDate === dateKey;
          const isToday = year === new Date().getFullYear() && month === new Date().getMonth() && day === new Date().getDate();
          return (
            <button
              key={day}
              onClick={() => onSelectDate(isSelected ? null : dateKey)}
              className={`h-14 sm:h-20 rounded-md sm:rounded-lg border transition-all text-left p-1 sm:p-2 flex flex-col overflow-hidden ${
                isSelected ? "border-amber-500 bg-amber-600/10"
                : hasEvents ? "border-zinc-700 bg-zinc-800/60 hover:border-amber-600/50 hover:bg-zinc-800"
                : "border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-900/50"
              }`}
            >
              <span className={`text-xs sm:text-sm font-bold ${isToday ? "text-amber-400" : isSelected ? "text-white" : hasEvents ? "text-zinc-200" : "text-zinc-600"}`}>{day}</span>
              {hasEvents && (
                <div className="mt-0.5 sm:mt-1 flex flex-col gap-0.5 overflow-hidden">
                  <span className="sm:hidden w-1 h-1 rounded-full bg-amber-400" />
                  {events.slice(0, 2).map((ev) => (<span key={ev} className="hidden sm:inline text-[9px] text-amber-400/80 truncate leading-tight">{ev}</span>))}
                  {events.length > 2 && <span className="hidden sm:inline text-[9px] text-zinc-500">+{events.length - 2} more</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
            <h3 className="text-sm font-bold text-white">{selectedDate}</h3>
          </div>
          {selectedDateEvents.length > 0 ? (
            <div className="divide-y divide-zinc-800/50">
              {selectedDateEvents.map((session) => (
                <div key={session} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors">
                  <div>
                    <span className="text-sm text-zinc-200">{session}</span>
                    <span className="text-xs text-zinc-500 ml-2">{mockSessionInfo.competition.nameE}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewSession(session)}
                      className="px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                      View
                    </button>
                    <button className="px-3 py-1.5 rounded-md text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors">CSV</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-zinc-600"><p className="text-sm">No sessions on this date</p></div>
          )}
        </div>
      )}

      <div className="mt-6 sm:mt-8">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Past Events</h3>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-x-auto">
          <table className="w-full min-w-[480px]">
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
                <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? "bg-zinc-900/40" : ""}`}>
                  <td className="py-2.5 px-4 text-sm text-zinc-500 font-mono">{entry.localTime.split(" ")[0]}</td>
                  <td className="py-2.5 px-4 text-sm text-amber-400">{entry.event}</td>
                  <td className="py-2.5 px-4 text-sm text-zinc-300">{entry.session}</td>
                  <td className="py-2.5 px-4 text-center">
                    {entry.hasResults ? (
                      <button
                        onClick={() => onViewSession(entry.session)}
                        className="px-3 py-1 rounded text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                      >Results</button>
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

// ========== Shared UI ==========

function SummaryCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5 border border-zinc-700/50">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-lg font-bold font-mono mt-0.5 leading-none ${accent ? "text-fuchsia-400" : "text-white"}`}>{value || "---"}</div>
      <div className="text-[10px] text-zinc-600 mt-1">{sub}</div>
    </div>
  );
}

/**
 * スマホ用のコンパクトな横並び指標。
 * 1 行の高さ ~40px に収まり、各 chip は値の長さに応じて自然に伸びるため切れない。
 * 全体は overflow-x-auto で横スクロール可能。
 */
function MetricChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 px-2 py-1 rounded-md border border-zinc-700/50 bg-zinc-800/60 flex-shrink-0 whitespace-nowrap">
      <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-xs font-bold font-mono ${accent ? "text-fuchsia-400" : "text-white"}`}>
        {value || "---"}
      </span>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
