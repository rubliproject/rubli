"""Scorecard population definition (spec institutions-tamiz §0.1).

One federal definition everywhere: institutions.is_federal. The level split
federal/state/municipal must partition the scored population exactly.
"""
SC = "/api/v1/scorecards/institutions"


def _total(client, **params):
    r = client.get(SC, params={"per_page": 1, **params})
    assert r.status_code == 200, r.text
    return r.json()["total"]


def test_levels_partition_population(client):
    everyone = _total(client, scope="all")
    by_level = {lv: _total(client, scope="all", level=lv) for lv in ("federal", "state", "municipal")}
    assert sum(by_level.values()) == everyone
    # federal level == the is_federal scope used by the default list
    assert by_level["federal"] == _total(client, scope="federal")


def test_stats_level_matches_list(client):
    r = client.get(f"{SC}/stats", params={"scope": "all", "level": "municipal"})
    assert r.status_code == 200, r.text
    assert r.json()["total_scored"] == _total(client, scope="all", level="municipal")


def test_level_rejects_unknown(client):
    assert client.get(SC, params={"level": "galactic"}).status_code == 422


# --- §1 GET /scorecards/institutions/field (v3 when present, v2 fallback) ---

def _field(client):
    r = client.get(f"{SC}/field")
    assert r.status_code == 200, r.text
    body = r.json()
    cols = body["columns"]
    assert all(len(row) == len(cols) for row in body["rows"])
    return body, cols


def test_field_shape_and_counts(client):
    body, cols = _field(client)
    rows = body["rows"]
    assert body["computed_at"] and body["method"] in ("v2", "v3")
    ids = [row[cols.index("id")] for row in rows]
    assert len(ids) == len(set(ids)) > 0
    lvl = [row[cols.index("level")] for row in rows]
    assert set(lvl) <= {"federal", "state", "municipal"}
    if body["method"] == "v2":
        assert len(ids) == _total(client, scope="all")
        grp = [row[cols.index("group")] for row in rows]
        assert sum(g.startswith("fed") for g in grp) == lvl.count("federal") == _total(client, scope="federal")
        assert all(isinstance(row[cols.index("gt_exposed")], bool) for row in rows)


def test_field_v3_contract(client):
    body, cols = _field(client)
    if body["method"] != "v3":
        import pytest
        pytest.skip("institution_grades_v3 not on this DB")
    assert body["scale"] == [0, 100]
    assert len(body["cut_points"]) == 4 and body["cut_points"] == sorted(body["cut_points"], reverse=True)
    grades = {row[cols.index("grade")] for row in body["rows"]}
    assert grades <= {"A", "B", "C", "D", "F"}
    for row in body["rows"]:
        r = dict(zip(cols, row))
        assert 0 <= r["score"] <= 100 and isinstance(r["provisional"], bool)
        # ledger identity: a pillar's summed points == (pillar - 100) / 3, so the
        # biggest loss is the lowest pillar
        if r["top_loss_pillar"]:
            assert abs(r["top_loss_points"] - (r[f"pillar_{r['top_loss_pillar']}"] - 100) / 3) < 0.05
        assert r["group"].split("|")[0] in ("federal", "estatal", "municipal")


def test_field_falls_back_to_v2(client, monkeypatch):
    from api.routers import scorecards as sc
    monkeypatch.setattr(sc, "_field_v3", lambda conn: None)
    sc._field_cache.clear()
    body, cols = _field(client)
    sc._field_cache.clear()
    assert body["method"] == "v2" and "total_score" in cols and "confidence_band" in cols


def test_field_has_no_pii_or_vendor_fields(client):
    _, cols = _field(client)
    # pillar_vendors is the v2 Tail-Risk score column; gt_vendor_count is a count badge
    assert not [c for c in cols if "rfc" in c.lower() or c.lower().startswith("vendor")]


def test_field_route_not_shadowed_by_id(client):
    assert client.get(f"{SC}/field").status_code == 200


def test_field_v3_coverage_columns(client):
    """coverage-badge.md: coverage_pct / coverage_band ride along; federal-only, null elsewhere."""
    body, cols = _field(client)
    if body["method"] != "v3":
        return
    assert "coverage_pct" in cols and "coverage_band" in cols
    rows = body["rows"]
    lvl, band = cols.index("level"), cols.index("coverage_band")
    pct = cols.index("coverage_pct")
    assert all(r[band] in (None, "alta", "parcial", "baja") for r in rows)
    assert all(r[band] is None for r in rows if r[lvl] != "federal")
    assert all((r[pct] is None) == (r[band] is None) for r in rows)
    lb = cols.index("coverage_lb")
    assert all((r[lb] is None) == (r[band] is None) for r in rows)
    assert all(isinstance(r[lb], bool) for r in rows if r[band] is not None)


def test_field_v3_activity_columns(client):
    """«Por pesos» spec §6: is_historical / last_year / p_grade travel with every v3 row."""
    body, cols = _field(client)
    if body["method"] != "v3":
        import pytest
        pytest.skip("institution_grades_v3 not on this DB")
    for c in ("is_historical", "last_year", "p_grade"):
        assert c in cols
    rows = [dict(zip(cols, r)) for r in body["rows"]]
    assert all(r["is_historical"] in (True, False, None) for r in rows)
    assert any(r["is_historical"] for r in rows) and any(r["is_historical"] is False for r in rows)
    assert all(r["last_year"] is None or 2002 <= r["last_year"] <= 2026 for r in rows)
    assert all(r["p_grade"] is None or 0 <= r["p_grade"] <= 1 for r in rows)
    imss = next(r for r in rows if r["id"] == 251)
    assert imss["is_historical"] is False and imss["last_year"] >= 2024


def test_field_v3_flag_columns(client):
    """«Por pesos» §6: contracts > 10B inside graded value, from institution_year_value."""
    body, cols = _field(client)
    if body["method"] != "v3":
        import pytest
        pytest.skip("institution_grades_v3 not on this DB")
    rows = [dict(zip(cols, r)) for r in body["rows"]]
    if all(r["flagged_n"] is None for r in rows):
        import pytest
        pytest.skip("institution_year_value not on this DB")
    flagged = [r for r in rows if r["flagged_n"]]
    assert flagged and all(r["flagged_value_mxn"] > 10_000_000_000 * r["flagged_n"] * 0.999 for r in flagged)
    assert all(r["flagged_value_mxn"] <= r["total_value_mxn"] * 1.01 + 1 for r in flagged)


def test_field_v3_trend_columns(client):
    """phase 2 § 3: trend travels lean (sin_datos -> null), slope sign matches the label."""
    body, cols = _field(client)
    if body["method"] != "v3":
        import pytest
        pytest.skip("institution_grades_v3 not on this DB")
    rows = [dict(zip(cols, r)) for r in body["rows"]]
    assert all(r["trend"] in (None, "mejora", "estable", "empeora") for r in rows)
    assert any(r["trend"] == "empeora" for r in rows) and any(r["trend"] is None for r in rows)
    for r in rows:
        if r["trend"] is None:
            assert r["trend_slope"] is None and r["trend_t"] is None
        elif r["trend"] == "empeora":
            assert r["trend_slope"] > 0
        elif r["trend"] == "mejora":
            assert r["trend_slope"] < 0


def test_hallazgos_cards(client):
    """«Por pesos» §5: cached cards from precomputed tables only."""
    r = client.get(f"{SC}/hallazgos")
    if r.status_code == 404:
        import pytest
        pytest.skip("hallazgos tables not on this DB")
    assert r.status_code == 200, r.text
    h = r.json()
    top = h["top_df"]
    assert top["grade"] in ("D", "F") and top["years"]
    for y in top["years"]:
        assert 0 <= y["da_share_count"] <= 1 and (y["da_share_value"] is None or 0 <= y["da_share_value"] <= 1)
    keys = [s["key"] for s in h["sexenios"]]
    assert keys == ["epn", "amlo", "y2025"]
    from api.config.constants import DATA_LAST_YEAR  # the in-progress term reaches the cut (ComprasMX)
    assert h["sexenios"][-1]["years"] == [2025, DATA_LAST_YEAR] and h["sexenios"][-1]["partial"]
    for s in h["sexenios"]:
        assert 0 <= s["df_share"] <= 1 and 0 <= s["df_share_ex_top"] <= s["df_share"] + 1e-9
    vis = h["visibility"]
    assert vis["left_compranet"]["max_last_year"] <= 2018
    assert set(vis["federal_by_band"]) <= {"alta", "parcial", "baja", "sin_dato"}
    # no PII / vendor fields anywhere in the payload
    import json
    assert "rfc" not in json.dumps(h).lower()


def test_hallazgos_route_not_shadowed_by_id(client):
    assert client.get(f"{SC}/hallazgos").status_code in (200, 404)
