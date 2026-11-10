"""
Tests for GET /gap/field and GET /gap/months — the /gap «Las puertas» object.

/gap/field carries every post-CompraNet award as columns (one mark each): door
index, amount (null when none was read), amount source, buyer index, month,
direct-award flag and the >10B review flag. Pins: the columns cover the whole
table, the 100B rejection rule, flag ⇔ amount > 10B, the money equals the
summary to the peso, indices stay in range, and no RFC travels.
/gap/months carries the CompraNet months Apr–Sep 2025 for the same buyers.

Data assertions skip on the dataless default run; exercise them with
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_gap_field.py -q -p no:cacheprovider
"""
import pytest


@pytest.fixture(scope="module")
def field(client, base_url):
    r = client.get(f"{base_url}/gap/field")
    assert r.status_code == 200
    body = r.json()
    if not body.get("available"):
        pytest.skip("gap_contracts absent in the configured database")
    return body


@pytest.fixture(scope="module")
def summary(client, base_url):
    return client.get(f"{base_url}/gap/summary").json()


def test_columns_cover_every_award(field, summary):
    col = field["col"]
    n = summary["total_contracts"]
    assert field["n"] == n
    for k in ("a", "v", "s", "i", "m", "d", "x"):
        assert len(col[k]) == n, k


def test_twelve_doors_tender_first_other_last(field):
    keys = [d["k"] for d in field["doors"]]
    assert len(keys) == 12
    assert keys[0] == "tender" and keys[-1] == "other"
    assert all(0 <= a < 12 for a in field["col"]["a"])


def test_amounts_respect_the_data_rules(field):
    col = field["col"]
    for v, s, x in zip(col["v"], col["s"], col["x"]):
        assert s in (0, 1, 2)
        if v is None:
            assert x == 0
            continue
        assert 0 < v <= 100_000_000_000          # > 100B rejected
        assert x == (1 if v > 10_000_000_000 else 0)  # > 10B flagged
    assert all(v is None for v, s in zip(col["v"], col["s"]) if s == 2)


def test_money_matches_the_summary(field, summary):
    total = sum(v for v in field["col"]["v"] if v is not None)
    assert abs(total - summary["best_available_sum_mxn"]) < 1_000  # rounding to the peso per award


def test_indices_in_range(field):
    ni, nm = len(field["inst"]), len(field["months"])
    assert all(0 <= i < ni for i in field["col"]["i"])
    assert all(-1 <= m < nm for m in field["col"]["m"])
    assert field["months"] == sorted(field["months"])


def test_no_rfc_travels(client, base_url):
    assert "rfc" not in client.get(f"{base_url}/gap/field").text.lower()


def test_months_are_the_compranet_slice(client, base_url, field):
    r = client.get(f"{base_url}/gap/months")
    assert r.status_code == 200
    body = r.json()
    assert body["months"] == ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"]
    ids = {q["id"] for q in field["inst"] if q["id"] is not None}
    assert body["rows"], "no CompraNet rows for the gap buyers"
    for k, cells in body["rows"].items():
        assert int(k) in ids
        assert len(cells) == 6
        for n, v, da in cells:
            assert 0 <= da <= n
            assert 0 <= v <= n * 100_000_000_000
