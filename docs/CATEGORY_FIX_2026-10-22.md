# Category fix: APP/PPS concessions out of Material de Curación (2026-10-22)

Owner-approved 2026-10-22. Follows `docs/CATEGORY_AUDIT_2026-10-22.md` § 4, with the road exemption and a services guard. The optional changes (salud fallback 22 → 89, coal rule) were NOT applied.

## 1. Rule

`backend/scripts/classify_categories.py`: new `APP_CONCESSION` regex (the audit's pattern) plus `APP_NOT_WORKS` (`supervis|analisis`). In `classify_text` the APP check runs only after every specific pattern and every broad pattern, i.e. it only rescues rows that would otherwise hit the sector fallback. So:

- Road concessions keep 27: the road pattern is specific and wins first. The audit's naive placement (inside the 26 regex) would have moved 39 road APP contracts (6.2B).
- APP services keep their broad match (testigo social, bases de licitación, "calendarios con APP" stay in 91/88). The naive placement would have moved 23 such rows (0.15B).
- Supervision or analysis of an APP is not the works ("SUPERVISION PPS TAPACHULA" stays 88).

Tests: `backend/tests/test_classify_categories_app.py`.

## 2. Rows moved (local, applied)

Dry run of the new `classify_text` over every contract whose title contains app / pps / asociaci (the rule reads the title only, so this is complete), cucop rows excluded: exactly 4 moves, 49.03B MXN. gap_contracts: 0 moves.

| contract id | old → new | MXN | vendor_id | title |
|---|---|---|---|---|
| 1765741 | 22 fallback → 26 regex | 14,103,415,302.87 | 196903 | DC18APP001 - TEPOTZOTLÁN, ESTADO DE MÉXICO |
| 1520073 | 22 fallback → 26 regex | 13,905,061,499.90 | 196903 | DC17APP0071 - GARCÍA, NUEVO LEÓN -APP |
| 1519807 | 22 fallback → 26 regex | 11,143,423,653.11 | 196891 | DC17APP0054 - Tapachula, Chiapas |
| 1520436 | 22 fallback → 26 regex | 9,876,876,867.00 | 196891 | DC17APP0057- BAHÍA DE BANDERAS, NAY - APP |

None has cucop data (`cucop_capitulo` NULL), so no cucop re-apply is needed. Old values are logged in `category_reassignments_20261022` (reversible, SQL in `fix_rows.sql`).

## 3. Verification (local)

`category_stats` before (kept as `_category_stats_backup_20261022catfix`) → after:

| Category | Contracts | Total MXN | Top vendor |
|---|---|---|---|
| 22 Material de Curación | 344,530 → 344,526 | 442.31B → 393.28B (−49.03B) | Grupo Constructor Marhnos → Baxter (14.04B, 3.57%) |
| 26 Construcción de Edificios | 134,749 → 134,753 | 1,217.12B → 1,266.15B (+49.03B) | Operadora CICSA (unchanged); Marhnos now #3 (28.01B), PRODIMSA #5 (21.10B) |
| 27 Carreteras y Vías | 70,101 → 70,101 | 590.41B → 590.41B (0) | APP Arriaga-Tapachula (unchanged) |

- `category_vendor_topn` for 22: Baxter, Laboratorios Pisa, Farmacéuticos Maypo. Neither Marhnos nor PRODIMSA.
- Grand total of `category_stats` unchanged (9,579.9B): money only moved between categories.
- `category_sexenio_flows`: 22 = 393.27B, 26 = 1,238.29B (dated rows only), 27 = 590.29B.
- Contracts > 100B MXN: 0. The reject rule is untouched; the fingerprint and every precompute keep the `<= 100B` cap.

Precomputes re-run (local). The chain ran on a scratch copy (`_scratch/catfix_scratch.db`) and was swapped in with `scripts.swap_category_precomputes --suffix 20261022catfix --apply` (each live table backed up as `_<table>_backup_20261022catfix`; swap took 9 s). Step durations, on a disk shared with a deploy job (expect much less on an idle disk):

| Step | Duration |
|---|---|
| compute_category_stats | 1 h 44 min |
| _precompute_category_cohort_counts | 1.5 min |
| _refresh_category_avg_risk | 2 min |
| _fix_category_accents | < 1 s |
| _precompute_category_top_vendors | 1 min |
| precompute_institution_categories | 22 s |
| _precompute_category_enrichments | 1 min |
| compute_subcategory_stats | 3 min |
| _precompute_category_signals | 14 min |
| _precompute_atlas_cohort_periods | 3 h 15 min (disk contention) |
| precompute_category_sexenio (on live, _new + rename) | 28 min |

The first chain attempt failed at `precompute_institution_categories`: on ui/v1-contrato, `backend/scripts/_institution_canonical.py` (fd1316ea) emitted `WHERE c.COALESCE(amount_mxn, 0)`, a syntax error. origin/main and prod have the correct form. The file is now byte-identical to origin/main, with a regression test (`backend/tests/test_institution_canonical_cap.py`).

## 4. Prod replay

Prod is rescored with v0.9.2 tonight, so precompute tables built from the local (v0.9.1) DB would be stale: the package ships ONLY the 4-row fix, and the precomputes are rerun on prod after the rescore swap.

Package: `_scratch/batch_catfix/` (stdlib only).

- `out/fix_rows.sql`: creates `category_reassignments_20261022`, logs the old values, moves the rows still at 22/fallback to 26/regex. Idempotent. Unary `+` on `category_id` keeps the planner on the PK; without it SQLite scans `idx_c_cat_amount` (all ~344k rows of category 22, over 10 min on a cold disk).
- `out/MANIFEST.json`: sha256 of `fix_rows.sql`.
- `apply_package.py`: checks the sha, asserts the 4 ids exist with the expected amounts, runs the SQL in one `BEGIN IMMEDIATE` transaction (busy_timeout 600000), asserts all 4 at 26.
- `RUNBOOK.md`: the prod steps below.

Tested on a scratch copy with the 4 rows reverted: 2.2 s, all four at (26, 'regex'), 4 rows logged; a second run changes nothing.

Prod steps (backend container, `/app`):

1. Rows, any time (if the rescore job works on a prod copy taken earlier, apply to that copy too, or again after the swap; it is idempotent):

   ```sh
   python /path/batch_catfix/apply_package.py --db /app/RUBLI_DEPLOY.db --dry-run
   python /path/batch_catfix/apply_package.py --db /app/RUBLI_DEPLOY.db
   ```

2. AFTER the v0.9.2 rescore swap (the precomputes read risk_score), rerun what was rerun locally:

   ```sh
   cp /app/RUBLI_DEPLOY.db /tmp/cat_scratch.db
   sh scripts/category_precompute_chain.sh /tmp/cat_scratch.db      # ends with CHAIN_DONE
   python -m scripts.swap_category_precomputes --live /app/RUBLI_DEPLOY.db --scratch /tmp/cat_scratch.db --suffix 20261022catfix
   python -m scripts.swap_category_precomputes --live /app/RUBLI_DEPLOY.db --scratch /tmp/cat_scratch.db --suffix 20261022catfix --apply
   python -m scripts.precompute_category_sexenio --db /app/RUBLI_DEPLOY.db   # not in the chain
   rm /tmp/cat_scratch.db
   ```

   The chain is compute_category_stats, _precompute_category_cohort_counts, _refresh_category_avg_risk, _fix_category_accents, _precompute_category_top_vendors, precompute_institution_categories, _precompute_category_enrichments, compute_subcategory_stats, _precompute_category_signals, _precompute_atlas_cohort_periods. The swap backs up each live table as `_<table>_backup_20261022catfix` and replaces the `category%` keys in `precomputed_stats`.

3. Restart the backend (API cache), then check: category 22 top vendor is Baxter (vendor id 5319) at 14.05B, not Marhnos or PRODIMSA; category 22 total 407.7B; 22 down and 26 up by 49.03B relative to each other's pre-fix values; 27 unchanged by the fix.

   Expected values updated 2026-10-23: prod's `category_stats` now include the ComprasMX rows, so 22 totals 407.7B (Baxter 14.05B). The 393.28B / 14.04B in § 3 are the local pre-ComprasMX figures.

Not needed: `classify_gap_categories` (0 gap rows change), `cucop_classify` (no cucop data on the 4 rows), a full reclassification, `precompute_captura` (no category_id).

The classifier change (`backend/scripts/classify_categories.py`) must reach main so a future full reclassification keeps these rows in 26. Prod runs origin/main, whose `_institution_canonical.py` is already correct.

Rollback: `UPDATE contracts SET category_id = r.old_category_id, category_source = r.old_category_source FROM category_reassignments_20261022 r WHERE contracts.id = r.contract_id;` then rerun step 2. Locally, the pre-swap tables are kept as `_<table>_backup_20261022catfix`.

## 5. Files

- `backend/scripts/classify_categories.py`: `APP_CONCESSION` + `APP_NOT_WORKS`, checked after the broad patterns in `classify_text`.
- `backend/tests/test_classify_categories_app.py`: bare APP folio → 26, road APP → 27, curación → 22, servicios integrales → 24, APP services stay in 88/91.
- `backend/scripts/_institution_canonical.py`: reset to origin/main (fixes the ui-v1 SQL error). `backend/tests/test_institution_canonical_cap.py`: regression test.
- `backend/scripts/swap_category_precomputes.py`: busy timeout 120 s → 600 s.
- Local DB: `category_reassignments_20261022` (4 rows), `_<table>_backup_20261022catfix` tables.
