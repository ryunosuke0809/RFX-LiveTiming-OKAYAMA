"use client";

import type { Standing, Team, CarClass } from "@/types/smis";
import type { CarColMode, GapColMode, LapColMode, PitColMode } from "./TimingTable";
import { TIME_COLORS, STATUS_COLORS } from "@/lib/colors";
import { formatTime, formatPitTime } from "@/lib/format";
import ClassBadge from "./ClassBadge";
import PitTimer from "./PitTimer";

interface TimingRowProps {
  standing: Standing;
  team: Team | undefined;
  carClass: CarClass | undefined;
  isEven: boolean;
  carCol: CarColMode;
  gapCol: GapColMode;
  lapCol: LapColMode;
  pitCol: PitColMode;
  isRaceMode: boolean;
  sectorFlash?: 0 | 1 | 2 | 3; // 0=FL(行全体), 1=S1, 2=S2, 3=S3
}

function getSectorFlashClass(type: string): string {
  if (type === "overall_best") return "sector-flash sector-flash-ob";
  if (type === "personal_best") return "sector-flash sector-flash-pb";
  return "sector-flash sector-flash-cur";
}

export default function TimingRow({ standing, team, carClass, isEven, carCol, gapCol, lapCol, pitCol, isRaceMode, sectorFlash }: TimingRowProps) {
  const rowBg = isEven ? "bg-zinc-900/60" : "bg-zinc-900/30";
  const statusBg = STATUS_COLORS[standing.status];

  const driverName =
    team?.drivers.find((d) => d.no === standing.driverNo)?.nameE ||
    team?.drivers[1]?.nameE ||
    "---";

  const carCellValue = carCol === "team" ? (team?.nameE || "---") : (team?.machine || "---");
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
      return <PitTimer />;
    }
    if (standing.pitTime != null && standing.pits > 0) {
      return <span className="text-zinc-300 font-mono">{formatPitTime(standing.pitTime / 10000)}</span>;
    }
    return <span className="text-zinc-600">---</span>;
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

  return (
    <tr className={`${rowBg} ${posFlashClass} ${flFlashClass} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/40`}>
      {/* P */}
      <td className="py-1 text-center">
        <span className={`inline-flex items-center justify-center rounded-sm font-bold text-white ${statusBg}`}
          style={{ width: "1.4em", height: "1.3em", fontSize: "0.9em" }}>
          {standing.position}
        </span>
      </td>
      {isRaceMode && (
        <td className="py-1 text-center" style={{ fontSize: "0.75em" }}>
          {renderPosChange()}
        </td>
      )}
      <td className="py-1 text-center text-zinc-400 font-mono">{standing.classPosition}</td>
      <td className="py-1 text-center font-bold text-white font-mono">{team?.no}</td>
      <td className="py-1 text-center"><ClassBadge className={carClass?.nameE || "---"} /></td>
      <td className="py-1 pl-2 pr-1 text-zinc-200 truncate overflow-hidden whitespace-nowrap">{driverName}</td>
      <td className="py-1 pl-2 pr-1 text-zinc-400 truncate overflow-hidden whitespace-nowrap">{carCellValue}</td>
      <td className={`py-1 text-center font-mono ${lapCellColor}`}
        style={lapCol !== "laps" ? { fontSize: "0.85em" } : undefined}>
        {lapCellValue}
      </td>
      <td className="py-1 px-2 sm:pr-3 text-right font-mono text-zinc-300">{gapCellValue}</td>
      <td className={`py-1 px-2 sm:pr-3 text-right font-mono ${TIME_COLORS[standing.bestTimeType]}`}>
        {formatTime(standing.bestTime)}
      </td>
      <td className={`py-1 px-2 sm:pr-3 text-right font-mono ${TIME_COLORS[standing.sectors[0]?.type || "none"]} ${s1Flash}`}>
        {formatTime(standing.sectors[0]?.time)}
      </td>
      <td className={`py-1 px-2 sm:pr-3 text-right font-mono ${TIME_COLORS[standing.sectors[1]?.type || "none"]} ${s2Flash}`}>
        {formatTime(standing.sectors[1]?.time)}
      </td>
      <td className={`py-1 px-2 sm:pr-3 text-right font-mono ${TIME_COLORS[standing.sectors[2]?.type || "none"]} ${s3Flash}`}>
        {formatTime(standing.sectors[2]?.time)}
      </td>
      <td className="py-1 px-2 sm:pr-3 text-right">{renderPitCell()}</td>
    </tr>
  );
}
