"""
Atlas cluster-vendor endpoint.

GET /api/v1/atlas/cluster-vendors
Returns top vendors associated with a given constellation lens + cluster code.
Used by the frontend atlas-C-P3 drill-down panel.

Lens mapping:
  patterns   → filter aria_queue.primary_pattern = code (P1–P7)
  sectors    → filter aria_queue.primary_sector_id via sectors.code
  categories → join contracts → categories via categories.code (contracts table)
  terms      → no clean source table; returns empty list with explanatory note
"""
import json
import logging
import sqlite3
import time
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from pydantic import BaseModel, Field

from ..dependencies import get_db_dep
from ..public_labels import (
    NOT_SUPPRESSED_SQL,
    PATTERN_LABELS,
    apply_public_labels,
    suppressed_ids_json,
)
from ..administrations import ADMINISTRATION_KEYS, ADMINISTRATIONS_BY_KEY
from ..services.institution_canonical import scope_predicate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/atlas", tags=["atlas"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_VALID_LENSES = {"patterns", "sectors", "categories", "terms"}

# Human-readable pattern labels
# (es, en) order — public signal names live in public_labels § B4.
_PATTERN_LABELS: dict[str, tuple[str, str]] = {k: (es, en) for k, (en, es) in PATTERN_LABELS.items()}

# Sector code → (name_es, name_en) built at runtime from DB; this is the fallback
_SECTOR_LABEL_FALLBACK: dict[str, tuple[str, str]] = {
    "salud": ("Salud", "Health"),
    "educacion": ("Educación", "Education"),
    "infraestructura": ("Infraestructura", "Infrastructure"),
    "energia": ("Energía", "Energy"),
    "defensa": ("Defensa", "Defense"),
    "tecnologia": ("Tecnología", "Technology"),
    "hacienda": ("Hacienda", "Treasury"),
    "gobernacion": ("Gobernación", "Interior"),
    "agricultura": ("Agricultura", "Agriculture"),
    "ambiente": ("Medio Ambiente", "Environment"),
    "trabajo": ("Trabajo", "Labor"),
    "otros": ("Otros", "Other"),
}


# ---------------------------------------------------------------------------
# In-process cache for the batch endpoint
# ---------------------------------------------------------------------------
#
# Galaxy data only changes when the ARIA pipeline re-runs (typically once
# per retrain or once per CENTINELA refresh). We measured 4.1s cold and 4.1s
# warm for the same (lens, codes, limit) tuple over the public edge — most
# of which is per-request SQLite connection setup with cache_size/mmap_size
# PRAGMAs against a 5GB DB. An in-process TTL cache collapses every repeat
# call into a dict lookup and lets `Cache-Control: public, max-age=300` on
# the response take over the rest.
#
# Cache key is a frozen tuple of (lens, normalized-codes, limit). Codes are
# sorted to make the key insensitive to order — a request for `P1,P2,P3` and
# `P3,P2,P1` hit the same entry. Frontend already sorts its codes for the
# react-query key.
#
# TTL = 600s. ARIA pipeline runs are explicit, manual events; a 10-minute
# staleness window is well inside the rate of legitimate data movement.

_BATCH_CACHE_TTL_S = 600.0
_batch_cache: dict[tuple, tuple[float, "ClusterVendorsBatchResponse"]] = {}
_batch_cache_lock = threading.Lock()


def _batch_cache_key(lens: str, codes: list[str], limit: int) -> tuple:
    return (lens, tuple(sorted(codes)), limit)


def _batch_cache_get(key: tuple) -> Optional["ClusterVendorsBatchResponse"]:
    with _batch_cache_lock:
        entry = _batch_cache.get(key)
        if entry is None:
            return None
        expires_at, payload = entry
        if time.monotonic() > expires_at:
            _batch_cache.pop(key, None)
            return None
        return payload


def _batch_cache_put(key: tuple, payload: "ClusterVendorsBatchResponse") -> None:
    with _batch_cache_lock:
        _batch_cache[key] = (time.monotonic() + _BATCH_CACHE_TTL_S, payload)
        # Bound the cache so a long-running process can't grow it forever.
        # 256 entries is enough for every (lens × code-set × limit) combo the
        # Observatory typically requests (4 lenses × ~16 reasonable code-sets
        # × ~4 limits = 256). On overflow, drop the oldest entry by recreating
        # the dict from the most recent insertions.
        if len(_batch_cache) > 256:
            keep = list(_batch_cache.items())[-128:]
            _batch_cache.clear()
            _batch_cache.update(keep)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class VendorClusterItem(BaseModel):
    vendor_id: int
    name: str
    size_category: Optional[str] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    tier: Optional[int] = None
    total_contracts: Optional[int] = None
    total_amount_mxn: Optional[float] = None
    primary_sector_code: Optional[str] = None
    primary_sector_name: Optional[str] = None
    is_gt: bool = False
    primary_pattern: Optional[str] = None
    ghost_score: Optional[float] = None
    capture_score: Optional[float] = None
    # Full ARIA pattern-confidence dict (e.g. {"P2": 0.91, "P6": 0.80}). Already
    # SELECTed per row; previously parsed only for the P6 capture_score and
    # discarded. The Atlas File Panel renders the ARIA fingerprint and the
    # cross-pattern jump chips from this.
    pattern_confidences: Optional[dict[str, float]] = None


class ClusterVendorsResponse(BaseModel):
    lens: str
    code: str
    label_es: str
    label_en: str
    total: int
    vendors: list[VendorClusterItem]
    next_cursor: Optional[float] = None
    note: Optional[str] = None


class ClusterVendorsBatchResponse(BaseModel):
    """Bulk variant of ClusterVendorsResponse — one entry per requested code.

    Used by the Observatory galaxy view to fetch all cluster cohorts in a
    single HTTP round-trip instead of N parallel TLS handshakes (see
    Atlas P6 vetting 2026-05-21: 27ms internal vs 1,687ms per-request
    over TLS for the 7-cluster patterns lens).
    """
    lens: str
    clusters: list[ClusterVendorsResponse]


class ClusterStatItem(BaseModel):
    """Per-cluster aggregate for the faithful-encoding Observatory scatter.

    All-time aggregates over aria_queue (vendor-level). NOT year-sliced —
    aria_queue carries lifetime pattern/tier/risk per vendor, so there is no
    honest per-year cluster aggregate to serve. The scatter hides its year
    scrubber accordingly.
    """
    code: str
    label_es: str
    label_en: str
    vendors: int
    t1: int
    high_risk_rate: float = Field(..., description="Fraction of cluster vendors with avg_risk_score >= 0.40")
    total_value_mxn: float


class ClusterStatsResponse(BaseModel):
    lens: str
    clusters: list[ClusterStatItem]
    period: Optional[str] = None
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Cluster aggregates (faithful-encoding Observatory scatter)
# ---------------------------------------------------------------------------

_STATS_CACHE_TTL_S = 600.0
_stats_cache: dict[str, tuple[float, "ClusterStatsResponse"]] = {}
_stats_cache_lock = threading.Lock()

# category_stats.vendor_count/t1_count are added by
# scripts/_precompute_category_cohort_counts.py. Older DBs (prod before that
# precompute has run) won't have the columns — checked once per process
# instead of on every request.
_category_stats_vendor_count_checked = False
_category_stats_has_vendor_count = False


def _check_category_stats_vendor_count(conn: sqlite3.Connection) -> bool:
    global _category_stats_vendor_count_checked, _category_stats_has_vendor_count
    if not _category_stats_vendor_count_checked:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(category_stats)")}
        _category_stats_has_vendor_count = "vendor_count" in cols and "t1_count" in cols
        _category_stats_vendor_count_checked = True
    return _category_stats_has_vendor_count


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


_PERIOD_NOTE = (
    "Vendor counts include vendors with at least one contract during this "
    "period. The risk rate reflects each vendor's lifetime risk indicator — "
    "the model is not re-run per period."
)


def _get_cluster_stats_period(conn: sqlite3.Connection, lens: str, period: str) -> ClusterStatsResponse:
    """Period-scoped cluster aggregates, read from the precomputed
    atlas_cohort_period_stats table (scripts/_precompute_atlas_cohort_periods.py).
    """
    if lens not in ("patterns", "sectors", "categories"):
        return ClusterStatsResponse(lens=lens, clusters=[], period=period)
    if not _table_exists(conn, "atlas_cohort_period_stats"):
        return ClusterStatsResponse(
            lens=lens, clusters=[], period=period,
            note="Period cohort table not precomputed yet — run scripts._precompute_atlas_cohort_periods.",
        )

    rows = conn.execute(
        """
        SELECT code, vendors, t1, high_risk_rate, total_value_mxn
        FROM atlas_cohort_period_stats
        WHERE lens = ? AND period = ?
        ORDER BY total_value_mxn DESC
        """,
        (lens, period),
    ).fetchall()

    if lens == "patterns":
        label_map = _PATTERN_LABELS
    elif lens == "sectors":
        label_map = {
            r[0]: (r[1] or r[0], r[2] or r[0])
            for r in conn.execute("SELECT code, name_es, name_en FROM sectors")
        }
    else:  # categories
        label_map = {
            r[0]: (r[1] or r[0], r[2] or r[0])
            for r in conn.execute("SELECT code, name_es, name_en FROM categories")
        }

    items = []
    for r in rows:
        code = r[0]
        fb = _SECTOR_LABEL_FALLBACK.get(code, (code, code)) if lens == "sectors" else (code, code)
        es, en = label_map.get(code, fb)
        items.append(ClusterStatItem(
            code=code, label_es=es, label_en=en,
            vendors=int(r[1] or 0), t1=int(r[2] or 0),
            high_risk_rate=round(float(r[3] or 0.0), 4),
            total_value_mxn=float(r[4] or 0.0),
        ))

    return ClusterStatsResponse(lens=lens, clusters=items, period=period, note=_PERIOD_NOTE)


@router.get("/cluster-stats", response_model=ClusterStatsResponse)
def get_cluster_stats(
    response: Response,
    lens: str = Query("patterns", description="Lens: patterns, sectors, or categories"),
    period: Optional[str] = Query(
        None,
        description="Sexenio key to scope vendor cohort membership to "
                     "(fox|calderon|pena_nieto|amlo|sheinbaum). Omit for all-time.",
    ),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """All-time per-cluster aggregates (vendor count, Tier-1 count, high-risk
    rate, total value) for the Observatory bubble scatter.

    patterns + sectors + categories — terms keeps its static meta on the
    client. NOT year-sliced by default: aria_queue is vendor-lifetime, so
    there is no honest per-year aggregate (the scatter hides its year
    scrubber). Pass `period` to scope vendor cohort membership to a
    presidential sexenio via the atlas_cohort_period_stats precompute —
    see `period` field docs on the response.

    categories' all-time vendor_count/t1_count come from category_stats,
    precomputed by scripts/_precompute_category_cohort_counts.py — a live
    `COUNT(DISTINCT vendor_id) ... GROUP BY category_id` over the 3.1M-row
    contracts table has no covering index and timed out (>60s) when tried
    live.
    """
    lens = lens.lower()

    if period is not None:
        period = period.lower()
        if period not in ADMINISTRATION_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid period '{period}'. Valid values: {sorted(ADMINISTRATION_KEYS)}",
            )
        return _get_cluster_stats_period(conn, lens, period)

    if lens == "categories":
        if not _check_category_stats_vendor_count(conn):
            return ClusterStatsResponse(lens=lens, clusters=[])
        rows = conn.execute(
            """
            SELECT c.code, c.name_es, c.name_en,
                   COALESCE(cs.vendor_count, 0), COALESCE(cs.t1_count, 0),
                   COALESCE(cs.high_risk_pct, 0) / 100.0,
                   COALESCE(cs.total_value, 0)
            FROM categories c
            JOIN category_stats cs ON cs.category_id = c.id
            WHERE c.is_active = 1
            ORDER BY cs.total_value DESC
            """
        ).fetchall()
        items = [
            ClusterStatItem(
                code=r[0], label_es=(r[1] or r[0]), label_en=(r[2] or r[0]),
                vendors=int(r[3] or 0), t1=int(r[4] or 0),
                high_risk_rate=round(float(r[5] or 0.0), 4),
                total_value_mxn=float(r[6] or 0.0),
            )
            for r in rows
        ]
        return ClusterStatsResponse(lens=lens, clusters=items)

    if lens not in ("patterns", "sectors"):
        return ClusterStatsResponse(lens=lens, clusters=[])

    now = time.time()
    with _stats_cache_lock:
        hit = _stats_cache.get(lens)
        if hit and now - hit[0] < _STATS_CACHE_TTL_S:
            response.headers["Cache-Control"] = "public, max-age=300"
            return hit[1]

    items: list[ClusterStatItem] = []
    if lens == "patterns":
        # One vendor basis per cohort (PARALLAX D16 § Change 4): every figure —
        # vendors, t1, high_risk_rate, total_value_mxn — is computed over the
        # same PUBLIC set (public_labels § B4 suppression), the set the cohort
        # register, the /aria queue counts and the sexenio precompute
        # (scripts/_precompute_atlas_cohort_periods.py) already use. Before,
        # `vendors` was public while the other three were over all rows
        # ("82 % of its 36 vendors" = 36 of 44).
        rows = conn.execute(
            f"""
            SELECT primary_pattern,
                   COUNT(*),
                   SUM(CASE WHEN ips_tier = 1 THEN 1 ELSE 0 END),
                   AVG(CASE WHEN avg_risk_score >= 0.40 THEN 1.0 WHEN avg_risk_score IS NOT NULL THEN 0.0 END),
                   COALESCE(SUM(total_value_mxn), 0)
            FROM aria_queue
            WHERE primary_pattern IS NOT NULL AND primary_pattern != ''
              AND {NOT_SUPPRESSED_SQL}
            GROUP BY primary_pattern
            """,
            (suppressed_ids_json(conn),),
        ).fetchall()
        for r in rows:
            es, en = _PATTERN_LABELS.get(r[0], (r[0], r[0]))
            items.append(ClusterStatItem(
                code=r[0], label_es=es, label_en=en,
                vendors=int(r[1] or 0), t1=int(r[2] or 0),
                high_risk_rate=round(float(r[3] or 0.0), 4),
                total_value_mxn=float(r[4] or 0.0),
            ))
    else:  # sectors
        rows = conn.execute(
            """
            SELECT s.code, s.name_es, s.name_en,
                   COUNT(*),
                   SUM(CASE WHEN aq.ips_tier = 1 THEN 1 ELSE 0 END),
                   AVG(CASE WHEN aq.avg_risk_score >= 0.40 THEN 1.0 WHEN aq.avg_risk_score IS NOT NULL THEN 0.0 END),
                   COALESCE(SUM(aq.total_value_mxn), 0)
            FROM aria_queue aq
            JOIN sectors s ON aq.primary_sector_id = s.id
            GROUP BY s.code
            """
        ).fetchall()
        for r in rows:
            fb = _SECTOR_LABEL_FALLBACK.get(r[0], (r[0], r[0]))
            items.append(ClusterStatItem(
                code=r[0], label_es=(r[1] or fb[0]), label_en=(r[2] or fb[1]),
                vendors=int(r[3] or 0), t1=int(r[4] or 0),
                high_risk_rate=round(float(r[5] or 0.0), 4),
                total_value_mxn=float(r[6] or 0.0),
            ))

    payload = ClusterStatsResponse(lens=lens, clusters=items)
    with _stats_cache_lock:
        _stats_cache[lens] = (now, payload)
    response.headers["Cache-Control"] = "public, max-age=300"
    return payload


# ---------------------------------------------------------------------------
# Risk level helper
# ---------------------------------------------------------------------------

def _risk_level(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    if score >= 0.60:
        return "critical"
    if score >= 0.40:
        return "high"
    if score >= 0.25:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/cluster-vendors", response_model=ClusterVendorsResponse)
def get_cluster_vendors(
    lens: str = Query(..., description="Lens type: patterns, sectors, categories, terms"),
    code: str = Query(..., description="Cluster code, e.g. P5, salud, cat_medications"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, description="Offset for page-based pagination (ignored when cursor is set)"),
    cursor: Optional[float] = Query(None, description="Keyset cursor: last seen sort key (risk_score for sort=risk, total_amount_mxn for sort=value). Returns vendors with key < cursor."),
    period: Optional[str] = Query(
        None,
        description="Sexenio key to restrict to vendors with >=1 contract during that period "
                     "(fox|calderon|pena_nieto|amlo|sheinbaum). Omit for all-time.",
    ),
    sort: str = Query("risk", pattern="^(risk|value)$", description="risk = avg_risk_score DESC (default); value = total contracted MXN DESC — the Atlas cohort register."),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Return top vendors associated with a constellation cluster.

    Keyset pagination via `cursor` (risk_score DESC) is preferred for sequential
    browsing. Offset-based pagination is available for jump-to-page use cases.
    Both parameters are mutually exclusive — cursor takes precedence.
    """
    if lens not in _VALID_LENSES:
        # Return empty with note rather than 422, per spec
        return ClusterVendorsResponse(
            lens=lens,
            code=code,
            label_es=code,
            label_en=code,
            total=0,
            vendors=[],
            note=f"Unknown lens '{lens}'. Valid values: {', '.join(sorted(_VALID_LENSES))}",
        )

    period_years: Optional[tuple[int, int]] = None
    if period is not None:
        period = period.lower()
        if period not in ADMINISTRATION_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid period '{period}'. Valid values: {sorted(ADMINISTRATION_KEYS)}",
            )
        adm = ADMINISTRATIONS_BY_KEY[period]
        period_years = (adm.year_min, adm.year_max)

    if lens == "patterns":
        return _query_patterns(conn, code, limit, offset, cursor, period_years, sort)
    if lens == "sectors":
        return _query_sectors(conn, code, limit, offset, cursor, period_years, sort)
    if lens == "categories":
        return _query_categories(conn, code, limit, offset, cursor, period_years, sort)
    # lens == "terms"
    return _query_terms(conn, code)


@router.get("/cluster-vendors-batch", response_model=ClusterVendorsBatchResponse)
def get_cluster_vendors_batch(
    response: Response,
    lens: str = Query(..., description="Lens type: patterns, sectors, categories, terms"),
    codes: str = Query(..., description="Comma-separated cluster codes, e.g. 'P1,P2,P3,P4,P5,P6,P7'"),
    limit: int = Query(10, ge=1, le=200, description="Top-N vendors per cluster"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Return top vendors for MULTIPLE clusters in a single response.

    Replaces N parallel /cluster-vendors calls with one round-trip. The galaxy
    view of the Observatory uses this to populate all 7 patterns / 12 sectors
    / 32 categories in one shot — avoiding 7+ TLS handshakes whose latency
    dominated the per-call cost over the public edge.

    Returns the same per-cluster response shape as /cluster-vendors, wrapped
    in a `{ lens, clusters: [...] }` envelope.

    Caching (2026-05-22):
      • In-process TTL cache (600s) keyed on (lens, sorted-codes, limit).
        Galaxy data only changes when the ARIA pipeline re-runs; the cold
        path used to be 4.1s end-to-end and warm was *also* 4.1s because
        every request opened a fresh SQLite connection. The cache makes
        repeat hits a dict lookup (<1ms).
      • `Cache-Control: public, max-age=300` lets browsers and any edge
        proxy reuse the response. `stale-while-revalidate=600` keeps the
        UI snappy if a refresh races a TTL expiry — the user gets the
        stale payload immediately while a fresh fetch runs in the
        background.
    """
    # Always set cache headers so the browser/edge layer can collaborate
    # even when we have to do the DB work ourselves.
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"

    if lens not in _VALID_LENSES:
        return ClusterVendorsBatchResponse(lens=lens, clusters=[])

    # Cap the comma list to a defensive maximum so a malicious caller can't
    # request 1000 codes and exhaust DB connections.
    code_list = [c.strip() for c in codes.split(",") if c.strip()][:50]
    if not code_list:
        return ClusterVendorsBatchResponse(lens=lens, clusters=[])

    # Cache lookup — sorted-codes key collapses callers that request the
    # same codes in different orders into one entry.
    cache_key = _batch_cache_key(lens, code_list, limit)
    cached = _batch_cache_get(cache_key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return cached
    response.headers["X-Cache"] = "MISS"

    results: list[ClusterVendorsResponse] = []
    for code in code_list:
        if lens == "patterns":
            r = _query_patterns(conn, code, limit, 0, None)
        elif lens == "sectors":
            r = _query_sectors(conn, code, limit, 0, None)
        elif lens == "categories":
            r = _query_categories(conn, code, limit, 0, None)
        else:  # lens == "terms"
            r = _query_terms(conn, code)
        results.append(r)

    payload = ClusterVendorsBatchResponse(lens=lens, clusters=results)
    _batch_cache_put(cache_key, payload)
    return payload


# ---------------------------------------------------------------------------
# Lens-specific query builders
# ---------------------------------------------------------------------------

def _base_vendor_select() -> str:
    """Return the SELECT + FROM + JOIN fragment shared by all lenses.

    Columns returned (in order):
      v.id, v.name, v.size_stratification,
      aq.avg_risk_score, aq.ips_tier, aq.total_contracts, aq.total_value_mxn,
      s.code, s.name_es, s.name_en,
      aq.in_ground_truth, aq.primary_pattern,
      gcs.ghost_confidence_score, aq.pattern_confidences
    """
    return """
        SELECT
            v.id                           AS vendor_id,
            v.name                         AS name,
            v.size_stratification          AS size_category,
            aq.avg_risk_score              AS risk_score,
            aq.ips_tier                    AS tier,
            vs.total_contracts             AS total_contracts,
            vs.total_value_mxn             AS total_amount_mxn,
            s.code                         AS primary_sector_code,
            s.name_es                      AS primary_sector_name_es,
            s.name_en                      AS primary_sector_name_en,
            COALESCE(aq.in_ground_truth, 0) AS is_gt,
            aq.primary_pattern             AS primary_pattern,
            gcs.ghost_confidence_score     AS ghost_score,
            aq.pattern_confidences         AS pattern_confidences
        FROM aria_queue aq
        JOIN vendors v ON v.id = aq.vendor_id
        LEFT JOIN vendor_stats vs ON vs.vendor_id = aq.vendor_id
        LEFT JOIN sectors s ON s.id = aq.primary_sector_id
        LEFT JOIN ghost_confidence_scores gcs ON gcs.vendor_id = aq.vendor_id
    """


# Keyset pagination needs the cursor column and ORDER BY to agree. vendor_stats is
# LEFT JOINed, so the value key is COALESCEd: NULL would otherwise sort last but
# never satisfy `< cursor`, stranding those vendors on no page.
_SORT_KEY = {
    "risk": "aq.avg_risk_score",
    "value": "COALESCE(vs.total_value_mxn, 0)",
}
_ORDER_SQL = {
    "risk": "ORDER BY aq.avg_risk_score DESC, vs.total_value_mxn DESC",
    "value": "ORDER BY COALESCE(vs.total_value_mxn, 0) DESC, aq.avg_risk_score DESC",
}


def _apply_cursor_or_offset(
    where_clauses: list[str],
    params: list,
    cursor: Optional[float],
    sort: str = "risk",
) -> tuple[str, list]:
    """Append the keyset cursor clause (if any) and build the WHERE fragment."""
    if cursor is not None:
        where_clauses.append(f"{_SORT_KEY[sort]} < ?")
        params.append(cursor)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    return where_sql, params


def _build_vendor_items(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[VendorClusterItem]:
    items = []
    for d in apply_public_labels(conn, [dict(r) for r in rows]):

        # Parse the full pattern_confidences JSON once: capture_score keeps its
        # legacy P6 extraction, and the whole dict is surfaced on the item.
        capture_score = None
        pattern_confidences = None
        pc_raw = d.get("pattern_confidences")
        if pc_raw:
            try:
                pc = json.loads(pc_raw) if isinstance(pc_raw, str) else pc_raw
                pattern_confidences = {
                    str(k): float(v) for k, v in pc.items() if v is not None
                } or None
                p6_val = pc.get("P6")
                if p6_val is not None:
                    capture_score = float(p6_val)
            except Exception:
                pass

        risk_score = d.get("risk_score")
        sector_name = d.get("primary_sector_name_es") or d.get("primary_sector_name_en")

        items.append(VendorClusterItem(
            vendor_id=d["vendor_id"],
            name=d["name"] or "",
            size_category=d.get("size_category"),
            risk_score=risk_score,
            risk_level=_risk_level(risk_score),
            tier=d.get("tier"),
            total_contracts=d.get("total_contracts"),
            total_amount_mxn=d.get("total_amount_mxn"),
            primary_sector_code=d.get("primary_sector_code"),
            primary_sector_name=sector_name,
            is_gt=bool(d.get("is_gt", 0)),
            primary_pattern=d.get("primary_pattern"),
            ghost_score=d.get("ghost_score"),
            capture_score=capture_score,
            pattern_confidences=pattern_confidences,
        ))
    return items


def _compute_next_cursor(rows: list[sqlite3.Row], limit: int, sort: str = "risk") -> Optional[float]:
    """Return the sort key of the last row if a full page was returned."""
    if len(rows) < limit:
        return None
    last = dict(rows[-1])
    if sort == "value":
        return last.get("total_amount_mxn") or 0.0
    return last.get("risk_score")


def _get_total(conn: sqlite3.Connection, count_sql: str, params: list) -> int:
    try:
        row = conn.execute(count_sql, params).fetchone()
        return row[0] if row else 0
    except Exception as e:
        logger.warning("Total count query failed: %s", e)
        return 0


# ---------------------------------------------------------------------------
# lens=patterns
# ---------------------------------------------------------------------------

def _query_patterns(
    conn: sqlite3.Connection,
    code: str,
    limit: int,
    offset: int,
    cursor: Optional[float],
    period_years: Optional[tuple[int, int]] = None,
    sort: str = "risk",
) -> ClusterVendorsResponse:
    label_es, label_en = _PATTERN_LABELS.get(code, (code, code))

    # Total count
    suppressed = suppressed_ids_json(conn)
    count_sql = f"SELECT COUNT(*) FROM aria_queue WHERE primary_pattern = ? AND {NOT_SUPPRESSED_SQL}"
    count_params: list = [code, suppressed]
    if period_years is not None:
        count_sql += " AND EXISTS (SELECT 1 FROM contracts ct WHERE ct.vendor_id = aria_queue.vendor_id AND ct.contract_year BETWEEN ? AND ?)"
        count_params += list(period_years)
    total = _get_total(conn, count_sql, count_params)

    where_clauses = ["aq.primary_pattern = ?", "aq." + NOT_SUPPRESSED_SQL]
    params: list = [code, suppressed]
    if period_years is not None:
        where_clauses.append(
            "EXISTS (SELECT 1 FROM contracts ct WHERE ct.vendor_id = aq.vendor_id AND ct.contract_year BETWEEN ? AND ?)"
        )
        params += list(period_years)
    where_sql, params = _apply_cursor_or_offset(where_clauses, params, cursor, sort)

    sql = f"""
        {_base_vendor_select()}
        {where_sql}
        {_ORDER_SQL[sort]}
        LIMIT {limit}{"" if cursor is not None else f" OFFSET {offset}"}
    """

    rows = conn.execute(sql, params).fetchall()
    vendors = _build_vendor_items(conn, rows)
    next_cursor = _compute_next_cursor(rows, limit, sort)

    return ClusterVendorsResponse(
        lens="patterns",
        code=code,
        label_es=label_es,
        label_en=label_en,
        total=total,
        vendors=vendors,
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# lens=sectors
# ---------------------------------------------------------------------------

def _query_sectors(
    conn: sqlite3.Connection,
    code: str,
    limit: int,
    offset: int,
    cursor: Optional[float],
    period_years: Optional[tuple[int, int]] = None,
    sort: str = "risk",
) -> ClusterVendorsResponse:
    # Resolve sector labels from DB
    sector_row = conn.execute(
        "SELECT id, name_es, name_en FROM sectors WHERE code = ?", (code,)
    ).fetchone()

    if sector_row:
        sector_id = sector_row[0]
        label_es = sector_row[1] or code
        label_en = sector_row[2] or code
    else:
        fallback = _SECTOR_LABEL_FALLBACK.get(code, (code, code))
        label_es, label_en = fallback
        # No sector found — return empty
        return ClusterVendorsResponse(
            lens="sectors",
            code=code,
            label_es=label_es,
            label_en=label_en,
            total=0,
            vendors=[],
        )

    count_sql = "SELECT COUNT(*) FROM aria_queue WHERE primary_sector_id = ?"
    count_params: list = [sector_id]
    if period_years is not None:
        count_sql += " AND EXISTS (SELECT 1 FROM contracts ct WHERE ct.vendor_id = aria_queue.vendor_id AND ct.contract_year BETWEEN ? AND ?)"
        count_params += list(period_years)
    total = _get_total(conn, count_sql, count_params)

    where_clauses = ["aq.primary_sector_id = ?"]
    params: list = [sector_id]
    if period_years is not None:
        where_clauses.append(
            "EXISTS (SELECT 1 FROM contracts ct WHERE ct.vendor_id = aq.vendor_id AND ct.contract_year BETWEEN ? AND ?)"
        )
        params += list(period_years)
    where_sql, params = _apply_cursor_or_offset(where_clauses, params, cursor, sort)

    sql = f"""
        {_base_vendor_select()}
        {where_sql}
        {_ORDER_SQL[sort]}
        LIMIT {limit}{"" if cursor is not None else f" OFFSET {offset}"}
    """

    rows = conn.execute(sql, params).fetchall()
    vendors = _build_vendor_items(conn, rows)
    next_cursor = _compute_next_cursor(rows, limit, sort)

    return ClusterVendorsResponse(
        lens="sectors",
        code=code,
        label_es=label_es,
        label_en=label_en,
        total=total,
        vendors=vendors,
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# lens=categories
# ---------------------------------------------------------------------------

def _query_categories(
    conn: sqlite3.Connection,
    code: str,
    limit: int,
    offset: int,
    cursor: Optional[float],
    period_years: Optional[tuple[int, int]] = None,
    sort: str = "risk",
) -> ClusterVendorsResponse:
    # Resolve category from code
    cat_row = conn.execute(
        "SELECT id, name_es, name_en FROM categories WHERE code = ?", (code,)
    ).fetchone()

    if not cat_row:
        return ClusterVendorsResponse(
            lens="categories",
            code=code,
            label_es=code,
            label_en=code,
            total=0,
            vendors=[],
            note=f"Category code '{code}' not found.",
        )

    cat_id = cat_row[0]
    label_es = cat_row[1] or code
    label_en = cat_row[2] or code

    # Count distinct vendors in this category (contracts table join), optionally
    # restricted to vendors with >=1 contract in this category during `period_years`.
    period_clause = ""
    period_params: list = []
    if period_years is not None:
        period_clause = " AND contract_year BETWEEN ? AND ?"
        period_params = list(period_years)

    total = _get_total(
        conn,
        f"SELECT COUNT(DISTINCT vendor_id) FROM contracts WHERE category_id = ? AND vendor_id IS NOT NULL{period_clause}",
        [cat_id] + period_params,
    )

    # Build a subquery: vendors that appear in this category
    # Filter via aria_queue (only vendors we have risk data for)
    cursor_clause = ""
    cursor_params: list = []
    if cursor is not None:
        cursor_clause = f"AND {_SORT_KEY[sort]} < ?"
        cursor_params = [cursor]

    offset_clause = "" if cursor is not None else f"OFFSET {offset}"

    sql = f"""
        SELECT
            v.id                           AS vendor_id,
            v.name                         AS name,
            v.size_stratification          AS size_category,
            aq.avg_risk_score              AS risk_score,
            aq.ips_tier                    AS tier,
            vs.total_contracts             AS total_contracts,
            vs.total_value_mxn             AS total_amount_mxn,
            s.code                         AS primary_sector_code,
            s.name_es                      AS primary_sector_name_es,
            s.name_en                      AS primary_sector_name_en,
            COALESCE(aq.in_ground_truth, 0) AS is_gt,
            aq.primary_pattern             AS primary_pattern,
            gcs.ghost_confidence_score     AS ghost_score,
            aq.pattern_confidences         AS pattern_confidences
        FROM (
            SELECT DISTINCT vendor_id
            FROM contracts
            WHERE category_id = ? AND vendor_id IS NOT NULL{period_clause}
        ) cat_vendors
        JOIN aria_queue aq ON aq.vendor_id = cat_vendors.vendor_id
        JOIN vendors v ON v.id = aq.vendor_id
        LEFT JOIN vendor_stats vs ON vs.vendor_id = aq.vendor_id
        LEFT JOIN sectors s ON s.id = aq.primary_sector_id
        LEFT JOIN ghost_confidence_scores gcs ON gcs.vendor_id = aq.vendor_id
        WHERE 1=1 {cursor_clause}
        {_ORDER_SQL[sort]}
        LIMIT {limit} {offset_clause}
    """

    params = [cat_id] + period_params + cursor_params
    rows = conn.execute(sql, params).fetchall()
    vendors = _build_vendor_items(conn, rows)
    next_cursor = _compute_next_cursor(rows, limit, sort)

    return ClusterVendorsResponse(
        lens="categories",
        code=code,
        label_es=label_es,
        label_en=label_en,
        total=total,
        vendors=vendors,
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# lens=terms
# ---------------------------------------------------------------------------

def _query_terms(conn: sqlite3.Connection, code: str) -> ClusterVendorsResponse:
    """Terms lens: no clean vendor-level source table exists.

    The `partida_especifica` field in contracts is a free-text code present only
    in Structure D (2023+) and has no pre-aggregated vendor mapping. Building
    a live aggregation across 3.1M rows without indexes would be too slow for
    a synchronous request. Return an empty result with a descriptive note.
    """
    return ClusterVendorsResponse(
        lens="terms",
        code=code,
        label_es=code,
        label_en=code,
        total=0,
        vendors=[],
        note=(
            "The 'terms' lens has no pre-aggregated vendor-level data. "
            "partida_especifica is only available in Structure D (2023+) "
            "and requires a dedicated ETL step to produce vendor-term rollups."
        ),
    )


# ============================================================================
# Spatial nav — Z1 (sector → institutions sub-constellation)
#
# 2026-05-09 (docs/SPATIAL_NAV_PLAN.md):
# When the user is on Atlas with lens=sectors and clicks a sector cluster,
# this endpoint provides the institutions inside that sector with a
# pre-computed (fx, fy) layout in 0..1 normalised coords. The frontend
# Z1 sub-constellation renders them as bodies in space, sized by
# total_amount_mxn and colored by avg_risk_score.
#
# Layout strategy: Halton (2,3) scatter inside a unit square, with the
# scatter centre at (0.5, 0.5). The frontend will compose this with the
# parent attractor offset so each Z1 sub-constellation is anchored at
# the position of its sector cluster on the Z0 map.
# ============================================================================


def _halton(i: int, b: int) -> float:
    """1D Halton sequence — same algorithm the frontend uses for Z0 dot lattice."""
    f = 1.0
    r = 0.0
    n = i + 1
    while n > 0:
        f /= b
        r += f * (n % b)
        n //= b
    return r


class SpatialInstitution(BaseModel):
    institution_id: int
    name: str
    institution_type: Optional[str] = None
    fx: float = Field(..., description="0..1 x position inside the sector sub-constellation")
    fy: float = Field(..., description="0..1 y position inside the sector sub-constellation")
    size: float = Field(..., description="0..1 normalised body size — sqrt(total_amount/max_amount)")
    risk: float = Field(..., description="0..1 avg risk score for sizing color encoding")
    total_contracts: int
    total_amount_mxn: float
    direct_award_pct: Optional[float] = None
    high_risk_pct: Optional[float] = None


class SectorInstitutionsSpatialResponse(BaseModel):
    sector_id: int
    sector_code: str
    sector_name_es: str
    sector_name_en: str
    total: int
    institutions: list[SpatialInstitution]
    # D15 § 3: the sector as a whole, so the page never presents the `limit`
    # rows above as the sector.
    sector_institution_count: Optional[int] = Field(None, description="Institutions assigned to this sector with at least one contract")
    sector_total_value_mxn: Optional[float] = Field(None, description="Their summed spend (institution_stats) — the denominator of every row share")
    scope: str = Field("all", description="Buyer scope of the rows and the count: federal | local | all")


def _sector_totals(cursor: sqlite3.Cursor, sector_id: int, scope_sql: str = "1 = 1",
                   scope_params: tuple = ()) -> tuple[int, float]:
    """(institution count, summed spend) over the SAME population the rows are
    drawn from: institutions assigned to the sector, canonical
    institution_stats values. A row share is then a true share and the shares
    of any subset sum to <= 100.

    Not precomputed_stats['sectors'] (the Z0 tile's contract-sector total):
    institution_stats values span all of an institution's contracts, so
    against the contract-sector total the listed rows overshoot 100 % in six
    sectors (Hacienda 132 %, Ambiente 135 %). One aggregate over the
    institution_stats table (instant); no cache needed.
    """
    row = cursor.execute(
        """
        SELECT COUNT(*) AS n, COALESCE(SUM(ist.total_value_mxn), 0) AS v
        FROM institution_stats ist
        JOIN institutions i ON i.id = ist.institution_id
        WHERE i.sector_id = ? AND ist.total_contracts > 0 AND {scope_sql}
        """.format(scope_sql=scope_sql),
        (sector_id, *scope_params),
    ).fetchone()
    return int(row["n"] or 0), float(row["v"] or 0.0)


@router.get("/sector-institutions", response_model=SectorInstitutionsSpatialResponse)
def get_sector_institutions_spatial(
    sector_id: int = Query(..., ge=1, le=12, description="Sector id 1..12"),
    limit: int = Query(60, ge=10, le=200, description="Max institutions to return"),
    min_contracts: int = Query(50, ge=0, description="Lower-bound on total_contracts"),
    scope: Optional[str] = Query(None, description="Buyer scope: federal (default) | local | estatal | municipal | all"),
    db: sqlite3.Connection = Depends(get_db_dep),
):
    """
    Returns institutions inside a sector with computed spatial coordinates
    so the frontend can render them as a sub-constellation when the user
    drills from Z0 (sector cluster) into Z1 (institutions in that sector).

    Layout: Halton(2, 3) scatter inside the unit square. Heaviest spenders
    rendered first so they sit closer to the visual centre. Frontend
    composes with the parent sector attractor (fx, fy on the Z0 map) to
    anchor the cluster spatially.
    """
    cursor = db.cursor()
    sector_row = cursor.execute(
        "SELECT id, code, name_es, name_en FROM sectors WHERE id = ?",
        (sector_id,),
    ).fetchone()
    if not sector_row:
        return SectorInstitutionsSpatialResponse(
            sector_id=sector_id,
            sector_code="otros",
            sector_name_es="Otros",
            sector_name_en="Other",
            total=0,
            institutions=[],
        )

    scope_sql, scope_params, scope = scope_predicate(db, scope, "ist.institution_id")
    sector_institution_count, sector_total_value_mxn = _sector_totals(cursor, sector_id, scope_sql, tuple(scope_params))

    rows = cursor.execute(
        """
        SELECT
            i.id, i.name, i.institution_type,
            ist.total_contracts,
            COALESCE(ist.total_value_mxn, 0) AS total_amount_mxn,
            ROUND(ist.avg_risk_score, 4) AS avg_risk,
            ROUND(ist.direct_award_pct, 4) AS direct_award_pct,
            ROUND(ist.high_risk_pct, 2) AS high_risk_pct  -- precompute: over scored contracts
        FROM institution_stats ist
        JOIN institutions i ON i.id = ist.institution_id
        WHERE i.sector_id = ?
          AND ist.total_contracts >= ?
          AND {scope_sql}
        ORDER BY ist.total_value_mxn DESC NULLS LAST, ist.total_contracts DESC
        LIMIT ?
        """.format(scope_sql=scope_sql),
        (sector_id, min_contracts, *scope_params, limit),
    ).fetchall()

    if not rows:
        return SectorInstitutionsSpatialResponse(
            sector_id=sector_id,
            sector_code=sector_row["code"],
            sector_name_es=sector_row["name_es"] or sector_row["code"],
            sector_name_en=sector_row["name_en"] or sector_row["code"],
            total=0,
            institutions=[],
            sector_institution_count=sector_institution_count,
            sector_total_value_mxn=sector_total_value_mxn,
            scope=scope,
        )

    max_amount = max((r["total_amount_mxn"] or 0) for r in rows) or 1.0

    institutions: list[SpatialInstitution] = []
    for i, r in enumerate(rows):
        # Spiral-out Halton: heaviest spenders nearer centre.
        u = _halton(i + 1, 2)
        v = _halton(i + 1, 3)
        # Centred coordinates in [-0.5, 0.5] then nudged toward (0.5, 0.5)
        # with a smaller radius for index 0, larger for tail.
        radius = 0.10 + (i / max(len(rows) - 1, 1)) * 0.40  # 0.10 .. 0.50
        angle = u * 2.0 * 3.14159265
        # Polar to cartesian, biased so the seed is reproducible by index.
        fx = 0.5 + radius * (v - 0.5) * 1.8
        fy = 0.5 + radius * (u - 0.5) * 1.8
        # Clamp to keep all bodies inside the unit square.
        fx = max(0.04, min(0.96, fx))
        fy = max(0.04, min(0.96, fy))
        size = (float(r["total_amount_mxn"] or 0) / max_amount) ** 0.5
        risk = float(r["avg_risk"] or 0)
        institutions.append(
            SpatialInstitution(
                institution_id=r["id"],
                name=r["name"],
                institution_type=r["institution_type"],
                fx=round(fx, 4),
                fy=round(fy, 4),
                size=round(max(0.18, min(1.0, size)), 4),
                risk=round(max(0.0, min(1.0, risk)), 4),
                total_contracts=int(r["total_contracts"] or 0),
                total_amount_mxn=float(r["total_amount_mxn"] or 0),
                direct_award_pct=float(r["direct_award_pct"]) if r["direct_award_pct"] is not None else None,
                high_risk_pct=float(r["high_risk_pct"]) if r["high_risk_pct"] is not None else None,
            )
        )
        # angle preserved on the variable line for clarity; not used in the
        # final placement but kept so a future revision can switch to true
        # polar layout without reorganising the loop.
        _ = angle

    return SectorInstitutionsSpatialResponse(
        sector_id=sector_id,
        sector_code=sector_row["code"],
        sector_name_es=sector_row["name_es"] or sector_row["code"],
        sector_name_en=sector_row["name_en"] or sector_row["code"],
        total=len(institutions),
        institutions=institutions,
        sector_institution_count=sector_institution_count,
        sector_total_value_mxn=sector_total_value_mxn,
        scope=scope,
    )


# ---------------------------------------------------------------------------
# «El Atlas» sky — spec .claude/designs/atlas-2026-10-02-spec.md §2.9.
# Both read only the atlas_sky_* precompute; ETag = layout_version, 304 on match.
# ---------------------------------------------------------------------------

from fastapi import Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from ..services import atlas_sky  # noqa: E402


def _sky_lv(request: Request, conn: sqlite3.Connection) -> tuple[str, Optional[Response]]:
    """ETag = sky_tag: layout_version, + «-y1» once the years backfill serves SKY3 (instruments spec §2.6)."""
    tag = atlas_sky.sky_tag(conn)
    if not tag:
        raise HTTPException(status_code=503, detail="Atlas sky precompute has not been run")
    etag = f'"{tag}"'
    if request.headers.get("if-none-match") == etag:
        return etag, Response(status_code=304, headers={"ETag": etag})
    return etag, None


@router.get("/sky/manifest")
def get_sky_manifest(request: Request, conn: sqlite3.Connection = Depends(get_db_dep)):
    """Sectors, stars (columnar), raw→canonical institution map, basis counts."""
    etag, not_modified = _sky_lv(request, conn)
    if not_modified:
        not_modified.headers["Cache-Control"] = SKY_MANIFEST_CC
        return not_modified
    raw, gz = atlas_sky.manifest_wire(conn, etag.strip('"'))
    headers = {"ETag": etag, "Cache-Control": SKY_MANIFEST_CC, "Vary": "Accept-Encoding"}
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(gz, media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(raw, media_type="application/json", headers=headers)


# 5 min fresh, then a day of serve-stale-and-revalidate (docs/PORTADA_PERF_2026-10-28.md § 4a). A bin from
# another layout answers 409 and the client refetches the manifest with cache: 'no-cache' (useSky.ts).
SKY_MANIFEST_CC = "public, max-age=300, stale-while-revalidate=86400"


@router.get("/sky/planets.bin")
def get_sky_planets(
    request: Request,
    lv: Optional[str] = Query(None, pattern=r"^\d{8}T\d{6}Z$", description="The manifest's layout_version"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Columnar body inputs (format in services/atlas_sky.py), gzipped once per worker.
    `?lv=` pins the bin to the manifest the client holds: a different served version → 409,
    so a manifest and a bin from two precompute runs can never be decoded together."""
    etag, not_modified = _sky_lv(request, conn)
    if lv is not None and lv != atlas_sky.sky_version(conn):
        raise HTTPException(status_code=409, detail="layout_version changed; refetch the manifest")
    if not_modified:
        return not_modified
    _, gz, raw = atlas_sky.cached(conn, etag.strip('"'))
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(gz, media_type="application/octet-stream",
                        headers={"ETag": etag, "Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(raw, media_type="application/octet-stream", headers={"ETag": etag})


@router.get("/sky/system")
def get_sky_system(
    request: Request,
    inst: Optional[int] = Query(None, ge=1, description="Canonical (or raw) institution id"),
    vendor: Optional[int] = Query(None, ge=1, description="Vendor id — resolves its host star"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """One star system: drawn bodies, ghosts (≤ 60), remainder by year, co-bid top-8,
    capture belts, verified groups, top-5 — spec §2.9. `?vendor=` resolves the host
    through idx_ast_vendor and echoes `focus`."""
    if (inst is None) == (vendor is None):
        raise HTTPException(status_code=422, detail="Pass exactly one of inst or vendor")
    lv = atlas_sky.sky_version(conn)
    if not lv:
        raise HTTPException(status_code=503, detail="Atlas sky precompute has not been run")
    focus = None
    if vendor is not None:
        v, host, drawn = atlas_sky.resolve_vendor(conn, vendor)
        if host is None:
            raise HTTPException(status_code=404, detail="Vendor has no ties on the chart")
        inst = host
        focus = {"vendor_id": v, "drawn": True} if drawn else atlas_sky.focus_row(conn, v, host)
    else:
        row = conn.execute("SELECT canonical_id FROM institution_canonical WHERE institution_id = ?", (inst,)).fetchone() \
            if atlas_sky._has(conn, "institution_canonical") else None
        inst = row[0] if row else inst
    data = atlas_sky.build_system(conn, inst, lv)
    if data is None:
        raise HTTPException(status_code=404, detail="Institution not on the chart")
    return JSONResponse({**data, "focus": focus}, headers={"ETag": f'"{atlas_sky.sky_tag(conn)}"'})


@router.get("/sky/kin/{planet}")
def get_sky_kin(request: Request, planet: int = Path(..., ge=1), conn: sqlite3.Connection = Depends(get_db_dep)):
    """«Parientes» of one planet (instruments spec §3.5): buyers, years at the host, co-bid partners with
    `drawn`/`host_id`, `n_cobid_not_drawn`. Lazy, PK reads; withheld names null; no RFC."""
    etag, not_modified = _sky_lv(request, conn)
    if not_modified:
        return not_modified
    data = atlas_sky.build_kin(conn, planet)
    if data is None:
        raise HTTPException(status_code=404, detail="Vendor has no ties on the chart")
    return JSONResponse(data, headers={"ETag": etag})


@router.get("/sky/layers")
def get_sky_layers(request: Request, conn: sqlite3.Connection = Depends(get_db_dep)):
    """sky-dive data layers: per-star arrays (manifest order) + bits per drawn body. Same ETag as the
    manifest. Canonical joins; withheld bodies carry no bits; no names, no RFC."""
    etag, not_modified = _sky_lv(request, conn)
    if not_modified:
        return not_modified
    return JSONResponse(atlas_sky.build_layers(conn, etag.strip('"')), headers={"ETag": etag})


@router.get("/sky/apagon")
def get_sky_apagon(
    vendor: int = Query(..., ge=1, description="Vendor id (canonical or raw)"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """A supplier's ComprasMX contracts after the blackout (post_blackout = 1), the 100 largest. Unscored;
    > 100 B rejected, > 10 B flagged. No RFC, no supplier name; a withheld supplier gets counts only."""
    if not atlas_sky._has(conn, "comprasmx_contracts"):
        raise HTTPException(status_code=503, detail="ComprasMX contracts not loaded")
    row = conn.execute("SELECT canonical_id FROM vendor_canonical WHERE vendor_id = ?", (vendor,)).fetchone() \
        if atlas_sky._has(conn, "vendor_canonical") else None
    return JSONResponse(atlas_sky.build_apagon(conn, row[0] if row else vendor),
                        headers={"Cache-Control": "public, max-age=3600"})


@router.get("/sky/contract-signals")
def get_sky_contract_signals(id: int = Query(..., ge=1, description="contracts.id"), conn: sqlite3.Connection = Depends(get_db_dep)):
    """The contract card's per-contract señales: antes del fallo (ComprasMX dates) and plazo reducido
    (licitación call shorter than the full legal minimum). Readings, not offences. No names, no RFC."""
    data = atlas_sky.contract_signals(conn, id)
    if data is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})


class SkySelectionRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=atlas_sky.SELECTION_CAP)


@router.post("/sky/selection")
def post_sky_selection(body: SkySelectionRequest, conn: sqlite3.Connection = Depends(get_db_dep)):
    """Lasso → public-basis selection (weekend E1): drawn bodies among `ids`, ranking-safe,
    with their host tie (value, contracts, years, risk indicator). Read-only; no RFC."""
    if not atlas_sky.sky_version(conn):
        raise HTTPException(status_code=503, detail="Atlas sky precompute has not been run")
    return atlas_sky.build_selection(conn, body.ids)


@router.get("/sky/band")
def get_sky_band(
    inst: int = Query(..., ge=1, description="Canonical (or raw) institution id"),
    year: int = Query(..., ge=2000, le=2030, description="Arrival year of the band segment"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Named members of one star's «resto» band for one year (weekend E2): ≤ 60 ranking-safe
    vendors by value, with totals over every member (= the system's remainder row). No RFC."""
    lv = atlas_sky.sky_version(conn)
    if not lv:
        raise HTTPException(status_code=503, detail="Atlas sky precompute has not been run")
    row = conn.execute("SELECT canonical_id FROM institution_canonical WHERE institution_id = ?", (inst,)).fetchone()         if atlas_sky._has(conn, "institution_canonical") else None
    inst = row[0] if row else inst
    return JSONResponse(atlas_sky.build_band(conn, inst, year),
                        headers={"ETag": f'"{lv}-{inst}-{year}"', "Cache-Control": "public, max-age=3600"})
