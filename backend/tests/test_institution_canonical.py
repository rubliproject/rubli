"""Canonical institution identity (scripts/migrate_institutions.py, PREPUB_AUDIT P0-3).

Skips unless the DB under test carries institution_canonical (i.e. the migration
has been applied): an absorbed id must resolve to its canonical dossier, never
appear in lists or aggregates, and never vanish from search.
"""
import os
import sqlite3
from pathlib import Path

import pytest

from scripts.migrate_institutions import ur_key

_default_db = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(_default_db)))


def test_ur_key_matches_gold_rules():
    assert ur_key("2021-07-HXA-00000079") == "E:HXA"
    assert ur_key("2021-14-A00-00000237") == "D:014A00"
    assert ur_key("2021-14-512-00000634") == "R:014"
    assert ur_key(None) is None


@pytest.fixture(scope="module")
def db():
    if not DB_PATH.exists():
        pytest.skip(f"DB not found at {DB_PATH}")
    c = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    if not c.execute("SELECT 1 FROM sqlite_master WHERE name = 'institution_canonical'").fetchone():
        pytest.skip("institution_canonical not present (migration not applied)")
    yield c
    c.close()


@pytest.fixture(scope="module")
def absorbed(db):
    """The absorbed id with the most contracts, and its canonical id."""
    return db.execute("""
        SELECT ic.institution_id, ic.canonical_id FROM institution_canonical ic
        JOIN contracts c ON c.institution_id = ic.institution_id
        WHERE ic.canonical_id <> ic.institution_id
        GROUP BY ic.institution_id ORDER BY COUNT(*) DESC LIMIT 1
    """).fetchone()


def test_every_institution_has_one_canonical_row(db):
    n_inst, n_map = db.execute(
        "SELECT (SELECT COUNT(*) FROM institutions), (SELECT COUNT(*) FROM institution_canonical)").fetchone()
    assert n_inst == n_map
    # canonical ids are their own canonical (no chains)
    assert db.execute("""SELECT COUNT(*) FROM institution_canonical a
                         JOIN institution_canonical b ON b.institution_id = a.canonical_id
                         WHERE b.canonical_id <> b.institution_id""").fetchone()[0] == 0


def test_aggregates_have_no_absorbed_rows(db):
    for t in ("institution_stats", "institution_scorecards", "institution_category_stats",
              "institution_hhi", "institution_top_vendors", "yearly_institution_rankings"):
        n = db.execute(f"""SELECT COUNT(*) FROM {t} WHERE institution_id IN
            (SELECT institution_id FROM institution_canonical WHERE canonical_id <> institution_id)""").fetchone()[0]
        assert n == 0, t


def test_stats_equal_group_contracts(db, absorbed):
    _, cid = absorbed
    group = db.execute("""SELECT COUNT(*) FROM contracts WHERE institution_id IN
        (SELECT institution_id FROM institution_canonical WHERE canonical_id = ?)""", (cid,)).fetchone()[0]
    stats = db.execute("SELECT total_contracts FROM institution_stats WHERE institution_id = ?", (cid,)).fetchone()[0]
    assert stats == group


def test_absorbed_id_serves_canonical_dossier(client, base_url, absorbed):
    aid, cid = absorbed
    r = client.get(f"{base_url}/institutions/{aid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == cid and body["canonical_id"] == cid
    c = client.get(f"{base_url}/institutions/{aid}/contracts?per_page=1").json()
    assert c["pagination"]["total"] == body["total_contracts"]


def test_absorbed_id_hidden_from_list_but_found_by_search(client, base_url, db, absorbed):
    aid, cid = absorbed
    name = db.execute("SELECT name FROM institutions WHERE id = ?", (aid,)).fetchone()[0]
    listed = client.get(f"{base_url}/institutions?search={name[:40]}&per_page=100").json()["data"]
    assert aid not in {x["id"] for x in listed}
    found = client.get(f"{base_url}/institutions/search", params={"q": name[:40], "limit": 100}).json()["data"]
    ids = [x["id"] for x in found]
    assert cid in ids and aid not in ids and len(ids) == len(set(ids))


@pytest.mark.no_db
def test_canon_view_builds_with_canonical_map_and_caps_amounts():
    """Regression 2026-10-20: the 100B cap rendered as `c.COALESCE(...)` on the joined
    branch — a syntax error every institution precompute hit on the real DB."""
    import sqlite3
    from scripts._institution_canonical import install_contracts_canon
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INT, institution_id INT, vendor_id INT, amount_mxn REAL);
        CREATE TABLE institution_canonical (institution_id INT, canonical_id INT);
        CREATE TABLE vendor_canonical (vendor_id INT, canonical_id INT);
        INSERT INTO contracts VALUES (1, 10, 5, 1e6), (2, 11, 6, 5e11);
        INSERT INTO institution_canonical VALUES (11, 10);
        INSERT INTO vendor_canonical VALUES (6, 5);
    """)
    assert install_contracts_canon(c, vendors=True) is True
    assert c.execute("SELECT id, institution_id, vendor_id FROM contracts_canon").fetchall() == [(1, 10, 5)]
