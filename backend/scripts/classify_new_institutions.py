"""Classify institutions that arrived without a type (new ComprasMX buyers) — dry run unless --write.

integrate_comprasmx.py creates one institution row per unseen clave_institucion with only a
name and a guessed sector; nothing classified them, so 288 sat in «otros» with no type or
federal flag until the 2026-10-27 audit (docs/INSTITUTION_CLASSIFICATION_AUDIT_2026-10-27.md § 1).
This runs the same rules on every row with institution_type IS NULL:
  1. hyperion.atlas rules (KNOWN / KEYWORD / SECRETARIAT / MUNICIPAL patterns)
  2. a second pass for ComprasMX name forms («SECRETARÍA DE SALUD (JAL)», bare place names)
  3. state/municipal level: a «(XX)» suffix or GE/GEM/GM level is never federal
  4. is_federal from _classify_federal.classify
and moves those institutions' contracts still in sector 12 to the new sector (the ETL's
institution fallback for rows without a ramo).

    python -m scripts.classify_new_institutions --db <DB> [--write]
"""
import argparse
import re
import sqlite3
import sys
import types
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
# hyperion/__init__ pulls rapidfuzz/unidecode (absent from the job image); the atlas rules need neither.
_h = types.ModuleType("hyperion"); _h.__path__ = [str(ROOT / "hyperion")]; sys.modules.setdefault("hyperion", _h)
sys.modules.setdefault("unidecode", types.SimpleNamespace(unidecode=lambda t: "".join(
    ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")))
from hyperion.atlas.rules import AtlasRuleClassifier  # noqa: E402
from hyperion.atlas.taxonomy import get_default_autonomy, get_size_tier  # noqa: E402
from classify_institutions import get_autonomy_id, get_size_tier_id, get_type_id, is_legally_decentralized  # noqa: E402
import _classify_federal as F  # noqa: E402

SUFFIX = re.compile(r"\(([A-Z]{2,5})\)\s*$")
ORG = re.compile(r"SECRETAR|INSTITUTO|SISTEMA|COMISI|CONSEJO|AUDITOR|\bRED\b|COLEGIO|AGENCIA|ORGANISMO|JUNTA|CENTRO|"
                 r"FIDEICOMISO|TRIBUNAL|FISCAL|UNIVERSIDAD|SERVICIOS|CONTRALOR|OFICIALIA|GOBIERNO|PROCURADUR|"
                 r"TESORER|PODER|CONGRESO|ADMINISTRACION|CAMINOS|HOSPITAL|DIRECCION|COORDINACION|PATRONATO|FONDO")
# Each mirrors how existing rows of the same kind are labelled (audit § 1).
NAME_RULES = [
    (r"DESARROLLO INTEGRAL DE LA FAMILIA", "state_agency", 1),
    (r"SECRETAR[IÍ]A DE EDUCACI|COLEGIO DE ", "state_agency", 2),
    (r"CULTURA|PATRIMONIO CULTURAL", "state_agency", 2),
    (r"SECRETAR[IÍ]A DE (HACIENDA|FINANZAS)", "state_agency", 7),
    (r"SECRETAR[IÍ]A DE GOBIERNO|SECRETARIADO EJECUTIVO|CONTRALOR|HONESTIDAD|AUDITOR[IÍ]A SUPERIOR|"
     r"B[UÚ]SQUEDA DE PERSONAS|CENTROS DE JUSTICIA", "state_agency", 8),
    (r"AGUA", "state_agency", 10),
]


def second_pass(name, niv, itype, sector):
    nm = (name or "").upper()
    for pat, t, sc in NAME_RULES:
        if re.search(pat, nm):
            return t, sc
    if (niv or "").upper() in ("GEM", "GM") and not ORG.search(nm):
        return "municipal", 3  # a bare place name is the municipality (existing convention: municipal → infra)
    if (niv or "").upper() in ("GE", "GEM", "GM") and itype == "other":
        return "state_agency", sector
    return itype, sector


def classify(conn):
    clf = AtlasRuleClassifier()
    rows = conn.execute("SELECT id, name, gobierno_nivel, institution_scope FROM institutions WHERE institution_type IS NULL").fetchall()
    stats = {i: (n, v) for i, n, v in conn.execute(
        "SELECT institution_id, COUNT(*), SUM(COALESCE(amount_mxn, 0)) FROM contracts WHERE institution_id IN "
        "(SELECT id FROM institutions WHERE institution_type IS NULL) GROUP BY 1")}
    out = []
    for iid, name, niv, scope in rows:
        r = clf.classify(name)
        itype, sector = r.institution_type, r.sector_id
        if sector == 12 or itype == "other":
            itype, sector = second_pass(name, niv, itype, sector)
        sub = bool(SUFFIX.search((name or "").upper())) or (niv or "").upper() in ("GE", "GEM", "GM")
        if sub and itype in ("federal_secretariat", "federal_agency", "social_security"):
            itype = "state_agency"
        fed, _ = F.classify(scope, niv, itype, name)
        fed = 0 if sub else fed
        n, v = stats.get(iid, (0, 0))
        out.append(dict(id=iid, name=name, type=itype, sector=sector, conf=r.confidence, rule=r.matched_rule or "",
                        fed=fed, n=n, v=v or 0, tier=get_size_tier(n).code, aut=get_default_autonomy(itype).code))
    return out


def write(conn, plan):
    stamp = "AUTO:"
    for p in plan:
        conn.execute("""UPDATE institutions SET sector_id=?, institution_type=?, institution_type_id=?, size_tier=?,
                        size_tier_id=?, autonomy_level=?, autonomy_level_id=?, is_legally_decentralized=?,
                        classification_confidence=?, classification_method=?, is_federal=?,
                        name_normalized=COALESCE(name_normalized, UPPER(name)), total_contracts=?, total_amount_mxn=?,
                        updated_at=CURRENT_TIMESTAMP WHERE id=? AND institution_type IS NULL""",
                     (p["sector"], p["type"], get_type_id(p["type"]), p["tier"], get_size_tier_id(p["tier"]), p["aut"],
                      get_autonomy_id(p["aut"]), is_legally_decentralized(p["type"]), p["conf"], (stamp + p["rule"])[:100],
                      p["fed"], p["n"], p["v"], p["id"]))
    ids = [p["id"] for p in plan if p["sector"] != 12]
    moved = 0
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        moved += conn.execute(f"""UPDATE contracts SET sector_id = (SELECT sector_id FROM institutions i WHERE i.id = contracts.institution_id)
            WHERE institution_id IN ({','.join('?' * len(chunk))}) AND ramo_id IS NULL AND sector_id = 12""", chunk).rowcount
    conn.commit()
    return moved


def demo():
    assert second_pass("TOLUCA", "GEM", "other", 12) == ("municipal", 3)
    assert second_pass("SECRETARÍA DE EDUCACIÓN (NL)", "GEM", "other", 12) == ("state_agency", 2)
    assert second_pass("CONTRALORÍA GENERAL", "GEM", "other", 12) == ("state_agency", 8)
    assert second_pass("CAMINOS BIENESTAR", "GEM", "other", 12) == ("state_agency", 12)
    print("demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo(); sys.exit(0)
    conn = sqlite3.connect(a.db if a.write else f"file:{a.db}?mode=ro", uri=not a.write, timeout=120)
    plan = classify(conn)
    from collections import Counter
    print(f"unclassified institutions: {len(plan)}", Counter(p["type"] for p in plan).most_common(),
          "still otros:", sum(p["sector"] == 12 for p in plan))
    if a.write and plan:
        print("contracts moved out of otros:", write(conn, plan))
