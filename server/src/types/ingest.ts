/**
 * Receiver (`MOLA_Timing-Receiver`) からクラウドへ送られる ingest メッセージの形。
 *
 * Receiver 側は解析済 SMIS DTO を 1 件ずつ WebSocket 経由で送る。
 * すべてのフレームは UTF-8 JSON 1 行。
 *
 * 受信成功・失敗は ACK メッセージで返す:
 *   { type: "ack", seq: number }
 *   { type: "nack", seq: number, error: string }
 */

/** ingest 共通の包み (envelope)。 */
export interface IngestEnvelope {
    /** クライアント側で 1 から振る連番。ACK と紐付ける。 */
    seq: number;

    /** 送信元サーキット ID (例: `okayama`)。設定で指定する。 */
    circuitId: string;

    /** ISO8601 (ローカルタイムオフセット付き) のクライアント送信時刻。 */
    ts: string;

    /** 元の SMIS メッセージ種別 (Competition / Standings / Passing / Message 等)。 */
    kind: SmisMessageKind;

    /** SMIS DTO をそのまま埋め込んだ payload。 */
    payload: Record<string, unknown>;
}

/**
 * SMIS メッセージの種別。
 * `RfxTiming.Smis.Messages` 名前空間にある DTO の型名 (Pascal case) と一致させる。
 */
export type SmisMessageKind =
    | "Competition"
    | "Category"
    | "Round"
    | "Group"
    | "Session"
    | "Class"
    | "Team"
    | "Transponder"
    | "Loop"
    | "Select"
    | "Start"
    | "Passing"
    | "Standings"
    | "Message"
    | "Unknown";

/** ingest 接続のハンドシェイク (任意送信)。 */
export interface IngestHello {
    type: "hello";
    receiverVersion: string;
    circuitId: string;
}

/** ingest → クライアントへの応答。 */
export type IngestServerMessage =
    | { type: "welcome"; serverVersion: string; serverTime: string }
    | { type: "ack"; seq: number }
    | { type: "nack"; seq: number; error: string };

/**
 * フロントエンド (/ws) 向けのブロードキャスト形式。
 *
 * - `hello`    : 接続直後の挨拶
 * - `state`    : フル状態スナップショット (新規接続時 + たまに送る)
 * - `patch`    : 差分更新 (1 件以上の `LiveStatePatch`)
 * - `smis`     : 受信した生 SMIS envelope (デバッグ用、フロント本体では通常無視)
 * - `snapshot` : 旧 raw リプレイ (互換のため当面残す)
 */
import type { LiveStatePatch, LiveStateSnapshot } from "../state/types.js";

export type BroadcastMessage =
    | { type: "hello"; serverTime: string; circuitId: string | null }
    | { type: "state"; state: LiveStateSnapshot }
    | { type: "patch"; serverTs: string; circuitId: string | null; patches: LiveStatePatch[] }
    | { type: "smis"; envelope: IngestEnvelope }
    | { type: "snapshot"; envelopes: IngestEnvelope[] };
