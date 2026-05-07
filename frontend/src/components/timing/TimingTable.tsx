"use client";

import { useState } from "react";
import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import ColumnToggle from "./ColumnToggle";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
  flashKey?: number;
  isRaceMode?: boolean;
}

export type CarColMode = "car" | "team";
export type GapColMode = "gap" | "int";
export type LapColMode = "laps" | "time" | "last";
export type PitColMode = "count" | "time";

const CAR_OPTIONS = [
  { value: "car", label: "Car" },
  { value: "team", label: "Team" },
];

const GAP_OPTIONS = [
  { value: "gap", label: "Gap" },
  { value: "int", label: "Int" },
];

const LAP_OPTIONS = [
  { value: "laps", label: "Laps" },
  { value: "time", label: "Time" },
  { value: "last", label: "Last" },
];

const PIT_OPTIONS = [
  { value: "count", label: "PIT" },
  { value: "time", label: "PIT Time" },
];

function getColumns(isRaceMode: boolean) {
  const cols = [
    { key: "pos", width: isRaceMode ? "2.5%" : "3%", align: "text-center" },
  ];
  if (isRaceMode) {
    cols.push({ key: "chg", width: "2.5%", align: "text-center" });
  }
  cols.push(
    { key: "pic", width: "3%", align: "text-center" },
    { key: "nr", width: "3.5%", align: "text-center" },
    { key: "class", width: "5.5%", align: "text-center" },
    { key: "driver", width: isRaceMode ? "14.5%" : "16%", align: "text-left pl-2" },
    { key: "car", width: isRaceMode ? "24.5%" : "26%", align: "text-left pl-2" },
    { key: "laps", width: "4%", align: "text-center" },
    { key: "gap", width: "8%", align: "text-right pr-2" },
    { key: "best", width: "8%", align: "text-right pr-2" },
    { key: "s1", width: "6.5%", align: "text-right pr-2" },
    { key: "s2", width: "6.5%", align: "text-right pr-2" },
    { key: "s3", width: "6%", align: "text-right pr-2" },
    { key: "pit", width: "5.5%", align: "text-right pr-2" },
  );
  return cols;
}

const FIXED_LABELS: Record<string, string> = {
  pos: "P", chg: "", pic: "PIC", nr: "Nr", class: "Class",
  driver: "Driver", best: "Best",
  s1: "S1", s2: "S2", s3: "S3",
};

export default function TimingTable({ standings, classFilter, flashKey = 0, isRaceMode = false }: TimingTableProps) {
  const [carCol, setCarCol] = useState<CarColMode>("car");
  const [gapCol, setGapCol] = useState<GapColMode>("gap");
  const [lapCol, setLapCol] = useState<LapColMode>("laps");
  const [pitCol, setPitCol] = useState<PitColMode>("count");

  const columns = getColumns(isRaceMode);

  const filtered = classFilter
    ? standings.filter((s) => {
        const cls = getClassByStanding(s);
        return cls?.nameE === classFilter;
      })
    : standings;

  const renderHeader = (col: typeof columns[number]) => {
    if (col.key === "car") {
      return <ColumnToggle options={CAR_OPTIONS} current={carCol} onChange={(v) => setCarCol(v as CarColMode)} />;
    }
    if (col.key === "gap") {
      return <ColumnToggle options={GAP_OPTIONS} current={gapCol} onChange={(v) => setGapCol(v as GapColMode)} />;
    }
    if (col.key === "laps") {
      return <ColumnToggle options={LAP_OPTIONS} current={lapCol} onChange={(v) => setLapCol(v as LapColMode)} />;
    }
    if (col.key === "pit") {
      return <ColumnToggle options={PIT_OPTIONS} current={pitCol} onChange={(v) => setPitCol(v as PitColMode)} />;
    }
    return FIXED_LABELS[col.key] ?? col.key;
  };

  return (
    <div className="flex-1 overflow-auto">
      <table
        className="w-full border-collapse"
        style={{ tableLayout: "fixed", fontSize: "var(--timing-fs)" }}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-800 border-b-2 border-red-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-1.5 font-semibold text-white uppercase tracking-wider ${col.align}`}
                style={{ fontSize: "var(--timing-fs-sm)" }}
              >
                {renderHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((standing, idx) => {
            const hasChange = standing.positionChange !== 0;
            return (
              <TimingRow
                key={hasChange ? `${standing.teamId}-${flashKey}` : standing.teamId}
                standing={standing}
                team={getTeamByStanding(standing)}
                carClass={getClassByStanding(standing)}
                isEven={idx % 2 === 0}
                carCol={carCol}
                gapCol={gapCol}
                lapCol={lapCol}
                pitCol={pitCol}
                isRaceMode={isRaceMode}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
