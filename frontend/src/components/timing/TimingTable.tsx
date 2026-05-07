"use client";

import { useState } from "react";
import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import ColumnToggle from "./ColumnToggle";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";

export interface SectorFlash {
  teamId: string;
  sector: 0 | 1 | 2 | 3; // 0=FL, 1=S1, 2=S2, 3=S3
  key: number;
}

interface TimingTableProps {
  standings: Standing[];
  classFilter: string | null;
  flashKey?: number;
  isRaceMode?: boolean;
  sectorFlashes?: SectorFlash[];
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
    { key: "pos", minW: 32, pct: isRaceMode ? "2.5%" : "3%", align: "text-center" },
  ];
  if (isRaceMode) {
    cols.push({ key: "chg", minW: 32, pct: "2.5%", align: "text-center" });
  }
  cols.push(
    { key: "pic", minW: 28, pct: "3%", align: "text-center" },
    { key: "nr", minW: 30, pct: "3.5%", align: "text-center" },
    { key: "class", minW: 48, pct: "5.5%", align: "text-center" },
    { key: "driver", minW: 100, pct: isRaceMode ? "14.5%" : "16%", align: "text-left pl-2" },
    { key: "car", minW: 120, pct: isRaceMode ? "24.5%" : "26%", align: "text-left pl-2" },
    { key: "laps", minW: 40, pct: "4%", align: "text-center" },
    { key: "gap", minW: 80, pct: "8%", align: "text-right pr-3" },
    { key: "best", minW: 88, pct: "8%", align: "text-right pr-3" },
    { key: "s1", minW: 72, pct: "6.5%", align: "text-right pr-3" },
    { key: "s2", minW: 72, pct: "6.5%", align: "text-right pr-3" },
    { key: "s3", minW: 72, pct: "6%", align: "text-right pr-3" },
    { key: "pit", minW: 60, pct: "5.5%", align: "text-right pr-3" },
  );
  return cols;
}

const FIXED_LABELS: Record<string, string> = {
  pos: "P", chg: "", pic: "PIC", nr: "Nr", class: "Class",
  driver: "Driver", best: "Best",
  s1: "S1", s2: "S2", s3: "S3",
};

export default function TimingTable({ standings, classFilter, flashKey = 0, isRaceMode = false, sectorFlashes = [] }: TimingTableProps) {
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

  const totalMinW = columns.reduce((sum, c) => sum + c.minW, 0);

  return (
    <div className="flex-1 overflow-auto">
      <table
        className="border-collapse"
        style={{ tableLayout: "fixed", fontSize: "var(--timing-fs)", minWidth: `${totalMinW}px`, width: "100%" }}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: col.pct, minWidth: `${col.minW}px` }} />
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
            const sf = sectorFlashes.find((f) => f.teamId === standing.teamId);
            const rowKey = sf
              ? `${standing.teamId}-sf-${sf.key}`
              : hasChange
                ? `${standing.teamId}-${flashKey}`
                : standing.teamId;

            return (
              <TimingRow
                key={rowKey}
                standing={standing}
                team={getTeamByStanding(standing)}
                carClass={getClassByStanding(standing)}
                isEven={idx % 2 === 0}
                carCol={carCol}
                gapCol={gapCol}
                lapCol={lapCol}
                pitCol={pitCol}
                isRaceMode={isRaceMode}
                sectorFlash={sf?.sector}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
