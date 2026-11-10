"""GT tier-A round 2026-11-03 (docs/GT_TIER_A_2026-11-03.md): E1/E3 cases from docs/cases/2026-11-02_*.md.

Evidence ladder (docs/CASE_LEADS_2026-11-02.md section 1): E1/E2 -> training label; E3 -> down-weighted, never
validated (case_origin 'official_investigation' is outside label_sources.EXTERNAL_ORIGINS; confidence
'medium' keeps backend/api/public_labels.py from calling the vendor "documented"). No source names a contract
number, so every label is vendor x window x buyer -> provenance_tier 'B' (fix/gt-labels-honest turns that into
label_tier B when the case names a buyer, C when it does not). There is no evidence-level column, so the level
is written into evidence_summary "[B|E1|gtA 2026-11-03]", label_scope_notes and ground_truth_sources.notes.

  python -m scripts.insert_gt_tier_a_20261103 --demo                               # in-memory self-check
  python -m scripts.insert_gt_tier_a_20261103 --db RUBLI_NORMALIZED.db            # dry-run, rolled back
  python -m scripts.insert_gt_tier_a_20261103 --db RUBLI_NORMALIZED.db --apply    # commit

Idempotent: new cases are keyed by case_name; upgrades check TAG in label_scope_notes. Back up the DB first.
Not labelled (see the doc): ABB (E1 against ABB Inc., not ABB Mexico; Evergreen not in our data), HP-Pemex
(SEC order unread; the vehicle may be a channel partner), PiSA / Fresenius Kabi / Baxter (product scope).
"""
import argparse
import json
import sqlite3

TAG = "gtA 2026-11-03"
BK = "_gtA_20261103_backup_"
BY = "insert_gt_tier_a_20261103.py"

NEW_CASES = [
    dict(
        case_name="Orthofix / Promeca - sobornos a funcionarios del IMSS 2003-2010 (DOJ DPA + SEC 2012)",
        case_type="bribery", ys=2003, ye=2010, inst=[251], level="E1", conf="confirmed_corrupt",
        origin="official_record", weight=0.8, role="bribing_vendor",
        vendors=[(5922, "PROMECA, S.A. DE C.V.", "vendor_id_direct", 0.95)],
        source_legal="US v. Orthofix International N.V., E.D. Tex., DPA 10-Jul-2012 (Information par. 22-29); "
                     "SEC v. Orthofix, complaint 2012 (par. 9-18)",
        summary="Orthofix admitted (DPA, Jul-2012) that its Mexican subsidiary Promeca paid ~US$317K to IMSS officials "
                "2003-Mar 2010 to win and keep IMSS hospital sales and the 2008 and 2009 IMSS national tenders. "
                "No contract number in the sources; label = vendor x IMSS x 2003-2010.",
        sources=[("court_filing", "https://www.justice.gov/sites/default/files/criminal-fraud/legacy/2012/08/15/2012-07-10-orthofix-info.pdf",
                  "DOJ Criminal Information, US v. Orthofix International N.V. (E.D. Tex., 10-Jul-2012)", "2012-07-10"),
                 ("court_filing", "https://www.sec.gov/litigation/complaints/2012/comp-pr2012-133.pdf",
                  "SEC complaint v. Orthofix International N.V. (2012)", "2012-07-10"),
                 ("court_filing", "https://www.sec.gov/Archives/edgar/data/884624/000110465912048124/",
                  "Orthofix 8-K 10-Jul-2012, Ex. 99.1 SEC consent / Ex. 99.2 DPA", "2012-07-10")],
        notes="Case file docs/cases/2026-11-02_promeca-imss.md. Tier-A candidates held (no source number): "
              "00641273-004-08 (2008) and 00641284-003-09 (2009). The 2021 INIFAP row is outside the scope."),
    dict(
        case_name="Cartel de insulina humana en licitaciones del IMSS 2003-2006 (CFC IO-003-2006, SCJN 2015)",
        case_type="bid_rigging", ys=2003, ye=2006, inst=[251], level="E1", conf="confirmed_corrupt",
        origin="official_record", weight=0.5, role="cartel_member",
        vendors=[(5189, "LABORATORIOS CRYOPHARMA, S.A. DE C.V.", "vendor_id_direct", 0.95),
                 (5191, "ELI LILLY Y COMPANIA DE MEXICO, S.A. DE C.V.", "name_exact", 0.9),
                 (14297, "ELI LILLY Y COMPANIA DE MEXICO, S.A. DE C.V.", "name_exact", 0.9),
                 (14296, "ELI LILLY Y COMPANIA, S.A. DE C.V.", "name_variant", 0.85),
                 (14058, "ELI LILLY Y CO. DE MEXICO", "name_variant", 0.8),
                 (5212, "PROBIOMED, S.A. DE C.V.", "vendor_id_direct", 0.95)],
        source_legal="CFC resolution 28-Jan-2010, expediente IO-003-2006 (reconsideration denied 23-Jun-2010, firme en "
                     "sede administrativa); SCJN 8-Apr-2015 upheld it for Eli Lilly (and Baxter, Fresenius Kabi, Pisa)",
        summary="CFC sanctioned bid rotation in IMSS human-insulin tenders 2003-2006 (Eli Lilly, Cryopharma, Probiomed, "
                "Pisa); 57.6% insulin overcharge (Cofece 2015). Tender list (version publica) not retrieved, so the label "
                "is the whole IMSS book 2003-2006 (other products included -> weight 0.5).",
        sources=[("government", "https://www.cofece.mx/wp-content/uploads/2018/08/informefinal2010.pdf",
                  "CFC Informe Anual 2010, ch. 2 pp. 41-42 (IO-003-2006)", "2011-01-01"),
                 ("government", "https://www.cofece.mx/wp-content/uploads/2018/10/cfc08-2010.pdf",
                  "CFC Comunicado 08-2010 (reconsideration denied)", "2010-06-23"),
                 ("government", "https://www.competitionpolicyinternational.com/assets/COFECE-009-2015-English.pdf",
                  "COFECE-009-2015: SCJN upholds the insulin / IV-solution sanction", "2015-04-08")],
        notes="Case file docs/cases/2026-11-02_imss-insulin-iv-cartel.md. Not linked (product scope unrecoverable; a "
              "whole-book label would sweep billions of other products): Laboratorios Pisa 4335, Fresenius Kabi 4389/5298 "
              "(fp_structural_monopoly=1), Baxter 4332/5319 (scorer floor 0.05). Probiomed statistical case 350 "
              "(window 2008-2025) is left as is."),
    dict(
        case_name="Cajas Graf / Corporativo Zeg - Talleres Graficos de Mexico 2017-2021 (E3: investigaciones abiertas)",
        case_type="procurement_fraud", ys=2017, ye=2021, inst=[438], level="E3", conf="medium",
        origin="official_investigation", weight=0.3, role="investigated_vendor",
        vendors=[(205852, "CAJAS GRAF, S.A. DE C.V.", "vendor_id_direct", 0.95),
                 (272453, "CORPORATIVO ZEG SA DE CV", "vendor_id_direct", 0.95)],
        source_legal=None,
        summary="Open official reviews, no ruling: ASF de-oficio review of INE/OPLE contracts (2026, press), INE-OIC "
                "preliminary collusion analysis (30-Oct-2026); the UIF freeze (acuerdo 401/2023) was overturned by "
                "amparo. None concerns the TGM contracts labelled here. Bajo investigacion; sin resolucion.",
        sources=[("journalism", "https://www.excelsior.com.mx/nacional/comision-vigilancia-asf-advierte-sobre-oligopolio-material-electoral",
                  "Excelsior: Comision de Vigilancia - revision ASF de contratos de material electoral", "2026-10-28"),
                 ("journalism", "https://www.poresto.com/mexico/2026/10/30/ine-detecta-presunta-colusion-empresas-contratos-mil-mdp-expedientes-abiertos.amp.html",
                  "Por Esto: OIC del INE detecta presunta colusion de cinco empresas", "2026-10-30")],
        notes="Case file docs/cases/2026-11-02_cajas-graf-tgm.md (its verdict: story lead only). Inserted as E3 at the "
              "lead's request: weight 0.3, never validated, confidence medium (not 'documented' on the site). "
              "Drop the label if the reviews close without a finding."),
]

UPGRADES = {
    274: dict(  # Medam / Stericycle
        level="E1", origin="official_record", conf="confirmed_corrupt", ys=2011, ye=2016, inst=None,
        source_legal="US v. Stericycle, Inc., S.D. Fla. 1:22-cr-20156, DPA 18-Apr-2022, Att. A par. 4, 27-35 "
                     "(Medam S.A. de C.V. = Stericycle Mexico)",
        summary="Stericycle admitted (DPA, Apr-2022) that Medam S.A. de C.V. (Stericycle Mexico) bribed officials of >=15 "
                "Mexican state-owned entities 2011-2016 for RPBI waste contracts. No buyer or contract named -> all "
                "buyers, 2011-2016.",
        sources=[("court_filing", "https://www.justice.gov/archives/opa/press-release/file/1496416/dl",
                  "DPA US v. Stericycle, Inc. (S.D. Fla. 1:22-cr-20156), Attachment A", "2022-04-18")],
        add_vendors=[(5892, "MEDAM S.A. DE C.V.", "name_exact", 0.95), (107297, "MEDAM,S.A DE C.V.", "name_variant", 0.9),
                     (132042, "MEDAM,S. DE R.L. DE C.V.", "name_variant", 0.85)],
        weight=0.8, role="bribing_vendor",
        notes="Case file docs/cases/2026-11-02_stericycle-medam-imss.md. Window 2010-2025 -> 2011-2016 (DPA period; "
              "Stericycle sold the Mexico business Oct-2019). 45114 = same name, S. de R.L. form (identity por verificar)."),
    497: dict(  # Carregin / Segalmex
        level="E3", origin="official_investigation", conf="medium", ys=None, ye=None, inst=[1327],
        source_legal="FGR: 22 arrest warrants (Mar-2023) for contratos ilegales y pagos ilicitos por 142,440,883 MXN "
                     "(7,840 t de azucar) - Diconsa/Segalmex",
        summary="FGR prosecution (warrants Mar-2023): 142.4 M MXN paid to Carregin for 7,840 t of sugar never shown "
                "delivered. Open criminal process, no ruling. Sugar contract = RUBLI 2296826 (145.8 M, "
                "AA-008VSS998-E7430-2020; amount near-match, not named by the source).",
        sources=[("journalism", "https://politica.expansion.mx/mexico/2023/03/09/fgr-obtiene-ordenes-de-aprehension-contra-22-involucrados-en-el-caso-segalmex",
                  "Expansion: FGR obtiene ordenes de aprehension contra 22 involucrados en el caso Segalmex (cita a la FGR)", "2023-03-09"),
                 ("journalism", "https://pulsenewsmexico.com/2023/04/11/inside-segalmexs-15-billion-peso-embezzlement-scandal/",
                  "Pulse News Mexico: Inside Segalmex 15 billion-peso embezzlement scandal", "2023-04-11")],
        add_vendors=[], weight=None, role=None,
        notes="CASE_LEADS section 3 row 12. E3: down-weighted (0.5 kept), never validated."),
}


def in_scope_contracts(conn, vids, ys, ye, inst):
    q = (f"SELECT id FROM contracts WHERE vendor_id IN ({','.join('?' * len(vids))}) "
         "AND contract_year BETWEEN ? AND ?")
    args = [*vids, ys, ye]
    if inst:
        q += f" AND institution_id IN ({','.join('?' * len(inst))})"
        args += inst
    return [r[0] for r in conn.execute(q, args)]


def add_contracts(conn, case_id, ids, level, url, strength):
    conn.executemany(
        """INSERT INTO ground_truth_contracts (case_id, contract_id, evidence_strength, match_method, match_confidence,
               evidence_tier, source_url, source_reference, source_extracted_at, source_extracted_by, notes)
           SELECT ?, ?, ?, 'vendor_window_scope', 1.0, 'L3_portfolio_swept', ?, ?, datetime('now'), ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM ground_truth_contracts WHERE case_id = ? AND contract_id = ?)""",
        [(case_id, k, strength, url, f"{level}: vendor x window x buyer; no contract named", BY, TAG, case_id, k)
         for k in ids])


def add_sources(conn, case_id, sources, level, n):
    for st, url, title, date in sources:
        conn.execute("""INSERT INTO ground_truth_sources (case_id, source_type, source_url, source_title, publication_date,
                            accessed_at, extracted_n_contracts, notes)
                        SELECT ?, ?, ?, ?, ?, datetime('now'), ?, ?
                        WHERE NOT EXISTS (SELECT 1 FROM ground_truth_sources WHERE case_id = ? AND source_url = ?)""",
                     (case_id, st, url, title, date, n, f"{TAG} | {level}", case_id, url))


def add_institutions(conn, case_id, inst):
    for i in inst or []:
        name = conn.execute("SELECT name FROM institutions WHERE id = ?", (i,)).fetchone()[0]
        conn.execute("""INSERT INTO ground_truth_institutions (case_id, institution_id, institution_name_source, role,
                            evidence_strength, match_method, match_confidence, notes)
                        SELECT ?, ?, ?, 'awarding_entity', 'high', 'institution_id_direct', 1.0, ?
                        WHERE NOT EXISTS (SELECT 1 FROM ground_truth_institutions WHERE case_id = ? AND institution_id = ?)""",
                     (case_id, i, name, TAG, case_id, i))


def add_vendor(conn, case_id, vid, name, method, mconf, role, level, weight):
    conn.execute("""INSERT INTO ground_truth_vendors (case_id, vendor_id, vendor_name_source, role, evidence_strength,
                        match_method, match_confidence, notes, is_false_positive, curriculum_weight, gt_split, gold_strict)
                    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'train', 0
                    WHERE NOT EXISTS (SELECT 1 FROM ground_truth_vendors WHERE case_id = ? AND vendor_id = ?)""",
                 (case_id, vid, name, role, "high" if level in ("E1", "E2") else "medium", method, mconf,
                  f"{TAG} | {level}", weight, case_id, vid))


def insert_case(conn, c):
    row = conn.execute("SELECT id FROM ground_truth_cases WHERE case_name = ?", (c["case_name"],)).fetchone()
    if row:
        return row[0]
    scope = f"[{TAG}] evidence {c['level']}; vendor x {c['ys']}-{c['ye']} x institutions {c['inst']}; weight {c['weight']}"
    if c["level"] == "E3":
        scope += "; E3: never validate, never gold"
    news = "; ".join(s[1] for s in c["sources"] if s[0] == "journalism") or None
    cid = conn.execute(
        """INSERT INTO ground_truth_cases (case_id, case_name, case_type, year_start, year_end, source_legal, source_news,
               confidence_level, notes, fraud_year_start, fraud_year_end, fraud_institution_ids, label_scope_notes,
               case_origin, provenance_tier, evidence_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'B', ?)""",
        (f"PENDING-{c['case_name']}", c["case_name"], c["case_type"], c["ys"], c["ye"], c["source_legal"], news,
         c["conf"], c["notes"], c["ys"], c["ye"], json.dumps(c["inst"]), scope, c["origin"],
         f"[B|{c['level']}|{TAG}] {c['summary']}")).lastrowid
    conn.execute("UPDATE ground_truth_cases SET case_id = ? WHERE id = ?", (f"CASE-{cid}", cid))  # memory rule
    return cid


UPGRADE_SQL = """UPDATE ground_truth_cases SET year_start = ?, year_end = ?, fraud_year_start = ?, fraud_year_end = ?,
    fraud_institution_ids = COALESCE(?, fraud_institution_ids), source_legal = ?, confidence_level = ?,
    case_origin = ?, provenance_tier = 'B', evidence_summary = ?, notes = ?, label_scope_notes = ?
    WHERE id = ?"""


def upgrade_case(conn, cid, u):
    """-> new (ys, ye). Rewrites the case once (TAG guard); links / contracts / sources are idempotent."""
    ys0, ye0, fys, fye, lsn, ev, notes = conn.execute(
        "SELECT year_start, year_end, fraud_year_start, fraud_year_end, label_scope_notes, evidence_summary, notes "
        "FROM ground_truth_cases WHERE id = ?", (cid,)).fetchone()
    ys, ye = u["ys"] or fys or ys0, u["ye"] or fye or ye0
    if TAG not in (lsn or ""):
        lsn = f"{lsn or ''} [{TAG}] evidence {u['level']}; window {ys}-{ye} (was {fys}-{fye})".strip()
        ev = f"[B|{u['level']}|{TAG}] {u['summary']} -- was: {ev or ''}"
        notes = f"{notes or ''} -- {u['notes']}"
        conn.execute(UPGRADE_SQL, (ys, ye, ys, ye, json.dumps(u["inst"]) if u["inst"] else None, u["source_legal"],
                                   u["conf"], u["origin"], ev, notes, lsn, cid))
    return ys, ye


def run(conn, apply=False):
    rep = {"new_cases": [], "upgraded": [], "contracts": {}}
    conn.isolation_level = None
    conn.execute("BEGIN IMMEDIATE")
    try:
        up = ",".join(map(str, UPGRADES))
        conn.execute(f"CREATE TABLE IF NOT EXISTS {BK}ground_truth_cases AS SELECT * FROM ground_truth_cases WHERE id IN ({up})")
        conn.execute(f"CREATE TABLE IF NOT EXISTS {BK}ground_truth_vendors AS SELECT * FROM ground_truth_vendors WHERE case_id IN ({up})")
        conn.execute(f"CREATE TABLE IF NOT EXISTS {BK}ground_truth_contracts AS SELECT * FROM ground_truth_contracts WHERE 0")
        for c in NEW_CASES:
            cid = insert_case(conn, c)
            for vid, name, method, mconf in c["vendors"]:
                add_vendor(conn, cid, vid, name, method, mconf, c["role"], c["level"], c["weight"])
            add_institutions(conn, cid, c["inst"])
            ids = in_scope_contracts(conn, [v[0] for v in c["vendors"]], c["ys"], c["ye"], c["inst"])
            add_contracts(conn, cid, ids, c["level"], c["sources"][0][1], "high" if c["level"] == "E1" else "medium")
            add_sources(conn, cid, c["sources"], c["level"], len(ids))
            rep["new_cases"].append(cid)
            rep["contracts"][cid] = len(ids)
        for cid, u in UPGRADES.items():
            ys, ye = upgrade_case(conn, cid, u)
            for vid, name, method, mconf in u["add_vendors"]:
                add_vendor(conn, cid, vid, name, method, mconf, u["role"], u["level"], u["weight"])
            add_institutions(conn, cid, u["inst"])
            vids = [r[0] for r in conn.execute("SELECT vendor_id FROM ground_truth_vendors WHERE case_id = ? AND "
                                               "vendor_id IS NOT NULL AND COALESCE(is_false_positive, 0) = 0", (cid,))]
            scope = in_scope_contracts(conn, vids, ys, ye, u["inst"])
            # rows outside the new window would read as labels: back them up, then remove
            conn.execute("CREATE TEMP TABLE IF NOT EXISTS _keep (id INTEGER PRIMARY KEY)")
            conn.execute("DELETE FROM _keep")
            conn.executemany("INSERT INTO _keep VALUES (?)", [(k,) for k in scope])
            out = "case_id = ? AND contract_id NOT IN (SELECT id FROM _keep)"
            conn.execute(f"INSERT INTO {BK}ground_truth_contracts SELECT * FROM ground_truth_contracts WHERE {out} "
                         f"AND id NOT IN (SELECT id FROM {BK}ground_truth_contracts)", (cid,))
            rep[f"removed_out_of_window_{cid}"] = conn.execute(
                f"DELETE FROM ground_truth_contracts WHERE {out}", (cid,)).rowcount
            add_contracts(conn, cid, scope, u["level"], u["sources"][0][1], "high" if u["level"] == "E1" else "medium")
            add_sources(conn, cid, u["sources"], u["level"], len(scope))
            rep["upgraded"].append(cid)
            rep["contracts"][cid] = len(scope)
        allv = {v[0] for c in NEW_CASES for v in c["vendors"]} | {v[0] for u in UPGRADES.values() for v in u["add_vendors"]}
        conn.executemany("UPDATE aria_queue SET in_ground_truth = 1 WHERE vendor_id = ?", [(v,) for v in sorted(allv)])
        conn.execute("COMMIT" if apply else "ROLLBACK")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    rep["applied"] = apply
    return rep


FIXTURE = """
CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, contract_year INT, institution_id INT);
CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE aria_queue (vendor_id INT, in_ground_truth INT DEFAULT 0);
CREATE TABLE ground_truth_cases (id INTEGER PRIMARY KEY, case_id TEXT UNIQUE, case_name TEXT, case_type TEXT,
    year_start INT, year_end INT, source_legal TEXT, source_news TEXT, confidence_level TEXT, notes TEXT,
    fraud_year_start INT, fraud_year_end INT, fraud_institution_ids TEXT, label_scope_notes TEXT,
    case_origin TEXT, provenance_tier TEXT, evidence_summary TEXT);
CREATE TABLE ground_truth_vendors (id INTEGER PRIMARY KEY, case_id INT, vendor_id INT, vendor_name_source TEXT,
    role TEXT, evidence_strength TEXT, match_method TEXT, match_confidence REAL, notes TEXT,
    is_false_positive INT, curriculum_weight REAL, gt_split TEXT, gold_strict INT);
CREATE TABLE ground_truth_contracts (id INTEGER PRIMARY KEY, case_id INT, contract_id INT, evidence_strength TEXT,
    match_method TEXT, match_confidence REAL, evidence_tier TEXT, source_url TEXT, source_reference TEXT,
    source_extracted_at TEXT, source_extracted_by TEXT, notes TEXT);
CREATE TABLE ground_truth_sources (id INTEGER PRIMARY KEY, case_id INT, source_type TEXT, source_url TEXT,
    source_title TEXT, publication_date TEXT, accessed_at TEXT, extracted_n_contracts INT, notes TEXT);
CREATE TABLE ground_truth_institutions (id INTEGER PRIMARY KEY, case_id INT, institution_id INT,
    institution_name_source TEXT, role TEXT, evidence_strength TEXT, match_method TEXT, match_confidence REAL, notes TEXT);
INSERT INTO institutions VALUES (251, 'IMSS'), (438, 'TGM'), (1327, 'DICONSA'), (99, 'OTRA');
INSERT INTO contracts VALUES (1, 5922, 2005, 251), (2, 5922, 2005, 99), (3, 5922, 2021, 265), (4, 45114, 2014, 99),
    (5, 45114, 2020, 251), (6, 5892, 2012, 99), (7, 256991, 2020, 1327), (8, 5189, 2007, 251);
INSERT INTO ground_truth_cases (id, case_id, case_name, year_start, year_end, fraud_year_start, fraud_year_end)
    VALUES (274, 'MEDAM', 'm', 2010, 2025, 2010, 2025), (497, 'CASE-497', 'c', 2020, 2021, 2020, 2021);
INSERT INTO ground_truth_vendors (case_id, vendor_id, is_false_positive, curriculum_weight)
    VALUES (274, 45114, 0, 0.8), (497, 256991, 0, 0.5);
INSERT INTO ground_truth_contracts (case_id, contract_id) VALUES (274, 4), (274, 5);
"""


def demo():
    """Self-check: window + buyer scope, CASE-{id}, idempotency, out-of-window removal with backup."""
    c = sqlite3.connect(":memory:")
    c.executescript(FIXTURE)
    r1, r2 = run(c, apply=True), run(c, apply=True)
    assert r1["new_cases"] == r2["new_cases"] == [498, 499, 500], r1
    ids = [x for (x,) in c.execute("SELECT case_id FROM ground_truth_cases WHERE id >= 498")]
    assert ids == ["CASE-498", "CASE-499", "CASE-500"], ids
    got = lambda cid: {k for (k,) in c.execute("SELECT contract_id FROM ground_truth_contracts WHERE case_id = ?", (cid,))}
    assert got(498) == {1}            # Promeca: IMSS only, 2021 INIFAP row and other buyer excluded
    assert got(499) == set()          # 5189 row is 2007, outside 2003-2006
    assert got(274) == {4, 6}, got(274)  # Medam: 2020 row removed, 5892 added, all buyers
    assert got(497) == {7}
    assert c.execute(f"SELECT contract_id FROM {BK}ground_truth_contracts").fetchall() == [(5,)]
    assert c.execute("SELECT fraud_year_start, fraud_year_end, case_origin, provenance_tier FROM ground_truth_cases "
                     "WHERE id = 274").fetchone() == (2011, 2016, "official_record", "B")
    assert c.execute("SELECT confidence_level, case_origin FROM ground_truth_cases WHERE id = 500").fetchone() == (
        "medium", "official_investigation")
    assert c.execute("SELECT COUNT(*) FROM ground_truth_vendors").fetchone()[0] == 2 + 1 + 6 + 2 + 3
    assert c.execute("SELECT COUNT(*) FROM ground_truth_sources").fetchone()[0] == 3 + 3 + 2 + 1 + 2
    print("demo ok")


def score_report(gt_db, feat_db, model_json):
    """v0.9.2 scores of the contracts labelled by this round (ground_truth_contracts of the 5 cases), recomputed
    from the frozen artifact (_v10/rematch_result.json policy v091_asof) on contract_features_v10 of feat_db,
    exactly as _v10/score_v092.py: q = sigmoid(intercept + x.b) / c_pu, score = min(q, 1). Also: the same
    buyer x window peers (all vendors) as the base rate."""
    import numpy as np
    P = json.load(open(model_json))["policy"]["v091_asof"]
    feats = list(P["betas_raw"])
    b = np.array([P["betas_raw"][f] for f in feats])
    fill = [P["neutral_fill"].get(f, 0.0) for f in feats]
    g = sqlite3.connect(f"file:{gt_db}?mode=ro", uri=True, timeout=120)
    f = sqlite3.connect(f"file:{feat_db}?mode=ro", uri=True, timeout=120)
    cases = [r[0] for r in g.execute("SELECT id FROM ground_truth_cases WHERE label_scope_notes LIKE ?", (f"%{TAG}%",))]

    def q_of(ids):
        out = {}
        for i in range(0, len(ids), 900):
            ch = ids[i:i + 900]
            for r in f.execute(f"SELECT contract_id, {', '.join(feats)} FROM contract_features_v10 "
                               f"WHERE contract_id IN ({','.join('?' * len(ch))})", ch):
                x = np.array([fl if v is None else v for fl, v in zip(fill, r[1:])], dtype=float)
                out[r[0]] = min(1.0 / (1.0 + np.exp(-(P["intercept"] + x @ b))) / P["c_pu"], 1.0)
        return out

    def dist(sc):
        a = np.array(list(sc.values()))
        if not len(a):
            return {"n": 0}
        return {"n": len(a), "mean": round(float(a.mean()), 3), "median": round(float(np.median(a)), 3),
                "p90": round(float(np.quantile(a, .9)), 3), "ge_040": round(float((a >= .40).mean()), 3),
                "ge_060": round(float((a >= .60).mean()), 3), "lt_025": round(float((a < .25).mean()), 3)}

    rep = {}
    for cid in cases:
        name, ys, ye, inst = g.execute("SELECT case_name, fraud_year_start, fraud_year_end, fraud_institution_ids "
                                       "FROM ground_truth_cases WHERE id = ?", (cid,)).fetchone()
        ids = [k for (k,) in g.execute("SELECT contract_id FROM ground_truth_contracts WHERE case_id = ?", (cid,))]
        sc = q_of(ids)
        amt = dict(g.execute(f"SELECT id, amount_mxn FROM contracts WHERE id IN ({','.join(map(str, ids))})")) if ids else {}
        a = np.array([sc[k] for k in sc])
        w = np.array([amt.get(k) or 0 for k in sc])
        d = dist(sc)
        d["value_mxn_m"] = round(float(w.sum()) / 1e6, 1)
        d["value_share_ge_040"] = round(float(w[a >= .40].sum() / w.sum()), 3) if w.sum() else None
        d["missing_features"] = len(ids) - len(sc)
        peers = None
        if inst and inst != "null":
            il = json.loads(inst)
            pid = [k for (k,) in g.execute(
                f"SELECT id FROM contracts WHERE institution_id IN ({','.join(map(str, il))}) AND contract_year BETWEEN ? AND ? "
                "AND amount_mxn > 0", (ys, ye))]
            peers = dist(q_of(pid))
        by_vendor = {}
        if ids:
            vmap = dict(g.execute(f"SELECT id, vendor_id FROM contracts WHERE id IN ({','.join(map(str, ids))})"))
            for v in sorted(set(vmap.values())):
                vs = {k: x for k, x in sc.items() if vmap.get(k) == v}
                nb = g.execute("SELECT COUNT(DISTINCT institution_id) FROM contracts WHERE vendor_id = ?", (v,)).fetchone()[0]
                by_vendor[v] = dict(dist(vs), buyers_all_years=nb)
        rep[cid] = {"case": name, "window": f"{ys}-{ye}", "labelled": d, "by_vendor": by_vendor,
                    "buyer_window_peers": peers}
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--demo", action="store_true", help="in-memory self-check")
    ap.add_argument("--score-report", metavar="FEATURES_DB", help="v0.9.2 scores of the labelled contracts "
                    "(DB with contract_features_v10, e.g. _comprasmx/integration/RUBLI_INTEGRATION.db)")
    ap.add_argument("--model", default="../_v10/rematch_result.json")
    a = ap.parse_args()
    if a.score_report:
        print(json.dumps(score_report(a.db, a.score_report, a.model), indent=1, ensure_ascii=False))
        return
    if a.demo or not a.db:
        demo()
        return
    print(run(sqlite3.connect(a.db, timeout=120), apply=a.apply))


if __name__ == "__main__":
    main()
