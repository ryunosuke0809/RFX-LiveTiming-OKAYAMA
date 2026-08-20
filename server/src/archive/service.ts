import type { TimingRepository } from "../db/repository.js";
import type { AdminStore, ArchiveSessionMeta, ArchiveSessionNames } from "../admin/store.js";
import { normalizeDateIso } from "../admin/store.js";
import {
    rebuildSessionsFromMessages,
    type ArchiveSessionDetail,
    type ArchiveSessionSummary,
} from "./rebuild.js";

/** 管理画面用の 1 行。公開側で隠れているセッションも含む。 */
export interface AdminArchiveSessionRow extends ArchiveSessionSummary {
    active: boolean;
    /** 上書きを外したときに戻る、元データ由来の名前。 */
    originalNames: {
        competitionName: string;
        categoryName: string;
        sessionName: string;
        roundName: string;
    };
    /** 現在設定されている上書き（未設定は null）。 */
    overrides: ArchiveSessionNames;
}

export interface AdminArchiveDayRow {
    date: string;
    active: boolean;
    /** その日に非アクティブなセッションが 1 件以上あるか。 */
    hasHiddenSessions: boolean;
}

/**
 * 日別メッセージの再構築結果を短時間キャッシュする。
 *
 * キャッシュに入れるのは「再生結果そのまま」だけで、管理画面で設定した
 * 表示可否・表示名の反映は毎リクエストで行う。こうしないと管理画面の操作が
 * 最大 30 秒間反映されない。
 */
export class ArchiveService {
    private cache = new Map<string, { at: number; sessions: ArchiveSessionDetail[] }>();
    private readonly ttlMs = 30_000;

    constructor(
        private readonly repository: TimingRepository,
        private readonly adminStore: AdminStore,
    ) {}

    // ============================================================
    // 公開 API 向け（非アクティブを除外する）
    // ============================================================

    listDays(): string[] {
        const hiddenDays = this.adminStore.hiddenDays();
        const needsRebuildCheck = this.adminStore.daysWithHiddenSessions();

        return this.allDays().filter((date) => {
            if (hiddenDays.has(date)) return false;
            // 非表示セッションが無い日は再生せずに通す（全件再生は高くつく）
            if (!needsRebuildCheck.has(date)) return true;
            return this.listSessions(date).length > 0;
        });
    }

    listSessions(dateIsoOrYmd: string, circuitId?: string): ArchiveSessionSummary[] {
        const date = normalizeDateIso(dateIsoOrYmd);
        if (this.adminStore.hiddenDays().has(date)) return [];

        const meta = this.adminStore.sessionMetaByKey(date);
        return this.loadSessions(date, circuitId)
            .filter((s) => isActive(meta.get(s.sessionKey)))
            .map((s) => {
                const { snapshot: _snapshot, ...summary } = applyNameOverrides(
                    s,
                    meta.get(s.sessionKey),
                );
                return summary;
            });
    }

    getSession(
        dateIsoOrYmd: string,
        sessionIndex: number,
        circuitId?: string,
    ): ArchiveSessionDetail | null {
        const date = normalizeDateIso(dateIsoOrYmd);
        if (this.adminStore.hiddenDays().has(date)) return null;

        const session = this.loadSessions(date, circuitId)[sessionIndex];
        if (!session) return null;

        // 直リンク・CSV URL から非アクティブなセッションを取れないようにする
        const meta = this.adminStore.sessionMetaByKey(date).get(session.sessionKey);
        if (!isActive(meta)) return null;

        return applyNameOverrides(session, meta);
    }

    // ============================================================
    // 管理画面向け（非アクティブも返す）
    // ============================================================

    listDaysForAdmin(): AdminArchiveDayRow[] {
        const hiddenDays = this.adminStore.hiddenDays();
        const withHidden = this.adminStore.daysWithHiddenSessions();
        return this.allDays().map((date) => ({
            date,
            active: !hiddenDays.has(date),
            hasHiddenSessions: withHidden.has(date),
        }));
    }

    listSessionsForAdmin(dateIsoOrYmd: string, circuitId?: string): AdminArchiveSessionRow[] {
        const date = normalizeDateIso(dateIsoOrYmd);
        const meta = this.adminStore.sessionMetaByKey(date);

        return this.loadSessions(date, circuitId).map((s) => {
            const row = meta.get(s.sessionKey);
            const { snapshot: _snapshot, ...summary } = applyNameOverrides(s, row);
            return {
                ...summary,
                active: isActive(row),
                originalNames: {
                    competitionName: s.competitionName,
                    categoryName: s.categoryName,
                    sessionName: s.sessionName,
                    roundName: s.roundName,
                },
                overrides: {
                    competitionName: row?.competitionName ?? null,
                    categoryName: row?.categoryName ?? null,
                    sessionName: row?.sessionName ?? null,
                    roundName: row?.roundName ?? null,
                },
            };
        });
    }

    /** 管理画面で指定されたキーが実在するか確かめる（打ち間違い・古い UI 対策）。 */
    sessionKeyExists(dateIsoOrYmd: string, sessionKey: string): boolean {
        const date = normalizeDateIso(dateIsoOrYmd);
        return this.loadSessions(date).some((s) => s.sessionKey === sessionKey);
    }

    // ============================================================
    // private
    // ============================================================

    private allDays(): string[] {
        return this.repository.listAvailableDays().map((d) => normalizeDateIso(d));
    }

    private loadSessions(dateIso: string, circuitId?: string): ArchiveSessionDetail[] {
        const day = dateIso.replace(/-/g, "");
        const cacheKey = `${day}:${circuitId ?? "*"}`;
        const hit = this.cache.get(cacheKey);
        if (hit && Date.now() - hit.at < this.ttlMs) return hit.sessions;

        const envelopes = this.repository.loadDayMessages(day, circuitId);
        const sessions = rebuildSessionsFromMessages(day, envelopes);
        this.cache.set(cacheKey, { at: Date.now(), sessions });
        return sessions;
    }
}

function isActive(meta: ArchiveSessionMeta | undefined): boolean {
    return meta?.active ?? true;
}

/**
 * 管理画面で設定された表示名を反映する。
 *
 * 平坦化された名前フィールドだけでなく `snapshot.session` 側も差し替える。
 * CSV のヘッダーコメントは snapshot 側を読むため、両方揃えないと不整合になる。
 */
function applyNameOverrides(
    session: ArchiveSessionDetail,
    meta: ArchiveSessionMeta | undefined,
): ArchiveSessionDetail {
    if (!meta) return session;
    const { competitionName, categoryName, sessionName, roundName } = meta;
    if (!competitionName && !categoryName && !sessionName && !roundName) return session;

    const snapSession = session.snapshot.session;
    return {
        ...session,
        competitionName: competitionName ?? session.competitionName,
        categoryName: categoryName ?? session.categoryName,
        sessionName: sessionName ?? session.sessionName,
        roundName: roundName ?? session.roundName,
        snapshot: {
            ...session.snapshot,
            session: snapSession
                ? {
                      ...snapSession,
                      // 上書きは言語を問わず適用する（管理者が入れた 1 つの名前を全面に出す）
                      ...(competitionName
                          ? { competitionNameJ: competitionName, competitionNameE: competitionName }
                          : {}),
                      ...(categoryName
                          ? { categoryNameJ: categoryName, categoryNameE: categoryName }
                          : {}),
                      ...(sessionName
                          ? { sessionNameJ: sessionName, sessionNameE: sessionName }
                          : {}),
                      ...(roundName
                          ? { roundNameJ: roundName, roundNameE: roundName }
                          : {}),
                  }
                : snapSession,
        },
    };
}
