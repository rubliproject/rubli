"""build_category_panorama — docs/PROFILE_CONTENT_CATEGORY_2026-11-05.md § 1–5 + § «Subcategory profile» (keyed by code)."""
import sqlite3

import pytest

from api.services.category_panorama import UnknownSubcategory, build_category_panorama

pytestmark = pytest.mark.no_db  # in-memory DB only


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript(
        """
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name_es TEXT, name_en TEXT);
        CREATE TABLE subcategory_definitions (id INTEGER PRIMARY KEY, category_id INT, code TEXT, name_es TEXT, name_en TEXT, is_catch_all INT);
        CREATE TABLE contract_subcategory (contract_id INTEGER PRIMARY KEY, subcategory_id INT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, title TEXT, vendor_id INT, institution_id INT, category_id INT,
            contract_year INT, contract_date TEXT, amount_mxn REAL, is_direct_award INT, risk_score REAL, source_structure TEXT);
        INSERT INTO vendors VALUES (7,'ACME SA DE CV',0,'ACM010101AAA'),(17,'ACME VIEJA',0,NULL),(9,'BETA SA',0,NULL);
        INSERT INTO institutions VALUES (1,'IMSS','IMSS'),(11,'IMSS VIEJO',NULL),(2,'ISSSTE','ISSSTE');
        INSERT INTO institution_canonical VALUES (1,1),(11,1),(2,2);
        INSERT INTO vendor_canonical VALUES (7,7),(17,7),(9,9);
        INSERT INTO categories VALUES (20,'Medicamentos','Medicines'),(26,'Obra','Works');
        INSERT INTO subcategory_definitions VALUES (100,20,'generic','Genéricos','Generics',0),(101,20,'other','Otros','Other',1),
                                                   (200,26,'generic','Otro genérico','Other generic',0);
        INSERT INTO contracts VALUES
          (1,'a',7,1,20,2008,'2008-05-01',100,1,0.80,'A'),          -- before 2011: procedure not coded; critical
          (2,'b',17,11,20,2020,'2020-12-01',300,0,0.30,'C'),        -- absorbed vendor + institution; December
          (3,'c',9,2,20,2024,'2024-11-15',40,1,0.45,'D'),           -- Sheinbaum's side of the seam; high
          (4,'d',7,1,20,2024,'2024-09-30',10,1,0.10,'D'),           -- AMLO's side
          (5,'e',7,2,20,2025,'2025-06-01',200000000000,1,0.9,'E'),  -- > 100B: rejected
          (6,'f',7,2,20,2025,'2025-12-01',50,1,NULL,'E'),           -- ComprasMX, unscored; December
          (7,'g',9,1,26,2025,'2025-01-01',999,1,0.9,'D');           -- another category
        INSERT INTO contract_subcategory VALUES (1,100),(2,101),(3,100),(4,100),(6,100),(7,200);
        """
    )
    return c


def test_history_totals_levels_and_crit_both_ways():
    r = build_category_panorama(_db(), 20)
    assert r["amount_mxn"] == 500 and r["contracts"] == 5
    assert r["levels"] == {"critical": 1, "high": 1, "medium": 1, "low": 1, "none": 1}
    assert r["da_pct"] == 75.0  # 2020 tendered, 3 direct; 2008 not coded
    assert r["crit_value_pct"] == 20.0 and r["crit_pct"] == 20.0
    assert r["hr_pct"] == 40.0
    assert r["dec_pct"] == 70.0  # 300 + 50 of 500
    assert r["vendors_n"] == 2 and r["buyers_n"] == 2
    assert [y["year"] for y in r["years"]] == [2008, 2020, 2024, 2025]
    assert [(g["key"], g["amount_mxn"]) for g in r["gobs"]] == [("calderon", 100), ("amlo", 310), ("sheinbaum", 90)]


def test_folds_and_ranks_suppliers_buyers_pairs():
    r = build_category_panorama(_db(), 20)
    assert [(s["vendor_id"], s["amount_mxn"]) for s in r["suppliers"]] == [(7, 460), (9, 40)]
    assert [(b["institution_id"], b["amount_mxn"]) for b in r["buyers"]] == [(1, 410), (2, 90)]
    top = r["pairs"][0]
    assert (top["vendor_id"], top["institution_id"], top["of_buyer_pct"]) == (7, 1, 100.0)
    assert "rfc" not in str(r).lower()


def test_subs_and_top_contracts():
    r = build_category_panorama(_db(), 20)
    assert [(s["code"], s["amount_mxn"], s["is_catch_all"]) for s in r["subs"]] == [("other", 300, True), ("generic", 200, False)]
    assert [k["id"] for k in r["top_contracts"]] == [2, 1, 6, 3, 4]
    assert r["top_contracts"][0]["vendor_name"] == "ACME VIEJA"


def test_hoy_since():
    r = build_category_panorama(_db(), 20, since="2024-10-01")
    assert r["amount_mxn"] == 90 and r["contracts"] == 2
    assert [b["institution_id"] for b in r["buyers"]] == [2]


def test_sub_by_code_scoped_to_its_category():
    r = build_category_panorama(_db(), 20, sub_code="generic")
    assert r["sub"]["subcategory_id"] == 100 and r["amount_mxn"] == 200 and r["contracts"] == 4
    assert build_category_panorama(_db(), 26, sub_code="generic")["amount_mxn"] == 999
    with pytest.raises(UnknownSubcategory):
        build_category_panorama(_db(), 20, sub_code="nope")


def test_sector_and_sexenio_filters():
    """the /categories cut (buyer sector + sexenio by year), as in category_cube; NULL sector folds into 12 «otros»"""
    c = _db()
    c.executescript("ALTER TABLE contracts ADD COLUMN sector_id INT; UPDATE contracts SET sector_id = 1 WHERE id IN (2, 3);")
    r = build_category_panorama(c, 20, sector=1)
    assert r["amount_mxn"] == 340 and r["sector"] == 1
    assert build_category_panorama(c, 20, sector=12)["amount_mxn"] == 160  # 100 + 10 + 50
    r = build_category_panorama(c, 20, year_from=2019, year_to=2024)
    assert r["amount_mxn"] == 350 and r["contracts"] == 3
    assert build_category_panorama(c, 20, sector=1, year_from=2025)["contracts"] == 0


# ── against the real DB (skipped without it) ──

def test_api_panorama_and_404s(client):
    r = client.get("/api/v1/categories/20/panorama?since=2024-10-01&sub=blood_products")
    assert r.status_code == 200
    body = r.json()
    assert body["sub"]["code"] == "blood_products" and body["contracts"] >= 0
    assert client.get("/api/v1/categories/20/panorama?sub=no_such_code").status_code == 404
    assert client.get("/api/v1/categories/999999/panorama").status_code == 404
