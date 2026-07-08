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
  getDriverName,
  getMockPersonalData,
} from "@/data/mock";
import { formatTime } from "@/lib/format";
import { TIME_COLORS } from "@/lib/colors";
import { useLiveTiming } from "@/hooks/useLiveTiming";
import {
  colWidthStyle,
  getStickyLeftOffsets,
  stickyCellClass,
  stickyTdStyle,
  type TableColumn,
} from "@/lib/timingTableLayout";
import type { Standing, DriverPersonalData } from "@/types/smis";

const CLASSIFICATION_COLUMNS: TableColumn[] = [
  { key: "p", minW: 36, pct: "3.5%", align: "text-center" },
  { key: "pic", minW: 36, pct: "3.5%", align: "text-center" },
  { key: "no", minW: 44, pct: "4%", align: "text-center" },
  { key: "class", minW: 52, pct: "5%", align: "text-center" },
  { key: "name", minW: 100, pct: "12%", align: "text-left pl-2" },
  { key: "team", minW: 120, pct: "14%", align: "text-left pl-2" },
  { key: "best", minW: 88, pct: "9%", align: "text-right pr-3" },
  { key: "lap", minW: 40, pct: "4%", align: "text-center" },
  { key: "gap", minW: 72, pct: "7%", align: "text-right pr-3" },
  { key: "last", minW: 80, pct: "8%", align: "text-right pr-3" },
  { key: "s1", minW: 68, pct: "6.5%", align: "text-right pr-3" },
  { key: "s2", minW: 68, pct: "6.5%", align: "text-right pr-3" },
  { key: "s3", minW: 68, pct: "6%", align: "text-right pr-3" },
  { key: "pits", minW: 40, pct: "4%", align: "text-center" },
  { key: "laps", minW: 40, pct: "4%", align: "text-center" },
];

const CLASSIFICATION_STICKY_KEYS = ["p", "pic", "no", "class"];
const CLASSIFICATION_FIRST_STICKY = "p";
const CLASSIFICATION_LAST_STICKY = "class";

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

/**
 * リザルトの並び順。MOLA が付けた position を正とする (ライブタイミング表と同じ)。
 * 決勝は周回数＋走行順、予選/専有はベストタイム順が position に反映されている。
 * position 0 (未出走・コース車など) や 0 周の車両は末尾へ送る。
 */
function sortStandingsForResult(standings: Standing[]): Standing[] {
  const rank = (p: number) => (p > 0 ? p : Number.MAX_SAFE_INTEGER);
  return [...standings].sort((a, b) => rank(a.position) - rank(b.position) || a.order - b.order);
}

interface CsvMeta {
  competition: string;
  category: string;
  session: string;
}

function csvSafe(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function generateClassificationCsv(standings: Standing[], meta: CsvMeta): string {
  const metaLines = [
    `# Competition: ${meta.competition}`,
    `# Category: ${meta.category}`,
    `# Session: ${meta.session}`,
    "",
  ];
  const header = "Position,Class Position,No.,Class,Name,Team,Best Time,Best Lap,Last Lap Time,Laps,S1,S2,S3,Pits,Status";
  const rows = standings.map((s, idx) => {
    const team = getTeamByStanding(s);
    const cls = getClassByStanding(s);
    return [
      idx + 1, s.classPosition, team?.no ?? "", csvSafe(cls?.nameE ?? ""), csvSafe(getDriverName(s, team)), csvSafe(team?.nameE ?? ""),
      formatTime(s.bestTime), s.bestTimeLap, formatTime(s.lastLapTime), s.lap,
      formatTime(s.sectors[0]?.time), formatTime(s.sectors[1]?.time), formatTime(s.sectors[2]?.time),
      s.pits, s.status.replace("_", " ").toUpperCase(),
    ].join(",");
  });
  return [...metaLines, header, ...rows].join("\n");
}

function generateIndividualCsv(standing: Standing, data: DriverPersonalData, meta: CsvMeta): string {
  const team = getTeamByStanding(standing);
  const cls = getClassByStanding(standing);
  const info = [
    `# Competition: ${meta.competition}`,
    `# Category: ${meta.category}`,
    `# Session: ${meta.session}`,
    `# No.${team?.no} ${team?.nameE} (${cls?.nameE})`,
    `# Driver: ${getDriverName(standing, team)}`,
    `# Best Lap: ${formatTime(data.bestLapTime)} (Lap ${data.bestLap})`,
    `# Best S1: ${formatTime(data.bestS1)}  Best S2: ${formatTime(data.bestS2)}  Best S3: ${formatTime(data.bestS3)}`,
    "",
  ];
  const header = "Lap,Lap Time,S1,S2,S3,Position,Pit";
  const rows = data.laps.map((l) =>
    [l.lap, formatTime(l.lapTime), formatTime(l.s1), formatTime(l.s2), formatTime(l.s3), l.position > 0 ? l.position : "", l.isPit ? "P" : ""].join(",")
  );
  return [...info, header, ...rows].join("\n");
}

function fileSafe(v: string): string {
  return (v || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_") || "NA";
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

  // ライブ接続 (/ws)。データ受信時は mock の代わりにライブ順位を使う。
  const live = useLiveTiming();
  const isLive = live.hasData;
  const baseStandings = isLive ? live.standings : mockStandings;
  const classes = isLive ? live.classes : mockClasses;
  const sessionMeta = isLive && live.sessionInfo ? live.sessionInfo : mockSessionInfo;
  const competitionName = sessionMeta.competition.nameE || sessionMeta.competition.nameJ;
  // カテゴリー名は Competition 名（例:「2026 … FIA-F4 JAPANESE CHAMPIONSHIP」）をそのまま使う。
  const categoryName = competitionName;
  const sessionName = sessionMeta.session.nameE || sessionMeta.session.nameJ;
  const csvMeta: CsvMeta = {
    competition: competitionName,
    category: categoryName,
    session: sessionName,
  };

  const sortedStandings = useMemo(() => {
    const base = classFilter
      ? baseStandings.filter((s) => getClassByStanding(s)?.nameE === classFilter)
      : baseStandings;
    return sortStandingsForResult(base);
  }, [classFilter, baseStandings]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return EVENT_DATES[selectedDate] || [];
  }, [selectedDate]);

  const handleDownloadClassification = () => {
    const cat = fileSafe(categoryName);
    const ses = fileSafe(sessionName);
    downloadCsv(`Classification_${cat}_${ses}_${makeTimestamp()}.csv`, generateClassificationCsv(sortedStandings, csvMeta));
  };

  const getPersonal = (s: Standing) =>
    isLive ? live.getPersonalData(s.teamId) : getMockPersonalData(s);

  const handleDownloadIndividual = (s: Standing) => {
    const team = getTeamByStanding(s);
    const data = getPersonal(s);
    const cat = fileSafe(categoryName);
    const ses = fileSafe(sessionName);
    downloadCsv(`Laps_${cat}_${ses}_No${team?.no}_${makeTimestamp()}.csv`, generateIndividualCsv(s, data, csvMeta));
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
        classes={classes}
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
            {competitionName}
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
        className={`flex-1 transition-all duration-300 min-w-0 ${
          activeTab === "individual"
            ? "overflow-hidden flex flex-col min-h-0"
            : "overflow-y-auto overflow-x-hidden"
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
            getPersonal={getPersonal}
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
          personalData={getPersonal(selectedStanding)}
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
  const stickyOffsets = getStickyLeftOffsets(CLASSIFICATION_COLUMNS, CLASSIFICATION_STICKY_KEYS);
  const headerLabels: Record<string, string> = {
    p: "P", pic: "PIC", no: "No.", class: "Class", name: "Name", team: "Team",
    best: "Best Time", lap: "Lap", gap: "Gap", last: "Last Lap",
    s1: "S1", s2: "S2", s3: "S3", pits: "Pits", laps: "Laps",
  };

  return (
    <div className="p-3 sm:p-4 flex flex-col min-w-0">
      <div className="flex-shrink-0 flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
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
        <div className="flex-shrink-0 mb-3">
          <span className="text-xs text-zinc-500">Filtered by: </span>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-zinc-700 text-white">{classFilter}</span>
        </div>
      )}

      <div className="timing-table-scroll-x min-w-0">
        <table
          className="timing-table w-full"
          style={{
            fontSize: "var(--timing-fs)",
            tableLayout: "fixed",
            minWidth: `${CLASSIFICATION_COLUMNS.reduce((sum, c) => sum + c.minW, 0)}px`,
          }}
        >
          <colgroup>
            {CLASSIFICATION_COLUMNS.map((col) => (
              <col key={col.key} style={colWidthStyle(col, stickyOffsets)} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b-2 border-red-700 bg-zinc-800">
              {CLASSIFICATION_COLUMNS.map((col) => {
                const isSticky = stickyOffsets.has(col.key);
                return (
                  <th
                    key={col.key}
                    className={`py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider ${col.align} ${
                      isSticky
                        ? stickyCellClass(col.key, stickyOffsets, CLASSIFICATION_FIRST_STICKY, CLASSIFICATION_LAST_STICKY)
                        : ""
                    }`}
                    style={isSticky ? { left: `${stickyOffsets.get(col.key)}px` } : undefined}
                  >
                    {headerLabels[col.key]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const team = getTeamByStanding(s);
              const cls = getClassByStanding(s);
              if (!team) return null;
              // Gap はサーバー計算値 (決勝=周回/タイム差、予選=ベストタイム差、60秒以上は分表記)。
              const gap = idx === 0 || !s.gap || s.gap === "—" ? "" : s.gap;
              const isEven = idx % 2 === 0;
              const sticky = (colKey: string, className: string) =>
                `${stickyCellClass(colKey, stickyOffsets, CLASSIFICATION_FIRST_STICKY, CLASSIFICATION_LAST_STICKY, isEven)} ${className}`.trim();
              const stickyStyle = (colKey: string) => stickyTdStyle(colKey, stickyOffsets);
              return (
                <tr
                  key={s.teamId}
                  onClick={() => onRowClick(s)}
                  className={`group border-b border-zinc-800/70 hover:bg-zinc-800/50 transition-colors cursor-pointer ${isEven ? "bg-zinc-900/40" : "bg-zinc-900/20"}`}
                >
                  <td className={sticky("p", "py-1.5 px-2 text-center font-bold text-white font-mono")} style={stickyStyle("p")}>
                    {idx + 1}
                  </td>
                  <td className={sticky("pic", "py-1.5 px-2 text-center text-zinc-400 font-mono")} style={stickyStyle("pic")}>
                    {s.classPosition}
                  </td>
                  <td className={sticky("no", "py-1.5 px-2 text-center")} style={stickyStyle("no")}>
                    <span className="inline-block w-8 h-6 rounded text-white text-xs font-bold leading-6 text-center" style={{ backgroundColor: cls?.color || "#71717a" }}>{team.no}</span>
                  </td>
                  <td className={sticky("class", "py-1.5 px-2 text-center text-xs text-zinc-400")} style={stickyStyle("class")}>
                    {cls?.nameE}
                  </td>
                  <td className="py-1.5 pl-2 pr-1 text-left text-zinc-200 truncate">{getDriverName(s, team)}</td>
                  <td className="py-1.5 pl-2 pr-1 text-left text-zinc-300 truncate max-w-[200px]">{team.nameE}</td>
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
  getPersonal,
}: {
  standings: Standing[];
  target: Standing | null;
  onSelectTarget: (s: Standing | null) => void;
  onDownload: (s: Standing) => void;
  getPersonal: (s: Standing) => DriverPersonalData;
}) {
  const personalData = target ? getPersonal(target) : null;
  const team = target ? getTeamByStanding(target) : null;
  const cls = target ? getClassByStanding(target) : null;

  return (
    // スマホは縦並び、md (768px) 以上で左右 2 ペイン。
    // スマホでの選択リストは水平 chips（横スクロール）に切り替えて、画面幅を奪わない。
    <div className="p-3 sm:p-4 flex flex-col md:flex-row md:gap-4 gap-3 h-full min-h-0">
      {/* PC: 左サイドの縦リスト */}
      <div className="hidden md:flex w-72 flex-shrink-0 flex-col border border-zinc-700 rounded-xl bg-zinc-900/80 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-700 bg-zinc-800/50">
          <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Select Name</span>
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
                    {getDriverName(s, t)}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
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
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Select Name</span>
          <span className="text-[10px] text-zinc-500">{standings.length} entries</span>
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
                    {getDriverName(s, t)}
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-tight truncate max-w-[120px]">
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
              <p className="text-xs sm:text-sm">Select a name to view individual results</p>
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
                  <div className="text-white font-bold text-sm truncate">{getDriverName(target, team)}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-zinc-400">
                    <span className="truncate max-w-[180px]">{team.nameE}</span>
                    <span className="text-zinc-600">|</span>
                    <span>{cls?.nameE}</span>
                    {team.machine && (
                      <>
                        <span className="text-zinc-600">|</span>
                        <span className="truncate max-w-[140px]">{team.machine}</span>
                      </>
                    )}
                    {team.tire && (
                      <>
                        <span className="text-zinc-600">|</span>
                        <span>{team.tire}</span>
                      </>
                    )}
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
                      } ${lap.isPit ? "bg-blue-900/10" : ""} ${
                        lap.inProgress ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30" : ""
                      }`}
                    >
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center font-mono text-zinc-400">
                        {lap.lap}
                        {lap.inProgress && <span className="ml-1 text-[9px] text-amber-400 font-bold align-middle">●</span>}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono font-bold ${lap.inProgress ? "text-amber-400" : TIME_COLORS[lap.lapTimeType]}`}>
                        {lap.inProgress ? "LIVE" : formatTime(lap.lapTime)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${TIME_COLORS[lap.s1Type]}`}>
                        {formatTime(lap.s1)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${TIME_COLORS[lap.s2Type]}`}>
                        {formatTime(lap.s2)}
                      </td>
                      <td className={`py-1 sm:py-1.5 px-2 sm:px-3 text-right font-mono ${lap.inProgress && lap.isPit && lap.s3 == null ? "text-red-500 font-bold" : TIME_COLORS[lap.s3Type]}`}>
                        {lap.inProgress && lap.isPit && lap.s3 == null ? "In Pit" : formatTime(lap.s3)}
                      </td>
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center font-mono text-zinc-500">
                        {lap.position > 0 ? lap.position : ""}
                      </td>
                      <td className="py-1 sm:py-1.5 px-2 sm:px-3 text-center">
                        {lap.isPit && <span className={`font-bold text-[10px] ${lap.inProgress ? "text-red-500" : "text-cyan-400"}`}>P</span>}
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
