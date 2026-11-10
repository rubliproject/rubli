"""Weekend E1 — /atlas lasso → La Cola: POST /atlas/sky/selection (public basis, no RFC)
and the additive `ids` filter on GET /aria/queue.

Needs the atlas_sky precompute at DATABASE_PATH; skips on the stub DB.
"""
import sqlite3

import pytest

from api.dependencies import DB_PATH
from api.pii import _PERSON_RFC_TOKEN
from api.public_labels import excluded_from_rankings, label_sets
from api.services import atlas_sky


@pytest.fixture(scope="module")
def db():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    if not atlas_sky.sky_version(conn):
        pytest.skip("atlas_sky precompute not present on this DB")
    yield conn
    conn.close()


@pytest.mark.slow
def test_selection_public_basis_no_rfc(client, db):
    ids = [r[0] for r in db.execute("SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v' AND host_id = 251")]
    ids += [r[0] for r in db.execute("SELECT DISTINCT vendor_id FROM atlas_sky_ties WHERE institution_id = 251 LIMIT 50")]
    d = client.post("/api/v1/atlas/sky/selection", json={"ids": ids}).json()
    ls = label_sets(db)
    assert d["n_public"] == len(d["rows"]) <= d["n_drawn"] <= d["n_requested"]
    drawn = {r[0] for r in db.execute("SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v'")}
    for r in d["rows"]:
        assert set(r) == {"vendor_id", "name", "institution_id", "institution_name", "value_mxn", "n_contracts",
                          "first_year", "last_year", "risk_score"}
        assert r["vendor_id"] in drawn
        assert r["vendor_id"] not in ls["suppressed"] and not excluded_from_rankings(db, r["vendor_id"])
        assert not _PERSON_RFC_TOKEN.search(r["name"])
    assert abs(d["value_mxn"] - sum(r["value_mxn"] for r in d["rows"])) < 1


def test_selection_validates(client):
    assert client.post("/api/v1/atlas/sky/selection", json={"ids": []}).status_code == 422
    too_many = list(range(1, atlas_sky.SELECTION_CAP + 2))
    assert client.post("/api/v1/atlas/sky/selection", json={"ids": too_many}).status_code == 422


def test_aria_ids_filter_is_additive(client, db):
    ids = [r[0] for r in db.execute("SELECT vendor_id FROM aria_queue ORDER BY ips_final DESC LIMIT 7")]
    q = ",".join(map(str, ids))
    d = client.get("/api/v1/aria/queue", params={"ids": q, "per_page": 50}).json()
    assert {r["vendor_id"] for r in d["data"]} == set(ids)
    t1 = client.get("/api/v1/aria/queue", params={"ids": q, "tier": 1, "per_page": 50}).json()
    assert {r["vendor_id"] for r in t1["data"]} <= set(ids)
    assert client.get("/api/v1/aria/queue", params={"ids": "1,x"}).status_code == 422
    assert client.get("/api/v1/aria/queue", params={"ids": ",".join(["1"] * 201)}).status_code == 422
