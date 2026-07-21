#!/usr/bin/env bash
# 初回のみ: パッケージ・ディレクトリ・systemd・nginx 雛形
set -euo pipefail

APP_ROOT=/opt/mola-timing-okayama
REPO_URL="${REPO_URL:-https://github.com/ryunosuke0809/RFX-LiveTiming-OKAYAMA.git}"
BRANCH="${BRANCH:-main}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "root で実行してください: sudo bash $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y \
  curl ca-certificates gnupg build-essential python3 \
  nginx git ufw

# Node.js 20.x (NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# certbot
apt-get install -y certbot python3-certbot-nginx

mkdir -p "$APP_ROOT"/{shared/data,logs} /var/www/certbot
chown -R ubuntu:ubuntu "$APP_ROOT"

if [[ ! -d "$APP_ROOT/repo/.git" ]]; then
  sudo -u ubuntu git clone --branch "$BRANCH" "$REPO_URL" "$APP_ROOT/repo"
else
  echo "repo は既に存在します: $APP_ROOT/repo"
fi

# server.env が無ければ生成
ENV_FILE="$APP_ROOT/shared/server.env"
if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
PORT=4000
HOST=127.0.0.1
RECEIVER_INGEST_TOKEN=${TOKEN}
FRONTEND_VIEW_TOKEN=
ALLOWED_ORIGINS=https://mola-timing-okayama.com
DATA_DIR=/opt/mola-timing-okayama/shared/data
RECENT_MESSAGE_BUFFER=2000
LOG_LEVEL=info
EOF
  chown ubuntu:ubuntu "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created $ENV_FILE (RECEIVER_INGEST_TOKEN generated)"
fi

# systemd
install -m 644 "$APP_ROOT/repo/deploy/systemd/mola-timing-server.service" /etc/systemd/system/
install -m 644 "$APP_ROOT/repo/deploy/systemd/mola-timing-frontend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable mola-timing-server mola-timing-frontend

# nginx: 証明書前は HTTP のみの仮設定を入れる（issue-cert 後に本設定へ）
install -m 644 "$APP_ROOT/repo/deploy/nginx/mola-timing-okayama.http-bootstrap.conf" \
  /etc/nginx/sites-available/mola-timing-okayama
ln -sfn /etc/nginx/sites-available/mola-timing-okayama /etc/nginx/sites-enabled/mola-timing-okayama
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# UFW（SSH/HTTP/HTTPS）
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

echo "bootstrap complete."
echo "next: sudo bash $APP_ROOT/repo/deploy/scripts/deploy.sh"
echo "then: sudo bash $APP_ROOT/repo/deploy/scripts/issue-cert.sh"
