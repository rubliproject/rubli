# Runbook — buyer-scope prod data step (ship/scope, 2026-10-23)

Plan `docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md` Phase 0–1. Numbers and the grade-change list: `docs/SCOPE_NUMBERS_2026-10-23.md` (§ 4a = what the regrade moves; owner approval recorded by the lead 2026-10-22 night).

**Sequence (lead, 2026-10-23): this step runs AFTER the v0.9.2 rescore swap and AFTER ship/rest's data steps are done and verified on prod.** Reasons: (a) the grades and `institution_year_value` read contracts, so they must see the final post-rescore, post-amount-fix table, or the regrade is stale on arrival; (b) step 4 rewrites `precomputed_stats` from the live contracts, so it belongs after ship/rest's downstream chain. If that chain runs `precompute_stats` *after* step 1 here, its run already carries `institutions_by_scope`, and step 4 shrinks to `precompute_sector_top_institutions`. Captura needs no rerun: its scope is applied at request time. The expected counts below were measured LOCALLY before v0.9.2. Buyer-level counts (step 1) must match exactly. Grade totals (step 2) may drift by a few institutions after the rescore/data steps; the letter grades themselves do not use the risk score (only the model-lens column does).

**Order: code first, data after, never during a deploy.** The ship/scope code is safe on a DB without the new columns: every scoped endpoint then answers `scope: "all"` with today's numbers. Deploy it with `bash /opt/rubli/scripts/deploy-safe.sh`, wait for it to settle, then run the data step below on a day with no other deploy.

Prod: `ssh root@37.60.232.109`, DB `/opt/rubli/backend/RUBLI_DEPLOY.db`, container `rubli-backend`, workdir `/app`. Every write goes through `docker exec rubli-backend` (single-file bind mount: WAL lives in the container, `gotcha_prod_db_singlefile_bindmount_wal`). Run each step `nohup … > /var/lib/rubli-jobs/scope_<n>.log 2>&1 &` (an ssh drop kills foreground runs). Check the log for its own success line, not just the `| tail` exit code.

Set once: `X="docker exec -w /app rubli-backend"` and `DB=/app/RUBLI_DEPLOY.db` (docker-compose.prod.yml mounts it there, `DATABASE_PATH=/app/RUBLI_DEPLOY.db`).

## 0. Before
- `.claude/ACTIVE_WORK.md`: no other writer on `institution_canonical`, `institution_grades_v3*`, `institution_year_value` or `precomputed_stats`.
- WAL checkpoint (`scripts/_wal_checkpoint.py` is hard-wired to RUBLI_NORMALIZED.db, so inline it): `$X python -c "import sqlite3; c = sqlite3.connect('/app/RUBLI_DEPLOY.db', timeout=600); print(c.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"` → expect `(0, 0, 0)`.
- Back up after the checkpoint: the host-side copy the deploy session normally takes (`cp /opt/rubli/backend/RUBLI_DEPLOY.db /var/lib/rubli-jobs/RUBLI_DEPLOY.pre_scope.db`). Disk is ~90 %; delete it once step 6 passes.

## 1. Column add + classify (seconds, small table)
```
$X python -m scripts.classify_buyer_scope --db $DB            # dry run: read it
$X python -m scripts.classify_buyer_scope --db $DB --write
$X python -m scripts.classify_buyer_scope --db $DB --write    # second run must print «wrote 0 rows»
```
The dry run must show: federal ≈ 438 · estatal ≈ 1,284 · municipal ≈ 1,740 · otro 0; `state_code coverage: 100.00%`; municipality ≈ 89.98 %; **8 override lines** (API BCS, API Veracruz, Agua de Hermosillo, IPICYT, UT León, UT Mixteca, UNAQ, IT El Llano); 32 `unmatched` = the «_Gobierno Municipal del Estado de X» pools. Prod ids should match local (same ETL). If the override count is not 8 or coverage is below 95 %, **stop** and report: prod's `institution_canonical` differs from local.

The script adds `buyer_level`, `state_code`, `municipality_code` and `idx_inst_canonical_scope`. It writes in 500-row transactions with busy_timeout 600 s.

## 2. Regrade under the FROZEN calibration (~2–5 min each)
```
$X python -m scripts.compute_institution_grades_v3 --db $DB --dry-run
$X python -m scripts.compute_institution_grades_v3 --db $DB
$X python -m scripts.compute_institution_grades_v3 --db $DB --sexenios
```
The log must say `using frozen calibration CAL-GV3-20261008060330` and `new=False`. **Never pass `--recalibrate`.** Expect 2,108 graded with A 217 · B 619 · C 742 · D 386 · F 144 (local). The sexenio replay writes 6,987 rows. A different total means prod contracts differ from local: report it and keep going only if the difference is small and explained.

## 3. institution_year_value (~1 min; it was stale since 2026-10-08)
```
$X python -m scripts.compute_institution_year_value --db $DB
```
It feeds the league's Hallazgos and the > 10B flag; `test_scorecards_field::test_field_v3_flag_columns` fails without it after the regrade.

## 4. Precomputes
```
$X python -m scripts.precompute_sector_top_institutions                        # ~1 min; reads DATABASE_PATH (set in the container)
$X python -m scripts.precompute_stats --db $DB                                  # long: full stats run
```
`precompute_sector_top_institutions` writes `sector_top_institutions` (federal), `:local` and `:all`. `precompute_stats` adds `institutions_by_scope` to `precomputed_stats['sectors']`. If the full precompute_stats run is too long for the window, use the standalone-container pattern (`gotcha_long_prod_jobs_survive_deploys`): run with `--out-db` to scratch, then copy only the `sectors` row back through `docker exec`. Until it runs, the sector agency count answers `institution_scope: "all"` (old figure, labelled honestly).

## 5. Restart + checkpoint
```
$X python -c "import sqlite3; c = sqlite3.connect('/app/RUBLI_DEPLOY.db', timeout=600); print(c.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"
docker restart rubli-backend
```
This turns over the in-process caches (field, sexenios, sectors, treemap, captura) and the sky ETag (now `…-y1-b1`).

## 6. Verify (curl https://rubli.xyz/api/v1/…)
| call | expect |
|---|---|
| `/sectors/1` | `statistics.institution_scope = "federal"`, `total_institutions = 259` (local figure) |
| `/sectors/1?scope=all` | `583` |
| `/atlas/sector-institutions?sector_id=1` | `scope = "federal"` |
| `/captura/plates` | `meta.scope = "federal"`, `meta.totals.pairs = 3749`, buyers 145 |
| `/scorecards/institutions/field?scope=all` | 2,108 rows; `?` (no scope) → federal rows only, `scope = "federal"` |
| `/scorecards/institutions/sexenios?scope=all` | 6,987 rows, `level` column present |
| `/atlas/sky/manifest` | `stars.lvl` present, same length as `stars.id` |
| `/institutions?per_page=1` | `filters_applied.scope = "federal"` |

Then `canary-watch` on /institutions, /sectors/1, /captura, / (El Mapa).

## Rollback
- Code: redeploy the previous BUILD_ID (deploy-safe.sh). The old code ignores the three new columns.
- Data: restore `/var/lib/rubli-jobs/RUBLI_DEPLOY.pre_scope.db` (backend stopped, atomic swap) (the grades are the only published numbers that move). The columns are additive, so they can stay even after a code rollback.
