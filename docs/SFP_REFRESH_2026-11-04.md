# SFP sanctions refresh 2019 → 2026 (DOF circulars) — local result + prod steps

Branch `data/sfp-refresh` · script `backend/scripts/refresh_sfp_sanctions.py` · tests `backend/tests/test_refresh_sfp_sanctions.py`.
Builds on `docs/SFP_SANCTIONS_FIX_2026-10-31.md` (ISO dates, end = start + plazo, `sfp_sanctions_legacy` rollback).

## Why

The SFP «Directorio de Proveedores y Contratistas Sancionados» CSV (`backend/data/proveedores_sancionados.csv`) stops in Jan 2021
and its open-data host no longer resolves. Every debarment is, by law, also published in the DOF as a «Circular por la que se
comunica … que deberán abstenerse de aceptar propuestas o celebrar contratos con …». The script reads the DOF's public SIDOF JSON
(day index + note body), parses subject, plazo, multa, expediente and OIC, and drops bans that a later «sin efectos» / nulidad
circular lifted.

**Known gap:** fines WITHOUT debarment are not published as circulars, so 2021+ multa-only sanctions are missing.

## Local result (2026-11-05, BROWN)

Cache `D:/Python/_sfp/dof` — 2,865 day indexes (2019-01-01 → 2026-11-04) + 1,183 note bodies.

| | rows |
|---|---|
| DOF debarment rows | 1,268 |
| DOF lift / annulment rows | 79 |
| DOF rows after lifts | 1,214 |
| DOF rows new vs the 2021 archive | 1,051 |
| Archive rows (2021 CSV) | 1,954 (24 dropped as lifted) |
| **Total `sfp_sanctions`** | **2,981** |
| Personas físicas (name only, labelled) | 510 · with RFC: **0** |
| DOF rows without an end date (no plazo found in the note) | 126 of 1,051 |

The old local table (2,395 rows, DD/MM/YYYY dates, incl. 544 SABG public officials) is kept as `sfp_sanctions_legacy`
(first run) and `_sfp_sanctions_backup_<ts>`. Plazo now parses Spanish number words and «18 (dieciocho) meses» (was 162 rows without an end). Run-2 media leads now confirmed in the table: Bernabeu México (2026-07-21, 16 months), Gen Industrial (2025-12-31 → 2026-03-31), Lavandería y Tintorería de la Península (2026-03-18 → 2027-03-18), Génesis Healthcare Advisers (2026-01-28 → 2027-01-28). Full DB backup: `backend/RUBLI_NORMALIZED.db.pre_brown_20261105.bak`.

## Prod steps (owner's go only; GRAPHITE lane, after the code is on main)

DB `/var/lib/rubli-db/RUBLI_DEPLOY.db` (= `/app/data/RUBLI_DEPLOY.db` in `rubli-backend`). One step at a time.

```bash
# 0. Merge data/sfp-refresh → main and deploy (deploy-safe.sh). Code: refresh script, is_persona_fisica column in
#    load_sfp_sanctions.save_to_db, ARIA SFP name fallback (aria_pipeline.py, strict normalize_name).

# 1. Check what prod has now. 2,395 rows + DD/MM dates = the 10-31 fix never ran there (fine: save_to_db handles it,
#    the first run renames the old table to sfp_sanctions_legacy). 1,954 rows = 10-31 fix already ran.
ssh root@37.60.232.109 "python3 -c \"import sqlite3; c=sqlite3.connect('file:/var/lib/rubli-db/RUBLI_DEPLOY.db?mode=ro',uri=True); print(c.execute('select count(*), max(sanction_start) from sfp_sanctions').fetchone())\""

# 2. Full online backup (check df first)
ssh root@37.60.232.109 "df -h /var/lib/rubli-db && cd /var/lib/rubli-db && python3 -c \"import sqlite3; s=sqlite3.connect('RUBLI_DEPLOY.db'); d=sqlite3.connect('RUBLI_DEPLOY.pre_sfp_refresh.db'); s.backup(d); print(d.execute('PRAGMA quick_check').fetchone())\""

# 3. Ship the cache (no re-crawl from the VPS; JSON only, no shell scripts) + the 2021 CSV beside the DB
#    (local, Git Bash)   tar -C D:/Python/_sfp -czf D:/Python/_sfp/dof_cache.tgz dof
scp D:/Python/_sfp/dof_cache.tgz root@37.60.232.109:/var/lib/rubli-db/
ssh root@37.60.232.109 "cd /var/lib/rubli-db && tar -xzf dof_cache.tgz && mv dof sfp_dof && cp /opt/rubli/backend/data/proveedores_sancionados.csv . && chown -R 100:101 sfp_dof proveedores_sancionados.csv"

# 4. Checkpoint, dry run (expect total_rows 2981, persona_fisica_with_rfc 0), then write
ssh root@37.60.232.109 "docker exec rubli-backend python -c \"import sqlite3; print(sqlite3.connect('/app/data/RUBLI_DEPLOY.db').execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())\""
ssh root@37.60.232.109 "docker exec rubli-backend python -m scripts.refresh_sfp_sanctions apply --cache /app/data/sfp_dof --legacy /app/data/proveedores_sancionados.csv --db /app/data/RUBLI_DEPLOY.db"
ssh root@37.60.232.109 "docker exec rubli-backend python -m scripts.refresh_sfp_sanctions apply --cache /app/data/sfp_dof --legacy /app/data/proveedores_sancionados.csv --db /app/data/RUBLI_DEPLOY.db --write"

# 5. Verify + restart (api/sanctions.py builds its name index in-process)
ssh root@37.60.232.109 "python3 -c \"import sqlite3; c=sqlite3.connect('file:/var/lib/rubli-db/RUBLI_DEPLOY.db?mode=ro',uri=True); print(c.execute('select count(*), sum(is_persona_fisica), sum(is_persona_fisica=1 and rfc is not null), max(sanction_start) from sfp_sanctions').fetchone())\""
#    expect (2981, 510, 0, '2026-1x-xx')
ssh root@37.60.232.109 "docker restart rubli-backend"

# 6. Clean up the shipped cache once verified (owner runs the rm)
```

### Downstream

- ARIA reads `sfp_sanctions` for `is_sfp_sanctioned`. A rerun moves IPS for newly matched vendors → then `precompute_atlas_sky`,
  `precompute_captura`, `compute_ghost_confidence`. Run locally first and diff tiers before prod (not done in this run).
- Memos generated before the rerun keep their old SFP wording.

### Rollback

```bash
ssh root@37.60.232.109 "docker exec rubli-backend python -c \"import sqlite3; c=sqlite3.connect('/app/data/RUBLI_DEPLOY.db', isolation_level=None); b=c.execute(\\\"select name from sqlite_master where name like '_sfp_sanctions_backup_%' order by name desc limit 1\\\").fetchone()[0]; c.executescript(f'BEGIN; DROP TABLE sfp_sanctions; CREATE TABLE sfp_sanctions AS SELECT * FROM {b}; CREATE INDEX idx_sfp_sanctions_rfc ON sfp_sanctions(rfc); CREATE INDEX idx_sfp_sanctions_name ON sfp_sanctions(company_name); COMMIT;'); print(b)\" && docker restart rubli-backend"
```
Full fallback: `RUBLI_DEPLOY.pre_sfp_refresh.db`.
