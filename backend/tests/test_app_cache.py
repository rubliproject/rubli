"""AppCache fixes a namespace's bounds at its first set(); one namespace per key kind (backend review #1)."""
import logging
import re
from pathlib import Path

import pytest

from api.cache import AppCache

pytestmark = pytest.mark.no_db


def test_bounds_mismatch_is_logged_once(caplog):
    c = AppCache()
    c.set("ns", "a", 1, maxsize=1, ttl=60)
    with caplog.at_level(logging.WARNING, logger="api.cache"):
        c.set("ns", "b", 2, maxsize=512, ttl=60)
        c.set("ns", "c", 3, maxsize=512, ttl=60)
    assert sum("one namespace per key kind" in r.message for r in caplog.records) == 1
    assert c.stats()["ns"]["maxsize"] == 1


def test_every_literal_namespace_has_one_set_of_bounds():
    """Static guard: no app_cache.set(<literal ns>, ...) pair in api/ disagrees on maxsize/ttl."""
    seen: dict = {}
    pat = re.compile(r'app_cache\.set\(([^,]+),.*?maxsize=(\d+), ttl=([^)]+)\)')
    for p in Path(__file__).resolve().parents[1].joinpath("api").rglob("*.py"):
        for ns, size, ttl in pat.findall(p.read_text(encoding="utf-8")):
            seen.setdefault((p.name, ns.strip()), set()).add((size, ttl.strip()))
    clash = {k: v for k, v in seen.items() if len(v) > 1}
    assert not clash, clash
