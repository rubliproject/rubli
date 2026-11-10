"""«La Anatomía» — the institution dossier's grade decomposition and category lens.

  GET /api/v1/scorecards/institutions/{id}/anatomy
      The stored grade as five pillars, each against its observed cap and its
      PEER group (same institution_type × is_federal), with the stored driver
      metrics and signal lights from key_metrics. No contracts scan: the whole
      2,116-row scorecard table is read once per process and cached.

  GET /api/v1/institutions/{id}/category-lens
      The institution's categories with the per-pillar metric next to the
      national category baseline (precompute scripts/precompute_institution_lens.py).

  GET /api/v1/institutions/{id}/categories/{category_id}/vendors
      Top vendors inside one category at this institution (same precompute).

Sub-pillar POINTS are deliberately absent: the live pillar values do not
reproduce from compute_scorecards.py (Openness/External formulas drifted —
proposal dossier-grade.md § 0), so only stored values and stored signals are
served. `penalties` stays null until a recompute writes a points ledger (v3).

Spec: .claude/designus/institutions-uipro-2026-10-07/proposals/dossier-grade.md § 7.
"""
import json
import sqlite3
import statistics
import threading
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Path, Query

from ..dependencies import get_db
from ..services.institution_canonical import canonical_id

router = APIRouter(prefix="/api/v1", tags=["institution-anatomy"])

# DB column -> conceptual pillar. Mirrors frontend/src/lib/institution-pillars.ts
# (compute_scorecards.py stores the pillars under legacy column names).
PILLARS: List[Dict[str, Any]] = [
    {"key": "openness", "column": "pillar_openness", "cap": 20,
     "label_es": "Apertura y Competencia", "label_en": "Competitive Openness",
     "drivers": [("competitive_rate", "signal_competitive"), ("competitive_rate_value", None),
                 ("single_bid_pct", "signal_single_bid")],
     "category_lens": "da"},
    {"key": "process", "column": "pillar_price", "cap": 25,
     "label_es": "Integridad de Proceso", "label_en": "Process Integrity",
     "drivers": [("splitting_rate", None), ("year_end_rate", "signal_year_end"),
                 ("short_ad_rate", "signal_short_ad")],
     "category_lens": "ye"},
    {"key": "tail", "column": "pillar_vendors", "cap": 20,
     "label_es": "Riesgo de Cola (P90)", "label_en": "Tail Risk (P90)",
     "drivers": [("p90_risk_score", "signal_p90_risk"), ("avg_risk_score", None)],
     "category_lens": "hr"},
    {"key": "external", "column": "pillar_process", "cap": 15,
     "label_es": "Alertas Externas", "label_en": "External Flags",
     "drivers": [("gt_vendor_count", None), ("aria_t1_vendors", "signal_external"),
                 ("aria_t2_vendors", None), ("efos_vendors", None)],
     "category_lens": None, "exposure": True},
    {"key": "independence", "column": "pillar_external", "cap": 10,
     "label_es": "Independencia de Proveedores", "label_en": "Vendor Independence",
     "drivers": [("hhi_peer_percentile", None), ("hhi", None), ("vendor_count", None)],
     "category_lens": "top1"},
]
CEILING = sum(p["cap"] for p in PILLARS)  # 90 — S (≥90) is unreachable with observed caps
MIN_PEERS_FOR_BANDS = 3

_cache_lock = threading.Lock()
_cache: Dict[str, Any] = {"stamp": None, "rows": None}


def _load_population(conn: sqlite3.Connection) -> Dict[int, Dict[str, Any]]:
    """All scorecard rows + peer keys, cached until computed_at changes."""
    stamp = conn.execute("SELECT MAX(computed_at), COUNT(*) FROM institution_scorecards").fetchone()
    stamp = tuple(stamp)
    with _cache_lock:
        if _cache["stamp"] == stamp and _cache["rows"] is not None:
            return _cache["rows"]
    cols = ", ".join(f"s.{p['column']}" for p in PILLARS)
    rows: Dict[int, Dict[str, Any]] = {}
    for r in conn.execute(f"""
        SELECT s.institution_id, s.total_score, s.grade, s.confidence_band, s.key_metrics,
               COALESCE(i.institution_type, 'other') AS itype, COALESCE(i.is_federal, 0) AS fed,
               st.total_contracts, {cols}
        FROM institution_scorecards s
        JOIN institutions i ON i.id = s.institution_id
        LEFT JOIN institution_stats st ON st.institution_id = s.institution_id
    """):
        rows[r["institution_id"]] = {
            "score": r["total_score"], "grade": r["grade"], "band": r["confidence_band"],
            "km": r["key_metrics"], "type": r["itype"], "fed": int(r["fed"] or 0),
            "n": r["total_contracts"],
            "pillars": {p["key"]: r[p["column"]] or 0.0 for p in PILLARS},
        }
    with _cache_lock:
        _cache["stamp"], _cache["rows"] = stamp, rows
    return rows


def _quartiles(vals: List[float]) -> Optional[Dict[str, float]]:
    if len(vals) < MIN_PEERS_FOR_BANDS:
        return None
    q = statistics.quantiles(vals, n=4, method="inclusive")
    return {"p25": round(q[0], 2), "median": round(q[1], 2), "p75": round(q[2], 2)}


def build_anatomy(rows: Dict[int, Dict[str, Any]], iid: int) -> Dict[str, Any]:
    """Pure: the anatomy payload for one institution from the cached population."""
    me = rows[iid]
    peers = [r for r in rows.values() if r["type"] == me["type"] and r["fed"] == me["fed"]]
    everyone = list(rows.values())
    km = json.loads(me["km"]) if me["km"] else {}

    pillars = []
    worst_key, worst_gap = None, 0.0
    for p in PILLARS:
        value = me["pillars"][p["key"]]
        peer_q = _quartiles([r["pillars"][p["key"]] for r in peers])
        all_q = _quartiles([r["pillars"][p["key"]] for r in everyone])
        ref = (peer_q or all_q or {}).get("median")
        # External is investigative exposure (GT/ARIA links), not process — it
        # never names the "dragging" pillar (scoring analysis SR-1).
        if ref is not None and not p.get("exposure"):
            gap = (ref - value) / p["cap"]
            if gap > worst_gap:
                worst_key, worst_gap = p["key"], gap
        pillars.append({
            "key": p["key"], "label_es": p["label_es"], "label_en": p["label_en"],
            "cap": p["cap"], "value": round(value, 1),
            "peer": peer_q, "all": all_q,
            "drivers": [
                {"key": k, "value": km.get(k), "signal": km.get(sig) if sig else None}
                for k, sig in p["drivers"] if km.get(k) is not None
            ],
            "penalties": None,
            "category_lens": p["category_lens"],
            "exposure": bool(p.get("exposure")),
        })

    peer_scores = sorted((r["score"] for r in peers), reverse=True)
    score_q = _quartiles([r["score"] for r in peers])
    return {
        "institution_id": iid,
        "method_version": "v2-live",
        "grade": me["grade"],
        "score": round(me["score"], 1),
        "ceiling": CEILING,
        "confidence_band": me["band"],
        "n_contracts": me["n"],
        "ci": None,
        "peer_group": {
            "institution_type": me["type"],
            "is_federal": bool(me["fed"]),
            "n": len(peers),
            "rank": 1 + sum(1 for s in peer_scores if s > me["score"]),
            "median": score_q["median"] if score_q else None,
            "p25": score_q["p25"] if score_q else None,
            "p75": score_q["p75"] if score_q else None,
        },
        "pillars": pillars,
        "dragging_pillar": worst_key,
    }


@router.get("/scorecards/institutions/{institution_id}/anatomy")
def get_institution_anatomy(institution_id: int = Path(..., ge=1)):
    """Grade anatomy: stored pillars vs caps and vs the peer group."""
    with get_db() as conn:
        iid = canonical_id(conn, institution_id)
        rows = _load_population(conn)
    if iid not in rows:
        raise HTTPException(status_code=404, detail="Institution scorecard not found")
    return build_anatomy(rows, iid)


@router.get("/scorecards/institutions/{institution_id}/peers")
def get_institution_peers(institution_id: int = Path(..., ge=1)):
    """The peer group behind the anatomy's rank (same type × federal flag)."""
    with get_db() as conn:
        iid = canonical_id(conn, institution_id)
        rows = _load_population(conn)
        if iid not in rows:
            raise HTTPException(status_code=404, detail="Institution scorecard not found")
        me = rows[iid]
        ids = [k for k, r in rows.items() if r["type"] == me["type"] and r["fed"] == me["fed"]]
        names = dict(conn.execute(
            f"SELECT id, name FROM institutions WHERE id IN ({','.join('?' * len(ids))})", ids
        ).fetchall()) if ids else {}
    data = sorted(
        ({"institution_id": k, "name": names.get(k, ""), "score": round(rows[k]["score"], 1),
          "grade": rows[k]["grade"], "confidence_band": rows[k]["band"], "is_self": k == iid}
         for k in ids),
        key=lambda d: -d["score"],
    )
    return {"institution_id": iid, "data": data}


def _pct(num: Optional[float], den: Optional[float]) -> Optional[float]:
    return round(100.0 * num / den, 1) if num is not None and den else None


@router.get("/institutions/{institution_id:int}/category-lens")
def get_institution_category_lens(
    institution_id: int = Path(..., ge=1),
    limit: int = Query(12, ge=1, le=80),
):
    """Categories with each pillar-lens metric vs the national category baseline.

    Metrics (all %): da = direct award / contracts · sb = single bid / competitive
    procedures · ye = year-end / contracts · hr = high+critical risk / contracts ·
    top1 = largest vendor's share of the category's value at this institution.
    Returns 200 with data: [] when the precompute has not run.
    """
    with get_db() as conn:
        iid = canonical_id(conn, institution_id)
        if not conn.execute("SELECT 1 FROM institutions WHERE id = ?", (iid,)).fetchone():
            raise HTTPException(status_code=404, detail=f"Institution {institution_id} not found")
        try:
            rows = conn.execute("""
                SELECT s.category_id, cat.name_es, cat.name_en, cat.sector_id,
                       s.contract_count, s.total_value_mxn, s.da_count, s.competitive_count,
                       s.sb_count, s.ye_count, s.hr_count, s.vendor_count, s.top1_value_mxn,
                       b.contract_count AS b_n, b.da_count AS b_da, b.competitive_count AS b_comp,
                       b.sb_count AS b_sb, b.ye_count AS b_ye, b.hr_count AS b_hr
                FROM institution_category_signals s
                JOIN categories cat ON cat.id = s.category_id
                LEFT JOIN category_signal_baseline b ON b.category_id = s.category_id
                WHERE s.institution_id = ?
                ORDER BY s.total_value_mxn DESC
            """, (iid,)).fetchall()
        except sqlite3.OperationalError:
            rows = []
    total_value = sum(r["total_value_mxn"] or 0 for r in rows)
    total_n = sum(r["contract_count"] or 0 for r in rows)
    data = [{
        "category_id": r["category_id"],
        "name_es": r["name_es"], "name_en": r["name_en"], "sector_id": r["sector_id"],
        "contract_count": r["contract_count"],
        "total_value_mxn": r["total_value_mxn"],
        "spend_share": round(r["total_value_mxn"] / total_value, 4) if total_value else None,
        "vendor_count": r["vendor_count"],
        "metrics": {
            "da": _pct(r["da_count"], r["contract_count"]),
            "sb": _pct(r["sb_count"], r["competitive_count"]),
            "ye": _pct(r["ye_count"], r["contract_count"]),
            "hr": _pct(r["hr_count"], r["contract_count"]),
            "top1": _pct(r["top1_value_mxn"], r["total_value_mxn"]),
        },
        "baseline": {
            "da": _pct(r["b_da"], r["b_n"]),
            "sb": _pct(r["b_sb"], r["b_comp"]),
            "ye": _pct(r["b_ye"], r["b_n"]),
            "hr": _pct(r["b_hr"], r["b_n"]),
            "top1": None,  # no national analogue — the lens reads the absolute share
        },
        "competitive_count": r["competitive_count"],
    } for r in rows[:limit]]
    return {
        "institution_id": iid,
        "total_categories": len(rows),
        "total_contracts": total_n,
        "total_value_mxn": total_value,
        "data": data,
    }


@router.get("/institutions/{institution_id:int}/categories/{category_id:int}/vendors")
def get_institution_category_vendors(
    institution_id: int = Path(..., ge=1),
    category_id: int = Path(..., ge=1),
):
    """Top vendors (by value, max 8) inside one category at this institution. No RFC."""
    with get_db() as conn:
        iid = canonical_id(conn, institution_id)
        try:
            head = conn.execute("""
                SELECT s.contract_count, s.total_value_mxn, s.vendor_count,
                       cat.name_es, cat.name_en
                FROM institution_category_signals s
                JOIN categories cat ON cat.id = s.category_id
                WHERE s.institution_id = ? AND s.category_id = ?
            """, (iid, category_id)).fetchone()
            rows = conn.execute("""
                SELECT t.rank, t.vendor_id, v.name AS vendor_name, t.contract_count,
                       t.total_value_mxn, t.da_count, t.sb_count, t.hr_count
                FROM institution_category_vendor_topn t
                LEFT JOIN vendors v ON v.id = t.vendor_id
                WHERE t.institution_id = ? AND t.category_id = ?
                ORDER BY t.rank
            """, (iid, category_id)).fetchall() if head else []
        except sqlite3.OperationalError:
            head, rows = None, []
    if not head:
        raise HTTPException(status_code=404, detail="No contracts in this category at this institution")
    cat_value = head["total_value_mxn"] or 0
    return {
        "institution_id": iid,
        "category_id": category_id,
        "name_es": head["name_es"], "name_en": head["name_en"],
        "contract_count": head["contract_count"],
        "total_value_mxn": cat_value,
        "vendor_count": head["vendor_count"],
        "data": [{
            "rank": r["rank"], "vendor_id": r["vendor_id"], "vendor_name": r["vendor_name"],
            "contract_count": r["contract_count"], "total_value_mxn": r["total_value_mxn"],
            "share": round(r["total_value_mxn"] / cat_value, 4) if cat_value else None,
            "da_pct": _pct(r["da_count"], r["contract_count"]),
            "hr_pct": _pct(r["hr_count"], r["contract_count"]),
        } for r in rows],
    }


# ─── v3 peer context (grading-v3 is the live grade from 2026-10-08) ─────────

V3_PILLARS = ("competencia", "proceso", "concentracion")


@router.get("/scorecards/institutions/{institution_id}/peers-v3")
def get_institution_peers_v3(institution_id: int = Path(..., ge=1)):
    """The v3 peer set (level × family × size, as stored in peer_key) around one
    institution: rank, score and pillar quartiles, the named peers, and the
    frozen grade cut points of the active calibration. Pairs with
    /scorecards/institutions/{id}/grade-v3 for the dossier's «La Anatomía»."""
    with get_db() as conn:
        iid = canonical_id(conn, institution_id)
        try:
            me = conn.execute(
                "SELECT peer_key, calibration_id FROM institution_grades_v3 WHERE institution_id = ?", (iid,)
            ).fetchone()
            if not me:
                raise HTTPException(status_code=404, detail="Institution grade v3 not found")
            rows = conn.execute("""
                SELECT g.institution_id, i.name, g.score, g.grade, g.provisional,
                       g.pillar_competencia, g.pillar_proceso, g.pillar_concentracion
                FROM institution_grades_v3 g
                LEFT JOIN institutions i ON i.id = g.institution_id
                WHERE g.peer_key = ?
            """, (me["peer_key"],)).fetchall()
            cal = conn.execute(
                "SELECT params_json FROM institution_grade_calibration WHERE calibration_id = ?",
                (me["calibration_id"],),
            ).fetchone()
        except sqlite3.OperationalError:
            raise HTTPException(status_code=404, detail="Institution grade v3 not found")
    me_score = next(r["score"] for r in rows if r["institution_id"] == iid)
    cuts = (json.loads(cal["params_json"]).get("cut_points") if cal else None) or []
    data = sorted(
        ({"institution_id": r["institution_id"], "name": r["name"] or "", "score": round(r["score"], 1),
          "grade": r["grade"], "provisional": bool(r["provisional"]), "is_self": r["institution_id"] == iid}
         for r in rows),
        key=lambda d: -d["score"],
    )
    return {
        "institution_id": iid,
        "peer_key": me["peer_key"],
        "n": len(rows),
        "rank": 1 + sum(1 for r in rows if r["score"] > me_score),
        "score": _quartiles([r["score"] for r in rows]),
        "pillars": {p: _quartiles([r[f"pillar_{p}"] for r in rows]) for p in V3_PILLARS},
        # A ≥ cuts[0] · B ≥ cuts[1] · C ≥ cuts[2] · D ≥ cuts[3] · else F
        "cut_points": [{"grade": g, "min": c} for g, c in zip(("A", "B", "C", "D"), cuts)],
        "data": data,
    }
