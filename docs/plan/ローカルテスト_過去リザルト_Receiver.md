# ローカルテスト手順（過去リザルト / Receiver）

## 1. サーバー

```bash
cd server
cp -n .env.example .env   # 初回のみ。RECEIVER_INGEST_TOKEN を設定
npm ci
npm run dev
# → http://127.0.0.1:4000
```

## 2. フロント

```bash
cd frontend
npm ci
npm run dev
# → http://localhost:3000
# WS は自動で ws://localhost:4000/ws
```

ローカルで過去 API を使う場合、Next から `/api/*` がサーバーに届くよう  
`frontend` の開発プロキシ、または一時的に `NEXT_PUBLIC` なしで  
ブラウザから `http://127.0.0.1:4000/api/archive/days` を直接確認する。

本番は nginx が `/api` をプロキシ済み。ローカルで Results カレンダーを試すなら:

```bash
# frontend/next.config.ts に rewrites を足すか、
# 一時的に archiveApi の base を http://127.0.0.1:4000 にする
```

（本番デプロイ済み環境では同一オリジンでそのまま動作）

## 3. Receiver（Windows）

設定 → クラウド配信:

| 項目 | ローカル | 本番 |
|------|----------|------|
| 有効 | ON | ON |
| URL | `ws://127.0.0.1:4000/ingest` | `wss://mola-timing-okayama.com/ingest` |
| Token | `server/.env` の `RECEIVER_INGEST_TOKEN` | VPS `shared/server.env` と同じ |
| Circuit | `okayama` | `okayama` |

VirtualServer でログ再生 → Receiver 経由 or replay-log で ingest へ流す。

```bash
cd server
# 例: 収録 JSONL を ingest へ
node scripts/replay-log.mjs --url ws://127.0.0.1:4000/ingest --token <TOKEN> ...
```

## 4. 確認ポイント

1. Timing / Tracking / Result がライブ更新される  
2. `server/data/timing_YYYYMMDD.db` が生成される  
3. `GET /api/archive/days` に当日が出る  
4. Result → Calendar → 日付選択 → View / CSV  

## 5. 本番更新後

```bash
ssh mola-timing-okayama
bash /opt/mola-timing-okayama/repo/deploy/scripts/deploy.sh
```
