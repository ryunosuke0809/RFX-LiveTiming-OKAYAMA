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
    <tr className={`${rowBg} hover:bg-zinc-700/40 transition-colors border-b border-zinc-800/40 h-[28px]`}>
      {/* P */}
      <td className="px-0.5 py-0 text-center w-[34px]">
        <span className={`inline-flex items-center justify-center w-[26px] h-[22px] rounded-sm text-[13px] font-bold text-white ${statusBg}`}>
          {standing.position}
        </span>
      </td>
      {/* PIC */}
      <td className="px-0 py-0 text-center text-[13px] text-zinc-400 font-mono w-[38px]">
        {standing.classPosition}
      </td>
      {/* Nr */}
      <td className="px-0 py-0 text-center text-[13px] font-bold text-white font-mono w-[44px]">
        {team?.no}
      </td>
      {/* Class */}
      <td className="px-1 py-0 text-center w-[60px]">
        <ClassBadge className={carClass?.nameE || "---"} />
      </td>
      {/* Driver */}
      <td className="px-3 py-0 text-[13px] text-zinc-200 truncate">
        {driverName}
      </td>
      {/* Car */}
      <td className="px-3 py-0 text-[13px] text-zinc-400 truncate">
        {team?.machine}
      </td>
      {/* Laps */}
      <td className="px-0 py-0 text-center text-[13px] text-zinc-300 font-mono w-[48px]">
        {standing.lap}
      </td>
      {/* Gap */}
      <td className="px-3 py-0 text-right text-[13px] font-mono text-zinc-300 w-[90px]">
        {standing.gap}
      </td>
      {/* Best */}
      <td className={`px-3 py-0 text-right text-[13px] font-mono w-[90px] ${TIME_COLORS[standing.bestTimeType]}`}>
        {formatTime(standing.bestTime)}
      </td>
      {/* S1 */}
      <td className={`px-2 py-0 text-right text-[13px] font-mono w-[72px] ${TIME_COLORS[standing.sectors[0]?.type || "none"]}`}>
        {formatTime(standing.sectors[0]?.time)}
      </td>
      {/* S2 */}
      <td className={`px-2 py-0 text-right text-[13px] font-mono w-[72px] ${TIME_COLORS[standing.sectors[1]?.type || "none"]}`}>
        {formatTime(standing.sectors[1]?.time)}
      </td>
      {/* S3 */}
      <td className={`px-2 py-0 text-right text-[13px] font-mono w-[72px] ${TIME_COLORS[standing.sectors[2]?.type || "none"]}`}>
        {formatTime(standing.sectors[2]?.time)}
      </td>
      {/* Pits */}
      <td className="px-0 py-0 text-center text-[13px] text-zinc-400 font-mono w-[38px]">
        {standing.pits}
      </td>
    </tr>
  );
}
