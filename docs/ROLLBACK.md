# Rollback Runbook

> How to revert a bad production deployment on the RUBLI VPS (37.60.232.109).

---

## Service Architecture

| Component | Container | What it serves |
|-----------|-----------|---------------|
| Backend | `backend` | FastAPI + SQLite on port 8001 |
| Frontend | `frontend` | nginx serving React app on port 80 |
| Reverse proxy | Caddy (host) | TLS termination → port 80 |
| Database | Host directory mount | `/var/lib/rubli-db/RUBLI_DEPLOY.db` (→ `/app/data` in the backend, `/db` in backup-cron; WAL on the host). `/opt/rubli/backend/RUBLI_DEPLOY.db` is a symlink. |
| Backups | `rubli_backups` volume | `/var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_*.db` — nightly 02:00 UTC `sqlite3 .backup` + quick_check, 3 newest kept |
| Watchdog | `/etc/cron.d/rubli-autoheal` | restarts the backend after 3 failed health checks (log `/var/log/rubli-autoheal.log`) |

---

## 1. Code Rollback (bad commit deployed)

The VPS deploys whatever is on the bare repo's `main` (`/opt/rubli-git.git`, the local remote `prod`);
a push there runs `scripts/deploy-safe.sh`. Roll back by pushing a revert of the bad commit to `prod`
and `origin` main — never edit `/opt/rubli` by hand. Watch the newest `/root/deploy-*.log`, then
`curl -s https://rubli.xyz/api/v1/health`.

---

## 2. Database Rollback (bad migration or data load)

> **WARNING**: the DB is ~8.4 GB. Check `df -h /` first. Never `cp` a live WAL database — copy only with
> the backend stopped, or use `sqlite3 SRC ".backup DST"`.

### Check available backups

```bash
ls -lh /var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_*.db   # nightly, quick_check-verified
ls -lh /root/RUBLI_DEPLOY.backup_*.db                                    # manual pre-change snapshots
cat /var/lib/rubli-db/LAST_BACKUP.json
```

### Restore a backup

```bash
cd /var/lib/rubli-db
python3 -c "import sqlite3; print(sqlite3.connect('file:/path/to/backup.db?mode=ro',uri=True).execute('PRAGMA quick_check').fetchone())"
docker compose -f /opt/rubli/docker-compose.prod.yml --env-file /opt/rubli/.env.prod stop backend   # clean stop checkpoints the WAL
mv RUBLI_DEPLOY.db RUBLI_DEPLOY_before_restore_$(date +%Y%m%d_%H%M%S).db && rm -f RUBLI_DEPLOY.db-wal RUBLI_DEPLOY.db-shm
cp /path/to/backup.db RUBLI_DEPLOY.db && chown 100:101 RUBLI_DEPLOY.db && chmod 660 RUBLI_DEPLOY.db
docker compose -f /opt/rubli/docker-compose.prod.yml --env-file /opt/rubli/.env.prod up -d backend
curl -s https://rubli.xyz/api/v1/health   # contract_count ≈ 3.18M; the 30–60 s boot scan is normal
```

---

## 3. Off-Site Backup

Nightly offsite copy (zstd, rclone to a free tier or pulled to the owner's PC), weekly restore test, uptime + backup alerts: see `docs/OPS_LAUNCH.md`.

---

## 3. Full Service Restart

```bash
ssh root@37.60.232.109
cd /opt/rubli
docker compose -f docker-compose.prod.yml restart
```

---

## 4. Emergency Stop (take site offline)

```bash
ssh root@37.60.232.109
cd /opt/rubli
docker compose -f docker-compose.prod.yml stop
```

To bring back up: `docker compose -f docker-compose.prod.yml up -d`

---

## 5. Check Logs

```bash
# Backend API errors
docker logs backend --tail=200 -f

# Frontend nginx access/error logs
docker logs frontend --tail=200

# All services
docker compose -f docker-compose.prod.yml logs --tail=100 -f
```

---

## 6. Health Check URLs

After any rollback, verify these pass:

| Check | Command |
|-------|---------|
| Backend health | `curl -s http://localhost:8001/health` |
| Stats endpoint | `curl -s http://localhost:8001/api/v1/stats/database` |
| Frontend | `curl -sI http://localhost/ \| head -5` |
| ARIA queue | `curl -s http://localhost:8001/api/v1/aria/stats` |

---

## 7. Pre-Deployment Checklist

Before any production push:

- [ ] `python -m pytest backend/tests/ -q --tb=short` passes locally
- [ ] `npx tsc --noEmit && npm run build` passes in `frontend/`
- [ ] DB backup created: `sqlite3 /var/lib/rubli-db/RUBLI_DEPLOY.db ".backup /root/RUBLI_DEPLOY.backup_$(date +%Y%m%d).db"` (WAL-safe)
- [ ] Disk space checked: `df -h /`
- [ ] Not during business hours (Mexico City: UTC-6)

---

*Last updated: April 2026*
