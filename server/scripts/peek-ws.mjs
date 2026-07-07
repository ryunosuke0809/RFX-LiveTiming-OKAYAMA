import WebSocket from "ws";
const url = process.argv[2] ?? "ws://127.0.0.1:4000/ws";
const ws = new WebSocket(url);
let lastState = null;
const patchKinds = {};
ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === "state") lastState = m.state;
    if (m.type === "patch") for (const p of m.patches) patchKinds[p.kind] = (patchKinds[p.kind] ?? 0) + 1;
});
setTimeout(() => {
    if (!lastState) { console.log("no state received"); process.exit(1); }
    const s = lastState;
    console.log("session:", s.session ? `${s.session.competitionNameJ} / ${s.session.categoryNameJ}` : null);
    console.log("startedAt:", s.session?.sessionStartedAt, "dataTs:", s.dataTs);
    if (s.session?.sessionStartedAt && s.dataTs) {
        const el = Math.floor((Date.parse(s.dataTs) - Date.parse(s.session.sessionStartedAt)) / 1000);
        console.log("elapsedSec:", el, `(${Math.floor(el/60)}:${String(el%60).padStart(2,"0")})`);
    }
    console.log("teams:", s.teams.length, "classes:", s.classes.length, "standings:", s.standings.length);
    console.log("fastestLap:", s.fastestLap ? `#${s.fastestLap.teamNo} ${s.fastestLap.driverNameJ} ${s.fastestLap.lapTime}` : null);
    console.log("trackCount:", JSON.stringify(s.trackCount));
    console.log("session.isRace:", s.session?.isRace);
    console.log("top5:");
    for (const x of s.standings.slice(0, 5)) {
        const secs = (x.sectors ?? []).map((se) => (se && se.time ? `${se.time}(${se.type})` : "-")).join(" ");
        const sum = (x.sectors ?? []).reduce((a, se) => a + (se && se.time ? se.time : 0), 0);
        console.log(`  P${x.position} #${x.teamNo} ${x.driverNameJ} best=${x.bestTime} last=${x.lastLapTime} bestLap=${x.bestTimeLap} gap=${x.gap} sec=[${secs}] sum=${sum}`);
    }
    const dl = s.driverLaps ?? {};
    console.log("driverLaps counts:", Object.entries(dl).map(([k, v]) => `${k}:${v.length}`).join(" "));
    // ピット周 (isPit) を含むチームを探して表示
    const pitTeam = Object.entries(dl).find(([, v]) => v.some((l) => l.isPit));
    if (pitTeam) {
        console.log(`pit-lap sample ${pitTeam[0]}:`);
        for (const l of pitTeam[1]) console.log("  ", JSON.stringify(l));
    }
    console.log("refSectors P1-3:", s.standings.slice(0, 3).map((x) => `#${x.teamNo}:[${(x.refSectors ?? []).join(",")}]`).join(" "));
    console.log("patchKinds seen:", JSON.stringify(patchKinds));
    process.exit(0);
}, Number(process.argv[3] ?? 3000));
