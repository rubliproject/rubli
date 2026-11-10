"""Build vendor_year: (canonical vendor, sector, contract_year) -> contracts, MXN.

Feeds the by-year sparkline on vendor list rows (GET /vendors, /vendors/top;
frontend/DESIGN.md §8.1 vendor preset). Sums contracts_canon, the same view
vendor_stats is built from (absorbed ids folded in, > 100B MXN rejected), so a
row's series adds up to its dossier total (summed over sectors) or, scoped by sector, to
the sector table's amount. Without this table the API returns no series.
Built into vendor_year_new, then DROP + RENAME in one transaction (short write lock;
readers never see it empty).

    python -m scripts.precompute_vendor_year --db PATH
    python -m scripts.precompute_vendor_year --demo
"""
import argparse
import sqlite3
import time

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

DDL = """
DROP TABLE IF EXISTS vendor_year_new;
CREATE TABLE vendor_year_new (
    vendor_id INTEGER NOT NULL,
    sector_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    n INTEGER NOT NULL,
    amount_mxn REAL NOT NULL,
    PRIMARY KEY (vendor_id, sector_id, year)
) WITHOUT ROWID;
"""

FILL = """
INSERT INTO vendor_year_new
SELECT vendor_id, COALESCE(sector_id, 12), contract_year, COUNT(*), COALESCE(SUM(amount_mxn), 0)
FROM contracts_canon
WHERE vendor_id IS NOT NULL AND contract_year IS NOT NULL
GROUP BY vendor_id, COALESCE(sector_id, 12), contract_year
"""


def build(conn: sqlite3.Connection) -> int:
    conn.executescript(DDL)
    install_contracts_canon(conn, vendors=True)
    n = conn.execute(FILL).rowcount
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DROP TABLE IF EXISTS vendor_year")
        conn.execute("ALTER TABLE vendor_year_new RENAME TO vendor_year")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return n


def _demo() -> None:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript("""
        CREATE TABLE contracts (vendor_id INTEGER, sector_id INTEGER, amount_mxn REAL, contract_year INTEGER);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO vendor_canonical VALUES (1, 1), (11, 1);
        INSERT INTO contracts VALUES (1, 1, 10, 2020), (11, 1, 30, 2020), (2, 1, 5, 2021), (2, 6, 2e11, 2021),
                                     (3, 1, 7, NULL), (2, 6, NULL, 2022), (2, 6, 4, 2021);""")
    assert build(c) == 4
    assert build(c) == 4  # a rebuild replaces, never doubles
    rows = c.execute("SELECT * FROM vendor_year ORDER BY vendor_id, sector_id, year").fetchall()
    # absorbed ids fold into their canonical ones; > 100B and year-less rows stay out; split by sector
    assert rows == [(1, 1, 2020, 2, 40.0), (2, 1, 2021, 1, 5.0), (2, 6, 2021, 1, 4.0), (2, 6, 2022, 1, 0.0)], rows
    print("ok")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", help="database to write vendor_year into")
    p.add_argument("--demo", action="store_true", help="run the self-check and exit")
    a = p.parse_args()
    if a.demo or not a.db:
        _demo()
        return
    t0 = time.time()
    conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    n = build(conn)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"vendor_year: {n:,} rows, {time.time() - t0:.1f}s -> {a.db}")


if __name__ == "__main__":
    main()
