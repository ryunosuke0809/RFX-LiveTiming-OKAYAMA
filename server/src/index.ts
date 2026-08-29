import http from "node:http";
import express from "express";
import { loadConfig, requiresViewAuth } from "./config.js";
import { Logger } from "./logger.js";
import { TimingRepository } from "./db/repository.js";
import { BroadcastHub } from "./broadcast/hub.js";
import { attachBroadcastServer } from "./broadcast/broadcast-server.js";
import { attachIngestServer } from "./ingest/ingest-server.js";
import { createApiRouter } from "./api/router.js";
import { createAdminRouter } from "./api/admin-router.js";
import { AdminStore } from "./admin/store.js";
import { ArchiveService } from "./archive/service.js";
import { LiveSessionState } from "./state/session-state.js";
import { SessionStateAggregator } from "./state/aggregator.js";
import { hydrateLiveStateFromDb } from "./state/hydrate.js";
import { startDayRollover } from "./state/day-rollover.js";
import { resolveLiveColumns } from "./display/live-columns.js";
import { sanitizeElapsedIdle } from "./display/elapsed-idle.js";

const config = loadConfig();
const logger = new Logger(config.logLevel);

logger.info("starting MOLA_Timing cloud server", {
    host: config.host,
    port: config.port,
    dataDir: config.dataDir,
    recentBuffer: config.recentMessageBuffer,
    originPolicy: config.allowedOrigins ? config.allowedOrigins.join(",") : "(any)",
    frontendAuth: requiresViewAuth(config)
        ? config.wsViewSecret
            ? "short-lived"
            : "static"
        : "off",
});

const repository = new TimingRepository(config.dataDir, logger);
const adminStore = new AdminStore(config.dataDir, logger);
const archive = new ArchiveService(repository, adminStore);
const hub = new BroadcastHub(config.recentMessageBuffer, logger);

const liveState = new LiveSessionState();
const aggregator = new SessionStateAggregator(liveState);
hub.setSnapshotProvider(() => liveState.snapshot(new Date().toISOString()));

// 再起動してもセッション途中のチーム名が出るよう、当日 DB から状態を復元
hydrateLiveStateFromDb(repository, aggregator, liveState, logger);
aggregator.importEntryEdits(
    adminStore.getDisplayConfig("live")["entries"],
    liveState.sessionSignature,
);

// 日付が変わったらライブ表示を空に戻す (前日のリザルトが残り続けるのを防ぐ)
const stopDayRollover = startDayRollover(liveState, hub, logger);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use("/api/admin", createAdminRouter(adminStore, archive, config, logger, hub, aggregator));
app.use(
    "/api",
    createApiRouter(repository, hub, config, archive, () => {
        const cfg = adminStore.getDisplayConfig("live");
        return {
            columns: resolveLiveColumns(cfg["columns"]),
            elapsed: sanitizeElapsedIdle(cfg["elapsed"]),
        };
    }),
);

app.get("/", (_req, res) => {
    res.type("text/plain").send(
        [
            "MOLA_Timing Cloud Server",
            "",
            "Endpoints:",
            "  GET  /api/health",
            "  GET  /api/ws-token",
            "  GET  /api/messages?circuit=okayama&limit=100",
            "  GET  /api/archive/days",
            "  GET  /api/archive/sessions?date=YYYY-MM-DD",
            "  GET  /api/archive/results?date=...&sessionIndex=0",
            "  GET  /api/archive/csv?date=...&sessionIndex=0&kind=classification",
            "  GET  /api/display/live",
            "  POST /api/admin/login  (管理画面。以降は Cookie セッション)",
            "  WS   /ingest  (Receiver, Bearer token)",
            "  WS   /ws      (Frontend subscribers)",
        ].join("\n"),
    );
});

const httpServer = http.createServer(app);

attachIngestServer(httpServer, config, logger, repository, hub, aggregator);
attachBroadcastServer(httpServer, config, logger, hub);

httpServer.listen(config.port, config.host, () => {
    logger.info("listening", { url: `http://${config.host}:${config.port}` });
});

// ============================================================
// Graceful shutdown
// ============================================================
function shutdown(signal: string): void {
    logger.info("shutdown requested", { signal });
    stopDayRollover();
    httpServer.close(() => {
        repository.close();
        adminStore.close();
        logger.info("shutdown complete");
        process.exit(0);
    });
    // 強制終了タイマー (10s)
    setTimeout(() => {
        logger.error("forced exit (shutdown timeout)");
        process.exit(1);
    }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", { reason: String(reason) });
});
process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", { error: err.message, stack: err.stack ?? "" });
});
