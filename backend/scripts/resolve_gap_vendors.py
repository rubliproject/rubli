"""Resolve the OCR'd `gap_contracts.vendor` strings into a display name + canonical
vendor id (docs: historia brief § W4 · recon-gap.md § 2 resolution ladder).

Writes a NEW table `gap_vendor_resolution` (built into a temp table, then swapped).
Never ALTERs or UPDATEs `gap_contracts` or any existing table. Idempotent.

Ladder per row, first hit wins:
  self_buyer   vendor_match='self_buyer' (the oficio named the BUYER)       → name NULL
  canonical    legacy_vendor_id, else company RFC → vendor_rfc_quality.best_rfc → vendors
  rfc_sibling  same company RFC on another gap row with a better (spaced) spelling
  illegible    junk filter: lowercase prose / boilerplate keywords / too short
  segmented    strip lead number + REPRESENTANTE LEGAL DE + legal form → Viterbi → re-append form
  raw          already spaced (same strip/normalise, no segmentation)
  rfc_only     no name string; company RFC shown, persona física stays NULL (masked)

    python -m scripts.resolve_gap_vendors [--db PATH] [--samples N]
"""
import argparse
import math
import random
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "RUBLI_NORMALIZED.db"

LEAD_NUM = re.compile(r"^\s*\d+\s*[-.)]+[-.\s]*")  # '653-ACEITES', '1.-CAMINOS', '44 - DICONSA'
REP_LEGAL = re.compile(r"^\s*(?:(?:EL|LA)?\s*REPRESENTANTE\s*LEGAL|ADMINISTRADOR\s*UNICO|ESTATUTOS\s*SOCIALES)\s*DE\s*(?:LA\s*EMPRESA\s*)?", re.I)
_P = r"[.\s]*"  # OCR drops/keeps dots and spaces at random inside the legal form
# Long forms are unambiguous even glued to the name ("ESTAFETAMEXICANAS.A.DEC.V").
LEGAL_LONG = re.compile(
    rf"[,.\s]*(?:S{_P}A{_P}(?:P{_P}I|B|S){_P}(?:DE{_P})?C{_P}V"
    rf"|S{_P}A{_P}(?:DE{_P})?C{_P}V"
    rf"|S{_P}(?:C{_P}|P{_P}R{_P})?DE{_P}R{_P}L{_P}(?:(?:DE{_P})?C{_P}V|M{_P}I)?"
    rf")[.\s]*$", re.I)
# Short forms need a separator before them or a dot inside, or "PRENSA" would lose its "SA".
LEGAL_SHORT = re.compile(
    rf"(?:[,.\s]+(?:S{_P}A{_P}S|S{_P}C{_P}P|S{_P}A|S{_P}C|A{_P}C)|S\.{_P}A|S\.{_P}C|A\.{_P}C)[.\s]*$", re.I)
LEGAL_CANON = {
    "SADECV": "S.A. de C.V.", "SACV": "S.A. de C.V.", "SAPIDECV": "S.A.P.I. de C.V.", "SAPICV": "S.A.P.I. de C.V.",
    "SABDECV": "S.A.B. de C.V.", "SASDECV": "S.A.S. de C.V.", "SDERLDECV": "S. de R.L. de C.V.",
    "SDERLCV": "S. de R.L. de C.V.", "SDERL": "S. de R.L.", "SDERLMI": "S. de R.L. M.I.",
    "SCDERLDECV": "S.C. de R.L. de C.V.", "SCDERL": "S.C. de R.L.", "SPRDERL": "S.P.R. de R.L.",
    "SPRDERLDECV": "S.P.R. de R.L. de C.V.", "SA": "S.A.", "SC": "S.C.", "AC": "A.C.", "SAS": "S.A.S.", "SCP": "S.C.P.",
}
JUNK_WORDS = ("CONTRATO", "MONTO", "IMPORTE", "PROVEEDOR", "LICITANTE", "ADJUDICA", "PRESENTE",
              "SIGUIENTE", "PARTIDA", "RAZONES", "TESORERIA", "GARANTIZAR", "VIGENCIA")
COMPANY_RFC = re.compile(r"^[A-Z&]{3}\d{6}[A-Z0-9]{3}$")
SINGLE_OK = {"Y", "A", "E", "O", "U"}


def norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()


def strip_legal(s: str):
    """Return (core, canonical legal form or None). `s` is already norm()'d."""
    for rx in (LEGAL_LONG, LEGAL_SHORT):
        m = rx.search(s)
        if m:
            key = re.sub(r"[^A-Z]", "", m.group(0))
            return s[: m.start()].rstrip(" ,."), LEGAL_CANON.get(key, m.group(0).strip(" ,."))
    return s.rstrip(" ,."), None


def clean(raw: str):
    """Strip list number, 'REPRESENTANTE LEGAL DE', legal form → (core, legal_form)."""
    s = REP_LEGAL.sub("", LEAD_NUM.sub("", norm(raw).strip()))
    return strip_legal(s.strip(" ,."))


def is_junk(raw: str) -> bool:
    if re.search(r"[a-z]", raw or ""):  # OCR prose fragments keep their lowercase
        return True
    core, legal = clean(raw)
    flat = re.sub(r"[^A-Z0-9]", "", core)
    if not re.search(r"[A-Z]{2}", flat):  # '2026 S.A. de C.V.': no name at all
        return True
    if legal:
        return len(flat) < 2
    return len(flat) < 6 or any(w in flat for w in JUNK_WORDS)


class Segmenter:
    """Viterbi word segmentation over unigram log-probs from the legacy vendor names."""

    def __init__(self, vocab: Counter):
        self.vocab, self.total = vocab, sum(vocab.values()) or 1

    def _score(self, w: str) -> float:
        f = self.vocab.get(w)
        if f and (len(w) > 1 or w in SINGLE_OK):
            return math.log(f / self.total) - 3.0  # per-word penalty: prefer fewer words
        if len(w) <= 4:
            return -23.0  # short unknown chunk kept whole (recon § 2: INME → "INM E")
        return -12.0 * len(w)

    def segment(self, token: str) -> str:
        s = re.sub(r"[^A-Z0-9]", "", token)
        n = len(s)
        if n <= 8 or s in self.vocab:
            return s
        best = [(-1e18, 0)] * (n + 1)
        best[0] = (0.0, 0)
        for i in range(1, n + 1):
            for j in range(max(0, i - 25), i):
                cand = best[j][0] + self._score(s[j:i])
                if cand > best[i][0]:
                    best[i] = (cand, j)
        out, i = [], n
        while i > 0:
            j = best[i][1]
            out.append(s[j:i])
            i = j
        return " ".join(reversed(out))

    def resolve(self, raw: str):
        """→ (display name, 'segmented'|'raw')."""
        core, legal = clean(raw)
        tokens = [t for t in re.split(r"[\s,]+", core) if t]
        segs = [self.segment(t) for t in tokens]
        name = " ".join(x for x in segs if x)
        if legal:
            name = f"{name} {legal}".strip()
        changed = any(" " in x for x in segs)
        return name, ("segmented" if changed else "raw")


def build(db: sqlite3.Connection, seg: Segmenter):
    # company RFC → best canonical vendor (vendor_rfc_quality grades; pick the busiest id on ties)
    rfc_vendor = {}
    for rfc, vid, name in db.execute("""
        SELECT q.best_rfc, v.id, v.name FROM vendor_rfc_quality q JOIN vendors v ON v.id=q.vendor_id
        WHERE length(q.best_rfc)=12 ORDER BY COALESCE(v.total_contracts,0)"""):
        rfc_vendor[rfc] = (vid, name)
    # the deploy DB scrubs vendor_rfc_quality.best_rfc; vendors.rfc still carries company RFCs
    for rfc, vid, name in db.execute("""
        SELECT rfc, id, name FROM vendors WHERE length(rfc)=12 ORDER BY COALESCE(total_contracts,0)"""):
        rfc_vendor.setdefault(rfc, (vid, name))
    vname = dict(db.execute("SELECT id, name FROM vendors WHERE id IN (SELECT legacy_vendor_id FROM gap_contracts)"))
    rows = db.execute("""SELECT uuid_procedimiento, vendor, vendor_rfc, legacy_vendor_id, vendor_match
                         FROM gap_contracts WHERE vendor IS NOT NULL OR vendor_rfc IS NOT NULL""").fetchall()
    # best spelling per company RFC among gap rows (not junk, most spaces, then longest)
    by_rfc = defaultdict(list)
    for _, vendor, rfc, _, _ in rows:
        if vendor and rfc and COMPANY_RFC.match(rfc) and not is_junk(vendor):
            by_rfc[rfc].append(clean(vendor)[0])
    best_spelling = {r: max(c, key=lambda s: (s.count(" "), len(s))) for r, c in by_rfc.items()}

    out = []
    for uuid, vendor, rfc, legacy_id, match in rows:
        company = rfc if rfc and COMPANY_RFC.match(rfc) else None
        if match == "self_buyer":
            out.append((uuid, None, "self_buyer", None, vendor))
        elif legacy_id and legacy_id in vname:
            out.append((uuid, vname[legacy_id], "canonical", legacy_id, vendor))
        elif company and company in rfc_vendor:
            out.append((uuid, rfc_vendor[company][1], "canonical", rfc_vendor[company][0], vendor))
        elif not vendor:
            out.append((uuid, company, "rfc_only", None, None))
        elif company and best_spelling.get(company) and best_spelling[company] != clean(vendor)[0] \
                and " " in best_spelling[company]:
            name, _ = seg.resolve(best_spelling[company] + (" " + clean(vendor)[1] if clean(vendor)[1] else ""))
            out.append((uuid, name, "rfc_sibling", None, vendor))
        elif is_junk(vendor):
            out.append((uuid, None, "illegible", None, vendor))
        else:
            name, src = seg.resolve(vendor)
            out.append((uuid, name, src, None, vendor))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--samples", type=int, default=40)
    a = ap.parse_args()
    db = sqlite3.connect(a.db)
    vocab = Counter()
    for (n,) in db.execute("SELECT name FROM vendors WHERE name IS NOT NULL"):
        vocab.update(re.findall(r"[A-Z0-9]+", norm(n)))
    # rare long tokens are glued names in the legacy corpus ('LABORATORIOSPISA'), not words
    vocab = Counter({w: f for w, f in vocab.items() if len(w) <= 12 or f >= 5})
    out = build(db, Segmenter(vocab))
    db.execute("BEGIN")
    db.execute("DROP TABLE IF EXISTS gap_vendor_resolution_new")
    db.execute("""CREATE TABLE gap_vendor_resolution_new(
        uuid_procedimiento TEXT PRIMARY KEY, name TEXT, source TEXT, vendor_id INTEGER, raw TEXT)""")
    db.executemany("INSERT INTO gap_vendor_resolution_new VALUES (?,?,?,?,?)", out)
    db.execute("DROP TABLE IF EXISTS gap_vendor_resolution")
    db.execute("ALTER TABLE gap_vendor_resolution_new RENAME TO gap_vendor_resolution")
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"rows {len(out)}  sources {Counter(r[2] for r in out).most_common()}")
    random.seed(7)
    for uuid, name, src, vid, raw in random.sample([r for r in out if r[4]], a.samples):
        print(f"| {src:<11} | `{raw[:60]}` | {name or '—'} |")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
