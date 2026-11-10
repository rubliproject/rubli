"""DQ1 § 3 — fold vendor_ids that share one well-formed COMPANY RFC into one canonical vendor.

Audit (prod 2026-10-31): 690 RFCs sit on two vendor_ids, 466 involving a ComprasMX vendor.
Mechanism: `vendor_canonical` (scripts/migrate_vendors.py) — no vendor row and no contract is
deleted or rewritten; precomputes aggregate by canonical id (scripts/_vendor_canonical.py).

Rules
  * only 12-char persona-moral RFCs (resolve_comprasmx_vendors.CO); a persona física is never merged
  * skip an RFC when a member's own grade-A RFC (vendor_rfc_quality) is a different one — the raw RFC
    is then a typo, not identity (CAF 28815 / Provectus 165033 rule of the ComprasMX resolver)
  * skip RFCs shared by > MAX_GROUP canonical vendors (placeholder / generic RFC) — reported
  * skip when vendor_rfc_quality.db_rfc_reason = 'name_inconsistent' for any member, or the RFC's
    incorporation date is after a member's first contract year (a mistyped / borrowed RFC — Provectus
    PME190416TS6 contracting since before 2019)
  * skip when the names disagree (loose-key similarity < MIN_NAME_SIM between any member and the
    first): a rename or a mistyped RFC — left for an analyst, listed with --examples
  * components are transitive over existing canonical groups; survivor = most contracts
    (vendor_stats.total_contracts), ties → lowest id
Reversible: touched rows of vendor_canonical go to `dq1_vendor_canonical_backup`.

  python -m scripts.dq1_rfc_merge --db X [--examples 10]     # dry run
  python -m scripts.dq1_rfc_merge --db X --apply
  python -m scripts.dq1_rfc_merge --db X --rollback
then: python -m scripts._refresh_stats_tables --vendors-only --db X
"""
from __future__ import annotations

import argparse
import sqlite3
from datetime import date
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from difflib import SequenceMatcher  # noqa: E402

from scripts.resolve_comprasmx_vendors import CO, loose_key, rfc_year  # noqa: E402

MAX_GROUP = 4
# Hard denylist (review 2026-11-02): these ids are two different taxpayers sharing a borrowed RFC
# (Provectus PME190416TS6 — 165033 contracting since 2015, RFC dated 2019). Never in one group.
NEVER_TOGETHER = [frozenset({165033, 245667})]
RFC_YEAR_FLOOR = 1900          # an RFC date before this (or after today) is not a date: skip the group
DATA_FIRST_YEAR = 2002         # contract years before the data start are typos, not history
MIN_NAME_SIM = 0.5  # same bar as the ComprasMX resolver's weak-RFC rule
BACKUP = "dq1_vendor_canonical_backup"


def _has(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE name = ?", (name,)).fetchone() is not None


def plan(conn):
    vc = {v: (c, n, b) for v, c, n, b in conn.execute(
        "SELECT vendor_id, canonical_id, group_size, match_basis FROM vendor_canonical")}
    canon = lambda v: vc[v][0] if v in vc else v  # noqa: E731
    own_a = dict(conn.execute("SELECT vendor_id, UPPER(TRIM(best_rfc)) FROM vendor_rfc_quality "
                              "WHERE best_rfc_grade = 'A' AND best_rfc IS NOT NULL")) \
        if _has(conn, "vendor_rfc_quality") else {}
    by_rfc: dict[str, set[int]] = defaultdict(set)
    raw: dict[str, set[int]] = defaultdict(set)
    for vid, rfc in conn.execute("SELECT id, UPPER(TRIM(rfc)) FROM vendors WHERE rfc IS NOT NULL AND LENGTH(TRIM(rfc)) = 12"):
        if CO.match(rfc or ""):
            raw[rfc].add(vid)
            by_rfc[rfc].add(canon(vid))
    names = dict(conn.execute("SELECT id, name FROM vendors WHERE id IN (SELECT id FROM vendors WHERE rfc IS NOT NULL "
                              "AND LENGTH(TRIM(rfc)) = 12)"))
    sim = lambda a, b: SequenceMatcher(None, loose_key(a), loose_key(b)).ratio()  # noqa: E731
    skipped = {"contradicted_by_grade_a": 0, "too_many_ids": 0, "name_mismatch": 0,
               "name_inconsistent": 0, "rfc_after_first_contract": 0, "rfc_date_implausible": 0,
               "denylisted": 0}
    cols = {r[1] for r in conn.execute("PRAGMA table_info(vendor_rfc_quality)")} if _has(conn, "vendor_rfc_quality") else set()
    inconsistent = {v for (v,) in conn.execute(
        "SELECT vendor_id FROM vendor_rfc_quality WHERE db_rfc_reason = 'name_inconsistent'")} if "db_rfc_reason" in cols else set()
    mismatched = []
    edges = []
    for rfc, cids in by_rfc.items():
        if len(cids) < 2:
            continue
        if any(own_a.get(v, rfc) != rfc for v in raw[rfc]):
            skipped["contradicted_by_grade_a"] += 1
            continue
        if len(cids) > MAX_GROUP:
            skipped["too_many_ids"] += 1
            continue
        ids = sorted(raw[rfc])
        if any(bad <= set(ids) | set(cids) for bad in NEVER_TOGETHER):
            skipped["denylisted"] += 1
            continue
        if any(v in inconsistent for v in ids):
            skipped["name_inconsistent"] += 1
            continue
        y, unusable = rfc_year(rfc)
        if not unusable and y is not None and not (RFC_YEAR_FLOOR <= y <= date.today().year):
            skipped["rfc_date_implausible"] += 1
            continue
        if not unusable and y is not None:
            ph = ",".join("?" * len(ids))
            first = conn.execute(f"SELECT MIN(contract_year) FROM contracts WHERE vendor_id IN ({ph}) "
                                 f"AND contract_year >= {DATA_FIRST_YEAR}", ids).fetchone()[0]
            if first is not None and y > first:
                skipped["rfc_after_first_contract"] += 1
                continue
        if any(sim(names.get(ids[0]), names.get(v)) < MIN_NAME_SIM for v in ids[1:]):
            skipped["name_mismatch"] += 1
            mismatched.append((rfc, sorted(cids)))
            continue
        edges.append((rfc, sorted(cids)))
    # union-find over canonical ids
    parent: dict[int, int] = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for _, cids in edges:
        for c in cids[1:]:
            parent[find(c)] = find(cids[0])
    comps: dict[int, set[int]] = defaultdict(set)
    for c in list(parent):
        comps[find(c)].add(c)
    size = dict(conn.execute("SELECT vendor_id, total_contracts FROM vendor_stats")) if _has(conn, "vendor_stats") else {}
    members_of: dict[int, set[int]] = defaultdict(set)
    for v, (c, _, _) in vc.items():
        members_of[c].add(v)
    new_rows = {}
    groups = []
    member_sets = []
    for cids in comps.values():
        surv = max(cids, key=lambda c: (size.get(c) or 0, -c))
        members = set(cids)
        for c in cids:
            members |= members_of.get(c, set())
        for v in members:
            old = vc.get(v)
            basis = "rfc" if old is None or old[0] != surv else old[2]
            new_rows[v] = (surv, len(members), basis)
        groups.append((surv, sorted(cids)))
        member_sets.append((surv, members))
    watch = set().union(*NEVER_TOGETHER)
    flagged = [(surv, sorted(m)) for surv, m in member_sets if m & watch]
    for bad in NEVER_TOGETHER:
        for surv, m in member_sets:
            assert not bad <= m, f"denylisted ids {sorted(bad)} would merge into {surv}"
    return {"rfcs": len(edges), "groups": groups, "watch": flagged, "rows": new_rows, "old": vc, "skipped": skipped,
            "edges": edges, "mismatched": mismatched}


def apply(conn, p):
    with conn:
        conn.execute(f"""CREATE TABLE IF NOT EXISTS {BACKUP} (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER,
            group_size INTEGER, match_basis TEXT, existed INTEGER NOT NULL, merged_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        old = p["old"]
        conn.executemany(f"INSERT OR IGNORE INTO {BACKUP} (vendor_id, canonical_id, group_size, match_basis, existed) "
                         "VALUES (?,?,?,?,?)",
                         [(v, *(old[v] if v in old else (None, None, None)), int(v in old)) for v in p["rows"]])
        conn.executemany("INSERT OR REPLACE INTO vendor_canonical (vendor_id, canonical_id, group_size, match_basis) "
                         "VALUES (?,?,?,?)", [(v, *r) for v, r in p["rows"].items()])
    return len(p["rows"])


def rollback(conn):
    if not _has(conn, BACKUP):  # never applied (or already rolled back) → clean no-op
        return 0
    with conn:
        conn.execute(f"DELETE FROM vendor_canonical WHERE vendor_id IN (SELECT vendor_id FROM {BACKUP} WHERE existed = 0)")
        conn.execute(f"""INSERT OR REPLACE INTO vendor_canonical (vendor_id, canonical_id, group_size, match_basis)
            SELECT vendor_id, canonical_id, group_size, match_basis FROM {BACKUP} WHERE existed = 1""")
        n = conn.execute(f"SELECT COUNT(*) FROM {BACKUP}").fetchone()[0]
        conn.execute(f"DROP TABLE {BACKUP}")
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--examples", type=int, default=10)
    a = ap.parse_args()
    conn = (sqlite3.connect(a.db, timeout=600) if a.apply or a.rollback
            else sqlite3.connect(f"file:{a.db}?mode=ro", uri=True))
    if a.rollback:
        n = rollback(conn)
        print(f"restored {n:,} vendor_canonical rows" if n else "nothing to roll back")
        return
    p = plan(conn)
    e_ids = {v for (v,) in conn.execute("SELECT DISTINCT vendor_id FROM contracts WHERE source_structure = 'E'")}
    with_e = sum(1 for _, cids in p["edges"] if any(c in e_ids for c in cids))
    print(f"split company RFCs merged {p['rfcs']:,} (involving a ComprasMX vendor {with_e:,}) · groups {len(p['groups']):,} "
          f"· vendor_canonical rows written {len(p['rows']):,} · skipped {p['skipped']}")
    for rfc, cids in p["edges"][:a.examples]:
        names = [conn.execute("SELECT id, name FROM vendors WHERE id = ?", (c,)).fetchone() for c in cids]
        print(f"  {rfc}: " + " | ".join(f"{i} {n}" for i, n in names))
    # runbook check: this line must say «none» — 165033 / 245667 (Provectus) must never be in a group
    print(f"  denylist watch (165033 / 245667 in a merge group): {p['watch'] or 'none'}")
    print("  name mismatch (not merged, for review):")
    for rfc, cids in p["mismatched"][:a.examples]:
        names = [conn.execute("SELECT id, name FROM vendors WHERE id = ?", (c,)).fetchone() for c in cids]
        print(f"    {rfc}: " + " | ".join(f"{i} {n}" for i, n in names))
    if a.apply:
        print(f"applied {apply(conn, p):,} rows (backup {BACKUP})")


if __name__ == "__main__":
    main()
