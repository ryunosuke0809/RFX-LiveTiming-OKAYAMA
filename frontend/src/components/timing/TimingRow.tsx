"use client";

import type { Standing, Team, CarClass } from "@/types/smis";
import { TIME_COLORS, STATUS_COLORS } from "@/lib/colors";
import { formatTime } from "@/lib/format";
import ClassBadge from "./ClassBadge";

interface TimingRowProps {
  standing: Standing;
  team: Team | undefined;
  carClass: CarClass | undefined;
  isEven: boolean;
}

export default function TimingRow({ standing, team, carClass, isEven }: TimingRowProps) {
  const posChange = standing.positionChange;
  const posChangeText =
    posChange > 0 ? `+${posChange}` : posChange < 0 ? `${posChange}` : "";
  const posChangeColor =
    posChange > 0 ? "text-green-400" : posChange < 0 ? "text-red-400" : "text-zinc-600";

  const rowBg = isEven ? "bg-zinc-900/60" : "bg-zinc-900/30";
  const statusBg = STATUS_COLORS[standing.status];

  const driverName =
    team?.drivers.find((d) => d.no === standing.driverNo)?.nameE ||
    team?.drivers[1]?.nameE ||
    "---";

  return (
    <tr className={`${rowBg} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/50`}>
      {/* P (Position) */}
      <td className="w-10 text-center py-1.5">
        <span
          className={`inline-flex items-center justify-center w-7 h-6 rounded text-xs font-bold text-white ${statusBg}`}
        >
          {standing.position}
        </span>
      </td>

      {/* PIC */}
      <td className="w-10 text-center text-xs text-zinc-400 font-mono">
        {standing.classPosition}
      </td>

      {/* +/- */}
      <td className={`w-10 text-center text-xs font-mono ${posChangeColor}`}>
        {posChangeText}
      </td>

      {/* Nr */}
      <td className="w-12 text-center text-sm font-bold text-white font-mono">
        {team?.no}
      </td>

      {/* Class */}
      <td className="w-16 text-center">
        <ClassBadge className={carClass?.nameE || "---"} />
      </td>

      {/* Driver */}
      <td className="text-sm text-zinc-200 pl-2 truncate max-w-[140px]">
        {driverName}
      </td>

      {/* Team */}
      <td className="text-xs text-zinc-400 truncate max-w-[160px] hidden lg:table-cell">
        {team?.nameE}
      </td>

      {/* Laps */}
      <td className="w-12 text-center text-xs text-zinc-300 font-mono">
        {standing.lap}
      </td>

      {/* Gap */}
      <td className="w-20 text-right text-xs font-mono text-zinc-300 pr-2">
        {standing.gap}
      </td>

      {/* Interval */}
      <td className="w-20 text-right text-xs font-mono text-zinc-400 pr-2 hidden xl:table-cell">
        {standing.interval}
      </td>

      {/* Best */}
      <td className={`w-20 text-right text-xs font-mono pr-2 ${TIME_COLORS[standing.bestTimeType]}`}>
        {formatTime(standing.bestTime)}
      </td>

      {/* S1 */}
      <td className={`w-16 text-right text-xs font-mono pr-1 ${TIME_COLORS[standing.sectors[0]?.type || "none"]}`}>
        {formatTime(standing.sectors[0]?.time)}
      </td>

      {/* S2 */}
      <td className={`w-16 text-right text-xs font-mono pr-1 ${TIME_COLORS[standing.sectors[1]?.type || "none"]}`}>
        {formatTime(standing.sectors[1]?.time)}
      </td>

      {/* S3 */}
      <td className={`w-16 text-right text-xs font-mono pr-1 ${TIME_COLORS[standing.sectors[2]?.type || "none"]}`}>
        {formatTime(standing.sectors[2]?.time)}
      </td>

      {/* Pits */}
      <td className="w-10 text-center text-xs text-zinc-400 font-mono">
        {standing.pits}
      </td>
    </tr>
  );
}
