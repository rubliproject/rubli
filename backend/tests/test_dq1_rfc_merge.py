"""DQ1 § 3 — one company RFC, one canonical vendor; personas físicas never merged; loader looks up RFC first."""
import sqlite3

import pytest

from scripts import dq1_rfc_merge as M
from scripts.integrate_comprasmx import company_rfc_index, rfc_first

pytestmark = pytest.mark.no_db


def _db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, rfc TEXT, name TEXT);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER, group_size INTEGER, match_basis TEXT);
        CREATE TABLE vendor_stats (vendor_id INTEGER PRIMARY KEY, total_contracts INTEGER);
        CREATE TABLE vendor_rfc_quality (vendor_id INTEGER PRIMARY KEY, best_rfc TEXT, best_rfc_grade TEXT,
                                         db_rfc_reason TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, contract_year INTEGER);
        INSERT INTO contracts (vendor_id, contract_year) VALUES (1, 2012), (2, 2024), (3, 2010), (11, 2016), (12, 2024),
                                                               (13, 2020), (14, 2024);
        INSERT INTO vendors VALUES
          (1, 'ABC010101AA1', 'ABC COMERCIAL SA DE CV'), (2, ' abc010101aa1', 'ABC COMERCIAL S.A.'),        -- split company RFC
          (3, 'ABC010101AA1', 'ABC COMERCIAL SA'),                                           -- already folded into 1
          (4, 'GOMA800101AB1', 'JUAN GOMEZ'), (5, 'GOMA800101AB1', 'JUAN GOMEZ M'),     -- persona física: never
          (6, 'XYZ020202BB2', 'XYZ SA'), (7, 'XYZ020202BB2', 'XYZ SC'),                 -- contradicted by grade A
          (8, 'QRS030303CC3', 'QRS SA'), (9, 'MNO050505EE5', 'MNO SA'), (10, 'MNO050505EE5', 'TOTALLY DIFFERENT NAME SC'),
          (11, 'PME190416TS6', 'PROVECTUS MEXICO SA'), (12, 'PME190416TS6', 'PROVECTUS MEXICO SA DE CV'),  -- RFC of 2019, vendor active 2016
          (13, 'JKL150101FF6', 'JKL SA'), (14, 'JKL150101FF6', 'JKL SA DE CV');                            -- flagged name_inconsistent
        INSERT INTO vendor_canonical VALUES (1, 1, 2, 'name'), (3, 1, 2, 'name');
        INSERT INTO vendor_stats VALUES (1, 50), (2, 900), (6, 1), (7, 1), (8, 3);
        INSERT INTO vendor_rfc_quality VALUES (7, 'XYZ020202BB9', 'A', NULL), (13, NULL, 'C', 'name_inconsistent');
    """)
    return c


def test_merge_plan_apply_rollback():
    c = _db()
    p = M.plan(c)
    assert p["rfcs"] == 1 and p["skipped"]["contradicted_by_grade_a"] == 1
    assert p["skipped"]["name_mismatch"] == 1                 # same RFC, unrelated names → analyst, not merged
    assert p["skipped"]["rfc_after_first_contract"] == 1      # Provectus: RFC dated 2019, contracting since 2016
    assert p["skipped"]["name_inconsistent"] == 1             # vendor_rfc_quality says the RFC does not fit the name
    assert p["groups"] == [(2, [1, 2])]                       # survivor = most contracts
    assert {v: r[0] for v, r in p["rows"].items()} == {1: 2, 2: 2, 3: 2}
    M.apply(c, p)
    got = dict(c.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    assert got == {1: 2, 2: 2, 3: 2}
    assert 4 not in got and 5 not in got and 6 not in got
    assert M.plan(c)["rfcs"] == 0                            # idempotent
    M.rollback(c)
    assert dict(c.execute("SELECT vendor_id, canonical_id FROM vendor_canonical")) == {1: 1, 3: 1}


def test_loader_rfc_first():
    c = _db()
    vcanon = dict(c.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    idx = company_rfc_index(c, vcanon)
    assert rfc_first(idx, "QRS030303CC3") == 8               # existing company → reuse, no new row
    assert rfc_first(idx, "GOMA800101AB1") is None           # persona física never matched on RFC here
    assert rfc_first(idx, "ABC010101AA1") is None            # still two canonical ids → not guessed
    assert rfc_first(idx, "NEW040404DD4") is None


def test_provectus_denylist_never_merges():
    c = _db()
    c.executescript("""
        INSERT INTO vendors VALUES (165033, 'PME190416TS6', 'PROVECTUS MEXICO SA'), (245667, 'PME190416TS6', 'PROVECTUS MEXICO SA DE CV');
        INSERT INTO contracts (vendor_id, contract_year) VALUES (165033, 2020), (245667, 2021);  -- would pass every other rule
    """)
    p = M.plan(c)
    assert p["skipped"]["denylisted"] == 1
    assert not any({165033, 245667} <= set(m) for _, m in p["groups"])
    assert p["watch"] == []


def test_rfc_year_floor_and_typo_years():
    c = _db()
    c.executescript("""
        INSERT INTO vendors VALUES (50, 'OLD000101AA1', 'OLD SA'), (51, 'OLD000101AA1', 'OLD SA DE CV');
        INSERT INTO contracts (vendor_id, contract_year) VALUES (50, 222), (51, 2005);   -- 222 is a typo year, ignored
    """)
    p = M.plan(c)
    assert (2, [1, 2]) in p["groups"] and any(50 in m for _, m in p["groups"])   # RFC 2000 <= first real year 2005


def test_rollback_never_applied_is_noop():
    c = _db()
    before = sorted(c.execute("SELECT * FROM vendor_canonical"))
    assert M.rollback(c) == 0 and M.rollback(c) == 0
    assert sorted(c.execute("SELECT * FROM vendor_canonical")) == before
    M.apply(c, M.plan(c))
    assert M.rollback(c) == 3 and M.rollback(c) == 0          # second rollback after a real one: no-op too
