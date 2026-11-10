"""Table-level backup before a mass UPDATE/DELETE (.claude/rules/security.md § Backup).

Copies the rows a script is about to change into `_bak_<table>_<YYYYmmdd_HHMMSS>`
in the same DB, so a committed bad run can be undone with plain SQL. Cheaper than
copying the whole 8 GB file.
"""
import sqlite3
from datetime import datetime


def backup_table(conn: sqlite3.Connection, table: str, where: str = "", params=()) -> str:
    name = f"_bak_{table}_{datetime.now():%Y%m%d_%H%M%S}"
    clause = f" WHERE {where}" if where else ""
    conn.execute(f"CREATE TABLE {name} AS SELECT * FROM {table}{clause}", params)
    conn.commit()
    n = conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    print(f"   backup: {n:,} rows of {table} -> {name}")
    return name


if __name__ == "__main__":
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE t(id INT, v INT)")
    c.executemany("INSERT INTO t VALUES (?, ?)", [(1, 1), (2, 2), (3, 3)])
    b = backup_table(c, "t", "id IN (?, ?)", (1, 3))
    assert c.execute(f"SELECT id FROM {b} ORDER BY id").fetchall() == [(1,), (3,)]
    print("ok")
