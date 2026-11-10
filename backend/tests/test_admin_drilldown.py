"""
Tests for GET /analysis/admin-breakdown/{era}/vendors and .../institutions

Mirrors test_missing_endpoints.py's TestClient pattern.
Uses 'sheinbaum' (smallest data set → fastest runtime).
"""
import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def base_url():
    return "/api/v1"


class TestAdminVendorsDrilldown:
    """Tests for GET /analysis/admin-breakdown/{era}/vendors"""

    def test_sheinbaum_vendors_200(self, client, base_url):
        response = client.get(f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors")
        assert response.status_code == 200

    def test_sheinbaum_vendors_shape(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors?limit=5"
        ).json()
        assert "era" in data
        assert data["era"] == "sheinbaum"
        assert "year_start" in data
        assert "year_end" in data
        assert "term_total_mxn" in data
        assert "vendor_count" in data
        assert "vendors" in data
        assert isinstance(data["vendors"], list)
        assert len(data["vendors"]) <= 5

    def test_sheinbaum_vendors_entry_fields(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors?limit=3"
        ).json()
        if data["vendors"]:
            entry = data["vendors"][0]
            assert "vendor_id" in entry
            assert "vendor_name" in entry
            assert "total_mxn" in entry
            assert "contracts" in entry
            assert "high_risk_pct" in entry
            assert "direct_award_pct" in entry
            assert "share_pct" in entry
            assert "yearly" in entry
            assert isinstance(entry["yearly"], list)

    def test_bogus_era_vendors_404(self, client, base_url):
        response = client.get(f"{base_url}/analysis/admin-breakdown/bogus/vendors")
        assert response.status_code == 404

    def test_limit_respected(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors?limit=10"
        ).json()
        assert len(data["vendors"]) <= 10


class TestAdminInstitutionsDrilldown:
    """Tests for GET /analysis/admin-breakdown/{era}/institutions"""

    def test_sheinbaum_institutions_200(self, client, base_url):
        response = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/institutions"
        )
        assert response.status_code == 200

    def test_sheinbaum_institutions_shape(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/institutions?limit=5"
        ).json()
        assert "era" in data
        assert data["era"] == "sheinbaum"
        assert "year_start" in data
        assert "year_end" in data
        assert "term_total_mxn" in data
        assert "institution_count" in data
        assert "top_n_share_pct" in data
        assert "institutions" in data
        assert isinstance(data["institutions"], list)
        assert len(data["institutions"]) <= 5

    def test_sheinbaum_institutions_entry_fields(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/institutions?limit=3"
        ).json()
        if data["institutions"]:
            entry = data["institutions"][0]
            assert "institution_id" in entry
            assert "institution_name" in entry
            assert "total_mxn" in entry
            assert "contracts" in entry
            assert "direct_award_pct" in entry
            assert "share_pct" in entry
            assert "top_sector_id" in entry
            assert "top_sector_code" in entry

    def test_bogus_era_institutions_404(self, client, base_url):
        response = client.get(
            f"{base_url}/analysis/admin-breakdown/bogus/institutions"
        )
        assert response.status_code == 404

    def test_limit_respected(self, client, base_url):
        data = client.get(
            f"{base_url}/analysis/admin-breakdown/sheinbaum/institutions?limit=6"
        ).json()
        assert len(data["institutions"]) <= 6


class TestAdminDrilldownRouterImport:
    """Smoke-test that the analysis router compiles without error."""

    def test_router_importable(self):
        from api.routers import analysis as _m
        assert hasattr(_m, "router")
        assert hasattr(_m, "get_admin_breakdown_vendors")
        assert hasattr(_m, "get_admin_breakdown_institutions")


class TestAdminScandals:
    """GET /analysis/admin-scandals — tier A/B GT cases with a published scandal row."""

    def test_every_listed_case_is_published_tier_ab(self, client, base_url):
        from api.dependencies import get_db
        data = client.get(f"{base_url}/analysis/admin-scandals").json()["administrations"]
        assert set(data) == {"fox", "calderon", "pena_nieto", "amlo", "sheinbaum"}
        slugs = [s["slug"] for v in data.values() for s in v]
        assert len(slugs) == len(set(slugs))
        with get_db() as conn:
            for slug in slugs:
                row = conn.execute(
                    "SELECT ps.is_verified, gtc.provenance_tier FROM procurement_scandals ps"
                    " JOIN ground_truth_cases gtc ON gtc.id = ps.ground_truth_case_id"
                    " WHERE ps.slug = ?", (slug,)).fetchone()
                assert row[0] == 1 and row[1] in ("A", "B")


@pytest.mark.no_db
def test_vendors_scope_is_compranet_only_and_drops_energy_on_request():
    from api.routers.analysis import _admin_vendors_scope
    assert _admin_vendors_scope(False) == "COALESCE(c.source_structure, '') <> 'E'"
    s = _admin_vendors_scope(True)
    assert "source_structure, '') <> 'E'" in s and "sector_id, 0) <> 4" in s


class TestAdminVendorsSinEnergia:
    """?sin_energia=1 = the «Cien pesos» basis on /administrations (no Pemex/CFE buyers)."""

    def test_sin_energia_total_not_above_full(self, client, base_url):
        full = client.get(f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors?limit=3").json()
        se = client.get(f"{base_url}/analysis/admin-breakdown/sheinbaum/vendors?limit=3&sin_energia=true").json()
        assert se["term_total_mxn"] <= full["term_total_mxn"]
        assert len(se["vendors"]) <= 3
