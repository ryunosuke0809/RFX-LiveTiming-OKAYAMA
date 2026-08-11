import "dotenv/config";
import path from "node:path";

/**
 * 環境変数から読み込んだランタイム設定。
 * すべて立ち上げ時に 1 回だけ評価し、以後 immutable で扱う。
 */
export interface AppConfig {
    port: number;
    host: string;
    ingestToken: string;
    /** レガシー静的トークン。設定時は /ws で引き続き受理する。 */
    frontendViewToken: string | null;
    /**
     * 短期 /ws トークン署名鍵。非空なら /ws は有効な短期トークン
     * （または frontendViewToken）必須。
     */
    wsViewSecret: string | null;
    /** 短期トークン TTL（秒）。既定 300。 */
    wsViewTokenTtlSec: number;
    allowedOrigins: string[] | null;
    dataDir: string;
    recentMessageBuffer: number;
    logLevel: LogLevel;
}

/** /ws 認証が有効か（短期秘密鍵 or 静的トークン）。 */
export function requiresViewAuth(config: AppConfig): boolean {
    return config.wsViewSecret !== null || config.frontendViewToken !== null;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

function parseLogLevel(value: string | undefined): LogLevel {
    switch ((value ?? "info").toLowerCase()) {
        case "debug":
        case "info":
        case "warn":
        case "error":
            return value!.toLowerCase() as LogLevel;
        default:
            return "info";
    }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseOrigins(value: string | undefined): string[] | null {
    if (!value || value.trim() === "") return null;
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export function loadConfig(): AppConfig {
    const ingestToken = process.env.RECEIVER_INGEST_TOKEN ?? "";
    if (ingestToken.length < 8) {
        throw new Error(
            "RECEIVER_INGEST_TOKEN must be set to a sufficiently long random string (>=8 chars). " +
                "See .env.example and regenerate via `openssl rand -hex 32`.",
        );
    }

    const frontendToken = process.env.FRONTEND_VIEW_TOKEN?.trim() ?? "";
    const wsViewSecret = process.env.WS_VIEW_SECRET?.trim() ?? "";

    return {
        port: parsePositiveInt(process.env.PORT, 4000),
        host: process.env.HOST?.trim() || "127.0.0.1",
        ingestToken,
        frontendViewToken: frontendToken.length > 0 ? frontendToken : null,
        wsViewSecret: wsViewSecret.length >= 16 ? wsViewSecret : null,
        wsViewTokenTtlSec: parsePositiveInt(process.env.WS_VIEW_TOKEN_TTL_SEC, 300),
        allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
        dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
        recentMessageBuffer: parsePositiveInt(process.env.RECENT_MESSAGE_BUFFER, 2000),
        logLevel: parseLogLevel(process.env.LOG_LEVEL),
    };
}
