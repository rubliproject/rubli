# DQ1 — data-quality fixes: prod runbook (release captain only)

Source: `docs/DATA_QUALITY_AUDIT_2026-10-30.md` issues 1–4 + mojibake. Branch `fix/data-quality-1`.
**Window:** after Sun 2026-11-01 08:00 UTC (outside the Sat 23:00–Sun 08:00 weekly job), owner-approved,
one operator. Every script is a dry run unless `--apply`, idempotent, and has `--rollback`.

Rehearsed on a copy of prod (`D:/Python/_dq/prodcopy.db`, from the Oct-27 backup + refresh rehearsal);
numbers below are from that copy — prod (Oct 31) may differ slightly.

## 0. Pre-flight

```bash
# code first: merge fix/data-quality-1 → main, then the normal deploy (scripts must be in the container)
bash /opt/rubli/scripts/deploy-safe.sh
df -h /var/lib/rubli-db            # need free ≥ 2 × DB size (backup ≈ 9 GB + WAL growth ≈ 1 GB)
ls -la /var/lib/rubli-db/RUBLI_DEPLOY.db
# no weekly / ARIA job running — check from the HOST (the backend image has no `ps`, so a check inside
# the container always passes silently):
pgrep -af "comprasmx_weekly|aria_pipeline|precompute|_refresh_stats" && echo "STOP: a job is running"
systemctl is-active rubli-weekly.service    # → inactive
```

**Tell every other session (local AND cloud) not to deploy or `docker compose` on prod for ≈ 2 h.**
2026-11-02: a cloud session's raw `docker compose up -d --build` recreated rubli-backend mid-run, killed the
in-container `docker exec` and forced a rollback. § 3–4 now check for that before every step (below).

## 1. Backup (stop if it fails)

```bash
D=$(date -u +%Y%m%d)
sqlite3 /var/lib/rubli-db/RUBLI_DEPLOY.db ".backup '/var/lib/rubli-db/RUBLI_DEPLOY.pre_dq1_$D.db'"
#   (no host sqlite3? same thing via the container:)
#   docker exec rubli-backend python -c "import sqlite3; s=sqlite3.connect('/app/data/RUBLI_DEPLOY.db'); d=sqlite3.connect('/app/data/RUBLI_DEPLOY.pre_dq1_$D.db'); s.backup(d); d.close()"
sqlite3 /var/lib/rubli-db/RUBLI_DEPLOY.pre_dq1_$D.db "PRAGMA quick_check;"     # → ok
```

## 2. Source extract for § 1 (gap-fill repair)

The 5,849 source rows were extracted locally (`D:/Python/_dq/Contratos_CompraNet_dq1.csv`, 6.9 MB, holds
supplier RFCs incl. personas físicas — PRIVATE, never commit; `*dq1*.csv` is in `.gitignore`). It is a data
file, not a shell script, so the CRLF gotcha does not apply.

```bash
# on the VPS first
mkdir -p /var/lib/rubli-db/dq1 && chmod 700 /var/lib/rubli-db/dq1
# from the workstation
scp D:/Python/_dq/Contratos_CompraNet_dq1.csv root@37.60.232.109:/var/lib/rubli-db/dq1/
# on the VPS — owner = the container's `app` user (uid 100, gid 101), or the scripts can't read it at 700/600
chmod 600 /var/lib/rubli-db/dq1/Contratos_CompraNet_dq1.csv
chown -R 100:101 /var/lib/rubli-db/dq1
docker exec rubli-backend sh -c 'wc -l /app/data/dq1/Contratos_CompraNet_dq1.csv'     # readable → 5,895 lines
```

## 3. Apply (one shell session, in this order — any failure stops it, rolls back and still removes the RFC extract)

Save § 3 + § 4 as ONE script on the VPS (e.g. `/root/dq1_apply.sh`, written with a heredoc so it is LF) and
start it detached: `setsid nohup bash /root/dq1_apply.sh > /root/dq1_apply.log 2>&1 < /dev/null &`.
Don't launch it through an `ssh … 'bash -c "…precompute…"'` one-liner: the host job check would match that
command line.

```bash
set -euo pipefail
trap 'rm -rf /var/lib/rubli-db/dq1; echo "DQ1: extract removed"' EXIT     # success OR abort
X="docker exec -w /app rubli-backend python -m"
PY="docker exec -w /app rubli-backend python -c"
DB=/app/data/RUBLI_DEPLOY.db
CID0=$(docker inspect -f '{{.Id}}' rubli-backend)      # the container every step must run in

rollback_all() {   # the Rollback section below; every step is a clean no-op if it never ran
  $X scripts.dq1_title_mojibake --db $DB --rollback
  $X scripts.dq1_rfc_merge --db $DB --rollback
  $X scripts.dq1_gapfill_repair --db $DB --rollback
  $X scripts.dq1_procedure_unknown --db $DB --rollback
  $PY "import sqlite3; c=sqlite3.connect('$DB', timeout=600)
with c:
    if c.execute(\"SELECT 1 FROM sqlite_master WHERE name='dq1_high_value_backup'\").fetchone():
        c.execute('UPDATE contracts SET is_high_value = (SELECT b.is_high_value FROM dq1_high_value_backup b WHERE b.id = contracts.id) WHERE id IN (SELECT id FROM dq1_high_value_backup)')
        c.execute('DROP TABLE dq1_high_value_backup')"
}
abort() {
  echo "ABORT ($1) at $(date -u +%T) — rolling back"
  while pgrep -f "docker[ -]compose|deploy-safe" > /dev/null; do sleep 10; done          # let the foreign deploy finish
  until [ "$(docker inspect -f '{{.State.Health.Status}}' rubli-backend 2>/dev/null)" = healthy ]; do sleep 10; done
  set +e; rollback_all; echo "rollback rc=$?"
  echo "DB rolled back. If § 4 had started, re-run § 4 stats refresh (or restore the § 1 backup)."
  exit 1
}
guard() {   # start of EVERY step: no foreign compose/deploy, same backend container, no weekly/ARIA/precompute job
  echo "== $1 $(date -u +%T)"
  if pgrep -af "docker[ -]compose|deploy-safe"; then abort "foreign docker compose / deploy running before: $1"; fi
  [ "$(docker inspect -f '{{.Id}}' rubli-backend 2>/dev/null)" = "$CID0" ] || abort "rubli-backend container changed before: $1"
  if pgrep -af "comprasmx_weekly|aria_pipeline|precompute|_refresh_stats"; then abort "weekly / precompute job running before: $1"; fi
}
step() { guard "$1"; shift; "$@" || abort "step failed: $*"; }   # a docker exec killed mid-step also lands here

# § 2 structure-A procedure flags → unknown (NULL); old values kept in contracts_procedure_unknown_dq1
step "§2 dry"   $X scripts.dq1_procedure_unknown --db $DB            # dry: 394,861 rows · 131,099 single-bid now (≈ 8 min on prod)
step "§2 apply" $X scripts.dq1_procedure_unknown --db $DB --apply

# § 1 gap-fill rows 3110073–3115921: title / number / date / year / vendor / institution
step "§1 dry"   $X scripts.dq1_gapfill_repair --db $DB --csv-dir /app/data/dq1   # dry counts vendor_new per ROW (prod 1,402); apply dedupes (prod 141)
step "§1 apply" $X scripts.dq1_gapfill_repair --db $DB --csv-dir /app/data/dq1 --apply

# § 3 split company RFCs → vendor_canonical (no vendor/contract deleted)
guard "§3 dry"
$X scripts.dq1_rfc_merge --db $DB > /tmp/dq1_merge_dry.txt || abort "§3 dry failed"   # dry: 54 RFCs (115 rows) · 4 name-mismatch + 2 name_inconsistent left (≈ 7 min)
grep -vE "^ " /tmp/dq1_merge_dry.txt; grep "denylist watch" /tmp/dq1_merge_dry.txt    # summary only — the example lines carry RFCs
grep -q "denylist watch (165033 / 245667 in a merge group): none" /tmp/dq1_merge_dry.txt || abort "Provectus 165033/245667 in a merge group"
rm -f /tmp/dq1_merge_dry.txt
step "§3 apply" $X scripts.dq1_rfc_merge --db $DB --apply

# § 5 «ý» titles (backup table contract_title_repair_dq1; contracts_fts kept in sync)
step "§5 dry"   $X scripts.dq1_title_mojibake --db $DB                # dry: 139,930 of 140,918 titles repaired · precision 99.6 % held-out (≈ 2 min)
step "§5 apply" $X scripts.dq1_title_mojibake --db $DB --apply

# § 4 is_high_value = the 10B review flag everywhere (was ≥ 10M in the CompraNet ETL) — old values saved first
step "§4 high_value" $PY "import sqlite3; c=sqlite3.connect('$DB', timeout=600)
with c:
    c.execute('CREATE TABLE IF NOT EXISTS dq1_high_value_backup (id INTEGER PRIMARY KEY, is_high_value INTEGER)')
    c.execute('INSERT OR IGNORE INTO dq1_high_value_backup SELECT id, is_high_value FROM contracts WHERE is_high_value IS NOT (amount_mxn > 10000000000)')
    n = c.execute('UPDATE contracts SET is_high_value = (amount_mxn > 10000000000) WHERE is_high_value IS NOT (amount_mxn > 10000000000)').rowcount
print('is_high_value realigned', n)"      # copy: 102,818 rows (≈ 4 min)

step "checkpoint" $PY "import sqlite3; print(sqlite3.connect('$DB').execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"   # → (0, 0, 0)
```

## 4. Stats refresh

Same script, same shell (uses `guard` / `step` / `CID0` from § 3).

```bash
step "stats tables"     $X scripts._refresh_stats_tables --db $DB                               # vendor_stats / institution_stats (canonical)
step "category stats"   docker exec -e DATABASE_PATH=$DB -w /app rubli-backend python -m scripts.compute_category_stats
step "precompute_stats" $X scripts.precompute_stats --db $DB                                    # yearly trends, sector stats (≈ 40–70 min)
step "story stats"      $X scripts.precompute_story_stats $DB
step "inst categories"  $X scripts.precompute_institution_categories $DB
step "cat signals"      $X scripts._precompute_category_signals $DB
step "cat enrichments"  $X scripts._precompute_category_enrichments $DB
step "cat top vendors"  $X scripts._precompute_category_top_vendors $DB
step "checkpoint"       $PY "import sqlite3; print(sqlite3.connect('$DB').execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"
guard "restart"
docker restart rubli-backend          # drops app caches (canonical maps, precomputed payloads)
# (the EXIT trap removes /var/lib/rubli-db/dq1)
```

The rest of the downstream chain (ARIA, institution lens / registers, atlas sky, scorecards …) picks the
changes up in the next weekly run (`comprasmx_weekly.py`, Sat 23:00); run it by hand only if the owner
wants it before then.

## 5. Checks

```sql
SELECT COUNT(*) FROM contracts WHERE id BETWEEN 3110073 AND 3115921 AND (title IS NULL OR vendor_id IS NULL OR contract_date IS NULL);  -- 0
SELECT COUNT(*) FROM contracts WHERE source_structure='A' AND (is_single_bid IS NOT NULL OR is_direct_award IS NOT NULL);           -- 0
SELECT COUNT(*) FROM contracts WHERE title LIKE '%' || char(253) || '%';                                                             -- ≈ 7,200 (ambiguous, left)
SELECT COUNT(*) FROM vendor_stats;   -- = contracts-with-vendor rolled to canonical
```
Smoke: `/contracts/3110073`, `/contracts?year=2005` (amount † on > 10B rows), a merged vendor (e.g. 44496 → redirects
to its canonical), `/administraciones` (Fox: single-bid «—»).

## Why «structure A» in the data but «year ≥ 2011» in the stats

Two rules, one fact, both deliberate:
- **Data** (`dq1_procedure_unknown.py`): `is_direct_award` / `is_single_bid` → NULL on every `source_structure = 'A'`
  row — the 2002–2010 file format whose procedure type is the constant «Licitación Pública». It is by file, so
  the model's side table (`contracts_procedure_unknown_dq1`) maps 1:1.
- **Stats** (`PROCEDURE_TYPE_FIRST_YEAR = 2011` → `proc_known` / `proc_den` in `api/config/constants.py`): every
  share counts only `contract_year >= 2011`. Year ≤ 2010 also holds B-format rows (2010: 5,380 of 41,372 coded),
  too few for a share, and a few A-format rows carry later years. So a 2010 B row keeps its flag (true data) but no
  published share uses it. Changing one rule means checking the other.

## Montos en verificación (no data change — keep the † review flag)

| id | Recorded | Note |
|---|---|---|
| 3200202 | 1,750,000,000 **USD** → 35,175,000,000 MXN (BIRMEX, Laboratorios Liomont, SARS-CoV-2 vaccine, 2026–2030) | No signing date, status not «formalizado». The sibling line 3216069 (Pfizer, same buyer and week) is an open contract whose `importe_drc` equals its *maximum* (12.5B MXN), so 3200202 is at best a framework ceiling, and most likely **MXN tagged as USD** (1.75B MXN). Do NOT change the amount; it stays > 10B with the † «monto en revisión» marker until ComprasMX / BIRMEX confirms. |
| 77197 | 11,463,141,266.28 MXN, PEMEX PEP, Burgos «Bloque Misión», 2003-11-28 | Matches the 2003 CompraNet file exactly (contract 414103997, procedure 18575008-130-03). **Vendor attribution open:** the file names ELINA DEL BAJÍO S.A. DE C.V.; review flagged that the Misión block is usually attributed to Tecpetrol / IPC, not Elina del Bajío (unverified here) — confirm against PEMEX / press sources before any page or story names the vendor. |
| 77198 | 27,244,198,347.70 MXN, PEMEX PEP, Burgos «Bloque Reynosa-Monterrey», 2003-11-14, REPSOL EXPLORACIÓN | Matches the source file (contract 414103990); size consistent with the ~US$2.4B reported for the block. Not a decimal error. |

## Rollback (reverse order; or restore the backup)

```bash
# same X / PY / DB as § 3
$X scripts.dq1_title_mojibake --db $DB --rollback
$X scripts.dq1_rfc_merge --db $DB --rollback
$X scripts.dq1_gapfill_repair --db $DB --rollback       # deletes the vendors/institutions it created
$X scripts.dq1_procedure_unknown --db $DB --rollback
$PY "import sqlite3; c=sqlite3.connect('$DB', timeout=600)
with c:
    c.execute('UPDATE contracts SET is_high_value = (SELECT b.is_high_value FROM dq1_high_value_backup b WHERE b.id = contracts.id) WHERE id IN (SELECT id FROM dq1_high_value_backup)')
    c.execute('DROP TABLE dq1_high_value_backup')"
# every --rollback prints «nothing to roll back» and exits 0 if that step never ran (test_rollback_never_applied_is_noop)
# the guarded form of these lines is rollback_all() in § 3 — but run the high-value block only if dq1_high_value_backup exists
# then § 4 stats refresh again.  Full restore: stop backend, cp RUBLI_DEPLOY.pre_dq1_$D.db over RUBLI_DEPLOY.db (+ rm -wal/-shm), start.
```
