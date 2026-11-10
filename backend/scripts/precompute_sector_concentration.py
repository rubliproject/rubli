"""
precompute_sector_concentration.py — Build sector_year_concentration (feeds /sectors/{id}/concentration-history).

Per (sector, year): total contract value of the public register (0 < amount <= 100B MXN),
distinct vendors (years with < MIN_VENDORS dropped), the largest vendor's VALUE share, and the Gini of vendor value totals.
Vendors are merged through vendor_canonical. Live this is a GROUP BY over the 3M-row
contracts table; the endpoint reads this ~300-row table instead.

LAUNCH_AUDIT_2026-10-30 § B4: the chart used to plot the capped model feature
`vendor_concentration` from factor_baselines under the label «cuota del mayor proveedor».

    python -m scripts.precompute_sector_concentration [--db SRC] [--out-db OUT]
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from itertools import groupby
from pathlib import Path

try:
    from scripts._institution_canonical import install_contracts_canon
    from scripts._out_db import open_db
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon
    from _out_db import open_db

MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN — reject decimal-error outliers
DATA_FIRST_YEAR = 2002                # api/config/constants.py: the public register starts here
MIN_VENDORS = 10                      # a 1-contract year (Salud 2004) would plot a 100% "share"
TABLE = "sector_year_concentration"


def _gini(values: list[float]) -> float:
    values = sorted(values)
    n, total = len(values), sum(values)
    if n == 0 or total <= 0:
        return 0.0
    return sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(values)) / (n * total)


def build(conn: sqlite3.Connection, min_vendors: int = MIN_VENDORS) -> int:
    install_contracts_canon(conn, vendors=True)
    rows = conn.execute(
        """
        SELECT sector_id, contract_year, vendor_id, SUM(amount_mxn)
        FROM contracts_canon
        WHERE sector_id IS NOT NULL AND contract_year IS NOT NULL AND vendor_id IS NOT NULL
          AND contract_year >= ? AND amount_mxn > 0 AND amount_mxn <= ?
        GROUP BY sector_id, contract_year, vendor_id
        ORDER BY sector_id, contract_year
        """,
        (DATA_FIRST_YEAR, MAX_CONTRACT_VALUE),
    ).fetchall()
    out = []
    for (sector_id, year), grp in groupby(rows, key=lambda r: (r[0], r[1])):
        vals = [r[3] for r in grp]
        total = sum(vals)
        if total <= 0 or len(vals) < min_vendors:
            continue
        out.append((sector_id, year, total, len(vals), max(vals) / total, _gini(vals)))
    conn.execute(f"DROP TABLE IF EXISTS main.{TABLE}")
    conn.execute(
        f"""CREATE TABLE main.{TABLE} (
            sector_id INTEGER NOT NULL, year INTEGER NOT NULL,
            total_value REAL NOT NULL, vendor_count INTEGER NOT NULL,
            top_vendor_share REAL NOT NULL, gini REAL NOT NULL,
            PRIMARY KEY (sector_id, year))"""
    )
    conn.executemany(f"INSERT INTO main.{TABLE} VALUES (?, ?, ?, ?, ?, ?)", out)
    conn.commit()
    return len(out)


def main() -> int:
    here = Path(__file__).resolve()
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=os.environ.get("DATABASE_PATH", str(here.parents[1] / "RUBLI_NORMALIZED.db")))
    p.add_argument("--out-db", default=None, help="write the table here; --db is only read")
    args = p.parse_args()
    if not os.path.exists(args.db):
        print(f"ERROR: DB not found: {args.db}", file=sys.stderr)
        return 2
    conn = open_db(args.db, args.out_db, [TABLE])
    n = build(conn)
    conn.close()
    print(f"{TABLE}: {n} sector-years")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
