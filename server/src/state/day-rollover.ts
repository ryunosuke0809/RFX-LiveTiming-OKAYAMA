import { formatYyyymmdd } from "../db/schema.js";
import type { BroadcastHub } from "../broadcast/hub.js";
import type { LiveSessionState } from "./session-state.js";
import type { Logger } from "../logger.js";
import type { LiveStatePatch } from "./types.js";

/** 日付の比較間隔。長時間 sleep より定期比較の方が時刻補正・サスペンドに強い。 */
const CHECK_INTERVAL_MS = 30_000;

/**
 * ローカル日付が変わったらライブ状態を空に戻す。
 *
 * SMIS は前日の走行が終わっても Select を送ってこないため、放っておくと
 * 翌日になっても前日のリザルトがライブ画面に出続ける。0 時をまたいだ時点で
 * サーバー側の状態を捨て、購読中のクライアントにもリセットを配信する。
 *
 * 走行中に日を跨いだ場合もリセットされる。新しいデータが届き次第、通常表示に戻る。
 *
 * @returns 監視を止める関数
 */
export function startDayRollover(
    liveState: LiveSessionState,
    hub: BroadcastHub,
    logger: Logger,
    onReset?: () => LiveStatePatch | null,
): () => void {
    let currentDay = formatYyyymmdd(new Date());

    const timer = setInterval(() => {
        const today = formatYyyymmdd(new Date());
        if (today === currentDay) return;

        const previousDay = currentDay;
        currentDay = today;

        const hadData = liveState.standings.size > 0 || liveState.teams.size > 0;
        liveState.resetForNewDay();

        // 購読中のクライアントを空表示へ。新規接続には snapshotProvider が空を返す。
        // 日付が変わるとセッション種別は予選側に戻るので、列プリセットも合わせる。
        const patches: LiveStatePatch[] = [{ kind: "reset", scope: "day" }];
        const preset = onReset?.();
        if (preset) patches.push(preset);
        hub.broadcastPatches(liveState.circuitId, patches);

        logger.info("live state reset for new day", {
            previousDay,
            today,
            hadData,
            subscribers: hub.subscriberCount,
        });
    }, CHECK_INTERVAL_MS);

    timer.unref();
    return () => clearInterval(timer);
}
