# Scope numbers — rebased headline figures after the buyer-scope overhaul (2026-10-23)

Plan: `docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md` Phase 0–1 · evidence: `docs/INSTITUTION_SCOPE_2026-10-22.md`.
Source: LOCAL `backend/RUBLI_NORMALIZED.db`, night of 2026-10-22, after `scripts/classify_buyer_scope.py --write` and a regrade under the FROZEN calibration `CAL-GV3-20261008060330` (never recalibrated). Prod has none of this until the data step in § 7 runs. Every number below was recomputed read-only by the SQL shown. Amounts > 100B MXN are excluded by the precomputes (`contracts_canon`, CLAUDE.md § Critical Data Rules).

Buyer scope = `institution_canonical.buyer_level`: federal (incl. the 16 autonomous) · estatal · municipal · otro (0 rows after overrides). Every id of a canonical group carries its group's level. «Local» = estatal + municipal.

Status: **Verified** = recomputed from the DB by the SQL shown · **Changed** = differs from what the site prints today.

## 1. Classification coverage — Verified

| scope | canonical buyers | value (T MXN, institution_stats) |
|---|---|---|
| federal | 438 | 8.37 |
| estatal | 1,284 | 1.00 |
| municipal | 1,740 | 0.21 |
| otro | 0 | 0 |

- `state_code`: **100.00 %** of state + municipal money (3,024 / 3,024 buyers). Plan target ≥ 95 % — met. The codes come from `migrate_institutions.py`'s INEGI resolution (`state_inegi`); the name/siglas parser in the new script only fills rows that lack one (none on this DB).
- `municipality_code`: 89.98 % of municipal money (1,708 / 1,740 buyers). The 32 unmatched are CompraNet's pooled placeholders «_Gobierno Municipal del Estado de X» (one per state, 18.6 B MXN in all). No single municipality exists to match, so they keep their state code and a NULL municipality (never guessed). The dry run lists them.
- Overrides (name prefix of the canonical row, `OVERRIDES` in the script): API Baja California Sur and API Veracruz → federal; Universidad Tecnológica de León (GTO) and de la Mixteca (OAX) → estatal. Spot-checking the grade level moves found four more: IPICYT (CONACYT centre) and Instituto Tecnológico El Llano (TecNM campus) → federal; UNAQ → estatal (QRO; its «QRO-» twin was already state); Agua de Hermosillo → municipal (26030).

```sql
SELECT buyer_level, COUNT(*) FROM institution_canonical WHERE institution_id = canonical_id GROUP BY 1;
-- coverage + unmatched list: python -m scripts.classify_buyer_scope --db <DB>   (dry run)
```

## 2. Salud agency count — Changed

The sector page clause «Instituciones que compran en el sector» reads `precomputed_stats['sectors'].total_institutions` (distinct canonical buyers with a contract in the sector). By default it now reads the federal count, and its note names the scope.

| sector | all buyers (today's figure) | federal (new default) | local |
|---|---|---|---|
| 1 Salud | 583 | **259** | 324 |
| 2 Educación | 451 | 78 | 373 |
| 3 Infraestructura | 2,565 | 285 | 2,280 |
| 4 Energía | 512 | 290 | 222 |
| 5 Defensa | 230 | 73 | 157 |
| 6 Tecnología | 672 | 290 | 382 |
| 7 Hacienda | 79 | 45 | 34 |
| 8 Gobernación | 196 | 39 | 157 |
| 9 Agricultura | 73 | 44 | 29 |
| 10 Ambiente | 219 | 12 | 207 |
| 11 Trabajo | 58 | 23 | 35 |
| 12 Otros | 544 | 95 | 449 |

The scope doc's «142 agencias» is a different population: institutions *assigned* to Salud via `institutions.sector_id` (the atlas `sector-institutions` list on the same page), 142 = 51 federal + 91 estatal. Both populations now follow the same switch.

```sql
-- precompute_stats.sector_canon_counts (contracts_canon = contracts re-keyed to canonical ids, ≤ 100B)
SELECT c.sector_id, COUNT(DISTINCT c.institution_id),
       COUNT(DISTINCT CASE WHEN k.buyer_level = 'federal' THEN c.institution_id END),
       COUNT(DISTINCT CASE WHEN k.buyer_level IN ('estatal','municipal') THEN c.institution_id END)
FROM contracts_canon c LEFT JOIN institution_canonical k ON k.institution_id = c.institution_id
WHERE c.sector_id IS NOT NULL GROUP BY c.sector_id;
-- assigned population (atlas sector-institutions):
SELECT i.sector_id, COUNT(*), SUM(k.buyer_level = 'federal'), SUM(k.buyer_level IN ('estatal','municipal'))
FROM institution_stats ist JOIN institutions i ON i.id = ist.institution_id
JOIN institution_canonical k ON k.institution_id = ist.institution_id
WHERE ist.total_contracts > 0 GROUP BY 1;
```

## 3. Sector per-agency averages — Verified (no page prints them today)

Unweighted mean of `institution_stats.avg_risk_score` over the assigned population. Recorded so any future copy uses the scoped figure. Local means are lower partly by measurement: these buyers sit mostly in Structures A/B, where RFC coverage is weak and risk is underestimated (CLAUDE.md § Data Sources).

| sector | all | federal | local |
|---|---|---|---|
| 1 Salud | 0.257 | 0.289 | 0.239 |
| 2 Educación | 0.268 | 0.275 | 0.266 |
| 3 Infraestructura | 0.231 | 0.281 | 0.230 |
| 4 Energía | 0.257 | 0.262 | 0.231 |
| 5 Defensa | 0.273 | 0.284 | 0.182 |
| 6 Tecnología | 0.327 | 0.348 | 0.292 |
| 7 Hacienda | 0.280 | 0.303 | 0.254 |
| 8 Gobernación | 0.264 | 0.299 | 0.256 |
| 9 Agricultura | 0.235 | 0.231 | 0.241 |
| 10 Ambiente | 0.247 | 0.267 | 0.246 |
| 11 Trabajo | 0.271 | 0.300 | 0.251 |
| 12 Otros | 0.277 | 0.361 | 0.270 |

```sql
SELECT i.sector_id, ROUND(AVG(ist.avg_risk_score), 3),
       ROUND(AVG(CASE WHEN k.buyer_level = 'federal' THEN ist.avg_risk_score END), 3),
       ROUND(AVG(CASE WHEN k.buyer_level IN ('estatal','municipal') THEN ist.avg_risk_score END), 3)
FROM institution_stats ist JOIN institutions i ON i.id = ist.institution_id
JOIN institution_canonical k ON k.institution_id = ist.institution_id
WHERE ist.total_contracts > 0 GROUP BY 1;
```

## 4. Grades — «% reprobadas» and the three leagues — Changed

The peer level now comes from `buyer_level` (it came from `is_federal` + `institution_type`). Each league is graded within its own level. The league page shows three level chips (federal by default) and no longer offers an all-levels table.

| state | graded | federal graded | federal D+F | federal D+F value share | ex-top (IMSS) | A | F |
|---|---|---|---|---|---|---|---|
| published (before) | 2108 | 398 | 69 | 31.2 % | 12.7 % | 219 (188 local) | 142 (133 local) |
| local regrade (after) | 2108 | 404 | 72 | 31.6 % | 13.0 % | 217 (186 local) | 144 (135 local) |

| level | graded | A | B | C | D | F | % D+F by count | % D+F by value | provisional |
|---|---|---|---|---|---|---|---|---|---|
| estatal | 878 | 124 | 270 | 280 | 138 | 66 | 23.2 % | 22.2 % | 280 |
| federal | 404 | 31 | 124 | 177 | 63 | 9 | 17.8 % | 31.6 % | 29 |
| municipal | 826 | 62 | 225 | 285 | 185 | 69 | 30.8 % | 27.9 % | 373 |

The league lede («Por N de M compradores federales pasaron X con calificación reprobada: P % del gasto federal… Sin IMSS, Q %») moves from **69 of 398 · 31 % · without IMSS 13 %** to **72 of 404 · 32 % · without IMSS 13 %**, rounded as the page prints them. 186 of the 217 A grades and 135 of the 144 F grades sit with state or municipal buyers, which is why the league never mixes levels.

```sql
SELECT level, COUNT(*), SUM(grade='A'), SUM(grade='B'), SUM(grade='C'), SUM(grade='D'), SUM(grade='F'),
       ROUND(100.0 * SUM(grade IN ('D','F')) / COUNT(*), 1),
       ROUND(100.0 * SUM(CASE WHEN grade IN ('D','F') THEN total_value_mxn END) / SUM(total_value_mxn), 1)
FROM institution_grades_v3 GROUP BY level;
```

### 4a. What changed vs the published grades

Against the published table: **31 level moves, 57 letter changes (18 of them among the movers), 34 provisional flips.**

The plan expected about 6 movers, but the scope doc was comparing 844 graded institutions. The current graded population is 2,108, and comparing it against `is_federal` finds 31 level moves. A level-only replay on the same data accounts for 49 of the 57 letter changes: the movers themselves, plus peer-median knock-on inside the peer sets they leave and join. The other 8 are data drift since the last grade run (the 2026-10-20 amount fix and the rescore after it), and the prod regrade will carry them too. The published table was snapshotted to the session scratchpad (`grades_v3_before.csv`, `grades_v3_sexenio_before.csv`) before the write.

**Level moves (31), largest value first:**

| id | institution | level before → after | grade before → after | score before → after | value (MDP) |
|---|---|---|---|---|---|
| 190 | FONDO DE GARANTÍA Y FOMENTO PARA LA AGRICULTURA, GANADERÍA Y AVICULTURA | estatal → federal | C → B | 57.2 → 63.6 | 4,932 |
| 329 | PROCURADURÍA GENERAL DE JUSTICIA DEL DISTRITO FEDERAL | federal → estatal | A → A | 78.0 → 76.2 | 904 |
| 602 | SISTEMA OPERADOR DE LOS SERVICIOS DE AGUA POTABLE Y ALCANTARILLADO DEL MUNICIPIO DE PUEBLA | municipal → estatal | A → A | 80.6 → 80.7 | 746 |
| 1509 | Centro de Investigación y Asistencia en Tecnología y Diseño del Estado de Jalisco, A.C. | estatal → federal | B → C | 61.3 → 55.1 | 719 |
| 192 | FONDO DE LA VIVIENDA DEL ISSSTE | estatal → federal | B → B | 63.9 → 75.3 | 463 |
| 277 | INSTITUTO PARA LA CONSTRUCCIÓN, EQUIPAMIENTO, MANTENIMENTO Y REHABILITACIÓN  DE ESCUELAS DE YUCATÁN | federal → estatal | B → B | 65.1 → 72.1 | 380 |
| 396 | SECRETARÍA DE PLANEACIÓN URBANA, INFRAESTRUCTURA Y ECOLOGÍA DE BAJA CALIFORNIA SUR | federal → estatal | B → C | 72.6 → 59.6 | 376 |
| 733 | ORGANISMO INTERMUN. MET. DE AGUA POT, ALCANT. SANEAM. Y SERVS. CONEXOS DE LOS MPIOS. DE CERRO SAN PEDRO, SAN LUIS POTOSÍ, SOLEDAD DE GRACIANO SÁNCHEZ | municipal → estatal | A → A | 90.2 → 86.8 | 329 |
| 149 | CONSEJO DE DESARROLLO DEL PAPALOAPAN | federal → estatal | B → C | 71.9 → 55.9 | 310 |
| 148 | CONSEJERÍA JURÍDICA DEL EJECUTIVO FEDERAL | estatal → federal | C → B | 56.4 → 66.1 | 229 |
| 1097 | AUTORIDAD DEL ESPACIO PÚBLICO DEL DISTRITO FEDERAL | federal → estatal | A → B | 80.3 → 67.5 | 211 |
| 37 | BANCO NACIONAL DE CRÉDITO RURAL, S.N.C. | estatal → federal | B → B | 70.7 → 75.0 | 211 |
| 701 | INSTITUTO VERACRUZANO DE FOMENTO AL DESARROLLO REGIONAL | federal → estatal | B → C | 73.4 → 56.1 | 167 |
| 860 | HEROICO CUERPO DE BOMBEROS DEL DISTRITO FEDERAL | municipal → estatal | C → C | 59.0 → 57.6 | 89 |
| 999 | SISTEMA DE RADIO Y TELEVISIÓN MEXIQUENSE | federal → estatal | B → C | 66.3 → 49.4 | 82 |
| 680 | HOSPITAL DEL NIÑO MORELENSE | federal → estatal | B → B | 69.5 → 71.3 | 63 |
| 30 | BANCO DE CRÉDITO RURAL DEL NOROESTE, S.N.C. | estatal → federal | B → B | 61.5 → 65.9 | 59 |
| 861 | HOSPITAL DE LA NIÑEZ OAXAQUEÑA | federal → estatal | B → A | 73.9 → 77.4 | 39 |
| 161 | DICONSA S.A. DE C.V. SUCURSAL ESTATAL HIDALGO | estatal → federal | B → A | 71.3 → 79.1 | 38 |
| 25 | BANCO DE CRÉDITO RURAL DEL CENTRO-NORTE, S.N.C. | estatal → federal | B → B | 62.9 → 71.4 | 29 |
| 29 | BANCO DE CRÉDITO RURAL DEL NORESTE, S.N.C. | estatal → federal | C → B | 59.6 → 70.1 | 25 |
| 32 | BANCO DE CRÉDITO RURAL DEL PACÍFICO-NORTE, S.N.C. | estatal → federal | B → A | 73.7 → 76.5 | 24 |
| 162 | DICONSA S.A. DE C.V. SUCURSAL ESTATAL METROPOLITANA | estatal → federal | C → B | 48.8 → 61.1 | 23 |
| 23 | BANCO DE CRÉDITO RURAL DE OCCIDENTE, S.N.C. | estatal → federal | B → B | 63.4 → 70.9 | 21 |
| 33 | BANCO DE CRÉDITO RURAL DEL PACÍFICO-SUR, S.N.C. | estatal → federal | B → A | 72.4 → 76.0 | 19 |
| 27 | BANCO DE CRÉDITO RURAL DEL GOLFO, S.N.C. | estatal → federal | A → A | 83.4 → 85.6 | 18 |
| 514 | FIDEICOMISO PÚBLICO DE INVERSIÓN Y ADMINISTRACIÓN DEL TRAMO CARRETERO CENTINELA-RUMOROSA | federal → estatal | A → B | 82.6 → 72.3 | 17 |
| 31 | BANCO DE CRÉDITO RURAL DEL NORTE, S.N.C. | estatal → federal | B → A | 71.1 → 77.8 | 14 |
| 28 | BANCO DE CRÉDITO RURAL DEL ISTMO, S.N.C. | estatal → federal | A → A | 83.3 → 83.9 | 7 |
| 917 | SISTEMA QUINTANARROENSE DE COMUNICACIÓN SOCIAL | federal → estatal | B → C | 75.6 → 57.4 | 7 |
| 26 | BANCO DE CRÉDITO RURAL DEL CENTRO-SUR, S.N.C. | estatal → federal | C → B | 51.4 → 64.6 | 4 |

**Letter changes inside an unchanged level (peer-set knock-on + data drift), largest value first:**

| id | institution | level | grade before → after | score before → after | value (MDP) |
|---|---|---|---|---|---|
| 1314 | Instituto Federal de Telecomunicaciones | federal | C → B | 59.5 → 60.3 | 9,715 |
| 434 | SISTEMA NACIONAL PARA EL DESARROLLO INTEGRAL DE LA FAMILIA | federal | C → B | 45.9 → 67.9 | 7,614 |
| 1880 | Comisión Nacional de Hidrocarburos | federal | D → C | 40.2 → 45.0 | 3,108 |
| 225 | INSTITUTO DE SALUD DEL ESTADO DE CHIAPAS | estatal | B → C | 62.0 → 59.9 | 2,681 |
| 1398 | ProMéxico | federal | B → C | 61.3 → 58.1 | 2,657 |
| 138 | COMITÉ DE CONSTRUCCIÓN DE ESCUELAS DEL ESTADO DE NUEVO LEÓN | estatal | A → B | 76.0 → 75.9 | 2,501 |
| 418 | SERVICIOS DE SALUD DE HIDALGO | estatal | B → C | 61.4 → 59.3 | 2,488 |
| 1457 | CAMP-Instituto de Servicios Descentralizados de Salud Pública del Estado de Campeche | estatal | A → B | 76.8 → 75.4 | 1,450 |
| 364 | SECRETARÍA DE DESARROLLO URBANO Y OBRAS PÚBLICAS DEL ESTADO DE GUERRERO | estatal | D → B | 37.8 → 64.9 | 1,226 |
| 824 | CONSEJO NACIONAL DE EVALUACIÓN DE LA POLÍTICA DE DESARROLLO SOCIAL | federal | C → B | 58.0 → 62.4 | 1,159 |
| 126 | COMISIÓN REGULADORA DE ENERGÍA | federal | C → B | 55.0 → 61.0 | 1,135 |
| 1213 | BC-Instituto de Servicios de Salud Pública del Estado de Baja California | estatal | A → B | 76.1 → 74.0 | 1,093 |
| 1235 | Tribunales Agrarios | federal | B → A | 75.4 → 76.4 | 1,061 |
| 1518 | SIN-Presidencia Municipal de Ahome | municipal | D → C | 44.0 → 44.1 | 594 |
| 726 | O.P.D. HOSPITAL CIVIL DE GUADALAJARA, JALISCO | estatal | C → D | 45.6 → 43.9 | 471 |
| 326 | PROCURADURÍA FEDERAL DE LA DEFENSA DEL TRABAJO | federal | C → B | 58.9 → 64.2 | 385 |
| 3827 | SECRETARÍA DE CIENCIA, HUMANIDADES, TECNOLOGÍA E INNOVACIÓN | federal | B → C | 62.5 → 59.4 | 357 |
| 4272 | COMISIÓN NACIONAL DE SALUD MENTAL Y ADICCIONES | federal | C → D | 44.6 → 43.5 | 351 |
| 1928 | Q ROO-Secretaría de Turismo | estatal | D → B | 35.5 → 68.2 | 345 |
| 1788 | NL-Parque Fundidora | estatal | C → A | 54.9 → 89.5 | 327 |
| 540 | INSTITUTO FEDERAL ELECTORAL | federal | C → B | 58.8 → 66.2 | 310 |
| 3695 | _Gobierno Municipal del Estado de Zacatecas | municipal | C → B | 59.9 → 60.0 | 238 |
| 1632 | VER-Secretaría de Desarrollo Agropecuario, Rural, Forestal y Pesca | estatal | D → F | 28.1 → 27.6 | 199 |
| 539 | INSTITUTO FEDERAL DE ACCESO A LA INFORMACIÓN PÚBLICA | federal | C → B | 58.7 → 65.9 | 133 |
| 3915 | ORGANISMO PÚBLICO DESCENTRALIZADO PARA LA PRESTACION DE LOS SERVICIOS DE AGUA POTABLE, ALCANTARILLADO Y SANEAMIENTO DEL MUNICIPIO DE TULTITLAN | municipal | D → C | 43.9 → 44.0 | 111 |
| 825 | CORPORACIÓN PARA EL DESARROLLO DE LA ZONA FRONTERIZA DE NUEVO LEÓN | estatal | C → B | 50.9 → 74.3 | 105 |
| 193 | FONDO NACIONAL DE APOYO A EMPRESAS DE SOLIDARIDAD | federal | A → B | 77.4 → 75.3 | 86 |
| 151 | CONSEJO DE RECURSOS MINERALES | federal | A → B | 76.1 → 74.0 | 85 |
| 275 | INSTITUTO NACIONAL INDIGENISTA | federal | A → B | 77.0 → 74.9 | 74 |
| 512 | FIDEICOMISO DEL PROGRAMA NACIONAL DE FINANCIAMIENTO AL MICROEMPRESARIO | federal | C → D | 46.7 → 44.0 | 73 |
| 775 | SERVICIOS DE SALUD DE SINALOA | estatal | C → D | 45.2 → 43.1 | 66 |
| 3149 | MOR-Régimen Estatal de Protección Social en Salud de Morelos | estatal | C → B | 59.8 → 60.1 | 50 |
| 500 | COMISIÓN NACIONAL DE ARBITRAJE MÉDICO | federal | C → D | 47.0 → 43.9 | 36 |
| 2230 | MICH-Presidencia Municipal de Erongarícuaro | municipal | D → C | 43.9 → 44.0 | 30 |
| 935 | CONSEJO NACIONAL DE NORMALIZACIÓN Y CERTIFICACIÓN DE COMPETENCIAS LABORALES | federal | A → B | 77.9 → 75.2 | 26 |
| 2390 | CDMX-Contraloría General del Distrito Federal | estatal | D → F | 28.4 → 27.9 | 17 |
| 2087 | NL-Contraloría y Transparencia Gubernamental | estatal | B → C | 60.0 → 60.0 | 16 |
| 3446 | Fondo de Empresas Expropiadas del Sector Azucarero | federal | C → D | 45.8 → 43.5 | 6 |
| 165 | DICONSA S.A. DE C.V. SUCURSAL REGIONAL NORTE-CENTRO | federal | B → C | 60.6 → 57.9 | 4 |

Per-sexenio grades (`institution_grades_v3_sexenio`) were replayed the same way: 6,987 rows, frozen calibration.

## 5. Captura plates — Changed

`/captura` now opens on federal buyers. Today's headline «4,038 empresas viven de un solo comprador federal» counts all 273 buyers, 128 of which are state or municipal.

| scope | buyers | captive pairs | money (B MXN) | still signing after 28-Sep-2025 |
|---|---|---|---|---|
| all (today) | 273 | 4,038 | 1,683.4 | 822 |
| **federal (new default)** | **145** | **3,749** | **1,641.2** | **822** |
| local | 128 | 289 | 42.2 | 0 |

The API recomputes scoped totals from the scoped rows with the precompute's own formulas (`captura_v2._scoped_totals`). `*_examined`, `candidates` and `suspect_pairs` stay all-buyer. In a scoped total, pooled personas físicas come only from buyers that have a captive pair.

```sql
SELECT CASE WHEN k.buyer_level = 'federal' THEN 'federal' ELSE 'local' END, COUNT(*), ROUND(SUM(p.m) / 1e9, 1), SUM(p.post_n > 0)
FROM captura_pairs p JOIN institution_canonical k ON k.institution_id = p.institution_id GROUP BY 1;
SELECT CASE WHEN k.buyer_level = 'federal' THEN 'federal' ELSE 'local' END, COUNT(*)
FROM captura_buyers b JOIN institution_canonical k ON k.institution_id = b.institution_id GROUP BY 1;
```

## 6. Sector top-3 buyers (El Reparto treemap) — Changed for Otros only

`sector_top_institutions` is federal by default (`:local` and `:all` keys beside it). The precompute moved to canonical ids; it used to sum raw spellings. Sectors 1–11 keep a federal top 3 (Salud: IMSS 1,772.5 B · ISSSTE 514.4 B · IMSS-Bienestar 137.6 B). Otros (12) now shows federal buyers (III Servicios, USCMM, INADEM) where it showed state ones before.

## 7. Prod data step (deploy session, never with a code deploy)

1. `python -m scripts.classify_buyer_scope --db <DEPLOY_DB>` (dry run: check the coverage line and the override list), then `--write`. This adds the 3 columns and an index to `institution_canonical`; it is idempotent.
2. `python -m scripts.compute_institution_grades_v3 --db <DEPLOY_DB>`, then `--sexenios`. Frozen calibration only, never `--recalibrate`. **Owner OK first**: § 4a lists what moves.
3. `python -m scripts.precompute_stats --db <DEPLOY_DB>` (adds `institutions_by_scope` to `precomputed_stats['sectors']`) and `python -m scripts.precompute_sector_top_institutions`.
4. Restart the API so the in-process caches (field, sexenios, sectors, captura) and the sky manifest tag (`-b1`) turn over.

Until step 1 runs, every scoped endpoint answers `scope: "all"` with the old numbers. It never pretends to be federal.

## 8. Not checked / open

- The claim that state and municipal buyers spend federal transfers (Ramo 33, FASSA, Seguro Popular) is **unverifiable from our data**: `ramo_id` is empty for them. No copy uses it, and it needs an external source before any does.
- Stories, press kit and films that quote agency counts or «% reprobadas» were not swept (Phase 3).
