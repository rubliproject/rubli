"""Append ComprasMX open-data contracts (2025–26) to `contracts` as source_structure 'E'.

Run on a COPY of the DB first (default refuses the live RUBLI_NORMALIZED.db
unless --i-mean-the-live-db). Inputs: comprasmx_contracts (staged by
etl_comprasmx_contratos.py + link_comprasmx_contracts.py) and
comprasmx_vendor_resolution (resolve_comprasmx_vendors.py --apply).

Per contract:
  skip     the same contract is already in CompraNet: same procedure number AND
           (amount within 1% OR same canonical vendor) — contract-level, not
           procedure-level (the staged in_contracts flag is procedure-level and
           would drop ~1,250 real extra contracts of known procedures)
  reject   amount > 100B MXN (CLAUDE.md § Critical Data Rules)
  load     everything else; > 10B MXN is loaded and flagged (is_high_value)

Vendors: resolution method rfc/rfc_split/name_loose/name_split → existing id;
new_*, probable_name, review_* → a NEW vendor row keyed by RFC (one per RFC;
personas físicas is_individual=1). probable_name keeps its candidate in
vendor_possible_same. Institutions: the staged canonical id, else a NEW row per
clave_institucion. Derived fields CompraNet rows carry are filled with the same
rules; data-quality and CUCOP fields come from their own scripts afterwards.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.etl_classify import (  # noqa: E402
    classify_contract, normalize_contract_type, normalize_procedure_type, normalize_vendor_name,
)
from scripts.resolve_comprasmx_vendors import shape  # noqa: E402

MAX_CONTRACT_VALUE = 100_000_000_000
FLAG_THRESHOLD = 10_000_000_000
ELECTION_YEARS = {2003, 2006, 2009, 2012, 2015, 2018, 2021, 2024, 2027}
SNAPSHOT = date.today().isoformat()  # ComprasMX files end ~2 days before the load
EXISTING = {"rfc", "rfc_split", "name_loose", "name_split"}


def _d(s):
    return s[:10] if s and len(s) >= 10 else None


def _days(a, b):
    try:
        return (date.fromisoformat(a) - date.fromisoformat(b)).days
    except (TypeError, ValueError):
        return None


def _contract_date(x) -> str | None:
    """Signing date, else start, else publication — but never a future date: a NULL
    fecha_firma (31.9%) fell back to start dates as late as Dec 2026 (v0.10 plan §E1)."""
    return next((d for d in (_d(x["fecha_firma"]), _d(x["fecha_inicio"]), _d(x["fecha_publicacion"]))
                 if d and d <= SNAPSHOT), None)


def contract_record(x: dict, vendor_id: int, institution_id: int) -> dict:
    """One staged ComprasMX row → a contracts row (CompraNet Structure D semantics)."""
    contract_date = _contract_date(x)
    year = int(contract_date[:4]) if contract_date else None
    month = int(contract_date[5:7]) if contract_date else None
    amount = x["amount_mxn"] or 0.0
    proc_norm, is_direct = normalize_procedure_type(x["tipo_procedimiento"])
    publication = _d(x["fecha_publicacion"])
    return {
        "source_structure": "E", "source_year": year,
        "vendor_id": vendor_id, "institution_id": institution_id,
        "sector_id": x["sector_id"], "category_id": x["category_id"], "category_source": x["category_source"],
        "contract_number": x["codigo_contrato"], "procedure_number": x["numero_procedimiento"],
        "expedient_code": x["codigo_expediente"],
        "title": x["titulo_contrato"] or x["titulo_expediente"], "description": x["descripcion_contrato"],
        "partida_especifica": x["partida_especifica"],
        "procedure_type": x["tipo_procedimiento"], "procedure_type_normalized": proc_norm,
        "contract_type": x["tipo_contratacion"], "contract_type_normalized": normalize_contract_type(x["tipo_contratacion"]),
        "procedure_character": x["caracter"], "participation_form": x["forma_participacion"],
        "contract_date": contract_date, "start_date": _d(x["fecha_inicio"]), "end_date": _d(x["fecha_fin"]),
        "award_date": _d(x["fecha_fallo"]), "publication_date": publication, "opening_date": _d(x["fecha_apertura"]),
        "amount_mxn": amount, "amount_original": x["importe_drc"] or amount, "currency": x["moneda"] or "MXN",
        "is_foreign_currency": 0 if (x["moneda"] or "MXN") == "MXN" else 1,
        "contract_year": year, "contract_month": month,
        "is_direct_award": 1 if is_direct else 0, "is_single_bid": 0,
        "is_framework": 1 if (x["contrato_marco"] or "").upper().startswith("S") else 0,
        "is_consolidated": 1 if (x["compra_consolidada"] or "").upper().startswith("S") else 0,
        "is_multiannual": 1 if (x["plurianual"] or "").upper().startswith("S") else 0,
        "is_high_value": 1 if amount > FLAG_THRESHOLD else 0,
        "is_year_end": 1 if month in (11, 12) else 0,
        "contract_status": x["estatus_contrato"], "exception_article": x["articulo_excepcion"],
        "caso_fortuito": x["caso_fortuito"],
        "publication_delay_days": _days(contract_date, publication),
        "sexenio_year": ((year - 2000) % 6) + 1 if year else None,
        "is_election_year": 1 if year in ELECTION_YEARS else 0,
        "risk_score": None, "risk_level": None, "risk_model_version": None,
    }


def company_rfc_index(conn, vcanon: dict) -> dict[str, set[int]]:
    """{company RFC: canonical vendor ids holding it}."""
    idx: dict[str, set[int]] = {}
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vendors'").fetchone():
        return idx  # amount-only plan (comprasmx_weekly fixtures)
    for v, r in conn.execute("SELECT id, UPPER(TRIM(rfc)) FROM vendors WHERE LENGTH(TRIM(rfc)) = 12"):
        if shape(r) == "company":
            idx.setdefault(r, set()).add(vcanon.get(v, v))
    return idx


def rfc_first(rfc_index: dict, rfc: str) -> int | None:
    """An existing vendor holding exactly this COMPANY RFC (canonical-folded, one id) — checked before a
    new vendor row is minted, so a review_*/new_* resolution never splits one RFC across two ids
    (DQ1 § 3: 690 split RFCs, 466 via ComprasMX). Personas físicas: never matched here."""
    if shape(rfc) != "company":
        return None
    ids = rfc_index.get(rfc, ())
    return next(iter(ids)) if len(ids) == 1 else None


def plan_load(conn, res: dict) -> tuple[dict, list]:
    """What --apply would do with every staged row: skip (already in CompraNet, or already loaded —
    an E row matches itself), reject (>100B), wait (no past date) or load. `res` is the RFC map of
    comprasmx_vendor_resolution; comprasmx_weekly passes {} when it is absent (amount-only dedupe,
    so it may over-count «load», never under-count) to ask whether anything staged is still unloaded."""
    vcanon = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    rfc_index = company_rfc_index(conn, vcanon)

    # contract-level dedupe against what CompraNet already has
    have: dict[str, list[tuple[float, int]]] = {}
    for p, amt, v in conn.execute("""SELECT procedure_number, amount_mxn, vendor_id FROM contracts
            WHERE procedure_number IN (SELECT numero_procedimiento FROM comprasmx_contracts)"""):
        have.setdefault(p, []).append((amt or 0.0, vcanon.get(v, v)))

    cur = conn.execute("SELECT * FROM comprasmx_contracts")
    cur.row_factory = sqlite3.Row
    rows = cur.fetchall()
    plan = {"staged": len(rows), "skip_dup": 0, "skip_undated": 0, "reject_100b": 0, "load": 0, "flag_10b": 0,
            "new_vendor_rfcs": set(), "new_inst": set()}
    to_load = []
    for x in rows:
        rfc = (x["rfc"] or "").strip().upper()
        m, vid = res.get(rfc, ("new_badrfc", None))
        # review_rfc = the resolver saw the RFC but the names disagree: keep it apart for the analyst
        vid = vcanon.get(vid, vid) if m in EXISTING else (None if m == "review_rfc" else rfc_first(rfc_index, rfc))
        amt = x["amount_mxn"] or 0.0
        if any(abs(a2 - amt) <= 0.01 * amt + 1 or (vid and v2 == vid) for a2, v2 in have.get(x["numero_procedimiento"], ())):
            plan["skip_dup"] += 1
            continue
        if amt > MAX_CONTRACT_VALUE:
            plan["reject_100b"] += 1
            continue
        # no past date yet (only a future start): wait — a later weekly run loads it once dated;
        # a NULL contract_year breaks every by-year pass (atlas sky years, 2026-10-28)
        if _contract_date(x) is None:
            plan["skip_undated"] += 1
            continue
        plan["flag_10b"] += amt > FLAG_THRESHOLD
        if vid is None:
            plan["new_vendor_rfcs"].add(rfc)
        if x["institution_id"] is None:
            plan["new_inst"].add(x["clave_institucion"])
        plan["load"] += 1
        to_load.append((x, rfc, m, vid))

    return plan, to_load


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--i-mean-the-live-db", action="store_true")
    a = ap.parse_args()
    if Path(a.db).name == "RUBLI_NORMALIZED.db" and a.apply and not a.i_mean_the_live_db:
        sys.exit("refusing: run on a copy first (_comprasmx/integration/RUBLI_INTEGRATION.db)")
    conn = sqlite3.connect(a.db)
    conn.row_factory = sqlite3.Row
    canon = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical"))
    res = {r: (m, v) for r, m, v in conn.execute("SELECT rfc, method, vendor_id FROM comprasmx_vendor_resolution")}
    plan, to_load = plan_load(conn, res)
    rows = plan["staged"]
    print(f"staged {rows:,} → load {plan['load']:,} · skip (already in CompraNet) {plan['skip_dup']:,} · "
          f"wait (no past date) {plan['skip_undated']:,} · "
          f"reject >100B {plan['reject_100b']} · flag >10B {plan['flag_10b']}")
    print(f"new vendor rows {len(plan['new_vendor_rfcs']):,} · new institutions {len(plan['new_inst']):,}")
    print(f"amount to load {sum((x['amount_mxn'] or 0) for x, *_ in to_load) / 1e9:,.1f}B MXN")
    if not a.apply:
        return

    with conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS vendor_possible_same (vendor_id INTEGER, candidate_id INTEGER,
                        basis TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        new_vendor: dict[str, int] = {}
        new_inst: dict[str, int] = {}
        cols = None
        # contracts.id is a plain INT (table rebuilt via CREATE TABLE AS) with a NOT NULL
        # guard, not a rowid alias: continue the sequence explicitly.
        next_id = (conn.execute("SELECT MAX(id) FROM contracts").fetchone()[0] or 0) + 1
        inst_sector = dict(conn.execute("SELECT id, sector_id FROM institutions"))
        for x, rfc, m, vid in to_load:
            if vid is None:
                if rfc not in new_vendor:
                    person = shape(rfc) == "person" or bool(x["is_persona_fisica"])
                    cur = conn.execute("""INSERT INTO vendors (rfc, name, name_normalized, size_stratification, country_code,
                            is_individual, created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)""",
                        (rfc or None, x["proveedor"], normalize_vendor_name(x["proveedor"] or ""),
                         x["estratificacion"], x["pais"], 1 if person else 0))
                    new_vendor[rfc] = cur.lastrowid
                    if m == "probable_name" and res.get(rfc, (None, None))[1]:
                        conn.execute("INSERT INTO vendor_possible_same (vendor_id, candidate_id, basis) VALUES (?,?,?)",
                                     (cur.lastrowid, res[rfc][1], "exact name, no co-signal (ComprasMX)"))
                vid = new_vendor[rfc]
            inst = x["institution_id"]
            inst = canon.get(inst, inst) if inst is not None else None
            if inst is None:
                key = x["clave_institucion"]
                if key not in new_inst:
                    cur = conn.execute("""INSERT INTO institutions (name, siglas, sector_id, clave_institucion, tipo,
                            gobierno_nivel, created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)""",
                        (x["institucion"], x["siglas"], x["sector_id"], key, x["tipo_institucion"], x["orden_gobierno"]))
                    new_inst[key] = cur.lastrowid
                inst = new_inst[key]
            rec = {"id": next_id, **contract_record(dict(x), vid, inst)}
            # Sector the CompraNet way (ramo → partida → institution → title), then the
            # institution's RUBLI sector when that says «otros»: the staged sector put
            # 18% in 12 vs 0.7% for CompraNet 2025; this gives 1.3% (2026-10-20 check).
            sec = classify_contract(clave_ramo=x["clave_ramo"], partida_especifica=x["partida_especifica"],
                                    institution_name=x["institucion"], contract_title=x["titulo_contrato"],
                                    contract_description=x["descripcion_contrato"]).sector_id
            if sec == 12 and inst_sector.get(inst) not in (None, 12):
                sec = inst_sector[inst]
            rec["sector_id"] = sec
            next_id += 1
            if cols is None:
                cols = list(rec)
                sql = f"INSERT INTO contracts ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})"
            conn.execute(sql, [rec[c] for c in cols])
        # single bid = «un solo adjudicado»: ComprasMX, like CompraNet, lists winners only, never bidders
        # (docs/DIAG_COMPRASMX_SINGLE_BID_2026-11-09.md).
        # single bid: competitive procedure with exactly one vendor (data-validation.md), counted over
        # CompraNet AND ComprasMX rows of the procedure — an E-only count calls a procedure single-bid
        # when its other winner's contract was skipped as already in CompraNet (v0.10 plan §E3)
        conn.execute("""UPDATE contracts SET is_single_bid = CASE WHEN procedure_number IN (
              SELECT procedure_number FROM contracts WHERE is_direct_award = 0 AND procedure_number IN (
                SELECT procedure_number FROM contracts WHERE source_structure = 'E')
              GROUP BY procedure_number HAVING COUNT(DISTINCT vendor_id) = 1) THEN 1 ELSE 0 END
            WHERE source_structure = 'E' AND is_direct_award = 0""")
    print(f"applied: {plan['load']:,} contracts · {len(new_vendor):,} new vendors · {len(new_inst):,} new institutions")


if __name__ == "__main__":
    main()
