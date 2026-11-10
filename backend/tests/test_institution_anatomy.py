"""«La Anatomía» endpoints (dossier-grade.md § 7).

Pure tests (no DB) lock the anatomy maths; endpoint tests run on the full DB
and are skipped in CI by conftest when `contracts` is absent.
"""
import json

import pytest

from api.routers.institution_anatomy import CEILING, PILLARS, build_anatomy


def _row(score, type_="t", fed=1, pillars=None, km=None, band="high"):
    return {
        "score": score, "grade": "C+", "band": band, "km": json.dumps(km or {}),
        "type": type_, "fed": fed, "n": 1000,
        "pillars": pillars or {p["key"]: p["cap"] / 2 for p in PILLARS},
    }


@pytest.mark.no_db
def test_ceiling_is_sum_of_observed_caps():
    assert CEILING == 90
    assert [p["column"] for p in PILLARS] == [
        "pillar_openness", "pillar_price", "pillar_vendors", "pillar_process", "pillar_external",
    ]


@pytest.mark.no_db
def test_peer_rank_and_dragging_pillar():
    weak_open = {"openness": 2.0, "process": 20.0, "tail": 10.0, "external": 0.0, "independence": 5.0}
    rows = {
        1: _row(40, pillars=weak_open, km={"competitive_rate": 0.1, "signal_competitive": "red"}),
        2: _row(60), 3: _row(50), 4: _row(70),
        5: _row(99, type_="other"),  # different peer group — ignored for rank
    }
    a = build_anatomy(rows, 1)
    assert a["peer_group"]["n"] == 4
    assert a["peer_group"]["rank"] == 4
    # External is exposure, never the dragging pillar even at 0/15
    assert a["dragging_pillar"] == "openness"
    opening = next(p for p in a["pillars"] if p["key"] == "openness")
    assert opening["drivers"] == [{"key": "competitive_rate", "value": 0.1, "signal": "red"}]
    assert opening["penalties"] is None
    assert a["ci"] is None and a["method_version"] == "v2-live"


@pytest.mark.no_db
def test_small_peer_group_has_no_bands():
    rows = {1: _row(40, type_="solo"), 2: _row(50, type_="solo"), 3: _row(60), 4: _row(55), 5: _row(45)}
    a = build_anatomy(rows, 1)
    assert a["peer_group"]["n"] == 2
    assert a["peer_group"]["median"] is None
    assert all(p["peer"] is None for p in a["pillars"])
    assert all(p["all"] is not None for p in a["pillars"])


def test_anatomy_imss(client):
    r = client.get("/api/v1/scorecards/institutions/251/anatomy")
    assert r.status_code == 200
    a = r.json()
    assert a["ceiling"] == 90
    assert [p["key"] for p in a["pillars"]] == ["openness", "process", "tail", "external", "independence"]
    # stored pillars sum to the stored score
    assert abs(sum(p["value"] for p in a["pillars"]) - a["score"]) <= 0.3
    assert 1 <= a["peer_group"]["rank"] <= a["peer_group"]["n"]


def test_anatomy_404(client):
    assert client.get("/api/v1/scorecards/institutions/999999999/anatomy").status_code == 404


def test_peers_lists_self(client):
    r = client.get("/api/v1/scorecards/institutions/251/peers")
    assert r.status_code == 200
    assert sum(1 for d in r.json()["data"] if d["is_self"]) == 1


def test_category_lens_and_vendors(client):
    r = client.get("/api/v1/institutions/251/category-lens?limit=5")
    assert r.status_code == 200
    body = r.json()
    if not body["data"]:
        pytest.skip("precompute_institution_lens not run on this DB")
    top = body["data"][0]
    assert set(top["metrics"]) == {"da", "sb", "ye", "hr", "top1"}
    assert 0 < top["spend_share"] <= 1
    v = client.get(f"/api/v1/institutions/251/categories/{top['category_id']}/vendors")
    assert v.status_code == 200
    vb = v.json()
    assert 1 <= len(vb["data"]) <= 8
    assert "rfc" not in json.dumps(vb).lower()
    shares = [d["share"] for d in vb["data"]]
    assert shares == sorted(shares, reverse=True)


def test_category_vendors_404(client):
    assert client.get("/api/v1/institutions/251/categories/999999/vendors").status_code == 404


def test_peers_v3_imss(client):
    r = client.get("/api/v1/scorecards/institutions/251/peers-v3")
    if r.status_code == 404:
        pytest.skip("grades v3 not computed on this DB")
    b = r.json()
    assert b["n"] == len(b["data"]) and 1 <= b["rank"] <= b["n"]
    assert sum(1 for d in b["data"] if d["is_self"]) == 1
    assert set(b["pillars"]) == {"competencia", "proceso", "concentracion"}
    assert [c["grade"] for c in b["cut_points"]] == ["A", "B", "C", "D"]
    g = client.get("/api/v1/scorecards/institutions/251/grade-v3").json()
    # the ledger is the decomposition the dossier draws: 100 + Σ points == score
    assert abs(100 + sum(x["points"] for x in g["ledger"]) - g["score"]) < 0.05
