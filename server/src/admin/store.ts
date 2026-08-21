import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "../logger.js";

/**
 * 管理者機能の永続ストア (`${dataDir}/admin.db`)。
 *
 * 計測データの `timing_YYYYMMDD.db` は日付でローテーションするため、
 * 日を跨いで保持したい設定 (管理者アカウント・履歴の表示可否) はこちらに置く。
 *
 * 履歴の「削除」は生データ (`messages`) を消さず、この DB の active フラグだけを
 * 落とす論理削除にしている。いつでも復帰できるようにするため。
 */

/** パスワードハッシュを含まない、外部に出して良いユーザー情報。 */
export interface AdminUser {
    id: number;
    username: string;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
}

/** 認証時のみ使う、ハッシュ込みのユーザー行。 */
export interface AdminUserCredential extends AdminUser {
    passwordHash: string;
    passwordSalt: string;
}

export interface AdminSessionRecord {
    userId: number;
    username: string;
    expiresAt: string;
}

/** セッションの表示名上書き。null は「上書きなし (元データを使う)」。 */
export interface ArchiveSessionNames {
    competitionName: string | null;
    categoryName: string | null;
    sessionName: string | null;
    roundName: string | null;
}

export interface ArchiveSessionMeta extends ArchiveSessionNames {
    date: string;
    sessionKey: string;
    active: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface ArchiveDayMeta {
    date: string;
    active: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface AuditLogEntry {
    id: number;
    at: string;
    username: string;
    action: string;
    target: string;
    detail: unknown;
}

/** `YYYYMMDD` / `YYYY-MM-DD` のどちらでも受けて `YYYY-MM-DD` に正規化する。 */
export function normalizeDateIso(value: string): string {
    const digits = value.replace(/-/g, "");
    if (!/^\d{8}$/.test(digits)) {
        throw new Error(`invalid date: ${value}`);
    }
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export class AdminStore {
    private db: Database.Database;

    constructor(dataDir: string, private readonly logger: Logger) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.db = new Database(path.join(dataDir, "admin.db"));
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("synchronous = NORMAL");
        this.db.pragma("foreign_keys = ON");
        initAdminSchema(this.db);
        this.purgeExpiredSessions();
    }

    close(): void {
        try {
            this.db.close();
        } catch {
            /* ignore */
        }
    }

    // ============================================================
    // ユーザー
    // ============================================================

    countUsers(): number {
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM admin_users`).get() as {
            n: number;
        };
        return row.n;
    }

    listUsers(): AdminUser[] {
        const rows = this.db
            .prepare(
                `SELECT id, username, created_at, updated_at, last_login_at
                 FROM admin_users
                 ORDER BY username ASC`,
            )
            .all() as UserRow[];
        return rows.map(toAdminUser);
    }

    findUserById(id: number): AdminUser | null {
        const row = this.db
            .prepare(
                `SELECT id, username, created_at, updated_at, last_login_at
                 FROM admin_users WHERE id = ?`,
            )
            .get(id) as UserRow | undefined;
        return row ? toAdminUser(row) : null;
    }

    /** ログイン照合用。ハッシュを含むのでレスポンスにそのまま載せないこと。 */
    findCredentialByUsername(username: string): AdminUserCredential | null {
        const row = this.db
            .prepare(
                `SELECT id, username, created_at, updated_at, last_login_at,
                        password_hash, password_salt
                 FROM admin_users WHERE username = ?`,
            )
            .get(username) as (UserRow & CredentialRow) | undefined;
        if (!row) return null;
        return {
            ...toAdminUser(row),
            passwordHash: row.password_hash,
            passwordSalt: row.password_salt,
        };
    }

    createUser(username: string, passwordHash: string, passwordSalt: string): AdminUser {
        const now = new Date().toISOString();
        const info = this.db
            .prepare(
                `INSERT INTO admin_users (username, password_hash, password_salt, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`,
            )
            .run(username, passwordHash, passwordSalt, now, now);
        const created = this.findUserById(Number(info.lastInsertRowid));
        if (!created) throw new Error("failed to read back created user");
        return created;
    }

    /** パスワード変更。既存セッションは全て無効化して再ログインを強制する。 */
    updatePassword(id: number, passwordHash: string, passwordSalt: string): boolean {
        const now = new Date().toISOString();
        const info = this.db
            .prepare(
                `UPDATE admin_users
                 SET password_hash = ?, password_salt = ?, updated_at = ?
                 WHERE id = ?`,
            )
            .run(passwordHash, passwordSalt, now, id);
        if (info.changes === 0) return false;
        this.deleteSessionsForUser(id);
        return true;
    }

    deleteUser(id: number): boolean {
        const info = this.db.prepare(`DELETE FROM admin_users WHERE id = ?`).run(id);
        return info.changes > 0;
    }

    touchLastLogin(id: number): void {
        this.db
            .prepare(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), id);
    }

    // ============================================================
    // ログインセッション
    // ============================================================

    createSession(tokenHash: string, userId: number, expiresAt: string): void {
        this.db
            .prepare(
                `INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at)
                 VALUES (?, ?, ?, ?)`,
            )
            .run(tokenHash, userId, new Date().toISOString(), expiresAt);
    }

    findSession(tokenHash: string): AdminSessionRecord | null {
        const row = this.db
            .prepare(
                `SELECT s.user_id, s.expires_at, u.username
                 FROM admin_sessions s
                 JOIN admin_users u ON u.id = s.user_id
                 WHERE s.token_hash = ?`,
            )
            .get(tokenHash) as
            | { user_id: number; expires_at: string; username: string }
            | undefined;
        if (!row) return null;
        if (Date.parse(row.expires_at) <= Date.now()) {
            this.deleteSession(tokenHash);
            return null;
        }
        return { userId: row.user_id, username: row.username, expiresAt: row.expires_at };
    }

    /** スライディング期限。操作が続く限りログインを維持する。 */
    extendSession(tokenHash: string, expiresAt: string): void {
        this.db
            .prepare(`UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?`)
            .run(expiresAt, tokenHash);
    }

    deleteSession(tokenHash: string): void {
        this.db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).run(tokenHash);
    }

    deleteSessionsForUser(userId: number): void {
        this.db.prepare(`DELETE FROM admin_sessions WHERE user_id = ?`).run(userId);
    }

    purgeExpiredSessions(): void {
        try {
            this.db
                .prepare(`DELETE FROM admin_sessions WHERE expires_at <= ?`)
                .run(new Date().toISOString());
        } catch (err) {
            this.logger.warn("adminStore.purgeExpiredSessions failed", {
                error: (err as Error).message,
            });
        }
    }

    // ============================================================
    // 履歴データの表示可否・表示名
    // ============================================================

    /** 非アクティブな日付の集合 (`YYYY-MM-DD`)。 */
    hiddenDays(): Set<string> {
        const rows = this.db
            .prepare(`SELECT date FROM archive_day_meta WHERE active = 0`)
            .all() as Array<{ date: string }>;
        return new Set(rows.map((r) => r.date));
    }

    /**
     * 非アクティブなセッションを 1 件以上含む日付の集合。
     *
     * `listDays()` で「全セッションが非表示になった日」を判定する必要があるが、
     * 判定には messages の再生が要る。ここに含まれない日は再生を省略できる。
     */
    daysWithHiddenSessions(): Set<string> {
        const rows = this.db
            .prepare(`SELECT DISTINCT date FROM archive_session_meta WHERE active = 0`)
            .all() as Array<{ date: string }>;
        return new Set(rows.map((r) => r.date));
    }

    listDayMeta(): ArchiveDayMeta[] {
        const rows = this.db
            .prepare(
                `SELECT date, active, updated_at, updated_by
                 FROM archive_day_meta ORDER BY date ASC`,
            )
            .all() as DayMetaRow[];
        return rows.map(toDayMeta);
    }

    setDayActive(dateInput: string, active: boolean, updatedBy: string): void {
        const date = normalizeDateIso(dateInput);
        this.db
            .prepare(
                `INSERT INTO archive_day_meta (date, active, updated_at, updated_by)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(date) DO UPDATE SET
                     active = excluded.active,
                     updated_at = excluded.updated_at,
                     updated_by = excluded.updated_by`,
            )
            .run(date, active ? 1 : 0, new Date().toISOString(), updatedBy);
    }

    /** 指定日のセッション上書き情報を sessionKey で引ける形で返す。 */
    sessionMetaByKey(dateInput: string): Map<string, ArchiveSessionMeta> {
        const date = normalizeDateIso(dateInput);
        const rows = this.db
            .prepare(
                `SELECT date, session_key, active, competition_name, category_name,
                        session_name, round_name, updated_at, updated_by
                 FROM archive_session_meta WHERE date = ?`,
            )
            .all(date) as SessionMetaRow[];
        const map = new Map<string, ArchiveSessionMeta>();
        for (const row of rows) {
            map.set(row.session_key, toSessionMeta(row));
        }
        return map;
    }

    setSessionMeta(
        dateInput: string,
        sessionKey: string,
        patch: { active?: boolean; names?: Partial<ArchiveSessionNames> },
        updatedBy: string,
    ): ArchiveSessionMeta {
        const date = normalizeDateIso(dateInput);
        const existing = this.sessionMetaByKey(date).get(sessionKey);
        const active = patch.active ?? existing?.active ?? true;
        const names: ArchiveSessionNames = {
            competitionName: pickName(patch.names, "competitionName", existing?.competitionName),
            categoryName: pickName(patch.names, "categoryName", existing?.categoryName),
            sessionName: pickName(patch.names, "sessionName", existing?.sessionName),
            roundName: pickName(patch.names, "roundName", existing?.roundName),
        };

        this.db
            .prepare(
                `INSERT INTO archive_session_meta (
                     date, session_key, active, competition_name, category_name,
                     session_name, round_name, updated_at, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(date, session_key) DO UPDATE SET
                     active = excluded.active,
                     competition_name = excluded.competition_name,
                     category_name = excluded.category_name,
                     session_name = excluded.session_name,
                     round_name = excluded.round_name,
                     updated_at = excluded.updated_at,
                     updated_by = excluded.updated_by`,
            )
            .run(
                date,
                sessionKey,
                active ? 1 : 0,
                names.competitionName,
                names.categoryName,
                names.sessionName,
                names.roundName,
                new Date().toISOString(),
                updatedBy,
            );

        return this.sessionMetaByKey(date).get(sessionKey)!;
    }

    // ============================================================
    // 監査ログ
    // ============================================================

    appendAudit(username: string, action: string, target: string, detail?: unknown): void {
        try {
            this.db
                .prepare(
                    `INSERT INTO audit_log (at, username, action, target, detail_json)
                     VALUES (?, ?, ?, ?, ?)`,
                )
                .run(
                    new Date().toISOString(),
                    username,
                    action,
                    target,
                    detail === undefined ? null : JSON.stringify(detail),
                );
        } catch (err) {
            this.logger.warn("adminStore.appendAudit failed", {
                action,
                error: (err as Error).message,
            });
        }
    }

    recentAudit(limit: number): AuditLogEntry[] {
        const rows = this.db
            .prepare(
                `SELECT id, at, username, action, target, detail_json
                 FROM audit_log ORDER BY id DESC LIMIT ?`,
            )
            .all(limit) as Array<{
            id: number;
            at: string;
            username: string;
            action: string;
            target: string;
            detail_json: string | null;
        }>;
        return rows.map((r) => ({
            id: r.id,
            at: r.at,
            username: r.username,
            action: r.action,
            target: r.target,
            detail: r.detail_json ? safeJsonParse(r.detail_json) : null,
        }));
    }

    // ============================================================
    // 表示設定 (Live の列定義。管理画面 /admin/live から更新する)
    // ============================================================

    getDisplayConfig(scope: string): Record<string, unknown> {
        const rows = this.db
            .prepare(`SELECT key, value_json FROM display_config WHERE scope = ?`)
            .all(scope) as Array<{ key: string; value_json: string }>;
        const out: Record<string, unknown> = {};
        for (const row of rows) {
            out[row.key] = safeJsonParse(row.value_json);
        }
        return out;
    }

    setDisplayConfig(scope: string, key: string, value: unknown): void {
        this.db
            .prepare(
                `INSERT INTO display_config (scope, key, value_json, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(scope, key) DO UPDATE SET
                     value_json = excluded.value_json,
                     updated_at = excluded.updated_at`,
            )
            .run(scope, key, JSON.stringify(value ?? null), new Date().toISOString());
    }
}

// ============================================================
// スキーマ
// ============================================================

function initAdminSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    NOT NULL UNIQUE,
            password_hash   TEXT    NOT NULL,
            password_salt   TEXT    NOT NULL,
            created_at      TEXT    NOT NULL,
            updated_at      TEXT    NOT NULL,
            last_login_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash      TEXT    PRIMARY KEY,
            user_id         INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            created_at      TEXT    NOT NULL,
            expires_at      TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
            ON admin_sessions (expires_at);

        CREATE TABLE IF NOT EXISTS archive_day_meta (
            date            TEXT    PRIMARY KEY,   -- YYYY-MM-DD
            active          INTEGER NOT NULL DEFAULT 1,
            updated_at      TEXT,
            updated_by      TEXT
        );

        CREATE TABLE IF NOT EXISTS archive_session_meta (
            date            TEXT    NOT NULL,      -- YYYY-MM-DD
            session_key     TEXT    NOT NULL,      -- rebuild.ts の論理セッションキー
            active          INTEGER NOT NULL DEFAULT 1,
            competition_name TEXT,
            category_name   TEXT,
            session_name    TEXT,
            round_name      TEXT,
            updated_at      TEXT,
            updated_by      TEXT,
            PRIMARY KEY (date, session_key)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            at              TEXT    NOT NULL,
            username        TEXT    NOT NULL,
            action          TEXT    NOT NULL,
            target          TEXT    NOT NULL,
            detail_json     TEXT
        );

        CREATE TABLE IF NOT EXISTS display_config (
            scope           TEXT    NOT NULL,
            key             TEXT    NOT NULL,
            value_json      TEXT    NOT NULL,
            updated_at      TEXT    NOT NULL,
            PRIMARY KEY (scope, key)
        );
    `);
}

// ============================================================
// 行 → ドメイン型
// ============================================================

interface UserRow {
    id: number;
    username: string;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
}

interface CredentialRow {
    password_hash: string;
    password_salt: string;
}

interface DayMetaRow {
    date: string;
    active: number;
    updated_at: string | null;
    updated_by: string | null;
}

interface SessionMetaRow extends DayMetaRow {
    session_key: string;
    competition_name: string | null;
    category_name: string | null;
    session_name: string | null;
    round_name: string | null;
}

function toAdminUser(row: UserRow): AdminUser {
    return {
        id: row.id,
        username: row.username,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
    };
}

function toDayMeta(row: DayMetaRow): ArchiveDayMeta {
    return {
        date: row.date,
        active: row.active !== 0,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
    };
}

function toSessionMeta(row: SessionMetaRow): ArchiveSessionMeta {
    return {
        date: row.date,
        sessionKey: row.session_key,
        active: row.active !== 0,
        competitionName: row.competition_name,
        categoryName: row.category_name,
        sessionName: row.session_name,
        roundName: row.round_name,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
    };
}

/**
 * 上書き名の三値を解く。
 * - キー未指定 → 既存値を維持
 * - 空文字     → 上書き解除 (null)
 * - 文字列     → その値で上書き
 */
function pickName(
    patch: Partial<ArchiveSessionNames> | undefined,
    key: keyof ArchiveSessionNames,
    existing: string | null | undefined,
): string | null {
    if (!patch || !(key in patch)) return existing ?? null;
    const value = patch[key];
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
}

function safeJsonParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
