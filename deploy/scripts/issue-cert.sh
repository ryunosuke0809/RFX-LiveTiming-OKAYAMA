#!/usr/bin/env bash
# Let's Encrypt 証明書発行後、HTTPS 用 nginx 設定へ切替
set -euo pipefail

APP_ROOT=/opt/mola-timing-okayama
DOMAIN=mola-timing-okayama.com

if [[ "$(id -u)" -ne 0 ]]; then
  echo "root で実行してください: sudo bash $0" >&2
  exit 1
fi

mkdir -p /var/www/certbot

certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "admin@${DOMAIN}" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring

# certbot が作る options / dhparam が無い場合のフォールバック
if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    -o /etc/letsencrypt/options-ssl-nginx.conf
fi
if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
  openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

install -m 644 "$APP_ROOT/repo/deploy/nginx/mola-timing-okayama.conf" \
  /etc/nginx/sites-available/mola-timing-okayama
nginx -t
systemctl reload nginx

# 自動更新タイマーは Ubuntu の certbot パッケージで有効なことが多い
systemctl enable --now certbot.timer 2>/dev/null || true

echo "certificate issued for https://${DOMAIN}/"
