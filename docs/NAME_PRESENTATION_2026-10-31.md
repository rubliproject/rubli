# Name presentation — contract titles and state institutions (2026-10-31)

Owner asks: (a) contract titles that arrive ALL CAPS should read cleanly; (b) state and
municipal buyers print as «JAL-Secretaría de Salud», which looks sloppy.
**Display only.** No stored value changes; every transform runs in the browser.

## Survey (read-only, local `RUBLI_NORMALIZED.db`)

Sample: 30 contiguous blocks of 1,000 contracts across the id range (29.4K rows) plus 4,000
`comprasmx_contracts` rows (structure E). "All caps" = no ASCII lowercase letter.

| Structure | Titles ALL CAPS | Descriptions ALL CAPS |
|---|---|---|
| A 2002–10 | 25.3 % | — (empty) |
| B 2010–17 | 78.1 % | — (empty) |
| C 2018–22 | 81.2 % | 75.6 % |
| D 2023–25 | 99.7 % | 100 % |
| E ComprasMX | ~100 % (3,999 / 4,000) | — |

Patterns in the caps text:
- **Accents missing** in older rows: ADQUISICION (2,060 in sample), CURACION, CONSTRUCCION, MEDICO/S,
  ELECTRICO, PUBLICA, LAVANDERIA, ENERGIA … Newer rows carry them (ADQUISICIÓN, MÉDICO).
- **Siglas**: IMSS, ISSSTE, CFE, PEMEX, CDMX, UMF, UMAE, HGZ, OOAD, RPBI, CONAFE, INIFAP, INSABI.
- **Procedure / school codes**: LA-012M7B998-E165-2021, AA-050GYR001-E207-2019, CCT 15DPR1477Q, COVID-19.
- **Roman numerals**: II (118), III, IV, VIII, XXI — and look-alikes that are words (CIVIL, LIC).
- **Units / ordinals**: KM, ML, MG, CM, MM, M2/M3, 2DA, 1RA, 3ER; km stations 16+000.
- **Corporate suffix** S.A. DE C.V.; abbreviations ADQ., MANTTO, SERV, GPO, Y/O, S/N.
- **State abbreviations** at the end: «, MICH.», «, QRO», «, SON.», «, N.L.».
- Pre-2010 «ý» encoding artifact (MýDICO) — still stripped, not recoverable.

Institutions: **2,218 of 4,415** carry a `XXX-` prefix. 32 codes, all states:
PUE 247 · OAX 210 · MEX 136 · VER 136 · MICH 135 · HGO 104 · SON 94 · YUC 85 · GTO 76 · ZAC 74 ·
CHIH 70 · DGO 65 · NL 65 · TAB 65 · TLAX 56 · SLP 52 · JAL 51 · CHIS 49 · MOR 48 · SIN 47 ·
COAH 44 · QRO 39 · AGS 37 · TAMPS 35 · GRO 34 · CDMX 32 · CAMP 32 · NAY 29 · BC 25 · COL 24 · BCS 17.
Not states: `Pemex-Refinación` (×4 Pemex subsidiaries) and `XE-IPN Canal 11` — left alone.
Municipal buyers are mostly «Presidencia Municipal de X» (`gobierno_nivel = GM`, 1,833 rows);
44 prefixed names are ALL CAPS (DGO-AGUAS DEL MUNICIPIO DE DURANGO); one has a space after the dash.

Before this change: `toTitleCase` (lib/utils.ts) deliberately *kept* the prefix uppercase, and
`shortenContractName` upper-cased every title then lower-cased all but the first letter — so
siglas died («para el imss») and mixed-case titles lost their own capitals.

## What changed (one place, every caller)

- `formatContractTitle()` (lib/utils.ts): ALL-CAPS → Spanish sentence case. Kept upper: a sigla
  whitelist, consonant-only tokens (SHCP, HGZ, DVFN — not units), roman numerals II–XXXIX, any
  token with a digit and a letter (codes), dotted abbreviations (S.A., N.L., U.I.), short
  siglas in parentheses. Accents restored only where unambiguous: every `-CION/-SION`, plus a
  small dictionary (MEDIC-→médic-, ELECTRIC-→eléctric-, ENERGIA, LAVANDERIA, LINEA …). State
  and big-city names capitalised. Anything else is lower-cased, never guessed. Mixed-case text
  is returned untouched.
- `shortenContractName()` now uses it (and keeps a mixed-case title's casing); so do
  `cleanContractDescription` and all its callers.
- The API response normaliser (api/client.ts) applies `formatContractTitle` to `title` /
  `description` on contract-shaped rows (has `amount_mxn` or `contract_number`), so raw
  `{c.title}` renders are covered too.
- `presentInstitutionName()`: «JAL-Secretaría de Salud» → «Secretaría de Salud · Jalisco».
  Used by the normaliser for `institution_name` and by `formatEntityName('institution', …)`.
  Idempotent. On truncation the state is kept (twenty states have a «Secretaría de Salud»).
- **Exports keep the source text** (review decision 2026-11-02): whenever the normaliser recases
  a field it keeps the original as `<field>_raw` (`title_raw`, `institution_name_raw`,
  `vendor_name_raw` …). Every client-side CSV reads it through `rawText(row, field)` — ADestiempo,
  Arranque, RastroRegistro, SkyLasso, the vendor-dossier CSV — and the generic exporters
  (`TableExportButton`, `useBulkExport`) substitute `<k>_raw` and drop the `_raw` columns.
  Sorting and screens use the display value. Server-side exports (`/export/…`) were always raw.
- `<InstitutionNameText>` renders the « · Jalisco» part in `text-text-muted`, normal weight —
  inside `EntityIdentityChip` and the institution dossier h1. State names are proper nouns; no
  new bilingual label.

## Before → after

| Before | After |
|---|---|
| ADQUISICION DE MATERIAL ELECTRICO Y DE FERRETERIA | Adquisición de material eléctrico y de ferretería |
| DESARROLLO DEL SISTEMA DE INFORMACION MEDICO FINANCIERO (SIMEF) DEL ISSSTE | Desarrollo del sistema de información médico financiero (SIMEF) del ISSSTE |
| AA-018TOQ807-N44-2012 DOTACION DE UTILES DE LIMPIEZA … | AA-018TOQ807-N44-2012 dotación de útiles de limpieza … |
| APLICACION DE PINTURA … AEROPUERTO INTERNACIONAL DE CHETUMAL, QUINTANA ROO | Aplicación de pintura … aeropuerto internacional de Chetumal, Quintana Roo |
| ESCUELA PRIMARIA "REYES AZTECAS", CCT 15DPR1477Q | Escuela primaria "reyes aztecas", CCT 15DPR1477Q |
| SERVICIO DE PRODUCCION DE 2018 DOVELAS EN ESTACIONES DEL METRO CDMX | Servicio de producción de 2018 dovelas en estaciones del metro CDMX |
| ADQUISICION DE EQUIPO MEDICO Y DE LABORATORIO, FASE II | Adquisición de equipo médico y de laboratorio, fase II |
| (list, shortened) SERVICIO DE LIMPIEZA PARA EL INSTITUTO MEXICANO DEL SEGURO SOCIAL EN OAXACA → «Limpieza para el imss en oaxaca» | Limpieza para el IMSS en Oaxaca |

| Before | After |
|---|---|
| JAL-Secretaría de Planeación, Administración y Finanzas | Secretaría de Planeación, Administración y Finanzas · Jalisco |
| MICH-Secretaría de Salud | Secretaría de Salud · Michoacán |
| PUE-Presidencia Municipal de Tlacotepec de Benito Juárez | Presidencia Municipal de Tlacotepec de Benito Juárez · Puebla |
| MEX-Presidencia Municipal de Tlalnepantla de Baz | Presidencia Municipal de Tlalnepantla de Baz · Estado de México |
| DGO-AGUAS DEL MUNICIPIO DE DURANGO | Aguas del Municipio de Durango · Durango |
| YUC-IDEFEY | IDEFEY · Yucatán |
| Pemex-Refinación (federal) | Pemex-Refinación (unchanged) |

## Known limits

- Lower-cased proper nouns outside the place list (colonias, municipalities, people: «san
  felipe tejalapam», «lázaro cárdenas») — the alternative is guessing.
- Unknown siglas that contain vowels (UMAA, PENSIONISSSTE) read lower-case unless in parentheses.
- `/institutions` sorts by the raw name, so prefixed buyers still group by state code.
- State buyers carry the state code as `siglas` (JAL, OAX … — never a real acronym). The dossier
  breadcrumb now skips it; other `siglas || name` surfaces (Captura, Anaquel, Destiempo) still
  print the bare code.
- proof:ui on `/institutions/1225` @1440 reports 1 RAGGED in `.inst-pair` (Δ 83px), identical on
  live main before this change — a data-shaped layout issue, not caused by the name change.
- Tests: `frontend/src/__tests__/namePresentation.test.ts` (40 titles, 20 institution names, rawText).
