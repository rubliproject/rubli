"""Auth guards for analyst/admin mutations (docs/security/WRITE_KEY_FIX_2026-10-02.md § 5).

Simulates prod: a server write key is set, dev bypass is off, one allow-listed
admin email. Guard probes send deliberately invalid bodies, so a request that
passes the guard stops at validation (400/422) and the DB is never mutated.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import jwt

from api import dependencies as deps
from api.dependencies import get_db
from api.middleware.auth_jwt import JWT_ALGORITHM, JWT_SECRET

TEST_KEY = "testkey"
REVIEW = "/api/v1/aria/queue/48/review"
BAD_REVIEW = {"status": "__guard_probe__"}  # 400 after the guard, never written
BAD_FEEDBACK = {"entity_type": "__guard_probe__", "entity_id": 48, "feedback_type": "needs_review"}


def _token(user_id: int, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    return jwt.encode({"sub": str(user_id), "email": email, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _bearer(user_id: int, email: str) -> dict:
    return {"Authorization": f"Bearer {_token(user_id, email)}"}


@pytest.fixture
def admin_user(monkeypatch):
    """Prod-like guard config + a throwaway allow-listed user, removed afterwards."""
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(deps, "WRITE_API_KEY", TEST_KEY)
    monkeypatch.setattr(deps, "_IS_DEV", False)
    monkeypatch.setattr(deps, "ADMIN_EMAILS", frozenset({email}))
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name, is_active) VALUES (?, 'x', 'Guard Test', 1)",
            (email,),
        )
        conn.commit()
        user_id = cur.lastrowid
    yield user_id, email
    with get_db() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()


def test_review_no_auth_401(client, admin_user):
    assert client.patch(REVIEW, json=BAD_REVIEW).status_code == 401


def test_review_non_admin_jwt_rejected(client, admin_user):
    r = client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(999999, "nobody@example.com"))
    assert r.status_code in (401, 403)


def test_review_admin_jwt_passes_guard(client, admin_user):
    user_id, email = admin_user
    r = client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(user_id, email.upper()))
    assert r.status_code not in (401, 403)


def test_review_inactive_admin_rejected(client, admin_user):
    user_id, email = admin_user
    with get_db() as conn:
        conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
        conn.commit()
    r = client.patch(REVIEW, json=BAD_REVIEW, headers=_bearer(user_id, email))
    assert r.status_code == 403


def test_review_write_key_passes_guard(client, admin_user):
    r = client.patch(REVIEW, json=BAD_REVIEW, headers={"X-Rubli-Key": TEST_KEY})
    assert r.status_code not in (401, 403)


def test_review_wrong_key_401(client, admin_user):
    assert client.patch(REVIEW, json=BAD_REVIEW, headers={"X-Rubli-Key": "wrong"}).status_code == 401


def test_feedback_submit_needs_sign_in(client, admin_user):
    assert client.post("/api/v1/feedback", json=BAD_FEEDBACK).status_code == 401
    # a token for a user that doesn't exist (deleted / forged sub) is not "signed in"
    r = client.post("/api/v1/feedback", json=BAD_FEEDBACK, headers=_bearer(999999, "nobody@example.com"))
    assert r.status_code == 401
    user_id, email = admin_user
    r = client.post("/api/v1/feedback", json=BAD_FEEDBACK, headers=_bearer(user_id, email))
    assert r.status_code not in (401, 403)


def test_auth_me_reports_is_admin(client, admin_user, monkeypatch):
    user_id, email = admin_user
    r = client.get("/api/v1/auth/me", headers=_bearer(user_id, email))
    assert r.status_code == 200 and r.json()["is_admin"] is True
    monkeypatch.setattr(deps, "ADMIN_EMAILS", frozenset())
    r = client.get("/api/v1/auth/me", headers=_bearer(user_id, email))
    assert r.status_code == 200 and r.json()["is_admin"] is False


def test_issues_list_non_admin_rejected(client, admin_user):
    r = client.get("/api/v1/issues", headers=_bearer(999999, "nobody@example.com"))
    assert r.status_code in (401, 403)
    assert client.get("/api/v1/issues", headers={"X-Rubli-Key": TEST_KEY}).status_code == 200
