#!/usr/bin/env bash
# autoheal.sh — restart rubli-backend when its health check keeps failing (prod audit 2026-10-26:
# docker healthchecks only MARK a container unhealthy; nothing restarted it, so a hung backend
# stayed down until someone noticed). Runs from /etc/cron.d/rubli-autoheal every 5 minutes.
#  - 3 consecutive failed checks (≈ 10–15 min) → `docker restart rubli-backend`, logged.
#  - Skips while a deploy holds /opt/rubli/.deploy.lock (deploy-safe.sh's flock).
#  - At most one restart per hour (a crash loop needs a human, not a restart storm).
set -u
LOG=/var/log/rubli-autoheal.log
STATE=/var/lib/rubli-autoheal
mkdir -p "$STATE"

exec 9>/opt/rubli/.deploy.lock
flock -n 9 || exit 0   # a deploy is running
flock -u 9

if docker exec rubli-backend python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health', timeout=20).status == 200 else 1)" >/dev/null 2>&1; then
  echo 0 > "$STATE/fails"
  exit 0
fi

fails=$(( $(cat "$STATE/fails" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE/fails"
echo "$(date -u +%FT%TZ) health check failed ($fails in a row)" >> "$LOG"
[ "$fails" -lt 3 ] && exit 0

last=$(cat "$STATE/last_restart" 2>/dev/null || echo 0)
if [ $(( $(date +%s) - last )) -lt 3600 ]; then
  echo "$(date -u +%FT%TZ) still failing; restarted < 1 h ago — leaving it for a human" >> "$LOG"
  exit 0
fi
echo "$(date -u +%FT%TZ) restarting rubli-backend" >> "$LOG"
docker restart rubli-backend >> "$LOG" 2>&1
date +%s > "$STATE/last_restart"
echo 0 > "$STATE/fails"
