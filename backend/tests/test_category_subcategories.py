"""GET /categories/{id}/subcategories — the dossier drill's C and D levels.

Each subcategory carries its largest vendors (subcategory_vendor_topn): ≤10, by value, never more
than the subcategory's total, personas físicas flagged, no RFC in the payload.
"""
import json
import re

import pytest

RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")
MEDICINES = 20


@pytest.fixture(scope="module")
def payload(client):
    r = client.get(f"/api/v1/categories/{MEDICINES}/subcategories")
    assert r.status_code == 200, r.text
    return r.json()


def test_vendors_per_subcategory(payload):
    subs = [s for s in payload["data"] if s["total_value"] > 0]
    assert subs, "medicines has subcategories"
    for s in subs:
        vs = s["vendors"]
        assert 0 < len(vs) <= 10
        values = [v["vendor_value"] for v in vs]
        assert values == sorted(values, reverse=True)
        assert sum(values) <= s["total_value"] * 1.000001
        assert all(isinstance(v["persona_fisica"], bool) for v in vs)


def test_one_catch_all(payload):
    assert sum(s["is_catch_all"] for s in payload["data"]) == 1


def test_no_rfc(payload):
    assert not RFC.search(json.dumps(payload, ensure_ascii=False))


def test_unknown_category_404(client):
    assert client.get("/api/v1/categories/999999/subcategories").status_code == 404


def test_persona_flag_matches_vendor_dossier_rule(payload):
    """Same label as /vendors/:id and ARIA (is_named_persona): a firm with a legal suffix is never flagged."""
    from api.public_labels import looks_like_company
    for s in payload["data"]:
        for v in s["vendors"]:
            if v["persona_fisica"]:
                assert not looks_like_company(v["vendor_name"]), v["vendor_name"]


def test_foreign_firm_with_stale_individual_flag_is_not_a_person():
    """Regression: vendor 101353 PASTEUR MERIEUX SERUM & VACCINS (is_individual=1, no RFC) is a company.
    (Since 2026-11-03 it is no longer in a top-10 list, so the rule is tested directly.)"""
    from api.routers.categories import persona_flag
    assert not persona_flag(1, None, "PASTEUR MERIEUX SERUM & VACCINS")
    assert not persona_flag(1, None, "LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO, S.A. DE C.")


def test_consolidated_is_a_share_not_a_subcategory(payload):
    """«Compra consolidada» is how a thing was bought (contract_subcategory.is_consolidated), 2026-11-03."""
    assert "consolidated_purchases" not in {s["code"] for s in payload["data"]}
    for s in payload["data"]:
        pct = s["consolidated_value_pct"]
        assert pct is None or 0 <= pct <= 100


def test_one_row_per_firm(payload):
    """The same company with and without «S.A. de C.V.» is one row (vendor group, else suffix-free name)."""
    from scripts.compute_subcategory_stats import firm_keys
    for s in payload["data"]:
        keys = [firm_keys(v["vendor_id"], v["vendor_name"], None, int(v["persona_fisica"]))[-1] for v in s["vendors"]]
        assert len(keys) == len(set(keys)), (s["code"], [v["vendor_name"] for v in s["vendors"]])


def test_high_risk_pct_is_a_share_or_null(payload):
    """TEAL-4: each subcategory carries the share of its contracts with a high or critical indicator (≥ 0.40)."""
    for s in payload["data"]:
        hr = s["high_risk_pct"]
        assert hr is None or 0 <= hr <= 100


def test_top_subcategories_route_is_not_shadowed(client):
    """/categories/subcategories/top sits before /{category_id}/… (a shadowed route answers 422)."""
    r = client.get("/api/v1/categories/subcategories/top?limit=10")
    assert r.status_code == 200, r.text
    rows = r.json()["data"]
    assert 0 < len(rows) <= 10
    values = [x["total_value"] for x in rows]
    assert values == sorted(values, reverse=True)
    for x in rows:
        assert x["name_es"] and x["category_es"]
        assert x["high_risk_pct"] is None or 0 <= x["high_risk_pct"] <= 100
        assert not x["name_es"].lower().startswith("otros"), "catch-alls name no concept"
        assert x["total_contracts"] >= 50, "too thin to rank (SILVER 4)"
        assert "sin clase" not in x["name_es"].lower()


def test_top_subcategories_limit_bounds(client):
    assert client.get("/api/v1/categories/subcategories/top?limit=0").status_code == 422
    assert client.get("/api/v1/categories/subcategories/top?limit=61").status_code == 422


def test_category_cube_route(client):
    """TEAL-4 filters: /categories/cube is not shadowed by /{category_id}; rows are well-formed when the precompute ran."""
    r = client.get("/api/v1/categories/cube")
    assert r.status_code == 200, r.text
    body = r.json()
    for row in body.get("rows", [])[:500]:
        cat, sector, sx, n, value, direct, known = row
        assert sx in {"fox", "calderon", "epn", "amlo", "sheinbaum"}
        assert 1 <= sector <= 12 and n > 0 and 0 < value <= n * 100e9
        assert 0 <= direct <= known <= n
