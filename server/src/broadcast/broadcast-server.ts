import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { constantTimeEquals, extractToken, isOriginAllowed } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { BroadcastHub } from "./hub.js";

/**
 * フロントエンド (ブラウザ) からの WebSocket 接続を受け付ける。
 *
 * URL: `ws://<host>:<port>/ws`
 *
 * - 認証は `FRONTEND_VIEW_TOKEN` を設定した場合のみ要求 (任意)。
 *   未設定 (`null`) なら誰でも閲覧可能。
 * - Origin が `ALLOWED_ORIGINS` に含まれていない場合は拒否。
 */
export function attachBroadcastServer(
    httpServer: Server,
    config: AppConfig,
    logger: Logger,
    hub: BroadcastHub,
): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

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

        if (config.frontendViewToken !== null) {
            const t = extractToken(req);
            if (t === null || !constantTimeEquals(t, config.frontendViewToken)) {
                logger.warn("broadcast: token rejected");
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }
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
