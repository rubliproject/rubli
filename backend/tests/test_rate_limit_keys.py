"""B-04/B-05/B-06 (_security/backend.md): rate limits key on the real client,
and forwarded headers are trusted only from the proxy hop (private peer)."""
from types import SimpleNamespace

import pytest

from api.dependencies import client_ip


def _req(peer, **headers):
    return SimpleNamespace(client=SimpleNamespace(host=peer) if peer else None,
                           headers={k.replace("_", "-"): v for k, v in headers.items()})


@pytest.mark.no_db
def test_client_ip_uses_forwarded_header_from_proxy_hop():
    assert client_ip(_req("172.18.0.5", x_forwarded_for="203.0.113.7, 172.18.0.2")) == "203.0.113.7"
    assert client_ip(_req("172.18.0.5")) == "172.18.0.5"


@pytest.mark.no_db
def test_client_ip_ignores_forwarded_header_from_public_peer():
    assert client_ip(_req("8.8.8.8", x_forwarded_for="1.2.3.4")) == "8.8.8.8"
    assert client_ip(_req(None)) == "unknown"


@pytest.mark.no_db
def test_every_router_limiter_keys_on_client_ip():
    import importlib

    for name in ("analysis", "analysis_patterns", "export", "network", "sectors", "vendors", "auth"):
        mod = importlib.import_module(f"api.routers.{name}")
        limiters = [v for v in vars(mod).values() if type(v).__name__ == "Limiter"]
        assert limiters, name
        assert all(lim._key_func is client_ip for lim in limiters), name


def test_login_is_throttled_per_client(client):
    from api.routers import auth

    auth.limiter.reset()
    auth.limiter.enabled = True
    try:
        codes = [
            client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-pass"}).status_code
            for _ in range(6)
        ]
    finally:
        auth.limiter.enabled = False
        auth.limiter.reset()
    assert codes[:5] == [401] * 5 and codes[5] == 429


@pytest.mark.no_db
def test_default_limit_fits_a_shared_ip_newsroom():
    """LAUNCH_AUDIT_2026-10-30 § S2: a vendor dossier fires 27 /api calls; one NAT IP
    must fit ~10 dossier loads a minute (300/min), not the old 100/min."""
    from api.main import DEFAULT_RATE_LIMIT

    assert DEFAULT_RATE_LIMIT == "300/minute"


@pytest.mark.no_db
def test_cold_expensive_network_routes_keep_a_tighter_limit():
    """§ S2 review: routes > 2 s cold keep 60/min per IP below the raised default."""
    from api.routers import network

    lim = network._network_limiter
    for fn in ("get_co_bidders", "get_related_vendors", "get_institution_vendors",
               "get_network_graph", "get_pattern_spotlight"):
        limits = lim._route_limits.get(f"api.routers.network.{fn}", [])
        assert [str(x.limit) for x in limits] == ["60 per 1 minute"], fn
