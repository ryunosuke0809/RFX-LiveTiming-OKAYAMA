import crypto from "node:crypto";

/**
 * 管理者パスワードのハッシュ化。
 *
 * bcrypt / argon2 を足さず Node 標準の scrypt を使う。ネイティブビルドが増えず、
 * 小規模な管理者アカウント運用には十分な強度が得られる。
 */

const SALT_BYTES = 16;
const KEY_BYTES = 64;
/** scrypt コストパラメーター。N を上げると総当たりコストが上がる。 */
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
    N: 16384,
    r: 8,
    p: 1,
    // N=16384, r=8 では既定の maxmem (32MB) を超えるため明示的に広げる
    maxmem: 64 * 1024 * 1024,
};

export interface PasswordHash {
    hash: string;
    salt: string;
}

/** パスワードの最低要件。管理画面・CLI の両方から使う。 */
export function validatePasswordStrength(password: string): string | null {
    if (password.length < 10) return "パスワードは 10 文字以上にしてください";
    if (password.length > 200) return "パスワードが長すぎます";
    return null;
}

export function hashPassword(password: string, salt?: string): PasswordHash {
    const useSalt = salt ?? crypto.randomBytes(SALT_BYTES).toString("hex");
    const derived = crypto.scryptSync(password, useSalt, KEY_BYTES, SCRYPT_OPTIONS);
    return { hash: derived.toString("hex"), salt: useSalt };
}

export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
    let derived: Buffer;
    try {
        derived = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
    } catch {
        return false;
    }
    let expected: Buffer;
    try {
        expected = Buffer.from(expectedHash, "hex");
    } catch {
        return false;
    }
    if (expected.length !== derived.length) return false;
    return crypto.timingSafeEqual(derived, expected);
}

/** ログインセッショントークン (Cookie に載せる生の値)。 */
export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

/** DB にはトークンの生値ではなくハッシュだけを保存する。 */
export function hashSessionToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}
