"""
Tests for GET /aria/mapa and /aria/mapa/vendors — Focos Rojos «El mapa de la fila».

The overview groups the fila (tiers 1–3) by main buyer; the ranking returns the IPS order inside a
sector or a buyer, each row with ≤ 3 standout aspects sorted by how extreme they are (over the fila, or for the v0.9.2
model's inputs vol/pr/conc over the vendor's sector — aria_vendor_drivers).
Pins: envelope, totals that add up, IPS order, aspect shape and order, scoped filters.

    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_aria_mapa.py -q -p no:cacheprovider
"""
import pytest

ASPECT_KEYS = {"ratio", "da", "sb", "vpc", "vol", "pr", "conc", "new", "gone", "efos", "sfp", "gt"}  # never "risk": it has its own column


@pytest.fixture(scope="module")
def mapa(client, base_url):
    r = client.get(f"{base_url}/aria/mapa")
    assert r.status_code == 200
    return r.json()


def test_overview_adds_up(mapa):
    t = mapa["totals"]
    assert set(t) == {"vendors", "value", "tier1", "institutions"}
    if not t["vendors"]:
        pytest.skip("no ARIA fila in the configured database")
    assert sum(s["vendors"] for s in mapa["sectors"]) == t["vendors"]
    assert len(mapa["institutions"]) == t["institutions"]
    # institutions carry the fila's vendors that name a buyer; none exceeds the total
    assert 0 < sum(d["vendors"] for d in mapa["institutions"]) <= t["vendors"]
    for d in mapa["institutions"][:50]:
        assert 1 <= d["worst_tier"] <= 3
        assert d["tier1"] <= d["vendors"]
        assert d["institution_id"] is None or d["sector_id"] is not None
    values = [d["value"] for d in mapa["institutions"]]
    assert values == sorted(values, reverse=True)


def test_ranking_is_ips_order_with_sorted_aspects(client, base_url, mapa):
    if not mapa["totals"]["vendors"]:
        pytest.skip("no ARIA fila in the configured database")
    body = client.get(f"{base_url}/aria/mapa/vendors?limit=10").json()
    assert body["rule"] == "ips_final"
    assert body["total"] == mapa["totals"]["vendors"]
    rows = body["data"]
    assert len(rows) == 10
    assert [r["rank"] for r in rows] == list(range(1, 11))
    ips = [r["ips_final"] for r in rows]
    assert ips == sorted(ips, reverse=True)
    for r in rows:
        assert r["ips_tier"] <= 3
        assert not any(k.startswith("pct_") for k in r)
        a = r["aspects"]
        assert 1 <= len(a) <= 3
        assert all(x["k"] in ASPECT_KEYS and 0 <= x["pct"] <= 1 for x in a)
        # a real standout or nothing: the buyer share ≥ 0.8, sole bidder ≥ 0.5, price in the sector's top 5 %
        for x in a:
            if len(a) > 1 and x["k"] in ("ratio", "sb", "vpc"):
                assert x["v"] >= {"ratio": 0.8, "sb": 0.5}.get(x["k"], 0) and (x["k"] != "vpc" or x["pct"] >= 0.95)
            # the model's own inputs only in the top 10 % of the vendor's sector (alone: above its median); a price ratio above the median
            if x["k"] in ("vol", "pr", "conc"):
                assert x["pct"] >= 0.5 and (x["k"] != "pr" or x["v"] > 1)
            if len(a) > 1 and x["k"] in ("vol", "pr", "conc"):
                assert x["pct"] >= 0.9 and (x["k"] != "pr" or x["v"] > 1)
        if len(a) > 1:  # ranked by how extreme, the most extreme first
            assert [x["pct"] for x in a] == sorted((x["pct"] for x in a), reverse=True)


def test_scopes(client, base_url, mapa):
    if not mapa["totals"]["vendors"]:
        pytest.skip("no ARIA fila in the configured database")
    sec = client.get(f"{base_url}/aria/mapa/vendors?sector_id=1&limit=5").json()
    assert all(r["primary_sector_id"] == 1 for r in sec["data"])
    assert sec["total"] == next(s["vendors"] for s in mapa["sectors"] if s["sector_id"] == 1)
    # the eight largest buyers: siglas-keyed (IMSS) and name-keyed (SAE, LICONSA) alike
    for top in [d for d in mapa["institutions"] if d["institution_id"]][:8]:
        inst = client.get(f"{base_url}/aria/mapa/vendors?institution_id={top['institution_id']}&limit=10").json()
        assert inst["total"] == top["vendors"], top["siglas"]
        assert all(r["top_institution_id"] == top["institution_id"] for r in inst["data"])
        assert inst["data"][0]["vendor_id"] == top["top_vendor_id"]
    ids = [d["institution_id"] for d in mapa["institutions"] if d["institution_id"]]
    assert len(ids) == len(set(ids)), "one buyer, one star"
    assert client.get(f"{base_url}/aria/mapa/vendors?institution_id=999999999").json()["data"] == []


def test_escenario_columns_line_up(client, base_url, mapa):
    """GET /aria/mapa/escenario: every column has the fila's length; sexenio money sums never exceed the
    all-time money by more than rounding; aspects keep the [k, v, pct] triple."""
    if not mapa["totals"]["vendors"]:
        pytest.skip("no ARIA fila in the configured database")
    body = client.get(f"{base_url}/aria/mapa/escenario").json()
    n = body["n"]
    assert n == mapa["totals"]["vendors"]
    assert body["sexenios"] == ["fox", "calderon", "pena_nieto", "amlo", "sheinbaum"]
    cols = body["cols"]
    assert all(len(c) == n for c in cols.values()), {k: len(c) for k, c in cols.items()}
    for i in range(min(n, 200)):
        assert len(cols["sx"][i]) == 5 and all(v >= 0 for v in cols["sx"][i])
        # the per-sector split adds up to the total (rounding aside) and its first sector is the main one
        split = cols["ss"][i]
        if split:
            assert cols["sec"][i] == split[0][0]
            assert abs(sum(sum(m) for _, m in split) - sum(cols["sx"][i])) <= len(split) * 5
            assert sum(split[0][1]) >= max(sum(m) for _, m in split)
        assert 1 <= cols["sec"][i] <= 12 and 1 <= cols["tier"][i] <= 3
        for a in cols["asp"][i]:
            assert len(a) == 3 and a[0] in ASPECT_KEYS and 0 <= a[2] <= 1
