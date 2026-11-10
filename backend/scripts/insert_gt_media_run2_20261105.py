"""Insert the 6 media-run-2 GT cases (owner «insert all 6», 2026-11-05) + GFE case 36 → confidence «high».

Evidence: docs/MEDIA_MINING_RUN2_DUE_DILIGENCE_2026-11-05.md (branch media-run1). Each case rests on an official
record (OFAC SDN, DOF debarment circular, SAT 69-B definitivo). No contract is named by any source, so labels are
vendor × window (× buyer where the record names one), provenance tier B, L3 portfolio sweep, reduced weight
where the misconduct sits outside RUBLI's contracts. Reuses the helpers of insert_gt_tier_a_20261103 (same tables,
idempotent inserts, case_id = f'CASE-{id}').

Usage (from backend/):
    python -m scripts.insert_gt_media_run2_20261105 --demo                              # in-memory self-check
    python -m scripts.insert_gt_media_run2_20261105 --db RUBLI_NORMALIZED.db            # dry run, rolled back
    python -m scripts.insert_gt_media_run2_20261105 --db RUBLI_NORMALIZED.db --apply    # commit
"""
import argparse
import sqlite3

from scripts import insert_gt_tier_a_20261103 as gtA

TAG = "gtM2 2026-11-05"
BY = "insert_gt_media_run2_20261105.py"
GFE_CASE = 36
DD = "docs/MEDIA_MINING_RUN2_DUE_DILIGENCE_2026-11-05.md"

CASES = [
    dict(case_name="COPASA - empresa fachada de un esquema de contratos de obra (OFAC SDN 13-Oct-2026)",
         case_type="procurement_fraud", ys=2024, ye=2025, inst=None, level="E1", conf="high",
         origin="official_record", weight=0.8, role="front_company",
         vendors=[(314432, "CONCRETOS Y PRODUCTOS ASFALTICOS DEL NORTE SA DE CV", "sdn_established_date_rfc", 0.9)],
         source_legal="OFAC SDN designation 2026-10-13 [SDGT][ILLICIT-DRUGS-EO14059]; US Treasury press release sb0656",
         summary="Treasury designated COPASA (Nuevo Laredo, est. 2024-03-20, folio N-2024024028) as built to "
                 "vertically integrate an illicit construction-contract scheme. RUBLI RFC encodes the same date.",
         sources=[("government", "https://ofac.treasury.gov/recent-actions/20261013", "OFAC recent actions 2026-10-13", "2026-10-13"),
                  ("government", "https://home.treasury.gov/news/press-releases/sb0656", "US Treasury press release sb0656", "2026-10-13")],
         notes=f"{DD} #1. Match: SDN established date = RFC date (no RFC in SDN)."),
    dict(case_name="Inteliproof Efficient - proveedor fachada de una estructura criminal (OFAC SDN 29-Sep-2026)",
         case_type="procurement_fraud", ys=2022, ye=2025, inst=None, level="E1", conf="high",
         origin="official_record", weight=0.5, role="front_company",
         vendors=[(307849, "INTELIPROOF EFFICIENT S DE RL DE CV", "rfc_exact", 1.0)],
         source_legal="OFAC SDN designation 2026-09-29 [SDGT][ILLICIT-DRUGS-EO14059], RFC IEF201019BY7; press release sb0636",
         summary="Treasury designated Inteliproof as part of a cartel structure; press reports > 200 M MXN from the "
                 "Baja California prosecutor. Criminal-front supplier, not bid fraud -> weight 0.5.",
         sources=[("government", "https://ofac.treasury.gov/recent-actions/20260929", "OFAC recent actions 2026-09-29", "2026-09-29"),
                  ("government", "https://home.treasury.gov/news/press-releases/sb0636", "US Treasury press release sb0636", "2026-09-29")],
         notes=f"{DD} #2. SDN RFC equals RUBLI RFC."),
    dict(case_name="Perylsa Suministros - empresa de papel (SAT 69-B definitivo, DOF 29-Oct-2020)",
         case_type="ghost_company", ys=2017, ye=2019, inst=None, level="E1", conf="high",
         origin="official_record", weight=0.8, role="ghost_company",
         vendors=[(200943, "PERYLSA SUMINISTROS Y PRODUCTOS DEL ANTEQUERA SA DE CV", "rfc_exact", 1.0)],
         source_legal="SAT 69-B definitivo, oficio 500-05-2020-23677 (DOF 2020-10-29); presunto 500-05-2020-13676 (DOF 2020-06-29)",
         summary="SAT lists Perylsa as a definitive simulated-operations company; press found its «office» is a private "
                 "house. RUBLI contracts 2017-2019 (ISSSTE, SS Oaxaca) predate the presunto notice.",
         sources=[("government", "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv",
                   "SAT Listado completo 69-B (updated 2025-12-31)", "2020-10-29")],
         notes=f"{DD} #3. sat_efos_vendors.dof_date holds the presunto date for definitivo rows (loader bug, not fixed)."),
    dict(case_name="Lavanderia y Tintoreria de la Peninsula - informacion falsa en licitaciones del IMSS (DOF 17-Mar-2026)",
         case_type="procurement_fraud", ys=2023, ye=2024, inst=[251], level="E1", conf="high",
         origin="official_record", weight=0.5, role="sanctioned_vendor",
         vendors=[(145019, "LAVANDERIA Y TINTORERIA DE LA PENINSULA SA DE CV", "name_exact", 0.95)],
         source_legal="OIC-IMSS Circular SABG/OICGYR/AR/1322/2026, exp. PISI-A-NC-DS-0025/2024, DOF 2026-03-17, 1-year ban",
         summary="Debarred 1 year for false information in IMSS tenders. Circular names no tender; expediente is 2024, "
                 "so the window is 2023-2024 at IMSS (assumed) -> weight 0.5.",
         sources=[("government", "https://www.dof.gob.mx/nota_detalle.php?codigo=5782320", "DOF circular OIC-IMSS 2026-03-17", "2026-03-17")],
         notes=f"{DD} #4. Also in sfp_sanctions (DOF refresh 2026-11-05)."),
    dict(case_name="Bernabeu Mexico - informacion falsa en licitacion de ASIPONA Dos Bocas (DOF 20-Jul-2026)",
         case_type="procurement_fraud", ys=2025, ye=2025, inst=None, level="E1", conf="high",
         origin="official_record", weight=0.3, role="sanctioned_vendor",
         vendors=[(114385, "BERNABEU MEXICO SA DE CV", "name_exact", 0.95)],
         source_legal="SABG Circular 013/2026, exp. SAN/055/2025, DOF 2026-07-20, 16 months 24 days",
         summary="Fined and debarred for falsified information in an ASIPONA Dos Bocas cleaning tender (not in RUBLI); "
                 "label = the vendor's 2025 RUBLI book -> weight 0.3.",
         sources=[("government", "https://sidof.segob.gob.mx/notas/docFuente/5793941", "SABG Circular 013/2026 (SIDOF)", "2026-07-20")],
         notes=f"{DD} #5. Also in sfp_sanctions (DOF refresh 2026-11-05)."),
    dict(case_name="Gen Industrial - informacion falsa en licitacion de Salud (DOF 30-Dic-2025)",
         case_type="procurement_fraud", ys=2023, ye=2023, inst=None, level="E2", conf="medium",
         origin="official_record", weight=0.3, role="sanctioned_vendor",
         vendors=[(8094, "GEN INDUSTRIAL S.A. DE C.V.", "name_exact", 0.9)],
         source_legal="OIC-Salud circular, exp. PA-001/2025, DOF 2025-12-30, 3-month ban + 157,685 MXN fine "
                      "(tender LA-12-NBB-012NBB001-N-1-2023)",
         summary="Short ban for false information in a 2023 Salud tender (not in RUBLI); IMSS signed waste contracts "
                 "the day after. Weakest of the six -> medium, weight 0.3.",
         sources=[("government", "https://www.dof.gob.mx/nota_detalle.php?codigo=5777498", "DOF circular OIC-Salud 2025-12-30", "2025-12-30")],
         notes=f"{DD} #6. Also in sfp_sanctions (DOF refresh 2026-11-05)."),
]


def run(conn, apply=False):
    gtA.TAG, gtA.BY = TAG, BY  # the shared helpers read these module globals
    rep = {"new_cases": [], "contracts": {}, "gfe36": None}
    conn.isolation_level = None
    conn.execute("BEGIN IMMEDIATE")
    try:
        for c in CASES:
            cid = gtA.insert_case(conn, c)
            for vid, name, method, mconf in c["vendors"]:
                gtA.add_vendor(conn, cid, vid, name, method, mconf, c["role"], c["level"], c["weight"])
            gtA.add_institutions(conn, cid, c["inst"])
            ids = gtA.in_scope_contracts(conn, [v[0] for v in c["vendors"]], c["ys"], c["ye"], c["inst"])
            gtA.add_contracts(conn, cid, ids, c["level"], c["sources"][0][1], "high" if c["level"] == "E1" else "medium")
            gtA.add_sources(conn, cid, c["sources"], c["level"], len(ids))
            rep["new_cases"].append(cid)
            rep["contracts"][cid] = len(ids)
        conn.executemany("UPDATE aria_queue SET in_ground_truth = 1 WHERE vendor_id = ?",
                         [(v[0],) for c in CASES for v in c["vendors"]])
        old = conn.execute("SELECT confidence_level FROM ground_truth_cases WHERE id = ?", (GFE_CASE,)).fetchone()
        if old:
            conn.execute("UPDATE ground_truth_cases SET confidence_level = 'high', notes = COALESCE(notes, '') || ? "
                         "WHERE id = ? AND confidence_level != 'high'",
                         (f" -- [{TAG}] confidence {old[0]} -> high (owner 11-05): SFP exp. 0014/2019, ban "
                          "2019-07-16 -> 2021-07-16 (docs/GFE_CASE36_EVIDENCE_2026-11-04.md)", GFE_CASE))
            rep["gfe36"] = f"{old[0]} -> high"
        conn.execute("COMMIT" if apply else "ROLLBACK")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    rep["applied"] = apply
    return rep


def demo():
    """Self-check: CASE-{id}, buyer scope, idempotency, GFE 36 flip once."""
    c = sqlite3.connect(":memory:")
    c.executescript(gtA.FIXTURE)
    c.executescript("""
        INSERT INTO ground_truth_cases (id, case_id, case_name, confidence_level, notes) VALUES (36, 'GRUFESA', 'g', 'medium', 'n');
        INSERT INTO contracts VALUES (101, 145019, 2024, 251), (102, 145019, 2024, 99), (103, 145019, 2020, 251),
            (104, 307849, 2024, 99), (105, 8094, 2024, 251);
        INSERT INTO aria_queue VALUES (145019, 0);""")
    r1, r2 = run(c, apply=True), run(c, apply=True)
    assert r1["new_cases"] == r2["new_cases"] == [498, 499, 500, 501, 502, 503], r1
    assert [x for (x,) in c.execute("SELECT case_id FROM ground_truth_cases WHERE id >= 498")] == \
        [f"CASE-{i}" for i in range(498, 504)]
    got = lambda cid: {k for (k,) in c.execute("SELECT contract_id FROM ground_truth_contracts WHERE case_id = ?", (cid,))}
    assert got(501) == {101}          # Lavandería: IMSS 2023-24 only
    assert got(499) == {104}          # Inteliproof: any buyer 2022-25
    assert got(503) == set()          # Gen Industrial: 2023 only
    assert c.execute("SELECT confidence_level FROM ground_truth_cases WHERE id = 36").fetchone() == ("high",)
    assert c.execute("SELECT notes FROM ground_truth_cases WHERE id = 36").fetchone()[0].count(TAG) == 1
    assert c.execute("SELECT in_ground_truth FROM aria_queue WHERE vendor_id = 145019").fetchone() == (1,)
    assert c.execute("SELECT COUNT(*) FROM ground_truth_vendors WHERE case_id >= 498").fetchone()[0] == 6
    assert c.execute("SELECT COUNT(*) FROM ground_truth_sources WHERE case_id >= 498").fetchone()[0] == 8
    print("demo ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo or not a.db:
        demo()
        return
    print(run(sqlite3.connect(a.db, timeout=120), apply=a.apply))


if __name__ == "__main__":
    main()
