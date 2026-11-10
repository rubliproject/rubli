"""api/services/vendor_canonical.py — canonical vendor identity (scripts/migrate_vendors.py)."""
import sqlite3

from api.services import vendor_canonical as vc


def _db(with_tables=True):
    c = sqlite3.connect(":memory:")
    if with_tables:
        c.executescript("""
            CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER, group_size INTEGER,
                                           match_basis TEXT);
            INSERT INTO vendor_canonical VALUES (10, 10, 2, 'name'), (11, 10, 2, 'name');
            CREATE TABLE vendor_match_candidates (left_vendor_id INTEGER, right_vendor_id INTEGER, tier TEXT,
                                                  score REAL, cosignals INTEGER, public INTEGER, rule_version TEXT);
            INSERT INTO vendor_match_candidates VALUES
                (11, 20, 'PROBABLE_typo', 1.0, 2, 1, 'r'),          -- via the absorbed id -> shown on 10
                (10, 21, 'REVIEW_guarded', 1.0, 2, 0, 'r'),         -- analyst-only
                (10, 11, 'PROBABLE_typo', 1.0, 2, 1, 'r'),          -- same group: never a link
                (5, 10, 'PROBABLE_rfc_related', 1.0, 1, 1, 'r');
            CREATE TABLE vendor_rfc_quality (vendor_id INTEGER PRIMARY KEY, best_rfc_source TEXT,
                                             rfc_recovered INTEGER, display_ok INTEGER);
            INSERT INTO vendor_rfc_quality VALUES (10, 'rupc', 1, 1), (12, 'raw_rows', 1, 0);
        """)
    return c


def test_canonical_mapping():
    c = _db()
    assert vc.canonical_id(c, 11) == 10 and vc.canonical_id(c, 99) == 99
    assert sorted(vc.group_ids(c, 10)) == [10, 11] and vc.group_ids(c, 99) == [99]
    assert [r[0] for r in c.execute(f"SELECT v FROM (SELECT 10 v UNION SELECT 11 UNION SELECT 12) "
                                    f"WHERE {vc.not_absorbed(c, 'v')} ORDER BY v")] == [10, 12]


def test_possible_same_entities_public_only():
    got = {x["vendor_id"]: x["tier"] for x in vc.possible_same_entities(_db(), 10)}
    assert got == {20: "PROBABLE_typo", 5: "PROBABLE_rfc_related"}
    assert "Comparte RFC con ACME" in vc.link_note("PROBABLE_rfc_related", "es", "ACME")


def test_rfc_recovery_source_display_ok_only():
    c = _db()
    assert vc.rfc_recovery_source(c, 10) == "rupc"
    assert vc.rfc_recovery_source(c, 12) is None  # persona física / not displayable


def test_inert_without_tables():
    c = _db(with_tables=False)
    assert vc.canonical_id(c, 11) == 11 and vc.group_ids(c, 11) == [11]
    assert vc.not_absorbed(c, "v") == "1 = 1"
    assert vc.possible_same_entities(c, 10) == [] and vc.rfc_recovery_source(c, 10) is None



def test_yearly_amounts_read_vendor_year_whole_or_one_sector():
    c = _db()
    c.executescript("""
        CREATE TABLE vendor_year (vendor_id INTEGER, sector_id INTEGER, year INTEGER, n INTEGER, amount_mxn REAL,
                                  PRIMARY KEY (vendor_id, sector_id, year));
        INSERT INTO vendor_year VALUES (10, 1, 2020, 2, 12), (10, 6, 2020, 1, 5), (10, 1, 2023, 1, 3),
                                       (30, 6, 2019, 1, 4);
    """)
    assert vc.yearly_amounts(c, [10, 30]) == {10: [(2020, 17.0), (2023, 3.0)], 30: [(2019, 4.0)]}
    assert vc.yearly_amounts(c, [10, 30], sector_id=1) == {10: [(2020, 12.0), (2023, 3.0)]}
    assert vc.yearly_amounts(c, []) == {}


def test_yearly_amounts_empty_without_the_precompute():
    assert vc.yearly_amounts(_db(), [10]) == {}  # no live fallback: too slow on prod
