"use client";

import { useEffect, useState } from "react";
import type { Standing } from "@/types/smis";
import TimingRow from "./TimingRow";
import ColumnToggle from "./ColumnToggle";
import ScrollHintArea from "@/components/shared/ScrollHintArea";
import { getTeamByStanding, getClassByStanding } from "@/data/mock";
import { recomputeStandingsGaps } from "@/lib/format";
import { useLiveDisplayColumns, getLiveDisplayColumns } from "@/lib/liveDisplaySync";
import {
  resolvedToggleValue,
  visibleLiveColumns,
  visibleToggleOptions,
  type LiveColumnDef,
} from "@/lib/liveColumns";
import {
  colWidthStyle,
  getStickyColumnKeys,
  getStickyLeftOffsets,
  stickyCellClass,
  type TableColumn,
} from "@/lib/timingTableLayout";

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
  onRowClick?: (standing: Standing) => void;
}

export type CarColMode = "car" | "team";
export type GapColMode = "gap" | "int";
export type LapColMode = "laps" | "time" | "last";
export type PitColMode = "count" | "time";
export type BestColMode = "best" | "bestlap";

function toTableColumns(defs: LiveColumnDef[], isRaceMode: boolean): TableColumn[] {
  return visibleLiveColumns(defs, isRaceMode).map((c) => ({
    key: c.key,
    minW: c.minW,
    pct: isRaceMode ? c.pctRace : c.pct,
    align: c.align,
  }));
}

function defByKey(defs: LiveColumnDef[], key: string): LiveColumnDef | undefined {
  return defs.find((c) => c.key === key);
}

export default function TimingTable({ standings, classFilter, flashKey = 0, isRaceMode = false, sectorFlashes = [], onRowClick }: TimingTableProps) {
  const displayColumns = useLiveDisplayColumns();
  const [carCol, setCarCol] = useState<CarColMode>(
    () => resolvedToggleValue(defByKey(getLiveDisplayColumns(), "car"), undefined) as CarColMode,
  );
  const [gapCol, setGapCol] = useState<GapColMode>(
    () => resolvedToggleValue(defByKey(getLiveDisplayColumns(), "gap"), undefined) as GapColMode,
  );
  const [lapCol, setLapCol] = useState<LapColMode>(
    () => resolvedToggleValue(defByKey(getLiveDisplayColumns(), "laps"), undefined) as LapColMode,
  );
  const [pitCol, setPitCol] = useState<PitColMode>(
    () => resolvedToggleValue(defByKey(getLiveDisplayColumns(), "pit"), undefined) as PitColMode,
  );
  const [bestCol, setBestCol] = useState<BestColMode>(
    () => resolvedToggleValue(defByKey(getLiveDisplayColumns(), "best"), undefined) as BestColMode,
  );

  useEffect(() => {
    setCarCol((cur) => resolvedToggleValue(defByKey(displayColumns, "car"), cur) as CarColMode);
    setGapCol((cur) => resolvedToggleValue(defByKey(displayColumns, "gap"), cur) as GapColMode);
    setLapCol((cur) => resolvedToggleValue(defByKey(displayColumns, "laps"), cur) as LapColMode);
    setPitCol((cur) => resolvedToggleValue(defByKey(displayColumns, "pit"), cur) as PitColMode);
    setBestCol((cur) => resolvedToggleValue(defByKey(displayColumns, "best"), cur) as BestColMode);
  }, [displayColumns]);

  const columns = toTableColumns(displayColumns, isRaceMode);
  const stickyKeys = getStickyColumnKeys(columns.map((c) => c.key), isRaceMode);
  const stickyOffsets = getStickyLeftOffsets(columns, stickyKeys);
  const firstStickyKey = stickyKeys[0] ?? "";
  const lastStickyKey = stickyKeys[stickyKeys.length - 1] ?? "";

  const filtered = (() => {
    if (!classFilter) return standings;
    const rows = standings.filter((s) => getClassByStanding(s)?.id === classFilter);
    return recomputeStandingsGaps(rows, isRaceMode);
  })();

  const renderHeader = (col: TableColumn) => {
    const def = defByKey(displayColumns, col.key);
    const options = visibleToggleOptions(def);
    if (options.length > 1) {
      const current =
        col.key === "car" ? carCol
        : col.key === "gap" ? gapCol
        : col.key === "laps" ? lapCol
        : col.key === "pit" ? pitCol
        : col.key === "best" ? bestCol
        : options[0]!.value;
      const onChange = (value: string) => {
        if (col.key === "car") setCarCol(value as CarColMode);
        else if (col.key === "gap") setGapCol(value as GapColMode);
        else if (col.key === "laps") setLapCol(value as LapColMode);
        else if (col.key === "pit") setPitCol(value as PitColMode);
        else if (col.key === "best") setBestCol(value as BestColMode);
      };
      return <ColumnToggle options={options} current={current} onChange={onChange} />;
    }
    if (options.length === 1) return options[0]!.label;
    return def?.label ?? col.key;
  };

  const totalMinW = columns.reduce((sum, c) => sum + c.minW, 0);

  return (
    <ScrollHintArea
      axis="both"
      className="flex-1 min-h-0"
      contentClassName="timing-table-scroll h-full"
    >
      <table
        className="timing-table"
        style={{ tableLayout: "fixed", fontSize: "var(--timing-fs)", minWidth: `${totalMinW}px`, width: "100%" }}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={colWidthStyle(col, stickyOffsets)} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-800 border-b-2 border-red-700">
            {columns.map((col) => {
              const isSticky = stickyOffsets.has(col.key);
              return (
                <th
                  key={col.key}
                  className={`py-1 font-semibold text-white uppercase tracking-wider ${col.align} ${
                    isSticky
                      ? stickyCellClass(col.key, stickyOffsets, firstStickyKey, lastStickyKey)
                      : ""
                  }`}
                  style={{
                    fontSize: "var(--timing-fs-sm)",
                    ...(isSticky ? { left: `${stickyOffsets.get(col.key)}px` } : {}),
                  }}
                >
                  {renderHeader(col)}
                </th>
              );
            })}
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
                columns={columns}
                carCol={carCol}
                gapCol={gapCol}
                lapCol={lapCol}
                pitCol={pitCol}
                bestCol={bestCol}
                isRaceMode={isRaceMode}
                sectorFlash={standing.blanked ? undefined : sf?.sector}
                stickyOffsets={stickyOffsets}
                firstStickyKey={firstStickyKey}
                lastStickyKey={lastStickyKey}
                onClick={
                  onRowClick && !standing.blanked ? () => onRowClick(standing) : undefined
                }
              />
            );
          })}
        </tbody>
      </table>
    </ScrollHintArea>
  );
}
