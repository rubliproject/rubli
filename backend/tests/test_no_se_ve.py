"""«Lo que no se ve»: scripts/precompute_budget_visibility.py + api/routers/no_se_ve.py on a crafted fixture.

Pins: cap 2/3/5/6 is the denominator (cap 1/4 never count); partida 46101 → trusts; a dependencia is its numeric
URs only; an entity that moved ramos is matched by UR; the project is its cartera on every UR and its register
side is the title scan, any buyer; > 100B rejected; a rebuild never doubles; the CSV parser reads by position and
Excel's '-' is zero; the endpoints are cached, 404 an unknown key, 422 a malformed one, and never name a persona
física nor return an RFC.
"""
import csv
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.cache import app_cache
from api.dependencies import get_db_dep
from api.routers.no_se_ve import router
from scripts.precompute_budget_visibility import aggregate_csv, build

pytestmark = pytest.mark.no_db

PF_RFC = "PELJ800101AB1"  # 13 characters → persona física


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:", isolation_level=None, check_same_thread=False)
    c.executescript(f"""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT, contract_year INT,
            amount_mxn REAL, is_direct_award INT, procedure_type_normalized TEXT, title TEXT, description TEXT, risk_score REAL);
        CREATE INDEX idx_c_inst_year ON contracts(institution_id, contract_year);
        CREATE INDEX idx_c_year ON contracts(contract_year);
        CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
        CREATE TABLE institutions (id INT PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE aria_queue (vendor_id INT, ips_tier INT);
        INSERT INTO vendors VALUES (1, 'CONSTRUCTORA UNO SA DE CV', 0, NULL), (2, 'JUAN PEREZ LOPEZ', 0, '{PF_RFC}');
        INSERT INTO institutions VALUES (4260, 'TREN MAYA, S.A. DE C.V.', 'TRENMAYA'), (384, 'SEDENA', 'SEDENA'),
                                        (1440, 'FIT', 'FIT'), (99, 'OTRO', NULL);
        INSERT INTO aria_queue VALUES (1, 1);
        INSERT INTO contracts VALUES
          (1, 1, 4260, 2024, 100e6, 1, 'directa', 'Obra civil', NULL, 0.7),
          (2, 1, 4260, 2024, 200e9, 0, 'licitacion', 'Error decimal', NULL, 0.1),   -- > 100B: rejected
          (3, 2, 99, 2024, 50e6, 0, 'licitacion', 'x', 'suministro para el TREN MAYA', 0.2),
          (4, 2, 384, 2024, 30e6, 0, 'licitacion', 'x', NULL, 0.2),
          (5, 1, 1440, 2023, 10e6, 0, 'licitacion', 'x', NULL, 0.2);
        -- the board columns (Los patrones): day, sector, category
        ALTER TABLE contracts ADD COLUMN contract_date TEXT; ALTER TABLE contracts ADD COLUMN sector_id INT;
        ALTER TABLE contracts ADD COLUMN category_id INT; ALTER TABLE institutions ADD COLUMN sector_id INT;
        CREATE TABLE categories (id INT PRIMARY KEY, name_es TEXT, name_en TEXT, is_active INT);
        INSERT INTO categories VALUES (7, 'Construcción', 'Construction', 1), (8, 'Retirada', 'Retired', 0);
        UPDATE contracts SET contract_date = '2024-03-01', sector_id = 3, category_id = 7 WHERE id = 1;
        UPDATE contracts SET category_id = 8 WHERE id = 3;
        UPDATE institutions SET sector_id = 3 WHERE id = 4260;
    """)
    ex = [  # (year, ramo, ur, cap, project_key, ejercido, trusts_46101)
        (2024, 7, 'H0M', 6, '2021W3N0001', 900e6, 0), (2024, 7, 'H0M', 1, '', 50e6, 0),
        (2024, 7, 'H0M', 4, '', 500e6, 400e6),
        (2024, 7, '110', 3, '', 120e6, 0), (2024, 7, '110', 4, '', 300e6, 300e6), (2024, 7, 'H0C', 3, '', 77e6, 0),
        (2024, 21, 'W3N', 6, '2021W3N0001', 1100e6, 0),
        (2023, 47, 'J3L', 6, '', 40e6, 0), (2024, 13, 'J3L', 6, '', 60e6, 0),  # the railway moved 47 → 13
    ]
    build(c, ex)
    return c


@pytest.fixture()
def conn():
    return _db()


@pytest.fixture()
def client(conn):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: conn
    app_cache.invalidate("no_se_ve")
    with TestClient(app) as c:
        yield c
    app_cache.invalidate("no_se_ve")


def _vis(conn, key, year):
    r = conn.execute("SELECT exercised_cap2356, exercised_cap1, exercised_cap4, trusts_46101, contracts_visible_mxn,"
                     " contracts_n, contracts_da_mxn, pct_visible FROM budget_visibility WHERE entity_key=? AND year=?",
                     (key, year)).fetchone()
    return r


def test_entity_denominator_trusts_and_reject(conn):
    ex, e1, e4, tr, vis, n, da, pct = _vis(conn, 'tren-maya-sa', 2024)
    assert (ex, e1, e4, tr) == (900e6, 50e6, 500e6, 400e6)   # cap 1 and cap 4 never enter the denominator
    assert (vis, n, da) == (100e6, 1, 100e6)                  # the 200B row is rejected
    assert pct == pytest.approx(100 / 900)


def test_dependencia_is_numeric_urs_only(conn):
    ex, *_rest = _vis(conn, 'sedena', 2024)
    assert ex == 120e6                                       # H0C (GAFSACOMM) is not SEDENA
    assert _vis(conn, 'sedena', 2024)[3] == 300e6


def test_moved_entity_and_project(conn):
    assert _vis(conn, 'fit', 2023)[0] == 40e6 and _vis(conn, 'fit', 2024)[0] == 60e6
    ex, *_m, vis, n, _da, _p = _vis(conn, 'tren-maya', 2024)
    assert (ex, vis, n) == (2000e6, 50e6, 1)                 # cartera on two URs · contract naming the train


def test_rebuild_replaces(conn):
    before = conn.execute("SELECT COUNT(*), SUM(contracts_visible_mxn) FROM budget_visibility").fetchone()
    build(conn, None)                                        # reuse budget_exercised
    assert conn.execute("SELECT COUNT(*), SUM(contracts_visible_mxn) FROM budget_visibility").fetchone() == before


def test_csv_by_position(tmp_path):
    p = tmp_path / "cp2024.csv"
    row = ['2024', '7', 'Defensa', 'H0M', 'Tren Maya'] + ['x'] * 12 + ['46101', 'Aportaciones'] + ['x'] * 6 + \
          ['2021W3N0001', '1', '1', '1', '1', '0', '"1,500.50"']
    with open(p, 'w', encoding='latin-1', newline='') as f:
        w = csv.writer(f)
        w.writerow(['h'] * 32)
        w.writerow(row[:31] + ['1,500.50'])
        w.writerow(row[:17] + ['21101'] + row[18:31] + ['-'])       # Excel's '-' = 0
        w.writerow([''] * 212)                                       # 2022 padding row
    agg = aggregate_csv(str(p), {'2021W3N0001'})
    assert agg[(2024, 7, 'H0M', 4, '2021W3N0001')] == [1500.5, 1500.5]
    assert agg[(2024, 7, 'H0M', 2, '2021W3N0001')] == [0.0, 0.0]


def test_page_endpoint(client):
    r = client.get("/api/v1/no-se-ve")
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["cp_years"] == [2023, 2024]
    keys = [e["entity_key"] for e in d["entities"]]
    assert keys[0] == 'tren-maya' and 'pemex' in keys
    proj = d["entities"][0]
    assert [(r["ramo"], r["ur"], r["exercised_cap2356"]) for r in proj["by_ur"]] == [(7, 'H0M', 900e6), (21, 'W3N', 1100e6)]
    tm = next(e for e in d["entities"] if e["entity_key"] == 'tren-maya-sa')
    assert "by_ur" not in tm
    assert tm["institution_ids"] == [4260] and tm["years"][0]["year"] == 2024


def test_drawer_endpoint(client):
    r = client.get("/api/v1/no-se-ve/tren-maya")
    assert r.status_code == 200
    top = r.json()["top"]["2024"]
    assert [c["id"] for c in top] == [3]
    assert top[0]["vendor"] == "JUAN PEREZ LOPEZ" and top[0]["persona_fisica"]  # named, labelled (owner policy 2026-10-29)
    assert "rfc" not in r.text.lower() and PF_RFC not in r.text
    sa = client.get("/api/v1/no-se-ve/tren-maya-sa").json()["top"]["2024"][0]
    assert (sa["vendor"], sa["aria_tier"], sa["is_direct_award"]) == ('CONSTRUCTORA UNO SA DE CV', 1, True)
    assert client.get("/api/v1/no-se-ve/tren-maya-sa").json()["institutions"] == [{"id": 4260, "name": 'TREN MAYA, S.A. DE C.V.', "siglas": 'TRENMAYA'}]
    assert top[0]["vendor_is_individual"] is True and top[0]["category_id"] is None   # the label, not the stale flag; inactive category → none
    assert (sa["contract_date"], sa["sector_id"], sa["category_id"], sa["category_es"], sa["category_en"]) == (
        '2024-03-01', 3, 7, 'Construcción', 'Construction')


def test_board_fields(client):
    ents = {e["entity_key"]: e for e in client.get("/api/v1/no-se-ve").json()["entities"]}
    assert ents["tren-maya-sa"]["sector_id"] == 3     # the first institution's sector, for the board's dot
    assert ents["sedena"]["sector_id"] is None        # institution without a sector → no dot, no error
    assert client.get("/api/v1/no-se-ve/nadie").status_code == 404
    assert client.get("/api/v1/no-se-ve/DROP%20TABLE").status_code == 422


def test_missing_tables_503():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: c
    app_cache.invalidate("no_se_ve")
    with TestClient(app) as t:
        assert t.get("/api/v1/no-se-ve").status_code == 503
