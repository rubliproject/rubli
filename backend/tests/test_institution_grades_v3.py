"""grading-v3 (proposals/grading-v3.md s.3, s.6.3, s.9): offline institution grades.

Self-contained: builds a small synthetic DB, so it runs without the full database.
"""
import random
import re
import sqlite3

import numpy as np
import pandas as pd
import pytest

from scripts import compute_institution_grades_v3 as g3

pytestmark = pytest.mark.no_db

RFC_RE = re.compile(r"^[A-Z&]{3,4}[0-9]{6}[A-Z0-9]{3}$")
FAST = {"min_peers": 8, "hard_floor": 8, "n_draws": 20}


def _make_db(path, per_level=12, federal=None):
    """Three levels x `per_level` institutions; `federal` overrides the federal count."""
    rng = random.Random(1)
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, institution_type TEXT, is_federal INTEGER);
        CREATE TABLE institution_canonical (institution_id INTEGER, canonical_id INTEGER, level TEXT);
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, rfc TEXT);
        CREATE TABLE sat_efos_vendors (rfc TEXT, stage TEXT);
        CREATE TABLE aria_queue (vendor_id INTEGER, is_efos_definitivo INTEGER, is_sfp_sanctioned INTEGER, ips_tier INTEGER);
        CREATE TABLE ground_truth_vendors (vendor_id INTEGER);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INTEGER, vendor_id INTEGER,
            contract_year INTEGER, contract_date TEXT, procedure_number TEXT, amount_mxn REAL,
            is_direct_award INTEGER, is_single_bid INTEGER, procedure_type_normalized TEXT,
            publication_delay_days INTEGER, is_year_end INTEGER, risk_score REAL, exception_article TEXT);
    """)
    for v in range(1, 61):
        rfc = "ABC" + f"{v:06d}" + "XY1"
        conn.execute("INSERT INTO vendors VALUES (?, ?, ?)", (v, f"PROVEEDOR {v} SA DE CV", rfc))
    conn.execute("INSERT INTO sat_efos_vendors VALUES ('ABC000007XY1', 'definitivo')")
    conn.execute("INSERT INTO aria_queue VALUES (3, 0, 0, 1)")
    conn.execute("INSERT INTO ground_truth_vendors VALUES (5)")
    counts = {"federal": federal if federal is not None else per_level,
              "estatal": per_level, "municipal": per_level}
    iid, cid = 0, 0
    for level, k in counts.items():
        for _ in range(k):
            iid += 1
            itype = "municipal" if level == "municipal" else "federal_agency"
            conn.execute("INSERT INTO institutions VALUES (?, ?, ?, ?)",
                         (iid, f"INST {iid}", itype, int(level == "federal")))
            conn.execute("INSERT INTO institution_canonical VALUES (?, ?, ?)", (iid, iid, level))
            da_rate = rng.uniform(0.2, 0.95)
            for j in range(rng.randint(15, 80)):
                cid += 1
                da = int(rng.random() < da_rate)
                proc = f"P{iid}-{j // 2}"     # two lots per procedure
                conn.execute(
                    "INSERT INTO contracts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (cid, iid, rng.randint(1, 60), rng.choice([2019, 2021, 2023, 2024]),
                     f"2023-0{rng.randint(1, 9)}-1{rng.randint(0, 9)}", proc,
                     rng.uniform(1e4, 5e6), da, 0 if da else int(rng.random() < 0.4),
                     "directa" if da else rng.choice(["licitacion", "invitacion"]),
                     rng.randint(5, 40), int(rng.random() < 0.1), rng.random() * 0.6, None))
    conn.commit()
    return conn


@pytest.fixture()
def db(tmp_path):
    conn = _make_db(tmp_path / "g3.db")
    yield conn
    conn.close()


def test_ledger_sums_to_score(db):
    grades, ledger, _ = g3.compute(db, recalibrate=True, params=FAST)
    total = 100 + ledger.groupby("institution_id").points.sum()
    s = grades.set_index("institution_id").score
    assert np.allclose(total.reindex(s.index).values, s.values, atol=1e-6)
    assert set(grades.grade) <= set("ABCDF")


def test_peer_sets_respect_hard_floor(db):
    grades, _, _ = g3.compute(db, recalibrate=True, params=FAST)
    assert grades.peer_n.min() >= FAST["hard_floor"]


def test_peer_floor_raises_when_a_level_is_too_small(tmp_path):
    conn = _make_db(tmp_path / "tiny.db", federal=3)
    with pytest.raises(ValueError, match="hard floor"):
        g3.compute(conn, recalibrate=True, params=FAST)
    conn.close()


def test_no_rfc_written(db):
    grades, ledger, cal = g3.compute(db, recalibrate=True, params=FAST)
    g3.write(db, grades, ledger, cal)
    for t in ("institution_grades_v3", "institution_grade_ledger", "institution_grade_calibration"):
        cols = [r[1] for r in db.execute(f"PRAGMA table_info({t})")]
        assert not any("rfc" in c.lower() for c in cols)
        for row in db.execute(f"SELECT * FROM {t}"):
            for v in row:
                if isinstance(v, str):
                    assert not RFC_RE.match(v) and "ABC0000" not in v


def test_frozen_calibration_reproduces_grades(db):
    g1, l1, cal = g3.compute(db, recalibrate=True, params=FAST)
    g3.write(db, g1, l1, cal)
    g2, _, cal2 = g3.compute(db)
    assert not cal2["is_new"] and cal2["calibration_id"] == cal["calibration_id"]
    assert (g1.grade.values == g2.grade.values).all()
    assert np.allclose(g1.score.values, g2.score.values)


def test_single_lot_single_winner_is_not_scored_but_sweep_is():
    df = pd.DataFrame({
        "iid": [1, 1, 2, 2], "vid": [9, 9, 9, 9], "yr": 2024, "cdate": None,
        "proc": ["A", "B", "C", "C"],          # inst 1: two single-lot; inst 2: one 2-lot sweep
        "amt": 1e6, "da": 0, "sb": 1, "ptype": "licitacion", "pub": 20, "ye": 0,
        "risk": 0.1, "exc": None})
    a, _ = g3.aggregate(df, set(), set(), set())
    r = a.set_index("iid").r_nc_count
    assert r[1] == 0.0 and r[2] == 1.0


def test_more_direct_award_never_lowers_noncompetitive_rate():
    base = {"vid": 1, "yr": 2024, "cdate": None, "amt": 1e6, "sb": 0,
            "pub": 20, "ye": 0, "risk": 0.1, "exc": None}
    rows = []
    for iid, da_n in [(1, 2), (2, 6), (3, 10)]:
        for j in range(10):
            da = int(j < da_n)
            rows.append({**base, "iid": iid, "proc": f"{iid}-{j}", "da": da,
                         "ptype": "directa" if da else "licitacion"})
    a, _ = g3.aggregate(pd.DataFrame(rows), set(), set(), set())
    r = a.set_index("iid").r_nc_count
    assert r[1] < r[2] < r[3]


def test_peer_level_follows_buyer_level_not_is_federal(db):
    # docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 0.3: is_federal says federal, buyer scope says state
    db.execute("ALTER TABLE institution_canonical ADD COLUMN buyer_level TEXT")
    db.execute("UPDATE institution_canonical SET buyer_level = level")
    db.execute("UPDATE institution_canonical SET buyer_level = 'estatal' WHERE institution_id = 1")
    db.execute("UPDATE institution_canonical SET buyer_level = 'federal' WHERE institution_id = 13")
    grades, _, _ = g3.compute(db, recalibrate=True, params=FAST)
    lv = grades.set_index("institution_id").level
    assert lv[1] == "estatal" and lv[13] == "federal" and lv[2] == "federal"
