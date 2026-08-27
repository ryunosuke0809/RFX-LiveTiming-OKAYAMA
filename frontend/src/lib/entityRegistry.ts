import type { CarClass, Team } from "@/types/smis";

/**
 * ライブ (/ws) 接続中に、mock の getTeamByStanding / getClassByStanding が
 * ライブのチーム・クラスを解決できるようにするための軽量レジストリ。
 *
 * useLiveTiming がデータ受信時に登録し、mock のルックアップ関数がまず参照する。
 * 未接続 (null) のときは mock 自身のデータにフォールバックする。
 *
 * リザルトの過去セッション表示中は pause する。MOLA はセッションが変わっても
 * TeamId を使い回すため、ライブ更新で車番・ドライバー・チーム名が差し替わる。
 */

let teamMap: Map<string, Team> | null = null;
let classMap: Map<string, CarClass> | null = null;
let writePaused = false;

export function setLiveEntities(
  teams: Map<string, Team> | null,
  classes: Map<string, CarClass> | null,
  opts?: { force?: boolean },
): void {
  if (writePaused && !opts?.force) return;
  teamMap = teams;
  classMap = classes;
}

/** 過去リザルト表示中など、ライブ受信による上書きを止める。 */
export function pauseLiveEntityWrites(): void {
  writePaused = true;
}

export function resumeLiveEntityWrites(): void {
  writePaused = false;
}

export function resolveLiveTeam(teamId: string): Team | undefined {
  return teamMap?.get(teamId);
}

export function resolveLiveClass(classId: string): CarClass | undefined {
  return classMap?.get(classId);
}

export function hasLiveEntities(): boolean {
  return teamMap !== null && teamMap.size > 0;
}
