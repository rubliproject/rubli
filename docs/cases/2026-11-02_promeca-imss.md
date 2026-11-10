# Case file — Orthofix / Promeca → IMSS (2003–2010)

> **Resumen (ES).** Promeca, S.A. de C.V., filial mexicana de Orthofix, pagó unos 317 mil dólares en sobornos («chocolates») a funcionarios del IMSS entre 2003 y 2010. Lo admitió Orthofix en un acuerdo de enjuiciamiento diferido (DPA) con el Departamento de Justicia de EE. UU. (julio de 2012) y lo detalla la demanda de la SEC. Los documentos no dan números de contrato, pero sí dicen que Promeca **ganó las licitaciones nacionales del IMSS de 2008 y 2009** pagando a tres empresas fachada de funcionarios. En RUBLI esas dos licitaciones aparecen: `00641273-004-08` (57.7 MDP) y `00641284-003-09` (seis contratos, 54.4 MDP). El indicador de riesgo del modelo las califica **bajo (0.17–0.22)**. Es un falso negativo documentado. **Veredicto: etiqueta de entrenamiento, nivel B (IMSS, 2003–2010). Las dos licitaciones nacionales son candidatas a nivel A cuando el IMSS confirme el número.**

| Field | Value |
|---|---|
| Lead | CASE_LEADS_2026-11-02 § 3 row 1 / § 4 rank 1 |
| Period (sourced) | 2003 – March 2010 (DOJ Information ¶22; SEC complaint ¶9, ¶11) |
| Buyer | IMSS, including the hospitals Magdalena de las Salinas (CDMX) and Lomas Verdes (Edomex), plus the IMSS national tenders of 2008 and 2009 |
| RUBLI vendor id | **5922** `PROMECA, S.A. DE C.V.` (only match; no Orthofix vendor row) |
| Evidence level | **E1**. DPA with admitted facts: Orthofix's SEC consent ¶2 says it «admits, and accepts and acknowledges responsibility» in the DPA. DPA ¶ on Attachment A: facts «true and accurate» |
| Date checked | 2026-11-02 |

## Claims

| # | Claim | E | Source | Checked how |
|---|---|---|---|---|
| 1 | Promeca was Orthofix's wholly owned Mexican subsidiary | E1 | Orthofix 8-K, 10-Jul-2012, Item 8.01 and Ex. 99.2 (DPA): https://www.sec.gov/Archives/edgar/data/884624/000110465912048124/ | Opened primary (EDGAR HTML) |
| 2 | 2003–Mar 2010: ≈US$300 K paid to Mexican officials «in return for agreements with IMSS and its hospitals to purchase millions of dollars» of Orthofix products | E1 | DOJ Criminal Information, *US v. Orthofix International N.V.*, E.D. Tex. (Sherman), 10-Jul-2012, ¶22: https://www.justice.gov/sites/default/files/criminal-fraud/legacy/2012/08/15/2012-07-10-orthofix-info.pdf | Opened primary (pdftotext) |
| 3 | Hospital-level kickbacks of up to 10 % (Magdalena de las Salinas, 2003–06), 6 % (same, 2006–07) and 5 % (Lomas Verdes, 2003–07) of collected sales; a leased car for one official, Jul-2007 to Sep-2010 | E1 | DOJ Information ¶¶24–28 | Opened primary |
| 4 | From 2008 IMSS ran **national tenders**. Promeca won the **2008 and 2009** national tenders and paid three front companies controlled by IMSS officials 5 % and 3 % of collected sales, disguised as training invoices | E1 | SEC complaint ¶16 (https://www.sec.gov/litigation/complaints/2012/comp-pr2012-133.pdf); DOJ Information ¶29 | Opened primary |
| 5 | Total improper payments ≈US$317 K (incl. US$80,050 in gifts and travel); ≈US$8.7 M gross revenue; ≈US$4.9 M net profit | E1 (SEC allegation; settled by consent) | SEC complaint ¶¶17–18 | Opened primary |
| 6 | Promeca ≈60 % (SEC) / ≈65 % (DOJ) of revenue from IMSS | E1 | SEC complaint ¶9; DOJ Information ¶21 | Opened primary. The two documents differ slightly |
| 7 | Penalties: US$2.22 M DPA fine (3-year term) + US$5,225,701 SEC disgorgement and interest | E1 | 8-K Item 8.01; Ex. 99.1 (SEC consent) | Opened primary |
| 8 | The DPA's Statement of Facts (Attachment A) | — | Not attached to EDGAR Ex. 99.2 | **Not accessible.** The DOJ Information was used instead. SEC lit. rel. 22412 links a scanned complaint PDF with no text layer |
| 9 | IMSS filed a civil suit in US federal court («Oct. 3», year [por verificar]) claiming the US$4.9 M profit | E4 (press only) | Courthouse News «Bribes brought obscene profits, Mexico says» (HTTP 403); search snippet only | Not opened [por verificar] |
| 10 | La Jornada (13-Jul-2012): «La subsidiaria de Orthofix obtuvo adjudicaciones directas» | E4 | https://www.jornada.com.mx/2012/07/13/sociedad/048n2soc | **Not accessible (403).** ⚠ Our data shows **0 direct awards** for Promeca (all 72 are licitación pública). See "Missing" |

## Our data (read-only)

| Metric | Value |
|---|---|
| All contracts, vendor 5922 | 72 · 181.5 MDP · 2002–2021 · DA 1 % · all `low` |
| IMSS, 2003–2010 | **56 contracts · 169.0 MDP** · 0 DA · 0 single-bid · avg score 0.195 · max 0.233 |
| IMSS share (all years) | 59 of 72 contracts · 177.3 of 181.5 MDP (97.7 %) |
| Other buyers | ISSSTE 6 / 1.3 MDP; Pemex 2 / 1.5; CNR 4 / 0.8 |
| By year in window (n · MDP · avg score) | 2003: 4 · 2.5 · 0.17 · 2005: 14 · 24.3 · 0.16 · 2006: 20 · 21.0 · 0.20 · 2007: 17 · 9.5 · 0.21 · **2008: 2 · 57.9 · 0.19** · **2009: 10 · 57.0 · 0.22** · 2010: 1 · 0.3 · 0.22 |
| **2008 national tender** | `00641273-004-08`, contract `D8OP12`, 06-Mar-2008, 57.66 MDP, «Material de osteosíntesis y endoprótesis», score **0.171 low**. 22 bidders shared the procedure; Promeca's share was 11.6 % |
| **2009 national tender** | `00641284-003-09`, contracts `D95037`–`D95042`, 23-Jun-2009, 54.39 MDP in total, score **0.174–0.223 low**. Promeca's share was 13.1 % |
| Model | v0.9.1 `risk_score` 0.12–0.24 in 2003–16; `risk_score_v8` avg 0.11. Not in gold hold-out |
| GT | **Not in GT** (no `ground_truth_vendors` row) |
| Anomaly | One 2021 row: INIFAP «cuota anual de membrecía», 0.6 MDP. Promeca stopped contracting in 2010, so this is probably a name collision or mis-match [por verificar]. Exclude it from any label |

```sql
-- sqlite, file:RUBLI_NORMALIZED.db?mode=ro
SELECT count(*), sum(amount_mxn)/1e6, avg(risk_score), max(risk_score), sum(is_direct_award)
FROM contracts c JOIN institutions i ON i.id=c.institution_id
WHERE vendor_id=5922 AND i.siglas='IMSS' AND contract_year BETWEEN 2003 AND 2010;
SELECT contract_year, contract_date, procedure_number, contract_number, amount_mxn, risk_score, title
FROM contracts WHERE vendor_id=5922 AND contract_year BETWEEN 2008 AND 2010 ORDER BY contract_date;
SELECT procedure_number, 100.0*sum(CASE WHEN vendor_id=5922 THEN amount_mxn END)/sum(amount_mxn)
FROM contracts WHERE procedure_number IN ('00641273-004-08','00641284-003-09') GROUP BY 1;
SELECT * FROM ground_truth_vendors WHERE vendor_id=5922;   -- 0 rows
```

## Proven / indicative / missing / who to ask

- **Proven (E1, admitted):** bribery of IMSS officials, 2003–Mar 2010. The aim was to win and keep IMSS hospital sales and the **2008 and 2009 IMSS national tenders**. Front-company invoices were used. Orthofix paid US$7.4 M in total.
- **Indicative (our data, not evidence):** `00641273-004-08` (2008) and `00641284-003-09` (2009) are Promeca's only IMSS osteosíntesis procedures in those years with the national-tender profile. They are multi-award, competitive, and signed by large IMSS buying units. The match is strong, but **the sources give no procedure number**, so it is not yet tier A. The `indicador de riesgo` calls them low, so this is a documented false negative: a competitive, multi-award tender looks clean to the model while kickbacks run outside the procedure.
- **Missing:**
  1. The DPA Attachment A (Statement of Facts) text.
  2. Which IMSS buying unit (UC prefix 00641273 / 00641284 / 00641313 / 00641228 …) belongs to Magdalena de las Salinas or Lomas Verdes. `contracting_unit_id` is null for these rows.
  3. The IMSS civil suit's docket and outcome.
  4. The «adjudicaciones directas» claim in La Jornada, which our data contradicts.
  5. Whether IMSS or SFP sanctioned the officials.
- **Who to ask:** the DOJ Fraud Section FCPA unit (Attachment A), or PACER for E.D. Tex. 4:12-cr-… and 4:12-cv-419. IMSS Coordinación de Abastecimiento, by transparency request, for the 2008/2009 national tender fallos and UC codes for the two UMAEs. IMSS legal (Dirección Jurídica) on the US civil suit. SFP/SABG on any official sanctions.

## Registry and sanctions checks

| Check | Result |
|---|---|
| SAT 69-B (full list, data as of 31-Dec-2025, 14,250 rows, downloaded from omawww.sat.gob.mx) | **Not listed** (no PROMECA or ORTHOFIX) |
| SAT 69-B, local copy `sat_efos_vendors` | Not listed |
| SFP/SABG sanctioned suppliers, local copy `sfp_sanctions` (2,395 rows) | Not listed. The live directory did not respond to a scripted request, so **live registry not accessible** |
| ASF, local `asf_cases` (692) | No hit. ASF informes for 2003–2010 were not searched [por verificar] |
| RUPC (`rupc_vendors`, 23,704) | Not registered, consistent with no activity since 2010 |
| Company registry (PSM/SIGER) | **Not accessed.** Interactive search only |
| OpenCorporates | **Not accessible** (bot check; API needs a token) |
| Ownership | Orthofix Ex. 21 subsidiary lists FY2002–FY2009 include Promeca (EDGAR search result). Status after 2012 (sold or dissolved) unknown [por verificar] |
| RFC | Present in RUBLI vendor row (company); not reproduced here |

**VERDICT: training label — tier B, vendor 5922 × IMSS × 2003–2010 (exclude the 2021 INIFAP row). Hold `00641273-004-08` and `00641284-003-09` as tier-A candidates until IMSS or the DPA Statement of Facts ties the procedure numbers. Also add to the documented false-negative set (scores 0.12–0.24).** Reason: E1 admitted facts name the buyer, the window and the 2008/09 national tenders, but no contract number.
