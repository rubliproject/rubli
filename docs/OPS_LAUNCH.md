# Ops at launch: backups, restore, alerts

> **2026-10-30: what is actually live is `docs/OPS_BACKUP_ALERTING.md`** (weekly PC pull of the nightly, ntfy alerts from the VPS and the PC). The staging/rclone path below is not installed.

> Launch is Nov 17 2026. Every piece here is free. Branch `ops/backup-alert` adds the scripts, and nothing runs until the owner finishes **§5 Setup**.

## 1. What runs where

| Job | Where | When (UTC) | Script | Output / alert |
|---|---|---|---|---|
| Nightly snapshot | `rubli-backup-cron` container | 02:00 | `docker-compose.prod.yml` | `/var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_<stamp>.db` (3 kept, `.backup` + quick_check) and `/var/lib/rubli-db/LAST_BACKUP.json` |
| **Offsite copy** | VPS host cron (`/etc/cron.d/rubli-ops`) | 03:30 | `scripts/offsite-backup.sh` | `/var/backups/rubli-offsite/rubli_<stamp>.db.zst` + `.sha256` (2 kept). Then rclone upload **or** a pull from the PC. Pings healthchecks.io; ntfy push on failure |
| **Pull to home** (pull mode only) | Owner's Windows PC, Task Scheduler | daily 10:00 local | `scripts/pull-backup.ps1` | `D:\Backups\rubli\` (3 kept, sha256 verified) |
| **Restore test** | VPS host cron | Sun 05:00 | `scripts/restore-test.sh` | fetch → sha256 → `zstd -d` → `PRAGMA integrity_check` → `COUNT(*) contracts ≥ 3,000,000`. ntfy push on failure |
| **Uptime** | VPS host cron | every 5 min | `scripts/uptime-check.sh` | `GET https://rubli.xyz/api/v1/health`. Two failures in a row trigger an ntfy push (repeated hourly) and a "recovered" push when it comes back. Pushes once a day if the nightly backup is over 30 h old |
| Autoheal (existing) | VPS host cron | every 5 min | `scripts/autoheal.sh` | restarts `rubli-backend` after 3 failures |
| Dead-man switch | healthchecks.io (external) | — | — | alerts if the backup or uptime pings stop arriving, which covers the case where the whole VPS is dead |

Config for all VPS jobs: `/etc/rubli-ops.env` (template: `scripts/rubli-ops.env.example`, chmod 600). Log: `/var/log/rubli-ops.log`.

Compressed size: zstd -9 shrinks the DB to about 25 % of its size, so the 8.2 GB DB becomes about 2.1 GB per copy.

## 2. Who gets alerted, and how

| Event | Channel | Latency |
|---|---|---|
| Site/API/DB unhealthy | ntfy push to the owner's phone (topic in `RUBLI_NTFY_TOPIC`) + healthchecks.io "rubli-uptime" goes down | ~10 min |
| Whole VPS down / cron dead | healthchecks.io "rubli-uptime" misses pings → its integrations (email + ntfy) | ~15 min |
| Offsite backup failed | ntfy push + healthchecks.io "rubli-backup" /fail | immediate |
| Offsite backup never ran | healthchecks.io "rubli-backup" missed | 26 h |
| Nightly snapshot stale (> 30 h) | ntfy push (from uptime-check) | ≤ 1 day |
| Restore test failed | ntfy push | Sunday |
| PC pull failed / didn't run (pull mode) | healthchecks.io "rubli-pull" (optional) | 2 days |

**Why this design.** A cron job on the VPS sees app, proxy and DB faults and pushes to the phone within minutes. It cannot report its own death, so healthchecks.io acts as the dead-man switch for that case. ntfy.sh needs no account, but anyone who knows a topic name can read it, so the topic name is a long random string. UptimeRobot (free, 5-min HTTP checks, email) is an optional outside check. It adds a second network path and nothing else.

## 3. Restore

### 3a. Check a backup without touching prod (the weekly cron does this)
```bash
bash /opt/rubli/scripts/restore-test.sh                       # newest offsite (rclone) or staged (pull) copy
bash /opt/rubli/scripts/restore-test.sh /path/rubli_X.db.zst  # a specific file
```

### 3b. Restore prod from a backup (real incident)
The DB directory is mounted, so swapping files inside `/var/lib/rubli-db` with the backend **stopped** is safe. Never swap a single-file bind mount (Oct 26 outage).
```bash
cd /opt/rubli
F=/var/backups/rubli-offsite/rubli_<stamp>.db.zst      # or: rclone copyto "$RUBLI_RCLONE_REMOTE/<name>" /var/tmp/<name>
                                                         # or from the PC: scp D:\Backups\rubli\<name> root@37.60.232.109:/var/tmp/
bash scripts/restore-test.sh "$F"                        # must print RESTORE OK
zstd -d -o /var/lib/rubli-db/RUBLI_DEPLOY.restored.db "$F"
docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend
cd /var/lib/rubli-db
mv RUBLI_DEPLOY.db RUBLI_DEPLOY.broken_$(date -u +%Y%m%d).db
rm -f RUBLI_DEPLOY.db-wal RUBLI_DEPLOY.db-shm             # WAL of the broken DB must not replay onto the restored one
mv RUBLI_DEPLOY.restored.db RUBLI_DEPLOY.db
chown 100:101 RUBLI_DEPLOY.db && chmod 660 RUBLI_DEPLOY.db
cd /opt/rubli && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend
curl -s https://rubli.xyz/api/v1/health | head -c 200     # status ok, contract_count ≈ 3.18M
```
The newest nightly on the VPS (`/var/lib/docker/volumes/rubli_rubli_backups/_data/`) is uncompressed and needs no `zstd -d`. Data written after the backup time is lost; re-run the weekly refresh if needed.

## 4. Getting the scripts onto the VPS

Merge `ops/backup-alert` into `main`, then `git push prod HEAD:main`. That push starts a deploy through the post-receive hook. The scripts are host-side, so containers are unaffected, and every later deploy keeps them current. Never scp them from Windows, because of CRLF line endings (`.gitattributes` forces LF).

## 5. Owner setup (≈ 5 minutes, once)

**A. Phone push (1 min).** Install the **ntfy** app (Android/iOS) and subscribe to a new topic named with the output of `openssl rand -hex 12`, prefixed `rubli-`, e.g. `rubli-3f9c…`. No account is needed.

**B. Dead-man switch (2 min).** Sign up at healthchecks.io (free: 20 checks). Create:
- `rubli-uptime`: period **5 min**, grace **10 min**
- `rubli-backup`: period **1 day**, grace **2 h**
- (pull mode) `rubli-pull`: period **1 day**, grace **1 day**

Under *Integrations*, keep email and add **ntfy** with the same topic. Copy each check's ping URL.

**C. VPS config (1 min)**, after §4:
```bash
install -m 600 /opt/rubli/scripts/rubli-ops.env.example /etc/rubli-ops.env
nano /etc/rubli-ops.env            # RUBLI_OFFSITE, RUBLI_NTFY_TOPIC, RUBLI_HC_BACKUP_URL, RUBLI_HC_UPTIME_URL
install -m 644 /opt/rubli/scripts/rubli-ops.cron /etc/cron.d/rubli-ops
bash /opt/rubli/scripts/uptime-check.sh && echo uptime ok         # healthchecks shows "up"
nohup bash /opt/rubli/scripts/offsite-backup.sh >> /var/log/rubli-ops.log 2>&1 &   # first copy, ~5–10 min
# afterwards: bash /opt/rubli/scripts/restore-test.sh   → RESTORE OK … contracts=3178884
```

**D. Pick ONE destination (`RUBLI_OFFSITE`).**

- **`pull`, the default.** No new account. The copy lands on your PC. Set up a Windows scheduled task once:
  ```
  setx RUBLI_HC_PULL_URL https://hc-ping.com/<rubli-pull uuid>
  schtasks /Create /SC DAILY /ST 10:00 /TN RUBLI-pull-backup /TR "pwsh -NoProfile -File D:\Python\yangwenli\scripts\pull-backup.ps1"
  ```
  The PC must be on on most days. It uses your existing root SSH key.
- **`rclone`.** Survives the loss of both VPS and PC. **Backblaze B2** (10 GB free, keep 3) is the simplest:
  1. Create a B2 account, then a private bucket `rubli-backups`, then an application key limited to that bucket.
  2. On the VPS: `apt-get install -y rclone && rclone config`:
     - new remote `b2` (type `b2`, keyID + appKey)
     - new remote `rubli` (type `crypt`, remote `b2:rubli-backups`, generated password)
  3. **Save the crypt password in your password manager.** If it is lost, the backups are unreadable. Encryption matters because the DB holds user emails.
  4. In `/etc/rubli-ops.env`: `RUBLI_OFFSITE=rclone`, `RUBLI_RCLONE_REMOTE=rubli:db`, `RUBLI_OFFSITE_KEEP=3`.

  Google Drive (15 GB) works the same way, but the headless VPS needs `rclone authorize "drive"` run on the PC. OneDrive's free tier is 5 GB, so use `RUBLI_OFFSITE_KEEP=2`.

You can run both: set `rclone` on the VPS and still schedule the PC pull. The staged file stays on the VPS either way.

## 6. Testing the scripts

`bash scripts/test-ops-backup.sh` runs locally with no network or prod access. It needs bash, sqlite3, zstd and sha256sum. It builds a tiny WAL DB and checks four things:
- `offsite-backup.sh --dry-run` snapshots and stages it.
- `restore-test.sh` round-trips the copy (integrity_check, count = 3).
- A valid `LAST_BACKUP.json` makes the script reuse the nightly.
- A corrupted copy and a bad mode both fail.

`shellcheck scripts/{ops-lib,offsite-backup,restore-test,uptime-check,test-ops-backup}.sh` reports no findings.
