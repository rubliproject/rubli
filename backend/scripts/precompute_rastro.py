"""«El rastreo de un peso» (/rastro) — the trail pack → precomputed_stats['rastro_trail'] (GET /api/v1/rastro/trail).

    python -m scripts.precompute_rastro --db <DB> [--dry-run (read-only)] [--out pack.json]

Builds the exact shape of frontend/src/lib/moneyPaths/rastro.data.json (the bundled fallback) from the register, with
the selection logic of the pack's generator (_explore/rastro_concepts_2026-10-28/build.py + data/q_*.py, run on the
2026-10-27 prod backup). The peso: IMSS (institution 251), category 20 (medicines), contract_year 2024; the name:
Farmacéuticos Maypo (vendor 2873) — the copy is written around both, so they are fixed, not chosen.
  reg / reg_cn / reg24   IMSS × cat 20 per contract_year (reg_cn = CompraNet only, source_structure <> 'E')
  c                      centavos of the Cuenta Pública peso (EX24); from step 3 on, direct awards only (the ladder nests)
  exc24                  cat-20 2024 direct awards by exception_article, top 10 by money
  tiers24                ARIA tiers 1–2 (latest run in aria_queue) on those direct awards
  nonda                  the competitive side: contracts, procedures, single-bid procedures
  cmxp                   Maypo on ComprasMX after the CompraNet shutdown (2025-09-28): n, MDP, citing an article
  maypo                  name, tier; IMSS × cat 20 2024 (exc = IMSS 2024 all categories, top 6 by count, as the
                         generator did); buyers 2024; IMSS lifetime
  close                  Maypo contracts per year 2023–2026, latest/largest of the latest year + their buyer (siglas; the
                         copy names it, «otra vez con el IMSS» only when it is), IMSS counts per year
  contract               Maypo's largest IMSS × cat 20 contract of 2024 (the h1's «su contrato más grande del año»)
  top24                  top 5 IMSS × cat 20 2024 suppliers by money
Not in the DB, carried as constants: the Cuenta Pública partida 25301 figures (ex24, cp, pp24: SHCP, annual, closed)
and the ASF observation (asf). Amounts: 0 < amount <= 100B MXN (> 100B rejected). No RFC is read or written.
Refuses to write (exit 1) when the trail stops nesting; the page then keeps the previous row, or its bundled pack
(it also falls back on its own when any claim of the copy no longer holds: rastro.ts trailOk). Run by scripts/comprasmx_weekly.py after every refresh.
"""
import argparse
import json
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.config.constants import MAX_CONTRACT_VALUE  # noqa: E402

STAT_KEY = "rastro_trail"
IMSS, CAT, YEAR, MAYPO = 251, 20, 2024, 2873
SHUTDOWN = "2025-09-28"
V = f"amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE}"
W = f"institution_id = {IMSS} AND category_id = {CAT} AND contract_year = {YEAR} AND {V}"

# SHCP Cuenta Pública, ramo 50 (IMSS), partida 25301, ejercido (build.py over data/cp_salud.csv)
EX24 = 81891749073.0
CP = {"2023": {"med": 71801119289.0}, "2024": {"med": EX24}, "2025": {"med": 87829856863.0}}
PP24 = [{"name": "11 Atención a la Salud", "v": 78075980513.0}]
ASF = {"mdp": 152.5, "cp": 2023, "audit": 234, "service_contract": "048/2022", "status_es": "por aclarar",
       "status_en": "pending clarification", "result": None}
DOC = ("El rastreo de un peso: the reviewed V2 trail (rastro_concepts_2026-10-28 REVIEW_V2 SHIP; money_paths_2026-10-29). "
       "IMSS, partida 25301 (medicines), 2024. Cuenta Publica (SHCP) + the RUBLI register, read {read} by "
       "backend/scripts/precompute_rastro.py. The contract is read live from /contracts/{{id}}. mdp = millions of MXN.")

# LAASSP art. 41 (text in force for 2024), labels checked by the independent review (build.py)
EXC_LBL = {"ART. 41 FR. I": "sin sustituto, un solo oferente o derechos exclusivos", "ART. 41 FR. II": "emergencia: salubridad u orden social por caso fortuito",
           "ART. 41 FR. III": "pérdidas o costos adicionales importantes", "ART. 41 FR. V": "caso fortuito o fuerza mayor: sin tiempo para licitar",
           "ART. 41 FR. VII": "licitación desierta", "ART. 41 FR. VIII": "fr. VIII", "ART. 42 PÁRRAFO PRIMERO": "por monto (art. 42)",
           "ART. 42 FR. V": "art. 42 fr. V", "ART. 43": "art. 43", None: "sin artículo registrado"}
EXC_EN = {"ART. 41 FR. I": "no substitute, a single bidder or exclusive rights", "ART. 41 FR. II": "emergency: public health or order after force majeure",
          "ART. 41 FR. III": "significant losses or additional costs", "ART. 41 FR. V": "force majeure: no time to tender", "ART. 41 FR. VII": "void tender",
          "ART. 41 FR. VIII": "sec. VIII", "ART. 42 PÁRRAFO PRIMERO": "by amount (art. 42)", "ART. 42 FR. V": "art. 42 sec. V", "ART. 43": "art. 43", None: "no article recorded"}


def short(e):
    return (e or "sin artículo").replace("ART. 41 FR. ", "fr. ").replace("ART. 42 PÁRRAFO PRIMERO", "art. 42").replace("ART. ", "art. ")


def short_en(e):
    return (e or "no article").replace("ART. 41 FR. ", "sec. ").replace("ART. 42 PÁRRAFO PRIMERO", "art. 42").replace("ART. 42 FR. ", "art. 42 sec. ").replace("ART. ", "art. ")


def cent(mdp):
    return mdp * 1e6 / EX24 * 100


def compute(conn, today=None):
    q = lambda s, a=(): conn.execute(s, a).fetchall()  # noqa: E731
    one = lambda s, a=(): q(s, a)[0]  # noqa: E731
    m1 = lambda x: round((x or 0) / 1e6, 1)  # noqa: E731
    DA = "SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn ELSE 0 END)"

    hist = {str(y): {"mdp": m1(s)} for y, s in q(f"SELECT contract_year, SUM(amount_mxn) FROM contracts WHERE institution_id = {IMSS} "
                                                   f"AND category_id = {CAT} AND contract_year BETWEEN 2023 AND 2025 AND {V} GROUP BY 1")}
    reg = {y: hist.get(y, {"mdp": 0.0}) for y in ("2023", "2024", "2025")}
    cn25 = one(f"SELECT SUM(amount_mxn) FROM contracts WHERE institution_id = {IMSS} AND category_id = {CAT} AND contract_year = 2025 "
               f"AND COALESCE(source_structure, '') <> 'E' AND {V}")[0]
    n, mdp, da, nv = one(f"SELECT COUNT(*), SUM(amount_mxn), {DA}, COUNT(DISTINCT vendor_id) FROM contracts WHERE {W}")
    reg24 = {"n": n, "mdp": m1(mdp), "da": m1(da), "nv": nv}

    exc24 = [{"s": short(e), "s_en": short_en(e), "lbl": EXC_LBL.get(e, e), "lbl_en": EXC_EN.get(e, e), "n": k, "mdp": m1(s), "cent": cent(m1(s))}
             for e, k, s in q(f"SELECT exception_article, COUNT(*), SUM(amount_mxn) FROM contracts WHERE {W} AND is_direct_award = 1 "
                              f"GROUP BY 1 ORDER BY 3 DESC LIMIT 10")]
    run = (q("SELECT aria_run_id FROM aria_queue ORDER BY computed_at DESC LIMIT 1") or [[None]])[0][0]
    tiers = {t: {"nv": k, "mdp": m1(s)} for t, k, s in q(
        f"SELECT a.ips_tier, COUNT(DISTINCT c.vendor_id), SUM(c.amount_mxn) FROM contracts c JOIN aria_queue a "
        f"ON a.vendor_id = c.vendor_id AND a.aria_run_id = ? WHERE c.{W.replace(' AND ', ' AND c.')} AND c.is_direct_award = 1 "
        f"AND a.ips_tier IN (1, 2) GROUP BY 1", (run,))}
    tiers24 = {str(t): tiers.get(t, {"nv": 0, "mdp": 0.0}) for t in (1, 2)}
    # sb_n = single-bid PROCEDURES (the copy: «65 de 111 procedimientos»), same unit as np
    nn, np_, sb = one(f"SELECT COUNT(*), COUNT(DISTINCT procedure_number), COUNT(DISTINCT CASE WHEN is_single_bid = 1 THEN procedure_number END) "
                      f"FROM contracts WHERE {W} AND is_direct_award = 0")
    cn, cmdp, cite = one(f"SELECT COUNT(*), COALESCE(SUM(amount_mxn), 0), COALESCE(SUM(exception_article IS NOT NULL AND exception_article <> ''), 0) "
                         f"FROM contracts WHERE vendor_id = {MAYPO} AND source_structure = 'E' AND contract_date >= ? AND {V}", (SHUTDOWN,))

    name = one(f"SELECT name FROM vendors WHERE id = {MAYPO}")[0]
    tier = (q("SELECT ips_tier FROM aria_queue WHERE vendor_id = ? AND aria_run_id = ?", (MAYPO, run)) or [[None]])[0][0]
    mn, mmdp, mda = one(f"SELECT COUNT(*), SUM(amount_mxn), {DA} FROM contracts WHERE {W} AND vendor_id = {MAYPO}")
    mexc = [{"s": short(e), "n": k, "mdp": m1(s)} for e, k, s in q(
        f"SELECT exception_article, COUNT(*), SUM(amount_mxn) FROM contracts WHERE vendor_id = {MAYPO} AND institution_id = {IMSS} "
        f"AND contract_year = {YEAR} AND {V} GROUP BY 1 ORDER BY 2 DESC LIMIT 6")]
    buyers = [{"sig": sig or nm, "mdp": m1(s)} for sig, nm, s in q(
        f"SELECT i.siglas, i.name, SUM(c.amount_mxn) FROM contracts c JOIN institutions i ON i.id = c.institution_id "
        f"WHERE c.vendor_id = {MAYPO} AND c.contract_year = {YEAR} AND c.{V.replace(' AND ', ' AND c.')} GROUP BY c.institution_id ORDER BY 3 DESC, 1")]
    ln, lmdp, lda, y0, y1 = one(f"SELECT COUNT(*), SUM(amount_mxn), {DA}, MIN(contract_year), MAX(contract_year) FROM contracts "
                                f"WHERE vendor_id = {MAYPO} AND institution_id = {IMSS} AND {V}")
    MPO = {"id": MAYPO, "name": name, "tier": tier, "imss24": {"n": mn, "mdp": m1(mmdp), "da": m1(mda), "exc": mexc}, "buyers24": buyers,
           "imss_life": {"n": ln, "mdp": m1(lmdp), "da_pct": round(100 * (lda or 0) / lmdp, 1) if lmdp else 0.0, "y0": y0, "y1": y1}}

    # the after-beat — ponytail: years fixed at 2023–2026 (the copy names them); a 2027 pass needs new copy, not code
    YS = ("2023", "2024", "2025", "2026")
    per = dict(q(f"SELECT contract_year, COUNT(*) FROM contracts WHERE vendor_id = {MAYPO} AND contract_year BETWEEN 2023 AND 2026 AND {V} GROUP BY 1"))
    imss = dict(q(f"SELECT contract_year, COUNT(*) FROM contracts WHERE institution_id = {IMSS} AND contract_year BETWEEN 2023 AND 2026 AND {V} GROUP BY 1"))
    SIG = f"(SELECT COALESCE(i.siglas, i.name) FROM institutions i WHERE i.id = contracts.institution_id)"
    last, last_sig = one(f"SELECT substr(contract_date, 1, 10), {SIG} FROM contracts WHERE vendor_id = {MAYPO} AND {V} "
                         f"ORDER BY contract_date DESC, amount_mxn DESC LIMIT 1")
    big_amt, big_date, big_sig = one(f"SELECT amount_mxn, substr(contract_date, 1, 10), {SIG} FROM contracts WHERE vendor_id = {MAYPO} "
                                     f"AND contract_year = ? AND {V} ORDER BY amount_mxn DESC LIMIT 1", (int(last[:4]),))
    read = (today or date.today()).isoformat()
    close = {"n": {y: per.get(int(y), 0) for y in YS}, "last": last, "last_sig": last_sig, "big_mdp": m1(big_amt), "big_date": big_date,
             "big_sig": big_sig, "read": read,
             "imss": {y: imss.get(int(y), 0) for y in YS}}

    cols = ("id", "contract_number", "title", "amount_mxn", "contract_date", "procedure_type", "procedure_number", "start_date", "end_date",
            "award_date", "publication_date", "risk_score", "risk_level", "source_structure", "exception_article")
    row = one(f"SELECT {', '.join(cols)} FROM contracts WHERE {W} AND vendor_id = {MAYPO} ORDER BY amount_mxn DESC LIMIT 1")
    contract = dict(zip(cols, row))
    for k in ("contract_date", "start_date", "end_date", "award_date", "publication_date"):
        contract[k] = contract[k][:10] if contract[k] else None

    top24 = [{"id": i, "mdp": m1(s)} for i, s in q(f"SELECT vendor_id, SUM(amount_mxn) FROM contracts WHERE {W} GROUP BY 1 ORDER BY 2 DESC LIMIT 5")]
    t12 = tiers24["1"]["mdp"] + tiers24["2"]["mdp"]
    C = {"ex": 100.0, "reg": cent(reg24["mdp"]), "da": cent(reg24["da"]), "t12": cent(t12), "maypo": cent(MPO["imss24"]["da"])}
    pack = {"_doc": DOC.format(read=read), "read": read, "ex24": EX24, "cp": CP, "pp24": PP24, "reg": reg, "reg_cn": {"2025": {"mdp": m1(cn25)}},
            "reg24": reg24, "c": C, "exc24": exc24, "tiers24": tiers24, "nonda": {"n": nn, "np": np_, "sb_n": sb},
            "cmxp": {"n": cn, "mdp": cmdp / 1e6, "cite": cite}, "maypo": MPO, "close": close, "asf": ASF, "contract": contract, "top24": top24}
    holds = {"nests": C["ex"] > C["reg"] > C["da"] > C["t12"] > C["maypo"] > 0}
    return pack, holds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", help="also write the pack to this JSON file")
    a = ap.parse_args()
    t = time.time()
    conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True, timeout=120) if a.dry_run else sqlite3.connect(a.db, timeout=120)
    pack, holds = compute(conn)
    C = pack["c"]
    print(f"trail {C['ex']:.0f} > {C['reg']:.1f} > {C['da']:.1f} > {C['t12']:.1f} > {C['maypo']:.2f} ¢ · contract {pack['contract']['id']} "
          f"({pack['contract']['contract_date']}) · Maypo {pack['close']['n']} · last {pack['close']['last']}")
    if a.out:
        Path(a.out).write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    broken = [k for k, v in holds.items() if not v]
    if broken:
        sys.exit(f"not written — the copy no longer holds: {broken}")
    if not a.dry_run:
        conn.execute("INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) VALUES (?, ?, datetime('now'))",
                     (STAT_KEY, json.dumps(pack, ensure_ascii=False, separators=(",", ":"))))
        conn.commit()
        print(f"wrote precomputed_stats['{STAT_KEY}']")
    print(f"{time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
