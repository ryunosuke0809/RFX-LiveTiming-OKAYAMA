"use client";

import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
}

const COLUMNS = [
  { key: "pos", label: "P", width: "3%" },
  { key: "pic", label: "PIC", width: "3%" },
  { key: "nr", label: "Nr", width: "3.5%" },
  { key: "class", label: "Class", width: "5.5%" },
  { key: "driver", label: "Driver", width: "16%" },
  { key: "car", label: "Car", width: "26%" },
  { key: "laps", label: "Laps", width: "4%" },
  { key: "gap", label: "Gap", width: "8%" },
  { key: "best", label: "Best", width: "8%" },
  { key: "s1", label: "S1", width: "6.5%" },
  { key: "s2", label: "S2", width: "6.5%" },
  { key: "s3", label: "S3", width: "6.5%" },
  { key: "pits", label: "Pits", width: "3.5%" },
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
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-800 border-b-2 border-red-700">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="py-1.5 text-[12px] font-semibold text-zinc-400 uppercase tracking-wider text-center"
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
