"""Scorecard API router — institution and vendor 0-100 integrity grades."""
import json
import logging
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Path
from pydantic import BaseModel

from ..services.institution_canonical import canonical_id, has_buyer_scope
from ..services import vendor_canonical as vcanon
from ..config.constants import DATA_LAST_YEAR
from ..dependencies import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scorecards", tags=["scorecards"])

# One population definition for every scorecard surface: federal = the
# validated is_federal classifier (406 scored), never institution_scope (706).
# Non-federal splits into municipal (type or gobierno_nivel GM) and state.
LEVEL_SQL = (
    "CASE WHEN i.is_federal = 1 THEN 'federal' "
    "WHEN i.institution_type = 'municipal' OR i.gobierno_nivel = 'GM' THEN 'municipal' "
    "ELSE 'state' END"
)
LEVEL_PATTERN = "^(federal|state|municipal)$"


# --- Pydantic models --------------------------------------------------------

class GradeInfo(BaseModel):
    grade: str
    grade_label: str
    grade_color: str
    total_score: float


class InstitutionScorecardResponse(BaseModel):
    institution_id: int
    institution_name: str
    ramo_code: Optional[int]
    sector_name: Optional[str]
    total_score: float
    grade: str
    grade_label: str
    grade_color: str
    national_percentile: Optional[float]
    pillar_openness: float
    pillar_price: float
    pillar_vendors: float
    pillar_process: float
    pillar_external: float
    top_risk_driver: Optional[str]
    key_metrics: Dict[str, Any]
    confidence_band: Optional[str] = None
    p90_risk_score: Optional[float] = None
    trend_direction: Optional[str] = None
    peer_percentile_sector: Optional[float] = None
    signal_count_red: Optional[int] = None


class VendorScorecardResponse(BaseModel):
    vendor_id: int
    vendor_name: str
    total_score: float
    grade: str
    grade_label: str
    grade_color: str
    national_percentile: float
    sector_percentile: float
    pillar_risk_signal: float
    pillar_conduct: float
    pillar_spread: float
    pillar_behavior: float
    pillar_flags: float
    top_risk_driver: Optional[str]
    key_metrics: Dict[str, Any]
    confidence_band: Optional[str] = None
    p90_risk_score: Optional[float] = None
    trend_direction: Optional[str] = None
    risk_tier: Optional[str] = None


class InstitutionScorecardListItem(BaseModel):
    institution_id: int
    institution_name: str
    ramo_code: Optional[int]
    sector_name: Optional[str]
    total_score: float
    grade: str
    grade_label: str
    grade_color: str
    national_percentile: Optional[float]
    pillar_openness: float
    pillar_price: float
    pillar_vendors: float
    pillar_process: float
    pillar_external: float
    top_risk_driver: Optional[str]
    confidence_band: Optional[str] = None
    p90_risk_score: Optional[float] = None
    trend_direction: Optional[str] = None
    peer_percentile_sector: Optional[float] = None
    signal_count_red: Optional[int] = None
    money_at_risk_mxn: Optional[float] = None  # exposure axis (high+critical contract value)
    total_contracts: Optional[int] = None      # for the min-N reliability gate
    last_contract_year: Optional[int] = None   # recency marker (scores span 2002–2025)


class VendorScorecardListItem(BaseModel):
    vendor_id: int
    vendor_name: str
    total_score: float
    grade: str
    grade_label: str
    grade_color: str
    national_percentile: float
    sector_percentile: float
    pillar_risk_signal: float
    pillar_conduct: float
    pillar_spread: float
    pillar_behavior: float
    pillar_flags: float
    top_risk_driver: Optional[str]
    confidence_band: Optional[str] = None
    p90_risk_score: Optional[float] = None
    trend_direction: Optional[str] = None
    risk_tier: Optional[str] = None


class InstitutionScorecardListResponse(BaseModel):
    data: List[InstitutionScorecardListItem]
    total: int
    page: int
    per_page: int
    total_pages: int
    grade_distribution: Dict[str, int]


class VendorScorecardListResponse(BaseModel):
    data: List[VendorScorecardListItem]
    total: int
    page: int
    per_page: int
    total_pages: int
    grade_distribution: Dict[str, int]


class ScorecardSummary(BaseModel):
    institutions_scored: int
    vendors_scored: int
    institution_grade_distribution: Dict[str, int]
    vendor_grade_distribution: Dict[str, int]
    institution_avg_score: float
    vendor_avg_score: float
    computed_at: Optional[str]


# --- Helpers -----------------------------------------------------------------

def _extract_signal_count_red(key_metrics_json: str) -> int:
    """Count red signals from key_metrics JSON."""
    try:
        km = json.loads(key_metrics_json) if key_metrics_json else {}
        return km.get("worst_signal_count", 0)
    except Exception:
        return 0


def _grade_from_risk(avg_risk: float) -> tuple:
    """Fallback: compute grade from avg risk score."""
    if avg_risk < 0.10:
        return ("A", "Solido", "#22c55e")
    elif avg_risk < 0.20:
        return ("B", "Adecuado", "#eab308")
    elif avg_risk < 0.35:
        return ("C", "Preocupante", "#f97316")
    elif avg_risk < 0.50:
        return ("D", "Alto Riesgo", "#ef4444")
    else:
        return ("F", "Critico", "#991b1b")


# --- Routes ------------------------------------------------------------------

@router.get("/summary", response_model=ScorecardSummary)
def get_scorecard_summary():
    """Overall scorecard statistics."""
    try:
        with get_db() as conn:
            i_row = conn.execute("""
                SELECT COUNT(*), AVG(total_score),
                       MAX(computed_at)
                FROM institution_scorecards
            """).fetchone()
            v_row = conn.execute("""
                SELECT COUNT(*), AVG(total_score)
                FROM vendor_scorecards
            """).fetchone()
            i_dist = {r[0]: r[1] for r in conn.execute(
                "SELECT grade, COUNT(*) FROM institution_scorecards GROUP BY grade"
            ).fetchall()}
            v_dist = {r[0]: r[1] for r in conn.execute(
                "SELECT grade, COUNT(*) FROM vendor_scorecards GROUP BY grade"
            ).fetchall()}

        return ScorecardSummary(
            institutions_scored=i_row[0] or 0,
            vendors_scored=v_row[0] or 0,
            institution_grade_distribution=i_dist,
            vendor_grade_distribution=v_dist,
            institution_avg_score=round(i_row[1] or 0, 1),
            vendor_avg_score=round(v_row[1] or 0, 1),
            computed_at=i_row[2],
        )
    except Exception as exc:
        logger.warning("scorecard_summary_fallback: %s", exc)
        try:
            with get_db() as conn:
                i_count = conn.execute("SELECT COUNT(*) FROM institution_stats").fetchone()[0]
                v_count = conn.execute("SELECT COUNT(*) FROM vendor_stats").fetchone()[0]
            return ScorecardSummary(
                institutions_scored=i_count,
                vendors_scored=v_count,
                institution_grade_distribution={},
                vendor_grade_distribution={},
                institution_avg_score=0.0,
                vendor_avg_score=0.0,
                computed_at=None,
            )
        except Exception:
            logger.exception("scorecard_summary fallback failed")
            raise HTTPException(status_code=503, detail="Scorecards temporarily unavailable")


def _fallback_institution_scorecards(
    conn, page: int, per_page: int, sort_by: str, order: str,
    grade: Optional[str], sector: Optional[str],
    min_score: Optional[float], max_score: Optional[float],
    search: Optional[str], federal_only: bool = False,
) -> InstitutionScorecardListResponse:
    """Build institution scorecards from institution_stats when the
    institution_scorecards table is missing."""
    where_clauses = ["1=1"]
    params: list = []

    if federal_only:
        # Federal = the validated is_federal classifier (backend/scripts/
        # _classify_federal.py). The old scope/gobierno_nivel clause leaked
        # ~500 sub-national entities while NULL-tagging the federal giants.
        where_clauses.append("i.is_federal = 1")
    if search:
        where_clauses.append("i.name LIKE ?")
        params.append(f"%{search}%")
    if sector:
        where_clauses.append("LOWER(sec.name_es) = LOWER(?)")
        params.append(sector)

    where_sql = " AND ".join(where_clauses)
    sort_col = "ist.avg_risk_score"
    if sort_by == "institution_name":
        sort_col = "i.name"
    elif sort_by in ("total_score", "national_percentile"):
        sort_col = "ist.avg_risk_score"

    order_dir = "DESC" if order == "desc" else "ASC"

    total = conn.execute(f"""
        SELECT COUNT(*)
        FROM institution_stats ist
        JOIN institutions i ON i.id = ist.institution_id
        LEFT JOIN sectors sec ON i.sector_id = sec.id
        WHERE {where_sql}
    """, params).fetchone()[0]

    offset = (page - 1) * per_page
    rows = conn.execute(f"""
        SELECT ist.institution_id, i.name, i.ramo_id,
               sec.name_es AS sector_name,
               ist.avg_risk_score, ist.total_contracts,
               ist.high_risk_pct, ist.direct_award_pct, ist.single_bid_pct
        FROM institution_stats ist
        JOIN institutions i ON i.id = ist.institution_id
        LEFT JOIN sectors sec ON i.sector_id = sec.id
        WHERE {where_sql}
        ORDER BY {sort_col} {order_dir}
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    items = []
    grade_counts: dict = {}
    for r in rows:
        avg_risk = r[4] or 0
        total_score = round(max(0, (1 - avg_risk)) * 100, 1)
        g, gl, gc = _grade_from_risk(avg_risk)

        if min_score is not None and total_score < min_score:
            continue
        if max_score is not None and total_score > max_score:
            continue
        if grade and g != grade:
            continue

        grade_counts[g] = grade_counts.get(g, 0) + 1

        items.append(InstitutionScorecardListItem(
            institution_id=r[0], institution_name=r[1], ramo_code=r[2],
            sector_name=r[3], total_score=total_score,
            grade=g, grade_label=gl, grade_color=gc,
            national_percentile=0.5,
            pillar_openness=0.0, pillar_price=0.0,
            pillar_vendors=0.0, pillar_process=0.0, pillar_external=0.0,
            top_risk_driver=None,
            confidence_band=None, p90_risk_score=None,
            trend_direction=None, peer_percentile_sector=None,
            signal_count_red=None,
        ))

    filtered_total = len(items) if (grade or min_score is not None or max_score is not None) else total
    return InstitutionScorecardListResponse(
        data=items, total=filtered_total, page=page, per_page=per_page,
        total_pages=max(1, -(-filtered_total // per_page)),
        grade_distribution=grade_counts,
    )


def _fallback_vendor_scorecards(
    conn, page: int, per_page: int, sort_by: str, order: str,
    grade: Optional[str],
    min_score: Optional[float], max_score: Optional[float],
    search: Optional[str],
) -> VendorScorecardListResponse:
    """Build vendor scorecards from vendor_stats when the
    vendor_scorecards table is missing."""
    where_clauses = ["1=1"]
    params: list = []

    if search:
        where_clauses.append("v.name LIKE ?")
        params.append(f"%{search}%")

    where_sql = " AND ".join(where_clauses)
    sort_col = "vs.avg_risk_score"
    if sort_by == "vendor_name":
        sort_col = "v.name"
    elif sort_by in ("total_score", "national_percentile"):
        sort_col = "vs.avg_risk_score"

    order_dir = "DESC" if order == "desc" else "ASC"

    total = conn.execute(f"""
        SELECT COUNT(*)
        FROM vendor_stats vs
        JOIN vendors v ON v.id = vs.vendor_id
        WHERE vs.vendor_id IS NOT NULL AND {where_sql}
    """, params).fetchone()[0]

    offset = (page - 1) * per_page
    rows = conn.execute(f"""
        SELECT vs.vendor_id, v.name,
               vs.avg_risk_score, vs.total_contracts
        FROM vendor_stats vs
        JOIN vendors v ON v.id = vs.vendor_id
        WHERE vs.vendor_id IS NOT NULL AND {where_sql}
        ORDER BY {sort_col} {order_dir}
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    items = []
    grade_counts: dict = {}
    for r in rows:
        avg_risk = r[2] or 0
        # Vendor score is now risk-oriented (higher = riskier)
        total_score = round(min(100, avg_risk * 100), 1)
        g, gl, gc = _grade_from_risk(avg_risk)

        if min_score is not None and total_score < min_score:
            continue
        if max_score is not None and total_score > max_score:
            continue
        if grade and g != grade:
            continue

        grade_counts[g] = grade_counts.get(g, 0) + 1

        items.append(VendorScorecardListItem(
            vendor_id=r[0], vendor_name=r[1],
            total_score=total_score,
            grade=g, grade_label=gl, grade_color=gc,
            national_percentile=0.5,
            sector_percentile=0.5,
            pillar_risk_signal=0.0, pillar_conduct=0.0,
            pillar_spread=0.0, pillar_behavior=0.0, pillar_flags=0.0,
            top_risk_driver=None,
            confidence_band=None, p90_risk_score=None,
            trend_direction=None, risk_tier=None,
        ))

    filtered_total = len(items) if (grade or min_score is not None or max_score is not None) else total
    return VendorScorecardListResponse(
        data=items, total=filtered_total, page=page, per_page=per_page,
        total_pages=max(1, -(-filtered_total // per_page)),
        grade_distribution=grade_counts,
    )


@router.get("/institutions", response_model=InstitutionScorecardListResponse)
def list_institution_scorecards(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    sort_by: str = Query("total_score", pattern="^(total_score|grade|national_percentile|institution_name|money_at_risk|pillar_openness|pillar_price|pillar_vendors|pillar_process|pillar_external)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    grade: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    min_score: Optional[float] = Query(None, ge=0, le=100),
    max_score: Optional[float] = Query(None, ge=0, le=100),
    search: Optional[str] = Query(None),
    federal_only: bool = Query(False),
    scope: str = Query("federal", pattern="^(federal|subnational|all)$"),
    level: Optional[str] = Query(None, pattern=LEVEL_PATTERN),
    min_contracts: int = Query(0, ge=0, description="Reliability gate — exclude institutions below N contracts"),
):
    """Ranked list of institution scorecards.

    scope: 'federal' (is_federal=1, default) · 'subnational' (state/municipal) ·
    'all'. `federal_only=true` is a legacy alias that forces scope='federal'.
    level: optional federal|state|municipal filter (LEVEL_SQL), ANDed with scope.
    """
    with get_db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='institution_scorecards'"
        ).fetchone()
        if not exists:
            return _fallback_institution_scorecards(
                conn, page, per_page, sort_by, order,
                grade, sector, min_score, max_score, search, federal_only,
            )

        # (clause, params) pairs — the grade-free distribution query below drops
        # the grade pair and flattens the rest, so params never misalign.
        clauses: list[tuple[str, list]] = [("1=1", [])]

        # Scope (validated is_federal classifier; federal_only is a legacy alias).
        eff_scope = "federal" if federal_only else scope
        if eff_scope == "federal":
            clauses.append(("i.is_federal = 1", []))
        elif eff_scope == "subnational":
            clauses.append(("COALESCE(i.is_federal, 0) = 0", []))
        if level:
            clauses.append((f"{LEVEL_SQL} = ?", [level]))
        if min_contracts > 0:
            clauses.append(("COALESCE(ist.total_contracts, 0) >= ?", [min_contracts]))
        if grade:
            clauses.append(("s.grade = ?", [grade]))
        if sector:
            clauses.append(("LOWER(sec.name_es) = LOWER(?)", [sector]))
        if min_score is not None:
            clauses.append(("s.total_score >= ?", [min_score]))
        if max_score is not None:
            clauses.append(("s.total_score <= ?", [max_score]))
        if search:
            clauses.append(("i.name LIKE ?", [f"%{search}%"]))

        where_clauses = [c for c, _ in clauses]
        params: list = [p for _, ps in clauses for p in ps]
        where_sql = " AND ".join(where_clauses)
        # safe: sort_by is whitelisted by the Query pattern, mapped here to a column.
        _SORT_MAP = {
            "total_score": "s.total_score", "grade": "s.grade",
            "national_percentile": "s.national_percentile",
            "institution_name": "i.name",
            "money_at_risk": "ist.high_critical_value_mxn",
            "pillar_openness": "s.pillar_openness", "pillar_price": "s.pillar_price",
            "pillar_vendors": "s.pillar_vendors", "pillar_process": "s.pillar_process",
            "pillar_external": "s.pillar_external",
        }
        order_col = _SORT_MAP.get(sort_by, "s.total_score")
        order_sql = f"{order_col} {'DESC' if order == 'desc' else 'ASC'} NULLS LAST"

        total = conn.execute(f"""
            SELECT COUNT(*)
            FROM institution_scorecards s
            JOIN institutions i ON s.institution_id = i.id
            LEFT JOIN institution_stats ist ON ist.institution_id = s.institution_id
            LEFT JOIN sectors sec ON i.sector_id = sec.id
            WHERE {where_sql}
        """, params).fetchone()[0]

        offset = (page - 1) * per_page
        rows = conn.execute(f"""
            SELECT s.institution_id, i.name, i.ramo_id,
                   sec.name_es AS sector_name,
                   s.total_score, s.grade, s.grade_label, s.grade_color,
                   s.national_percentile,
                   s.pillar_openness, s.pillar_price, s.pillar_vendors,
                   s.pillar_process, s.pillar_external,
                   s.top_risk_driver, s.key_metrics,
                   s.confidence_band, s.p90_risk_score,
                   s.trend_direction, s.peer_percentile_sector,
                   ist.high_critical_value_mxn, ist.total_contracts,
                   ist.last_contract_year
            FROM institution_scorecards s
            JOIN institutions i ON s.institution_id = i.id
            LEFT JOIN institution_stats ist ON ist.institution_id = s.institution_id
            LEFT JOIN sectors sec ON i.sector_id = sec.id
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

        # Grade distribution for current filter (without grade filter)
        no_grade = [(c, ps) for c, ps in clauses if c != "s.grade = ?"]
        filter_params_no_grade = [p for _, ps in no_grade for p in ps]
        where_no_grade = " AND ".join(c for c, _ in no_grade)
        dist_rows = conn.execute(f"""
            SELECT s.grade, COUNT(*)
            FROM institution_scorecards s
            JOIN institutions i ON s.institution_id = i.id
            LEFT JOIN institution_stats ist ON ist.institution_id = s.institution_id
            LEFT JOIN sectors sec ON i.sector_id = sec.id
            WHERE {where_no_grade}
            GROUP BY s.grade
        """, filter_params_no_grade).fetchall()
        grade_dist = {r[0]: r[1] for r in dist_rows}

    items = [
        InstitutionScorecardListItem(
            institution_id=r[0], institution_name=r[1], ramo_code=r[2],
            sector_name=r[3], total_score=round(r[4], 1),
            grade=r[5], grade_label=r[6], grade_color=r[7],
            national_percentile=round(r[8], 3) if r[8] is not None else None,
            pillar_openness=round(r[9], 1), pillar_price=round(r[10], 1),
            pillar_vendors=round(r[11], 1), pillar_process=round(r[12], 1),
            pillar_external=round(r[13], 1),
            top_risk_driver=r[14],
            confidence_band=r[16],
            p90_risk_score=round(r[17], 3) if r[17] is not None else None,
            trend_direction=r[18],
            peer_percentile_sector=round(r[19], 3) if r[19] is not None else None,
            signal_count_red=_extract_signal_count_red(r[15]),
            money_at_risk_mxn=float(r[20]) if r[20] is not None else None,
            total_contracts=int(r[21]) if r[21] is not None else None,
            last_contract_year=int(r[22]) if r[22] is not None else None,
        )
        for r in rows
    ]

    return InstitutionScorecardListResponse(
        data=items, total=total, page=page, per_page=per_page,
        total_pages=max(1, -(-total // per_page)),
        grade_distribution=grade_dist,
    )


class InstitutionScorecardStats(BaseModel):
    total_scored: int
    median_score: float
    top_institution_id: Optional[int]
    top_institution_name: Optional[str]
    top_institution_score: Optional[float]
    worst_institution_id: Optional[int]
    worst_institution_name: Optional[str]
    worst_institution_score: Optional[float]
    grade_distribution: Dict[str, int]


@router.get("/institutions/stats", response_model=InstitutionScorecardStats)
def get_institution_scorecard_stats(
    federal_only: bool = Query(
        True,
        description=(
            "When true (default), restrict all aggregate stats — total_scored, "
            "median_score, top/worst performer, grade_distribution — to federal "
            "institutions only (is_federal = 1). This keeps the "
            "headline numbers consistent with the federal-only ranking list and "
            "avoids state institutions skewing the league averages."
        ),
    ),
    scope: str = Query("federal", pattern="^(federal|subnational|all)$"),
    level: Optional[str] = Query(None, pattern=LEVEL_PATTERN),
    min_contracts: int = Query(0, ge=0),
):
    """Aggregate statistics across institution scorecards.

    Federal-only by default to match the federal-scope ranking list. Set
    federal_only=false to include state-level institutions (some of which
    appear in COMPRANET data but distort federal-procurement benchmarks).
    """
    with get_db() as conn:
        # Build a shared federal WHERE clause + JOIN once so every aggregate
        # query below sees the same population. When federal_only is false we
        # fall back to the original "all scorecards" path.
        # Resolve scope (federal_only is a legacy alias: true->federal, false->all).
        eff_scope = scope if scope != "federal" else ("federal" if federal_only else "all")
        conds = []
        if eff_scope == "federal":
            conds.append("i.is_federal = 1")
        elif eff_scope == "subnational":
            conds.append("COALESCE(i.is_federal, 0) = 0")
        join_params: tuple = ()
        if level:
            conds.append(f"{LEVEL_SQL} = ?")
            join_params = (level,)
        if min_contracts > 0:
            conds.append("COALESCE(ist.total_contracts, 0) >= %d" % int(min_contracts))
        base_from = (
            "institution_scorecards s "
            "JOIN institutions i ON i.id = s.institution_id "
            "LEFT JOIN institution_stats ist ON ist.institution_id = s.institution_id"
        )
        where_clause = ("WHERE " + " AND ".join(conds)) if conds else ""

        agg = conn.execute(
            f"SELECT COUNT(*), AVG(s.total_score) FROM {base_from} {where_clause}",
            join_params,
        ).fetchone()
        total_scored = agg[0] or 0

        # Median via OFFSET approximation (SQLite has no MEDIAN)
        mid = total_scored // 2
        median_row = conn.execute(
            f"""
            SELECT s.total_score
            FROM {base_from}
            {where_clause}
            ORDER BY s.total_score
            LIMIT 1 OFFSET ?
            """,
            (*join_params, max(0, mid - 1)),
        ).fetchone()
        median_score = round(median_row[0], 1) if median_row else 0.0

        # Top + worst reuse base_from (institutions + institution_stats joins),
        # so the scope/min_contracts where_clause resolves consistently.
        top_from = base_from
        top_row = conn.execute(
            f"""
            SELECT s.institution_id, i.name, s.total_score
            FROM {top_from}
            {where_clause}
            ORDER BY s.total_score DESC
            LIMIT 1
            """,
            join_params,
        ).fetchone()
        worst_row = conn.execute(
            f"""
            SELECT s.institution_id, i.name, s.total_score
            FROM {top_from}
            {where_clause}
            ORDER BY s.total_score ASC
            LIMIT 1
            """,
            join_params,
        ).fetchone()
        dist_rows = conn.execute(
            f"""
            SELECT s.grade, COUNT(*)
            FROM {base_from}
            {where_clause}
            GROUP BY s.grade
            """,
            join_params,
        ).fetchall()
        grade_dist = {r[0]: r[1] for r in dist_rows}

    return InstitutionScorecardStats(
        total_scored=total_scored,
        median_score=median_score,
        top_institution_id=top_row[0] if top_row else None,
        top_institution_name=top_row[1] if top_row else None,
        top_institution_score=round(top_row[2], 1) if top_row else None,
        worst_institution_id=worst_row[0] if worst_row else None,
        worst_institution_name=worst_row[1] if worst_row else None,
        worst_institution_score=round(worst_row[2], 1) if worst_row else None,
        grade_distribution=grade_dist,
    )


# --- Population field (spec institutions-tamiz §1) ----------------------------
# Every scored institution in one columnar payload for the /institutions
# beeswarm. Reads scorecards + institutions + institution_stats only (no
# contracts scan); cached in-process until MAX(computed_at) moves.
FED_DECENTRALIZED_TYPES = ("federal_agency", "health_institution", "state_enterprise_finance", "social_program")
FIELD_COLUMNS = [
    "id", "name", "siglas", "total_score", "grade",
    "pillar_openness", "pillar_price", "pillar_vendors", "pillar_process", "pillar_external",
    "confidence_band", "is_federal", "level", "institution_type", "sector_id",
    "total_contracts", "total_amount_mxn", "gt_exposed", "group",
]
_FIELD_SQL = f"""
    WITH f AS (
        SELECT s.institution_id AS id, i.name, i.siglas, s.total_score, s.grade,
               s.pillar_openness, s.pillar_price, s.pillar_vendors, s.pillar_process, s.pillar_external,
               s.confidence_band, COALESCE(i.is_federal, 0) AS is_federal, {LEVEL_SQL} AS level,
               i.institution_type, i.sector_id,
               COALESCE(ist.total_contracts, 0) AS total_contracts,
               COALESCE(ist.total_value_mxn, 0) AS total_amount_mxn,
               COALESCE(json_extract(s.key_metrics, '$.gt_vendor_count'), 0) > 0 AS gt_exposed
        FROM institution_scorecards s
        JOIN institutions i ON i.id = s.institution_id
        LEFT JOIN institution_stats ist ON ist.institution_id = s.institution_id
    )
    SELECT f.*,
           CASE WHEN level = 'federal' AND institution_type IN ({",".join("?" * len(FED_DECENTRALIZED_TYPES))})
                THEN 'fed-dec'
                WHEN level = 'federal' THEN 'fed-other'
                WHEN level = 'municipal' THEN 'muni'
                ELSE 'state' END AS "group"
    FROM f ORDER BY f.id
"""
# v3 (owner-approved 2026-10-08): institution_grades_v3 + the ledger's biggest
# loss per institution + the historical v2 grade beside it (step 4 compares).
FIELD_COLUMNS_V3 = [
    "id", "name", "siglas", "score", "grade", "provisional", "score_lo", "score_hi",
    "pillar_competencia", "pillar_proceso", "pillar_concentracion",
    "level", "family", "size_band", "sector_id", "n_contracts", "total_value_mxn",
    "gt_vendor_count", "top_loss_pillar", "top_loss_points", "v2_score", "v2_grade", "group",
    "coverage_pct", "coverage_band", "coverage_lb",   # Cobertura CompraNet (coverage-badge.md); null when not loaded
    "is_historical", "last_year", "p_grade",          # «Por pesos» spec §6: still buying? · grade confidence
    "flagged_n", "flagged_value_mxn",                 # contracts > 10B MXN inside graded value (FLAG, in review)
    "trend", "trend_slope", "trend_t",                # phase 2 § 3: non-competitive COUNT share, 2018-2025; null = sin_datos
]
_FIELD_SQL_V3 = """
    WITH loss AS (
        SELECT institution_id, pillar, SUM(points) AS pts
        FROM institution_grade_ledger
        WHERE pillar IN ('competencia', 'proceso', 'concentracion')
        GROUP BY institution_id, pillar
    ), top AS (
        SELECT institution_id, pillar, pts,
               ROW_NUMBER() OVER (PARTITION BY institution_id ORDER BY pts ASC, pillar) AS rn
        FROM loss
    )
    SELECT g.institution_id, i.name, i.siglas, g.score, g.grade, g.provisional, g.score_lo, g.score_hi,
           g.pillar_competencia, g.pillar_proceso, g.pillar_concentracion,
           CASE g.level WHEN 'estatal' THEN 'state' ELSE g.level END,
           g.family, g.size_band, i.sector_id, g.n_contracts, g.total_value_mxn,
           COALESCE(g.gt_vendor_count, 0), t.pillar, t.pts, s.total_score, s.grade,
           g.level || '|' || g.family, {coverage_cols},
           g.is_historical, g.last_year, g.p_grade, {flag_cols},
           NULLIF(g.trend, 'sin_datos'), g.trend_slope, g.trend_t
    FROM institution_grades_v3 g
    JOIN institutions i ON i.id = g.institution_id
    LEFT JOIN top t ON t.institution_id = g.institution_id AND t.rn = 1
    LEFT JOIN institution_scorecards s ON s.institution_id = g.institution_id
    {coverage_join}
    {flag_join}
    ORDER BY g.institution_id
"""
_COVERAGE_ON = {"coverage_cols": "CAST(ROUND(cv.ratio * 100) AS INTEGER), cv.band, CASE WHEN cv.band IS NULL THEN NULL ELSE cv.is_lower_bound END",
                "coverage_join": "LEFT JOIN institution_coverage_v1 cv ON cv.institution_id = g.institution_id"}
_COVERAGE_OFF = {"coverage_cols": "NULL, NULL, NULL", "coverage_join": ""}
_FLAG_ON = {"flag_cols": "COALESCE(fl.fn, 0), COALESCE(fl.fv, 0)",
            "flag_join": "LEFT JOIN (SELECT institution_id, SUM(flagged_n) AS fn, SUM(flagged_value_mxn) AS fv "
                         "FROM institution_year_value GROUP BY institution_id) fl ON fl.institution_id = g.institution_id"}
_FLAG_OFF = {"flag_cols": "NULL, NULL", "flag_join": ""}
_field_cache: Dict[str, Any] = {}


def _lean(col: str, v: Any) -> Any:
    """Payload diet: booleans, whole pesos, one-decimal scores."""
    if col in ("provisional", "coverage_lb", "is_historical"):
        return None if v is None and col in ("coverage_lb", "is_historical") else bool(v)
    if col == "p_grade":
        return None if v is None else round(v, 2)
    if col == "trend_slope":   # share per year: 0.024 = +2.4 pp/yr
        return None if v is None else round(v, 3)
    if col in ("total_value_mxn", "flagged_value_mxn"):
        return None if v is None and col == "flagged_value_mxn" else int(v or 0)
    return round(v, 1) if isinstance(v, float) else v


def _field_v3(conn) -> Optional[Dict[str, Any]]:
    """v3 payload, or None when the v3 tables are absent on this DB."""
    try:
        computed_at, cal_id = conn.execute(
            "SELECT MAX(computed_at), MAX(calibration_id) FROM institution_grades_v3").fetchone()
        if computed_at is None:
            return None
        params = json.loads(conn.execute(
            "SELECT params_json FROM institution_grade_calibration WHERE calibration_id = ?",
            (cal_id,)).fetchone()[0])
        has = lambda t: conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = ?", (t,)).fetchone()[0]
        fmt = {**(_COVERAGE_ON if has("institution_coverage_v1") else _COVERAGE_OFF),
               **(_FLAG_ON if has("institution_year_value") else _FLAG_OFF)}
        rows = conn.execute(_FIELD_SQL_V3.format(**fmt)).fetchall()
    except (sqlite3.OperationalError, TypeError):
        return None
    return {
        "method": "v3", "computed_at": computed_at, "calibration_id": cal_id,
        "scale": [0, 100], "cut_points": params.get("cut_points"),
        "columns": FIELD_COLUMNS_V3,
        "rows": [[_lean(c, v) for c, v in zip(FIELD_COLUMNS_V3, r)] for r in rows],
    }


# Grades league scope (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 1): each row is graded
# within its own level (peer_key), so a scope only selects rows. Field rows say 'state' for estatal.
LEAGUE_SCOPES = {"federal": {"federal"}, "local": {"estatal", "municipal"}, "estatal": {"estatal"},
                 "municipal": {"municipal"}, "all": None}
SCOPE_QUERY = Query(None, description="Grade level: federal (default) | local | estatal | municipal | all")


def _league_scope(scope: Optional[str]) -> str:
    return scope if scope in LEAGUE_SCOPES else "federal"


def _scoped(payload: Dict[str, Any], scope: str, level_of) -> Dict[str, Any]:
    """The cached payload with only the rows whose level is in scope, plus the scope stated."""
    keep = LEAGUE_SCOPES[scope]
    rows = payload["rows"] if keep is None else [r for r in payload["rows"] if level_of(r) in keep]
    return {**payload, "scope": scope, "rows": rows}


@router.get("/institutions/field")
def get_institution_field(scope: Optional[str] = SCOPE_QUERY):
    """Columnar grade population for the /institutions field: v3 when
    institution_grades_v3 exists (score 0-100, A-F), else the v2 scorecards.
    {method, computed_at, scope, columns, rows, ...}. No RFC, no vendor ids."""
    scope = _league_scope(scope)
    with get_db() as conn:
        try:
            v3_at = conn.execute("SELECT MAX(computed_at) FROM institution_grades_v3").fetchone()[0]
        except sqlite3.OperationalError:
            v3_at = None
        v2_at = conn.execute("SELECT MAX(computed_at) FROM institution_scorecards").fetchone()[0]
        try:
            cov_at = conn.execute("SELECT MAX(computed_at) FROM institution_coverage_v1").fetchone()[0]
        except sqlite3.OperationalError:
            cov_at = None
        try:
            yv_at = conn.execute("SELECT MAX(computed_at) FROM institution_year_value").fetchone()[0]
        except sqlite3.OperationalError:
            yv_at = None
        key = (v3_at, v2_at, cov_at, yv_at)
        if _field_cache.get("key") != key or "payload" not in _field_cache:
            payload = _field_v3(conn) if v3_at else None
            if payload is None:
                rows = conn.execute(_FIELD_SQL, FED_DECENTRALIZED_TYPES).fetchall()
                payload = {
                    "method": "v2", "computed_at": v2_at, "scale": [15, 90],
                    "columns": FIELD_COLUMNS,
                    "rows": [[(bool(v) if c == "gt_exposed" else v) for c, v in zip(FIELD_COLUMNS, r)] for r in rows],
                }
            _field_cache.update(key=key, payload=payload)
    payload = _field_cache["payload"]
    lvl = payload["columns"].index("level")
    return _scoped(payload, scope, lambda r: {"state": "estatal"}.get(r[lvl], r[lvl]))


# --- Anatomy (/institutions ?ver=anatomia|diagrama, concept 2026-11-04) -------
# The N biggest ACTIVE federal buyers with a settled v3 grade, each taken apart into
# how it buys (direct-award share of pesos), from whom (its top supplier's share) and
# with what risk (share of pesos in contracts whose indicator is >= 0.40). Precomputed
# tables only (institution_grades_v3, institution_year_value, institution_vendor_register).
_ANATOMY_SQL = """
    WITH top AS (
        SELECT g.institution_id AS id FROM institution_grades_v3 g
        WHERE g.level = 'federal' AND g.provisional = 0 AND COALESCE(g.is_historical, 0) = 0
          AND COALESCE(g.last_year, 0) >= ?   -- still buying (Diconsa, absorbed 2023, is not)
        ORDER BY g.total_value_mxn DESC LIMIT ?
    )
    SELECT g.institution_id, i.name, i.siglas, COALESCE(i.sector_id, 12), g.score, g.grade,
           g.n_contracts, g.total_value_mxn, g.model_hr_value_share, g.last_year,
           y.da_v, y.v, r.vendor_id, v.name, v.is_individual, v.rfc, v.vendor_kind, r.total_value_mxn
    FROM top
    JOIN institution_grades_v3 g ON g.institution_id = top.id
    JOIN institutions i ON i.id = g.institution_id
    LEFT JOIN (SELECT institution_id, SUM(da_value_mxn) AS da_v, SUM(value_mxn) AS v
               FROM institution_year_value WHERE institution_id IN (SELECT id FROM top)
               GROUP BY institution_id) y ON y.institution_id = g.institution_id
    LEFT JOIN institution_vendor_register r ON r.institution_id = g.institution_id AND r.rank_by_value = 1
    LEFT JOIN vendors v ON v.id = r.vendor_id
    ORDER BY g.total_value_mxn DESC
"""
_anatomy_cache: Dict[Any, Any] = {}
ACTIVE_FROM = DATA_LAST_YEAR - 2  # active = a contract in 2024 or later (the last two federal years before the cut)


def _share(part, whole) -> Optional[float]:
    return None if part is None or not whole else round(min(1.0, max(0.0, part / whole)), 4)


def _anatomy_vendor(vid, vname, indiv, rfc, vkind) -> Dict[str, Any]:
    """A top supplier as the page may show it. Persona física: its CompraNet name, kind 'pf' so the UI labels
    it «persona física» (owner policy 2026-10-29); its RFC is only measured, never returned."""
    from ..public_labels import clean_name, is_named_persona
    pf = is_named_persona(indiv, rfc, vname)
    return {"id": vid, "name": clean_name(vname),
            "kind": "pf" if pf else ("pub" if vkind not in (None, "private") else "co")}


@router.get("/institutions/anatomy")
def get_institution_anatomy(limit: int = Query(12, ge=3, le=30)):
    """{computed_at, rows:[{id, name, siglas, sector_id, score, grade, n_contracts, total_value_mxn,
    last_year, da_share, top_share, hr_share, top_vendor:{id, name, kind}}]}. Shares are of pesos
    (0-1). A persona física top supplier is named and labelled (kind 'pf'). No RFC."""
    with get_db() as conn:
        try:
            at = conn.execute("SELECT MAX(computed_at) FROM institution_grades_v3").fetchone()[0]
        except sqlite3.OperationalError:
            raise HTTPException(status_code=503, detail="Institution grades not available")
        key = (at, limit)
        if _anatomy_cache.get("key") != key:
            rows = []
            for r in conn.execute(_ANATOMY_SQL, (ACTIVE_FROM, limit)).fetchall():
                (iid, name, siglas, sector, score, grade, n, total, hr, last, da_v, v_all,
                 vid, vname, indiv, rfc, vkind, vval) = tuple(r)
                rows.append({
                    "id": iid, "name": name, "siglas": siglas, "sector_id": sector,
                    "score": round(score, 1), "grade": grade, "n_contracts": n,
                    "total_value_mxn": int(total or 0), "last_year": last,
                    "da_share": _share(da_v, v_all), "top_share": _share(vval, total),
                    "hr_share": None if hr is None else round(hr, 4),
                    "top_vendor": None if vid is None else _anatomy_vendor(vid, vname, indiv, rfc, vkind),
                })
            _anatomy_cache.update(key=key, payload={"computed_at": at, "rows": rows})
    return _anatomy_cache["payload"]


_da_top_cache: Dict[Any, Any] = {}


@router.get("/institutions/{institution_id}/sin-licitacion")
def get_institution_da_top(institution_id: int = Path(..., ge=1), limit: int = Query(3, ge=1, le=10)):
    """Who got a buyer's pesos without a tender (El diagrama, «¿a quién?»): {institution_id, da_value_mxn,
    top:[{id, name, kind, value_mxn, share}]}. Same base as the anatomy's da_share (institution_year_value:
    canonical buyer, amounts in (0, 100B], is_direct_award = 1). share = of its direct-award pesos. No RFC."""
    from ..services.institution_canonical import group_ids
    with get_db() as conn:
        cid = canonical_id(conn, institution_id)
        key = (cid, limit)
        if key not in _da_top_cache:
            ids = group_ids(conn, cid) or [cid]
            ph = ",".join("?" * len(ids))
            da_v = conn.execute("SELECT SUM(da_value_mxn) FROM institution_year_value WHERE institution_id = ?", (cid,)).fetchone()[0]
            # ponytail: one indexed scan per buyer (IMSS ≈ 10 s cold), cached per process; precompute if taps feel slow
            top = conn.execute(f"""
                SELECT c.vendor_id, v.name, v.is_individual, v.rfc, v.vendor_kind, SUM(c.amount_mxn) AS val
                FROM contracts c JOIN vendors v ON v.id = c.vendor_id
                WHERE c.institution_id IN ({ph}) AND c.is_direct_award = 1
                  AND c.amount_mxn > 0 AND c.amount_mxn <= 100000000000
                  AND c.contract_year <= 2025  -- same window as institution_year_value (2000–2025); ComprasMX 2026 would inflate shares
                GROUP BY c.vendor_id ORDER BY val DESC LIMIT ?""", (*ids, limit)).fetchall()
            _da_top_cache[key] = {
                "institution_id": cid, "da_value_mxn": int(da_v or 0),
                "top": [{**_anatomy_vendor(vid, vn, ind, rfc, vk), "value_mxn": int(val or 0), "share": _share(val, da_v)}
                        for vid, vn, ind, rfc, vk, val in top],
            }
    return _da_top_cache[key]


# --- Hallazgos («Por pesos» spec §5) -------------------------------------------
# Computed cards for the /institutions Hallazgos tab. Reads only precomputed
# tables (institution_year_value, institution_grades_v3, institution_coverage_v1);
# cached in-process until any of them is recomputed. No contracts scan.
SEXENIOS = (("epn", 2013, 2018, False), ("amlo", 2019, 2024, False), ("y2025", 2025, DATA_LAST_YEAR, True))  # key kept; runs to the cut
LEFT_COMPRANET_MAX_YEAR = 2018   # last contract on or before → «left CompraNet»
LEFT_COMPRANET_MAX_RATIO = 0.01  # and CompraNet sees < 1% of its 2018–24 budget
_hallazgos_cache: Dict[str, Any] = {}


def _hallazgos(conn) -> Dict[str, Any]:
    grades = {r[0]: r[1:] for r in conn.execute(
        "SELECT institution_id, level, grade, total_value_mxn, score, trend, last_year FROM institution_grades_v3")}
    names = {r[0]: r[1] for r in conn.execute("SELECT id, name FROM institutions")}
    fed = {i for i, g in grades.items() if g[0] == "federal"}
    df = {i for i in fed if grades[i][1] in ("D", "F")}
    # «The largest deficient federal buyer» (IMSS today) — picked by the data, never by id.
    top = max(df, key=lambda i: grades[i][2] or 0) if df else None

    years: Dict[int, Dict[int, tuple]] = {}
    for iid, y, n, v, dn, dv in conn.execute(
            "SELECT institution_id, year, n_contracts, value_mxn, da_n, da_value_mxn FROM institution_year_value"):
        years.setdefault(y, {})[iid] = (n, v, dn, dv)

    top_years = []
    if top is not None:
        for y in range(2013, max(years) + 1 if years else 2013):
            t = years.get(y, {}).get(top)
            if t and t[0]:
                top_years.append({"year": y, "value_mxn": int(t[1]),
                                  "da_share_value": round(t[3] / t[1], 4) if t[1] else None,
                                  "da_share_count": round(t[2] / t[0], 4)})

    sexenios = []
    for key, y0, y1, partial in SEXENIOS:
        fv = dfv = tv = dav = 0.0
        for y in range(y0, y1 + 1):
            for iid, (_n, v, _dn, dv) in years.get(y, {}).items():
                if iid not in fed:
                    continue
                fv += v
                dav += dv
                if iid in df:
                    dfv += v
                if iid == top:
                    tv += v
        sexenios.append({
            "key": key, "years": [y0, y1], "partial": partial,
            "federal_value_mxn": int(fv),
            "df_share": round(dfv / fv, 4) if fv else None,
            "df_share_ex_top": round((dfv - tv) / (fv - tv), 4) if fv - tv else None,
            "top_share": round(tv / fv, 4) if fv else None,
            "da_share_value": round(dav / fv, 4) if fv else None,
        })

    cov = {r[0]: r[1:] for r in conn.execute(
        "SELECT institution_id, ratio, band, is_lower_bound FROM institution_coverage_v1")} \
        if conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='institution_coverage_v1'").fetchone()[0] else {}
    left = [i for i in fed if (grades[i][5] or 0) <= LEFT_COMPRANET_MAX_YEAR
            and i in cov and cov[i][0] is not None and cov[i][0] < LEFT_COMPRANET_MAX_RATIO]
    left.sort(key=lambda i: -(grades[i][2] or 0))
    left_grades: Dict[str, int] = {}
    for i in left:
        left_grades[grades[i][1]] = left_grades.get(grades[i][1], 0) + 1
    by_band: Dict[str, Dict[str, float]] = {}
    for i in fed:
        b = cov.get(i, (None, None, None))[1] or "sin_dato"
        e = by_band.setdefault(b, {"n": 0, "value_mxn": 0})
        e["n"] += 1
        e["value_mxn"] += grades[i][2] or 0
    # Federal A-grade buyers whose coverage is only partial/low (SEDENA today): the A judges what is visible.
    a_low = sorted((i for i in fed if grades[i][1] == "A" and cov.get(i, (None, None))[1] in ("parcial", "baja")),
                   key=lambda i: -(grades[i][2] or 0))[:3]

    return {
        "top_df": None if top is None else {
            "institution_id": top, "name": names.get(top), "grade": grades[top][1],
            "score": round(grades[top][3], 1), "trend": grades[top][4],
            "value_mxn": int(grades[top][2] or 0), "years": top_years,
        },
        "sexenios": sexenios,
        "visibility": {
            "left_compranet": {
                "n": len(left), "value_mxn": int(sum(grades[i][2] or 0 for i in left)),
                "grades": left_grades, "max_last_year": max((grades[i][5] or 0 for i in left), default=None),
                "top": [{"institution_id": i, "name": names.get(i), "grade": grades[i][1],
                         "value_mxn": int(grades[i][2] or 0), "last_year": grades[i][5]} for i in left[:4]],
            },
            "a_partial": [{"institution_id": i, "name": names.get(i), "grade": "A", "value_mxn": int(grades[i][2] or 0),
                           "coverage_pct": round(cov[i][0] * 100), "lower_bound": bool(cov[i][2])} for i in a_low],
            "federal_by_band": {k: {"n": v["n"], "value_mxn": int(v["value_mxn"])} for k, v in by_band.items()},
        },
    }


@router.get("/institutions/hallazgos")
def get_institution_hallazgos():
    """Computed Hallazgos cards (biggest D/F federal buyer by year, sexenio series,
    visibility). Cached until institution_year_value / grades / coverage change."""
    with get_db() as conn:
        try:
            key = tuple(conn.execute(f"SELECT MAX(computed_at) FROM {t}").fetchone()[0]
                        for t in ("institution_year_value", "institution_grades_v3"))
        except sqlite3.OperationalError:
            raise HTTPException(status_code=404, detail="Hallazgos tables not computed on this DB")
        if _hallazgos_cache.get("key") != key:
            _hallazgos_cache.update(key=key, payload={"computed_at": key[0], **_hallazgos(conn)})
    return _hallazgos_cache["payload"]


# --- Per-sexenio v3 grades («El Tamiz en el tiempo») ---------------------------
SEXENIO_COLUMNS = ["institution_id", "sexenio", "n_contracts", "total_mxn", "score", "score_lo",
                   "score_hi", "grade", "provisional", "pillar_competencia", "pillar_proceso",
                   "pillar_concentracion", "level"]
_sexenio_cache: Dict[str, Any] = {}


@router.get("/institutions/sexenios")
def get_institution_sexenios(scope: Optional[str] = SCOPE_QUERY):
    """v3 grade per canonical institution per presidential term, frozen v3
    calibration. `sexenio` in rows indexes `sexenios`. grade/score NULL = below
    the v3 floor (n_contracts < floor). `level` = the level the row was graded in
    (peer_key), NULL below the floor. Columnar; no RFC, no vendor ids."""
    scope = _league_scope(scope)
    with get_db() as conn:
        try:
            computed_at, cal_id = conn.execute(
                "SELECT MAX(computed_at), MAX(calibration_id) FROM institution_grades_v3_sexenio").fetchone()
        except sqlite3.OperationalError:
            computed_at = None
        if computed_at is None:
            raise HTTPException(status_code=404, detail="Per-sexenio grades not computed on this DB")
        if _sexenio_cache.get("key") != computed_at:
            wins = conn.execute(
                "SELECT sexenio, window_start, window_end, coverage_flag FROM institution_grades_v3_sexenio "
                "GROUP BY sexenio ORDER BY window_start").fetchall()
            idx = {w[0]: i for i, w in enumerate(wins)}
            params = json.loads(conn.execute(
                "SELECT params_json FROM institution_grade_calibration WHERE calibration_id = ?",
                (cal_id,)).fetchone()[0])
            # below-floor rows have no peer_key: their level is the buyer's own (classify_buyer_scope.py)
            lv_sql = ("COALESCE(substr(s.peer_key, 1, instr(s.peer_key, '|') - 1), k.buyer_level)"
                      if has_buyer_scope(conn) else "substr(s.peer_key, 1, instr(s.peer_key, '|') - 1)")
            k_join = ("LEFT JOIN institution_canonical k ON k.institution_id = s.institution_id"
                      if has_buyer_scope(conn) else "")
            rows = conn.execute(
                f"SELECT {', '.join('s.' + c for c in SEXENIO_COLUMNS[:-1])}, {lv_sql} "
                f"FROM institution_grades_v3_sexenio s {k_join} "
                "ORDER BY s.institution_id, s.window_start").fetchall()
            _sexenio_cache.update(key=computed_at, payload={
                "method": "v3", "computed_at": computed_at, "calibration_id": cal_id,
                "cut_points": params.get("cut_points"), "min_contracts": 10,
                "sexenios": [{"key": k, "start": s, "end": e, "coverage": f} for k, s, e, f in wins],
                "columns": SEXENIO_COLUMNS,
                "rows": [[idx[v] if c == "sexenio" else
                          (None if v is None else bool(v)) if c == "provisional" else
                          int(v or 0) if c == "total_mxn" else _lean(c, v)
                          for c, v in zip(SEXENIO_COLUMNS, r)] for r in rows],
            })
    payload = _sexenio_cache["payload"]
    return _scoped(payload, scope, lambda r: r[-1])


@router.get("/institutions/{institution_id}", response_model=InstitutionScorecardResponse)
def get_institution_scorecard(institution_id: int = Path(..., ge=1)):
    """Full scorecard for a single institution."""
    with get_db() as conn:
        row = conn.execute("""
            SELECT s.institution_id, i.name, i.ramo_id,
                   sec.name_es AS sector_name,
                   s.total_score, s.grade, s.grade_label, s.grade_color,
                   s.national_percentile,
                   s.pillar_openness, s.pillar_price, s.pillar_vendors,
                   s.pillar_process, s.pillar_external,
                   s.top_risk_driver, s.key_metrics,
                   s.confidence_band, s.p90_risk_score,
                   s.trend_direction, s.peer_percentile_sector
            FROM institution_scorecards s
            JOIN institutions i ON s.institution_id = i.id
            LEFT JOIN sectors sec ON i.sector_id = sec.id
            WHERE s.institution_id = ?
        """, (canonical_id(conn, institution_id),)).fetchone()  # absorbed id -> canonical grade

    if not row:
        raise HTTPException(status_code=404, detail="Institution scorecard not found")

    metrics = json.loads(row[15]) if row[15] else {}
    return InstitutionScorecardResponse(
        institution_id=row[0], institution_name=row[1], ramo_code=row[2],
        sector_name=row[3], total_score=round(row[4], 1),
        grade=row[5], grade_label=row[6], grade_color=row[7],
        national_percentile=round(row[8], 3) if row[8] is not None else None,
        pillar_openness=round(row[9], 1), pillar_price=round(row[10], 1),
        pillar_vendors=round(row[11], 1), pillar_process=round(row[12], 1),
        pillar_external=round(row[13], 1),
        top_risk_driver=row[14], key_metrics=metrics,
        confidence_band=row[16],
        p90_risk_score=round(row[17], 3) if row[17] is not None else None,
        trend_direction=row[18],
        peer_percentile_sector=round(row[19], 3) if row[19] is not None else None,
        signal_count_red=metrics.get("worst_signal_count", 0),
    )


@router.get("/vendors", response_model=VendorScorecardListResponse)
def list_vendor_scorecards(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    sort_by: str = Query("total_score", pattern="^(total_score|grade|national_percentile|vendor_name|pillar_risk_signal|pillar_conduct|pillar_spread|pillar_behavior|pillar_flags)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    grade: Optional[str] = Query(None),
    min_score: Optional[float] = Query(None, ge=0, le=100),
    max_score: Optional[float] = Query(None, ge=0, le=100),
    search: Optional[str] = Query(None),
):
    """Ranked list of vendor scorecards."""
    with get_db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='vendor_scorecards'"
        ).fetchone()
        if not exists:
            return _fallback_vendor_scorecards(
                conn, page, per_page, sort_by, order,
                grade, min_score, max_score, search,
            )
        s_where: list = ["1=1"]
        s_params: list = []
        needs_join = False

        if grade:
            s_where.append("s.grade = ?")
            s_params.append(grade)
        if min_score is not None:
            s_where.append("s.total_score >= ?")
            s_params.append(min_score)
        if max_score is not None:
            s_where.append("s.total_score <= ?")
            s_params.append(max_score)
        if search:
            s_where.append("v.name LIKE ?")
            s_params.append(f"%{search}%")
            needs_join = True

        where_sql = " AND ".join(s_where)
        if sort_by == "vendor_name":
            order_sql = f"v.name {'DESC' if order == 'desc' else 'ASC'}"
            needs_join = True
        else:
            order_sql = f"s.{sort_by} {'DESC' if order == 'desc' else 'ASC'}"

        if needs_join:
            total = conn.execute(f"""
                SELECT COUNT(*) FROM vendor_scorecards s
                JOIN vendors v ON s.vendor_id = v.id WHERE {where_sql}
            """, s_params).fetchone()[0]
        else:
            total = conn.execute(f"""
                SELECT COUNT(*) FROM vendor_scorecards s WHERE {where_sql}
            """, s_params).fetchone()[0]

        offset = (page - 1) * per_page
        if needs_join:
            rows = conn.execute(f"""
                SELECT s.vendor_id, v.name,
                       s.total_score, s.grade, s.grade_label, s.grade_color,
                       s.national_percentile, s.sector_percentile,
                       s.pillar_risk_signal, s.pillar_conduct, s.pillar_spread,
                       s.pillar_behavior, s.pillar_flags,
                       s.top_risk_driver,
                       s.confidence_band, s.p90_risk_score,
                       s.trend_direction, s.risk_tier
                FROM vendor_scorecards s
                JOIN vendors v ON s.vendor_id = v.id
                WHERE {where_sql}
                ORDER BY {order_sql}
                LIMIT ? OFFSET ?
            """, s_params + [per_page, offset]).fetchall()
        else:
            rows = conn.execute(f"""
                SELECT vs.vendor_id, v.name,
                       vs.total_score, vs.grade, vs.grade_label, vs.grade_color,
                       vs.national_percentile, vs.sector_percentile,
                       vs.pillar_risk_signal, vs.pillar_conduct, vs.pillar_spread,
                       vs.pillar_behavior, vs.pillar_flags,
                       vs.top_risk_driver,
                       vs.confidence_band, vs.p90_risk_score,
                       vs.trend_direction, vs.risk_tier
                FROM (
                    SELECT s.vendor_id, s.total_score, s.grade, s.grade_label, s.grade_color,
                           s.national_percentile, s.sector_percentile,
                           s.pillar_risk_signal, s.pillar_conduct, s.pillar_spread,
                           s.pillar_behavior, s.pillar_flags, s.top_risk_driver,
                           s.confidence_band, s.p90_risk_score,
                           s.trend_direction, s.risk_tier
                    FROM vendor_scorecards AS s
                    WHERE {where_sql}
                    ORDER BY {order_sql}
                    LIMIT ? OFFSET ?
                ) vs
                JOIN vendors v ON vs.vendor_id = v.id
            """, s_params + [per_page, offset]).fetchall()

        where_no_grade = " AND ".join([c for c in s_where if "s.grade" not in c])
        filter_params_no_grade = [p for p, w in zip(s_params, s_where[1:]) if "s.grade" not in w]
        if needs_join:
            dist_rows = conn.execute(f"""
                SELECT s.grade, COUNT(*) FROM vendor_scorecards s
                JOIN vendors v ON s.vendor_id = v.id WHERE {where_no_grade}
                GROUP BY s.grade
            """, filter_params_no_grade).fetchall()
        else:
            dist_rows = conn.execute(f"""
                SELECT s.grade, COUNT(*) FROM vendor_scorecards s
                WHERE {where_no_grade} GROUP BY s.grade
            """, filter_params_no_grade).fetchall()
        grade_dist = {r[0]: r[1] for r in dist_rows}

    items = [
        VendorScorecardListItem(
            vendor_id=r[0], vendor_name=r[1],
            total_score=round(r[2], 1),
            grade=r[3], grade_label=r[4], grade_color=r[5],
            national_percentile=round(r[6] or 0.5, 3),
            sector_percentile=round(r[7] or 0.5, 3),
            pillar_risk_signal=round(r[8], 1),
            pillar_conduct=round(r[9], 1),
            pillar_spread=round(r[10], 1),
            pillar_behavior=round(r[11], 1),
            pillar_flags=round(r[12], 1),
            top_risk_driver=r[13],
            confidence_band=r[14],
            p90_risk_score=round(r[15], 3) if r[15] is not None else None,
            trend_direction=r[16],
            risk_tier=r[17],
        )
        for r in rows
    ]

    return VendorScorecardListResponse(
        data=items, total=total, page=page, per_page=per_page,
        total_pages=max(1, -(-total // per_page)),
        grade_distribution=grade_dist,
    )


@router.get("/vendors/{vendor_id}", response_model=VendorScorecardResponse)
def get_vendor_scorecard(vendor_id: int = Path(..., ge=1)):
    """Full scorecard for a single vendor."""
    try:
        with get_db() as conn:
            row = conn.execute("""
                SELECT s.vendor_id, v.name,
                       s.total_score, s.grade, s.grade_label, s.grade_color,
                       s.national_percentile, s.sector_percentile,
                       s.pillar_risk_signal, s.pillar_conduct, s.pillar_spread,
                       s.pillar_behavior, s.pillar_flags,
                       s.top_risk_driver, s.key_metrics,
                       s.confidence_band, s.p90_risk_score,
                       s.trend_direction, s.risk_tier
                FROM vendor_scorecards s
                JOIN vendors v ON s.vendor_id = v.id
                WHERE s.vendor_id = ?
            """, (vcanon.canonical_id(conn, vendor_id),)).fetchone()  # absorbed id -> canonical card
    except Exception:
        row = None

    if not row:
        raise HTTPException(status_code=404, detail="Vendor scorecard not found")

    metrics = json.loads(row[14]) if row[14] else {}
    return VendorScorecardResponse(
        vendor_id=row[0], vendor_name=row[1],
        total_score=round(row[2], 1),
        grade=row[3], grade_label=row[4], grade_color=row[5],
        national_percentile=round(row[6] or 0.5, 3),
        sector_percentile=round(row[7] or 0.5, 3),
        pillar_risk_signal=round(row[8], 1),
        pillar_conduct=round(row[9], 1),
        pillar_spread=round(row[10], 1),
        pillar_behavior=round(row[11], 1),
        pillar_flags=round(row[12], 1),
        top_risk_driver=row[13], key_metrics=metrics,
        confidence_band=row[15],
        p90_risk_score=round(row[16], 3) if row[16] is not None else None,
        trend_direction=row[17],
        risk_tier=row[18],
    )
