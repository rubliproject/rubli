"""Institution grades v3 (read-only) -- grading-v3 s.3.9 / s.6.5.

Serves the offline tables written by scripts/compute_institution_grades_v3.py.
Additive: the live v2 scorecard endpoints and table are untouched.
"""
import json
import sqlite3
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

from ..dependencies import get_db
from ..services.institution_canonical import canonical_id

router = APIRouter(prefix="/api/v1/scorecards", tags=["scorecards"])

PILLARS = ("competencia", "proceso", "concentracion")


class PillarV3(BaseModel):
    score: float
    rate: float


class PeerSetV3(BaseModel):
    key: str
    n: int
    level: str
    family: str
    size_band: str


class LedgerRowV3(BaseModel):
    pillar: str
    item: str
    rate: Optional[float]
    national_median: Optional[float]
    peer_median: Optional[float]
    points: float


class CoverageV1(BaseModel):
    """Cobertura CompraNet (coverage-badge.md): beside the grade, never in it."""
    status: str                      # ok | sin_cotejo | sin_presupuesto | no_federal
    ratio: Optional[float] = None    # CompraNet value / budget Pagado (11100 + 21100)
    band: Optional[str] = None       # alta | parcial | baja
    is_lower_bound: bool = False     # ramo rows include organos desconcentrados
    scope: Optional[str] = None      # entidad | familia | ramo
    entity_name: Optional[str] = None
    years: Optional[List[int]] = None
    compranet_value_mxn: Optional[float] = None
    budget_pagado_mxn: Optional[float] = None
    source_note: Optional[str] = None


class GradeV3Response(BaseModel):
    institution_id: int
    requested_id: int
    institution_name: Optional[str]
    method_version: str
    calibration_id: str
    grade: str
    tier_key: str
    score: float
    score_lo: float
    score_hi: float
    provisional: bool
    p_grade: float
    red_flags: List[str]
    sanction_gate: bool
    pillars: Dict[str, PillarV3]
    peer: PeerSetV3
    badges: Dict[str, Optional[object]]
    n_contracts: int
    total_value_mxn: float
    ledger: List[LedgerRowV3]
    coverage: Optional[CoverageV1] = None
    computed_at: str
    # «Por pesos» spec §7: investigated (GT) vendors it bought from, top 200 by its spend,
    # for the dossier's /aria?ids= link. Vendor ids only — no names, no RFC.
    gt_vendor_ids: List[int] = []
    # §6: contracts > 10B MXN inside the graded value (FLAG threshold: included, in review).
    flagged_n: int = 0
    flagged_value_mxn: float = 0.0


_BADGES = ("trend", "trend_slope", "trend_t", "last_year", "is_historical",
           "gt_vendor_count", "aria_t1_vendor_count", "sanctioned_vendor_count",
           "sanctioned_value_mxn", "model_hr_value_share", "single_winner_share",
           "art41_da_share_2023")


@router.get("/institutions/{institution_id}/grade-v3", response_model=GradeV3Response)
def get_institution_grade_v3(institution_id: int = Path(..., ge=1)):
    """v3 grade for one institution: band, pillars, peer set, badges and the
    points ledger (100 + sum(points) == score). Absorbed ids resolve to canonical."""
    with get_db() as conn:
        cid = canonical_id(conn, institution_id)
        try:
            row = conn.execute("""
                SELECT g.*, i.name AS institution_name
                FROM institution_grades_v3 g
                LEFT JOIN institutions i ON i.id = g.institution_id
                WHERE g.institution_id = ?
            """, (cid,)).fetchone()
            ledger = conn.execute("""
                SELECT pillar, item, rate, national_median, peer_median, points
                FROM institution_grade_ledger WHERE institution_id = ?
                ORDER BY pillar, points
            """, (cid,)).fetchall() if row else []
        except sqlite3.OperationalError:
            row = None  # tables not computed on this DB yet
        coverage = _coverage(conn, cid) if row else None
        gt_ids = _gt_vendor_ids(conn, cid) if row else []
        flagged = _flagged(conn, cid) if row else (0, 0.0)
    if not row:
        raise HTTPException(status_code=404, detail="Institution grade v3 not found")

    return GradeV3Response(
        institution_id=row["institution_id"], requested_id=institution_id,
        institution_name=row["institution_name"],
        method_version=row["method_version"], calibration_id=row["calibration_id"],
        grade=row["grade"], tier_key=row["tier_key"],
        score=round(row["score"], 2), score_lo=round(row["score_lo"], 2),
        score_hi=round(row["score_hi"], 2),
        provisional=bool(row["provisional"]), p_grade=round(row["p_grade"], 3),
        red_flags=json.loads(row["red_flags"] or "[]"),
        sanction_gate=bool(row["sanction_gate"]),
        pillars={p: PillarV3(score=round(row[f"pillar_{p}"], 2), rate=round(row[f"rate_{p}"], 4))
                 for p in PILLARS},
        peer=PeerSetV3(key=row["peer_key"], n=row["peer_n"], level=row["level"],
                       family=row["family"], size_band=row["size_band"]),
        badges={b: row[b] for b in _BADGES},
        n_contracts=row["n_contracts"], total_value_mxn=row["total_value_mxn"] or 0.0,
        ledger=[LedgerRowV3(**dict(r)) for r in ledger],
        coverage=coverage,
        computed_at=row["computed_at"],
        gt_vendor_ids=gt_ids,
        flagged_n=flagged[0], flagged_value_mxn=flagged[1],
    )


def _gt_vendor_ids(conn, cid: int) -> List[int]:
    """GT-case vendors this institution bought from, by its spend (same set as gt_vendor_count)."""
    try:
        return [r[0] for r in conn.execute("""
            SELECT r.vendor_id FROM institution_vendor_register r
            WHERE r.institution_id = ? AND r.vendor_id IN
                  (SELECT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL)
            ORDER BY r.total_value_mxn DESC LIMIT 200
        """, (cid,))]
    except sqlite3.OperationalError:
        return []


def _flagged(conn, cid: int) -> tuple:
    """(count, value) of contracts > 10B MXN, from institution_year_value when loaded."""
    try:
        r = conn.execute("SELECT COALESCE(SUM(flagged_n), 0), COALESCE(SUM(flagged_value_mxn), 0) "
                         "FROM institution_year_value WHERE institution_id = ?", (cid,)).fetchone()
    except sqlite3.OperationalError:
        return (0, 0.0)
    return (int(r[0]), float(r[1]))


def _coverage(conn, cid: int) -> Optional[CoverageV1]:
    """Coverage row, or None when institution_coverage_v1 is not loaded on this DB."""
    try:
        r = conn.execute("""
            SELECT status, ratio, band, is_lower_bound, scope, entity_name, year_from, year_to,
                   compranet_value_mxn, budget_pagado_mxn, source_note
            FROM institution_coverage_v1 WHERE institution_id = ?
        """, (cid,)).fetchone()
    except sqlite3.OperationalError:
        return None
    if not r:
        return None
    return CoverageV1(
        status=r["status"], ratio=round(r["ratio"], 4) if r["ratio"] is not None else None,
        band=r["band"], is_lower_bound=bool(r["is_lower_bound"]), scope=r["scope"],
        entity_name=r["entity_name"],
        years=[r["year_from"], r["year_to"]] if r["year_from"] else None,
        compranet_value_mxn=r["compranet_value_mxn"], budget_pagado_mxn=r["budget_pagado_mxn"],
        source_note=r["source_note"])
