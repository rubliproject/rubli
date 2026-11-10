"""Post-CompraNet gap API — the 2025-2026 awards recovered by scraping ComprasMX
after the federal bulk feed froze (Sep 28 2025). Served from the `gap_contracts`
staging table (NOT the scored corpus): procedure-level for all, OCR-recovered
vendor + real amount for the top-value direct awards."""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
import sqlite3

from ..cache import app_cache
from ..config.constants import MAX_CONTRACT_VALUE, FLAG_THRESHOLD
from ..pii import public_rfc
from ..public_labels import clean_name, is_persona_fisica
from ..dependencies import get_db_dep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gap", tags=["gap"])

SECTOR_NAMES = {1: "salud", 2: "educacion", 3: "infraestructura", 4: "energia",
                5: "defensa", 6: "tecnologia", 7: "hacienda", 8: "gobernacion",
                9: "agricultura", 10: "ambiente", 11: "trabajo", 12: "otros"}


def _has_table(db: sqlite3.Connection) -> bool:
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gap_contracts'").fetchone() is not None


# gap_vendor_resolution (scripts/resolve_gap_vendors.py) is an owner-approved
# separate load: absent → vendor_source=null and the frontend shows the raw OCR string.
_HAS_RES: Optional[bool] = None
COMPANY_RFC_SQL = "length(g.vendor_rfc)=12 AND instr(g.vendor_rfc,'*')=0"  # persona moral, public


def _has_resolution(db: sqlite3.Connection) -> bool:
    global _HAS_RES
    if _HAS_RES is None:
        _HAS_RES = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' "
                              "AND name='gap_vendor_resolution'").fetchone() is not None
    return _HAS_RES


def _funnel(db: sqlite3.Connection, has_res: bool) -> Dict[str, Any]:
    """The reading, measured — every stage derivable from the staging tables. Letter-reading
    stages count amount_mxn_recovered (OCR), not amount_source, which is 'datos' since 2026-10-20.
    letters_read comes from `gap_letters` (scripts/load_gap_letters.py): emitted only when it is loaded."""
    f = dict(db.execute(f"""
        SELECT COUNT(*) listed,
          SUM(CAST(is_direct_award AS INT)=1) da_in_scope,
          SUM(CAST(is_direct_award AS INT)=1 AND COALESCE(award_doc_type,'')<>'') letters_found,
          SUM(CAST(amount_mxn_recovered AS REAL)>0) amounts_read,
          COALESCE(SUM(CASE WHEN CAST(amount_mxn_recovered AS REAL)>0 THEN CAST(amount_mxn_recovered AS REAL) END),0) amounts_read_sum,
          SUM(amount_source='estimated') estimated,
          COALESCE(SUM(CASE WHEN amount_source='estimated' THEN CAST(amount_mxn_best AS REAL) END),0) estimated_sum,
          SUM(COALESCE(vendor,'')<>'') vendor_named,
          SUM(vendor_match='self_buyer') self_buyer,
          COUNT(DISTINCT CASE WHEN {COMPANY_RFC_SQL} THEN g.vendor_rfc END) companies_rfc,
          SUM(CAST(is_direct_award AS INT)=1 AND COALESCE(vendor,'')='' AND COALESCE(vendor_rfc,'')=''
              AND NOT COALESCE(CAST(amount_mxn_recovered AS REAL)>0, 0)) neither
        FROM gap_contracts g""").fetchone())
    f["companies_rfc_in_corpus"] = db.execute(f"""SELECT COUNT(DISTINCT g.vendor_rfc) FROM gap_contracts g
        WHERE {COMPANY_RFC_SQL} AND g.vendor_rfc IN (SELECT best_rfc FROM vendor_rfc_quality
                                   UNION SELECT rfc FROM vendors WHERE length(rfc)=12)  -- deploy DB scrubs best_rfc""").fetchone()[0]
    top = db.execute("""SELECT legacy_institution_id, institution_siglas, COUNT(*) n FROM gap_contracts
        WHERE vendor_match='self_buyer' GROUP BY 1 ORDER BY 3 DESC LIMIT 1""").fetchone()
    if top:
        f["self_buyer_top"] = {"institution_id": top[0], "siglas": top[1], "count": top[2]}
    if has_res:
        f["illegible"] = db.execute("SELECT COUNT(*) FROM gap_vendor_resolution WHERE source='illegible'").fetchone()[0]
    # PII-free letter ledger (scripts/load_gap_letters.py); `fallos` only exists in the scraper DB
    for t in ("gap_letters", "fallos"):
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone():
            f["letters_read"] = db.execute(f"SELECT COUNT(*) FROM {t} WHERE status='ok'").fetchone()[0]
            break
    return f


def _data_window(db: sqlite3.Connection) -> str:
    r = db.execute("""SELECT MIN(substr(publication_date,1,10)), MAX(substr(publication_date,1,10))
        FROM gap_contracts WHERE publication_date IS NOT NULL""").fetchone()
    return f"{r[0]} .. {r[1]}" if r and r[0] else ""


@router.get("/summary")
def gap_summary(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    if not _has_table(db):
        return {"available": False}
    cached = app_cache.get("gap_summary", "v")
    if cached is not None:
        return cached
    r = db.execute("""
        SELECT COUNT(*) total,
          SUM(CASE WHEN CAST(amount_mxn_recovered AS REAL)>0 THEN 1 ELSE 0 END) recovered_n,
          COALESCE(SUM(CAST(amount_mxn_recovered AS REAL)),0) recovered_sum,
          SUM(CASE WHEN CAST(is_direct_award AS INT)=1 THEN 1 ELSE 0 END) da_n,
          SUM(CASE WHEN CAST(is_young_vendor AS INT)=1 THEN 1 ELSE 0 END) young_n,
          SUM(CASE WHEN CAST(efos_flag AS INT)=1 THEN 1 ELSE 0 END) efos_n,
          COALESCE(SUM(CAST(amount_mxn_best AS REAL)),0) best_sum
        FROM gap_contracts""").fetchone()
    total = r["total"] or 1
    # Every door (no LIMIT): count, money read off the letters, busiest buyer.
    by_exc = [{"article": x["art"], "count": x["n"], "ocr_sum_mxn": x["ocr"],
               "top_institution_id": x["iid"], "top_siglas": x["sig"]}
              for x in db.execute("""
                WITH a AS (SELECT exception_article art, COUNT(*) n,
                    COALESCE(SUM(CASE WHEN CAST(amount_mxn_recovered AS REAL)>0 THEN CAST(amount_mxn_recovered AS REAL) END),0) ocr
                  FROM gap_contracts WHERE COALESCE(exception_article,'')<>'' GROUP BY 1),
                b AS (SELECT exception_article art, legacy_institution_id iid, MAX(institution_siglas) sig,
                    ROW_NUMBER() OVER (PARTITION BY exception_article ORDER BY COUNT(*) DESC) rk
                  FROM gap_contracts WHERE COALESCE(exception_article,'')<>'' AND legacy_institution_id IS NOT NULL
                  GROUP BY 1, 2)
                SELECT a.art, a.n, a.ocr, b.iid, b.sig FROM a LEFT JOIN b ON b.art=a.art AND b.rk=1
                ORDER BY a.n DESC""")]
    # Top 12 buyers by procedures, with their pre-blackout direct-award rate (same institution id).
    top_buyers = [dict(x) for x in db.execute("""
        WITH t AS (SELECT legacy_institution_id iid, MAX(institution_siglas) siglas, MAX(institution_name) name,
            COUNT(*) count, ROUND(100.0*SUM(CAST(is_direct_award AS INT)=1)/COUNT(*),1) da_pct,
            COALESCE(SUM(CASE WHEN CAST(amount_mxn_recovered AS REAL)>0 THEN CAST(amount_mxn_recovered AS REAL) END),0) ocr_sum_mxn,
            ROUND(AVG(gap_risk_score),1) avg_score
          FROM gap_contracts WHERE legacy_institution_id IS NOT NULL GROUP BY 1 ORDER BY count DESC LIMIT 12),
        d AS (SELECT legacy_institution_id iid, exception_article art,
            ROW_NUMBER() OVER (PARTITION BY legacy_institution_id ORDER BY COUNT(*) DESC) rk
          FROM gap_contracts WHERE legacy_institution_id IN (SELECT iid FROM t)
            AND COALESCE(exception_article,'')<>'' GROUP BY 1, 2)
        SELECT t.iid institution_id, t.siglas, t.name, t.count, t.da_pct, s.direct_award_pct pre_da_pct,
               d.art top_article, t.ocr_sum_mxn, t.avg_score
        FROM t LEFT JOIN institution_stats s ON s.institution_id=t.iid
        LEFT JOIN d ON d.iid=t.iid AND d.rk=1 ORDER BY t.count DESC""")]
    by_sector = [{"sector_id": int(x["sector_id"]) if x["sector_id"] else 12,
                  "sector": SECTOR_NAMES.get(int(x["sector_id"]) if x["sector_id"] else 12, "otros"),
                  "count": x["n"]}
                 for x in db.execute("""SELECT sector_id, COUNT(*) n FROM gap_contracts
                   GROUP BY 1 ORDER BY 2 DESC LIMIT 12""")]
    by_risk = {x["gap_risk_level"]: x["n"]
               for x in db.execute("""SELECT gap_risk_level, COUNT(*) n FROM gap_contracts
                 WHERE gap_risk_level IS NOT NULL GROUP BY 1""")}
    # Buyer level (federal / state / municipal / autonomous) — the /gap headline
    # counts federal buyers only and labels the rest. Guarded: older copies of
    # the staging table predate the gap linker's buyer_level column.
    has_level = any(c["name"] == "buyer_level" for c in db.execute("PRAGMA table_info(gap_contracts)"))
    by_level = ({(x["buyer_level"] or "unknown"): x["n"]
                 for x in db.execute("SELECT buyer_level, COUNT(*) n FROM gap_contracts GROUP BY 1")}
                if has_level else {})
    fed_da = (db.execute("""SELECT SUM(CASE WHEN CAST(is_direct_award AS INT)=1 THEN 1 ELSE 0 END)
                FROM gap_contracts WHERE buyer_level='federal'""").fetchone()[0] or 0
              if has_level else None)
    fed_n = by_level.get("federal") or 0
    worst = [{"siglas": x["institution_siglas"], "avg_score": round(x["a"], 1), "count": x["n"]}
             for x in db.execute("""SELECT institution_siglas, AVG(gap_risk_score) a, COUNT(*) n
               FROM gap_contracts WHERE institution_siglas IS NOT NULL AND gap_risk_score IS NOT NULL
               GROUP BY 1 HAVING n>=50 ORDER BY a DESC LIMIT 10""")]
    out = {
        "available": True,
        "total_contracts": r["total"],
        "direct_award_count": r["da_n"],
        "direct_award_pct": round(100.0 * r["da_n"] / total, 1),
        "recovered_count": r["recovered_n"],
        "recovered_sum_mxn": r["recovered_sum"],
        "best_available_sum_mxn": r["best_sum"],
        "young_vendor_count": r["young_n"],
        "efos_count": r["efos_n"],
        "by_exception_article": by_exc,
        "by_sector": by_sector,
        "by_buyer_level": by_level,
        # Federal-only direct award, matching the federal headline (None on old tables).
        "federal_direct_award_count": fed_da,
        "federal_direct_award_pct": round(100.0 * fed_da / fed_n, 1) if fed_da is not None and fed_n else None,
        "by_risk_level": {k: by_risk.get(k, 0) for k in ("critical", "high", "medium", "low")},
        "worst_institutions": worst,
        "top_buyers": top_buyers,
        "funnel": _funnel(db, _has_resolution(db)),
        "grade_methodology": (
            "Structural red-flag indicator (0-100), NOT the v0.9.1 corruption model — "
            "post-horizon data lacks its features. Built from observable flags: "
            "no-competition, undisclosed amount, discretionary sole-source exception "
            "(Art.54 fr.I/II/III/V/VII), ghost vendor (<3yr), SAT 69-B (EFOS), vendor "
            "concentration, and magnitude. Art.55 low-value threshold scores lower."
        ),
        "data_window": _data_window(db),
        "source": "ComprasMX (post-CompraNet) — staging, not scored",
    }
    app_cache.set("gap_summary", "v", out, maxsize=1, ttl=600)
    return out


@router.get("/contracts")
def gap_contracts(
    db: sqlite3.Connection = Depends(get_db_dep),
    direct_award: Optional[int] = Query(None, ge=0, le=1),
    sector_id: Optional[int] = Query(None),
    recovered_only: bool = Query(False),
    young_only: bool = Query(False),
    art: Optional[str] = Query(None, max_length=60),
    inst: Optional[int] = Query(None),
    src: Optional[str] = Query(None, pattern="^(ocr|est|none)$"),
    flag: Optional[str] = Query(None, pattern="^(young|efos|review|self_buyer)$"),
    vend: Optional[str] = Query(None, pattern="^(rfc|linked|illegible)$"),
    q: Optional[str] = Query(None, max_length=120),
    sort: str = Query("risk", pattern="^(amount|date|risk)$"),
    risk_level: Optional[str] = Query(None, pattern="^(critical|high|medium|low)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    if not _has_table(db):
        return {"data": [], "pagination": {"page": 1, "per_page": per_page, "total": 0, "total_pages": 0}}
    has_res = _has_resolution(db)
    join = "LEFT JOIN gap_vendor_resolution r ON r.uuid_procedimiento=g.uuid_procedimiento" if has_res else ""
    vid_col = "r.vendor_id" if has_res else "g.legacy_vendor_id"
    where, params = ["1=1"], []
    if direct_award is not None:
        where.append("CAST(g.is_direct_award AS INT)=?"); params.append(direct_award)
    if sector_id is not None:
        where.append("CAST(g.sector_id AS INT)=?"); params.append(sector_id)
    if recovered_only or src == "ocr":
        where.append("CAST(g.amount_mxn_recovered AS REAL)>0")
    elif src == "est":
        where.append("g.amount_source='estimated'")
    elif src == "none":
        where.append("g.amount_source='none'")
    if young_only or flag == "young":
        where.append("CAST(g.is_young_vendor AS INT)=1")
    elif flag == "efos":
        where.append("CAST(g.efos_flag AS INT)=1")
    elif flag == "review":
        where.append("g.amount_review_flag='over_10b_review'")
    elif flag == "self_buyer":
        where.append("g.vendor_match='self_buyer'")
    if art == "any-da":
        where.append("CAST(g.is_direct_award AS INT)=1")
    elif art == "tender":
        where.append("CAST(g.is_direct_award AS INT)=0")
    elif art:
        where.append("g.exception_article=?"); params.append(art)
    if inst is not None:
        where.append("g.legacy_institution_id=?"); params.append(inst)
    if vend == "rfc":
        where.append(COMPANY_RFC_SQL)
    elif vend == "linked":
        where.append(f"{vid_col} IS NOT NULL")
    elif vend == "illegible":
        where.append("r.source IN ('illegible','self_buyer')" if has_res else "g.vendor_match='self_buyer'")
    if risk_level:
        where.append("g.gap_risk_level=?"); params.append(risk_level)
    if q:
        cols = ["g.title", "g.vendor", "g.institution_name", "g.institution_siglas", "g.procedure_number"]
        if has_res:
            cols.append("r.name")
        where.append("(" + " OR ".join(f"{c} LIKE ?" for c in cols) + ")")
        params += [f"%{q}%"] * len(cols)
    wsql = " AND ".join(where)
    total = db.execute(f"SELECT COUNT(*) n FROM gap_contracts g {join} WHERE {wsql}", params).fetchone()["n"]
    order = ("g.gap_risk_score DESC" if sort == "risk"
             else "CAST(g.amount_mxn_best AS REAL) DESC" if sort == "amount"
             else "g.publication_date DESC")
    has_desc = "description" in {c[1] for c in db.execute("PRAGMA table_info(gap_contracts)")}
    res_cols = "r.name vendor_display, r.source vendor_source" if has_res else "NULL vendor_display, NULL vendor_source"
    # responsible_uc (a named official) is deliberately never selected.
    rows = db.execute(f"""
        SELECT g.procedure_number, g.title, {'g.description' if has_desc else 'NULL description'}, g.institution_name, g.institution_siglas, g.sector_id,
               g.procedure_type, g.is_direct_award, g.exception_article, g.cucop_primary,
               g.vendor, g.vendor_rfc, g.vendor_incorp_year, g.is_young_vendor, g.efos_flag,
               g.amount_mxn_recovered, g.amount_mxn_best, g.amount_source, g.publication_date,
               g.procedure_character, g.award_contract_number,
               g.gap_risk_score, g.gap_risk_level, g.flag_no_amount, g.flag_big_amount, g.flag_concentration,
               g.uuid_procedimiento, g.expedient_code, g.contracting_unit, g.award_doc_type, g.opening_date,
               g.amount_review_flag, g.is_emergency, g.legacy_institution_id, {res_cols}, {vid_col} vid
        FROM gap_contracts g {join} WHERE {wsql}
        ORDER BY {order} LIMIT ? OFFSET ?""",
        params + [per_page, (page - 1) * per_page]).fetchall()
    data: List[Dict[str, Any]] = []
    for x in rows:
        sid = int(x["sector_id"]) if x["sector_id"] else 12
        data.append({
            "procedure_number": x["procedure_number"],
            "title": x["description"] or x["title"],
            "institution": x["institution_name"],
            "institution_siglas": x["institution_siglas"],
            "institution_id": x["legacy_institution_id"],
            "sector_id": sid, "sector": SECTOR_NAMES.get(sid, "otros"),
            "procedure_type": x["procedure_type"],
            "is_direct_award": bool(int(x["is_direct_award"] or 0)),
            "exception_article": x["exception_article"],
            "cucop": x["cucop_primary"],
            "vendor": x["vendor"],
            "vendor_display": x["vendor_display"],
            "vendor_source": x["vendor_source"],
            "vendor_id": x["vid"],
            "vendor_rfc": public_rfc(x["vendor_rfc"]),
            "vendor_incorp_year": x["vendor_incorp_year"],
            "is_young_vendor": bool(int(x["is_young_vendor"] or 0)),
            "efos_flag": bool(int(x["efos_flag"] or 0)),
            "amount_recovered": float(x["amount_mxn_recovered"]) if x["amount_mxn_recovered"] else None,
            "amount_best": float(x["amount_mxn_best"]) if x["amount_mxn_best"] else None,
            "amount_source": x["amount_source"],
            "amount_review_flag": x["amount_review_flag"],
            "publication_date": x["publication_date"],
            "opening_date": x["opening_date"],
            "character": x["procedure_character"],
            "contract_number": x["award_contract_number"],
            "uuid": x["uuid_procedimiento"],
            "expedient_code": x["expedient_code"],
            "contracting_unit": x["contracting_unit"],
            "award_doc_type": x["award_doc_type"],
            "is_emergency": bool(int(x["is_emergency"] or 0)),
            "risk_score": float(x["gap_risk_score"]) if x["gap_risk_score"] is not None else None,
            "risk_level": x["gap_risk_level"],
            "flag_no_amount": bool(int(x["flag_no_amount"] or 0)),
            "flag_big_amount": bool(int(x["flag_big_amount"] or 0)),
            "flag_concentration": bool(int(x["flag_concentration"] or 0)),
        })
    return {
        "data": data,
        "pagination": {"page": page, "per_page": per_page, "total": total,
                       "total_pages": (total + per_page - 1) // per_page},
    }


# ---------------------------------------------------------------------------
# GET /gap/field · /gap/months — the «Las puertas» object (every award a mark)
# ---------------------------------------------------------------------------

# The twelve legal doors, largest first by count. `article` is the exact
# exception_article string; None = no exception cited; "*" = every other article.
GAP_DOORS = [
    ("tender", None), ("55-1", "Art. 55 párrafo primero"), ("54-XII", "Art. 54 fr. XII"),
    ("54-XIV", "Art. 54 fr. XIV"), ("54-I", "Art. 54 fr. I"), ("54-V", "Art. 54 fr. V"),
    ("43", "Art. 43"), ("54-II", "Art. 54 fr. II"), ("54-III", "Art. 54 fr. III"),
    ("54-VII", "Art. 54 fr. VII"), ("55-2", "Art. 55 párrafo segundo"), ("other", "*"),
]
_DOOR_OF = {a: k for k, (_, a) in enumerate(GAP_DOORS) if a not in (None, "*")}
BIG_AWARD_MXN = 2_000_000_000  # awards that carry their title + vendor on hover


@router.get("/field")
def gap_field(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """Every post-CompraNet award as columns: a door · v amount MXN (null = none
    read; > 100B rejected to null) · s source 0 read (letter OCR or ComprasMX open data) /
    1 estimated / 2 none ·
    i buyer index · m month index (-1 = undated) · d direct award · x > 10B flag."""
    if not _has_table(db):
        return {"available": False}
    cached = app_cache.get("gap_field", "v")
    if cached is not None:
        return cached
    has_desc = "description" in {c[1] for c in db.execute("PRAGMA table_info(gap_contracts)")}
    rows = db.execute(f"""
        SELECT exception_article, legacy_institution_id, TRIM(COALESCE(institution_siglas, '')),
               institution_name, CAST(amount_mxn_best AS REAL), amount_source,
               substr(publication_date, 1, 7), CAST(is_direct_award AS INT),
               {'COALESCE(description, title)' if has_desc else 'title'}, vendor,
               vendor_rfc, vendor_rfc_persona_fisica, vendor_match
        FROM gap_contracts ORDER BY rowid""").fetchall()
    months = sorted({r[6] for r in rows if r[6]})
    m_idx = {m: k for k, m in enumerate(months)}
    inst: List[Dict[str, Any]] = []
    i_idx: Dict[Any, int] = {}
    col: Dict[str, List[Any]] = {k: [] for k in "avsimdx"}
    big: List[List[Any]] = []
    rejected = 0
    for n, (art, iid, sig, name, amt, src, mon, da, title, vendor, rfc, rfc_pf, vmatch) in enumerate(rows):
        key = iid if iid is not None else f"s:{sig}"
        if key not in i_idx:
            i_idx[key] = len(inst)
            inst.append({"id": iid, "s": sig or None, "n": name})
        v = round(amt) if amt and amt > 0 else None
        if v is not None and v > MAX_CONTRACT_VALUE:
            v, rejected = None, rejected + 1
        col["a"].append(0 if not art else _DOOR_OF.get(art, len(GAP_DOORS) - 1))
        col["v"].append(v)
        col["s"].append(0 if src in ("fallo_ocr", "datos") else 1 if src == "estimated" else 2)
        col["i"].append(i_idx[key])
        col["m"].append(m_idx.get(mon, -1))
        col["d"].append(1 if da == 1 else 0)
        col["x"].append(1 if v is not None and v > FLAG_THRESHOLD else 0)
        if v is not None and v >= BIG_AWARD_MXN:
            big.append([n, (title or "").strip(), letter_vendor(vendor, rfc, rfc_pf, vmatch) or ""])
    out = {
        "available": True, "n": len(rows), "rejected": rejected,
        "doors": [{"k": k, "article": a} for k, a in GAP_DOORS],
        "inst": inst, "months": months, "col": col, "big": big,
        "data_window": _data_window(db),
    }
    app_cache.set("gap_field", "v", out, maxsize=1, ttl=3600)
    return out


@router.get("/months")
def gap_months(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """CompraNet's last months (Apr–Sep 2025) for the buyers that appear in the gap:
    rows[institution_id] = [[awards, MXN, direct awards] × 6]. Amounts > 100B excluded."""
    months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"]
    out: Dict[str, Any] = {"months": months, "rows": {}}
    if not _has_table(db):
        return out
    cached = app_cache.get("gap_months", "v")
    if cached is not None:
        return cached
    ids = {r[0] for r in db.execute(
        "SELECT DISTINCT legacy_institution_id FROM gap_contracts WHERE legacy_institution_id IS NOT NULL")}
    rows: Dict[str, List[List[float]]] = {}
    for iid, mon, n, v, da in db.execute("""
            SELECT institution_id, substr(publication_date, 1, 7), COUNT(*),
                   COALESCE(SUM(CASE WHEN amount_mxn > 0 AND amount_mxn <= ? THEN amount_mxn END), 0),
                   COALESCE(SUM(is_direct_award = 1), 0)
            FROM contracts
            WHERE contract_year = 2025 AND publication_date >= '2025-04-01' AND publication_date < '2025-09-29'
            GROUP BY 1, 2""", (MAX_CONTRACT_VALUE,)):
        if iid not in ids or mon not in months:
            continue
        rows.setdefault(str(iid), [[0, 0, 0] for _ in months])[months.index(mon)] = [n, round(v), da]
    out["rows"] = rows
    app_cache.set("gap_months", "v", out, maxsize=1, ttl=3600)
    return out


# ---------------------------------------------------------------------------
# Entity slices — the gap plugged into the rest of the site (owner 2026-10-16,
# handoff § Owner decisions, end of session). One endpoint serves the three
# dossier kinds so the «Después del apagón» block is one component.
# ---------------------------------------------------------------------------
_ENTITY_COL = {"institution": "legacy_institution_id", "vendor": "legacy_vendor_id", "category": "category_id"}
_CANON = {"institution": ("institution_canonical", "institution_id"),
          "vendor": ("vendor_canonical", "vendor_id")}
_AMT = "CAST(g.amount_mxn_best AS REAL)"
_MONEY = f"COALESCE(SUM(CASE WHEN {_AMT} > 0 AND {_AMT} <= {MAX_CONTRACT_VALUE} THEN {_AMT} END), 0)"


def _gap_cols(db: sqlite3.Connection) -> set:
    return {r[1] for r in db.execute("PRAGMA table_info(gap_contracts)")}


def _entity_ids(db: sqlite3.Connection, kind: str, entity_id: int) -> List[int]:
    """legacy_*_id on gap rows is the CANONICAL id; a dossier may be opened on a member id."""
    if kind not in _CANON:
        return [entity_id]
    table, col = _CANON[kind]
    ids = {entity_id}
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
        r = db.execute(f"SELECT canonical_id FROM {table} WHERE {col}=?", (entity_id,)).fetchone()
        if r:
            ids.add(r[0])
    return sorted(ids)



# ComprasMX open-data contracts exposed with gap_contracts' column names, so one query set serves both.
_DATOS_SRC = """(SELECT institution_id AS legacy_institution_id, vendor_id AS legacy_vendor_id, category_id,
        is_direct_award, amount_mxn AS amount_mxn_best,
        CASE WHEN amount_mxn IS NOT NULL THEN 'datos' ELSE 'none' END AS amount_source,
        0 AS efos_flag, fecha_publicacion AS publication_date, institucion AS institution_name,
        siglas AS institution_siglas, proveedor AS vendor,
        CASE WHEN vendor_match = 'persona_fisica' OR COALESCE(is_persona_fisica, 0) = 1 THEN '1' ELSE '0' END AS vendor_rfc_persona_fisica,
        NULL AS vendor_match, codigo_contrato AS uuid_procedimiento
    FROM comprasmx_contracts WHERE orden_gobierno = 'APF' AND post_blackout = 1)"""
# Registers (who got the money) use READ amounts only: an «estimated» amount is the procedure's
# budget, not what one vendor won (an IMSS osteosíntesis tender's 15.7B estimate sat on one
# vendor; the open-data contract was 3.6M — 2026-10-19).
_MONEY_READ = (f"COALESCE(SUM(CASE WHEN g.amount_source IN ('fallo_ocr', 'datos') AND {_AMT} > 0 "
               f"AND {_AMT} <= {MAX_CONTRACT_VALUE} THEN {_AMT} END), 0)")


def _datos_window(db: sqlite3.Connection) -> str:
    r = db.execute("""SELECT MIN(substr(fecha_publicacion,1,10)), MAX(substr(fecha_publicacion,1,10))
        FROM comprasmx_contracts WHERE orden_gobierno = 'APF' AND post_blackout = 1""").fetchone()
    return f"{r[0]} .. {r[1]}" if r and r[0] else ""


@router.get("/entity/{kind}/{entity_id:int}")
def gap_entity(kind: str, entity_id: int,
               source: str = Query("ocr", pattern="^(ocr|datos)$"),
               db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """Post-CompraNet slice for one institution / vendor / category: counts, money that
    was actually read, direct-award share, the months, and the counterpart register
    (vendors for a buyer or category; buyers for a vendor). Never scored by the model.
    source=ocr (default): gap_contracts, amounts read off award letters by OCR.
    source=datos: comprasmx_contracts, ComprasMX's own open-data CSV (structured amount on
    every contract; federal, after 2025-09-28). Owner decides which one the site shows."""
    if kind not in _ENTITY_COL:
        raise HTTPException(status_code=422, detail="kind must be institution|vendor|category")
    if source == "datos":
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='comprasmx_contracts'").fetchone():
            return {"available": False}
        src = _DATOS_SRC
    elif not _has_table(db) or (kind == "category" and "category_id" not in _gap_cols(db)):
        return {"available": False}
    else:
        src = "gap_contracts"
    key = f"{source}:{kind}:{entity_id}"
    cached = app_cache.get("gap_entity", key)
    if cached is not None:
        return cached
    ids = _entity_ids(db, kind, entity_id)
    where = f"g.{_ENTITY_COL[kind]} IN ({','.join('?' * len(ids))})"
    t = db.execute(f"""
        SELECT COUNT(*) n,
               SUM(CAST(g.is_direct_award AS INT)=1) da,
               SUM({_AMT} > 0) with_amount,
               SUM(g.amount_source IN ('fallo_ocr', 'datos')) read_n,
               {_MONEY} money,
               SUM(CAST(g.efos_flag AS INT)=1) efos,
               MIN(substr(g.publication_date,1,10)) first_date,
               MAX(substr(g.publication_date,1,10)) last_date
        FROM {src} g WHERE {where}""", ids).fetchone()
    out: Dict[str, Any] = {"available": True, "kind": kind, "id": entity_id, "total": t["n"] or 0,
                           "window": _data_window(db) if source == "ocr" else _datos_window(db),
                           "source_kind": source,
                           "source": ("ComprasMX open-data contracts CSV — staging, not scored" if source == "datos"
                                      else "ComprasMX (post-CompraNet) — staging, not scored")}
    if not t["n"]:
        app_cache.set("gap_entity", key, out, maxsize=2048, ttl=3600)
        return out
    out.update({
        "direct_award_count": t["da"] or 0,
        "direct_award_pct": round(100.0 * (t["da"] or 0) / t["n"], 1),
        "with_amount": t["with_amount"] or 0,
        "amount_read_count": t["read_n"] or 0,
        "money_known_mxn": round(t["money"]),
        "efos_count": t["efos"] or 0,
        "first_date": t["first_date"], "last_date": t["last_date"],
        "by_month": [{"month": m, "count": n, "money_known_mxn": round(v), "direct_award_count": da or 0}
                     for m, n, v, da in db.execute(f"""
                        SELECT substr(g.publication_date,1,7), COUNT(*), {_MONEY}, SUM(CAST(g.is_direct_award AS INT)=1)
                        FROM {src} g WHERE {where} GROUP BY 1 ORDER BY 1""", ids)],
    })
    if kind == "vendor":
        out["counterparts"] = [
            {"institution_id": r[0], "name": r[1], "siglas": r[2], "count": r[3], "money_known_mxn": round(r[4]),
             "direct_award_count": r[5] or 0}
            for r in db.execute(f"""
                SELECT g.legacy_institution_id, g.institution_name, g.institution_siglas, COUNT(*), {_MONEY_READ},
                       SUM(CAST(g.is_direct_award AS INT)=1)
                FROM {src} g WHERE {where}
                GROUP BY COALESCE(g.legacy_institution_id, g.institution_name) ORDER BY 5 DESC, 4 DESC LIMIT 12""", ids)]
    else:
        has_res = source == "ocr" and _has_resolution(db)
        name_sql = "COALESCE(r.name, g.vendor)" if has_res else "g.vendor"
        join = "LEFT JOIN gap_vendor_resolution r ON r.uuid_procedimiento = g.uuid_procedimiento" if has_res else ""
        # persona física never named (PII); the buyer's own name is an OCR artefact, not a vendor
        out["counterparts"] = [
            {"vendor_id": r[0], "name": r[1], "count": r[2], "money_known_mxn": round(r[3]),
             "direct_award_count": r[4] or 0, "efos": bool(r[5])}
            for r in db.execute(f"""
                SELECT g.legacy_vendor_id, {name_sql}, COUNT(*), {_MONEY_READ}, SUM(CAST(g.is_direct_award AS INT)=1),
                       MAX(CAST(g.efos_flag AS INT))
                FROM {src} g {join}
                WHERE {where} AND COALESCE(g.vendor,'')<>'' AND COALESCE(g.vendor_match,'')<>'self_buyer'
                  AND COALESCE(g.vendor_rfc_persona_fisica,'0')<>'1'
                GROUP BY COALESCE(g.legacy_vendor_id, {name_sql}) ORDER BY 4 DESC, 3 DESC LIMIT 12""", ids)]
        out["unnamed_count"] = db.execute(
            f"SELECT COUNT(*) FROM {src} g WHERE {where} AND COALESCE(g.vendor,'')=''", ids).fetchone()[0]
    if kind != "category" and "category_id" in _gap_cols(db):
        out["by_category"] = [
            {"category_id": r[0], "name_es": r[1], "name_en": r[2], "count": r[3], "money_known_mxn": round(r[4])}
            for r in db.execute(f"""
                SELECT g.category_id, c.name_es, c.name_en, COUNT(*), {_MONEY}
                FROM {src} g LEFT JOIN categories c ON c.id = g.category_id
                WHERE {where} GROUP BY 1 ORDER BY 4 DESC LIMIT 8""", ids)]
    app_cache.set("gap_entity", key, out, maxsize=2048, ttl=3600)
    return out


@router.get("/carry-forward")
def gap_carry_forward(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """Headline: of the post-blackout money we could read, how much went to vendors the
    model already flags (vendor_stats.avg_risk_score on their CompraNet history; thresholds
    0.60 / 0.40 / 0.25 as in lib/constants). Known money only — rows without an amount are
    counted, never valued."""
    if not _has_table(db):
        return {"available": False}
    cached = app_cache.get("gap_carry_forward", "v")
    if cached is not None:
        return cached
    rows = db.execute(f"""
        SELECT CASE WHEN g.legacy_vendor_id IS NULL THEN 'unlinked'
                    WHEN vs.avg_risk_score IS NULL THEN 'unscored'
                    WHEN vs.avg_risk_score >= 0.60 THEN 'critical'
                    WHEN vs.avg_risk_score >= 0.40 THEN 'high'
                    WHEN vs.avg_risk_score >= 0.25 THEN 'medium' ELSE 'low' END lvl,
               COUNT(*), SUM({_AMT} > 0), {_MONEY}, COUNT(DISTINCT g.legacy_vendor_id)
        FROM gap_contracts g LEFT JOIN vendor_stats vs ON vs.vendor_id = g.legacy_vendor_id
        WHERE COALESCE(g.vendor,'')<>'' AND COALESCE(g.vendor_match,'')<>'self_buyer'
        GROUP BY 1""").fetchall()
    tiers = {r[0]: {"count": r[1], "with_amount": r[2] or 0, "money_known_mxn": round(r[3]), "vendors": r[4]}
             for r in rows}
    linked = sum(v["money_known_mxn"] for k, v in tiers.items() if k in ("critical", "high", "medium", "low"))
    flagged = sum(tiers.get(k, {}).get("money_known_mxn", 0) for k in ("critical", "high"))
    out = {
        "available": True,
        "tiers": tiers,
        "linked_money_known_mxn": linked,
        "flagged_money_known_mxn": flagged,
        "flagged_share_pct": round(100.0 * flagged / linked, 1) if linked else None,
        "window": _data_window(db),
        "note": "Share of READ post-blackout money (vendors with CompraNet history) going to vendors whose "
                "historical risk indicator is high or critical. Not a probability; not model output on gap rows.",
    }
    app_cache.set("gap_carry_forward", "v", out, maxsize=1, ttl=3600)
    return out



# ---------------------------------------------------------------------------
# «El relevo» — the dossier block «Después del apagón» (owner pick B, 2026-10-20;
# concept `frontend/_ui_v4/concepts/apagon/B.html`, extract.py). The entity's
# CompraNet counterparts in the twelve months BEFORE the freeze against its
# ComprasMX open-data contracts AFTER it (federal, post_blackout = contract start
# date, same clock as CompraNet). Who kept the money, who is new, who vanished.
# Personas físicas are pooled and never named; no RFC travels; nothing is scored.
# ---------------------------------------------------------------------------
import re as _re
import unicodedata as _ud
from datetime import date as _date

_T0 = _date(2024, 9, 28)          # day 0 of the pulse axis; the seam is day 365 (2025-09-28)
_SEAM = _date(2025, 9, 28)
_RELEVO_K = 12
_BIRMEX = 2066                    # consolidated buyer of medicines for the health sector
_REL_COL = {"institution": "institution_id", "vendor": "vendor_id", "category": "category_id"}
_REL_PRE = (f"c.contract_year IN (2024, 2025) AND c.contract_date >= '2024-09-28' AND c.contract_date < '2025-09-28' "
            f"AND c.amount_mxn IS NOT NULL AND c.amount_mxn <= {MAX_CONTRACT_VALUE}")
_REL_POST = (f"orden_gobierno = 'APF' AND post_blackout = 1 "
             f"AND (amount_mxn IS NULL OR amount_mxn <= {MAX_CONTRACT_VALUE})")
_SUF = _re.compile(r'\b(S\s*A\s*(P\s*I\s*|B\s*)?(DE\s*C\s*V)?|S\s*DE\s*R\s*L(\s*DE\s*C\s*V)?|S\s*C(\s*DE\s*C\s*V)?)\s*$')
_FAMS = ("here", "elsewhere", "newname", "pf")


def _norm(s: Optional[str]) -> str:
    """Name skeleton for the fallback match: uppercase ASCII letters/digits, legal suffix dropped."""
    t = ''.join(ch for ch in _ud.normalize('NFKD', (s or '').upper()) if ch.isalnum() or ch == ' ')
    return _SUF.sub('', _re.sub(r'\s+', ' ', t).strip()).strip()


def _day(d: str) -> int:
    return (_date(int(d[:4]), int(d[5:7]), int(d[8:10])) - _T0).days


def _hundred(vals: List[float]) -> List[int]:
    """Shares of 100, largest remainder, summing to exactly 100 (all 0 when the total is 0)."""
    tot = sum(vals)
    if tot <= 0:
        return [0] * len(vals)
    raw = [100 * v / tot for v in vals]
    fl = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: fl[i] - raw[i])[:100 - sum(fl)]:
        fl[i] += 1
    return fl


def _canon_map(db: sqlite3.Connection, cp_vendor: bool) -> Dict[int, int]:
    table, col = ("vendor_canonical", "vendor_id") if cp_vendor else ("institution_canonical", "institution_id")
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
        return {}
    return dict(db.execute(f"SELECT {col}, canonical_id FROM {table} WHERE {col} <> canonical_id").fetchall())


def _chunked(db: sqlite3.Connection, sql: str, ids: List[int]):
    for i in range(0, len(ids), 900):
        chunk = ids[i:i + 900]
        yield from db.execute(sql.format(ph=",".join("?" * len(chunk))), chunk)


def _joined(items: List[List[Any]], lang: str, heads: List[str]) -> List[Any]:
    """«A, B y C» over segment lists; Spanish «e» before an i- sound."""
    out: List[Any] = []
    for i, it in enumerate(items):
        if i and i == len(items) - 1:
            out.append(" and " if lang == "en" else (" e " if _re.match(r'^H?I(?!E)', heads[i]) else " y "))
        elif i:
            out.append(", ")
        out.extend(it)
    return out


@router.get("/entity/{kind}/{entity_id:int}/relevo")
def gap_relevo(kind: str, entity_id: int, db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """«El relevo»: top-12 counterparts before (CompraNet, 12 months) and after (ComprasMX APF),
    the ribbons joining the same canonical entity across the seam, the hundred-peso split,
    weekly pulses per drawn counterpart, and the computed sentences (ES + EN) as segments:
    str | {b} bold | {m, f} money (f = above 10B, flagged) | {k} counterpart key."""
    if kind not in _REL_COL:
        raise HTTPException(status_code=422, detail="kind must be institution|vendor|category")
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='comprasmx_contracts'").fetchone():
        return {"available": False}
    key = f"{kind}:{entity_id}"
    cached = app_cache.get("gap_relevo", key)
    if cached is not None:
        return cached
    out = _relevo(db, kind, entity_id)
    app_cache.set("gap_relevo", key, out, maxsize=512, ttl=3600)
    return out


def _relevo(db: sqlite3.Connection, kind: str, entity_id: int) -> Dict[str, Any]:
    col = _REL_COL[kind]
    cp_vendor = kind != "vendor"                      # counterpart = vendor for a buyer/category, buyer for a vendor
    cp_col = "vendor_id" if cp_vendor else "institution_id"
    pfx = "v" if cp_vendor else "i"
    ids = _entity_ids(db, kind, entity_id)
    ph = ",".join("?" * len(ids))
    canon = _canon_map(db, cp_vendor)

    def cx(i: int) -> int:
        return canon.get(i, i)

    # ── history with this entity, any year: the «already dealt here» set + since-year + lifetime count
    hist: Dict[int, List[Any]] = {}     # canonical id → [since-year (drawn only), lifetime contracts]
    raw_of: Dict[int, List[int]] = {}
    # institution: covering idx_c_inst_vendor (0.1 s), since-year fetched later for the drawn few;
    # category: no covering index, the rows are read anyway (~5 s cold, cached after) → take the year now
    yr = "MIN(contract_year)" if kind == "category" else "NULL"
    for cid, y, n in db.execute(f"SELECT {cp_col}, {yr}, COUNT(*) FROM contracts "
                                f"WHERE {col} IN ({ph}) AND {cp_col} IS NOT NULL GROUP BY 1", ids):
        h = hist.setdefault(cx(cid), [None, 0])
        h[0] = min(h[0], y) if (h[0] and y) else (h[0] or y)
        h[1] += n
        raw_of.setdefault(cx(cid), []).append(cid)
    # AFTER rows first: their vendor ids join the persona-física test below
    post_rows = db.execute(f"""SELECT codigo_contrato, vendor_id, institution_id, vendor_match, is_persona_fisica,
               proveedor, institucion, siglas, amount_mxn, is_direct_award, fecha_inicio, titulo_contrato, rfc
        FROM comprasmx_contracts WHERE {col} IN ({ph}) AND {_REL_POST}""", ids).fetchall()
    individuals: set = set()            # canonical vendor ids held by a persona física (flag or 13-char RFC)
    if cp_vendor:
        vids = set(hist) | {cx(r[1]) for r in post_rows if r[1] is not None}
        individuals = {r[0] for r in _chunked(db, "SELECT id, is_individual, rfc FROM vendors WHERE id IN ({ph})",
                                              sorted(vids)) if is_persona_fisica(r[1], r[2])}

    parts: Dict[str, Dict[str, Any]] = {}

    def part(k: str, cid: Optional[int], fam: str, name: Optional[str] = None) -> Dict[str, Any]:
        if k not in parts:
            parts[k] = {"key": k, "id": cid, "name": name, "siglas": None, "fam": fam,
                        "pre_v": 0.0, "pre_n": 0, "pre_da_n": 0, "post_v": 0.0, "post_n": 0,
                        "post_da_n": 0, "post_da_v": 0.0, "flag": False, "first_y": None, "life_n": 0, "risk": None}
        return parts[k]

    lanes_raw: Dict[str, List[tuple]] = {}

    # ── BEFORE: CompraNet, the twelve months up to the freeze
    pre = {"n": 0, "v": 0.0, "da_n": 0, "da_v": 0.0}
    pre_k: set = set()
    pre_unknown = 0.0
    for rid, cid, d, amt, da, title in db.execute(
            f"SELECT c.id, c.{cp_col}, c.contract_date, c.amount_mxn, c.is_direct_award, c.title "
            # a category spans ~280k rows; its year sits on the date index (0.6 s vs 3 s on idx_c_cat_amount)
            f"FROM contracts c {'INDEXED BY idx_c_date ' if kind == 'category' else ''}WHERE c.{col} IN ({ph}) AND {_REL_PRE}", ids):
        da = int(da or 0)
        pre["n"] += 1; pre["v"] += amt; pre["da_n"] += da; pre["da_v"] += amt if da else 0.0
        if cid is None:
            pre_unknown += amt
            continue
        c = cx(cid)
        pre_k.add(c)
        p = part("pf", None, "pf") if c in individuals else part(f"{pfx}{c}", c, "here")
        p["pre_v"] += amt; p["pre_n"] += 1; p["pre_da_n"] += da
        lanes_raw.setdefault(p["key"], []).append((_day(d), amt, da, rid, title, d[:10]))

    # ── AFTER: ComprasMX open data, federal (APF), contract start after the freeze (post_rows above)
    # name fallback: a row with no id match whose name skeleton equals a counterpart this entity
    # already dealt with (Laboratorios Pisa, BMS, Edenred… otherwise «new name» AND «vanished» at once)
    need = {_norm(r[5] if cp_vendor else r[6]) for r in post_rows if (r[1] if cp_vendor else r[2]) is None}
    name_ix: Dict[str, int] = {}
    if need and hist:
        for rid, nm in _chunked(db, f"SELECT id, name FROM {'vendors' if cp_vendor else 'institutions'} WHERE id IN ({{ph}})", list(hist)):
            s = _norm(nm)
            if s in need:
                name_ix.setdefault(s, cx(rid))
    post = {"n": 0, "v": 0.0, "da_n": 0, "da_v": 0.0, "flagged": 0, "no_amount": 0}
    fam_tot = {f: {"n": 0, "v": 0.0} for f in _FAMS}
    post_k: set = set()
    for code, vid, iid, vmatch, is_pf, prov, inst, sig, amt, da, d0, title, rfc in post_rows:
        da = int(da or 0)
        a = amt or 0.0
        post["n"] += 1; post["v"] += a; post["da_n"] += da; post["da_v"] += a if da else 0.0
        post["flagged"] += int(a > FLAG_THRESHOLD); post["no_amount"] += int(amt is None)
        raw_id = vid if cp_vendor else iid
        nm = prov if cp_vendor else inst
        c = cx(raw_id) if raw_id is not None else name_ix.get(_norm(nm))
        # an unmatched vendor name is a persona física unless it carries a company's legal form
        if cp_vendor and (vmatch == "persona_fisica" or is_persona_fisica(is_pf == 1, rfc)
                          or (c in individuals if c is not None else not is_company_name(prov or ""))):
            fam, p = "pf", part("pf", None, "pf")
        elif c is None:
            fam = "newname"
            p = part(f"n:{_norm(nm) or '?'}", None, fam, (clean_name(nm) if cp_vendor else nm) or "?")
            if not cp_vendor and sig:
                p["siglas"] = sig
        else:
            fam = "here" if c in hist else "elsewhere"
            p = part(f"{pfx}{c}", c, fam)
            p["fam"] = fam
            post_k.add(c)
        fam_tot[fam]["n"] += 1; fam_tot[fam]["v"] += a
        p["post_v"] += a; p["post_n"] += 1; p["post_da_n"] += da; p["post_da_v"] += a if da else 0.0
        p["flag"] = p["flag"] or a > FLAG_THRESHOLD
        lanes_raw.setdefault(p["key"], []).append((_day(d0), a, da, code, title, (d0 or "")[:10]))

    # ── the two columns: top-K each side + «otros» (+ personas físicas, pooled, never named)
    named = [p for p in parts.values() if p["key"] != "pf"]
    # a drawn block is ≥ 0.5 MDP; smaller names fold into «otros» (a «0 MDP» label says nothing)
    pre_top = sorted((p for p in named if p["pre_v"] >= 5e5), key=lambda p: -p["pre_v"])[:_RELEVO_K]
    post_top = sorted((p for p in named if p["post_v"] >= 5e5), key=lambda p: -p["post_v"])[:_RELEVO_K]
    pf = parts.get("pf") or part("pf", None, "pf")
    left = [{"key": p["key"], "v": p["pre_v"], "n": p["pre_n"]} for p in pre_top]
    right = [{"key": p["key"], "v": p["post_v"], "n": p["post_n"]} for p in post_top]
    n_named_post = len(post_k) + sum(1 for k in parts if k.startswith("n:"))
    left.append({"key": "otros", "v": pre["v"] - sum(b["v"] for b in left) - pf["pre_v"],
                 "n": pre["n"] - sum(b["n"] for b in left) - pf["pre_n"], "k": max(0, len(pre_k) - len(pre_top))})
    right.append({"key": "otros", "v": post["v"] - sum(b["v"] for b in right) - pf["post_v"],
                  "n": post["n"] - sum(b["n"] for b in right) - pf["post_n"], "k": max(0, n_named_post - len(post_top))})
    if pf["pre_n"]:
        left.append({"key": "pf", "v": pf["pre_v"], "n": pf["pre_n"]})
    if pf["post_n"]:
        right.append({"key": "pf", "v": pf["post_v"], "n": pf["post_n"]})
    for b in left + right:
        b["v"] = max(0, round(b["v"]))

    # ── ribbons: ONLY the same canonical counterpart on both sides (or into / out of «otros»)
    inL, inR = {p["key"] for p in pre_top}, {p["key"] for p in post_top}
    ribbons = []
    for p in pre_top:
        if p["key"] in inR:
            ribbons.append({"key": p["key"], "from": p["key"], "to": p["key"], "kind": "stay"})
        elif p["post_n"] > 0:
            ribbons.append({"key": p["key"], "from": p["key"], "to": "otros", "kind": "down"})
    for p in post_top:
        if p["key"] not in inL and p["pre_v"] > 0:
            ribbons.append({"key": p["key"], "from": "otros", "to": p["key"], "kind": "up"})

    # ── names, history, CompraNet risk indicator for the drawn counterparts
    drawn = {p["key"]: p for p in pre_top + post_top}
    did = [p["id"] for p in drawn.values() if p["id"] is not None]
    if did:
        if cp_vendor:
            for rid, nm in _chunked(db, "SELECT id, name FROM vendors WHERE id IN ({ph})", did):
                drawn[f"v{rid}"]["name"] = clean_name(nm)
            for rid, r in _chunked(db, "SELECT vendor_id, avg_risk_score FROM vendor_stats WHERE vendor_id IN ({ph})", did):
                drawn[f"v{rid}"]["risk"] = r
        else:
            for rid, nm, sg in _chunked(db, "SELECT id, name, siglas FROM institutions WHERE id IN ({ph})", did):
                drawn[f"i{rid}"]["name"] = nm
                drawn[f"i{rid}"]["siglas"] = sg
            for rid, r in _chunked(db, "SELECT institution_id, avg_risk_score FROM institution_stats WHERE institution_id IN ({ph})", did):
                drawn[f"i{rid}"]["risk"] = r
    raw_drawn = [] if kind == "category" else [r for i in did for r in raw_of.get(i, [])]
    for i in range(0, len(raw_drawn), 900):
        chunk = raw_drawn[i:i + 900]
        for cid, y in db.execute(f"SELECT {cp_col}, MIN(contract_year) FROM contracts WHERE {col} IN ({ph}) "
                                 f"AND {cp_col} IN ({','.join('?' * len(chunk))}) GROUP BY 1", ids + chunk):
            h = hist[cx(cid)]
            h[0] = min(h[0], y) if (h[0] and y) else (h[0] or y)
    for p in drawn.values():
        if p["id"] in hist:
            p["first_y"], p["life_n"] = hist[p["id"]]

    # ── weekly pulses per drawn counterpart (L2); the week's biggest contract rides along (L3)
    pulses: Dict[str, List[List[Any]]] = {}
    max_day = 0
    for k in drawn:
        wk: Dict[tuple, List[Any]] = {}
        for day, a, da, ref, title, d in lanes_raw.get(k, []):
            max_day = max(max_day, day)
            w = wk.setdefault((day // 7, isinstance(ref, str)), [day // 7, 0, 0.0, 0, None, -1.0, None, None])
            w[1] += 1; w[2] += a; w[3] += da
            if a > w[5]:
                w[4], w[5], w[6], w[7] = ref, a, title, d
        pulses[k] = [[w[0], w[1], round(w[2]), w[3], w[4], round(w[5]), w[6], w[7]] for _, w in sorted(wk.items())]

    pesos = dict(zip(_FAMS, _hundred([fam_tot[f]["v"] for f in _FAMS])))

    def top_share(vals: List[float], tot: float) -> float:
        return sum(sorted(vals, reverse=True)[:_RELEVO_K]) / tot if tot else 0.0

    conc = {"pre": top_share([p["pre_v"] for p in named], pre["v"]), "post": top_share([p["post_v"] for p in named], post["v"])}

    horizon = db.execute("SELECT MAX(substr(fecha_publicacion,1,10)) FROM comprasmx_contracts").fetchone()[0] or "2026-10-01"
    months_post = max(1.0, (_date.fromisoformat(horizon) - _SEAM).days / 30.44)
    ent_short, birmex = None, None
    if kind == "institution":
        r = db.execute(f"SELECT siglas, sector_id FROM institutions WHERE id IN ({ph}) ORDER BY id = ? DESC", ids + [entity_id]).fetchone()
        ent_short = r[0] if r and r[0] else None
        # a smaller «after» at a health buyer while BIRMEX's consolidated buying swelled: who buys changed
        if r and r[1] == 1 and _BIRMEX not in ids and pre["v"] and post["v"] / months_post < 0.6 * pre["v"] / 12:
            b0 = db.execute(f"SELECT COALESCE(SUM(c.amount_mxn),0) FROM contracts c WHERE c.institution_id = ? AND {_REL_PRE}", (_BIRMEX,)).fetchone()[0]
            b1 = db.execute(f"SELECT COALESCE(SUM(amount_mxn),0) FROM comprasmx_contracts WHERE institution_id = ? AND {_REL_POST}", (_BIRMEX,)).fetchone()[0]
            if b1 > 5 * max(b0, 1):
                birmex = (b0, b1)

    for p in list(drawn.values()) + [pf]:
        for f in ("pre_v", "post_v", "post_da_v"):
            p[f] = round(p[f])
    sentences = _sentences(kind, cp_vendor, ent_short, pre_top, post_top, drawn, pre, post, conc, months_post, birmex)
    out_parts: Dict[str, Any] = dict(drawn)
    if pf["pre_n"] or pf["post_n"]:
        out_parts["pf"] = {k: pf[k] for k in ("key", "id", "name", "fam", "pre_v", "pre_n", "post_v", "post_n", "post_da_n")}
    rnd = lambda d: {k: (round(v) if isinstance(v, float) else v) for k, v in d.items()}  # noqa: E731
    return {
        "available": True, "kind": kind, "id": entity_id, "cp": "vendor" if cp_vendor else "institution",
        "k": _RELEVO_K,
        "pre": {**rnd(pre), "k": len(pre_k), "unknown_v": round(pre_unknown), "from": "2024-09-28", "to": "2025-09-27"},
        "post": {**rnd(post), "k": n_named_post, "from": "2025-09-28", "to": horizon, "months": round(months_post, 1)},
        "fam": {f: {"n": fam_tot[f]["n"], "v": round(fam_tot[f]["v"]), "pesos": pesos[f]} for f in _FAMS},
        "concentration": {k: round(v, 4) for k, v in conc.items()},
        "left": left, "right": right, "ribbons": ribbons, "parts": out_parts,
        "pulses": pulses, "axis": {"t0": _T0.isoformat(), "seam_day": (_SEAM - _T0).days, "max_day": max_day},
        "sentences": sentences,
        "source": "CompraNet (12 months before) vs ComprasMX open-data contracts (federal, after) — not scored",
    }


def _sentences(kind, cp_vendor, ent_short, pre_top, post_top, parts, pre, post, conc, months_post, birmex):
    """Claim + body sentences in both languages, as segments (see gap_relevo)."""
    K = len(pre_top)
    in_pre = {p["key"] for p in pre_top}
    stayed_any = [p for p in pre_top if p["post_n"] > 0]
    stayed_top = [p for p in post_top if p["key"] in in_pre]
    entrants = [p for p in post_top if p["key"] not in in_pre]
    newcomers = [p for p in entrants if p["pre_v"] < 5e5 and p["post_v"] >= 5e5][:3]
    risers = [p for p in entrants if p["pre_v"] >= 5e5 and p["post_v"] > p["pre_v"]][:3]
    leavers = [p for p in pre_top if p["post_n"] == 0][:3]

    def pct(a: float, b: float) -> int:
        return round(100 * a / b) if b else 0

    def heads(ps):
        return [_norm(p["name"]) for p in ps]

    bk = f"i{_BIRMEX}"
    out = {}
    for lang in ("es", "en"):
        es = lang == "es"
        cp = ("proveedores" if es else "suppliers") if cp_vendor else ("compradores" if es else "buyers")
        if kind == "category":
            where = "en esta categoría" if es else "in this category"
        elif kind == "vendor":
            where = "con esta empresa" if es else "with this company"
        else:
            where = (f"con {ent_short}" if ent_short else "con esta institución") if es else (f"with {ent_short}" if ent_short else "with this institution")
        if K:
            n = len(stayed_any)
            claim = [{"b": str(n)}, (f" de los {K} mayores {cp} de los doce meses previos {'sigue' if n == 1 else 'siguen'} firmando {where} después del apagón." if es
                                      else f" of the {K} biggest {cp} of the twelve months before {'is' if n == 1 else 'are'} still signing {where} after the blackout.")]
        else:
            claim = (["Sin contratos en CompraNet en los doce meses previos; después del apagón, ", {"b": f"{post['n']:,}"}, " contratos por ", {"m": round(post["v"])}, "."] if es
                     else ["No CompraNet contracts in the twelve months before; after the blackout, ", {"b": f"{post['n']:,}"}, " contracts for ", {"m": round(post["v"])}, "."])
        body: List[List[Any]] = []
        if K:
            n = len(stayed_top)
            body.append([{"b": str(n)}, (f" {'se mantiene' if n == 1 else 'se mantienen'} entre los {K} mayores." if es else f" {'stays' if n == 1 else 'stay'} among the {K} biggest.")])
        if newcomers:
            one = " un contrato" if es else " one contract"
            items = [[{"k": p["key"]}, " (", {"m": p["post_v"], "f": p["flag"]}, ("," + one) if p["post_n"] == 1 else "", ")"] for p in newcomers]
            body.append([("Entraron sin contratos en los doce meses previos: " if es else "Came in with no contracts in the twelve months before: ")]
                        + _joined(items, lang, heads(newcomers)) + ["."])
        if risers:
            items = [[{"k": p["key"]}, " (", {"m": p["pre_v"]}, " → ", {"m": p["post_v"], "f": p["flag"]}, ")"] for p in risers]
            body.append([(f"Subieron desde fuera de los {K}: " if es else f"Rose from outside the {K}: ")] + _joined(items, lang, heads(risers)) + ["."])
        if leavers:
            body.append([("Sin contratos después en ComprasMX: " if es else "No contracts after in ComprasMX: ")]
                        + _joined([[{"k": p["key"]}] for p in leavers], lang, heads(leavers)) + ["."])
        if K:
            body.append([(f"Los {K} mayores concentran " if es else f"The {K} biggest hold "), {"b": f"{round(100 * conc['post'])} %"},
                         (f" del dinero de después; antes, {round(100 * conc['pre'])} %." if es else f" of the money after; before, {round(100 * conc['pre'])} %.")])
        if pre["v"] and post["v"]:
            body.append([("Por dinero, la adjudicación directa pasó de " if es else "By money, direct award went from "),
                         f"{pct(pre['da_v'], pre['v'])} % " + ("a " if es else "to "), {"b": f"{pct(post['da_v'], post['v'])} %"}, "."])
        # the coverage caveat: a smaller «after» is never read as a cut
        if birmex:
            body.append([("El dinero por mes es menor que antes, pero los dos registros difieren en cobertura y, en el mismo periodo, "
                          "BIRMEX, que compra medicamentos de forma consolidada para el sector salud, pasó de " if es
                          else "Money per month is lower than before, but the two registries differ in coverage and, over the same span, "
                               "BIRMEX, which buys medicines in consolidated rounds for the health sector, went from "),
                         {"m": round(birmex[0])}, (" a " if es else " to "), {"m": round(birmex[1])},
                         (": cambió quién compra; no se lee como un recorte." if es else ": who buys changed; this does not read as a cut.")])
        elif kind == "vendor" and bk in parts and post["v"] and parts[bk]["post_v"] / post["v"] >= 0.5:
            body.append([{"b": str(pct(parts[bk]["post_v"], post["v"]))},
                         (" de cada 100 pesos después del apagón vinieron de " if es else " of every 100 pesos after the blackout came from "), {"k": bk},
                         (", que compra medicamentos de forma consolidada para el sector salud: cambió quién compra." if es
                          else ", which buys medicines in consolidated rounds for the health sector: who buys changed.")])
        elif pre["v"] and post["v"] / months_post < 0.6 * pre["v"] / 12:
            body.append(["El dinero por mes es menor que antes; los dos registros difieren en cobertura, así que no se lee como un recorte." if es
                         else "Money per month is lower than before; the two registries differ in coverage, so this does not read as a cut."])
        out[lang] = {"claim": claim, "body": body}
    return out



# ---------------------------------------------------------------------------
# «La placa» — /gap L0–L3 (owner pick C, 2026-10-20; concept
# `frontend/_ui_v4/concepts/gap/C.html`, NOTES.md bucket ↔ door table).
# ¿Por qué puerta salió el dinero sin CompraNet? Four plain buckets, twenty legal
# doors; procedure wins over article for «Con concurso». One mark ≈ 10 awards
# (one door × amount kind × chunk of 10, sorted by month then amount), so the
# plate ships ~10K marks instead of /gap/field's 98K columns. A lane's own awards
# (1 mark = 1 award) load lazily from /plate/door/{k}; one award from /plate/award.
# Persisted under precomputed_stats 'slow:gap/plate' by scripts/precompute_gap_plate.py.
# Source codes: 0 open data (ComprasMX) · 1 read off the letter (OCR) · 2 estimated · 3 none.
# ---------------------------------------------------------------------------
import json as _json
import math as _math
from collections import Counter as _Counter
from functools import lru_cache as _lru_cache

from fastapi import Response
from .. import persisted

PLATE_BUCKETS = ("concurso", "pequena", "discrecion", "emergencia")
# door key → bucket
PLATE_DOORS = {
    "lp": "concurso", "inv": "concurso", "marco": "concurso",
    "55-1": "pequena", "43": "pequena",
    "54-I": "discrecion", "54-XII": "discrecion", "54-XIV": "discrecion", "54-VII": "discrecion",
    "42-VII": "discrecion", "54-III": "discrecion", "55-2": "discrecion", "54-VIII": "discrecion",
    "55-5": "discrecion", "41": "discrecion", "otros": "discrecion",
    "54-II": "emergencia", "54-V": "emergencia", "42-II": "emergencia", "42-V": "emergencia",
}
_PLATE_ART = {  # ASCII skeleton of exception_article → door (direct awards only)
    "Art 55 parrafo primero": "55-1", "Art 43": "43",
    "Art 54 fr II": "54-II", "Art 54 fr V": "54-V", "Art 42 fr II": "42-II", "Art 42 fr V": "42-V",
    "Art 54 fr I": "54-I", "Art 54 fr XII": "54-XII", "Art 54 fr XIV": "54-XIV", "Art 54 fr VII": "54-VII",
    "Art 42 fr VII": "42-VII", "Art 42 fr VII Bis": "42-VII", "Art 54 fr III": "54-III",
    "Art 55 parrafo segundo": "55-2", "Art 54 fr VIII": "54-VIII", "Art 55 parrafo quinto": "55-5",
}
PLATE_PER = 10                 # awards per mark at L0 / L2
_Q_LO, _Q_STEP = 3.0, 32       # quantised amount: round((log10(MXN) − 3) × 32), 0…255 (1,000 MXN … 100B)


def _ascii(s: Optional[str]) -> str:
    """Accents vary by source (párrafo / p?rrafo): compare on the ASCII skeleton."""
    t = ''.join(ch for ch in _ud.normalize('NFKD', s or '') if (ord(ch) < 128 and ch.isalnum()) or ch == ' ')
    return _re.sub(r'\s+', ' ', t).strip().replace('prrafo', 'parrafo')


@_lru_cache(maxsize=4096)  # ~300 distinct (procedure, article) pairs; the NFKD skeleton is the slow part
def plate_door(procedure_type: Optional[str], article: Optional[str]) -> str:
    """The legal door of one award. Procedure first: an invitación under 55 §1 is still a competition."""
    p = _ascii(procedure_type).upper()
    if p.startswith('LICITACI'):
        return 'lp'
    if p.startswith('INVITACI'):
        return 'inv'
    if 'MARCO' in p:
        return 'marco'
    a = _ascii(article)
    if a in _PLATE_ART:
        return _PLATE_ART[a]
    return '41' if a.startswith('Art 41 ') else 'otros'


def _src_code(src: Optional[str]) -> int:
    return {"datos": 0, "fallo_ocr": 1, "estimated": 2}.get(src or "", 3)


def _quant(v: float) -> int:
    return max(0, min(255, round((_math.log10(v) - _Q_LO) * _Q_STEP))) if v and v > 0 else -1


def _valid(amt: Optional[float], src: Optional[str]) -> tuple:
    """(MXN | None, source code): no amount → 3; > 100B rejected → None, 3."""
    s = _src_code(src)
    if s == 3 or not amt or amt <= 0 or amt > MAX_CONTRACT_VALUE:
        return None, 3
    return amt, s


def _plate_rows(db: sqlite3.Connection) -> List[tuple]:
    """(rowid, door, buyer key, buyer id, name, siglas, MXN | None, source code, month) per award."""
    cached = app_cache.get("gap_plate_rows", "v")
    if cached is not None:
        return cached
    out = []
    for rid, proc, art, iid, sig, name, amt, src, mon in db.execute("""
            SELECT rowid, procedure_type, exception_article, legacy_institution_id,
                   TRIM(COALESCE(institution_siglas, '')), TRIM(COALESCE(institution_name, '')),
                   CAST(amount_mxn_best AS REAL), amount_source, substr(publication_date, 1, 7)
            FROM gap_contracts ORDER BY rowid"""):
        v, s = _valid(amt, src)
        key = iid if iid is not None else (sig or name or "—")
        out.append((rid, plate_door(proc, art), key, iid, name or sig or "—", sig or None, v, s, mon))
    app_cache.set("gap_plate_rows", "v", out, maxsize=1, ttl=3600)
    return out


def _agg() -> Dict[str, Any]:
    return {"n": 0, "datos_n": 0, "datos_v": 0.0, "ocr_n": 0, "ocr_v": 0.0, "est_n": 0, "est_v": 0.0,
            "none_n": 0, "flag_n": 0, "flag_v": 0.0}


def _add(a: Dict[str, Any], v: Optional[float], s: int) -> None:
    a["n"] += 1
    k = ("datos", "ocr", "est", None)[s]
    if k is None:
        a["none_n"] += 1
        return
    a[f"{k}_n"] += 1
    a[f"{k}_v"] += v
    if v > FLAG_THRESHOLD:
        a["flag_n"] += 1
        a["flag_v"] += v


def _round_agg(a: Dict[str, Any]) -> Dict[str, Any]:
    return {k: (round(x) if isinstance(x, float) else x) for k, x in a.items()}


def _compute_plate(db: sqlite3.Connection) -> Dict[str, Any]:
    rows = _plate_rows(db)
    months = sorted({r[8] for r in rows if r[8]})
    m_idx = {m: i for i, m in enumerate(months)}
    dk = list(PLATE_DOORS)
    meta, B, D = _agg(), {b: _agg() for b in PLATE_BUCKETS}, {d: _agg() for d in dk}
    buyers: Dict[Any, List[Any]] = {}                      # key → [id, name, siglas]
    read_by: Dict[str, Dict[Any, List[float]]] = {}       # '*' | bucket | door → buyer key → [n, read MXN]
    per_door: Dict[str, List[List[tuple]]] = {d: [[], [], []] for d in dk}  # solid / estimated / none
    for rid, door, key, iid, name, sig, v, s, mon in rows:
        b = PLATE_DOORS[door]
        for a in (meta, B[b], D[door]):
            _add(a, v, s)
        buyers.setdefault(key, [iid, name, sig])
        for grp in ("*", b, door):
            x = read_by.setdefault(grp, {}).setdefault(key, [0, 0.0])
            x[0] += 1
            if s in (0, 1):
                x[1] += v
        per_door[door][0 if s in (0, 1) else 1 if s == 2 else 2].append((m_idx.get(mon, -1), v or 0.0, s))
    # marks: one per chunk of ≤ PLATE_PER awards of one door × amount kind, sorted by month then amount
    col: Dict[str, List[int]] = {k: [] for k in "dkqmsc"}
    for di, door in enumerate(dk):
        for kind, lst in enumerate(per_door[door]):
            lst.sort()
            for j in range(0, len(lst), PLATE_PER):
                ch = lst[j:j + PLATE_PER]
                col["d"].append(di)
                col["k"].append(kind)
                col["q"].append(_quant(sorted(x[1] for x in ch)[len(ch) // 2]) if kind < 2 else -1)
                col["m"].append(ch[len(ch) // 2][0])
                col["s"].append(_Counter(x[2] for x in ch).most_common(1)[0][0])
                col["c"].append(len(ch))
    index: Dict[Any, int] = {}
    blist: List[List[Any]] = []

    def top(grp: str, k: int, parts: Optional[List[str]] = None) -> List[List[Any]]:
        """[buyer index, awards, MXN read] — by money read (open data + letters; an estimate is a
        budget, not an award). With `parts`: + MXN read per part (bucket or door)."""
        res = []
        for key, (n, v) in sorted(read_by.get(grp, {}).items(), key=lambda t: (-t[1][1], -t[1][0]))[:k]:
            if key not in index:
                index[key] = len(blist)
                blist.append(buyers[key])
            r = [index[key], n, round(v)]
            if parts:
                r.append([round(read_by[p].get(key, [0, 0.0])[1]) for p in parts])
            res.append(r)
        return res

    bdoors = {b: sorted([d for d in dk if PLATE_DOORS[d] == b],
                        key=lambda d: (-(D[d]["datos_v"] + D[d]["ocr_v"] + D[d]["est_v"]), -D[d]["n"]))
              for b in PLATE_BUCKETS}
    out = {
        "available": True, "per": PLATE_PER, "q": [_Q_LO, _Q_STEP],
        "window": _data_window(db), "months": months,
        "meta": {**_round_agg(meta), "n_buyers": len(buyers)},
        "top": top("*", 10, list(PLATE_BUCKETS)),
        "buckets": [{"k": b, **_round_agg(B[b]), "doors": bdoors[b], "top": top(b, 10, bdoors[b])}
                    for b in PLATE_BUCKETS],
        "doors": [{"k": d, "b": PLATE_DOORS[d], **_round_agg(D[d]), "top": top(d, 8)} for d in dk],
        "buyers": blist,
        "marks": col,
    }
    return out


def plate_payload(db: sqlite3.Connection) -> Dict[str, Any]:
    cached = app_cache.get("gap_plate", "v")
    if cached is not None:
        return cached
    out = persisted.load("gap/plate") or _compute_plate(db)
    app_cache.set("gap_plate", "v", out, maxsize=1, ttl=3600)
    return out


def _json_bytes(obj: Any) -> str:
    return _json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


@router.get("/plate")
def gap_plate(part: str = Query("all", pattern="^(all|head)$"),
              db: sqlite3.Connection = Depends(get_db_dep)) -> Response:
    """The plate. part=head = everything but the marks (claim, four cells, lanes, buyers) so L0
    draws its numbers before the marks land. Pre-serialised: no per-request encoding."""
    if not _has_table(db):
        return Response(content='{"available":false}', media_type="application/json")
    key = f"plate_body_{part}"
    body = app_cache.get("gap_plate_body", key)
    if body is None:
        p = plate_payload(db)
        body = _json_bytes(p if part == "all" else {k: v for k, v in p.items() if k != "marks"})
        app_cache.set("gap_plate_body", key, body, maxsize=2, ttl=3600)
    return Response(content=body, media_type="application/json")


@router.get("/plate/door/{door}")
def gap_plate_door(door: str, db: sqlite3.Connection = Depends(get_db_dep)) -> Response:
    """Every award of one door (1 mark = 1 award), in table order: v hundreds of MXN (null = none) ·
    s source code · m month index · b index into `buyers` [[id, name, siglas]]. Award i of the
    door opens with /plate/award?door=&i= (ponytail: index into the cached rows; a reload of
    gap_contracts between the two calls can shift it — the card carries uuid for citations)."""
    if door not in PLATE_DOORS:
        raise HTTPException(status_code=404, detail="unknown door")
    if not _has_table(db):
        return Response(content='{"available":false}', media_type="application/json")
    body = app_cache.get("gap_plate_door", door)
    if body is None:
        rows = _plate_rows(db)
        months = sorted({r[8] for r in rows if r[8]})
        m_idx = {m: i for i, m in enumerate(months)}
        col: Dict[str, List[Any]] = {k: [] for k in "vsmb"}
        bi: Dict[Any, int] = {}
        blist: List[List[Any]] = []
        for rid, d, key, iid, name, sig, v, s, mon in rows:
            if d != door:
                continue
            if key not in bi:
                bi[key] = len(blist)
                blist.append([iid, name, sig])
            col["v"].append(round(v / 100) if v is not None else None)
            col["s"].append(s)
            col["m"].append(m_idx.get(mon, -1))
            col["b"].append(bi[key])
        body = _json_bytes({"available": True, "door": door, "n": len(col["v"]), "buyers": blist, "col": col})
        app_cache.set("gap_plate_door", door, body, maxsize=32, ttl=3600)
    return Response(content=body, media_type="application/json")


# a company's legal form at the end of the name (persona moral); anything else may be a person
_CORP = _re.compile(r'(\bS\.?\s?A\.?(\s?P\.?\s?I\.?)?(\s?B\.?)?(\s?DE\s?C\.?\s?V\.?)?|\bS\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?'
                    r'|\bS\.?\s?C\.?(\s?DE\s?(R\.?\s?L\.?|C\.?\s?V\.?))?|\bA\.?\s?C\.?|\bS\.?\s?A\.?\s?S\.?|\bI\.?\s?A\.?\s?P\.?)\s*$', _re.I)


def is_company_name(name: str) -> bool:
    return bool(_CORP.search((name or "").strip().rstrip(".,; ") + ("." if (name or "").strip().endswith(".") else "")))


def letter_vendor(raw: Optional[str], rfc: Optional[str], rfc_pf: Optional[str], match: Optional[str]) -> Optional[str]:
    """A letter's (OCR) vendor, named only when it is a company: never a persona física (flag or 13-char
    RFC), never the buyer read as its own vendor; a 12-char RFC or a company legal form is required."""
    raw, rfc = (raw or "").strip(), (rfc or "").strip()
    if not raw or match == "self_buyer" or is_persona_fisica(rfc_pf == "1", rfc):
        return None
    return clean_name(raw) if len(rfc) == 12 or is_company_name(raw) else None


def _door_index(db: sqlite3.Connection) -> Dict[str, Any]:
    """{door: [rowid, …]} in table order + {rowid: i}: /plate/award without a scan per call."""
    hit = app_cache.get("gap_plate_index", "v")
    if hit is None:
        rids: Dict[str, List[int]] = {}
        for r in _plate_rows(db):
            rids.setdefault(r[1], []).append(r[0])
        hit = {"rids": rids, "pos": {rid: i for lst in rids.values() for i, rid in enumerate(lst)}}
        app_cache.set("gap_plate_index", "v", hit, maxsize=1, ttl=3600)
    return hit


@router.get("/plate/award")
def gap_plate_award(door: Optional[str] = Query(None, max_length=8), i: Optional[int] = Query(None, ge=0),
                    uuid: Optional[str] = Query(None, max_length=64, pattern=r"^[0-9A-Za-z\-]+$"),
                    db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """One award for the card. The vendor is named only when it is a company: from the
    procedure's ComprasMX open-data contracts (a persona física is never named), else the
    letter's vendor when its RFC is a company's (12 characters) or its name ends in a company
    form. No RFC travels; the buyer's own name read as the vendor is never shown."""
    if not _has_table(db):
        raise HTTPException(status_code=404, detail="gap table absent")
    if uuid:
        where, arg = "uuid_procedimiento = ?", uuid
    elif door in PLATE_DOORS and i is not None:
        rids = _door_index(db)["rids"].get(door, [])
        if i >= len(rids):
            raise HTTPException(status_code=404, detail="award not found")
        where, arg = "rowid = ?", rids[i]
    else:
        raise HTTPException(status_code=422, detail="door + i, or uuid, required")
    g = db.execute(f"""SELECT rowid, procedure_number, uuid_procedimiento, COALESCE(description, title) title,
            procedure_type, exception_article, legacy_institution_id, institution_name, institution_siglas,
            CAST(amount_mxn_best AS REAL) amt, amount_source, publication_date, expedient_code,
            vendor, vendor_rfc, vendor_rfc_persona_fisica, vendor_match, legacy_vendor_id
        FROM gap_contracts WHERE {where}""", (arg,)).fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="award not found")
    amt, s = _valid(g["amt"], g["amount_source"])
    vendor, vendor_id, n_contracts, n_pf, pf = None, None, 0, 0, False
    if g["procedure_number"]:
        cs = db.execute("""SELECT proveedor, vendor_id, is_persona_fisica, vendor_match
            FROM comprasmx_contracts WHERE numero_procedimiento = ? ORDER BY amount_mxn DESC""",
                        (g["procedure_number"],)).fetchall()
        n_contracts = len(cs)
        n_pf = sum(1 for c in cs if c["is_persona_fisica"] == 1 or c["vendor_match"] == "persona_fisica")
        firm = next((c for c in cs if c["is_persona_fisica"] == 0 and c["vendor_match"] != "persona_fisica"
                     and (c["proveedor"] or "").strip()), None)
        if firm:
            vendor, vendor_id = clean_name(firm["proveedor"].strip()), firm["vendor_id"]
        elif n_pf:  # policy 10-29: the largest persona física is named as ComprasMX publishes it, and labelled
            top = next((c for c in cs if (c["proveedor"] or "").strip() and clean_name(c["proveedor"].strip())), None)
            if top:
                vendor, vendor_id, pf = clean_name(top["proveedor"].strip()), top["vendor_id"], True
    if vendor is None and n_contracts == 0:
        vendor = letter_vendor(g["vendor"], g["vendor_rfc"], g["vendor_rfc_persona_fisica"], g["vendor_match"])
        vendor_id = g["legacy_vendor_id"] if vendor else None
    note = None if vendor else ("pf" if n_pf else "self_buyer" if g["vendor_match"] == "self_buyer" else "unnamed")
    door = plate_door(g["procedure_type"], g["exception_article"])
    return {
        "i": _door_index(db)["pos"].get(g["rowid"]), "uuid": g["uuid_procedimiento"], "procedure_number": g["procedure_number"],
        "expedient_code": g["expedient_code"], "title": (g["title"] or "").strip() or None,
        "door": door, "bucket": PLATE_DOORS[door], "article": g["exception_article"],
        "institution_id": g["legacy_institution_id"], "institution": g["institution_name"],
        "siglas": g["institution_siglas"], "date": (g["publication_date"] or "")[:10] or None,
        "amount_mxn": amt, "source": s, "flag": bool(amt and amt > FLAG_THRESHOLD),
        "n_contracts": n_contracts, "n_persona_fisica": n_pf,
        "vendor": vendor, "vendor_id": vendor_id, "vendor_note": note, "persona_fisica": pf,
    }
