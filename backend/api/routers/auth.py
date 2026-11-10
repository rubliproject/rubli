"""User authentication router for RUBLI API.

Endpoints:
  POST /auth/register  — create account, return JWT
  POST /auth/login     — verify credentials, return JWT
  GET  /auth/me        — return current user info (requires JWT)
  POST /auth/logout    — client-side only, returns {ok: true}
"""
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt as _bcrypt

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from pydantic import BaseModel, EmailStr, Field
import jwt

from ..dependencies import client_ip, get_db, is_admin_email
from ..middleware.auth_jwt import JWT_SECRET, JWT_ALGORITHM, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_EXPIRE_DAYS = 30

# bcrypt is ~250 ms of CPU per attempt — throttle guessing per client IP.
# ponytail: in-memory per gunicorn worker (x6), add storage_uri (redis) for a hard cap
limiter = Limiter(key_func=client_ip)


# ── Pydantic models ──────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: str
    is_admin: bool = False


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Helpers ──────────────────────────────────────────────────────────────────

def _norm_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt(rounds=12)).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def _make_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_to_out(row: sqlite3.Row) -> UserOut:
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        created_at=row["created_at"] or "",
        is_admin=is_admin_email(row["email"]),
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterIn):
    """Create a new user account and return a JWT.

    Closed unless RUBLI_ALLOW_REGISTER=1 — RUBLI is owner-operated and there is
    no email verification, so open sign-up would let anyone claim an address.
    """
    if os.environ.get("RUBLI_ALLOW_REGISTER", "").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is closed")
    email = _norm_email(body.email)
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE lower(email) = ?", (email,)
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        password_hash = _hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
            (email, password_hash, body.name),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()

    token = _make_token(row["id"], row["email"])
    return AuthResponse(access_token=token, user=_user_to_out(row))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginIn):
    """Authenticate and return a JWT."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, created_at FROM users WHERE lower(email) = ? AND is_active = 1",
            (_norm_email(body.email),),
        ).fetchone()

    if not row or not _verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = _make_token(row["id"], row["email"])
    return AuthResponse(access_token=token, user=_user_to_out(row))


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    user_id = int(current_user["sub"])
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _user_to_out(row)


@router.post("/logout")
def logout():
    """Signal logout. Clients should discard the token locally."""
    return {"ok": True}
