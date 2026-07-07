import type { CarClass, Team } from "@/types/smis";

/**
 * ライブ (/ws) 接続中に、mock の getTeamByStanding / getClassByStanding が
 * ライブのチーム・クラスを解決できるようにするための軽量レジストリ。
 *
 * useLiveTiming がデータ受信時に登録し、mock のルックアップ関数がまず参照する。
 * 未接続 (null) のときは mock 自身のデータにフォールバックする。
 */

let teamMap: Map<string, Team> | null = null;
let classMap: Map<string, CarClass> | null = null;

export function setLiveEntities(
  teams: Map<string, Team> | null,
  classes: Map<string, CarClass> | null,
): void {
  teamMap = teams;
  classMap = classes;
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
