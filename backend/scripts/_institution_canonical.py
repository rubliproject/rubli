"""Canonical-institution view for the institution precomputes.

scripts/migrate_institutions.py maps every institution id to a canonical_id
(the ETL minted one id per name spelling and per CompraNet era). Precomputes read
`contracts_canon` instead of `contracts`: identical columns, but institution_id is
the canonical id, so absorbed ids get no row of their own. On a DB without
institution_canonical (pre-migration, test fixtures) the view is plain contracts.
"""
import sqlite3

# >100B MXN = decimal error (CLAUDE.md § Critical Data Rules): never aggregated.
_CAP = "COALESCE(c.amount_mxn, 0) <= 100000000000"

ABSORBED_IDS_SQL = "SELECT institution_id FROM institution_canonical WHERE canonical_id <> institution_id"


def src_schema(conn: sqlite3.Connection) -> str:
    """Schema holding `contracts`: main, or the source ATTACHed by scripts/_out_db.py (--out-db runs)."""
    for _, name, _ in conn.execute("PRAGMA database_list").fetchall():
        if name != "temp" and conn.execute(
            f"SELECT 1 FROM {name}.sqlite_master WHERE type = 'table' AND name = 'contracts'"
        ).fetchone():
            return name
    return "main"


def _has_table(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        f"SELECT 1 FROM {src_schema(conn)}.sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone() is not None


def has_canonical(conn: sqlite3.Connection) -> bool:
    return _has_table(conn, "institution_canonical")


def install_contracts_canon(conn: sqlite3.Connection, vendors: bool = False) -> bool:
    """Create TEMP VIEW contracts_canon on this connection; True if canonical mapping is active.

    vendors=True also maps vendor_id through vendor_canonical (scripts/migrate_vendors.py),
    for aggregates keyed by (institution, vendor) or counting distinct vendors.
    """
    s = src_schema(conn)
    conn.execute("DROP VIEW IF EXISTS temp.contracts_canon")
    inst = has_canonical(conn)
    vend = vendors and _has_table(conn, "vendor_canonical")
    cols = [r[1] for r in conn.execute(f"PRAGMA {s}.table_info(contracts)")]
    cap = f" WHERE {_CAP}" if "amount_mxn" in cols else ""  # fixtures may lack the column
    if not inst and not vend:
        conn.execute(f"CREATE TEMP VIEW contracts_canon AS SELECT * FROM {s}.contracts c{cap}")
        return False
    remap = {}
    joins = ""
    if inst:
        remap["institution_id"] = "COALESCE(ic.canonical_id, c.institution_id) AS institution_id"
        joins += f" LEFT JOIN {s}.institution_canonical ic ON ic.institution_id = c.institution_id"
    if vend:
        remap["vendor_id"] = "COALESCE(vc.canonical_id, c.vendor_id) AS vendor_id"
        joins += f" LEFT JOIN {s}.vendor_canonical vc ON vc.vendor_id = c.vendor_id"
    sel = ", ".join(remap.get(col, f"c.{col}") for col in cols)
    conn.execute(f"CREATE TEMP VIEW contracts_canon AS SELECT {sel} FROM {s}.contracts c{joins}{cap}")
    return True


def delete_absorbed_rows(conn: sqlite3.Connection, table: str) -> int:
    """Drop rows keyed by an absorbed institution id (their data now lives on the canonical row)."""
    if not has_canonical(conn):
        return 0
    return conn.execute(f"DELETE FROM {table} WHERE institution_id IN ({ABSORBED_IDS_SQL})").rowcount


if __name__ == "__main__":
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INTEGER, amount_mxn REAL);
        INSERT INTO contracts VALUES (1, 10, 1), (2, 11, 2), (3, 12, 4);
    """)
    assert not install_contracts_canon(c)
    assert c.execute("SELECT COUNT(DISTINCT institution_id) FROM contracts_canon").fetchone()[0] == 3
    c.executescript("""
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO institution_canonical VALUES (10, 10), (11, 10);
        CREATE TABLE s (institution_id INTEGER); INSERT INTO s VALUES (10), (11), (12);
    """)
    assert install_contracts_canon(c)
    got = c.execute("SELECT institution_id, SUM(amount_mxn) FROM contracts_canon GROUP BY 1 ORDER BY 1").fetchall()
    assert got == [(10, 3.0), (12, 4.0)], got
    assert delete_absorbed_rows(c, "s") == 1
    c.executescript("""
        ALTER TABLE contracts ADD COLUMN vendor_id INTEGER;
        UPDATE contracts SET vendor_id = id + 100;
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO vendor_canonical VALUES (101, 101), (102, 101);
    """)
    assert install_contracts_canon(c, vendors=True)
    got = c.execute("SELECT institution_id, COUNT(DISTINCT vendor_id) FROM contracts_canon GROUP BY 1 ORDER BY 1").fetchall()
    assert got == [(10, 1), (12, 1)], got
    # --out-db layout: source attached, writes land in main
    o = sqlite3.connect(":memory:")
    o.execute("ATTACH ':memory:' AS src")
    o.executescript("""
        CREATE TABLE src.contracts (id INTEGER PRIMARY KEY, institution_id INTEGER);
        CREATE TABLE src.institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO src.contracts VALUES (1, 10), (2, 11);
        INSERT INTO src.institution_canonical VALUES (10, 10), (11, 10);
    """)
    assert src_schema(o) == "src" and install_contracts_canon(o)
    assert o.execute("SELECT COUNT(DISTINCT institution_id) FROM contracts_canon").fetchone()[0] == 1
    print("ok")
