"""CAT22 «sonda» apply: move the Pemex «Sonda (Marina) de Campeche» contracts out of Material de curación (22).
Only rows the fix can move are touched (same pattern as apply_cat42_reclassify).

  python -m scripts.apply_cat22_sonda_reclassify --db RUBLI_NORMALIZED.db            # dry run
  python -m scripts.apply_cat22_sonda_reclassify --db RUBLI_NORMALIZED.db --apply    # writes + row backup

Then: sh scripts/category_precompute_chain.sh <db>
"""
import argparse
import sqlite3
from collections import Counter

from scripts.classify_categories import classify_text

SUPPLIES = 22
CANDIDATES = """SELECT id, title, description, sector_id, category_id, category_source, COALESCE(amount_mxn, 0)
FROM contracts WHERE category_id = ? AND (
   title LIKE '%sonda%campeche%' OR title LIKE '%sonda%camepeche%' OR title LIKE '%sonda marina%'
   OR description LIKE '%sonda%campeche%' OR description LIKE '%sonda%camepeche%' OR description LIKE '%sonda marina%')"""


def plan(conn):
    moves = []
    for cid, title, desc, sector, old, old_src, amt in conn.execute(CANDIDATES, (SUPPLIES,)):
        new, src = classify_text(title, desc, sector)
        if new != old and old_src in (None, 'regex', 'fallback'):  # leave cucop/manual rows alone
            moves.append((cid, old, old_src, new, src, amt))
    return moves


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, timeout=120)
    moves = plan(conn)
    print(f"leave 22: {len(moves):,} rows, {sum(m[5] for m in moves) / 1e6:,.0f} MDP -> {Counter(m[3] for m in moves).most_common(8)}")
    if not a.apply:
        print("dry run; pass --apply to write")
        return
    with conn:
        conn.execute("CREATE TABLE IF NOT EXISTS _cat22_backup_20261106 (id INTEGER PRIMARY KEY, category_id INTEGER, category_source TEXT)")
        conn.executemany("INSERT OR IGNORE INTO _cat22_backup_20261106 VALUES (?,?,?)", [(m[0], m[1], m[2]) for m in moves])
        conn.executemany("UPDATE contracts SET category_id = ?, category_source = ? WHERE id = ?", [(m[3], m[4], m[0]) for m in moves])
    print(f"applied {len(moves):,} rows; backup in _cat22_backup_20261106")


if __name__ == "__main__":
    main()
