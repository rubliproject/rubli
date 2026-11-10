"""freeze_forecast — deterministic, read-only freeze of the ranked vendor list (docs/PREREGISTRATION_2026-11.md)."""
import csv
import hashlib
import json
import sqlite3

import pytest

from scripts import freeze_forecast as ff

pytestmark = pytest.mark.no_db

CO_RFC = "ABC010101AB1"     # 12 chars = company shape
PF_RFC = "PEJU800101AB1"    # 13 chars = persona física shape


def _fixture_db(path):
    c = sqlite3.connect(path)
    c.executescript("""
    CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, amount_mxn REAL, risk_score REAL, contract_date TEXT,
        institution_id INT);
    CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, rfc TEXT, is_individual INT, vendor_kind TEXT);
    CREATE TABLE vendor_stats (vendor_id INT, primary_sector_id INT);
    CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE aria_queue (vendor_id INT, aria_run_id TEXT, ips_final REAL, ips_tier INT, primary_pattern TEXT,
        is_efos_definitivo INT, is_sfp_sanctioned INT, in_ground_truth INT, computed_at TEXT);
    CREATE TABLE model_calibration (id INTEGER PRIMARY KEY, model_version TEXT, run_id TEXT, created_at TEXT);
    CREATE TABLE sat_efos_vendors (id INTEGER PRIMARY KEY, rfc TEXT, stage TEXT, dof_date TEXT);
    CREATE TABLE sfp_sanctions (id INTEGER PRIMARY KEY, rfc TEXT, company_name TEXT, sanction_start TEXT, plazo_months INT);
    INSERT INTO model_calibration VALUES (1,'v0.9.1','CAL-old','2026-10-13'),(2,'v0.9.2','CAL-v92-asof-20261022','2026-10-22');
    INSERT INTO institutions VALUES (1,'INSTITUTO MEXICANO DEL SEGURO SOCIAL'),(10,'BUYER A'),(11,'BUYER B'),(12,'BUYER C');
    INSERT INTO sat_efos_vendors VALUES (1,'ABC010101AB1','definitivo','2020-01-01'),(2,'ZZZ010101AB1','presunto','2021-01-01');
    INSERT INTO sfp_sanctions VALUES (1,'QQQ010101AB1','OTRA SA','2019-05-01',12),(2,'','','2020-01-01',NULL),
        (3,NULL,'EMPRESA 8 S.A. DE C.V.','2020-01-01',24);
    """)
    vendors, contracts, stats, aria = [], [], [], []
    cid = 0
    for v in range(1, 61):
        kind, rfc, name = "private", None, f"EMPRESA {v} SA DE CV"
        if v == 1:
            rfc = CO_RFC
        if v == 2:
            rfc, name = PF_RFC, "JUAN PEREZ"
        if v == 3:
            name = "INSTITUTO MEXICANO DEL SEGURO SOCIAL"     # public entity by name → excluded
        if v == 4:
            kind = "public_soe"                               # public by kind → excluded
        vendors.append((v, name, rfc, 1 if v == 2 else 0, kind))
        stats.append((v, 1))
        first_year = 2008 if v == 8 else 2018 if v == 2 else 2023 if v == 7 else 2013
        for k in range(1 + v % 4):
            cid += 1
            contracts.append((cid, v, 1000.0 * v + k, round((v % 10) / 10 + 0.01 * k, 4), f"{first_year}-0{1 + k}-15", 1))
        tier = 1 if v <= 6 else 2 if v <= 10 else 3 if v <= 20 else 4
        aria.append((v, "ARIA-OLD", 0.1, 4, None, 0, 0, 0, "2026-01-01"))
        aria.append((v, "ARIA-NEW", round(1 - v / 100, 4), tier, "P1" if tier == 1 else None,
                     1 if v == 1 else 0, 0, 1 if v == 5 else 0, "2026-10-28"))
    cid += 1
    contracts.append((cid, 7, 2e11, 0.99, "2025-09-28", 1))        # > 100B MXN → rejected, sets no value and no score
    contracts.append((cid + 1, 7, 5.0, None, "2025-09-27", 1))     # unscored contract counts, not scored
    vendors.append((99, "SIN CONTRATOS PUNTUADOS SA", None, 0, "private"))
    contracts.append((cid + 2, 99, 10.0, None, "2025-01-01", 1))   # no scored contract → not in the population
    # buyer window for freeze 2026-11-01 = 2025-11-02 .. 2026-11-01 (vendor 99 is unscored: buyer level uses every vendor)
    contracts += [(cid + 3, 99, 9e7, None, "2026-03-01", 10), (cid + 4, 99, 1e8, None, "2026-10-31", 11),
                  (cid + 5, 98, 1e7, None, "2026-01-01", 10),                                             # A: 100 MDP, top 0.9
                  (cid + 6, 98, 1e7, None, "2025-11-02", 11),                                             # B: 110 MDP, 0.909
                  (cid + 7, 99, 5e7, None, "2026-06-01", 12),                                             # C: < 100 MDP
                  (cid + 8, 98, 9e9, None, "2026-11-02", 12), (cid + 9, 98, 9e9, None, "2025-11-01", 12)]  # outside window
    c.executemany("INSERT INTO vendors VALUES (?,?,?,?,?)", vendors)
    c.executemany("INSERT INTO contracts VALUES (?,?,?,?,?,?)", contracts)
    c.executemany("INSERT INTO vendor_stats VALUES (?,?)", stats)
    c.executemany("INSERT INTO aria_queue VALUES (?,?,?,?,?,?,?,?,?)", aria)
    c.commit()
    c.close()


def _sfp_csv(tmp_path):
    p = tmp_path / "sfp_src.csv"
    p.write_bytes(b"PROVEEDOR,FECHA\nEMPRESA 8 S.A. DE C.V.,01/01/2020\n")
    return str(p)


def _freeze(db, out, tmp_path, **kw):
    return ff.freeze(str(db), str(out), "2026-11-01", _sfp_csv(tmp_path), **{"seed": 20261101, "controls_per_focal": 2, **kw})


@pytest.fixture
def frozen(tmp_path):
    db = tmp_path / "f.db"
    _fixture_db(db)
    out = tmp_path / "out"
    manifest = _freeze(db, out, tmp_path)
    rows = list(csv.DictReader(open(out / manifest["files"]["vendors_csv"], encoding="utf-8", newline="")))
    return db, out, manifest, rows


def test_population_excludes_public_entities_and_unscored_vendors(frozen):
    _, _, m, rows = frozen
    ids = {int(r["vendor_id"]) for r in rows}
    assert 3 not in ids and 4 not in ids and 99 not in ids
    assert ids == set(range(1, 61)) - {3, 4}
    assert m["counts"]["population"] == 58


def test_no_persona_fisica_rfc_and_company_rfc_kept(frozen):
    _, out, _, rows = frozen
    by = {int(r["vendor_id"]): r for r in rows}
    assert by[2]["entity_kind"] == "persona_fisica" and by[2]["company_rfc"] == ""
    assert by[1]["entity_kind"] == "company" and by[1]["company_rfc"] == CO_RFC
    assert PF_RFC not in (out / "forecast_vendors_2026-11-01.csv").read_text(encoding="utf-8")


def test_scores_use_latest_aria_run_and_reject_over_100b(frozen):
    _, _, m, rows = frozen
    by = {int(r["vendor_id"]): r for r in rows}
    assert m["aria_run_id"] == "ARIA-NEW" and m["model_run_id"] == "CAL-v92-asof-20261022"
    assert by[6]["aria_tier"] == "1" and by[6]["ips"] == "0.940000"
    v7 = by[7]
    assert v7["n_contracts"] == "5" and v7["n_scored"] == "4"   # 4 scored + 1 unscored; the >100B one is dropped
    assert float(v7["total_value_mxn"]) == 7000 * 4 + 6 + 5       # rejected 2e11 excluded, unscored 5.0 included
    assert float(v7["max_risk"]) == pytest.approx(0.73)           # 0.99 of the rejected contract ignored
    assert float(v7["mean_risk"]) == pytest.approx(0.715)
    assert by[1]["efos_def_at_freeze"] == "1" and by[5]["gt_at_freeze"] == "1"
    assert m["data_cut_date"] == "2026-11-02"


def test_controls_are_matched_on_sector_size_and_first_year_band(frozen):
    _, _, m, rows = frozen
    by = {int(r["vendor_id"]): r for r in rows}
    assert (by[8]["first_year_band"], by[1]["first_year_band"], by[2]["first_year_band"], by[7]["first_year_band"]) == \
        ("A", "B", "C", "D")
    assert by[7]["stratum"] == f"s1-d{by[7]['size_decile']}-D"
    focal = [r for r in rows if r["focal"] == "1"]
    ctrl = [r for r in rows if r["control"] == "1"]
    assert {r["aria_tier"] for r in focal} <= {"1", "2"} and len(focal) == 8   # tiers 1–2 minus excluded 3, 4
    assert ctrl and not {r["vendor_id"] for r in ctrl} & {r["vendor_id"] for r in focal}
    assert {r["stratum"] for r in ctrl} <= {r["stratum"] for r in focal}
    assert m["control_sample"]["seed"] == 20261101


def test_deterministic_hashes_and_sha256sums(tmp_path, frozen):
    db, out, m, _ = frozen
    m2 = _freeze(db, tmp_path / "again", tmp_path)
    assert (m2["sha256"], m2["sha256_buyers"], m2["sha256_sfp_source"]) == (m["sha256"], m["sha256_buyers"], m["sha256_sfp_source"])
    sums = list(filter(None, (out / "SHA256SUMS").read_text().split("\n")))
    assert len(sums) == 5
    co = (out / "forecast_vendors_companies_2026-11-01.csv").read_text(encoding="utf-8")
    assert "JUAN PEREZ" not in co and "EMPRESA 1 SA DE CV" in co and m["sha256_companies"] != m["sha256"]
    for line in sums:
        h, name = line.split("  ")
        assert hashlib.sha256((out / name).read_bytes()).hexdigest() == h
    assert json.loads((out / "forecast_manifest_2026-11-01.json").read_text())["sha256"] == m["sha256"]


def test_db_is_opened_read_only(frozen):
    db, *_ = frozen
    conn = ff._connect_ro(str(db))
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("CREATE TABLE x (a)")


def test_sfp_baseline_by_name_and_blank_rfcs_never_match(frozen):
    _, out, m, rows = frozen
    by = {int(r["vendor_id"]): r for r in rows}
    assert by[8]["sfp_at_freeze"] == "1"                       # «EMPRESA 8 S.A. DE C.V.» = «EMPRESA 8 SA DE CV» normalised
    assert m["counts"]["population_already_sfp"] == 1          # '' / NULL RFC and '' name rows match no one
    assert m["counts"]["population_already_efos_def"] == 1
    snap = m["outcome_snapshots_at_freeze"]["sfp_sanctions_name_date"]
    assert snap["rows"] == 3 and snap["distinct_normalised_names"] == 2
    assert (out / "sfp_source_2026-11-01.csv").read_bytes().startswith(b"PROVEEDOR")


def test_buyer_level_window_threshold_and_shares(frozen):
    _, out, m, _ = frozen
    b = list(csv.DictReader(open(out / "forecast_buyers_2026-11-01.csv", encoding="utf-8", newline="")))
    assert [r["institution_id"] for r in b] == ["10", "11"]     # C stays < 100 MDP once out-of-window contracts are dropped
    assert b[0]["top_vendor_id"] == "99" and b[0]["top_share"] == "0.900000" and b[0]["hhi"] == "0.820000"
    assert b[1]["window_total_mxn"] == "110000000.00" and b[1]["majority_now"] == "1"
    assert m["buyer_window"] == {"from_inclusive": "2025-11-02", "to_inclusive": "2026-11-01", "min_total_mxn": 100_000_000}
    assert m["counts"]["buyers"] == 2


def test_guards_no_sfp_match_and_legacy_sfp_table(tmp_path):
    db = tmp_path / "f.db"
    _fixture_db(db)
    c = sqlite3.connect(db)
    c.execute("DELETE FROM sfp_sanctions WHERE id = 3")
    c.commit()
    with pytest.raises(SystemExit, match="flagged no vendor"):
        _freeze(db, tmp_path / "o", tmp_path)
    c.executescript("DROP TABLE sfp_sanctions; "
                    "CREATE TABLE sfp_sanctions (id INTEGER PRIMARY KEY, rfc TEXT, company_name TEXT, sanction_start TEXT);")
    c.close()
    with pytest.raises(SystemExit, match="plazo_months"):
        _freeze(db, tmp_path / "o", tmp_path)
    assert not (tmp_path / "o").exists()


def test_missing_model_calibration_row_stops_the_freeze(tmp_path):
    db = tmp_path / "f.db"
    _fixture_db(db)
    with pytest.raises(SystemExit, match="v9.9"):
        _freeze(db, tmp_path / "o", tmp_path, model_version="v9.9")
    assert not (tmp_path / "o").exists()
