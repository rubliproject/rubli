#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-safe.sh — collision-proof production deploy for RUBLI.
#
# WHY THIS EXISTS: multiple agent sessions sometimes deploy to the same VPS at
# once. Two concurrent `docker compose up` runs race and collide on container
# names ("name already in use") and the bridge network ("already exists"), and
# the classic `down && up` pattern opens a window where the site is fully down.
# This script serializes deploys with an flock(1) lock so only one runs at a
# time, does an in-place `up` (no down-window), and auto-recovers from a
# collision by force-removing stale containers and retrying once.
#
# USAGE (on the VPS):   bash /opt/rubli/scripts/deploy-safe.sh
# It is idempotent and safe to run repeatedly / concurrently — extra callers
# queue on the lock (up to 10 min) instead of racing.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO=/opt/rubli
LOCK="$REPO/.deploy.lock"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
HEALTH_URL="https://rubli.xyz/api/v1/health"

cd "$REPO" || { echo "[deploy] cannot cd $REPO"; exit 1; }

# ── Serialize: acquire an exclusive lock; queued deploys wait up to 600s ──────
exec 9>"$LOCK"
echo "[deploy] acquiring lock…"
if ! flock -w 600 9; then
  echo "[deploy] FAILED to acquire deploy lock within 600s — another deploy is stuck"
  exit 1
fi
echo "[deploy] lock acquired ($(date -u +%H:%M:%SZ))"

# ── Sync code (VPS tracks origin/main, HEAD is master) ────────────────────────
git fetch origin -q
PREV_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
echo "[deploy] at $(git log --oneline -1)"

# ── Force a clean frontend image FIRST. Docker layer-caching has repeatedly
#    served a STALE bundle (source changed but the cached `npm run build` layer
#    was reused) — a fresh hash that silently lacks the latest code. --no-cache
#    on the frontend guarantees the bundle reflects the checked-out source.
$COMPOSE build --no-cache frontend || { echo "[deploy] frontend --no-cache build FAILED"; exit 1; }

# ── In-place recreate (no down-window). Retry once with cleanup on collision ──
if ! $COMPOSE up -d --build --remove-orphans; then
  echo "[deploy] up failed (likely a stale-container collision) — cleaning + retrying"
  docker rm -f rubli-frontend rubli-backend rubli-caddy rubli-aria-cron rubli-backup-cron 2>/dev/null || true
  docker network rm rubli_rubli-network 2>/dev/null || true
  $COMPOSE up -d --remove-orphans || { echo "[deploy] retry FAILED"; docker ps -a --format '{{.Names}}\t{{.Status}}'; exit 1; }
fi

# ── Restore canonical names. A recreate that collides can leave a container as
#    `<id>_rubli-backend`; rubli-weekly.sh and runbooks `docker exec rubli-backend`.
#    Idempotent: only renames when the exact name is absent. ────────────────────
for n in rubli-frontend rubli-backend rubli-caddy rubli-aria-cron rubli-backup-cron; do
  docker ps -a --format '{{.Names}}' | grep -qx "$n" && continue
  stray=$(docker ps --format '{{.Names}}' | grep -E "^[0-9a-f]+_${n}\$" | head -n1)
  [ -n "$stray" ] && { docker rename "$stray" "$n" && echo "[deploy] renamed $stray -> $n" || echo "[deploy] WARN could not rename $stray"; }
done

# ── Verify edge + backend health. When the backend container is recreated it
#    runs a 30–60s cold-start DB scan (3.1M rows) before it answers, so poll
#    patiently (~96s) — but break the instant it's healthy so good deploys stay
#    fast. ───────────────────────────────────────────────────────────────────
sleep 4
healthy=0
for i in $(seq 1 24); do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    echo "[deploy] OK — backend healthy (after ~$((i * 4))s)"
    healthy=1
    break
  fi
  sleep 4
done

echo "[deploy] containers:"
docker ps --format '{{.Names}}\t{{.Status}}'

# ── A failed health check is a FAILED deploy — exit non-zero. Previously this
#    path only printed a WARN and still exited 0, so a broken deploy reported
#    success and the caller trusted it; that masked a brief prod outage on
#    2026-06-04 (the container-collision retry left the stack down but the
#    script returned 0). Callers (ssh, CI) can now rely on the exit code. ──────
if [ "$healthy" != 1 ]; then
  echo "[deploy] FAILED — backend never became healthy (~96s); site may be down"
  echo "[deploy] previous code was $PREV_SHA — roll back by pushing a revert to main (re-runs this script)"
  docker ps -a --format '{{.Names}}\t{{.Status}}'
  exit 1
fi
# Reclaim what each no-cache build leaves behind (dangling images, build cache > 3 days);
# never volumes, never tagged images in use. Best effort: a prune failure is not a failed deploy.
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
echo "[deploy] done ($(date -u +%H:%M:%SZ))"
