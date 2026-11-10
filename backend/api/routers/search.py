"""
Federated search endpoint — Section 4.4.

GET /api/v1/search?q=PEMEX&limit=10
Runs 4 queries in parallel (vendors, institutions, contracts, cases) and returns
grouped results for the command palette and SmartSearch component.
"""
import concurrent.futures
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..pii import public_rfc
from ..dependencies import get_db
from ..services.institution_canonical import canonical_expr
from ..services.vendor_canonical import not_absorbed as vendor_not_absorbed

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class VendorResult(BaseModel):
    id: int
    name: str
    rfc: Optional[str] = None
    contracts: int
    risk_score: Optional[float] = None
    is_efos: bool = False
    is_sfp_sanctioned: bool = False

class InstitutionResult(BaseModel):
    id: int
    name: str
    institution_type: Optional[str] = None
    total_contracts: Optional[int] = None

class ContractResult(BaseModel):
    id: int
    title: str
    amount: Optional[float] = None
    risk_level: Optional[str] = None
    year: Optional[int] = None

class CaseResult(BaseModel):
    slug: str
    title: str
    year: Optional[int] = None
    sector: Optional[str] = None

class FederatedSearchResponse(BaseModel):
    query: str
    vendors: list[VendorResult]
    institutions: list[InstitutionResult]
    contracts: list[ContractResult]
    cases: list[CaseResult]
    total: int


# ---------------------------------------------------------------------------
# Helpers — each runs one category query
# ---------------------------------------------------------------------------

def _search_vendors(q: str, limit: int) -> list[VendorResult]:
    # RFC matching is company-only (12 chars): a persona-física RFC embeds a
    # birth date, so matching it would let search act as an RFC oracle.
    like_q = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    # a bare number is also a vendor id («4335» → /vendors/4335), listed first
    vid = int(q) if q.isascii() and q.isdigit() and len(q) <= 18 else -1
    try:
        with get_db() as conn:
            # Use name_normalized index when available (2x faster than raw name LIKE).
            # Also match rfc prefix. LEFT JOINs attach watchlist flags at query time.
            # absorbed ids (scripts/migrate_vendors.py) live on their canonical row
            absorbed = vendor_not_absorbed(conn, "v.id")
            cur = conn.execute(
                f"""
                SELECT v.id, v.name, v.rfc,
                       COALESCE(vs.total_contracts, 0) AS contracts,
                       vs.avg_risk_score,
                       CASE WHEN efos.rfc IS NOT NULL THEN 1 ELSE 0 END AS is_efos,
                       CASE WHEN v.rfc IS NOT NULL AND v.rfc != ''
                                 AND EXISTS (SELECT 1 FROM sfp_sanctions ss WHERE ss.rfc = v.rfc)
                            THEN 1 ELSE 0 END AS is_sfp_sanctioned
                FROM vendors v
                LEFT JOIN vendor_stats vs ON v.id = vs.vendor_id
                LEFT JOIN (
                    SELECT rfc, MIN(stage) AS stage FROM sat_efos_vendors WHERE stage IN ('definitivo','presunto') GROUP BY rfc
                ) efos ON v.rfc IS NOT NULL AND v.rfc != '' AND v.rfc = efos.rfc
                WHERE (v.name_normalized LIKE ? ESCAPE '\\'
                   OR (LENGTH(v.rfc) = 12 AND v.rfc LIKE ? ESCAPE '\\')
                   OR v.id = ?)
                  AND {absorbed}
                ORDER BY (v.id = ?) DESC, contracts DESC
                LIMIT ?
                """,
                (like_q, like_q, vid, vid, limit),
            )
            rows = cur.fetchall()
        return [
            VendorResult(
                id=r["id"],
                name=r["name"],
                rfc=public_rfc(r["rfc"]),
                contracts=r["contracts"] or 0,
                risk_score=r["avg_risk_score"],
                is_efos=bool(r["is_efos"]),
                is_sfp_sanctioned=bool(r["is_sfp_sanctioned"]),
            )
            for r in rows
        ]
    except Exception as e:
        logger.error("vendor search error: %s", e)
        raise


def _search_institutions(q: str, limit: int) -> list[InstitutionResult]:
    try:
        with get_db() as conn:
            # any spelling (m) matches; the result is its canonical institution (i), once
            cur = conn.execute(
                f"""
                SELECT i.id, i.name, i.institution_type,
                       COALESCE(ist.total_contracts, 0) AS total_contracts
                FROM institutions m
                JOIN institutions i ON i.id = {canonical_expr(conn, "m.id")}
                LEFT JOIN institution_stats ist ON i.id = ist.institution_id
                WHERE m.name LIKE ? OR COALESCE(m.siglas, '') LIKE ?
                GROUP BY i.id
                ORDER BY total_contracts DESC
                LIMIT ?
                """,
                (f"%{q}%", f"%{q}%", limit),
            )
            rows = cur.fetchall()
        return [
            InstitutionResult(
                id=r["id"],
                name=r["name"],
                institution_type=r["institution_type"],
                total_contracts=r["total_contracts"],
            )
            for r in rows
        ]
    except Exception as e:
        logger.error("institution search error: %s", e)
        raise


def sanitize_fts_query(q: str) -> str:
    """Escape FTS5 special operators by wrapping in double quotes.

    This treats the input as a literal phrase, preventing operator injection
    via FTS5 keywords such as AND, OR, NOT, NEAR, and column filters.
    """
    # Escape any existing double quotes to prevent escaping issues
    sanitized = q.replace('"', '""')
    return f'"{sanitized}"'


def _search_contracts(q: str, limit: int) -> list[ContractResult]:
    """Search contracts by title using FTS5 if available, falling back to LIKE.

    FTS5 table `contracts_fts` (rowid = contracts.id, content = title) is built
    once by the migration script and reduces this query from ~24s → <200ms.
    If the FTS table doesn't exist we fall back to the slow LIKE scan so the
    endpoint still works on dev environments without the migration applied.
    """
    try:
        with get_db() as conn:
            # An exact procedure number lands on that procedure's contracts (indexed equality).
            term = q.strip()
            proc = conn.execute(
                """SELECT id, title, amount_mxn, risk_level, contract_year FROM contracts
                   WHERE procedure_number IN (?, ?) ORDER BY amount_mxn DESC LIMIT ?""",
                (term, term.upper(), limit),
            ).fetchall()
            if proc:
                return [ContractResult(id=r["id"], title=r["title"] or "", amount=r["amount_mxn"],
                                       risk_level=r["risk_level"], year=r["contract_year"]) for r in proc]
            # Check FTS table exists before trying — LIKE scan on 3.1M rows causes 30s timeout
            fts_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='contracts_fts'"
            ).fetchone()
            if not fts_exists:
                return []
            try:
                cur = conn.execute(
                    """
                    SELECT c.id, c.title, c.amount_mxn, c.risk_level, c.contract_year
                    FROM contracts c
                    WHERE c.id IN (
                        SELECT rowid FROM contracts_fts
                        WHERE contracts_fts MATCH ?
                        LIMIT ?
                    )
                    """,
                    (sanitize_fts_query(q), limit),
                )
                rows = cur.fetchall()
            except Exception:
                rows = []
        return [
            ContractResult(
                id=r["id"],
                title=r["title"] or "",
                amount=r["amount_mxn"],
                risk_level=r["risk_level"],
                year=r["contract_year"],
            )
            for r in rows
        ]
    except Exception as e:
        logger.error("contract search error: %s", e)
        raise


def _search_cases(q: str, limit: int) -> list[CaseResult]:
    try:
        with get_db() as conn:
            cur = conn.execute(
                """
                SELECT slug, name_en AS title,
                       contract_year_start AS year,
                       CAST(sector_id AS TEXT) AS sector
                FROM procurement_scandals
                WHERE is_verified = 1
                  AND (name_en LIKE ? OR name_es LIKE ? OR slug LIKE ?)
                ORDER BY contract_year_start DESC
                LIMIT ?
                """,
                (f"%{q}%", f"%{q}%", f"%{q}%", limit),
            )
            rows = cur.fetchall()
        return [
            CaseResult(slug=r["slug"], title=r["title"], year=r["year"], sector=r["sector"])
            for r in rows
        ]
    except Exception as e:
        logger.error("case search error: %s", e)
        raise


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/search", response_model=FederatedSearchResponse)
def federated_search(
    q: str = Query(..., min_length=2, max_length=100, description="Search query"),
    limit: int = Query(default=5, ge=1, le=20, description="Max results per category"),
):
    """
    Federated search across vendors, institutions, contracts, and cases.
    Runs all 4 queries in parallel via ThreadPoolExecutor.
    """
    q = q.strip()

    failed: list[str] = []

    def _safe_result(future, label: str):
        # One facet failing degrades to an empty list; all four failing is an
        # outage, not "no results" (handled below).
        try:
            return future.result(timeout=15.0)
        except concurrent.futures.TimeoutError:
            logger.warning("search timeout for %s", label)
        except Exception as e:
            logger.warning("search error for %s: %s", label, e)
        failed.append(label)
        return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_vendors = executor.submit(_search_vendors, q, limit)
        f_institutions = executor.submit(_search_institutions, q, limit)
        f_contracts = executor.submit(_search_contracts, q, limit)
        f_cases = executor.submit(_search_cases, q, limit)

        vendors = _safe_result(f_vendors, "vendors")
        institutions = _safe_result(f_institutions, "institutions")
        contracts = _safe_result(f_contracts, "contracts")
        cases = _safe_result(f_cases, "cases")

    if len(failed) == 4:
        raise HTTPException(status_code=503, detail="Search is temporarily unavailable")

    total = len(vendors) + len(institutions) + len(contracts) + len(cases)

    return FederatedSearchResponse(
        query=q,
        vendors=vendors,
        institutions=institutions,
        contracts=contracts,
        cases=cases,
        total=total,
    )
