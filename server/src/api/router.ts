import { Router } from "express";
import type { TimingRepository } from "../db/repository.js";
import type { BroadcastHub } from "../broadcast/hub.js";

/**
 * REST API。
 * Phase 2 では最低限の health / latest メッセージ取得のみ提供する。
 * リザルト集計やセッション一覧は Phase 2.x で順次追加。
 */
export function createApiRouter(
    repository: TimingRepository,
    hub: BroadcastHub,
): Router {
    const router = Router();

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

    return router;
}
