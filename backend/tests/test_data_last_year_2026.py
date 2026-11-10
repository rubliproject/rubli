"""Year series reach the data cut (DATA_LAST_YEAR), not a frozen 2025.

docs/OWNER_REVIEW_2026-10-28.md: «I still don't see any data from 2026». ComprasMX rows
(source_structure 'E') are the only source after 2025-09-28; every precompute that builds a
per-year series must carry them through DATA_LAST_YEAR. In-memory fixtures: no full DB needed.
"""
import sqlite3

import pytest

from api.config.constants import DATA_LAST_YEAR



def _db():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("""CREATE TABLE contracts (id INTEGER PRIMARY KEY, category_id INT, sector_id INT, vendor_id INT,
                 contract_year INT, contract_month INT, contract_date TEXT, award_date TEXT, start_date TEXT,
                 amount_mxn REAL, risk_score REAL, is_direct_award INT, is_single_bid INT,
                 procedure_type_normalized TEXT, source_structure TEXT)""")
    c.execute("CREATE TABLE category_stats (category_id INT, sector_id INT, direct_award_pct REAL, "
              "single_bid_pct REAL, total_contracts INT)")
    rows = [(1, 1, 1, 2024, 12, "2024-12-03", 5e6, "D"),
            (1, 1, 1, 2025, 12, "2025-12-10", 7e6, "E"),
            (1, 1, 1, DATA_LAST_YEAR, 3, f"{DATA_LAST_YEAR}-03-02", 9e6, "E")]
    c.executemany("INSERT INTO contracts (category_id, sector_id, vendor_id, contract_year, contract_month, "
                  "contract_date, amount_mxn, source_structure, risk_score, is_direct_award, is_single_bid) "
                  "VALUES (?,?,?,?,?,?,?,?,0.3,1,0)", rows)
    return c


@pytest.mark.no_db
def test_category_yearly_stats_reach_data_last_year():
    from scripts.compute_category_stats import compute_category_yearly_stats
    c = _db()
    compute_category_yearly_stats(c)
    years = [r[0] for r in c.execute("SELECT year FROM category_yearly_stats ORDER BY year")]
    assert years == [2024, 2025, DATA_LAST_YEAR]


@pytest.mark.no_db
def test_category_competition_trend_reaches_data_last_year():
    from scripts._precompute_category_signals import compute_competition
    d = compute_competition(_db().cursor(), 1, "x")
    assert [y["year"] for y in d["yearly_trend"]][-1] == DATA_LAST_YEAR


@pytest.mark.no_db
def test_category_december_series_stops_at_last_complete_year():
    # December share of a year whose December has not happened is not a measurement.
    from scripts._precompute_category_signals import compute_seasonality
    d = compute_seasonality(_db().cursor(), 1, "x")
    assert [y["year"] for y in d["yearly_december"]] == [2024, 2025]


@pytest.mark.no_db
def test_category_sexenio_sheinbaum_includes_comprasmx_2026():
    from scripts.precompute_category_sexenio import build
    c = _db()
    c.execute("CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, rfc TEXT, is_individual INT)")
    c.execute("INSERT INTO vendors VALUES (1, 'ACME SA DE CV', NULL, 0)")
    shein = [r for r in build(c) if r[0] == "sheinbaum"]
    assert [(r[5], r[4]) for r in shein] == [(3, 21e6)]  # Dec 2024 (D) + Dec 2025 (E) + Mar 2026 (E)


@pytest.mark.slow
def test_stats_database_total_is_the_public_register(client):
    # One definition for every headline count (overview, year rows, risk levels, /stats/database):
    # 3,178,884 vs 3,180,245 vs 3,180,272 on prod before (docs/OWNER_REVIEW_2026-10-28.md).
    from api.config.constants import PUBLIC_REGISTER_SQL
    from api.dependencies import DB_PATH
    r = client.get("/api/v1/stats/database")
    assert r.status_code == 200, r.text
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
        n = c.execute(f"SELECT COUNT(*) FROM contracts WHERE {PUBLIC_REGISTER_SQL}").fetchone()[0]
    assert r.json()["total_contracts"] == n
