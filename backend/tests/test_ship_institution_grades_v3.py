"""grading-v3 s.6.4: ship script dump/load round-trip on synthetic DBs (no prod, no ssh)."""
import gzip
import sqlite3
import subprocess
import sys

import pytest

from scripts import compute_institution_grades_v3 as g3
from scripts import ship_institution_grades_v3 as ship
from tests.test_institution_grades_v3 import FAST, _make_db

pytestmark = pytest.mark.no_db

TRICKY = ["O" + chr(39) + "Brien; DROP TABLE x;--", "Querétaro «Ñ»", None, "", "a" + chr(10) + "b"]


def _source(tmp_path):
    path = tmp_path / "src.db"
    conn = _make_db(path)
    grades, ledger, cal = g3.compute(conn, recalibrate=True, params=FAST)
    g3.write(conn, grades, ledger, cal)
    conn.execute("UPDATE institution_grade_calibration SET approved_by = ?", ("owner test",))
    conn.executescript("""
        CREATE TABLE institution_category_signals (institution_id INTEGER, category_id INTEGER,
            label TEXT, share REAL, blob BLOB, PRIMARY KEY (institution_id, category_id));
        CREATE INDEX idx_ics_cat ON institution_category_signals(category_id);
        CREATE TABLE category_signal_baseline (category_id INTEGER PRIMARY KEY, median REAL);
        CREATE TABLE institution_category_vendor_topn (institution_id INTEGER, vendor_id INTEGER, rnk INTEGER);
        CREATE TABLE budget_ejercido_annual (year INTEGER, entity_name TEXT, amount_mxn REAL);
        CREATE TABLE budget_entity_institution_map (institution_id INTEGER PRIMARY KEY, entity_name TEXT);
        CREATE TABLE institution_coverage_v1 (institution_id INTEGER PRIMARY KEY, status TEXT, ratio REAL, band TEXT);
        INSERT INTO budget_ejercido_annual VALUES (2024, 'Defensa Nacional', 1.5e10);
        INSERT INTO budget_entity_institution_map VALUES (1, 'Defensa Nacional');
        INSERT INTO institution_coverage_v1 VALUES (1, 'ok', 0.309, 'parcial'), (2, 'sin_cotejo', NULL, NULL);
    """)
    for i, label in enumerate(TRICKY):
        conn.execute("INSERT INTO institution_category_signals VALUES (?, ?, ?, ?, ?)",
                     (i, 20, label, 0.1 * i, bytes([i, 255])))
    conn.executemany("INSERT INTO category_signal_baseline VALUES (?, ?)", [(20, 0.25), (21, None)])
    conn.executemany("INSERT INTO institution_category_vendor_topn VALUES (?, ?, ?)",
                     [(1, 9, 1), (2, 8, 2)])
    conn.commit()
    return path, conn


def _target(tmp_path):
    path = tmp_path / "prod.db"
    t = sqlite3.connect(path)
    t.executescript("""
        CREATE TABLE institution_grades_v3 (institution_id INTEGER PRIMARY KEY, grade TEXT);
        INSERT INTO institution_grades_v3 VALUES (1, 'Z');
        CREATE TABLE institution_category_signals (old_col TEXT);
        INSERT INTO institution_category_signals VALUES ('stale');
        CREATE TABLE keep_me (x INTEGER);
        INSERT INTO keep_me VALUES (42);
    """)
    t.commit()
    t.close()
    return path


def _rows(conn, table):
    """All rows, ignoring computed_at (the dry run dumps a fresh recompute)."""
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})") if r[1] != "computed_at"]
    return sorted(conn.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall(), key=repr)


def _load(target, dump_bytes):
    tables = ship.V3_TABLES + ship.LENS_TABLES + ship.COVERAGE_TABLES
    return subprocess.run([sys.executable, "-c", ship.LOADER, str(target), *tables],
                          input=dump_bytes, capture_output=True)


def test_round_trip_is_exact_and_leaves_other_tables(tmp_path):
    src_path, src = _source(tmp_path)
    before = {t: _rows(src, t) for t in ship.V3_TABLES}
    out = tmp_path / "dump.sql.gz"
    assert ship.main(["--db", str(src_path), "--out", str(out)]) == 0
    assert {t: _rows(src, t) for t in ship.V3_TABLES} == before      # dry run wrote nothing

    target = _target(tmp_path)
    r = _load(target, gzip.decompress(out.read_bytes()))
    assert r.returncode == 0, r.stderr.decode()
    assert b"wal_checkpoint" in r.stdout
    t = sqlite3.connect(target)
    for table in ship.V3_TABLES + ship.LENS_TABLES + ship.COVERAGE_TABLES:
        assert _rows(t, table) == _rows(src, table), table
    assert t.execute("SELECT x FROM keep_me").fetchone() == (42,)
    idx = {r[0] for r in t.execute("SELECT name FROM sqlite_master WHERE type = ?", ("index",))}
    assert "idx_ics_cat" in idx and "idx_grades_v3_grade" in idx
    t.close()


def test_failed_load_rolls_back_everything(tmp_path):
    src_path, _ = _source(tmp_path)
    out = tmp_path / "dump.sql.gz"
    ship.main(["--db", str(src_path), "--out", str(out)])
    sql = gzip.decompress(out.read_bytes()).decode()
    broken = sql.replace("COMMIT;", "INSERT INTO no_such_table VALUES (1);" + chr(10) + "COMMIT;")
    target = _target(tmp_path)
    r = _load(target, broken.encode())
    assert r.returncode != 0
    t = sqlite3.connect(target)
    assert t.execute("SELECT grade FROM institution_grades_v3").fetchall() == [("Z",)]
    assert t.execute("SELECT old_col FROM institution_category_signals").fetchall() == [("stale",)]
    t.close()


def test_refuses_unapproved_calibration(tmp_path):
    src_path, src = _source(tmp_path)
    src.execute("UPDATE institution_grade_calibration SET approved_by = NULL")
    src.commit()
    with pytest.raises(SystemExit, match="approved"):
        ship.main(["--db", str(src_path), "--out", str(tmp_path / "x.sql.gz")])


def test_sql_literal_round_trips_tricky_values():
    c = sqlite3.connect(":memory:")
    for v in TRICKY + [1.5, 7, b"ab"]:
        assert c.execute("SELECT " + ship.sql_literal(v)).fetchone()[0] == v
