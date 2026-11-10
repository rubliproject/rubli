"""Scope predicate (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 1)."""
import sqlite3

import pytest

from api.services.institution_canonical import parse_scope, scope_predicate

pytestmark = pytest.mark.no_db


def _ids(conn, scope):
    sql, params, eff = scope_predicate(conn, scope, "i.id")
    return sorted(r[0] for r in conn.execute(f"SELECT id FROM inst i WHERE {sql}", params)), eff


def test_scope_filters_by_buyer_level_and_defaults_to_federal():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE inst (id INTEGER PRIMARY KEY);
        INSERT INTO inst VALUES (1), (2), (3), (4);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER, buyer_level TEXT);
        INSERT INTO institution_canonical VALUES (1, 1, 'federal'), (2, 2, 'estatal'), (3, 3, 'municipal'), (4, 1, 'federal');
    """)
    assert _ids(c, None) == ([1, 4], "federal")
    assert _ids(c, "bogus") == ([1, 4], "federal")
    assert _ids(c, "local") == ([2, 3], "local")
    assert _ids(c, "municipal") == ([3], "municipal")
    assert _ids(c, "all") == ([1, 2, 3, 4], "all")
    assert parse_scope("estatal") == "estatal"


def test_scope_is_a_noop_without_the_column():
    c = sqlite3.connect(":memory:")
    c.executescript("CREATE TABLE inst (id INTEGER PRIMARY KEY); INSERT INTO inst VALUES (1), (2);")
    assert _ids(c, "federal") == ([1, 2], "all")


def test_sector_top3_is_canonical_and_scoped():
    from scripts.precompute_sector_top_institutions import top3_by_scope
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        INSERT INTO institutions VALUES (1, 'IMSS', 'IMSS'), (2, 'IMSS bis', NULL), (3, 'SSA Oaxaca', NULL);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER, buyer_level TEXT);
        INSERT INTO institution_canonical VALUES (1, 1, 'federal'), (2, 1, 'federal'), (3, 3, 'estatal');
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INTEGER, sector_id INTEGER, amount_mxn REAL);
        INSERT INTO contracts VALUES (1, 1, 1, 10), (2, 2, 1, 10), (3, 3, 1, 15);
    """)
    got = top3_by_scope(c)
    assert [(r["institution_id"], r["value_mxn"]) for r in got["federal"]["1"]] == [(1, 20.0)]
    assert [r["institution_id"] for r in got["local"]["1"]] == [3]
    assert [r["institution_id"] for r in got["all"]["1"]] == [1, 3]
