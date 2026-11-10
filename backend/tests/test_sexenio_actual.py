"""scripts/precompute_sexenio_actual.py + GET /sexenio-actual on a crafted in-memory DB (cut 2024-10-31 → N = 30 days).

    python -m pytest backend/tests/test_sexenio_actual.py -q -p no:cacheprovider
"""
import json
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db_dep
from api.routers.sexenio_actual import router
from scripts.precompute_sexenio_actual import compute, write

PF_NAME, PF_RFC = "JUAN PEREZ LOPEZ", "PELJ800101AB1"  # 13 chars → persona física
pytestmark = pytest.mark.no_db  # in-memory fixture; never needs the full DB
FORT = "ADJUDICACIÓN DIRECTA POR CASO FORTUITO O FUERZA MAYOR"


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_date TEXT, contract_year INT, amount_mxn REAL,
        is_direct_award INT, is_single_bid INT, risk_level TEXT, risk_score REAL, vendor_id INT, institution_id INT,
        procedure_type TEXT, exception_article TEXT, caso_fortuito TEXT, title TEXT, source_structure TEXT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT, siglas TEXT, sector_id INT, is_federal INT);
      CREATE TABLE vendor_canonical (vendor_id INT, canonical_id INT);
      CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP);
      INSERT INTO institutions VALUES (10, 'INSTITUTO UNO', 'IU', 1, 1), (20, 'ESTADO DOS', NULL, 12, 0);
      INSERT INTO vendor_canonical VALUES (5, 50), (6, 50);
    """)
    c.executemany("INSERT INTO vendors VALUES (?,?,?,?)", [
        (1, 'UNO SA', 0, None), (2, 'DOS SA', 0, None), (3, PF_NAME, 0, PF_RFC), (4, 'CUATRO SA', 0, None),
        (5, 'CINCO SA', 0, None), (6, 'CINCO VIEJA SA', 0, None)])
    K = [  # id, date, amount, da, sb, level, vendor, inst, proc, article, fortuito, structure
        (1, '2024-10-05', 100e6, 1, 0, 'critical', 1, 10, 'ADJUDICACIÓN DIRECTA', None, None, 'D'),
        (2, '2024-10-06', 50e6, 0, 1, 'low', 2, 10, 'LICITACIÓN PÚBLICA', None, None, 'D'),
        (3, '2024-10-07', 200e6, 1, 0, 'high', 3, 20, FORT, None, None, 'E'),
        (4, '2024-10-08', 150e9, 1, 0, 'low', 1, 10, 'ADJUDICACIÓN DIRECTA', None, None, 'D'),   # > 100B rejected
        (5, '2024-10-08', 12e9, 0, 0, 'medium', 4, 10, 'LICITACIÓN PÚBLICA', None, 'NO', 'E'),  # > 10B flagged
        (6, '2020-03-01', 1e6, 0, 0, 'low', 2, 10, 'LICITACIÓN PÚBLICA', None, None, 'C'),
        (7, '2024-11-05', 1e9, 1, 0, 'low', 1, 10, 'ADJUDICACIÓN DIRECTA', None, None, 'E'),     # after the cut
        (8, '2024-10-09', 150e6, 0, 0, 'low', 5, 10, 'INVITACIÓN', None, None, 'E'),
        (9, '2019-01-01', 1e6, 0, 0, 'low', 6, 10, 'LICITACIÓN PÚBLICA', None, None, 'C'),     # 5's sibling: prior
        (10, '2018-12-10', 10e6, 1, 0, 'low', 2, 10, 'ADJUDICACIÓN DIRECTA', 'ART. 41 FR. V', None, 'B'),  # AMLO day 9
    ]
    c.executemany("INSERT INTO contracts (id, contract_date, contract_year, amount_mxn, is_direct_award, is_single_bid, "
                  "risk_level, risk_score, vendor_id, institution_id, procedure_type, exception_article, caso_fortuito, "
                  "title, source_structure) VALUES (?,?,?,?,?,?,?,0.5,?,?,?,?,?,'T',?)",
                  [(k[0], k[1], int(k[1][:4]), *k[2:]) for k in K])
    return c


@pytest.fixture(scope="module")
def conn():
    return _db()


@pytest.fixture(scope="module")
def res(conn):
    return compute(conn, cut_iso='2024-10-31')


def test_comparison_arithmetic(res):
    s, amlo, pn = res['comparison']
    assert res['meta']['days'] == 30 and s['end'] == '2024-10-31' and amlo['end'] == '2018-12-31'
    assert s['n'] == 5 and s['value'] == pytest.approx(12.5e9)          # rejected and post-cut rows out
    assert s['da_n'] == pytest.approx(2 / 5) and s['da_v'] == pytest.approx(300e6 / 12.5e9)
    assert s['sb'] == pytest.approx(1 / 3) and s['hc_n'] == pytest.approx(2 / 5) and s['flagged'] == 1
    assert amlo['n'] == 1 and amlo['da_n'] == 1
    assert pn['n'] == 0 and pn['da_v'] is None
    assert [m['month'] for m in res['series']] == ['2024-10'] and res['series'][0]['n'] == 5


def test_rankings_and_pii(res):
    assert [b['id'] for b in res['buyers']] == [10, 20]
    assert [v['id'] for v in res['suppliers']] == [4, 5, 1, 2]           # persona física pooled, not ranked
    assert res['meta']['pf_suppliers'] == {'vendors': 1, 'n': 1, 'value': 200e6}
    top = res['largest']
    assert top[0]['id'] == 5 and top[0]['flagged'] and not top[1]['flagged']
    pfc = next(r for r in top if r['id'] == 3)
    assert pfc['vendor'] == PF_NAME and pfc['vendor_id'] is not None and pfc['persona_fisica']  # named + labelled (10-29)
    assert not any(r['persona_fisica'] for r in top if r['id'] != 3)
    blob = json.dumps(res, ensure_ascii=False)
    assert PF_NAME not in json.dumps({k: v for k, v in res.items() if k != 'largest'}, ensure_ascii=False)  # pools stay counts
    assert PF_RFC not in blob and 'rfc' not in blob


def test_first_time_and_urgency(res):
    f = res['first_time']
    assert f['n'] == 3 and f['pf_n'] == 1 and [v['id'] for v in f['top']] == [4, 1]   # 5 has a prior sibling
    u = res['urgency']
    assert u['n'] == 1 and u['value'] == 200e6 and u['share_v'] == pytest.approx(200e6 / 12.5e9)
    assert res['meta']['comprasmx_federal_share_v'] == pytest.approx(12.15e9 / 12.35e9)


def test_is_urgent():
    from scripts.precompute_sexenio_actual import is_urgent
    assert is_urgent('INVITACIÓN A CUANDO MENOS 3 PERSONAS POR URGENCIA Y EVENTUALIDAD', None, None)
    assert is_urgent('ADJUDICACIÓN DIRECTA', 'ART. 54 FR. II', None) and is_urgent(None, None, 1)
    assert not any(is_urgent('LICITACIÓN PÚBLICA', None, f) for f in (None, 0, 0.0, '0', 'NO', ''))


def test_data_cut_is_the_newest_loaded_contract():
    from api.config.constants import DATA_CUT_ISO
    from scripts.precompute_sexenio_actual import data_cut
    c = _db()
    # a staged-but-unloaded publication must not move the cut (SILENT_FAILURES_WEEKLY_2026-10-28 § S1)
    c.executescript("CREATE TABLE comprasmx_contracts (fecha_publicacion TEXT);"
                    "INSERT INTO comprasmx_contracts VALUES ('2026-10-27 10:00:00');")
    assert data_cut(c) == '2024-11-05'
    c.execute("DELETE FROM contracts WHERE source_structure = 'E'")
    assert data_cut(c) == DATA_CUT_ISO


def test_endpoint(conn, res):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: conn
    client = TestClient(app)
    assert client.get("/api/v1/sexenio-actual").status_code == 404
    write(conn, res)
    r = client.get("/api/v1/sexenio-actual")
    assert r.status_code == 200 and r.json()['comparison'][0]['n'] == 5 and r.json()['updated_at']
