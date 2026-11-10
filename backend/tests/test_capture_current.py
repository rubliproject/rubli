"""
Tests for /capture/current — «Pasada la mitad»: buyers whose #1 private
supplier held over half of their 2024 – Sep 2025 spend.
"""

from api.public_labels import label_sets


class TestCaptureCurrent:
    def test_shape_and_counts(self, client, base_url):
        resp = client.get(f"{base_url}/capture/current")
        assert resp.status_code == 200
        data = resp.json()
        for key in (
            "window", "thresholds", "field_count", "majority_count_all", "excluded",
            "excluded_pairs", "count", "held_mxn", "buyers_total_mxn", "pairs", "generated_at",
        ):
            assert key in data, f"missing key {key}"
        assert data["count"] == len(data["pairs"])
        # majority_all = kept + every excluded reason (they must reconcile)
        assert data["majority_count_all"] == data["count"] + sum(data["excluded"].values())
        assert 0 < data["count"] <= data["majority_count_all"] <= data["field_count"]
        assert data["held_mxn"] <= data["buyers_total_mxn"]

    def test_pairs_past_half_sorted_and_clean(self, client, base_url, _isolated_db):
        data = client.get(f"{base_url}/capture/current").json()
        pairs = data["pairs"]
        assert all(p["window_share_pct"] >= 50 for p in pairs)
        money = [p["window_vendor_mxn"] for p in pairs]
        assert money == sorted(money, reverse=True)
        fp = label_sets(_isolated_db)["fp"]
        assert not [p["vendor_id"] for p in pairs if p["vendor_id"] in fp]
        assert "rfc" not in str(data).lower()  # pii rule

    def test_pair_detail(self, client, base_url):
        p = client.get(f"{base_url}/capture/current").json()["pairs"][0]
        assert [y["year"] for y in p["years"]] == [2021, 2022, 2023, 2024, 2025]
        assert 1 <= len(p["top_titles"]) <= 2
        assert all(t["contract_id"] for t in p["top_titles"])
        assert set(p["seal"]) >= {"gt", "gt_case_id", "ips_tier", "efos", "sfp"}
        assert p["holding"] == ((p["latest_share_pct"] or 0) >= 50)
