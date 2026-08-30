/**
 * Cancel/Edit で個別周回が更新されることの回帰確認。
 * 実行: npx tsx scripts/test-lap-correction.ts
 */
import { SessionStateAggregator } from "../src/state/aggregator.js";
import { LiveSessionState } from "../src/state/session-state.js";
import type { IngestEnvelope } from "../src/types/ingest.js";

const TEAM = "1:1:12";
let seq = 1;

function env(kind: IngestEnvelope["kind"], payload: Record<string, unknown>): IngestEnvelope {
    return {
        seq: seq++,
        circuitId: "okayama",
        ts: new Date().toISOString(),
        kind,
        payload,
    };
}

function standing(lap: number, lastLapTime: number, lastPassingTime: number) {
    return env("Standings", {
        teamId: TEAM,
        position: 20,
        classPosition: 4,
        driverNo: 1,
        lap,
        bestTime: 910100,
        bestTimeLap: 8,
        lastLapTime,
        lastPassingTime,
        sectorNo: 0,
        sectorTime: null,
        order: 20,
    });
}

function assert(cond: unknown, msg: string): void {
    if (!cond) {
        console.error("FAIL:", msg);
        process.exit(1);
    }
}

const state = new LiveSessionState();
const agg = new SessionStateAggregator(state);

agg.apply(env("Team", { id: TEAM, classId: "1:2:0", no: 51, nameJ: "AMAC Motorsport", nameE: "", drivers: [] }));
agg.apply(standing(28, 966980, 391611480)); // baseline, 記録しない
agg.apply(standing(29, 963450, 392574930)); // lap 29 を記録
agg.apply(standing(30, 910000, 393484930)); // lap 30 を記録 (誤通過)

let laps = state.teamLaps.get(TEAM) ?? [];
assert(laps.map((l) => l.lap).join(",") === "29,30", `after false FL got ${laps.map((l) => `${l.lap}:${l.lapTime}`)}`);
assert(laps.find((l) => l.lap === 30)?.lapTime === 910000, "lap 30 should be 910000");

agg.apply(env("Passing", { teamId: TEAM, loopId: 0, time: 392574930, driverNo: 1, type: "Cancel" }));
agg.apply(standing(29, 966980, 391611480)); // Cancel 後、周回数巻き戻し

laps = state.teamLaps.get(TEAM) ?? [];
assert(laps.map((l) => l.lap).join(",") === "29", `after cancel got ${laps.map((l) => `${l.lap}:${l.lapTime}`)}`);
assert(laps[0]?.lapTime === 966980, `lap 29 should follow reverted LastLapTime, got ${laps[0]?.lapTime}`);

agg.apply(env("Passing", { teamId: TEAM, loopId: 0, time: 398428950, driverNo: 1, type: "Edit", lapTimeUse: false }));
agg.apply(standing(30, 6817470, 398428950));

laps = state.teamLaps.get(TEAM) ?? [];
assert(laps.map((l) => l.lap).join(",") === "29,30", `after edit got ${laps.map((l) => `${l.lap}:${l.lapTime}`)}`);
const lap30 = laps.find((l) => l.lap === 30);
assert(lap30?.lapTime === 6817470, `lap 30 should be 6817470, got ${lap30?.lapTime}`);

console.log("ok", laps.map((l) => `L${l.lap}=${l.lapTime}`).join(" "));
