/**
 * 区間進入の壁時計。Timing / Tracking でページをまたいでも共有する。
 * Tracking を開いたときに「通過待ちで止まる」のではなく、
 * いまの区間の途中位置から動き出せるようにする。
 */

export type SectorEnterEntry = {
  legKey: number;
  enteredAtMs: number;
};

const clock = new Map<string, SectorEnterEntry>();

export function sectorLegKey(lap: number, sectorNo: number): number {
  return lap * 4 + sectorNo;
}

/** 周/区間が変わったときだけ進入時刻を更新する。同じ区間なら既存時刻を維持。
 *  時刻は performance.now() 基準 (Tracking アニメと同じ時計)。 */
export function noteSectorEnter(
  teamId: string,
  lap: number,
  sectorNo: number,
  atMs: number = typeof performance !== "undefined" ? performance.now() : Date.now(),
): void {
  const legKey = sectorLegKey(lap, sectorNo);
  const prev = clock.get(teamId);
  if (!prev || prev.legKey !== legKey) {
    clock.set(teamId, { legKey, enteredAtMs: atMs });
  }
}

export function getSectorEnter(teamId: string): SectorEnterEntry | undefined {
  return clock.get(teamId);
}

export function clearSectorEnter(teamId: string): void {
  clock.delete(teamId);
}

export function clearAllSectorEnters(): void {
  clock.clear();
}
