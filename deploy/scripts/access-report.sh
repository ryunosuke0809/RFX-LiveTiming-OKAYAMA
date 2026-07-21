#!/usr/bin/env bash
# nginx アクセスログから訪問者サマリを出す（報告用）
# 使い方:
#   bash deploy/scripts/access-report.sh
#   bash deploy/scripts/access-report.sh 2026-07-21
set -euo pipefail

LOG="${ACCESS_LOG:-/var/log/nginx/mola-timing-access.log}"
DAY="${1:-}"

if [[ ! -f "$LOG" ]]; then
  echo "access log not found: $LOG" >&2
  echo "（旧デフォルト） /var/log/nginx/access.log も確認してください" >&2
  exit 1
fi

filter() {
  if [[ -n "$DAY" ]]; then
    # nginx: [21/Jul/2026:18:00:00 +0900]  ※ Ubuntu (GNU date) 向け
    local d mon y
    d=$(date -d "$DAY" +%-d)
    mon=$(date -d "$DAY" +%b)
    y=$(date -d "$DAY" +%Y)
    local pat="\\[${d}/${mon}/${y}:"
    grep -E "$pat" "$LOG" || true
  else
    cat "$LOG"
  fi
}

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
filter >"$TMP"

echo "=== MOLA Timing access report ${DAY:-all} ==="
echo "log: $LOG"
echo "lines: $(wc -l <"$TMP")"
echo

echo "-- unique IPs (all requests) --"
awk '{print $1}' "$TMP" | sort -u | wc -l

echo "-- unique IPs (HTML pages: / /live /result /tracking など) --"
awk '
  $7 ~ /^\/($|\?|live|result|tracking|debug)/ || $7 == "/" {print $1}
' "$TMP" | sort -u | wc -l

echo "-- unique IPs (WebSocket /ws = Live 視聴の目安) --"
awk '$7 ~ /^\/ws/ {print $1}' "$TMP" | sort -u | wc -l

echo "-- top paths --"
awk '{print $7}' "$TMP" | sed 's/\?.*//' | sort | uniq -c | sort -rn | head -20

echo "-- top IPs --"
awk '{print $1}' "$TMP" | sort | uniq -c | sort -rn | head -20
