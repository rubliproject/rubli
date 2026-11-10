"""Tests for /api/v1/search endpoint."""
import pytest


class TestFederatedSearch:

    def test_basic_search_returns_200(self, client, base_url):
        r = client.get(f"{base_url}/search?q=salud")
        assert r.status_code == 200

    def test_response_has_results_field(self, client, base_url):
        r = client.get(f"{base_url}/search?q=salud")
        data = r.json()
        assert "results" in data or "vendors" in data or "contracts" in data

    def test_empty_query_returns_400_or_empty(self, client, base_url):
        r = client.get(f"{base_url}/search?q=")
        assert r.status_code in (200, 400, 422)

    def test_missing_q_param_returns_422(self, client, base_url):
        r = client.get(f"{base_url}/search")
        assert r.status_code == 422

    def test_short_query_handled(self, client, base_url):
        r = client.get(f"{base_url}/search?q=ab")
        assert r.status_code in (200, 400)

    def test_results_have_type_field(self, client, base_url):
        r = client.get(f"{base_url}/search?q=pemex")
        if r.status_code != 200:
            return
        data = r.json()
        results = data.get("results", [])
        for item in results[:3]:
            assert "type" in item or "entity_type" in item

    def test_special_characters_handled(self, client, base_url):
        r = client.get(f"{base_url}/search?q=construcc%C3%B3n")
        assert r.status_code in (200, 400)

    def test_long_query_handled(self, client, base_url):
        r = client.get(f"{base_url}/search?q=" + "a" * 200)
        assert r.status_code in (200, 400, 422)

    def test_type_filter(self, client, base_url):
        r = client.get(f"{base_url}/search?q=salud&type=vendor")
        assert r.status_code in (200, 400, 422)


def test_federated_search_all_facets_failing_is_503(client, base_url, monkeypatch):
    """A DB outage must not masquerade as "no results" (weekend #9)."""
    import api.routers.search as search_router

    def boom(*_a, **_k):
        raise RuntimeError("database is locked")

    for name in ("_search_vendors", "_search_institutions", "_search_contracts", "_search_cases"):
        monkeypatch.setattr(search_router, name, boom)
    assert client.get(f"{base_url}/search", params={"q": "pemex"}).status_code == 503


def test_numeric_query_finds_vendor_by_id(client, base_url):
    # CLICKPATH_AUDIT_2026-10-30 #6: «4335» must reach vendor 4335
    import sqlite3
    from api.dependencies import DB_PATH
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        vid = conn.execute("SELECT vendor_id FROM vendor_stats ORDER BY total_contracts DESC LIMIT 1").fetchone()[0]
    r = client.get(f"{base_url}/search", params={"q": str(vid)})
    assert r.status_code == 200
    assert r.json()["vendors"][0]["id"] == vid


def test_vendor_contracts_institution_filter(client, base_url):
    # CLICKPATH_AUDIT_2026-10-30 #5: Salud › IMSS › vendor lists only its IMSS contracts
    all_ = client.get(f"{base_url}/vendors/4335/contracts", params={"per_page": 1}).json()["pagination"]["total"]
    r = client.get(f"{base_url}/vendors/4335/contracts", params={"institution_id": 251, "per_page": 100})
    assert r.status_code == 200
    body = r.json()
    assert 0 < body["pagination"]["total"] < all_
    assert all(c.get("institution_id") in (None, 251) or "SEGURO SOCIAL" in (c.get("institution_name") or "").upper() for c in body["data"])
