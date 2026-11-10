#!/usr/bin/env bash
# uptime-check.sh — every 5 min from scripts/rubli-ops.cron. Runbook: docs/OPS_LAUNCH.md.
#  - Hits the PUBLIC health URL (Caddy → backend → DB), not localhost, so a broken proxy counts.
#  - 2 failures in a row (~10 min) → ntfy push + healthchecks.io /fail; repeats hourly while down;
#    one "recovered" push when it comes back. (autoheal.sh restarts the backend at 3 failures.)
#  - Healthy → ping $RUBLI_HC_UPTIME_URL. If the whole VPS dies the pings stop and healthchecks.io
#    alerts on its own — the one failure a script on this box cannot report.
#  - Also pushes once a day if the nightly backup is > 30 h old (health JSON carries last_backup),
#    once a day if / is > 90 % full, and once per failed run of the weekly refresh (rubli-weekly).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops-lib.sh
. "$here/ops-lib.sh"

RUBLI_HEALTH_URL="${RUBLI_HEALTH_URL:-https://rubli.xyz/api/v1/health}"
RUBLI_HC_UPTIME_URL="${RUBLI_HC_UPTIME_URL:-}"
STATE="${RUBLI_OPS_STATE:-/var/lib/rubli-ops}"
mkdir -p "$STATE"

# a deploy holds deploy-safe.sh's flock: brief 502s are expected, skip this round (as autoheal.sh does)
if [ -e /opt/rubli/.deploy.lock ] && command -v flock >/dev/null; then
  exec 9>/opt/rubli/.deploy.lock
  flock -n 9 || exit 0
  flock -u 9
fi

# weekly ComprasMX refresh failed (systemd unit result or WEEKLY_REFRESH.json) → one push per failed run
wk_unit="$(systemctl show -p Result --value rubli-weekly.service 2>/dev/null)"
wk_json="$(sed -n 's/.*"result": *"\([^"]*\)".*/\1/p' "${RUBLI_WEEKLY_JSON:-/var/lib/rubli-db/WEEKLY_REFRESH.json}" 2>/dev/null)"
if { [ -n "$wk_unit" ] && [ "$wk_unit" != success ]; } || [ "${wk_json#FAILED}" != "$wk_json" ]; then
  wk_key="$wk_unit|$wk_json|$(systemctl show -p ExecMainExitTimestamp --value rubli-weekly.service 2>/dev/null)"
  if [ "$(cat "$STATE/weekly_alerted" 2>/dev/null)" != "$wk_key" ]; then
    notify "RUBLI weekly refresh FAILED" "unit=$wk_unit result=$wk_json — see /var/lib/rubli-db/weekly/run_*.log" high
    printf '%s' "$wk_key" > "$STATE/weekly_alerted"
  fi
fi

# disk > 90 % → one push per day
disk="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
if [ "${disk:-0}" -gt "${RUBLI_DISK_MAX:-90}" ] && [ "$(cat "$STATE/disk_day" 2>/dev/null)" != "$(date -u +%F)" ]; then
  notify "RUBLI disk ${disk}% full" "VPS / is ${disk}% used — old *.db copies in /var/lib/rubli-db and the backups volume" high
  date -u +%F > "$STATE/disk_day"
fi

body="$(curl -fsS -m 25 "$RUBLI_HEALTH_URL" 2>&1)"
if printf '%s' "$body" | grep -q '"status":"ok"' && printf '%s' "$body" | grep -q '"db_connected":true'; then
  if [ -f "$STATE/down" ]; then
    notify "RUBLI recovered" "$RUBLI_HEALTH_URL healthy again (down since $(cat "$STATE/down"))" default
    rm -f "$STATE/down"
  fi
  echo 0 > "$STATE/fails"
  hc_ping "$RUBLI_HC_UPTIME_URL"

  age="$(printf '%s' "$body" | sed -n 's/.*"age_hours": *\([0-9]*\).*/\1/p')"
  if [ -n "$age" ] && [ "$age" -gt 30 ] && [ "$(cat "$STATE/stale_backup_day" 2>/dev/null)" != "$(date -u +%F)" ]; then
    notify "RUBLI nightly backup is stale" "last_backup is ${age} h old — check rubli-backup-cron" default
    date -u +%F > "$STATE/stale_backup_day"
  fi
  exit 0
fi

fails=$(( $(cat "$STATE/fails" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE/fails"
log "health check failed ($fails in a row): ${body:0:200}"
if [ "$fails" -ge 2 ] && [ $(( (fails - 2) % 12 )) -eq 0 ]; then
  [ -f "$STATE/down" ] || date -u +%FT%TZ > "$STATE/down"
  notify "RUBLI DOWN" "$RUBLI_HEALTH_URL failed $fails checks in a row (~$((fails * 5)) min): ${body:0:200}" urgent
  hc_ping "$RUBLI_HC_UPTIME_URL" fail
fi
exit 1
