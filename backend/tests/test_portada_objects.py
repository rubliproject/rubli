"""
Tests for the Portada objects: GET /executive/cauces («Los Cauces») and
GET /executive/vendor-field («El Campo»).

Pins: the cauces money and counts equal a direct scan of `contracts` under the
same rules (> 100B rejected, null/zero amounts and unscored rows out), keys stay
in the taxonomy; the vendor field carries tiers 1–3 only, no RFC, and nobody the
public-label rules keep off a named list.

    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_portada_objects.py -q -p no:cacheprovider
"""
import sqlite3

import pytest

from api.dependencies import DB_PATH
from api.public_labels import is_persona_fisica, label_sets


@pytest.fixture(scope="module")
def cauces(client, base_url):
    r = client.get(f"{base_url}/executive/cauces")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def vfield(client, base_url):
    r = client.get(f"{base_url}/executive/vendor-field")
    assert r.status_code == 200
    return r.json()


@pytest.mark.slow
def test_cauces_totals_match_the_contracts_table(cauces):
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        n, mxn = conn.execute(
            "SELECT COUNT(*), SUM(amount_mxn) FROM contracts"
            " WHERE amount_mxn > 0 AND amount_mxn <= 100000000000 AND risk_level IS NOT NULL"
        ).fetchone()
    rows = cauces["rows"]
    assert sum(r[3] for r in rows) == n
    assert abs(sum(r[4] for r in rows) - mxn) < 1_000  # rounding to the centavo per row


def test_cauces_keys_stay_in_the_taxonomy(cauces):
    assert cauces["columns"] == ["sector_id", "proc", "risk", "n", "mxn"]
    for s, p, k, n, v in cauces["rows"]:
        assert 1 <= s <= 12
        assert p in ("comp", "sb", "da")
        assert k in ("critical", "high", "medium", "low")
        assert n > 0 and v > 0
    assert cauces["flagged_10b"] >= 0


def test_vendor_field_is_public_safe(client, base_url, vfield):
    cols = vfield["columns"]
    assert "rfc" not in cols
    rows = vfield["rows"]
    assert rows and len(rows) <= vfield["n_queue"]
    ix = {c: i for i, c in enumerate(cols)}
    ids = [r[ix["id"]] for r in rows]
    assert len(set(ids)) == len(ids)
    assert all(r[ix["tier"]] in (1, 2, 3) for r in rows)
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        s = label_sets(conn)
        off = set(s["suppressed"]) | set(s["fp"])
        assert not off.intersection(ids)
        person = {
            vid for vid, ind, rfc in conn.execute(
                f"SELECT id, is_individual, rfc FROM vendors WHERE id IN ({','.join('?' * len(ids))})", ids)
            if is_persona_fisica(ind, rfc)
        }
        assert not person
        linked = set(s["documented"]) | set(s["leads"])
    for r in rows:
        assert r[ix["doc"]] == int(r[ix["id"]] in s["documented"])
        assert r[ix["novel"]] == int(r[ix["id"]] not in linked)
