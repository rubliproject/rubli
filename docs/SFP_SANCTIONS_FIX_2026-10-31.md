# SFP sanctions — date fix and prod runbook (2026-10-31)

Context: `docs/PROCUREMENT_LAW_STUDY_2026-10-30.md` § 3 and § 4.3.

## What was wrong

`scripts/load_sfp_sanctions.py` (loaded 2026-02-26 / 03-09):

1. `sanction_end` ← *fecha de resolución*, which precedes the notification. Every record "ended" on or before it began.
2. **PLAZO** (ban length) was dropped, so a ban window could not be computed. Any "contract during a ban" join overcounted ≈ 40× (≈ 10,900 contracts vs 246).
3. Dates were stored as `DD/MM/YYYY` text — not comparable with `contract_date`.
4. 544 rows from the SABG *servidores públicos sancionados* file (public officials, first names only) were appended to the supplier table.
5. 22 rows carried an RFC that `scripts/archive/fix_sfp_name_matching.py` had backfilled by fuzzy (Jaccard ≥ 0.80) name matching. The API then reported those as `match_basis: 'rfc'` — shown as identity-confirmed (critical) on vendor pages.

## What the fix does

- Loader stores ISO dates: `sanction_start` = notificación, `sanction_end` = notificación + plazo (NULL = fine, no ban), plus `resolution_date`, `plazo_text`, `plazo_months`, `expediente`.
- `save_to_db` rebuilds the table in one transaction (idempotent). The first run renames the old table to `sfp_sanctions_legacy` (rollback source). Only supplier records from the source CSV are reloaded — the 544 officials and the 22 fuzzy RFCs are not.
- Latest ban end in the registry (Jan-2021 snapshot): **2025-10-09** — no ban in it is current today.
- UI: contract banner no longer says «SFP Inhabilitado»; it shows «Sanción registrada por la SFP (inhabilitación del X al Y)» or «Multa registrada por la SFP (sin inhabilitación)». Vendor flags show the corrected window; ARIA memos say «Sanción registrada por la SFP … (registro histórico; no implica inhabilitación vigente)».
- The ban window is approximate at the edges: the law counts the term from the day after the DOF circular, not from notification; suspensions are not in this file.

## Prod steps (release captain, after Sun Nov 1 08:00 UTC)

Run in this order, one at a time. DB: `/var/lib/rubli-db/RUBLI_DEPLOY.db` (`/app/data` in `rubli-backend`).

```bash
# 0. Deploy the branch (merge to main → deploy workflow). The new API code reads the new
#    columns; until step 3 runs, SFP matches return empty (logged, no 500). Keep the gap short.

# 1. Full online backup (python3 on the host; disk is ~80 % full — check df first;
#    sfp_sanctions_legacy inside the DB is the quick rollback, this file the full one)
ssh root@37.60.232.109 "df -h /var/lib/rubli-db && cd /var/lib/rubli-db && python3 -c \"import sqlite3; s=sqlite3.connect('RUBLI_DEPLOY.db'); d=sqlite3.connect('RUBLI_DEPLOY.pre_sfp_20261101.db'); s.backup(d); print(d.execute('PRAGMA quick_check').fetchone())\""

# 2. Put the source CSV beside the DB (/app/data is the DB mount and shadows backend/data)
ssh root@37.60.232.109 "cp /opt/rubli/backend/data/proveedores_sancionados.csv /var/lib/rubli-db/ && chown 100:101 /var/lib/rubli-db/proveedores_sancionados.csv"

# 3. Checkpoint WAL, dry run, rebuild
ssh root@37.60.232.109 "docker exec rubli-backend python -c \"import sqlite3; print(sqlite3.connect('/app/data/RUBLI_DEPLOY.db').execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())\""
ssh root@37.60.232.109 "docker exec rubli-backend python -m scripts.load_sfp_sanctions --file /app/data/proveedores_sancionados.csv --db /app/data/RUBLI_DEPLOY.db --dry-run"
#    expect: 1954 records; 1520 with a ban (plazo); 1497 with a dated window
ssh root@37.60.232.109 "docker exec rubli-backend python -m scripts.load_sfp_sanctions --file /app/data/proveedores_sancionados.csv --db /app/data/RUBLI_DEPLOY.db"

# 4. Verify
ssh root@37.60.232.109 "python3 -c \"import sqlite3; c=sqlite3.connect('file:/var/lib/rubli-db/RUBLI_DEPLOY.db?mode=ro',uri=True); print(c.execute('select count(*), count(rfc), sum(plazo_months is not null), max(sanction_end) from sfp_sanctions').fetchone(), c.execute('select count(*) from sfp_sanctions_legacy').fetchone())\""
#    expect: (1954, 0, 1520, '2025-10-09') (2395,)

# 5. Restart the backend so api/sanctions.py rebuilds its in-process index
ssh root@37.60.232.109 "docker restart rubli-backend"
curl -s https://rubli.xyz/api/v1/vendors/296417/external-flags   # match_basis now 'name' / 'name_ambiguous', not 'rfc'
```

### Reruns needed

- **ARIA** — local dry run (read-only, TEMP-shadowed table): `is_sfp` 117 → 102 vendors. The 15 that lose it were matched only through the fuzzy-backfilled RFCs; their names do equal the registry after normalisation, but ARIA's raw `UPPER(TRIM())` name join cannot match «S.A. DE C.V.» vs «SA DE CV». **0 tier changes** (IPS recomputed from stored components, 416/416 tiers reproduced). Public-official rows matched no vendor. Rerunning ARIA is therefore optional; if it runs, `precompute_atlas_sky`, `precompute_captura`, `compute_ghost_confidence` follow (they read `aria_queue.is_sfp_sanctioned`). Follow-up worth its own delta: switch ARIA's SFP name match to `api/sanctions.normalize_name` so ARIA and the vendor page agree (≈ 1,146 strict name matches incl. ambiguous vs 117 today — that would move IPS).
- **Independent validation (SFP set)**: 101 vendors either way; contracts 2,442 → 2,178 (the old join counted each contract once per sanction record); avg score 0.223 → 0.227; ≥ 0.40 share 0.04 % → 0.05 %; ≥ 0.25 share 28.4 % → 31.0 %.
- **Memos**: only memos regenerated after this deploy get the new wording; already-stored memos keep «ALERTA: Sancionado por SFP — <tipo>». Regenerate the memos of SFP-flagged vendors (`python -m scripts.aria_generate_memos` for those IDs) if they are public.
- Nothing else reads the dates.

### Rollback

```bash
ssh root@37.60.232.109 "docker exec rubli-backend python -c \"import sqlite3; sqlite3.connect('/app/data/RUBLI_DEPLOY.db', isolation_level=None).executescript('BEGIN; DROP TABLE sfp_sanctions; ALTER TABLE sfp_sanctions_legacy RENAME TO sfp_sanctions; CREATE INDEX IF NOT EXISTS idx_sfp_sanctions_rfc ON sfp_sanctions(rfc); CREATE INDEX IF NOT EXISTS idx_sfp_sanctions_name ON sfp_sanctions(company_name); COMMIT;')\" && docker restart rubli-backend"
```
Revert the code commit as well (the old API selects only the old columns, so the new table also works with old code; the new code against the old table returns no SFP matches). Full fallback: `RUBLI_DEPLOY.pre_sfp_20261101.db`.
