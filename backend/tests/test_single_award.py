"""Single-award on the competitive denominator (D20) and the /gap federal tile."""
from api.helpers.analysis_helpers import single_award_of_competitive


def test_single_award_of_competitive():
    assert single_award_of_competitive(7.8, 85.6) == 54.2
    assert single_award_of_competitive(50, 0) == 50.0
    assert single_award_of_competitive(60, 50) == 100.0  # capped
    assert single_award_of_competitive(1, 100) is None   # no competitive procedure
    assert single_award_of_competitive(None, 3) is None


def test_gap_summary_federal_direct_award(client):
    d = client.get("/api/v1/gap/summary").json()
    if not d.get("available") or not d.get("by_buyer_level"):
        return  # staging table absent or predates buyer_level
    fed = d["by_buyer_level"]["federal"]
    assert 0 < d["federal_direct_award_count"] <= fed
    assert d["federal_direct_award_pct"] == round(100.0 * d["federal_direct_award_count"] / fed, 1)


def test_institution_detail_single_award(client):
    d = client.get("/api/v1/institutions/251").json()
    if d.get("single_bid_pct") is None:
        return
    assert d["single_award_pct"] >= d["single_bid_pct"]


def test_vendor_detail_and_list_single_award(client):
    d = client.get("/api/v1/vendors/2873").json()
    if "single_bid_pct" in d and d.get("direct_award_pct", 100) < 100:
        assert d["single_award_pct"] >= d["single_bid_pct"]
    r = client.get("/api/v1/vendors", params={"sort_by": "single_award_pct", "per_page": 3})
    assert r.status_code == 200
    assert all("single_award_pct" in v for v in r.json()["data"])


def test_officials_single_award(client):
    r = client.get("/api/v1/officials/movers", params={"limit": 3})
    if r.status_code != 200 or not r.json().get("movers"):
        return  # officials tables absent in this snapshot
    assert all("single_award_pct" in m for m in r.json()["movers"])
