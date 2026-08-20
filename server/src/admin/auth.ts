import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AdminStore } from "./store.js";
import { generateSessionToken, hashSessionToken } from "./password.js";
import { isBrowserOriginAllowed } from "../auth.js";

/**
 * 管理画面のログインセッション。
 *
 * - Cookie は HttpOnly / SameSite=Strict。JS から読めないようにする。
 * - DB にはトークンのハッシュのみ保存し、失効・強制ログアウトを可能にする。
 * - 更新系リクエストでは Origin も照合して CSRF を二重に防ぐ。
 */

export const ADMIN_COOKIE_NAME = "mola_admin_session";

export interface AdminIdentity {
    userId: number;
    username: string;
    tokenHash: string;
}

/** `requireAdmin` 通過後は `req.admin` が必ず入る。 */
export interface AdminRequest extends Request {
    admin?: AdminIdentity;
}

export interface AdminAuthOptions {
    store: AdminStore;
    sessionTtlSec: number;
    cookieSecure: boolean;
    allowedOrigins: string[] | null;
}

/** Cookie ヘッダーを最小限パースする (cookie-parser を足さないため)。 */
export function parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq <= 0) continue;
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (!name) continue;
        try {
            out[name] = decodeURIComponent(value);
        } catch {
            out[name] = value;
        }
    }
    return out;
}

export function issueSession(opts: AdminAuthOptions, userId: number): { token: string; expiresAt: string } {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + opts.sessionTtlSec * 1000).toISOString();
    opts.store.createSession(hashSessionToken(token), userId, expiresAt);
    return { token, expiresAt };
}

export function setSessionCookie(res: Response, opts: AdminAuthOptions, token: string): void {
    const parts = [
        `${ADMIN_COOKIE_NAME}=${token}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${opts.sessionTtlSec}`,
    ];
    if (opts.cookieSecure) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response, opts: AdminAuthOptions): void {
    const parts = [
        `${ADMIN_COOKIE_NAME}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=0",
    ];
    if (opts.cookieSecure) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
}

/** リクエストからログイン中の管理者を解決する。未ログインなら null。 */
export function resolveAdmin(req: Request, opts: AdminAuthOptions): AdminIdentity | null {
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE_NAME];
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    const session = opts.store.findSession(tokenHash);
    if (!session) return null;

    // スライディング期限: 操作が続く限りログインを維持する
    opts.store.extendSession(
        tokenHash,
        new Date(Date.now() + opts.sessionTtlSec * 1000).toISOString(),
    );
    return { userId: session.userId, username: session.username, tokenHash };
}

/**
 * 未ログイン、または更新系で Origin が一致しないリクエストを弾む。
 */
export function requireAdmin(opts: AdminAuthOptions): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        const identity = resolveAdmin(req, opts);
        if (!identity) {
            res.status(401).json({ error: "authentication required" });
            return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
            if (!isBrowserOriginAllowed(req, opts.allowedOrigins)) {
                res.status(403).json({ error: "origin not allowed" });
                return;
            }
        }
        (req as AdminRequest).admin = identity;
        next();
    };
}

/**
 * ログイン試行のレート制限。IP あたり windowMs 内に maxHits まで。
 * `/api/ws-token` と同じ方針だが、総当たり対策として上限を厳しくしてある。
 */
export class LoginRateLimiter {
    private readonly hits = new Map<string, { count: number; resetAt: number }>();

    constructor(
        private readonly maxHits = 10,
        private readonly windowMs = 5 * 60_000,
    ) {}

    allow(key: string): boolean {
        const now = Date.now();
        const cur = this.hits.get(key);
        if (!cur || cur.resetAt <= now) {
            this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
            this.prune(now);
            return true;
        }
        if (cur.count >= this.maxHits) return false;
        cur.count += 1;
        return true;
    }

    /** ログイン成功時に呼んで、正規利用者がロックされ続けないようにする。 */
    reset(key: string): void {
        this.hits.delete(key);
    }

    private prune(now: number): void {
        if (this.hits.size < 1000) return;
        for (const [key, value] of this.hits) {
            if (value.resetAt <= now) this.hits.delete(key);
        }
    }
}

export function clientIp(req: Request): string {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length > 0) {
        return xf.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    }
    return req.socket.remoteAddress || "unknown";
}
