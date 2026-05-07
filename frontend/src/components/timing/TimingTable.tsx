"use client";

import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
}

const COLUMNS = [
  { key: "pos", label: "P", width: "30px" },
  { key: "pic", label: "PIC", width: "32px" },
  { key: "nr", label: "Nr", width: "34px" },
  { key: "class", label: "Class", width: "52px" },
  { key: "driver", label: "Driver", width: "140px" },
  { key: "car", label: "Car", width: "220px" },
  { key: "laps", label: "Laps", width: "40px" },
  { key: "gap", label: "Gap", width: "76px" },
  { key: "best", label: "Best", width: "76px" },
  { key: "s1", label: "S1", width: "62px" },
  { key: "s2", label: "S2", width: "62px" },
  { key: "s3", label: "S3", width: "62px" },
  { key: "pits", label: "Pits", width: "32px" },
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
      <table className="border-collapse" style={{ tableLayout: "fixed" }}>
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
