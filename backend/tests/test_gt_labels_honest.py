"""GT label fixes (docs/GT_FIXES_2026-11-02.md): windows, origin re-tag, no-window flag, label_tier.

Unit tests build a tiny GT DB. The integration test copies the GT tables of DATABASE_PATH
(point it at a COPY) into a temp DB and checks the audit's counts.
"""
import sqlite3
import sys
from pathlib import Path

import pandas as pd
import pytest

from scripts.migrate_gt_labels_honest import migrate

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "_v09"))
import build as v09_build  # noqa: E402  training label query (gt_links)
import train_eval as v09_train  # noqa: E402  training positives()

SCHEMA = """
CREATE TABLE ground_truth_cases (id INTEGER PRIMARY KEY, case_id TEXT, case_name TEXT, case_type TEXT,
  year_start INTEGER, year_end INTEGER, confidence_level TEXT, notes TEXT,
  fraud_year_start INTEGER, fraud_year_end INTEGER, fraud_institution_ids TEXT, label_scope_notes TEXT,
  case_origin TEXT, provenance_tier TEXT, evidence_summary TEXT);
CREATE TABLE ground_truth_vendors (id INTEGER PRIMARY KEY, case_id INTEGER, vendor_id INTEGER,
  is_false_positive INTEGER DEFAULT 0, curriculum_weight REAL, gt_split TEXT, gold_strict INTEGER DEFAULT 0,
  created_at TEXT, match_method TEXT);
CREATE TABLE ground_truth_contracts (id INTEGER PRIMARY KEY, case_id INTEGER, contract_id INTEGER, evidence_tier TEXT);
CREATE TABLE ground_truth_institutions (id INTEGER PRIMARY KEY, case_id INTEGER, institution_id INTEGER);
CREATE TABLE vendors (id INTEGER PRIMARY KEY, vendor_kind TEXT);
CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, institution_id INTEGER, contract_year INTEGER);
"""
ARIA = "[C|auto 2026-10-03|origin=media_report] self-citation only (model/ARIA/COMPRANET)"


def _case(id, ys, ye, fys=None, fye=None, origin="media_report", tier="C", ev=None, scope=None):
    return (id, f"CASE-{id}", f"case {id}", "x", ys, ye, "high", fys, fye, scope, origin, tier, ev)


@pytest.fixture
def db(tmp_path):
    conn = sqlite3.connect(tmp_path / "gt.db")
    conn.executescript(SCHEMA)
    conn.executemany(
        """INSERT INTO ground_truth_cases (id, case_id, case_name, case_type, year_start, year_end,
           confidence_level, fraud_year_start, fraud_year_end, fraud_institution_ids, case_origin,
           provenance_tier, evidence_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            _case(104, 2009, 2019, 2005, 2025, tier="A"),          # L1-tightened, fraud_* still wide
            _case(500, 2010, 2012, origin="media_report", ev=ARIA),  # ARIA self-citation
            _case(501, 2010, 2012, tier="B", ev="[B|web-verified] real press"),
            _case(365, None, None, origin="model_discovery", tier="B"),  # gets its source's year
            _case(600, None, None, origin="model_discovery"),           # no window, no source
            _case(700, 2015, 2016, tier="A", scope="[9]"),              # scoped, independent
        ],
    )
    conn.executemany(
        "INSERT INTO ground_truth_vendors (id, case_id, vendor_id, is_false_positive) VALUES (?,?,?,?)",
        [(1, 104, 1544, 0), (2, 500, 20, 0), (3, 501, 21, 0), (4, 600, 22, 0), (5, 700, 23, 0), (6, 501, 24, 1)],
    )
    conn.executemany("INSERT INTO vendors VALUES (?, NULL)", [(v,) for v in (1544, 20, 21, 22, 23, 24)])
    conn.executemany(
        "INSERT INTO contracts VALUES (?,?,?,?)",
        [(10 + y - 2005, 1544, 1, y) for y in range(2005, 2026)] + [(90, 23, 9, 2015), (91, 23, 8, 2015)],
    )
    conn.executemany(
        "INSERT INTO ground_truth_contracts (id, case_id, contract_id, evidence_tier) VALUES (?,?,?,?)",
        [(1, 104, 20, "direct"), (2, 104, 21, "L3_portfolio_swept"), (3, 700, 90, "L3_portfolio_swept"),
         (4, 700, 91, "L3_portfolio_swept"), (5, 500, 12, "L1_audit_attested")],
    )
    conn.commit()
    yield conn
    conn.close()


def _training_positive_years(conn, vendor_id):
    """Run the shipped training label path (_v09 gt_links -> positives) and return labelled years."""
    links = v09_build.gt_links(conn)
    c = pd.read_sql("SELECT id AS contract_id, vendor_id, institution_id, contract_year FROM contracts", conn)
    pos = v09_train.positives(c, links)
    return sorted(c.loc[pos["row"][pos["vendor_id"] == vendor_id], "contract_year"])


@pytest.mark.no_db
def test_training_labels_use_the_l1_corrected_window(db):
    assert _training_positive_years(db, 1544) == list(range(2005, 2026))  # the bug: whole book
    migrate(db)
    assert _training_positive_years(db, 1544) == list(range(2009, 2020))


@pytest.mark.no_db
def test_migration_is_idempotent(db):
    first = migrate(db)
    assert (first["windows_fixed"], first["origin_retagged"], first["source_windowed"], first["excluded_no_window"]) == (1, 1, 1, 1)
    snap = db.execute("SELECT * FROM ground_truth_cases ORDER BY id").fetchall()
    second = migrate(db)
    assert (second["windows_fixed"], second["origin_retagged"], second["source_windowed"], second["excluded_no_window"]) == (0, 0, 0, 0)
    assert db.execute("SELECT * FROM ground_truth_cases ORDER BY id").fetchall() == snap
    assert second["tiers"] == first["tiers"]


@pytest.mark.no_db
def test_aria_cited_media_cases_become_model_discovery(db):
    migrate(db)
    origin = dict(db.execute("SELECT id, case_origin FROM ground_truth_cases"))
    assert origin[500] == "model_discovery"
    assert origin[501] == "media_report"


@pytest.mark.no_db
def test_no_window_cases_get_source_window_or_are_excluded(db):
    migrate(db)
    rows = {r[0]: r[1:] for r in db.execute(
        "SELECT id, fraud_year_start, fraud_year_end, exclude_from_training FROM ground_truth_cases")}
    assert rows[365] == (2021, 2021, 0)
    assert rows[600] == (None, None, 1)
    assert rows[104][2] == 0


@pytest.mark.no_db
def test_dry_run_changes_nothing(db):
    before = db.execute("SELECT * FROM ground_truth_cases ORDER BY id").fetchall()
    report = migrate(db, dry_run=True)
    assert report["windows_fixed"] == 1
    assert db.execute("SELECT * FROM ground_truth_cases ORDER BY id").fetchall() == before


@pytest.mark.no_db
def test_label_tiers(db):
    migrate(db)
    v = dict(db.execute("SELECT id, label_tier FROM ground_truth_vendors"))
    assert v == {1: "C", 2: "D", 3: "C", 4: "D", 5: "B", 6: None}  # 6 is a false positive
    t = dict(db.execute("SELECT id, label_tier FROM ground_truth_contracts"))
    # direct evidence -> A; scoped case & contract at the named buyer -> B; other buyer -> C;
    # an «L1_audit_attested» stub on a self-cited case is still D.
    assert t == {1: "A", 2: "C", 3: "B", 4: "C", 5: "D"}


# --- integration: real GT from a copy -------------------------------------------------------

def _real_gt_copy(tmp_path):
    from api.dependencies import DB_PATH

    if not DB_PATH.exists():
        pytest.skip("no DATABASE_PATH")
    conn = sqlite3.connect(tmp_path / "real_gt.db", uri=True)
    conn.execute(f"ATTACH 'file:{DB_PATH.as_posix()}?mode=ro' AS s")
    tables = conn.execute(
        "SELECT name, sql FROM s.sqlite_master WHERE type='table' AND name LIKE 'ground_truth_%'").fetchall()
    if "ground_truth_cases" not in {n for n, _ in tables}:
        pytest.skip("DATABASE_PATH has no ground_truth_cases")
    for n, sql in tables:  # keep the real schema (primary keys) so the tier UPDATE stays indexed
        conn.execute(sql)
        conn.execute(f"INSERT INTO main.{n} SELECT * FROM s.{n}")
    conn.execute("CREATE TABLE vendors (id INTEGER PRIMARY KEY, vendor_kind TEXT)")
    conn.execute("INSERT INTO vendors SELECT id, vendor_kind FROM s.vendors")
    conn.execute("CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, institution_id INTEGER, contract_year INTEGER)")
    conn.execute("""INSERT INTO contracts SELECT id, vendor_id, institution_id, contract_year FROM s.contracts
                    WHERE id IN (SELECT contract_id FROM s.ground_truth_contracts) OR vendor_id = 1544""")
    conn.commit()
    conn.execute("DETACH s")
    return conn


def test_real_gt_counts(tmp_path):
    conn = _real_gt_copy(tmp_path)
    r = migrate(conn)
    assert r["windows_fixed"] == 20
    assert r["origin_retagged"] == 261
    assert (r["source_windowed"], r["excluded_no_window"]) == (1, 60)
    assert r["tiers"]["ground_truth_contracts"]["A"] == 8
    # Ralca (case 104, vendor 1544): training positives only inside the corrected 2009–2019 window
    years = _training_positive_years(conn, 1544)
    assert years and min(years) >= 2009 and max(years) <= 2019
    assert migrate(conn)["windows_fixed"] == 0
