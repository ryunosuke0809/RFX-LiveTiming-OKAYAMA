/**
 * Cancel/Edit で個別周回が更新されることの回帰確認。
 * 実行: npx tsx scripts/test-lap-correction.ts
 */
import { SessionStateAggregator } from "../src/state/aggregator.js";
import { LiveSessionState } from "../src/state/session-state.js";
import type { IngestEnvelope } from "../src/types/ingest.js";

const TEAM = "1:1:12";
const TEAM11 = "1:1:4";
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

function standing(lap: number, lastLapTime: number, lastPassingTime: number, teamId = TEAM) {
    return env("Standings", {
        teamId,
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

function passing(
    teamId: string,
    time: number,
    type: string,
    id: string,
    loopId = 0,
): IngestEnvelope {
    return env("Passing", {
        id,
        teamId,
        loopId,
        time,
        driverNo: 1,
        type,
        lapTimeUse: type !== "Edit" && type !== "E",
    });
}

function assert(cond: unknown, msg: string): void {
    if (!cond) {
        console.error("FAIL:", msg);
        process.exit(1);
    }
}

{
    const state = new LiveSessionState();
    const agg = new SessionStateAggregator(state);
    agg.apply(env("Team", { id: TEAM, classId: "1:2:0", no: 51, nameJ: "AMAC", nameE: "", drivers: [] }));
    agg.apply(standing(28, 966980, 391611480));
    agg.apply(standing(29, 963450, 392574930));
    agg.apply(standing(30, 910000, 393484930));
    agg.apply(passing(TEAM, 392574930, "Cancel", "new-id-not-original"));
    agg.apply(standing(29, 966980, 391611480));
    let laps = state.teamLaps.get(TEAM) ?? [];
    assert(laps.map((l) => l.lap).join(",") === "29", `standings cancel got ${laps.map((l) => `${l.lap}:${l.lapTime}`)}`);
    agg.apply(passing(TEAM, 398428950, "Edit", "another-new-id"));
    agg.apply(standing(30, 6817470, 398428950));
    laps = state.teamLaps.get(TEAM) ?? [];
    assert(laps.map((l) => l.lap).join(",") === "29,30", `after edit+standing got ${laps.map((l) => `${l.lap}:${l.lapTime}`)}`);
    assert(laps.find((l) => l.lap === 30)?.lapTime === 6817470, "lap 30 should be 6817470");
    console.log("ok standings-path", laps.map((l) => `L${l.lap}=${l.lapTime}`).join(" "));
}

{
    const state = new LiveSessionState();
    const agg = new SessionStateAggregator(state);
    agg.apply(env("Team", { id: TEAM11, classId: "1:1:0", no: 11, nameJ: "Origine", nameE: "", drivers: [] }));
    // 4 本の FL。先頭をスタートとみると 3 周。33 周目相当の 3000 を type=C で消す。
    for (const [i, t] of [1000, 2000, 3000, 4000].entries()) {
        agg.apply(passing(TEAM11, t, "Normal", `orig-${i}`));
    }
    agg.apply(passing(TEAM11, 3000, "C", "cancel-different-id"));
    const laps = state.teamLaps.get(TEAM11) ?? [];
    assert(laps.length === 2, `merged laps length ${laps.length}`);
    assert(laps[0]?.lapTime === 1000, `L1 ${laps[0]?.lapTime}`);
    assert(laps[1]?.lapTime === 2000, `merged L2 should be 2000, got ${laps[1]?.lapTime}`);
    // Edit は別 ID・別 Time の新規通過
    agg.apply(passing(TEAM11, 5500, "E", "edit-id-unrelated"));
    const after = state.teamLaps.get(TEAM11) ?? [];
    assert(after.length === 3, `after edit length ${after.length}`);
    assert(after[2]?.lapTime === 1500, `new L3 ${after[2]?.lapTime}`);
    console.log("ok passing-path", after.map((l) => `L${l.lap}=${l.lapTime}`).join(" "));
}

{
    const state = new LiveSessionState();
    const agg = new SessionStateAggregator(state);
    agg.apply(env("Team", { id: TEAM11, classId: "1:1:0", no: 11, nameJ: "Origine", nameE: "", drivers: [] }));
    agg.apply(standing(0, 0, 0, TEAM11));
    agg.apply(standing(1, 25000, 10000, TEAM11)); // L1 = スタート〜最初の FL
    for (const [i, t] of [10000, 20000, 30000, 40000].entries()) {
        agg.apply(passing(TEAM11, t, "Normal", `fl-${i}`));
    }
    agg.apply(passing(TEAM11, 30000, "C", "cancel-33"));
    const laps = state.teamLaps.get(TEAM11) ?? [];
    assert(laps[0]?.lapTime === 25000, `keep L1 got ${laps[0]?.lapTime}`);
    assert(laps.length === 3, `keep-L1 length ${laps.length} ${laps.map((l) => l.lapTime)}`);
    assert(laps[2]?.lapTime === 20000, `merged last-but-one ${laps[2]?.lapTime}`);
    console.log("ok keep-L1", laps.map((l) => `L${l.lap}=${l.lapTime}`).join(" "));
}
