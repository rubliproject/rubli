# Ops: offsite backup + alerting (live 2026-10-30)

Closes launch-audit blockers **B1** (no offsite backup) and **B2** (no alerting), `docs/LAUNCH_AUDIT_2026-10-30.md`.
The owner's decision: the backup is pulled to the owner's Windows PC, with no cloud account. Alerts go through ntfy.sh, with no account.
This supersedes the "pull" path of `docs/OPS_LAUNCH.md` § 5 D. The rclone path there still works if a cloud copy is ever wanted.

## 1. What runs where

| Job | Where | When | Script | What it does |
|---|---|---|---|---|
| Nightly snapshot (existing) | VPS, `rubli-backup-cron` container | 02:00 UTC | `docker-compose.prod.yml` | `sqlite3 .backup` + `quick_check` → `/var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_<stamp>.db` (3 kept). It writes `/var/lib/rubli-db/LAST_BACKUP.json` only when the check passes |
| **Weekly pull** | Owner's PC, Task Scheduler `RUBLI-pull-backup` | **Sun 09:00 local** (after the 04:00 UTC weekly refresh) | `D:\Python\RUBLI_ops\pull-backup.ps1` (repo: `scripts/pull-backup.ps1`) | Reads `LAST_BACKUP.json` and streams that nightly through `pigz` over ssh (niced, 2 threads, **nothing new is written on the VPS**). Then it checks gzip CRC + exact size + SQLite header page count (`verify-backup.py`, streaming, nothing written). The VPS already ran `quick_check` on exactly this file, so CRC-clean + size-exact means it is that file bit for bit. `-QuickCheck` also runs `PRAGMA quick_check` + `contracts ≥ 3 M` on a temp copy, but that took over 1 h on the PC's laptop HDD, so it is off by default. Keeps the **last 3** in `D:\Python\RUBLI_backups\`, logs to `D:\Python\RUBLI_backups\pull.log`, and pushes the result (low priority if OK, high if failed) |
| **VPS health cron** | VPS, `/etc/cron.d/rubli-ops` | every 5 min | `/usr/local/lib/rubli-ops/uptime-check.sh` (repo: `scripts/uptime-check.sh` + `ops-lib.sh`) | `GET https://rubli.xyz/api/v1/health`. After 2 failures in a row or `db_connected` false → "RUBLI DOWN", repeated hourly while down, then one "recovered". Also pushes once a day when `/` is > 90 %, once a day when the nightly is > 30 h old, and once per failed weekly refresh (`rubli-weekly.service` result, or `WEEKLY_REFRESH.json` `result: FAILED…`). It skips the round while a deploy holds the lock. Log: `/var/log/rubli-ops.log` |
| **PC health check** | Owner's PC, Task Scheduler `RUBLI-healthcheck` | every 10 min | `D:\Python\RUBLI_ops\healthcheck-pc.ps1` | Same check from outside, so a **dead VPS still alerts**. After 2 failures in a row (~20 min) → "RUBLI DOWN (seen from PC)", repeated hourly. If the PC itself is offline (ntfy.sh unreachable), the round is not counted |
| Autoheal (existing) | VPS, `/etc/cron.d/rubli-autoheal` | every 5 min | `scripts/autoheal.sh` | Restarts `rubli-backend` after 3 failures |

Config:
- **Topic.** The topic is stored in `D:\Python\yangwenli\.claude\ALERT_TOPIC.txt` (git-ignored). The PC scripts read it from there, and the VPS reads it from `RUBLI_NTFY_TOPIC` in `/etc/rubli-ops.env` (root, 0600). Anyone who knows the topic name can read the alerts. Keep it out of public docs and issues.
- **VPS host.** `pull-backup.ps1 -VpsHost user@host` sets the host. The fallback is `$env:RUBLI_VPS`, then `root@rubli.xyz`. The task passes the host explicitly, so the IP is not in the repo.
- **Folder ACL.** `D:\Python\RUBLI_backups` has inheritance removed and only the owner's user has access (the DB holds user emails). `D:\` root is not writable without admin, which is why the folder is under `D:\Python`.
- **Window.** Both tasks run "only when logged on" through `run-hidden.vbs`, so no console window flashes. The pull only happens if the PC is on and logged in on Sunday morning. If it was off, run the pull by hand (§ 4).

Getting the VPS scripts in place: `/opt/rubli/scripts` is reset to `origin/main` on every deploy. So the branch versions were written to `/usr/local/lib/rubli-ops/` from the git blobs (LF line endings, `bash -n` passes, 0 CR). After `ops/backup-alerting` is merged, cron can point back at `/opt/rubli/scripts/uptime-check.sh` (`scripts/rubli-ops.cron`). Never scp shell scripts from Windows (CRLF).

## 2. Subscribe to the alerts (one step)

Install the **ntfy** app (Android / iOS, free, no account), tap **+**, and subscribe to the topic in `D:\Python\yangwenli\.claude\ALERT_TOPIC.txt` (server `ntfy.sh`). A test message "RUBLI alerts connected" was sent on 2026-10-30. The app shows recent messages after you subscribe.

Browser alternative: open `https://ntfy.sh/<topic>`.

## 3. Restore from a pulled backup

1. **Check the copy on the PC.** In PowerShell:
   ```powershell
   python -I D:\Python\RUBLI_ops\verify-backup.py D:\Python\RUBLI_backups\rubli_<stamp>.db.gz <size_bytes>
   ```
   For `size_bytes`, use `0` to see the real size in the error, then re-run with it. It must end with `quick_check ok`. That takes about 1 h on the HDD, so skip `--quick-check` when time matters, because the VPS restore in step 3 runs it again.
2. **Upload it to the VPS.** It goes in as gzip (~2.5 GB), and binary files are not affected by CRLF:
   ```powershell
   scp D:\Python\RUBLI_backups\rubli_<stamp>.db.gz root@<vps>:/var/tmp/
   ```
3. **On the VPS, stop the backend, swap the file and restart it.** The DB directory is a dir mount, so swapping files is safe. Never replace a single-file bind mount (Oct 26 outage).
   ```bash
   cd /opt/rubli
   pigz -dc /var/tmp/rubli_<stamp>.db.gz > /var/lib/rubli-db/RUBLI_DEPLOY.restored.db
   sqlite3 /var/lib/rubli-db/RUBLI_DEPLOY.restored.db 'PRAGMA quick_check'      # ok
   docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend
   cd /var/lib/rubli-db
   mv RUBLI_DEPLOY.db RUBLI_DEPLOY.broken_$(date -u +%Y%m%d).db
   rm -f RUBLI_DEPLOY.db-wal RUBLI_DEPLOY.db-shm      # the broken DB's WAL must not replay onto the restored one
   mv RUBLI_DEPLOY.restored.db RUBLI_DEPLOY.db
   chown 100:101 RUBLI_DEPLOY.db && chmod 660 RUBLI_DEPLOY.db
   cd /opt/rubli && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend
   curl -s https://rubli.xyz/api/v1/health | head -c 200   # status ok, contract_count ≈ 3.18 M
   ```
   Disk: the restore needs ~9 GB free. Delete old `pre_*` copies first if needed.
4. **Recover lost data.** Anything written after the backup's timestamp is lost. Re-run the weekly refresh if it ran after the backup.

For a faster restore, use the VPS-local nightlies, which are uncompressed: `/var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_<stamp>.db`. Use the PC copy only when the VPS disk itself is gone. For a new VPS, scp the `.gz` and follow step 3.

## 4. Operate

- **Pull now:** `schtasks /Run /TN RUBLI-pull-backup`, or run `pwsh -File D:\Python\RUBLI_ops\pull-backup.ps1 -VpsHost root@<vps>`.
- **Check the PC side:** read `D:\Python\RUBLI_backups\pull.log`, and run `schtasks /Query /TN RUBLI-healthcheck /V /FO LIST`.
- **Check the VPS side:** `tail /var/log/rubli-ops.log`. State is kept in `/var/lib/rubli-ops/`.
- **Test without sending:** `DRY_RUN=1 RUBLI_OPS_STATE=$(mktemp -d) RUBLI_HEALTH_URL=https://rubli.xyz/nope bash /usr/local/lib/rubli-ops/uptime-check.sh` (twice to see the "DOWN" line).
- **After editing the PC scripts in the repo:** copy `scripts/{pull-backup.ps1,healthcheck-pc.ps1,verify-backup.py,run-hidden.vbs}` to `D:\Python\RUBLI_ops\`.
- **Disable:** `schtasks /Delete /TN RUBLI-pull-backup /F`, `schtasks /Delete /TN RUBLI-healthcheck /F`, and `rm /etc/cron.d/rubli-ops`.
- **Cron path:** cron path switches back to /opt/rubli/scripts on merge (`install -m 644 /opt/rubli/scripts/rubli-ops.cron /etc/cron.d/rubli-ops`; the interim `/usr/local/lib/rubli-ops` copy is removed).
