"""/categories and /stats/data-quality count the public register, never more.

docs: _explore/number_audit_2026-10-29.md — /categories printed 3,180,272 «contratos clasificados»
against the register's 3,178,884 (the 1,388 rows the register leaves out: year < 2002, amount <= 0,
> 100B), and /stats/data-quality served a June snapshot (3,059,592, structures A–D, no E).
"""
import sqlite3
import time
from contextlib import contextmanager

import pytest


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript("""
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name_es TEXT, name_en TEXT, sector_id INT, is_active INT);
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, category_id INT, vendor_id INT, institution_id INT,
            sector_id INT, contract_year INT, contract_date TEXT, amount_mxn REAL, risk_score REAL,
            risk_level TEXT, is_direct_award INT, is_single_bid INT, procedure_type TEXT,
            data_quality_score REAL, data_quality_grade TEXT, source_structure TEXT);
        INSERT INTO categories VALUES (1, 'Medicamentos', 'Medicines', 1, 1);
        INSERT INTO vendors VALUES (1, 'ACME');
        INSERT INTO institutions VALUES (1, 'IMSS');
    """)
    rows = [  # (year, amount, structure): 3 register rows + 3 the register leaves out
        (2005, 1e6, "A"), (2024, 2e6, "D"), (2026, 3e6, "E"),
        (2000, 1e6, "A"), (2024, 0, "D"), (2024, 2e11, "D"),
    ]
    c.executemany(
        "INSERT INTO contracts (category_id, vendor_id, institution_id, sector_id, contract_year, contract_date,"
        " amount_mxn, risk_score, risk_level, is_direct_award, is_single_bid, procedure_type,"
        " data_quality_score, data_quality_grade, source_structure)"
        " VALUES (1, 1, 1, 1, ?, '2024-01-01', ?, 0.3, 'medium', 1, 0, 'X', 80, 'B', ?)", rows)
    return c


@pytest.mark.no_db
def test_category_stats_sum_to_the_register():
    from scripts.compute_category_stats import _build_category_stats
    c = _db()
    _build_category_stats(c.cursor(), time.time())
    assert c.execute("SELECT SUM(total_contracts) FROM category_stats").fetchone()[0] == 3


@pytest.mark.no_db
def test_data_quality_scan_counts_the_register_by_source_structure(monkeypatch):
    from api.routers import stats as stats_router
    c = _db()

    @contextmanager
    def fake_db():
        yield c

    monkeypatch.setattr(stats_router, "get_db", fake_db)
    r = stats_router._run_data_quality_scan()
    assert r.total_contracts == 3
    assert {s.structure: s.contract_count for s in r.by_structure} == {"A": 1, "D": 1, "E": 1}
