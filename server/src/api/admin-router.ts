import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { ArchiveService } from "../archive/service.js";
import { AdminStore, normalizeDateIso, type ArchiveSessionNames } from "../admin/store.js";
import {
    clearSessionCookie,
    clientIp,
    issueSession,
    LoginRateLimiter,
    requireAdmin,
    resolveAdmin,
    setSessionCookie,
    type AdminAuthOptions,
    type AdminRequest,
} from "../admin/auth.js";
import {
    hashPassword,
    validatePasswordStrength,
    verifyPassword,
} from "../admin/password.js";
import { isBrowserOriginAllowed } from "../auth.js";
import { resolveLiveColumns, sanitizeLiveColumns } from "../display/live-columns.js";
import { sanitizeElapsedIdle } from "../display/elapsed-idle.js";
import type { BroadcastHub } from "../broadcast/hub.js";
import type { SessionStateAggregator } from "../state/aggregator.js";

/**
 * 管理画面 API (`/api/admin/*`)。
 *
 * - `/login` 以外は全て `requireAdmin` で保護する。
 * - 履歴の「削除」は生データを消さず active フラグを落とす論理削除。
 * - 操作は監査ログに残す。
 */
export function createAdminRouter(
    store: AdminStore,
    archive: ArchiveService,
    config: AppConfig,
    logger: Logger,
    hub: BroadcastHub,
    aggregator: SessionStateAggregator,
): Router {
    const router = Router();
    const auth: AdminAuthOptions = {
        store,
        sessionTtlSec: config.adminSessionTtlSec,
        cookieSecure: config.adminCookieSecure,
        allowedOrigins: config.allowedOrigins,
    };
    const loginLimiter = new LoginRateLimiter();
    const guard = requireAdmin(auth);

    // ---- 認証 ----

    router.post("/login", (req, res) => {
        if (!isBrowserOriginAllowed(req, config.allowedOrigins)) {
            res.status(403).json({ error: "origin not allowed" });
            return;
        }
        const ip = clientIp(req);
        if (!loginLimiter.allow(ip)) {
            res.status(429).json({ error: "ログイン試行が多すぎます。しばらく待って再試行してください。" });
            return;
        }

        const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!username || !password) {
            res.status(400).json({ error: "ユーザー名とパスワードを入力してください" });
            return;
        }

        const credential = store.findCredentialByUsername(username);
        // ユーザー不在でも同じ応答にして、存在の有無を漏らさない
        if (
            !credential ||
            !verifyPassword(password, credential.passwordHash, credential.passwordSalt)
        ) {
            logger.warn("admin login failed", { username, ip });
            res.status(401).json({ error: "ユーザー名またはパスワードが違います" });
            return;
        }

        loginLimiter.reset(ip);
        const { token } = issueSession(auth, credential.id);
        store.touchLastLogin(credential.id);
        store.appendAudit(credential.username, "login", `user:${credential.id}`, { ip });
        setSessionCookie(res, auth, token);
        logger.info("admin login", { username: credential.username, ip });
        res.json({ user: publicUser(store, credential.id) });
    });

    router.post("/logout", (req, res) => {
        const identity = resolveAdmin(req, auth);
        if (identity) {
            store.deleteSession(identity.tokenHash);
            store.appendAudit(identity.username, "logout", `user:${identity.userId}`);
        }
        clearSessionCookie(res, auth);
        res.json({ ok: true });
    });

    router.get("/me", guard, (req, res) => {
        const identity = (req as AdminRequest).admin!;
        res.json({ user: publicUser(store, identity.userId) });
    });

    // ---- ユーザー管理 ----

    router.get("/users", guard, (_req, res) => {
        res.json({ users: store.listUsers() });
    });

    router.post("/users", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
            res.status(400).json({
                error: "ユーザー名は英数字・ドット・アンダースコア・ハイフンの 3〜32 文字にしてください",
            });
            return;
        }
        const weak = validatePasswordStrength(password);
        if (weak) {
            res.status(400).json({ error: weak });
            return;
        }
        if (store.findCredentialByUsername(username)) {
            res.status(409).json({ error: "同じユーザー名が既に存在します" });
            return;
        }

        const { hash, salt } = hashPassword(password);
        const created = store.createUser(username, hash, salt);
        store.appendAudit(actor.username, "user.create", `user:${created.id}`, { username });
        res.status(201).json({ user: created });
    });

    router.patch("/users/:id/password", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
        if (!Number.isFinite(id)) {
            res.status(400).json({ error: "invalid user id" });
            return;
        }
        const body = (req.body ?? {}) as { password?: unknown };
        const password = typeof body.password === "string" ? body.password : "";
        const weak = validatePasswordStrength(password);
        if (weak) {
            res.status(400).json({ error: weak });
            return;
        }
        const target = store.findUserById(id);
        if (!target) {
            res.status(404).json({ error: "user not found" });
            return;
        }

        const { hash, salt } = hashPassword(password);
        store.updatePassword(id, hash, salt);
        store.appendAudit(actor.username, "user.password", `user:${id}`, {
            username: target.username,
        });

        // 自分のパスワードを変えた場合、既存セッションも消えているので Cookie を落とす
        if (actor.userId === id) {
            clearSessionCookie(res, auth);
        }
        res.json({ ok: true, reauthRequired: actor.userId === id });
    });

    router.delete("/users/:id", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
        if (!Number.isFinite(id)) {
            res.status(400).json({ error: "invalid user id" });
            return;
        }
        if (actor.userId === id) {
            res.status(400).json({ error: "自分自身は削除できません" });
            return;
        }
        if (store.countUsers() <= 1) {
            res.status(400).json({ error: "最後の管理者は削除できません" });
            return;
        }
        const target = store.findUserById(id);
        if (!target) {
            res.status(404).json({ error: "user not found" });
            return;
        }
        store.deleteUser(id);
        store.appendAudit(actor.username, "user.delete", `user:${id}`, {
            username: target.username,
        });
        res.json({ ok: true });
    });

    // ---- 履歴データ管理 ----

    /** 非アクティブも含む全日付。 */
    router.get("/archive/days", guard, (_req, res) => {
        try {
            res.json({ days: archive.listDaysForAdmin() });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    /** 非アクティブも含む、指定日のセッション一覧。 */
    router.get("/archive/sessions", guard, (req, res) => {
        const date = String(req.query["date"] ?? "");
        if (!date) {
            res.status(400).json({ error: "date is required (YYYY-MM-DD or YYYYMMDD)" });
            return;
        }
        const circuit = req.query["circuit"] ? String(req.query["circuit"]) : undefined;
        try {
            res.json({
                date: normalizeDateIso(date),
                sessions: archive.listSessionsForAdmin(date, circuit),
            });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    /** 日付単位の表示 / 非表示。 */
    router.patch("/archive/day/:date", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const body = (req.body ?? {}) as { active?: unknown };
        if (typeof body.active !== "boolean") {
            res.status(400).json({ error: "active (boolean) is required" });
            return;
        }
        try {
            const date = normalizeDateIso(String(req.params["date"] ?? ""));
            store.setDayActive(date, body.active, actor.username);
            store.appendAudit(
                actor.username,
                body.active ? "archive.day.show" : "archive.day.hide",
                `day:${date}`,
            );
            res.json({ ok: true, date, active: body.active });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    /** セッション単位の表示 / 非表示と表示名の上書き。 */
    router.patch("/archive/session", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const body = (req.body ?? {}) as {
            date?: unknown;
            sessionKey?: unknown;
            active?: unknown;
            names?: unknown;
        };
        if (typeof body.date !== "string" || typeof body.sessionKey !== "string") {
            res.status(400).json({ error: "date and sessionKey are required" });
            return;
        }
        if (body.active !== undefined && typeof body.active !== "boolean") {
            res.status(400).json({ error: "active must be boolean" });
            return;
        }

        try {
            const date = normalizeDateIso(body.date);
            const sessionKey = body.sessionKey;
            if (!archive.sessionKeyExists(date, sessionKey)) {
                res.status(404).json({ error: "session not found" });
                return;
            }
            const names = parseNames(body.names);
            const updated = store.setSessionMeta(
                date,
                sessionKey,
                {
                    ...(body.active === undefined ? {} : { active: body.active }),
                    ...(names === undefined ? {} : { names }),
                },
                actor.username,
            );
            store.appendAudit(actor.username, "archive.session.update", `${date}/${sessionKey}`, {
                active: updated.active,
                names,
            });
            res.json({ session: updated });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    /** 監査ログ（誰がいつ何を隠したか）。 */
    router.get("/audit", guard, (req, res) => {
        const rawLimit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
        res.json({ entries: store.recentAudit(limit) });
    });

    // ---- Live 表示設定 ----

    router.get("/display/live", guard, (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.json(liveDisplayFromStore(store));
    });

    router.put("/display/live", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const body = (req.body ?? {}) as { columns?: unknown; elapsed?: unknown };
        if (body.columns === undefined && body.elapsed === undefined) {
            res.status(400).json({ error: "columns or elapsed required" });
            return;
        }
        try {
            const current = liveDisplayFromStore(store);
            const columns =
                body.columns !== undefined ? sanitizeLiveColumns(body.columns) : current.columns;
            const elapsed =
                body.elapsed !== undefined ? sanitizeElapsedIdle(body.elapsed) : current.elapsed;
            if (body.columns !== undefined) {
                store.setDisplayConfig("live", "columns", columns);
                store.appendAudit(actor.username, "display.live.update", "live:columns");
            }
            if (body.elapsed !== undefined) {
                store.setDisplayConfig("live", "elapsed", elapsed);
                store.appendAudit(actor.username, "display.live.elapsed", "live:elapsed");
            }
            hub.broadcastPatches(null, [{ kind: "display_live", columns, elapsed }]);
            logger.info("live display updated", {
                username: actor.username,
                columns: body.columns !== undefined,
                elapsed: body.elapsed !== undefined,
            });
            res.json({ columns, elapsed });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    router.post("/display/live/reset", guard, (req, res) => {
        const actor = (req as AdminRequest).admin!;
        const patches = aggregator.resetDisplay();
        hub.broadcastPatches(null, patches, null, null);
        store.appendAudit(actor.username, "display.live.reset", "live");
        logger.info("live display reset", { username: actor.username });
        res.json({ ok: true });
    });

    return router;
}

function liveDisplayFromStore(store: AdminStore) {
    const cfg = store.getDisplayConfig("live");
    return {
        columns: resolveLiveColumns(cfg["columns"]),
        elapsed: sanitizeElapsedIdle(cfg["elapsed"]),
    };
}

function publicUser(store: AdminStore, id: number) {
    return store.findUserById(id);
}

/**
 * 表示名上書きの入力を検証する。
 * 空文字は「上書き解除」として通し、null に正規化するのは store 側で行う。
 */
function parseNames(input: unknown): Partial<ArchiveSessionNames> | undefined {
    if (input === undefined || input === null) return undefined;
    if (typeof input !== "object") throw new Error("names must be an object");

    const src = input as Record<string, unknown>;
    const keys: Array<keyof ArchiveSessionNames> = [
        "competitionName",
        "categoryName",
        "sessionName",
        "roundName",
    ];
    const out: Partial<ArchiveSessionNames> = {};
    for (const key of keys) {
        if (!(key in src)) continue;
        const value = src[key];
        if (value === null) {
            out[key] = null;
            continue;
        }
        if (typeof value !== "string") throw new Error(`${key} must be a string or null`);
        if (value.length > 200) throw new Error(`${key} が長すぎます`);
        out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
