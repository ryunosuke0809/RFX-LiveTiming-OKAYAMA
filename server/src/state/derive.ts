import type { TimeType, TrackFlag } from "./types.js";

/**
 * 純粋関数だけを集めたユーティリティ。
 * テストしやすいよう副作用は持たず、入力 → 出力のみ。
 */

/**
 * SMIS の 1/10000 秒整数を表示文字列に変換。
 *   1013520 → "1:41.352"
 *   935910  → "1:33.591"
 *   123450  → "12.345"
 * 0 / null は "—" を返す。
 */
export function formatLapTime(time10000: number | null): string {
    if (time10000 === null || time10000 <= 0) return "—";
    const totalMs = Math.round(time10000 / 10); // ms
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    if (minutes > 0) {
        return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
    }
    return `${seconds}.${String(ms).padStart(3, "0")}`;
}

/**
 * トップとの gap を文字列化。
 *
 * - 自分がトップ → "—"
 * - 周回違い      → "+2L" (lap 差)
 * - 同一周回      → "+1.234" (lastPassingTime 差を秒で)
 */
export function formatGap(
    selfLap: number,
    selfLastPassing: number | null,
    topLap: number,
    topLastPassing: number | null,
): string {
    if (selfLap === topLap && selfLastPassing !== null && topLastPassing !== null) {
        const diff10000 = selfLastPassing - topLastPassing;
        if (diff10000 <= 0) return "—";
        return `+${(diff10000 / 10000).toFixed(3)}`;
    }
    const lapDiff = topLap - selfLap;
    if (lapDiff <= 0) return "—";
    return `+${lapDiff}L`;
}

/**
 * 1 つの bestTime に対する TimeType を判定。
 *
 * - 全体ベスト (= overallBest) → "overall_best"
 * - チーム個人ベスト更新 → "personal_best"
 * - そうでなければ "current"
 * - null → "none"
 */
export function classifyTimeType(
    candidate: number | null,
    overallBest: number | null,
    teamPersonalBest: number | null,
): TimeType {
    if (candidate === null || candidate <= 0) return "none";
    if (overallBest !== null && candidate <= overallBest) return "overall_best";
    if (teamPersonalBest === null || candidate <= teamPersonalBest) return "personal_best";
    return "current";
}

/**
 * RaceControl Message テキストから旗を推定する。
 * SMIS の正式な旗 enum が無いため、メッセージ文字列をマッチさせる簡易実装。
 */
export function parseFlagFromMessage(text: string): TrackFlag | null {
    if (!text) return null;
    const t = text.toUpperCase();
    if (t.includes("CHEQUER")) return "chequered";
    if (t.includes("FCY") || t.includes("FULL COURSE YELLOW")) return "fcy";
    if (t.includes("SAFETY CAR") || t.includes("SC IN") || t.includes("SC OUT")) return "white";
    if (t.includes("RED FLAG") || t.includes("レッドフラッグ")) return "red";
    if (t.includes("YELLOW") || t.includes("イエロー")) return "yellow";
    if (t.includes("GREEN") || t.includes("グリーン")) return "green";
    if (t.includes("BLACK")) return "black";
    return null;
}

/**
 * Passing の LoopID から推定される状態。
 *
 * SMIS 仕様:
 *   0    -- コントロールライン
 *   1-3  -- セクター
 *   8-9  -- スピード計測
 *   10   -- ピットアウト
 *   11   -- ピットイン
 *   20   -- CL-ピット
 *
 * 仕様にない LoopID は null (= 状態変化なし) を返す。
 */
export function deriveStatusFromLoop(loopId: number): "on_track" | "in_pit" | "pit_out" | null {
    switch (loopId) {
        case 11:
            return "in_pit";
        case 10:
            return "pit_out";
        case 0:
        case 1:
        case 2:
        case 3:
        case 20:
            return "on_track";
        default:
            return null;
    }
}

/**
 * 受信タイムスタンプ (Date.now ベース) から最終受信からの経過秒。
 * stale = X 秒以上更新がない、というロジックに使う。
 */
export function secondsSince(epochMs: number, nowMs: number): number {
    return Math.max(0, Math.floor((nowMs - epochMs) / 1000));
}
