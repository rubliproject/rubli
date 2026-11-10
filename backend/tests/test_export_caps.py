"""Live audit L4/lead L2 (_security/live.md): no whole-table export in one call.
Unfiltered contract exports are capped at UNFILTERED_EXPORT_ROWS; larger pulls need a filter."""
import pytest


@pytest.mark.parametrize("fmt", ["csv", "excel"])
def test_unfiltered_large_contract_export_rejected(client, fmt):
    assert client.get(f"/api/v1/export/contracts/{fmt}?limit=10001").status_code == 422


def test_filtered_large_contract_export_allowed_past_guard(client):
    from api.routers import export

    assert export.UNFILTERED_EXPORT_ROWS == 10_000  # UI default still works unfiltered
    r = client.get("/api/v1/export/contracts/csv?sector_id=10&year=2024&limit=10001")
    assert r.status_code == 200
