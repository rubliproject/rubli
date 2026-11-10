"""scripts/precompute_sexenios_columna.py + GET /sexenios/columna on a crafted in-memory DB.

    python -m pytest backend/tests/test_sexenios_columna.py -q -p no:cacheprovider
"""
import json
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db_dep
from api.routers.sexenio_actual import router
from scripts.precompute_sexenios_columna import compute, write

PF_NAME, PF_RFC = "JUAN PEREZ LOPEZ", "PELJ800101AB1"  # 13 chars → persona física
pytestmark = pytest.mark.no_db


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_date TEXT, contract_year INT, amount_mxn REAL,
        is_direct_award INT, risk_score REAL, vendor_id INT, institution_id INT, sector_id INT, title TEXT,
        source_structure TEXT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT);
      CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP);
      INSERT INTO institutions VALUES (10, 'INSTITUTO UNO'), (20, 'INSTITUTO DOS');
    """)
    c.executemany("INSERT INTO vendors VALUES (?,?,?,?)",
                  [(1, 'UNO SA DE CV', 0, None), (2, 'DOS SA DE CV', 0, None), (3, PF_NAME, 0, PF_RFC)])
    K = [  # id, date, amount, da, risk, vendor, inst, sector, structure
        (1, '2005-03-01', 100e6, 1, 0.7, 1, 10, 4, 'A'),     # pre-2011: direct award not recorded
        (2, '2012-01-10', 300e6, 1, 0.7, 1, 10, 1, 'B'),
        (3, '2012-06-10', 100e6, 0, 0.1, 2, 20, 3, 'B'),
        (4, '2012-06-11', 150e9, 1, 0.9, 2, 20, 3, 'B'),     # > 100B rejected
        (5, '2012-07-01', 12e9, 0, 0.2, 3, 10, 1, 'B'),      # > 10B flagged
        (6, '2025-02-01', 50e6, 1, 0.1, 2, 10, 1, 'E'),      # ComprasMX: left out
        (7, '2025-02-02', 40e6, 1, 0.65, 2, 10, 1, 'D'),
        (8, '2012-08-01', 0, 0, 0.9, 1, 10, 1, 'B'),         # zero amount: left out
    ]
    c.executemany("INSERT INTO contracts (id, contract_date, contract_year, amount_mxn, is_direct_award, risk_score, "
                  "vendor_id, institution_id, sector_id, title, source_structure) VALUES (?,?,?,?,?,?,?,?,?,'T',?)",
                  [(k[0], k[1], int(k[1][:4]), *k[2:]) for k in K])
    return c


@pytest.fixture(scope="module")
def conn():
    return _db()


@pytest.fixture(scope="module")
def res(conn):
    return compute(conn)


def _year(res, y):
    return next(r for r in res['years'] if r['year'] == y)


def test_year_slabs(res):
    assert [r['year'] for r in res['years']] == list(range(2002, 2026))
    y05, y12, y25 = _year(res, 2005), _year(res, 2012), _year(res, 2025)
    assert y05['term'] == 'fox' and y05['da_share'] is None and y05['crit100'] == 100
    assert y12['term'] == 'calderon' and y12['contracts'] == 3 and y12['value'] == pytest.approx(12.4e9)
    assert y12['da_share'] == pytest.approx(300e6 / 12.4e9) and y12['crit100'] == pytest.approx(33.33)
    assert y25['term'] == 'sheinbaum' and y25['contracts'] == 1 and y25['value'] == pytest.approx(40e6)
    assert _year(res, 2004)['contracts'] == 0 and _year(res, 2004)['crit100'] is None
    assert sum(m['contracts'] for m in y12['months']) == 3 and y12['months'][0]['value'] == pytest.approx(300e6)


def test_rankings_flags_and_pii(res):
    y12 = _year(res, 2012)
    assert [v['id'] for v in y12['vendors']] == [3, 1, 2]
    pf = y12['vendors'][0]
    assert pf['persona_fisica'] and pf['name'] == PF_NAME and pf['share'] == pytest.approx(12e9 / 12.4e9)
    top = y12['top_contracts']
    assert top[0]['id'] == 5 and top[0]['flag'] and not top[1]['flag'] and top[0]['vendor']['persona_fisica']
    cal = next(t for t in res['terms'] if t['key'] == 'calderon')
    assert y12['da_contracts'] == 1 and _year(res, 2005)['da_contracts'] is None
    assert cal['da_contracts'] == 1 and cal['da_base'] == 3
    assert cal['da_years'] == [2012] and [i['id'] for i in cal['institutions']] == [10, 20]
    assert cal['sectors'][0]['sector_id'] == 1
    assert PF_RFC not in json.dumps(res, ensure_ascii=False) and '"rfc"' not in json.dumps(res)


def test_endpoint(conn, res):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: conn
    client = TestClient(app)
    assert client.get("/api/v1/sexenios/columna").status_code == 404
    write(conn, res)
    r = client.get("/api/v1/sexenios/columna")
    assert r.status_code == 200 and len(r.json()['years']) == 24 and r.json()['updated_at']
