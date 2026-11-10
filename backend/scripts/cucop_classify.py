"""
cucop_classify.py — Phase 1 of the categorization enhancement.

Applies the authoritative CUCOP code (partida_especifica) as a classification
OVERRIDE layer on top of the title-regex categories:

  1. Builds reference table `cucop_generica_map` from cucop_catalog.GENERICA_MAP.
  2. Adds columns to `contracts`:
       cucop_capitulo            INT   (1-7, from partida first digit)
       spending_class            TEXT  (Goods/Services/Works/Capital/...)
       cucop_category_suggestion INT   (taxonomy category the official code implies)
       category_source           TEXT  ('regex' default, 'cucop' when overridden)
  3. Backfills the three CUCOP columns for every partida-bearing contract (~396K).
  4. Snapshots original category_id to `_cucop_override_backup` (idempotent).
  5. OVERRIDES category_id when the official code maps to a specific category and
     the regex label is weak: a catch-all (86, 88-92), a sector-fallback guess
     (category_source='fallback', written by classify_categories), or any label at
     all for an AUTHORITATIVE_GENERICAS code. Genuinely-broad génericas (339/357/etc
     map to a catch-all) are left untouched.

Run from backend/:
    python -m scripts.cucop_classify          # apply
    python -m scripts.cucop_classify --reset   # restore original category_id from backup
    python -m scripts.cucop_classify --dry      # report only, no writes
    python -m scripts.cucop_classify --db PATH  # run against a copy

After applying, run:  python -m scripts.compute_category_stats
"""

import argparse
import sqlite3
import time
from pathlib import Path

from scripts.cucop_catalog import (
    CAPITULO,
    CATCH_ALL_CATEGORIES,
    GENERICA_MAP,
    parse_partida,
)

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"
BATCH = 20_000

# Regex labels the official code may replace: the junk drawers plus 86 Machinery,
# which is the energía sector-fallback bucket.
OVERRIDABLE_CATEGORIES = CATCH_ALL_CATEGORIES | {86}

# Génericas whose code is unambiguous and at least as fine as our category, so they
# win over ANY regex label (e.g. 253 rows filed as 22 Medical Supplies: 8K rows / 58B
# MXN in era D, per docs/TAXONOMY_SUBCATEGORY_STUDY_2026-10-07.md).
AUTHORITATIVE_GENERICAS = {"253"}


def _connect(db_path=DB_PATH):
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA busy_timeout = 120000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA cache_size = -200000")
    return conn


def _add_column(cur, table, col, decl):
    cols = {r[1] for r in cur.execute(f"PRAGMA table_info({table})")}
    if col not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        return True
    return False


def build_generica_map(conn):
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS cucop_generica_map")
    cur.execute(
        """
        CREATE TABLE cucop_generica_map (
            generica          TEXT PRIMARY KEY,
            capitulo          INTEGER,
            capitulo_name_es  TEXT,
            spending_class    TEXT,
            generica_name_es  TEXT,
            category_id       INTEGER,
            maps_to_catch_all INTEGER
        )
        """
    )
    rows = []
    for generica, (name_es, cat_id) in sorted(GENERICA_MAP.items()):
        capitulo = int(generica[0])
        cap_name, spending_class = CAPITULO.get(capitulo, ("Otros", "Other"))
        rows.append(
            (generica, capitulo, cap_name, spending_class, name_es, cat_id,
             1 if cat_id in CATCH_ALL_CATEGORIES else 0)
        )
    cur.executemany(
        "INSERT INTO cucop_generica_map VALUES (?,?,?,?,?,?,?)", rows
    )
    conn.commit()
    print(f"  cucop_generica_map: {len(rows)} génericas inserted")


def reset(conn):
    cur = conn.cursor()
    has_backup = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_cucop_override_backup'"
    ).fetchone()
    if not has_backup:
        print("  no _cucop_override_backup table — nothing to reset")
        return
    n = cur.execute("SELECT COUNT(*) FROM _cucop_override_backup").fetchone()[0]
    print(f"  restoring original category_id for {n:,} rows from backup...")
    cur.execute(
        """
        UPDATE contracts
        SET category_id = (
            SELECT old_category_id FROM _cucop_override_backup b
            WHERE b.contract_id = contracts.id
        ),
        category_source = 'regex'
        WHERE id IN (SELECT contract_id FROM _cucop_override_backup)
        """
    )
    conn.commit()
    print(f"  restored {cur.rowcount:,} rows")


def apply_cucop(conn, dry=False):
    cur = conn.cursor()

    # 1. schema
    added = []
    for col, decl in [
        ("cucop_capitulo", "INTEGER"),
        ("spending_class", "TEXT"),
        ("cucop_category_suggestion", "INTEGER"),
        ("category_source", "TEXT"),
    ]:
        if _add_column(cur, "contracts", col, decl):
            added.append(col)
    if added:
        print(f"  added columns: {', '.join(added)}")
    cur.execute(
        """CREATE TABLE IF NOT EXISTS _cucop_override_backup (
               contract_id INTEGER PRIMARY KEY, old_category_id INTEGER )"""
    )
    conn.commit()

    # 2. load partida-bearing rows
    print("  loading partida-bearing contracts...")
    t0 = time.time()
    rows = cur.execute(
        """SELECT id, partida_especifica, category_id, category_source
           FROM contracts
           WHERE partida_especifica IS NOT NULL AND partida_especifica != ''"""
    ).fetchall()
    print(f"  loaded {len(rows):,} rows in {time.time()-t0:.1f}s")

    # 3. compute backfill + override sets in Python
    backfill = []          # (capitulo, spending_class, suggestion, id)
    override = []          # (suggestion, id)
    backup = []           # (id, old_category_id)
    n_parse_fail = 0
    cap_counts = {}
    for cid, partida, cur_cat, cur_src in rows:
        p = parse_partida(partida)
        if not p:
            n_parse_fail += 1
            continue
        backfill.append((p["capitulo"], p["spending_class"], p["category_id"], cid))
        cap_counts[p["spending_class"]] = cap_counts.get(p["spending_class"], 0) + 1
        weak = cur_cat in OVERRIDABLE_CATEGORIES or cur_src == "fallback"
        if (p["category_id"] not in CATCH_ALL_CATEGORIES
                and p["category_id"] != cur_cat
                and (weak or p["generica"] in AUTHORITATIVE_GENERICAS)):
            override.append((p["category_id"], cid))
            backup.append((cid, cur_cat))

    print(f"  parsed OK: {len(backfill):,}  | parse-fail: {n_parse_fail:,}")
    print(f"  spending-class split: " +
          " · ".join(f"{k} {v:,}" for k, v in sorted(cap_counts.items(), key=lambda x: -x[1])))
    print(f"  weak-label rows the official code rescues to a specific category: {len(override):,}")

    if dry:
        print("  [--dry] no writes performed")
        return

    # 4. write backfill (all partida rows)
    print("  writing CUCOP columns...")
    t0 = time.time()
    for i in range(0, len(backfill), BATCH):
        cur.executemany(
            """UPDATE contracts
               SET cucop_capitulo = ?, spending_class = ?, cucop_category_suggestion = ?
               WHERE id = ?""",
            backfill[i:i + BATCH],
        )
        conn.commit()
    # Fill missing provenance only: 'fallback' (from classify_categories) must survive,
    # and 'cucop' rows from a prior run keep their overridden category_id.
    cur.execute(
        "UPDATE contracts SET category_source = 'regex' WHERE category_source IS NULL"
    )
    conn.commit()
    print(f"  backfilled {len(backfill):,} rows in {time.time()-t0:.1f}s")

    # 5. snapshot + override — re-snapshot the CURRENT pre-override category_id so
    # --reset restores the latest regex result, not a stale one.
    print("  snapshotting + overriding weak-label rescues...")
    cur.execute("DELETE FROM _cucop_override_backup")
    cur.executemany(
        "INSERT OR REPLACE INTO _cucop_override_backup (contract_id, old_category_id) VALUES (?,?)",
        backup,
    )
    conn.commit()
    for i in range(0, len(override), BATCH):
        cur.executemany(
            "UPDATE contracts SET category_id = ?, category_source = 'cucop' WHERE id = ?",
            override[i:i + BATCH],
        )
        conn.commit()
    print(f"  overrode {len(override):,} contracts (category_source='cucop')")


def report(conn):
    cur = conn.cursor()
    print("\n  === post-apply state ===")
    total = cur.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    ca = cur.execute(
        "SELECT COUNT(*) FROM contracts WHERE category_id IN (86,88,89,90,91,92)"
    ).fetchone()[0]
    print(f"  contracts in catch-alls now: {ca:,} ({100*ca/total:.1f}%)")
    ov = cur.execute(
        "SELECT COUNT(*), COALESCE(SUM(amount_mxn),0) FROM contracts WHERE category_source='cucop'"
    ).fetchone()
    print(f"  CUCOP-overridden: {ov[0]:,} contracts / {ov[1]/1e9:.1f}B MXN")
    print("  spending_class coverage:")
    for cls, n, v in cur.execute(
        """SELECT spending_class, COUNT(*), COALESCE(SUM(amount_mxn),0)
           FROM contracts WHERE spending_class IS NOT NULL
           GROUP BY spending_class ORDER BY COUNT(*) DESC"""
    ):
        print(f"    {cls:<10} {n:>9,}  {v/1e9:>9.1f}B")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="restore original category_id")
    ap.add_argument("--dry", action="store_true", help="report only, no writes")
    ap.add_argument("--db", default=str(DB_PATH), help="database (default: RUBLI_NORMALIZED.db)")
    args = ap.parse_args()

    print("=" * 60)
    print("CUCOP CLASSIFICATION OVERRIDE (Phase 1)")
    print("=" * 60)
    conn = _connect(args.db)
    try:
        if args.reset:
            reset(conn)
        else:
            build_generica_map(conn)
            apply_cucop(conn, dry=args.dry)
            if not args.dry:
                report(conn)
    finally:
        conn.close()
    print("=" * 60)


if __name__ == "__main__":
    main()
