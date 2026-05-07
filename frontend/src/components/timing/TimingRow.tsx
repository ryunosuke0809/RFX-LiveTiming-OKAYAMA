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
    posChange > 0 ? "text-green-400" : posChange < 0 ? "text-red-400" : "text-zinc-700";

  const rowBg = isEven ? "bg-zinc-900/60" : "bg-zinc-900/30";
  const statusBg = STATUS_COLORS[standing.status];

  const driverName =
    team?.drivers.find((d) => d.no === standing.driverNo)?.nameE ||
    team?.drivers[1]?.nameE ||
    "---";

  return (
    <tr className={`${rowBg} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/40 h-[22px]`}>
      {/* P */}
      <td className="px-0 py-0 text-center w-[22px]">
        <span className={`inline-flex items-center justify-center w-[18px] h-[17px] rounded-sm text-[10px] font-bold text-white ${statusBg}`}>
          {standing.position}
        </span>
      </td>
      {/* PIC */}
      <td className="px-0 py-0 text-center text-[10px] text-zinc-400 font-mono w-[24px]">
        {standing.classPosition}
      </td>
      {/* +/- */}
      <td className={`px-0 py-0 text-center text-[10px] font-mono w-[24px] ${posChangeColor}`}>
        {posChangeText}
      </td>
      {/* Nr */}
      <td className="px-0 py-0 text-center text-[11px] font-bold text-white font-mono w-[28px]">
        {team?.no}
      </td>
      {/* Class */}
      <td className="px-0.5 py-0 text-center w-[40px]">
        <ClassBadge className={carClass?.nameE || "---"} />
      </td>
      {/* Driver */}
      <td className="px-1 py-0 text-[11px] text-zinc-200 truncate max-w-[120px]">
        {driverName}
      </td>
      {/* Team / Car */}
      <td className="px-1 py-0 text-[10px] text-zinc-400 truncate max-w-[180px]">
        {team?.machine}
      </td>
      {/* Laps */}
      <td className="px-0 py-0 text-center text-[10px] text-zinc-300 font-mono w-[30px]">
        {standing.lap}
      </td>
      {/* Gap */}
      <td className="px-1 py-0 text-right text-[10px] font-mono text-zinc-300 w-[60px]">
        {standing.gap}
      </td>
      {/* Best */}
      <td className={`px-1 py-0 text-right text-[10px] font-mono w-[62px] ${TIME_COLORS[standing.bestTimeType]}`}>
        {formatTime(standing.bestTime)}
      </td>
      {/* S1 */}
      <td className={`px-0.5 py-0 text-right text-[10px] font-mono w-[50px] ${TIME_COLORS[standing.sectors[0]?.type || "none"]}`}>
        {formatTime(standing.sectors[0]?.time)}
      </td>
      {/* S2 */}
      <td className={`px-0.5 py-0 text-right text-[10px] font-mono w-[50px] ${TIME_COLORS[standing.sectors[1]?.type || "none"]}`}>
        {formatTime(standing.sectors[1]?.time)}
      </td>
      {/* S3 */}
      <td className={`px-0.5 py-0 text-right text-[10px] font-mono w-[50px] ${TIME_COLORS[standing.sectors[2]?.type || "none"]}`}>
        {formatTime(standing.sectors[2]?.time)}
      </td>
      {/* Pits */}
      <td className="px-0 py-0 text-center text-[10px] text-zinc-400 font-mono w-[24px]">
        {standing.pits}
      </td>
    </tr>
  );
}
