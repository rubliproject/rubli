"""Read side of scripts/precompute_slow_endpoints.py.

The slow public analysis endpoints scan the 3.1M-row contracts table. Their
results are persisted in precomputed_stats (one row per parameter combination,
keyed by stat_key) so a cold start or worker restart serves them in
milliseconds instead of rescanning. A missing key falls back to the live
computation and is logged.
"""
import json
import logging
import sqlite3
from typing import Any, Optional
from urllib.parse import urlencode

from .dependencies import get_db

logger = logging.getLogger(__name__)

# The precompute script sets this so the handlers compute live instead of
# reading back the (possibly stale) persisted value.
LIVE_ONLY = False


def stat_key(endpoint: str, **params: Any) -> str:
    """'slow:<endpoint>?a=1&b=2' — None params dropped, sorted, url-encoded (no commas)."""
    q = urlencode(sorted((k, v) for k, v in params.items() if v is not None))
    return f"slow:{endpoint}" + (f"?{q}" if q else "")


def load(endpoint: str, **params: Any) -> Optional[Any]:
    """The persisted JSON for this endpoint + params, or None (caller computes live)."""
    if LIVE_ONLY:
        return None
    key = stat_key(endpoint, **params)
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (key,)
            ).fetchone()
    except sqlite3.Error as e:
        logger.warning("precomputed_stats read failed for %s: %s", key, e)
        row = None
    if row:
        return json.loads(row[0])
    logger.warning("precomputed_stats miss for %s; computing live", key)
    return None
