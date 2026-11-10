"""Build institution_vendor_year: (canonical institution, canonical vendor, year) cells.

Feeds GET /institutions/{id}/vendors/timeline (the institution dossier's «expediente por
sexenios», owner 2026-10-27). The live GROUP BY over the IMSS's ~680K contracts took
42 s cold / 2 s warm on the prod copy; this table answers it with a PK range read.
One INSERT ... SELECT (no Python-side fetchall: the 1.5 GB prod backend OOM'd on that,
2026-10-26); DELETE + INSERT commit together, so readers never see it empty.

    python -m scripts.precompute_institution_vendor_year --db PATH
    python -m scripts.precompute_institution_vendor_year --demo
"""
import argparse
import sqlite3
import time

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

DDL = """
CREATE TABLE IF NOT EXISTS institution_vendor_year (
    institution_id INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    n INTEGER NOT NULL,
    amount_mxn REAL NOT NULL,
    n_da INTEGER NOT NULL,
    rs REAL,              -- SUM(risk_score) over the scored contracts
    rn INTEGER NOT NULL,  -- COUNT(risk_score)
    PRIMARY KEY (institution_id, vendor_id, year)
) WITHOUT ROWID;
"""

# contracts_canon already drops > 100B MXN rows (scripts/_institution_canonical.py _CAP).
FILL = """
INSERT INTO institution_vendor_year
SELECT institution_id, vendor_id, contract_year, COUNT(*), COALESCE(SUM(amount_mxn), 0),
       COALESCE(SUM(is_direct_award), 0), SUM(risk_score), COUNT(risk_score)
FROM contracts_canon
WHERE institution_id IS NOT NULL AND vendor_id IS NOT NULL AND contract_year IS NOT NULL
GROUP BY institution_id, vendor_id, contract_year
"""


def build(conn: sqlite3.Connection) -> int:
    conn.executescript(DDL)
    install_contracts_canon(conn, vendors=True)
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM institution_vendor_year")
        n = conn.execute(FILL).rowcount
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return n


def _demo() -> None:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript("""
        CREATE TABLE contracts (institution_id INTEGER, vendor_id INTEGER, amount_mxn REAL,
            risk_score REAL, contract_year INTEGER, is_direct_award INTEGER);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO institution_canonical VALUES (9, 9), (19, 9);
        INSERT INTO vendor_canonical VALUES (1, 1), (11, 1);
        INSERT INTO contracts VALUES (9,1,10,0.5,2020,1),(19,11,30,NULL,2020,0),(9,2,5,0.1,2021,1),
                                     (9,2,2e11,0.9,2021,1),(9,3,7,0.2,NULL,1);""")
    assert build(c) == 2
    assert build(c) == 2  # a rebuild replaces, never doubles
    rows = c.execute("SELECT * FROM institution_vendor_year ORDER BY vendor_id").fetchall()
    # absorbed ids fold into their canonical ones; > 100B and year-less rows stay out
    assert rows == [(9, 1, 2020, 2, 40.0, 1, 0.5, 1), (9, 2, 2021, 1, 5.0, 1, 0.1, 1)], rows
    print("ok")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", help="database to write institution_vendor_year into")
    p.add_argument("--demo", action="store_true", help="run the self-check and exit")
    a = p.parse_args()
    if a.demo or not a.db:
        _demo()
        return
    t0 = time.time()
    conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    n = build(conn)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"institution_vendor_year: {n:,} rows, {time.time() - t0:.1f}s -> {a.db}")


if __name__ == "__main__":
    main()
