"""B-01 (docs: _security/backend.md): closed registration, case-normalized
emails, admin decided from the stored user row — never from the token claim.
"""
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import jwt

from api import dependencies as deps
from api.dependencies import get_db
from api.middleware.auth_jwt import JWT_ALGORITHM, JWT_SECRET

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REVIEW = "/api/v1/aria/queue/48/review"
BAD_REVIEW = {"status": "__guard_probe__"}  # 400 after the guard, never written


def _bearer(user_id: int, email: str) -> dict:
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    tok = jwt.encode({"sub": str(user_id), "email": email, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _uniq() -> str:
    return uuid.uuid4().hex[:8]


@pytest.fixture
def prod_guards(monkeypatch):
    monkeypatch.setattr(deps, "WRITE_API_KEY", "testkey")
    monkeypatch.setattr(deps, "_IS_DEV", False)


def test_register_closed_by_default(client, monkeypatch):
    monkeypatch.delenv("RUBLI_ALLOW_REGISTER", raising=False)
    r = client.post(REGISTER, json={"email": f"x_{_uniq()}@example.com", "password": "Passw0rd!", "name": "X"})
    assert r.status_code == 403


def test_register_lowercases_and_login_is_case_insensitive(client, monkeypatch):
    monkeypatch.setenv("RUBLI_ALLOW_REGISTER", "1")
    local = f"Mixed_{_uniq()}"
    r = client.post(REGISTER, json={"email": f"{local}@Example.com", "password": "Passw0rd!", "name": "M"})
    assert r.status_code == 201
    assert r.json()["user"]["email"] == f"{local.lower()}@example.com"
    r = client.post(LOGIN, json={"email": f"{local.upper()}@EXAMPLE.com", "password": "Passw0rd!"})
    assert r.status_code == 200


def test_register_case_variant_of_existing_email_conflicts(client, monkeypatch):
    monkeypatch.setenv("RUBLI_ALLOW_REGISTER", "1")
    email = f"owner_{_uniq()}@example.org"
    assert client.post(REGISTER, json={"email": email, "password": "Passw0rd!", "name": "O"}).status_code == 201
    r = client.post(REGISTER, json={"email": email.upper(), "password": "Passw0rd!", "name": "A"})
    assert r.status_code == 409


def test_case_variant_row_is_not_admin(client, prod_guards, monkeypatch):
    """A legacy/attacker row whose email only case-matches the allow-list is not admin,
    even when its own token carries the allow-listed email claim."""
    owner = f"owner_{_uniq()}@example.org"
    monkeypatch.setattr(deps, "ADMIN_EMAILS", frozenset({owner}))
    with get_db() as conn:
        conn.execute("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'Owner')", (owner,))
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'Attacker')", (owner.upper(),)
        )
        conn.commit()
        attacker_id = cur.lastrowid
    assert client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(attacker_id, owner.upper())).status_code == 403
    assert client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(attacker_id, owner)).status_code == 403


def test_forged_email_claim_on_non_admin_row_rejected(client, prod_guards, monkeypatch):
    owner = f"owner_{_uniq()}@example.org"
    monkeypatch.setattr(deps, "ADMIN_EMAILS", frozenset({owner}))
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'Other')", (f"other_{_uniq()}@example.org",)
        )
        conn.commit()
        uid = cur.lastrowid
    assert client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(uid, owner)).status_code == 403


# ── migration: unique index on lower(email) ─────────────────────────────────

@pytest.mark.no_db
def test_email_ci_migration_idempotent_and_blocks_duplicates(tmp_path):
    from scripts.migrate_users_email_ci import migrate

    db = tmp_path / "u.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL)")
    conn.executemany("INSERT INTO users (email) VALUES (?)", [("A@x.org",), ("A@X.ORG",), ("b@x.org",)])
    conn.commit()

    assert migrate(conn) == [[1, 2]]  # refuses, reports colliding ids only
    assert conn.execute("SELECT email FROM users WHERE id = 1").fetchone()[0] == "A@x.org"

    conn.execute("DELETE FROM users WHERE id = 2")
    conn.commit()
    assert migrate(conn) == []
    assert migrate(conn) == []  # idempotent
    assert conn.execute("SELECT email FROM users WHERE id = 1").fetchone()[0] == "a@x.org"
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO users (email) VALUES ('B@X.org')")


# ── B-03: watchlist + folders are the owner's workspace (admin-only) ───────

WORKSPACE_PROBES = [
    ("get", "/api/v1/watchlist", None),
    ("get", "/api/v1/watchlist/stats", None),
    ("get", "/api/v1/watchlist/alerts/check", None),
    ("get", "/api/v1/watchlist/9999999", None),
    ("get", "/api/v1/watchlist/9999999/changes", None),
    ("post", "/api/v1/watchlist", {"item_type": "__probe__"}),
    ("patch", "/api/v1/watchlist/9999999", {"status": "resolved"}),
    ("delete", "/api/v1/watchlist/9999999", None),
    ("get", "/api/v1/watchlist/folders", None),
    ("post", "/api/v1/watchlist/folders", {}),
    ("put", "/api/v1/watchlist/folders/9999999", {}),
    ("delete", "/api/v1/watchlist/folders/9999999", None),
    ("get", "/api/v1/watchlist/folders/export/9999999", None),
]


@pytest.fixture
def two_users(prod_guards, monkeypatch):
    owner, other = f"owner_{_uniq()}@example.org", f"other_{_uniq()}@example.org"
    monkeypatch.setattr(deps, "ADMIN_EMAILS", frozenset({owner}))
    with get_db() as conn:
        ids = [
            conn.execute("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', 'U')", (e,)).lastrowid
            for e in (owner, other)
        ]
        conn.commit()
    return (ids[0], owner), (ids[1], other)


@pytest.mark.parametrize("method,url,body", WORKSPACE_PROBES)
def test_workspace_denies_non_admin_user(client, two_users, method, url, body):
    _, (uid, email) = two_users
    kw = {"json": body} if body is not None else {}
    assert getattr(client, method)(url, headers=_bearer(uid, email), **kw).status_code == 403


@pytest.mark.parametrize("method,url,body", WORKSPACE_PROBES)
def test_workspace_admin_passes_guard(client, two_users, method, url, body):
    (uid, email), _ = two_users
    kw = {"json": body} if body is not None else {}
    assert getattr(client, method)(url, headers=_bearer(uid, email), **kw).status_code not in (401, 403)


def test_feedback_rejects_deactivated_user(client, two_users):
    _, (uid, email) = two_users
    with get_db() as conn:
        conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (uid,))
        conn.commit()
    body = {"entity_type": "__guard_probe__", "entity_id": 48, "feedback_type": "needs_review"}
    assert client.post("/api/v1/feedback", json=body, headers=_bearer(uid, email)).status_code == 401


# ── B-07: the paid-LLM explain route is admin-only ─────────────────────────

def test_ai_explain_needs_admin(client, two_users):
    _, (uid, email) = two_users
    assert client.get("/api/v1/ai/contracts/1/explain").status_code == 401
    assert client.get("/api/v1/ai/contracts/1/explain", headers=_bearer(uid, email)).status_code == 403


# ── deps D-1: python-jose (unmaintained, HMAC key confusion) is gone ───────

def test_jwt_stack_does_not_load_python_jose():
    import sys

    import api.main  # noqa: F401 — loads every router + the auth gate
    assert "jose" not in sys.modules


def test_alg_none_token_rejected(client, two_users):
    (uid, email), _ = two_users
    forged = jwt.encode({"sub": str(uid), "email": email}, key=None, algorithm="none")
    r = client.patch(REVIEW, json=BAD_REVIEW, headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401
