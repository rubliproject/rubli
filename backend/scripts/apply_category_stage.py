"""
apply_category_stage.py — apply (or roll back) a staged category reassignment in ONE transaction.

The stage file is a gzipped CSV with header
    id,old_category_id,old_category_source,new_category_id,new_category_source
built from a classifier re-run on a copy (see docs/TAXONOMY_P0_BEFORE_AFTER_2026-10-07.md).
It doubles as the rollback file: --rollback writes the old_* columns back.

Guards: every staged row must currently hold the expected "from" values (so a stage built
on one DB can't silently clobber a diverged one), the residual diff after the UPDATE must
be 0, and no contract may end with a NULL category. Also syncs categories.keywords to the
regexes in classify_categories.CATEGORIES.

Run from backend/:
    python -m scripts.apply_category_stage --db PATH --stage FILE.csv.gz            # dry run
    python -m scripts.apply_category_stage --db PATH --stage FILE.csv.gz --apply
    python -m scripts.apply_category_stage --db PATH --stage FILE.csv.gz --apply --rollback
Then rebuild the category precomputes (compute_category_stats and friends).
"""
import argparse
import csv
import gzip
import sqlite3
import time

from scripts.classify_categories import CATEGORIES


def _val(s):
    return None if s == "" else s


def load_stage(path, rollback):
    rows = []
    with gzip.open(path, "rt", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            old = (int(r["old_category_id"]), _val(r["old_category_source"]))
            new = (int(r["new_category_id"]), _val(r["new_category_source"]))
            frm, to = (new, old) if rollback else (old, new)
            rows.append((int(r["id"]), frm[0], frm[1], to[0], to[1]))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--stage", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true", help="write the old_* values back")
    args = ap.parse_args()

    rows = load_stage(args.stage, args.rollback)
    print(f"stage rows: {len(rows):,}  ({'rollback' if args.rollback else 'forward'})")
    c = sqlite3.connect(args.db, timeout=120, isolation_level=None)
    c.execute("PRAGMA busy_timeout = 120000")
    one = lambda q: c.execute(q).fetchone()[0]

    c.execute("CREATE TEMP TABLE stage (id INTEGER PRIMARY KEY, f_cat INT, f_src TEXT, t_cat INT, t_src TEXT)")
    c.executemany("INSERT INTO temp.stage VALUES (?,?,?,?,?)", rows)
    matched = one("SELECT COUNT(*) FROM main.contracts k JOIN temp.stage s ON s.id = k.id")
    diverged = one("""SELECT COUNT(*) FROM main.contracts k JOIN temp.stage s ON s.id = k.id
                      WHERE k.category_id IS NOT s.f_cat OR k.category_source IS NOT s.f_src""")
    done = one("""SELECT COUNT(*) FROM main.contracts k JOIN temp.stage s ON s.id = k.id
                  WHERE k.category_id IS s.t_cat AND k.category_source IS s.t_src""")
    print(f"matched {matched:,} | already at target {done:,} | diverged from expected 'from' {diverged:,}")
    assert matched == len(rows), "stage ids missing from contracts"
    assert diverged == 0, "DB does not hold the expected pre-change values — rebuild the stage on this DB"
    if not args.apply:
        print("[dry run] no writes")
        return

    print("checkpoint before:", c.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
    t0 = time.time()
    c.execute("BEGIN IMMEDIATE")
    try:
        c.execute("""UPDATE main.contracts SET category_id = s.t_cat, category_source = s.t_src
                     FROM temp.stage s WHERE s.id = contracts.id""")
        left = one("""SELECT COUNT(*) FROM main.contracts k JOIN temp.stage s ON s.id = k.id
                      WHERE k.category_id IS NOT s.t_cat OR k.category_source IS NOT s.t_src""")
        assert left == 0, left
        assert one("SELECT COUNT(*) FROM main.contracts WHERE category_id IS NULL") == 0
        for cat_id, _code, _en, _es, _sec, keywords in CATEGORIES:
            c.execute("UPDATE main.categories SET keywords = ? WHERE id = ?", (keywords, cat_id))
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise
    print(f"committed {len(rows):,} rows in {time.time() - t0:.0f}s")
    for _ in range(40):
        r = c.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        print("checkpoint after:", r)
        if r[0] == 0:
            break
        time.sleep(3)


if __name__ == "__main__":
    main()
