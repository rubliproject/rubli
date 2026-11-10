"""Weekend E2 — GET /atlas/sky/band: named «resto» members per (star, year).

Needs the atlas_sky precompute at DATABASE_PATH; skips on the stub DB.
"""
import sqlite3

import pytest

from api.dependencies import DB_PATH
from api.pii import _PERSON_RFC_TOKEN
from api.public_labels import excluded_from_rankings, label_sets
from api.services import atlas_sky

BAND = "/api/v1/atlas/sky/band"


@pytest.fixture(scope="module")
def db():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    if not atlas_sky.sky_version(conn):
        pytest.skip("atlas_sky precompute not present on this DB")
    yield conn
    conn.close()


def _segments(db, k=4):
    return db.execute(
        "SELECT host_id, entity_id, value_mxn, n_vendors FROM atlas_sky_layout WHERE kind = 'r'"
        " ORDER BY n_vendors DESC, host_id, entity_id LIMIT ?", (k,)).fetchall()


def test_band_totals_equal_remainder_row(client, db):
    for inst, year, val, n in _segments(db):
        d = client.get(BAND, params={"inst": inst, "year": year}).json()
        assert d["n_vendors"] == n
        assert abs(d["value_mxn"] - val) <= 1e-6 * max(val, 1) + 0.01
        assert len(d["members"]) <= atlas_sky.BAND_CAP


def test_band_is_public_no_rfc_named_columns(client, db):
    ls = label_sets(db)
    for inst, year, _, _ in _segments(db):
        d = client.get(BAND, params={"inst": inst, "year": year}).json()
        for m in d["members"]:
            assert set(m) == {"vendor_id", "name", "value_mxn", "n_contracts", "first_year", "last_year"}
            assert m["vendor_id"] not in ls["suppressed"]
            assert not excluded_from_rankings(db, m["vendor_id"])
            assert not _PERSON_RFC_TOKEN.search(m["name"])
        drawn = {r[0] for r in db.execute("SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v'")}
        assert not drawn & {m["vendor_id"] for m in d["members"]}, "a drawn body listed in the band"
        vals = [m["value_mxn"] for m in d["members"]]
        assert vals == sorted(vals, reverse=True)


def test_band_validates(client):
    assert client.get(BAND, params={"inst": 0, "year": 2015}).status_code == 422
    assert client.get(BAND, params={"inst": 251}).status_code == 422
