"""sky-dive data layers — GET /atlas/sky/layers and GET /atlas/sky/apagon.

Needs the atlas_sky precompute and comprasmx_contracts at DATABASE_PATH; skips on the stub DB.
"""
import sqlite3

import pytest

from api.dependencies import DB_PATH
from api.public_labels import excluded_from_rankings, label_sets
from api.services import atlas_sky

LAYERS = "/api/v1/atlas/sky/layers"
APAGON = "/api/v1/atlas/sky/apagon"


@pytest.fixture(scope="module")
def db():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    if not atlas_sky.sky_version(conn):
        pytest.skip("atlas_sky precompute not present on this DB")
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def layers(client, db):
    r = client.get(LAYERS)
    assert r.status_code == 200
    return r


def test_layers_align_with_the_manifest(client, layers):
    d, m = layers.json(), client.get("/api/v1/atlas/sky/manifest").json()
    assert d["layout_version"] == m["layout_version"]
    n = len(m["stars"]["id"])
    for k, col in d["stars"].items():
        assert len(col) == n, k
    assert layers.headers["etag"] == client.get("/api/v1/atlas/sky/manifest").headers["etag"]
    assert client.get(LAYERS, headers={"If-None-Match": layers.headers["etag"]}).status_code == 304


def test_layer_values_are_in_range(layers):
    s = layers.json()["stars"]
    assert all(v is None or 0 <= v <= 1 for v in s["avg"])
    assert all(v is None or 0 <= v <= 10 for v in s["grade"])
    assert all(v is None or 0 <= v <= 100 for v in s["da"] + s["sb"])
    assert all(isinstance(v, int) and v >= 0 for k in ("post", "cap", "pareja", "mismo_dia", "senal") for v in s[k])


def test_layer_bits_only_on_public_drawn_bodies(layers, db):
    d = layers.json()
    drawn = {r[0] for r in db.execute("SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v'")}
    ids, bits = d["bodies"]["id"], d["bodies"]["bits"]
    assert len(ids) == len(bits) and set(ids) <= drawn
    allowed = sum(d["bits"].values())
    assert all(0 < b <= allowed for b in bits)
    ls = label_sets(db)
    for v in ids[:400]:
        assert v not in ls["suppressed"] and not excluded_from_rankings(db, v)


def test_layers_carry_no_names_or_rfc(layers):
    body = layers.text
    for key in ('"name"', '"rfc"', '"proveedor"', '"siglas"'):
        assert key not in body


def _top_post_vendor(db):
    """The busiest post-blackout supplier that is public (not suppressed, not a GT FP, not a persona física)."""
    ls = label_sets(db)
    for (v,) in db.execute(
            "SELECT x.vendor_id FROM comprasmx_contracts x WHERE x.post_blackout = 1 AND x.vendor_id IS NOT NULL"
            " AND NOT EXISTS (SELECT 1 FROM vendor_canonical c WHERE c.vendor_id = x.vendor_id AND c.canonical_id <> x.vendor_id)"
            " GROUP BY x.vendor_id ORDER BY COUNT(*) DESC LIMIT 50"):
        if v not in ls["suppressed"] and not excluded_from_rankings(db, v):
            return v
    pytest.skip("no public supplier with post-blackout contracts")


def test_apagon_lists_post_blackout_contracts(client, db):
    v = _top_post_vendor(db)
    d = client.get(APAGON, params={"vendor": v}).json()
    assert d["scored"] is False and d["n_contracts"] > 0
    assert 0 < len(d["contracts"]) <= atlas_sky.APAGON_CAP
    amounts = [c["amount_mxn"] for c in d["contracts"]]
    assert amounts == sorted(amounts, reverse=True)
    assert all(0 < a <= atlas_sky.MAX_CONTRACT_VALUE for a in amounts)
    for c in d["contracts"]:
        assert set(c) == {"code", "date", "amount_mxn", "review", "institution_id", "procedure", "direct_award",
                          "institution_name", "siglas", "early_days"}
        assert c["early_days"] is None or c["early_days"] > 0
        assert c["review"] == (c["amount_mxn"] > atlas_sky.FLAG_THRESHOLD)
    assert "rfc" not in client.get(APAGON, params={"vendor": v}).text.lower()


def test_apagon_withholds_a_persona_fisica(client, db):
    row = db.execute(
        "SELECT x.vendor_id FROM comprasmx_contracts x JOIN vendors v ON v.id = x.vendor_id"
        " WHERE x.post_blackout = 1 AND (v.is_individual = 1 OR LENGTH(COALESCE(v.rfc, '')) = 13) LIMIT 1").fetchone()
    if not row:
        pytest.skip("no persona física with post-blackout contracts")
    d = client.get(APAGON, params={"vendor": row[0]}).json()
    assert d["withheld"] is True and d["contracts"] == []


def test_apagon_validates(client):
    assert client.get(APAGON).status_code == 422
    assert client.get(APAGON, params={"vendor": 0}).status_code == 422
    assert client.get(APAGON, params={"vendor": "1 OR 1=1"}).status_code == 422


CSIG = "/api/v1/atlas/sky/contract-signals"


def test_contract_signals_antes_del_fallo_and_plazo(client, db):
    # a competitive APF ComprasMX contract that began before its fallo, also in the CompraNet-era corpus
    row = db.execute(
        "SELECT c.id FROM comprasmx_contracts x JOIN contracts c ON c.procedure_number = x.numero_procedimiento"
        " AND c.contract_number = x.codigo_contrato WHERE x.orden_gobierno = 'APF' AND x.tipo_procedimiento LIKE 'LICITACI%'"
        " AND x.fecha_fallo IS NOT NULL AND x.fecha_inicio IS NOT NULL AND date(x.fecha_inicio) < date(x.fecha_fallo, '-1 day')"
        " AND x.in_contracts = 1 LIMIT 1").fetchone()
    if row:
        d = client.get(CSIG, params={"id": row[0]}).json()
        assert d["antes_del_fallo"] and d["antes_del_fallo"]["days"] > 0
    row = db.execute(
        "SELECT id FROM contracts WHERE procedure_type LIKE 'LICITACI%' AND COALESCE(procedure_character, '') NOT LIKE 'INTERNACIONAL%'"
        " AND publication_date IS NOT NULL AND opening_date IS NOT NULL"
        " AND julianday(date(opening_date)) - julianday(date(publication_date)) + 1 BETWEEN 10 AND 12 LIMIT 1").fetchone()
    assert row, "no short licitación call on this DB"
    d = client.get(CSIG, params={"id": row[0]}).json()
    assert d["plazo_reducido"] == {"days": d["plazo_reducido"]["days"], "minimum": 15, "international": False}
    assert 10 <= d["plazo_reducido"]["days"] < 15
    assert set(d) == {"contract_id", "antes_del_fallo", "plazo_reducido"}


def test_contract_signals_validates(client):
    assert client.get(CSIG).status_code == 422
    assert client.get(CSIG, params={"id": 0}).status_code == 422
    assert client.get(CSIG, params={"id": 999999999}).status_code == 404


@pytest.mark.no_db
def test_cold_layers_build_once_under_concurrency(monkeypatch):
    import threading
    import time
    from api.services import atlas_sky
    calls = []

    def slow(conn):
        calls.append(1)
        time.sleep(0.2)
        return {"bits": {}}

    monkeypatch.setattr(atlas_sky, "_build_layers", slow)
    monkeypatch.setattr(atlas_sky, "_LAYERS_CACHE", {})
    ts = [threading.Thread(target=atlas_sky.build_layers, args=(None, "t1")) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert len(calls) == 1
