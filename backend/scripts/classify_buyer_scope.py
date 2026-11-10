"""
classify_buyer_scope.py — buyer scope on institution_canonical (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 0).

Adds three columns to institution_canonical and fills them:
  buyer_level        federal | estatal | municipal | otro   (autonomous -> federal)
  state_code         INEGI 2-digit, the government the buyer belongs to (estatal/municipal only)
  municipality_code  INEGI 5-digit CVEGEO (municipal only)

Source: the existing `level` / `state_inegi` / `municipality_inegi` (migrate_institutions.py,
built from the INEGI catalogue) + OVERRIDES below. When a state/municipal row has no INEGI
code, the name/siglas are parsed against backend/data/inegi_municipios.csv; no match -> NULL
(never guessed) and the row is listed. Every member of a canonical group takes its canonical
row's values, so scope never splits one buyer.

    python -m scripts.classify_buyer_scope --db PATH            # dry run (default): report only
    python -m scripts.classify_buyer_scope --db PATH --write    # write; idempotent
"""
import argparse
import csv
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "RUBLI_NORMALIZED.db"
CATALOGUE = HERE.parent / "data" / "inegi_municipios.csv"

LEVEL_MAP = {"federal": "federal", "autonomous": "federal", "state": "estatal",
             "municipal": "municipal"}
# Normalized-name prefix of the CANONICAL row -> (buyer_level, state_code).
# docs/INSTITUTION_SCOPE_2026-10-22.md § 1: the two federal port authorities tagged state,
# and the two «unknown» tecnológicas (state universities: Guanajuato, Oaxaca).
OVERRIDES = {
    "ADMINISTRACION PORTUARIA INTEGRAL DE BAJA CALIFORNIA SUR": ("federal", None),
    "ADMINISTRACION PORTUARIA INTEGRAL DE VERACRUZ": ("federal", None),
    "UNIVERSIDAD TECNOLOGICA DE LEON": ("estatal", "11"),
    "UNIVERSIDAD TECNOLOGICA DE LA MIXTECA": ("estatal", "20"),
    # spot-check of the grade level moves (2026-10-22): a CONACYT federal centre and a
    # TecNM federal campus tagged state; UNAQ is a Querétaro state body (its «QRO-» twin is state)
    "INSTITUTO POTOSINO DE INVESTIGACION CIENTIFICA Y TECNOLOGICA": ("federal", None),
    "INSTITUTO TECNOLOGICO EL LLANO": ("federal", None),
    "UNIVERSIDAD NACIONAL AERONAUTICA EN QUERETARO": ("estatal", "22"),
    # the Hermosillo water utility is a municipal paramunicipal body, tagged state
    "AGUA DE HERMOSILLO": ("municipal", "26", "26030"),
}
# siglas prefixes the data uses («Q ROO-», «OAX-», «TAMPS») -> INEGI
ABBR = {
    "AGS": "01", "BC": "02", "BCS": "03", "CAMP": "04", "COAH": "05", "COL": "06",
    "CHIS": "07", "CHIH": "08", "CDMX": "09", "DF": "09", "DGO": "10", "GTO": "11",
    "GRO": "12", "HGO": "13", "JAL": "14", "MEX": "15", "EDOMEX": "15", "MICH": "16",
    "MOR": "17", "NAY": "18", "NL": "19", "OAX": "20", "PUE": "21", "QRO": "22",
    "QROO": "23", "SLP": "24", "SIN": "25", "SON": "26", "TAB": "27", "TAMP": "28",
    "TAMPS": "28", "TLAX": "29", "VER": "30", "YUC": "31", "ZAC": "32",
}
MUNI_LEAD = re.compile(r"(?:MUNICIPIO|AYUNTAMIENTO(?: CONSTITUCIONAL)?|PRESIDENCIA MUNICIPAL"
                       r"|GOBIERNO MUNICIPAL) DE (.+)$")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s.upper())).strip()


def _catalogue():
    states, munis = {}, {}
    with open(CATALOGUE, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            states[r["cve_ent"]] = norm(r["nom_ent"])
            munis.setdefault(r["cve_ent"], []).append((norm(r["nom_mun"]), r["cvegeo"]))
    # short forms the names use; «MEXICO» alone is the country, so only «ESTADO DE MEXICO»
    names = {v.split(" DE ")[0] if k in ("05", "16", "30") else v: k for k, v in states.items()}
    names.pop("MEXICO")
    names["ESTADO DE MEXICO"] = "15"
    names["DISTRITO FEDERAL"] = "09"
    return names, munis


STATE_NAMES, MUNIS = _catalogue()


def parse_state(name, siglas):
    """INEGI state from a «XX-» prefix, the siglas, or a state name inside the text."""
    head = (name or "").split("-", 1)
    for cand in ([head[0]] if len(head) == 2 else []) + [siglas or ""]:
        code = ABBR.get(norm(cand).replace(" ", ""))
        if code:
            return code
    n = f" {norm(name)} "
    for sname in sorted(STATE_NAMES, key=len, reverse=True):
        if f" {sname} " in n:
            return STATE_NAMES[sname]
    return None


def parse_municipality(name, state_code):
    """INEGI CVEGEO for «Municipio / H. Ayuntamiento / Presidencia Municipal de X», X in that state."""
    m = MUNI_LEAD.search(norm(name))
    if not m or state_code not in MUNIS:
        return None
    cand = m.group(1) + " "
    hits = [(len(mn), code) for mn, code in MUNIS[state_code] if cand.startswith(mn + " ")]
    return max(hits)[1] if hits else None


def build_plan(conn):
    """One dict per institution id: buyer_level, state_code, municipality_code (+ name, basis)."""
    rows = conn.execute("""
        SELECT ic.institution_id, ic.canonical_id, ic.level, ic.state_inegi, ic.municipality_inegi,
               i.name, i.siglas
        FROM institution_canonical ic LEFT JOIN institutions i ON i.id = ic.institution_id
    """).fetchall()
    by_id = {r[0]: r for r in rows}
    out = []
    for iid, cid, *_ in rows:
        _, _, level, st, mu, name, siglas = by_id.get(cid, by_id[iid])
        bl, basis = LEVEL_MAP.get(level, "otro"), "level"
        nn = norm(name)
        for prefix, (o_level, o_state, *o_mun) in OVERRIDES.items():
            if nn.startswith(prefix):
                bl, st, basis = o_level, o_state, "override"
                mu = o_mun[0] if o_mun else mu
        if bl in ("estatal", "municipal"):
            if not st:
                st, basis = parse_state(name, siglas), "name_parse"
            if bl == "municipal" and not mu:
                mu = parse_municipality(name, st)
                basis = "name_parse" if mu else basis
        else:
            st = None
        out.append({"institution_id": iid, "canonical_id": cid, "buyer_level": bl,
                    "state_code": st, "municipality_code": mu if bl == "municipal" else None,
                    "name": name, "basis": basis})
    return out


def apply(conn, plan):
    """Add the columns if missing and write changed rows; returns rows changed."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(institution_canonical)")}
    for col in ("buyer_level", "state_code", "municipality_code"):
        if col not in cols:
            conn.execute(f"ALTER TABLE institution_canonical ADD COLUMN {col} TEXT")
    cur = {r[0]: r[1:] for r in conn.execute(
        "SELECT institution_id, buyer_level, state_code, municipality_code FROM institution_canonical")}
    todo = [(p["buyer_level"], p["state_code"], p["municipality_code"], p["institution_id"])
            for p in plan
            if cur[p["institution_id"]] != (p["buyer_level"], p["state_code"], p["municipality_code"])]
    for i in range(0, len(todo), 500):  # short write transactions (shared disk)
        conn.executemany("UPDATE institution_canonical SET buyer_level = ?, state_code = ?, "
                         "municipality_code = ? WHERE institution_id = ?", todo[i:i + 500])
        conn.commit()
    conn.execute("CREATE INDEX IF NOT EXISTS idx_inst_canonical_scope "
                 "ON institution_canonical(buyer_level, state_code)")
    conn.commit()
    return len(todo)


def report(conn, plan):
    canon = [p for p in plan if p["institution_id"] == p["canonical_id"]]
    money = dict(conn.execute("SELECT institution_id, total_value_mxn FROM institution_stats"))
    print(f"{len(plan)} ids, {len(canon)} canonical buyers")
    for lvl in ("federal", "estatal", "municipal", "otro"):
        g = [p for p in canon if p["buyer_level"] == lvl]
        v = sum(money.get(p["institution_id"]) or 0 for p in g)
        print(f"  {lvl:9} {len(g):5} buyers  {v / 1e12:6.2f} T MXN")
    loc = [p for p in canon if p["buyer_level"] in ("estatal", "municipal")]
    tot = sum(money.get(p["institution_id"]) or 0 for p in loc) or 1
    with_st = sum(money.get(p["institution_id"]) or 0 for p in loc if p["state_code"])
    mun = [p for p in loc if p["buyer_level"] == "municipal"]
    mtot = sum(money.get(p["institution_id"]) or 0 for p in mun) or 1
    with_mu = sum(money.get(p["institution_id"]) or 0 for p in mun if p["municipality_code"])
    print(f"  state_code coverage: {100 * with_st / tot:.2f}% of state+municipal money "
          f"({sum(1 for p in loc if p['state_code'])}/{len(loc)} buyers)")
    print(f"  municipality_code coverage: {100 * with_mu / mtot:.2f}% of municipal money "
          f"({sum(1 for p in mun if p['municipality_code'])}/{len(mun)} buyers)")
    for p in canon:
        if p["basis"] == "override":
            print(f"  override  {p['institution_id']:5} -> {p['buyer_level']:9} {p['name']}")
    for p in loc:
        if not p["state_code"] or (p["buyer_level"] == "municipal" and not p["municipality_code"]):
            print(f"  unmatched {p['institution_id']:5} {p['buyer_level']:9} st={p['state_code']} "
                  f"{(money.get(p['institution_id']) or 0) / 1e6:9.1f}M  {p['name']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)
    conn = sqlite3.connect(args.db, timeout=600)
    conn.execute("PRAGMA busy_timeout = 600000")
    plan = build_plan(conn)
    report(conn, plan)
    if args.write:
        print(f"wrote {apply(conn, plan)} rows")
    else:
        print("dry run: nothing written (pass --write)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
