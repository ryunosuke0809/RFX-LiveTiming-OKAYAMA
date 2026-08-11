import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * /ws 接続用の短期トークン。
 *
 * 形式: `<base64url(payload)>.<base64url(hmac-sha256)>`
 * payload: `{ "exp": <unixSec>, "v": 1 }`
 *
 * 接続ハンドシェイク時のみ検証する。接続後は再検証しないため、
 * 正規ユーザーの長時間視聴はそのまま維持される。
 */

interface ViewTokenPayload {
    exp: number;
    v: 1;
}

function base64UrlEncode(buf: Buffer): string {
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Buffer | null {
    try {
        const padded = s.replace(/-/g, "+").replace(/_/g, "/");
        const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
        return Buffer.from(padded + pad, "base64");
    } catch {
        return null;
    }
}

function sign(payloadB64: string, secret: string): string {
    return base64UrlEncode(createHmac("sha256", secret).update(payloadB64).digest());
}

export function issueViewToken(
    secret: string,
    ttlSec: number,
    nowSec = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number; expiresIn: number } {
    const ttl = Math.max(30, Math.floor(ttlSec));
    const exp = nowSec + ttl;
    const payload: ViewTokenPayload = { exp, v: 1 };
    const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
    const token = `${payloadB64}.${sign(payloadB64, secret)}`;
    return { token, expiresAt: exp, expiresIn: ttl };
}

/** 有効なら true。時計ズレ許容は 30 秒。 */
export function verifyViewToken(
    token: string,
    secret: string,
    nowSec = Math.floor(Date.now() / 1000),
): boolean {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return false;

    const expected = sign(payloadB64, secret);
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const raw = base64UrlDecode(payloadB64);
    if (!raw) return false;
    let payload: ViewTokenPayload;
    try {
        payload = JSON.parse(raw.toString("utf8")) as ViewTokenPayload;
    } catch {
        return false;
    }
    if (payload.v !== 1 || typeof payload.exp !== "number") return false;
    return payload.exp + 30 >= nowSec;
}
