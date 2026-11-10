"""
Tests for GET /contracts/field — the /contracts «La escalera de montos» object.

Pins: the response shape (hist rows + parallel mark columns), the 5,000 cap,
the 100B rejection rule (never a mark, binned as -1) and the > 10B flag, marks
sorted largest first, and that every filter narrows both the marks and the
histogram. The unfiltered cube is one full scan (20–70 s cold), cached.

Run against the real DB:
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_contracts_field.py -q -p no:cacheprovider
"""
import pytest

COLS = ("id", "amount", "date", "risk", "sector", "da", "flag")


@pytest.fixture(scope="module")
def field(client, base_url):
    r = client.get(f"{base_url}/contracts/field")
    assert r.status_code == 200
    return r.json()


def test_shape(field):
    assert set(field) >= {"total", "value", "cap", "n", "hist", "col"}
    assert field["cap"] == 3000 and field["n"] == 3000
    for k in COLS:
        assert len(field["col"][k]) == field["n"], k
    for row in field["hist"]:
        y, b, n, k, da, v, sc = row
        assert 0 <= sc <= n and k <= sc  # sc = scored rows (critical share denominator)
        assert n > 0 and 0 <= k <= n and 0 <= da <= n
        assert b == -1 or 0 <= b < 45  # 4·log10(100B) = 44
    assert field["total"] == sum(h[2] for h in field["hist"])


def test_amount_rules_and_order(field):
    col = field["col"]
    amounts = col["amount"]
    assert amounts == sorted(amounts, reverse=True)
    for a, f in zip(amounts, col["flag"]):
        assert 0 < a <= 100_000_000_000          # > 100B rejected
        assert f == (1 if a > 10_000_000_000 else 0)  # > 10B flagged
    # rejected / missing amounts carry no value in the histogram
    assert all(h[5] == 0 for h in field["hist"] if h[1] == -1)


def test_cap(client, base_url):
    assert client.get(f"{base_url}/contracts/field?limit=5001").status_code == 422
    r = client.get(f"{base_url}/contracts/field?limit=5000").json()
    assert r["n"] == 5000 and r["cap"] == 5000


@pytest.mark.parametrize("q,check", [
    ("sector_id=1", lambda c, i: c["sector"][i] == 1),
    ("is_direct_award=true", lambda c, i: c["da"][i] == 1),
    ("risk_level=critical", lambda c, i: c["risk"][i] >= 0.6),
    ("year=2015", lambda c, i: c["date"][i].startswith("2015")),
])
@pytest.mark.slow
def test_cube_filters(client, base_url, field, q, check):
    r = client.get(f"{base_url}/contracts/field?{q}&limit=500").json()
    col = r["col"]
    assert r["n"] > 0 and all(check(col, i) for i in range(r["n"]))
    assert 0 < r["total"] < field["total"]
    if q.startswith("year"):
        assert {h[0] for h in r["hist"]} == {2015}
    if q.startswith("is_direct"):
        assert all(h[4] == h[2] for h in r["hist"])
    if q.startswith("risk"):
        assert all(h[3] == h[2] for h in r["hist"])


def test_live_filter_matches_list(client, base_url):
    """institution filter runs live; its total equals the list endpoint's count."""
    inst = client.get(f"{base_url}/contracts?per_page=1&sort_by=amount_mxn&sort_order=desc").json()["data"][0]["institution_id"]
    r = client.get(f"{base_url}/contracts/field?institution_id={inst}&limit=50").json()
    listed = client.get(f"{base_url}/contracts?institution_id={inst}&per_page=1").json()["pagination"]["total"]
    assert r["total"] == listed
    assert 0 < r["n"] <= 50


def test_rung_sample(client, base_url):
    """A zoomed rung samples its marks inside [min, max); the histogram stays whole."""
    whole = client.get(f"{base_url}/contracts/field?limit=10").json()
    r = client.get(f"{base_url}/contracts/field?min_amount=1000000&max_amount=10000000&limit=2000").json()
    assert 0 < r["n"] <= 2000
    assert all(1e6 <= a < 1e7 for a in r["col"]["amount"])
    assert r["total"] == whole["total"]


def test_cube_served_from_precomputed_stats():
    """precompute_stats stores the cube; a cold worker reads it instead of scanning."""
    import json
    import sqlite3
    from api.cache import app_cache
    from api.routers.contracts import _FIELD_CACHE, _field_cube, scan_field_cube

    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE contracts (contract_year, amount_mxn, sector_id, is_direct_award, risk_level)")
    conn.executemany("INSERT INTO contracts VALUES (?,?,?,?,?)", [
        (2020, 1e6, 1, 1, "low"), (2020, 2e6, 1, 1, "low"), (2021, 2e11, 3, 0, "critical")])
    scanned = scan_field_cube(conn)
    assert sorted(scanned) == [(2020, 24, 1, 1, "low", 1, 1e6), (2020, 25, 1, 1, "low", 1, 2e6),
                              (2021, -1, 3, 0, "critical", 1, None)]  # > 100B rejected: bin -1, no value

    conn.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT)")
    conn.execute("INSERT INTO precomputed_stats VALUES ('contracts_field_cube', ?)", (json.dumps(scanned),))
    conn.execute("DELETE FROM contracts")  # proves the stored cube, not a scan, is served
    app_cache.invalidate(_FIELD_CACHE)
    assert _field_cube(conn) == scanned


def test_years_match_public_aggregates(field):
    # the 20 rows dated 2000–01 are outside every public count (precompute_stats FIRST_YEAR)
    assert all(h[0] is not None and h[0] >= 2002 for h in field["hist"])
