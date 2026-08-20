import { formatYyyymmdd } from "../db/schema.js";
import type { TimingRepository } from "../db/repository.js";
import type { SessionStateAggregator } from "./aggregator.js";
import type { LiveSessionState } from "./session-state.js";
import type { Logger } from "../logger.js";

/**
 * サーバー再起動後もライブ表示をすぐ戻すため、当日の SQLite messages を
 * aggregator に流してメモリ状態を復元する。
 *
 * Receiver はセッション途中では Team/Class マスターを再送しないことが多く、
 * 再起動直後は Standings/Passing だけが来て車番・チーム名が空になる。
 *
 * 当日のデータが無い場合は復元しない。以前は直近の日にフォールバックしていたが、
 * それだと翌朝の起動時に前日のリザルトがライブ画面に出続けてしまう。
 */
export function hydrateLiveStateFromDb(
    repository: TimingRepository,
    aggregator: SessionStateAggregator,
    liveState: LiveSessionState,
    logger: Logger,
): { day: string | null; messages: number } {
    const today = formatYyyymmdd(new Date());
    if (!repository.listAvailableDays().includes(today)) {
        logger.info("hydrate skipped (no data for today)", { today });
        return { day: null, messages: 0 };
    }
    const day = today;

    const started = Date.now();
    const envelopes = repository.loadDayMessages(day);
    for (const env of envelopes) {
        aggregator.apply(env);
    }

    logger.info("hydrated live state from sqlite", {
        day,
        messages: envelopes.length,
        teams: liveState.teams.size,
        standings: liveState.standings.size,
        classes: liveState.classes.size,
        category:
            liveState.session?.categoryNameE ||
            liveState.session?.categoryNameJ ||
            "",
        ms: Date.now() - started,
    });

    return { day, messages: envelopes.length };
}
