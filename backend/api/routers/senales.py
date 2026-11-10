"""«Señales nuevas» API: rule-based, label-free signals per vendor (docs/SENALES_NUEVAS.md).

Served from `vendor_signals` + `aria_nuevos_signals`, built by scripts/compute_senales_nuevas.py.
A signal is a risk indicator for prioritising review, never proof of wrongdoing. Personas físicas and
public bodies are never scored (the tables hold companies only; the list re-checks it). No RFC and no
official's name is ever returned.
"""
import json
import logging
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from ..cache import app_cache
from ..dependencies import get_db_dep
from ..public_labels import public_vendor_name

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/senales", tags=["senales"])

_CACHE, _TTL = "senales", 3600  # + "_v" / "_n": one namespace per key kind (api/cache.py)

#: code -> (ES label, EN label). Display order.
SIGNALS: Dict[str, tuple] = {
    "plazo_reducido": ("Plazo de licitación reducido", "Shortened tender period"),
    "urgencia": ("Uso intensivo de excepciones por caso fortuito o urgencia", "Heavy use of emergency exceptions"),
    "antes_del_fallo": ("Empezó antes del fallo", "Work started before the award"),
    "arranque": ("Crecimiento instantáneo", "Instant growth"),
    "mismo_dia": ("Fraccionamiento el mismo día", "Same-day split purchases"),
    "pareja": ("Pareja de largo plazo sin competencia", "Long-term pair without competition"),
    "empresa_joven": ("Empresa joven al primer contrato", "Young company at first contract"),
    "comprador_dominado": ("Más de la mitad del gasto de un comprador", "Over half of a buyer's yearly spend"),
}

DISCLAIMER = {
    "es": "Una señal es un indicador de riesgo para priorizar una revisión, no una prueba de irregularidad.",
    "en": "A signal is a risk indicator to prioritise review, not proof of wrongdoing.",
}


def _mdp(v: float, lang: str) -> str:
    """Money for a sentence: ES «1,234 MDP» / «1.2 billones de pesos»; EN «MXN 1,234M» / «MXN 1.2T»."""
    m = (v or 0) / 1e6
    if m >= 1e6:
        return f"{m / 1e6:,.1f} billones de pesos" if lang == "es" else f"MXN {m / 1e6:,.1f}T"
    s = f"{m:,.1f}" if m < 100 else f"{m:,.0f}"
    return f"{s} MDP" if lang == "es" else f"MXN {s}M"


def _pct(x: Optional[float]) -> str:
    return f"{(x or 0) * 100:.0f} %"


def sentence(signal: str, n: int, money: float, y0: Optional[int], d: Dict[str, Any]) -> Dict[str, str]:
    """Plain ES/EN sentence for one vendor_signals row. Wording rules: docs/SENALES_NUEVAS.md «Qué decir»."""
    ex = (d.get("examples") or [None])[0]
    if signal == "plazo_reducido":
        return {
            "es": f"Ganó {d['n_red']} de sus {d['n_lic']} licitaciones públicas con plazo reducido: la convocatoria "
                  f"estuvo abierta menos días que el mínimo general de la ley (15 nacionales, 20 internacionales; "
                  f"se puede reducir hasta 10 con justificación). Con la tasa habitual de esos mismos compradores "
                  f"se esperarían {d['expected']:.1f}.",
            "en": f"Won {d['n_red']} of its {d['n_lic']} public tenders on a shortened call: open fewer days than the "
                  f"law's general minimum (15 national, 20 international; reducible to 10 with a justification). "
                  f"Those buyers' usual rate predicts {d['expected']:.1f}.",
        }
    if signal == "urgencia":
        return {
            "es": f"{_pct(d['share'])} de su dinero registrado de 2023 a 2026 ({_mdp(money, 'es')}, {n} contratos) "
                  f"llegó por adjudicación directa invocando caso fortuito, fuerza mayor o urgencia; esos mismos "
                  f"compradores pagan así {_pct(d['buyer_share'])} de lo que compran a otros proveedores.",
            "en": f"{_pct(d['share'])} of its recorded 2023 to 2026 money ({_mdp(money, 'en')}, {n} contracts) came "
                  f"by direct award citing an emergency, force majeure or urgency exception; the same buyers pay "
                  f"{_pct(d['buyer_share'])} of their other suppliers' money that way.",
        }
    if signal == "antes_del_fallo":
        j = d.get("jan1") or 0
        es_j = f" {j} empezaron un 1 de enero, algo común en servicios de continuidad." if j else ""
        en_j = f" {j} started on 1 January, common for continuity services." if j else ""
        return {
            "es": f"En {n} contrato(s) competitivo(s) de ComprasMX ({_mdp(money, 'es')}), la fecha de inicio es "
                  f"anterior al fallo, hasta {d['max_days_early']} días antes.{es_j}",
            "en": f"In {n} competitive ComprasMX contract(s) ({_mdp(money, 'en')}), the start date precedes the award "
                  f"decision, by up to {d['max_days_early']} days.{en_j}",
        }
    if signal == "arranque":
        return {
            "es": f"Recibió {_mdp(money, 'es')} en los 365 días posteriores a su primer contrato federal registrado "
                  f"en CompraNet ({y0}); superó los 100 MDP en {d['days_to_threshold']} días.",
            "en": f"Received {_mdp(money, 'en')} in the 365 days after its first federal contract recorded in "
                  f"CompraNet ({y0}); it passed MXN 100M in {d['days_to_threshold']} days.",
        }
    if signal == "mismo_dia":
        es_x = f" (p. ej. {ex[1]}, {ex[0]})" if ex else ""
        en_x = f" (e.g. {ex[1]}, {ex[0]})" if ex else ""
        return {
            "es": f"En {d['n_lots']} ocasión(es) una institución federal le adjudicó directamente el mismo día dos o "
                  f"más contratos, cada uno bajo el tope de adjudicación directa, que juntos superan el tope más "
                  f"alto{es_x}.",
            "en": f"On {d['n_lots']} occasion(s) a federal buyer direct-awarded it two or more contracts on the same "
                  f"day, each under the direct-award cap, together above the highest cap{en_x}.",
        }
    if signal == "pareja":
        es_x = f" (p. ej. {ex[0]}, {ex[2]} a {ex[3]})" if ex else ""
        en_x = f" (e.g. {ex[0]}, {ex[2]} to {ex[3]})" if ex else ""
        return {
            "es": f"Tiene {d['n_pairs']} relación(es) de 10 o más años seguidos con un mismo comprador en las que al "
                  f"menos 80 % del dinero desde 2011 fue por adjudicación directa o con un solo ganador{es_x}.",
            "en": f"Has {d['n_pairs']} relationship(s) of 10+ consecutive years with one buyer where at least 80% of "
                  f"the money since 2011 went by direct award or to a lone winner{en_x}.",
        }
    if signal == "empresa_joven":
        return {
            "es": f"Su RFC indica que se constituyó {d['gap_days']} días antes de su primer contrato federal "
                  f"registrado ({y0}).",
            "en": f"Its tax ID encodes an incorporation date {d['gap_days']} days before its first recorded federal "
                  f"contract ({y0}).",
        }
    if signal == "comprador_dominado":
        k = d.get("n_buyer_years") or 0
        es_x = f" Por ejemplo, {ex[1]} en {ex[0]}: {_pct(ex[2])}." if ex else ""
        en_x = f" For example, {ex[1]} in {ex[0]}: {_pct(ex[2])}." if ex else ""
        return {
            "es": f"En {k} año(s) recibió más de la mitad del gasto anual de una institución que compró al menos "
                  f"100 MDP a 5 o más proveedores.{es_x}",
            "en": f"In {k} year(s) it took over half of a buyer's yearly spend, where that buyer bought at least "
                  f"MXN 100M from 5+ suppliers.{en_x}",
        }
    label = SIGNALS.get(signal, (signal, signal))
    return {"es": label[0], "en": label[1]}


def _has(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def _label(sig: str) -> Dict[str, str]:
    es, en = SIGNALS.get(sig, (sig, sig))
    return {"es": es, "en": en}


@router.get("/vendor/{vendor_id}")
def get_vendor_signals(vendor_id: int, conn: sqlite3.Connection = Depends(get_db_dep)):
    """Plain ES/EN sentences per signal for the vendor dossier. Empty list = no signal (or not scored)."""
    ck = f"v:{vendor_id}"
    hit = app_cache.get(_CACHE + "_v", ck)
    if hit is not None:
        return hit
    out: Dict[str, Any] = {"vendor_id": vendor_id, "signals": [], "n_signals": 0, "nuevos_rank": None,
                           "available": _has(conn, "vendor_signals"), "disclaimer": DISCLAIMER,
                           "methodology": "docs/SENALES_NUEVAS.md"}
    if out["available"]:
        rows = conn.execute(
            "SELECT signal, n_contracts, money_mxn, first_year, last_year, detail_json FROM vendor_signals"
            " WHERE vendor_id = ?", (vendor_id,)).fetchall()
        order = list(SIGNALS)
        for sig, n, money, y0, y1, dj in sorted(rows, key=lambda r: order.index(r[0]) if r[0] in order else 99):
            out["signals"].append({"signal": sig, "label": _label(sig),
                                   "sentence": sentence(sig, n, money, y0, json.loads(dj or "{}")),
                                   "n_contracts": n, "money_mxn": money, "first_year": y0, "last_year": y1})
        out["n_signals"] = len(out["signals"])
        if _has(conn, "aria_nuevos_signals"):
            r = conn.execute("SELECT rank FROM aria_nuevos_signals WHERE vendor_id = ?", (vendor_id,)).fetchone()
            out["nuevos_rank"] = r[0] if r else None
    app_cache.set(_CACHE + "_v", ck, out, maxsize=4096, ttl=_TTL)
    return out


@router.get("/nuevos")
def get_nuevos(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    min_signals: int = Query(2, ge=2, le=8),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """ARIA «Nuevos» by signals: no ground-truth link of any kind, >= 2 signals, active 2019+,
    ranked by number of signals, then money (no GT bonus)."""
    ck = f"n:{limit}:{offset}:{min_signals}"
    hit = app_cache.get(_CACHE + "_n", ck)
    if hit is not None:
        return hit
    out: Dict[str, Any] = {"items": [], "total": 0, "by_n_signals": {}, "disclaimer": DISCLAIMER,
                           "available": _has(conn, "aria_nuevos_signals"), "methodology": "docs/SENALES_NUEVAS.md"}
    if out["available"]:
        out["by_n_signals"] = {str(k): c for k, c in conn.execute(
            "SELECT n_signals, COUNT(*) FROM aria_nuevos_signals GROUP BY 1 ORDER BY 1")}
        out["total"] = conn.execute("SELECT COUNT(*) FROM aria_nuevos_signals WHERE n_signals >= ?",
                                    (min_signals,)).fetchone()[0]
        rows = conn.execute(
            """SELECT a.vendor_id, v.name, v.is_individual, v.rfc, a.n_signals, a.signals_json, a.money_mxn, a.rank
               FROM aria_nuevos_signals a JOIN vendors v ON v.id = a.vendor_id
               WHERE a.n_signals >= ? ORDER BY a.rank LIMIT ? OFFSET ?""", (min_signals, limit, offset)).fetchall()
        items: List[Dict[str, Any]] = []
        for vid, name, ind, rfc, k, sj, money, rank in rows:
            name, pf = public_vendor_name(name, ind, rfc)
            if name is None:  # defence in depth: the table holds companies only; an RFC-as-name is never shipped
                continue
            items.append({"vendor_id": vid, "vendor_name": name, "persona_fisica": pf, "n_signals": k, "money_mxn": money, "rank": rank,
                          "signals": [{"signal": s, "label": _label(s)} for s in json.loads(sj or "[]")]})
        out["items"] = items
    app_cache.set(_CACHE + "_n", ck, out, maxsize=256, ttl=_TTL)
    return out
