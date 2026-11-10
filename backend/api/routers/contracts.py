"""
Contract API endpoints.

Provides access to 3.1M procurement contracts with filtering,
pagination, and risk information.

Thin router — delegates business logic to ContractService.
"""
import json
import os
import sqlite3
import logging
import math
import re
import threading
import time
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Query, HTTPException, Path
from pydantic import BaseModel

from ..dependencies import get_db
from ..public_labels import DOCUMENTED_LINK_SQL, PUBLIC_LINK_SQL, amount_flag
from ..sector_pct import contract_sector_pct
from ..title_en import attach_title_en
from ..config.constants import COLUMN_ROWS_SQL, MAX_CONTRACT_VALUE, FLAG_THRESHOLD
from ..services.query_builder import QueryBuilder
from ..models.contract import (
    ContractListItem,
    ContractDetail,
    ContractListResponse,
    ContractStatistics,
    ContractRiskBreakdown,
    PaginationMeta,
)
from ..services.contract_service import contract_service, procedure_term
from ..services import vendor_canonical as vcanon
from ..services import vendor_history
from ..config.constants import DATA_LAST_YEAR


class ContractCompareResponse(BaseModel):
    data: List[ContractDetail]
    total: int
    requested: int


class RiskFeatureContribution(BaseModel):
    feature: str
    label: str
    z_score: float
    coefficient: float
    contribution: float


class RiskExplanationResponse(BaseModel):
    contract_id: int
    risk_score: Optional[float]  # NULL = not scored yet (ComprasMX, model_version 'pending_score')
    risk_level: Optional[str]
    model_version: Optional[str]
    confidence_interval: Dict[str, Optional[float]]
    explanation_available: bool
    features: List[Dict[str, Any]]
    run_id: Optional[str] = None  # calibration run the decomposition uses (CAL-v8…)
    intercept: Optional[float] = None
    logit: Optional[float] = None  # intercept + Σ of the decomposed terms only
    pu_correction: Optional[float] = None  # c_pu: indicator = min(σ(full logit) / c, 1)
    omitted_features: List[str] = []  # active-model features with no stored z column
    # v0.9.2: terms are centred on the mean scored contract; baseline_logit + Σ contribution = logit
    baseline_logit: Optional[float] = None
    model_score: Optional[float] = None  # min(σ(logit)/c_pu, 1) = risk_score_v92
    display_score: Optional[float] = None  # the stored risk_score (squashed above 0.60, _v10/score_v092.py)


class ContractOfficial(BaseModel):
    """Named-official accountability block (§1 OfficialCard graft).

    `responsible_uc` and `category_id`/name live in `SELECT c.*` but are dropped
    by the ContractDetail Pydantic model; this surfaces them additively without
    touching the hot-path detail endpoint. Every field is nullable — the card
    HIDES rows that are null (never renders a "—").
    """
    responsible_uc: Optional[str] = None
    exception_article: Optional[str] = None
    category_id: Optional[int] = None
    category_name_es: Optional[str] = None
    category_name_en: Optional[str] = None


class ContractPairContext(BaseModel):
    """Vendor↔institution relationship, computed LIVE from `contracts` (NOT the
    precomputed vendor_institution_tenure table) so count/total/rank are mutually
    consistent with the lazy pair register's pagination.total."""
    vendor_id: Optional[int] = None
    institution_id: Optional[int] = None
    total_contracts: int = 0
    total_amount_mxn: float = 0.0
    first_year: Optional[int] = None
    last_year: Optional[int] = None
    this_rank: Optional[int] = None  # 1-based rank of THIS contract by amount desc within the pair
    tied: int = 0  # OTHER pair contracts with exactly this amount (rank is shared)
    # Complete per-year aggregate of the pair (any pair size) — the plate draws
    # from this, not from the top-100 register rows (D12b § Change 4).
    by_year: List[Dict[str, Any]] = []  # [{year, n, sum, max_risk}]


class ContractEvidence(BaseModel):
    """The sourced finding behind a documented-case seal (strong-GT rows only,
    same gate as the seal) — D12b § Change 5."""
    source_reference: str
    source_url: Optional[str] = None
    evidence_tier: Optional[str] = None
    # 'summary' = a curator's paraphrase (every current row); 'quote' is
    # reserved for a verbatim excerpt — only that may be rendered in quotes.
    kind: str = "summary"


class VendorStanding(BaseModel):
    """The vendor's ARIA standing (aria_queue, one row per vendor)."""
    queue_name: Optional[str] = None  # the queue's own spelling (its search key; not "vendor_name", which the client title-cases)
    ips_tier: Optional[int] = None
    primary_pattern: Optional[str] = None
    # in_ground_truth = a DOCUMENTED case only (same rule as /vendors/{id}/ground-truth-status is_known_bad);
    # a public but unsourced link is has_unverified_lead («pista en revisión»), never «caso» (DEMO_TRUTHCHECK 11-07)
    in_ground_truth: bool = False
    has_unverified_lead: bool = False
    is_efos_definitivo: bool = False
    is_sfp_sanctioned: bool = False


# A GT source_reference is quoted on the dossier only when it is a real
# finding: long enough to be one, and not a case-level placeholder
# (PARALLAX D12b judge 2 — prod quoted "ASF PEMEX audits; case-level source_asf").
_EVIDENCE_MIN_CHARS = 60
_EVIDENCE_PLACEHOLDER = re.compile(r"case-level|source_asf|placeholder|TODO", re.IGNORECASE)


def is_quotable_reference(ref: Optional[str]) -> bool:
    ref = (ref or "").strip()
    return len(ref) >= _EVIDENCE_MIN_CHARS and not _EVIDENCE_PLACEHOLDER.search(ref)


def pick_contract_evidence(cur, contract_id: int) -> Optional["ContractEvidence"]:
    """Best quotable strong-GT finding for a contract, or None.

    Order: evidence_tier 'direct' first, then a non-empty source_url, then the
    fullest reference; the first row whose reference is quotable wins.
    """
    cur.execute(
        """SELECT gtc.source_reference, gtc.source_url, gtc.evidence_tier
           FROM ground_truth_contracts gtc
           WHERE gtc.contract_id = ?
             AND (gtc.evidence_tier = 'L1_audit_attested'
                  OR gtc.evidence_strength IN ('confirmed_corrupt', 'high', 'direct'))
             AND gtc.source_reference IS NOT NULL AND TRIM(gtc.source_reference) != ''
           ORDER BY (gtc.evidence_tier = 'direct') DESC,
                    (gtc.source_url IS NOT NULL AND TRIM(gtc.source_url) != '') DESC,
                    LENGTH(gtc.source_reference) DESC""",
        (contract_id,),
    )
    for ev in cur.fetchall():
        if is_quotable_reference(ev["source_reference"]):
            return ContractEvidence(
                source_reference=ev["source_reference"].strip(),
                source_url=(ev["source_url"] or "").strip() or None,
                evidence_tier=ev["evidence_tier"],
            )
    return None


class ContractContextResponse(BaseModel):
    """Size-in-context + relationship + named-official, all 0-ms PK / indexed
    reads. Feeds §1 OfficialCard, §3 EL COTEJO RatioBullet + rank prose + pin.
    Additive — does not alter the hot-path /contracts/{id} response."""
    contract_id: int
    amount_mxn: float
    sector_id: Optional[int] = None
    sector_name: Optional[str] = None
    sector_p99_mxn: Optional[float] = None
    sector_p50_mxn: Optional[float] = None  # sector median (the no-pair exhibit's track start)
    size_vs_p99: Optional[float] = None  # amount / p99 (the marquee "×100")
    official: ContractOfficial
    pair: ContractPairContext
    vendor_rank: Optional[int] = None          # 1-based rank by amount across ALL vendor contracts
    vendor_total_contracts: int = 0
    evidence: Optional[ContractEvidence] = None
    vendor_standing: Optional[VendorStanding] = None

logger = logging.getLogger(__name__)

# Valid risk levels for validation
VALID_RISK_LEVELS = {"low", "medium", "high", "critical"}

# Thread-safe, bounded cache for expensive aggregate queries
from ..cache import app_cache
from ..config.constants import proc_known  # DQ1 § 2
_stats_cache_name = "contracts_stats"

router = APIRouter(prefix="/contracts", tags=["contracts"])


def parse_risk_factors(factors_str: Optional[str]) -> List[str]:
    """Parse comma-separated risk factors string."""
    if not factors_str:
        return []
    return [f.strip() for f in factors_str.split(",") if f.strip()]


@router.get("", response_model=ContractListResponse)
def list_contracts(
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    # Filters
    sector_id: Optional[int] = Query(None, ge=1, le=12, description="Filter by sector ID (1-12)"),
    year: Optional[int] = Query(None, ge=2002, le=2026, description="Filter by contract year"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month of contract_date (1-12); needs year"),
    column_rows: bool = Query(False, description="Only the rows /sexenios/columna counts: CompraNet (no ComprasMX 'E'), 0 < amount <= 100B"),
    vendor_id: Optional[int] = Query(None, description="Filter by vendor ID"),
    institution_id: Optional[int] = Query(None, description="Filter by institution ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level (low/medium/high/critical)"),
    risk_level_min: Optional[str] = Query(None, description="Risk floor: this level and above (e.g. high = high + critical)"),
    is_direct_award: Optional[bool] = Query(None, description="Filter direct awards"),
    is_single_bid: Optional[bool] = Query(None, description="Filter competitive contracts whose procedure has one recorded winner (winners, not bidders)"),
    risk_factor: Optional[str] = Query(None, description="Filter by risk factor (e.g., co_bid, price_hyp, direct_award)"),
    category_id: Optional[int] = Query(None, description="Filter by spending category (partida) ID"),
    min_amount: Optional[float] = Query(None, ge=0, description="Minimum contract amount"),
    max_amount: Optional[float] = Query(None, le=100_000_000_000, description="Maximum contract amount"),
    search: Optional[str] = Query(None, min_length=3, max_length=100, description="Search in title/description; an exact procedure number lists that procedure"),
    procedure_number: Optional[str] = Query(None, min_length=3, max_length=100, description="Exact procedure number"),
    # Sorting
    sort_by: str = Query("contract_date", description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
):
    """
    List contracts with filtering and pagination.

    Supports filtering by sector, year, vendor, institution, risk level,
    procedure type flags, and amount range. Search in title/description.

    **Performance note**: This endpoint returns paginated results from 3.1M contracts.
    Always use filters to narrow results for better performance.
    """
    if month is not None and year is None:
        raise HTTPException(status_code=400, detail="month needs year")
    # Validate max_amount against system maximum
    if max_amount is not None and max_amount > MAX_CONTRACT_VALUE:
        raise HTTPException(
            status_code=422,
            detail=f"max_amount exceeds maximum allowed value of {MAX_CONTRACT_VALUE}",
        )

    # Validate risk_level / risk_level_min before database operations
    if risk_level_min is not None and risk_level_min.lower() not in VALID_RISK_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid risk_level_min '{risk_level_min}'. Must be one of: {', '.join(sorted(VALID_RISK_LEVELS))}"
        )
    if risk_level is not None:
        if risk_level.lower() not in VALID_RISK_LEVELS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid risk_level '{risk_level}'. Must be one of: {', '.join(sorted(VALID_RISK_LEVELS))}"
            )

    with get_db() as conn:
        if search:
            # LIKE '%..%' over 3.1M titles/descriptions is a full scan (10-17 s for a miss);
            # stop it at SEARCH_BUDGET_S so one visitor can't hold a worker. ponytail: FTS5 if search grows.
            deadline = time.monotonic() + SEARCH_BUDGET_S
            conn.set_progress_handler(lambda: time.monotonic() > deadline, 100_000)
        try:
            result = contract_service.list_contracts(
                conn,
                page=page,
                per_page=per_page,
                sector_id=sector_id,
                year=year,
                month=month,
                column_rows=column_rows,
                vendor_id=vendor_id,
                institution_id=institution_id,
                risk_level=risk_level,
                risk_level_min=risk_level_min,
                is_direct_award=is_direct_award,
                is_single_bid=is_single_bid,
                risk_factor=risk_factor,
                category_id=category_id,
                min_amount=min_amount,
                max_amount=max_amount,
                search=search,
                procedure_number=procedure_number,
                sort_by=sort_by,
                sort_order=sort_order,
            )
        except sqlite3.OperationalError as e:
            if "interrupt" not in str(e):
                raise
            raise HTTPException(status_code=422, detail="Search too broad: add a sector, year, vendor or institution filter.")
        finally:
            # the budget covers the list query only, not amount_flag/stamping below
            conn.set_progress_handler(None, 0)

        # Only > 1B rows hit the cached per-vendor suspect set (public_labels.amount_flag).
        for item in result.data:
            item["amount_flag"] = amount_flag(conn, item["id"], item.get("amount_mxn"), item.get("vendor_id"))
        vendor_history.stamp_contract_rows(conn, result.data)
        attach_title_en(conn, result.data)
        return ContractListResponse(
            data=[ContractListItem(**item) for item in result.data],
            pagination=PaginationMeta(**result.pagination),
        )



@router.get("/highlights", response_model=List[ContractListItem])
def contract_highlights(
    sector_id: Optional[int] = Query(None, ge=1, le=12, description="Filter by sector ID (1-12)"),
    year: Optional[int] = Query(None, ge=2002, le=2026, description="Filter by contract year"),
    vendor_id: Optional[int] = Query(None, description="Filter by vendor ID"),
    institution_id: Optional[int] = Query(None, description="Filter by institution ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    risk_level_min: Optional[str] = Query(None, description="Risk floor: this level and above"),
    is_direct_award: Optional[bool] = Query(None, description="Filter direct awards"),
    is_single_bid: Optional[bool] = Query(None, description="Filter competitive contracts whose procedure has one recorded winner (winners, not bidders)"),
    risk_factor: Optional[str] = Query(None, description="Filter by risk factor"),
    category_id: Optional[int] = Query(None, description="Filter by spending category (partida) ID"),
    min_amount: Optional[float] = Query(None, ge=0, description="Minimum contract amount"),
    max_amount: Optional[float] = Query(None, le=100_000_000_000, description="Maximum contract amount"),
    limit: int = Query(8, ge=1, le=12, description="Number of highlighted contracts (max 12)"),
):
    """Top contracts by risk for the current filter — feeds the "Los Señalados" band.

    Same filters as the list endpoint, but no free-text search, pagination, or
    custom sort: results are always the highest-risk contracts matching the
    filter, with the documented-case seal so the band can lead with named cases.
    One lightweight query (LIMIT ~8); the frontend re-orders documented-first.
    """
    if risk_level_min is not None and risk_level_min.lower() not in VALID_RISK_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid risk_level_min '{risk_level_min}'. Must be one of: {', '.join(sorted(VALID_RISK_LEVELS))}",
        )
    if risk_level is not None and risk_level.lower() not in VALID_RISK_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid risk_level '{risk_level}'. Must be one of: {', '.join(sorted(VALID_RISK_LEVELS))}",
        )
    if max_amount is not None and max_amount > MAX_CONTRACT_VALUE:
        raise HTTPException(
            status_code=422,
            detail=f"max_amount exceeds maximum allowed value of {MAX_CONTRACT_VALUE}",
        )

    with get_db() as conn:
        rows = contract_service.highlights(
            conn,
            sector_id=sector_id,
            year=year,
            vendor_id=vendor_id,
            institution_id=institution_id,
            risk_level=risk_level,
            risk_level_min=risk_level_min,
            is_direct_award=is_direct_award,
            is_single_bid=is_single_bid,
            risk_factor=risk_factor,
            category_id=category_id,
            min_amount=min_amount,
            max_amount=max_amount,
            limit=limit,
        )
        vendor_history.stamp_contract_rows(conn, rows)
        attach_title_en(conn, rows)
        return [ContractListItem(**item) for item in rows]


@router.get("/statistics", response_model=ContractStatistics)
def get_contract_statistics(
    sector_id: Optional[int] = Query(None, ge=1, le=12, description="Filter by sector ID (1-12)"),
    year: Optional[int] = Query(None, ge=2002, le=2026, description="Filter by year"),
):
    """
    Get aggregate contract statistics.

    Returns total counts, values, and breakdowns by risk level and procedure type.
    Optionally filter by sector and/or year.
    """
    cache_key = f"stats:{sector_id}:{year}"
    cached = app_cache.get(_stats_cache_name, cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        # Fast path for unfiltered case: use precomputed stats
        if sector_id is None and year is None:
            import json as _json
            ov_row = conn.execute(
                "SELECT stat_value FROM precomputed_stats WHERE stat_key = 'overview'"
            ).fetchone()
            rd_row = conn.execute(
                "SELECT stat_value FROM precomputed_stats WHERE stat_key = 'risk_distribution'"
            ).fetchone()
            if ov_row and rd_row:
                ov = _json.loads(ov_row[0])
                rd_raw = _json.loads(rd_row[0])
                if isinstance(rd_raw, dict):
                    rd = {level: v.get("count", 0) for level, v in rd_raw.items()}
                else:
                    rd = {r["risk_level"]: r["count"] for r in rd_raw}
                total = ov.get("total_contracts", 0)
                total_val = ov.get("total_value_mxn", 0)
                da_pct = ov.get("direct_award_pct")
                sb_pct = ov.get("single_bid_pct")
                result = ContractStatistics(
                    total_contracts=total,
                    total_value_mxn=total_val,
                    avg_contract_value=round(total_val / total, 2) if total > 0 else 0,
                    low_risk_count=rd.get("low", 0),
                    medium_risk_count=rd.get("medium", 0),
                    high_risk_count=rd.get("high", 0),
                    critical_risk_count=rd.get("critical", 0),
                    direct_award_count=round(da_pct * total / 100) if da_pct is not None else None,
                    direct_award_pct=da_pct,
                    single_bid_count=round(sb_pct * total / 100) if sb_pct is not None else None,
                    single_bid_pct=sb_pct,
                    min_year=ov.get("min_year", 2002),
                    max_year=ov.get("max_year", DATA_LAST_YEAR),
                )
                app_cache.set(_stats_cache_name, cache_key, result, maxsize=64, ttl=600)
                return result

        stats = contract_service.get_contract_statistics(
            conn, sector_id=sector_id, year=year,
        )
        result = ContractStatistics(**stats)
        app_cache.set(_stats_cache_name, cache_key, result, maxsize=64, ttl=600)
        return result


# ── /contracts/field — «La escalera de montos» (the amount ladder) ──────────
# Histogram (year × quarter-decade amount bin) + the N largest contracts as
# columns. bin = floor(4·log10(amount)); -1 = no valid amount (null, ≤ 0 or
# > 100B, rejected by the data rule). The sector/year/DA/risk filters are
# answered from one cached cube (a full scan is 20–70 s on 3.1M rows);
# institution/vendor/search run live (index-selective) and are cached per key.
SEARCH_BUDGET_S = float(os.environ.get("RUBLI_SEARCH_BUDGET_S", "6"))  # prod SSD; raise it on a slow local disk
_FIELD_CACHE = "contracts_field"
_FIELD_LOCK = threading.Lock()
_BIN = (f"CASE WHEN c.amount_mxn > 0 AND c.amount_mxn <= {MAX_CONTRACT_VALUE} "
        "THEN MAX(0, CAST(4 * log10(c.amount_mxn) AS INTEGER)) ELSE -1 END")  # < 1 peso → bin 0
_VAL = f"SUM(CASE WHEN c.amount_mxn > 0 AND c.amount_mxn <= {MAX_CONTRACT_VALUE} THEN c.amount_mxn END)"


def _ensure_log10(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("SELECT log10(10)")
    except sqlite3.OperationalError:  # sqlite built without math functions
        conn.create_function("log10", 1, lambda v: math.log10(v) if v and v > 0 else None, deterministic=True)


_FIELD_FIRST_YEAR = 2002  # = precompute_stats.FIRST_YEAR: /contracts and the Portada count the same rows


def scan_field_cube(conn: sqlite3.Connection) -> list:
    """[(year, bin, sector_id, is_direct_award, risk_level, n, value)] over every contract."""
    _ensure_log10(conn)
    return [tuple(r) for r in conn.execute(
        f"SELECT c.contract_year, {_BIN}, c.sector_id, c.is_direct_award, c.risk_level, COUNT(*), {_VAL} "
        "FROM contracts c NOT INDEXED GROUP BY 1, 2, 3, 4, 5"
    )]


def _field_cube(conn: sqlite3.Connection) -> list:
    cube = app_cache.get(_FIELD_CACHE, "cube")
    if cube is not None:
        return cube
    with _FIELD_LOCK:
        cube = app_cache.get(_FIELD_CACHE, "cube")
        if cube is None:
            # The cache is per gunicorn worker (6 in prod, recycled by max-requests), so
            # each one paid the 20–70 s scan; precompute_stats stores the cube for all.
            try:
                row = conn.execute(
                    "SELECT stat_value FROM precomputed_stats WHERE stat_key = 'contracts_field_cube'"
                ).fetchone()
            except sqlite3.OperationalError:  # no precomputed_stats table (fixture DBs)
                row = None
            cube = [tuple(r) for r in json.loads(row[0])] if row else scan_field_cube(conn)
            app_cache.set(_FIELD_CACHE, "cube", cube, maxsize=64, ttl=86400)
    return cube


@router.get("/field")
def contracts_field(
    sector_id: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2002, le=2026),
    is_direct_award: Optional[bool] = Query(None),
    risk_level: Optional[str] = Query(None, pattern="^(low|medium|high|critical)$"),
    institution_id: Optional[int] = Query(None, ge=1),
    vendor_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None, min_length=3, max_length=100),
    limit: int = Query(3000, ge=1, le=5000, description="Largest contracts returned as marks (max 5,000)"),
    min_amount: Optional[float] = Query(None, ge=0, description="Marks only: a rung's floor (histogram unaffected)"),
    max_amount: Optional[float] = Query(None, gt=0, le=MAX_CONTRACT_VALUE, description="Marks only: a rung's ceiling, exclusive"),
):
    """The amount ladder for the active filter: histogram + the `limit` largest contracts.

    `hist` rows = [year, bin, n, critical, direct_award, value, scored] — scored = rows with a
    risk indicator (ComprasMX loads unscored), the denominator of the critical share. `col` = parallel
    columns of the marks, largest first: id, amount (> 100B never present),
    date, risk (indicator), sector, da, flag (1 when amount > 10B, review).
    With min_amount/max_amount (a zoomed rung) the marks are an even id-sample
    of that range instead of its top rows; the histogram stays the full filter.
    """
    key = f"{sector_id}:{year}:{is_direct_award}:{risk_level}:{institution_id}:{vendor_id}:{(search or '').lower()}:{limit}:{min_amount}:{max_amount}"
    hit = app_cache.get(_FIELD_CACHE, key)
    if hit is not None:
        return hit

    def filtered() -> QueryBuilder:  # same semantics as the list endpoint's filters
        qb = QueryBuilder("contracts c")
        # the 20 rows dated 2000–01 stay out, as in every public aggregate (precompute_stats FIRST_YEAR, C8/D32)
        qb.where("c.contract_year >= ?", _FIELD_FIRST_YEAR)
        qb.filter_sector(sector_id, column="c.sector_id")
        qb.filter_year(year, column="c.contract_year")
        qb.filter_boolean(is_direct_award, column="c.is_direct_award")
        qb.filter_risk_level(risk_level, column="c.risk_level")
        if institution_id is not None:
            qb.where("c.institution_id = ?", institution_id)
        if vendor_id is not None:
            qb.where("c.vendor_id = ?", vendor_id)
        if proc:  # an exact procedure number lists that procedure, as on the list endpoint
            return qb.where("c.procedure_number IN (?, ?)", proc, proc.upper())
        return qb.filter_search(search, ["c.title", "c.description"])

    acc: Dict[tuple, list] = {}
    with get_db() as conn:
        proc = procedure_term(conn, search)
        if institution_id is None and vendor_id is None and not search:
            for y, b, s, da, lvl, n, v in _field_cube(conn):
                if y is None or y < _FIELD_FIRST_YEAR                         or (sector_id is not None and s != sector_id) or (year is not None and y != year) \
                        or (is_direct_award is not None and (da == 1) != is_direct_award) \
                        or (risk_level is not None and lvl != risk_level):
                    continue
                a = acc.setdefault((y, b), [0, 0, 0, 0.0, 0])
                a[0] += n
                a[1] += n if lvl == "critical" else 0
                a[2] += n if da == 1 else 0
                a[3] += v or 0.0
                a[4] += n if lvl is not None else 0  # risk_level is NULL exactly when unscored
        else:
            _ensure_log10(conn)
            sql, params = filtered().group_by("1, 2").build_select(
                f"c.contract_year, {_BIN}, COUNT(*), SUM(c.risk_level = 'critical'), SUM({proc_known('c.is_direct_award', 'c.contract_year')} = 1), {_VAL}, COUNT(c.risk_level)")
            for y, b, n, k, da, v, sc in conn.execute(sql, params):
                acc[(y, b)] = [n, k or 0, da or 0, v or 0.0, sc or 0]

        qb = filtered()
        qb.where("c.amount_mxn > 0 AND c.amount_mxn <= ?", MAX_CONTRACT_VALUE)
        if min_amount is not None or max_amount is not None:
            lo, hi = min_amount or 0.0, max_amount or MAX_CONTRACT_VALUE + 1
            qb.where("c.amount_mxn >= ? AND c.amount_mxn < ?", lo, hi)
            in_range = sum(a[0] for (_, b), a in acc.items() if b >= 0 and lo <= 10 ** (b / 4) < hi)
            if in_range > 2 * limit:  # ponytail: id-modulo sample, uniform enough for a dot cloud
                qb.where("c.id % ? = 0", in_range // limit)
        qb.order_by("c.amount_mxn DESC").limit(limit)
        sql, params = qb.build_select(
            "c.id, c.amount_mxn, c.contract_date, c.risk_score, c.sector_id, c.is_direct_award")
        rows = conn.execute(sql, params).fetchall()

    hist = [[y, b, *a[:3], round(a[3], 2), a[4]] for (y, b), a in sorted(acc.items(), key=lambda kv: (kv[0][0] or 0, kv[0][1]))]
    col = {
        "id": [r[0] for r in rows],
        "amount": [round(r[1], 2) for r in rows],
        "date": [r[2] for r in rows],
        "risk": [None if r[3] is None else round(r[3], 4) for r in rows],
        "sector": [r[4] for r in rows],
        "da": [None if r[5] is None else (1 if r[5] == 1 else 0) for r in rows],  # None: procedure not recorded (DQ1 § 2)
        "flag": [1 if r[1] > FLAG_THRESHOLD else 0 for r in rows],
    }
    out = {
        "total": sum(h[2] for h in hist),
        "value": round(sum(h[5] for h in hist), 2),
        "cap": limit,
        "n": len(rows),
        "hist": hist,
        "col": col,
    }
    app_cache.set(_FIELD_CACHE, key, out, maxsize=64, ttl=86400)
    return out


@router.get("/by-category")
def contracts_by_category(
    year: int = Query(..., ge=2002, le=2026),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    """«¿En qué se gastó?» (/administrations, W7): a year's (or one month's) money by spending category, largest
    first. Same rows as /sexenios/columna (CompraNet only, 0 < amount <= 100B, dated), so the split adds up to the
    year's slab. category_id null = the record carries no category."""
    key = f"bycat:{year}:{month}"
    hit = app_cache.get(_FIELD_CACHE, key)
    if hit is not None:
        return hit
    sql = ("SELECT c.category_id, k.name_es, k.name_en, COUNT(*), SUM(c.amount_mxn) FROM contracts c "
           "LEFT JOIN categories k ON k.id = c.category_id "
           f"WHERE c.contract_year = ? AND {COLUMN_ROWS_SQL}")
    params: list = [year]
    if month is not None:
        sql += " AND substr(c.contract_date, 6, 2) = ?"
        params.append(f"{month:02d}")
    with get_db() as conn:
        rows = conn.execute(sql + " GROUP BY c.category_id ORDER BY 5 DESC", params).fetchall()
    out = {
        "year": year, "month": month,
        "contracts": sum(r[3] for r in rows), "value": round(sum(r[4] or 0 for r in rows), 2),
        "rows": [{"category_id": r[0], "name_es": r[1], "name_en": r[2], "contracts": r[3], "value": round(r[4] or 0, 2)}
                 for r in rows],
    }
    app_cache.set(_FIELD_CACHE, key, out, maxsize=64, ttl=86400)
    return out


@router.get("/compare", response_model=ContractCompareResponse)
def compare_contracts(
    ids: str = Query(..., description="Comma-separated contract IDs (max 10)"),
):
    """
    Compare multiple contracts side-by-side.

    Accepts up to 10 comma-separated contract IDs and returns their details
    for comparison.
    """
    try:
        contract_ids = [int(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid contract IDs. Must be comma-separated integers.")

    if not contract_ids:
        raise HTTPException(status_code=400, detail="At least one contract ID is required.")
    if len(contract_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 contracts can be compared at once.")

    with get_db() as conn:
        rows = contract_service.get_contracts_by_ids(conn, contract_ids)
        results = []
        for detail in rows:
            detail["is_direct_award"] = bool(detail.get("is_direct_award"))
            detail["is_single_bid"] = bool(detail.get("is_single_bid"))
            detail["is_framework"] = bool(detail.get("is_framework"))
            detail["is_consolidated"] = bool(detail.get("is_consolidated"))
            detail["is_multiannual"] = bool(detail.get("is_multiannual"))
            detail["is_high_value"] = bool(detail.get("is_high_value"))
            detail["is_year_end"] = bool(detail.get("is_year_end"))
            detail["amount_mxn"] = detail.get("amount_mxn") or 0
            detail["risk_factors"] = parse_risk_factors(detail.get("risk_factors"))
            detail["amount_flag"] = amount_flag(
                conn, detail.get("id"), detail["amount_mxn"], detail.get("vendor_id")
            )
            results.append(ContractDetail(**detail))

        return {"data": results, "total": len(results), "requested": len(contract_ids)}


_FEATURE_LABELS = {
    "z_single_bid": "Single award (one vendor won the tender)",
    "z_direct_award": "Direct Award procedure",
    "z_price_ratio": "Amount vs similar contracts",
    "z_vendor_concentration": "Vendor market concentration",
    "z_ad_period_days": "Advertisement period length",
    "z_year_end": "Year-end contract timing",
    "z_same_day_count": "Same-day contract cluster",
    "z_network_member_count": "Vendor network size",
    "z_co_bid_rate": "Co-bidding rate",
    "z_price_hyp_confidence": "Amount-outlier confidence",
    "z_industry_mismatch": "Industry mismatch",
    "z_institution_risk": "Institution risk baseline",
    "z_price_volatility": "Very uneven contract sizes",
    "z_institution_diversity": "Institution diversity",
    "z_win_rate": "Win rate vs sector",
    "z_sector_spread": "Cross-sector spread",
}

_Z_FEATURE_COLS = list(_FEATURE_LABELS.keys())


@router.get("/{contract_id}/features", response_model=RiskExplanationResponse)
def get_contract_features(
    contract_id: int = Path(..., description="Contract ID"),
):
    """
    Get z-score features for a contract with human-readable labels.

    Returns each of the 16 z-score features computed for the v0.6.5 risk model (9 active),
    sorted by absolute z-score (most anomalous first). Includes a rough
    percentile estimate and direction indicator (high_risk/low_risk).

    If the contract_z_features table is empty or has no row for this contract,
    returns explanation_available=False with an empty features list.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # Get contract risk info
        cursor.execute("""
            SELECT id, risk_score, risk_level, risk_model_version,
                   risk_confidence_lower, risk_confidence_upper
            FROM contracts WHERE id = ?
        """, (contract_id,))
        contract_row = cursor.fetchone()
        if contract_row is None:
            raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")

        # Try to get z-score features
        col_list = ", ".join(_Z_FEATURE_COLS)
        try:
            cursor.execute(
                f"SELECT {col_list} FROM contract_z_features WHERE contract_id = ?",
                (contract_id,),
            )
            feat_row = cursor.fetchone()
        except sqlite3.OperationalError:
            feat_row = None

        explanation_available = feat_row is not None
        features = []

        if explanation_available:
            for col in _Z_FEATURE_COLS:
                z = feat_row[col]
                if z is None:
                    continue
                # Rough percentile from z-score (normal dist approximation)
                percentile = int(min(99, max(1, 50 + z * 15.87)))
                direction = "high_risk" if z > 0 else "low_risk"
                features.append({
                    "feature": col,
                    "label": _FEATURE_LABELS[col],
                    "z_score": round(z, 4),
                    "direction": direction,
                    "percentile": percentile,
                })
            # Sort by abs(z_score) descending
            features.sort(key=lambda f: abs(f["z_score"]), reverse=True)

        return RiskExplanationResponse(
            contract_id=contract_row["id"],
            risk_score=contract_row["risk_score"],
            risk_level=contract_row["risk_level"] or ("unknown" if contract_row["risk_score"] is not None else None),
            model_version=contract_row["risk_model_version"],
            confidence_interval={
                "lower": contract_row["risk_confidence_lower"],
                "upper": contract_row["risk_confidence_upper"],
            },
            explanation_available=explanation_available,
            features=features,
        )


@router.get("/{contract_id}", response_model=ContractDetail)
def get_contract(
    contract_id: int = Path(..., description="Contract ID"),
):
    """
    Get detailed information for a specific contract.

    Returns all contract fields including full risk breakdown,
    related entity information, and data quality metrics.
    """
    with get_db() as conn:
        detail = contract_service.get_contract_detail(conn, contract_id)

        if detail is None:
            raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")

        # Convert boolean flags and parse risk_factors from the raw dict
        detail["is_direct_award"] = bool(detail.get("is_direct_award"))
        detail["is_single_bid"] = bool(detail.get("is_single_bid"))
        detail["is_framework"] = bool(detail.get("is_framework"))
        detail["is_consolidated"] = bool(detail.get("is_consolidated"))
        detail["is_multiannual"] = bool(detail.get("is_multiannual"))
        detail["is_high_value"] = bool(detail.get("is_high_value"))
        detail["is_year_end"] = bool(detail.get("is_year_end"))
        detail["amount_mxn"] = detail.get("amount_mxn") or 0
        detail["risk_factors"] = parse_risk_factors(detail.get("risk_factors"))

        # Derive PyOD outlier flag from ensemble_anomaly_score (threshold 0.2598)
        eas = detail.get("ensemble_anomaly_score")
        detail["pyod_is_outlier"] = bool(eas >= 0.2598) if eas is not None else None
        detail["amount_flag"] = amount_flag(
            conn, contract_id, detail["amount_mxn"], detail.get("vendor_id")
        )
        detail["thin_history"] = vendor_history.contract_thin_history(
            conn, detail.get("vendor_id"), detail.get("contract_year")
        )

        detail["sector_pct"] = contract_sector_pct(conn, contract_id)

        attach_title_en(conn, [detail])
        return ContractDetail(**detail)


@router.get("/{contract_id}/risk", response_model=ContractRiskBreakdown)
def get_contract_risk(
    contract_id: int = Path(..., description="Contract ID"),
):
    """
    Get risk score breakdown for a specific contract.

    Returns the overall risk score and individual factor contributions.
    """
    try:
        with get_db() as conn:
            cursor = conn.cursor()

            query = """
                SELECT
                    id, risk_score, risk_level,
                    risk_confidence_lower AS risk_confidence,
                    risk_factors,
                    is_direct_award, is_single_bid, is_year_end, amount_mxn
                FROM contracts
                WHERE id = ?
            """
            cursor.execute(query, (contract_id,))
            row = cursor.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")

            # Parse risk factors into detailed breakdown
            factors_str = row[4] or ""
            factors = []

            # Map factor codes to descriptions and weights (v0.6.5 global coefficients)
            # Source: CAL-v6.1-202603251039, C=0.01, l1_ratio=0.9673 — DB-verified 2026-04-20
            factor_info = {
                # Behavioral factors (active)
                "price_volatility": ("Very uneven contract sizes", 0.5343, "Behavioral"),
                "institution_diversity": ("Institution Diversity", -0.2736, "Behavioral"),
                "vendor_concentration": ("Vendor Concentration", 0.2736, "Behavioral"),
                "win_rate": ("Win Rate", 0.0, "Behavioral"),
                # Procedure factors (active)
                "direct_award": ("Direct Award", 0.0306, "Procedure"),
                "ad_period_days": ("Ad Period Duration", 0.0781, "Procedure"),
                "single_bid": ("Single award", 0.0587, "Procedure"),
                # Pricing factors (active)
                "price_ratio": ("Amount vs similar contracts", 0.4159, "Pricing"),
                # Network factors (active)
                "network_member_count": ("Network Member Count", 0.1404, "Network"),
                # Timing factors (active)
                "same_day_count": ("Same-Day Contracts", 0.1084, "Timing"),
                # Zeroed by regularization or sign constraints
                "sector_spread": ("Sector Spread", 0.0, "Behavioral"),
                "price_hyp_confidence": ("Amount-outlier confidence", 0.0, "Pricing"),
                "co_bid_rate": ("Co-Bidding Rate", 0.0, "Network"),
                "industry_mismatch": ("Industry-Sector Mismatch", 0.0, "Network"),
                "year_end": ("Year-End Timing", 0.0, "Timing"),
                "institution_risk": ("Institution Risk Baseline", 0.0, "Timing"),
            }

            for factor in factors_str.split(","):
                factor = factor.strip()
                if not factor:
                    continue

                # Handle dynamic factors
                if factor.startswith("industry_mismatch:"):
                    factors.append({
                        "code": factor,
                        "name": "Industry-Sector Mismatch",
                        "description": f"Vendor industry doesn't match sector ({factor.split(':')[1]})",
                        "weight": 0.03,
                    })
                elif factor.startswith("inst_risk:"):
                    inst_type = factor.split(":")[1]
                    factors.append({
                        "code": factor,
                        "name": "Institution Risk Baseline",
                        "description": f"Higher risk institution type: {inst_type}",
                        "weight": 0.03,
                    })
                elif factor.startswith("co_bid_high:"):
                    # Legacy co-bidding high risk - e.g., co_bid_high:85%:3p
                    parts = factor.split(":")
                    rate = parts[1] if len(parts) > 1 else "?"
                    partners = parts[2] if len(parts) > 2 else "?"
                    factors.append({
                        "code": factor,
                        "name": "High Co-Bidding Risk",
                        "description": f"Vendor appears in {rate} of procedures with same partners ({partners})",
                        "weight": 0.05,
                        "icon": "users",
                        "severity": "high",
                    })
                elif factor.startswith("co_bid_med:"):
                    parts = factor.split(":")
                    rate = parts[1] if len(parts) > 1 else "?"
                    partners = parts[2] if len(parts) > 2 else "?"
                    factors.append({
                        "code": factor,
                        "name": "Medium Co-Bidding Risk",
                        "description": f"Vendor appears in {rate} of procedures with same partners ({partners})",
                        "weight": 0.03,
                        "icon": "users",
                        "severity": "medium",
                    })
                elif factor.startswith("price_hyp:"):
                    # Legacy price hypothesis - e.g., price_hyp:extreme_overpricing:0.95
                    parts = factor.split(":")
                    hyp_type = parts[1] if len(parts) > 1 else "unknown"
                    confidence = parts[2] if len(parts) > 2 else "?"
                    factors.append({
                        "code": factor,
                        "name": "Amount Outlier Detected",
                        "description": f"Statistical outlier: {hyp_type.replace('_', ' ')} (confidence: {confidence})",
                        "weight": 0.05,
                        "icon": "dollar-sign",
                        "severity": "high",
                    })
                elif factor.startswith("split_"):
                    # Dynamic split factors - e.g., split_5, split_3
                    count_str = factor.split("_")[1] if "_" in factor else "?"
                    try:
                        count_int = int(count_str)
                    except ValueError:
                        count_int = 1
                    factors.append({
                        "code": factor,
                        "name": f"Threshold Splitting ({count_str} contracts)",
                        "description": f"{count_str} contracts to same vendor on same day",
                        "weight": 0.05 if count_int >= 5 else 0.03,
                        "icon": "scissors",
                    })
                elif factor.startswith("network_"):
                    # Dynamic network factors - e.g., network_5
                    count_str = factor.split("_")[1] if "_" in factor else "?"
                    try:
                        count_int = int(count_str)
                    except ValueError:
                        count_int = 1
                    factors.append({
                        "code": factor,
                        "name": f"Network Risk ({count_str} related vendors)",
                        "description": f"Vendor is in a group of {count_str} related entities",
                        "weight": 0.05 if count_int >= 5 else 0.03,
                        "icon": "git-branch",
                    })
                elif factor in factor_info:
                    name, coefficient, category = factor_info[factor]
                    factors.append({
                        "code": factor,
                        "name": name,
                        "description": name,
                        "weight": abs(coefficient),
                        "category": category,
                    })
                else:
                    factors.append({
                        "code": factor,
                        "name": factor.replace("_", " ").title(),
                        "description": factor,
                        "weight": 0.0,
                    })

            return ContractRiskBreakdown(
                contract_id=row[0],
                risk_score=row[1] or 0,
                risk_level=row[2] or "unknown",
                risk_confidence=row[3],
                factors=factors,
            )

    except sqlite3.Error as e:
        logger.error(f"Database error in get_contract_risk: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")


@router.get("/{contract_id}/risk-explain", response_model=RiskExplanationResponse)
def get_contract_risk_explain(
    contract_id: int = Path(..., description="Contract ID"),
):
    """
    Get v5.0 risk score explanation with per-feature contributions.

    For each of the 16 z-score features, returns:
    - z_score: how anomalous this contract is for this feature
    - coefficient: model weight (beta) for this feature
    - contribution: beta * z_score (impact on log-odds)

    Features are sorted by absolute contribution (most impactful first).
    """
    try:
        with get_db() as conn:
            result = contract_service.get_risk_explanation(conn, contract_id)
            if result is None:
                raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")
            return result
    except sqlite3.Error as e:
        logger.error(f"Database error in get_contract_risk_explain: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")


@router.get("/{contract_id}/context", response_model=ContractContextResponse)
def get_contract_context(
    contract_id: int = Path(..., description="Contract ID"),
):
    """Size-in-context, vendor↔institution relationship, and named-official block.

    Bundles the dormant assets the canonical contract dossier needs (DESIGNUS
    "El Cotejo", Day-6 polish) into ONE additive call, all PK / vendor-indexed
    reads (~15-30 ms total, no hot-path change):

    - `sector_p99_mxn` / `size_vs_p99` — sector_price_baselines.percentile_99
      (the §3 RatioBullet "×N vs the sector 99th percentile").
    - `pair` — COUNT/SUM/MIN(year) + this contract's rank, computed LIVE from
      `contracts` (so it matches the lazy register's pagination.total exactly —
      the precomputed tenure table drifts ~0.8% and is deliberately NOT used).
    - `official` — responsible_uc / exception_article / category name, which
      `SELECT c.*` carries but ContractDetail drops.

    Every field is nullable; the frontend hides any block whose data is absent
    (Structure-A contracts, vendors with no pair history, etc.).
    """
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT c.id, c.amount_mxn, c.sector_id, c.vendor_id, c.institution_id,
                       c.responsible_uc, c.exception_article, c.category_id,
                       s.name_es AS sector_name,
                       cat.name_es AS category_name_es, cat.name_en AS category_name_en
                FROM contracts c
                LEFT JOIN sectors s ON c.sector_id = s.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.id = ?
                """,
                (contract_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")

            amount = row["amount_mxn"] or 0.0
            sector_id = row["sector_id"]
            vendor_id = row["vendor_id"]
            institution_id = row["institution_id"]

            # Sector p99 — all-years / all-types baseline (year column is NULL on
            # the deploy row; 'all' is the only contract_type present).
            sector_p99 = None
            sector_p50 = None
            size_vs_p99 = None
            if sector_id is not None:
                cur.execute(
                    """SELECT percentile_99, percentile_50 FROM sector_price_baselines
                       WHERE sector_id = ? AND contract_type = 'all'
                       ORDER BY (year IS NULL) DESC LIMIT 1""",
                    (sector_id,),
                )
                p99_row = cur.fetchone()
                if p99_row and p99_row["percentile_50"]:
                    sector_p50 = float(p99_row["percentile_50"])
                if p99_row and p99_row["percentile_99"]:
                    sector_p99 = float(p99_row["percentile_99"])
                    if sector_p99 > 0 and amount > 0:
                        size_vs_p99 = amount / sector_p99

            # Pair context — LIVE aggregate (idx_c_vendor_date), kept consistent
            # with the register's pagination.total. Rank = 1 + (bigger siblings).
            pair = ContractPairContext(vendor_id=vendor_id, institution_id=institution_id)
            if vendor_id is not None and institution_id is not None:
                cur.execute(
                    """SELECT COUNT(*) AS n, COALESCE(SUM(amount_mxn), 0) AS total,
                              MIN(contract_year) AS y0, MAX(contract_year) AS y1,
                              SUM(CASE WHEN amount_mxn > ? THEN 1 ELSE 0 END) AS bigger,
                              SUM(CASE WHEN amount_mxn = ? THEN 1 ELSE 0 END) AS equal
                       FROM contracts WHERE vendor_id = ? AND institution_id = ?""",
                    (amount, amount, vendor_id, institution_id),
                )
                pr = cur.fetchone()
                if pr and pr["n"]:
                    pair.total_contracts = pr["n"]
                    pair.total_amount_mxn = float(pr["total"] or 0)
                    pair.first_year = pr["y0"]
                    pair.last_year = pr["y1"]
                    pair.this_rank = int(pr["bigger"] or 0) + 1
                    pair.tied = max(0, int(pr["equal"] or 0) - 1)
                    cur.execute(
                        """SELECT contract_year AS year, COUNT(*) AS n,
                                  COALESCE(SUM(amount_mxn), 0) AS total,
                                  MAX(risk_score) AS max_risk
                           FROM contracts WHERE vendor_id = ? AND institution_id = ?
                             AND contract_year IS NOT NULL
                           GROUP BY contract_year ORDER BY contract_year""",
                        (vendor_id, institution_id),
                    )
                    pair.by_year = [
                        {"year": r["year"], "n": r["n"], "sum": float(r["total"]),
                         "max_risk": r["max_risk"]}
                        for r in cur.fetchall()
                    ]

            # Vendor-wide rank by amount (for "el mayor de N contratos del proveedor").
            vendor_rank = None
            vendor_total = 0
            if vendor_id is not None:
                # the canonical vendor's population, as on its dossier
                ids = vcanon.group_ids(conn, vcanon.canonical_id(conn, vendor_id))
                cur.execute(
                    f"""SELECT COUNT(*) AS n,
                              SUM(CASE WHEN amount_mxn > ? THEN 1 ELSE 0 END) AS bigger
                       FROM contracts WHERE vendor_id IN ({','.join('?' * len(ids))})""",
                    (amount, *ids),
                )
                vr = cur.fetchone()
                if vr and vr["n"]:
                    vendor_total = vr["n"]
                    vendor_rank = int(vr["bigger"] or 0) + 1

            # Sourced finding — strong-GT rows only (the seal's evidence gate;
            # the frontend prints it only under a seal).
            try:
                evidence = pick_contract_evidence(cur, contract_id)
            except sqlite3.OperationalError:
                evidence = None  # GT tables absent (stub DB)

            vendor_standing = None
            if vendor_id is not None:
                try:
                    cur.execute(
                        """SELECT vendor_name, ips_tier, primary_pattern, in_ground_truth,
                                  is_efos_definitivo, is_sfp_sanctioned
                           FROM aria_queue WHERE vendor_id = ?""",
                        (vendor_id,),
                    )
                    aq = cur.fetchone()
                    gt = cur.execute(f"""
                        SELECT MAX({DOCUMENTED_LINK_SQL}), COUNT(*) FROM ground_truth_vendors gtv
                        JOIN ground_truth_cases gtc ON gtv.case_id = gtc.id
                        WHERE gtv.vendor_id = ? AND {PUBLIC_LINK_SQL}""", (vendor_id,)).fetchone() if aq else None
                    documented = bool(gt and gt[0])
                    if aq:
                        vendor_standing = VendorStanding(
                            queue_name=aq["vendor_name"],
                            ips_tier=aq["ips_tier"],
                            primary_pattern=aq["primary_pattern"],
                            in_ground_truth=documented,
                            has_unverified_lead=bool(gt and gt[1]) and not documented,
                            is_efos_definitivo=bool(aq["is_efos_definitivo"]),
                            is_sfp_sanctioned=bool(aq["is_sfp_sanctioned"]),
                        )
                except sqlite3.OperationalError:
                    vendor_standing = None  # aria_queue absent (stub DB)

            return ContractContextResponse(
                contract_id=contract_id,
                amount_mxn=amount,
                sector_id=sector_id,
                sector_name=row["sector_name"],
                sector_p99_mxn=sector_p99,
                sector_p50_mxn=sector_p50,
                size_vs_p99=size_vs_p99,
                official=ContractOfficial(
                    responsible_uc=row["responsible_uc"],
                    exception_article=row["exception_article"],
                    category_id=row["category_id"],
                    category_name_es=row["category_name_es"],
                    category_name_en=row["category_name_en"],
                ),
                pair=pair,
                vendor_rank=vendor_rank,
                vendor_total_contracts=vendor_total,
                evidence=evidence,
                vendor_standing=vendor_standing,
            )
    except sqlite3.Error as e:
        logger.error(f"Database error in get_contract_context: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")


@router.get("/by-vendor/{vendor_id}", response_model=ContractListResponse)
def get_contracts_by_vendor(
    vendor_id: int = Path(..., description="Vendor ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """Get all contracts for a specific vendor."""
    return list_contracts(
        page=page,
        per_page=per_page,
        vendor_id=vendor_id,
        sector_id=None,
        year=None,
        institution_id=None,
        risk_level=None,
        risk_level_min=None,
        is_direct_award=None,
        is_single_bid=None,
        risk_factor=None,
        category_id=None,
        min_amount=None,
        max_amount=None,
        search=None,
        procedure_number=None,  # wrappers call the route fn directly: unset params stay Query objects
        sort_by="contract_date",
        sort_order="desc",
    )


@router.get("/by-institution/{institution_id}", response_model=ContractListResponse)
def get_contracts_by_institution(
    institution_id: int = Path(..., description="Institution ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """Get all contracts for a specific institution."""
    return list_contracts(
        page=page,
        per_page=per_page,
        institution_id=institution_id,
        sector_id=None,
        year=None,
        vendor_id=None,
        risk_level=None,
        risk_level_min=None,
        is_direct_award=None,
        is_single_bid=None,
        risk_factor=None,
        category_id=None,
        min_amount=None,
        max_amount=None,
        search=None,
        procedure_number=None,  # wrappers call the route fn directly: unset params stay Query objects
        sort_by="contract_date",
        sort_order="desc",
    )
