"""Search must not match persona-física RFCs (joker review 02 #3).

A 13-char RFC = 4 initials + YYMMDD birth date + homoclave. If search matched
it, probing `____850825` would return the person and leak their birth date even
though the RFC itself is masked in the output.
"""
import sqlite3

from api.dependencies import DB_PATH


def _person_with_rfc():
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        return conn.execute(
            "SELECT id, rfc FROM vendors WHERE LENGTH(rfc) = 13 "
            "AND rfc GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9]*' LIMIT 1"
        ).fetchone()


def test_federated_search_ignores_person_rfc(client):
    vid, rfc = _person_with_rfc()
    for probe in (rfc, rfc[4:10], "____" + rfc[4:10]):
        r = client.get("/api/v1/search", params={"q": probe})
        assert r.status_code == 200
        assert vid not in [v["id"] for v in r.json()["vendors"]], probe


def test_vendor_list_search_ignores_person_rfc(client):
    vid, rfc = _person_with_rfc()
    r = client.get("/api/v1/vendors", params={"search": rfc, "per_page": 50})
    assert r.status_code == 200
    assert vid not in [v["id"] for v in r.json()["data"]]
