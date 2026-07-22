#!/usr/bin/env bash
# Let's Encrypt 証明書発行後、HTTPS 用 nginx 設定へ切替
set -euo pipefail

APP_ROOT=/opt/mola-timing-okayama
DOMAIN=mola-timing-okayama.com
PRIVATE_DOMAIN=oic-private.mola-timing-okayama.com

if [[ "$(id -u)" -ne 0 ]]; then
  echo "root で実行してください: sudo bash $0" >&2
  exit 1
fi

mkdir -p /var/www/certbot

# apex + 関係者サブドメインを同一証明書に含める（既存証明書は --expand）
certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  -d "$PRIVATE_DOMAIN" \
  --email "admin@${DOMAIN}" \
  --agree-tos \
  --non-interactive \
  --expand \
  --keep-until-expiring

# certbot が作る options / dhparam が無い場合のフォールバック
if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
  cat > /etc/letsencrypt/options-ssl-nginx.conf <<'SSL'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
SSL
fi
if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
  openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

install -m 644 "$APP_ROOT/repo/deploy/nginx/mola-timing-okayama.conf" \
  /etc/nginx/sites-available/mola-timing-okayama
mkdir -p /etc/nginx/snippets
install -m 644 "$APP_ROOT/repo/deploy/nginx/snippets/mola-proxy-locations.conf" \
  /etc/nginx/snippets/mola-proxy-locations.conf
nginx -t
systemctl reload nginx

# 自動更新タイマーは Ubuntu の certbot パッケージで有効なことが多い
systemctl enable --now certbot.timer 2>/dev/null || true

echo "certificate issued for https://${DOMAIN}/ and https://${PRIVATE_DOMAIN}/"
