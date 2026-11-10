"""Precompute the institution dossier's category lens («La Anatomía» § II).

Three NEW tables (institution_category_stats is left untouched — it belongs to
the taxonomy chain):

  institution_category_signals    per (institution, category): the counts
                                  behind each pillar lens that
                                  institution_category_stats does not carry —
                                  competitive / single-bid / year-end — plus
                                  the top-1 vendor's value (Independence lens).
  category_signal_baseline        the same counts per category, all
                                  institutions — the national baseline the
                                  dossier draws as the hollow ring.
  institution_category_vendor_topn top 8 vendors (by value) per
                                  (institution, category) — the zoom panel.

One pass over contracts_canon (canonical institution + vendor ids) into a TEMP
(institution, category, vendor) aggregate; the three tables derive from it.
Amounts above MAX_CONTRACT_VALUE (100B MXN, data errors) are excluded. High
risk = risk_level IN ('high','critical'), matching institution_category_stats.
No RFC column anywhere (PII rule).

Idempotent: DROP + CREATE + INSERT in one transaction.

    cd backend && python -m scripts.precompute_institution_lens [db_path]

Spec: .claude/designus/institutions-uipro-2026-10-07/proposals/dossier-grade.md § 7 (B, C).
"""
import sqlite3
import sys
import time
try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN — reject above (data-validation rule)
TOP_N = 8

AGG = """
CREATE TEMP TABLE _icv AS
SELECT c.institution_id, c.category_id, c.vendor_id,
       COUNT(*)                                                        AS n,
       SUM(COALESCE(c.amount_mxn, 0))                                  AS value,
       SUM(CASE WHEN c.is_direct_award = 1 THEN 1 ELSE 0 END)          AS da,
       SUM(CASE WHEN c.is_direct_award = 0 THEN 1 ELSE 0 END)          AS comp,
       SUM(CASE WHEN c.is_direct_award = 0 AND c.is_single_bid = 1 THEN 1 ELSE 0 END) AS sb,
       SUM(CASE WHEN c.is_year_end = 1 THEN 1 ELSE 0 END)              AS ye,
       SUM(CASE WHEN c.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) AS hr
FROM contracts_canon c
WHERE c.institution_id IS NOT NULL
  AND c.category_id IS NOT NULL
  AND COALESCE(c.amount_mxn, 0) <= ?
GROUP BY c.institution_id, c.category_id, c.vendor_id
"""

DDL = """
DROP TABLE IF EXISTS institution_category_signals;
CREATE TABLE institution_category_signals (
    institution_id    INTEGER NOT NULL,
    category_id       INTEGER NOT NULL,
    contract_count    INTEGER NOT NULL,
    total_value_mxn   REAL    NOT NULL,
    da_count          INTEGER NOT NULL,
    competitive_count INTEGER NOT NULL,
    sb_count          INTEGER NOT NULL,
    ye_count          INTEGER NOT NULL,
    hr_count          INTEGER NOT NULL,
    vendor_count      INTEGER NOT NULL,
    top1_vendor_id    INTEGER,
    top1_value_mxn    REAL,
    computed_at       TEXT    NOT NULL,
    PRIMARY KEY (institution_id, category_id)
);
DROP TABLE IF EXISTS category_signal_baseline;
CREATE TABLE category_signal_baseline (
    category_id       INTEGER PRIMARY KEY,
    contract_count    INTEGER NOT NULL,
    total_value_mxn   REAL    NOT NULL,
    da_count          INTEGER NOT NULL,
    competitive_count INTEGER NOT NULL,
    sb_count          INTEGER NOT NULL,
    ye_count          INTEGER NOT NULL,
    hr_count          INTEGER NOT NULL,
    computed_at       TEXT    NOT NULL
);
DROP TABLE IF EXISTS institution_category_vendor_topn;
CREATE TABLE institution_category_vendor_topn (
    institution_id  INTEGER NOT NULL,
    category_id     INTEGER NOT NULL,
    rank            INTEGER NOT NULL,
    vendor_id       INTEGER,
    contract_count  INTEGER NOT NULL,
    total_value_mxn REAL    NOT NULL,
    da_count        INTEGER NOT NULL,
    sb_count        INTEGER NOT NULL,
    hr_count        INTEGER NOT NULL,
    computed_at     TEXT    NOT NULL,
    PRIMARY KEY (institution_id, category_id, rank)
);
"""

FILL_SIGNALS = """
INSERT INTO institution_category_signals
SELECT a.institution_id, a.category_id,
       SUM(a.n), SUM(a.value), SUM(a.da), SUM(a.comp), SUM(a.sb), SUM(a.ye), SUM(a.hr),
       COUNT(a.vendor_id),
       t.vendor_id, t.total_value_mxn,
       datetime('now')
FROM _icv a
LEFT JOIN institution_category_vendor_topn t
       ON t.institution_id = a.institution_id AND t.category_id = a.category_id AND t.rank = 1
GROUP BY a.institution_id, a.category_id
"""

FILL_BASELINE = """
INSERT INTO category_signal_baseline
SELECT category_id, SUM(n), SUM(value), SUM(da), SUM(comp), SUM(sb), SUM(ye), SUM(hr), datetime('now')
FROM _icv GROUP BY category_id
"""

FILL_TOPN = """
INSERT INTO institution_category_vendor_topn
SELECT institution_id, category_id, rk, vendor_id, n, value, da, sb, hr, datetime('now')
FROM (
    SELECT a.*, ROW_NUMBER() OVER (
        PARTITION BY a.institution_id, a.category_id ORDER BY a.value DESC, a.n DESC
    ) AS rk
    FROM _icv a
) WHERE rk <= ?
"""


def main(db_path: str) -> None:
    t0 = time.time()
    conn = sqlite3.connect(db_path, timeout=60)
    try:
        install_contracts_canon(conn, vendors=True)
        conn.execute(AGG, (MAX_CONTRACT_VALUE,))
        conn.execute("BEGIN")
        for stmt in [s for s in DDL.split(";") if s.strip()]:
            conn.execute(stmt)
        conn.execute(FILL_TOPN, (TOP_N,))  # signals reads rank 1 from topn
        conn.execute(FILL_SIGNALS)
        conn.execute(FILL_BASELINE)
        conn.execute("COMMIT")
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    counts = {
        t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        for t in ("institution_category_signals", "category_signal_baseline", "institution_category_vendor_topn")
    }
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    print(f"{counts} in {time.time() - t0:.1f}s -> {db_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "RUBLI_NORMALIZED.db")
