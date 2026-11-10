"""Persist contract amount flags as a column (docs/PREPUB_AUDIT_2026-09-24.md § D3/B5).

contracts.amount_flag:
  'suspect_decimal'  isolated vendor-relative spike (> 1B, > 1000x vendor median,
                     > 100x the vendor's next-largest contract) — api/public_labels.py
  'review'           > 10B MXN (.claude/rules/data-validation.md FLAG rule)
  NULL               otherwise

The API already computes the same flags live (public_labels.amount_flag); this
script only makes them queryable in SQL. Idempotent: every run recomputes and
overwrites the column.

  python -m scripts._persist_amount_flags --db PATH            # dry run (read-only)
  python -m scripts._persist_amount_flags --db PATH --apply    # add column + fill
  python -m scripts._persist_amount_flags --db PATH --revert   # drop the column

Back up the DB before --apply/--revert (.claude/rules/security.md).
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.public_labels import REVIEW_THRESHOLD, suspect_decimal_contracts  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    writing = args.apply or args.revert
    uri = f"file:{args.db}" + ("" if writing else "?mode=ro")
    conn = sqlite3.connect(uri, uri=True)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(contracts)")}

    if args.revert:
        if "amount_flag" in cols:
            conn.execute("ALTER TABLE contracts DROP COLUMN amount_flag")
            conn.commit()
        print("reverted: contracts.amount_flag dropped")
        return 0

    suspect = suspect_decimal_contracts(conn)
    review = [r[0] for r in conn.execute(
        "SELECT id FROM contracts WHERE amount_mxn > ?", (REVIEW_THRESHOLD,)
    )]
    review_only = [cid for cid in review if cid not in suspect]
    total_suspect = sum(c["amount_mxn"] for c in suspect.values())
    print(f"suspect_decimal: {len(suspect)} contracts, {total_suspect / 1e9:,.1f}B MXN")
    print(f"review (>10B, not suspect): {len(review_only)} contracts")

    if not args.apply:
        print("dry run — no writes (pass --apply)")
        return 0

    with conn:
        if "amount_flag" not in cols:
            conn.execute("ALTER TABLE contracts ADD COLUMN amount_flag TEXT")
        conn.execute("UPDATE contracts SET amount_flag = NULL WHERE amount_flag IS NOT NULL")
        conn.executemany(
            "UPDATE contracts SET amount_flag = 'review' WHERE id = ?", [(i,) for i in review_only]
        )
        conn.executemany(
            "UPDATE contracts SET amount_flag = 'suspect_decimal' WHERE id = ?", [(i,) for i in suspect]
        )
    print("applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
