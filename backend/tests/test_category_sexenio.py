"""GET /analysis/category-sexenio + category_sexenio_flows (Administraciones aluvión).

Pins: each sexenio's money equals the contracts total for its date window, ranks
are contiguous inside each (sexenio, sector), no RFC and no persona física name
leaves the endpoint, and the 100B rejection rule holds.
"""
import json
import re
import sqlite3

import pytest

from api.dependencies import DB_PATH
from scripts.precompute_category_sexenio import DATE, MAX_CONTRACT_VALUE, SEXENIOS


def _has_table() -> bool:
    try:
        with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
            return c.execute("SELECT COUNT(*) FROM category_sexenio_flows").fetchone()[0] > 0
    except sqlite3.Error:
        return False


pytestmark = pytest.mark.skipif(not _has_table(), reason="category_sexenio_flows not built")
RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")


@pytest.fixture(scope="module")
def payload(client):
    r = client.get("/api/v1/analysis/category-sexenio")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def ro():
    c = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=120)
    yield c
    c.close()


@pytest.mark.slow
def test_sexenio_money_matches_contracts(payload, ro):
    by_e = {}
    for e, _s, _k, n, v, *_ in payload["cells"]:
        by_e.setdefault(e, [0, 0.0])
        by_e[e][0] += n
        by_e[e][1] += v
    for i, _key, a, b in SEXENIOS:
        n, v = ro.execute(
            f"SELECT COUNT(*), SUM(amount_mxn) FROM contracts WHERE amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE}"
            f" AND {DATE} BETWEEN ? AND ?", (a, b)).fetchone()
        assert by_e[i][0] == n
        assert by_e[i][1] == pytest.approx(v, rel=1e-9, abs=1e3)
        s = payload["sexenios"][i]
        assert s["contracts"] == n and s["money_mxn"] == pytest.approx(v, rel=1e-9, abs=1e3)


def test_ranks_contiguous(ro):
    for e, s, rv, rn in ro.execute(
            "SELECT sexenio_idx, sector_id, group_concat(rank_in_sexenio), group_concat(rank_by_contracts)"
            " FROM category_sexenio_flows GROUP BY 1, 2"):
        for ranks in (rv, rn):
            got = sorted(int(x) for x in ranks.split(","))
            assert got == list(range(1, len(got) + 1)), (e, s)


def test_no_rfc_no_persona_fisica(payload, ro):
    blob = json.dumps(payload, ensure_ascii=False)
    assert not RFC.search(blob)
    named = {x[0] for vs in payload["vend"].values() for x in vs if x[0] is not None}
    pf = {r[0] for r in ro.execute("SELECT id FROM vendors WHERE is_individual = 1 OR length(trim(COALESCE(rfc, ''))) = 13")}
    assert not named & pf
    for vs in payload["vend"].values():
        for vid, name, *_ in vs:
            assert (vid is None) == (name is None)


def test_100b_rule(payload, ro):
    big = ro.execute("SELECT MAX(money_mxn / contracts) FROM category_sexenio_flows").fetchone()[0]
    assert big <= MAX_CONTRACT_VALUE
    for vs in payload["vend"].values():
        for _vid, _n, c, m, _p in vs:
            assert m <= c * MAX_CONTRACT_VALUE
    # nothing above 100B was counted: the window total equals the ≤100B total
    total = sum(s["contracts"] for s in payload["sexenios"])
    allin = ro.execute(f"SELECT COUNT(*) FROM contracts WHERE amount_mxn > 0 AND {DATE} BETWEEN '2000-12-01' AND '2025-09-27'").fetchone()[0]
    assert total == allin - ro.execute(
        f"SELECT COUNT(*) FROM contracts WHERE amount_mxn > {MAX_CONTRACT_VALUE} AND {DATE} BETWEEN '2000-12-01' AND '2025-09-27'").fetchone()[0]
