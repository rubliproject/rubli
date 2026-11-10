"""DQ1 § 2 review: procedure-type shares are unknown before 2011 and stay None end to end."""
import sqlite3

import pytest

from api.config.constants import PROCEDURE_TYPE_FIRST_YEAR, proc_den, proc_known
from api.helpers.analysis_helpers import pp_delta, rnd, single_award_of_competitive
from scripts import _refresh_stats_tables as R


@pytest.mark.no_db
def test_helpers_keep_unknown():
    assert PROCEDURE_TYPE_FIRST_YEAR == 2011
    assert proc_den("c.x", "c.contract_year") == "NULLIF(COUNT((CASE WHEN c.contract_year >= 2011 THEN c.x END)), 0)"
    assert rnd(None) is None and rnd(12.345, 1) == 12.3
    assert pp_delta(None, 3.0) is None and pp_delta(5.0, None) is None and pp_delta(5.0, 3.0) == 2.0
    assert single_award_of_competitive(None, 40.0) is None


@pytest.mark.no_db
def test_precompute_stats_rnd():
    from scripts.precompute_stats import _rnd
    assert _rnd(None, 2) is None and _rnd(1.234, 2) == 1.23


@pytest.mark.no_db
def test_stats_tables_count_only_coded_years():
    """vendor_stats / institution_stats shares over contract_year >= 2011; a pre-2011-only vendor → NULL."""
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, institution_id INTEGER, sector_id INTEGER,
            contract_year INTEGER, amount_mxn REAL, risk_score REAL, risk_level TEXT,
            is_direct_award INTEGER, is_single_bid INTEGER, mahalanobis_distance REAL);
        INSERT INTO contracts (vendor_id, institution_id, sector_id, contract_year, amount_mxn, is_direct_award, is_single_bid) VALUES
          (1, 1, 1, 2005, 10, NULL, NULL), (1, 1, 1, 2008, 10, NULL, NULL),     -- structure A only
          (2, 1, 1, 2010, 10, 0, 1),                                            -- 2010 B row: not counted
          (2, 1, 1, 2015, 10, 1, 0), (2, 1, 1, 2016, 10, 0, 1);
    """)
    q = (f"SELECT vendor_id, ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 "
         f"THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) FROM contracts GROUP BY 1 ORDER BY 1")
    assert c.execute(q).fetchall() == [(1, None), (2, 50.0)]
    src = open(R.__file__, encoding="utf-8").read()
    assert src.count("{proc_den('is_direct_award')}") >= 2 and "2011" not in src   # vendor + institution, no literal year


# ---------------------------------------------------------------- API (needs a DB; run with DATABASE_PATH=<prod copy>)
def test_pre_2011_period_has_no_procedure_shares(client, base_url):
    r = client.get(f"{base_url}/analysis/compare-periods",
                   params=dict(period1_start=2003, period1_end=2006, period2_start=2019, period2_end=2022))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["period1"]["direct_award_pct"] is None and d["period1"]["single_bid_pct"] is None
    assert d["period2"]["direct_award_pct"] is not None
    assert d["changes"]["direct_award_pct"] is None and d["changes"]["single_bid_pct"] is None


def test_administration_comparison_fox_is_unknown(client, base_url):
    r = client.get(f"{base_url}/stories/administration-comparison", params={"lang": "es"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["procedure_type_from"] == 2011
    fox = [x for x in d["data"] if x["administration"].startswith("Fox")]
    assert fox and fox[0]["direct_award_pct"] is None


def test_sector_detail_shares_are_numbers_or_none(client, base_url):
    r = client.get(f"{base_url}/sectors/1")
    assert r.status_code == 200, r.text
    st = r.json()["statistics"]
    assert st["direct_award_pct"] is None or 0 <= st["direct_award_pct"] <= 100
