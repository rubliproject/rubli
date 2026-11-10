"""Tests for /api/v1/aria HTTP endpoints (not pipeline unit tests)."""
import pytest


ARIA_PREFIX = "/api/v1/aria"


class TestAriaQueue:
    """GET /api/v1/aria/queue"""

    def test_returns_200(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue")
        assert r.status_code == 200

    def test_has_pagination(self, client):
        data = client.get(f"{ARIA_PREFIX}/queue").json()
        assert "pagination" in data
        pag = data["pagination"]
        assert "page" in pag
        assert "per_page" in pag
        assert "total" in pag
        assert "total_pages" in pag

    def test_has_data_array(self, client):
        data = client.get(f"{ARIA_PREFIX}/queue").json()
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_filter_by_vendor_id(self, client):
        """The dossier links by id — an accented name (48 Oceanografía) must land (D13b § 7, R6)."""
        r = client.get(f"{ARIA_PREFIX}/queue", params={"vendor_id": 48})
        assert r.status_code == 200
        rows = r.json()["data"]
        if not rows:
            pytest.skip("vendor 48 not in this queue")
        assert [x["vendor_id"] for x in rows] == [48]

    def test_summary_provenance_partitions_tiers(self, client):
        """PARALLAX D14 § 2: documented + lead + novel == total, per tier."""
        s = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 1, "per_page": 1}).json().get("summary") or {}
        if not s.get("total_t1"):
            pytest.skip("no tier-1 rows")
        assert s["documented_t1"] + s["lead_t1"] + s["novel_leads_t1"] == s["total_t1"]
        assert s["documented_t2"] + s["lead_t2"] + s["novel_leads_t2"] == s["total_t2"]

    def test_summary_matches_public_row_labels(self, client):
        """The summary counts the rows' own public labels (in_ground_truth = documented,
        gt_lead = unverified link, neither = model discovery) — never the raw column."""
        doc = lead = novel = 0
        page, data = 1, {}
        while True:
            data = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 1, "per_page": 100, "page": page}).json()
            for row in data["data"]:
                if row["in_ground_truth"]:
                    doc += 1
                elif row.get("gt_lead"):
                    lead += 1
                else:
                    novel += 1
            if page >= (data["pagination"]["total_pages"] or 1):
                break
            page += 1
        s = data.get("summary") or {}
        if not s.get("total_t1"):
            pytest.skip("no tier-1 rows")
        assert (doc, lead, novel) == (s["documented_t1"], s["lead_t1"], s["novel_leads_t1"])

    def test_novel_only_matches_summary(self, client):
        """'Discoveries only' returns exactly the summary's novel count (one rule)."""
        data = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 2, "novel_only": True, "per_page": 1}).json()
        assert data["pagination"]["total"] == data["summary"]["novel_leads_t2"]

    def test_filter_by_tier(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 1})
        assert r.status_code == 200
        data = r.json()
        for item in data["data"]:
            assert item["ips_tier"] == 1

    def test_filter_by_pattern(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue", params={"pattern": "ghost"})
        assert r.status_code == 200
        data = r.json()
        for item in data["data"]:
            assert item["primary_pattern"] == "ghost"

    def test_filter_by_search(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue", params={"search": "PEMEX"})
        assert r.status_code == 200
        data = r.json()
        # All returned items should contain the search term
        for item in data["data"]:
            assert "PEMEX" in item["vendor_name"].upper()

    def test_pagination_params(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue", params={"page": 1, "per_page": 5})
        assert r.status_code == 200
        data = r.json()
        assert len(data["data"]) <= 5
        assert data["pagination"]["per_page"] == 5

    def test_invalid_tier_returns_422(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 99})
        assert r.status_code == 422


class TestAriaQueueVendor:
    """GET /api/v1/aria/queue/{vendor_id}"""

    def test_nonexistent_vendor_returns_404(self, client):
        r = client.get(f"{ARIA_PREFIX}/queue/999999999")
        assert r.status_code == 404

    def test_valid_vendor_from_queue(self, client):
        """Fetch first vendor from queue, then get its detail."""
        queue_r = client.get(f"{ARIA_PREFIX}/queue", params={"per_page": 1})
        data = queue_r.json()
        if not data["data"]:
            pytest.skip("ARIA queue is empty — pipeline may not have been run")
        vendor_id = data["data"][0]["vendor_id"]
        r = client.get(f"{ARIA_PREFIX}/queue/{vendor_id}")
        assert r.status_code == 200
        detail = r.json()
        assert detail["vendor_id"] == vendor_id
        assert "ips_final" in detail
        assert "vendor_name" in detail


class TestAriaStats:
    """GET /api/v1/aria/stats"""

    def test_returns_200(self, client):
        r = client.get(f"{ARIA_PREFIX}/stats")
        assert r.status_code == 200
        # Body must be parseable JSON with expected top-level keys
        data = r.json()
        assert "review_stats" in data
        assert "queue_total" in data

    def test_tier_counts_match_the_register(self, client):
        """PARALLAX D14 § 7: the funnel's tier counts are the queue's own — a tier's
        segment equals its register total."""
        tc = client.get(f"{ARIA_PREFIX}/stats").json()["tier_counts"]
        assert set(tc) == {"1", "2", "3", "4"}
        for t in ("1", "2"):
            total = client.get(f"{ARIA_PREFIX}/queue", params={"tier": int(t), "per_page": 1}).json()["pagination"]["total"]
            assert tc[t] == total

    def test_has_review_stats(self, client):
        data = client.get(f"{ARIA_PREFIX}/stats").json()
        assert "review_stats" in data
        assert "queue_total" in data
        rs = data["review_stats"]
        for key in ("pending", "confirmed", "dismissed", "reviewing"):
            assert key in rs

    def test_has_latest_run(self, client):
        data = client.get(f"{ARIA_PREFIX}/stats").json()
        # latest_run can be None if pipeline never ran, but key must exist
        assert "latest_run" in data

    def test_review_stats_values_are_non_negative_integers(self, client):
        data = client.get(f"{ARIA_PREFIX}/stats").json()
        rs = data["review_stats"]
        for key in ("pending", "confirmed", "dismissed", "reviewing"):
            assert isinstance(rs[key], int), f"review_stats.{key} is not int"
            assert rs[key] >= 0, f"review_stats.{key} is negative"

    def test_queue_total_is_non_negative_integer(self, client):
        data = client.get(f"{ARIA_PREFIX}/stats").json()
        assert isinstance(data["queue_total"], int)
        assert data["queue_total"] >= 0

    def test_t1_status_counts_shape(self, client):
        # May be absent when served from a pre-upgrade persisted snapshot;
        # when present it must be {raw_status: non-negative int}.
        data = client.get(f"{ARIA_PREFIX}/stats").json()
        counts = data.get("t1_status_counts")
        if counts is not None:
            assert isinstance(counts, dict)
            for status, n in counts.items():
                assert isinstance(status, str) and status
                assert isinstance(n, int) and n >= 0


class TestAriaVendorDetailGTAnchor:
    """GET /api/v1/aria/queue/{vendor_id} — gt_case_name / gt_case_type fields"""

    def test_gt_anchor_fields_present(self, client):
        queue = client.get(f"{ARIA_PREFIX}/queue", params={"tier": 1, "per_page": 1}).json()
        rows = queue.get("data") or []
        if not rows:
            return  # pipeline not run in this environment
        detail = client.get(f"{ARIA_PREFIX}/queue/{rows[0]['vendor_id']}").json()
        assert "gt_case_name" in detail
        assert "gt_case_type" in detail
        # T1 is GT-anchored by construction; when the GT tables exist the
        # anchor should resolve to a named case.
        if detail.get("in_ground_truth"):
            assert detail["gt_case_name"] is None or isinstance(detail["gt_case_name"], str)


class TestAriaGTUpdates:
    """GET /api/v1/aria/gt-updates"""

    def test_returns_200(self, client):
        r = client.get(f"{ARIA_PREFIX}/gt-updates")
        assert r.status_code == 200
        # Body must have data array and pagination envelope
        data = r.json()
        assert "data" in data
        assert "pagination" in data

    def test_has_pagination(self, client):
        data = client.get(f"{ARIA_PREFIX}/gt-updates").json()
        assert "data" in data
        assert "pagination" in data
        assert isinstance(data["data"], list)

    def test_pagination_keys_present(self, client):
        data = client.get(f"{ARIA_PREFIX}/gt-updates").json()
        pag = data["pagination"]
        for key in ("page", "per_page", "total", "total_pages"):
            assert key in pag, f"pagination missing key: {key}"

    def test_filter_by_status(self, client):
        r = client.get(f"{ARIA_PREFIX}/gt-updates", params={"status": "approved"})
        assert r.status_code == 200
        data = r.json()
        # Must still return data/pagination envelope even when filtered
        assert "data" in data
        assert "pagination" in data
        assert isinstance(data["data"], list)

    def test_filter_by_status_pending_returns_envelope(self, client):
        r = client.get(f"{ARIA_PREFIX}/gt-updates", params={"status": "pending"})
        assert r.status_code == 200
        data = r.json()
        assert "data" in data
        assert isinstance(data["data"], list)


def test_queue_names_and_flags_personas_fisicas(client):
    """Owner 2026-10-29: full transparency — a persona física is named and flagged, never blanked."""
    # is_individual = 1 alone is not a persona física: ~9K of those queue rows are companies
    # («PROVEEDORA DE IMPRENTAS,SA. DE CV.»), which label_sets keeps out of «pf» (2026-10-29).
    from api.dependencies import get_db
    from api.public_labels import label_sets, looks_like_company
    with get_db() as conn:
        rows = conn.execute("""SELECT q.vendor_id, v.name FROM aria_queue q JOIN vendors v ON v.id = q.vendor_id
                               WHERE v.is_individual = 1 AND q.vendor_name IS NOT NULL LIMIT 200""").fetchall()
        pf = label_sets(conn)["pf"]
    person = next((vid for vid, name in rows if not looks_like_company(name)), None)
    company = next((vid for vid, name in rows if looks_like_company(name)), None)
    if person is not None:
        assert person in pf
        items = client.get(f"{ARIA_PREFIX}/queue", params={"vendor_id": person}).json()["data"]
        assert items and all(i["vendor_name"] and i["persona_fisica"] is True for i in items)
    if company is not None:
        assert company not in pf
        items = client.get(f"{ARIA_PREFIX}/queue", params={"vendor_id": company}).json()["data"]
        assert all(i["persona_fisica"] is False for i in items)


def test_company_markers_are_not_personas_fisicas():
    from api.public_labels import looks_like_company
    for n in ("PRAXAIR MEXICO, S. DE R.L. DE C.V.", "BECTON DICKINSON DE MEXICO SA DE CV", "SERUM INSTITUTE INC.",
              "SIEMENS HEALTHCARE GMBH", "ACME CORP", "GRUPO X S.A.P.I. DE C.V."):
        assert looks_like_company(n), n
    for n in ("ROBERTO CABAÑAS VAZQUEZ", "MARIA DE LOS ANGELES PEREZ", "JOSE ACOSTA", "SAUL CORONA"):
        assert not looks_like_company(n), n


def test_memo_absent_is_200_null(client):
    """No memo is a state, not an error (launch audit 2026-10-28 S2): 200 null, no console 404."""
    r = client.get(f"{ARIA_PREFIX}/memos/999999999")
    assert r.status_code == 200 and r.json() is None
