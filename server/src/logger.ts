import type { LogLevel } from "./config.js";

const RANK: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

/**
 * 軽量ロガー。pino を入れるほどでもないので console ベースの薄いラッパー。
 * 後で pino / winston に置き換える前提のインタフェース。
 */
export class Logger {
    constructor(private readonly minLevel: LogLevel) {}

    debug(msg: string, ctx?: Record<string, unknown>): void {
        this.write("debug", msg, ctx);
    }
    info(msg: string, ctx?: Record<string, unknown>): void {
        this.write("info", msg, ctx);
    }
    warn(msg: string, ctx?: Record<string, unknown>): void {
        this.write("warn", msg, ctx);
    }
    error(msg: string, ctx?: Record<string, unknown>): void {
        this.write("error", msg, ctx);
    }

    private write(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
        if (RANK[level] < RANK[this.minLevel]) return;
        const ts = new Date().toISOString();
        const line = ctx ? `${ts} [${level}] ${msg} ${JSON.stringify(ctx)}` : `${ts} [${level}] ${msg}`;
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
    }
}
