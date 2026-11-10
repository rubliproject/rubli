"""App-level hardening (docs/SECURITY_HARDENING_2026-10-28.md § 4–5).

    python -m pytest backend/tests/test_app_hardening.py -q -p no:cacheprovider
"""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db_dep
from api.middleware import register_error_handlers
from api.routers.sexenio_actual import router as sexenio_router

pytestmark = pytest.mark.no_db
BACKEND = Path(__file__).resolve().parents[1]


def test_corrupt_precomputed_row_is_503_without_details():
    """§ 4: a truncated precomputed JSON row → 503 + generic body, never a 500/trace."""
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT)")
    c.execute("INSERT INTO precomputed_stats VALUES ('sexenio_actual', '{\"cut\": \"2024-', '2026-10-28')")
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(sexenio_router, prefix="/api/v1")
    app.dependency_overrides[get_db_dep] = lambda: c
    r = TestClient(app, raise_server_exceptions=False).get("/api/v1/sexenio-actual")
    assert r.status_code == 503
    assert r.json() == {"error": {"code": "DATA_UNAVAILABLE", "message": "This data is temporarily unavailable."}}
    assert "Expecting" not in r.text and "Traceback" not in r.text


def _prod_probe(code: str) -> str:
    env = {**os.environ, "RUBLI_ENV": "production", "PYTHONPATH": str(BACKEND),
           "RUBLI_JWT_SECRET": "test-only-secret-" + "x" * 40}
    env.pop("ENABLE_DOCS", None)
    env.pop("ALLOWED_HOSTS", None)
    out = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env,
                         capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-2000:]
    return out.stdout.strip().splitlines()[-1]


def test_production_app_rejects_foreign_host_and_hides_docs():
    """§ 5: TrustedHostMiddleware in production; /docs, /redoc, /openapi.json off."""
    line = _prod_probe(
        "from fastapi.testclient import TestClient\n"
        "from api.main import app\n"
        "c = TestClient(app, raise_server_exceptions=False)\n"
        "codes = [c.get('/metrics', headers={'host': h}).status_code\n"
        "         for h in ('evil.example', 'rubli.xyz', 'www.rubli.xyz', 'localhost:8001', 'backend:8001')]\n"
        "codes += [c.get(p, headers={'host': 'rubli.xyz'}).status_code for p in ('/docs', '/redoc', '/openapi.json')]\n"
        "print(codes)\n"
    )
    assert line == "[400, 200, 200, 200, 200, 404, 404, 404]"
