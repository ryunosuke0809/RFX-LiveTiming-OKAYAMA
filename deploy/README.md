# 本番デプロイ（mola-timing-okayama.com）

さくらの VPS 上で LiveTiming を HTTPS 公開するための配置・更新手順。

| ホスト | 用途 |
|--------|------|
| `https://mola-timing-okayama.com` | 一般向け（**GPS 場内制限**。将来 IP 制限可） |
| `https://oic-private.mola-timing-okayama.com` | 関係者向け（制限なし・同一画面） |
| `https://oic-timing-admin.mola-timing-okayama.com` | 管理画面（ログイン必須）。[管理画面](#管理画面) 参照 |

ムームー DNS: `oic-private` と `oic-timing-admin` の A レコード → VPS IP（apex と同じ）。
証明書は `issue-cert.sh` が 3 ホストすべてを 1 枚の SAN に含める。

### 閲覧制限

| 層 | 状態 | 対象 |
|----|------|------|
| ブラウザ GPS（ジオフェンス） | **有効** | 一般向けのみ。半径約 3km・30秒ごと再確認。範囲外で画面停止・WS 切断 |
| IP 許可リスト | **準備のみ** | 一般向け nginx server に include 枠あり。`deploy/nginx/snippets/mola-public-ip-allowlist.conf.example` |
| 関係者 (`oic-private`) | 制限なし | GPS / IP とも適用しない |
| 管理画面 | ログイン必須 | GPS は適用しない。`oic-timing-admin` 以外のホストでは 404 |

localhost での開発時は GPS チェックをスキップする。

お客様向けの許可手順（掲示・案内用）: [docs/guide/一般向け_位置情報の許可手順.md](../docs/guide/一般向け_位置情報の許可手順.md)

## ディレクトリ構成

```
/opt/mola-timing-okayama/
  repo/                 # Git リポジトリ（ここを pull / 再ビルドして更新）
    frontend/
    server/
    deploy/
  shared/
    server.env          # 秘密情報（Git 管理外）
    data/               # SQLite など永続データ
  logs/                 # アプリログ（任意）
```

更新時は原則 `repo` だけ差し替え／`git pull` し、`shared` は触らない。

## サービス

| systemd ユニット | 役割 | 待受 |
|------------------|------|------|
| `mola-timing-server` | WebSocket / API | `127.0.0.1:4000` |
| `mola-timing-frontend` | Next.js | `127.0.0.1:3000` |
| `nginx` | HTTPS / リバプロ | `0.0.0.0:80,443` |

外部公開は **443（と ACME 用 80）のみ**。`:4000` / `:3000` は外から閉じる。

## 初回セットアップ

```bash
# リポジトリを配置したうえで（または本 README と同梱のスクリプト）
sudo bash /opt/mola-timing-okayama/repo/deploy/scripts/bootstrap.sh
sudo bash /opt/mola-timing-okayama/repo/deploy/scripts/deploy.sh
sudo bash /opt/mola-timing-okayama/repo/deploy/scripts/issue-cert.sh
```

## 日常の更新

```bash
sudo -u ubuntu bash /opt/mola-timing-okayama/repo/deploy/scripts/deploy.sh
# または ssh 後:
cd /opt/mola-timing-okayama/repo && git pull && bash deploy/scripts/deploy.sh
```

## 再起動

コード変更なしでプロセスだけ立て直すとき:

```bash
sudo systemctl restart mola-timing-server mola-timing-frontend
sudo systemctl status mola-timing-server mola-timing-frontend
```

片方だけ:

```bash
sudo systemctl restart mola-timing-server     # WS / API
sudo systemctl restart mola-timing-frontend   # Next.js
sudo systemctl reload nginx                   # 設定再読込（接続は維持しやすい）
```

ログ確認:

```bash
journalctl -u mola-timing-server -f
journalctl -u mola-timing-frontend -f
```

## アクセスログ（訪問者報告用）

nginx が `/var/log/nginx/mola-timing-access.log` に記録（90日ローテ）。

```bash
# サマリ（本日まで全体 / 特定日）
bash /opt/mola-timing-okayama/repo/deploy/scripts/access-report.sh
bash /opt/mola-timing-okayama/repo/deploy/scripts/access-report.sh 2026-07-21

# 素のユニーク IP 数
awk '{print $1}' /var/log/nginx/mola-timing-access.log | sort -u | wc -l
```

報告の目安:

| 指標 | 意味 |
|------|------|
| unique IPs (HTML) | ページを開いたおおよその人数 |
| unique IPs (/ws) | LiveTiming を購読したおおよその人数 |
| top paths | どの画面が多いか |

※ IP 単位のため同一回線の複数人は1、携帯のIP変動は過大になることがある。

設定反映（初回 or nginx 変更後）:

```bash
sudo mkdir -p /etc/nginx/snippets
sudo install -m 644 /opt/mola-timing-okayama/repo/deploy/nginx/snippets/mola-proxy-locations.conf \
  /etc/nginx/snippets/mola-proxy-locations.conf
sudo install -m 644 /opt/mola-timing-okayama/repo/deploy/nginx/snippets/mola-admin-deny.conf \
  /etc/nginx/snippets/mola-admin-deny.conf
sudo install -m 644 /opt/mola-timing-okayama/repo/deploy/nginx/mola-timing-okayama.conf \
  /etc/nginx/sites-available/mola-timing-okayama
sudo install -m 644 /opt/mola-timing-okayama/repo/deploy/logrotate/mola-timing-nginx \
  /etc/logrotate.d/mola-timing-nginx
sudo nginx -t && sudo systemctl reload nginx
```

IP 制限を有効化するとき（お客様承認後）:

```bash
sudo install -m 644 \
  /opt/mola-timing-okayama/repo/deploy/nginx/snippets/mola-public-ip-allowlist.conf.example \
  /etc/nginx/snippets/mola-public-ip-allowlist.conf
# ファイル内の allow を実 IP に書き換え、deny all; を有効化
# mola-timing-okayama.conf の一般向け server で include 行のコメントを外す
sudo nginx -t && sudo systemctl reload nginx
```

## 管理画面

履歴データを日付／セッション単位で公開表示から外し（論理削除）、表示名を上書きするための画面。
生データ（`timing_YYYYMMDD.db` の `messages`）は削除されないため、いつでも再表示できる。

管理データは `shared/data/admin.db`（管理者アカウント・表示可否・監査ログ）に入る。
日次 DB とは別ファイルなので、**バックアップ対象に含めること**。

URL: `https://oic-timing-admin.mola-timing-okayama.com/admin`

管理ホスト名は `frontend/src/lib/accessControl.ts` と `deploy/nginx/mola-timing-okayama.conf`
に入っているので、通常のデプロイ手順以外に必要なのは DNS・証明書・`ALLOWED_ORIGINS` の 3 点だけ。

### 有効化の手順（初回のみ）

```bash
# 1. DNS: ムームー DNS で oic-timing-admin の A レコード → VPS IP（apex と同じ）
#    証明書発行は名前解決できてから。先に dig で確認する
dig +short oic-timing-admin.mola-timing-okayama.com

# 2. 証明書 SAN に追加（--expand で既存証明書に相乗り）＋ nginx 本設定を再配置
sudo bash /opt/mola-timing-okayama/repo/deploy/scripts/issue-cert.sh

# 3. server.env: ALLOWED_ORIGINS に管理オリジンを追加
#    管理 API は更新系で Origin を照合するため、抜けるとログインが 403 になる
sudo -e /opt/mola-timing-okayama/shared/server.env
#   ALLOWED_ORIGINS=https://mola-timing-okayama.com,https://oic-private.mola-timing-okayama.com,https://oic-timing-admin.mola-timing-okayama.com
sudo systemctl restart mola-timing-server

# 4. アプリを更新（フロントの管理ホスト判定はビルドに埋め込まれるため再ビルドが必要）
sudo -u ubuntu bash /opt/mola-timing-okayama/repo/deploy/scripts/deploy.sh
```

確認（管理ホストで 200、公開ホストで 404 になること）:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://oic-timing-admin.mola-timing-okayama.com/admin
curl -s -o /dev/null -w '%{http_code}\n' https://mola-timing-okayama.com/admin
curl -s -o /dev/null -w '%{http_code}\n' https://oic-private.mola-timing-okayama.com/api/admin/me
```

一般向け・関係者向けホストでは `mola-admin-deny.conf` が `/admin` と `/api/admin/` を 404 にする。
管理サブドメインの server ブロックではこのスニペットを include しない。

別ホスト（ステージング等）で管理画面を開く場合のみ、`shared/frontend.env` に
`NEXT_PUBLIC_ADMIN_HOST=host1,host2` を足して再ビルドすると許可ホストを追加できる。

### 管理者アカウント

パスワードを env やシェル履歴に残さないため、CLI で対話的に作成する。

```bash
cd /opt/mola-timing-okayama/repo/server
sudo -u ubuntu npm run admin -- list
sudo -u ubuntu npm run admin -- create <username>     # パスワードは対話入力
sudo -u ubuntu npm run admin -- password <username>
sudo -u ubuntu npm run admin -- delete <username>
```

作成後は管理画面から追加・パスワード変更・削除もできる。最後の 1 人は削除できない。

| 設定 | 既定 | 説明 |
|------|------|------|
| `ADMIN_SESSION_TTL_SEC` | `43200`（12h） | ログインセッションの有効期間。操作ごとに延長 |
| `ADMIN_COOKIE_SECURE` | 本番は `true` | Cookie の Secure 属性。HTTPS 本番では外さない |

## Receiver 設定

- URL: `wss://mola-timing-okayama.com/ingest`
- Token: `shared/server.env` の `RECEIVER_INGEST_TOKEN`

### `/ws` 閲覧保護

- `WS_VIEW_SECRET`（`openssl rand -hex 32`）を `shared/server.env` に設定すると、
  `/ws` は短期トークン必須。フロントは `GET /api/ws-token` で自動取得する。
- 既存 env にキーが無い場合の追記例:

```bash
# 値が空 / 未定義のときだけ生成して追記
grep -q '^WS_VIEW_SECRET=.\+' /opt/mola-timing-okayama/shared/server.env \
  || echo "WS_VIEW_SECRET=$(openssl rand -hex 32)" | sudo tee -a /opt/mola-timing-okayama/shared/server.env
grep -q '^WS_VIEW_TOKEN_TTL_SEC=' /opt/mola-timing-okayama/shared/server.env \
  || echo "WS_VIEW_TOKEN_TTL_SEC=300" | sudo tee -a /opt/mola-timing-okayama/shared/server.env
sudo systemctl restart mola-timing-server
```
