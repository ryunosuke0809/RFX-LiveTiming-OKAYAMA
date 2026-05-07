"use client";

import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
}

const COLUMNS = [
  { key: "pos", label: "P", width: "3%", align: "text-center" },
  { key: "pic", label: "PIC", width: "3%", align: "text-center" },
  { key: "nr", label: "Nr", width: "3.5%", align: "text-center" },
  { key: "class", label: "Class", width: "5.5%", align: "text-center" },
  { key: "driver", label: "Driver", width: "16%", align: "text-left pl-2" },
  { key: "car", label: "Car", width: "26%", align: "text-left pl-2" },
  { key: "laps", label: "Laps", width: "4%", align: "text-center" },
  { key: "gap", label: "Gap", width: "8%", align: "text-right pr-2" },
  { key: "best", label: "Best", width: "8%", align: "text-right pr-2" },
  { key: "s1", label: "S1", width: "6.5%", align: "text-right pr-2" },
  { key: "s2", label: "S2", width: "6.5%", align: "text-right pr-2" },
  { key: "s3", label: "S3", width: "6.5%", align: "text-right pr-2" },
  { key: "pits", label: "Pits", width: "3.5%", align: "text-center" },
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
      <table
        className="w-full border-collapse"
        style={{ tableLayout: "fixed", fontSize: "var(--timing-fs)" }}
      >
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
                className={`py-1.5 font-semibold text-white uppercase tracking-wider ${col.align}`}
                style={{ fontSize: "var(--timing-fs-sm)" }}
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
