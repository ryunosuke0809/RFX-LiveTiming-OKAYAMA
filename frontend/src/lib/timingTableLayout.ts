import type { CSSProperties } from "react";

export interface TableColumn {
  key: string;
  minW: number;
  pct: string;
  align: string;
}

/** STATUS + POS / PIC / No. / Class（レース時は順位変動 chg も含む） */
export function getStickyColumnKeys(isRaceMode: boolean): string[] {
  const keys = ["status", "pos"];
  if (isRaceMode) keys.push("chg");
  keys.push("pic", "nr", "class");
  return keys;
}

export function getStickyLeftOffsets(
  columns: TableColumn[],
  stickyKeys: string[],
): Map<string, number> {
  const stickySet = new Set(stickyKeys);
  const offsets = new Map<string, number>();
  let left = 0;
  for (const col of columns) {
    if (stickySet.has(col.key)) {
      offsets.set(col.key, left);
      left += col.minW;
    }
  }
  return offsets;
}

export function stickyCellClass(
  colKey: string,
  stickyOffsets: Map<string, number>,
  firstStickyKey: string,
  lastStickyKey: string,
  isEven?: boolean,
): string {
  if (!stickyOffsets.has(colKey)) return "";
  const parts = ["timing-sticky-col"];
  if (isEven !== undefined) {
    parts.push(isEven ? "timing-sticky-even" : "timing-sticky-odd");
  }
  if (colKey === firstStickyKey) parts.push("timing-sticky-col-first");
  if (colKey === lastStickyKey) parts.push("timing-sticky-col-last");
  return parts.join(" ");
}

export function stickyTdStyle(
  colKey: string,
  stickyOffsets: Map<string, number>,
): CSSProperties | undefined {
  const left = stickyOffsets.get(colKey);
  if (left === undefined) return undefined;
  return { left: `${left}px` };
}

/** sticky 列は minW の固定幅にして left オフセットと実幅を一致させる */
export function colWidthStyle(
  col: TableColumn,
  stickyOffsets: Map<string, number>,
): { width: string; minWidth: string } {
  if (stickyOffsets.has(col.key)) {
    const w = `${col.minW}px`;
    return { width: w, minWidth: w };
  }
  return { width: col.pct, minWidth: `${col.minW}px` };
}
