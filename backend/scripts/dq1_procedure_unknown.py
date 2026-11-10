"""DQ1 § 2 — structure A (2002–2010) has no procedure-type information: direct award / single bid are
UNKNOWN there, not 0 / 1.

Audit (prod 2026-10-31): is_direct_award = 0 on all 394,861 A rows, so the single-bid rule (competitive
procedure + 1 vendor, data-validation.md) flagged 131,099 A contracts (33 %) — real direct awards among
them — and every single-bid / direct-award share for 2002–2010 is fiction.

Fix: is_direct_award and is_single_bid → NULL on every structure-A row (its procedure_type is the
constant «Licitación Pública» on all 394,861 rows — a placeholder, not a coded type). Stats SQL uses known-status denominators
(COUNT(col)), so unknown rows drop out instead of counting as 0. The single-bid UPDATE
(`WHERE is_direct_award = 0`) can no longer re-flag them.

Model: v0.9.2 reads is_single_bid / is_direct_award through _v10/build_v10.py. The live scores read the
STORED contract_features_v10, so nothing changes now. For a rebuild to reproduce the same inputs, the old
values are kept in `contracts_procedure_unknown_dq1` and build_v10 COALESCEs from it (direct award was 0 →
fillna(0) gives the same 0 anyway). Next retrain: decide to treat these as missing (see DQ1 report).

  python -m scripts.dq1_procedure_unknown --db X            # dry run
  python -m scripts.dq1_procedure_unknown --db X --apply
  python -m scripts.dq1_procedure_unknown --db X --rollback
"""
from __future__ import annotations

import argparse
import sqlite3

SIDE = "contracts_procedure_unknown_dq1"
# Every A row carries the same procedure_type «Licitación Pública» (394,861 / 394,861 on the prod copy):
# a file-level constant, not information — real direct awards are among them.
UNKNOWN = "source_structure = 'A'"


def counts(conn):
    return conn.execute(f"""SELECT COUNT(*), SUM(is_single_bid = 1), SUM(is_direct_award = 1),
        SUM(is_direct_award IS NULL) FROM contracts WHERE {UNKNOWN}""").fetchone()


def apply(conn):
    with conn:
        conn.execute(f"""CREATE TABLE IF NOT EXISTS {SIDE} (id INTEGER PRIMARY KEY, is_direct_award INTEGER,
            is_single_bid INTEGER)""")
        conn.execute(f"""INSERT OR IGNORE INTO {SIDE} (id, is_direct_award, is_single_bid)
            SELECT id, is_direct_award, is_single_bid FROM contracts
            WHERE {UNKNOWN} AND (is_direct_award IS NOT NULL OR is_single_bid IS NOT NULL)""")
        n = conn.execute(f"""UPDATE contracts SET is_direct_award = NULL, is_single_bid = NULL
            WHERE {UNKNOWN} AND (is_direct_award IS NOT NULL OR is_single_bid IS NOT NULL)""").rowcount
    return n


def rollback(conn):
    with conn:
        n = conn.execute(f"""UPDATE contracts SET
              is_direct_award = (SELECT s.is_direct_award FROM {SIDE} s WHERE s.id = contracts.id),
              is_single_bid   = (SELECT s.is_single_bid   FROM {SIDE} s WHERE s.id = contracts.id)
            WHERE id IN (SELECT id FROM {SIDE})""").rowcount
        conn.execute(f"DROP TABLE {SIDE}")
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    a = ap.parse_args()
    conn = (sqlite3.connect(a.db, timeout=600) if a.apply or a.rollback
            else sqlite3.connect(f"file:{a.db}?mode=ro", uri=True))
    if a.rollback:
        print(f"restored {rollback(conn):,} rows")
        return
    n, sb, da, null_da = counts(conn)
    print(f"procedure-type-unknown rows {n:,} · single-bid flagged now {sb or 0:,} · direct award = 1 now {da or 0:,} "
          f"· already NULL {null_da or 0:,}")
    if a.apply:
        print(f"set to unknown: {apply(conn):,} rows (old values in {SIDE})")


if __name__ == "__main__":
    main()
