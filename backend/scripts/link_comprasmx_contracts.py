"""
link_comprasmx_contracts.py — link the ComprasMX staging rows (comprasmx_contracts) to the
legacy entities, so post-blackout contracts can join dossiers by id.

Writes ONLY new columns on comprasmx_contracts:
  institution_id / institution_match   canonical institution id; first unique hit of
                                       clave (institutions.clave_institucion) · gap (majority
                                       legacy_institution_id of the same procedure numbers in
                                       gap_contracts, ≥ 90 % agreement) · name · siglas
  vendor_id / vendor_match             canonical vendor id; company RFC (12 chars) == vendors.rfc,
                                       else link_entities.vendor_key name key (unique only).
                                       Persona física (13-char RFC) is never linked (PII policy,
                                       same as _comprasmx/link_entities.py).
  sector_id                            RAMO_TO_SECTOR on clave_ramo (12 otros when unmapped)
  category_id / category_source        classify_gap_categories.classify_row (regex + CUCOP partida)

Run from backend/:
    python -m scripts.link_comprasmx_contracts --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    python -m scripts.link_comprasmx_contracts --demo
"""
import argparse
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from scripts.classify_gap_categories import classify_row
from scripts.etl_classify import RAMO_TO_SECTOR

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "_comprasmx"))  # repo checkout (VPS container too)
sys.path.insert(0, str(Path("D:/Python/yangwenli/_comprasmx")))
from link_entities import norm_siglas, norm_text, vendor_key  # noqa: E402

NEW_COLS = [("institution_id", "INTEGER"), ("institution_match", "TEXT"), ("vendor_id", "INTEGER"),
            ("vendor_match", "TEXT"), ("sector_id", "INTEGER"), ("category_id", "INTEGER"),
            ("category_source", "TEXT")]


def unique(idx, key):
    ids = idx.get(key) if key else None
    return next(iter(ids)) if ids and len(ids) == 1 else None


def sector_for(clave_ramo):
    return RAMO_TO_SECTOR.get(str(clave_ramo).strip().zfill(2)) if clave_ramo else None


def link_institution(clave, siglas, name, by_clave, by_gap, by_name, by_sig):
    for basis, idx, key in (("clave", by_clave, (clave or "").upper()),
                            ("gap", by_gap, (clave or "").upper()),
                            ("name", by_name, norm_text(name)),
                            ("siglas", by_sig, norm_siglas(siglas))):
        hit = unique(idx, key)
        if hit:
            return hit, basis
    return None, None


def link_vendor(rfc, name, by_rfc, by_key):
    rfc = (rfc or "").strip().upper()
    if len(rfc) == 13:
        return None, "persona_fisica"
    hit = unique(by_rfc, rfc) if len(rfc) == 12 else None
    if hit:
        return hit, "rfc"
    vk = vendor_key(name)
    hit = unique(by_key, vk[0]) if vk else None
    if hit:
        return hit, "name"
    if vk and len(by_key.get(vk[0], ())) > 1:
        return None, "ambiguous"
    return None, None


def run(db_path, codes=None, quiet=False):
    """codes: link only these codigo_contrato values (daily pull); None = every row."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout = 600000")
    have = {r[1] for r in conn.execute("PRAGMA table_info(comprasmx_contracts)")}
    for col, decl in NEW_COLS:
        if col not in have:
            conn.execute(f"ALTER TABLE comprasmx_contracts ADD COLUMN {col} {decl}")
    conn.commit()
    t0 = time.time()

    canon_inst = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical"))
    by_clave, by_name, by_sig = defaultdict(set), defaultdict(set), defaultdict(set)
    for iid, clave, sig, name in conn.execute("SELECT id, clave_institucion, siglas, name FROM institutions"):
        cid = canon_inst.get(iid, iid)
        if clave:
            by_clave[clave.upper()].add(cid)
        if name:
            by_name[norm_text(name)].add(cid)
        if sig:
            by_sig[norm_siglas(sig)].add(cid)
    # gap bridge: ComprasMX clave → the institution the OCR corpus already resolved for the same procedures
    votes = defaultdict(Counter)
    for clave, iid in conn.execute("""SELECT x.clave_institucion, g.legacy_institution_id
            FROM comprasmx_contracts x JOIN gap_contracts g ON g.procedure_number = x.numero_procedimiento
            WHERE g.legacy_institution_id IS NOT NULL AND x.clave_institucion IS NOT NULL"""):
        votes[clave.upper()][iid] += 1
    by_gap = {k: {c.most_common(1)[0][0]} for k, c in votes.items()
              if c.most_common(1)[0][1] >= 0.9 * sum(c.values())}

    canon_v = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    by_rfc, by_key = defaultdict(set), defaultdict(set)
    for vid, rfc, name in conn.execute("SELECT id, rfc, name FROM vendors"):
        cid = canon_v.get(vid, vid)
        if rfc and len(rfc) == 12:
            by_rfc[rfc.upper()].add(cid)
        vk = vendor_key(name)
        if vk:
            by_key[vk[0]].add(cid)
    print(f"indexes built in {time.time() - t0:.0f}s (gap bridge keys {len(by_gap):,})")

    inst_cache, out = {}, []
    sel = """SELECT codigo_contrato, clave_institucion, siglas, institucion, clave_ramo, rfc, proveedor,
                   titulo_contrato, descripcion_contrato, partida_especifica FROM comprasmx_contracts"""
    if codes is None:
        rows = conn.execute(sel).fetchall()  # materialised: we commit while iterating
    else:
        codes = list(codes)
        rows = (r for i in range(0, len(codes), 500) for r in conn.execute(
            f"{sel} WHERE codigo_contrato IN ({','.join('?' * len(codes[i:i + 500]))})", codes[i:i + 500]))
    upd = """UPDATE comprasmx_contracts SET institution_id=?, institution_match=?, vendor_id=?,
        vendor_match=?, sector_id=?, category_id=?, category_source=? WHERE codigo_contrato=?"""
    n = 0
    for code, clave, sig, iname, ramo, rfc, prov, title, desc, partida in rows:
        k = (clave, sig, iname)
        if k not in inst_cache:
            inst_cache[k] = link_institution(clave, sig, iname, by_clave, by_gap, by_name, by_sig)
        iid, imatch = inst_cache[k]
        vid, vmatch = link_vendor(rfc, prov, by_rfc, by_key)
        sid = sector_for(ramo) or 12
        cat, csrc = classify_row(title, desc, sid, (partida or "").split(",")[0].strip() or None)
        out.append((iid, imatch, vid, vmatch, sid, cat, csrc, code))
        if len(out) >= 20_000:  # short transactions: the live app keeps reading
            conn.executemany(upd, out); conn.commit(); n += len(out); out = []
    conn.executemany(upd, out); n += len(out)
    for col in ("institution_id", "vendor_id", "category_id"):
        conn.execute(f"CREATE INDEX IF NOT EXISTS ix_cmx_{col} ON comprasmx_contracts({col})")
    conn.commit()
    print(f"linked {n:,} rows in {time.time() - t0:.0f}s")
    if quiet:
        conn.close()
        return
    q = lambda s: conn.execute(s).fetchall()
    print("institution", q("SELECT institution_match, COUNT(*), ROUND(SUM(amount_mxn)/1e9,1) FROM comprasmx_contracts GROUP BY 1 ORDER BY 2 DESC"))
    print("vendor", q("SELECT vendor_match, COUNT(*), ROUND(SUM(amount_mxn)/1e9,1) FROM comprasmx_contracts GROUP BY 1 ORDER BY 2 DESC"))
    print("category", q("SELECT category_source, COUNT(*) FROM comprasmx_contracts GROUP BY 1"), "unclassified",
          q("SELECT COUNT(*) FROM comprasmx_contracts WHERE category_id = 89"))
    print("APF unlinked buyers (top 10)", q("""SELECT siglas, institucion, COUNT(*) FROM comprasmx_contracts
        WHERE orden_gobierno='APF' AND institution_id IS NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10"""))
    conn.close()


def demo():
    by_rfc = {"AAA010101AAA": {7}}
    by_key = {vendor_key("ACME CONSTRUCTORA SA DE CV")[0]: {9}}
    assert link_vendor("AAA010101AAA", "X", by_rfc, by_key) == (7, "rfc")
    assert link_vendor("AAAA010101AAA", "ACME CONSTRUCTORA SA DE CV", by_rfc, by_key) == (None, "persona_fisica")
    assert link_vendor("", "ACME CONSTRUCTORA, S.A. DE C.V.", by_rfc, by_key) == (9, "name")
    bc = {"050GYR": {251}}
    assert link_institution("050gyr", "IMSS", "X", bc, {}, {}, {}) == (251, "clave")
    assert link_institution("ZZZ", "IMSS", "X", {}, {}, {}, {"IMSS": {251, 252}}) == (None, None)
    assert sector_for("9") == RAMO_TO_SECTOR.get("09")
    print("demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(ROOT / "RUBLI_NORMALIZED.db"))
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    demo() if a.demo else run(a.db)
