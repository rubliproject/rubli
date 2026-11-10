"""Database connection and common dependencies for the API."""
import hmac
import ipaddress
import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager
from typing import Generator

from fastapi import Header, HTTPException, status

# Write-key auth — set RUBLI_WRITE_KEY env var to enable.
# In production (RUBLI_ENV != "dev"), missing key fails closed with 503.
# In dev mode, missing key bypasses auth for ergonomics.
WRITE_API_KEY = os.environ.get("RUBLI_WRITE_KEY", "")
RUBLI_ENV = os.environ.get("RUBLI_ENV", "dev").lower()
_IS_DEV = RUBLI_ENV in ("dev", "development", "local", "test")


def require_write_key(x_rubli_key: str = Header(default="")) -> None:
    """Require API key for state-changing endpoints.

    Behavior:
      - Dev mode (RUBLI_ENV=dev or unset): if RUBLI_WRITE_KEY is empty, auth is
        bypassed for ergonomics.
      - Production (RUBLI_ENV != dev): if RUBLI_WRITE_KEY is missing/empty,
        the endpoint fails closed with HTTP 503 (misconfiguration).
      - In all environments, when the key is set, X-Rubli-Key must match.
    """
    if not WRITE_API_KEY:
        if _IS_DEV:
            return  # Dev mode: key not configured, skip auth
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Write endpoint disabled: RUBLI_WRITE_KEY is not configured. "
                "Set the environment variable to enable state-changing endpoints."
            ),
        )
    if not hmac.compare_digest(x_rubli_key.encode(), WRITE_API_KEY.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Set X-Rubli-Key header.",
        )


def require_user_or_write_key(
    x_rubli_key: str = Header(default=""),
    authorization: str = Header(default=""),
) -> None:
    """Accept either a valid X-Rubli-Key (admin/legacy) OR a JWT of an active
    user. Used by /feedback submit. The owner's workspace (/watchlist, folders)
    is admin-only via require_admin — it has no user_id to scope by.
    """
    # Path 1 — admin/legacy via X-Rubli-Key
    if WRITE_API_KEY and x_rubli_key and hmac.compare_digest(x_rubli_key.encode(), WRITE_API_KEY.encode()):
        return
    if not WRITE_API_KEY and _IS_DEV:
        return  # Dev mode: bypass

    # Path 2 — valid JWT whose user still exists and is active
    if authorization.startswith("Bearer "):
        from .middleware.auth_jwt import _decode_token
        try:
            user_id = int(_decode_token(authorization[len("Bearer "):]).get("sub", ""))
        except (HTTPException, TypeError, ValueError):
            user_id = -1
        with get_db() as conn:
            if conn.execute("SELECT 1 FROM users WHERE id = ? AND is_active = 1", (user_id,)).fetchone():
                return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Sign in or provide an X-Rubli-Key.",
    )

# Admin allow-list — comma-separated, case-insensitive emails. A signed-in
# user whose email is listed (and whose account is active) may use the
# analyst/admin mutations. Empty list → only X-Rubli-Key passes.
ADMIN_EMAILS = frozenset(
    e.strip().lower()
    for e in os.environ.get("RUBLI_ADMIN_EMAILS", "").split(",")
    if e.strip()
)


def is_admin_email(email: str | None) -> bool:
    """True when the STORED ``email`` is on the RUBLI_ADMIN_EMAILS allow-list.

    Exact match, no case-folding: stored emails are lower-cased at register, so a
    mixed-case row is a legacy/variant account and must not inherit admin.
    """
    return bool(email) and email in ADMIN_EMAILS


def require_admin(
    x_rubli_key: str = Header(default=""),
    authorization: str = Header(default=""),
) -> None:
    """Gate analyst/admin mutations (ARIA review, GT promotion, issue triage…).

    Passes when:
      - X-Rubli-Key equals the server key (aria-cron container, ops scripts), or
      - dev mode with no key configured (local ergonomics, as require_write_key), or
      - a valid JWT for an active user whose stored email is on RUBLI_ADMIN_EMAILS.
    A valid JWT for any other user → 403; nothing valid → 401.
    """
    if WRITE_API_KEY and x_rubli_key and hmac.compare_digest(x_rubli_key.encode(), WRITE_API_KEY.encode()):
        return
    if not WRITE_API_KEY and _IS_DEV:
        return

    if authorization.startswith("Bearer "):
        from .middleware.auth_jwt import _decode_token
        payload = _decode_token(authorization[len("Bearer "):])  # 401 if invalid
        # Decide from the STORED row, never the token's email claim: the exact
        # stored email (lower-cased at register) must be on the allow-list, so a
        # case-variant account can't borrow an admin's address.
        try:
            user_id = int(payload.get("sub", ""))
        except (TypeError, ValueError):
            user_id = -1
        with get_db() as conn:
            row = conn.execute(
                "SELECT email FROM users WHERE id = ? AND is_active = 1", (user_id,)
            ).fetchone()
        if row and is_admin_email(row["email"]):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action needs an analyst account.",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Sign in with an analyst account.",
    )

def client_ip(request) -> str:
    """Rate-limit key: the real client behind Caddy -> nginx.

    X-Forwarded-For is trusted only when the TCP peer is the proxy hop (a
    private/loopback docker address); Caddy rewrites XFF for untrusted clients,
    so its first entry is the visitor. A public peer talking to us directly
    can't spoof its way into another bucket.
    """
    peer = request.client.host if request.client else ""
    try:
        from_proxy = ipaddress.ip_address(peer).is_private
    except ValueError:
        from_proxy = False
    forwarded = request.headers.get("x-forwarded-for", "")
    if from_proxy and forwarded:
        return forwarded.split(",")[0].strip()
    return peer or "unknown"


# Database path - configurable via env var, defaults to RUBLI_NORMALIZED.db
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")))

# Query timeout in seconds (configurable via environment variable)
DB_QUERY_TIMEOUT = int(os.environ.get("DB_QUERY_TIMEOUT", "30"))


def get_db_connection() -> sqlite3.Connection:
    """Create a database connection with row factory and timeout.

    The timeout prevents long-running queries from causing DoS.
    Default is 30 seconds, configurable via DB_QUERY_TIMEOUT env var.
    """
    conn = sqlite3.connect(str(DB_PATH), timeout=DB_QUERY_TIMEOUT, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Set busy timeout to handle concurrent access (5s — short enough to fail fast,
    # long enough for normal lock contention; 30s was too long and caused cascading failures)
    conn.execute("PRAGMA busy_timeout = 30000")
    # WAL mode allows concurrent readers while one writer is active
    conn.execute("PRAGMA journal_mode = WAL")
    # read_uncommitted removed: reads dirty (uncommitted) data from other connections,
    # which is a data integrity risk — WAL already gives good read concurrency
    # Enforce referential integrity
    conn.execute("PRAGMA foreign_keys = ON")
    # Performance: 32MB page cache (was 200MB — reduces memory exhaustion under concurrent load)
    conn.execute("PRAGMA cache_size = -32768")
    # 256 MB, was 1 GB (PROD_IO_DIAGNOSIS_2026-10-30 § Root causes 1). mmap only maps the first N bytes
    # of the 8.7 GB file; the rest goes through the shared page cache either way. 1 GB of mapped pages
    # showed up as file-rss in every worker and in each memcg OOM victim.
    conn.execute("PRAGMA mmap_size = 268435456")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections.

    Use for ``with get_db() as conn:`` in endpoint bodies and scripts.
    For FastAPI ``Depends()``, use :func:`get_db_dep` instead.
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


# api § no-write-wait: best-effort cache writes from a request give up after this, never the 30 s busy wait.
WRITE_BUSY_MS = 200


@contextmanager
def get_write_db() -> Generator[sqlite3.Connection, None, None]:
    """Short-lived connection for best-effort writes on the request path (precomputed_stats persists).
    Raises sqlite3.OperationalError('database is locked') after WRITE_BUSY_MS when another writer holds
    the lock (weekly ingest, another worker) — callers log and move on; the value is still served."""
    conn = sqlite3.connect(str(DB_PATH), timeout=WRITE_BUSY_MS / 1000, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()


def get_db_dep() -> Generator[sqlite3.Connection, None, None]:
    """Bare generator for ``Depends(get_db_dep)`` in FastAPI routes.

    FastAPI >=0.130 rejects ``@contextmanager``-wrapped generators in
    ``Depends()``. This unwrapped version works with all FastAPI versions.
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


def verify_database_exists() -> bool:
    """Check if the database file exists."""
    return DB_PATH.exists()
