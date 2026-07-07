import type Database from "better-sqlite3";
import { formatYyyymmdd, openDateDatabase } from "./schema.js";
import type { IngestEnvelope } from "../types/ingest.js";
import type { Logger } from "../logger.js";

/**
 * 日付別 SQLite ファイルを切り替えながら書き込むリポジトリ。
 *
 * - その日の最初の write 時に `timing_YYYYMMDD.db` を開く。
 * - 日付が跨いだら旧 DB を Close して新しい日の DB を開く (WAL flush 保証)。
 * - 失敗した行は throw せず error ログを出して握りつぶす (継続性最優先)。
 */
export class TimingRepository {
    private currentDate: string | null = null;
    private db: Database.Database | null = null;
    private insertMessageStmt: Database.Statement | null = null;
    private insertPassingStmt: Database.Statement | null = null;
    private insertStandingStmt: Database.Statement | null = null;

    constructor(
        private readonly dataDir: string,
        private readonly logger: Logger,
    ) {}

    /**
     * envelope 1 件を該当日 DB に書き込む。
     *
     * - `messages` には常に書く (rawデータ保全)
     * - `Passing` は `passings` テーブルに展開
     * - `Standings` は `standings` テーブルに展開
     */
    insertEnvelope(envelope: IngestEnvelope): void {
        try {
            const db = this.ensureDb(new Date());

            this.insertMessageStmt!.run(
                envelope.circuitId,
                envelope.kind,
                envelope.ts,
                JSON.stringify(envelope.payload ?? {}),
            );

            if (envelope.kind === "Passing") {
                const p = envelope.payload as Record<string, unknown>;
                this.insertPassingStmt!.run(
                    envelope.circuitId,
                    pickInt(p, "loopId", "LoopId"),
                    pickStr(p, "teamId", "TeamId"),
                    pickInt(p, "driverNo", "DriverNo"),
                    pickInt(p, "time", "Time"),
                    pickStr(p, "type", "Type"),
                    envelope.ts,
                );
            } else if (envelope.kind === "Standings") {
                const p = envelope.payload as Record<string, unknown>;
                // MOLA は全車を items[] にまとめて送る。旧単一形式もフォールバックで許容。
                const rawItems = p["items"] ?? p["Items"];
                const items = Array.isArray(rawItems)
                    ? (rawItems as Array<Record<string, unknown>>)
                    : [p];
                for (const item of items) {
                    if (pickStr(item, "teamId", "TeamId") === null) continue;
                    this.insertStandingStmt!.run(
                        envelope.circuitId,
                        pickInt(item, "position", "Position"),
                        pickInt(item, "classPosition", "ClassPosition"),
                        pickStr(item, "teamId", "TeamId"),
                        pickInt(item, "lap", "Lap"),
                        pickInt(item, "bestTime", "BestTime"),
                        pickInt(item, "lastLapTime", "LastLapTime"),
                        pickInt(item, "sectorNo", "SectorNo"),
                        pickInt(item, "sectorTime", "SectorTime"),
                        envelope.ts,
                    );
                }
            }
        } catch (err) {
            this.logger.error("repository.insertEnvelope failed", {
                kind: envelope.kind,
                error: (err as Error).message,
            });
        }
    }

    /**
     * 直近 N 件の envelope を返す (起動直後やフロントエンド再接続時のリプレイ用)。
     */
    recentMessages(circuitId: string, limit: number): IngestEnvelope[] {
        try {
            const db = this.ensureDb(new Date());
            const rows = db
                .prepare(
                    `SELECT kind, client_ts, payload_json
                     FROM messages
                     WHERE circuit_id = ?
                     ORDER BY id DESC
                     LIMIT ?`,
                )
                .all(circuitId, limit) as Array<{
                kind: string;
                client_ts: string;
                payload_json: string;
            }>;

            return rows.reverse().map((r) => ({
                seq: 0,
                circuitId,
                ts: r.client_ts,
                kind: r.kind as IngestEnvelope["kind"],
                payload: JSON.parse(r.payload_json) as Record<string, unknown>,
            }));
        } catch (err) {
            this.logger.error("repository.recentMessages failed", {
                error: (err as Error).message,
            });
            return [];
        }
    }

    close(): void {
        if (this.db) {
            try {
                this.db.close();
            } catch {
                /* ignore */
            }
            this.db = null;
        }
        this.insertMessageStmt = null;
        this.insertPassingStmt = null;
        this.insertStandingStmt = null;
        this.currentDate = null;
    }

    // ============================================================
    // private
    // ============================================================

    private ensureDb(now: Date): Database.Database {
        const today = formatYyyymmdd(now);
        if (this.currentDate === today && this.db) {
            return this.db;
        }

        // 日付が変わった、または初回。
        this.close();
        this.currentDate = today;
        this.db = openDateDatabase(this.dataDir, now);

        this.insertMessageStmt = this.db.prepare(`
            INSERT INTO messages (circuit_id, kind, client_ts, payload_json)
            VALUES (?, ?, ?, ?);
        `);
        this.insertPassingStmt = this.db.prepare(`
            INSERT INTO passings (circuit_id, loop_id, team_id, driver_no, time_10000s, type, client_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        `);
        this.insertStandingStmt = this.db.prepare(`
            INSERT INTO standings (
                circuit_id, position, class_position, team_id,
                lap, best_time, last_lap_time, sector_no, sector_time, client_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);

        this.logger.info("opened day db", { date: today });
        return this.db;
    }
}

function pickInt(obj: Record<string, unknown>, ...keys: string[]): number | null {
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string" && v.length > 0) return v;
        if (typeof v === "number") return String(v);
    }
    return null;
}
