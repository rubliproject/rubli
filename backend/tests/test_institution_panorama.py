"""build_panorama — concept B2 «La columna» aggregates (docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md § P1–P4)."""
import sqlite3

import pytest

from api.services.institution_panorama import INDEX_SQL, build_panorama, sexenio_of

pytestmark = pytest.mark.no_db  # in-memory DB only


def _db(index: bool = False) -> sqlite3.Connection:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript(
        """
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name_es TEXT, name_en TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT, category_id INT,
            contract_year INT, contract_date TEXT, amount_mxn REAL, is_direct_award INT, risk_score REAL);
        INSERT INTO institutions VALUES (1,'UNO'),(11,'UNO VIEJO'),(2,'OTRO');
        INSERT INTO institution_canonical VALUES (1,1),(11,1),(2,2);
        INSERT INTO vendors VALUES (7,'SIETE SA DE CV',0,'SIE010101AB1'),(17,'SIETE SA',0,NULL),
                                   (8,'JUAN PEREZ LOPEZ',1,'PELJ800101AB1'),(9,'NUEVE SA',0,NULL);
        INSERT INTO vendor_canonical VALUES (7,7),(17,7),(8,8),(9,9);
        INSERT INTO categories VALUES (20,'Medicamentos','Medicines'),(26,'Obra','Works');
        INSERT INTO contracts (vendor_id,institution_id,category_id,contract_year,contract_date,amount_mxn,is_direct_award,risk_score) VALUES
          (7,1,20,2008,'2008-05-01',100,1,0.8),          -- before 2011: procedure not coded
          (17,11,20,2020,'2020-03-01',300,0,0.2),         -- absorbed vendor + absorbed institution
          (7,1,26,2025,'2025-02-01',50,1,0.7),
          (8,1,20,2024,'2024-11-15',40,1,0.1),
          (9,1,26,2024,'2024-09-30',10,0,0.5),            -- one day before «Hoy»
          (9,1,26,2025,'2025-06-01',200000000000,1,0.9),  -- > 100B: rejected
          (9,2,26,2025,'2025-06-01',999,1,0.9);           -- another buyer
        """
    )
    if index:
        c.execute(INDEX_SQL)
    return c


@pytest.mark.parametrize("index", [False, True])
def test_history_folds_and_rejects(index):
    r = build_panorama(_db(index), 1)
    assert r["amount_mxn"] == 500 and r["contracts"] == 5 and r["vendors"] == 3
    assert [s["vendor_id"] for s in r["suppliers"]] == [7, 8, 9]
    s7 = r["suppliers"][0]
    assert s7["amount_mxn"] == 450 and s7["share_pct"] == 90.0
    assert s7["da_pct"] == 50.0  # 2020 tendered + 2025 direct; 2008 not coded
    assert s7["first_year"] == 2008 and s7["last_year"] == 2025
    assert s7["years"] == [[2008, 100], [2020, 300], [2025, 50]]
    assert s7["main_category_id"] == 20
    assert r["rest"] == {"vendors": 0, "amount_mxn": 0, "contracts": 0}
    assert [x["key"] for x in r["sexenios"]] == ["calderon", "amlo", "sheinbaum"]
    amlo = next(x for x in r["sexenios"] if x["key"] == "amlo")
    assert amlo["amount_mxn"] == 310 and amlo["top3"][0]["vendor_id"] == 7  # 2020 + 2024-09-30
    shein = next(x for x in r["sexenios"] if x["key"] == "sheinbaum")
    assert shein["amount_mxn"] == 90 and shein["top3"][0]["vendor_id"] == 7  # Nov 2024 is Sheinbaum's


def test_hoy_since_drops_older_and_keeps_span():
    r = build_panorama(_db(), 1, since="2024-10-01")
    assert r["amount_mxn"] == 90 and r["vendors"] == 2  # vendor 9's only row is 2024-09-30
    s7 = next(s for s in r["suppliers"] if s["vendor_id"] == 7)
    assert s7["first_year"] == 2025 and s7["first_year_all"] == 2008 and s7["last_year_all"] == 2025
    assert [y["year"] for y in r["years"]] == [2024, 2025]


def test_year_and_category_filters():
    db = _db()
    assert build_panorama(db, 1, year=2020)["amount_mxn"] == 300
    c = build_panorama(db, 1, category_id=26)
    assert c["amount_mxn"] == 60 and [s["vendor_id"] for s in c["suppliers"]] == [7, 9]
    assert [x["category_id"] for x in build_panorama(db, 1)["categories"]] == [20, 26]


def test_persona_fisica_flag_without_rfc():
    r = build_panorama(_db(), 1)
    pf = {s["vendor_id"]: s["persona_fisica"] for s in r["suppliers"]}
    assert pf == {7: False, 8: True, 9: False}
    assert all("rfc" not in s for s in r["suppliers"])


def test_sexenio_bounds():
    assert sexenio_of(2006) == "fox" and sexenio_of(2007) == "calderon" and sexenio_of(2024) == "amlo" and sexenio_of(2025) == "sheinbaum"
    assert sexenio_of(2024, after_seam=True) == "sheinbaum"


# ── against the real DB (skipped without it) ──

def test_api_imss_hoy_vs_historia(client):
    hoy = client.get("/api/v1/institutions/251/panorama?since=2024-10-01")
    assert hoy.status_code == 200
    h = hoy.json()
    assert h["suppliers"] and all(s["last_year"] >= 2024 for s in h["suppliers"])
    assert abs(sum(s["amount_mxn"] for s in h["suppliers"]) + h["rest"]["amount_mxn"] - h["amount_mxn"]) < 1
    assert all("rfc" not in s and "persona_fisica" in s for s in h["suppliers"])
    hist = client.get("/api/v1/institutions/251/panorama").json()
    assert hist["amount_mxn"] > h["amount_mxn"] and len(hist["sexenios"]) == 5
    assert client.get("/api/v1/institutions/251/panorama?since=2024-1").status_code == 422
    assert client.get("/api/v1/institutions/99999999/panorama").status_code == 404


def test_api_contracts_cut_by_vendor_and_since(client):
    top = client.get("/api/v1/institutions/251/panorama?since=2024-10-01").json()["suppliers"][0]["vendor_id"]
    r = client.get(f"/api/v1/institutions/251/contracts?vendor_id={top}&since=2024-10-01&per_page=3&sort_by=amount_mxn")
    assert r.status_code == 200
    rows = r.json()["data"]
    assert 0 < len(rows) <= 3 and all(x["vendor_id"] == top and x["contract_date"] >= "2024-10-01" for x in rows)
    assert [x["amount_mxn"] for x in rows] == sorted((x["amount_mxn"] for x in rows), reverse=True)
    assert all(x.get("vendor_rfc") in (None, "") or not x["vendor_is_individual"] for x in rows)


def test_until_bounds_one_government():
    r = build_panorama(_db(), 1, since="2019-01-01", until="2024-12-31")
    assert r["amount_mxn"] == 350 and [s["vendor_id"] for s in r["suppliers"]] == [7, 8, 9]
