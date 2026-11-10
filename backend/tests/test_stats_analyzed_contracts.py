"""`analyzed_contracts` on /stats/data-quality (face spec § 9).

The edition count is appended at response time from the precomputed
`overview` row — the same row /health reads — on every return path, and is
never stored in `data_quality_full`.
"""
from api.routers import stats as stats_router
from api.routers.stats import DataQualityResponse


def _health_count(client, base_url):
    r = client.get(f"{base_url}/health")
    assert r.status_code == 200
    return r.json()["contract_count"]


def test_equals_health_contract_count(client, base_url):
    r = client.get(f"{base_url}/stats/data-quality")
    assert r.status_code == 200
    body = r.json()
    assert "analyzed_contracts" in body
    assert body["analyzed_contracts"] == _health_count(client, base_url)


def test_present_when_data_quality_full_is_stale(client, base_url, monkeypatch):
    stale = DataQualityResponse(
        overall_score=50.0, total_contracts=1, grade_distribution=[], by_structure=[],
        field_completeness=[], key_issues=[], last_calculated=None,
    )
    monkeypatch.setattr(stats_router, "_get_data_quality", lambda response: stale)
    body = client.get(f"{base_url}/stats/data-quality").json()
    assert body["total_contracts"] == 1  # the stale snapshot is served as-is…
    assert body["analyzed_contracts"] == _health_count(client, base_url)  # …the edition count is not
    assert stale.analyzed_contracts is None  # the cached object is never mutated

