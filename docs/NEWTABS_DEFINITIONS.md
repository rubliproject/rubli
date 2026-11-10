# New tabs: frozen definitions (2026-10-20)

> One definition per view, frozen before any copy is written. Every count below was measured on the local
> `backend/RUBLI_NORMALIZED.db` on 2026-10-20, after the 2026-10-20 decimal-error fix (3,051,294 dated contracts
> with a vendor). Writer: `backend/scripts/precompute_newtabs.py`. Tables: `newtabs_arranque`, `newtabs_mismo_dia`,
> `newtabs_parejas`, `newtabs_meta`. API: `backend/api/routers/newtabs.py` (`/api/v1/newtabs/*`).
> Tests: `backend/tests/test_newtabs.py`. The tests pin the counts, the 100B rule, and the absence of RFCs,
> official names and persona-física names.
>
> **Common rules.**
> - An amount must be > 0 and ≤ 100B MXN, or it is out of every figure. Amounts > 10B MXN are kept but marked
>   `flag_10b` (†).
> - Dates are used as stored: `contract_date`, and the year follows the date.
> - No payload carries an RFC. A vendor name that *is* an RFC (several CompraNet rows) ships as `null`.
> - No payload carries `responsible_uc`, an official's name, or any persona-física name. Personas físicas are
>   counted, with `vendor_name = null` and `is_pf = true`.
> - **Structure A (2002–10) has no direct-award flag.** Every A row has `is_direct_award = 0`, so no
>   direct-award share is computed before 2011.

| View | Frozen count | Earlier counts | Why it differs |
|---|---|---|---|
| El Arranque | **1,053 empresas** | 1,347 (concept) · 1,024 (audit) | Different window and floor, plus exclusions (§ 1.4) |
| El Mismo Día | **1,622 lotes** (2019–2025) | 13,437 · 42,879 · 9,992 | Real caps, independent of budget band; APF only; years with transcribed caps only (§ 2.4) |
| Las Parejas | **2,373 parejas** · 4.3 % of money | 7,509 · 19.2 % | 7,509 reproduces exactly (distinct years). The frozen set adds "consecutive" and "no competition" (§ 3.4) |
| El Rastro de un Peso | live; no count | ×41.6 % ×10 % ×5.2 % (concept) | Same data, any institution (§ 4) |

---

## 1. «El Arranque»: a large first federal contract

### 1.1 Definition
1. Take all of a vendor's valid contracts. Its **first contract** is the earliest `contract_date`.
2. Keep the vendor when the first contract is dated **≥ 2011-01-01**.
3. Its **first-year money** is the sum of contracts dated in `[first, first + 365 days)`, day 0 included.
   «Large» means first-year money **≥ 100 MDP** (100,000,000 MXN).
4. **Personas físicas are excluded.** The test is `public_labels.is_persona_fisica`: `is_individual` = 1 or a
   13-char RFC. They are counted, not listed.
5. **Re-incorporations are dropped.** A vendor is dropped when its `vendors.base_name` equals that of another
   vendor whose first contract is earlier. `base_name` is the name with the legal suffix stripped and accents
   or mojibake repaired.
6. Output per vendor:
   - first date and first contract id (citable);
   - first-year money, number of contracts and direct-award share;
   - days from the first contract to 100 MDP;
   - an incorporation bucket (below);
   - `censored`, when the first contract falls in the last 365 days of data;
   - `flag_10b`.

### 1.2 Basis
- GTI / ProACT "newly registered winner" and the World Bank INT red flag "suspicious bidder: newly formed, no
  track record".
- The IMCO *Índice de Riesgos de Corrupción* flag "proveedores de reciente creación".
- **Why 100 MDP:** it is the **99.5th percentile** of first-year money among the 271,426 vendors whose first
  CompraNet contract is 2011 or later. That is the top 0.5 % (the p99 is 51.6 MDP). It is also the threshold of
  the C1 concept, so the change is in the window and the exclusions, not the bar.
- **Why 2011:** the data starts in 2002, so a vendor first seen in 2002–10 may simply predate the data.
  Structure A also links vendors poorly, with 0.1 % RFC coverage.

### 1.3 Coverage and validation
| | Count |
|---|---|
| Vendors with first contract 2011+ | 271,426 |
| ≥ 100 MDP in first 365 days, before exclusions | 1,336 |
| − personas físicas (counted, not listed) | 216 |
| − earlier vendor with the same base name | 67 |
| **Frozen** | **1,053** (626,223 MDP first-year money; 45 censored; 6 † > 10B) |
| By first-contract structure | B 485 · C 346 · D 222 |
| Reached 100 MDP on the day of the first contract | 523 |
| ≥ 1,000 MDP in the first year | 97 |

**Incorporation date from the company RFC.** A 12-char persona-moral RFC encodes YYMMDD at positions 4–9.
Only buckets are stored. Neither the date nor the RFC is stored, because 6 of the 12 RFC characters are the date.

| Bucket (incorporation → first contract) | Vendors |
|---|---|
| Valid company RFC (coverage) | **698 of 1,053 (66 %)**; 355 have no usable RFC |
| < 180 days | **34** |
| < 365 days | **78** (includes the 34) |
| 1–5 years | 201 |
| ≥ 5 years | 419 |
| Incorporated after the first contract | 0 |
| Median gap | 2,585 days (7.1 years) |

**This validation is the main finding of the view.** Only 78 of 698 dated firms (11 %) were less than a year old
at their first CompraNet contract. The median firm was 7 years old. The 1,053 are therefore **firms that
appear large in CompraNet for the first time**, not new firms. The owner's copy rule is confirmed by the data.

### 1.4 Why it differs from 1,347 and 1,024
- **1,347** (C1 concept): the same rolling 365-day window on an earlier data cut, with no exclusions. Today's
  data, after the 15 decimal-error fixes, gives **1,336**. The remaining 283 are the personas físicas and the
  name re-incorporations.
- **1,024** (methodology audit): a **calendar** first year with > 100 MDP. A vendor whose first contract is in
  November then gets only two months. Today it reproduces as **1,022**, or 1,576 without the 2011 floor.
- **690 "on its debut day"** (concept) vs 523 here: the concept counted before exclusions.

### 1.5 Top 10 by first-year money
| Vendor | First contract | First-year MDP | Incorporation bucket |
|---|---|---|---|
| GRUPO CONSTRUCTOR MARHNOS, S.A. DE C.V. | 2017-11-10 | 28,008 † | no RFC |
| ICA CONSTRUCTORA SA DE CV | 2020-01-16 | 26,224 † | 1–5 years |
| CIC CORPORATIVO INDUSTRIAL COAHUILA SA DE CV | 2013-01-01 | 23,738 † | no RFC |
| BAHUD PROCESSING MEXICO S DE RL DE CV | 2021-10-21 | 15,787 † | 1–5 years |
| DESARROLLO DEL SURESTE PLAYA DEL CARMEN TULUM, S.A. DE C.V. | 2021-02-11 | 15,358 † | no RFC |
| CONSORCIO LAMAT TRAMO 1, S.A.P.I DE C.V. | 2020-04-30 | 13,395 † | no RFC |
| APP ARRIAGA - TAPACHULA SA DE CV | 2018-07-01 | 9,640 | < 180 days |
| AZVINDI FERROVIARIO, S.A. DE C.V. | 2020-05-26 | 8,787 | < 180 days |
| ICA CONSTRUCTORA DE INFRAESTRUCTURA, S.A. DE C.V. | 2016-12-20 | 7,556 | no RFC |
| ABENER ENERGIA SA | 2011-12-08 | 6,711 | no RFC |

### 1.6 Caveats
- **SPVs and consortia dominate the top.** Examples are «APP …», «CONSORCIO … TRAMO 1» and «AZVINDI FERROVIARIO»
  (Tren Maya). A project company created for one concession is *expected* to be weeks old at its first contract.
  The < 180-day bucket is mostly these.
- **The name check is exact on `base_name`.** It misses group spin-offs under a different name. «ICA CONSTRUCTORA»
  (2020) survives although ICA has decades of CompraNet history under «EMPRESAS ICA» and others. The 67 dropped
  vendors are a floor for re-incorporations, not a ceiling.
- The 2011 row is inflated by older firms the data could not link before 2011.
- 45 vendors are right-censored: their first contract falls in the last 365 days, so the count is still growing.
- † six first-year totals include a > 10B contract. Check the contract before citing any of them.

### 1.7 Safe to publish vs must not say
- **Safe:** «1,053 empresas recibieron 100 MDP o más en los 365 días posteriores a su primer contrato federal
  registrado en CompraNet (2011–2025).»
- **Safe:** «De las 698 con RFC de persona moral, 78 tenían menos de un año de constituidas al firmar ese primer
  contrato; la mediana es de 7 años.»
- **Safe:** «Muchas son empresas de propósito específico creadas para una concesión.»
- **Must not say:** «debutante», «empresa nueva», «empresa de reciente creación» for the whole set (11 % qualify).
- **Must not say:** «empresa fantasma»; any RFC or incorporation date; any persona-física name.
- **Must not say:** «X % más probable de corrupción». The C1 «1.8× GT» claim is size-confounded: the audit's
  size-matched lift is 1.74 for the calendar variant. It is not re-measured here. Do not publish it without a fact-check.

---

## 2. «El Mismo Día»: same-day direct awards under the cap

### 2.1 Definition
1. **Universe.**
   - Direct awards (`is_direct_award = 1`) with valid amounts, dated **2019–2025**: the only years whose caps
     were transcribed.
   - Only from **federal APF buyers**: `institutions.is_federal = 1`.
   - Excluded buyers: autonomous constitutional, judicial and legislative bodies; Pemex, CFE and their
     subsidiaries, which buy under their own laws since 2014; and autonomous universities.
   - That leaves 477 institutions.
2. **Legal schedule.**
   - `adquisicion` / `arrendamiento` / `servicio` → LAASSP schedule.
   - `obra_publica` → LOPSRM schedule. "Obra" and "servicios relacionados" are not separable, so the lower cap
     uses the smaller of the two and the higher cap the larger.
3. **Piece.** A contract with amount **< the lowest-budget-band direct-award cap** of its year, with the
   amount as stored.
4. **Lot.**
   - Group pieces by **institution_id × vendor_id × contract_date × schedule**.
   - A lot has **≥ 2 pieces**, and its **sum > the highest-band cap × 1.16**.
   - The grouping key never uses `responsible_uc`, which holds an official's name. `contracting_unit_id` is
     NULL for every contract, so the buyer is the institution.
5. **Why both band ends.** The real cap depends on each buyer's authorised procurement budget, its band in the
   PEF Anexo 9. We do not hold each buyer's band (it would need PAAAS budgets).
   - Each piece is under the cap **for any band**.
   - The sum is over the cap **for any band**, whether `amount_mxn` includes IVA or not. Anexo 9 amounts exclude
     IVA. If our amounts include it, the true net sum is sum/1.16, hence the 1.16 factor.
   - No cap is assumed or invented.
6. **Placebo.** The same rule with both caps × m, for m ∈ {0.5, 0.75, 1, 1.25, 1.5, 2}.

### 2.2 Basis
- **LAASSP Art. 42 (2019 – Apr 2025) / new LAASSP Art. 55 (2025), and LOPSRM Art. 43.** Direct awards by amount
  are allowed below the PEF caps, provided the operations are not split to fit under them. The article itself
  forbids fraccionamiento. Quote the exact DOF wording only after checking it; it is not transcribed here.
- OECD *Preventing Corruption in Public Procurement* (2016) and World Bank INT: «multiple contracts just below
  the threshold».

**Caps used** (PEF Anexo 9, miles de pesos, without IVA; LAASSP lowest band / highest band):

| Year | LAASSP | Obra pública | Serv. relacionados | Source |
|---|---|---|---|---|
| 2019 | 200 / 528 | 318 / 1,500 | 158 / 789 | PEF 2019 (sc.inegi.org.mx/repositorioNormateca/PEF2019.pdf) |
| 2020 | 208 / 549 | 331 / 1,559 | 164 / 820 | PEF 2020 (same repository) |
| 2021 | 215 / 567 | 342 / 1,611 | 169 / 847 | PEF 2021, DOF 30-11-2020 (same repository) |
| 2022 | 228 / 600 | 362 / 1,706 | 179 / 897 | PEF 2022 (same repository) |
| 2023 | 270 / 770 | 435 / 2,720 | 195 / 1,380 | gob.mx/cms/uploads/attachment/file/798499/PEF_2023.pdf, p. 37 |
| 2024 | 284 / 1,050 | 458 / 3,569 | 205 / 1,811 | dof.gob.mx/2023/SHCP/PEF_2024.html |
| 2025 | 297 / 1,098 | 479 / 3,732 | 214 / 1,894 | dof.gob.mx/2024/SHCP/PEF_2025.html |

- **2002–2018 have no transcribed caps and are not counted.** The 2018 file was not retrievable.
- The DB table `laassp_thresholds` is **not used**. Its provenance is unknown. It splits goods and services,
  which the law does not. Its values match no Anexo 9 band: its 2024 "goods" 520 lies between the 509 and 573 bands.

### 2.3 Coverage and the frozen count
| | Count |
|---|---|
| **Lots (frozen)** | **1,622** · 19,304 contracts · 1,778 MDP |
| Vendors / institutions | 316 / 27 |
| Lots with ≥ 3 pieces / ≥ 5 pieces | 1,622 / 1,601 (the sum rule forces ≥ 5 pieces in practice) |
| Median lot | 10 pieces, sum = 1.50 × the highest-band cap |
| Schedule | all LAASSP (no LOPSRM lot qualifies) |
| Lots of personas físicas (counted, not named) | 99 |
| Concentration | Diconsa + Alimentación para el Bienestar (its successor) 922 (57 %), IMSS 525, INCMNSZ 64, CONALITEG 57 |

**Placebo, with both caps × m:**

| m | 0.5 | 0.75 | **1.0** | 1.25 | 1.5 | 2.0 |
|---|---|---|---|---|---|---|
| Lots | 1,368 | 1,550 | **1,622** | 1,612 | 1,640 | 1,527 |

**There is no spike at the legal cap.** The count is flat from 0.75× to 2×. This reproduces the finding of
`_polish/fraccionamiento/STUDY.md` (2026-10-12) under real caps. Same-day clusters of direct awards from one
vendor are a **base rate of high-frequency supply** (groceries for Diconsa, laboratory and cleaning supply for
IMSS). They are not a systemic response to the cap. **The count is not evidence of fraccionamiento**, so the
view can only present **individual lots as indicios**.

### 2.4 Why it differs from 13,437 / 42,879 / 9,992
| Step | Lots |
|---|---|
| Audit rule: `laassp_thresholds` federal-ministry cap, any institution, ≥ 2 pieces, sum > cap, 2010–2025 | 42,258 (audit 42,879; the gap is the Oct-20 amount fixes and dates) |
| Audit strict: ≥ 3 pieces, sum ≥ 2 × cap | 9,896 (audit 9,992) |
| Audit rule restricted to 2019–2025 | 21,093 |
| … and to APF federal buyers | 20,820 |
| **Real caps, band-independent (piece < lowest band, sum > highest band × 1.16)** | **1,622** |

- **13,437** (C3 concept) grouped by `responsible_uc`, an official's **name**. It needed ≥ 5 pieces and used
  the table cap. It is not reproducible without that key, and that key must never ship.
- The big drop from 20,820 to 1,622 comes from requiring the sum to beat the **largest** buyer's cap. With the
  table cap (520K in 2024), a 600K total from three 200K pieces counted. Under a top-band buyer's real cap
  (1,050K), that total is legal.

### 2.5 Top 10 lots by sum
| Buyer | Vendor | Date | Pieces | Sum (MXN) | Largest piece | Low / high cap |
|---|---|---|---|---|---|---|
| Alimentación para el Bienestar | ALEN DEL NORTE SA DE CV | 2023-04-24 | 45 | 7,085,707 | 266,100 | 270K / 770K |
| IMSS | DIAGNOCELL LABORATORIOS | 2024-10-17 | 56 | 5,900,332 | 282,240 | 284K / 1,050K |
| Alimentación para el Bienestar | ALEN DEL NORTE SA DE CV | 2023-11-10 | 46 | 5,746,182 | 255,706 | 270K / 770K |
| IMSS | DIAGNOCELL LABORATORIOS | 2024-04-11 | 66 | 5,057,332 | 144,789 | 284K / 1,050K |
| Diconsa | SUMMA COMPANY, S.A. DE C.V. | 2019-05-11 | 62 | 4,358,571 | 175,467 | 200K / 528K |
| IMSS | B2B DE TOLUCA SA DE CV | 2023-09-29 | 90 | 4,188,028 | 259,870 | 270K / 770K |
| IMSS | ORVI DISTRIBUCIONES SA DE CV | 2024-09-11 | 38 | 4,105,126 | 279,038 | 284K / 1,050K |
| Diconsa | SUMMA COMPANY, S.A. DE C.V. | 2019-09-13 | 56 | 4,053,073 | 180,990 | 200K / 528K |
| Alimentación para el Bienestar | ALEN DEL NORTE SA DE CV | 2024-05-24 | 31 | 3,746,694 | 269,758 | 284K / 1,050K |
| Diconsa | (name not shipped) | 2019-02-05 | 52 | 3,729,378 | 195,617 | 200K / 528K |

Outside Diconsa, the top lots are all IMSS, for example DIAGNOCELL LABORATORIOS (several dates), GADMAR SA DE CV
and COCINA Y ASEO INSTITUCIONAL SA DE CV.

### 2.6 Caveats
- **The buyer is the whole institution.** IMSS buys through 35 delegations and hundreds of units. 56 same-day
  pieces may be 56 different hospitals each buying under its own cap, which is legal. A unit key does not exist
  in the data: `contracting_unit_id` is NULL everywhere, and `responsible_uc` is a person's name and is banned.
  **This is the largest false-positive source.**
- **187 of 1,622 lots** have their largest piece within 2 % of the lowest cap (≥ 0.98 × cap), for example
  ALEN DEL NORTE and DIAGNOCELL in 2024. That is the pattern worth an expediente. The other lots sit well below it.
- COVID-period lots (2020) may rest on Art. 41 exceptions, not on amount.
- The new LAASSP (DOF 16-04-2025) renumbered the article (42 → 55). The PEF 2025 caps still apply.
- The institution-type labels are noisy. A few real APF bodies are typed "judicial" or "autonomous" and so
  excluded, for example the Procuraduría Federal de la Defensa del Trabajo. This lowers the count (conservative).

### 2.7 Safe to publish vs must not say
- **Safe (per lot):** «El [fecha], [institución] adjudicó directamente a [empresa] [n] contratos, cada uno por
  debajo del tope mínimo de adjudicación directa del PEF [año]; juntos suman [X], más que el tope máximo
  aplicable a cualquier dependencia. Patrón compatible con fraccionamiento: indicio, no conclusión.»
- **Safe (context, required next to any lot):** «Agrupamientos parecidos aparecen con topes ficticios (×0.75 a ×2):
  el tope legal no destaca en los datos.»
- **Must not say:** «fraude», «fraccionamiento» as a fact; any peso total («X MDP fraccionados»); «1,622 casos
  de fraccionamiento»; any official's or persona-física name.
- **Must not say:** 13,437 / 42,879 / 9,992 (dead definitions).

---

## 3. «Las Parejas»: long buyer–vendor tenure without competition (dossier lens)

### 3.1 Definition
1. For each vendor × institution pair, list its contract years (valid amounts). The table keeps every pair with
   **≥ 10 distinct years**.
2. `max_run` is the longest run of **consecutive** years.
3. `noncomp_share` is the share of the pair's money **dated 2011 or later** that went by **direct award or
   single bid**. `da_share` is the same with direct award only.
4. **Frozen pair:** `max_run ≥ 10` **and** `noncomp_share ≥ 0.80`.
5. Output per pair:
   - years with money per year;
   - total money and 2011+ money;
   - direct-award and non-competitive shares;
   - first and last year;
   - `max_run` and `flag_10b`.

### 3.2 Basis
- OECD *Guidelines for Fighting Bid Rigging* and *Integrity in Public Procurement* list "repeated awards to the
  same supplier". The IMCO IRC measures supplier concentration.
- Tenure alone is the normal state for utilities, patents and consolidated pharma. The audit measured a
  size-matched lift of 0.87. Tenure is therefore only shown **conditioned on non-competition** (audit § 4d).
- **80 % non-competitive** is the audit's recommended rule.
- **Single bid counts as non-competitive.** It is a competitive procedure with one awarded vendor, the OCP R018 /
  CRI single-bidder flag.

### 3.3 Coverage and frozen count
| Definition | Pairs | Share of all valid money (9.58T MXN) |
|---|---|---|
| ≥ 10 distinct years | **7,509** | 19.6 % |
| ≥ 10 consecutive years | 3,907 | 13.9 % |
| ≥ 10 distinct years and ≥ 80 % non-competitive | 4,546 | — |
| ≥ 10 consecutive years and ≥ 80 % by direct award only | 1,571 | — |
| **Frozen: ≥ 10 consecutive years and ≥ 80 % non-competitive (DA or single bid)** | **2,373** | **4.3 %** (409,531 MDP) |

The frozen set covers 1,984 vendors and 156 institutions. 863 pairs are personas físicas (counted, not named).
No frozen pair has a > 10B contract.

### 3.4 Why it differs from 7,509 / 19.2 %
- **7,509 reproduces exactly.** It is the ≥ 10 *distinct* years count. The share is now 19.6 % instead of 19.2 %
  because the denominator changed with the Oct-20 amount fixes.
- The brief asks for *consecutive* years: 3,907 pairs.
- Adding "no competition" gives 2,373.
- The 19.2 % headline describes tenure, not capture. It must not be reused for the frozen set.

### 3.5 Top 10 frozen pairs by money
| Vendor | Buyer | Years | Longest run | MDP | DA share 2011+ | Non-comp share 2011+ |
|---|---|---|---|---|---|---|
| SIEMENS INNOVACIONES S.A. DE C.V. | CFE | 2006–2017 | 12 | 17,612 | 64 % | 98 % |
| SELECCIONES MEDICAS S.A. DE C.V. | ISSSTE | 2002–2019 | 11 | 10,109 | 99 % | 99 % |
| PRODUCTOS HOSPITALARIOS S.A DE C.V. | IMSS | 2002–2025 | 21 | 8,152 | 34 % | 100 % |
| MEDICAMENTOS Y SERVICIOS INTEGRALES DEL NOROESTE SA DE CV | IMSS | 2013–2025 | 13 | 7,957 | 99 % | 99 % |
| APLICACIONES MEDICAS INTEGRALES, S.A. DE C.V. | IMSS | 2002–2019 | 11 | 6,579 | 17 % | 94 % |
| DISTRIBUIDORA DE EQUIPO MEDICO E INDUSTRIAL DE MEXICO SA DE CV | IMSS | 2006–2025 | 20 | 6,567 | 88 % | 88 % |
| BAXTER, S.A. DE C.V. | ISSSTE | 2002–2025 | 15 | 4,533 | 81 % | 93 % |
| MARCAS NESTLE S.A. DE C.V. | Diconsa | 2011–2022 | 12 | 4,333 | 100 % | 100 % |
| DICIPA S.A. DE C.V. | ISSSTE | 2002–2025 | 18 | 4,138 | 59 % | 93 % |
| LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO S.A. DE C.V | ISSSTE | 2012–2024 | 13 | 4,052 | 47 % | 81 % |

### 3.6 Caveats
- **Single-bid share is a co-award proxy.** The bulk files list only awarded suppliers. A "single bid" may hide
  losing bidders not in the data. That is why `da_share` ships next to `noncomp_share`. Several top pairs are
  non-competitive mostly via single bid, for example PRODUCTOS HOSPITALARIOS: 34 % DA but 100 % non-competitive.
- Patents, utilities and consolidated purchasing produce exactly this pattern (Siemens–CFE, Baxter, Nestlé–Diconsa).
- **Public-entity vendors are not excluded.** BIRMEX (Laboratorios de Biológicos y Reactivos de México) is a
  state firm. In the UI, filter it with `public_labels.is_public_entity` or label it.
- Structure A years (2002–10) count toward tenure but not toward the shares.
- Entity-resolution merges can inflate year counts.

### 3.7 Safe to publish vs must not say
- **Safe:** «[empresa] tuvo contratos con [institución] [k] años seguidos ([a]–[b]); desde 2011, el [x] % de ese
  dinero fue por adjudicación directa o con un solo licitante adjudicado.»
- **Safe:** «2,373 parejas comprador–proveedor cumplen 10 años seguidos sin competencia (≥ 80 % del dinero
  desde 2011); suman 4.3 % del gasto registrado.»
- **Must not say:** «captura», «colusión», «relación corrupta»; «19.2 %» for this set; the shares for years
  before 2011; any persona-física name.

---

## 4. «El Rastro de un Peso»: carve an institution's money

### 4.1 Definition
`GET /api/v1/newtabs/rastro?institution_id=&category_id=&vendor_id=` reads contracts live. It uses the indexed
filters, valid amounts only, and caches each answer for 6 h.
- **`institution_id` only:** the top 15 categories by money. `category_id = 0` means «sin categoría».
- **`+ category_id`:** the top 15 vendors of that category within the institution.
- **`+ vendor_id`:** that vendor's top 15 contracts there, ending on citable contract ids. Each contract carries
  its number, title, date, amount, direct-award flag and procedure type.

Each row carries `share` = its money ÷ the parent's money at that level. `meta` carries:
- `parent_mxn` and `parent_n`;
- the breadcrumb (institution, category, vendor);
- `truncated`, true when there are more than 15 children.

Personas físicas appear as `name: null, is_pf: true`. Contracts > 10B carry `flag_10b`.

### 4.2 Basis and caveats
- Pure arithmetic on stored data. The concept's ×41.6 % ×10 % ×5.2 % (IMSS) comes from the same queries on an
  earlier data cut, so the figures shift slightly with each data fix.
- The categories are RUBLI's classification (`category_id`), not CompraNet's. Every valid contract carries
  one today. The `category_id = 0` branch exists only as a guard.
- Shares within an institution span all years (2002–2025). Structure A's coverage is weaker.

### 4.3 Safe to publish vs must not say
- **Safe:** «De cada peso de [institución], [x] % fue a [categoría]; de eso, [y] % a [empresa]; su contrato mayor
  es [número], [fecha], [monto].»
- **Must not say:** any inference of wrongdoing from the share alone.

---

## Reproduce
```
cd backend
python -m scripts.precompute_newtabs                  # rebuilds the 4 tables (read-only scan, write at the end)
DATABASE_PATH=../backend/RUBLI_NORMALIZED.db python -m pytest tests/test_newtabs.py -q -p no:cacheprovider
```
Rerun the script after any contracts/amount fix. A test failure on `FROZEN` then means the data moved. Update
the counts here and in the test together.
