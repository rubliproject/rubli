"""scripts/swap_tables.py — backup + replace in one transaction, rollback restores."""
import shutil
import sqlite3
import tempfile
from pathlib import Path

import pytest

from scripts import swap_tables


@pytest.fixture
def dbs():
    d = Path(tempfile.mkdtemp(dir=Path(__file__).parent))  # D: only, not the system temp
    target, source = d / "target.db", d / "out.db"
    t = sqlite3.connect(target)
    t.executescript("""
        CREATE TABLE tenure (vendor_id INTEGER, institution_id INTEGER, total_amount_mxn REAL);
        CREATE INDEX ix_tenure ON tenure(vendor_id);
        INSERT INTO tenure VALUES (1, 10, 5), (2, 11, 7);
        CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT);
        INSERT INTO precomputed_stats VALUES ('overview', 'old', NULL), ('other', 'keep', NULL);
    """)
    t.close()
    s = sqlite3.connect(source)
    s.executescript("""
        CREATE TABLE tenure (institution_id INTEGER, vendor_id INTEGER, total_amount_mxn REAL);
        INSERT INTO tenure VALUES (10, 1, 12);
        CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT);
        INSERT INTO precomputed_stats VALUES ('overview', 'new', NULL), ('other', 'stale', NULL);
    """)
    s.close()
    yield str(target), str(source)
    shutil.rmtree(d)


def rows(db, sql):
    c = sqlite3.connect(db)
    try:
        return c.execute(sql).fetchall()
    finally:
        c.close()


def test_swap_then_rollback(dbs):
    target, source = dbs
    args = ["--target", target, "--source", source, "--tables", "tenure,precomputed_stats",
            "--stat-keys", "overview"]
    swap_tables.main(args + ["--dry-run"])
    assert rows(target, "SELECT COUNT(*) FROM tenure") == [(2,)]  # dry run wrote nothing

    swap_tables.main(args)
    assert rows(target, "SELECT vendor_id, institution_id, total_amount_mxn FROM tenure") == [(1, 10, 12.0)]
    assert dict(rows(target, "SELECT stat_key, stat_value FROM precomputed_stats")) == \
        {"overview": "new", "other": "keep"}  # only the listed key moved
    assert rows(target, "SELECT COUNT(*) FROM _tenure_backup_20261003") == [(2,)]
    assert rows(target, "SELECT tbl_name FROM sqlite_master WHERE name = 'ix_tenure'") == [("tenure",)]

    with pytest.raises(SystemExit):  # a second swap would overwrite the backup
        swap_tables.main(args)

    swap_tables.main(["--target", target, "--tables", "tenure,precomputed_stats", "--rollback"])
    assert sorted(rows(target, "SELECT vendor_id, total_amount_mxn FROM tenure")) == [(1, 5.0), (2, 7.0)]
    assert dict(rows(target, "SELECT stat_key, stat_value FROM precomputed_stats"))["overview"] == "old"
    assert rows(target, "SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%backup%'") == [(0,)]


def test_refuses_over_100b(dbs):
    target, source = dbs
    c = sqlite3.connect(source)
    c.execute("INSERT INTO tenure VALUES (11, 2, 2e11)")
    c.commit()
    c.close()
    with pytest.raises(SystemExit):
        swap_tables.main(["--target", target, "--source", source, "--tables", "tenure"])
    assert rows(target, "SELECT COUNT(*) FROM tenure") == [(2,)]


def test_allows_over_100b_already_in_target(dbs):
    """Aggregates (vendor_stats, ...) sum past 100B; only NEW rows over the ceiling refuse."""
    target, source = dbs
    for db, vals in ((target, "(3, 12, 2e11)"), (source, "(12, 3, 2e11)")):
        c = sqlite3.connect(db)
        c.execute(f"INSERT INTO tenure VALUES {vals}")
        c.commit()
        c.close()
    swap_tables.main(["--target", target, "--source", source, "--tables", "tenure"])
    assert rows(target, "SELECT COUNT(*) FROM tenure") == [(2,)]
