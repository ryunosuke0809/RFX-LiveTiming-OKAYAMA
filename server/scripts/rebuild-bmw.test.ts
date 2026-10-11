/**
 * Category が来ない BMW&MINI を、車番入替とクラスから別リザルトにする。
 * 実行: npx tsx scripts/rebuild-bmw.test.ts
 */
import assert from "node:assert/strict";
import { rebuildSessionsFromMessages } from "../src/archive/rebuild.js";
import type { IngestEnvelope, SmisMessageKind } from "../src/types/ingest.js";

let seq = 0;
const envelopes: IngestEnvelope[] = [];

function push(ts: string, kind: SmisMessageKind, payload: Record<string, unknown>): void {
    seq += 1;
    envelopes.push({ seq, circuitId: "okayama", ts, kind, payload });
}

function master(ts: string, category: string | null, round: "予選" | "決勝", classes: string[], teams: Array<[string, string, string]>): void {
    push(ts, "Competition", {
        id: "1",
        nameJ: "2026 OKAYAMAチャレンジカップレース 第4戦",
        nameE: "",
        startDate: "2026/10/11",
        endDate: "2026/10/12",
    });
    if (category) {
        push(ts, "Category", {
            id: "1:1",
            nameJ: category,
            nameE: "",
            courseName: "OKAYAMA International Circuit",
            courseLengthCm: 370300,
        });
    }
    push(ts, "Round", {
        id: "1:1:1",
        nameJ: round,
        nameE: round === "決勝" ? "Race" : "Qualifying",
        type: "Lap",
    });
    classes.forEach((name, i) => {
        push(ts, "Class", { id: `1:${i + 1}:0`, nameJ: name, nameE: "", record: "" });
    });
    for (const [id, no, name] of teams) {
        const classId = name.includes("JCW") ? "1:2:0" : "1:1:0";
        push(ts, "Team", {
            id,
            classId,
            no,
            nameJ: name,
            nameE: "",
            drivers: [{ no: 1, nameJ: name, nameE: name }],
        });
    }
    push(ts, "Select", { sessionId: "1:1:1:1:1" });
}

function start(ts: string, dateTime: string): void {
    push(ts, "Start", { dateTime, sessionId: "1:1:1:1:1" });
}

function standings(ts: string, rows: Array<[string, number, number]>): void {
    push(ts, "Standings", {
        sessionId: "1:1:1:1:1",
        items: rows.map(([teamId, lap, bestTime], i) => ({
            teamId,
            position: i + 1,
            classPosition: 1,
            lap,
            bestTime,
            lastLapTime: bestTime,
        })),
    });
}

// VITA 予選 → Category なしで BMW Rd.9 → N1 決勝 → Category なしで BMW Rd.10
master("2026-10-11T09:11:53+09:00", "MEC VITA 公式予選", "予選", ["VAA"], [
    ["1:1:1", "35", "まこと君グラホ号"],
]);
start("2026-10-11T09:15:13+09:00", "2026/10/11 09:15.12");
standings("2026-10-11T09:20:00+09:00", [["1:1:1", 4, 1030000]]);

master("2026-10-11T09:36:36+09:00", null, "決勝", ["B", "J", "C"], [
    ["1:1:1", "1", "DGMS M2 Racing"],
    ["1:1:5", "15", "One Motion Entry F56JCW EVO"],
]);
// 車番入替でクラスが消えるので、実データと同じくマスターを再送する
master("2026-10-11T09:36:37+09:00", null, "決勝", ["B", "J", "C"], [
    ["1:1:1", "1", "DGMS M2 Racing"],
    ["1:1:5", "15", "One Motion Entry F56JCW EVO"],
]);
start("2026-10-11T10:03:26+09:00", "2026/10/11 10:03.26");
standings("2026-10-11T10:20:00+09:00", [
    ["1:1:1", 8, 1100000],
    ["1:1:5", 8, 1110000],
]);

master("2026-10-11T10:36:36+09:00", "N1ロードスター 決勝", "決勝", ["A", "N1"], [
    ["1:1:1", "34", "ウィザードカートップロードスター"],
]);
start("2026-10-11T11:03:11+09:00", "2026/10/11 11:03.10");
standings("2026-10-11T11:20:00+09:00", [["1:1:1", 10, 1080000]]);

master("2026-10-11T13:00:58+09:00", null, "決勝", ["B", "J", "C", "OIC"], [
    ["1:1:1", "1", "DGMS M2 Racing"],
    ["1:1:5", "15", "One Motion Entry F56JCW EVO"],
]);
master("2026-10-11T13:00:59+09:00", null, "決勝", ["B", "J", "C"], [
    ["1:1:1", "1", "DGMS M2 Racing"],
    ["1:1:5", "15", "One Motion Entry F56JCW EVO"],
]);
start("2026-10-11T13:22:56+09:00", "2026/10/11 13:22.55");
standings("2026-10-11T13:40:00+09:00", [
    ["1:1:1", 9, 1090000],
    ["1:1:5", 9, 1120000],
]);

master("2026-10-11T14:06:08+09:00", "MEC 120 Minutes 決勝", "決勝", ["GPA"], [
    ["1:1:1", "31", "G-TECH"],
]);

const sessions = rebuildSessionsFromMessages("20261011", envelopes);
const titles = sessions.map((s) => `${s.categoryName} cars=${s.carCount} nos=${s.snapshot.standings.map((st) => st.teamNo).join(",")}`);
console.log(titles.join("\n"));

assert.deepEqual(
    sessions.map((s) => s.categoryName),
    [
        "MEC VITA 公式予選",
        "BMW&MINI 10:03",
        "N1ロードスター 決勝",
        "BMW&MINI 13:22",
    ],
);

const rd9 = sessions.find((s) => s.categoryName === "BMW&MINI 10:03");
const rd10 = sessions.find((s) => s.categoryName === "BMW&MINI 13:22");
assert.ok(rd9);
assert.ok(rd10);
assert.deepEqual(rd9.snapshot.standings.map((s) => s.teamNo).sort(), ["1", "15"]);
assert.equal(rd9.snapshot.standings.find((s) => s.teamNo === "1")?.teamNameJ, "DGMS M2 Racing");
assert.deepEqual(rd10.snapshot.standings.map((s) => s.teamNo).sort(), ["1", "15"]);
assert.notEqual(rd9.sessionKey, rd10.sessionKey);
assert.equal(sessions.filter((s) => s.categoryName.startsWith("BMW&MINI")).length, 2);

console.log("ok");
