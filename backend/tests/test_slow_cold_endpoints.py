"""Pins the output of the endpoints rewritten for speed (docs/LAUNCH_AUDIT_2026-10-30.md § S1)
against the original, slow SQL used as the oracle."""
import sqlite3

from api.dependencies import DB_PATH
from api.services.institution_canonical import canonical_id, group_ids


def _ro():
    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def test_institution_contracts_by_amount_matches_full_sort(client, base_url):
    inst, per_page, page = 345, 50, 3
    with _ro() as conn:
        ids = group_ids(conn, canonical_id(conn, inst))
        for risk in (None, "high"):
            extra, params = ("AND risk_level = ?", [risk]) if risk else ("", [])
            oracle = conn.execute(
                f"SELECT id, amount_mxn FROM contracts WHERE institution_id IN ({','.join('?' * len(ids))}) "
                f"AND COALESCE(amount_mxn, 0) <= 100000000000 {extra} "
                "ORDER BY amount_mxn DESC NULLS LAST, rowid LIMIT ? OFFSET ?",
                [*ids, *params, per_page, (page - 1) * per_page],
            ).fetchall()
            q = f"{base_url}/institutions/{inst}/contracts?sort_by=amount_mxn&sort_order=desc&page={page}&per_page={per_page}"
            r = client.get(q + (f"&risk_level={risk}" if risk else ""))
            assert r.status_code == 200
            got = [(c["id"], c["amount_mxn"]) for c in r.json()["data"]]
            assert got == [(o["id"], o["amount_mxn"] or 0) for o in oracle]


def test_institution_contracts_by_date_matches_full_sort(client, base_url):
    # Default dossier sort. 1 = one raw id; 312 / 225 = canonical groups of 2 / 3 raw ids
    # (small, so the oracle's full sort stays quick on a cold local disk).
    per_page = 20
    with _ro() as conn:
        for inst in (1, 312, 225):
            ids = group_ids(conn, canonical_id(conn, inst))
            for order, tie in (("desc", "ASC"), ("asc", "DESC")):
                for risk in (None, "high"):
                    for page in (1, 3):
                        extra, params = ("AND risk_level = ?", [risk]) if risk else ("", [])
                        oracle = conn.execute(
                            f"SELECT id, contract_date FROM contracts WHERE institution_id IN ({','.join('?' * len(ids))}) "
                            f"AND COALESCE(amount_mxn, 0) <= 100000000000 {extra} "
                            f"ORDER BY contract_date {order} NULLS LAST, rowid {tie} LIMIT ? OFFSET ?",
                            [*ids, *params, per_page, (page - 1) * per_page],
                        ).fetchall()
                        q = f"{base_url}/institutions/{inst}/contracts?sort_order={order}&page={page}&per_page={per_page}"
                        r = client.get(q + (f"&risk_level={risk}" if risk else ""))
                        assert r.status_code == 200
                        got = [(c["id"], c["contract_date"]) for c in r.json()["data"]]
                        assert got == [tuple(o) for o in oracle], (inst, order, risk, page)


_OLD_CO_BIDDERS = """
WITH target_procedures AS (SELECT DISTINCT procedure_number FROM contracts
  WHERE vendor_id = ? AND procedure_number IS NOT NULL AND procedure_number != ''),
co_bids AS (SELECT c.vendor_id as co_vendor_id, c.procedure_number,
  c.vendor_id = (SELECT vendor_id FROM contracts c2 WHERE c2.procedure_number = c.procedure_number
                 ORDER BY c2.amount_mxn DESC LIMIT 1) as is_winner
  FROM contracts c JOIN vendors v ON c.vendor_id = v.id
  WHERE c.procedure_number IN (SELECT procedure_number FROM target_procedures) AND c.vendor_id != ?)
SELECT co_vendor_id, COUNT(DISTINCT procedure_number) as n, SUM(CASE WHEN is_winner THEN 1 ELSE 0 END) as wins
FROM co_bids GROUP BY co_vendor_id HAVING n >= ? ORDER BY n DESC, co_vendor_id"""


def test_co_bidders_matches_correlated_winner(client, base_url):
    vendor, min_proc = 29277, 1
    with _ro() as conn:
        oracle = {r[0]: (r[1], r[2]) for r in conn.execute(_OLD_CO_BIDDERS, (vendor, vendor, min_proc))}
    r = client.get(f"{base_url}/network/co-bidders/{vendor}?min_procedures={min_proc}&limit=100")
    assert r.status_code == 200
    got = r.json()["co_bidders"]
    assert len(got) == min(100, len(oracle)) > 0
    for cb in got:
        assert (cb["co_bid_count"], cb["win_count"]) == oracle[cb["vendor_id"]]
    # ranked by shared procedures, as before
    assert [cb["co_bid_count"] for cb in got] == sorted((cb["co_bid_count"] for cb in got), reverse=True)


def test_contracts_sector_year_amount_matches_full_sort(client, base_url):
    # ContractCard's «near this amount» query: sector + DA + year + amount band, by amount
    p = dict(sector_id=1, year=2023, is_direct_award=0, min_amount=1_900_000.0, max_amount=17_000_000.0)
    with _ro() as conn:
        where = ("sector_id = ? AND contract_year = ? AND is_direct_award = ? "
                 "AND amount_mxn >= ? AND amount_mxn <= ?")
        total = conn.execute(f"SELECT COUNT(*) FROM contracts WHERE {where}", tuple(p.values())).fetchone()[0]
        oracle = [tuple(r) for r in conn.execute(
            f"SELECT id, amount_mxn FROM contracts NOT INDEXED WHERE {where} ORDER BY amount_mxn DESC LIMIT 25",
            tuple(p.values()))]
    r = client.get(f"{base_url}/contracts", params={**p, "is_direct_award": "false", "per_page": 25,
                                                    "sort_by": "amount_mxn", "sort_order": "desc"})
    assert r.status_code == 200
    body = r.json()
    assert body["pagination"]["total"] == total
    assert [(c["id"], c["amount_mxn"]) for c in body["data"]] == oracle
