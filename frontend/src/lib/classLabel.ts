import type { CarClass } from "@/types/smis";

/**
 * クラスの画面表示名。
 * SMIS が NameE/NameJ を空で送るクラス（VITA の S など）は "S" として出す。
 */
export function classDisplayName(
  cls: Pick<CarClass, "nameE" | "nameJ"> | null | undefined,
): string {
  const name = (cls?.nameE || cls?.nameJ || "").trim();
  return name || "S";
}
