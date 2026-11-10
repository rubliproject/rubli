"""Canonical-vendor view for the vendor precomputes.

scripts/migrate_vendors.py maps each member of a merged vendor group to its
canonical_id. Precomputes read `contracts_vcanon` instead of `contracts`: identical
columns, but vendor_id is the canonical id, so absorbed ids get no row of their own.
On a DB without vendor_canonical (pre-migration, test fixtures) the view is plain contracts.
"""
import sqlite3

ABSORBED_IDS_SQL = "SELECT vendor_id FROM vendor_canonical WHERE canonical_id <> vendor_id"


def has_canonical(conn: sqlite3.Connection) -> bool:
    return conn.execute(
        "SELECT 1 FROM main.sqlite_master WHERE type = 'table' AND name = 'vendor_canonical'"
    ).fetchone() is not None


def install_contracts_vcanon(conn: sqlite3.Connection) -> bool:
    """Create TEMP VIEW contracts_vcanon on this connection; True if canonical mapping is active."""
    conn.execute("DROP VIEW IF EXISTS temp.contracts_vcanon")
    if not has_canonical(conn):
        conn.execute("CREATE TEMP VIEW contracts_vcanon AS SELECT * FROM main.contracts")
        return False
    cols = [r[1] for r in conn.execute("PRAGMA main.table_info(contracts)")]
    sel = ", ".join(
        "COALESCE(vc.canonical_id, c.vendor_id) AS vendor_id" if col == "vendor_id" else f"c.{col}"
        for col in cols
    )
    conn.execute(
        f"CREATE TEMP VIEW contracts_vcanon AS SELECT {sel} FROM main.contracts c "
        "LEFT JOIN main.vendor_canonical vc ON vc.vendor_id = c.vendor_id"
    )
    return True


def delete_absorbed_rows(conn: sqlite3.Connection, table: str, col: str = "vendor_id") -> int:
    """Drop rows keyed by an absorbed vendor id (their data now lives on the canonical row)."""
    if not has_canonical(conn):
        return 0
    return conn.execute(f"DELETE FROM {table} WHERE {col} IN ({ABSORBED_IDS_SQL})").rowcount


if __name__ == "__main__":
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, amount_mxn REAL);
        INSERT INTO contracts VALUES (1, 10, 1), (2, 11, 2), (3, 12, 4);
    """)
    assert not install_contracts_vcanon(c)
    c.executescript("""
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO vendor_canonical VALUES (10, 10), (11, 10);
        CREATE TABLE s (vendor_id INTEGER); INSERT INTO s VALUES (10), (11), (12);
    """)
    assert install_contracts_vcanon(c)
    got = c.execute("SELECT vendor_id, SUM(amount_mxn) FROM contracts_vcanon GROUP BY 1 ORDER BY 1").fetchall()
    assert got == [(10, 3.0), (12, 4.0)], got
    assert delete_absorbed_rows(c, "s") == 1
    print("ok")
