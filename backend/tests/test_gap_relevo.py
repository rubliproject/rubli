"""/gap «El Relevo» — summary funnel/doors/buyers and the register filters (gap-relevo spec § Backend)."""


def _summary(client):
    d = client.get("/api/v1/gap/summary").json()
    return d if d.get("available") else None


def test_summary_funnel_doors_buyers(client):
    d = _summary(client)
    if not d:
        return
    f = d["funnel"]
    assert f["listed"] == d["total_contracts"]
    assert f["listed"] >= f["da_in_scope"] >= f["letters_found"] > 0
    assert f["amounts_read"] == d["recovered_count"]
    assert f["companies_rfc"] >= f["companies_rfc_in_corpus"]
    assert f["vendor_named"] >= f["self_buyer"]
    arts = d["by_exception_article"]
    assert len(arts) > 8  # the full catalogue, not the old top-8
    assert all("ocr_sum_mxn" in a and "top_institution_id" in a for a in arts)
    assert d["worst_institutions"] is not None  # the el-vacio story still reads it
    b = d["top_buyers"]
    assert 0 < len(b) <= 12 and b[0]["count"] >= b[-1]["count"]
    assert {"institution_id", "da_pct", "pre_da_pct", "top_article"} <= set(b[0])


def test_contract_rows_and_filters(client):
    d = _summary(client)
    if not d:
        return
    r = client.get("/api/v1/gap/contracts", params={"per_page": 5}).json()
    row = r["data"][0]
    for k in ("uuid", "expedient_code", "contracting_unit", "award_doc_type", "institution_id",
              "vendor_display", "vendor_source", "vendor_id", "is_emergency", "amount_review_flag"):
        assert k in row
    assert "responsible_uc" not in row
    assert all("*" not in (x["vendor_rfc"] or "") for x in r["data"])

    def total(**p):
        return client.get("/api/v1/gap/contracts", params={"per_page": 1, **p}).json()["pagination"]["total"]

    assert total(src="ocr") == d["recovered_count"] == total(recovered_only=True)
    assert total(art="any-da") == d["direct_award_count"] == total(direct_award=1)
    top = d["by_exception_article"][0]
    assert total(art=top["article"]) == top["count"]
    buyer = d["top_buyers"][0]
    assert total(inst=buyer["institution_id"]) == buyer["count"]
    assert total(flag="self_buyer") == d["funnel"]["self_buyer"]
    assert total(flag="young") == d["young_vendor_count"] == total(young_only=True)
    assert total(vend="rfc") >= d["funnel"]["companies_rfc"]
    assert client.get("/api/v1/gap/contracts", params={"flag": "bogus"}).status_code == 422


# ── «Después del apagón» dossier block — GET /gap/entity/{kind}/{id}/relevo (owner pick B, 2026-10-20)
# Data assertions skip on the dataless default run; exercise them with
#     DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db python -m pytest tests/test_gap_relevo.py -q -p no:cacheprovider
import json
import os
import re
import sqlite3

import pytest

from api.public_labels import pf_sql

_RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")
_CASES = [("institution", 251), ("category", 57), ("vendor", 92615)]


def _relevo(client, kind, eid):
    d = client.get(f"/api/v1/gap/entity/{kind}/{eid}/relevo").json()
    if not d.get("available") or not d["post"]["n"]:
        pytest.skip("comprasmx_contracts absent or entity has no post-blackout rows")
    return d


def test_relevo_bad_kind(client):
    assert client.get("/api/v1/gap/entity/sector/1/relevo").status_code == 422


@pytest.mark.parametrize("kind,eid", _CASES)
def test_relevo_totals_reconcile(client, kind, eid):
    d = _relevo(client, kind, eid)
    assert abs(sum(b["v"] for b in d["left"]) - d["pre"]["v"]) <= len(d["left"])
    assert abs(sum(b["v"] for b in d["right"]) - d["post"]["v"]) <= len(d["right"])
    assert sum(b["n"] for b in d["left"]) == d["pre"]["n"]
    assert sum(b["n"] for b in d["right"]) == d["post"]["n"]
    assert sum(f["n"] for f in d["fam"].values()) == d["post"]["n"]
    assert sum(f["pesos"] for f in d["fam"].values()) == 100
    assert len([b for b in d["left"] if b["key"] not in ("otros", "pf")]) <= d["k"]
    for k, lane in d["pulses"].items():
        p = d["parts"][k]
        assert sum(w[1] for w in lane) == p["pre_n"] + p["post_n"]


@pytest.mark.parametrize("kind,eid", _CASES)
def test_relevo_no_rfc_anywhere(client, kind, eid):
    d = _relevo(client, kind, eid)
    s = json.dumps(d, ensure_ascii=False)
    assert '"rfc"' not in s.lower()
    assert not _RFC.search(s)


@pytest.mark.parametrize("kind,eid", [("institution", 251), ("institution", 279), ("category", 57)])
def test_relevo_personas_fisicas_pooled_never_named(client, kind, eid):
    d = _relevo(client, kind, eid)
    pf = d["parts"].get("pf")
    if pf:
        assert pf["name"] is None and pf["id"] is None
    assert "pf" not in d["pulses"]
    named = [p["id"] for k, p in d["parts"].items() if k.startswith("v")]
    db = os.environ.get("DATABASE_PATH")
    if db and named:
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        # the one persona-física rule (RFC shape beats is_individual), not the raw flag
        hit = c.execute(f"SELECT COUNT(*) FROM vendors WHERE {pf_sql()} AND id IN ({','.join('?' * len(named))})", named).fetchone()[0]
        c.close()
        assert hit == 0, "a persona física was drawn by name"
    for lang in ("es", "en"):
        segs = [s for b in [d["sentences"][lang]["claim"], *d["sentences"][lang]["body"]] for s in b]
        assert all(s.get("k") != "pf" for s in segs if isinstance(s, dict))


@pytest.mark.parametrize("kind,eid", _CASES)
def test_relevo_100b_rule(client, kind, eid):
    d = _relevo(client, kind, eid)
    for p in d["parts"].values():
        assert p["pre_v"] <= 100_000_000_000 * max(1, p["pre_n"])
        assert p["post_v"] <= 100_000_000_000 * max(1, p["post_n"])
        if p.get("flag"):
            assert p["post_v"] > 10_000_000_000
    for lane in d["pulses"].values():
        assert all(w[5] <= 100_000_000_000 for w in lane)


@pytest.mark.parametrize("kind,eid", _CASES)
def test_relevo_ribbons_only_join_the_same_entity(client, kind, eid):
    d = _relevo(client, kind, eid)
    L, R = {b["key"] for b in d["left"]}, {b["key"] for b in d["right"]}
    for r in d["ribbons"]:
        assert r["key"] != "pf" and r["key"] in d["parts"] and d["parts"][r["key"]]["id"] is not None
        if r["kind"] == "stay":
            assert r["from"] == r["to"] == r["key"] and r["key"] in L and r["key"] in R
        elif r["kind"] == "down":
            assert r["from"] == r["key"] in L and r["to"] == "otros" and d["parts"][r["key"]]["post_n"] > 0
        else:
            assert r["kind"] == "up" and r["from"] == "otros" and r["to"] == r["key"] in R and d["parts"][r["key"]]["pre_v"] > 0
    # the name fallback: no drawn «new name» block shares a skeleton with a drawn known counterpart
    from api.routers.gap import _norm
    known = {_norm(p["name"]) for k, p in d["parts"].items() if p["id"] is not None}
    assert not [k for k in d["parts"] if k.startswith("n:") and k[2:] in known]


def test_relevo_sentences_bilingual_and_caveat(client):
    d = _relevo(client, "institution", 251)
    for lang in ("es", "en"):
        s = d["sentences"][lang]
        assert s["claim"] and s["body"]
    es = "".join(x for b in d["sentences"]["es"]["body"] for x in b if isinstance(x, str))
    assert "probabilidad" not in es and "recorte" in es  # a smaller «after» is framed, never read as a cut


@pytest.mark.no_db
def test_relevo_unit_never_names_a_persona_fisica():
    """In-memory: 13-char RFC (is_individual=0), a vendors.is_individual post-only id, and an unmatched
    name without a company form are all pooled as «pf»; an unmatched company is drawn by name."""
    from api.routers.gap import _relevo
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE contracts (id, vendor_id, institution_id, category_id, contract_year, contract_date,
                                amount_mxn, is_direct_award, title);
        CREATE TABLE vendors (id, name, is_individual, rfc);
        CREATE TABLE institutions (id, name, siglas, sector_id);
        CREATE TABLE vendor_stats (vendor_id, avg_risk_score);
        CREATE TABLE institution_stats (institution_id, avg_risk_score);
        CREATE TABLE comprasmx_contracts (codigo_contrato, vendor_id, institution_id, category_id, vendor_match,
            is_persona_fisica, proveedor, institucion, siglas, amount_mxn, is_direct_award, fecha_inicio,
            fecha_publicacion, titulo_contrato, rfc, orden_gobierno, post_blackout);
        INSERT INTO institutions VALUES (1, 'INSTITUTO X', 'IX', 3);
        INSERT INTO vendors VALUES (10, 'ACME SA DE CV', 0, 'ACM800101AB1'),
                                   (11, 'JUAN PEREZ LOPEZ', 0, 'PELJ800101AB1'),
                                   (12, 'MARIA GOMEZ RUIZ', 1, NULL);
        INSERT INTO contracts VALUES (1, 10, 1, NULL, 2025, '2025-03-01', 9e6, 1, 'a'),
                                     (2, 11, 1, NULL, 2025, '2025-03-02', 8e6, 1, 'b');
        INSERT INTO comprasmx_contracts VALUES
            ('C1', 10, 1, NULL, 'rfc', 0, 'ACME SA DE CV', 'INSTITUTO X', 'IX', 7e6, 1, '2025-11-01', '2025-11-01', 't', NULL, 'APF', 1),
            ('C2', 12, 1, NULL, 'rfc', 0, 'MARIA GOMEZ RUIZ', 'INSTITUTO X', 'IX', 6e6, 1, '2025-11-02', '2025-11-02', 't', NULL, 'APF', 1),
            ('C3', NULL, 1, NULL, NULL, 0, 'PEDRO SANCHEZ DIAZ', 'INSTITUTO X', 'IX', 5e6, 1, '2025-11-03', '2025-11-03', 't', NULL, 'APF', 1),
            ('C4', NULL, 1, NULL, NULL, 0, 'NUEVA SA DE CV', 'INSTITUTO X', 'IX', 4e6, 1, '2025-11-04', '2025-11-04', 't', NULL, 'APF', 1);
    """)
    d = _relevo(db, "institution", 1)
    s = json.dumps(d, ensure_ascii=False)
    for person in ("JUAN", "MARIA", "PEDRO"):
        assert person not in s
    assert "ACME SA DE CV" in s and "NUEVA SA DE CV" in s
    assert d["parts"]["pf"]["pre_n"] == 1 and d["parts"]["pf"]["post_n"] == 2
