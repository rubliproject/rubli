"""precompute_rastro: the pack has the bundled rastro.data.json shape, nests, rejects > 100B, refuses a broken
trail; GET /rastro/trail serves the row (404 without it)."""
import json
import sqlite3
from datetime import date
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db_dep
from api.routers.sexenio_actual import router
from scripts.precompute_rastro import EX24, compute

pytestmark = pytest.mark.no_db
BUNDLED = Path(__file__).resolve().parents[2] / "frontend/src/lib/moneyPaths/rastro.data.json"


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.executescript("""
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_number TEXT, title TEXT, amount_mxn REAL, contract_date TEXT,
      contract_year INT, procedure_type TEXT, procedure_number TEXT, start_date TEXT, end_date TEXT, award_date TEXT,
      publication_date TEXT, risk_score REAL, risk_level TEXT, source_structure TEXT, exception_article TEXT,
      institution_id INT, category_id INT, vendor_id INT, is_direct_award INT, is_single_bid INT);
    CREATE TABLE vendors (id INT, name TEXT);
    CREATE TABLE institutions (id INT, siglas TEXT, name TEXT);
    CREATE TABLE aria_queue (vendor_id INT, aria_run_id TEXT, ips_tier INT, computed_at TEXT);
    CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT);
    INSERT INTO vendors VALUES (2873, 'FARMACEUTICOS MAYPO S.A DE C.V'), (1, 'A SA'), (2, 'B SA'), (3, 'C SA');
    INSERT INTO institutions VALUES (251, 'IMSS', 'Instituto Mexicano del Seguro Social'), (228, NULL, 'ISSSTE largo');
    INSERT INTO aria_queue VALUES (2873, 'old', 3, '2026-01-01'), (2873, 'new', 1, '2026-10-22'), (1, 'new', 1, '2026-10-22'), (2, 'new', 2, '2026-10-22');
    """)
    M = 1e6
    rows = [  # id, number, amount, date, year, source, article, inst, cat, vendor, da, sb
        (10, 'C-MAYPO-BIG', 600 * M, '2024-12-31 00:00:00', 2024, 'D', 'ART. 41 FR. III', 251, 20, 2873, 1, 0),
        (11, 'C-MAYPO-S', 100 * M, '2024-06-01', 2024, 'D', 'ART. 41 FR. I', 251, 20, 2873, 1, 0),
        (12, 'C-MAYPO-T', 5 * M, '2024-06-02', 2024, 'D', None, 251, 20, 2873, 0, 1),
        (23, 'C-MAYPO-T2', 1 * M, '2024-06-02', 2024, 'D', None, 251, 20, 2873, 0, 1),   # same procedure as 12
        (13, 'C-A', 8000 * M, '2024-03-01', 2024, 'D', 'ART. 41 FR. III', 251, 20, 1, 1, 0),
        (14, 'C-B', 4000 * M, '2024-03-01', 2024, 'D', 'ART. 41 FR. V', 251, 20, 2, 1, 0),
        (15, 'C-C', 20000 * M, '2024-03-01', 2024, 'D', 'ART. 41 FR. V', 251, 20, 3, 1, 0),
        (16, 'C-C2', 2000 * M, '2024-03-01', 2024, 'D', None, 251, 20, 3, 0, 0),
        (17, 'C-REJ', 2e11, '2024-03-01', 2024, 'D', None, 251, 20, 3, 1, 0),             # > 100B: rejected
        (18, 'C-ISS', 50 * M, '2024-05-01', 2024, 'D', None, 228, 20, 2873, 1, 0),
        (19, 'C-23', 10 * M, '2023-05-01', 2023, 'D', None, 251, 20, 2873, 1, 0),
        (20, 'C-25', 30 * M, '2025-10-01', 2025, 'E', 'ART. 54', 251, 20, 2873, 1, 0),
        (21, 'C-26', 70 * M, '2026-08-07', 2026, 'E', 'ART. 55', 251, 20, 2873, 1, 0),
        (22, 'C-26b', 1 * M, '2026-10-24', 2026, 'E', None, 251, 20, 2873, 1, 0),
    ]
    c.executemany("INSERT INTO contracts (id, contract_number, amount_mxn, contract_date, contract_year, source_structure, exception_article, "
                  "institution_id, category_id, vendor_id, is_direct_award, is_single_bid, procedure_number, title) "
                  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'P-' || ?, 'T')", [r + (12 if r[0] == 23 else r[0],) for r in rows])
    return c


def _shape(x):
    if isinstance(x, dict):
        return {k: _shape(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_shape(x[0])] if x else []
    return None if x is None else ("num" if isinstance(x, (int, float)) and not isinstance(x, bool) else type(x).__name__)


def _same(a, b, path=""):
    """Same keys everywhere; a leaf may be null on one side (e.g. publication_date)."""
    if isinstance(a, dict) and isinstance(b, dict):
        assert a.keys() == b.keys(), (path, set(a) ^ set(b))
        for k in a:
            _same(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        if a and b:
            _same(a[0], b[0], path + "[0]")
    else:
        assert a is None or b is None or a == b, (path, a, b)


def test_pack_shape_values_and_rejection():
    pack, holds = compute(_db(), today=date(2026, 10, 30))
    _same(_shape(json.loads(BUNDLED.read_text(encoding="utf-8"))), _shape(pack))
    assert all(holds.values()), holds
    r = pack["reg24"]
    assert r == {"n": 8, "mdp": 34706.0, "da": 32700.0, "nv": 4}        # the 200B row never counts
    assert pack["c"]["reg"] == pytest.approx(34706e6 / EX24 * 100)
    assert pack["tiers24"] == {"1": {"nv": 2, "mdp": 8700.0}, "2": {"nv": 1, "mdp": 4000.0}}   # latest run, direct awards
    assert pack["maypo"]["tier"] == 1 and pack["maypo"]["imss24"]["da"] == 700.0
    assert pack["nonda"] == {"n": 3, "np": 2, "sb_n": 1}   # two single-bid contracts, one procedure
    assert pack["exc24"][0]["s"] == "fr. V" and pack["exc24"][0]["lbl_en"] == "force majeure: no time to tender"
    assert pack["contract"]["id"] == 10 and pack["contract"]["contract_date"] == "2024-12-31"
    assert pack["maypo"]["buyers24"][1] == {"sig": "ISSSTE largo", "mdp": 50.0}
    assert pack["close"]["n"] == {"2023": 1, "2024": 5, "2025": 1, "2026": 2}
    assert (pack["close"]["last"], pack["close"]["big_date"], pack["close"]["big_mdp"]) == ("2026-10-24", "2026-08-07", 70.0)
    assert pack["cmxp"] == {"n": 3, "mdp": 101.0, "cite": 2} and pack["read"] == "2026-10-30"
    assert [t["id"] for t in pack["top24"]][:3] == [3, 1, 2]


def test_after_beat_names_the_buyer_and_refuses_a_broken_trail():
    c = _db()
    assert compute(c)[0]["close"]["last_sig"] == "IMSS" and compute(c)[0]["close"]["big_sig"] == "IMSS"
    c.execute("UPDATE contracts SET institution_id = 228 WHERE id = 22")   # latest contract now with another buyer
    pack, holds = compute(c)
    assert pack["close"]["last_sig"] == "ISSSTE largo" and holds["nests"]   # named in the copy, not refused
    c.execute("UPDATE contracts SET is_direct_award = 0 WHERE vendor_id = 2873")   # Maypo leaves the direct-award step
    assert compute(c)[1]["nests"] is False


def test_endpoint():
    c = _db()
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: c
    client = TestClient(app)
    assert client.get("/api/v1/rastro/trail").status_code == 404
    pack, _ = compute(c)
    c.execute("INSERT INTO precomputed_stats VALUES ('rastro_trail', ?, datetime('now'))", (json.dumps(pack),))
    r = client.get("/api/v1/rastro/trail")
    assert r.status_code == 200 and r.json()["contract"]["id"] == 10
