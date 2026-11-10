# Case file — Cajas Graf / Corporativo Zeg → Talleres Gráficos de México

> Due diligence, read-only. No DB writes, no GT inserts. Personas físicas are masked by role. The RUBLI score is an «indicador de riesgo», never evidence.

## Resumen (ES)

Cajas Graf y Corporativo Zeg son las proveedoras de material electoral detrás de la renuncia de la consejera presidenta del INE (26-oct-2026). **Ninguna autoridad las ha sancionado.** El bloqueo de cuentas de la UIF (acuerdo 401/2023) **cayó en amparo** a mediados de 2024: los tribunales lo anularon por forma, sin juzgar el origen del dinero. Siguen abiertas la investigación de oficio de la ASF y el análisis del Órgano Interno de Control del INE, que habla de «colusión» entre cinco empresas. El expediente de Cofece de mayo de 2024 **no se pudo confirmar** con fuente primaria. Lo que solo RUBLI muestra: Talleres Gráficos de México (TGM) adjudicó directamente **298 MDP** a cuatro de las cinco empresas que señala el OIC del INE. **El 28 de marzo de 2018**, tres meses antes de la elección federal, TGM firmó el mismo día dos contratos: 93.0 MDP con Cajas Graf y 52.4 MDP con Formas Finas y Materiales. Ambos tienen el indicador de riesgo más alto del modelo. **Veredicto: solo pista para historia, no etiqueta.**

## Header

| Field | Value |
|---|---|
| Lead | #3 in `docs/CASE_LEADS_2026-11-02.md` |
| Period (our data) | May-2017 – Jun-2021 at TGM. Press period: 2013–2025 (INE, OPLEs) |
| Buyer in RUBLI | Talleres Gráficos de México (institution 438), the federal printer for electoral material |
| Buyers not in RUBLI | INE 2025 (autonomous; it does not report to CompraNet) and the OPLEs (state level) |
| Vendor ids | 205852 Cajas Graf, S.A. de C.V. · 272453 Corporativo Zeg SA de CV · 311702 Servicios Empresariales Zeg SA de CV (name match only) · **added:** 40490 Formas Finas y Materiales S.A. de C.V. · 230090 Comercializadora JVLY, S.A. de C.V. |
| Evidence level | **E3, weakened.** UIF freeze overturned. ASF and INE-OIC reviews open. Cofece unconfirmed |
| Existing GT | None of these vendor ids is in `ground_truth_vendors` |
| Date checked | 2026-11-02 |

## Claims table

| # | Claim | E | Source | Checked how |
|---|---|---|---|---|
| 1 | UIF put Cajas Graf, Corporativo Zeg and their two owners (personas físicas) on the Lista de Personas Bloqueadas by acuerdo **401/2023** of 17-Nov-2023, citing an FGR request for assistance | E3 at the time | El Imparcial 04-Feb-2026, «UIF bloqueó en 2023 a Corporativo Zeg y Cajas Graf…» (elimparcial.com/mexico/2026/02/04/; URL slug names a persona física, withheld) citing Reforma · El Imparcial 29-Oct-2026, «…confirma que la UIF bloqueó cuentas de empresas proveedoras del INE…» (elimparcial.com/mexico/2026/10/29/; slug withheld): the former UIF head confirms the freeze | Press only. The acuerdo itself is not public. Both reports go back to Reforma, so this is **one chain of sourcing, not two independent sources**. Expansión dates the freeze to "2024" (inconsistent) |
| 2 | The firms and their owners **won amparos** against the freeze. Final rulings came from collegiate courts in mid-2024, on procedural grounds (SCJN criterion), with no ruling on whether the funds were lawful | **Resolved in the firms' favour** | El Imparcial 04-Feb-2026 (above) | Press only. Court names and file numbers are not given **[por verificar]** |
| 3 | The UIF is probing a network of 7 firms (including Formas Finas y Materiales, Seriplast de México and Comercializadora Grupo Selati) and froze >400 accounts of 13 personas físicas and 7 firms | E3 (claimed) | [Plano Informativo](https://planoinformativo.com/1177063/red-empresas-proveedoras-del-ine-son-investigadas-por-la-uif) · [Tiempo](https://www.tiempo.com.mx/nacional/infestado-ine-transas-uif-congela-400-cuentas-dos-anios-octubre-2026/) | Press only. It is unclear whether this is a **new** 2026 freeze or the 2023 acuerdo restated **[por verificar]** |
| 4 | The ASF opened an investigation **de oficio** into INE and OPLE contracts of ~514 MDP linked to the supplier | E3 | [Tiempo — «Investiga ASF contratos por $514 millones»](https://www.tiempo.com.mx/nacional/investiga-asf-contratos-514-millones-pesos-ligados-proveedor-ine/) · [Excélsior 28-Oct-2026](https://www.excelsior.com.mx/nacional/comision-vigilancia-asf-advierte-sobre-oligopolio-material-electoral): the chair of the Comisión de Vigilancia says the ASF review of contracts under the INE president is "ongoing" | Two outlets. No ASF primary document (oficio or communiqué) was found **[por verificar]** |
| 5 | The INE Órgano Interno de Control told the Comisión de Vigilancia (30-Oct-2026) that five firms (Cajas Graf, Formas Finas y Materiales, Corporativo Zeg, Comercializadora JVLY, Seriplast de México) "simulated competition". It cites 106 contracts / 53 tenders, ~2,461 MDP, 2014–2025. 18 OIC files are open: 13 under investigation, 5 in responsibility proceedings (against public servants) | E3 (preliminary). It is an official body, but the analysis is preliminary | [Por Esto 30-Oct-2026](https://www.poresto.com/mexico/2026/10/30/ine-detecta-presunta-colusion-empresas-contratos-mil-mdp-expedientes-abiertos.amp.html) | Press only. The OIC presentation and the Cámara transcript were not retrieved **[por verificar]**. The OIC's files target INE staff, not the firms |
| 6 | Cofece opened a file in **May 2024** for possible monopolistic practices | E3 (claimed) | Expansión Política 26-Oct-2026, «Los contratos detrás de la salida de [presidenta del INE]» (politica.expansion.mx/mexico/2026/10/26/; slug withheld) (unattributed) | **Not confirmed.** One outlet, no file number. Cofece's successor (the CNA) publishes no notice we could find **[por verificar]** |
| 7 | In 2025 the INE directly awarded ~195–197.6 MDP to Cajas Graf and Zeg for judicial-election urnas and mamparas, after a tender (Jan/Feb 2025) was declared void | E4 | Expansión 26-Oct-2026 (citing Reforma); El Imparcial 04-Feb-2026 | Press only. Outlets report 195.1 vs 197.6 MDP. The INE procedure number was not retrieved |
| 8 | A former legal representative of both firms (2023) became INE's acting director of administration (Sep-2025 – Apr-2026). An attorney for the owners appears as the INE president's driver | E4 | Expansión; Político MX 19-Oct-2026 (politico.mx/2026/10/19/; slug withheld); Reforma | Press only (≥2 outlets) |
| 9 | OPLE contracts: >500 MDP across 13 OPLEs (2021–24); Sonora 16 + 46 MDP while the later INE president chaired it; Oaxaca 64.9 MDP (2018); IEEM 16.9 MDP (2025); IEEQ 13.4 MDP (2021); Campeche 24.18 MDP | E4 | Expansión; [Excélsior Oaxaca](https://www.excelsior.com.mx/nacional/contratos-electorales-ieepco-oaxaca); [Publimetro Qro](https://www.publimetro.com.mx/queretaro/2026/10/28/empresa-ligada-a-conflicto-en-el-ine-tambien-obtuvo-contratos-del-ieeq/); [UnoTV](https://www.unotv.com/nacional/cajas-graf-contratos-millonarios-eleccion-judicial-edomex/) | Press only. Not in RUBLI (state level) |
| 10 | The firms have no plant and subcontract the manufacturing to print shops | E5 | Former UIF head, El Imparcial 29-Oct-2026 | A statement only |
| 11 | The INE president resigned on 26-Oct-2026 and denies wrongdoing | fact | Expansión Política 26-Oct-2026 (slug withheld), N+, UnoTV, Por Esto | Multiple outlets |
| 12 | The President proposed turning TGM into a company that produces most electoral material itself, cutting out intermediaries | context | [Expansión 29-Oct-2026](https://politica.expansion.mx/presidencia/2026/10/29/sheinbaum-talleres-graficos-material-electoral) | Press |

## Our data (read-only, `RUBLI_NORMALIZED.db`, opened `mode=ro`)

**Q1: every contract of the three named ids**
```sql
SELECT c.vendor_id, c.contract_date, c.procedure_number, i.siglas, c.procedure_type,
       ROUND(c.amount_mxn/1e6,2), ROUND(c.risk_score,3), c.risk_level, c.title
FROM contracts c JOIN institutions i ON i.id=c.institution_id
WHERE c.vendor_id IN (205852,272453,311702) ORDER BY c.contract_date;
```

| Vendor | Buyer | n | MDP | Window | Procedure | Indicador de riesgo |
|---|---|---|---|---|---|---|
| Cajas Graf (205852) | TGM | 15 | 198.5 | 03-May-2017 – 29-May-2021 | 15/15 direct award | 2017: 0.30 · 2018: 0.22–0.36, except `AA-004E2D001-E250-2018` (cartón, 93.01 MDP, 28-Mar-2018) = **0.92** · May-2021: 0.56–0.63 |
| Corporativo Zeg (272453) | TGM | 7 | 13.0 | 05-May – 04-Jun-2021 | 7/7 direct award | 0.15–0.21 |
| Servicios Empresariales Zeg (311702) | CENAGAS | 2 | 0.76 | 2024–2025 | AD, art. 42 | 0.15–0.20. **Name match only, no link** |

**Timing against the elections.** All seven Zeg contracts and all five 2021 Cajas Graf contracts were signed between 5-May and 4-Jun-2021, the weeks before the **6-Jun-2021 midterms**. The Zeg titles are explicit: «Impresión, acabado y empaque de urna para diputaciones / gubernatura», «Integración de materiales electorales», and transport. Cajas Graf supplied the rigid transparent sheet (1 mm "lámina rígida plana transparente cristal"), galvanised wire and plastic sheet, which are inputs for ballot boxes. The **2018 cluster** (9 contracts, 122.4 MDP, Jan–Jul 2018) precedes the **1-Jul-2018 federal election**. *The press has reported only INE 2025 and OPLE contracts. The TGM 2017–2021 contracts have not been reported* (searched 2026-11-02).

**Q2: the INE-OIC's five-firm group at TGM**
```sql
SELECT vendor_id, institution_id, contract_year, COUNT(*), ROUND(SUM(amount_mxn)/1e6,1),
       AVG(is_direct_award), MAX(risk_score)
FROM contracts WHERE vendor_id IN (205852,272453,40490,230090) GROUP BY 1,2,3;
-- Seriplast de México / Grupo Selati / TOL Producciones: no vendor match (name LIKE)
```

| Vendor | TGM contracts | MDP | Years | Note |
|---|---|---|---|---|
| Cajas Graf | 15 | 198.5 | 2017–21 | above |
| Formas Finas y Materiales (40490) | 10 | 66.8 | 2018–19 | `AA-004E2D001-E170-2018` «impresión», **52.38 MDP, 28-Mar-2018, score 1.0** (factors: direct_award, price_anomaly, extreme_overpricing hypothesis) |
| Comercializadora JVLY (230090) | 2 | 20.1 | 2018 | `E123-2018` insumos 19.07 MDP (06-Mar-2018). No RFC in our data |
| Corporativo Zeg | 7 | 13.0 | 2021 | above |
| **Total** | **34** | **≈298.4** | 2017–21 | all direct award |

- **Same-day pair:** on **28-Mar-2018** TGM signed Cajas Graf `E250-2018` (93.01 MDP) and Formas Finas `E170-2018` (52.38 MDP), 145.4 MDP in one day. These are the two highest indicadores in the group (0.92 and 1.0).
- **Share:** in 2018 the group took **208.9 of TGM's 929.2 MDP (22.5 %)**. In TGM's cartón/lámina purchases, Cajas Graf's 110.8 MDP in 2018 compares with ≤ 9 MDP from any other supplier in any year 2004–2025:
```sql
SELECT contract_year, v.name, COUNT(*), ROUND(SUM(amount_mxn)/1e6,1) FROM contracts c JOIN vendors v ON v.id=c.vendor_id
WHERE institution_id=438 AND (UPPER(title) LIKE '%CARTON%' OR UPPER(title) LIKE '%LAMINA%' OR UPPER(description) LIKE '%CARTON%' OR UPPER(description) LIKE '%LAMINA%')
GROUP BY 1,2 ORDER BY 1,4 DESC;
```
- **Caveat on direct award:** TGM buys by direct award in ≥ 97.9 % of contracts every year 2016–2022, so direct award alone is **not** distinctive at this buyer. Size and concentration are. A shared RFC is not the link either: none of the group shares an RFC in our data. The link between the firms is the press and OIC claim (shared partners and representatives), not our data.
- **Out of scope, no link found:** Corozen (305384) and Inzentrum (307929) sold TGM 49.5 MDP of plastic sheet in Jan–May 2024. No press links them to the group. Do not mention them without registry work.
- **Stale stat:** `vendors.first_contract_date` for 205852 says 2021, but contracts start in 2017. This is a vendor-stats refresh issue.

## Proven / indicative / missing / who to ask

- **Proven (documents in our data, CompraNet-sourced):** TGM awarded Cajas Graf, Zeg, Formas Finas and JVLY 34 direct awards (≈298 MDP), clustered before the 2018 and 2021 federal elections. The 28-Mar-2018 same-day pair is real.
- **Indicative:** the model's price-anomaly flag on the two 2018 contracts (an indicador de riesgo, not evidence). Cajas Graf's 2018 cartón/lámina volume is ~12× TGM's normal annual spend on those inputs.
- **Official but not adverse:** UIF freeze (2023), overturned on procedure (2024).
- **Open:** ASF *de oficio* review (2026); INE-OIC preliminary collusion analysis (30-Oct-2026); Cofece/CNA file (unconfirmed).
- **Missing:** unit prices and quantities for `E250-2018` and `E170-2018` (TGM contract PDFs, *expediente*); whether TGM resold this material to INE or OPLEs; ASF audit **2021-0367** of TGM (Cuenta Pública 2021, «Gestión financiera», 377.7 MDP in our `asf_cases` table). The PDF did not load on 2026-11-02 **[por verificar]**. Registry: incorporation dates, partners and legal representatives of all five firms.
- **Who to ask:** TGM (transparency request for the 2018 and 2021 *expedientes* and its justification for direct award, art. 41/42 LAASSP); ASF (status of the de-oficio file and of 2021-0367); INE OIC (the 106-contract list); CNA (does a 2024 Cofece file exist?); the firms (right of reply).

## Registry and sanctions checks

| Check | Result |
|---|---|
| SE PSM / SIGER (partners, legal reps) | **Not accessed.** Needs a manual SIGER/PSM search **[por verificar]** |
| OpenCorporates | **Not accessible** (bot check) |
| RUPC | Not accessed |
| SAT 69-B | **Not listed.** Local copy `sat_efos_vendors` (14,055 rows, loaded 2026-10-05) has no RFC or name match for 205852, 272453, 311702, 40490, 230090. No press mentions a 69-B listing. The "factureras" claim concerns third-party invoice issuers, not these firms **[por verificar on the live SAT list]** |
| SFP / SABG sanctioned suppliers | **Not listed** in local `sfp_sanctions` (2,395 rows, loaded 2026-03-09). Live directory unreachable (DNS fail) **[por verificar]** |
| ASF | No vendor-level finding in local `asf_cases`. The TGM CP-2021 audit 2021-0367 exists (see Missing). De-oficio review: press only |
| Cofece / CNA | **Not confirmed** (one outlet, no file number) |
| UIF | Acuerdo 401/2023 reported. **Overturned by amparo** (mid-2024, procedural) |

## VERDICT

**Story lead only — no training label.** The only formal action (the UIF freeze) was overturned. ASF, INE-OIC and Cofece are open, unconfirmed or preliminary, so the case sits at E3 at best, and the vendor-side evidence is E4. Revisit when the ASF issues an *informe* or a *pliego* naming TGM, INE or OPLE contracts. Our story angle is strong and new: TGM's ≈298 MDP to the OIC-named group, the 28-Mar-2018 same-day pair, and the pre-2018 and pre-2021 election clusters.
