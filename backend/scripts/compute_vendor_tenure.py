"""
compute_vendor_tenure.py
Precompute vendor-institution tenure for all vendor-institution pairs with >= min_contracts.

Usage:
    python -m scripts.compute_vendor_tenure [--min-contracts 3] [--db SRC] [--out-db OUT]

Pairs are keyed by canonical vendor and institution ids (scripts/_institution_canonical.py).
--out-db builds the table in OUT with SRC attached read-only (scripts/_out_db.py).

Runtime: ~5-10 minutes on 3.1M contracts.
"""

import argparse
import os
import sqlite3
import time
from pathlib import Path

try:
    from scripts._institution_canonical import install_contracts_canon
    from scripts._out_db import open_db
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon
    from _out_db import open_db

DB_PATH = Path(os.environ.get("DATABASE_PATH") or Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")


def main(min_contracts: int = 3, db: str = str(DB_PATH), out_db: str | None = None):
    conn = open_db(db, out_db, ["vendor_institution_tenure"])
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-200000")
    cursor = conn.cursor()
    install_contracts_canon(conn, vendors=True)

    print("=" * 60)
    print("COMPUTING VENDOR-INSTITUTION TENURE")
    print("=" * 60)
    t0 = time.time()

    print(f"\n1. Aggregating vendor-institution pairs (min_contracts={min_contracts})...")
    # One INSERT ... SELECT: no Python-side fetchall of ~200K pairs (the 1.5 GB prod backend
    # OOM'd on that pattern 2026-10-26). DELETE + INSERT commit together, so readers never see it empty.
    cursor.execute("DELETE FROM vendor_institution_tenure")
    cursor.execute("""
        INSERT INTO vendor_institution_tenure
            (vendor_id, institution_id, first_contract_year, last_contract_year,
             total_contracts, total_amount_mxn, win_rate_at_institution)
        SELECT vendor_id, institution_id,
               MIN(contract_year), MAX(contract_year), COUNT(*), SUM(COALESCE(amount_mxn, 0)),
               NULL  -- win_rate_at_institution: no per-institution bid count data
        FROM contracts_canon
        WHERE vendor_id IS NOT NULL
          AND institution_id IS NOT NULL
          AND contract_year IS NOT NULL
        GROUP BY vendor_id, institution_id
        HAVING COUNT(*) >= ?
    """, (min_contracts,))
    conn.commit()

    # Quick validation
    count = cursor.execute("SELECT COUNT(*) FROM vendor_institution_tenure").fetchone()[0]
    print(f"\n3. Validation: {count:,} rows in vendor_institution_tenure")

    # Show top tenure examples
    examples = cursor.execute("""
        SELECT v.name, i.name AS inst_name,
               vit.first_contract_year, vit.last_contract_year,
               (vit.last_contract_year - vit.first_contract_year + 1) AS tenure_years,
               vit.total_contracts
        FROM vendor_institution_tenure vit
        JOIN vendors v ON vit.vendor_id = v.id
        JOIN institutions i ON vit.institution_id = i.id
        ORDER BY tenure_years DESC
        LIMIT 5
    """).fetchall()
    print("\n   Top tenure examples:")
    for e in examples:
        print(f"   {e['name'][:40]:40s} @ {e['inst_name'][:25]:25s} "
              f"-> {e['tenure_years']} yrs ({e['first_contract_year']}-{e['last_contract_year']}), "
              f"{e['total_contracts']:,} contracts")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s")
    print("=" * 60)
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute vendor-institution tenure")
    parser.add_argument("--min-contracts", type=int, default=3,
                        help="Minimum contracts per vendor-institution pair (default: 3)")
    parser.add_argument("--db", default=str(DB_PATH))
    parser.add_argument("--out-db", default=None, help="write the table here; --db is only read")
    args = parser.parse_args()
    main(min_contracts=args.min_contracts, db=args.db, out_db=args.out_db)
