"""GET /api/v1/scorecards/institutions/sexenios — v3 grades per presidential term
(compute_institution_grades_v3.py --sexenios, frozen calibration)."""
import sqlite3
import statistics

import pytest

from api.dependencies import DB_PATH

URL = "/api/v1/scorecards/institutions/sexenios"
LETTERS = "ABCDF"


def _payload(client, scope="all"):
    r = client.get(URL, params={"scope": scope})
    if r.status_code == 404:
        pytest.skip("institution_grades_v3_sexenio not computed on this DB")
    assert r.status_code == 200, r.text
    d = r.json()
    return d, [dict(zip(d["columns"], row)) for row in d["rows"]]


def _cut_letter(score, cuts):
    return next((LETTERS[i] for i, c in enumerate(cuts) if score >= c), "F")


def test_shape_and_windows(client):
    d, rows = _payload(client)
    assert [s["key"] for s in d["sexenios"]] == ["fox", "calderon", "pena_nieto", "amlo", "sheinbaum"]
    assert d["sexenios"][0]["coverage"] == "weak" and d["sexenios"][-1]["coverage"] == "partial"
    assert d["cut_points"] == [76.0, 60.0, 44.0, 28.0]          # owner-approved, never refit
    assert all(0 <= r["sexenio"] < 5 for r in rows)
    assert len({(r["institution_id"], r["sexenio"]) for r in rows}) == len(rows)


def test_grades_follow_v3_cut_points(client):
    """Grade = the score's cut-point letter, or lower only via the v3 caps
    (red-flag pillars cap at B/C, sanctions gate caps at C)."""
    d, rows = _payload(client)
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:   # payload rounds to 0.1
        raw = {(i, s): v for i, s, v in c.execute(
            "SELECT institution_id, sexenio, score FROM institution_grades_v3_sexenio")}
    keys = [s["key"] for s in d["sexenios"]]
    for r in rows:
        if r["grade"] is None:
            continue
        score = raw[(r["institution_id"], keys[r["sexenio"]])]
        assert 0 <= score <= 100
        base = _cut_letter(score, d["cut_points"])
        assert LETTERS.index(r["grade"]) >= LETTERS.index(base), r
        assert r["grade"] == base or r["grade"] in "BC", r


def test_no_grade_below_volume_floor(client):
    d, rows = _payload(client)
    for r in rows:
        if r["n_contracts"] < d["min_contracts"]:
            assert r["grade"] is None and r["score"] is None, r
        else:
            assert r["grade"] in LETTERS, r


def test_amlo_agrees_with_all_years_grade(client):
    """Institutions with >= 90% of their contracts in the AMLO window should get
    nearly the all-years grade. Not identical: the peer cohort and EB shrinkage
    groups are the window's own. Tolerance: every one within one letter, median
    |delta score| <= 6 (half the median v3 P10-P90 band, 13.5), none > 20."""
    _, rows = _payload(client)
    amlo = {r["institution_id"]: r for r in rows if r["sexenio"] == 3 and r["grade"]}
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
        full = {i: (n, s, g) for i, n, s, g in c.execute(
            "SELECT institution_id, n_contracts, score, grade FROM institution_grades_v3")}
    pairs = [(a, full[i]) for i, a in amlo.items()
             if i in full and a["n_contracts"] >= 0.9 * full[i][0]]
    assert len(pairs) >= 30
    deltas = [abs(a["score"] - f[1]) for a, f in pairs]
    assert all(abs(LETTERS.index(a["grade"]) - LETTERS.index(f[2])) <= 1 for a, f in pairs)
    assert statistics.median(deltas) <= 6
    assert max(deltas) <= 20


def test_no_rfc(client):
    r = client.get(URL)
    if r.status_code == 404:
        pytest.skip("institution_grades_v3_sexenio not computed on this DB")
    assert "rfc" not in r.text.lower()


def test_scope_defaults_to_federal_and_splits_by_graded_level(client):
    d, rows = _payload(client, scope=None)
    assert d["scope"] == "federal" and {r["level"] for r in rows} == {"federal"}
    _, local = _payload(client, scope="local")
    assert {r["level"] for r in local} <= {"estatal", "municipal"} and local
