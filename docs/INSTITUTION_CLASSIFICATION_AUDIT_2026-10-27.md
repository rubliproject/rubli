# Institution classification audit — 2026-10-27

Scope: all 4,703 rows of `institutions` and the sector each of their 3,177,987 contracts carries.
Source: prod nightly backup `rubli_20261027_020000.db`, opened read-only. Scripts:
`inst_audit.py` and `inst_audit2.py` in the session scratchpad. Their JSON output is on the VPS at
`/root/inst_audit*.json`. Nothing was changed.

**Verdict: not clean.** There are four separate defects. One is a data bug in the ramo table. Two
come from the classifiers. One is a batch of rows that were never classified at all. Only
2023–2025 contracts carry a ramo code, and that is 291,649 contracts, or 9 % of the total. For
everything else the contract's sector was guessed from the buyer's name or the item bought.

## 1. 288 ComprasMX buyers never classified (most visible)

IDs 4457–4744 arrived with the 2025–26 ComprasMX feed. None of them has a `name_normalized`,
`institution_type`, `is_federal` or `classification_method`. 284 of the 288 sit in sector 12
«otros». Together they hold 4,359 contracts and 149.1 bn; the Agencia de Trenes y Transporte
Público Integrado accounts for 132.8 bn of that and is correctly in infra.

| id | institution | now | should be |
|---|---|---|---|
| 4515 | Secretaría de Salud (JAL) | otros | salud |
| 4466 | Secretaría del Medio Ambiente (CDMX) | otros | ambiente |
| 4662 | Secretaría de Desarrollo Urbano y Movilidad | otros | infra |
| 4668 | Sistema de Transporte Colectivo (CDMX) | otros | infra |
| 4550 | Secretaría de Infraestructura (NAY) | otros | infra |
| 4486 / 4478 / 4607 / 4499 / 4479 | Secretaría de Salud (VER / QRO / DGO / TAB / CDMX) | otros | salud |
| 4473 | Servicios de Salud de Oaxaca | otros | salud |
| 4660 | Comisión Reguladora de Telecomunicaciones | otros | tecnología |
| 4457, 4569 … | Colegio de Bachilleres, Universidad Politécnica / Tecnológica … | otros, no type | educación, educational |

Fix: run `backend/scripts/classify_institutions.py` over IDs ≥ 4457, then refresh
`institution_stats` and the sector and institution precomputes. It is rule-based, so it needs no
model.

## 2. Ramo table: claves 40–44 carry the wrong names, and 40 maps to the wrong sector

`ramos.descripcion` and `RAMO_TO_SECTOR` (`backend/scripts/etl_classify.py:40`) are shifted
against what the contracts under each clave actually are:

| clave | table says | contracts actually from | sector now | should be |
|---|---|---|---|---|
| 40 | INFONAVIT → trabajo | **INEGI** (289 contracts, 3.0 bn) | trabajo | otros (or gob) |
| 42 | IFT → tecnología | 3 contracts, ~0 | — | — |
| 43 | INAI → gobernación | **IFT** (219 contracts, 2.0 bn) | gobernación | tecnología |
| 44 | INEGI → otros | **INAI** (71 contracts) | gobernación | gobernación ✓ |

INFONAVIT is not a ramo; it buys under its own name. CLAUDE.md's 12-sector table repeats the
error for 40, so fix it there too.

## 3. Two classifiers disagree about the same institution

The ETL gives a contract that has no ramo the sector of `classify_by_institution(name)`, its own
keyword list in `etl_classify.py`. The institution's own label comes from a different rule set,
`classify_institutions.py`. So one agency can sit in one sector on its own page and in another in
the sector totals.

- 215,996 contracts (6.8 %), worth about 885 bn, carry a sector different from their buyer's label.
  By structure: A 27.7 K · B 61.6 K · C 64.5 K · D 44.7 K · E 17.6 K.
- 565 institutions (564 bn) have a label that differs from the sector most of their contract value
  carries. In 465 of them that sector holds at least 60 % of the value.

Worst cases:

| institution | label | its contracts | why |
|---|---|---|---|
| COFEPRIS (106) | salud | 72 % infra (all 2002–22) | ETL name rule; lab equipment and uniforms filed as infra |
| PROFEPA (327) | ambiente | 82 % gobernación | ETL matches «PROCURADURÍA» → PGR cluster |
| FONATUR (194) | hacienda | infra (ramo 21) | **label wrong** — «FONDO» → finance |
| FONATUR Tren Maya (2604), FONATUR Infraestructura (3693), SECTUR (404) | hacienda | infra (ramo 21) | **label wrong** |
| SEDATU (1759), RAN (336), INSUS (2714), Procuraduría Agraria (562) | agri / gob | infra (ramo 15) | **label wrong** — ramo 15 is infra |
| Secretaría de Economía (368), IMPI (247) | hacienda | otros (ramo 10) | **label wrong** |
| XE-IPN Canal 11 (1919), Televisión Metropolitana (444) | gobernación | educación (ramo 11/48) | **label wrong** |
| Becas Benito Juárez (3503) | trabajo | educación (ramo 11) | **label wrong** |
| Exportadora de Sal (176), Servicio Geológico Mexicano (769) | energía | otros (ramo 10) | **label wrong** |
| Comité de Construcción de Escuelas de Chiapas (137), Comité Administrador … (818) | salud | educación / infra | **label wrong** |
| Régimen Estatal de Protección Social en Salud (OAX 1663, CHIS 3164, SIN 3335) | otros | salud | **label wrong** |
| Instituto Estatal de Cancerología de Guerrero (868) | otros | salud | **label wrong** |
| CONAHCYT centres: CICESE, CIDE, COLEF, ECOSUR, CIBNOR, IPICYT, CIQA, CIMAV … | educación | tecnología (ramo 38) | rule choice — see § 5 |

Total: 112 institutions whose name plainly says another sector (11.2 bn); 46 of them predate the
ComprasMX batch.

## 4. Type and federal flag

- 88 **state** ministries are typed `federal_secretariat` while `is_federal = 0`: MEX-Secretaría
  de Salud (11.6 bn), DGO-Comunicaciones y Obras Públicas (9.3 bn), Secretaría de Salud del Estado
  de México (7.0 bn), MICH-Salud (5.9 bn), state SCOPs, Sinaloa SEP … In all, 111 type/flag
  conflicts holding 120 bn. Any filter or copy that uses `institution_type` to mean «federal»
  counts these as federal.
- SON-Presidencia Municipal de Banámichi (3463) is typed `federal_agency`, sector hacienda.
- INIFAP (265) and CONAVI (816) are typed `state_agency` with `is_federal = 1`. CONAVI's sector is
  tecnología; it should be infra (vivienda).
- 421 institutions came only from the weakest rules: `DEFAULT:NO_MATCH` 237, single-word
  municipal 183, fallback 1. They hold just 11.4 bn. Spot-check them; they are not a launch issue.

## 5. Taxonomy questions — researched

**Rule this research supports:** sector = what the money is *for* (function), not which ministry
holds the budget line (ramo). That is how Hacienda itself classifies spending: the Cuenta Pública's
clasificación funcional (CONAC) puts every entity under a finalidad and a función whatever its
ramo. It is also the UN COFOG rule: classify each outlay by its primary purpose, and a unit with
several functions by its dominant one. The ramo stays on the record as an administrative fact.
`etl_classify.py` currently does the opposite (ramo first), which causes §§ 3 and 5.1.

| # | Question | Evidence | Answer | Confidence |
|---|---|---|---|---|
| 1 | Ports, airports, rail, Tren Maya under SEDENA/SEMAR (16 ASIPONAs, AICM, AIFA, GACM, FIT, Tren Maya, GAFSACOMM) | Cuenta Pública 2023 classifies **AIFA** (ramo 07, UR HZI) under *Desarrollo Económico → Transporte*, and **Tren Maya S.A.** (ramo 07, UR H0M) under *Transporte ferroviario*. The ports moved from ramo 09 to 13 by the 7 Dec 2020 decree and DOF 8 Jun 2021 sectorisation, i.e. an administrative move. | **infraestructura** for the institution *and* its ramo 07/13 contracts; show «operado por SEDENA / SEMAR» as a fact. Today those contracts sit in defensa (~60 bn, 2023–25). Primary check, Cuenta Pública 2023 functional tables: AIFA 100 % *Transporte*; ASIPONA Tampico (ramo 13) 98.7 % *Transporte*. | high |
| 2 | Guardia Nacional | ASF audits of Cuentas Públicas 2022 and 2023 (2023-5-36H00-19-0151: «institución de seguridad pública de carácter civil», programme E006) place the GN in the **Grupo Funcional Gobierno** (public order and internal security), even in 2022 when part of it ran through ramo 07. The 30 Sep 2024 constitutional reform, in force 1 Oct 2024, defines it as a «fuerza de seguridad pública», attached to SEDENA. COFOG puts police under 03 *Public order*, not 02 *Defence*. | **gobernación** (seguridad) for every year; note «adscrita a SEDENA desde oct 2024». The current label (defensa) is wrong. My earlier «defensa from 2024» suggestion is withdrawn. | high |
| 3 | CONAHCYT / SECIHTI research centres (CICESE, CIDE, COLEF, ECOSUR, CIBNOR, IPICYT, CIQA, CIMAV …) | Budget in ramo 38. ASF places CICESE in the **Grupo Funcional Desarrollo Económico**, where *Ciencia, Tecnología e Innovación* sits, not in *Desarrollo Social → Educación*. 81.9 % of CIDE's 2020 budget ran through programme E003 «Investigación científica, desarrollo e innovación». | **tecnología** — Cuenta Pública 2023 functional tables: CIDE 99.0 % and CICESE 99.8 % *Desarrollo Económico → Ciencia, Tecnología e Innovación* | high |
| 4 | IMSS-Bienestar under ramo 47 | Programmes U013 and S200 moved from ramo 12 Salud to ramo 47 by inter-ramo transfers starting Aug 2023. Ramo 47 budget: 128.6 bn in 2024, 165.6 bn in 2025. The function is health care. | **salud** (keep) — Cuenta Pública 2023: 100 % *Desarrollo Social → Salud* (49.05 bn). Add a per-entity override so ramo 47 → otros does not apply to it. | high |
| 5 | Municipalities default to infra | Own data: 88 % of municipal contract value is obra pública (172.0 of 194.8 bn; 52,297 contracts). Contract sectors agree: 186 bn infra. Municipal works are typically FAISM / ramo 33 funded (e.g. Zapopan's DOPI-MUN-R33 tenders). | **infraestructura** is right; say so on the methodology page | high |

Primary PDFs read on 2026-10-27; copies are in the session scratchpad `cp/` and in `/root/cp` on the VPS.

Sources:
[CP 2023 — IMSS-Bienestar (47AYO) functional](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/Print.47AYO.03.F_FUNC.pdf) · [CP 2023 — CIDE (3890M) functional](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/Print.3890M.03.F_FUNC.pdf) · [CP 2023 — CICESE (389ZW) functional](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/Print.389ZW.03.F_FUNC.pdf) · [CP 2023 — ASIPONA Tampico (13J3D) functional](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/Print.13J3D.03.F_FUNC.pdf) ·
[Cuenta Pública 2023 — AIFA (7HZI) functional](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/Print.7HZI.03.F_FUNC.pdf) ·
[Cuenta Pública 2023 — Tren Maya (7H0M)](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2023/tomo/VII/MAT_Print.7H0M.03.AEPE.pdf) ·
[Cuenta Pública 2024 — FONATUR Tren Maya (21W3X)](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2024/tomo/VII/MAT_Print.21W3X.03.AEPE_A.pdf) ·
[ASIPONA Tuxpan notes (ramo 9 → 13)](https://puertotuxpan.com.mx/wp-content/uploads/2025/07/10-NOTAS-A-JUNIO-2025.pdf) ·
[ASF 2021-0003](https://www.asf.gob.mx/Trans/Informes/IR2021c/Documentos/Auditorias/2021_0003_a.pdf) ·
[ASF 2022-0120 (GN)](https://www.asf.gob.mx/Trans/Informes/IR2022c/Documentos/Auditorias/2022_0120_a.pdf) ·
[ASF 2023-0151 (GN)](https://www.asf.gob.mx/Trans/Informes/IR2023c/Documentos/Auditorias/2023_0151_a.pdf) ·
[Publimetro — GN reform in force 1 Oct 2024](https://www.publimetro.com.mx/noticias/2024/10/01/entra-en-vigor-la-reforma-que-transfiere-la-guardia-nacional-a-la-sedena/) ·
[ASF 2021-0032 (CICESE)](https://www.asf.gob.mx/Trans/Informes/IR2021a/Documentos/Auditorias/2021_0032_a.pdf) ·
[Cuenta Pública 2020 — CIDE](https://www.cuentapublica.hacienda.gob.mx/work/models/CP/2020/tomo/VII/90M.01.INTRO.doc) ·
[IMSS-Bienestar ramo 47 calendar 2025](https://imssbienestar.gob.mx/assets/doc/juridico/01_normatividad/normatividad_interna/CALENDARIO_DE_PRESUPUESTO_IMSS-BIENESTAR_DEL_RAMO_47_PARAEL_EJERCICIO_FISCAL_2025.pdf) ·
[IMSS-Bienestar gestión report](https://imssbienestar.gob.mx/assets/docs/informes/Informe_de_Gestion_Gubernamental_IMSS_BIENESTAR.pdf) ·
[COFOG](https://en.wikipedia.org/wiki/Classification_of_the_Functions_of_Government) ·
[ABS COFOG-A — primary purpose / dominant function](https://www.abs.gov.au/statistics/detailed-methodology-information/concepts-sources-methods/australian-system-government-finance-statistics-concepts-sources-and-methods/2015/appendix-1-part-c-classification-functions-government-australia/classification-functions-government) ·
[ASF 2024-0214 (ramo 40 = INEGI)](https://informe.asf.gob.mx/Documentos/Auditorias/2024_0214_a.pdf) ·
[PPEF 2024 ramo 43 = IFT](https://www.ppef.hacienda.gob.mx/work/models/7I83r4rR/PPEF2024/oiqewbt4/docs/43/r43_ep.pdf) ·
[PPEF 2018 ramos catalogue (41 COFECE, 42 INEE, 44 INAI)](https://www.pef.hacienda.gob.mx/work/models/PPEF2018/docs/exposicion/EM_Capitulo_1.pdf) ·
[Zapopan FAISM tender](https://www.zapopan.gob.mx/wp-content/uploads/2024/05/CONV_012_TABLOIDE.pdf)

§ 2 is now confirmed by those catalogue sources: 40 = INEGI, 41 = COFECE, 42 = INEE, 43 = IFT,
44 = INAI. So the ramo map should read 40 → otros (statistics), 42 → educación, 43 → tecnología,
44 → gobernación.

## Suggested order

1 (classify the 288) → 2 (ramo 40/43/44 + CLAUDE.md) → the «label wrong» rows of § 3 → § 4 type
fixes → § 5 decisions → one rule set for both classifiers, then a re-derive of
`contracts.sector_id` for rows with no ramo.

Every step after 1 is a prod DB write followed by a refresh of the sector, institution and ARIA
precomputes. Risk scores don't use sector directly, but sector-normalised features do, so check
with `risk-model-engineer` before re-deriving any contract sectors. Steps 1–2 are safe without
that check.

## Applied on prod — 2026-10-27 (owner: «yes just go»)

Backup first: `/backups/rubli_pre_instfix_20261027.db` (backup-cron volume; `.backup`, quick_check ok).

| Fix | Rows |
|---|---|
| § 1: 288 ComprasMX institutions classified (type, sector, federal flag, size tier, autonomy); rules plus a second pass that mirrors existing labels; script `fix288.py` (scratchpad, `/root/fix288.py` on the VPS) | 288 (5 stay «otros»: women's and sports institutes, as existing rows) |
| § 1: their contracts left in «otros» take the buyer's new sector (the ETL's institution fallback) | 2,062 contracts |
| § 2: `ramos` 40/42/43/44 descriptions and sectors; contracts under those claves | 511 contracts (40 → otros 289, 42 → educación 3, 43 → tecnología 219) |
| § 2: INEGI (1286) → otros, in line with ramo 40 | 1 |
| § 3: «label wrong» sector fixes: FONATUR ×3, SECTUR, SEDATU, RAN, INSUS, Procuraduría Agraria, CONAVI → infra · SE, IMPI, Exportadora de Sal, SGM → otros · Canal 11, Canal 22, Becas BJ, 2 school-construction committees → educación · 3 Seguro Popular regimes, Cancerología Guerrero → salud | 24 |
| § 5: Guardia Nacional → gobernación (type federal_agency) · 10 CONAHCYT centres → tecnología (9 retyped research_education) | 11 |
| § 4: 88 state ministries typed `federal_secretariat` → `state_agency` · Banámichi → municipal / infra | 89 |

Code: `etl_classify.py` RAMO_TO_SECTOR, the `etl_create_schema.py` seed and the CLAUDE.md table were corrected;
test `backend/tests/test_ramo_map.py`. Not done: the ports, airports and Tren Maya *contracts* (ramo 07/13 → defensa)
are left as they are. Moving them means re-deriving contract sectors, which waits on the model check (§ «Suggested
order»). Their institution labels are already infra.

Refreshed after the writes: precompute_stats, sector largest contracts, sector vendors, institution scorecards,
slow endpoints, atlas sky (+ years backfill).

## Effect on risk scores (checked 2026-10-27)

v0.9.2 features read `contracts.sector_id` (`_v10/build_v10.py` on `model/v010-build`): cross-sectional z-scores within sector × [Y−2, Y] windows, the sector median amount, and the sector spread. So the 2,573 contracts whose sector moved today (2,062 ComprasMX + 511 under ramos 40/42/43) still carry scores built on their old sector until the next rescore. That is 0.08 % of contracts; the windows they left or joined barely move. Moving the ports, airports and Tren Maya contracts (ramo 07/13 → infra) shifts two sector windows, so it belongs with the next planned rescore (mle-workflow), not as a standalone fix.
