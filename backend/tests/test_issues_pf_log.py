"""Persona física correction/opposition requests form a private log (docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md § 5 #13)."""
import contextlib
import sqlite3

import pytest

from api.routers import issues

pytestmark = pytest.mark.no_db  # temp DB only


@pytest.fixture
def conn(monkeypatch):
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    # an older table without answered_at, as on prod before this change
    c.execute("""CREATE TABLE user_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL DEFAULT 'other',
                 subject TEXT NOT NULL, description TEXT NOT NULL, page_url TEXT, email TEXT,
                 status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    monkeypatch.setattr(issues, "_table_ready", False)
    monkeypatch.setattr(issues, "get_db", lambda: contextlib.nullcontext(c))
    return c


def test_correction_request_logged_with_timestamp_and_status(conn):
    out = issues.submit_issue(issues.IssueIn(
        category="correccion_persona_fisica", subject="Corrección u oposición — proveedor #105407",
        description="No soy esta persona.", page_url="/vendors/105407"))
    assert out["category"] == "correccion_persona_fisica"
    assert out["status"] == "open" and out["created_at"] and out["answered_at"] is None

    # in_progress does not close it; answered stamps answered_at once
    assert issues.update_issue_status(out["id"], "in_progress")["answered_at"] is None
    answered = issues.update_issue_status(out["id"], "answered")
    assert answered["status"] == "answered" and answered["answered_at"]
    conn.execute("UPDATE user_issues SET answered_at = '2026-01-01 00:00:00' WHERE id = ?", (out["id"],))
    assert issues.update_issue_status(out["id"], "resolved")["answered_at"] == "2026-01-01 00:00:00"


def test_dispute_category_accepted(conn):
    # the dialog's «Impugnar un hallazgo» sends data_correction; it used to 400
    assert issues.submit_issue(issues.IssueIn(category="data_correction", subject="s", description="d"))["id"]


def test_log_is_admin_only():
    from api.dependencies import require_admin
    route = next(r for r in issues.router.routes if r.path == "/issues" and "GET" in r.methods)
    assert any(d.call is require_admin for d in route.dependant.dependencies)
