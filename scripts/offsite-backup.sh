#!/usr/bin/env bash
# offsite-backup.sh — compress the newest verified prod backup and get it off the VPS.
# Runbook: docs/OPS_LAUNCH.md. Cron: scripts/rubli-ops.cron (03:30 UTC, after the 02:00 nightly).
#
#  1. Source = the nightly named in /var/lib/rubli-db/LAST_BACKUP.json (backup-cron writes it only
#     after `.backup` + quick_check pass). If that is missing or > 26 h old, take a fresh snapshot
#     with sqlite3 `.backup` (consistent under WAL; never cp a live DB).
#  2. zstd -9 (8.2 GB → ~2 GB), frame test, sha256 → $RUBLI_STAGE/rubli_<stamp>.db.zst
#  3. RUBLI_OFFSITE=rclone → upload to $RUBLI_RCLONE_REMOTE, keep $RUBLI_OFFSITE_KEEP there.
#     RUBLI_OFFSITE=pull   → leave it staged; the owner's PC fetches it (scripts/pull-backup.ps1).
#  4. Pings healthchecks.io ($RUBLI_HC_BACKUP_URL) start/success/fail; ntfy push on failure.
#
# Usage: offsite-backup.sh [--dry-run]   (--dry-run: steps 1–2 for real, no upload/pings)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops-lib.sh
. "$here/ops-lib.sh"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

RUBLI_OFFSITE="${RUBLI_OFFSITE:-pull}"
RUBLI_DB="${RUBLI_DB:-/var/lib/rubli-db/RUBLI_DEPLOY.db}"
RUBLI_LAST_BACKUP_JSON="${RUBLI_LAST_BACKUP_JSON:-$(dirname "$RUBLI_DB")/LAST_BACKUP.json}"
RUBLI_NIGHTLY_DIR="${RUBLI_NIGHTLY_DIR:-/var/lib/docker/volumes/rubli_rubli_backups/_data}"
RUBLI_STAGE="${RUBLI_STAGE:-/var/backups/rubli-offsite}"
RUBLI_STAGE_KEEP="${RUBLI_STAGE_KEEP:-2}"
RUBLI_OFFSITE_KEEP="${RUBLI_OFFSITE_KEEP:-3}"
RUBLI_RCLONE_REMOTE="${RUBLI_RCLONE_REMOTE:-}"
RUBLI_HC_BACKUP_URL="${RUBLI_HC_BACKUP_URL:-}"

umask 077  # staged copies hold user emails (SECURITY_REVIEW_2026-10-30 M3)
mkdir -p "$RUBLI_STAGE"
chmod 700 "$RUBLI_STAGE"
if command -v flock >/dev/null; then
  exec 8>"$RUBLI_STAGE/.lock"
  flock -n 8 || { log "another run holds the lock; exiting"; exit 0; }
fi

out="rubli_$(date -u +%Y%m%d_%H%M%S).db.zst"
snap=""
fail() {
  log "FAILED: $1"
  rm -f "$RUBLI_STAGE/$out.part" "$RUBLI_STAGE/$out" "$RUBLI_STAGE/$out.sha256"
  [ -n "$snap" ] && rm -f "$snap"
  notify "RUBLI backup FAILED" "offsite-backup.sh ($RUBLI_OFFSITE): $1. Log: /var/log/rubli-ops.log"
  hc_ping "$RUBLI_HC_BACKUP_URL" fail
  exit 1
}
trap 'fail "error at line $LINENO"' ERR

case "$RUBLI_OFFSITE" in
  pull) ;;
  rclone)
    [ -n "$RUBLI_RCLONE_REMOTE" ] || fail "RUBLI_OFFSITE=rclone but RUBLI_RCLONE_REMOTE is empty"
    [ "$DRY_RUN" = 1 ] || command -v rclone >/dev/null || fail "rclone not installed" ;;
  *) fail "RUBLI_OFFSITE must be pull or rclone (got '$RUBLI_OFFSITE')" ;;
esac
hc_ping "$RUBLI_HC_BACKUP_URL" start

# ── 1. source ────────────────────────────────────────────────────────────────
src=""
name="$(sed -n 's/.*"files": *\["\([^"]*\)".*/\1/p' "$RUBLI_LAST_BACKUP_JSON" 2>/dev/null || true)"
if [ -n "$name" ] && [ -n "$(find "$RUBLI_NIGHTLY_DIR/$name" -mmin -1560 2>/dev/null)" ]; then
  src="$RUBLI_NIGHTLY_DIR/$name"
  log "source: verified nightly $src"
else
  snap="$RUBLI_STAGE/snapshot.db"
  rm -f "$snap"
  log "no nightly < 26 h old; snapshotting $RUBLI_DB"
  sqlite3 "$RUBLI_DB" ".backup '$snap'"
  [ "$(sqlite3 "$snap" 'PRAGMA quick_check;')" = "ok" ] || fail "snapshot quick_check failed"
  src="$snap"
fi

# ── 2. compress + verify ─────────────────────────────────────────────────────
lowprio=(nice -n 10)
command -v ionice >/dev/null && lowprio+=(ionice -c3)
"${lowprio[@]}" zstd -T0 -9 -q -c "$src" > "$RUBLI_STAGE/$out.part"
zstd -t -q "$RUBLI_STAGE/$out.part"
mv "$RUBLI_STAGE/$out.part" "$RUBLI_STAGE/$out"
(cd "$RUBLI_STAGE" && sha256sum "$out" > "$out.sha256")
[ -n "$snap" ] && rm -f "$snap"
log "staged $RUBLI_STAGE/$out ($(du -h "$RUBLI_STAGE/$out" | cut -f1))"

# keep the newest $RUBLI_STAGE_KEEP locally (2: a pull in progress never loses its file)
find "$RUBLI_STAGE" -maxdepth 1 -name 'rubli_*.db.zst' -printf '%f\n' | sort | head -n -"$RUBLI_STAGE_KEEP" |
  while read -r old; do rm -f "$RUBLI_STAGE/$old" "$RUBLI_STAGE/$old.sha256"; log "rotated local $old"; done

# ── 3. offsite ───────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
  log "[dry-run] would ship $out via $RUBLI_OFFSITE${RUBLI_RCLONE_REMOTE:+ → $RUBLI_RCLONE_REMOTE}"
elif [ "$RUBLI_OFFSITE" = rclone ]; then
  rclone copyto "$RUBLI_STAGE/$out" "$RUBLI_RCLONE_REMOTE/$out"
  rclone copyto "$RUBLI_STAGE/$out.sha256" "$RUBLI_RCLONE_REMOTE/$out.sha256"
  rclone check "$RUBLI_STAGE" "$RUBLI_RCLONE_REMOTE" --one-way --include "$out" -q
  log "uploaded to $RUBLI_RCLONE_REMOTE/$out"
  rclone lsf --files-only --include 'rubli_*.db.zst' "$RUBLI_RCLONE_REMOTE" | sort | head -n -"$RUBLI_OFFSITE_KEEP" |
    while read -r old; do
      rclone deletefile "$RUBLI_RCLONE_REMOTE/$old"
      rclone deletefile "$RUBLI_RCLONE_REMOTE/$old.sha256" || true
      log "rotated remote $old"
    done
else
  log "pull mode: $out waits in $RUBLI_STAGE for scripts/pull-backup.ps1"
fi

hc_ping "$RUBLI_HC_BACKUP_URL"
log "done"
