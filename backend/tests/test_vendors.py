"""
Tests for vendor API endpoints.
"""
import pytest


class TestVendorsList:
    """Tests for GET /vendors endpoint."""

    def test_list_vendors_default(self, client, base_url):
        """Test listing vendors with default parameters."""
        response = client.get(f"{base_url}/vendors")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data
        assert data["pagination"]["page"] == 1

    def test_list_vendors_pagination(self, client, base_url):
        """Test vendor list pagination."""
        response = client.get(f"{base_url}/vendors?page=2&per_page=10")
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["page"] == 2
        assert data["pagination"]["per_page"] == 10

    def test_list_vendors_invalid_page(self, client, base_url):
        """Test vendor list with invalid page parameter."""
        response = client.get(f"{base_url}/vendors?page=0")
        assert response.status_code == 422  # Validation error


class TestVendorsTop:
    """Tests for GET /vendors/top endpoint."""

    def test_top_vendors_by_value(self, client, base_url):
        """Test top vendors sorted by contract value."""
        response = client.get(f"{base_url}/vendors/top?by=value&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert len(data["data"]) <= 10

    def test_top_vendors_by_count(self, client, base_url):
        """Test top vendors sorted by contract count."""
        response = client.get(f"{base_url}/vendors/top?by=count&limit=5")
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) <= 5

    def test_top_vendors_by_risk(self, client, base_url):
        """Test top vendors sorted by risk score."""
        response = client.get(f"{base_url}/vendors/top?by=risk&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    def test_top_vendors_sector_filter(self, client, base_url):
        """Test top vendors filtered by sector."""
        response = client.get(f"{base_url}/vendors/top?sector_id=1&limit=10")
        assert response.status_code == 200


class TestVendorDetail:
    """Tests for GET /vendors/{vendor_id} endpoint."""

    def test_vendor_detail_valid(self, client, base_url):
        """Test getting vendor details with valid ID."""
        # First get a vendor ID from the list
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == vendor_id

    def test_vendor_detail_not_found(self, client, base_url):
        """Test getting vendor details with non-existent ID."""
        response = client.get(f"{base_url}/vendors/999999999")
        assert response.status_code == 404


class TestVendorContracts:
    """Tests for GET /vendors/{vendor_id}/contracts endpoint."""

    def test_vendor_contracts(self, client, base_url):
        """Test getting vendor's contracts."""
        # First get a vendor ID
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/contracts")
            assert response.status_code == 200
            data = response.json()
            assert "data" in data
            assert "pagination" in data


class TestVendorInstitutions:
    """Tests for GET /vendors/{vendor_id}/institutions endpoint."""

    def test_vendor_institutions(self, client, base_url):
        """Test getting institutions a vendor works with."""
        # First get a vendor ID
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/institutions")
            assert response.status_code == 200
            data = response.json()
            assert "data" in data

    def test_vendor_institutions_ranked_by_value(self, client, base_url):
        """Buyers rank by the money they paid, not by contract count (PARALLAX D13b § 3)."""
        response = client.get(f"{base_url}/vendors/1403/institutions")
        if response.status_code == 404:
            pytest.skip("vendor 1403 not in this database")
        assert response.status_code == 200
        rows = response.json()["data"]
        values = [r["total_value_mxn"] for r in rows]
        assert values == sorted(values, reverse=True)
        assert all("contract_count" in r for r in rows)


class TestVendorRiskProfile:
    """Tests for GET /vendors/{vendor_id}/risk-profile endpoint."""

    def test_vendor_risk_profile(self, client, base_url):
        """Test getting vendor's risk profile."""
        # First get a vendor ID
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/risk-profile")
            assert response.status_code == 200
            data = response.json()
            assert "vendor_id" in data
            assert "avg_risk_score" in data


class TestVendorRelated:
    """Tests for GET /vendors/{vendor_id}/related endpoint."""

    def test_vendor_related(self, client, base_url):
        """Test getting related vendors."""
        # First get a vendor ID
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/related")
            assert response.status_code == 200
            data = response.json()
            assert "data" in data


class TestVendorRiskTimeline:
    """Tests for GET /vendors/{vendor_id}/risk-timeline endpoint."""

    def test_vendor_risk_timeline(self, client, base_url):
        """Test getting vendor's risk timeline."""
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/risk-timeline")
            assert response.status_code == 200
            data = response.json()
            assert "vendor_id" in data
            assert "vendor_name" in data
            assert "timeline" in data
            assert isinstance(data["timeline"], list)
            if data["timeline"]:
                item = data["timeline"][0]
                assert "year" in item
                assert "avg_risk_score" in item
                assert "contract_count" in item

    def test_vendor_risk_timeline_not_found(self, client, base_url):
        """Test risk timeline with non-existent vendor."""
        response = client.get(f"{base_url}/vendors/999999999/risk-timeline")
        assert response.status_code == 404


class TestVendorAISummary:
    """Tests for GET /vendors/{vendor_id}/ai-summary endpoint."""

    def test_vendor_ai_summary(self, client, base_url):
        """Test getting vendor's AI summary."""
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/ai-summary")
            assert response.status_code == 200
            data = response.json()
            assert "vendor_id" in data
            assert "vendor_name" in data
            assert "summary" in data
            assert "insights" in data
            assert isinstance(data["insights"], list)
            assert data["generated_by"] == "v5.0 feature analysis"

    def test_vendor_ai_summary_not_found(self, client, base_url):
        """Test AI summary with non-existent vendor."""
        response = client.get(f"{base_url}/vendors/999999999/ai-summary")
        assert response.status_code == 404


class TestVendorGroundTruthStatus:
    """Tests for GET /vendors/{vendor_id}/ground-truth-status endpoint."""

    def test_vendor_ground_truth_status_returns_object(self, client, base_url):
        """Endpoint should return is_known_bad and cases list."""
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(
                f"{base_url}/vendors/{vendor_id}/ground-truth-status"
            )
            assert response.status_code == 200
            data = response.json()
            assert "is_known_bad" in data
            assert isinstance(data["is_known_bad"], bool)
            assert "cases" in data
            assert isinstance(data["cases"], list)

    def test_vendor_ground_truth_status_not_found(self, client, base_url):
        """Non-existent vendor should return 404."""
        response = client.get(f"{base_url}/vendors/999999999/ground-truth-status")
        assert response.status_code == 404

    def test_vendor_ground_truth_status_known_bad_shape(self, client, base_url):
        """Known-bad vendor case items should have required fields."""
        # Try a few vendors to find a GT-linked one
        list_response = client.get(f"{base_url}/vendors?per_page=20")
        if list_response.status_code != 200:
            return
        for vendor in list_response.json().get("data", []):
            response = client.get(
                f"{base_url}/vendors/{vendor['id']}/ground-truth-status"
            )
            assert response.status_code == 200
            data = response.json()
            if data.get("is_known_bad") and data.get("cases"):
                case = data["cases"][0]
                assert "case_id" in case
                assert "case_name" in case
                assert "case_type" in case
                break

    def test_vendor_ground_truth_status_carries_case_years(self, client, base_url):
        """Documented cases carry year_start / year_end (the ARIA case view's facts row)."""
        response = client.get(f"{base_url}/vendors/2873/ground-truth-status")
        if response.status_code == 404:
            pytest.skip("vendor not in this DB")
        cases = response.json()["cases"]
        if not cases:
            pytest.skip("no documented case for this vendor in this DB")
        assert "year_start" in cases[0] and "year_end" in cases[0]


class TestVendorQQW:
    """Tests for GET /vendors/{vendor_id}/qqw endpoint."""

    def test_vendor_qqw_returns_200(self, client, base_url):
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/qqw")
            assert response.status_code == 200

    def test_vendor_qqw_has_required_fields(self, client, base_url):
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/qqw")
            assert response.status_code == 200
            data = response.json()
            assert "vendor_id" in data
            assert "has_data" in data
            assert "qqw_contract_count" in data
            assert "procurement_officials" in data
            assert "contracts" in data
            assert "note" in data
            assert isinstance(data["procurement_officials"], list)
            assert isinstance(data["contracts"], list)

    def test_vendor_qqw_not_found(self, client, base_url):
        response = client.get(f"{base_url}/vendors/999999999/qqw")
        assert response.status_code == 404

    def test_vendor_qqw_no_data_has_false(self, client, base_url):
        """Vendor with no QQW records should return has_data=False, not error."""
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/qqw")
            assert response.status_code == 200
            data = response.json()
            # has_data can be True or False — but must be a bool
            assert isinstance(data["has_data"], bool)


class TestVendorVerified:
    """Tests for existing verified vendor endpoints."""

    def test_verified_vendors(self, client, base_url):
        """Test getting verified vendor classifications."""
        response = client.get(f"{base_url}/vendors/verified")
        assert response.status_code == 200


class TestVendorSHAP:
    """Tests for GET /vendors/{vendor_id}/shap (v5.2 SHAP explanations)."""

    def test_vendor_shap_returns_200_or_404(self, client, base_url):
        """SHAP endpoint returns 200 if vendor has SHAP data, 404 otherwise."""
        list_response = client.get(f"{base_url}/vendors?per_page=1")
        if list_response.status_code == 200 and list_response.json()["data"]:
            vendor_id = list_response.json()["data"][0]["id"]
            response = client.get(f"{base_url}/vendors/{vendor_id}/shap")
            assert response.status_code in (200, 404)

    def test_vendor_shap_not_found(self, client, base_url):
        """Non-existent vendor should return 404."""
        response = client.get(f"{base_url}/vendors/999999999/shap")
        assert response.status_code == 404

    def test_vendor_shap_structure_when_present(self, client, base_url):
        """When SHAP data exists, response should have risk_factors and protective_factors."""
        list_response = client.get(f"{base_url}/vendors?per_page=20")
        if list_response.status_code != 200:
            return
        for vendor in list_response.json().get("data", []):
            response = client.get(f"{base_url}/vendors/{vendor['id']}/shap")
            if response.status_code == 200:
                data = response.json()
                assert "top_risk_factors" in data
                assert "top_protect_factors" in data
                assert isinstance(data["top_risk_factors"], list)
                assert isinstance(data["top_protect_factors"], list)
                break

    def test_vendor_shap_picks_main_sector_row(self, client, base_url):
        """vendor_shap_v52 holds one row per (vendor, sector); /shap must return
        the vendor's main-sector row (most contracts), not an arbitrary one.
        Vendor 48 has sector 3 (n=2) and sector 4 (n=47) — PARALLAX D13 § Change 1."""
        response = client.get(f"{base_url}/vendors/48/shap")
        if response.status_code == 404:
            pytest.skip("vendor 48 has no v5.2 SHAP row in this database")
        assert response.status_code == 200
        data = response.json()
        assert data["n_contracts"] == 47
        assert data["top_risk_factors"][0]["factor"] == "vendor_concentration"


def test_waterfall_v52_fallback_names_its_source():
    """A DB without contract_z_features (the deploy DB) falls back to
    vendor_shap_v52; the response must say so (source="v52") and read the
    vendor's main-sector row — PARALLAX D13 § judge 2."""
    import sqlite3
    from api.routers.vendors import _build_waterfall

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE model_calibration (id INTEGER, sector_id INTEGER, model_version TEXT, run_id TEXT,"
        " intercept REAL, coefficients TEXT, pu_correction_factor REAL, created_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE vendor_shap_v52 (vendor_id INTEGER, sector_id INTEGER, n_contracts INTEGER,"
        " shap_values TEXT, mean_z_vector TEXT)"
    )
    conn.execute("INSERT INTO vendor_shap_v52 VALUES (48, 3, 2, '{\"institution_risk\": 0.0065}', '{}')")
    conn.execute("INSERT INTO vendor_shap_v52 VALUES (48, 4, 47, '{\"vendor_concentration\": 2.6728}', '{}')")

    items, total, source = _build_waterfall(conn, "vendor_id", 48)
    assert source == "v52"
    assert total == 47
    assert items[0].feature == "vendor_concentration"


class TestVendorPeerSingleBidCompetitive:
    """Single bids ÷ competitive procedures (PARALLAX D13b § 4)."""

    def test_competitive_rate_on_its_own_base(self, client, base_url):
        response = client.get(f"{base_url}/vendors/248612/peer-comparison")
        if response.status_code == 404:
            pytest.skip("vendor 248612 not in this database")
        assert response.status_code == 200
        m = {x["metric"]: x for x in response.json()["metrics"]}
        assert "single_bid_competitive_pct" in m
        assert m["single_bid_competitive_pct"]["value"] == pytest.approx(100.0, abs=0.01)
        # the all-contracts metric is unchanged for its other callers
        assert m["single_bid_pct"]["value"] == pytest.approx(64.71, abs=0.01)


class TestVendorWaterfallAllTerms:
    """Every active term decomposed (PARALLAX D13b § 6): 21 non-zero terms under v0.9.1."""

    def test_vendor_48_lists_all_active_terms(self, client, base_url):
        response = client.get(f"{base_url}/vendors/48/risk-waterfall")
        if response.status_code == 404:
            pytest.skip("vendor 48 not in this database")
        assert response.status_code == 200
        data = response.json()
        if data.get("source") != "z_features":
            pytest.skip("no per-contract features in this database (v5.2 fallback)")
        items = {i["feature"]: i for i in data["items"]}
        assert len(items) == 21
        assert all(i["coefficient"] != 0 for i in items.values())
        assert {"cobid_herfindahl", "rt4_log", "has_partida"} <= set(items)


class TestVendorYearlyAmounts:
    """The list rows carry the by-year series (DESIGN.md §8.1 vendor preset sparkline)."""

    @pytest.mark.parametrize("path,id_key", [
        ("/vendors?per_page=5&sort_by=total_value", "id"),
        ("/vendors/top?by=value&limit=5", "vendor_id"),
    ])
    def test_series_sums_to_the_dossier_total(self, client, base_url, path, id_key):
        rows = client.get(f"{base_url}{path}").json()["data"]
        assert rows
        for r in rows[:3]:
            years = [y["year"] for y in r["yearly_amounts"]]
            assert years == sorted(years)
            dossier = client.get(f"{base_url}/vendors/{r[id_key]}").json()
            assert sum(y["amount_mxn"] for y in r["yearly_amounts"]) == pytest.approx(dossier["total_value_mxn"], rel=1e-9)

    def test_sector_series_sums_to_the_sector_row(self, client, base_url):
        rows = client.get(f"{base_url}/vendors/top?by=value&limit=10&sector_id=1").json()["data"]
        assert rows
        for r in rows:
            # rows come from the sector_top_vendors precompute, which may lag vendor_year by a refresh
            assert sum(y["amount_mxn"] for y in r["yearly_amounts"]) == pytest.approx(r["total_value_mxn"], rel=0.02)
