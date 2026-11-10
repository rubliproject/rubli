"""Resolve ComprasMX open-data suppliers to RUBLI vendors — RFC-first, no fuzzy.

Method (evidence: _entity_res/method/FINDINGS_method.md, 2026-09-24): fuzzy name
matching on RFC-era data scores 19–43% precision, so keys are exact only.
One decision per distinct supplier RFC in comprasmx_contracts:

  rfc            RFC equals a vendor's rfc or its grade-A recovered best_rfc;
                 all hits collapse to one canonical vendor (vendor_canonical)
  review_rfc     RFC hits >1 canonical vendor → analyst
  name_loose     company, RFC unknown to us: loose name key (letters+digits,
                 corrupted Ñ → N) hits exactly one canonical persona-moral vendor
                 that carries no DIFFERENT grade-A RFC
                 AND shares a buyer institution or sector with it (co-signal)
  probable_name  same, but no co-signal: NOT merged — new vendor row that keeps
                 the candidate as a link (47% of name hits lack one; homonym risk)
  review_name    loose key hits >1 canonical vendor → analyst
  new_company    company, RFC unknown, no name hit → new vendor row
  new_person     persona física, RFC unknown → new vendor row (never name-merged)
  new_badrfc     malformed RFC and no unique name hit → new vendor row

Read-only. Writes a CSV report (RFC of personas físicas masked) and, with
--apply, the table comprasmx_vendor_resolution only.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DB = os.environ.get("DATABASE_PATH") or str(Path(__file__).resolve().parents[1] / "RUBLI_NORMALIZED.db")
CO = re.compile(r"^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$")
PF = re.compile(r"^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$")
# A company / government name — kept in the name index even when the vendor row
# is wrongly flagged is_individual=1 (1,343 such rows; judge round 1, pattern 1).
ORG_NAME = re.compile(r"\b(SA|SC|SCP|SAS|AC|SAPI|SOFOM|SPR|SRL|S DE RL|SA DE CV|MUNICIPIO|INSTITUTO|UNIVERSIDAD|GOBIERNO|COMISION|CORPORATION|CORP|INC|LLC|LTD|GMBH|LIMITED)\b")
# Bodies whose RFC predates RUBLI's data or whose date is a re-registration (judge round 2).
PUBLIC_BODY = re.compile(r"\b(UNIVERSIDAD|INSTITUTO|MUNICIPIO|GOBIERNO|SECRETARIA|COMISION|ESTADO|EDITORA)\b")


def rfc_year(rfc: str) -> tuple[int | None, bool]:
    """Incorporation year embedded in an RFC (YY <= 26 → 20YY) and whether it is
    unusable (foreign EXT… pseudo-RFC or malformed). The 1923/2023 century clash
    only bites century-old public bodies — PUBLIC_BODY exempts them."""
    k = shape(rfc)
    if k == "bad" or rfc.startswith("EXT"):
        return None, True
    yy = int(rfc[3:5] if k == "company" else rfc[4:6])
    return (2000 + yy if yy <= 26 else 1900 + yy), False


def loose_key(name: str | None) -> str:
    """Letters+digits only, accents folded, the U+FFFD that replaced Ñ in both
    CompraNet and ComprasMX files read as N — so «COMPA�IA» == «COMPAÑIA»."""
    if not name:
        return ""
    s = name.upper().replace("�", "N").replace("Ñ", "N")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]", "", s)


def shape(rfc: str | None) -> str:
    if rfc and CO.match(rfc):
        return "company"
    if rfc and PF.match(rfc):
        return "person"
    return "bad"


def _pick(cands, activity):
    """Our own split vendor rows (judge round 1: 49/51 RFC reviews): the row active
    most recently, then the one with most contracts. activity(v) → (last_year, n)."""
    return max(cands, key=lambda v: activity(v))


def resolve(suppliers, rfc_index, name_index, canon, vendor_best_rfc,
            cosignal=lambda rfc, vid: True, rfc_ok=lambda vid, rfc: True,
            activity=lambda vid: (0, 0), name_sim=lambda name, vid: 1.0,
            predates_rfc=lambda rfc, vid: False, buyer_cosignal=None):
    """suppliers: [(rfc, name, is_pf_flag)] → {rfc: (method, vendor_id|None, n_candidates)}

    Round 2 rules (.claude/reviews/comprasmx-2026-10-20/judge-round-1.md):
      rfc_ok    drops a candidate whose own RFC contradicts this one (CAF, Provectus)
      split     >1 canonical vendor on the same evidence = our duplicate rows → _pick
      weak RFC  name similarity < .5 with no co-signal → review_rfc (rests on the RFC alone)
    """
    # a weak RFC hit needs a buyer/sector co-signal; the RFC-date co-signal only
    # supports NAME matches (it says nothing about a mistyped RFC)
    buyer_cosignal = buyer_cosignal or cosignal
    out = {}
    for rfc, name, is_pf in suppliers:
        kind = shape(rfc)
        raw = rfc_index.get(rfc, ()) if kind != "bad" else ()
        hits = {canon.get(v, v) for v in raw if rfc_ok(v, rfc)}
        if hits:
            v = next(iter(hits)) if len(hits) == 1 else _pick(hits, activity)
            if name_sim(name, v) < 0.5 and not buyer_cosignal(rfc, v):
                out[rfc] = ("review_rfc", None, len(hits))
            else:
                out[rfc] = ("rfc" if len(hits) == 1 else "rfc_split", v, len(hits))
            continue
        if kind == "person" or is_pf:
            out[rfc] = ("new_person", None, 0)
            continue
        cands = {canon.get(v, v) for v in name_index.get(loose_key(name), ())}
        # a vendor already holding a different grade-A RFC is a different taxpayer
        cands = {v for v in cands if not (kind == "company" and vendor_best_rfc.get(v) not in (None, rfc))}
        if cands:
            v = next(iter(cands)) if len(cands) == 1 else _pick(cands, activity)
            if predates_rfc(rfc, v):
                # the vendor was contracting before this RFC existed: a different,
                # older firm with the same (often generic) name (judge round 2)
                out[rfc] = ("review_name", v, len(cands))
            elif not cosignal(rfc, v):
                out[rfc] = ("probable_name", v, len(cands))
            else:
                out[rfc] = ("name_loose" if len(cands) == 1 else "name_split", v, len(cands))
        else:
            out[rfc] = ("new_company" if kind == "company" else "new_badrfc", None, 0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=DB)
    ap.add_argument("--out", default=str(Path(DB).resolve().parents[1] / "_comprasmx" / "resolution"))
    ap.add_argument("--apply", action="store_true", help="write comprasmx_vendor_resolution")
    a = ap.parse_args()
    ro = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)

    sup = ro.execute("""SELECT UPPER(TRIM(rfc)), MAX(proveedor), MAX(is_persona_fisica), COUNT(*), SUM(amount_mxn)
                        FROM comprasmx_contracts GROUP BY 1""").fetchall()
    canon = dict(ro.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    rfc_index: dict[str, set[int]] = defaultdict(set)
    for vid, r in ro.execute("SELECT id, UPPER(TRIM(rfc)) FROM vendors WHERE rfc IS NOT NULL AND rfc <> ''"):
        rfc_index[r].add(vid)
    best: dict[int, str] = {}
    for vid, r in ro.execute("SELECT vendor_id, UPPER(TRIM(best_rfc)) FROM vendor_rfc_quality WHERE best_rfc_grade = 'A'"):
        rfc_index[r].add(vid)
        best[canon.get(vid, vid)] = r
    name_index: dict[str, set[int]] = defaultdict(set)
    vname: dict[int, str] = {}
    for vid, name, ind in ro.execute("SELECT id, name, COALESCE(is_individual, 0) FROM vendors"):
        vname[vid] = name or ""
        k = loose_key(name)
        if len(k) >= 6 and (not ind or ORG_NAME.search(re.sub(r"[.,]", "", (name or "").upper()))):
            name_index[k].add(vid)

    # A raw vendor RFC contradicted by the vendor's own grade-A RFC, or a sub-A RFC
    # dated after the vendor's first contract, is not evidence (CAF 28815, Provectus 165033).
    own_a: dict[int, str] = {}
    weak_dated: set[int] = set()
    for vid, b, g, dg, conflict in ro.execute(
            "SELECT vendor_id, UPPER(TRIM(best_rfc)), best_rfc_grade, db_rfc_grade, rfc_date_conflict FROM vendor_rfc_quality"):
        if g == "A" and b:
            own_a[vid] = b
        if dg != "A" and conflict:
            weak_dated.add(vid)

    def rfc_ok(vid: int, rfc: str) -> bool:
        return own_a.get(vid, rfc) == rfc and vid not in weak_dated

    stats_by_v = {v: (ly or 0, n or 0) for v, ly, n in ro.execute(
        "SELECT vendor_id, last_contract_year, total_contracts FROM vendor_stats")}

    def activity(vid: int):
        return stats_by_v.get(vid, (0, 0))

    def name_sim(name: str, vid: int) -> float:
        from difflib import SequenceMatcher
        return SequenceMatcher(None, loose_key(name), loose_key(vname.get(vid, ""))).ratio()

    # co-signal for name hits: the vendor (any id folded into its canonical) has sold
    # to one of this supplier's institutions or in one of its sectors before.
    sup_inst: dict[str, set] = defaultdict(set)
    sup_sec: dict[str, set] = defaultdict(set)
    inst_sector = dict(ro.execute("SELECT id, sector_id FROM institutions"))
    for r, i in ro.execute("SELECT DISTINCT UPPER(TRIM(rfc)), institution_id FROM comprasmx_contracts"):
        sup_inst[r].add(i)
        # ComprasMX files many buyers under 12 «otros»; RUBLI's own institution sector is
        # the evidence, and 12 is never evidence (judge round 2, pattern 1)
        if inst_sector.get(i) not in (None, 12):
            sup_sec[r].add(inst_sector[i])
    first_year = {v: fy for v, fy in ro.execute("SELECT vendor_id, first_contract_year FROM vendor_stats")}
    members: dict[int, list[int]] = defaultdict(list)
    for v, cid in canon.items():
        members[cid].append(v)

    def buyer_cosignal(rfc: str, vid: int) -> bool:
        ids = members.get(vid, []) + [vid]
        ph = ",".join("?" * len(ids))
        seen = ro.execute(f"SELECT DISTINCT institution_id, sector_id FROM contracts WHERE vendor_id IN ({ph})", ids).fetchall()
        return any(i in sup_inst[rfc] or (s != 12 and s in sup_sec[rfc]) for i, s in seen)

    def cosignal(rfc: str, vid: int) -> bool:
        if buyer_cosignal(rfc, vid):
            return True
        ids = members.get(vid, []) + [vid]
        y, _ = rfc_year(rfc)  # incorporated no later than the vendor's first contract
        fy = min((first_year.get(m) or 9999 for m in ids), default=9999)
        return y is not None and y <= fy

    def predates_rfc(rfc: str, vid: int) -> bool:
        y, ambiguous = rfc_year(rfc)
        if y is None or ambiguous or PUBLIC_BODY.search(vname.get(vid, "").upper()):
            return False
        ids = members.get(vid, []) + [vid]
        ph = ",".join("?" * len(ids))
        before, total = ro.execute(f"""SELECT SUM(contract_year < ?), COUNT(*) FROM contracts
                                       WHERE vendor_id IN ({ph})""", [y, *ids]).fetchone()
        return (before or 0) >= 5 and (before or 0) >= 0.2 * (total or 1)

    res = resolve([(r or "", n, pf) for r, n, pf, _, _ in sup], rfc_index, name_index, canon, best,
                  cosignal, rfc_ok, activity, name_sim, predates_rfc, buyer_cosignal)
    stats, money = Counter(), Counter()
    Path(a.out).mkdir(parents=True, exist_ok=True)
    with open(Path(a.out) / "resolution.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rfc", "supplier_name", "method", "vendor_id", "n_candidates", "contracts", "amount_mxn"])
        for r, n, pf, cnt, amt in sup:
            m, vid, nc = res[r or ""]
            stats[m] += cnt
            money[m] += amt or 0
            masked = (r[:4] + "…") if shape(r) == "person" else r
            w.writerow([masked, n, m, vid, nc, cnt, round(amt or 0)])
    total = sum(stats.values())
    print(f"{len(sup):,} distinct supplier RFCs · {total:,} contracts")
    for m, n in stats.most_common():
        print(f"  {m:<12} {n:>8,} contracts ({100 * n / total:5.1f}%)  {money[m] / 1e9:8.1f}B MXN")

    if a.apply:
        rw = sqlite3.connect(a.db)
        with rw:
            rw.execute("DROP TABLE IF EXISTS comprasmx_vendor_resolution")
            rw.execute("""CREATE TABLE comprasmx_vendor_resolution (rfc TEXT PRIMARY KEY, method TEXT NOT NULL,
                          vendor_id INTEGER, n_candidates INTEGER, resolved_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
            rw.executemany("INSERT INTO comprasmx_vendor_resolution (rfc, method, vendor_id, n_candidates) VALUES (?,?,?,?)",
                           [(r, m, v, n) for r, (m, v, n) in res.items()])
        print("applied → comprasmx_vendor_resolution")


if __name__ == "__main__":
    main()
