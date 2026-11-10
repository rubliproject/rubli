#!/usr/bin/env python3
"""
Cobertura CompraNet badge -- load SHCP Cuenta Publica and compute coverage
(proposals/coverage-badge.md; grading-v3 s.7 "Visibility").

Source: SHCP "Asignacion y Ejecucion del Presupuesto de Egresos de la Federacion"
(datos.gob.mx, one CSV per year, monthly rows in thousands of pesos, economic
classification, moments Original / Modificado / Comprometido / Devengado / Pagado).
Raw files live in D:/Python/yangwenli/_coverage/raw/<year>/ (sha256 in
_coverage/SOURCES.md). They are untrusted input: this script is stdlib-only so it
can run under `python -I`, and paths are passed as arguments.

Definition (beside the grade, never in it):
  coverage = CompraNet contract value 2018-2024 (valid amounts, <= 100B)
           / Pagado in "Otros gastos de operacion" (11100) + "Inversion fisica
             directa" (21100), same years.
  11100 + 21100 is the economic-classification analogue of capitulos
  2000 + 3000 + 5000 + 6000, which this dataset does not break out.
  Bands: alta >= 60%, parcial 20-60%, baja < 20%. Federal institutions only.

Matching CompraNet institutions (federal, graded in institution_grades_v3) to
budget entities is by name, with documented rules only (never fuzzy):
  exact      normalized names equal
  siglas     the budget name carries "(SIGLAS)" equal to the institution siglas
  secretaria "Secretaria de (la|el|las|los) X" <-> ramo row "X"
  alias      reviewed renames (SCT -> SICT, SFP -> Anticorrupcion, SAE -> INDEP, ...)
  renombre   ASIPONA X <- API X (2022 port-authority rename)
  familia    PEMEX subsidiaries -> the consolidated PEMEX row
Ramo rows (dependencias) include their organos desconcentrados, which buy under
their own CompraNet units, so a secretariat ratio is a LOWER BOUND
(is_lower_bound = 1). Unmatched or ambiguous institutions get no badge.

Writes NEW tables only: budget_ejercido_annual, budget_entity_institution_map,
institution_coverage_v1. Reads contracts (no writes).

    python -I backend/scripts/load_cuenta_publica.py --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db --raw-root D:/Python/yangwenli/_coverage/raw
"""
import argparse
import csv
import hashlib
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

YEARS = range(2018, 2025)
PROC_CONCEPTS = ("11100", "21100")
MOMENT = "Pagado"
MAX_AMT = 100_000_000_000
MIN_BUDGET_MXN = 1_000_000          # below this pooled base the ratio is noise
BANDS = ((0.60, "alta"), (0.20, "parcial"), (0.0, "baja"))
SOURCE_NOTE = ("SHCP, Asignacion y Ejecucion del PEF 2018-2024 (datos.gob.mx); "
               "Pagado en otros gastos de operacion + inversion fisica directa.")

# Ramo-level rows (ramos administrativos): include their desconcentrados.
DEPENDENCIAS = {
    "PRESIDENCIA DE LA REPUBLICA", "GOBERNACION", "RELACIONES EXTERIORES",
    "HACIENDA Y CREDITO PUBLICO", "DEFENSA NACIONAL", "AGRICULTURA Y DESARROLLO RURAL",
    "INFRAESTRUCTURA COMUNICACIONES Y TRANSPORTES", "ECONOMIA", "EDUCACION PUBLICA",
    "SALUD", "MARINA", "TRABAJO Y PREVISION SOCIAL", "DESARROLLO AGRARIO TERRITORIAL Y URBANO",
    "MEDIO AMBIENTE Y RECURSOS NATURALES", "PROCURADURIA GENERAL DE LA REPUBLICA",
    "ENERGIA", "BIENESTAR", "TURISMO", "ANTICORRUPCION Y BUEN GOBIERNO",
    "SEGURIDAD Y PROTECCION CIUDADANA", "CULTURA", "MUJERES",
}
# Reviewed renames: normalized CompraNet name -> normalized budget name.
ALIASES = {
    "SECRETARIA DE COMUNICACIONES Y TRANSPORTES": "INFRAESTRUCTURA COMUNICACIONES Y TRANSPORTES",
    "SECRETARIA DE INFRAESTRUCTURA COMUNICACIONES Y TRANSPORTES": "INFRAESTRUCTURA COMUNICACIONES Y TRANSPORTES",
    "SECRETARIA DE LA FUNCION PUBLICA": "ANTICORRUPCION Y BUEN GOBIERNO",
    "SECRETARIA DE DESARROLLO SOCIAL": "BIENESTAR",
    "SECRETARIA DE AGRICULTURA GANADERIA DESARROLLO RURAL PESCA Y ALIMENTACION": "AGRICULTURA Y DESARROLLO RURAL",
    "SECRETARIA DE SEGURIDAD PUBLICA": "SEGURIDAD Y PROTECCION CIUDADANA",
    "OFICINA DE LA PRESIDENCIA DE LA REPUBLICA": "PRESIDENCIA DE LA REPUBLICA",
    "SECRETARIA ANTICORRUPCION Y BUEN GOBIERNO": "ANTICORRUPCION Y BUEN GOBIERNO",
    # Renamed bodies (same legal entity, budget keeps one label across 2018-2024)
    "SERVICIO DE ADMINISTRACION Y ENAJENACION DE BIENES": "INSTITUTO PARA DEVOLVER AL PUEBLO LO ROBADO",
    "INSTITUTO NACIONAL DE LOS PUEBLOS INDIGENAS": "COMISION NACIONAL PARA EL DESARROLLO DE LOS PUEBLOS INDIGENAS",
    "FINANCIERA PARA EL BIENESTAR": "TELECOMUNICACIONES DE MEXICO",
    "POLICIA FEDERAL PREVENTIVA": "POLICIA FEDERAL",
    "COORDINACION NACIONAL DEL PROGRAMA DE DESARROLLO HUMANO OPORTUNIDADES":
        "COORDINACION NACIONAL DE PROSPERA PROGRAMA DE INCLUSION SOCIAL",
    "CONSEJO NACIONAL DE CIENCIA Y TECNOLOGIA": "CIENCIA HUMANIDADES TECNOLOGIA E INNOVACION",
    "CONSEJO NACIONAL DE HUMANIDADES CIENCIAS Y TECNOLOGIAS": "CIENCIA HUMANIDADES TECNOLOGIA E INNOVACION",
    "SECRETARIA DE CIENCIA HUMANIDADES TECNOLOGIA E INNOVACION": "CIENCIA HUMANIDADES TECNOLOGIA E INNOVACION",
    "APOYOS Y SERVICIOS A LA COMERCIALIZACION AGROPECUARIA":
        "AGENCIA DE SERVICIOS A LA COMERCIALIZACION Y DESARROLLO DE MERCADOS AGROPECUARIOS",
    "FINANCIERA RURAL": "FINANCIERA NACIONAL DE DESARROLLO AGROPECUARIO RURAL FORESTAL Y PESQUERO",
    "LOTERIA NACIONAL": "LOTERIA NACIONAL PARA LA ASISTENCIA PUBLICA",
    "INSTITUTO NACIONAL DE REHABILITACION LUIS GUILLERMO IBARRA IBARRA": "INSTITUTO NACIONAL DE REHABILITACION",
    "INSTITUTO NACIONAL DE PESCA Y ACUACULTURA":
        "INSTITUTO MEXICANO DE INVESTIGACION EN PESCA Y ACUACULTURA SUSTENTABLE",
    # Spelling / abbreviation differences between the two registries
    "BANCO NACIONAL DE OBRAS Y SERVICIOS PUBLICOS": "BANCO NACIONAL DE OBRAS Y SERVICIOS",
    "BANCO DEL BIENESTAR": "BANCO DEL BIENESTAR ANTES",
    "COMISION NACIONAL DE LIBROS DE TEXTO GRATUITOS": "COMISION NACIONAL DE LOS LIBROS DE TEXTO GRATUITOS",
    "CENTRO DE INVESTIGACION Y DE ESTUDIOS AVANZADOS DEL INSTITUTO POLITECNICO NACIONAL":
        "CENTRO DE INVESTIGACION Y ESTUDIOS AVANZADOS DEL IPN",
    "CENTRO NACIONAL PARA LA SALUD DE LA INFANCIA Y LA ADOLESCENCIA":
        "CENTRO NACIONAL PARA LA SALUD DE LA INFANCIA Y ADOLESCENCIA",
    "XE IPN CANAL 11": "CANAL 11 XE IPN",
    "PATRONATO DE OBRAS E INSTALACIONES DEL INSTITUTO POLITECNICO NACIONAL":
        "PATRONATO DE OBRAS E INSTALACIONES DEL IPN",
    "CENTRO DE INVESTIGACION Y DOCENCIA ECONOMICAS": "CENTRO DE INVESTIGACION Y DOCENCIA ECONOMICA",
    "EL COLEGIO DE LA FRONTERA NORTE": "EI COLEGIO DE LA FRONTERA NORTE",
    "EL COLEGIO DE LA FRONTERA SUR": "EI COLEGIO DE LA FRONTERA SUR",
}
# 2022 rename of the port authorities: ASIPONA X <- API X (same companies).
PORT_RENAME = ("ADMINISTRACION DEL SISTEMA PORTUARIO NACIONAL ", "ADMINISTRACION PORTUARIA INTEGRAL DE ")
SECRETARIA_PREFIXES = ("SECRETARIA DE LAS ", "SECRETARIA DE LOS ", "SECRETARIA DE LA ",
                       "SECRETARIA DEL ", "SECRETARIA DE ")
LEGAL_TAILS = (" S A DE C V", " S N C", " I B D", " S A", " A C", " S C")

SCHEMA = """
CREATE TABLE IF NOT EXISTS budget_ejercido_annual (
    year INTEGER NOT NULL, entity_name TEXT NOT NULL, entity_key TEXT NOT NULL,
    entity_code TEXT, concept_code TEXT NOT NULL, concept TEXT, moment TEXT NOT NULL,
    amount_mxn REAL NOT NULL, n_months INTEGER, source_file TEXT, source_sha256 TEXT,
    PRIMARY KEY (year, entity_key, concept_code, moment)
);
CREATE TABLE IF NOT EXISTS budget_entity_institution_map (
    institution_id INTEGER PRIMARY KEY, entity_key TEXT NOT NULL, entity_name TEXT NOT NULL,
    entity_kind TEXT NOT NULL, rule TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS institution_coverage_v1 (
    institution_id INTEGER PRIMARY KEY, status TEXT NOT NULL, entity_name TEXT,
    entity_kind TEXT, scope TEXT, is_lower_bound INTEGER, match_rule TEXT,
    group_size INTEGER, year_from INTEGER, year_to INTEGER, n_years INTEGER,
    compranet_value_mxn REAL, budget_pagado_mxn REAL, budget_comprometido_mxn REAL,
    ratio REAL, band TEXT, source_note TEXT, computed_at TEXT NOT NULL
);
"""


# ---------------------------------------------------------------- names
def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    s = "".join(ch if ch.isalnum() else " " for ch in s)
    s = " ".join(s.split())
    changed = True
    while changed:                       # chained forms: "S.N.C., I.B.D."
        changed = False
        for tail in LEGAL_TAILS:
            if s.endswith(tail):
                s, changed = s[: -len(tail)], True
    return s.strip()


def entity_parts(name):
    """(key, base, siglas): key = full normalized name; base = without the
    parenthetical; siglas = a single-token parenthetical such as (CFE)."""
    base_raw, sig = name, None
    if "(" in name and name.rstrip().endswith(")"):
        base_raw, inner = name.rsplit("(", 1)
        inner = inner.rstrip(") ").strip()
        token = _norm(inner).replace(" ", "")
        if token and len(token) <= 15 and token.isalnum() and " " not in inner.strip():
            sig = token                     # IMSS-BIENESTAR -> IMSSBIENESTAR
    return _norm(name), _norm(base_raw), sig


# ---------------------------------------------------------------- budget
def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_budget(raw_root):
    """Annual sums per (year, entity_key, concept_code, moment) from the monthly CSVs."""
    out = {}
    for year in YEARS:
        files = sorted((Path(raw_root) / str(year)).glob("*.csv"))
        if not files:
            continue
        path = files[0]
        digest = _sha256(path)
        with open(path, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                r = {k.replace("_de_", "_"): v for k, v in r.items()}   # 2019+ headers
                clave = r["clave_concepto"]
                name = r["ramo_o_entidad"].strip()
                key = entity_parts(name)[0]
                k = (year, key, clave[4:9], r["base_registro"])
                rec = out.get(k)
                if rec is None:
                    rec = out[k] = {"year": year, "entity_name": name, "entity_key": key,
                                    "entity_code": clave[:4], "concept_code": clave[4:9],
                                    "concept": r["concepto"], "moment": r["base_registro"],
                                    "amount_mxn": 0.0, "months": set(),
                                    "source_file": path.name, "source_sha256": digest}
                rec["amount_mxn"] += float(r["monto"] or 0) * 1000.0     # miles de pesos
                rec["months"].add(r["mes"])
    return list(out.values())


def entity_index(budget_rows):
    """entity_key -> {name, base, siglas, kind, pagado/comprometido by year}."""
    ents = {}
    for r in budget_rows:
        e = ents.get(r["entity_key"])
        if e is None:
            key, base, sig = entity_parts(r["entity_name"])
            e = ents[key] = {"key": key, "name": r["entity_name"], "base": base, "siglas": sig,
                             "kind": "dependencia" if base in DEPENDENCIAS else "entidad",
                             "pagado": defaultdict(float), "comprometido": defaultdict(float)}
        if r["concept_code"] in PROC_CONCEPTS:
            if r["moment"] == MOMENT:
                e["pagado"][r["year"]] += r["amount_mxn"]
            elif r["moment"] == "Comprometido":
                e["comprometido"][r["year"]] += r["amount_mxn"]
    return ents


# ---------------------------------------------------------------- matching
def match_institutions(insts, ents):
    """insts: list of (institution_id, name, siglas). Returns ({iid: (key, rule)}, {iid: reason})."""
    by_base = defaultdict(list)
    by_sig = defaultdict(list)
    for e in ents.values():
        by_base[e["base"]].append(e["key"])
        if e["siglas"]:
            by_sig[e["siglas"]].append(e["key"])
    pemex = [k for k in by_sig.get("PEMEX", [])]
    matched, failed = {}, {}
    for iid, name, siglas in insts:
        n = _norm(name)
        sig = _norm(siglas or "").replace(" ", "")
        rest = next((n[len(p):] for p in SECRETARIA_PREFIXES if n.startswith(p)), None)
        rules = [
            ("exact", by_base.get(n, [])),
            ("alias", by_base.get(ALIASES.get(n, ""), [])),
            ("renombre", by_base.get(n.replace(*PORT_RENAME), []) if n.startswith(PORT_RENAME[0]) else []),
            ("secretaria", [k for k in by_base.get(rest or "", []) if ents[k]["kind"] == "dependencia"]),
            ("siglas", by_sig.get(sig, []) if sig else []),
            ("familia", pemex if (n.startswith("PEMEX") or n.startswith("PETROLEOS MEXICANOS")) else []),
        ]
        for rule, cands in rules:
            cands = sorted(set(cands))
            if len(cands) == 1:
                matched[iid] = (cands[0], rule)
                break
            if len(cands) > 1:
                failed[iid] = "ambiguo"
                break
        else:
            failed[iid] = "sin_cotejo"
    return matched, failed


# ---------------------------------------------------------------- coverage
def compranet_by_year(conn):
    """{canonical institution_id: {year: value}} for 2018-2024, valid amounts only."""
    has_canon = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = ?",
                             ("institution_canonical",)).fetchone()[0]
    iid = "COALESCE(k.canonical_id, c.institution_id)" if has_canon else "c.institution_id"
    join = "LEFT JOIN institution_canonical k ON k.institution_id = c.institution_id" if has_canon else ""
    out = defaultdict(lambda: defaultdict(float))
    for i, y, v in conn.execute(f"""
            SELECT {iid}, c.contract_year, SUM(c.amount_mxn) FROM contracts c {join}
            WHERE c.contract_year BETWEEN ? AND ? AND c.amount_mxn > 0 AND c.amount_mxn <= ?
            GROUP BY 1, 2""", (min(YEARS), max(YEARS), MAX_AMT)):
        out[i][y] += v or 0.0
    return out


def band_for(ratio):
    return next(b for t, b in BANDS if ratio >= t)


def compute(conn, budget_rows):
    """Returns (map_rows, coverage_rows, report). Pure: writes nothing."""
    ents = entity_index(budget_rows)
    graded = conn.execute("""
        SELECT g.institution_id, i.name, i.siglas, g.level
        FROM institution_grades_v3 g JOIN institutions i ON i.id = g.institution_id
    """).fetchall()
    federal = [(i, n, s) for i, n, s, lvl in graded if lvl == "federal"]
    matched, failed = match_institutions(federal, ents)
    values = compranet_by_year(conn)
    groups = defaultdict(list)
    for iid, (key, _) in matched.items():
        groups[key].append(iid)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cov, maps = {}, []
    for key, members in groups.items():
        e = ents[key]
        years = [y for y in YEARS if e["pagado"].get(y, 0) > 0]
        pag = sum(e["pagado"][y] for y in years)
        com = sum(e["comprometido"].get(y, 0) for y in years)
        num = sum(values.get(i, {}).get(y, 0.0) for i in members for y in years)
        ok = pag >= MIN_BUDGET_MXN
        ratio = num / pag if ok else None
        dep = e["kind"] == "dependencia"
        for iid in members:
            rule = matched[iid][1]
            maps.append((iid, key, e["name"], e["kind"], rule))
            cov[iid] = {
                "institution_id": iid, "status": "ok" if ok else "sin_presupuesto",
                "entity_name": e["name"], "entity_kind": e["kind"],
                "scope": "ramo" if dep else ("familia" if len(members) > 1 else "entidad"),
                "is_lower_bound": int(dep), "match_rule": rule, "group_size": len(members),
                "year_from": min(years) if years else None, "year_to": max(years) if years else None,
                "n_years": len(years), "compranet_value_mxn": num, "budget_pagado_mxn": pag,
                "budget_comprometido_mxn": com, "ratio": ratio,
                "band": band_for(ratio) if ratio is not None else None,
                "source_note": SOURCE_NOTE, "computed_at": now}
    for iid, _n, _s, lvl in graded:
        if iid not in cov:
            status = failed.get(iid, "no_federal") if lvl == "federal" else "no_federal"
            cov[iid] = {"institution_id": iid, "status": status, "source_note": SOURCE_NOTE,
                        "computed_at": now}
    fed_ids = {i for i, _, _ in federal}
    fed_value = {i: sum(values.get(i, {}).values()) for i in fed_ids}
    report = {
        "budget_entities": len(ents), "federal_graded": len(federal),
        "matched": len(matched), "ambiguous": sum(1 for v in failed.values() if v == "ambiguo"),
        "unmatched": sum(1 for v in failed.values() if v == "sin_cotejo"),
        "matched_value_share": (sum(fed_value[i] for i in matched) / max(sum(fed_value.values()), 1)),
        "rules": dict(Counter(r for _, r in matched.values())),
        "bands": dict(Counter(c["band"] for c in cov.values() if c.get("band"))),
    }
    return maps, list(cov.values()), report


COV_COLS = ["institution_id", "status", "entity_name", "entity_kind", "scope", "is_lower_bound",
            "match_rule", "group_size", "year_from", "year_to", "n_years", "compranet_value_mxn",
            "budget_pagado_mxn", "budget_comprometido_mxn", "ratio", "band", "source_note",
            "computed_at"]
BUD_COLS = ["year", "entity_name", "entity_key", "entity_code", "concept_code", "concept",
            "moment", "amount_mxn", "n_months", "source_file", "source_sha256"]


def write(conn, budget_rows, maps, cov):
    """Touches only the three coverage tables, in one transaction."""
    conn.executescript(SCHEMA)
    try:
        conn.execute("BEGIN")
        for t in ("budget_ejercido_annual", "budget_entity_institution_map", "institution_coverage_v1"):
            conn.execute(f"DELETE FROM {t}")
        conn.executemany(
            f"INSERT INTO budget_ejercido_annual ({', '.join(BUD_COLS)}) VALUES ({', '.join('?' * len(BUD_COLS))})",
            ([r["year"], r["entity_name"], r["entity_key"], r["entity_code"], r["concept_code"],
              r["concept"], r["moment"], r["amount_mxn"], len(r["months"]), r["source_file"],
              r["source_sha256"]] for r in budget_rows))
        conn.executemany("INSERT INTO budget_entity_institution_map VALUES (?, ?, ?, ?, ?)", maps)
        conn.executemany(
            f"INSERT INTO institution_coverage_v1 ({', '.join(COV_COLS)}) VALUES ({', '.join('?' * len(COV_COLS))})",
            ([c.get(k) for k in COV_COLS] for c in cov))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def main(argv=None):
    ap = argparse.ArgumentParser(description="Load Cuenta Publica and compute CompraNet coverage")
    ap.add_argument("--db", required=True)
    ap.add_argument("--raw-root", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    conn = sqlite3.connect(args.db, timeout=60)
    if not conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = ?", ("institution_grades_v3",)).fetchone()[0]:
        sys.exit(f"institution_grades_v3 missing in {args.db} - compute grades v3 first")
    budget = read_budget(args.raw_root)
    if not budget:
        sys.exit(f"no budget CSVs under {args.raw_root}")
    maps, cov, report = compute(conn, budget)
    for k, v in report.items():
        print(f"{k}: {v}")
    if args.dry_run:
        return 0
    write(conn, budget, maps, cov)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"wrote budget_ejercido_annual ({len(budget)}), budget_entity_institution_map ({len(maps)}), "
          f"institution_coverage_v1 ({len(cov)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
