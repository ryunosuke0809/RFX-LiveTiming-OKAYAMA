import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { constantTimeEquals, extractToken } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { TimingRepository } from "../db/repository.js";
import type { BroadcastHub } from "../broadcast/hub.js";
import type { SessionStateAggregator } from "../state/aggregator.js";
import type {
    IngestEnvelope,
    IngestServerMessage,
    SmisMessageKind,
} from "../types/ingest.js";

const SERVER_VERSION = "0.1.0";

const VALID_KINDS = new Set<SmisMessageKind>([
    "Competition",
    "Category",
    "Round",
    "Group",
    "Session",
    "Class",
    "Team",
    "Transponder",
    "Loop",
    "Select",
    "Start",
    "Passing",
    "Standings",
    "Message",
    "Unknown",
]);

/**
 * Receiver (MOLA_Timing-Receiver) からの WebSocket 接続を受け付ける。
 *
 * URL: `ws://<host>:<port>/ingest`
 *
 * 認証:
 *   - `Authorization: Bearer <RECEIVER_INGEST_TOKEN>` ヘッダ
 *   - もしくは `?token=...` クエリ (デバッグ用、本番は非推奨)
 *
 * 期待されるフレーム形式:
 *   `IngestEnvelope` JSON 1 件 / 1 メッセージ
 *
 * 応答:
 *   - 接続直後に `{ type: "welcome", ... }`
 *   - 各メッセージ受理時に `{ type: "ack", seq }`
 *   - 失敗時に `{ type: "nack", seq, error }`
 */
export function attachIngestServer(
    httpServer: Server,
    config: AppConfig,
    logger: Logger,
    repository: TimingRepository,
    hub: BroadcastHub,
    aggregator: SessionStateAggregator,
): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req, socket, head) => {
        if (!req.url) {
            socket.destroy();
            return;
        }
        const { pathname } = new URL(req.url, "http://placeholder.local");
        if (pathname !== "/ingest") return; // 他のパスは別の WSS に渡る

        if (!authenticate(req, config, logger)) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    });

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        const remoteAddr = req.socket.remoteAddress ?? "unknown";
        logger.info("ingest connected", { remote: remoteAddr });

        send(ws, {
            type: "welcome",
            serverVersion: SERVER_VERSION,
            serverTime: new Date().toISOString(),
        });

        ws.on("message", (data, isBinary) => {
            if (isBinary) {
                logger.warn("ingest received binary frame, ignored");
                return;
            }
            handleTextFrame(ws, data.toString("utf-8"), repository, hub, aggregator, logger);
        });

        ws.on("close", () => {
            logger.info("ingest disconnected", { remote: remoteAddr });
        });

        ws.on("error", (err: Error) => {
            logger.warn("ingest socket error", {
                remote: remoteAddr,
                error: err.message,
            });
        });
    });

    return wss;
}

function authenticate(req: IncomingMessage, config: AppConfig, logger: Logger): boolean {
    const token = extractToken(req);
    if (!token) {
        logger.warn("ingest auth: no token", { remote: req.socket.remoteAddress });
        return false;
    }
    if (!constantTimeEquals(token, config.ingestToken)) {
        logger.warn("ingest auth: token mismatch", { remote: req.socket.remoteAddress });
        return false;
    }
    return true;
}

function handleTextFrame(
    ws: WebSocket,
    text: string,
    repository: TimingRepository,
    hub: BroadcastHub,
    aggregator: SessionStateAggregator,
    logger: Logger,
): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        logger.warn("ingest: invalid JSON frame", { error: (err as Error).message });
        send(ws, { type: "nack", seq: -1, error: "invalid_json" });
        return;
    }

    const envelope = validateEnvelope(parsed);
    if (!envelope.ok) {
        send(ws, { type: "nack", seq: envelope.seq, error: envelope.reason });
        return;
    }

    repository.insertEnvelope(envelope.value);

    let patches: ReturnType<SessionStateAggregator["apply"]> = [];
    try {
        patches = aggregator.apply(envelope.value);
    } catch (err) {
        logger.warn("aggregator threw", { error: (err as Error).message, kind: envelope.value.kind });
    }

    hub.broadcastRaw(envelope.value);
    hub.broadcastPatches(envelope.value.circuitId, patches, envelope.value.ts);

    send(ws, { type: "ack", seq: envelope.value.seq });
}

type ValidationResult =
    | { ok: true; value: IngestEnvelope }
    | { ok: false; seq: number; reason: string };

function validateEnvelope(raw: unknown): ValidationResult {
    if (typeof raw !== "object" || raw === null) {
        return { ok: false, seq: -1, reason: "not_an_object" };
    }
    const obj = raw as Record<string, unknown>;

    const seq = typeof obj["seq"] === "number" ? (obj["seq"] as number) : -1;

    const circuitId = obj["circuitId"];
    if (typeof circuitId !== "string" || circuitId.length === 0) {
        return { ok: false, seq, reason: "missing_circuit_id" };
    }

    const ts = obj["ts"];
    if (typeof ts !== "string" || ts.length === 0) {
        return { ok: false, seq, reason: "missing_ts" };
    }

    const kind = obj["kind"];
    if (typeof kind !== "string" || !VALID_KINDS.has(kind as SmisMessageKind)) {
        return { ok: false, seq, reason: "invalid_kind" };
    }

    const payload = obj["payload"];
    if (typeof payload !== "object" || payload === null) {
        return { ok: false, seq, reason: "invalid_payload" };
    }

    return {
        ok: true,
        value: {
            seq,
            circuitId,
            ts,
            kind: kind as SmisMessageKind,
            payload: payload as Record<string, unknown>,
        },
    };
}

function send(ws: WebSocket, msg: IngestServerMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
        ws.send(JSON.stringify(msg));
    } catch {
        /* ignore */
    }
}
