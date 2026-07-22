#!/usr/bin/env bash
# アプリの pull / ビルド / 再起動（何度でも実行可）
set -euo pipefail

APP_ROOT=/opt/mola-timing-okayama
REPO="$APP_ROOT/repo"
BRANCH="${BRANCH:-main}"
SCRIPT="$REPO/deploy/scripts/deploy.sh"

# pull でこのスクリプト自体が更新されることがあるため、pull 後に最新版へ差し替えて続行する
if [[ "${DEPLOY_SKIP_PULL:-0}" != "1" ]]; then
  cd "$REPO"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  exec env DEPLOY_SKIP_PULL=1 bash "$SCRIPT"
fi

echo "==> build server"
cd "$REPO/server"
npm ci
npm run build

echo "==> build frontend"
cd "$REPO/frontend"
npm ci
npm run build

echo "==> sync nginx / logrotate (if present)"
if [[ -f /etc/nginx/sites-available/mola-timing-okayama ]]; then
  sudo mkdir -p /etc/nginx/snippets
  sudo install -m 644 "$REPO/deploy/nginx/snippets/mola-proxy-locations.conf" \
    /etc/nginx/snippets/mola-proxy-locations.conf
  sudo install -m 644 "$REPO/deploy/nginx/mola-timing-okayama.conf" \
    /etc/nginx/sites-available/mola-timing-okayama
  sudo install -m 644 "$REPO/deploy/logrotate/mola-timing-nginx" \
    /etc/logrotate.d/mola-timing-nginx
  sudo nginx -t
  sudo systemctl reload nginx
fi
sudo chmod +x "$REPO/deploy/scripts/access-report.sh" || true

echo "==> restart services"
if systemctl is-enabled mola-timing-server >/dev/null 2>&1; then
  sudo systemctl restart mola-timing-server
  sudo systemctl restart mola-timing-frontend
else
  echo "systemd 未登録。bootstrap.sh を先に実行してください。" >&2
  exit 1
fi

sudo systemctl --no-pager --full status mola-timing-server mola-timing-frontend | sed -n '1,40p'
echo "deploy complete."
