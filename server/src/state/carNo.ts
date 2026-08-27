/**
 * SMIS の車番 (Team.No)。数値だけではなく "001" や "100A" が来る。
 * Number() すると先頭ゼロとアルファベットが消えるので、文字列のまま扱う。
 */
export function parseCarNo(raw: unknown): string {
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return String(Math.trunc(raw));
    }
    if (typeof raw === "string") return raw.trim();
    return "";
}

/** 走行前の並び用。先頭の数字列を使う ("001"→1, "100A"→100)。 */
export function carNoSortValue(no: string): number {
    const m = no.match(/\d+/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function isCourseCarNo(no: string | number | null | undefined): boolean {
    return String(no ?? "").trim() === "999";
}
