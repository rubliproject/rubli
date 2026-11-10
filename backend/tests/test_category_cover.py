"""GET /categories/{id}/cover — the category dossier's first viewport «El caudal».

Pins the payload shape, the 100B MXN reject rule, ranks within 1..N (72 categories),
shares in [0, 100], Structure A (2002–2009) direct award as null, and no RFC anywhere.
"""
import json
import re
import sqlite3

import pytest

from api.dependencies import DB_PATH

CID = 57  # Alimentos y Víveres — big, fast, has a post-blackout slice
RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")


@pytest.fixture(scope="module")
def cover(client, base_url):
    r = client.get(f"{base_url}/categories/{CID}/cover")
    assert r.status_code == 200
    return r.json()


def test_shape(cover):
    assert set(cover) >= {"category", "totals", "years", "suppliers", "post", "ranks"}
    assert cover["category"]["id"] == CID
    assert set(cover["totals"]) >= {"n", "v", "da_v", "da_n", "hr_n", "comp_n", "sb_n", "flagged", "vendors", "buyers"}
    assert 1 <= len(cover["suppliers"]) <= 6
    s = cover["suppliers"][0]
    assert set(s) >= {"id", "name", "n", "v", "da_v", "da_n", "y0", "y1", "risk", "primary_sector_id", "buyers", "years"}
    assert all(len(y) == 4 for y in s["years"])
    vs = [x["v"] for x in cover["suppliers"]]
    assert vs == sorted(vs, reverse=True)
    assert set(cover["post"]) >= {"n", "v", "da_v", "suppliers", "pf"}


def test_100b_rule(cover):
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        v, n = conn.execute(
            "SELECT SUM(amount_mxn), COUNT(*) FROM contracts WHERE category_id = ? AND amount_mxn <= 1e11", (CID,)
        ).fetchone()
        flagged = conn.execute(
            "SELECT COUNT(*) FROM contracts WHERE category_id = ? AND amount_mxn > 1e10 AND amount_mxn <= 1e11"
            " AND (contract_date IS NULL OR contract_date < '2025-09-28')", (CID,)
        ).fetchone()[0]
    # CompraNet years + the ComprasMX column partition the register by date: every contract once,
    # never the staging table on top (docs/OWNER_REVIEW_2026-10-28.md)
    assert cover["totals"]["n"] + cover["post"]["n"] == n
    assert abs(cover["totals"]["v"] + cover["post"]["v"] - v) < 1
    assert cover["totals"]["flagged"] == flagged
    assert all(y["v"] <= cover["totals"]["v"] for y in cover["years"])


def test_ranks_in_range(cover):
    for key in ("money", "contracts", "da_money", "da_count", "top3", "hr", "post"):
        r = cover["ranks"][key]
        assert r is not None, key
        assert 1 <= r["rank"] <= r["of"] <= 72, key
        assert len(r["all"]) == r["of"]


def test_shares_in_range(cover):
    for key in ("da_money", "da_count", "top3", "hr"):
        assert 0 <= cover["ranks"][key]["value"] <= 100, key
    t = cover["totals"]
    assert 0 <= t["da_v"] <= t["v"]
    assert 0 <= t["da_n"] <= t["n"]
    assert 0 <= t["sb_n"] <= t["comp_n"]
    for s in cover["suppliers"]:
        assert 0 <= s["da_v"] <= s["v"] + 1
        assert 0 <= s["da_n"] <= s["n"]
        assert sum(b["v"] for b in s["buyers"]) <= s["v"] + 1


def test_structure_a_has_no_procedure_flag(cover):
    for y in cover["years"]:
        assert 2002 <= y["y"] <= 2025  # the cover stops at the source switch; ComprasMX is its own column
        if y["y"] >= 2010:
            assert y["da_v"] is not None


def test_no_rfc(cover):
    blob = json.dumps(cover, ensure_ascii=False)
    assert '"rfc"' not in blob.lower()
    assert not RFC.search(blob)


def test_personas_fisicas_not_named(cover):
    assert all(s["name"] for s in cover["post"]["suppliers"])  # pooled into post.pf, never listed


def test_unknown_category_404(client, base_url):
    assert client.get(f"{base_url}/categories/999999/cover").status_code == 404


# ── B3 (docs/LAUNCH_AUDIT_2026-10-30.md): a cold cover (empty process caches) must not run the
# all-contracts scan the planner picked for the post-switch sum (227 s locally, 355–433 s on prod);
# concurrent cold hits build once.

def _cold(monkeypatch):
    from api.routers import categories as C
    monkeypatch.setattr(C, "_cover_cache", {})
    monkeypatch.setattr(C, "_cover_ranks_cache", {})
    monkeypatch.setattr(C, "_cover_post_cache", {}, raising=False)
    monkeypatch.setattr(C, "_load_cover_row", lambda conn, cid: None)  # these tests exercise the live build
    return C


def test_cold_cover_is_fast(client, base_url, monkeypatch):
    import time
    _cold(monkeypatch)
    t = time.time()
    assert client.get(f"{base_url}/categories/{CID}/cover").status_code == 200
    assert time.time() - t < 30  # was minutes: the ranks' post-switch sum scanned every contract


def test_concurrent_cold_requests_build_once(client, base_url, monkeypatch):
    import threading
    import time
    C = _cold(monkeypatch)
    calls = []
    real = C._build_category_cover

    def slow(conn, cid):
        calls.append(cid)
        time.sleep(0.5)
        return real(conn, cid)

    monkeypatch.setattr(C, "_build_category_cover", slow)
    codes = []
    ts = [threading.Thread(target=lambda: codes.append(client.get(f"{base_url}/categories/{CID}/cover").status_code))
          for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert codes == [200] * 4
    assert calls == [CID]


# ── B3 follow-up: the post-switch slice is read ONCE for every category (prod: ~110K post-switch rows,
# 3 per-category passes + the ranks pass = 132 s cold). Covers must match e22087e1's per-category SQL.

def _post_reference(conn, cid):
    """e22087e1's three per-category post-switch queries, verbatim."""
    from api.routers import categories as C
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    p = cur.execute(f"""
        SELECT COUNT(*) AS n, COALESCE(SUM(amount_mxn), 0) AS v,
               COALESCE(SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn END), 0) AS da_v,
               COALESCE(SUM(is_direct_award = 1), 0) AS da_n,
               0 AS no_amount,
               COALESCE(SUM(amount_mxn > {C._COVER_FLAG}), 0) AS flagged,
               COUNT(DISTINCT vendor_id) AS k
        FROM {C._COVER_POST_FROM} WHERE category_id = ? AND {C._COVER_POST}
    """, (cid,)).fetchone()
    pf = cur.execute(f"""
        SELECT COUNT(*) AS n, COALESCE(SUM(amount_mxn), 0) AS v FROM {C._COVER_POST_FROM}
        WHERE category_id = ? AND {C._COVER_POST} AND {C._COVER_PF}
    """, (cid,)).fetchone()
    ps = cur.execute(f"""
        SELECT vendor_id AS vid, COUNT(*) AS n, COALESCE(SUM(amount_mxn), 0) AS v,
               COALESCE(SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn END), 0) AS da_v
        FROM {C._COVER_POST_FROM} WHERE category_id = ? AND {C._COVER_POST} AND vendor_id IS NOT NULL AND NOT {C._COVER_PF}
        GROUP BY vendor_id ORDER BY v DESC LIMIT 6
    """, (cid,)).fetchall()
    post = {k: p[k] for k in ("n", "v", "da_v", "da_n", "no_amount", "flagged", "k")}
    post["pf"] = {"n": pf["n"], "v": pf["v"]}
    post["suppliers"] = [(r["vid"], r["n"], r["v"], r["da_v"]) for r in ps]
    ranks_post = cur.execute(f"""
        SELECT COALESCE(SUM(amount_mxn), 0) FROM {C._COVER_POST_FROM} WHERE {C._COVER_POST} AND category_id = ?
    """, (cid,)).fetchone()[0]
    return post, ranks_post


@pytest.mark.parametrize("cid", [26, 28, CID])  # 26/28: the largest local post-switch slices
def test_post_slice_matches_per_category_sql(client, base_url, monkeypatch, cid):
    _cold(monkeypatch)
    r = client.get(f"{base_url}/categories/{cid}/cover")
    if r.status_code == 404:
        pytest.skip(f"category {cid} absent")
    got = r.json()["post"]
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        want, ranks_post = _post_reference(conn, cid)
    sup = [(s["id"], s["n"], s["v"], s["da_v"]) for s in got["suppliers"]]
    got = {k: v for k, v in got.items() if k != "suppliers"}
    want_sup = want.pop("suppliers")
    assert json.dumps(got, sort_keys=True) == json.dumps(json.loads(json.dumps(want)), sort_keys=True)
    assert sup == want_sup
    rp = r.json()["ranks"]["post"]
    if rp is not None:  # None = category not in category_stats (left out of the ranking, as before)
        assert rp["value"] == ranks_post


def test_many_covers_build_the_slice_once(client, base_url, monkeypatch):
    C = _cold(monkeypatch)
    calls = []
    real = C._cover_post_build
    monkeypatch.setattr(C, "_cover_post_build", lambda conn: calls.append(1) or real(conn))
    for cid in (CID, 26, 28, 1, 2):
        client.get(f"{base_url}/categories/{cid}/cover")
    assert calls == [1]


# ── B3 final (docs/LAUNCH_AUDIT_2026-10-30.md § B3): covers are precomputed off the request path by
# scripts.precompute_category_covers into precomputed_stats `category_cover:{id}`; the endpoint serves
# that row and only builds live when it is missing.

@pytest.fixture(scope="module")
def precomputed():
    from scripts import precompute_category_covers as P
    from api.routers import categories as C
    C._cover_post_cache.clear()
    C._cover_ranks_cache.clear()
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        return P.build(conn, [26, 28, CID])


@pytest.mark.parametrize("cid", [26, 28, CID])
def test_precomputed_cover_is_byte_identical_to_live(client, base_url, monkeypatch, precomputed, cid, tmp_path):
    from api.routers import categories as C
    real_row = C._load_cover_row
    _cold(monkeypatch)
    live = client.get(f"{base_url}/categories/{cid}/cover")
    assert live.status_code == 200
    # a DB holding ONLY precomputed_stats: any read of contracts (or anything else) would raise
    db = tmp_path / "only_precomputed.db"
    with sqlite3.connect(db) as c:
        c.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT)")
        c.executemany("INSERT INTO precomputed_stats VALUES (?, ?, NULL)",
                      [(f"category_cover:{k}", v) for k, v in precomputed.items()])
    from contextlib import contextmanager

    @contextmanager
    def only_precomputed():
        conn = sqlite3.connect(db)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr(C, "_cover_cache", {})
    monkeypatch.setattr(C, "_load_cover_row", real_row)
    monkeypatch.setattr(C, "get_db", only_precomputed)
    monkeypatch.setattr(C, "_build_category_cover", lambda conn, cid: pytest.fail("live build on a precomputed hit"))
    served = client.get(f"{base_url}/categories/{cid}/cover")
    assert served.status_code == 200
    assert served.content == live.content

