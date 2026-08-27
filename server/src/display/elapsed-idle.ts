/**
 * Live ヘッダー ELAPSED の、Passing 停止時の扱い。
 * 赤旗中断でも Passing は止まるので、セッション終了そのものではない。
 */

export type ElapsedIdleDisplay = "freeze" | "blank";

export interface ElapsedIdleConfig {
    /** Passing が止まってから止めるまでの秒。0 で止めない（従来どおり）。 */
    idleThresholdSec: number;
    /** freeze=最後の経過のまま / blank=---- */
    idleDisplay: ElapsedIdleDisplay;
}

export const DEFAULT_ELAPSED_IDLE: ElapsedIdleConfig = {
    idleThresholdSec: 90,
    idleDisplay: "freeze",
};

export function sanitizeElapsedIdle(raw: unknown): ElapsedIdleConfig {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const n = Number(obj.idleThresholdSec);
    const idleThresholdSec = Number.isFinite(n)
        ? Math.max(0, Math.min(3600, Math.round(n)))
        : DEFAULT_ELAPSED_IDLE.idleThresholdSec;
    const idleDisplay: ElapsedIdleDisplay =
        obj.idleDisplay === "blank" ? "blank" : "freeze";
    return { idleThresholdSec, idleDisplay };
}

/**
 * now 時点の表示秒。idle かつ blank のときは null（呼び出し側で ----）。
 * lastPassing が無い場合は Start からの経過で idle 判定する（古い Start 再送対策）。
 */
export function resolveElapsedSeconds(opts: {
    nowMs: number;
    startedAtMs: number | null;
    lastPassingAtMs: number | null;
    idleThresholdSec: number;
    idleDisplay: ElapsedIdleDisplay;
}): { seconds: number | null; idle: boolean } {
    const { nowMs, startedAtMs, lastPassingAtMs, idleThresholdSec, idleDisplay } = opts;
    if (startedAtMs == null) return { seconds: 0, idle: false };

    const running = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    if (idleThresholdSec <= 0) return { seconds: running, idle: false };

    const refMs = lastPassingAtMs ?? startedAtMs;
    const idle = nowMs - refMs >= idleThresholdSec * 1000;
    if (!idle) return { seconds: running, idle: false };
    if (idleDisplay === "blank" || lastPassingAtMs == null) {
        return { seconds: null, idle: true };
    }
    return {
        seconds: Math.max(0, Math.floor((lastPassingAtMs - startedAtMs) / 1000)),
        idle: true,
    };
}
