import type { IncomingMessage } from "node:http";

/**
 * `Authorization: Bearer <token>` ヘッダー、または
 * URL クエリ `?token=...` から token を抽出する。
 *
 * ブラウザの WebSocket API は任意ヘッダーを付けられないため、
 * フロントエンドは ?token=... 形式でも受け付けるようにしてある。
 */
export function extractToken(req: IncomingMessage): string | null {
    const header = req.headers["authorization"];
    if (typeof header === "string") {
        const match = /^Bearer\s+(\S+)$/i.exec(header);
        if (match) return match[1] ?? null;
    }

    if (req.url) {
        try {
            const url = new URL(req.url, "http://placeholder.local");
            const t = url.searchParams.get("token");
            if (t && t.length > 0) return t;
        } catch {
            /* ignore parse error */
        }
    }
    return null;
}

/**
 * 定数時間文字列比較。Bearer トークンの照合で timing 攻撃を防ぐために使う。
 */
export function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

/**
 * Origin ヘッダー検証。
 * allowed が null なら無検証 (開発用)。
 */
export function isOriginAllowed(req: IncomingMessage, allowed: string[] | null): boolean {
    if (allowed === null) return true;
    const origin = req.headers["origin"];
    if (typeof origin !== "string") return false;
    return allowed.includes(origin);
}
