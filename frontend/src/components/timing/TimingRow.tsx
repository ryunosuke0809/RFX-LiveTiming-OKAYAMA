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
  const rowBg = isEven ? "bg-zinc-900/60" : "bg-zinc-900/30";
  const statusBg = STATUS_COLORS[standing.status];

  const driverName =
    team?.drivers.find((d) => d.no === standing.driverNo)?.nameE ||
    team?.drivers[1]?.nameE ||
    "---";

  return (
    <tr className={`${rowBg} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/40`}>
      {/* P */}
      <td className="py-0.5 text-center">
        <span className={`inline-flex items-center justify-center w-[22px] h-[20px] rounded-sm text-[12px] font-bold text-white ${statusBg}`}>
          {standing.position}
        </span>
      </td>
      {/* PIC */}
      <td className="py-0.5 text-center text-[12px] text-zinc-400 font-mono">
        {standing.classPosition}
      </td>
      {/* Nr */}
      <td className="py-0.5 text-center text-[12px] font-bold text-white font-mono">
        {team?.no}
      </td>
      {/* Class */}
      <td className="py-0.5 text-center">
        <ClassBadge className={carClass?.nameE || "---"} />
      </td>
      {/* Driver */}
      <td className="py-0.5 px-2 text-[12px] text-zinc-200 truncate overflow-hidden whitespace-nowrap">
        {driverName}
      </td>
      {/* Car */}
      <td className="py-0.5 px-2 text-[12px] text-zinc-400 truncate overflow-hidden whitespace-nowrap">
        {team?.machine}
      </td>
      {/* Laps */}
      <td className="py-0.5 text-center text-[12px] text-zinc-300 font-mono">
        {standing.lap}
      </td>
      {/* Gap */}
      <td className="py-0.5 pr-2 text-right text-[12px] font-mono text-zinc-300">
        {standing.gap}
      </td>
      {/* Best */}
      <td className={`py-0.5 pr-2 text-right text-[12px] font-mono ${TIME_COLORS[standing.bestTimeType]}`}>
        {formatTime(standing.bestTime)}
      </td>
      {/* S1 */}
      <td className={`py-0.5 pr-1 text-right text-[12px] font-mono ${TIME_COLORS[standing.sectors[0]?.type || "none"]}`}>
        {formatTime(standing.sectors[0]?.time)}
      </td>
      {/* S2 */}
      <td className={`py-0.5 pr-1 text-right text-[12px] font-mono ${TIME_COLORS[standing.sectors[1]?.type || "none"]}`}>
        {formatTime(standing.sectors[1]?.time)}
      </td>
      {/* S3 */}
      <td className={`py-0.5 pr-1 text-right text-[12px] font-mono ${TIME_COLORS[standing.sectors[2]?.type || "none"]}`}>
        {formatTime(standing.sectors[2]?.time)}
      </td>
      {/* Pits */}
      <td className="py-0.5 text-center text-[12px] text-zinc-400 font-mono">
        {standing.pits}
      </td>
    </tr>
  );
}
