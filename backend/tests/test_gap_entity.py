"""
Tests for GET /gap/entity/{kind}/{id} and GET /gap/carry-forward — the gap plugged
into institution / vendor / category dossiers (owner decision 2026-10-16).

Pins: the three kinds answer; an institution slice sums to its rows and its months;
money respects the 100B rule; a canonical member id resolves to the same slice as
the canonical id; no RFC and no persona física travels; carry-forward tiers sum.

Data assertions skip on the dataless default run; exercise them with
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_gap_entity.py -q -p no:cacheprovider
"""
import sqlite3

import pytest


@pytest.fixture(scope="module")
def db_path(base_url, client):
    import os
    p = os.environ.get("DATABASE_PATH")
    if not p or not client.get(f"{base_url}/gap/summary").json().get("available"):
        pytest.skip("gap_contracts absent in the configured database")
    return p


@pytest.fixture(scope="module")
def biggest_buyer(db_path):
    c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    r = c.execute("""SELECT legacy_institution_id, COUNT(*) FROM gap_contracts
                     WHERE legacy_institution_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1""").fetchone()
    c.close()
    return r


def test_bad_kind_is_422(client, base_url):
    assert client.get(f"{base_url}/gap/entity/sector/1").status_code == 422


def test_institution_slice_sums(client, base_url, biggest_buyer):
    iid, n = biggest_buyer
    body = client.get(f"{base_url}/gap/entity/institution/{iid}").json()
    assert body["available"] and body["kind"] == "institution"
    assert body["total"] == n
    assert sum(m["count"] for m in body["by_month"]) == n
    assert body["direct_award_count"] <= n and 0 <= body["direct_award_pct"] <= 100
    assert body["with_amount"] <= n and body["money_known_mxn"] >= 0
    for v in body["counterparts"]:
        assert v["count"] >= 1 and 0 <= v["money_known_mxn"] <= 100_000_000_000 * v["count"]
        assert "rfc" not in v and v["name"]
    assert body["by_category"], "categories must be classified on gap rows"


def test_member_id_resolves_to_canonical(client, base_url, db_path):
    c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    r = c.execute("""SELECT ic.institution_id, ic.canonical_id FROM institution_canonical ic
                     JOIN gap_contracts g ON g.legacy_institution_id = ic.canonical_id
                     WHERE ic.institution_id <> ic.canonical_id LIMIT 1""").fetchone()
    c.close()
    if not r:
        pytest.skip("no non-canonical member among gap buyers")
    member, canon = r
    a = client.get(f"{base_url}/gap/entity/institution/{member}").json()
    b = client.get(f"{base_url}/gap/entity/institution/{canon}").json()
    assert a["total"] == b["total"] > 0


def test_vendor_and_category_slices(client, base_url, db_path):
    c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    vid = c.execute("""SELECT legacy_vendor_id FROM gap_contracts WHERE legacy_vendor_id IS NOT NULL
                       GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1""").fetchone()[0]
    cid, cn = c.execute("""SELECT category_id, COUNT(*) FROM gap_contracts WHERE category_id IS NOT NULL
                           GROUP BY 1 ORDER BY 2 DESC LIMIT 1""").fetchone()
    c.close()
    v = client.get(f"{base_url}/gap/entity/vendor/{vid}").json()
    assert v["total"] > 0 and v["counterparts"] and "institution_id" in v["counterparts"][0]
    k = client.get(f"{base_url}/gap/entity/category/{cid}").json()
    assert k["total"] == cn and "by_category" not in k


def test_empty_slice(client, base_url, db_path):
    body = client.get(f"{base_url}/gap/entity/vendor/999999999").json()
    assert body["available"] and body["total"] == 0 and "counterparts" not in body


def test_carry_forward_tiers_sum(client, base_url, db_path):
    body = client.get(f"{base_url}/gap/carry-forward").json()
    assert body["available"]
    t = body["tiers"]
    linked = sum(t.get(k, {}).get("money_known_mxn", 0) for k in ("critical", "high", "medium", "low"))
    assert body["linked_money_known_mxn"] == linked
    assert body["flagged_money_known_mxn"] == t.get("critical", {}).get("money_known_mxn", 0) + \
        t.get("high", {}).get("money_known_mxn", 0)
    if linked:
        assert 0 <= body["flagged_share_pct"] <= 100


def test_datos_source_has_an_amount_on_every_contract(client, base_url, db_path, biggest_buyer):
    c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    has = c.execute("SELECT 1 FROM sqlite_master WHERE name='comprasmx_contracts'").fetchone()
    c.close()
    if not has:
        pytest.skip("comprasmx_contracts not loaded")
    body = client.get(f"{base_url}/gap/entity/institution/{biggest_buyer[0]}?source=datos").json()
    assert body["available"] and body["source_kind"] == "datos" and body["total"] > 0
    assert body["amount_read_count"] == body["with_amount"]
    assert all(p["money_known_mxn"] <= 100_000_000_000 * p["count"] for p in body["counterparts"])


def test_registers_never_carry_estimates(client, base_url, db_path):
    """An estimated amount is the procedure's budget, not what a vendor won."""
    c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    r = c.execute("""SELECT legacy_institution_id, vendor, CAST(amount_mxn_best AS REAL) FROM gap_contracts
                     WHERE amount_source='estimated' AND legacy_institution_id IS NOT NULL AND COALESCE(vendor,'')<>''
                     ORDER BY 3 DESC LIMIT 1""").fetchone()
    c.close()
    if not r:
        pytest.skip("no estimated row with a vendor")
    body = client.get(f"{base_url}/gap/entity/institution/{r[0]}").json()
    assert all(p["money_known_mxn"] < r[2] for p in body["counterparts"] if p["name"] and r[1][:12] in p["name"])
