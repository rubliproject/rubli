# «Los patrones»: save or scrap. The data journalist's verdict

> **Reviewer:** the data journalist, one of three independent reviewers. **Date:** 2026-11-03.
>
> **Sources:**
> - The prod API (rubli.xyz), read-only: `/analysis/antes-del-fallo`, `/newtabs/mismo-dia`, `/newtabs/arranque`, `/no-se-ve`, `/no-se-ve/tren-maya`, `/rastro/trail`, `/captura/plates`, `/captura/majority`, `/captura/casos`, and `/contracts/{id}` for the examples.
> - `docs/NEWTABS_DEFINITIONS.md`.
> - The page code on `origin/main`.
>
> **Test:** each page needs one real, verifiable, newsworthy finding that can be told A→E. If it has none, it is scrapped.

| Page | Verdict |
|---|---|
| A destiempo (`/antes-del-fallo`) | **SCRAP** |
| El arranque (`/arranque`) | **SAVE**, reframed |
| Gasto a ciegas (`/gasto-a-ciegas`) | **SAVE**, cumulative framing |
| El rastro de un peso (`/rastro`) | **SCRAP** as a page; its strongest number becomes Gasto a ciegas' D example |
| Un comprador, una empresa (`/captura`) | **SAVE**, narrow, after one count is reconciled |

---

## 1. A destiempo: SCRAP

The page glues two unrelated measures together (the owner's «explaining D before A»), and neither one holds a finding.

**«Antes del fallo»** covers 1,042 contracts out of 54,076 (ComprasMX 2025–26 only).
- **The gaps are tiny.** For 1,035 of the 1,042, the declared start date falls less than 30 days before the fallo.
- **173 start on January 1.** That is the typical annual-service paperwork date, not proof that work began.
- **SEDENA alone is 490 rows.** Its share is 110 of 1,087 tenders (10 %).
- **What we are really measuring** is a date field that a clerk fills in. Without delivery or payment records, we cannot say that "the work began" before the award.

**«El mismo día»** fails its own test. `NEWTABS_DEFINITIONS.md § 2.3` runs a placebo, and the number of lots is flat whether the cap is multiplied by 0.75 or by 2:

| Cap × m | 0.75 | 1.0 | 1.5 | 2.0 |
|---|---|---|---|---|
| Lots | 1,550 | 1,622 | 1,640 | 1,527 |

The doc itself says: «The count is not evidence of fraccionamiento». A page built on a number that its own method says means nothing should not ship.

**What to salvage, not as a page:**
- the 31 contracts whose start date falls before the bids were opened;
- the 30 signed before the fallo;
- the 187 lots whose largest piece sits within 2 % of the cap.

These should go to ARIA as individual leads.

(I started a bunching test of direct-award amounts against the cap on the local DB. It did not finish on the cold disk, so no result is cited.)

---

## 2. El arranque: SAVE, reframed

**The current page:** 1,102 firms that "start big". The team's own validation says these are mostly old firms. The median firm was about 7 years old at its first contract, and the top of the list is SPVs and ICA or Marhnos under new IDs. As built, there is no finding.

**The real finding** comes from crossing incorporation age (from the RFC) with direct award:
- **39 firms** were less than a year old at their first federal contract, got 100 MDP or more in their first year, and got at least half of it **without a tender**.
- Together that is about **13.4 billion MXN**.
- **10 of them** were less than six months old.
- **About 16 of the 39 sell medicines or medical supplies.** Most first contracts are from 2022–2024, the shortage years.

**Verified on prod:**
- Contract 3016857: WHITEMED SA DE CV ← IMSS, 2024-04-25, 1,010.8 MDP, direct award («a proveedor con contrato vigente»).
- Contract 2639584: OZORE GESTIÓN DE AGUA ← CONAGUA, 2022-05-06, 1,688.7 MDP, direct award for a water-treatment plant, from a firm less than six months old.

**Before publishing:**
- The count rests on 66 % RFC coverage, so call it a floor.
- Pass each of the 39 through the due-diligence checklist: PSM/RUPC, SAT 69-B, press.
- Never use «fantasma».

**A → E**
- **A:** Some firms win a fortune without a tender before turning one year old.
- **B:** The World Bank and IMCO list a "newly formed winner with no track record" as a red flag. A firm that is new and also exempt from competition has never been tested by anyone.
- **C:** 39 firms (one number), plus the infographic below.
- **D:** Whitemed–IMSS (medicines, 2024) and Ozore–CONAGUA (a water plant, 2022), each linking to its vendor dossier.
- **E:** The full list, with each firm's age and the institution that hired it. Next leads: medical suppliers 2022–24.

**Finding (es):** «Treinta y nueve empresas con menos de un año de vida recibieron más de cien millones de pesos sin concurso en su primer año con el gobierno.»

**Infographic: «La cuna»**
- **X axis:** the firm's age in days at its first contract, from 0 to 365 (a newborn's first year). A thin vertical line at 180 days.
- **Marks:** one bar per firm, 39 in all, rising from the axis. Height is first-year money on a log scale; colour is the buyer's sector (a muted health red for medical).
- **What the eye sees first:** the cluster of tall red bars crowded into the first months of life. Whitemed and Ozore are labelled.
- **Below it, in grey:** a faint strip of the 1,063 older firms. It says "this is what normal looks like": most big debutants are old firms.

---

## 3. Gasto a ciegas: SAVE, cumulative framing

**The data:** Cuenta Pública spending exercised on purchases and works (chapters 2, 3, 5 and 6), set against the contracts in the register.

**Tren Maya, 2020–2025:**
- **Spent:** about 497 billion MXN. 423 billion of it went through FONATUR (UR W3N) and 45 billion through SEDENA (H0M).
- **Visible in the contract register:** about 149 billion MXN, or **under a third**.

**Fix the framing.** The page's year-by-year ratios (3–5 % visible in 2022–25) are misleading. The big contracts were signed in 2020–21 and paid in later years: ICA 25.9, Alstom 31.5 and Lamat 13.4 billion. The **cumulative** ratio is the honest one.

**Caveats to state:**
- **Contract amendments.** The register holds original contract values, and amendments (convenios modificatorios) are not in it. Part of the "unseen" money is the growth of visible contracts.
- **Military-built sections.** Where SEDENA built the line, little was published.
- **Pemex and CFE.** Their 0 % visible is a scope artifact: they buy under their own laws and are outside this register. They must not be shown as "blind".

**A → E**
- **A:** We put the money spent next to the contracts you can read.
- **B:** If a peso spent has no contract, nobody can check who received it or why.
- **C:** About 7 of every 10 pesos on Tren Maya, plus the infographic below.
- **D:** The Tren Maya. Then IMSS medicines 2024, taken from Rastro: about 47 of every 100 pesos are visible, and almost 9 of 10 of those visible pesos went without a tender.
- **E:** The same comparison for SEDENA, SEMAR, Dos Bocas and the Interoceánico.

**Finding (es):** «De cada diez pesos que el Tren Maya gastó en obras y compras, siete no aparecen en ningún contrato público.»

**Infographic: «El iceberg»**
- **The block:** one tall column for the Tren Maya's 2020–25 spending, about 497 billion MXN, drawn to scale.
- **Above the waterline:** the lit part is the visible contracts, about 149 billion, made of a few named slabs (Alstom, ICA, Lamat, CICSA).
- **Below the waterline:** the submerged part is the money with no contract, darker and unlabelled. One small note on it: "aquí van ampliaciones y obra militar".
- **What the eye sees first:** most of the object is under water.
- **Small multiples (optional):** the same iceberg in miniature for IMSS, SEDENA and SEMAR.

---

## 4. El rastro de un peso: SCRAP as a separate page

The trail is one peso, one firm (Maypo), one contract. That is the «individual stories, not a pattern» the owner rejected.

**Its numbers are real but fragile:**
- **IMSS medicines 2024 (partida 25301):** 81.9 billion MXN exercised against 38.6 billion signed in the register, or 47¢ per peso.
- **Of the visible 38.6 billion, 34.3 billion went by direct award (89 %).**
- **The year matters too much.** 2025 shows 214 billion signed against 88 billion spent: the multi-year consolidated purchase. So the "47¢" depends on which year you pick, the same timing trap as in Gasto a ciegas.
- **An unfinished placeholder is live in production:** the notes show «POR COPIAR: número de resultado». No published page should show that.

**Recommendation:** fold it into Gasto a ciegas as the D example, using the "9 of 10 visible pesos without a tender" line.

---

## 5. Un comprador, una empresa: SAVE, narrow

**As built, it is a data dump with stale data at the top:**
- 3,957 pairs worth 1.79 trillion MXN.
- **The top six by money are all Pemex Exploración y Producción, 2002–2010** (Schlumberger, Halliburton, Cotemar and others). That is Structure A data, with poor vendor linking and oilfield-services market structure. It is not a capture finding.
- **The vendor-side rule** (a firm that takes 80 % or more of its money from one buyer) describes most specialist suppliers.

**The buyer-side view does hold a clean finding:**
- **In 2024, 33 of 199 large federal buyers gave more than half of their spending to a single firm.** That is about **one in six**.
- **Examples:**
  - Birmex → Almacenaje y Distribución Avior, 68 % (2.7 billion MXN);
  - Ferrocarril del Istmo → DLG Industrias, 81 %, already ARIA tier 2;
  - Secretaría de Bienestar → Integra Arrenda, 69 %;
  - in 2025, ASIPONA Dos Bocas → PEGSA, 94 %.
- **Documented cases also sit here:** Segalmex, Oceanografía, Ethomedical, Total Farma, ILAS–Liconsa. They supply the D examples, linking to the loved dossiers.

**Must fix before publishing:**
- **One count does not reconcile.** The `/captura/majority` `years` row for 2024 says 33, but its `ledger` lists 23 buyer-years for 2024. Explain the difference, or use the ledger's number.
- **Partial year.** 2025 runs only to September, which inflates its concentration, so do not show a trend.
- **No history claim.** Fox 16 %, Calderón 18 %, Peña 14 %, AMLO 13 %: there is no rising pattern, so do not claim one.
- **Legitimate single-project buyers.** A port building one pier is normal. Label sole-project buyers.

**A → E**
- **A:** Some federal buyers spend most of their money with one firm.
- **B:** When one firm takes half, the buyer has stopped choosing. That is the classic setting for capture (OECD).
- **C:** One in six (2024), plus the infographic below.
- **D:** Birmex–Avior (medicine logistics) and one documented case, Segalmex.
- **E:** Look up your own institution, and follow the ARIA tier on each pair.

**Finding (es):** «En 2024, uno de cada seis grandes compradores federales le entregó más de la mitad de su gasto a una sola empresa.»

**Infographic: «La mitad»**
- **The marks:** a grid of 199 small squares, one per large federal buyer in 2024. Each square is filled from the bottom by the share of its spending that went to its top firm.
- **The line:** one horizontal line at 50 %, running across every square.
- **What the eye sees first:** the 33 squares filled past the line, about one row in six, drawn in ink while the rest are pale.
- **Labels:** four of them get their name and their firm (Birmex/Avior, FIT/DLG, Bienestar/Integra, plus the Segalmex case).

---

**Overall:** keep three findings (newborn firms without a tender, unseen Tren Maya money, buyers that hand half to one firm). Scrap two pages: A destiempo becomes ARIA leads, and Rastro becomes Gasto a ciegas' example. Every number above must go through `fact-check-workflow` and due diligence before any copy is written.
