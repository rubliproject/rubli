# Ground-truth label audit — 2026-10-31

> Read-only audit. No DB writes, no site edits, no rescore. Scripts and raw output live in the session scratchpad (`analyze.py`, `extra.py`, `sample.py`, `auc.py`, `sample.txt`); the labelling rule is reproduced from code, not from docs.
> Owner question: «we need to be 100 % sure the contracts in our training data are actual corruption cases — not just every contract from the same vendor to that institution. How many do we really have?»

## Resumen (ES)

**Respuesta corta: no lo estamos, y casi ninguno lo es.** El modelo publicado (v0.9.2) no etiqueta contratos documentados. Etiqueta **todos los contratos de un proveedor vinculado a un caso dentro de la ventana de años del caso**, con cualquier institución. Solo 16 de 1,417 casos limitan la etiqueta a instituciones concretas. La tabla `ground_truth_contracts` (305 mil filas) **no la lee el entrenamiento**.

- **Casos:** 1,417. **Proveedores vinculados utilizables** (no falsos positivos, no paraestatales): 1,403. **Contratos positivos:** 275,388 (2.40 billones MXN). En entrenamiento: 266,587 contratos de 1,275 proveedores (≈78,800 tras el tope de 200 por proveedor); hold-out «gold»: 8,801 de 106 proveedores.
- **Contratos con documento externo que nombra ese contrato:** 8 en toda la base (Oceanografía 6, COVID/Cyber Robotic 1, Tren Maya 1). De ellos, **5 son positivos y los 5 están en el hold-out; en entrenamiento hay 0**. Los 1,353 contratos marcados `L1_audit_attested` son copias automáticas de la fuente del caso (en su mayoría «ARIA T3 queue pattern analysis» o «case-level (no source field)»), no evidencia del contrato.
- **Heredados:** el 99.998 % de los positivos (por valor, ≈99.6 %).
- **Fuente de los casos:** solo **126 casos (9 %) tienen una fuente independiente verificable** (provenance A/B). 947 no registran fuente; 264 citan a nuestro propio ARIA aunque su origen diga `media_report`; 80 son citas genéricas sin verificar. En entrenamiento, **el 71 % de los contratos positivos vienen de casos sin fuente independiente**.
- **Muestra de 40 positivos** (estratificada, con verificación web de los dudosos): **0 confirmados**, 5 plausibles (mismo esquema, comprador y periodo), 9 con sanción o nota de prensa del proveedor pero de otro comprador/periodo, 26 sin respaldo. **Precisión (confirmado + plausible) 12.5 %, IC 95 % 5–26 %**; ponderada por estrato ≈11 %. Contando «el proveedor sí tiene antecedentes»: 35 % (22–51 %).
- **Error de código encontrado:** las ventanas que la revisión L1 «ajustó» se escribieron en `year_start/year_end`, pero el entrenamiento usa `COALESCE(fraud_year_start, year_start)`, así que el ajuste **no se aplicó**: 20 casos, 6,254 contratos (51 mil millones MXN) siguen positivos fuera de la ventana corregida (p. ej. Ralca, caso 104).
- **Tradeco (proveedor 441) ↔ Odebrecht:** ya está marcado falso positivo en la base local (`excluded_fp`, revisión L1b2b). No entra al entrenamiento. Falta confirmar que producción está sincronizada.
- **AUC 0.827:** se midió solo con proveedores de casos de origen externo, sin `model_discovery`. Aun así, ≈30 % de esos proveedores de prueba vienen de casos `media_report` cuya única fuente es ARIA. La circularidad no infla la cifra: con las puntuaciones vivas, los casos con fuente independiente puntúan *más alto* (AUC por contrato 0.954) que los auto-citados (0.797). El problema real es otro: el número mide qué tan bien el modelo **ordena proveedores con antecedentes**, no qué tan bien detecta **contratos corruptos**.

**Tres recomendaciones:** (1) etiquetas por niveles A/B/C y entrenar con A+B, validar con A (hoy A ≈ 8 contratos, así que lo primero es minar más); (2) sacar del entrenamiento los casos sin fuente independiente (o pesarlos ≤0.15) y corregir el error de ventanas; (3) decir en público «ordena proveedores-año», no «detecta contratos corruptos», y reportar el AUC por nivel de evidencia.

---

## 1. How labels are built today (code path)

The shipped model is **v0.9.2 = v0.9.1's recipe on as-of features** (`docs/MODEL_CARD_v0.9.2.md` § 1; `_v10/PREREGISTRATION_2.md`: «labels = v0.9.1's labelling (all non-FP GT links incl. model_discovery …), as `_v09/train_eval.py` positives()»). The training labels come from `rematch_v10.py::v91_frame` (branch `origin/model/v010-build`), which re-implements `_v09/train_eval.py::positives()`:

```python
# _v10/rematch_v10.py  v91_frame()
SELECT v.vendor_id, v.is_false_positive, v.curriculum_weight, c.confidence_level,
       COALESCE(c.fraud_year_start, c.year_start), COALESCE(c.fraud_year_end, c.year_end), c.fraud_institution_ids
FROM gt_snapshot_v10_ground_truth_vendors v JOIN gt_snapshot_v10_ground_truth_cases c ON c.id = v.case_id
...
if fp or kind.get(vid) == "public_soe": continue
rules[vendor].append((ys or 1900, ye or 2100, scope_or_None, w))
...
if ys <= yr <= ye and (sc is None or ic in sc): y = 1
```

So a contract is positive when:

| Condition | Effect |
|---|---|
| its vendor (canonical id) has any non-FP link in `ground_truth_vendors` | vendor-level |
| contract year ∈ `[COALESCE(fraud_year_start, year_start), COALESCE(fraud_year_end, year_end)]` | **NULL → 1900–2100 = the vendor's whole book** (61 cases have no window; 6,170 positives) |
| institution ∈ `fraud_institution_ids` — **only if the case sets it** | set on **16 of 1,417 cases** |
| weight = `curriculum_weight` else confidence map | soft only; every link still yields y = 1 |

Not used anywhere in training: `ground_truth_contracts` (contract numbers, procedures, evidence tier), `ground_truth_institutions` (23 rows over 4 cases), `ground_truth_sources`, `provenance_tier`, `case_origin`. The fit then caps each vendor at 200 random positive contracts (`common.py` `CAP = 200`).

**Institution pairs.** Only **18 cases name an institution**: 16 via `fraud_institution_ids` (the only field training reads: cases 1, 3, 5 and 13 model-discovery cases 1371–1381, 1409, 1410) plus 4 via `ground_truth_institutions` (cases 1–4; the «23» figure in the capture study is that table's row count, not cases). So **98.9 % of cases label vendor × years, any buyer** — not even vendor × institution. The «same vendor to that institution» worry understates the problem.

The test labels (forward chain, the 0.827) are different: `labels_v10.py` — only links whose case origin is `media_report / official_record / audit_report`, NULL start excluded, gold-holdout vendors only. Same vendor × window × (rare) scope mechanics.

## 2. Counts

Reproduced on the **current** GT (local `RUBLI_NORMALIZED.db`) and `_v10/contracts_cache.parquet`. The rematch ran on the 2026-10-22 snapshot (sha `9c313cb2…`); counts may differ by a few links.

### Cases (1,417)

| Cut | Count |
|---|---|
| `case_origin` | model_discovery 989 · media_report 361 · official_record 25 · audit_report 1 · ARIA/analyst/other mining 18 · NULL 23 |
| `provenance_tier` | **A 65 · B 61 · C 1,291** |
| evidence_summary (what the source actually is) | **no source recorded 947** · **self-citation (ARIA/COMPRANET) 264** · generic citation, unverified 80 · web-verified URL 80 · official sanction named (SFP/FGR/ASF) 35 · other A/B 11 |
| source field present (raw) | legal 120 · news 396 · ASF 26 — but 73 of the 120 «legal» are unverified text such as «IMSS internal investigation» |
| `ground_truth_sources` rows | journalism 212 · court_filing 10 · asf_audit 4 · government 3 · other/report 4 (all on 203 cases; most have empty URL) |
| confidence_level | high 915 · medium 443 · low 56 · confirmed_corrupt 3 |

By genuine source type, then: **no court ruling is stored as such**; SFP inhabilitación named ≈35 cases; ASF named in a handful; press with a verifiable URL 80; **SAT 69-B: 0 cases** (it lives in a separate table, not in GT). **261 of the 361 `media_report` cases cite «ARIA T3 queue pattern analysis»** — the origin field is wrong for them; they are model discoveries.

### Vendors and positives

| | Contracts | Vendors | Cases | Value (bn MXN) |
|---|---:|---:|---:|---:|
| Non-FP usable links | — | 1,403 | 1,323 | — |
| **All positives** | **275,388** | 1,381 | 1,290 | 2,404 |
| train | 266,587 | 1,275 | 1,242 | 2,241 |
| train after 200/vendor cap (expected) | ≈78,770 | 1,275 | — | — |
| gold hold-out | 8,801 | 106 | 51 | 163 |

Median vendor contributes 21 positives; p90 388; max 16,746. 41 cases make up half of all positives.

### Documented vs inherited

| Tier (my definition) | Contracts | Vendors | Value | Share (ct / value) |
|---|---:|---:|---:|---|
| **A-true** — an external document names this contract (URL + number) | **5** (all gold; **0 in train**) | 2 | 8.3 bn | 0.002 % / 0.35 % |
| A-stub — a `ground_truth_contracts` L1/«direct» row exists for (contract, case) | 1,173 | 103 | 35.5 bn | 0.4 % / 1.5 % |
| B — same buyer named by the case (scope or GT institution) | 412 | 35 | 20.1 bn | 0.1 % / 0.8 % |
| C — vendor × window, any buyer | 273,803 | 1,335 | 2,348 bn | 99.4 % / 97.7 % |

The A-stub rows are not evidence: 1,353 come from `gt_phase_b_promote_l1.py`, 181 from `gt_phase_b_backfill_existing_l1.py`; their `source_reference` is the case-level string (top values: «ARIA T3 queue pattern analysis» 580, «ASF Cuenta Publica 2019-2021; case-level» 200, «ASF technology audits; case-level» 121, «case-level (no source field)» 112). Sample #5 shows the effect: a 2024 SEMAR medical-supplies purchase from Cyber Robotic «attested» by «ASF technology audits» for an IT-overpricing case. **Only 8 contract rows in all of GT carry a source that names the contract** (L4 pilot: Oceanografía c173 ×6, COVID c1 ×1, Tren Maya c21 ×1); 5 fall inside a positive window.

### Positives by discovery path (circularity)

| Path | Train contracts | % train | Gold contracts |
|---|---:|---:|---:|
| External origin + independent source (prov A/B) | 37,351* | 14.0 % | 1,009 |
| Model origin, later confirmed externally | 34,049* | 12.8 % | 584 |
| **No independent source** (model-only, self-citation, generic) | **195,187** | **73.2 %** | 7,208 |

\* split by `evidence_summary`; by `provenance_tier` alone it is A 38,123 · B 33,391 · C 195,073 (71 %). By `case_origin` alone: model/mining/NULL 171,291 (62 %) vs «external» 95,296 — but «external» is inflated by the 261 mis-tagged ARIA cases.

## 3. Sample audit (40 positives)

Stratified, one contract per case, seed 7: 12 A-stub, 3 B, 11 C external-origin, 5 C model-origin-externally-confirmed, 9 C model-only. Each checked against the case's stored sources/notes; web checks (read-only) for #2, #13, #14. Full dump: scratchpad `sample.txt`.

| Verdict | n | Rows |
|---|---:|---|
| Confirmed (source names this contract/procedure) | **0** | — |
| Plausible (source documents misconduct by this vendor with this buyer in this period/scheme) | 5 | #2 Lab. Imperiales — SSA vaccine DA 2018 (SFP sanction concerns contract CENSIA-0015AD/2018, not this DTP one) · #21 Probiomed — IMSS 2014 (IMSS sued for collusive prices 2016) · #29 Impromed — IMSS lab tests 2020 (inhabilitated 2025 for false info in IMSS contracts) · #30 Savi — IMSS 2014 (IMSS inhabilitación 2015) · #31 Abalat — INCICh 2017 («cártel de la sangre» column) |
| Vendor-level only (real allegation/sanction, but other buyer, period or scheme) | 9 | #5 Cyber Robotic SEMAR 2024 · #10 Grupo Libra SEP 2016 (sanction by SAT) · #17 Prefarma (story is about affiliate Pisa) · #18 Biomics/Maypo IMSS 2022 (BIRMEX 2025 scandal) · #20 Operadora Abasto PGR 2010 (INE 2019 audit) · #25 Casanova Vallejo, Canal 11 2012 (ISSSTE ambulances, sanction 2022) · #26 Ralca IMSS 2022 (Forbes 2019 list; outside its own tightened window) · #27 Gabor 2015 (2023 Conaliteg story) · #28 Maypo Hospital Juárez 2010 |
| Unsupported (no independent source, or source says nothing about vendor) | 26 | all 9 model-only (Pinsa, Cardiopace, Althos, Marindustrias, Bioma, GSI at IPN, Grupo Vida, Protección y Alarmas, Soluciones Saludables) · ARIA self-citations (AMC Biomedical, Alpharma, Agroreyvi, Calzado Industrial, Ambiderm, Climatización, El BC Supply, FJ Representaciones, Tecrom) · no-source capture cases (Asfaltos Procesados — a Nayarit state contract, ARRENDAMIENTO… at BUAP, Torreblanca, Pavimentos Guerrero) · #16 Arvien, #19 GADEC (no corroboration found) · #13 Soluciones Logísticas Inteligentes in Segalmex (no public link found) · #14 Bruluart in COVID (a 2021 competitive medicines tender; no link found) |

**Precision** (confirmed + plausible): **5/40 = 12.5 %, Wilson 95 % CI 5.5–26.1 %**. Re-weighted to the population strata (A 0.4 %, B 0.1 %, C-ext 36.6 %, C-mconf 12.6 %, C-model 50.2 %): **≈11 %**. Counting vendor-level-only as positive: 14/40 = 35 % (22–51 %), weighted ≈33 %. Contract-level confirmation: 0/40 (upper 95 % bound 8.8 %).

**Vendor↔case mismatches found:** #5 (IT-overpricing case attached to a vendor whose documented scandal is 2020 ventilators; label spans 2015–24 any buyer), #13 (Segalmex case → logistics vendor with no public tie), #14 (COVID emergency case → pre-existing pharma distributor's ordinary tender), #18 (BIRMEX-2025 case labels 2020–24 IMSS contracts), #4 and #37 (capture cases whose sampled contract is at a different buyer: Nayarit state, IPN). **Vendor 441 Tradeco × case 4 Odebrecht:** confirmed wrong-case; already `is_false_positive=1`, `gt_split='excluded_fp'` locally (L1b2b, Jun 2026), so it is not in training. Check prod drift (`gotcha_prod_gt_drift.md`) before publishing anything that lists Odebrecht vendors.

## 4. Label-quality history (what was already fixed)

- **Jun 11 2026 audit** (`docs/GT_LABEL_QUALITY_AUDIT.md`): labels = vendor × window; 26 % strong-ID matches; 0.5 % evidenced contracts. L2+L3 applied: curriculum weights capped by match tier (T3 circular 0.15).
- **L1 batches 1–2b** (`GT_L1_VERIFICATION_BATCH{1,2}.md`, `GT_L1_BATCH1_REVIEW_EXTERNAL.md`): top 44 vendors by value reviewed; 23 windows tightened, 12 FPs (Oracle, NAICM-ICA, Toka, Tradeco, Mainbit, Efectivale homonym…), 1 re-point. **But the tightened windows were written to `year_start/year_end`, and training reads `COALESCE(fraud_year_*, year_*)` — so for 20 cases (1, 13, 14, 15, 19, 24, 36, 64–67, 75, 84, 88, 104, 105, 119, 120, 478, 482) the old wide window still applies: 6,254 positives, 14 vendors, 51.0 bn MXN outside the corrected window.** New finding.
- **L4 pilot** (`GT_L4_EVIDENCE_MINING_BATCH1.md`): +8 contract-level evidenced rows; established the structural ceiling (Estafa Maestra, Lozoya, IMSS-ghost are not in COMPRANET at contract level).
- **L5 gold anchor** (`GT_L5_GOLD_ANCHOR.md`): gold = T1 match ∩ non-`model_discovery`, 120 vendors; fixed the calibrator's random split that leaked gold into training.
- **Oct 22 pre-registrations** (`_v10/RESULT{,_2}.md`): v0.10 quarantined provenance-C model_discovery links (925) and used hard negatives, but **v0.10 lost the rematch and the shipped v0.9.2 kept v0.9.1's labels** (all non-FP links).
- **Prod GT drift** (`gotcha_prod_gt_drift.md`): Sep 30 prod had 5 FP flags vs 12 local, missing re-link and L4 evidence; synced by hand. No pipeline ships GT edits.
- Not fixed: the 261 `media_report` cases that cite ARIA; 61 cases with no window (whole book positive); `ground_truth_contracts` stubs posing as L1.

## 5. Circularity and the published AUC

- The **forward-chain test already excludes `model_discovery`**: its positives are `labels_v10` class `positive` (origin media/official/audit) on gold vendors; `without_positive_ab` n_pos = 174 = all. So «0.827» is not computed on model-discovered cases by origin.
- But origin is mis-tagged: of gold external-origin vendors active 2019+, **20 of 66 come from cases whose only source is an ARIA self-citation**.
- Read-only check on **live v0.9.2 scores** (gold vendors are excluded from every fit; not forward-chained, not size-controlled; 30k random non-GT contracts 2019–25 as negatives):

| Positives | Contracts (AUC) | Vendor means (AUC) |
|---|---|---|
| gold 2019+, all | 4,917 (0.899) | 71 (0.920) |
| gold, external origin + independent source (prov A/B) | 2,555 (**0.954**) | 46 (0.934) |
| gold, external origin, self-citation/no source (prov C) | 1,278 (**0.797**) | 20 (0.926) |
| train sample (in-sample), prov A/B | 4,073 (0.946) | 75 (0.919) |
| train sample (in-sample), prov C | 10,764 (0.744) | 760 (0.835) |

Reading: circular labels do **not** inflate the headline. Independently sourced cases are big, visible national suppliers that the model ranks easily (size; `docs/MODEL_CARD_v0.9.2.md` § 4: prior value alone 0.790). The C-tier cases are harder and noisier. The weakness is construct validity: positives are vendor-years of vendors with a public record, not corrupt contracts. A per-tier forward-chain rerun (harness `test_v10.py` with `positives_from` restricted) is the proper test; not run here (one-look rule, and it needs the integration DB).

## 6. Recommendations

**Tiered labels** (new column on the link→contract expansion, not a schema rewrite):

| Tier | Definition | Today |
|---|---|---|
| A | contract/procedure named in an external source (ASF observation, court file, SFP resolution, press with the number) | 8 contracts |
| B | independent source names the scheme **and** the buyer **and** the period; contract matches all three | ~400 + the plausible share of A/B-provenance cases (sample suggests ~10 % of C) |
| C | vendor × window from a case with an independent source | ≈71k train contracts (prov A/B) |
| D (drop or 0.15) | no independent source: model-only, ARIA self-citation, generic unverified | ≈195k train contracts (73 %) |

1. **Retrain/eval:** train on A+B+C (weights 1 / 0.8 / 0.4), quarantine D; validate on A+B only; report forward-chain AUC **per tier** and size-controlled. This is the provenance ablation already listed as #7 in `docs/DIFFERENTIATION_2026-10-31.md` (S effort). A alone is too small to validate today; until it grows, report «AUC on independently sourced cases» (prov A/B) as the honest anchor.
2. **Fix before any retrain:** (a) make windows read `year_*` when L1 tightened them (or copy tightened years into `fraud_year_*`); (b) re-tag the 261 ARIA-cited `media_report` cases as `model_discovery`; (c) give the 61 no-window cases a window or drop them; (d) stop treating `gt_phase_b_*` stubs as L1; (e) add a GT sync step to deploys.
3. **PU c and HR:** c_pu (0.436) is fitted as «share of positives labelled»; dropping D shrinks the labelled set by ~70 %, so c will probably fall (not estimated here) and may **break the scorer guard c_pu > 0.30**. HR is a policy target (10 %) re-pinned through the intercept, so it survives; the score scale and tier shares will move. The guard must be re-justified, not met by keeping noisy labels. Pre-register this.
4. **Public claim:** keep «AUC 0.827», but say what it is: «ranks vendor-years of suppliers later linked to documented cases above others, forward in time; 0.741 holding size fixed». Do not say or imply «detects corrupt contracts» or «trained on documented corrupt contracts». Add one line: «labels mark every contract of a case vendor in the case's years; about 9 % of cases have an independently verifiable source».
5. **Raising tier A (effort):** ASF *Informes Individuales* list contract numbers in observations — the L4 pilot yielded 8 confirmed of 13 proposals across 6 cases (~1 analyst-day per marquee case with agents + adversarial verifier). Realistic: 30–60 cases where fraud is COMPRANET-resident (Oceanografía, Segalmex, IMSS pharma, SCT works) → a few hundred A contracts in 3–4 weeks. Court files (FGR/TFJA) are slower and partly sealed. SFP inhabilitación resolutions often cite the contract (as for Lab. Imperiales CENSIA-0015AD/2018) — the cheapest next source; ≈35 cases already name one.

## Sources used for web checks (read-only)

- [Excélsior — Inhabilitan a empresa que falló con vacunas contra sarampión](https://www.excelsior.com.mx/nacional/inhabilitan-a-empresa-que-fallo-con-vacunas-contra-sarampion/1329564)
- [Vanguardia — desabasto de vacuna contra sarampión 2018](https://vanguardia.com.mx/articulo/el-gobierno-de-pena-nieto-dejo-de-vacunar-contra-el-sarampion-en-2018-se-investiga-el)
- Searches for «Soluciones Logísticas Inteligentes» + Segalmex/Liconsa and Bruluart + IMSS COVID returned no linking source.
- Case-stored URLs (Infobae, Contralínea, Expansión, Forbes, El Universal, Milenio) read from `ground_truth_sources` / `evidence_summary`.
