"""
Tests for GET /aria/rosettes — the Focos Rojos «Rayos X» wall.

One request carries every tier-1 vendor's largest contracts as compact tuples
[year, amount_mxn, risk_score, is_direct_award], so the wall paints without
~98 per-vendor fetches. Pins: shape, the per-vendor cap, amount order, the
100B rejection rule, and that false-positive vendors never reach the wall.

Data assertions skip on the dataless default run; exercise them with
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_aria_rosettes.py -q -p no:cacheprovider
"""
import pytest

pytestmark = pytest.mark.slow  # full-table scans; nightly (-m slow)


@pytest.fixture(scope="module")
def body(client, base_url):
    r = client.get(f"{base_url}/aria/rosettes?per_vendor=20")
    assert r.status_code == 200
    return r.json()


def test_envelope(body):
    assert body["tier"] == 1
    assert body["per_vendor"] == 20
    assert isinstance(body["vendors"], dict)


def test_tuples_are_capped_ranked_and_valid(body):
    if not body["vendors"]:
        pytest.skip("no ARIA tier 1 in the configured database")
    for rows in body["vendors"].values():
        assert 0 < len(rows) <= 20
        amounts = [r[1] for r in rows]
        assert amounts == sorted(amounts, reverse=True)
        for year, amount, score, da in rows:
            assert 2002 <= year <= 2026  # ComprasMX 2026 (DATA_LAST_YEAR)
            assert 0 < amount <= 100_000_000_000
            assert score is None or 0 <= score <= 1
            assert da in (0, 1)


def test_false_positives_never_reach_the_wall(body, client, base_url):
    if not body["vendors"]:
        pytest.skip("no ARIA tier 1 in the configured database")
    from api.dependencies import get_db
    from api.public_labels import label_sets
    with get_db() as conn:
        fp = label_sets(conn)["fp"]
    assert not fp & {int(k) for k in body["vendors"]}
    # ICA (1094) is an analyst-marked false positive in tier 1.
    assert "1094" not in body["vendors"]


def test_per_vendor_is_bounded(client, base_url):
    assert client.get(f"{base_url}/aria/rosettes?per_vendor=500").status_code == 422


@pytest.fixture(scope="module")
def nuevos(client, base_url):
    r = client.get(f"{base_url}/aria/rosettes?set=nuevos&tier=2&per_vendor=10")
    assert r.status_code == 200
    return r.json()


def test_nuevos_are_novel_recent_and_drawn(nuevos, client, base_url):
    """«Nuevos» (owner 2026-10-16): tier 2, no ground-truth link, not suppressed, not an analyst FP, active 2019+."""
    items = nuevos.get("items", [])
    if not items:
        pytest.skip("no ARIA tier 2 in the configured database")
    assert nuevos["set"] == "nuevos" and nuevos["tier"] == 2
    vals = [it["total_value_mxn"] for it in items]
    assert vals == sorted(vals, reverse=True)
    for it in items:
        assert it["ips_tier"] == 2 and it["in_ground_truth"] is False
        assert it["last_contract_year"] >= 2019
        assert str(it["vendor_id"]) in nuevos["vendors"]
        assert "rfc" not in it
        assert isinstance(it["persona_fisica"], bool)  # the UI labels a persona física by this flag
        assert "primary_sector_name" in it and "avg_risk_score" in it  # the wall's sector filter + list column
    t1 = client.get(f"{base_url}/aria/rosettes?per_vendor=1").json()["vendors"]
    assert not (set(nuevos["vendors"]) & set(t1)), "a known-case vendor leaked into «Nuevos»"


def test_nuevos_items_only(client, base_url):
    body = client.get(f"{base_url}/aria/rosettes?set=nuevos&tier=3&per_vendor=0").json()
    assert body["vendors"] == {}
    if body.get("items"):
        assert all(it["ips_tier"] == 3 for it in body["items"])
        # Rule 1: the register's buyer renders as an entity chip, so a named buyer carries an id.
        assert all("top_institution_id" in it for it in body["items"])
        assert any(it["top_institution_id"] for it in body["items"] if it["top_institution"])
