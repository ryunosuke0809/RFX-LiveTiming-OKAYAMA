import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
    constantTimeEquals,
    extractToken,
    isOriginAllowed,
} from "../auth.js";
import type { AppConfig } from "../config.js";
import { requiresViewAuth } from "../config.js";
import type { Logger } from "../logger.js";
import { verifyViewToken } from "../view-token.js";
import type { BroadcastHub } from "./hub.js";

/**
 * フロントエンド (ブラウザ) からの WebSocket 接続を受け付ける。
 *
 * URL: `ws://<host>:<port>/ws`
 *
 * - `WS_VIEW_SECRET` または `FRONTEND_VIEW_TOKEN` がある場合、トークン必須。
 *   短期トークンは `GET /api/ws-token` で発行し、接続時のみ検証する。
 * - Origin が `ALLOWED_ORIGINS` に含まれていない場合は拒否。
 */
export function attachBroadcastServer(
    httpServer: Server,
    config: AppConfig,
    logger: Logger,
    hub: BroadcastHub,
): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });
    const authRequired = requiresViewAuth(config);

    httpServer.on("upgrade", (req, socket, head) => {
        if (!req.url) {
            socket.destroy();
            return;
        }
        const { pathname } = new URL(req.url, "http://placeholder.local");
        if (pathname !== "/ws") return;

        if (!isOriginAllowed(req, config.allowedOrigins)) {
            logger.warn("broadcast: origin rejected", {
                origin: req.headers["origin"] ?? "",
            });
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }

        if (authRequired && !authenticateView(req, config)) {
            logger.warn("broadcast: token rejected");
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    });

    wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
        hub.register(ws);
    });

    return wss;
}

function authenticateView(req: IncomingMessage, config: AppConfig): boolean {
    const t = extractToken(req);
    if (t === null) return false;

    if (
        config.frontendViewToken !== null &&
        constantTimeEquals(t, config.frontendViewToken)
    ) {
        return true;
    }

    if (config.wsViewSecret !== null && verifyViewToken(t, config.wsViewSecret)) {
        return true;
    }

    return false;
}
