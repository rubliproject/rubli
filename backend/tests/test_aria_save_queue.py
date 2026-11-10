"""aria_pipeline.save_queue must not wipe review columns across a run (fixture DB only)."""
import sqlite3

import pytest

from scripts.aria_init_schema import DDL_STATEMENTS
from scripts.aria_pipeline import save_queue

pytestmark = pytest.mark.no_db

EXTRA_COLS = {  # added by later scripts via ALTER TABLE, as on the real DB
    "memo_provenance": "VARCHAR(20)",
    "memo_status": "VARCHAR(20)",
    "web_evidence_score": "REAL",
    "web_evidence_verdict": "TEXT",
    "gt_overlay": "INTEGER",
    "new_vendor_risk": "INTEGER DEFAULT 0",
}


def _row(vid, tier):
    return {"vendor_id": vid, "vendor_name": f"V{vid}", "aria_run_id": "new",
            "ips_final": 1.0 / tier, "ips_tier": tier, "in_ground_truth": 0}


def test_save_queue_preserves_review_columns():
    conn = sqlite3.connect(":memory:")
    for ddl in DDL_STATEMENTS:
        conn.execute(ddl)
    for col, defn in EXTRA_COLS.items():
        conn.execute(f"ALTER TABLE aria_queue ADD COLUMN {col} {defn}")
    conn.executemany(
        "INSERT INTO aria_queue (vendor_id, vendor_name, aria_run_id, ips_tier, memo_text, "
        "review_status, memo_status, memo_provenance, web_evidence_score, web_evidence_verdict, "
        "gt_overlay, new_vendor_risk) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [(1, "V1", "old", 3, "memo one", "reviewed", "hold", "llm", 0.7, "corroborated", 1, 1),
         (2, "V2", "old", 4, None, "pending", "auto", "template", None, None, None, 0),
         (3, "V3", "old", 2, "memo three", "pending", "hold", "llm", None, None, None, 0)],
    )

    save_queue(conn, [_row(1, 1), _row(2, 2), _row(4, 3)])  # vendor 3 drops out, 4 is new

    got = {r[0]: r[1:] for r in conn.execute(
        "SELECT vendor_id, ips_tier, aria_run_id, memo_text, review_status, memo_status, "
        "memo_provenance, web_evidence_score, web_evidence_verdict, gt_overlay, new_vendor_risk "
        "FROM aria_queue")}
    assert set(got) == {1, 2, 4}
    assert got[1] == (1, "new", "memo one", "reviewed", "hold", "llm", 0.7, "corroborated", 1, 1)
    assert got[2] == (2, "new", None, "pending", "auto", "template", None, None, None, 0)
    assert got[4][:2] == (3, "new") and got[4][4] is None  # defaults for a new vendor

    # A second identical run is a no-op for review state.
    save_queue(conn, [_row(1, 1), _row(2, 2), _row(4, 3)])
    assert conn.execute("SELECT memo_status FROM aria_queue WHERE vendor_id=1").fetchone() == ("hold",)


def test_save_queue_carries_absorbed_memos_to_canonical():
    conn = sqlite3.connect(":memory:")
    for ddl in DDL_STATEMENTS:
        conn.execute(ddl)
    for col, defn in EXTRA_COLS.items():
        conn.execute(f"ALTER TABLE aria_queue ADD COLUMN {col} {defn}")
    conn.execute("CREATE TABLE vendor_canonical (vendor_id INTEGER, canonical_id INTEGER)")
    # 11 -> 10 (canonical has no memo), 21 -> 20 (canonical keeps its own memo)
    conn.executemany("INSERT INTO vendor_canonical VALUES (?,?)",
                     [(10, 10), (11, 10), (20, 20), (21, 20)])
    conn.executemany(
        "INSERT INTO aria_queue (vendor_id, vendor_name, aria_run_id, memo_text, memo_status) "
        "VALUES (?,?,?,?,?)",
        [(10, "V10", "old", None, None), (11, "V11", "old", "absorbed memo", "hold"),
         (20, "V20", "old", "own memo", "auto"), (21, "V21", "old", "other memo", "hold")],
    )

    save_queue(conn, [_row(10, 2), _row(20, 2)])  # absorbed 11, 21 leave the run

    got = dict((r[0], r[1:]) for r in conn.execute(
        "SELECT vendor_id, memo_text, memo_status FROM aria_queue"))
    assert got == {10: ("absorbed memo", "hold"), 20: ("own memo", "auto")}


def test_efos_name_fallback_skips_excluded_homonyms():
    from scripts.aria_pipeline import EFOS_NAME_MATCH_EXCLUDED, load_external_crossref
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE vendors (id INTEGER, rfc TEXT, name TEXT);
        CREATE TABLE sat_efos_vendors (rfc TEXT, company_name TEXT, stage TEXT);
        CREATE TABLE sfp_sanctions (rfc TEXT, company_name TEXT, x TEXT, sanction_type TEXT);
        CREATE TABLE ground_truth_vendors (vendor_id INTEGER, case_id INTEGER,
            is_false_positive INTEGER, match_method TEXT);
        CREATE TABLE ground_truth_cases (id INTEGER, provenance_tier TEXT);
        CREATE TABLE procurement_scandals (ground_truth_case_id INTEGER, is_verified INTEGER);
    """)
    excluded = min(EFOS_NAME_MATCH_EXCLUDED)
    conn.executemany("INSERT INTO vendors VALUES (?,?,?)",
                     [(excluded, None, "HOMONYM SA"), (1, None, "GHOST SA")])
    conn.executemany("INSERT INTO sat_efos_vendors VALUES (?,?,?)",
                     [("AAA010101AAA", "HOMONYM SA", "definitivo"),
                      ("BBB010101BBB", "GHOST SA", "definitivo")])
    ext = load_external_crossref(conn)
    assert ext[1]["is_efos"] == 1
    assert ext[excluded]["is_efos"] == 0
