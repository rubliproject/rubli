#!/bin/sh
# Weekly ComprasMX refresh (backend/scripts/comprasmx_weekly.py). Own container: deploys do not kill it.
# Run by rubli-weekly.timer (Sun 04:00 UTC). Install: install -m 755 /opt/rubli/scripts/rubli-weekly.sh /usr/local/bin/
# Hardened 2026-10-28: runs as the app uid (100:101, owner of the DB dir), no capabilities, no privilege
# escalation, read-only root fs + read-only code mount; only /app/data and /backups are writable.
# The log is redirected on the HOST (before: written inside the container and lost on exit).
# 2026-10-30 (docs/WEEKLY_JOB_PREFLIGHT_2026-11-01.md): restart the backend after a run that loaded data —
# its in-process caches (category covers, data cut, analysis dicts) only refresh on a restart.
# 2026-10-31 (docs/MODEL_MONITORING_2026-10-30.md § 6): alerts. RUBLI_ALERT_URL comes from its OWN root-only file
# /etc/rubli-weekly.env (one line `RUBLI_ALERT_URL=https://ntfy.sh/<topic>`, or a healthchecks.io ping URL), created
# by the owner: install -m 600 -o root -g root. Parsed (not sourced) and handed to the container by NAME (`-e VAR`),
# so the URL never shows in `ps`/`docker inspect` args. No file = no alerts, the run is unchanged.
set -u
RUBLI_ALERT_URL=$(sed -n 's/^RUBLI_ALERT_URL=//p' /etc/rubli-weekly.env 2>/dev/null | tail -n 1)
export RUBLI_ALERT_URL
LOG=/var/lib/rubli-db/weekly/run_$(date -u +%Y%m%d_%H%M).log
if docker ps --format "{{.Names}}" | grep -qx rubli-weekly; then echo "a refresh is already running"; exit 0; fi
docker rm -f rubli-weekly >/dev/null 2>&1
docker run --rm --name rubli-weekly --user 100:101 \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp \
  -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e RUBLI_ALERT_URL -e DATABASE_PATH=/app/data/RUBLI_DEPLOY.db \
  -v /opt/rubli:/w:ro -v /var/lib/rubli-db:/app/data \
  -v /var/lib/docker/volumes/rubli_rubli_backups/_data:/backups \
  --entrypoint python rubli-job:pandas /w/backend/scripts/comprasmx_weekly.py > "$LOG" 2>&1
rc=$?
# "ok" or "ok_soft_failures" = rows loaded; "nothing new" / FAILED / skipped = nothing to show, no restart
if [ $rc -eq 0 ] && grep -q '"result": "ok' /var/lib/rubli-db/WEEKLY_REFRESH.json; then
  echo "[wrapper] $(date -u +%T) restarting rubli-backend (cache refresh)" >> "$LOG"
  flock -w 600 /opt/rubli/.deploy.lock docker restart rubli-backend >> "$LOG" 2>&1 || echo "[wrapper] restart failed" >> "$LOG"
fi
chmod 640 "$LOG"
exit $rc
