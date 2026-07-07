import type { WebSocket } from "ws";
import type { BroadcastMessage, IngestEnvelope } from "../types/ingest.js";
import type { LiveStatePatch, LiveStateSnapshot } from "../state/types.js";
import type { Logger } from "../logger.js";

/**
 * フロントエンド向け WebSocket の登録簿 & ブロードキャストハブ。
 *
 * - `/ws` に接続したクライアントはここに登録される。
 * - 接続時には `hello` → `state`(初期スナップショット) を送る。
 * - ingest 経由で来た envelope は 2 系統で転送する:
 *     1. 算出済の `patch` (描画用、本命)
 *     2. 生の `smis` (デバッグ用)
 */
export class BroadcastHub {
    private readonly subscribers = new Set<WebSocket>();
    private readonly recent: IngestEnvelope[] = [];

    /** state スナップショット供給関数 (Aggregator から差し込まれる)。 */
    private snapshotProvider: (() => LiveStateSnapshot) | null = null;

    constructor(
        private readonly bufferSize: number,
        private readonly logger: Logger,
    ) {}

    get subscriberCount(): number {
        return this.subscribers.size;
    }

    /** Aggregator が初期状態を返す関数を登録する。 */
    setSnapshotProvider(provider: () => LiveStateSnapshot): void {
        this.snapshotProvider = provider;
    }

    register(ws: WebSocket): void {
        this.subscribers.add(ws);

        this.sendTo(ws, {
            type: "hello",
            serverTime: new Date().toISOString(),
            circuitId:
                this.recent.length > 0 ? this.recent[this.recent.length - 1]!.circuitId : null,
        });

        if (this.snapshotProvider) {
            this.sendTo(ws, { type: "state", state: this.snapshotProvider() });
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

    /** ingest が受理した envelope を全フロントエンドへ「生」で転送する。 */
    broadcastRaw(envelope: IngestEnvelope): void {
        this.appendRecent(envelope);
        this.broadcastMessage({ type: "smis", envelope });
    }

    /** Aggregator が計算した patch をフロントエンドへ送る。 */
    broadcastPatches(circuitId: string | null, patches: LiveStatePatch[], dataTs: string | null = null): void {
        if (patches.length === 0) return;
        this.broadcastMessage({
            type: "patch",
            serverTs: new Date().toISOString(),
            dataTs,
            circuitId,
            patches,
        });
    }

    /** 任意のタイミングで state スナップショットを再配信したい場合に使う。 */
    broadcastState(state: LiveStateSnapshot): void {
        this.broadcastMessage({ type: "state", state });
    }

    private broadcastMessage(message: BroadcastMessage): void {
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
