# Pre-registration 3 — prospective forecast (frozen November 2026)

**Status:** DRAFT until the freeze runs on prod (§ 10) and its hashes are timestamped (§ 9). After that, this file is frozen: any change is a dated amendment at the bottom, never an edit.
**Source of the idea:** `docs/DIFFERENTIATION_2026-10-31.md` § 3, enhancement 1; buyer-level outcome from `docs/FRONTIER_STUDY_2026-10-31.md` § C. **Model:** v0.9.2 (`docs/MODEL_CARD_v0.9.2.md`, run `CAL-v92-asof-20261022`). **Queue:** ARIA (`docs/ARIA_SPEC.md`, IPS tiers 1–4). **Freeze script:** `backend/scripts/freeze_forecast.py` (tests `backend/tests/test_freeze_forecast.py`).

---

## Resumen (ES)

Antes del lanzamiento congelamos, con fecha y huella digital (SHA-256), dos predicciones de RUBLI tal como están hoy.

1. **Proveedores.** La lista ordenada: el nivel de ARIA (1–4), el puntaje IPS y el indicador de riesgo v0.9.2 promedio y máximo de cada proveedor. Junto a ella, una muestra de control: proveedores elegidos al azar (semilla fija) del mismo sector, del mismo tamaño y de la misma época de entrada al registro que los proveedores de los niveles 1 y 2.
2. **Compradores.** Para cada institución que compró al menos 100 millones de pesos en los 12 meses previos, qué parte de su gasto se llevó su proveedor principal. Con eso anticipamos qué instituciones tendrán, en 2027, un solo proveedor con la mayoría de su gasto.

A los 12 y 24 meses comprobaremos qué proveedores aparecieron **después** de la fecha de congelamiento en fuentes oficiales que RUBLI no puede ver hoy: la lista definitiva del artículo 69-B del SAT (DOF), los proveedores sancionados por la Función Pública (SFP/SABG) y las auditorías de la ASF que nombran al proveedor. Y comprobaremos qué instituciones quedaron en manos de un proveedor mayoritario en 2027. La prueba tiene éxito si los niveles 1 y 2 aparecen en esas listas más a menudo que controles comparables, o si la concentración de 2027 se anticipa mejor que al azar. Publicaremos el resultado sea cual sea.

Es una prueba prospectiva: no depende de nuestras propias etiquetas (70 % de nuestros casos los encontró el propio modelo) ni de información del futuro. Mide **acción oficial, no corrupción**: las sanciones reflejan lo que las autoridades decidieron perseguir. Y es probable que la parte de proveedores no alcance a decir nada: las sanciones nuevas son pocas (§ 5).

La lista es un conjunto de **indicadores de riesgo**, no de acusaciones. Hoy solo publicamos huellas digitales. La lista con nombres queda privada hasta el análisis final; entonces publicaremos la versión sin personas físicas. Nunca se publica el RFC de una persona física.

## Summary (EN)

Before launch we freeze, with a date and SHA-256 fingerprints, two RUBLI predictions as they stand today.

1. **Vendors.** The ranked list: each vendor's ARIA tier (1–4), its IPS, and its mean and maximum v0.9.2 risk indicator. Next to it, a control sample: vendors drawn at random (fixed seed) from the same sector, size band and entry period as the tier 1–2 vendors.
2. **Buyers.** For each institution that bought at least 100 million pesos in the previous 12 months, the share its top vendor took. From this we predict which institutions will have one majority vendor in 2027.

At 12 and 24 months we check which vendors appeared **after** the freeze date in official sources RUBLI cannot see today: SAT's definitive Article 69-B list (DOF), the SFP/SABG sanctioned-supplier register, and ASF audits that name the vendor. And we check which institutions ended up majority-held in 2027. The test succeeds if tier 1–2 vendors appear on those lists more often than comparable controls, or if 2027 concentration is predicted better than chance. We publish the result whatever it is.

It is a prospective test: it depends neither on our own labels (70 % of our cases were found by the model itself) nor on information from the future. It measures **official action, not corruption**: sanctions reflect what the authorities chose to pursue. And the vendor part will likely be too small to say anything: new sanctions are rare (§ 5).

The list is a set of **risk indicators, not accusations**. Today we publish only fingerprints. The named list stays private until the final analysis; then we publish the version without personas físicas. A persona física's RFC is never published.

---

## 1. What is frozen

`freeze_forecast.py` writes six files. The manifest carries every definition; the essentials:

| Item | Definition |
|---|---|
| **Population** | Every vendor with ≥ 1 contract scored by v0.9.2 (`contracts.risk_score` not NULL, amount ≤ 100B MXN), minus public entities (`vendors.vendor_kind <> 'private'` or `public_labels.is_public_entity`). Companies and personas físicas both stay in, labelled by `public_labels.is_persona_fisica` (owner policy 2026-10-29). |
| **Per vendor** | `vendor_id`, name as published by CompraNet/ComprasMX, `entity_kind`, `company_rfc` (companies only; empty for personas físicas), primary sector, size decile, first-contract band, stratum, contract count, scored count, total value, **mean_risk** and **max_risk** (v0.9.2 `risk_score`, the published indicator), `rank_mean_risk`, **ARIA tier**, **IPS**, `rank_ips`, primary pattern. |
| **Status at freeze** | `gt_at_freeze` (in our ground truth); `efos_def_at_freeze` (RFC on SAT 69-B *definitivo*, or ARIA's flag); `sfp_at_freeze` (RFC on the SFP table, **or the vendor's name equals an SFP name after `api.sanctions.normalize_name`**, or ARIA's flag; every vendor sharing a sanctioned name is flagged, which is conservative for an at-risk set). |
| **Focal group** | ARIA tier 1 or 2 (prod 2026-10-28: 60 + 982 vendors). |
| **Controls** | Stratum = primary sector × size decile of total value × **first-contract band** (A ≤ 2010, B 2011–17, C 2018–22, D ≥ 2023, the COMPRANET structures). Per stratum, 5 × (focal vendors in it) non-focal vendors drawn with `random.Random(20261101)`, capped at what the stratum holds; strata in sorted order, candidates sorted by `vendor_id`. |
| **Buyers** | Institutions with ≥ 100 MDP over contracts dated in the 365 days ending on the freeze date (0 < amount ≤ 100B). Per buyer: total, number of vendors, top vendor id, **top_share** (the pre-registered predictor), HHI, `majority_now` (top_share ≥ 0.5). |
| **SFP baseline record** | A byte copy of the SFP source CSV that `sfp_sanctions` was loaded from (`sfp_source_<D>.csv`), and in the manifest the SHA-256 of the sorted (normalised name, `sanction_start`) rows of the table, plus the sorted-RFC hashes of the SFP and EFOS-definitivo tables. |

Files: `forecast_vendors_<D>.csv` (full), `forecast_vendors_companies_<D>.csv` (same rows minus personas físicas: the file published at O24), `forecast_buyers_<D>.csv`, `sfp_source_<D>.csv`, `forecast_manifest_<D>.json`, `SHA256SUMS` (all five). Every file is deterministic (rows sorted by id, six-decimal floats, LF line ends, no wall-clock time): the same DB and arguments give the same hashes.

**Guards.** The script stops, writing nothing, if the DB has no `model_calibration` row for v0.9.2, if `sfp_sanctions` is the pre-fix table (no `plazo_months`, i.e. `fix/sfp-sanctions-dates` not applied), or if SFP matching flags no vendor at all.

**Tier 1 already contains sanctioned firms.** ARIA's IPS includes an external-records term; without it the IPS cannot exceed 0.674, so tier 1 *requires* an external record, and every EFOS definitivo is forced into tier ≤ 2 (`docs/ARIA_SPEC.md`, "as implemented"). A vendor already on a list cannot be newly listed. Every vendor hypothesis is therefore tested **only on vendors not on that list at freeze**; the model-only hypothesis (H2) uses the v0.9.2 score, which never sees sanctions.

## 2. Outcomes (fixed now)

**Vendor outcomes.** An event is a vendor appearing in a source with a publication date **after the freeze date and on or before freeze + 12 months (O12) or + 24 months (O24)**.

| Code | Source | Event | Date used |
|---|---|---|---|
| **E** | SAT, Art. 69-B CFF, «Listado completo» (CSV at sat.gob.mx), cross-checked with the DOF | New RFC in stage *definitivo* | DOF date of the *definitivo* notice |
| **S** | SFP/SABG «Directorio de Proveedores y Contratistas Sancionados», downloaded fresh at each look (the loaded table is a Jan-2021 snapshot; its source CSV is archived with the freeze) | A sanction absent from the archived source | Notification date (`sanction_start` as the fixed loader defines it) |
| **A** | ASF, Informes Individuales de Auditoría for Cuenta Pública 2025 and 2026 | An audit result (observación, pliego, PRAS, denuncia) that names the vendor | Publication date of the entrega |

*Presuntos* and *desvirtuados* never count (a *presunto* that becomes *definitivo* inside the window does).

**Buyer outcome (B).** For each frozen buyer with ≥ 100 MDP of contracts dated in calendar **2027**: majority-held = its top vendor's share of 2027 spend ≥ 0.5. Source: the contracts register (ComprasMX open-data CSVs as loaded by the weekly refresh), amounts > 100B rejected. Frozen buyers absent from 2027 data, or below 100 MDP, drop out and are counted. 2028 is the O24 replication (descriptive).

## 3. Matching rules (fixed now)

1. **RFC first.** Normalise both sides (upper case, strip spaces and hyphens). Exact match on `vendors.rfc` of the frozen `vendor_id` (internal for personas físicas; never published).
2. **Name, exact.** For outcome rows without a usable RFC, or vendors without one: `api.sanctions.normalize_name` on both sides (NFKD, drop accents, upper case, non-alphanumerics → space, drop legal suffixes `S A B DE C V`, `S A P I DE C V`, `SAPI DE CV`, `S A DE C V`, `SA DE CV`, `S DE R L DE C V`, `S DE RL DE CV`, `S DE R L`, `S EN C`, `S C`, `S A`, `DE C V`; the code as committed at the freeze). Equal strings match.
3. **Name, fuzzy** (companies only). `rapidfuzz.fuzz.token_sort_ratio` ≥ 95 on the rule-2 strings, same first token, and the match is unique (one vendor). 90–94 goes to manual review **blind to focal/control status** (the reviewer sees names only); the call is final and logged.
4. One outcome row matches at most one vendor; ties are dropped and counted.
5. Personas físicas: RFC or exact name only, never fuzzy.

**Precision check:** a random 100 of the name matches (rules 2–3) is checked by hand and its precision reported. Under 90 %, the confirmatory test is re-run on RFC matches only and both are reported.

## 4. Hypotheses

**Confirmatory (two, declared now).** Holm–Bonferroni across the two at family α = 0.05, two-sided.

- **H1-24 (vendors).** Among vendors not on E ∪ S at freeze, focal vendors (tiers 1–2) reach E ∪ S within 24 months at a different rate from their stratum-matched controls. Metric: Mantel–Haenszel risk ratio (lift) over strata with a 95 % CI. Expected direction: lift > 1.
- **B-2027 (buyers).** Among frozen buyers with ≥ 100 MDP in 2027, `top_share` ranks those majority-held in 2027 above those that are not: AUC ≠ 0.5. Prior: next-year AUC **0.74** [0.71, 0.78] on 2,660 buyer-years 2010–24, base rate 10.6 % (`FRONTIER_STUDY` § C). Our horizon is longer (the window ends in November 2026, the target year is 2027), so expect less.

**Descriptive (everything else).** Reported with Holm-adjusted p-values within each family, and labelled descriptive whatever they show.

- **H1-12.** H1 at 12 months.
- **H2 (model only, two-sided).** On the same at-risk vendors, does `mean_risk` rank vendors reaching E ∪ S within 24 months differently from chance? AUC and within-stratum AUC (pooled over strata, the size-controlled analogue of M2), restricted to `n_scored` ≥ 3; full population too. **Stated prior:** in the frontier study, v0.9.2's vendor mean score had AUC **0.34** [0.26, 0.41] for later 69-B listing, pointing the wrong way (EFOS firms are small, young, few-buyer: the score's blind spot). An AUC below 0.5 is a finding, not a failure to hide.
- **H3.** Precision@k and recall@k by `rank_ips` and by `rank_mean_risk` for the top 1 / 5 / 10 % and the first 50 / 100 / 500, against the population base rate.
- **H4.** H1 for E, S and A separately, and for tier 1 alone.
- **B-onset.** Among buyers with `majority_now` = 0, AUC of HHI for becoming majority-held in 2027 (prior 0.69 [0.65, 0.72]).
- **Lead time.** Days from freeze to each listing; year of the vendor's first contract with `risk_score` ≥ 0.60.

## 5. Power (stated before any outcome is seen)

**Vendors.** Historical rates, all vendors (≈ 320 K):

- EFOS-definitivo RFC matches: about **86 vendors in ~10 years** of listings (2015–25), ≈ 8.6 a year.
- SFP after the date fix, name matching: about **1,146 strict name matches** (including ambiguous) across a registry spanning roughly 20 years, ≈ 57 a year (`docs/SFP_SANCTIONS_FIX_2026-10-31.md`).
- E ∪ S: ≈ 66 a year, about 4 × 10⁻⁴ per vendor over 24 months.

With about 1,180 focal vendors at risk and about 5,900 controls (dry run, § 12), expected **24-month** events if tier made no difference:

| Outcome | Focal | Controls | Minimum detectable lift (80 % power, α 0.05 two-sided) |
|---|---|---|---|
| E alone | 0.06 | 0.3 | > 20 (effectively untestable) |
| S alone | 0.4 | 2.1 | ≈ 12 |
| **E ∪ S (confirmatory)** | **0.5** | **2.4** | **≈ 10–12** |
| E ∪ S if larger vendors are listed 3 × as often | 1.5 | 7.3 | ≈ 6 |

(Simulated: Poisson events, conditional binomial test; `scipy`, 3,000 draws per cell.) **Plainly: the vendor-level confirmatory test will very likely be inconclusive.** Only a very large effect would show. It stays confirmatory because it is the question that matters; § 7 says how an inconclusive result is reported.

**Buyers.** About 177 buyers a year reach 100 MDP (2,660 buyer-years over 15 years) and ≈ 19 of them are majority-held next year. With 19 positives and 158 negatives, the Hanley–McNeil standard error of an AUC near 0.7 is ≈ 0.07, so the minimum detectable AUC at 80 % power is **≈ 0.70**; the prior 0.74 would give z ≈ 3.5. If ComprasMX's federal-only coverage cuts the 2027 set to about 12 positives and 100 negatives, the minimum detectable AUC rises to ≈ 0.74. This is the test with a realistic chance of an answer.

## 6. Analysis plan

- **One look per horizon.** O12 is computed once, on the first business day after freeze + 12 months + 30 days; O24 likewise at + 24 months + 30 days; B-2027 once 2027 is fully loaded (first business day of March 2028). The outcome files are downloaded that day, hashed and archived with the analysis.
- **CIs:** MH risk ratio with Greenland–Robins variance; AUC with 1,000 bootstrap resamples (seed 20261101), vendor- or buyer-level; precision@k with Wilson intervals.
- **No re-ranking.** The frozen files are the only predictions used. Scores after the freeze (new model, ARIA re-runs) do not enter.
- **Vendor merges** after the freeze are mapped back to the frozen `vendor_id`; a merged pair counts once, focal if either frozen row was focal.
- **Code:** the analysis script is committed, with its hash, before the first look; it reads only the frozen files and the downloaded outcome files.

## 7. Success, failure, inconclusive

| Test | Success | Failure | Inconclusive |
|---|---|---|---|
| **H1-24** | Holm-adjusted p < 0.05 and lift > 1: **tiers 1–2 appear more often than comparable controls** | Upper 95 % CI of the lift ≤ 1 | Anything else, **or fewer than 20 events in focal + controls combined** (reported as such, never as success) |
| **B-2027** | Holm-adjusted p < 0.05 and AUC > 0.5 | Upper 95 % CI of the AUC ≤ 0.5 | Anything else, or fewer than 10 majority-held buyers |

A significant result in the wrong direction (lift < 1, AUC < 0.5) is reported as a failure of the indicator for that outcome. **We publish the results at every look, whatever they show**, on /methodology and in the repo, within 60 days of each look, next to this document and the frozen hashes.

## 8. Limitations and disclosure

- **Matching is the bottleneck.** Today only about 103 of our vendors match the sanction lists by RFC (86 EFOS-definitivo, 17 SFP); after the SFP fix the SFP table carries no RFCs at all, so S depends on § 3's name rules, fixed now for that reason.
- **Power.** § 5. The vendor test is likely inconclusive.
- **Lag.** A 69-B definitivo follows a *presunto* by months; SFP sanctions take years; ASF reports a fiscal year 1–2 years later. 24 months is the confirmatory horizon.
- **Official action, not corruption.** Sanctions measure what the authorities chose to pursue (enforcement bias); a vendor never sanctioned is not thereby clean.
- **ARIA's external term.** Tier 1 is partly *defined* by existing records; excluding already-listed vendors removes the trivial part, but tiers may still carry prior-record signal (e.g. EFOS *presuntos*). H2 uses the score only.
- **Data cut.** CompraNet's bulk feed froze on 2025-09-28; ComprasMX open-data CSVs cover 2025–26 for vendor and amount fields, federal buyers only.
- **Ethics and disclosure.** The list is a ranking of **risk indicators**, not accusations.
  - Now: only the hashes (`SHA256SUMS`, manifest) are published. The full vendor CSV stays private until the O24 analysis.
  - At O24: publish `forecast_vendors_companies_<D>.csv`, whose hash was frozen today, and the full file's hash (already public). Rows of personas físicas are shown only to an independent auditor who can check the full file against its hash; they are never published. The buyer file (public institutions) may be published at the B-2027 look.
  - Results name vendors only in aggregate; any vendor named is named with its outcome source, never by the forecast alone. No persona física RFC appears in any file.
  - **Three copies** of the frozen folder: the VPS job folder, an encrypted copy on the owner's D: drive, and one encrypted copy **off the owner's machines** (e.g. the offsite backup target once it exists, or an encrypted archive in a second cloud account).

## 9. Public timestamp — options and recommendation

The goal is a timestamp anyone can verify, that does not reveal the owner.

| Option | Reveals owner? | Cost / who | Verdict |
|---|---|---|---|
| Commit the hashes to the GitHub repo | The repo is **private** (and under the owner's handle); a commit date is author-controlled | — | Not a public timestamp. Do it anyway, as a record |
| **OpenTimestamps** (`ots stamp`) | No: only the 32-byte hash goes to public calendar servers; the proof is anchored in Bitcoin within hours | Free; `opentimestamps-client` 0.8.0 is on PyPI. Sends the hash over the network → owner's go | **Recommended (primary)** |
| **Internet Archive** snapshot of a rubli.xyz page that shows the hash (`web.archive.org/save/…`) | No: the site is already pseudonymous | Free; needs the hash on a live page first (§ 11) | **Recommended (secondary)**: human-readable, independent of us |
| Zenodo: new version of dataset 2026.10 (or a small record) with the manifest + SHA256SUMS | Same identity as the existing DOI | Owner's token → owner action | Optional, good for scholars |

**Recommendation:** OpenTimestamps on `SHA256SUMS` the day of the freeze; then the /methodology note with the hash; then an Internet Archive snapshot of that page. Zenodo at the next dataset version.

```bash
pip install opentimestamps-client                 # into a venv on D:
ots stamp SHA256SUMS                               # -> SHA256SUMS.ots (sends only the hash to calendars)
ots upgrade SHA256SUMS.ots                         # a few hours later: adds the Bitcoin attestation
ots verify SHA256SUMS.ots                          # anyone, any time
```

## 10. Real freeze (prod, after review)

Preconditions:
1. `fix/sfp-sanctions-dates` merged, deployed, and its prod steps run (the table rebuilt from `/var/lib/rubli-db/proveedores_sancionados.csv`, i.e. `/app/data/proveedores_sancionados.csv` in the container). Without it the script stops.
2. This branch merged to `main` and deployed with `deploy-safe.sh`.
3. No weekly refresh or ARIA run in progress (check the `/var/lib/rubli-jobs/` logs).

The freeze date `D` is the UTC day the command runs. The script only reads (`mode=ro`).

```bash
ssh root@37.60.232.109 'D=$(date -u +%F) && mkdir -p /var/lib/rubli-jobs/prereg && \
  docker exec rubli-backend sh -c "cd /app && python -m scripts.freeze_forecast \
    --db /app/data/RUBLI_DEPLOY.db --out /tmp/prereg_$D --freeze-date $D \
    --sfp-source-csv /app/data/proveedores_sancionados.csv" \
    > /var/lib/rubli-jobs/prereg/freeze_$D.log 2>&1 && \
  docker cp rubli-backend:/tmp/prereg_$D /var/lib/rubli-jobs/prereg/ && \
  cat /var/lib/rubli-jobs/prereg/freeze_$D.log'
scp -r root@37.60.232.109:/var/lib/rubli-jobs/prereg/prereg_<D> D:/Python/yangwenli/_prereg/
```

Check the log: `model_version` v0.9.2, `model_run_id` `CAL-v92-asof-20261022`, `population_already_sfp` in the hundreds to low thousands (not hundreds of thousands), `buyers` in the low hundreds. Then commit `forecast_manifest_<D>.json` + `SHA256SUMS` (no CSV) to the repo, stamp (§ 9), put the manifest's SHA-256 into § 11, and make the three copies (§ 8).

## 11. Draft note for /methodology — «Predicción registrada» (do not ship until the hash exists)

**ES**
> **Predicción registrada.** El `<D>` congelamos dos predicciones de RUBLI tal como estaban ese día: la lista de proveedores ordenada por el nivel de ARIA, el puntaje IPS y el indicador de riesgo, con una muestra de control de proveedores comparables elegidos al azar; y, para cada institución, qué parte de su gasto se llevó su proveedor principal. No publicamos las listas; publicamos su huella digital (SHA-256): `<HASH>`. La huella está sellada en la cadena de bloques de Bitcoin mediante OpenTimestamps y guardada en Internet Archive. En 2027 y 2028 revisaremos qué proveedores aparecieron después en la lista definitiva del SAT (artículo 69-B), en las sanciones de la Función Pública y en las auditorías de la ASF, y qué instituciones quedaron en manos de un solo proveedor, y publicaremos el resultado, sea cual sea. Cualquiera podrá comprobar entonces que las listas no cambiaron: basta calcular el SHA-256 de cada archivo publicado y compararlo con esta huella. La prueba mide acción oficial, no corrupción, y las reglas están escritas desde hoy en el documento de pre-registro. La lista contiene indicadores de riesgo, no acusaciones.

**EN**
> **Registered forecast.** On `<D>` we froze two RUBLI predictions as they stood that day: the vendor list ranked by ARIA tier, IPS and risk indicator, with a control sample of comparable vendors drawn at random; and, for each institution, the share of its spending that went to its top vendor. We do not publish the lists; we publish their fingerprint (SHA-256): `<HASH>`. The fingerprint is anchored in the Bitcoin blockchain through OpenTimestamps and saved in the Internet Archive. In 2027 and 2028 we will check which vendors later appeared on SAT's definitive Article 69-B list, in Función Pública's sanctions and in ASF audits, and which institutions ended up with a single majority vendor, and publish the result, whatever it is. Anyone can then check the lists did not change: compute the SHA-256 of each published file and compare it with this fingerprint. The test measures official action, not corruption, and its rules are written down from today in the pre-registration document. The list holds risk indicators, not accusations.

## 12. Dry run (local DB)

Mechanics check only, run 2026-11-02 on the local `RUBLI_NORMALIZED.db` (63 min on a cold disk), **before** the review changes (first-contract band, name-based SFP baseline, buyer file, companies file). **The local DB still carries v0.9.1 scores** (no `v0.9.2` row in `model_calibration`) and the **pre-fix SFP table**, so it ran with `--model-version v0.9.1`, and the current script would now stop on the SFP guard locally; the real run is on prod (§ 10). Its hashes mean nothing for the freeze. Output stays outside the repo (`_prereg_dryrun/2026-11-02/`).

| Item | Value |
|---|---|
| Model run / ARIA run | `CAL-v91-202610131004` / `f4a8adfe` |
| Data cut (newest contract date) | 2025-12-31 |
| Population | 319,877 vendors (552 public entities excluded) |
| Personas físicas | 182,856 (by `public_labels.is_persona_fisica`; no persona física RFC in the CSV, checked) |
| ARIA tiers 1 / 2 / 3 / 4 / no row | 98 / 1,294 / 8,223 / 306,474 / 3,788 (local ARIA run; prod 2026-10-28 had 60 / 982) |
| Focal / controls / strata | 1,392 / 6,960 / 120 (sector × size only; the band will raise the strata count) |
| Focal already on EFOS-definitivo / SFP (RFC only) | 208 / 6, leaving 1,179 focal vendors at risk |
| CSV size | ≈ 42 MB; `sha256sum -c SHA256SUMS` passes |

The first dry run (2026-10-31) found a bug, fixed with a test: SFP rows with a blank RFC (2,373 locally) "matched" every vendor without an RFC (245,459 false baseline flags).

## Amendments

(none)
