import type { WebSocket } from "ws";
import type { BroadcastMessage, IngestEnvelope } from "../types/ingest.js";
import type { Logger } from "../logger.js";

/**
 * フロントエンド向け WebSocket の登録簿 & ブロードキャストハブ。
 *
 * - `/ws` に接続したクライアントはここに登録される。
 * - ingest 経由で来たメッセージは `broadcast()` で全クライアントへ転送する。
 * - 直近 N 件をリングバッファに保持し、新規接続時に `snapshot` として一括送信する。
 */
export class BroadcastHub {
    private readonly subscribers = new Set<WebSocket>();
    private readonly recent: IngestEnvelope[] = [];

    constructor(
        private readonly bufferSize: number,
        private readonly logger: Logger,
    ) {}

    /** クライアント数 (デバッグ表示用)。 */
    get subscriberCount(): number {
        return this.subscribers.size;
    }

    /** 新規接続時に呼ぶ。snapshot 送信もここで行う。 */
    register(ws: WebSocket): void {
        this.subscribers.add(ws);

        this.sendTo(ws, {
            type: "hello",
            serverTime: new Date().toISOString(),
            circuitId: this.recent.length > 0 ? this.recent[this.recent.length - 1]!.circuitId : null,
        });

        if (this.recent.length > 0) {
            this.sendTo(ws, {
                type: "snapshot",
                envelopes: this.recent.slice(),
            });
        }

        ws.on("close", () => {
            this.subscribers.delete(ws);
            this.logger.debug("broadcast subscriber disconnected", {
                remaining: this.subscribers.size,
            });
        });

        ws.on("error", (err: Error) => {
            this.logger.warn("broadcast subscriber error", { error: err.message });
            this.subscribers.delete(ws);
        });

        this.logger.info("broadcast subscriber connected", {
            total: this.subscribers.size,
        });
    }

    /** ingest が受理した envelope を全フロントエンドへ転送する。 */
    broadcast(envelope: IngestEnvelope): void {
        this.appendRecent(envelope);
        const message: BroadcastMessage = { type: "smis", envelope };
        const serialized = JSON.stringify(message);

        for (const ws of this.subscribers) {
            try {
                if (ws.readyState === ws.OPEN) {
                    ws.send(serialized);
                }
            } catch (err) {
                this.logger.warn("broadcast send failed", { error: (err as Error).message });
            }
        }
    }

    private appendRecent(envelope: IngestEnvelope): void {
        this.recent.push(envelope);
        if (this.recent.length > this.bufferSize) {
            // 古いものから順に削る (リングバッファ的に運用)。
            this.recent.splice(0, this.recent.length - this.bufferSize);
        }
    }

    private sendTo(ws: WebSocket, msg: BroadcastMessage): void {
        try {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(msg));
            }
        } catch (err) {
            this.logger.warn("broadcast direct send failed", {
                error: (err as Error).message,
            });
        }
    }
}
