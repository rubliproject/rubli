"""scripts/precompute_events.py + GET /events on a crafted in-memory DB (cut 2026-03-31, window 2026-01-31..03-31).

    python -m pytest backend/tests/test_precompute_events.py -q -p no:cacheprovider
"""
import json
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db_dep
from api.routers.sexenio_actual import router
from scripts.precompute_events import compute, write

pytestmark = pytest.mark.no_db  # in-memory fixture; never needs the full DB
PF_NAME, PF_RFC = "JUAN PEREZ LOPEZ", "PELJ800101AB1"  # 13 chars → persona física
CUT = "2026-03-31"
RFC_NAME = "ABC010101XY9"


def _db():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, contract_date TEXT, contract_year INT, amount_mxn REAL,
        is_direct_award INT, risk_level TEXT, vendor_id INT, institution_id INT, sector_id INT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT, siglas TEXT, sector_id INT);
      CREATE TABLE vendor_canonical (vendor_id INT, canonical_id INT);
      CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP);
      INSERT INTO institutions VALUES (10, 'INSTITUTO UNO', 'IU', 1), (20, 'SECRETARÍA DOS', 'SD', 3);
      INSERT INTO vendor_canonical VALUES (6, 60), (7, 60);
    """)
    c.executemany("INSERT INTO vendors VALUES (?,?,?,?)", [
        (1, 'UNO SA', 0, None), (2, 'DOS SA', 0, None), (3, PF_NAME, 0, PF_RFC), (4, 'NUEVA SA', 0, 'NSA010101AB1'),
        (5, 'CHICA SA', 0, None), (6, 'GRUPO NUEVO SA', 0, None), (7, 'GRUPO VIEJO SA', 0, None),
        (8, 'SIN FECHA SA', 0, None), (9, RFC_NAME, 0, None)])
    K = [  # id, date, amount, da, level, vendor, inst
        (1, '2026-03-20', 500e6, 0, 'low', 1, 20),          # award
        (2, '2026-03-21', 150e9, 1, 'critical', 1, 10),     # > 100B: rejected from everything
        (3, '2026-03-22', 12e9, 0, 'medium', 2, 20),        # award, flagged
        (4, '2026-03-25', 200e6, 1, 'critical', 3, 20),     # award + critical + first, persona física
        (5, '2026-03-10', 30e6, 1, 'critical', 4, 10),      # first_supplier + critical
        (6, '2026-03-11', 5e6, 0, 'critical', 5, 10),       # first but < 10 MDP: nothing
        (7, '2026-03-12', 50e6, 0, 'low', 6, 10),           # canonical sibling 7 is older: not first
        (8, '2025-06-01', 1e6, 0, 'low', 7, 10),
        (9, '2026-01-05', 300e6, 0, 'low', 2, 20),          # before the window: no award event
        (10, '2026-04-02', 300e6, 0, 'low', 2, 20),         # after the cut: out
        # direct-award spike at 10: last 14 days all DA (25 MDP) vs 31 / 206 MDP in the 12 months before
        (11, '2025-09-01', 39e6, 0, 'low', 1, 10), (12, '2025-10-01', 1e6, 1, 'low', 1, 10),
        (13, '2026-03-28', 25e6, 1, 'low', 1, 10),
        (14, '2025-12-01', 40e6, 0, 'low', 2, 10),          # 2's history
        (15, '2025-05-01', 40e6, 0, 'low', 2, 20), (16, '2025-05-02', 40e6, 0, 'low', 1, 10),
        (17, '2025-03-01', 500e6, 1, 'low', 1, 10),         # before the 12-month baseline: ignored
        (18, None, 1e6, 0, 'low', 8, 20), (19, '2026-03-15', 15e6, 0, 'low', 8, 20),  # undated prior: not first
        (20, '2026-03-16', 150e6, 0, 'low', 9, 20),         # award + first; RFC-shaped name never shipped
    ]
    c.executemany("INSERT INTO contracts VALUES (?,?,?,?,?,?,?,?,?)",
                  [(k[0], k[1], int(k[1][:4]) if k[1] else None, k[2], k[3], k[4], k[5], k[6], 1 if k[6] == 10 else 3) for k in K])
    return c


@pytest.fixture(scope="module")
def conn():
    return _db()


@pytest.fixture(scope="module")
def res(conn, tmp_path_factory):
    st = tmp_path_factory.mktemp("w") / "WEEKLY_REFRESH.json"
    st.write_text(json.dumps({"result": "FAILED at link",
                              "last_ok": {"new_contracts": 812, "finished": "2026-03-30T04:10:00Z"}}))
    return compute(conn, cut_iso=CUT, status_path=st)


def ev(res, t):
    return [e for e in res['events'] if e['type'] == t]


def test_meta_and_order(res):
    m = res['meta']
    assert m['date_basis'] == 'contract_date' and m['cut'] == CUT and m['start'] == '2026-01-31' and m['days'] == 60
    dates = [e['date'] for e in res['events']]
    assert dates == sorted(dates, reverse=True) and all('2026-01-31' <= d <= CUT for d in dates)


def test_award(res):
    a = ev(res, 'award')
    assert [e['contract_id'] for e in a] == [4, 3, 1, 20]
    assert a[1]['detail']['flagged'] and not a[2]['detail']['flagged']
    assert a[2]['institution'] == 'SECRETARÍA DOS' and a[2]['vendor'] == 'UNO SA' and a[2]['sector_id'] == 3


def test_rejected_never_appears(res):
    assert all(e['contract_id'] != 2 for e in res['events'])


def test_first_supplier(res):
    assert [e['contract_id'] for e in ev(res, 'first_supplier')] == [4, 20, 5]  # 6 < 10 MDP; 7 older sibling; 19 undated prior


def test_critical(res):
    c = ev(res, 'critical')
    assert [e['contract_id'] for e in c] == [4, 5]
    assert all(e['risk_level'] == 'critical' for e in c)
    assert 'indicador de riesgo' in c[0]['title_es'] and 'risk indicator' in c[0]['title_en']


def test_direct_spike(res):
    s = ev(res, 'direct_spike')
    assert len(s) == 1 and s[0]['institution_id'] == 10 and s[0]['date'] == CUT
    d = s[0]['detail']
    assert d['recent_share'] == pytest.approx(1.0) and d['trailing_share'] == pytest.approx(31e6 / 206e6)
    assert d['recent_da_value'] == pytest.approx(25e6) and s[0]['amount'] == pytest.approx(25e6)


def test_weekly_refresh(res):
    w = ev(res, 'weekly_refresh')
    assert len(w) == 1 and w[0]['date'] == '2026-03-30' and w[0]['detail']['new_contracts'] == 812


def test_month_close(res):
    m = ev(res, 'month_close')
    # Jan + Feb end inside the window ≥ 3 days before the cut; March ends on the cut: not yet
    assert [e['detail']['month'] for e in m] == ['2026-02', '2026-01']
    assert m[0]['date'] == '2026-02-28' and m[0]['detail']['n'] == 0 and m[1]['detail']['n'] == 1


def test_month_close_totals(conn, tmp_path):
    r = compute(conn, cut_iso='2026-04-05', status_path=tmp_path / 'none.json')
    mar = next(e for e in ev(r, 'month_close') if e['detail']['month'] == '2026-03')
    assert mar['detail']['n'] == 9 and mar['amount'] == pytest.approx(12.975e9)  # contract 2 rejected
    assert mar['detail']['flagged'] == 1 and mar['detail']['critical'] == 3
    assert not ev(r, 'weekly_refresh')


def test_weekly_refresh_in_progress(conn, tmp_path):
    # the weekly run calls this precompute before it writes last_ok: its own integrated count wins
    st = tmp_path / 'WEEKLY_REFRESH.json'
    st.write_text(json.dumps({"started": "2026-03-31T03:00:00Z", "new_contracts": 95,
                              "last_ok": {"new_contracts": 812, "finished": "2026-03-24T04:10:00Z"}}))
    w = ev(compute(conn, cut_iso=CUT, status_path=st), 'weekly_refresh')
    assert [(e['date'], e['detail']['new_contracts']) for e in w] == [('2026-03-31', 95)]


def test_pii(res):
    """Owner policy 2026-10-29: a persona física is named, always labelled; RFC/CURP/address never."""
    pf = [e for e in res['events'] if e['contract_id'] == 4]
    assert pf and all(e['vendor'] == PF_NAME and e['vendor_id'] == 3 and e['persona_fisica'] for e in pf)
    assert all('persona física' in e['title_es'] and 'persona física' in e['title_en'] for e in pf if PF_NAME in e['title_es'])
    assert not any(e['persona_fisica'] for e in res['events'] if e['contract_id'] not in (4, None))
    blob = json.dumps(res, ensure_ascii=False)
    assert PF_RFC not in blob and 'NSA010101AB1' not in blob and RFC_NAME not in blob and 'rfc' not in blob.lower()
    assert 'probab' not in blob.lower()


def test_endpoint(conn, res):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: conn
    client = TestClient(app)
    assert client.get("/api/v1/events").status_code == 404
    write(conn, res)
    r = client.get("/api/v1/events").json()
    assert r['total'] == len(res['events']) and r['updated_at'] and r['meta']['date_basis'] == 'contract_date'
    r = client.get("/api/v1/events?type=award&limit=2").json()
    assert [e['type'] for e in r['events']] == ['award', 'award'] and r['total'] == 4
    assert client.get("/api/v1/events?type=bogus").status_code == 422
    # paging: the board rolls one group into older contracts a page at a time, newest first, no overlap
    aw = [e['contract_id'] for e in client.get("/api/v1/events?type=award").json()['events']]
    pages = [client.get(f"/api/v1/events?type=award&limit=2&offset={o}").json() for o in (0, 2, 4)]
    assert [e['contract_id'] for p in pages for e in p['events']] == aw and all(p['total'] == 4 for p in pages)
    assert pages[2]['events'] == [] and client.get("/api/v1/events?offset=-1").status_code == 422


def test_first_supplier_federal_only(tmp_path):
    # with institutions.is_federal present, a first contract with a non-federal buyer is not an event
    c = _db()
    c.execute("ALTER TABLE institutions ADD COLUMN is_federal INT")
    c.execute("UPDATE institutions SET is_federal = CASE id WHEN 10 THEN 1 ELSE 0 END")
    r = compute(c, cut_iso='2026-04-05', status_path=tmp_path / 'none.json')
    got = ev(r, 'first_supplier')
    assert got and all(e['institution_id'] == 10 for e in got)


def test_weekly_refresh_legacy_status(conn, tmp_path):
    st = tmp_path / 'WEEKLY_REFRESH.json'
    st.write_text(json.dumps({"result": "ok", "new_contracts": 2285, "finished": "2026-04-01T09:06:58Z"}), encoding="utf-8")
    r = compute(conn, cut_iso='2026-04-05', status_path=st)
    w = ev(r, 'weekly_refresh')
    assert len(w) == 1 and w[0]['date'] == '2026-04-01'


def test_weekly_refresh_after_cut_is_kept(conn, tmp_path):
    st = tmp_path / 'WEEKLY_REFRESH.json'
    st.write_text(json.dumps({"result": "ok", "new_contracts": 7, "finished": "2026-04-06T09:00:00Z", "last_ok": None}), encoding="utf-8")
    assert [e['date'] for e in ev(compute(conn, cut_iso='2026-04-05', status_path=st), 'weekly_refresh')] == ['2026-04-06']


def test_risk_score_carried_when_column_exists(res):
    assert all(e["risk_score"] is None for e in res["events"])  # fixture has no risk_score column → null, no crash
    c = _db()
    c.execute("ALTER TABLE contracts ADD COLUMN risk_score REAL")
    c.execute("UPDATE contracts SET risk_score = 0.71 WHERE id = 5")
    crit = [e for e in compute(c, cut_iso=CUT)["events"] if e["type"] == "critical" and e["contract_id"] == 5]
    assert crit and crit[0]["risk_score"] == 0.71


def test_procedure_carried_when_column_exists(res):
    assert all(e["detail"].get("procedure") is None for e in res["events"] if e["contract_id"])  # no column → null
    c = _db()
    c.execute("ALTER TABLE contracts ADD COLUMN procedure_type_normalized TEXT")
    c.execute("UPDATE contracts SET procedure_type_normalized = 'invitacion' WHERE id = 1")
    aw = [e for e in compute(c, cut_iso=CUT)["events"] if e["type"] == "award" and e["contract_id"] == 1]
    assert aw and aw[0]["detail"]["procedure"] == "invitacion" and aw[0]["detail"]["direct_award"] is False
    assert aw[0]["institution_siglas"] == "SD"  # institution 20's siglas ride with its name


def test_category_carried_when_column_and_table_exist(res):
    assert all(e["detail"].get("category_id") is None for e in res["events"] if e["contract_id"])  # no column → null
    c = _db()
    c.executescript("""
      ALTER TABLE contracts ADD COLUMN category_id INT;
      CREATE TABLE categories (id INT PRIMARY KEY, name_es TEXT, name_en TEXT, is_active INT);
      INSERT INTO categories VALUES (1, 'Medicamentos', 'Medications', 1), (2, 'Vacunas', 'Vaccines', 0);
      UPDATE contracts SET category_id = 1 WHERE id = 1;
      UPDATE contracts SET category_id = 99 WHERE id = 3;
      UPDATE contracts SET category_id = 2 WHERE id = 20;
    """)
    aw = {e["contract_id"]: e["detail"] for e in compute(c, cut_iso=CUT)["events"] if e["type"] == "award"}
    assert (aw[1]["category_id"], aw[1]["category_es"], aw[1]["category_en"]) == (1, "Medicamentos", "Medications")
    assert aw[3]["category_id"] is None  # an id with no category row is not shipped
    assert aw[20]["category_id"] is None and aw[20]["category_es"] is None  # an inactive category (not one of the 72) neither
