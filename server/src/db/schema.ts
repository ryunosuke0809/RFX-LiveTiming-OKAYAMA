import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * 日付別 SQLite ファイルを開く。
 *
 *   `${dataDir}/timing_YYYYMMDD.db`
 *
 * - WAL モードで開く (書込中も読取可能、クラッシュ耐性向上)。
 * - 初回オープン時にテーブルが無ければ作成する。
 *
 * 日付が変わったら呼び出し側 (DbRouter) が新しい接続を作って差し替える。
 */
export function openDateDatabase(dataDir: string, date: Date): Database.Database {
    fs.mkdirSync(dataDir, { recursive: true });
    const yyyymmdd = formatYyyymmdd(date);
    const filePath = path.join(dataDir, `timing_${yyyymmdd}.db`);

    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");

    initSchema(db);
    return db;
}

/** YYYYMMDD 形式の文字列 (ローカルタイムゾーン基準)。 */
export function formatYyyymmdd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
}

/**
 * テーブルを作成。
 *
 * 設計方針:
 * - すべての raw envelope を `messages` テーブルに JSON のまま保管 (生データロスト防止)。
 * - 重要 DTO (`passings` / `standings`) は表形式の専用テーブルにも展開して、
 *   集計クエリ (リザルト) を効率化する。
 * - circuit_id を全テーブルに含めて、後日複数サーキット運用に拡張可能にする。
 */
function initSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            circuit_id      TEXT    NOT NULL,
            kind            TEXT    NOT NULL,
            client_ts       TEXT    NOT NULL,
            server_ts       TEXT    NOT NULL DEFAULT (datetime('now')),
            payload_json    TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_circuit_kind
            ON messages (circuit_id, kind);

        CREATE INDEX IF NOT EXISTS idx_messages_server_ts
            ON messages (server_ts);

        CREATE TABLE IF NOT EXISTS passings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            circuit_id      TEXT    NOT NULL,
            loop_id         INTEGER,
            team_id         TEXT,
            driver_no       INTEGER,
            time_10000s     INTEGER,   -- SMIS の 1/10000 秒単位の生値
            type            TEXT,      -- N/B/M/C/E
            client_ts       TEXT    NOT NULL,
            server_ts       TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_passings_circuit_team
            ON passings (circuit_id, team_id);

        CREATE INDEX IF NOT EXISTS idx_passings_loop_time
            ON passings (loop_id, time_10000s);

        CREATE TABLE IF NOT EXISTS standings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            circuit_id      TEXT    NOT NULL,
            position        INTEGER,
            class_position  INTEGER,
            team_id         TEXT,
            lap             INTEGER,
            best_time       INTEGER,
            last_lap_time   INTEGER,
            sector_no       INTEGER,
            sector_time     INTEGER,
            client_ts       TEXT    NOT NULL,
            server_ts       TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_standings_circuit_team
            ON standings (circuit_id, team_id);

        CREATE INDEX IF NOT EXISTS idx_standings_server_ts
            ON standings (server_ts);
    `);
}
