# Weekly job pre-flight — first unattended run, Sun 2026-11-01 04:00 UTC

Checked 2026-10-30 against prod (read-only) at `/opt/rubli` = `a94703f9`, plus `origin/main` and the pending branches.
Script: `backend/scripts/comprasmx_weekly.py`. Branch with the fix: `fix/weekly-preflight`.

## Verdict: GO

Two conditions:

1. **Deploy freeze Sat 2026-10-31 23:00 to Sun 2026-11-01 08:00 UTC.** No `git push prod`, no manual prod jobs, no data loads in that window.
2. **Recommended before Sunday:** install the wrapper from this branch (`scripts/rubli-weekly.sh`). It restarts the backend after a run that loaded rows. Without it, the category covers keep serving last week's numbers until the next deploy. The run itself is fine without it.

## 1. Trigger, image, code

| Item | Value (verified on prod) |
|---|---|
| Trigger | systemd `rubli-weekly.timer`, `OnCalendar=Sun *-*-* 04:00:00 UTC`, `Persistent=true`. Next run: Sun 2026-11-01 05:00 CET = 04:00 UTC. No root crontab. |
| Unit | `rubli-weekly.service`, oneshot, `ExecStart=/usr/local/bin/rubli-weekly.sh`, `TimeoutStartSec=8h` |
| Wrapper | `/usr/local/bin/rubli-weekly.sh` (was not in git, now `scripts/rubli-weekly.sh` on this branch) runs `docker run --rm --name rubli-weekly --user 100:101 --cap-drop ALL --read-only --tmpfs /tmp`, image **`rubli-job:pandas`** (6603c7e8, 2 days old) |
| Code | **not baked into the image.** `/opt/rubli` is mounted read-only at `/w`, so the job runs whatever commit `/opt/rubli` holds at 04:00, and every later step re-reads it (see § 4) |
| Mounts | `/var/lib/rubli-db` → `/app/data` (live DB dir, same dir the backend mounts, so the WAL and shm are shared correctly); backups volume → `/backups` |

**Imports.** All 39 step modules were imported for real (`import scripts.X`) in `rubli-job:pandas` with `--network none --read-only --user 100:101`, against the deployed tree. All of them import. `pandas`, `numpy`, `scipy`, `openpyxl` and `fastapi` (covers) are present. The only "failures" were `_add_perf_indexes` and `_v09/.../refresh_risk_stats.py`, which run on import and failed only because no DB was mounted. That is expected. `build_v10.py` and `score_v092.py` `--help` rc 0. `_comprasmx/link_entities.py`, `_v10/rematch_result.json` and `_v09/v091/prod/refresh_risk_stats.py` exist and are tracked.

Static flags were false positives: `tqdm` and `psutil` are optional or Windows-only fallbacks, and `msvcrt` is Windows-only.

**Read-only root fs:** the only step writing into the code tree (`compute_subcategory_stats` → `_subcategory_results.json`) already swallows EROFS (fixed after the 10-28 rerun hit it). The new steps (covers, sector concentration, budget visibility, newtabs, recent, events, vendor_year) write the DB only.

**Pending `precompute_vendor_year`** is on `origin/feat/vendor-list-sparkline` (step line + script on the same branch, stdlib only, build-then-rename in one `BEGIN IMMEDIATE`). It is not on main, so Sunday's run will not call it. If it merges before Sunday, the script ships with it, which is fine. Don't cherry-pick the step line alone.

## 2. Steps, runtime, memory, live writes

Order (hard = run aborts, `last_ok` kept): backup → etl (download) → link → resolve → integrate → classify institutions → features v10 → score dry → score write → coverage check → stats tables → risk stats are **hard**. Then 27 **soft** steps (logged, chain goes on): ARIA, category chain (10 scripts), precompute_stats, yearly rankings, sector largest/vendors, institution top/register, concentration, **sector_concentration**, institution lens, scorecards, official profiles, slow endpoints, cohort periods, captura, atlas sky + years backfill, category_sexenio, **category_covers**, recent, events, **newtabs**, sexenio_actual, **budget_visibility**. Then perf indexes (hard), drop the RFC map, `wal_checkpoint(TRUNCATE)`.

**Runtime estimate ≈ 1 h 55 min (done ≈ 06:00 UTC).** Based on the 10-28 run (07:27 → 09:07 UTC, 100 min, 2,285 new contracts) plus tonight's additions:

| Block | Measured |
|---|---|
| backup (sqlite backup API, 8.9 GB) | ~18 min |
| etl download 2 CSVs (262 MB) | 164 s |
| link / resolve / integrate / classify | 306 + 13 + 42 + 2 s |
| features v10 / score dry / score write | 510 / 175 / 393 s |
| stats + risk stats | 87 s |
| ARIA | 401 s |
| category chain | 657 s |
| precompute_stats | 944 s |
| the other soft steps (10-28) | ~22 min |
| **new:** covers / sector concentration / newtabs / recent+events / budget visibility | 187 s / ~150 s / ~120 s / ~6 s / short |

`TimeoutStartSec=8h` leaves a big margin.

**Memory.** VPS 12 GB, 8 GB available now. Backend cap 4.5 GiB. **The job container has no memory cap.** The 10-28 run finished uncapped with no OOM. Low risk, but if it ever spikes, the kernel OOM killer may pick the backend. Don't add a cap blind: atlas sky has its own cgroup gate and has never been measured under one. Check `dmesg` Sunday (below).

**Writes while the site serves.** Yes, and that is safe now: the DB is directory-mounted (since the 10-26 incident), so the job and the backend share one WAL and one shm on the host. Readers never block. The long write transactions (score write, ARIA) can make a rare backend write (watchlist) wait or hit `busy`. The WAL can grow during the run; the final `TRUNCATE` checkpoint shrinks it.

**Stale in-process caches.**
- `GET /categories/{id}/cover`: `_cover_cache` is a plain dict per process with no TTL. The code comment says "a weekly refresh shows after the next restart/deploy". **Nothing restarts the backend after the job**, so covers stay at last week's numbers until someone deploys. Same for `_cut_cache` (data cut) and the many plain-dict caches in `analysis*.py`.
- `/sectors/{id}/concentration-history`: 2 h TTL, refreshes by itself.
- **Fix (this branch):** `scripts/rubli-weekly.sh` adds a `docker restart rubli-backend` when the run ended `ok` / `ok_soft_failures`. It takes the deploy flock (`/opt/rubli/.deploy.lock`, waits ≤ 600 s), so it never collides with a deploy. It costs about 1 min of 502 around 06:00 UTC Sunday (boot scan 30–60 s). The uptime cron skips rounds while the lock is held and needs 2 failures in a row, so it won't page. There is no restart on `nothing new` or failures.

Install (owner or deploy session, after this branch is on main and checked out on the VPS; never scp, CRLF gotcha):
```sh
install -m 755 /opt/rubli/scripts/rubli-weekly.sh /usr/local/bin/rubli-weekly.sh
diff <(git -C /opt/rubli show HEAD:scripts/rubli-weekly.sh) /usr/local/bin/rubli-weekly.sh && echo same
```

## 3. Failure handling

- **Logs:** `/var/lib/rubli-db/weekly/run_<YYYYmmdd_HHMM>.log` (host-side, chmod 640). Status: `/var/lib/rubli-db/WEEKLY_REFRESH.json` (`result`, `steps[].rc/s`, `soft_failures`, `last_ok`). The site reads it through `GET /api/v1/stats/data-cut` (`weekly_status` ok|degraded|failed).
- **Alerts:** `/etc/cron.d/rubli-ops` → `/usr/local/lib/rubli-ops/uptime-check.sh` (installed 10-30 07:04 from `ops/backup-alerting`) every 5 min. It pushes to ntfy (topic in `/etc/rubli-ops.env`) **once per failed run**: unit result ≠ success (includes the 8 h timeout and a killed container) or `result` starting with `FAILED`.
  - **Gap 1:** `ok_soft_failures` is not alerted. A soft step can fail silently and the site will say «actualización parcial». Suggested one-line change for the alerting owner (`ops/backup-alerting`, `scripts/uptime-check.sh` line 30): also match `wk_json = ok_soft_failures` (with a lower priority).
  - **Gap 2:** no dead-man ping. `RUBLI_ALERT_URL` is not passed to the container, so a timer that never fires is silent. Low risk for Sunday (timer verified listed and enabled). Check the log by hand.
- **Disk:** `/` has **50 GB free** (not 28; 143/193 GB used). DB 8.9 GB. The run adds one 8.9 GB weekly backup (keeps the 2 newest: 10-28 + 11-01, so nothing is deleted this time) plus ~0.3 GB of CSVs → ~41 GB free after. The backups volume holds 49 GB (3 nightlies, 2 manual `pre_*` 10-29 copies, weekly 10-28). `/var/lib/rubli-db` holds two more 8.7 GB copies (`pre_idx_20261030`, `pre_squash_20261028_1645`). These are cleanup candidates for the owner, not needed for Sunday.
- **Known soft failure from 10-28:** atlas sky `--years-backfill` asserted "1 contracts with no year". Row 3238106 was fixed by hand, and `integrate_comprasmx` now skips NULL-year rows (line 132). It should pass Sunday. If it fails again, it is the same check.

## 4. Deploys during the run

- The job's container survives backend recreates (own `docker run`, no compose label). That part of the gotcha is solved.
- **But** `deploy-safe.sh` does `git reset --hard origin/main` in `/opt/rubli`, which the job reads live through `/w`. A deploy mid-run means later steps run new code against a half-refreshed DB, and a file can be caught mid-rewrite. The recreated backend also does its 3.1M-row boot scan in the middle of the job's heavy IO.
- **Freeze Sat 23:00 → Sun 08:00 UTC** (job ≈ 04:00–06:00 + restart + margin). The nightly backup at 02:00 UTC (done ≈ 02:20) falls inside and does not conflict.

## 5. Local tests

- `DATABASE_PATH=backend/RUBLI_NORMALIZED.db python -m pytest backend/tests/test_comprasmx_weekly.py` on `origin/main`: **10 passed** (3.9 s).
- `--dry-run` locally did not finish in 580 s. It prints nothing until the end, and the cold D: scans plus the 262 MB single-GET download are slow. Not a prod signal: prod downloads both files in 164 s. Note: `--dry-run` is not write-free. It takes `WEEKLY_REFRESH.lock` and overwrites `WEEKLY_REFRESH.json` with `result: dry-run`. **Don't dry-run on prod before Sunday:** it would replace the status the site reads (it keeps `last_ok`, but `weekly_status` disappears). It also left an empty `backend/WEEKLY_REFRESH.lock` locally, which is harmless and can be deleted.

## Sunday morning checklist (after 08:00 UTC)

```sh
ssh root@37.60.232.109
systemctl status rubli-weekly.service --no-pager | head -8          # Result: success, exit 0
ls -t /var/lib/rubli-db/weekly/run_*.log | head -1                  # newest log
tail -5 "$(ls -t /var/lib/rubli-db/weekly/run_*.log | head -1)"     # "done · cut … · soft failures []"
grep -nE "Traceback|HARD_FAIL|FAILED" "$(ls -t /var/lib/rubli-db/weekly/run_*.log | head -1)" | head
python3 -c "import json;d=json.load(open('/var/lib/rubli-db/WEEKLY_REFRESH.json'));print(d['result'],d.get('new_contracts'),d.get('data_cut'),d.get('soft_failures'));[print(s) for s in d['steps'] if s['rc'] or s['s']>600]"
curl -s https://rubli.xyz/api/v1/stats/data-cut | head -c 400; echo  # weekly_status ok, weekly_finished 2026-11-01
curl -s https://rubli.xyz/api/v1/health | head -c 300; echo         # status ok, db_connected true
ls -la /var/lib/docker/volumes/rubli_rubli_backups/_data/rubli_weekly_*.db   # 20261101 present
ls -la /var/lib/rubli-db/RUBLI_DEPLOY.db-wal                         # small (TRUNCATE ran)
df -h / | tail -1                                                    # ≈ 41 GB free
dmesg -T | grep -iE "oom|killed process" | tail -3                   # nothing
docker ps --format "{{.Names}} {{.Status}}"                          # rubli-backend restarted ~06:00 if wrapper installed
tail -5 /var/log/rubli-ops.log
```

If `result` is `FAILED at <step>`, the steps before it have committed. The backup `rubli_weekly_20261101.db` was taken before the etl. The script is built to be re-run (etl `INSERT OR IGNORE`, link `UPDATE`, integrate loads only unseen contracts, and `pending_load` picks up a backlog): `systemctl start rubli-weekly.service` (only outside the freeze, and with no deploy running).
If the wrapper was not installed and `result` is `ok*`, run `docker restart rubli-backend` so the category covers pick up the new numbers.
