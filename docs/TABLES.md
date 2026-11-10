# Tables and lists — inventory for the one list standard

Owner 2026-10-29: «implement this in ALL the tables on the website, with some special columns depending on what we are showing». Standard: `frontend/DESIGN.md` §8.1 «Listas». Kit: `frontend/src/components/kit/ListRow.tsx` (`RankTh`, `RankCell`, `rankNo`, `ListRow`) and `frontend/src/components/kit/ListCells.tsx` (`PRESET`, `COL`, `ListHead`, `NameCell`, `NumCell`, `AmountCell`, `PctCell`, `IndicatorCell`, `TextCell`, `SparkCell`). Paths below are relative to `frontend/src/`; line numbers are from the inventory run (branch `ui/table-standard`, 2026-10-29).

Status: **done** = on the standard · **pass** = converted in this pass · **skip** = not a data list (layout, legend, sr-only, export, primitive) or a dead/legacy route — reason given.

## Data tables (`<table>`)

| File:line | Route / surface | Preset | Status |
|---|---|---|---|
| pages/AriaQueue.tsx:574 + aria/RegisterRow.tsx | /aria La fila | vendor (+ IPS, signals, disposition) | done (the model) |
| pages/InstitutionLeague.tsx:432 | /institutions La liga | institution (+ grade, costliest pillar) | done |
| pages/CategoriesIndex.tsx:555 | /categories La hoja | category (+ indicator) | done |
| pages/Contracts.tsx:990 | /contracts El registro | contract | done (№ before title) |
| cases/IndexBlocks.tsx:76 | /cases El padrón | case | done (folio = №) |
| administrations/SexenioEnCurso.tsx:102, 281, 336, 373 | /administrations «En curso» | vendor · institution · contract | done |
| administrations/SexenioEnCurso.tsx:233 | /administrations comparison | term | pass |
| institution/InstitutionDossierBody.tsx:400, 575, 622 | /institutions/:id | vendor · contract | done / pass |
| pages/InstitutionDossier.tsx:558, 649 | /institutions/:id | vendor · contract | pass |
| institution/CategoryLens.tsx:124 | /institutions/:id lens | category | pass |
| institution/GradeAnatomy.tsx:553, 625 | /institutions/:id grade | institution (pillars) | pass |
| vendor/VendorActivityTab.tsx:197 | /vendors/:id contracts | contract | pass |
| vendor/VendorNetworkTab.tsx:127 | /vendors/:id network | vendor | pass |
| cases/DossierBlocks.tsx:121, 141, 186 | /cases/:slug | vendor · contract | pass |
| pages/CaseDossier.tsx:211, 265 | /cases/:slug | vendor · contract | pass |
| pages/ContractDossier.tsx:484 | /contracts/:id | contract | pass |
| category/CategoryCommandPanel.tsx:246 | /categories/:id | vendor | pass |
| category/CategoryDossierSections.tsx:458 | /categories/:id | vendor | pass |
| category/KardexCinta.tsx:313, 356 | /categories/:id kardex | contract | pass |
| sector/SectorCommandPanel.tsx:403 | /sectors/:id | vendor · institution | pass |
| sector/SectorReferenceSections.tsx:115 | /sectors/:id | category | pass |
| pages/SectorProfile.tsx:284, 286 | /sectors/:id (profile) | institution | pass |
| pages/PatternDossier.tsx:507 | /patterns/:code | vendor | pass |
| pages/OfficialProfile.tsx:106 | /officials/:name | contract | pass |
| fallo/FalloList.tsx:54 | /antes-del-fallo | contract | pass |
| fallo/FichasPlate.tsx | /antes-del-fallo fichas | — | skip: removed by the «A destiempo» port (f7c111c9) |
| gap/BuyersTable.tsx:24 | /gap | institution | pass |
| gap/DoorsTable.tsx:25 | /gap | vendor | pass |
| gap/RegisterTable.tsx:146 | /gap register | contract | pass |
| newtabs/ntShared.tsx:204 | /rastro · /mismo-dia · /arranque | contract / vendor | pass |
| newtabs/RastroPlate.tsx:246 | Rastro | vendor · pair | pass |
| newtabs/ArranquePlate.tsx · MismoDiaPlate.tsx | El arranque · Mismo día | — | skip: removed by the «A destiempo / El arranque» port (f7c111c9) |
| parejas/ParejasLens.tsx:112 | dossier «Parejas» lens | pair (+ year strip as the mini-visual) | pass (row name type; the 720px year grid still scrolls sideways on a phone — open) |
| institutions/TamizHallazgos.tsx:227 | /institutions El tamiz | institution | pass |
| aria/FocosWall.tsx:206 | /aria El muro (table twin) | vendor | pass |
| aria/IpsLedger.tsx:144 | /aria open row, IPS breakdown | — (factor ledger) | pass (type only) |
| methodology/FocosRojosMethod.tsx:68 | /methodology | — (reference) | pass (type only) |
| pages/Methodology.tsx:223, 314, 353, 419, 445, 484 | /methodology | — (reference tables) | pass (type only) |
| pages/Datos.tsx:167 | /datos | — (file list) | pass (type only) |
| pages/ReportCard.tsx:370 | /institutions El corte | institution | pass |
| ContractCompareModal.tsx:103 | compare modal (/contracts) | — (transposed: contracts as columns) | pass (type only: figures mono) |
| RiskExplainer.tsx:530 | risk explainer popover | — (factor ledger) | pass (type only) |
| pages/Settings.tsx:269, 385, 411, 437 | /settings | — (account tables) | pass (type only) |
| kit/Field.tsx:412, 414 | every Field chart | — (sr-only data twin) | skip: screen-reader table |
| atlas/sky/SkyLegend.tsx:111 | El Mapa legend | — | skip: legend layout |
| TableExportButton.tsx:57 | export | — | skip: builds export HTML |
| ui/table.tsx:9 | shadcn primitive | — | skip: primitive |
| ui/EditorialTable.tsx:46 | (no importer) | — | skip: dead |
| SharedContractsModal.tsx:197 | (no importer) | — | skip: dead |
| widgets/AnomalyLeadsWidget.tsx:164 | (no importer) | — | skip: dead |
| pages/Investigation.tsx:763 | /investigation → /aria | — | skip: dead route |
| pages/PriceIntelligence.tsx:389, 1971 | /price-analysis → /sectors | — | skip: dead route |
| pages/VendorCompare.tsx:524 | /vendors/compare → /sectors | — | skip: dead route |
| pages/Sectors.tsx:722 | /sectors → /mapa | — | skip: dead route |
| pages/explore/InstitutionsTab.tsx:499, 646 · ResultsTable.tsx:205, 252 · VendorsTab.tsx:479 | /explore/legacy | — | skip: legacy route |
| pages/ReportCard.tsx / SectorProfile role tables (role="table") | see rows above | | |

## List-shaped rows (`<ul>` / `<ol>`)

| File:line | Surface | Preset | Status |
|---|---|---|---|
| portada/LoMasReciente.tsx | Portada «Lo más reciente» | contract (ListRow) | done (the showcase) |
| captura/Pruebas.tsx:43, 153 | /captura evidence · register | pair · institution | done |
| captura/LaMitad.tsx:102 | /captura «La mitad» | pair | pass |
| captura/Diseccion.tsx:100, 146, 210, 319 | /captura drill drawer | pair · contract | pass |
| noSeVe/Cajon.tsx:126, 159 | /gasto-a-ciegas drawer | contract | pass |
| gap/Findings.tsx:36 · GapAfterBlackout.tsx:637 · RegisterTable.tsx:192 | /gap | pair · contract | pass (phone cards → two lines: what · amount / date · buyer · door · alert) |
| administrations/CienPesos.tsx:108 | /administrations «Cien pesos» | term | pass |
| aria/RayosX.tsx:345, 357 | /aria/caso | — (ordered evidence) | pass (type only) |

Monospace prose sweep: 195 `<p>` in mono across 71 files at inventory time (DESIGN.md §2 mono rule); live-route files swept (pass 2 finished stories, memo panel, sector hover, network legend, open-data note, relevo hints). Left on purpose: mono that is a figure or a data label (RFC, contract number, calibration id, amounts, grades), `/print/*` legacy surfaces (ContractDetail, CategoryProfile, VendorProfile, InstitutionThread), and files with no importer (AdministrationFingerprints, TemporalRiskChart, SectorRiskTrendPanel, SingleBidWall, AdminSectorSunburst, CompetitionIndexWidget, EditorialPageShell).

Vendor preset «by-year sparkline»: `GET /vendors` and `/vendors/top` rows carry `yearly_amounts` ([{year, amount_mxn}], merged ids folded in, > 100B rejected; scoped to `sector_id` on a sector-filtered `/vendors/top` so it sums to the row; otherwise vendor-wide = the dossier total) from `vendor_year` (`scripts/precompute_vendor_year.py`, weekly job; no table → empty series). Lay it on a shared span with `yearValues` → `SparkCell`. On: /sectors/:id «Los proveedores que dominan» (its Share column drops the bar: one mini-visual per row; the vendor | institution pair now pairs at ≥1600).
