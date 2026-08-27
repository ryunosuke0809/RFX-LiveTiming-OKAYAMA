/** SMIS 車番。数値 / "001" / "100A" を表示用の文字列にする。 */
export function asCarNo(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string") return raw.trim();
  return "";
}
