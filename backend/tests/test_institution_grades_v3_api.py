"""grading-v3 s.6.5: GET /api/v1/scorecards/institutions/{id}/grade-v3 (read-only)."""
import sqlite3

import pytest

from api.dependencies import DB_PATH

URL = "/api/v1/scorecards/institutions/{}/grade-v3"


def _sample():
    """(graded canonical id, an absorbed id mapping to a graded canonical) or skip."""
    try:
        with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
            row = c.execute("SELECT institution_id FROM institution_grades_v3 "
                            "ORDER BY n_contracts DESC LIMIT 1").fetchone()
            absorbed = c.execute("""
                SELECT k.institution_id, k.canonical_id FROM institution_canonical k
                JOIN institution_grades_v3 g ON g.institution_id = k.canonical_id
                WHERE k.institution_id <> k.canonical_id LIMIT 1""").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        pytest.skip("institution_grades_v3 not computed on this DB")
    return row[0], absorbed


def test_unknown_id_is_404(client):
    assert client.get(URL.format(999_999_999)).status_code == 404


def test_grade_payload_and_ledger_invariant(client):
    iid, _ = _sample()
    r = client.get(URL.format(iid))
    assert r.status_code == 200
    d = r.json()
    assert d["grade"] in list("ABCDF")
    assert d["score_lo"] <= d["score_hi"]
    assert set(d["pillars"]) == {"competencia", "proceso", "concentracion"}
    assert d["peer"]["n"] >= 8
    assert abs(100 + sum(x["points"] for x in d["ledger"]) - d["score"]) < 0.01
    assert "rfc" not in r.text.lower()


def test_absorbed_id_resolves_to_canonical(client):
    _, absorbed = _sample()
    if not absorbed:
        pytest.skip("no absorbed id with a graded canonical")
    d = client.get(URL.format(absorbed[0])).json()
    assert d["institution_id"] == absorbed[1] and d["requested_id"] == absorbed[0]


def _coverage_row(status="ok"):
    try:
        with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
            return c.execute("SELECT institution_id, ratio, band, is_lower_bound FROM institution_coverage_v1 "
                             "WHERE status = ? ORDER BY budget_pagado_mxn DESC LIMIT 1", (status,)).fetchone()
    except sqlite3.OperationalError:
        pytest.skip("institution_coverage_v1 not loaded on this DB")


def test_coverage_field_beside_the_grade(client):
    """coverage-badge.md: ratio + band + lower-bound flag, never part of the score."""
    row = _coverage_row("ok")
    if not row:
        pytest.skip("no matched coverage rows")
    d = client.get(URL.format(row[0])).json()
    cov = d["coverage"]
    assert cov["status"] == "ok" and cov["band"] == row[2] and cov["band"] in ("alta", "parcial", "baja")
    assert abs(cov["ratio"] - row[1]) < 1e-3
    assert cov["is_lower_bound"] == bool(row[3])
    assert cov["years"][0] >= 2018 and cov["years"][1] <= 2024 and cov["source_note"]
    assert abs(100 + sum(x["points"] for x in d["ledger"]) - d["score"]) < 0.01   # grade unchanged


def test_unmatched_institution_has_no_coverage_ratio(client):
    row = _coverage_row("sin_cotejo")
    if not row:
        pytest.skip("no unmatched federal institutions")
    cov = client.get(URL.format(row[0])).json()["coverage"]
    assert cov["status"] == "sin_cotejo" and cov["ratio"] is None and cov["band"] is None


def test_grade_v3_cross_link_fields(client):
    """«Por pesos» §6–§7: vendor ids for /aria?ids= (≤200, ints, no PII) and the > 10B flag."""
    r = client.get("/api/v1/scorecards/institutions/251/grade-v3")
    if r.status_code == 404:
        import pytest
        pytest.skip("grades v3 not on this DB")
    g = r.json()
    ids = g["gt_vendor_ids"]
    assert isinstance(ids, list) and len(ids) <= 200 and all(isinstance(i, int) for i in ids)
    assert len(ids) == min(200, g["badges"]["gt_vendor_count"] or 0)
    assert g["flagged_n"] >= 0 and g["flagged_value_mxn"] >= 0
