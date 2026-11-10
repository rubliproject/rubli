#!/usr/bin/env bash
# ops-lib.sh — shared bits for offsite-backup.sh / restore-test.sh / uptime-check.sh.
# Sourced, never run. Config comes from /etc/rubli-ops.env (see scripts/rubli-ops.env.example).
# shellcheck disable=SC2034  # variables are used by the scripts that source this file

RUBLI_OPS_ENV="${RUBLI_OPS_ENV:-/etc/rubli-ops.env}"
# shellcheck source=/dev/null
[ -r "$RUBLI_OPS_ENV" ] && . "$RUBLI_OPS_ENV"

RUBLI_NTFY_SERVER="${RUBLI_NTFY_SERVER:-https://ntfy.sh}"
RUBLI_NTFY_TOPIC="${RUBLI_NTFY_TOPIC:-}"

log() { echo "$(date -u +%FT%TZ) [$(basename "$0")] $*"; }

# notify <title> <message> [priority]  — phone push via ntfy.sh (no account; topic name is the secret)
notify() {
  [ -n "$RUBLI_NTFY_TOPIC" ] || { log "ntfy not configured: $1 — $2"; return 0; }
  [ "${DRY_RUN:-0}" = 1 ] && { log "[dry-run] ntfy: $1 — $2"; return 0; }
  curl -fsS -m 15 -H "Title: $1" -H "Priority: ${3:-high}" -H "Tags: rotating_light" \
    -d "$2" "$RUBLI_NTFY_SERVER/$RUBLI_NTFY_TOPIC" >/dev/null || log "ntfy push failed"
}

# hc_ping <url> [start|fail|""]  — healthchecks.io dead-man switch; empty url = not configured
hc_ping() {
  [ -n "${1:-}" ] || return 0
  [ "${DRY_RUN:-0}" = 1 ] && { log "[dry-run] ping ${1}${2:+/$2}"; return 0; }
  curl -fsS -m 15 --retry 3 -o /dev/null "${1}${2:+/$2}" || log "healthchecks ping failed"
}
