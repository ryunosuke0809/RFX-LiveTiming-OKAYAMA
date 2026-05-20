// Aggregator スモークテスト:
// 1. /ws に接続 (フロント役) → hello + state を受け取れる
// 2. /ingest に接続 (Receiver 役) → Competition/Class/Team/Standings を投げる
// 3. /ws 側で patch が順次受信できる

import WebSocket from "ws";

const INGEST_URL = "ws://127.0.0.1:4000/ingest";
const VIEW_URL = "ws://127.0.0.1:4000/ws";
const TOKEN = "test-token-12345";

const viewMessages = [];

const viewer = new WebSocket(VIEW_URL);
viewer.on("open", () => console.log("[viewer] connected"));
viewer.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    viewMessages.push(msg);
    console.log("[viewer]", JSON.stringify(msg).slice(0, 200));
});

await new Promise((r) => setTimeout(r, 500));

const sender = new WebSocket(INGEST_URL, {
    headers: { Authorization: `Bearer ${TOKEN}` },
});
sender.on("open", () => console.log("[sender] connected"));
sender.on("message", (data) =>
    console.log("[sender] reply:", data.toString().slice(0, 120)),
);

await new Promise((r) => setTimeout(r, 300));

const now = new Date().toISOString();
const seqGen = (() => {
    let n = 1;
    return () => n++;
})();

function send(kind, payload) {
    sender.send(
        JSON.stringify({
            seq: seqGen(),
            circuitId: "okayama",
            ts: now,
            kind,
            payload,
        }),
    );
}

send("Competition", { id: "C001", nameJ: "岡山選手権", nameE: "Okayama Championship", startDate: "2026-05-20", endDate: "2026-05-20" });
send("Category", { id: "CAT001", nameJ: "GT", nameE: "GT", courseName: "Okayama", courseLength: 380500 });
send("Round", { id: "R01", nameJ: "第1戦", nameE: "Round 1", type: "L" });
send("Session", { id: "S01", nameJ: "予選", nameE: "Qualifying", time: "00:30", lap: 0 });
send("Class", { id: "GT500", nameJ: "GT500", nameE: "GT500", record: "", color: "#FF0000" });
send("Class", { id: "GT300", nameJ: "GT300", nameE: "GT300", record: "", color: "#00FF00" });
send("Team", { id: "T001", classId: "GT500", no: 1, nameJ: "チーム1", nameE: "Team 1", drivers: [{ no: 1, nameJ: "山田太郎", nameE: "Taro Yamada", nation: "JPN" }] });
send("Team", { id: "T002", classId: "GT500", no: 2, nameJ: "チーム2", nameE: "Team 2", drivers: [{ no: 2, nameJ: "鈴木一郎", nameE: "Ichiro Suzuki", nation: "JPN" }] });

await new Promise((r) => setTimeout(r, 300));

send("Standings", {
    teamId: "T001",
    position: 1,
    classPosition: 1,
    driverNo: 1,
    lap: 5,
    bestTime: 935910,
    bestTimeLap: 3,
    lastLapTime: 938000,
    lastPassingTime: 12345600,
    sectorNo: 0,
    sectorTime: null,
    order: 1,
});

send("Standings", {
    teamId: "T002",
    position: 2,
    classPosition: 2,
    driverNo: 2,
    lap: 5,
    bestTime: 939200,
    bestTimeLap: 4,
    lastLapTime: 940500,
    lastPassingTime: 12349100,
    sectorNo: 0,
    sectorTime: null,
    order: 2,
});

await new Promise((r) => setTimeout(r, 300));

send("Passing", { teamId: "T001", loopId: 11, driverNo: 1, time: 12350000 });

await new Promise((r) => setTimeout(r, 300));

send("Message", { type: "T", scope: "A", text: "YELLOW FLAG SECTOR 2" });

await new Promise((r) => setTimeout(r, 500));

console.log("\n=== Summary ===");
console.log(`viewer received ${viewMessages.length} messages`);

const byType = new Map();
for (const m of viewMessages) {
    byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
}
console.log("types:", Object.fromEntries(byType));

const stateMsg = viewMessages.find((m) => m.type === "state");
if (stateMsg) {
    console.log("\n--- initial state.standings ---");
    console.log(JSON.stringify(stateMsg.state.standings, null, 2));
}

const patchMsgs = viewMessages.filter((m) => m.type === "patch");
console.log("\n--- patches (first 4) ---");
for (const p of patchMsgs.slice(0, 4)) {
    console.log(JSON.stringify(p, null, 2));
}

console.log("\n--- last patch ---");
if (patchMsgs.length > 0) {
    console.log(JSON.stringify(patchMsgs[patchMsgs.length - 1], null, 2));
}

sender.close();
viewer.close();
process.exit(0);
