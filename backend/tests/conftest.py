"""
Pytest fixtures for API tests.
"""
import contextlib
import os
import re
import sqlite3
import sys

os.environ.setdefault("RUBLI_SKIP_WARMUP", "1")  # no background warm threads on the shared test connection

import pytest
from fastapi.testclient import TestClient

from api import dependencies as _deps
from api.dependencies import DB_PATH
from api.main import app


def _db_has_contracts() -> bool:
    """True when the configured DB carries the real `contracts` table.

    CI has no 7.9 GB database (at most an empty stub), so every endpoint test
    would 503. Instead of a permanently red workflow, DB-dependent tests are
    skipped with an explicit reason; import/collection errors still fail CI.
    """
    try:
        if not DB_PATH.exists():
            return False
        with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='contracts'"
            ).fetchone()
        return row is not None
    except sqlite3.Error:
        return False


_HAS_DB = _db_has_contracts()


def pytest_collection_modifyitems(config, items):
    if _HAS_DB:
        return
    skip = pytest.mark.skip(reason=f"contracts table absent in {DB_PATH} (full DB not available here)")
    for item in items:
        if item.get_closest_marker("no_db") is None:
            item.add_marker(skip)


# Tables the suite writes to (auth, workspace, watchlist, feedback, issues, and
# the test_cases seed). Each gets a TEMP copy that shadows the real table.
_WRITABLE_TABLES = (
    "users", "investigation_dossiers", "dossier_items",
    "watchlist_items", "investigation_folders", "investigation_folder_items",
    "risk_feedback", "user_issues", "procurement_scandals", "ground_truth_vendors",
)


class _SharedConnection(sqlite3.Connection):
    """close() keeps the connection (and its TEMP tables) alive, but discards an
    unfinished transaction exactly as a real close would."""

    def close(self):
        if self.in_transaction:
            self.rollback()
        self.set_progress_handler(None, 0)  # a real close drops it; a leftover one interrupts later tests


def _open_isolated_connection() -> sqlite3.Connection:
    """One read-only connection to the real DB with TEMP shadows of the writable
    tables. SQLite resolves unqualified names temp-first, so endpoint writes land
    in the TEMP copies; a write to any other table fails ("readonly database")
    instead of silently polluting RUBLI_NORMALIZED.db."""
    conn = sqlite3.connect(
        f"file:{DB_PATH.as_posix()}?mode=ro", uri=True,
        timeout=_deps.DB_QUERY_TIMEOUT, check_same_thread=False,
        factory=_SharedConnection,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA foreign_keys = ON")
    # same read tuning as dependencies.get_db_connection — without the mmap the
    # cold-HDD scans (export, sector filters) run many times slower
    conn.execute("PRAGMA cache_size = -32768")
    conn.execute("PRAGMA mmap_size = 1073741824")
    for table in _WRITABLE_TABLES:
        row = conn.execute(
            "SELECT sql FROM main.sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        if row is None:
            continue
        ddl = re.sub(r"^CREATE TABLE", "CREATE TEMP TABLE", row[0], count=1)
        # FK parents outside the shadow set live in main, which TEMP tables
        # can't reference — drop those constraints in the copy.
        ddl = re.sub(
            r",?\s*FOREIGN KEY\s*\([^)]*\)\s*REFERENCES\s+(\w+)\s*\([^)]*\)",
            lambda m: m.group(0) if m.group(1) in _WRITABLE_TABLES else "", ddl,
        )
        ddl = re.sub(
            r"\s+REFERENCES\s+(\w+)\s*\([^)]*\)",
            lambda m: m.group(0) if m.group(1) in _WRITABLE_TABLES else "", ddl,
        )
        conn.execute(ddl)
        conn.execute(f"INSERT INTO temp.{table} SELECT * FROM main.{table}")
        for (idx_sql,) in conn.execute(
            "SELECT sql FROM main.sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
            (table,),
        ).fetchall():
            conn.execute(re.sub(r"INDEX\s+(IF NOT EXISTS\s+)?", r"INDEX \g<1>temp.", idx_sql, count=1))
    conn.commit()
    return conn


@pytest.fixture(autouse=True, scope="session")
def _isolated_db():
    """Keep the suite from writing into the real database.

    Every get_db_connection() caller gets the shared isolated connection, so
    rows created by tests (users, dossiers, issues…) vanish with the session.
    """
    if not _HAS_DB:
        yield
        return
    conn = _open_isolated_connection()
    original = _deps.get_db_connection
    patched = []
    for mod in list(sys.modules.values()):
        if getattr(mod, "__name__", "").startswith("api") and getattr(mod, "get_db_connection", None) is original:
            mod.get_db_connection = lambda: conn
            patched.append(mod)
    yield conn
    for mod in patched:
        mod.get_db_connection = original
    sqlite3.Connection.close(conn)


@pytest.fixture(autouse=True, scope="session")
def _disable_rate_limits():
    """Disable slowapi rate limiters for the test session.

    The export endpoints carry a 10/minute cap. The suite fires many requests
    at /export/contracts/csv in a tight loop (facet + parity tests), which would
    otherwise trip the cap and fail unrelated assertions with 429s. slowapi
    evaluates ``Limiter.enabled`` at request time, so flipping it off here keeps
    the rate-limit code paths intact in production while making tests
    deterministic.
    """
    with contextlib.suppress(Exception):
        from api.routers import export as _export
        if getattr(_export, "limiter", None) is not None:
            _export.limiter.enabled = False
    with contextlib.suppress(Exception):
        from api.routers import auth as _auth
        _auth.limiter.enabled = False
    with contextlib.suppress(Exception):
        from api.routers import network as _network
        _network._network_limiter.enabled = False
    with contextlib.suppress(Exception):
        app.state.limiter.enabled = False
    yield


@pytest.fixture(scope="module")
def client():
    """Create a test client for the FastAPI app."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def base_url():
    """Base URL for API v1 endpoints."""
    return "/api/v1"


@pytest.fixture(scope="module")
def authed_client(base_url):
    """Test client with a registered + logged-in test user JWT injected."""
    with TestClient(app) as test_client:
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        password = "TestPass123!"
        from unittest import mock
        with mock.patch.dict("os.environ", {"RUBLI_ALLOW_REGISTER": "1"}):
            test_client.post(f"{base_url}/auth/register", json={
                "email": email, "password": password, "name": "Test User"
            })
        resp = test_client.post(f"{base_url}/auth/login", json={
            "email": email, "password": password
        })
        token = resp.json().get("access_token", "")
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        yield test_client
