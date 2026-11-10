"""scripts/precompute_predictions.py + GET /predictions/* (docs/PREDICTIONS_RESEARCH_2026-11-06.md).

    cd backend && python -m pytest tests/test_predictions.py -q -p no:cacheprovider
"""
import json
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.cache import app_cache
from api.dependencies import get_db_dep
from api.routers.predictions import router
import scripts.precompute_predictions as pp
from scripts.precompute_predictions import (STAT_KEY, backtest, blend, build, decile_rate, forecast, pair_rates, streak,
                                            triple_features, vendor_features)

PF_RFC = "PELJ800101AB1"  # 13 chars → persona física


@pytest.mark.no_db
def test_blend_and_forecast():
    assert blend([40.0, 50.0, 60.0]) == 55.0  # ½·60 + ½·50
    c = {2023: (100, 40), 2024: (100, 50), 2025: (100, 60)}
    f = forecast(c, 2025)
    assert f == {"point": 55.0, "low": 45.0, "high": 65.0, "last_share": 60.0, "n_last": 100}
    assert forecast({2023: (100, 98), 2024: (100, 99), 2025: (100, 100)}, 2025)["high"] == 100.0  # clamped
    assert forecast({**c, 2024: (29, 10)}, 2025) is None  # thin year → no forecast


@pytest.mark.no_db
def test_backtest_scores_the_same_method():
    inst = {1: {2021: (50, 10), 2022: (50, 10), 2023: (50, 10), 2024: (50, 10)},   # 20 → 20, err 0
            2: {2021: (50, 0), 2022: (50, 0), 2023: (50, 0), 2024: (50, 25)}}      # 0 → 50, err 50
    assert backtest(inst, 2024) == {"year": 2024, "n": 2, "mae": 25.0, "within_band": 0.5}


@pytest.mark.no_db
def test_streak_and_pair_rates():
    assert streak({2023, 2024, 2025}, 2025) == 3
    assert streak({2022, 2025}, 2025) == 1
    assert streak({2024}, 2025) == 0
    py = {(1, 1): {2022, 2023, 2024}, (2, 1): {2022, 2023}, (3, 1): {2023, 2024}, (4, 1): {2023}, (5, 1): {2024}}
    r = pair_rates(py, 2023)
    assert r["repeat"] == {"n": 2, "rate": 0.5} and r["first"] == {"n": 2, "rate": 0.5}
    assert r["all"] == {"n": 4, "rate": 0.5} and r["test"] == "2023→2024"


_MODEL = {"mu": [0.0] * 5, "sd": [1.0] * 5, "coef": [0.0] * 5, "intercept": 0.0, "edges": [0.1 * k for k in range(1, 10)],
          "rates": [0.6 + 0.04 * k for k in range(10)], "n_test": 100, "base": 0.8, "auc": 0.7, "test": "2023→2024"}


def _build_no_models(c):
    """build() with the sklearn part stubbed (the in-memory fixture is too small to fit)."""
    real = pp.build_specific
    pp.build_specific = lambda conn: {"vendor": {**_MODEL, "main_buyer_stays": {"rate": 0.77, "n": 9}, "dep90_stays": {"rate": 0.83, "n": 9}},
                                      "contract": {**_MODEL, "mu": [0.0] * 4, "sd": [1.0] * 4, "coef": [0.0] * 4},
                                      "category": {"units": {"7": {"share": 40.0, "suppliers": 12}}, "top_stays": 0.15, "top_n": 70,
                                                   "share_within_band": 0.86, "share_n": 69, "suppliers_within_25": 0.86, "suppliers_n": 71,
                                                   "suppliers_year": 2024, "test": "2023→2024", "sub_top_stays": {"stay": 0.16, "n": 112, "test": "2023→2024"}}}
    try:
        return build(c)
    finally:
        pp.build_specific = real


@pytest.mark.no_db
def test_specific_pure_functions():
    assert vendor_features({1: (2, 100.0, 1, 2)}) is None                      # < 3 contracts
    x = vendor_features({1: (3, 900.0, 3, 3), 2: (1, 100.0, 0, 1)})
    assert x[2] == 0.75 and x[3] == 2.0 and x[4] == 0.9                         # direct share, buyers, top share
    assert triple_features((1, 0.0, 0, 0), True) == [pytest.approx(0.6931, abs=1e-3), 0.0, 0.0, 1.0]
    assert decile_rate(_MODEL, x) == (5, 0.8)                                   # z=0 → p=0.5 → decile 5


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_year INT, amount_mxn REAL, is_direct_award INT,
        vendor_id INT, institution_id INT, source_structure TEXT, category_id INT DEFAULT 7);
      CREATE TABLE vendors (id INT PRIMARY KEY, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT);
      INSERT INTO institutions VALUES (10, 'INSTITUTO UNO');
      CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP);
      INSERT INTO vendors VALUES (1, 0, 'ABC010101AB1'), (2, 0, NULL), (3, 0, 'PELJ800101AB1');
    """)
    rows, k = [], 0
    for y in range(2021, 2026):           # institution 10: 40 contracts a year, 20 direct → 50 %
        for j in range(40):
            k += 1
            rows.append((k, y, 1e5, int(j < 20), 1, 10, 'D'))
    rows += [(k + 1, 2025, 1e5, 1, 2, 10, 'D'), (k + 2, 2025, 2e11, 1, 2, 20, 'D'),  # > 100B rejected
             (k + 3, 2024, 1e5, 1, 3, 10, 'D'), (k + 4, 2025, 1e5, 1, 2, 30, 'E')]  # ComprasMX excluded
    c.executemany("INSERT INTO contracts (id, contract_year, amount_mxn, is_direct_award, vendor_id, institution_id, source_structure) VALUES (?,?,?,?,?,?,?)", rows)
    p = _build_no_models(c)
    c.execute("INSERT INTO precomputed_stats VALUES (?,?,?)", (STAT_KEY, json.dumps(p), p["computed_at"]))
    return c, p


@pytest.mark.no_db
def test_endpoints_in_memory():
    c, p = _db()
    assert p["institutions"]["10"]["point"] == 51.0  # 2024–25 carry 21 of 41 direct
    assert "20" not in p["institutions"] and "30" not in p["institutions"]
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: c
    app_cache.get_cache("predictions", 4, 3600).clear()
    cl = TestClient(app)
    vd = cl.get("/api/v1/predictions/vendor/1").json()
    assert vd["available"] and vd["rate"] == 0.8 and vd["top_buyer"]["id"] == 10 and vd["dep90"]  # all its money: IU
    assert cl.get("/api/v1/predictions/vendor/3").json()["reason"] == "persona_fisica"
    ct = cl.get("/api/v1/predictions/contract/1").json()   # vendor 1 · inst 10 · cat 7, signed 2024 and 2025
    assert ct["available"] and ct["rate"] == 0.8
    assert cl.get("/api/v1/predictions/contract/2").json()["available"]
    kc = cl.get("/api/v1/predictions/category/7").json()
    assert kc["available"] and kc["suppliers"] == 12 and kc["top_stays"] == 0.15
    assert cl.get("/api/v1/predictions/category/8").json()["available"] is False
    i = cl.get("/api/v1/predictions/institution/10").json()
    assert i["available"] and i["band"] == 10 and i["target_year"] == 2026
    assert cl.get("/api/v1/predictions/institution/99").json()["reason"] == "thin"
    a = cl.get("/api/v1/predictions/pair", params={"vendor_id": 1, "institution_id": 10}).json()
    assert a["available"] and a["pair_class"] == "repeat" and a["streak"] == 5
    b = cl.get("/api/v1/predictions/pair", params={"vendor_id": 2, "institution_id": 10}).json()
    assert b["available"] and b["pair_class"] == "first"
    assert cl.get("/api/v1/predictions/pair", params={"vendor_id": 2, "institution_id": 20}).json()["reason"] == "no_data"
    pf = cl.get("/api/v1/predictions/pair", params={"vendor_id": 3, "institution_id": 10}).json()
    assert pf == {**{k: pf[k] for k in ("last_year", "target_year", "data_through")}, "available": False, "reason": "persona_fisica"}
    assert "rfc" not in json.dumps(pf).lower()
    assert cl.get("/api/v1/predictions/pair", params={"vendor_id": 999, "institution_id": 10}).status_code == 404
    app_cache.get_cache("predictions", 4, 3600).clear()


def test_real_db_institution_and_pair(client):
    from api.dependencies import get_db
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM precomputed_stats WHERE stat_key = ?", (STAT_KEY,)).fetchone():
            pytest.skip("predictions not precomputed on this DB")
    app_cache.get_cache("predictions", 4, 3600).clear()
    r = client.get("/api/v1/predictions/institution/251").json()  # IMSS
    assert r["available"] and 0 <= r["low"] <= r["point"] <= r["high"] <= 100
    assert 0.5 <= r["backtest"]["within_band"] <= 1
    k = client.get("/api/v1/contracts/2915511").json()
    pr = client.get("/api/v1/predictions/pair", params={"vendor_id": k["vendor_id"], "institution_id": k["institution_id"]}).json()
    assert pr["reason"] in (None, "not_recent", "persona_fisica")


def test_real_db_specific(client):
    from api.dependencies import get_db
    with get_db() as conn:
        row = conn.execute("SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (STAT_KEY,)).fetchone()
    if not row or '"vendor"' not in row[0]:
        pytest.skip("specific predictions not precomputed on this DB")
    app_cache.get_cache("predictions", 4, 3600).clear()
    k = client.get("/api/v1/predictions/category/20").json()
    assert 0.7 <= k["share_within_band"] <= 1 and 0 < k["top_stays"] < 0.5
    c = client.get("/api/v1/predictions/contract/2991030").json()
    assert c["reason"] == "persona_fisica" and "rate" not in c
    c = client.get("/api/v1/predictions/contract/2915511").json()
    assert c["reason"] in (None, "not_recent")


def test_real_db_sub_churn_matches_independent_sql(client):
    """The stored subcategory churn equals a window-function SQL written separately (same rule)."""
    from api.dependencies import get_db
    with get_db() as conn:
        row = conn.execute("SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (STAT_KEY,)).fetchone()
        stored = (json.loads(row[0]).get("category") or {}).get("sub_top_stays") if row else None
        if not stored or stored.get("src"):
            pytest.skip("computed subcategory churn not precomputed on this DB")
        rate, n = conn.execute("""
            WITH m AS (SELECT cs.subcategory_id s, c.contract_year y, c.vendor_id v, SUM(c.amount_mxn) a, COUNT(*) n
                       FROM contracts c JOIN contract_subcategory cs ON cs.contract_id = c.id
                       JOIN subcategory_definitions sd ON sd.id = cs.subcategory_id AND COALESCE(sd.is_catch_all, 0) = 0
                       WHERE c.amount_mxn > 0 AND c.amount_mxn <= 100000000000 AND c.source_structure <> 'E'
                         AND c.vendor_id IS NOT NULL AND c.contract_year IN (2023, 2024) GROUP BY 1, 2, 3),
                 k AS (SELECT s, y, SUM(n) n, COUNT(*) nv FROM m GROUP BY 1, 2),
                 r AS (SELECT s, y, v, ROW_NUMBER() OVER (PARTITION BY s, y ORDER BY a DESC) rk FROM m)
            SELECT AVG(r1.v = r2.v), COUNT(*) FROM r r1
            JOIN r r2 ON r2.s = r1.s AND r2.y = 2024 AND r2.rk = 1
            JOIN k k1 ON k1.s = r1.s AND k1.y = 2023 JOIN k k2 ON k2.s = r1.s AND k2.y = 2024
            WHERE r1.y = 2023 AND r1.rk = 1 AND k1.n >= 20 AND k2.n >= 20 AND k1.nv >= 3 AND k2.nv >= 3""").fetchone()
    assert stored["n"] == n
    assert stored["stay"] == pytest.approx(rate, abs=0.005)
