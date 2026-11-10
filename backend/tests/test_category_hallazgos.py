"""GET /categories/hallazgos — the /categories «Hallazgos» payload.

Pins each figure the page prints against an independent SQL path: CompraNet without the
ComprasMX rows (source_structure 'E'), ComprasMX from gap_contracts with CAST amounts,
the four BIRMEX contracts over 10,000 MDP (F2 ledger), the 2025 category owners (F3 ledger),
and that no RFC leaves the endpoint (personas físicas are named and flagged, owner 2026-10-29).
"""
import json
import re
import sqlite3

import pytest

from api.dependencies import DB_PATH

RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")
CN = "amount_mxn > 0 AND amount_mxn <= 100000000000 AND category_id IS NOT NULL AND source_structure <> 'E'"
AMT = "CAST(amount_mxn_best AS REAL)"


@pytest.fixture(scope="module")
def payload(client):
    r = client.get("/api/v1/categories/hallazgos")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def ro():
    c = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=120)
    yield c
    c.close()


def test_shape(payload):
    for k in ("f1", "f1_years", "f2", "f3", "f4", "matrix", "drill", "fed", "cats", "vendors", "institutions"):
        assert k in payload
    assert len(payload["matrix"]) == 16
    assert all(len(r["cells"]) == 16 for r in payload["matrix"])
    assert [y["y"] for y in payload["f1_years"]] == list(range(2010, 2026))


def test_no_rfc_pattern(payload):
    assert not RFC.search(json.dumps(payload, ensure_ascii=False))


def test_personas_fisicas_named_and_flagged_never_their_rfc(payload, ro):
    """Owner 2026-10-29 (transparency): personas físicas are named as CompraNet publishes them and
    flagged `persona_fisica`; every flagged id is one, every persona física shipped is flagged, and no
    personal RFC (13 chars) appears anywhere in the payload."""
    ids = {int(k) for k in payload["vendors"]}
    pf_db = {r[0] for r in ro.execute(
        f"SELECT id FROM vendors WHERE id IN ({','.join('?' * len(ids))})"
        " AND (is_individual = 1 OR length(trim(COALESCE(rfc, ''))) = 13)", sorted(ids))}
    assert set(payload["persona_fisica"]) == pf_db
    rfcs = {r[0] for r in ro.execute(
        f"SELECT upper(trim(rfc)) FROM vendors WHERE id IN ({','.join('?' * len(ids))}) AND rfc IS NOT NULL", sorted(ids))}
    blob = json.dumps(payload, ensure_ascii=False).upper()
    leaked = [r for r in rfcs if len(r) == 13 and r in blob]
    assert not leaked, "personal RFCs in the payload"
    for b in payload["f2"]["big"]:
        assert isinstance(b["pf"], bool)


def test_medicine_share_excludes_comprasmx(payload, ro):
    m, dam = ro.execute(
        f"SELECT SUM(amount_mxn), SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn END) FROM contracts"
        f" WHERE {CN} AND category_id = 20 AND contract_year = 2024").fetchone()
    y24 = next(y for y in payload["f1_years"] if y["y"] == 2024)
    assert y24["m"] == pytest.approx(m, rel=1e-9)
    assert y24["da"] == pytest.approx(dam / m, rel=1e-9)


def test_comprasmx_medicine(payload, ro):
    m, dam = ro.execute(
        f"SELECT SUM({AMT}), SUM(CASE WHEN is_direct_award = '1' THEN {AMT} END) FROM gap_contracts"
        " WHERE contract_year IN ('2025', '2026') AND category_id = 20").fetchone()
    assert payload["f1"]["mx_m"] == pytest.approx(m, rel=1e-9)
    assert payload["f1"]["mx_da"] == pytest.approx(dam / m, rel=1e-9)


def test_f2_ledger_birmex_flagged(payload, ro):
    rows = ro.execute(
        f"SELECT {AMT}, is_direct_award FROM gap_contracts WHERE institution_siglas = 'BIRMEX'"
        f" AND contract_year IN ('2025', '2026') AND {AMT} > 1e10 ORDER BY 1 DESC").fetchall()
    big = payload["f2"]["big"]
    assert len(big) == len(rows) == payload["f2"]["bir_flag_n"]
    assert [b["m"] for b in big] == pytest.approx([r[0] for r in rows])
    assert all(b["da"] == (r[1] == "1") for b, r in zip(big, rows))
    # the 'WHERE amount > 1e10' TEXT trap (README §8) would match hundreds
    assert len(rows) < 20


def test_f3_ledger_owners(payload, ro):
    for cat in payload["f3"]["owner_cats"]:
        row = next(r for r in payload["f3"]["rows"] if r["cat"] == cat)
        tot = ro.execute(f"SELECT SUM(amount_mxn) FROM contracts WHERE {CN} AND category_id = ? AND contract_year = 2025", (cat,)).fetchone()[0]
        v, n, m = ro.execute(
            f"SELECT vendor_id, COUNT(*), SUM(amount_mxn) FROM contracts WHERE {CN} AND category_id = ? AND contract_year = 2025"
            " GROUP BY vendor_id ORDER BY 3 DESC LIMIT 1", (cat,)).fetchone()
        assert row["v"] == v and row["n25"] == n
        assert row["m"] == pytest.approx(tot, rel=1e-9)
        assert row["share"] == pytest.approx(m / tot, rel=1e-9) and row["share"] >= 0.4


def test_drill_is_medicine_2024_validated(payload):
    assert payload["drill"] and all(0 < r["m"] <= 1e11 for r in payload["drill"])
    assert [r["m"] for r in payload["drill"]] == sorted((r["m"] for r in payload["drill"]), reverse=True)


# ── by sector (owner 11-06 «findings by sector»): only that buyer sector's contracts; national stories hide
@pytest.mark.no_db
def test_sector_guard_is_an_int_1_to_12():
    from scripts.precompute_category_hallazgos import _sec, stat_key
    assert _sec(None) == "" and _sec(9) == " AND sector_id = 9" and _sec("3") == " AND sector_id = 3"
    for bad in (0, 13, "9; DROP TABLE contracts"):
        with pytest.raises(ValueError):
            _sec(bad)
    assert stat_key() == "category_hallazgos" and stat_key(9) == "category_hallazgos:9"


def test_endpoint_rejects_an_unknown_sector(client):
    assert client.get("/api/v1/categories/hallazgos", params={"sector": 13}).status_code == 422
    assert client.get("/api/v1/categories/hallazgos", params={"sector": 0}).status_code == 422


@pytest.fixture(scope="module")
def agri(client):
    r = client.get("/api/v1/categories/hallazgos", params={"sector": 9})
    assert r.status_code == 200, r.text
    return r.json()


def test_sector_payload_is_that_sector_only(agri, ro):
    assert agri["sector"] == 9
    # BIRMEX's lifetime story is health's: zero outside sector 1, so the finding cannot print
    assert agri["f2"]["bir_life_m"] == 0 and agri["f2"]["bir_all_mx_m"] == 0 and agri["f2"]["big"] == []
    # the matrix money of its largest category equals an independent SQL over the sector's contracts
    top = agri["matrix"][0]
    m = ro.execute(f"SELECT SUM(amount_mxn) FROM contracts WHERE {CN} AND sector_id = 9 AND category_id = ?"
                   " AND contract_year BETWEEN 2023 AND 2025", (top["cat"],)).fetchone()[0]
    assert top["m2325"] == pytest.approx(m, rel=1e-9)
    assert not RFC.search(json.dumps(agri))
