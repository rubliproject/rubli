"""--out-db mode for the precomputes: build tables in a side DB, never write the source.

    conn = open_db(src, out, ["vendor_institution_tenure"])

With out=None this is a plain read-write connection to src (the old behaviour).
With out set, main is the out DB and the source is ATTACHed read-only as `src`:
unqualified reads of contracts/vendors/... fall through to src, while each listed
table is created EMPTY in main with the source's schema and indexes, so the
script's unqualified writes land in out.db. scripts/swap_tables.py then moves the
rows into a target DB.
"""
import sqlite3
from pathlib import Path


def open_db(src: str, out: str | None, tables: list[str], timeout: int = 120) -> sqlite3.Connection:
    if not out:
        return sqlite3.connect(src, timeout=timeout)
    conn = sqlite3.connect(out, timeout=timeout, uri=True)
    conn.execute("ATTACH DATABASE ? AS src", (f"file:{Path(src).resolve().as_posix()}?mode=ro",))
    for t in tables:
        if conn.execute("SELECT 1 FROM main.sqlite_master WHERE name = ?", (t,)).fetchone():
            conn.execute(f'DELETE FROM main."{t}"')
            continue
        ddl = conn.execute(
            "SELECT sql FROM src.sqlite_master WHERE tbl_name = ? AND sql IS NOT NULL "
            "ORDER BY type = 'index'", (t,)).fetchall()
        for (sql,) in ddl:  # table first, then its indexes; unqualified DDL lands in main
            conn.execute(sql)
    conn.commit()
    return conn


if __name__ == "__main__":
    import shutil
    import tempfile
    d = Path(tempfile.mkdtemp(dir=Path(__file__).parent))  # D: only
    s = sqlite3.connect(d / "src.db")
    s.executescript("""CREATE TABLE contracts (id INTEGER); INSERT INTO contracts VALUES (1);
                       CREATE TABLE t (a INTEGER); CREATE INDEX ix_t ON t(a); INSERT INTO t VALUES (9);""")
    s.close()
    c = open_db(str(d / "src.db"), str(d / "out.db"), ["t"])
    assert c.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0          # main.t, empty
    c.execute("INSERT INTO t SELECT id FROM contracts"); c.commit()       # read src, write out
    try:
        c.execute("INSERT INTO src.t VALUES (1)")
        raise AssertionError("source must be read-only")
    except sqlite3.OperationalError:
        pass
    assert c.execute("SELECT name FROM main.sqlite_master WHERE type='index'").fetchone()[0] == "ix_t"
    c.close()
    shutil.rmtree(d)
    print("ok")
