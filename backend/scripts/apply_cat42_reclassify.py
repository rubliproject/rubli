"""CAT42 apply: reclassify only the rows the airfare fix can move (in cat 42 now, or matching the new
ticket spellings). A full classify_categories rerun would rewrite 3.1M rows and drop later overrides.

  python -m scripts.apply_cat42_reclassify --db RUBLI_NORMALIZED.db            # dry run
  python -m scripts.apply_cat42_reclassify --db RUBLI_NORMALIZED.db --apply    # writes + row backup

Then: sh scripts/category_precompute_chain.sh <db>
"""
import argparse
import sqlite3
from collections import Counter

from scripts.classify_categories import AIRFARE, classify_text

# Rows the old regex could have missed (new spellings); LIKE is a cheap superset, classify_text decides.
CANDIDATES = """SELECT id, title, description, sector_id, category_id, category_source, COALESCE(amount_mxn, 0)
FROM contracts WHERE category_id = ?
   OR title LIKE '%pasaje%' OR title LIKE '%boletaje%' OR title LIKE '%boleto%aereo%' OR title LIKE '%boletos%a_reo%'
   OR description LIKE '%pasaje%' OR description LIKE '%boletaje%'"""


def plan(conn):
    moves = []
    for cid, title, desc, sector, old, old_src, amt in conn.execute(CANDIDATES, (AIRFARE,)):
        if not (title or desc):
            continue
        new, src = classify_text(title, desc, sector)
        if new != old and AIRFARE in (old, new) and old_src in (None, 'regex', 'fallback'):  # leave cucop/manual rows alone
            moves.append((cid, old, old_src, new, src, amt))
    return moves


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, timeout=60)
    moves = plan(conn)
    out = [m for m in moves if m[1] == AIRFARE]
    inn = [m for m in moves if m[3] == AIRFARE]
    print(f"leave 42: {len(out):,} rows, {sum(m[5] for m in out) / 1e6:,.0f} MDP -> {Counter(m[3] for m in out).most_common(6)}")
    print(f"join 42:  {len(inn):,} rows, {sum(m[5] for m in inn) / 1e6:,.0f} MDP <- {Counter(m[1] for m in inn).most_common(6)}")
    if not a.apply:
        print("dry run; pass --apply to write")
        return
    with conn:
        conn.execute("CREATE TABLE IF NOT EXISTS _cat42_backup_20261105 (id INTEGER PRIMARY KEY, category_id INTEGER, category_source TEXT)")
        conn.executemany("INSERT OR IGNORE INTO _cat42_backup_20261105 VALUES (?,?,?)", [(m[0], m[1], m[2]) for m in moves])
        conn.executemany("UPDATE contracts SET category_id = ?, category_source = ? WHERE id = ?", [(m[3], m[4], m[0]) for m in moves])
    print(f"applied {len(moves):,} rows; backup in _cat42_backup_20261105")


if __name__ == "__main__":
    main()
