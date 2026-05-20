# RFX-LiveTiming クラウドサーバー

`MOLA_Timing-Receiver` から WebSocket で送られてくる SMIS メッセージを
SQLite に永続化し、フロントエンド (`/ws`) へリアルタイムにブロードキャストする
Phase 2 のサーバー実装。

## 役割

```
MOLA_Timing-Receiver
       │  WebSocket /ingest
       ▼
┌────────────────────────────────────────┐
│ Cloud Server (this package)            │
│                                        │
│  /ingest  ── auth (Bearer)             │
│  /ws      ── auth (optional)           │
│  /api/*   ── REST                      │
│                                        │
│  SQLite (timing_YYYYMMDD.db, WAL)      │
│  In-memory ring buffer (snapshot 用)    │
└────────────────────────────────────────┘
       │  WebSocket /ws
       ▼
Frontend (Next.js)
```

## 必要環境

- Node.js 20 以上
- ネイティブビルドツール (`better-sqlite3` 用):
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential` + `python3`
  - Windows: `windows-build-tools` または Visual Studio Build Tools

## クイックスタート

```bash
cd server
npm install

# 環境変数を準備
cp .env.example .env
# .env を編集して RECEIVER_INGEST_TOKEN を強い乱数に差し替える
#   例: openssl rand -hex 32

# 開発起動 (TS 即時実行 + ファイル監視)
npm run dev

# 本番ビルド & 起動
npm run build
npm start
```

起動すると `http://127.0.0.1:4000` で待ち受けます。

```
GET  /                          ヘルプ表示
GET  /api/health                ステータス確認
GET  /api/messages              直近メッセージ取得
WS   /ingest                    Receiver からの取り込み (Bearer 必須)
WS   /ws                        フロントエンド購読
```

## ディレクトリ構成

```
server/
  src/
    index.ts                      エントリポイント
    config.ts                     環境変数ロード
    auth.ts                       Bearer / Origin 検証
    logger.ts                     軽量ロガー
    db/
      schema.ts                   SQLite スキーマ (timing_YYYYMMDD.db, WAL)
      repository.ts               メッセージ永続化リポジトリ
    ingest/
      ingest-server.ts            /ingest WS (Receiver からの取り込み)
    state/
      types.ts                    ViewModel 型 (Standing / SessionInfo 等)
      derive.ts                   gap/interval/flag の純粋変換関数
      session-state.ts            生のオンメモリ状態 (LiveSessionState)
      aggregator.ts               envelope を state に適用し patch を返す
    broadcast/
      hub.ts                      フロントエンド購読者ハブ + リングバッファ
      broadcast-server.ts         /ws WS (フロントエンド向け)
    api/
      router.ts                   REST API
    types/
      ingest.ts                   ingest + broadcast メッセージ型定義
  data/                           SQLite ファイル置き場 (.gitignore)
  scripts/
    smoke-aggregator.mjs          Aggregator スモークテストスクリプト
  package.json
  tsconfig.json
  .env.example
```

## `/ws` で配信される JSON

フロントエンドは新規接続時に `hello` → `state` (フル状態) を受け取り、以後は
`patch` (差分) と `smis` (デバッグ用の生 envelope) を受け取って差分適用する。

```ts
// 接続直後
{ type: "hello",  serverTime: string, circuitId: string | null }
{ type: "state",  state: LiveStateSnapshot }

// リアルタイム
{ type: "patch",  serverTs: string, circuitId: string, patches: LiveStatePatch[] }
{ type: "smis",   envelope: IngestEnvelope }
```

`LiveStateSnapshot` には算出済みの `standings[]` (gap / interval / status / pits /
positionChange / bestTimeType 入り) と `fastestLap` / `trackCount` /
`session` / `classes` / `teams` / `recentMessages` が含まれる。詳細は
`src/state/types.ts` を参照。

`LiveStatePatch` の種類:

| kind              | 説明                              |
|-------------------|----------------------------------|
| `session`         | SessionInfo の部分更新             |
| `flag`            | トラックフラッグ変化               |
| `class_upsert`    | クラスマスター追加 / 更新           |
| `team_upsert`     | チームマスター追加 / 更新           |
| `standing_upsert` | 1 台分の Standing 行 (再計算込み)   |
| `standing_remove` | 1 台分削除 (DNF など。未使用)       |
| `fastest_lap`     | セッションファステスト変化           |
| `track_count`     | on track / pit / stopped 数の集計  |
| `message`         | レースコントロール文言                |

## デバッグ用ストリームビューア

ブラウザで `frontend/src/app/debug/page.tsx` (`/debug`) を開くと、
WebSocket URL とトークンを指定して `/ws` の全 JSON をストリーム表示できる。
6 月岡山現地での疎通確認用。

## 6 月岡山テストでの使い方

1. VPS or 開発機で `npm install && npm run build && npm start`。
2. `.env` の `RECEIVER_INGEST_TOKEN` に十分長いランダム値を設定し、Receiver の
   「設定」→「クラウド配信」タブに同じ値を入れる。
3. Receiver から接続すると `/api/health` の `subscribers` も増える。
4. 受信したメッセージは `data/timing_YYYYMMDD.db` に蓄積される。
5. SQLite を見たい時は:
   ```
   sqlite3 data/timing_20260612.db "SELECT kind, COUNT(*) FROM messages GROUP BY kind;"
   ```

## セキュリティ実装メモ

- `RECEIVER_INGEST_TOKEN` は十分長い乱数 (推奨: `openssl rand -hex 32`)。
- `FRONTEND_VIEW_TOKEN` を設定するとフロントエンドにも Bearer / `?token=` を強制。
- `ALLOWED_ORIGINS` をカンマ区切りで指定すると `/ws` 接続時に Origin を検証。
- HTTPS / WSS は nginx 側で終端する想定 (この Node は HTTP/WS のみ)。
- WAL モードを使うのでクラッシュ時もすでに書き込まれた行は失われない。

## 既知の制限 (今後の TODO)

- Phase 2 リザルト集計 (`/api/results`, CSV ダウンロード) は未実装。
- フロントエンド向けの短期トークン rotation は未実装。
- 30 日以上経過した日次 DB の zip アーカイブ自動化は未実装。
- 単体テスト (vitest) は未配備。`tsc --noEmit` のみで型安全を担保している段階。
