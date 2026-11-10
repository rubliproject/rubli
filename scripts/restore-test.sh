#!/usr/bin/env bash
# restore-test.sh — prove a backup restores: fetch → sha256 → zstd -d → PRAGMA integrity_check → count contracts.
# A backup nobody has opened is not a backup (Oct 22–26: every nightly was a stale inode).
#
# Usage: restore-test.sh [path/to/rubli_*.db.zst]
#   no arg: RUBLI_OFFSITE=rclone → newest file on $RUBLI_RCLONE_REMOTE (a real offsite round-trip)
#           RUBLI_OFFSITE=pull   → newest file in $RUBLI_STAGE
# Needs ~11 GB free in $RUBLI_RESTORE_DIR. Exit 0 only if everything checks; ntfy push on failure.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops-lib.sh
. "$here/ops-lib.sh"

RUBLI_OFFSITE="${RUBLI_OFFSITE:-pull}"
RUBLI_STAGE="${RUBLI_STAGE:-/var/backups/rubli-offsite}"
RUBLI_RCLONE_REMOTE="${RUBLI_RCLONE_REMOTE:-}"
RUBLI_RESTORE_DIR="${RUBLI_RESTORE_DIR:-/var/tmp/rubli-restore}"
RUBLI_MIN_CONTRACTS="${RUBLI_MIN_CONTRACTS:-3000000}"

work="$RUBLI_RESTORE_DIR/run.$$"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT
fail() {
  log "RESTORE TEST FAILED: $1"
  notify "RUBLI restore test FAILED" "$1"
  exit 1
}
trap 'fail "error at line $LINENO"' ERR

zst="${1:-}"
if [ -z "$zst" ] && [ "$RUBLI_OFFSITE" = rclone ]; then
  [ -n "$RUBLI_RCLONE_REMOTE" ] || fail "RUBLI_RCLONE_REMOTE is empty"
  name="$(rclone lsf --files-only --include 'rubli_*.db.zst' "$RUBLI_RCLONE_REMOTE" | sort | tail -n 1)"
  [ -n "$name" ] || fail "no backups on $RUBLI_RCLONE_REMOTE"
  log "downloading $RUBLI_RCLONE_REMOTE/$name"
  rclone copyto "$RUBLI_RCLONE_REMOTE/$name" "$work/$name"
  rclone copyto "$RUBLI_RCLONE_REMOTE/$name.sha256" "$work/$name.sha256" || log "no .sha256 on remote"
  zst="$work/$name"
elif [ -z "$zst" ]; then
  zst="$(find "$RUBLI_STAGE" -maxdepth 1 -name 'rubli_*.db.zst' | sort | tail -n 1)"
  [ -n "$zst" ] || fail "no backups in $RUBLI_STAGE"
fi
[ -f "$zst" ] || fail "not a file: $zst"
log "testing $zst"

if [ -f "$zst.sha256" ]; then
  (cd "$(dirname "$zst")" && sha256sum -c --quiet "$(basename "$zst").sha256") || fail "sha256 mismatch for $zst"
  log "sha256 ok"
fi

db="$work/restore.db"
zstd -d -q -o "$db" "$zst" || fail "zstd could not decompress $zst"
ic="$(sqlite3 "$db" 'PRAGMA integrity_check;' | head -n 5)"
[ "$ic" = "ok" ] || fail "integrity_check: $ic"
n="$(sqlite3 "$db" 'SELECT COUNT(*) FROM contracts;')" || fail "no contracts table"
[ "$n" -ge "$RUBLI_MIN_CONTRACTS" ] || fail "only $n contracts (< $RUBLI_MIN_CONTRACTS)"
log "RESTORE OK: $(basename "$zst") integrity_check=ok contracts=$n"
