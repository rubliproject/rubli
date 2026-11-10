#!/usr/bin/env python3
"""
institution_year_value — per-institution, per-year money (spec institutions-macro
«Por pesos» §5–§6; data-impact.md §5 "recommended new precompute").

One sequential contracts scan, re-keyed through institution_canonical
(contracts_canon), amounts in (0, 100B] (CLAUDE.md data rule: > 100B MXN is a
decimal error and is rejected). Per (canonical institution, contract_year):

  n_contracts, value_mxn            every valid contract
  da_n, da_value_mxn                direct awards (is_direct_award = 1)
  flagged_n, flagged_value_mxn      contracts > 10B MXN (FLAG threshold: in, but under review)

It feeds the /institutions Hallazgos cards (IMSS direct award by year, the
sexenio series, the >10B flag) through a cached endpoint, so no request scans
contracts. Writes ONE new table and nothing else.

    python -m scripts.compute_institution_year_value --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    python -m scripts.compute_institution_year_value --db ... --dry-run   # print totals, write nothing
"""
import argparse
import sqlite3
import time
from datetime import datetime, timezone

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

MAX_CONTRACT_VALUE = 100_000_000_000  # reject above (decimal errors)
FLAG_THRESHOLD = 10_000_000_000       # flag above (include, mark for review)
TABLE = "institution_year_value"

DDL = f"""
CREATE TABLE {TABLE} (
    institution_id     INTEGER NOT NULL,
    year               INTEGER NOT NULL,
    n_contracts        INTEGER NOT NULL,
    value_mxn          REAL    NOT NULL,
    da_n               INTEGER NOT NULL,
    da_value_mxn       REAL    NOT NULL,
    flagged_n          INTEGER NOT NULL,
    flagged_value_mxn  REAL    NOT NULL,
    computed_at        TEXT    NOT NULL,
    PRIMARY KEY (institution_id, year)
)
"""

AGG = f"""
SELECT institution_id, contract_year,
       COUNT(*),
       SUM(amount_mxn),
       SUM(CASE WHEN is_direct_award = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn ELSE 0 END),
       SUM(CASE WHEN amount_mxn > {FLAG_THRESHOLD} THEN 1 ELSE 0 END),
       SUM(CASE WHEN amount_mxn > {FLAG_THRESHOLD} THEN amount_mxn ELSE 0 END)
FROM contracts_canon
WHERE institution_id IS NOT NULL AND contract_year IS NOT NULL
  AND amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE}
GROUP BY institution_id, contract_year
"""


def compute(conn: sqlite3.Connection) -> list:
    install_contracts_canon(conn)
    return conn.execute(AGG).fetchall()


def write(conn: sqlite3.Connection, rows: list) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(f"DROP TABLE IF EXISTS {TABLE}")
        conn.execute(DDL)
        conn.executemany(f"INSERT INTO {TABLE} VALUES (?,?,?,?,?,?,?,?,?)", [(*r, now) for r in rows])
        conn.execute(f"CREATE INDEX idx_{TABLE}_year ON {TABLE}(year)")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--db", required=True)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    conn = sqlite3.connect(a.db, timeout=120)
    conn.execute("PRAGMA temp_store = MEMORY")
    t0 = time.time()
    rows = compute(conn)
    n = sum(r[2] for r in rows)
    v = sum(r[3] for r in rows)
    flagged = sum(r[6] for r in rows)
    print(f"{len(rows):,} institution-years · {n:,} contracts · {v / 1e12:.2f}T MXN · "
          f"{flagged} contracts > 10B · {time.time() - t0:.0f}s")
    if a.dry_run:
        print("dry run: nothing written")
        return
    write(conn, rows)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"wrote {TABLE}: {conn.execute(f'SELECT COUNT(*) FROM {TABLE}').fetchone()[0]:,} rows")
    conn.close()


if __name__ == "__main__":
    main()
