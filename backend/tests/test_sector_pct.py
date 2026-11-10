"""Sector-relative percentile (docs/BIAS_AUDIT_SECTOR_2026-11-09.md § 8 rec. 1): where a contract / vendor sits
WITHIN ITS OWN SECTOR, shown next to the absolute indicator.

Pins: PERCENT_RANK() OVER (PARTITION BY sector_id ORDER BY risk_score) — 0 = lowest of its sector, 1 = highest;
unscored contracts get no row; the same absolute score ranks differently in different sectors; the build is
idempotent; an absent table (prod before the job) answers None, never an error.
"""
import sqlite3

import pytest

from api.sector_pct import contract_sector_pct, pct_rank
from scripts.precompute_sector_pct import build


def _contracts(rows):
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (id INT, sector_id INT, risk_score REAL)")
    c.executemany("INSERT INTO contracts VALUES (?, ?, ?)", rows)
    return c


@pytest.mark.no_db
def test_ranks_within_each_sector_and_skips_unscored():
    c = _contracts([(1, 1, 0.1), (2, 1, 0.2), (3, 1, 0.3), (4, 1, 0.4), (5, 1, 0.5),
                    (6, 2, 0.9), (7, 2, 0.95), (8, 2, None), (9, None, 0.7)])
    assert build(c) == 7
    got = {i: contract_sector_pct(c, i) for i in range(1, 10)}
    assert got == {1: 0.0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0, 6: 0.0, 7: 1.0, 8: None, 9: None}
    # 0.9 is the bottom of sector 2 while 0.5 tops sector 1: the rank is sector-relative, not absolute
    assert got[6] < got[5]


@pytest.mark.no_db
def test_build_is_idempotent():
    c = _contracts([(1, 1, 0.1), (2, 1, 0.2)])
    assert build(c) == 2
    c.execute("UPDATE contracts SET risk_score = 0.05 WHERE id = 2")  # a rescore → rerun the job
    assert build(c) == 2
    assert contract_sector_pct(c, 2) == 0.0 and contract_sector_pct(c, 1) == 1.0
    assert c.execute("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'contract_sector_pct%'").fetchone()[0] == 1


@pytest.mark.no_db
def test_absent_table_is_none_not_an_error():
    assert contract_sector_pct(sqlite3.connect(":memory:"), 1) is None


@pytest.mark.no_db
def test_pct_rank_matches_percent_rank():
    vals = [0.1, 0.2, 0.2, 0.4]
    assert [pct_rank(vals, v) for v in vals] == [0.0, 1 / 3, 1 / 3, 1.0]
    assert pct_rank([0.3], 0.3) == 0.0
    assert pct_rank([], 0.3) is None


# ── on the real DB
def test_detail_endpoints_carry_sector_pct(client):
    from api.dependencies import DB_PATH
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as db:
        loaded = db.execute("SELECT 1 FROM sqlite_master WHERE name='contract_sector_pct'").fetchone() is not None
        cid = db.execute("SELECT id FROM contracts WHERE risk_score IS NOT NULL AND sector_id = 1 LIMIT 1").fetchone()[0]
    d = client.get(f"/api/v1/contracts/{cid}").json()
    assert "sector_pct" in d
    if loaded:
        assert 0.0 <= d["sector_pct"] <= 1.0
    v = client.get(f"/api/v1/vendors/{d['vendor_id']}").json()
    assert v["sector_pct"] is None or 0.0 <= v["sector_pct"] <= 1.0
