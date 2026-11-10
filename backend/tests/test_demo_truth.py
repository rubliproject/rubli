"""docs/DEMO_TRUTHCHECK_2026-11-07.md: (1) «caso» only for a documented case; (2) a flagged amount never makes a leader.

    cd backend && python -m pytest tests/test_demo_truth.py -q -p no:cacheprovider
"""
import sqlite3

import pytest

from api.cache import app_cache
from api.services.category_panorama import build_category_panorama


@pytest.mark.no_db
def test_flagged_row_listed_but_never_the_leader():
    """Shape of contract 3200202 (Birmex → Liomont, 35,175 MDP vaccine, > 10B): it stays in the register,
    marked, and the supplier ranking, totals and shares are computed without it."""
    c = sqlite3.connect(":memory:")
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, title TEXT, vendor_id INT, institution_id INT, category_id INT,
        contract_year INT, contract_date TEXT, amount_mxn REAL, is_direct_award INT, risk_score REAL, source_structure TEXT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT, siglas TEXT);
      INSERT INTO vendors VALUES (5203, 'LABORATORIOS LIOMONT SA DE CV', 0, NULL), (7, 'OTRA FARMA SA DE CV', 0, NULL);
      INSERT INTO institutions VALUES (2066, 'BIRMEX', 'BIRMEX');
      INSERT INTO contracts VALUES
        (3200202, 'VACUNA SARS-COV-2', 5203, 2066, 20, 2026, '2026-09-12', 35175000000, 1, 0.9, 'E'),
        (1, 'PARACETAMOL', 7, 2066, 20, 2025, '2025-03-01', 900000000, 0, 0.1, 'D'),
        (2, 'IBUPROFENO', 5203, 2066, 20, 2025, '2025-04-01', 100000000, 1, 0.1, 'D');
    """)
    app_cache.get_cache("public_labels_spikes", 4096, 3600).clear()
    p = build_category_panorama(c, 20, since="2024-10-01")
    assert p["suppliers"][0]["vendor_id"] == 7                       # not Liomont because of that row
    assert p["amount_mxn"] == pytest.approx(1_000_000_000)           # the 35 bn is out of the total
    k = {r["id"]: r for r in p["top_contracts"]}
    assert k[3200202]["amount_flag"] == "review" and k[1]["amount_flag"] is None   # still listed, marked


def test_contract_context_case_claims(client):
    """DLG Industrias (33716) has only an unverified lead → never «caso»; vendor 4249 has a documented case."""
    k = client.get("/api/v1/contracts/2915511/context").json()
    st = k.get("vendor_standing")
    if not st:
        pytest.skip("vendor 33716 not in aria_queue on this DB")
    assert st["in_ground_truth"] is False and st["has_unverified_lead"] is True
    assert client.get("/api/v1/vendors/33716/ground-truth-status").json()["is_known_bad"] is False
    st = client.get("/api/v1/contracts/10005/context").json()["vendor_standing"]   # vendor 4249
    assert st["in_ground_truth"] is True and st["has_unverified_lead"] is False
