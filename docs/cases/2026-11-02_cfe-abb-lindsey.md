# Case file — CFE bribery cluster: ABB (SITRACEN / Evergreen) + Lindsey Manufacturing

> Due diligence, read-only. No DB writes, no GT inserts. Personas físicas (ABB and Lindsey executives, the sales agents, CFE officials) are masked by role. The RUBLI score is an «indicador de riesgo», never evidence.

## Resumen (ES)

Dos casos de Estados Unidos señalan a la misma oficina de la CFE. **ABB:** ABB Inc. se declaró culpable en 2010 de sobornar a funcionarios de la CFE entre 1997 y 2004. Su unidad ABB Network Management, de Sugar Land, Texas, pagó por dos contratos: SITRACEN (1997) y Evergreen (octubre de 2003, adjudicación sin competencia). En 2011 ABB pagó a la CFE 3.2 millones de dólares en un juicio civil. Pero **ningún documento oficial nombra a ABB México, S.A. de C.V.** (id 2260), que es el proveedor que aparece en RUBLI. **Evergreen no está en nuestros datos.** Lo firmó la unidad estadounidense, y RUBLI casi no tiene contratos de la CFE de 2004: uno solo. **Lindsey:** la condena del jurado (2011) fue anulada por conducta indebida de la fiscalía, y el gobierno de EE. UU. retiró su apelación en 2012. En México, el exfuncionario de la CFE fue condenado en 2017 por enriquecimiento ilícito, una sentencia contra la persona y no contra la empresa. **Veredicto: ABB, pista para historia (sin etiqueta: la entidad no coincide y ningún contrato está en los datos). Lindsey, solo historia (condena anulada).**

## Header

| Field | Value |
|---|---|
| Lead | #5 in `docs/CASE_LEADS_2026-11-02.md` (rows 5 and 6 of § 3) |
| Period | ABB scheme 1997–2004 (Evergreen performed through 2007) · Lindsey scheme ~2002–2009, contracts in our data 2006 |
| Buyer | CFE (institution 104). The SEC also names Luz y Fuerza del Centro (LyFC) |
| Vendor ids | 2260 ABB México, S.A. de C.V. · 24630 Lindsey Manufacturing Company. Other ABB rows: 7833 ABB Vetco Gray México, 9397 ABB Medidores, 24648 ABB Automation Technologies AB, 29786 ABB Switzerland Ltd. **No `ABB Inc` or `ABB Network Management` vendor exists** (157501 "Multi Network Management SA de CV" is unrelated) |
| Evidence level | ABB Inc / ABB NM: **E1**, but for an entity **not in our data**. ABB México: none. Lindsey: **E3-closed (vacated)** |
| Existing GT | 2260 and 24630 are not in `ground_truth_vendors` |
| Date checked | 2026-11-02 |

## Claims table

| # | Claim | E | Source | Checked how |
|---|---|---|---|---|
| 1 | ABB Inc. pleaded guilty (S.D. Tex., case 4:10-cr-00664, filed 29-Sep-2010) to one FCPA anti-bribery count and one conspiracy count. ABB Ltd signed a DPA. Criminal penalty US$28.5 M | **E1** | [DOJ plea agreement + Statement of Facts](https://www.justice.gov/sites/default/files/criminal-fraud/legacy/2015/03/05/09-29-10abbinc-plea.pdf) · [DOJ press release](https://www.justice.gov/archives/opa/pr/abb-ltd-and-two-subsidiaries-resolve-foreign-corrupt-practices-act-investigation-and-will-pay) | **Primary opened** (pdftotext on the DOJ PDF) |
| 2 | The bribing unit was **ABB Network Management (ABB NM), Sugar Land, Texas**, a business unit of ABB Inc. (formerly Bailey Network Management, acquired 1999). The paying channels were "Mexican Company X" (its sales representative), "Intermediary Company O" (Mexico) and "Intermediary Company S" (Panama-incorporated, HQ Mexico). **ABB México S.A. de C.V. is not named** | E1 (facts) | Statement of Facts ¶¶ 5–12; [SEC complaint](https://www.millerchevalier.com/sites/default/files/resources/ABBComplaint.pdf) ¶ 12 | **Primary opened**. The intermediaries are pseudonymised; the documents give no names |
| 3 | **SITRACEN**: awarded to ABB NM's predecessor in **Dec-1997**. Upgrade of CFE's national control centre, backup centre and 8 area and 8 subarea control centres. Ran through 2001, >US$40–44 M revenue, ≥US$913,876 in bribes | E1 | SoF ¶ 8; SEC ¶¶ 13–14 | Primary opened. **Pre-2002, outside our data** |
| 4 | **Evergreen**: awarded to **ABB NM** in **Oct-2003**, a **sole-source** multi-year maintenance and upgrade contract for SITRACEN. Ran through 2007, ~US$37 M revenue. ≥US$984,078 in bribes in 2003–04 via false invoices ("maintenance support … CFE EVERGREEN PROJECT AT ALL SITES IN MEXICO"). The officials were to get ~10 % of revenue | E1 | SoF ¶¶ 8, 15–21; SEC ¶¶ 15–18 | Primary opened |
| 5 | "ABB NM also was awarded **other smaller contracts** with CFE and … LyFZ" (unnamed). Together, CFE and LyFC revenue was >US$90 M | E1 (unspecific) | SEC complaint ¶¶ 12, 17 | Primary opened. **No contract numbers** |
| 6 | ABB Inc. paid CFE **US$3.2 M** in damages, settling civil case 573/2010-B (Juzgado Primero de Distrito en Materia Civil). CFE had filed a PGR criminal complaint in Oct-2010 | E1 (settlement) / E3 (PGR) | [Expansión 25-Jan-2011](https://expansion.mx/manufactura/2011/01/25/abb-paga-multa-millonaria-a-cfe) | Press only (one outlet). The outcome of the PGR complaint is unknown **[por verificar]** |
| 7 | The ABB NM general manager (US) was **acquitted** at trial in 2012. The principal of Mexican Company X (persona física) pleaded guilty in Nov-2009 | E1 / acquittal | DOJ / FBI Houston 2009 release; trial reports (search results) | Press and DOJ index. The individual dispositions do not change the corporate plea |
| 8 | **Lindsey Manufacturing** and two executives were convicted by a jury (C.D. Cal., May-2011) of bribing a CFE official through a sales agent's company | **vacated** | GIR, «… conviction may be vacated if Lindsey dismissal stands» (globalinvestigationsreview.com; slug names a persona física, withheld) | Press |
| 9 | 01-Dec-2011: the judge vacated the convictions and **dismissed the indictment with prejudice** for prosecutorial misconduct. DOJ **dropped** its 9th-Circuit appeal in 2012 | final; no conviction | [National Law Review / Ifrah](https://natlawreview.com/article/judge-dismisses-lindsey-fcpa-case-finding-prosecutorial-misconduct) · [Law360, "US Drops 9th Circ. Appeal In Lindsey FCPA Case"](https://law360.com/articles/344661) | Press, two independent outlets. The court order itself was not opened |
| 10 | A former CFE director of operations (persona física, the "CFE Official N" link in ABB and the recipient in Lindsey per PGR) was charged in Mexico in 2011 and sentenced in Mar-2017 to 8 years for **enriquecimiento ilícito** (33 MDP). A separate SFP sanction (2012: 17-yr inhabilitación, 69 MDP fine) was **revoked** by a court in 2014. The SCJN allowed re-arrest in 2019 | E1 against the **person** (status of appeals **[por verificar]**). Not against Lindsey or ABB | [Expansión 2011](https://expansion.mx/nacional/2011/09/04/exdirectivo-de-electricidad-es-senalado-por-enriquecimiento-de-33-mdp) · [Expansión 2014](https://expansion.mx/nacional/2014/07/16/un-juez-revoca-la-sancion-a-exdirectivo-de-cfe-acusado-de-recibir-sobornos) · Zeta Tijuana, Mar-2017 (zetatijuana.com/2017/03/; slug withheld) · Expansión Política 30-Sep-2019 (slug withheld) | Press, ≥2 outlets. The ruling was not opened |

## Our data (read-only, `RUBLI_NORMALIZED.db`, `mode=ro`)

```sql
-- ABB-named vendors
SELECT id,name,total_contracts,total_amount_mxn FROM vendors WHERE name LIKE 'ABB%' OR name LIKE '%ABB %' OR name LIKE '%NETWORK MANAGEMENT%';
-- ABB México by buyer
SELECT i.name, COUNT(*), SUM(c.amount_mxn)/1e6, MIN(contract_year), MAX(contract_year), AVG(risk_score)
FROM contracts c JOIN institutions i ON i.id=c.institution_id WHERE vendor_id=2260 GROUP BY 1 ORDER BY 3 DESC;
-- CFE coverage by year
SELECT contract_year, COUNT(*), SUM(amount_mxn)/1e9 FROM contracts WHERE institution_id=104 AND contract_year BETWEEN 2002 AND 2006 GROUP BY 1;
-- Evergreen / SITRACEN text search (all buyers) + CFE Jul-2003–Dec-2004 'TIEMPO REAL','CENACE','SCADA','CONTROL DE ENERG'
SELECT ... WHERE UPPER(title||description) LIKE '%EVERGREEN%' OR ... LIKE '%SITRACEN%';
```

| Finding | Value |
|---|---|
| ABB México (2260), all buyers | 685 contracts / 4,700.5 MDP, 2002–2024 (CASE_LEADS said 634; **634 is CFE only**) |
| ABB México at CFE | 634 / 3,603.2 MDP, 2002–2018. **2002–2004: 17 contracts / 31.5 MDP, all *licitación pública*** (relays, apartarrayos, tableros, poles). Indicador 0.14–0.30 |
| ABB México at LyFC | 10 / 569.2 MDP, 2002–2008, all *licitación pública*. Largest: `18500001-111-06` static VAR compensator 216.2 MDP (Dec-2006), `18500001-098-08` GIS substations 200.7 MDP (Dec-2008). None is tied to the SEC's "smaller contracts" |
| `EVERGREEN` / `SITRACEN` in any title or description | **0 rows** |
| CFE Jul-2003 – Dec-2004, real-time / control-centre / SCADA terms | 1 unrelated row (a gas analyser, another vendor) |
| **CFE coverage gap** | 2002: 1,939 contracts · 2003: 2,036 · **2004: 1** · 2005: 1,882. Anything CFE signed in 2004 is missing |
| Evergreen's likely form | Sole-source, signed by the **US unit** (ABB NM), probably in USD outside CompraNet's scope, or in the 2003–04 gap. **Not findable in our data** |
| Indicador over time (2260) | Average 0.19–0.33 for 2002–2008 (bribery window: "low"). **0.75–0.91 for 2011–2017** (direct-award share 41–65 %). The lead's "0.15–0.25 false negative" applies only to the 2002–08 rows. Also note SEGOB 2009 `SO-036000994-N1-2010`: 3 direct-award substation contracts, 179.8 MDP, score 1.0 (unrelated to the plea) |
| Lindsey (24630) | 7 CFE contracts, 12-May – 24-Jul-2006, 140.7 MDP, **all *licitación pública***, emergency restoration towers. Largest `18164090-015-06` (contract 700197454) 116.3 MDP, 19-Jul-2006. Indicador 0.19–0.24 |
| Lindsey's agent company | Not searched by name in vendors. The indictment's agent firm was a Mexican sales intermediary, not a CFE contractor **[por verificar]** |

## Proven / indicative / missing / who to ask

- **Proven (primary):** ABB NM (ABB Inc.) bribed CFE officials for SITRACEN (1997) and Evergreen (Oct-2003). Plea, DPA and the CFE civil settlement are E1 against **ABB Inc. / ABB Ltd**.
- **Not proven:** that **ABB México, S.A. de C.V.** took part. It is not named in the SoF or the SEC complaint. The bribes went through Mexican Company X and Intermediaries O/S, not the Mexican subsidiary.
- **Indicative only:** ABB México's later high indicadores (2011–17) and the 2009 SEGOB 1.0 cluster. These are model output, not evidence.
- **Missing:** Evergreen's CFE contract number and form (USD, signed by the US unit?); the "smaller contracts" with CFE and LyFC (SEC ¶ 17); the CFE 2004 contract records (a coverage gap in RUBLI); the outcome of CFE's Oct-2010 PGR complaint against the companies.
- **Who to ask:** CFE (transparency request: the Evergreen contract, signed Oct-2003, and its counterparty entity; the documents of civil case 573/2010-B); FGR (status of the 2010 complaint); DOJ Fraud Section / PACER (the full criminal information and exhibits, case 4:10-cr-00664); for Lindsey, the C.D. Cal. dismissal order (Dec-2011).

## Registry and sanctions checks

| Check | Result |
|---|---|
| SE PSM / SIGER / OpenCorporates (ABB México) | **Not accessed** (OpenCorporates bot check). Not needed for the verdict |
| SAT 69-B | 2260 and 24630: **no match** in local `sat_efos_vendors` (loaded 2026-10-05) **[por verificar live]** |
| SFP / SABG | **No match** in local `sfp_sanctions` (loaded 2026-03-09). No press report of any SFP sanction of ABB México or Lindsey. The live directory is unreachable (DNS fail) **[por verificar]**. The only SFP sanction found was on the **CFE official**, and it was revoked in 2014 |
| ASF | No vendor finding in local `asf_cases` |
| DOJ / SEC | ABB: plea + DPA + SEC (2010), opened. Lindsey: dismissed with prejudice (2011), appeal dropped (2012) |

## VERDICT

- **ABB: story lead only, no training label.** The E1 resolution is against ABB Inc. / ABB NM. That entity is not in our data, ABB México is never named, and Evergreen (the only in-window contract) does not exist in our rows (CFE 2004 holds one contract in all of RUBLI). A vendor-wide label on 2260 would be a mislabel. Reopen as **tier A** only if a CFE document ties Evergreen, or a CFE/LyFC "smaller contract", to ABB México's rows.
- **Lindsey: story only, never a label.** The conviction was vacated and the indictment dismissed with prejudice. The Mexican conviction is of the official (enriquecimiento ilícito), not of the company.
- **Story angle:** «lo que CompraNet no muestra». The best-documented CFE bribery case of the 2000s is invisible in the federal record: SITRACEN predates it, and Evergreen falls in a year with one CFE contract.
