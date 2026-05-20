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
    frontendViewToken: string | null;
    allowedOrigins: string[] | null;
    dataDir: string;
    recentMessageBuffer: number;
    logLevel: LogLevel;
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

    return {
        port: parsePositiveInt(process.env.PORT, 4000),
        host: process.env.HOST?.trim() || "127.0.0.1",
        ingestToken,
        frontendViewToken: frontendToken.length > 0 ? frontendToken : null,
        allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
        dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
        recentMessageBuffer: parsePositiveInt(process.env.RECENT_MESSAGE_BUFFER, 2000),
        logLevel: parseLogLevel(process.env.LOG_LEVEL),
    };
}
