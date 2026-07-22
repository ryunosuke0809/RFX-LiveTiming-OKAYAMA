import type { CarClass, Standing } from "@/types/smis";
import { getClassByStanding } from "@/data/mock";

/** CLASS 名が OIC（大文字小文字無視）なら非表示対象。 */
export function isOicClassName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toUpperCase() === "OIC";
}

export function isOicStanding(standing: Standing): boolean {
  const cls = getClassByStanding(standing);
  return isOicClassName(cls?.nameE) || isOicClassName(cls?.nameJ);
}

export function excludeOicStandings(standings: Standing[]): Standing[] {
  return standings.filter((s) => !isOicStanding(s));
}

export function excludeOicClasses(classes: CarClass[]): CarClass[] {
  return classes.filter(
    (c) => !isOicClassName(c.nameE) && !isOicClassName(c.nameJ),
  );
}
