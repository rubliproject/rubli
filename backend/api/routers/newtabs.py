"""New tabs — «El Arranque», «El Mismo Día», «Las Parejas», «El Rastro de un Peso».

Definitions are frozen in docs/NEWTABS_DEFINITIONS.md. The first three read the newtabs_* tables written by
`scripts/precompute_newtabs.py`; «El Rastro» carves live from contracts (indexed by institution / category /
vendor). No RFC and no official's name leaves this module; personas físicas are named as CompraNet publishes them and flagged (persona_fisica / is_pf, owner 2026-10-29).
Amounts > 100B MXN are excluded everywhere; > 10B carry flag_10b.
"""
import json
import re
import sqlite3
import threading
from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..cache import app_cache
from ..config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE
from ..dependencies import get_db_dep
from ..public_labels import _norm_name, clean_name, is_public_entity, public_vendor_name
from ..config.constants import DATA_LAST_YEAR

router = APIRouter(prefix="/newtabs", tags=["newtabs"])
_TTL = 6 * 3600
# The PEF Anexo 9 buyer universe (NEWTABS_DEFINITIONS.md § 2.1). Pemex / CFE and their subsidiaries buy under their own
# laws (Ley de Pemex / Ley de la CFE, 2014); autonomous universities under their own statutes. Names arrive with
# mojibake, so accents are matched with '.'. scripts/precompute_newtabs.py imports these two.
_NOT_APF_TYPES = ('autonomous_constitutional', 'judicial', 'legislative')
# Public bodies the anchored public_labels pattern misses (state OPDs, public trusts, state/municipal bodies, public
# universities): a firm that «arrives big» must be a firm. Matched on the mojibake-folded name (accents → '.').
_PUBLIC_EXTRA = re.compile(
    r"ORGANISMO P.BLICO|DESCENTRALIZAD[OA] (DEL|DE LA) |FIDEICOMISO P.BLICO|^(H\.? )?AYUNTAMIENTO|^MUNICIPIO "
    r"|^GOBIERNO |UNIVERSIDAD (P.BLICA|ESTATAL)|^(INSTITUTO|COMISI.N|SISTEMA|CONSEJO|JUNTA) (ESTATAL|MUNICIPAL|LOCAL) "
    r"|^SERVICIOS (DE SALUD|EDUCATIVOS) (DE|DEL) |^SECRETAR.A ")
_OWN_LAW = r'PEMEX|PETR.LEOS MEXICANOS|PETROQU.MICA|P\.?M\.?I\.? COMERCIO|COMISI.N FEDERAL DE ELECTRICIDAD|^CFE|UNIVERSIDAD .*AUT.NOMA'

_VALID = f"c.amount_mxn > 0 AND c.amount_mxn <= {MAX_CONTRACT_VALUE}"
def _meta(db: sqlite3.Connection, key: str) -> Optional[Dict[str, Any]]:
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='newtabs_meta'").fetchone() is None:
        return None
    row = db.execute("SELECT json, built_at FROM newtabs_meta WHERE key = ?", (key,)).fetchone()
    return {**json.loads(row[0]), "built_at": row[1]} if row else None


def _cached(key: str, fn):
    hit = app_cache.get("newtabs", key)
    if hit is None:
        hit = fn()
        if hit.get("available"):  # "not built yet" is retried on the next request, not pinned for 6 h
            app_cache.set("newtabs", key, hit, maxsize=256, ttl=_TTL)
    return hit


_RASTRO_SLOTS = threading.BoundedSemaphore(2)


def _rastro_cached(key: str, fn):
    """«El Rastro» aggregates live over a whole institution: own namespace (it must not evict the
    table-backed tabs) and at most two misses computing at once (else 429)."""
    hit = app_cache.get("newtabs_rastro", key)
    if hit is not None:
        return hit
    if not _RASTRO_SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Too many concurrent requests; retry shortly")
    try:
        hit = fn()
    finally:
        _RASTRO_SLOTS.release()
    if hit.get("available"):
        app_cache.set("newtabs_rastro", key, hit, maxsize=2048, ttl=_TTL)
    return hit


def _incorporation(rfc: Optional[str], ref: date) -> Optional[date]:
    """Incorporation date encoded in a persona-moral RFC (12 chars, YYMMDD at positions 4–9); read, never shipped."""
    s = (rfc or '').strip().upper()
    if len(s) != 12 or not s[3:9].isdigit():
        return None
    yy, mm, dd = int(s[3:5]), int(s[5:7]), int(s[7:9])
    try:
        return date(2000 + yy if 2000 + yy <= ref.year else 1900 + yy, mm, dd)
    except ValueError:
        return None


@router.get("/arranque")
def arranque(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """Firms whose first CompraNet contract (2011+) is followed by ≥ 100 MDP within 365 days. Public bodies in the
    frozen table (name pattern or vendor_kind = 'public_soe') are dropped here and every total recomputed on the kept
    rows; an unnamed (RFC-shaped) row ships no vendor id."""
    def run():
        meta = _meta(db, "arranque")
        if meta is None:
            return {"available": False}
        rows, rfc, dropped = [], {}, 0
        for r in db.execute("""SELECT a.vendor_id, a.vendor_name, a.first_date, a.first_year,
                a.first_contract_id, a.y1_mxn, a.y1_n, a.y1_da_share, a.days_to_threshold, a.incorp_bucket,
                a.censored, a.flag_10b, v.vendor_kind, v.name AS raw_name, v.rfc,
                cc.institution_id, i.name AS institution_name, i.siglas AS institution_siglas,
                COALESCE(cc.sector_id, i.sector_id) AS sector_id, cc.risk_score AS first_risk_score,
                cc.procedure_type_normalized AS first_procedure, cat.id AS category_id,
                cat.name_es AS category_es, cat.name_en AS category_en
                FROM newtabs_arranque a LEFT JOIN vendors v ON v.id = a.vendor_id
                LEFT JOIN contracts cc ON cc.id = a.first_contract_id AND cc.amount_mxn > 0 AND cc.amount_mxn <= ?
                LEFT JOIN institutions i ON i.id = cc.institution_id
                LEFT JOIN categories cat ON cat.id = cc.category_id AND cat.is_active = 1
                ORDER BY a.y1_mxn DESC""", (MAX_CONTRACT_VALUE,)):
            d = dict(r)
            kind, raw, rf = d.pop("vendor_kind"), d.pop("raw_name"), d.pop("rfc")
            if kind == "public_soe" or is_public_entity(raw or d["vendor_name"]) or _PUBLIC_EXTRA.search(_norm_name(raw or d["vendor_name"])):
                dropped += 1
                continue
            rfc[len(rows)] = rf
            rows.append(d)
        gaps = []
        for i, x in enumerate(rows):
            fd = date.fromisoformat(x["first_date"])
            inc = _incorporation(rfc[i], fd)
            # Los patrones' bar: days from incorporation to the first contract. Only a company RFC (12 chars) is ever
            # read; the RFC and the date itself never ship, only the gap.
            x["age_days"] = (fd - inc).days if inc and inc <= fd else None
            if x["age_days"] is not None:
                gaps.append(x["age_days"])
        gaps.sort()
        by_year: Dict[str, int] = {}
        for x in rows:
            by_year[str(x["first_year"])] = by_year.get(str(x["first_year"]), 0) + 1
        meta = {**meta, "n": len(rows), "n_public_dropped": dropped,
                "money_y1_mxn": sum(x["y1_mxn"] for x in rows), "by_first_year": by_year,
                "incorp_dated": sum(1 for x in rows if x["incorp_bucket"]),
                "incorp_lt365": sum(1 for x in rows if x["incorp_bucket"] in ("lt180", "lt365")),
                "incorp_median_days": gaps[len(gaps) // 2] if gaps else None,
                "n_censored": sum(1 for x in rows if x["censored"])}
        return {"available": True, "meta": meta, "rows": rows}
    return _cached("arranque", run)


def _apf_buyers(db: sqlite3.Connection) -> int:
    own = re.compile(_OWN_LAW)
    return sum(1 for name, typ in db.execute("SELECT name, institution_type FROM institutions WHERE is_federal = 1")
               if typ not in _NOT_APF_TYPES and not own.search((name or "").upper()))


@router.get("/mismo-dia")
def mismo_dia(
    institution_id: Optional[int] = Query(None, ge=1),
    year: Optional[int] = Query(None, ge=2019, le=DATA_LAST_YEAR),
    limit: int = Query(500, ge=1, le=5000),
    db: sqlite3.Connection = Depends(get_db_dep),
) -> Dict[str, Any]:
    """Same-day direct-award lots: every piece under the lowest PEF cap, the sum over the highest cap + IVA."""
    def run():
        meta = _meta(db, "mismo_dia")
        if meta is None:
            return {"available": False}
        where, args = [], []
        if institution_id:
            where.append("m.institution_id = ?"); args.append(institution_id)
        if year:
            where.append("m.year = ?"); args.append(year)
        w = ("WHERE " + " AND ".join(where)) if where else ""
        rows = []
        for r in db.execute(f"""SELECT m.institution_id, i.name AS institution_name, i.siglas, m.vendor_id,
                m.vendor_name, m.is_pf, m.contract_date, m.year, m.cls, m.n, m.sum_mxn, m.max_mxn,
                m.low_cap_mxn, m.high_cap_mxn, m.contract_ids, v.vendor_kind = 'public_soe' AS is_soe, v.name AS raw_name,
                v.is_individual AS v_ind, v.rfc AS v_rfc
                FROM newtabs_mismo_dia m JOIN institutions i ON i.id = m.institution_id
                LEFT JOIN vendors v ON v.id = m.vendor_id {w}
                ORDER BY m.sum_mxn DESC LIMIT ?""", (*args, limit)):
            d = dict(r)
            d["is_pf"], d["is_soe"] = bool(d["is_pf"]), bool(d["is_soe"])
            # names are public as CompraNet publishes them (owner, transparency): a persona física is named and
            # flagged; only an RFC-shaped name is dropped. No RFC is selected.
            raw, ind, rfc = d.pop("raw_name"), d.pop("v_ind"), d.pop("v_rfc")  # rfc read, never returned
            if d["is_pf"]:
                d["vendor_name"] = clean_name(raw)
            d["persona_fisica"] = d["is_pf"] or public_vendor_name(raw, ind, rfc)[1]
            d["contract_ids"] = json.loads(d["contract_ids"])
            rows.append(d)
        total = db.execute(f"SELECT COUNT(*) FROM newtabs_mismo_dia m {w}", args).fetchone()[0]
        meta = {**meta, "apf_buyers": meta.get("apf_buyers") or _apf_buyers(db)}
        # the lead lot = the largest named lot of the last two PEF years (current cases); its same-day direct
        # contracts AT or over the cap fell outside the lot
        lead = db.execute("""SELECT institution_id, vendor_id, contract_date, low_cap_mxn FROM newtabs_mismo_dia
            WHERE is_pf = 0 AND vendor_name IS NOT NULL AND year >= (SELECT MAX(year) - 1 FROM newtabs_mismo_dia)
            ORDER BY sum_mxn DESC LIMIT 1""").fetchone()
        if lead:
            meta["lead_above_cap"] = [a for (a,) in db.execute(f"""SELECT c.amount_mxn FROM contracts c
                WHERE c.institution_id = ? AND c.vendor_id = ? AND c.contract_date = ? AND c.is_direct_award = 1
                AND c.amount_mxn >= ? AND {_VALID} AND COALESCE(c.source_structure, '') <> 'E'
                ORDER BY c.amount_mxn DESC""", (lead["institution_id"], lead["vendor_id"], lead["contract_date"],
                                                lead["low_cap_mxn"]))]
        return {"available": True, "meta": meta, "total": total, "rows": rows}
    return _cached(f"md:{institution_id}:{year}:{limit}", run)


@router.get("/mismo-dia/piezas")
def mismo_dia_piezas(
    institution_id: int = Query(..., ge=1),
    vendor_id: int = Query(..., ge=1),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: sqlite3.Connection = Depends(get_db_dep),
) -> Dict[str, Any]:
    """The pieces of one lot (its frozen contract ids): number, title and amount, largest first."""
    def run():
        if _meta(db, "mismo_dia") is None:
            return {"available": False, "rows": []}
        row = db.execute("""SELECT contract_ids FROM newtabs_mismo_dia
            WHERE institution_id = ? AND vendor_id = ? AND contract_date = ?""",
                         (institution_id, vendor_id, date)).fetchone()
        if row is None:
            return {"available": False, "rows": []}
        ids = [int(i) for i in json.loads(row[0])]
        q = f"""SELECT c.id, c.contract_number, c.title, c.amount_mxn FROM contracts c
                WHERE c.id IN ({','.join('?' * len(ids))}) AND {_VALID} ORDER BY c.amount_mxn DESC"""
        return {"available": True, "rows": [dict(r) for r in db.execute(q, ids)]}
    return _cached(f"mdp:{institution_id}:{vendor_id}:{date}", run)


@router.get("/parejas")
def parejas(
    vendor_id: Optional[int] = Query(None, ge=1),
    institution_id: Optional[int] = Query(None, ge=1),
    limit: int = Query(200, ge=1, le=2000),
    db: sqlite3.Connection = Depends(get_db_dep),
) -> Dict[str, Any]:
    """Vendor × institution pairs with ≥ 10 distinct years. Unfiltered: only the frozen pairs (≥ 10 consecutive
    years and ≥ 80 % non-competitive money 2011+). Filtered by vendor or institution: every ≥ 10-year pair of
    that entity, each with its `frozen` flag (dossier lens)."""
    def run():
        meta = _meta(db, "parejas")
        if meta is None:
            return {"available": False}
        where, args = [], []
        if vendor_id:
            where.append("p.vendor_id = ?"); args.append(vendor_id)
        if institution_id:
            where.append("p.institution_id = ?"); args.append(institution_id)
        if not where:
            where.append("p.frozen = 1")
        rows = []
        for r in db.execute(f"""SELECT p.vendor_id, p.vendor_name, p.is_pf, p.institution_id,
                i.name AS institution_name, i.siglas, p.n_years, p.max_run, p.first_year, p.last_year,
                p.money_mxn, p.money_2011, p.da_share, p.noncomp_share, p.frozen, p.flag_10b, p.years,
                v.name AS raw_name, v.is_individual, v.rfc
                FROM newtabs_parejas p JOIN institutions i ON i.id = p.institution_id
                LEFT JOIN vendors v ON v.id = p.vendor_id
                WHERE {' AND '.join(where)} ORDER BY p.money_mxn DESC LIMIT ?""", (*args, limit)):
            d = dict(r)
            raw, ind, rfc = d.pop("raw_name"), d.pop("is_individual"), d.pop("rfc")  # rfc read, never returned
            d["years"] = json.loads(d["years"])
            for k in ("is_pf", "frozen", "flag_10b"):
                d[k] = bool(d[k])
            # policy 10-29: a persona física is named (CompraNet's name) and flagged; an RFC-shaped name never ships
            name, label = public_vendor_name(raw, ind, rfc)
            d["persona_fisica"] = d["is_pf"] or label
            if d["is_pf"]:
                d["vendor_name"] = name
            rows.append(d)
        return {"available": True, "meta": meta, "rows": rows}
    return _cached(f"pa:{vendor_id}:{institution_id}:{limit}", run)


_TOP = 15


@router.get("/rastro")
def rastro(
    institution_id: int = Query(..., ge=1),
    category_id: Optional[int] = Query(None, ge=0),
    vendor_id: Optional[int] = Query(None, ge=1),
    db: sqlite3.Connection = Depends(get_db_dep),
) -> Dict[str, Any]:
    """Carve one institution's money: categories → vendors in a category → contracts of a vendor there.
    Each row carries its share of the parent; the last level ends on citable contract ids.
    category_id = 0 means «sin categoría» (category_id IS NULL)."""
    def run():
        inst = db.execute("SELECT id, name, siglas FROM institutions WHERE id = ?", (institution_id,)).fetchone()
        if inst is None:
            return {"available": False}
        where, args = [f"c.institution_id = ?", _VALID], [institution_id]
        cat = ven = None
        if category_id is not None:
            if category_id == 0:
                where.append("c.category_id IS NULL")
                cat = {"id": 0, "name_es": "Sin categoría", "name_en": "Uncategorized"}
            else:
                where.append("c.category_id = ?"); args.append(category_id)
                r = db.execute("SELECT id, name_es, name_en FROM categories WHERE id = ?", (category_id,)).fetchone()
                cat = dict(r) if r else {"id": category_id, "name_es": None, "name_en": None}
        if vendor_id is not None and category_id is not None:
            where.append("c.vendor_id = ?"); args.append(vendor_id)
            v = db.execute("SELECT id, name, is_individual, rfc FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
            name, pf = public_vendor_name(v["name"], v["is_individual"], v["rfc"]) if v is not None else (None, False)
            ven = {"id": vendor_id, "name": name, "is_pf": pf}
        w = " AND ".join(where)
        parent_mxn, parent_n = db.execute(f"SELECT COALESCE(SUM(c.amount_mxn),0), COUNT(*) FROM contracts c WHERE {w}",
                                          args).fetchone()
        if ven is not None:
            level = "contract"
            q = f"""SELECT c.id, c.contract_number, c.title, c.contract_date, c.amount_mxn, c.is_direct_award,
                    c.procedure_type_normalized FROM contracts c WHERE {w}
                    ORDER BY c.amount_mxn DESC LIMIT {_TOP}"""
            rows = [dict(r) for r in db.execute(q, args)]
            for d in rows:
                d["flag_10b"] = d["amount_mxn"] > FLAG_THRESHOLD
        elif cat is not None:
            level = "vendor"
            q = f"""SELECT c.vendor_id AS id, v.name, v.is_individual, v.rfc, SUM(c.amount_mxn) AS amount_mxn,
                    COUNT(*) AS n FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE {w}
                    GROUP BY c.vendor_id ORDER BY amount_mxn DESC LIMIT {_TOP + 1}"""
            rows = []
            for r in db.execute(q, args):
                name, pf = public_vendor_name(r["name"], r["is_individual"], r["rfc"])
                rows.append({"id": r["id"], "name": name, "is_pf": pf,
                             "amount_mxn": r["amount_mxn"], "n": r["n"]})
        else:
            level = "category"
            q = f"""SELECT COALESCE(c.category_id, 0) AS id, k.name_es, k.name_en, SUM(c.amount_mxn) AS amount_mxn,
                    COUNT(*) AS n FROM contracts c LEFT JOIN categories k ON k.id = c.category_id WHERE {w}
                    GROUP BY COALESCE(c.category_id, 0) ORDER BY amount_mxn DESC LIMIT {_TOP + 1}"""
            rows = [dict(r) for r in db.execute(q, args)]
        truncated = len(rows) > _TOP
        rows = rows[:_TOP]
        for d in rows:
            d["share"] = round(d["amount_mxn"] / parent_mxn, 6) if parent_mxn else 0
        return {"available": True, "rows": rows, "meta": {
            "level": level, "parent_mxn": parent_mxn, "parent_n": parent_n, "truncated": truncated,
            "institution": dict(inst), "category": cat, "vendor": ven}}
    return _rastro_cached(f"ra:{institution_id}:{category_id}:{vendor_id}", run)
