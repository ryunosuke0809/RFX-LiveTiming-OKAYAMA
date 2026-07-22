# 本番デプロイ（mola-timing-okayama.com）

さくらの VPS 上で LiveTiming を HTTPS 公開するための配置・更新手順。

| ホスト | 用途 |
|--------|------|
| `https://mola-timing-okayama.com` | 一般向け（**GPS 場内制限**。将来 IP 制限可） |
| `https://oic-private.mola-timing-okayama.com` | 関係者向け（制限なし・同一画面） |

ムームー DNS: `oic-private` の A レコード → VPS IP（apex と同じ）。証明書は `issue-cert.sh` で両ホストを含む。

### 閲覧制限

| 層 | 状態 | 対象 |
|----|------|------|
| ブラウザ GPS（ジオフェンス） | **有効** | 一般向けのみ。半径約 3km・30秒ごと再確認。範囲外で画面停止・WS 切断 |
| IP 許可リスト | **準備のみ** | 一般向け nginx server に include 枠あり。`deploy/nginx/snippets/mola-public-ip-allowlist.conf.example` |
| 関係者 (`oic-private`) | 制限なし | GPS / IP とも適用しない |

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

## Receiver 設定

- URL: `wss://mola-timing-okayama.com/ingest`
- Token: `shared/server.env` の `RECEIVER_INGEST_TOKEN`
