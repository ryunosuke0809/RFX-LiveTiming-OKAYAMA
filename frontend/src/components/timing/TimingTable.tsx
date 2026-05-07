"use client";

import type { Standing, Team, CarClass } from "@/types/smis";
import TimingRow from "./TimingRow";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
}

const COLUMNS = [
  { key: "pos", label: "P", className: "w-10 text-center" },
  { key: "pic", label: "PIC", className: "w-10 text-center" },
  { key: "change", label: "+/-", className: "w-10 text-center" },
  { key: "nr", label: "Nr", className: "w-12 text-center" },
  { key: "class", label: "Class", className: "w-16 text-center" },
  { key: "driver", label: "Driver", className: "text-left pl-2" },
  { key: "team", label: "Team", className: "text-left hidden lg:table-cell" },
  { key: "laps", label: "Laps", className: "w-12 text-center" },
  { key: "gap", label: "Gap", className: "w-20 text-right pr-2" },
  { key: "interval", label: "Int", className: "w-20 text-right pr-2 hidden xl:table-cell" },
  { key: "best", label: "Best", className: "w-20 text-right pr-2" },
  { key: "s1", label: "S1", className: "w-16 text-right pr-1" },
  { key: "s2", label: "S2", className: "w-16 text-right pr-1" },
  { key: "s3", label: "S3", className: "w-16 text-right pr-1" },
  { key: "pits", label: "Pits", className: "w-10 text-center" },
];

export default function TimingTable({ standings, classFilter }: TimingTableProps) {
  const filtered = classFilter
    ? standings.filter((s) => {
        const cls = getClassByStanding(s);
        return cls?.nameE === classFilter;
      })
    : standings;

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-800 border-b-2 border-zinc-600">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider ${col.className}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((standing, idx) => (
            <TimingRow
              key={standing.teamId}
              standing={standing}
              team={getTeamByStanding(standing)}
              carClass={getClassByStanding(standing)}
              isEven={idx % 2 === 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
