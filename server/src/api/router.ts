import { Router } from "express";
import type { TimingRepository } from "../db/repository.js";
import type { BroadcastHub } from "../broadcast/hub.js";
import { ArchiveService } from "../archive/service.js";
import { buildClassificationCsv, buildLapsCsv } from "../archive/csv.js";

/**
 * REST API。
 * - health / messages: 運用・デバッグ
 * - archive/*: 過去セッション一覧・リザルト JSON / CSV
 */
export function createApiRouter(
    repository: TimingRepository,
    hub: BroadcastHub,
): Router {
    const router = Router();
    const archive = new ArchiveService(repository);

    router.get("/health", (_req, res) => {
        res.json({
            ok: true,
            serverTime: new Date().toISOString(),
            subscribers: hub.subscriberCount,
        });
    });

    /**
     * 直近メッセージを N 件取得する。
     * 利用例:
     *   GET /api/messages?circuit=okayama&limit=200
     */
    router.get("/messages", (req, res) => {
        const circuit = String(req.query["circuit"] ?? "okayama");
        const rawLimit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, 2000)
            : 100;
        const messages = repository.recentMessages(circuit, limit);
        res.json({ circuit, count: messages.length, messages });
    });

    // ---- 過去データ ----

    /** GET /api/archive/days → { days: ["2026-07-21", ...] } */
    router.get("/archive/days", (_req, res) => {
        res.json({ days: archive.listDays() });
    });

    /**
     * GET /api/archive/sessions?date=2026-07-21&circuit=okayama
     */
    router.get("/archive/sessions", (req, res) => {
        const date = String(req.query["date"] ?? "");
        if (!date) {
            res.status(400).json({ error: "date is required (YYYY-MM-DD or YYYYMMDD)" });
            return;
        }
        const circuit = req.query["circuit"]
            ? String(req.query["circuit"])
            : undefined;
        try {
            const sessions = archive.listSessions(date, circuit);
            res.json({ date, count: sessions.length, sessions });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    /**
     * GET /api/archive/results?date=2026-07-21&sessionIndex=0&circuit=okayama
     */
    router.get("/archive/results", (req, res) => {
        const date = String(req.query["date"] ?? "");
        const sessionIndex = Number.parseInt(String(req.query["sessionIndex"] ?? "0"), 10);
        if (!date || !Number.isFinite(sessionIndex) || sessionIndex < 0) {
            res.status(400).json({
                error: "date and sessionIndex (>=0) are required",
            });
            return;
        }
        const circuit = req.query["circuit"]
            ? String(req.query["circuit"])
            : undefined;
        try {
            const session = archive.getSession(date, sessionIndex, circuit);
            if (!session) {
                res.status(404).json({ error: "session not found" });
                return;
            }
            res.json(session);
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    /**
     * GET /api/archive/csv?date=...&sessionIndex=0&kind=classification|laps&teamId=
     */
    router.get("/archive/csv", (req, res) => {
        const date = String(req.query["date"] ?? "");
        const sessionIndex = Number.parseInt(String(req.query["sessionIndex"] ?? "0"), 10);
        const kind = String(req.query["kind"] ?? "classification");
        const teamId = req.query["teamId"] ? String(req.query["teamId"]) : "";
        if (!date || !Number.isFinite(sessionIndex) || sessionIndex < 0) {
            res.status(400).json({ error: "date and sessionIndex are required" });
            return;
        }
        const circuit = req.query["circuit"]
            ? String(req.query["circuit"])
            : undefined;
        try {
            const session = archive.getSession(date, sessionIndex, circuit);
            if (!session) {
                res.status(404).json({ error: "session not found" });
                return;
            }
            let csv: string | null = null;
            let filename = "result.csv";
            const dateYmd = session.date.replace(/-/g, "");
            const round = safeName(session.roundName || session.sessionName || "Session").slice(0, 24);
            if (kind === "laps") {
                if (!teamId) {
                    res.status(400).json({ error: "teamId is required for kind=laps" });
                    return;
                }
                csv = buildLapsCsv(session.snapshot, teamId);
                const team = session.snapshot.teams.find((t) => t.id === teamId);
                const no = team?.no != null ? `_No${team.no}` : "";
                filename = `Laps_${dateYmd}_${round}_s${sessionIndex}${no}.csv`;
            } else {
                csv = buildClassificationCsv(session.snapshot);
                filename = `Classification_${dateYmd}_${round}_s${sessionIndex}.csv`;
            }
            if (csv === null) {
                res.status(404).json({ error: "team not found in session" });
                return;
            }
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`,
            );
            res.send("\uFEFF" + csv);
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    return router;
}

function safeName(v: string): string {
    return (
        (v || "session")
            .trim()
            .replace(/[\\/:*?"<>|·・']/g, "")
            .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "") || "session"
    );
}
