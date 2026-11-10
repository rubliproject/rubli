"""Tests for GET /api/v1/atlas/sector-institutions (El Mapa Z1 register).

PARALLAX D15 § 3: the endpoint returns the `limit` largest institutions of a
sector; the page must never present those rows as the sector. The response
carries the sector's own institution count and summed spend, and every row
share against that total is a true share (subset sums never exceed 100 %).
"""
import pytest

PREFIX = "/api/v1/atlas/sector-institutions"


@pytest.mark.parametrize("sector_id", list(range(1, 13)))
def test_sector_totals_bound_the_rows(client, sector_id):
    data = client.get(PREFIX, params={"sector_id": sector_id, "limit": 60}).json()
    rows = data["institutions"]
    assert data["sector_institution_count"] >= len(rows)
    total = data["sector_total_value_mxn"]
    if rows:
        assert total > 0
        share_sum = sum(r["total_amount_mxn"] for r in rows) / total * 100
        assert share_sum <= 100.0 + 1e-6, f"sector {sector_id}: rows sum to {share_sum:.1f}% of the sector"


def test_health_is_more_than_its_sixty_rows(client):
    data = client.get(PREFIX, params={"sector_id": 1, "limit": 60, "scope": "all"}).json()
    assert len(data["institutions"]) == 60
    assert data["sector_institution_count"] > 60


def test_scope_defaults_to_federal_and_counts_its_own_population(client):
    fed = client.get(PREFIX, params={"sector_id": 1, "limit": 60}).json()
    every = client.get(PREFIX, params={"sector_id": 1, "limit": 60, "scope": "all"}).json()
    loc = client.get(PREFIX, params={"sector_id": 1, "limit": 60, "scope": "local"}).json()
    assert (fed["scope"], every["scope"], loc["scope"]) == ("federal", "all", "local")
    assert fed["sector_institution_count"] + loc["sector_institution_count"] == every["sector_institution_count"]
