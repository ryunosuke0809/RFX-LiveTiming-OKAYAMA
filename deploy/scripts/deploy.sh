#!/usr/bin/env bash
# アプリの pull / ビルド / 再起動（何度でも実行可）
set -euo pipefail

APP_ROOT=/opt/mola-timing-okayama
REPO="$APP_ROOT/repo"
BRANCH="${BRANCH:-main}"

cd "$REPO"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> build server"
cd "$REPO/server"
npm ci
npm run build

echo "==> build frontend"
cd "$REPO/frontend"
npm ci
npm run build

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
