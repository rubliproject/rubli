"""GET /scorecards/institutions/anatomy — the biggest active federal buyers taken apart
(/institutions ?ver=anatomia|diagrama): how they buy, from whom, with what risk."""
SC = "/api/v1/scorecards/institutions/anatomy"


def test_anatomy_rows_are_shares_ranked_by_spend(client):
    r = client.get(SC, params={"limit": 8})
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body["rows"]
    assert body["computed_at"] and 0 < len(rows) <= 8
    vals = [x["total_value_mxn"] for x in rows]
    assert vals == sorted(vals, reverse=True)
    for x in rows:
        for k in ("da_share", "top_share", "hr_share"):
            assert x[k] is None or 0 <= x[k] <= 1, (k, x)
        assert 0 <= x["score"] <= 100 and x["grade"]
        assert x["last_year"] is not None and x["last_year"] >= 2024  # active buyers only
        assert "rfc" not in x and "rfc" not in (x["top_vendor"] or {})
        tv = x["top_vendor"]
        if tv and tv["kind"] == "pf":  # persona física: named, labelled by kind (owner 10-29), never its RFC
            assert tv["id"] is not None and tv["name"]


def test_anatomy_limit_is_bounded(client):
    assert client.get(SC, params={"limit": 500}).status_code == 422
    assert client.get(SC, params={"limit": 1}).status_code == 422


def test_anatomy_vendor_names_a_persona_fisica_without_its_rfc():
    """Owner policy 2026-10-29: a persona física's CompraNet name is shown, labelled (kind 'pf'); RFC never."""
    from api.routers.scorecards import _anatomy_vendor
    rfc = "PEGJ800101AB1"  # 13 chars = a person
    pf = _anatomy_vendor(7, "JUAN PEREZ GOMEZ", 1, rfc, "private")
    assert pf == {"id": 7, "name": "JUAN PEREZ GOMEZ", "kind": "pf"}
    assert rfc not in str(pf)
    # a name that is (or embeds) an RFC is never shipped, persona física or not
    assert _anatomy_vendor(8, f"JUAN PEREZ {rfc}", 1, rfc, "private")["name"] is None
    assert _anatomy_vendor(9, "ACME SA DE CV", 0, "ACM800101AB1", "private") == {"id": 9, "name": "ACME SA DE CV", "kind": "co"}
    assert _anatomy_vendor(10, "PEMEX", 0, None, "state")["kind"] == "pub"


def test_da_top_names_who_got_the_pesos_without_a_tender(client):
    """El diagrama «¿a quién?»: the buyer's top direct-award recipients, shares of its direct-award pesos, no RFC."""
    rows = client.get(SC, params={"limit": 3}).json()["rows"]
    r = client.get(f"/api/v1/scorecards/institutions/{rows[0]['id']}/sin-licitacion")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["top"]) <= 3 and "rfc" not in str(body).lower()
    vals = [t["value_mxn"] for t in body["top"]]
    assert vals == sorted(vals, reverse=True)
    for t in body["top"]:
        assert t["share"] is None or 0 <= t["share"] <= 1
    assert client.get("/api/v1/scorecards/institutions/1/sin-licitacion", params={"limit": 50}).status_code == 422
