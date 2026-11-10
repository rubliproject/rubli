"""docs/audit_2026-11-07/AUDIT_DATA.md: a flagged amount never leads a headline (A3); «La columna» stops at the
CompraNet cut (A9).

    cd backend && python -m pytest tests/test_audit_data.py -q -p no:cacheprovider
"""
import sqlite3

import pytest

from api.cache import app_cache
from api.routers.executive import _query_top_vendors
from scripts import precompute_sexenios_columna as col


def _db():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, title TEXT, vendor_id INT, institution_id INT, sector_id INT,
        contract_year INT, contract_date TEXT, amount_mxn REAL, is_direct_award INT, risk_score REAL, source_structure TEXT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT);
      CREATE TABLE vendor_stats (vendor_id INT, total_contracts INT, total_value_mxn REAL, avg_risk_score REAL);
      INSERT INTO vendors VALUES (1, 'OPERADORA CICSA SA DE CV', 0, NULL), (2, 'OTRA CONSTRUCTORA SA DE CV', 0, NULL);
      INSERT INTO institutions VALUES (10, 'ARTF'), (11, 'IMSS');
      INSERT INTO contracts VALUES
        (3082054, 'TREN', 1, 10, 3, 2025, '2025-09-30', 27500000000, 0, 0.3, 'D'),   -- > 10B and past the cut
        (3082000, 'TREN 2', 1, 10, 3, 2025, '2025-05-02', 26000000000, 0, 0.3, 'D'),  -- > 10B, inside the cut
        (1, 'OBRA', 1, 10, 3, 2025, '2025-03-01', 100000000, 0, 0.3, 'D'),
        (2, 'OBRA', 2, 11, 3, 2025, '2025-04-01', 2000000000, 1, 0.7, 'D');
      INSERT INTO vendor_stats VALUES (1, 3, 53600000000, 0.3), (2, 1, 2000000000, 0.7);
    """)
    app_cache.get_cache("public_labels_spikes", 4096, 3600).clear()
    return c


@pytest.mark.no_db
def test_executive_received_the_most_skips_flagged_amounts():
    top = _query_top_vendors(_db().cursor())
    assert top[0]["id"] == 2                                   # not Cicsa on two > 10B rows
    cicsa = next(v for v in top if v["id"] == 1)
    assert cicsa["value_billions"] == pytest.approx(0.1) and cicsa["flagged_billions"] == pytest.approx(53.5)


@pytest.mark.no_db
def test_columna_cut_and_leaders():
    d = col.compute(_db())
    y = next(r for r in d["years"] if r["year"] == 2025)
    assert y["value"] == pytest.approx(28_100_000_000)         # 30 Sep row is past the cut; flagged 26B stays in the total
    assert y["vendors"][0]["id"] == 2                          # but never leads
    k = {c["id"]: c for c in y["top_contracts"]}
    assert 3082054 not in k and k[3082000]["flag"] and k[3082000]["amount_flag"] == "review" and not k[2]["flag"]
    t = next(t for t in d["terms"] if t["key"] == "sheinbaum")
    assert t["vendors"][0]["id"] == 2 and t["institutions"][0]["id"] == 11
