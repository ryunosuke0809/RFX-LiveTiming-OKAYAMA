import type { TimingRepository } from "../db/repository.js";
import {
    rebuildSessionsFromMessages,
    type ArchiveSessionDetail,
    type ArchiveSessionSummary,
} from "./rebuild.js";

/**
 * 日別メッセージの再構築結果を短時間キャッシュする。
 * 同じ日の sessions / results / csv 連続アクセスで再再生を避ける。
 */
export class ArchiveService {
    private cache = new Map<string, { at: number; sessions: ArchiveSessionDetail[] }>();
    private readonly ttlMs = 30_000;

    constructor(private readonly repository: TimingRepository) {}

    listDays(): string[] {
        return this.repository.listAvailableDays().map((d) =>
            `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        );
    }

    listSessions(dateIsoOrYmd: string, circuitId?: string): ArchiveSessionSummary[] {
        return this.loadSessions(dateIsoOrYmd, circuitId).map((s) => {
            const { snapshot: _snapshot, ...summary } = s;
            return summary;
        });
    }

    getSession(
        dateIsoOrYmd: string,
        sessionIndex: number,
        circuitId?: string,
    ): ArchiveSessionDetail | null {
        const sessions = this.loadSessions(dateIsoOrYmd, circuitId);
        return sessions[sessionIndex] ?? null;
    }

    private loadSessions(dateIsoOrYmd: string, circuitId?: string): ArchiveSessionDetail[] {
        const day = dateIsoOrYmd.replace(/-/g, "");
        const cacheKey = `${day}:${circuitId ?? "*"}`;
        const hit = this.cache.get(cacheKey);
        if (hit && Date.now() - hit.at < this.ttlMs) return hit.sessions;

        const envelopes = this.repository.loadDayMessages(day, circuitId);
        const sessions = rebuildSessionsFromMessages(day, envelopes);
        this.cache.set(cacheKey, { at: Date.now(), sessions });
        return sessions;
    }
}
