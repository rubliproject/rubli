"""
Tests for contract API endpoints.
"""
import math

import pytest


class TestContractList:
    """Tests for GET /api/v1/contracts."""

    def test_list_contracts_default(self, client, base_url):
        """Test default contract listing returns paginated results."""
        response = client.get(f"{base_url}/contracts")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["per_page"] == 50

    def test_list_contracts_custom_pagination(self, client, base_url):
        """Test custom pagination parameters."""
        response = client.get(f"{base_url}/contracts?page=2&per_page=10")
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["page"] == 2
        assert data["pagination"]["per_page"] == 10

    def test_list_contracts_filter_by_sector(self, client, base_url):
        """Test filtering contracts by sector_id."""
        response = client.get(f"{base_url}/contracts?sector_id=1")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    def test_list_contracts_filter_by_risk_level(self, client, base_url):
        """Test filtering contracts by risk_level."""
        for level in ["critical", "high", "medium", "low"]:
            response = client.get(f"{base_url}/contracts?risk_level={level}")
            assert response.status_code == 200

    def test_list_contracts_filter_by_year(self, client, base_url):
        """Test filtering contracts by year."""
        response = client.get(f"{base_url}/contracts?year=2024")
        assert response.status_code == 200

    def test_list_contracts_search(self, client, base_url):
        """Test searching contracts."""
        response = client.get(f"{base_url}/contracts?search=pemex")
        assert response.status_code == 200

    def test_list_contracts_response_shape(self, client, base_url):
        """Test response data shape has expected fields."""
        response = client.get(f"{base_url}/contracts?per_page=1")
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            contract = data["data"][0]
            assert "id" in contract
            assert "amount_mxn" in contract or "importe_contrato" in contract


class TestMonthAndCategorySplit:
    """W7 (/administrations): a year's month list and its money by category."""

    def test_month_filter(self, client, base_url):
        rows = client.get(f"{base_url}/contracts?year=2024&month=3&per_page=20").json()["data"]
        assert rows and all((r["contract_date"] or "")[:7] == "2024-03" for r in rows)
        assert client.get(f"{base_url}/contracts?month=3").status_code == 400
        assert client.get(f"{base_url}/contracts?year=2024&month=13").status_code == 422

    def test_by_category_adds_up(self, client, base_url):
        y = client.get(f"{base_url}/contracts/by-category?year=2024").json()
        m = client.get(f"{base_url}/contracts/by-category?year=2024&month=3").json()
        assert y["rows"] and y["contracts"] == sum(r["contracts"] for r in y["rows"])
        assert [r["value"] for r in y["rows"]] == sorted((r["value"] for r in y["rows"]), reverse=True)
        assert 0 < m["value"] < y["value"] and m["month"] == 3
        assert client.get(f"{base_url}/contracts/by-category").status_code == 422


class TestContractPagination:
    """Tests for contract pagination edge cases."""

    def test_page_zero_is_invalid(self, client, base_url):
        """Page 0 should be rejected or treated as page 1."""
        response = client.get(f"{base_url}/contracts?page=0")
        # Either 422 validation error or auto-corrected to page 1
        assert response.status_code in [200, 422]

    def test_large_page_returns_200(self, client, base_url):
        """
        Very large page number: the service clamps it to max page 1000,
        so the response is always 200 (not empty for a large database).
        """
        response = client.get(f"{base_url}/contracts?page=999999")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data


class TestContractAmountValidation:
    """Tests that amount filter parameters enforce the 100B MXN ceiling and non-negative floor."""

    def test_max_amount_above_100b_returns_422(self, client, base_url):
        """
        max_amount=150_000_000_000 (150B) exceeds the 100B MXN ceiling.
        The Query(..., le=100_000_000_000) annotation causes FastAPI to return 422.
        """
        response = client.get(
            f"{base_url}/contracts",
            params={"max_amount": 150_000_000_000},
        )
        assert response.status_code == 422, (
            f"Expected 422 for max_amount > 100B, got {response.status_code}"
        )

    def test_min_amount_negative_returns_422(self, client, base_url):
        """
        min_amount=-1 is below the ge=0 constraint — must return 422.
        """
        response = client.get(
            f"{base_url}/contracts",
            params={"min_amount": -1},
        )
        assert response.status_code == 422, (
            f"Expected 422 for min_amount < 0, got {response.status_code}"
        )

    def test_min_greater_than_max_returns_422_or_empty(self, client, base_url):
        """
        min_amount=5_000_000_000 > max_amount=1_000_000_000 is a logical contradiction.
        The API returns either 422 (validation) or 200 with empty results.
        Both are acceptable — we just verify the response is not a server error.
        """
        response = client.get(
            f"{base_url}/contracts",
            params={"min_amount": 5_000_000_000, "max_amount": 1_000_000_000},
        )
        assert response.status_code in (200, 422), (
            f"Unexpected status {response.status_code} for min > max"
        )
        if response.status_code == 200:
            data = response.json()
            assert data["data"] == [], (
                "Expected empty data when min_amount > max_amount"
            )

    def test_valid_max_amount_at_ceiling_is_accepted(self, client, base_url):
        """max_amount exactly at 100B (the ceiling) must be accepted."""
        response = client.get(
            f"{base_url}/contracts",
            params={"max_amount": 100_000_000_000},
        )
        assert response.status_code == 200

    def test_valid_amount_range_returns_data_envelope(self, client, base_url):
        """A sensible amount range must return the standard data/pagination envelope."""
        response = client.get(
            f"{base_url}/contracts",
            params={"min_amount": 1_000_000, "max_amount": 10_000_000},
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data

    def test_list_includes_documented_case_seal_fields(self, client, base_url):
        """Every list row carries the documented-case seal fields (default False)."""
        response = client.get(f"{base_url}/contracts?per_page=5")
        assert response.status_code == 200
        rows = response.json()["data"]
        assert rows, "expected at least one contract"
        for row in rows:
            assert "is_documented_case" in row
            assert "case_slug" in row
            # A non-documented row must not carry a stray slug.
            if not row["is_documented_case"]:
                assert row["case_slug"] is None


class TestContractDetailSeal:
    """GET /api/v1/contracts/{id} carries the documented-case seal (D12 § Change 7)."""

    def test_detail_documented_case_seal(self, client, base_url):
        response = client.get(f"{base_url}/contracts/246083")
        if response.status_code == 404:
            pytest.skip("contract 246083 absent (stub DB)")
        assert response.status_code == 200
        data = response.json()
        if not data["is_documented_case"]:
            pytest.skip("scandal tables empty (stub DB)")
        assert data["case_slug"] == "oceanografia-pemex-fraud"
        assert data["case_name_es"]

    def test_detail_routine_contract_unsealed(self, client, base_url):
        response = client.get(f"{base_url}/contracts/1500000")
        if response.status_code == 404:
            pytest.skip("contract 1500000 absent (stub DB)")
        assert response.status_code == 200
        data = response.json()
        assert data["is_documented_case"] is False
        assert data["case_slug"] is None


class TestContractHighlights:
    """Tests for GET /api/v1/contracts/highlights — the "Los Señalados" band."""

    def test_highlights_returns_list(self, client, base_url):
        response = client.get(f"{base_url}/contracts/highlights")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 8

    def test_highlights_respects_limit(self, client, base_url):
        response = client.get(f"{base_url}/contracts/highlights?limit=3")
        assert response.status_code == 200
        assert len(response.json()) <= 3

    def test_highlights_items_carry_seal_and_risk(self, client, base_url):
        """Each highlighted item must expose the seal + risk fields the band renders."""
        response = client.get(f"{base_url}/contracts/highlights?limit=4")
        assert response.status_code == 200
        for item in response.json():
            assert "is_documented_case" in item
            assert "risk_score" in item
            assert "title" in item
            if item["is_documented_case"]:
                # A sealed item must resolve to a /cases/:slug destination.
                assert item["case_slug"]

    def test_highlights_documented_lead(self, client, base_url):
        """Unfiltered, documented cases sort ahead of undocumented fill."""
        response = client.get(f"{base_url}/contracts/highlights?limit=6")
        assert response.status_code == 200
        flags = [bool(i["is_documented_case"]) for i in response.json()]
        if True in flags and False in flags:
            # No undocumented item may appear before a documented one.
            assert flags.index(False) > flags.index(True)

    def test_highlights_filter_and_validation(self, client, base_url):
        """Filters pass through; an invalid risk_level is rejected."""
        assert client.get(f"{base_url}/contracts/highlights?sector_id=1").status_code == 200
        assert client.get(f"{base_url}/contracts/highlights?risk_level=bogus").status_code == 400

    def test_rows_carry_board_columns(self, client, base_url):
        """El Archivo rows read like the Portada board: siglas, procedure, category (+ subcategory)."""
        keys = {"institution_siglas", "procedure", "category_id", "category_es", "category_en", "subcategory_es", "subcategory_en"}
        rows = client.get(f"{base_url}/contracts/highlights?limit=6").json()
        rows += client.get(f"{base_url}/contracts?per_page=20").json()["data"]
        assert rows and all(keys <= r.keys() for r in rows)
        assert any(r["category_id"] and r["category_es"] for r in rows)
        assert {r["procedure"] for r in rows} <= {None, "directa", "licitacion", "invitacion", "otro"}

    def test_highlights_one_row_per_case(self, client, base_url):
        """A documented case appears once — Oceanografía used to fill all 12 slots."""
        response = client.get(f"{base_url}/contracts/highlights?limit=12")
        assert response.status_code == 200
        slugs = [i["case_slug"] for i in response.json() if i["case_slug"]]
        assert len(slugs) == len(set(slugs))

    def test_dedupe_band_keeps_order_and_first_of_case(self):
        from api.services.contract_service import _dedupe_band

        rows = [
            {"id": 1, "case_slug": "oceanografia"},
            {"id": 2, "case_slug": "oceanografia"},
            {"id": 3, "case_slug": "estafa-maestra"},
            {"id": 4, "case_slug": None},
            {"id": 4, "case_slug": None},
            {"id": 5, "case_slug": None},
        ]
        assert [r["id"] for r in _dedupe_band(rows, 12)] == [1, 3, 4, 5]
        assert [r["id"] for r in _dedupe_band(rows, 2)] == [1, 3]


class TestRiskExplainActiveModel:
    """GET /contracts/{id}/risk-explain decomposes with the ACTIVE calibration (D12b § Change 1)."""

    def test_explain_uses_cal_v91(self, client, base_url):
        response = client.get(f"{base_url}/contracts/246083/risk-explain")
        if response.status_code == 404:
            pytest.skip("contract 246083 absent (stub DB)")
        assert response.status_code == 200
        data = response.json()
        if not data["explanation_available"]:
            pytest.skip("contract_z_features absent (deploy DB)")
        assert data["run_id"].startswith("CAL-v91")
        assert data["intercept"] < -0.5


class TestContractContextPair:
    """GET /contracts/{id}/context pair fields (D12b § Changes 3–5)."""

    def _ctx(self, client, base_url, cid):
        response = client.get(f"{base_url}/contracts/{cid}/context")
        if response.status_code == 404:
            pytest.skip(f"contract {cid} absent (stub DB)")
        assert response.status_code == 200
        return response.json()

    def test_pair_tied_count(self, client, base_url):
        pair = self._ctx(client, base_url, 1500000)["pair"]
        assert pair["tied"] >= 0
        if pair["total_contracts"] == 7:
            assert pair["this_rank"] == 1 and pair["tied"] == 1

    def test_pair_by_year_sums_to_total(self, client, base_url):
        for cid in (246083, 1289865):
            pair = self._ctx(client, base_url, cid)["pair"]
            if not pair["total_contracts"]:
                continue
            by_year = pair["by_year"]
            assert by_year, "by_year missing"
            assert sum(y["n"] for y in by_year) <= pair["total_contracts"]
            assert abs(sum(y["sum"] for y in by_year) - pair["total_amount_mxn"]) < 1.0
            years = [y["year"] for y in by_year]
            assert years == sorted(years)

    def test_evidence_on_documented_contract(self, client, base_url):
        ctx = self._ctx(client, base_url, 246083)
        if ctx["evidence"] is None:
            pytest.skip("GT tables empty (stub DB)")
        assert "9.33" in ctx["evidence"]["source_reference"]
        assert ctx["evidence"]["source_url"].startswith("http")

    def test_evidence_absent_on_routine_contract(self, client, base_url):
        assert self._ctx(client, base_url, 1500000)["evidence"] is None

    def test_vendor_standing(self, client, base_url):
        st = self._ctx(client, base_url, 1289865)["vendor_standing"]
        if st is None:
            pytest.skip("aria_queue empty (stub DB)")
        assert set(st) == {"queue_name", "ips_tier", "primary_pattern", "in_ground_truth", "has_unverified_lead", "is_efos_definitivo", "is_sfp_sanctioned"}
        assert st["ips_tier"] == 1 and st["primary_pattern"] == "P1" and st["in_ground_truth"] is True


class TestRiskLevelMin:
    """risk_level_min is a floor: high = high + critical (D12b § Change 7)."""

    def test_floor_includes_critical(self, client, base_url):
        r = client.get(f"{base_url}/contracts?risk_level_min=high&risk_factor=price_hyp&sort_by=risk_score&sort_order=desc&per_page=5")
        assert r.status_code == 200
        for row in r.json()["data"]:
            assert row["risk_score"] >= 0.40

    def test_floor_validation(self, client, base_url):
        assert client.get(f"{base_url}/contracts?risk_level_min=bogus").status_code == 400


class TestEvidencePlaceholder:
    """A case-level placeholder never renders as a quote (D12b judge 2)."""

    def _db(self, rows):
        import sqlite3
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE ground_truth_contracts (contract_id INTEGER, evidence_tier TEXT, "
            "evidence_strength TEXT, source_reference TEXT, source_url TEXT)"
        )
        conn.executemany("INSERT INTO ground_truth_contracts VALUES (?,?,?,?,?)", rows)
        return conn

    def test_placeholder_only_is_null(self):
        from api.routers.contracts import pick_contract_evidence
        conn = self._db([
            (1, "L1_audit_attested", "high", "ASF PEMEX audits; case-level source_asf", ""),
            (1, "L3_portfolio_swept", "medium", None, None),
        ])
        assert pick_contract_evidence(conn.cursor(), 1) is None

    def test_real_finding_beats_placeholder(self):
        from api.routers.contracts import pick_contract_evidence
        finding = "Contract 428237849 showed probable damage exceeding 100 million pesos; 9.33% physical progress vs 71.41% scheduled."
        conn = self._db([
            (2, "L1_audit_attested", "high", "ASF PEMEX audits; case-level source_asf", ""),
            (2, "direct", "high", finding, "https://example.org/a"),
        ])
        ev = pick_contract_evidence(conn.cursor(), 2)
        assert ev is not None and ev.source_reference == finding
        assert ev.kind == "summary"  # curator paraphrase, never rendered as a quote (D12c § 7)

    def test_short_reference_is_null(self):
        from api.routers.contracts import pick_contract_evidence
        conn = self._db([(3, "direct", "high", "ASF audit 2013", "https://example.org/b")])
        assert pick_contract_evidence(conn.cursor(), 3) is None


class TestRiskExplainComplete:
    """The contract decomposition carries all 18 active terms (PARALLAX D13b § 6)."""

    def test_uncapped_contract_reconciles(self, client, base_url):
        response = client.get(f"{base_url}/contracts/59/risk-explain")
        if response.status_code == 404:
            pytest.skip("contract 59 not in this database")
        assert response.status_code == 200
        e = response.json()
        if not e["explanation_available"]:
            pytest.skip("no per-contract features in this database")
        assert len(e["features"]) == 21  # v0.9.1: 21 non-zero of 27 (incl. partida + RT-4 terms)
        assert e["omitted_features"] == []
        # indicator = σ(intercept + Σ) / c  →  intercept + Σ = logit(score · c)
        p = e["risk_score"] * e["pu_correction"]
        assert 0 < p < 1
        total = e["intercept"] + sum(f["contribution"] for f in e["features"])
        assert total == pytest.approx(math.log(p / (1 - p)), abs=1e-3)


def test_contracts_by_vendor_and_institution_200(client, base_url):
    """Both wrappers called list_contracts without risk_level_min, so the
    Query(None) default leaked in and every request 500'd (weekend #9)."""
    assert client.get(f"{base_url}/contracts/by-vendor/10179", params={"per_page": 5}).status_code == 200
    assert client.get(f"{base_url}/contracts/by-institution/1", params={"per_page": 5}).status_code == 200


def test_search_is_capped(client, base_url, monkeypatch):
    """Free-text search: > 100 chars rejected; a scan past the budget stops with a 422, not a hang."""
    from api.routers import contracts as c
    assert client.get(f"{base_url}/contracts?search={'x' * 101}").status_code == 422
    monkeypatch.setattr(c, "SEARCH_BUDGET_S", 0.0)
    r = client.get(f"{base_url}/contracts?search=zzqqxxnotaword")
    assert r.status_code == 422 and "too broad" in r.text


class TestMonthSignals:
    """W7 risk months: GET /sexenios/month-signals?year= adds up to the month's list (same rows)."""

    def test_month_signals(self, client, base_url):
        r = client.get(f"{base_url}/sexenios/month-signals?year=2024")
        assert r.status_code == 200
        d = r.json()
        assert [m["month"] for m in d["months"]] == list(range(1, 13)) and d["source"] == "compranet"
        assert abs(sum(m["value"] for m in d["months"]) - d["value"]) < 1
        assert d["crit_n"] == sum(m["crit_n"] for m in d["months"]) <= d["contracts"]
        if d["new_vendor"]:
            assert 0 < d["new_vendor"]["share"] <= 1 and "rfc" not in d["new_vendor"]
        for m in d["months"]:
            assert 0 <= m["crit_value"] <= m["value"] + 0.01 and 0 <= m["crit_n"] <= m["contracts"]
            if m["top_crit"]:
                assert m["top_crit"]["amount"] <= m["crit_value"] + 0.01
            if m["top_sector"]:
                assert 1 <= m["top_sector"]["sector_id"] <= 12
        m3 = d["months"][2]
        lst = client.get(f"{base_url}/contracts?year=2024&month=3&column_rows=true&per_page=1").json()
        crit = client.get(f"{base_url}/contracts?year=2024&month=3&column_rows=true&risk_level=critical&per_page=1").json()
        assert lst["pagination"]["total"] == m3["contracts"]
        assert crit["pagination"]["total"] == m3["crit_n"]
        assert client.get(f"{base_url}/sexenios/month-signals?year=1999").status_code == 422
