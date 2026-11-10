"""GT label fixes from docs/GT_LABEL_AUDIT_2026-10-31.md (see docs/GT_FIXES_2026-11-02.md).

Idempotent; one transaction; writes only ground_truth_* tables (+ one backup table).
Does NOT retrain, rescore or touch gt_snapshot_* tables.

  1. windows  — the L1 review wrote tightened years to year_start/year_end, but training
                reads COALESCE(fraud_year_start, year_start): copy them into fraud_year_* (20 cases).
  2. origin   — 261 «media_report» cases whose only source is ARIA -> case_origin='model_discovery'.
  3. no window— 61 cases with no window: case 365 gets its source's year; the rest get
                exclude_from_training=1 (new column; training does not read it yet).
  4. tiers    — new label_tier (A/B/C/D) on ground_truth_vendors and ground_truth_contracts.

    python -m scripts.migrate_gt_labels_honest --db <copy.db> [--dry-run]
"""
import argparse
import sqlite3

TAG = "gtfix 2026-11-02"
BACKUP = "_gtfix_20261102_backup_ground_truth_cases"

# Cases whose L1 batch-1/2 window tightening never reached fraud_year_* (audit § 4).
WINDOW_FIX_CASES = (1, 13, 14, 15, 19, 24, 36, 64, 65, 66, 67, 75, 84, 88, 104, 105, 119, 120, 478, 482)

# evidence_summary prefix written by the 2026-10-03 provenance pass for ARIA self-citations.
ARIA_SELF_CITE = "[C|auto 2026-10-03|origin=media_report] self-citation only%"

# No-window cases whose stored, independent source dates the conduct (case_id -> (start, end)).
# 365 DL Medica: MCCI 2021-03-16, federal purchase of COVID-vaccine syringes (2021).
SOURCE_WINDOWS = {365: (2021, 2021)}

# Independent source = provenance A/B and not excluded.
_INDEP = "(g.provenance_tier IN ('A','B') AND COALESCE(g.exclude_from_training,0)=0)"
_SCOPED = """(COALESCE(g.fraud_institution_ids,'') NOT IN ('','null','[]')
             OR EXISTS (SELECT 1 FROM ground_truth_institutions gi
                        WHERE gi.case_id=g.id AND gi.institution_id IS NOT NULL))"""


def _add_col(conn, table, col, decl):
    if col not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def _note(text):
    return f"label_scope_notes = trim(COALESCE(label_scope_notes,'') || ' [{TAG}] {text}')"


def fix_windows(conn):
    ids = ",".join(map(str, WINDOW_FIX_CASES))
    cur = conn.execute(f"""UPDATE ground_truth_cases
        SET fraud_year_start = year_start, fraud_year_end = year_end,
            {_note("fraud_year_* <- L1-corrected year_* (was ' || COALESCE(fraud_year_start,'NULL') || '-' || COALESCE(fraud_year_end,'NULL') || ')")}
        WHERE id IN ({ids}) AND year_start IS NOT NULL AND year_end IS NOT NULL
          AND (fraud_year_start IS NOT year_start OR fraud_year_end IS NOT year_end)""")
    return cur.rowcount


def retag_aria_origin(conn):
    cur = conn.execute(f"""UPDATE ground_truth_cases SET case_origin = 'model_discovery',
            {_note("case_origin media_report -> model_discovery (only source cites ARIA)")}
        WHERE case_origin = 'media_report' AND evidence_summary LIKE ?""", (ARIA_SELF_CITE,))
    return cur.rowcount


def handle_no_window(conn):
    _add_col(conn, "ground_truth_cases", "exclude_from_training", "INTEGER NOT NULL DEFAULT 0")
    _add_col(conn, "ground_truth_cases", "exclusion_reason", "TEXT")
    windowed = 0
    for cid, (ys, ye) in SOURCE_WINDOWS.items():
        windowed += conn.execute(f"""UPDATE ground_truth_cases
            SET year_start=?, year_end=?, fraud_year_start=?, fraud_year_end=?,
                {_note("window from stored source")}
            WHERE id=? AND year_start IS NULL AND fraud_year_start IS NULL
              AND year_end IS NULL AND fraud_year_end IS NULL""", (ys, ye, ys, ye, cid)).rowcount
    excluded = conn.execute("""UPDATE ground_truth_cases
        SET exclude_from_training = 1,
            exclusion_reason = 'no window and no stored source dating the conduct (gtfix 2026-11-02)'
        WHERE COALESCE(fraud_year_start, year_start) IS NULL
          AND COALESCE(fraud_year_end, year_end) IS NULL
          AND exclude_from_training = 0""").rowcount
    return windowed, excluded


def set_label_tiers(conn):
    """Recomputed every run (deterministic). Definitions: audit § 6 / docs/GT_FIXES_2026-11-02.md."""
    _add_col(conn, "ground_truth_vendors", "label_tier", "TEXT")
    _add_col(conn, "ground_truth_contracts", "label_tier", "TEXT")
    conn.execute(f"""UPDATE ground_truth_vendors AS v SET label_tier = (
        SELECT CASE WHEN COALESCE(v.is_false_positive,0)=1 THEN NULL
                    WHEN {_INDEP} AND {_SCOPED} THEN 'B'
                    WHEN {_INDEP} THEN 'C' ELSE 'D' END
        FROM ground_truth_cases g WHERE g.id = v.case_id)""")
    # B = independent source + contract at a buyer the case names + inside the case window.
    # fraud_institution_ids is a JSON list or (cases 1409/1423/1424) a bare comma list.
    conn.execute(f"""UPDATE ground_truth_contracts AS t SET label_tier = (
        SELECT CASE WHEN t.evidence_tier = 'direct' THEN 'A'
                    WHEN {_INDEP} AND c.id IS NOT NULL
                         AND c.contract_year BETWEEN COALESCE(g.fraud_year_start, g.year_start, 1900)
                                                 AND COALESCE(g.fraud_year_end, g.year_end, 2100)
                         AND (',' || replace(replace(replace(COALESCE(g.fraud_institution_ids,''),'[',''),']',''),' ','') || ','
                                 LIKE '%,' || c.institution_id || ',%'
                              OR EXISTS (SELECT 1 FROM ground_truth_institutions gi
                                         WHERE gi.case_id = g.id AND gi.institution_id = c.institution_id))
                    THEN 'B'
                    WHEN {_INDEP} THEN 'C' ELSE 'D' END
        FROM ground_truth_cases g LEFT JOIN contracts c ON c.id = t.contract_id
        WHERE g.id = t.case_id)""")
    return {
        t: dict(conn.execute(f"SELECT COALESCE(label_tier,'-'), count(*) FROM {t} GROUP BY 1"))
        for t in ("ground_truth_vendors", "ground_truth_contracts")
    }


def migrate(conn, dry_run=False):
    """Run all four steps in one transaction. Returns a report dict."""
    conn.isolation_level = None
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(f"CREATE TABLE IF NOT EXISTS {BACKUP} AS SELECT * FROM ground_truth_cases")
        report = {
            "windows_fixed": fix_windows(conn),
            "origin_retagged": retag_aria_origin(conn),
        }
        report["source_windowed"], report["excluded_no_window"] = handle_no_window(conn)
        report["tiers"] = set_label_tiers(conn)
        conn.execute("ROLLBACK" if dry_run else "COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--dry-run", action="store_true", help="run, report, roll back")
    a = ap.parse_args()
    print(migrate(sqlite3.connect(a.db, timeout=60), dry_run=a.dry_run))
