import { formatYyyymmdd } from "../db/schema.js";
import type { TimingRepository } from "../db/repository.js";
import type { SessionStateAggregator } from "./aggregator.js";
import type { LiveSessionState } from "./session-state.js";
import type { Logger } from "../logger.js";

/**
 * サーバー再起動後もライブ表示をすぐ戻すため、当日 (なければ直近) の
 * SQLite messages を aggregator に流してメモリ状態を復元する。
 *
 * Receiver はセッション途中では Team/Class マスターを再送しないことが多く、
 * 再起動直後は Standings/Passing だけが来て車番・チーム名が空になる。
 */
export function hydrateLiveStateFromDb(
    repository: TimingRepository,
    aggregator: SessionStateAggregator,
    liveState: LiveSessionState,
    logger: Logger,
): { day: string | null; messages: number } {
    const today = formatYyyymmdd(new Date());
    const days = repository.listAvailableDays();
    const day = days.includes(today) ? today : (days[days.length - 1] ?? null);
    if (!day) {
        logger.info("hydrate skipped (no sqlite days)");
        return { day: null, messages: 0 };
    }

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
