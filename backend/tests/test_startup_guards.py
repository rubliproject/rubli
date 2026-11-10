"""Live audit L1/L3 (_security/live.md): outside dev the API refuses to boot
without rate limiting or with the public default JWT secret."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
STRONG = "x" * 48


def _boot(code: str, **env) -> subprocess.CompletedProcess:
    full = {**os.environ, "RUBLI_ENV": "production", "RUBLI_JWT_SECRET": STRONG, **env}
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=full,
                          capture_output=True, text=True, timeout=120)


@pytest.mark.no_db
def test_prod_boots_with_strong_secret_and_slowapi():
    r = _boot("import api.main as m; assert m.RATE_LIMITING_ENABLED")
    assert r.returncode == 0, r.stderr[-2000:]


@pytest.mark.no_db
def test_prod_refuses_default_jwt_secret():
    r = _boot("import api.main", RUBLI_JWT_SECRET="rubli-dev-secret-change-in-prod")
    assert r.returncode != 0 and "RUBLI_JWT_SECRET" in r.stderr


@pytest.mark.no_db
def test_prod_refuses_to_run_without_slowapi():
    r = _boot("import sys; sys.modules['slowapi'] = None; import api.main")
    assert r.returncode != 0 and "slowapi" in r.stderr


@pytest.mark.no_db
def test_prod_compose_pins_production_env():
    """RUBLI_ENV defaults to dev (auth bypass + public JWT literal), so the prod
    compose file is the only thing standing between a deploy and open admin.
    Pin it (joker review 02 #4)."""
    compose = (BACKEND.parent / "docker-compose.prod.yml").read_text(encoding="utf-8")
    backend_block = compose.split("\n  frontend:")[0]
    assert "- RUBLI_ENV=production" in backend_block
    assert "RUBLI_JWT_SECRET=${RUBLI_JWT_SECRET:?" in backend_block
    assert "RUBLI_WRITE_KEY=${RUBLI_WRITE_KEY:?" in backend_block


@pytest.mark.no_db
def test_prod_io_limits_pinned():
    """PROD_IO_DIAGNOSIS_2026-10-30: a 1.5 G backend cap thrashed the 8.7 GB DB's page cache, and a
    crawler on 412 IPs never tripped per-IP limits. Keep the cap raised and the global bucket on."""
    compose = (BACKEND.parent / "docker-compose.prod.yml").read_text(encoding="utf-8")
    assert "memory: 4608M" in compose.split("\n  frontend:")[0]
    nginx = (BACKEND.parent / "frontend" / "nginx.conf").read_text(encoding="utf-8")
    assert "limit_req zone=contracts_global" in nginx
    assert "categories/[0-9]+/cover $binary_remote_addr" in nginx
    assert "set_real_ip_from" in nginx  # else every visitor shares Caddy's IP bucket
