"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Standing, Team, CarClass } from "@/types/smis";
import type { CarColMode, GapColMode, LapColMode, PitColMode, BestColMode } from "./TimingTable";
import { TIME_COLORS } from "@/lib/colors";
import { formatTime, formatPitTime } from "@/lib/format";
import ClassBadge from "./ClassBadge";
import PitTimer from "./PitTimer";
import { getDriverName } from "@/data/mock";
import { stickyCellClass, stickyTdStyle, type TableColumn } from "@/lib/timingTableLayout";

interface TimingRowProps {
  standing: Standing;
  team: Team | undefined;
  carClass: CarClass | undefined;
  isEven: boolean;
  columns: TableColumn[];
  carCol: CarColMode;
  gapCol: GapColMode;
  lapCol: LapColMode;
  pitCol: PitColMode;
  bestCol: BestColMode;
  isRaceMode: boolean;
  sectorFlash?: 0 | 1 | 2 | 3; // 0=FL(行全体), 1=S1, 2=S2, 3=S3
  stickyOffsets: Map<string, number>;
  firstStickyKey: string;
  lastStickyKey: string;
  onClick?: () => void;
}

function getSectorFlashClass(type: string): string {
  if (type === "overall_best") return "sector-flash sector-flash-ob";
  if (type === "personal_best") return "sector-flash sector-flash-pb";
  return "sector-flash sector-flash-cur";
}

const STATUS_INDICATOR: Record<string, { label: string; color: string }> = {
  in_pit: { label: "P", color: "text-red-500" },
};

const CELL_CLASS: Record<string, string> = {
  status: "py-px text-center font-bold",
  pos: "py-px text-center font-bold text-white font-mono",
  chg: "py-px text-center",
  pic: "py-px text-center text-zinc-400 font-mono",
  nr: "py-px text-center font-bold text-white font-mono",
  class: "py-px text-center",
  driver: "py-px pl-2 pr-1 text-zinc-200 truncate overflow-hidden whitespace-nowrap",
  car: "py-px pl-2 pr-1 text-zinc-400 truncate overflow-hidden whitespace-nowrap",
  laps: "py-px text-center font-mono whitespace-nowrap",
  gap: "py-px px-2 sm:pr-3 text-right font-mono text-zinc-300 whitespace-nowrap",
  best: "py-px px-2 sm:pr-3 text-right font-mono whitespace-nowrap",
  s1: "py-px px-2 sm:pr-3 text-right font-mono whitespace-nowrap",
  s2: "py-px px-2 sm:pr-3 text-right font-mono whitespace-nowrap",
  s3: "py-px px-2 sm:pr-3 text-right font-mono whitespace-nowrap",
  pit: "py-px px-2 sm:pr-3 text-right whitespace-nowrap",
};

export default function TimingRow({
  standing, team, carClass, isEven, columns, carCol, gapCol, lapCol, pitCol, bestCol,
  isRaceMode, sectorFlash, stickyOffsets, firstStickyKey, lastStickyKey, onClick,
}: TimingRowProps) {
  const sticky = (colKey: string, className: string) =>
    `${stickyCellClass(colKey, stickyOffsets, firstStickyKey, lastStickyKey, isEven)} ${className}`.trim();
  const stickyStyle = (colKey: string) => stickyTdStyle(colKey, stickyOffsets);
  const rowBg = isEven ? "bg-zinc-900/60" : "bg-zinc-900/30";
  if (standing.blanked) {
    return (
      <tr className={`${rowBg} border-b border-zinc-800/30`}>
        {columns.map((col) => {
          const rendered = {
            className: CELL_CLASS[col.key] ?? "py-px",
            content: col.key === "nr" ? team?.no : null,
          };
          return (
            <td
              key={col.key}
              className={sticky(col.key, rendered.className)}
              style={stickyStyle(col.key)}
            >
              {rendered.content}
            </td>
          );
        })}
      </tr>
    );
  }

  const statusInfo = STATUS_INDICATOR[standing.status];

  const driverName = getDriverName(standing, team);

  // Car モードはマシン名。MOLA はマシン名を送らないため、無ければチーム名にフォールバック。
  const teamName = team?.nameE || team?.nameJ || "---";
  const carCellValue = carCol === "team" ? teamName : (team?.machine || teamName);
  const gapCellValue = gapCol === "int" ? standing.interval : standing.gap;

  let lapCellValue: string;
  let lapCellColor = "text-zinc-300";
  if (lapCol === "time") {
    lapCellValue = formatTime(standing.lastPassingTime);
  } else if (lapCol === "last") {
    lapCellValue = formatTime(standing.lastLapTime);
    lapCellColor = TIME_COLORS[standing.lastLapTimeType] || "text-zinc-300";
  } else {
    lapCellValue = String(standing.lap);
  }

  const renderPitCell = () => {
    if (pitCol === "count") {
      return <span className="text-zinc-400 font-mono">{standing.pits}</span>;
    }
    if (standing.status === "in_pit") {
      const start = standing.pitEnteredAt ? Date.parse(standing.pitEnteredAt) : NaN;
      if (Number.isFinite(start)) {
        return <PitTimer startedAtMs={start} />;
      }
      return <span className="text-zinc-600 font-mono">{formatPitTime(0)}</span>;
    }
    if (standing.pitTime != null && standing.pitTime > 0) {
      return <span className="text-zinc-300 font-mono">{formatPitTime(standing.pitTime / 10000)}</span>;
    }
    return <span className="text-zinc-600 font-mono">{formatPitTime(0)}</span>;
  };

  const change = standing.positionChange;
  const posFlashClass = isRaceMode && change !== 0
    ? (change > 0 ? "pos-up" : "pos-down")
    : "";

  const flFlashClass = sectorFlash === 0 ? "fl-flash" : "";

  const s1Flash = sectorFlash === 1 ? getSectorFlashClass(standing.sectors[0]?.type || "current") : "";
  const s2Flash = sectorFlash === 2 ? getSectorFlashClass(standing.sectors[1]?.type || "current") : "";
  const s3Flash = sectorFlash === 3 ? getSectorFlashClass(standing.sectors[2]?.type || "current") : "";

  const renderPosChange = () => {
    if (change === 0) {
      return <span className="text-zinc-600">-</span>;
    }
    if (change > 0) {
      return <span className="text-green-400 font-bold">▲{change}</span>;
    }
    return <span className="text-red-400 font-bold">▼{Math.abs(change)}</span>;
  };

  const cell = (key: string): { className: string; style?: CSSProperties; content: ReactNode } => {
    switch (key) {
      case "status":
        return {
          className: CELL_CLASS.status,
          style: { fontSize: "0.85em" },
          content: statusInfo ? <span className={statusInfo.color}>{statusInfo.label}</span> : null,
        };
      case "pos":
        return {
          className: CELL_CLASS.pos,
          content: standing.position > 0 ? standing.position : "—",
        };
      case "chg":
        return {
          className: CELL_CLASS.chg,
          style: { fontSize: "0.75em" },
          content: renderPosChange(),
        };
      case "pic":
        return {
          className: CELL_CLASS.pic,
          content: standing.classPosition > 0 ? standing.classPosition : "—",
        };
      case "nr":
        return { className: CELL_CLASS.nr, content: team?.no };
      case "class":
        return {
          className: CELL_CLASS.class,
          content: <ClassBadge className={carClass?.nameE || "---"} />,
        };
      case "driver":
        return { className: CELL_CLASS.driver, content: driverName };
      case "car":
        return { className: CELL_CLASS.car, content: carCellValue };
      case "laps":
        return {
          className: `${CELL_CLASS.laps} ${lapCellColor}`,
          style: lapCol !== "laps" ? { fontSize: "0.85em" } : undefined,
          content: lapCellValue,
        };
      case "gap":
        return { className: CELL_CLASS.gap, content: gapCellValue };
      case "best":
        return {
          className: `${CELL_CLASS.best} ${bestCol === "bestlap" ? "text-zinc-300" : TIME_COLORS[standing.bestTimeType]}`,
          content: bestCol === "bestlap"
            ? (standing.bestTimeLap > 0 ? `L${standing.bestTimeLap}` : "—")
            : formatTime(standing.bestTime),
        };
      case "s1":
        return {
          className: `${CELL_CLASS.s1} ${TIME_COLORS[standing.sectors[0]?.type || "none"]} ${s1Flash}`,
          content: formatTime(standing.sectors[0]?.time),
        };
      case "s2":
        return {
          className: `${CELL_CLASS.s2} ${TIME_COLORS[standing.sectors[1]?.type || "none"]} ${s2Flash}`,
          content: formatTime(standing.sectors[1]?.time),
        };
      case "s3":
        return {
          className: `${CELL_CLASS.s3} ${
            standing.status === "in_pit" && !standing.sectors[2]?.time
              ? "text-red-500 font-bold"
              : TIME_COLORS[standing.sectors[2]?.type || "none"]
          } ${s3Flash}`,
          content:
            standing.status === "in_pit" && !standing.sectors[2]?.time
              ? "In Pit"
              : formatTime(standing.sectors[2]?.time),
        };
      case "pit":
        return { className: CELL_CLASS.pit, content: renderPitCell() };
      default:
        return { className: "py-px", content: null };
    }
  };

  return (
    <tr
      className={`group ${rowBg} ${posFlashClass} ${flFlashClass} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/30 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {columns.map((col) => {
        const rendered = cell(col.key);
        return (
          <td
            key={col.key}
            className={sticky(col.key, rendered.className)}
            style={{ ...rendered.style, ...stickyStyle(col.key) }}
          >
            {rendered.content}
          </td>
        );
      })}
    </tr>
  );
}
