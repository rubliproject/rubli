# RUNBOOK_SCOPE — buyer-scope prod data step (ship/scope)

**Runs AFTER the v0.9.2 rescore swap and AFTER ship/rest's data steps** (the grades must read the final contracts table; step 4's precompute_stats belongs after ship/rest's downstream chain).

Full procedure (exact commands, expected counts, verify table, rollback): `docs/RUNBOOK_SCOPE_DATA_2026-10-23.md`. Deploy the ship/scope code first. It is safe without the columns.

1. PROD step 1: `classify_buyer_scope --db <DEPLOY_DB>`. Run a dry run first and check coverage + the overrides (8; I said 9 earlier, corrected), then `--write`. Idempotent; adds 3 columns + an index.
2. PROD step 2: `compute_institution_grades_v3 --db <DEPLOY_DB>`, then `--sexenios`. Frozen calibration only; the owner OKs § 4a first.
3. PROD step 3: `compute_institution_year_value --db <DEPLOY_DB>` (stale, feeds Hallazgos and the >10B flag).
4. PROD step 4: `precompute_stats --db <DEPLOY_DB>` (sector institutions_by_scope) + `precompute_sector_top_institutions` (DATABASE_PATH env).
5. PROD step 5: restart the API so the field/sexenios/sectors/captura caches and the sky tag turn over.

Until step 1 runs, prod endpoints answer `scope: "all"` with the old numbers. Never falsely federal.
