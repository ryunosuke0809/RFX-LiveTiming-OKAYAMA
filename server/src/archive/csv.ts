import type { LiveStateSnapshot, StandingVm, LapDataVm } from "../state/types.js";

/** SMIS 1/10000 秒 → 表示文字列 (フロント formatTime と同等)。 */
export function formatTime10000(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return "";
    const totalMs = Math.round(v / 10);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    if (minutes > 0) {
        return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
    }
    return `${seconds}.${String(ms).padStart(3, "0")}`;
}

function csvSafe(v: string): string {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function driverName(s: StandingVm, team?: { drivers: Array<{ no: number; nameJ: string; nameE: string }> }): string {
    // MOLA: Driver No=0 はチーム名スロット。実ドライバー (No>=1) を優先。
    const drivers = team?.drivers ?? [];
    const byNo =
        s.driverNo !== 0 ? drivers.find((d) => d.no === s.driverNo) : undefined;
    const real = byNo ?? drivers.find((d) => d.no !== 0);
    return (
        real?.nameE ||
        real?.nameJ ||
        (s.driverNo !== 0 ? s.driverNameE || s.driverNameJ : "") ||
        ""
    );
}

export function buildClassificationCsv(snapshot: LiveStateSnapshot): string {
    const session = snapshot.session;
    const meta = [
        `# Competition: ${session?.competitionNameE || session?.competitionNameJ || ""}`,
        `# Category: ${session?.categoryNameE || session?.categoryNameJ || ""}`,
        `# Session: ${session?.sessionNameE || session?.sessionNameJ || ""}`,
        `# Round: ${session?.roundNameE || session?.roundNameJ || ""}`,
        "",
    ];
    const header =
        "Position,Class Position,No.,Class,Name,Team,Best Time,Best Lap,Last Lap Time,Laps,S1,S2,S3,Pits,Status,Gap,Interval";
    const standings = [...snapshot.standings].sort(
        (a, b) =>
            (a.position > 0 ? a.position : 1e9) - (b.position > 0 ? b.position : 1e9) ||
            a.order - b.order,
    );
    const className = (classId: string) => {
        const c = snapshot.classes.find((x) => x.id === classId);
        return c?.nameE || c?.nameJ || classId;
    };
    const rows = standings.map((s) => {
        const team = snapshot.teams.find((t) => t.id === s.teamId);
        return [
            s.position > 0 ? s.position : "",
            s.classPosition > 0 ? s.classPosition : "",
            s.teamNo,
            csvSafe(className(s.classId)),
            csvSafe(driverName(s, team)),
            csvSafe(s.teamNameE || s.teamNameJ || ""),
            formatTime10000(s.bestTime),
            s.bestTimeLap > 0 ? s.bestTimeLap : "",
            formatTime10000(s.lastLapTime),
            s.lap,
            formatTime10000(s.sectors[0]?.time ?? null),
            formatTime10000(s.sectors[1]?.time ?? null),
            formatTime10000(s.sectors[2]?.time ?? null),
            s.pits,
            s.status.replace(/_/g, " ").toUpperCase(),
            csvSafe(s.gap),
            csvSafe(s.interval),
        ].join(",");
    });
    return [...meta, header, ...rows].join("\n");
}

export function buildLapsCsv(
    snapshot: LiveStateSnapshot,
    teamId: string,
): string | null {
    const standing = snapshot.standings.find((s) => s.teamId === teamId);
    const team = snapshot.teams.find((t) => t.id === teamId);
    if (!standing && !team) return null;
    const laps: LapDataVm[] = snapshot.driverLaps[teamId] ?? [];
    const session = snapshot.session;
    const cls = snapshot.classes.find((c) => c.id === (standing?.classId || team?.classId));
    const info = [
        `# Competition: ${session?.competitionNameE || session?.competitionNameJ || ""}`,
        `# Category: ${session?.categoryNameE || session?.categoryNameJ || ""}`,
        `# Session: ${session?.sessionNameE || session?.sessionNameJ || ""}`,
        `# No.${standing?.teamNo ?? team?.no ?? ""} ${standing?.teamNameE || team?.nameE || ""} (${cls?.nameE || cls?.nameJ || ""})`,
        `# Driver: ${standing ? driverName(standing, team) : ""}`,
        "",
    ];
    const header = "Lap,Lap Time,S1,S2,S3,Position,Pit";
    const rows = laps.map((l) =>
        [
            l.lap,
            formatTime10000(l.lapTime),
            formatTime10000(l.s1),
            formatTime10000(l.s2),
            formatTime10000(l.s3),
            l.position > 0 ? l.position : "",
            l.isPit ? "P" : "",
        ].join(","),
    );
    return [...info, header, ...rows].join("\n");
}
