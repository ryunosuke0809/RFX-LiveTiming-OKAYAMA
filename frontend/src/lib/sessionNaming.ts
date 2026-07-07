/**
 * MOLA の Competition 名から、CSV ファイル名や表示に使う短縮カテゴリー名
 * （例: FIA-F4 / SFL）を導出する。
 *
 * MOLA データ上の名称対応:
 *  - Competition.NameJ … シリーズ名（例: "2026 … FIA-F4 JAPANESE CHAMPIONSHIP"）→ カテゴリーの元
 *  - Category.NameJ    … 走行区分（例: "専有走行 1回目"）→ こちらは「セッション名」として扱う
 */

const CATEGORY_RULES: { re: RegExp; label: string }[] = [
  { re: /FIA[\s\u30fb-]?F4/i, label: "FIA-F4" },
  { re: /スーパー\s*フォーミュラ\s*[\u30fb・]?\s*ライツ|SUPER\s*FORMULA\s*LIGHTS|ライツ選手権/i, label: "SFL" },
  { re: /スーパー\s*フォーミュラ|SUPER\s*FORMULA/i, label: "SF" },
  { re: /スーパー\s*GT|SUPER\s*GT/i, label: "SGT" },
];

/** Competition 名から短縮カテゴリー名を返す。該当なしは元の名称にフォールバック。 */
export function deriveCategoryLabel(competitionNameJ: string, competitionNameE?: string): string {
  const text = `${competitionNameJ ?? ""} ${competitionNameE ?? ""}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.label;
  }
  return (competitionNameE || competitionNameJ || "").trim();
}
