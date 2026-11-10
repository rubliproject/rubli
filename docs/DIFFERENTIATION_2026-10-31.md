# Differentiation memo: RUBLI vs the Mexican PU-learning literature (2026-10-31)

> Strategy memo, no code. Nothing on the site, in the DB or in the model was changed.
> **Read:** `CLAUDE.md`, `docs/SCORING.md` and `docs/MODEL_CARD_v0.9.2.md` at `origin/main` (3a7f7d03); `docs/ARIA_SPEC.md` (origin/main); `docs/MODEL_MONITORING_2026-10-30.md` (`origin/feat/model-monitoring`); `docs/METHODOLOGY_LIT_REVIEW_2026-10-30.md`, `docs/PROCUREMENT_LAW_STUDY_2026-10-30.md`, `docs/BACKLOG_RULES_ENGINE.md` (working tree); `_v10/PREREGISTRATION.md`; `docs/press/OUTREACH_LIST_2026-10-31.md`.
> **Papers read this session:** Medina-Hernández, Kertész & Fazekas, arXiv:2512.19491v2 (26 Dec 2025, full HTML); Aldana, Falcón-Cortés & Larralde, arXiv:2211.01478v2 (14 Dec 2022, full HTML).
> **Not found:** `docs/CAPTURE_FRAMEWORK_2026-10-30.md` (no such file on any branch I could see). § 3 #8 uses what exists instead (`captura_pairs`, ARIA P6, the lit review § 6).
> **DB facts:** local `RUBLI_NORMALIZED.db`, opened read-only, 2026-10-31. Prod may differ.

---

## 0. Verdict

**No, RUBLI is not copying them. It does sit in the same method family, and our model on its own is not ahead.**

- **The model is a peer, not a leap.** The two projects share the core idea: PU learning on Mexican federal contracts, using red flags plus relationship and network features. Medina-Hernández et al. (hereafter **MKF**) have:
  - a richer feature set (60 features, 7 of their top 10 from networks);
  - a non-linear learner;
  - a cleaner, systematic, official label source (1,673 sanctioned firms).

  On the model alone, RUBLI is equal or weaker on several axes (§ 1).
- **RUBLI is ahead on the parts that make a score trustworthy and usable:**
  - strict as-of features with forward-chained evaluation;
  - a pre-registered, hash-frozen, one-look test that caught and disclosed our own look-ahead leak;
  - a size-controlled metric;
  - 3.18 M contracts scored publicly per contract, 2002–2026, including the post-CompraNet ComprasMX feed, refreshed weekly;
  - an investigation layer (ARIA) and an open dataset.

  MKF and Aldana et al. do not do these things. MKF label every contract of a sanctioned firm whatever its date, and do not state that their network features are as-of. Aldana et al. split at random by contract, so the same firm sits in both train and test.
- **The gap is easy to close and easy to widen.** The cheapest move that puts us clearly ahead is **prospective validation**: freeze and publish a hash of today's rankings before launch, then score them against later SAT 69-B, SFP and ASF records. Nobody in this literature has done that, and it costs about one day.

**Correction to `METHODOLOGY_LIT_REVIEW_2026-10-30.md` § 0.** The lit review says MKF recover «≈ 32 % more positives than red flags alone». That is not what they report. The abstract compares with **random guessing**: about 32 % more known positives and about 2.3 times better than random. In their transductive test, ranking by the CRI alone reaches an average lift of 0.63, against 2.3 for their HDSRF model. Fix the lit review line before anything is quoted.

---

## 1. Side by side

Legend: **≠+** genuinely different, and better for our purpose · **=** equivalent · **−** we are weaker · **≠** different, with neither clearly better.

| Dimension | MKF (arXiv:2512.19491) | Aldana et al. (arXiv:2211.01478) | RUBLI v0.9.2 + ARIA | Mark |
|---|---|---|---|---|
| **Data: years and source** | CompraNet 2011–2022. 2,301,278 contracts; 5,304 buyers; 259,534 suppliers. Federally funded, including state and municipal buyers. Procedures linked from p-CompraNet (1.85 M) and p-OCDS (0.83 M) | CompraNet 2013–2020. 1,540,386 contracts | 2002–2026, about 3.18 M contracts. CompraNet structures **A** 2002–10, **B** 2010–17, **C** 2018–22 and **D** 2023–Sep 2025, plus **E**, ComprasMX open-data CSVs from 2025–26 (about 123 K scored, refreshed weekly). Value validation: reject above 100B, flag above 10B | **≠+** Longest span. We are the only one past the CompraNet freeze, which matters most for live use |
| **Data: procedure / bid detail** | Procedure-level fields (single bidding, submission and decision periods, Benford MAD). Single bidding is missing for more than 85 % of records | Single-bidder fraction, approximated | Single bid from procedure grouping. Co-bid Herfindahl. Partida codes (D/E). No losing-bid amounts | **=**. They have the decision period and Benford; we have partida |
| **Labels: source** | **Official sanctions.** SAT 69-B EFOS (12,396 firms) plus SFP PCS (2,139; releases from 2021, 2023 and 2024). 1,673 firms match the contracts (748 EFOS, 925 PCS) | SAT lists (definitive *and presumed*) plus the open-data sanctions list. 33,494 contracts (2.2 %) | **Documented cases.** 1,417 cases and about 1,556 vendors. By origin: 989 `model_discovery`, 361 `media_report`, 25 `official_record`, and the rest analyst or ARIA mining. By provenance tier: A 65, B 61, C 1,291. 305 K contracts linked within case windows (`fraud_year_*`, institution scope) | **≠** Different construct. Theirs is systematic and official but reflects enforcement bias. Ours is richer per case (scope, years, institutions) but **circular**: 70 % come from the model itself |
| **Labels: timing** | **Every contract** of a sanctioned firm counts as positive, whatever the sanction date. They justify this by showing no deterrence: only 16 % of firms have post-sanction contracts | Same: every contract, whatever the date | Case windows (`fraud_year_start/end`, institution scope). The NULL end year is capped and 2026 is never labelled | **≠+** Our labels are scoped in time and place |
| **Labels: noise** | Acknowledged (SCAR violated, political bias in sanctioning). No noise model | Acknowledged | Provenance tiers and confidence weights. The `model_discovery` circularity is disclosed. Pre-registration 1 quarantined it, but **the shipped v0.9.2 keeps v0.9.1's labelling, including `model_discovery`** | **−**. We document the noise better, but the shipped model still trains on it |
| **Overlap with their labels** | — | — | Joined by RFC only: 86 EFOS-definitivo vendors and 17 SFP vendors. Only 22 of 2,395 SFP rows carry an RFC. Just 40 GT vendors are on EFOS and 6 on SFP | Their label set and ours are **almost disjoint**. That makes a dual-label analysis (§ 3 #2) informative, but name matching is the bottleneck |
| **Features** | 60 features (69 after encoding): CRI and its components, Benford, contract price, legal framework, supplier size, registry absence, fragmentation, buyer and supplier aggregates, neighbourhood CRI. **Network:** coreness ×3, eigenvector, betweenness, closeness, degree, strength and clustering on the bipartite graph and its projections. Computed per year; as-of status not stated | 19 features: contract, buyer–supplier relationship, buyer features, and 4 approximate risk factors | 17 as-of features (16 non-zero): rt4 breadth, price volatility and ratio, prior institutional HHI, vendor concentration, co-bid HHI, network member count, partida z-scores, same-day count, single bid, direct award. **Only one network feature** | **−** Fewer features, and network structure is thin. **≠+** on discipline: every feature is built from strictly prior years with trailing baselines (`contract_features_v10`), plus an integrity check (`build_v10.py --check`) |
| **Model** | PU Bagging (SVM) vs **Hellinger-distance stratified random forest (HDSRF)**. HDSRF wins | «Hyper-forest» of 45 random forests on balanced subsamples | ElasticNet logistic regression (C 0.003725, l1 0.9188) plus Elkan–Noto PU scaling (c 0.436) | **−** on capacity: we miss non-linear effects such as MKF's direct-award U-shape. **≠** We gain exact additive explanations |
| **Calibration** | A held-out fold «for calibration», with no further detail | A threshold of 0.61 picked on a ROC calibration split | Documented policy. PU constant c 0.436 (CI 0.377–0.497). Temperature T 0.530, picked to bound saturation. Intercept −3.633, set so the high-risk rate (HR) lands near 10 %. Guards: intercept < −0.5, c > 0.30, HR 2–15 %. Display squash above 0.60. Brier non-inferiority gate | **≠+** on transparency. **−** on substance: the output is a ranking policy, not a calibrated probability, and «OECD 2–15 %» has no source (lit review § 0) |
| **Validation** | 4-fold stratified CV, split by company, with undersampling of the top 5 % of suppliers. **Inductive test:** train on early sexenio years, predict 2017 (EPN) and 2021 (AMLO). Permutation tests | Random 50/20/30 split **by contract**. Firm-level relationship features are then shared between train and test, so the AUC of 0.94 is likely inflated | Forward chain Y = 2019…2025 (train ≤ Y−1) at vendor-year level, with a paired vendor-cluster bootstrap (1,000 resamples). Gates G1–G6 were **pre-registered, SHA-256-frozen and looked at once**. Pre-registration 2 showed v0.9.1's lead (M2 0.906) was look-ahead; honest M2 is 0.741. That finding was disclosed and the model replaced | **≠+** Strongest point. MKF's inductive test is the closest equivalent, but their features and labels are not stated as-of |
| **Metrics** | Tie-aware cumulative gain and lift. Average lift: HDSRF 2.3, PU Bagging 0.55, CRI alone 0.63. Inductive average gain 0.31 / 0.29 | Accuracy 0.92, balanced accuracy 0.89, AUC 0.94 | M1 vendor-year AUC 0.827 [0.763, 0.883]. **M2 size-controlled AUC 0.741** [0.687, 0.794]. Label-free baselines: prior value alone gives 0.790 / 0.698. AUC for vendors with no history: 0.741 | **≠+** The size control and the baselines say how much is just «big vendor». **The numbers are not comparable across the three papers** (different labels, units and metrics) |
| **Outputs** | A paper. A ranking that is not published. Data «available upon request» | A paper | A public indicator per contract (3.18 M, weekly); vendor, institution and category dossiers; **ARIA** (IPS tiers 1–4, P1–P6 rule patterns, FP screens, case memos); /captura; «Gasto a ciegas» (Cuenta Pública vs register); weekly drift monitor | **≠+** Product and workflow. No academic peer ships this |
| **Interpretability** | Global SHAP (TreeExplainer); correlated network features blur attribution | Permutation importance | Linear model, so the per-contract waterfall is exact. ARIA patterns are plain-language rules. Legacy v5.2 SHAP feeds the IPS (a weakness: an older model inside the IPS) | **=** to **≠+** at contract level. Their SHAP findings are more substantive science |
| **Openness** | Preprint; data on request; reuses public PU code | Preprint (under revision at GIQ in 2022) | Open source. Dataset 2026.10 on Zenodo with a DOI. Model card, datasheet, pre-registrations in the repo | **≠+** |
| **Theory / substantive findings** | Network centrality dominates. Red flags help mainly in competitive tenders. Direct-award effect is non-linear | Buyer–supplier relationships dominate | Size carries most of the signal (M2 vs M1). Breadth (rt4) works against single-buyer capture. Classic flags (DA, single bid) have about zero weight | **=**. Ours are honest disclosures more than new science |

**Not comparable, say it plainly:** MKF's lift of 2.3, Aldana's AUC of 0.94 and our M1 of 0.827 / M2 of 0.741 measure different things on different labels. Never print them side by side as a league table.

---

## 2. What is genuinely novel in RUBLI today (strict)

**Novel, and defensible in a methods section:**
1. **Leakage-audited evaluation as a process.**
   - Strictly as-of features, forward-chained vendor-year testing, and a size-controlled AUC (M2) next to label-free baselines.
   - Pre-registered gates with a SHA-256 freeze and a one-look rule.
   - A published negative result: our own earlier model's advantage was look-ahead (0.906 → 0.741).

   We found nothing like this in the Mexican procurement-ML literature. It is a methodological contribution, not a new algorithm.
2. **Coverage past the CompraNet abolition.** Structure E (ComprasMX open-data CSVs) is scored with the same frozen model and refreshed weekly. It has a drift monitor by structure (D vs E within a few hundredths on every input). No published work covers 2025–26.
3. **Public scores per contract at full scale, with dossiers.** The research peers publish rankings in aggregate or not at all.
4. **A curated case base scoped in time and place.** 1,417 cases with provenance tiers and fraud windows, as labels rather than whole-firm sanctions. *Caveat: most cases are model-discovered, so the curation is novel but its label quality is not yet better than sanctions.*
5. **«Gasto a ciegas».** Budget-execution visibility: Cuenta Pública exercised spend vs contracts in the register. This is original, and not a risk model.

**Not novel. Do not claim it:**
- PU learning, the Elkan–Noto correction, ElasticNet, temperature scaling;
- red flags, CRI components, HHI concentration, Mahalanobis anomaly, SHAP;
- «network features matter» and «relationships matter more than contract attributes». MKF and Aldana showed this first.
- ARIA's design idea of «priority list + patterns + memo» has precedents in VigIA (Bogotá) and Gallego et al. (Colombia).
- ARIA's IPS weights are hand-set and not validated against random audits. It is a useful tool, not a validated method.

---

## 3. Enhancements that would put RUBLI clearly ahead

Ranked by impact × feasibility with our data. Effort: S ≈ 1 agent-day, M ≈ 2–4, L ≈ a week or more. Every model change still goes through pre-registration and owner sign-off.

| # | Enhancement | What it proves | Data needed (exists?) | Effort | When |
|---|---|---|---|---|---|
| **1** | **Prospective pre-registration.** Before launch, freeze the ranked vendor list (v0.9.2 vendor scores, ARIA tiers, top-k cut-offs) with its SHA-256, deposited on Zenodo or as a signed git tag. Pre-register outcomes: new SAT 69-B *definitivo* listings (published in the DOF), new SFP/SABG inhabilitaciones, and ASF findings naming the vendor, all at 12 and 24 months. Metrics: lift and recall at top 1 / 5 / 10 %, lead time, size-matched controls | That the indicator predicts **future official action it could not have seen**, the one test immune to label circularity and look-ahead. No peer has it | Yes: `aria_queue`, `vendor_stats`, the scorer artifact. Outcome feeds: 69-B is downloadable now; SFP needs a scraper or snapshot. Publish vendor IDs and the hash only, never RFCs of personas físicas | **S** | **Pre-launch (must be dated before Nov 17)** |
| **2** | **Dual-label validation and agreement analysis.** Evaluate v0.9.2 on **MKF's label definition** (EFOS definitivo + SFP), held out of training and dated. Use EFOS *desvirtuados* (1,908) as a negative control. Report GT-vs-sanction agreement (overlap, Cohen's κ on vendor flags) and MKF's own metric (tie-aware lift and gain) next to our M1/M2 | Apples-to-apples with MKF, plus label independence: is our model a «documented-case detector» or does it generalise to official sanctions? | Tables exist (EFOS 14,055; SFP 2,395). **Bottleneck: matching.** RFC-only joins give 86 / 17 vendors, against MKF's 1,673 matched firms. Reuse ARIA's normalised-name match and `vendor_canonical`, and measure precision on a hand sample. Get the 2023/2024 PCS releases MKF used | **M** | Start pre-launch (matching and descriptive agreement); full result post-launch |
| **3** | **A transparent rule layer beside the ML score.** (a) A GTI-style CRI baseline reported on the same forward chain. (b) Legal-compliance checks from the procurement-law study: art. 42/55 by-amount awards above the PEF cap (683 contracts, about 9,100 MDP, 2023–25); contracts signed inside an SFP inhabilitación window (246 contracts, 58 vendors); art. 41 fr. I sole-source claims in generic categories | That the ML adds value over the standard index (MKF: CRI alone 0.63 lift), and that a reader can see legally grounded indicators that need no model. Feeds the rules engine (#6) | Yes (D/E for the legal checks; 2004–21 for the inhabilitación window). The splitting test is **not** feasible without each buyer's budget band | **M** | Methodology note pre-launch; `legal_checks` table with 50-case manual review per rule post-launch |
| **4** | **As-of network features** (coreness, eigenvector, PageRank, community; per year from prior years only) in a pre-registered v0.11 | Whether MKF's central finding (network centrality dominates) **survives strict as-of construction**. Either answer is publishable | Yes: contracts; `vendor_graph_features` is static and must be rebuilt per year | **M** | Post-launch |
| **5** | **Per-score uncertainty.** Split-conformal on the forward-chained calibration years, or vendor-cluster bootstrap refits, into `risk_confidence_lower/upper` (columns exist, unused). Show bands on dossiers | Stops readers comparing 0.61 with 0.63. Neither peer gives per-item uncertainty | Columns exist; bootstrap harness in `_v10` | **M** | Post-launch |
| **6** | **Human review loop and blind audit of ARIA.** The rules-engine TP/FP workflow (`docs/BACKLOG_RULES_ENGINE.md`), plus a stratified random tier-4 sample reviewed blind alongside tiers 1–3 | ARIA's uplift over chance, measured by analysts: the only evidence that the IPS beats random audit selection. Reviewed TPs become clean, non-circular labels | `risk_feedback` exists, 0 rows. Needs analyst time and a reason-code schema | **M** (mostly people) | Post-launch; write the protocol pre-launch |
| **7** | **Label-noise ablation.** Retrain on provenance A+B only (126 cases) and on «no `model_discovery`»; compare top-k overlap and M2 | How much the circular labels move the model. Answers the obvious reviewer objection | Yes (`provenance_tier`, `case_origin`) | **S** | Post-launch (prereg) |
| **8** | **Capture measures, the Fazekas way.** Sexenio-turnover rewiring test (Fazekas & Wachs 2020); community-level ranking (Fazekas & Tóth 2016) on `community_id`; P6 / `captura_pairs` as a separate track. (No `CAPTURE_FRAMEWORK` doc was found.) | Fills our model's admitted blind spot (rt4 works against capture) with a measure that builds on the same authors | Yes (`sexenio_year`, `institution_hhi`, `captura_pairs` 4,038) | **S–M** | Post-launch |
| **9** | **Near-real-time ComprasMX.** Move from weekly CSVs to the Postor Abierto change feed (daily); report «days from signature to indicator» | Live early warning, which a paper cannot offer | Feed reverse-engineered (memory: SOURCE_SCOUT 2026-10-19). Scoring is frozen-artifact, so it is cheap | **M** | Post-launch |
| **10** | **Price benchmarking** for medicines (CUCoP/partida + description, then unit price vs IMSS consolidated or international reference) | Absolute overpricing, not sector-relative `price_ratio` | **Blocked:** no quantity or unit-price column; needs extraction from descriptions with local models only (no paid API) | **L** | Post-launch |

**Top 5 by impact × feasibility:** #1 prospective pre-registration · #2 dual-label validation on MKF's label definition · #3 CRI baseline plus legal-compliance checks · #4 as-of network features · #5 per-score uncertainty. #6 (blind ARIA audit) is the highest-impact item for ARIA specifically, but it depends on analyst time.

**Pre-launch shortlist (by Nov 10 freeze):** #1 in full; #2 matching work plus the descriptive agreement table; #3 as a methodology note only; the protocol for #6. Everything else waits for the next pre-registration.

---

## 4. Positioning paragraph (for /methodology and the press guide)

**ES**
> RUBLI se apoya en una línea de investigación que ya demostró que el aprendizaje automático puede ordenar contratos públicos mexicanos por riesgo. Aldana, Falcón-Cortés y Larralde (UNAM, 2022) mostraron que las relaciones entre comprador y proveedor dicen más que los atributos de cada contrato. Medina-Hernández, Kertész y Fazekas (Central European University, 2025) aplicaron aprendizaje con positivos y no etiquetados a 2.3 millones de contratos federales de 2011 a 2022, con las empresas sancionadas por el SAT y la Función Pública como casos conocidos, y encontraron que la posición de un proveedor en la red de compras es la señal más fuerte. RUBLI usa la misma familia de métodos y les debe mucho. Lo que agrega es otra cosa: cada variable se calcula solo con lo que se sabía antes del contrato, el modelo se evalúa año por año hacia adelante con reglas fijadas por escrito antes de verlo (y así encontramos y corregimos un error propio), cubre de 2002 a 2026, incluidos los contratos de ComprasMX, y publica un indicador para cada contrato, que se actualiza cada semana, con expedientes y una fila de investigación abierta a cualquiera. Los resultados de los tres trabajos no se pueden comparar número contra número: usan etiquetas y pruebas distintas.

**EN**
> RUBLI builds on research that has already shown machine learning can rank Mexican public contracts by risk. Aldana, Falcón-Cortés and Larralde (UNAM, 2022) found that buyer–supplier relationships say more than the features of any single contract. Medina-Hernández, Kertész and Fazekas (Central European University, 2025) applied positive-unlabeled learning to 2.3 million federal contracts from 2011–2022, with firms sanctioned by the tax authority (SAT) and the Ministry of Public Administration (Función Pública) as known cases, and found that a supplier's position in the contracting network is the strongest signal. RUBLI uses the same family of methods and owes much to this work. What it adds is different. Every input is computed only from what was known before the contract. The model is tested year by year going forward, against rules fixed in writing before the test was run, which is how we found and corrected a flaw in our own earlier model. Coverage runs from 2002 to 2026, including ComprasMX contracts. And the result is published as an indicator for every contract, updated weekly, with dossiers and an investigation list open to anyone. The headline numbers of the three projects cannot be compared directly: they rest on different labels and different tests.

(Mark both arXiv items «preprint» in the reference list until a journal version appears.)

---

## 5. Should we contact the authors (Fazekas / GTI, Medina-Hernández)?

**Recommendation: yes, a short courtesy note in the week of the Nov 10 freeze, before launch.** It should not be a collaboration ask. Offer the collaboration (dual-label validation, #2) as an open door.

**Pros**
- **Fair representation.** They can correct how we describe their work before it goes to the press. This prevents a public «they misread our paper» moment.
- **Credibility with journalists and academics.** Fazekas and GTI are the reference point for procurement red flags; GTI runs ProACT with the World Bank. A neutral or positive reply is worth more than any metric.
- **Concrete gains.** Their sanction-matching (1,673 firms vs our 103 by RFC) and the 2023/2024 PCS releases are exactly the bottleneck for #2. They may share the label list or the matching method.
- **A natural joint result.** Their «network features dominate» plus our as-of harness gives #4, a paper neither side can write alone.

**Cons and risks**
- They may see RUBLI as a competing non-academic product, or object to public per-vendor scores (GTI is careful about naming firms).
- **Pseudonymous release.** Any exchange touches the owner's identity policy. Send from the project address, and decide what identity is shared before writing.
- Time. A request for review before Nov 17 is unrealistic, so do not make launch depend on a reply.
- If they find a flaw, it surfaces before launch. That is a pro, though it will not feel like one.

**Suggested message (EN, from the project address; owner edits and sends; do not send without the owner's go)**

> Subject: RUBLI, an open Mexican procurement risk indicator that builds on your PU-learning paper
>
> Dear Dr Fazekas, Mr Medina-Hernández and Prof. Kertész,
>
> We run RUBLI (rubli.xyz), an open-source project that publishes a risk indicator for Mexican federal contracts from 2002 to 2026, including the post-CompraNet ComprasMX data. Our model is in the same family as your «Learning from sanctioned government suppliers» (arXiv:2512.19491): positive-unlabeled learning with red-flag and relationship features. We cite your paper on our methodology page and want to be sure we describe it accurately. The draft paragraph is below.
>
> Two things that may interest you. First, we compute every feature strictly as-of the contract year and test forward-chained, under pre-registered gates. That test showed our earlier model's lead came from look-ahead features, and we replaced it. Second, our labels are documented cases scoped by time and institution, not sanction lists, and they overlap very little with the EFOS/PCS firms. We would like to evaluate our indicator on your label definition, and we would welcome a conversation if a joint check, for example whether network centrality survives strict as-of construction, is of interest.
>
> Model card, pre-registrations and dataset: [links]. No reply is expected before our public launch on 17 November.
>
> With thanks for the work,
> The RUBLI project

(Spanish version for Larralde / Aldana at UNAM, priority B in `OUTREACH_LIST_2026-10-31.md`: same structure, cite arXiv:2211.01478.)

---

## 6. Open items

- Fix the lit review's «32 % more than red flags» line (§ 0).
- `CAPTURE_FRAMEWORK_2026-10-30.md` was referenced but not found. Confirm whether it exists on an unpushed branch.
- The «OECD 2–15 %» guardrail is still unsourced (lit review § 0). Reword it before any comparison text names the OECD.
- The model card says v0.9.2 keeps v0.9.1's labelling, including `model_discovery`. Any public «our labels are independent» claim is false until #7 or #2 is done.
