"""
Tests for scripts/precompute_captura.py (the «Captura» definition) and api/routers/captura_v2.py.

Pins, on crafted rows: >= 80 % share, >= 50 MDP, >= 3 contract years; personas físicas pooled and never
named; public bodies pooled; GT false positives and suspect-decimal pairs out; > 100B rejected, > 10B
flagged; direct award on 2011+ money only; lock years; «still signing» = post_blackout APF rows of the
same canonical pair; canonical ids merge spellings. No RFC anywhere in the output.
Endpoint assertions run against the real DB:
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_captura_v2.py -q -p no:cacheprovider
"""
import json
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.cache import app_cache
from api.public_labels import pf_sql
from api.routers.captura_v2 import _majority_rows, majority_summary, router
from scripts.precompute_captura_majority import build as build_majority
from scripts.precompute_captura import compute, write

PF_NAME = "JUAN PEREZ LOPEZ"
PF_RFC = "PELJ800101AB1"  # 13 chars → persona física


def _db(canonical=False):
    c = sqlite3.connect(":memory:")
    c.executescript("""
      CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT, contract_year INT,
                              amount_mxn REAL, is_direct_award INT, title TEXT, contract_date TEXT);
      CREATE TABLE vendors (id INT PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT, vendor_kind TEXT);
      CREATE TABLE institutions (id INT PRIMARY KEY, siglas TEXT, name TEXT, sector_id INT);
      CREATE TABLE comprasmx_contracts (vendor_id INT, institution_id INT, amount_mxn REAL, post_blackout INT,
                                        orden_gobierno TEXT, fecha_publicacion TEXT);
      CREATE TABLE ground_truth_cases (id INT, confidence_level TEXT, provenance_tier TEXT, source_asf TEXT,
                                       source_news TEXT, source_legal TEXT, case_origin TEXT);
      CREATE TABLE ground_truth_vendors (vendor_id INT, case_id INT, is_false_positive INT, match_method TEXT);
      CREATE TABLE procurement_scandals (ground_truth_case_id INT, is_verified INT);
      CREATE TABLE aria_queue (vendor_id INT, ips_tier INT, primary_pattern TEXT, fp_structural_monopoly INT,
                               is_efos_definitivo INT, is_sfp_sanctioned INT);
      INSERT INTO institutions VALUES (10, 'IMSS', 'INSTITUTO MEXICANO DEL SEGURO SOCIAL', 1), (20, NULL, 'OTRO', 3),
                                      (11, NULL, 'IMSS (ortografía vieja)', 1);
    """)
    V = [(1, 'CAPTIVA UNO SA DE CV', 0, None, 'private'), (2, 'DOS AÑOS SA', 0, None, 'private'),
         (3, 'POCO DINERO SA', 0, None, 'private'), (4, 'SETENTA SA', 0, None, 'private'),
         (5, PF_NAME, 0, PF_RFC, 'private'), (6, 'SECRETARIA DE SALUD', 0, None, 'private'),
         (7, 'FALSO POSITIVO SA', 0, None, 'private'), (8, 'RECHAZO SA', 0, None, 'private'),
         (9, 'GRANDE SA', 0, None, 'private'), (10, 'DECIMAL SA', 0, None, 'private'),
         (11, 'ANTIGUA SA', 0, None, 'private'), (12, 'CASO SA', 0, None, 'private')]
    c.executemany("INSERT INTO vendors VALUES (?,?,?,?,?)", V)
    K = []
    K += [(1, 10, 2009, 30e6, 0), (1, 10, 2011, 30e6, 1), (1, 10, 2012, 30e6, 0), (1, 20, 2012, 20e6, 0)]
    K += [(2, 10, 2015, 40e6, 0), (2, 10, 2016, 40e6, 0)]                       # 2 years → out
    K += [(3, 10, y, 13e6, 0) for y in (2015, 2016, 2017)]                      # 39 MDP → out
    K += [(4, 10, y, 30e6, 0) for y in (2015, 2016, 2017)] + [(4, 20, 2017, 40e6, 0)]  # 69 % → out
    K += [(5, 10, y, 30e6, 0) for y in (2015, 2016, 2017)]                      # persona física → pooled
    K += [(6, 10, y, 30e6, 0) for y in (2015, 2016, 2017)]                      # public body → pooled
    K += [(7, 10, y, 30e6, 0) for y in (2015, 2016, 2017)]                      # GT false positive → out
    K += [(8, 10, y, 20e6, 0) for y in (2015, 2016, 2017)] + [(8, 20, 2018, 150e9, 0)]  # > 100B rejected, never dilutes
    K += [(9, 10, 2015, 15e9, 0), (9, 10, 2016, 12e9, 0), (9, 10, 2017, 11e9, 0)]       # > 10B flagged †
    K += [(10, 10, y, 1e6, 0) for y in (2010, 2011, 2012, 2013)] + [(10, 10, 2014, 2e9, 0)]  # ×1000 spike
    K += [(11, 10, y, 30e6, 0) for y in (2004, 2005, 2006)]                     # no award-type data
    K += [(12, 10, y, 30e6, 1) for y in (2019, 2020, 2021)]                     # documented case
    c.executemany("INSERT INTO contracts(vendor_id, institution_id, contract_year, amount_mxn, is_direct_award, title)"
                  " VALUES (?,?,?,?,?, 'x')", K)
    # the same ComprasMX contract also sits in `contracts` (structure E): past the switch it is the «post» slice only
    c.execute("INSERT INTO contracts(vendor_id, institution_id, contract_year, amount_mxn, is_direct_award, title, contract_date)"
              " VALUES (1, 10, 2025, 5e6, 0, 'x', '2025-11-01')")
    c.executemany("INSERT INTO comprasmx_contracts VALUES (?,?,?,?,?,?)", [
        (1, 10, 5e6, 1, 'APF', '2025-11-01'), (1, 10, 7e6, 1, 'APF', '2026-01-01'),
        (1, 10, 9e6, 1, 'ESTATAL', '2026-01-01'), (1, 10, 9e6, 0, 'APF', '2024-01-01'),
        (11, 20, 9e6, 1, 'APF', '2026-01-01')])                               # other buyer → not «still»
    c.executescript("""
      INSERT INTO ground_truth_cases VALUES (1, 'high', 'A', 'ASF-1', '', '', 'audit_report'), (2, 'low', 'C', '', '', '', '');
      INSERT INTO ground_truth_vendors VALUES (12, 1, 0, 'rfc'), (7, 2, 1, 'name');
      INSERT INTO aria_queue VALUES (1, 2, 'P6', 0, 0, 0);
    """)
    if canonical:  # 11 is an old spelling of 10; vendor 2 is a duplicate of vendor 1
        c.executescript("""
          CREATE TABLE institution_canonical (institution_id INT PRIMARY KEY, canonical_id INT);
          INSERT INTO institution_canonical VALUES (10, 10), (11, 10);
          CREATE TABLE vendor_canonical (vendor_id INT PRIMARY KEY, canonical_id INT);
          INSERT INTO vendor_canonical VALUES (1, 1), (2, 1);
          INSERT INTO contracts(vendor_id, institution_id, contract_year, amount_mxn, is_direct_award, title)
            VALUES (1, 11, 2013, 30e6, 0, 'x');
        """)
    return c


@pytest.fixture()
def res():
    app_cache.invalidate("public_labels")
    out = compute(_db())
    app_cache.invalidate("public_labels")
    return out


def _pair(res, v):
    return next((p for p in res["pairs"] if p["vendor_id"] == v), None)


@pytest.mark.no_db
def test_definition(res):
    assert {p["vendor_id"] for p in res["pairs"]} == {1, 8, 9, 11, 12}
    p = _pair(res, 1)
    assert p["sh"] == round(90 / 110, 4) and p["m"] == 90e6 and p["ny"] == 3 and p["vt"] == 110e6
    assert p["da"] == 0.5 and p["m11"] == 60e6          # 2011+ money only: 30 of 60
    assert (p["lock0"], p["lock1"], p["lockn"], p["lockrun"]) == (2009, 2011, 2, 1)  # 2012 = 60 %
    assert p["post_n"] == 2 and p["post"] == 12e6       # APF + post_blackout only
    assert p["p6"] == 1 and p["tier"] == 2
    assert _pair(res, 11)["da"] is None                  # 2002–2010 only → no award data
    assert _pair(res, 12)["gt"] == "doc"


@pytest.mark.no_db
def test_amount_rules(res):
    assert _pair(res, 8)["m"] == 60e6 and _pair(res, 8)["ny"] == 3  # 150B contract rejected
    assert _pair(res, 9)["flag"] == 1 and _pair(res, 1)["flag"] == 0
    assert all(p["m"] <= 1e11 for p in res["pairs"])
    assert res["meta"]["totals"]["suspect_pairs"] == 1 and _pair(res, 10) is None


@pytest.mark.no_db
def test_exclusions_and_no_pii(res):
    b = next(b for b in res["buyers"] if b["institution_id"] == 10)
    assert (b["pf_n"], b["pf_m"], b["pub_n"], b["fp_n"]) == (1, 90e6, 1, 1)
    assert b["n"] == 5 and b["cap"] == sum(p["m"] for p in res["pairs"] if p["institution_id"] == 10)
    assert b["post_total_n"] == 2 and b["post_n"] == 1
    blob = json.dumps(res)
    assert PF_RFC not in blob and '"rfc"' not in blob  # the name may show (labelled); the RFC never
    assert "FALSO POSITIVO" not in blob and "SECRETARIA DE SALUD" not in blob


@pytest.mark.no_db
def test_canonical_merge_and_write():
    app_cache.invalidate("public_labels")
    r = compute(_db(canonical=True))
    app_cache.invalidate("public_labels")
    p = _pair(r, 1)  # vendor 2's 80 MDP + institution 11's contract fold into (1, 10)
    assert p["m"] == 90e6 + 80e6 + 30e6 and p["ny"] == 6
    assert not any(b["institution_id"] == 11 for b in r["buyers"])
    w = sqlite3.connect(":memory:")
    write(w, r)
    assert w.execute("SELECT COUNT(*) FROM captura_pairs").fetchone()[0] == len(r["pairs"])
    assert json.loads(w.execute("SELECT v FROM captura_meta").fetchone()[0])["totals"]["pairs"] == len(r["pairs"])


# ── endpoints against the real DB (skipped when the tables were not precomputed)
@pytest.fixture(scope="module")
def api():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as c:
        r = c.get("/api/v1/captura/plates")
        if r.status_code == 503:
            pytest.skip("captura tables not precomputed")
        yield c, r.json()


def test_plates(api, _isolated_db):
    c, d = api
    t, F = d["meta"]["totals"], d["meta"]["pair_fields"]
    assert t["pairs"] == len(d["pairs"]) and t["buyers"] == len(d["buyers"])
    assert sum(p[F.index("m")] for p in d["pairs"]) == t["money"]
    assert all(p[F.index("sh")] >= 0.8 and p[F.index("m")] >= 50e6 and p[F.index("ny")] >= 3 for p in d["pairs"])
    assert all(p[F.index("m")] <= 1e11 for p in d["pairs"])
    assert "rfc" not in json.dumps(d).lower().replace("rfc_", "")
    # no persona física is named: judged by the one shared rule (pf_sql, RFC shape beats the stale
    # is_individual flag — 83a39d9a), not a private copy of the pre-B4 rule
    ids = [p[F.index("vendor_id")] for p in d["pairs"]]
    bad = _isolated_db.execute(
        f"SELECT COUNT(*) FROM vendors WHERE id IN ({','.join(map(str, ids))}) AND {pf_sql()}").fetchone()[0]
    assert bad == 0


def test_buyer_and_pair(api):
    c, d = api
    F = d["meta"]["pair_fields"]
    top = d["buyers"][0]
    b = c.get(f"/api/v1/captura/buyer/{top['institution_id']}").json()
    assert len(b["pairs"]) == top["n"] and all(isinstance(p["yrs"], list) for p in b["pairs"])
    v, i = d["pairs"][0][F.index("vendor_id")], d["pairs"][0][F.index("institution_id")]
    p = c.get(f"/api/v1/captura/pair?vendor_id={v}&institution_id={i}").json()
    assert 0 < len(p["contracts"]) <= 10 and all(0 < k["amount_mxn"] <= 1e11 for k in p["contracts"])
    assert sum(r[1] for r in p["by_year"]) == sum(r["n"] for r in p["proc"]) > 0
    assert c.get("/api/v1/captura/pair?vendor_id=1&institution_id=1").status_code == 404
    assert c.get("/api/v1/captura/buyer/999999999").status_code == 404
    # absence is a state, not an error (launch audit 2026-10-28 S2): the dossier door hides on a null pair
    r = c.get("/api/v1/captura/door?vendor_id=999999999")
    assert r.status_code == 200 and r.json() == {"pair": None}


def test_plates_scope(api):
    c, d = api
    assert d["meta"]["scope"] == "federal" and {b["level"] for b in d["buyers"]} == {"federal"}
    loc = c.get("/api/v1/captura/plates", params={"scope": "local"}).json()
    every = c.get("/api/v1/captura/plates", params={"scope": "all"}).json()
    assert {b["level"] for b in loc["buyers"]} <= {"estatal", "municipal"}
    assert loc["meta"]["totals"]["pairs"] == len(loc["pairs"])
    assert d["meta"]["totals"]["pairs"] + loc["meta"]["totals"]["pairs"] == every["meta"]["totals"]["pairs"]


# ── «La mitad»: captura_majority (scripts/precompute_captura_majority.py) + the summary the endpoint serves
@pytest.mark.no_db
def test_majority_precompute_and_summary():
    c = _db()
    c.isolation_level = None
    c.executescript("""
      INSERT INTO vendors VALUES (20, 'MAYORITARIA SA', 0, NULL, 'private'), (21, 'OTRA SA', 0, NULL, 'private');
      INSERT INTO institutions VALUES (30, 'ARTF', 'AGENCIA DE TRANSPORTE', 3);
      INSERT INTO contracts(vendor_id, institution_id, contract_year, amount_mxn, is_direct_award, title) VALUES
        (20, 30, 2024, 300e6, 1, 'x'), (21, 30, 2024, 100e6, 0, 'x'),     -- 75 % → a majority
        (21, 30, 2023, 300e6, 0, 'x'), (20, 30, 2023, 200e6, 0, 'x'),     -- 60 % to 21
        (5, 30, 2025, 200e6, 0, 'x'), (21, 30, 2025, 10e6, 0, 'x'),       -- a persona física holds it
        (20, 30, 2022, 2e11, 0, 'x'), (21, 30, 2022, 50e6, 0, 'x');       -- > 100B rejected → under the floor
    """)
    app_cache.invalidate("public_labels")
    write(c, compute(c))                                                  # captura_pairs: the «cautiva» seal
    app_cache.invalidate("public_labels")
    assert build_majority(c) > 0
    rows = _majority_rows(c, "WHERE m.institution_id = ?", (30,))
    assert [r["year"] for r in rows] == [2023, 2024, 2025]          # 2022: 50 MDP < floor once the 200B row is out
    r24 = next(r for r in rows if r["year"] == 2024)
    assert (r24["vendor_id"], r24["share"], r24["kind"], r24["total"]) == (20, 0.75, "co", 400e6)
    pf = next(r for r in rows if r["year"] == 2025)
    # owner policy 2026-10-29: a persona física is named (kind «pf» = the UI label); RFC never
    assert pf["kind"] == "pf" and pf["vendor"] == "JUAN PEREZ LOPEZ" and pf["vendor_id"] is not None
    blob = json.dumps(rows)
    assert PF_RFC not in blob and '"rfc"' not in blob  # the name may show (labelled); the RFC never
    s = majority_summary(rows)
    amlo = next(x for x in s["sex"] if x["name"] == "AMLO")
    assert (amlo["buyer_years"], amlo["half"], amlo["money_half"]) == (2, 2, round(300e6 + 300e6))
    assert [r["year"] for r in s["ledger"]] == [2025]                 # latest 2024–25 majority year per buyer
    assert len(s["dots"]) == 3 and s["inst"][30][1] == "ARTF"


# ── «Casos»: ARIA tier + the documented case's page for every current pair
@pytest.mark.no_db
def test_casos_evidence():
    from api.routers.captura_v2 import casos_evidence
    c = sqlite3.connect(":memory:")
    c.executescript("""
      CREATE TABLE captura_pairs (vendor_id INT, institution_id INT, y1 INT, tier INT, gt TEXT);
      INSERT INTO captura_pairs VALUES (1, 10, 2025, 2, 'doc'), (2, 10, 2024, 1, 'lead'), (3, 10, 2019, 1, 'doc'),
                                       (4, 10, 2025, NULL, NULL);
      CREATE TABLE ground_truth_cases (id INT, confidence_level TEXT, provenance_tier TEXT, source_asf TEXT,
                                       source_news TEXT, source_legal TEXT, case_origin TEXT);
      CREATE TABLE ground_truth_vendors (vendor_id INT, case_id INT, is_false_positive INT, match_method TEXT);
      CREATE TABLE procurement_scandals (ground_truth_case_id INT, is_verified INT, slug TEXT);
      INSERT INTO ground_truth_cases VALUES (1, 'high', 'A', '', 'Animal Politico; Proceso (IMSS 2020)', '', 'media_report'),
                                            (2, 'high', 'A', 'ASF 2019', '', '', 'audit_report'),
                                            (3, 'low', 'C', '', 'Rumor', '', '');
      INSERT INTO ground_truth_vendors VALUES (1, 1, 0, 'rfc'), (1, 2, 0, 'rfc'), (1, 3, 0, 'rfc'), (2, 3, 0, 'name');
      INSERT INTO procurement_scandals VALUES (2, 1, 'caso-dos'), (1, 0, 'sin-verificar');
    """)
    rows = {r[0]: r for r in casos_evidence(c)}
    assert set(rows) == {1, 2, 4}                                    # 2019 is not current
    assert rows[1] == [1, 10, 2, "caso-dos"]                       # only a verified page of a documented case
    assert rows[2] == [2, 10, 1, None]                             # a lead carries no case link
    assert rows[4] == [4, 10, None, None]
