# Señales nuevas: a rule-based signal track (2026-10-20)

> Status: built locally, not committed, not deployed. Lead reviews.
> Builder: `backend/scripts/compute_senales_nuevas.py` (read-only scan, writes two NEW tables at the end).
> Tables: `vendor_signals`, `aria_nuevos_signals` (local `RUBLI_NORMALIZED.db` only).
> API: `GET /api/v1/senales/vendor/{id}` (dossier sentences, ES/EN) and `GET /api/v1/senales/nuevos` (ranked list).
> Tests: `backend/tests/test_senales.py` (17).
> No RFC, persona física name or official's name appears in any table, payload or example below.

```
cd backend && python -m scripts.compute_senales_nuevas [--db PATH] [--dry-run] [--cache DIR]
```

## Architecture (owner-delegated decision, 2026-10-16)

There are two tracks, and they meet in ARIA, not in the model.

- **The model (v0.9.1)** answers "does this look like the documented cases?". It is trained on GT.
- **Señales nuevas** answers "did a rule with a legal or method basis fire?". No GT enters any rule or threshold.

The signals are not model features. The 2026-10-16 audit showed they barely predict GT once vendor size is matched, so a supervised model would give them about zero weight. Their value has to be shown by analyst review (precision), not by GT metrics.

ARIA «Nuevos» = vendors with no GT link of any kind, at least two signals converging, active 2019 or later.

## Rules common to every signal

- **Companies only.** Personas físicas (`is_individual` or a 13-char RFC) and public bodies (`public_labels.is_public_entity`) are never scored. They are dropped before anything is stored.
- **100B rule.** Contracts above 100,000 MDP are removed before any signal. The 40 source rows above 10,000 MDP stay in and are flagged where a signal reports them (`flag_10b`).
- **Sources.** CompraNet `contracts` 2002–2025 plus ComprasMX open data (`comprasmx_contracts`), federal (APF) rows not already in `contracts` (`in_contracts = 0`), 2025–2026.
- **Frozen.** One definition per signal. Changing a threshold means a new doc version and a rerun, never an edit in place.
- **Reuse.** (c) is the published «Empezó antes del fallo» logic (`routers/fallo.py: build`). (d), (e) and (f) are read from the newtabs-data tables (`newtabs_arranque`, `newtabs_mismo_dia`, `newtabs_parejas`, definitions in `docs/NEWTABS_DEFINITIONS.md`). If those tables are missing, the builder runs the same functions from `scripts/precompute_newtabs.py`; it never redefines them. On 2026-10-20 the tables existed and both paths gave identical counts.

## Summary (run 2026-10-20 18:17, after the 2026-10-20 amount fixes)

| Code | Signal | Coverage | Vendors | Contracts in signal | Money in signal (MDP) |
|---|---|---|---|---|---|
| a `plazo_reducido` | Plazo de licitación reducido | C 2018–22, D 2023–25, ComprasMX 2025–26 | 555 | 5,373 | 65,670 |
| b `urgencia` | Uso intensivo de excepciones por caso fortuito o urgencia | D 2023–25, ComprasMX 2025–26 | 764 | 37,851 | 60,380 |
| c `antes_del_fallo` | Empezó antes del fallo | ComprasMX 2025–26 | 593 | 911 | 15,158 |
| d `arranque` | Crecimiento instantáneo | first contract 2011+ | 1,044 | 15,241 | 620,859 |
| e `mismo_dia` | Fraccionamiento el mismo día | 2019–2025, federal buyers | 280 | 17,808 | 1,656 |
| f `pareja` | Pareja de largo plazo sin competencia | 2002–2025 (non-competition measured 2011+) | 1,180 | 19,731 | 371,139 |
| g `empresa_joven` | Empresa joven al primer contrato | vendors with a 12-char company RFC | 2,610 | 147,876 (whole record) | 278,351 (whole record) |
| h `comprador_dominado` | Más de la mitad del gasto de un comprador | 2002–2026 | 392 | 1,016 | 763,423 |

`vendor_signals`: 7,418 rows, 6,479 vendors. Money columns overlap across signals; never add them up.

---

## a. Plazo de licitación reducido (`plazo_reducido`)

**Definition.** The vendor won at least 3 licitaciones públicas whose call ran fewer days than the full legal minimum. Those are at least half of its licitaciones. And they are at least twice what its own buyers' reduced-period rate predicts.

**Logic.**
- Universe: `procedure_type` starts with LICITACI (licitación pública only; invitaciones are excluded), publication and apertura dates present.
- `days = apertura − publicación + 1`. CompraNet counts the publication day: the shortest call in D and ComprasMX is 9 calendar days apart, which is 10 counted, exactly the reduced floor.
- Reduced: `days < 15` (nacional) or `days < 20` (internacional, including under treaties). Rows with days < 1 or > 365 are dropped as date errors.
- Per procedure. Expected = sum over the vendor's procedures of the same institution-year reduced rate, leaving that procedure out (global rate when the buyer has one procedure that year).
- Fires: `n_red ≥ 3` and `n_red ≥ 0.5 × n_lic` and `n_red ≥ 2 × expected`.
- ComprasMX timestamps are UTC and are moved to Mexico City time first (`fallo.mx_date`).

**Basis.** LAASSP art. 32 and LOPSRM art. 33 (2009 texts): at least 20 natural days for international calls and 15 for national ones, reducible to no less than 10 when the expediente justifies it. OECD (2016) and Fazekas' CRI treat short advertisement periods as a red flag. **«Plazo reducido» is legal with a justification that the bulk data does not carry. It is never "illegal".**

**Caveats to verify before any public number.**
- The LOPSRM minimum is taken as 15/20, the same as LAASSP. The 2009 LOPSRM text and the data agree (works tenders peak at 15–16 days like goods), but the DOF text must be checked. If the real works minimum is 20 for national calls, the works count goes up.
- The 2025 LAASSP (new law) periods are assumed unchanged.
- Treaty chapters (T-MEC, CPTPP) can require longer periods than 20 days; this rule does not use them.

**Coverage (procedures with both dates; share reduced).**

| Structure | Procedures | Reduced nacional | Reduced internacional | Below 10 days |
|---|---|---|---|---|
| A 2002–10 | 0 (no dates) | — | — | — |
| B 2010–17 | 0 (no opening date) | — | — | — |
| C 2018–22 | 54,852 | 21.1 % | 45.2 % | 4.1–6.3 % (and 2.9–5.0 % negative) |
| D 2023–25 | 24,028 | 19.6 % | 37.6 % | 0 % |
| ComprasMX 2025–26 | 8,619 | 26.5 % | 48.5 % | 0 % |

The "below 10 days" calls exist only in Structure C, next to negative periods. That points to a field-semantics problem in C, not to illegal calls. The probe `_explore/reloj` found none in ComprasMX. Detail keeps `below_floor` per vendor; never publish it without a CompraNet spot check.

**Examples (by money in reduced calls).** Bristol Myers Squibb de México (3 of 3; 0.6 expected) · Kedrion Mexicana (12 of 13; 3.4) · 2K17 Ingeniería y Construcción (3 of 3; 0.7) · Sanofi Pasteur (7 of 11; 3.1) · Farmacéutica Hispanoamericana (13 of 21; 5.5) · Alternavida (9 of 14; 4.4) · Importadora y Manufacturera Bruluart (8 of 10; 3.3) · DL Médica (19 of 26; 8.9) · Orthopbone & Spine (29 of 40; 13.4) · Alvartis Pharma (7 of 12; 2.8).

**Say:** «Ganó 12 de sus 13 licitaciones con plazo reducido; con la tasa habitual de esos compradores se esperarían 3.4.» **Do not say:** «licitación ilegal», «violó el plazo», «amañada».

---

## b. Uso intensivo de excepciones por caso fortuito o urgencia (`urgencia`)

**Definition.** At least 3 of the vendor's contracts cite a caso-fortuito / fuerza-mayor / urgency exception article. They carry at least half of its money in the coverage window. And that share is at least 3 times what the same buyers pay their other suppliers that way.

**Logic.**
- Window: rows that record the article (CompraNet D 2023–25, ComprasMX 2025–26).
- `share = urgency money / all money` of the vendor in the window.
- `buyer_share` = for each buyer of the vendor, that buyer's urgency share with all other vendors (leave-one-out), weighted by the vendor's money with that buyer.
- Fires: `n ≥ 3` and `share ≥ 0.5` and `share ≥ 3 × buyer_share`.
- The buyer baseline replaced a sector baseline during the build: a buyer that buys everything by emergency should not make all its suppliers fire (test `test_urgencia_buyer_practice_is_not_a_vendor_signal`).

**Article crosswalk (measured, not assumed).** ComprasMX publishes each article next to its own reason label. On 2025–26 data the mapping is one-to-one:

| Article | Law | ComprasMX reason | Urgency set |
|---|---|---|---|
| Art. 41 fr. II | LAASSP 2009 | Caso fortuito o fuerza mayor | yes |
| Art. 41 fr. V | LAASSP 2009 | Urgencia y eventualidad | yes |
| Art. 54 fr. II | LAASSP 2025 | Caso fortuito o fuerza mayor | yes |
| Art. 54 fr. V | LAASSP 2025 | Urgencia y eventualidad | yes |
| Art. 42 fr. II | LOPSRM | Caso fortuito o fuerza mayor | yes |
| Art. 42 fr. V | LOPSRM | Urgencia y eventualidad | yes |
| Art. 45 Bis | LOPSRM | Caso fortuito o fuerza mayor | yes |
| Art. 41 fr. I / 54 fr. I / 42 fr. I | all | Patentes, oferente único | no |
| Art. 41 fr. VII / 54 fr. VII / 42 fr. VII | all | Licitaciones desiertas | no |
| Art. 42 ¶1 / 55 ¶1 / 43 | all | Montos máximos por excepción | no |

The article strings do not collide across laws (LAASSP art. 42 is cited by paragraph, LOPSRM art. 42 by fraction), so the same set works on legacy D rows, which carry no `ley`. `caso_fortuito` and `gap_contracts.is_emergency` are unusable (never 1).

**Basis.** LAASSP art. 40–41 (2009) / 53–54 (2025) and LOPSRM art. 41–42 require the exception to be justified in the expediente. OECD (2016) and IMCO's Índice de Riesgos de Corrupción flag unjustified urgency exceptions.

**Coverage.** 2023–2026 only. 97,885 urgency rows, 306,837 MDP in the window. Buyers' urgency shares by money: IMSS 23.7 %, IMSS-Bienestar 31.2 %, ISSSTE 18.4 %. The health sector dominates this signal.

**Examples (by urgency money).** Almacenaje y Distribución Avior (93 %; buyers 3 %) · Boston Scientific de México (68 %; 19 %) · Distribuidora Internacional Ralmo (86 %; 23 %) · Orvi Distribuciones (86 %; 24 %) · Gadmar (73 %; 23 %; 1,898 contracts) · Grupo Farmacéutico Sigmun (100 %; 13 %) · Soluciones en Liderazgo Farmacéutico (64 %; 21 %) · Grupo Inserh (91 %; 18 %) · Rimisa Medical (95 %; 26 %) · Limpieza & Mantenimiento Limi del Valle de Oaxaca (100 %; 31 %).

**Say:** «86 % de su dinero de 2023 a 2026 llegó por adjudicación directa invocando caso fortuito o urgencia; esos compradores pagan así 24 % a otros proveedores.» **Do not say:** «emergencias falsas», «simuló una urgencia».

---

## c. Empezó antes del fallo (`antes_del_fallo`)

**Definition.** The vendor holds at least one competitive federal ComprasMX contract whose start date falls before the award decision (fallo).

**Logic.** Exactly the published page logic, `routers/fallo.py: build()`, called on its own `SELECT`: APF rows, `tipo_procedimiento` LICITACI% or INVITACI%, fallo and start present, start year 2020–2027, `day(inicio) < day(fallo)`. Fallo stamps carrying a time of day are UTC and are shifted −6 h to Mexico City before taking the date. Amounts above 100,000 MDP are skipped. Vendor detail keeps the largest gap, the count starting on 1 January, the count flagged as emergency and up to 5 contract codes.

**Basis.** Obligations bind at the fallo (LAASSP art. 37/46). A start before the award means work or supply before anyone was legally chosen. The probe `_explore/reloj` showed that "start before signing" is the norm (79 %) and is not a red flag; "start before the fallo" is.

**Coverage.** ComprasMX 2025–26 only; legacy B/C start dates copy the signing date. Population 53,512 competitive contracts (878,976 MDP); 1,025 early (17,404 MDP), 943 with a resolved vendor, 911 at companies (593 vendors).

**Caveats.** Most gaps are short. Many early contracts share one procedure: the ISSSTE/IMSS 2025 consolidated medicine purchase (fallo 14 January, start 1 January; 173 early contracts start on 1 January) and a 21 August 2026 procedure with a 17-day gap. These are buyer-level events that touch every winner. In the precision sample, (c) never decided a judgement on its own.

**Examples (by money).** Kedrion Mexicana (13 days) · Proveedora de Servicios Empresariales y Soluciones Óptimas (2) · AstraZeneca (13) · Soluciones en Liderazgo Farmacéutico (13) · VE+ S.A.P.I. (14) · AbbVie Farmacéuticos (13) · Solomed (13) · Bioresearch de México (13) · Proveedora Marcel Internacional (3) · Fresenius Kabi México (13).

**Say:** «En 2 contratos competitivos, la fecha de inicio es anterior al fallo, hasta 13 días antes.» Mention 1 January starts when present. **Do not say:** «adjudicación pactada», «sabía que iba a ganar».

---

## d. Crecimiento instantáneo (`arranque`), definition owned by newtabs-data

**Definition (from `docs/NEWTABS_DEFINITIONS.md` / `precompute_newtabs.arranque`).** First CompraNet contract on or after 2011-01-01, and at least 100 MDP in the 365 days from that first contract (day 0 included). Vendors whose `base_name` matches a vendor with an earlier first contract are dropped as re-incorporations; personas físicas are counted upstream but not listed. Every `newtabs_arranque` row is one vendor with this signal.

**Coverage.** 1,053 rows; 1,044 at companies here (9 public bodies dropped). 620,859 MDP in first-year money. It does not reproduce the 1,347 of the concept round (the audit already noted 1,024 under a calendar-year rule); this is the frozen version.

**Caveats.** Many of the biggest rows are special-purpose vehicles for a single project (APP highway companies, Tren Maya tramos, consortia) and new RFCs of established groups. `days_to_threshold = 0` means one contract above 100 MDP. Six of the top 10 carry the > 10,000 MDP flag.

**Examples (by first-year money).** Grupo Constructor Marhnos · ICA Constructora · CIC Corporativo Industrial Coahuila · Bahud Processing México · Desarrollo del Sureste Playa del Carmen Tulum · Consorcio Lamat Tramo 1 · APP Arriaga-Tapachula · Azvindi Ferroviario · ICA Constructora de Infraestructura · Abener Energía.

**Say:** «primer contrato federal registrado en CompraNet»; «recibió X en los 365 días posteriores». **Do not say:** «empresa nueva», «debutante», «empresa fantasma» (owner rule, 2026-10-16).

---

## e. Fraccionamiento el mismo día (`mismo_dia`), definition owned by newtabs-data

**Definition (`precompute_newtabs.mismo_dia`).** Same federal buyer × vendor × contract date × legal schedule (LAASSP or LOPSRM). Pieces are direct awards, each below the lowest-band PEF direct-award cap of that year. A lot is at least 2 pieces whose sum exceeds the highest-band cap plus IVA. Caps are transcribed from PEF Anexo 9 for 2019–2025 only. Buyers excluded: Pemex and CFE (own procurement law), autonomous, judicial and legislative bodies, and autonomous universities. The vendor fires with at least one lot.

**Coverage.** 2019–2025, 27 federal buyers. 1,622 lots, 316 vendors; 280 at companies here. 1,656 MDP. The lots do not use any official's name; the concept-round grouping by an official's name field is gone.

**Caveats.** The newtabs placebo shows lot counts barely move when caps are scaled 0.5–2× (1,368 to 1,640), so the signal mostly finds repeated same-day small orders, not bunching under the cap. The top vendors are food and pharmacy suppliers with hundreds of lots (restocking patterns). Treat it as corroboration only.

**Examples (by lot money).** Alen del Norte (228 lots) · Summa Company (138) · Farmacéuticos Maypo (134) · Molinos Azteca (69) · Molinera de México (60) · Brand and Push (32) · Productos Alimenticios La Moderna (44) · Fábrica de Jabón La Corona (46) · Servicios de Farmacia Prefarma (38) · Conservas La Costeña (37).

**Say:** «una institución federal le adjudicó directamente el mismo día 9 contratos, cada uno bajo el tope, que juntos superan el tope más alto». **Do not say:** «fraccionó para evadir la licitación» (intent is not in the data).

---

## f. Pareja de largo plazo sin competencia (`pareja`), definition owned by newtabs-data

**Definition (`precompute_newtabs.parejas`, `frozen = 1`).** Vendor × buyer pair whose longest run of consecutive contract years is at least 10, and at least 80 % of the pair's money dated 2011 or later went by direct award or single bid. The vendor fires with at least one frozen pair.

**Coverage.** 2,373 frozen pairs, 1,984 vendors; 863 of the pairs belong to personas físicas and are never scored here; 1,180 companies remain. 371,139 MDP of pair money.

**Caveats.** Long relationships are normal for patent holders, utilities and consolidated pharma. The audit measured a size-matched GT lift below 1 for tenure alone. It is used here only as one of several converging signals.

**Examples (by pair money).** Siemens Innovaciones (CFE 2006–2017) · Selecciones Médicas (ISSSTE 2002–2019) · Productos Hospitalarios (IMSS 2002–2025, 6 pairs) · Medicamentos y Servicios Integrales del Noroeste (IMSS 2013–2025) · Aplicaciones Médicas Integrales (IMSS) · Distribuidora de Equipo Médico e Industrial de México (IMSS) · Dicipa (ISSSTE) · Casa Plarre (IMSS) · Baxter (ISSSTE) · Farmacéuticos Maypo (INCan).

**Say:** «13 años seguidos con el IMSS; 99 % del dinero desde 2011 por adjudicación directa o con un solo ganador». **Do not say:** «captura», «relación corrupta».

---

## g. Empresa joven al primer contrato (`empresa_joven`)

**Definition.** The incorporation date encoded in the vendor's company RFC falls 0 to 179 days before its first recorded federal contract.

**Logic.**
- Company RFC only: 12 characters, `^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$`. A 13-character RFC is a persona física and encodes a birth date; it is never parsed.
- Positions 4–9 are YYMMDD; YY above 26 is read as 19YY. Impossible dates are dropped.
- First contract = earliest date in CompraNet 2002–2025 or ComprasMX 2025–26.
- Fires: `0 ≤ first contract − incorporation < 180 days`. A first contract before incorporation (30 vendors) is a data or RFC-reuse question, not this signal.
- Only the gap in days leaves the builder. Neither the RFC nor the incorporation date is stored or returned.

**Why the old `sig_young_company` never fired (0 of 5,869) and this one does.** The old flag lived in `compute_ghost_confidence.py`, which only scores P2 «ghost» vendors, and non-EFOS P2 requires *no* RFC, so the date could never be read. It also used `company_registry.rfc_age_years`, the age today, not at first contract. This signal reads the RFC of every company and compares it with the first contract.

**Basis.** World Bank INT red flags ("newly formed bidder, no track record"), GTI / Fazekas winner-side indicators, IMCO's «proveedores de reciente creación».

**Coverage.** 53,563 vendors carry a parseable company RFC (RFC coverage: A 0.1 %, B 15.7 %, C 30.3 %, D 47.4 %). 2,654 fire before the company filter, as in the audit; 2,610 companies here. By first year: 2002–2010 363 · 2011–2017 1,245 · 2018–2022 740 · 2023–2026 262.

**Caveats.** The signal is about the company's age *at its first contract*, which can be decades ago. Project SPVs and consortia are young by design. Money and contracts are the vendor's whole record.

**Examples (by money).** DMGP Servicios de Integridad (53 days) · Azvindi Ferroviario (6) · APP Arriaga-Tapachula (19) · Abalat (169) · Medicamentos y Servicios Integrales del Noroeste (161) · Total Farma (55) · Conservación Matehuala-San Luis Potosí (23) · Marcas Nestlé (149) · Dibiter (97) · APP Tamaulipas (10).

**Say:** «Su RFC indica que se constituyó 6 días antes de su primer contrato federal registrado (2020).» **Do not say:** «empresa fantasma», «creada para el contrato», never the RFC itself.

---

## h. Más de la mitad del gasto de un comprador (`comprador_dominado`)

**Definition.** In some calendar year the vendor took more than half of a buyer's money, where that buyer-year had at least 5 suppliers and at least 100 MDP.

**Logic.** Group by institution × year × vendor (amount > 0, ≤ 100,000 MDP; CompraNet plus ComprasMX not-in-contracts rows). Fires when `share > 0.5`, `suppliers ≥ 5`, `buyer-year total ≥ 100 MDP`. Exactly 50 % does not fire.

**Basis.** Buyer-side supplier dominance (GTI winner share of buyer spend; IMCO concentration). It is the buyer-side mirror of ARIA P6.

**Reproduction.** 628 qualifying buyer-years of 19,240 (1.08 billones de pesos). The audit counted 635 of 19,241 (1.34 billones) before the 2026-10-20 decimal fixes, which removed or divided 15 contracts of up to 9,754 MDP each. The 7-row and 0.26-billón gaps are consistent with those fixes. 555 buyer-years belong to companies (the rest are public bodies or personas físicas, never scored).

**Caveats.** Monopolies by law or by patent (vaccines at BIRMEX, insurers for Hacienda's consolidated policy, the airport contract at GACM, fuel for CFE) dominate the top. Use it as corroboration, never alone.

**Examples (by money in dominated buyer-years).** Operadora CICSA (GACM 2017, 95 %) · Laboratorios Liomont (BIRMEX 2026, 50.1 %) · Seguros Banorte (SHCP 2026, 73 %) · Alstom Transport México (Fonatur 2021, 55 %) · Coahuila Industrial Minera (CFE 2003, 65 %) · ICA Fluor Daniel (Pemex 2009, 58 %) · Ingenieros Civiles Asociados (Gobierno del DF 2008, 96 %) · MetLife México (SHCP 2014, 72 %) · Repsol Comercializadora de Gas (CFE 2007, 52 %) · Nalco de México (Pemex 2009, 54 %).

**Say:** «En 2017 recibió 95 % del gasto del GACM, que compró a 134 proveedores.» **Do not say:** «capturó a la institución».

---

## ARIA «Nuevos» by signals (`aria_nuevos_signals`)

**Rule.**
- At least 2 distinct signals in `vendor_signals`.
- **No ground-truth link of any kind**: not in `ground_truth_vendors` at all (any case, any match method, false positives included), not in any `public_labels.label_sets` set (documented, leads, fp, suppressed), not `in_ground_truth` and not analyst-marked FP in `aria_queue`.
- Company (same filter as above), with a contract in 2019 or later (same activity filter as `GET /aria/rosettes?set=nuevos`).
- **Rank:** number of signals first, then the vendor's total money (CompraNet + ComprasMX). There is no GT bonus and no model score in the rank. Ranking by the raw product signals × money would let money decide almost everything, because money spans six orders of magnitude.
- `novel = 1` on every row; the test suite checks the set is disjoint from every GT label set.

**Size (2026-10-20).**

| Signals | Vendors | Money (MDP) |
|---|---|---|
| 2 | 485 | 260,340 |
| 3 | 54 | 85,615 |
| 4 | 12 | 17,766 |
| 5 | 3 | 2,917 |
| 6 | 1 | 732 |
| **Total** | **555** | **367,370** |

---

## Precision sample (first estimate)

**Method.** 30 vendors drawn from `aria_nuevos_signals` with a fixed seed (20261020), stratified by signals: 12 of the 485 with 2, 10 of the 54 with 3, 8 of the 16 with 4 or more. For each, the evidence visible in the data (buyers, direct-award share, top contracts and titles, every signal's detail). No web search. Judgement: **anomalous** = worth an analyst opening the file; **ordinary** = the pattern has a plain structural explanation; **unclear** = cannot tell from the data. «Anomalous» is a triage call, not a finding of wrongdoing.

| Rank | Vendor | Signals | Evidence in the data | Judgement |
|---|---|---|---|---|
| 1 | Gambars Distribuidora | 6 | RFC 28 days before first contract (2019); 191 MDP in year 1, 92 % direct; 83 % of 2023+ money by urgency articles (buyers 23 %); 12 of 20 tenders reduced (4.7 expected); same-day lots of 8–9 pieces at IMSS | anomalous |
| 2 | Orvi Distribuciones | 5 | 1,405 MDP by urgency, 86 % (buyers 24 %), incl. a 437 MDP «compra emergente» 2025; IMSS pair 2016–25, 96 % non-competitive; 38-piece same-day lot | anomalous |
| 3 | Gomen Health Care | 5 | 99 % IMSS; 984 urgency contracts, 84 %; 27 of 38 tenders reduced (9.7 expected); 15- and 25-piece same-day lots; IMSS pair 13 years | anomalous |
| 7 | Darfarma | 4 | 98 % IMSS; 719 urgency contracts, 72 %; IMSS pair 11 years, 96 % non-competitive; 6 of 9 tenders reduced | anomalous |
| 8 | Proveedora de Insumos Médicos para la Vida | 4 | RFC 6 days before first contract (2020); 94 MDP in year 1; 100 % IMSS; 91 % urgency | anomalous |
| 9 | Productos Farmacéuticos EKA | 4 | RFC 133 days before first contract; 349 MDP by urgency, 88 %; 15 of 19 tenders reduced | anomalous |
| 13 | Indimex Trading | 4 | RFC 77 days before first contract; 99 % IMSS; 95 % urgency (26 contracts); 9 of 15 tenders reduced | anomalous |
| 15 | Sologmedic | 4 | small (53 MDP); 85 % urgency at IMSS; one 11-piece lot; RFC 161 days; one shared 17-day early start | unclear |
| 18 | Merck Sharp & Dohme Comercializadora | 3 | patent holder; dominant at the reproductive-health centre in 2019 (contraceptive implants); new RFC of an established group | ordinary |
| 24 | Caritas Pharma | 3 | 224 MDP in 21 days (2021); 3 of 3 tenders reduced incl. a 1,036 MDP consolidated buy; early starts are the 1 January 2025 consolidated purchase | unclear |
| 29 | Olympus America de México | 3 | endoscopy brand supplier; urgency on 4 ISSSTE equipment buys; long hospital pairs | ordinary |
| 34 | Husama Healthcare | 3 | 95 % IMSS; 86 % urgency (127 MDP); one 12-piece lot; shared 17-day early start | anomalous |
| 37 | Comercializadora Alefarm | 3 | 94 % IMSS; 97 % urgency (132 MDP); one 6-piece lot | anomalous |
| 42 | Distribuidora de Fármacos y Fragancias | 3 | active since 2002, mostly state licitaciones; 86 % urgency since 2023; IMSS pair 14 years | unclear |
| 44 | Disamed | 3 | 98 % IMSS; 7 of 11 tenders reduced; IMSS pair 12 years, 91 % non-competitive | unclear |
| 47 | Hi Tec Medical del Sur | 3 | recurring subrogated infusion and surgery services for IMSS-Bienestar bought by urgency / caso fortuito, 94 % (buyers 31 %), 2025–26 | anomalous |
| 48 | Comercializadora Global Business | 3 | 100 % IMSS; one 119 MDP direct award in 2019; 98 % urgency since 2023 | anomalous |
| 57 | World Diagnostic S.A.P.I. | 3 | RFC 62 days before first contract (2023); 133 MDP in year 1, 100 % direct, by urgency (regional metformin buys) | anomalous |
| 124 | Rex Farma | 2 | active since 2006; early start is the 1 January 2025 consolidated buy; one 10-piece lot | ordinary |
| 134 | ARW Solutions | 2 | IMSS hemodialysis services; 14 of 23 tenders reduced (6.7 expected); 1-day early start | unclear |
| 150 | TCA Empresarial | 2 | IMSS toner by licitación for 19 years, 92 % single-winner; young at first contract in 2006 | unclear |
| 250 | Soluciones Inmesol | 2 | building maintenance; 2-day early start; young in 2016 | ordinary |
| 289 | Neutratec | 2 | hazardous-waste collection, a regulated niche; long hospital pairs; 11-day early start | ordinary |
| 310 | Sistemas de Impresión Digital | 2 | photocopying by licitación; 1-day early start; small pair | ordinary |
| 415 | Gas de Oaxaca | 2 | local LP-gas supply to IMSS; urgency on 8 contracts | ordinary |
| 420 | Comercializadora Diplus | 2 | 100 % IMSS, 93 % direct, 59 MDP; 93 % urgency since 2023 | unclear |
| 474 | Y and E Industry | 2 | SEDENA tyres by licitación; one early start flagged emergency | ordinary |
| 483 | Meta Suministros Médicos | 2 | hospital furniture, 23 MDP; 4-day early start | ordinary |
| 484 | Grupo Leyraj | 2 | RFC 59 days before first contract (2022); 100 % IMSS, 100 % direct; 83 % urgency; 23 MDP | unclear |
| 505 | Abastecedora Cruz-Her | 2 | 14 MDP of small hospital orders; young in 2013 | ordinary |

**Result.**

| Stratum | Sampled | Anomalous | Unclear | Ordinary |
|---|---|---|---|---|
| 4–6 signals (16) | 8 | 7 | 1 | 0 |
| 3 signals (54) | 10 | 5 | 3 | 2 |
| 2 signals (485) | 12 | 0 | 4 | 8 |

- Weighted to the whole set of 555: about **7 % anomalous, 32 % unclear, 60 % ordinary**.
- Restricted to the 70 vendors with **3 or more signals**: about **59 % anomalous, 26 % unclear, 15 % ordinary**.
- The samples are small (8 / 10 / 12). Read these as direction, not a rate.

**What the sample says.**
1. **Two signals is too weak; three is where precision starts.** Recommendation: the «Nuevos» wall defaults to `min_signals=3` (70 vendors) and shows the 2-signal tier as a watch list. The endpoint already takes `min_signals`; its default stays 2 as specified.
2. **The anomalous cluster is one story.** Small and mid-size medicine distributors, almost all money from IMSS (and IMSS-Bienestar), most of it by Art. 41 fr. II/V emergency direct awards in 2023–2024, often young firms with same-day lots and reduced tenders. This is the medicine-shortage buying period. It deserves one investigation file, not 50 separate claims.
3. **Weak links found.** (c) mostly marks buyer-level events (the 1 January 2025 consolidated purchase; one 2026 procedure). (g) adds little when the first contract is 10–20 years old. (f) and (h) fire on patent holders and regulated suppliers. These are v2 refinements, not applied, because each definition is frozen for this run.

**v2 candidates (each needs a new doc version and a rerun).**
- (c): count a contract only when most winners of the same procedure did not also start early.
- (g): drop it from the «Nuevos» count when the first contract is before 2015, and show the first-contract year in the list.
- (f) and (h): leave out money under patent / single-source articles where the article is known (D, ComprasMX).

---

## How analyst-confirmed vendors feed the next retrain

1. An analyst reviews a «Nuevos» vendor from the data and from primary sources (ASF audits, SFP sanctions, court or press records). The signals only open the file.
2. Only sourced evidence creates a case: a `ground_truth_cases` row with `case_id = 'CASE-{id}'`, `case_origin` set to the source type, provenance tier A/B per `public_labels.DOCUMENTED_LINK_SQL`, and a `ground_truth_vendors` link. Record which signals triggered the review in `notes`.
3. A vendor reviewed and cleared gets `review_status = 'false_positive'` in `aria_queue` (or a `ground_truth_vendors` FP link). Either one removes it from «Nuevos» on the next build.
4. The next retrain learns the confirmed vendors like any other label. The signals stay out of the model's features, so the model cannot simply learn the rule back.
5. Signals are re-validated by precision on fresh samples, never by GT lift. Once their own finds become GT, GT lift is circular.

## Files

- `backend/scripts/compute_senales_nuevas.py`: definitions, builder, writer.
- `backend/api/routers/senales.py`: labels, ES/EN sentences, endpoints. Registered with one line in `backend/api/main.py`.
- `backend/tests/test_senales.py`: definitions on crafted rows, 100B rule, companies only, buyer baseline, newtabs reuse, «Nuevos» disjoint from GT, no RFC in tables or payloads, no "corrup" wording.
- Prod: not shipped. The two tables need the builder run on the deploy DB after the newtabs tables exist there, or a table dump.
