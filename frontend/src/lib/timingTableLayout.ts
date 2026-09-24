import type { CSSProperties } from "react";

export interface TableColumn {
  key: string;
  minW: number;
  pct: string;
  align: string;
  /** true なら % ではなく minW の固定幅（タイム列の桁あふれ防止） */
  fixed?: boolean;
}

/** STATUS + POS / PIC / No. / Class（レース時は順位変動 chg も含む）。
 *  先頭から連続している sticky 列だけ固定する。途中で通常列が来たら打ち切る。 */
export function getStickyColumnKeys(visibleKeys: string[], isRaceMode: boolean): string[] {
  const sticky = new Set(["status", "pos", "pic", "nr", "class"]);
  if (isRaceMode) sticky.add("chg");
  const keys: string[] = [];
  for (const key of visibleKeys) {
    if (!sticky.has(key)) break;
    keys.push(key);
  }
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

/** sticky / 固定幅列は minW を実幅にする。% 指定だと狭い画面でタイムが隣へはみ出す。 */
export function colWidthStyle(
  col: TableColumn,
  stickyOffsets: Map<string, number>,
): { width: string; minWidth: string; maxWidth?: string } {
  if (stickyOffsets.has(col.key) || col.fixed) {
    const w = `${col.minW}px`;
    return { width: w, minWidth: w, maxWidth: w };
  }
  return { width: col.pct, minWidth: `${col.minW}px` };
}

/** th/td にも同じ幅を付ける。Safari は col の width を無視して縮めることがある。 */
export function colCellStyle(
  col: TableColumn,
  stickyOffsets: Map<string, number>,
): CSSProperties {
  return {
    ...colWidthStyle(col, stickyOffsets),
    ...stickyTdStyle(col.key, stickyOffsets),
  };
}
