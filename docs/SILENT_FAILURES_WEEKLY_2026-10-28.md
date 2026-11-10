# Silent-failure review: weekly ComprasMX refresh (2026-10-28)

Scope: `comprasmx_weekly.py` and every step it runs, `stats.py` (`_weekly_status`, `/data-cut`), `sexenio_actual.py`,
the VPS wrapper `/usr/local/bin/rubli-weekly.sh` and `rubli-weekly.timer/.service`. Read from origin/main; prod evidence
from `/var/lib/rubli-db/WEEKLY_REFRESH.json` and `weekly/run_*.log` (read-only).
Today the only failure surface is `systemctl --failed` and a log file nobody tails: no `OnFailure=`, no mail, no ping.
`_v10/` and `_v09/` below are repo-root dirs (mounted as `/w/_v10`).

## Minimal alert (covers most findings)
1. Dead-man switch: at the end of `main()`, only when `result == "ok"` and `soft_failures == []`, `curl -fsS $HC_URL`.
   The wrapper curls `$HC_URL/fail` when `docker run` exits non-zero. Silence for more than 8 days also pages
   (covers a dead timer, a stale lock, a killed container).
2. `OnFailure=rubli-weekly-alert.service` on the unit (same curl).
3. Put `last_attempt`, `last_result`, `soft_failures` in WEEKLY_REFRESH.json and `/stats/data-cut` (today only `last_ok`).

## BLOCKER

### B1. A failed run swallows its own backlog; the next quiet run reports success
`comprasmx_weekly.py:135-140`. `new_staged` is the staging delta of this run's ETL. If a run dies after the ETL (link,
resolve, integrate, score), the rows are already staged. Next run stages 0 new rows, prints "nothing new", advances
`last_ok` (line 138) and stops. Staged-but-never-integrated contracts stay out of `contracts` until ComprasMX publishes
something new. Same hole for contracts `integrate_comprasmx.py:135-137` defers on purpose (a later weekly run loads it once
dated): a quiet week never loads them. It already happened: the 2026-10-28 prod status shows `new_staged: 0` with
`new_contracts: 2285` (runs 1 and 2 died at `exchange_rates` and `rapidfuzz`, the third needed `--force`).
Fix: skip only when `new_staged == 0` AND no staged row lacks a `contracts` row (`contract_number = codigo_contrato`) or waits for a date.

### B2. A stale lock after a crash blocks every later run and records nothing
`comprasmx_weekly.py:108-111, 187`; wrapper uses `docker run --rm`. `finally` removes the lock only if Python unwinds.
OOM kill, `docker kill`, reboot, the 8 h `TimeoutStartSec` leave `WEEKLY_REFRESH.lock` on `/var/lib/rubli-db`. The stored
PID is a container PID, so there is no liveness check. Every later Sunday hits `sys.exit("another refresh holds ...")`
before any `save()`: exit 1, one line in a log, WEEKLY_REFRESH.json untouched, site shows the old `last_ok`. The refresh is
dead and looks healthy. (No lock on prod now, checked.)
Fix: `fcntl.flock` on an open fd (kernel frees it on death) instead of an O_EXCL file; write `last_attempt` and `result="LOCKED"`
to the status before exiting.

### B3. `result: "ok"` with failed soft steps; failures invisible; stale derived tables served
`comprasmx_weekly.py:152-171, 180-183`. Soft steps only land in `soft_failures`, which no code, API or alert reads. Live
example in the current "ok" status: `precompute_atlas_sky --years-backfill` rc 1 (`AssertionError: 1 contracts with no
year`, `precompute_atlas_sky.py:679`): atlas year tables keep last week's numbers while `data_cut` and `last_ok`
advance. Any failed soft step leaves the previous `precomputed_stats` row served with no staleness marker.
Fix: `result = "ok_soft_failures"` when the list is non-empty, `last_ok` only for a clean run, ping the fail URL; fix the
NULL-year contract that trips the atlas guard.

## SHOULD

### S1. Cut date advances on staging, not on loaded data
`stats.py:848-863`, `precompute_sexenio_actual.py:98-104`, `precompute_recent.py:29`. Cut = `MAX(fecha_publicacion)` of
`comprasmx_contracts`, which moves as soon as the ETL stages. If link/integrate/score fail, the site claims the new cut
while `contracts` lacks the rows, and `/sexenio-actual` compares a thin current window against full AMLO/Pena windows of
the same N days. One future-dated publication string also inflates the window; no sanity bound.
Fix: take the cut from `MAX(contract_date) FROM contracts WHERE source_structure='E'`; reject cut > today + 1.

### S2. Zero-row, truncated or wrong download is not told apart from "nothing new"
`etl_comprasmx_contratos.py:142-155, 185`. Content-Length is checked only if the server sends it; no minimum size or row
count. A header-only or truncated file gives "0 new" and B1 marks the week fresh. The HTML error page is caught only by
`assert len(header) == 73` (an assert, stripped under `python -O`; a wrong CSV with 73 columns passes). The download
overwrites last week's CSV in place, so a crash mid-write leaves a truncated file.
Fix: raise unless rows are at least 95% of the previous staged rows for that year; write `.part` then `os.replace`.

### S3. `INSERT OR IGNORE` never refreshes a changed contract
`etl_comprasmx_contratos.py:177`. Amount corrections, cancellations, late signature dates are ignored forever, and
integrate dedupes on amount/vendor, so a corrected amount is never re-loaded. Fix: compare `importe_drc` and
`estatus_contrato` for existing codes and log or update the delta.

### S4. Unconvertible or rejected amounts load as 0 without an alert
`etl_comprasmx_contratos.py:94,96` NULL the amount; `integrate_comprasmx.py:67,128` turn NULL into 0.0 and load the
contract. 79 `fx_missing` rows in the latest log. The `reject_100b` counter (integrate:132) can never fire because the
ETL already NULLed those. Rejected rows become zero-value contracts that dilute totals and the direct-award share.
Fix: skip `amount_flag in ('reject','fx_missing')` in integrate and put the counts in status.

### S5. Partial writes without a transaction
- `_v10/build_v10.py:361-374`: DROP TABLE contract_features_v10, CREATE, INSERT with a commit per 100k rows. A kill
  (deploy, OOM, timeout) leaves a missing or partial table. `_v10/score_v092.py:35-37` joins on it and scores only rows
  that have features; the HR guard (line 76) passes on a partial set and the rest keep old scores.
  Fix: build a `_new` table and rename in one transaction; assert scored rows cover 98% of valid-amount contracts.
- `link_comprasmx_contracts.py:139-144`: commit every 20k rows; a crash leaves rows half linked and (B1) no rerun happens.

### S6. Score guards are narrow
`_v10/score_v092.py:69,76,84-85`. The intercept/c_pu guard checks the model file only; HR is computed over the scored set,
not the new E rows. `unscored_valid_E` is recorded (`comprasmx_weekly.py:179`) but never gated. The `_risk_pre_v092`
snapshot is dropped and rebuilt every run, so a rerun after a bad write destroys the rollback source.
Fix: fail the run if `unscored_valid_E` is above 0; keep a dated snapshot table.

### S7. Status file written non-atomically
`comprasmx_weekly.py:62-63, 43-52`. `write_text` over WEEKLY_REFRESH.json: a kill truncates it, `_last_ok` turns the
ValueError into None, and the site loses its "last updated" (`stats.py:827` returns an empty dict). A crashed run leaves
a status with no `result` and no `finished`, identical to "in progress" forever.
Fix: temp file + `os.replace`; add a per-step `heartbeat`.

### S8. The container survives a deploy, the code under it does not
The wrapper mounts `/opt/rubli:/w`; `deploy-safe.sh` updates that checkout while a run (about 6 h on 2026-10-28) is in
flight. Each step is a fresh `python`, so steps can run mixed code versions, and the model artifact
`_v10/rematch_result.json` can change between the dry score and the write.
Fix: wrapper copies a snapshot of the repo at start and mounts that, or the deploy refuses while `rubli-weekly` is up.

### S9. ARIA warnings that change results are ignored
Run log 2026-10-28: `CENTINELA: 3 stale registries (SFP Sanctioned Providers, RUPC Vendor Registry, ASF Audit Findings)`
and `contract_z_features is empty - skipping z-feature enrichment`. ARIA exits 0 with stale sanction inputs.
Fix: print a `STALE_INPUT` marker and have the runner count it as a soft failure.

### S10. 5 s SQLite timeout on hard steps
`integrate_comprasmx.py:109` and `resolve_comprasmx_vendors.py:236` use plain `sqlite3.connect(db)` while the API and
other crons share the DB; a transient "database is locked" is a HARD_FAIL for the whole week (and B1/B2 then hide it).
Fix: `timeout=600`. Also the wrapper guards only its own container; aria-cron/backup cron overlap is unverified.

## NIT
- N1. `comprasmx_weekly.py:96`: keep-2 glob `rubli_weekly_*.db` ignores the -wal/-shm files the backup leaves (seen on
  prod). A failed quick_check leaves the bad copy, newest, which evicts a good one.
- N2. `comprasmx_weekly.py:40`: `datetime.utcnow()` is deprecated; `date.today()` (line 89) is container-local time.
- N3. `link_comprasmx_contracts.py:32-34`: import chain to `rapidfuzz` already killed the 2026-10-28 run. Run each step's `--demo` first.
- N4. `integrate_comprasmx.py:90` uses a greater-or-equal test for `is_high_value`, line 140 a strict one for the flag.
- N5. `integrate_comprasmx.py:126`: an unresolved RFC defaults to `new_badrfc` (new vendor row); a resolve gap silently
  creates duplicates. Print the count.
- N6. `sexenio_actual.py:18-24`, `precompute_recent.py`: a five-week-old stats row looks like a fresh one. Alert when `updated_at` is older than 9 days.
- N7. `etl_comprasmx_contratos.py:164-168`: silent fallback to `_FALLBACK_RATES`; log which table was used.
- N8. Wrapper `sh -c "python ... > LOG"`: sh is PID 1 and ignores SIGTERM, so a systemd stop leaves the job running. Use `exec python`.

## Fine as is
`score_v092` writes in one `BEGIN IMMEDIATE` with snapshot and rollback mode; `integrate_comprasmx` applies in one
transaction; hard steps abort the chain and write `FAILED at <step>`; `refresh_risk_stats.py` is atomic; the length check
works when Content-Length is sent; `_weekly_status` drops `next_update` once its date has passed.
