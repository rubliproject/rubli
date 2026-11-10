# Los patrones: the skeptical editor's verdicts (legal and accuracy review)

**Reviewer:** the skeptical editor, one of 3 independent reviewers. I did not read the other two verdicts.

**Date:** 2026-11-04

**What I reviewed:**
- Live prod pages, read on 11-03 (`/antes-del-fallo`, `/arranque`).
- The prod API: `/no-se-ve`, `/rastro/trail`, `/captura/majority`, `/captura/casos`, `/newtabs/arranque`.
- The page source on `origin/main`: `pages/NoSeVe.tsx`, `lib/noSeVe/lectura.ts`, `pages/Rastro.tsx`, `lib/moneyPaths/rastro.ts`, `pages/Captura.tsx`.

**The question for each page:** could I defend it in public on Nov 20, in front of a lawyer and a hostile reader?

| Page | Verdict | One line |
|---|---|---|
| /antes-del-fallo (A destiempo) | **SCRAP**: hide for launch, keep as raw material | The date field doesn't mean what the copy says, and the "mismo día" method fails its own placebo test, yet it names firms and a persona física next to the word for an illegal act. |
| /arranque (El arranque) | **SAVE, narrow** | One checkable fact per company (its age from the RFC, its share of direct awards). Cut the cohort comparisons, which are confounded. |
| /gasto-a-ciegas (Gasto a ciegas) | **SAVE**: the strongest of the five | It measures visibility, not corruption. It is sourced to the SHCP, the DOF and the SCJN, and it names institutions and decrees, not companies. |
| /rastro (El rastreo de un peso) | **SCRAP as a page**: hide for launch, fold into Gasto a ciegas later | It repeats Gasto a ciegas, shows a TODO marker on prod, and is the third page that singles out the same company. |
| /captura (Un comprador, una empresa) | **SAVE, copy-only fix** | Concentration is a standard OECD indicator. The headline is a coverage artefact, and the word «captura» is a verdict, so both must go. |

**Majority read from my side:** 3 save, 2 scrap. All three saves need copy cuts only, with no new build. That fits in the 17 days.

---

## 1. /antes-del-fallo: SCRAP (hide for launch)

**What it claims.**
- *Chapter 1:* 10.1% of SEDENA tenders "empezaron antes del fallo". The prose dramatizes this as «En el cuartel el trabajo ya corre… y el papel que dice quién ganó llega días después».
- *Chapter 2:* "Un laboratorio, un día, 56 contratos justo bajo el tope". It names Diagnocell, Alen del Norte, Farmacéuticos Maypo, and a persona física (Oscar Martínez Alba) in the table of who is "rozando el tope".

**Why I can't defend it.**
1. **The date doesn't mean what the copy says.**
   - The field is the contract's start date (`fecha de inicio`, its *vigencia*). It is not evidence that work started.
   - The ISSSTE example is 165 contracts "starting" on 1 January with a fallo on 14 January. That is the textbook pattern of a consolidated purchase backdated to the fiscal year, which is an administrative convention.
   - «El trabajo ya corre» turns a date field into a factual allegation. The page also admits «La lectura legal (LAASSP art. 46) no se ha verificado».
2. **The mismo-día method fails its own placebo, and the page says so.** With fictitious caps at ×0.75 to ×2.0 the count barely moves (1,550 · 1,622 · 1,612 · 1,640 · 1,527). So the legal cap does not stand out, and the method has not shown splitting below the cap.
   - Even so, the page lists named companies, and one persona física, under a heading that suggests *fraccionamiento*, which the LAASSP prohibits.
   - This is the clearest defamation exposure on the site: an implied illegal act, a named private party, a method that disproves itself, and no official record behind it.
3. **Embarrassing on prod.** Debug provenance strings are visible to the public: «GET /analysis/antes-del-fallo · inst[0] · procedimientos distintos», «rows · jan1 ∧ inst = ISSSTE · fallo», «meta.ad_lag · meta.recon». The same happens on /arranque.
4. **The two-sentence test fails.** It is two different measures (two clocks) on one page, each with its own universe and a paragraph of notes.

**Keep as raw material.**
- **The SEDENA contrast (×7 the APF rate).** It may become a reported story, but only after two checks: the LAASSP text for 2025, and what `fecha de inicio` means in ComprasMX (ask an official or a procurement lawyer).
- **The 31 "antes de la apertura" contracts.** These are the only hard anomaly. They are worth a document pull, not a page.

## 2. /arranque: SAVE, the narrow version

**The finding I can defend.** 27 companies since 2019 were under a year old when they signed and took 90% or more of their first-year money by direct award, 8,342 MDP in total. Both facts can be checked:
- the company's age comes from the RFC of the persona moral;
- the direct-award share comes from the record.

Journalists in Mexico already use this frame («empresas de reciente creación»).

**Method in two sentences:** "We take every company whose first federal year passed 100 MDP. We mark the ones that were under a year old when they signed and got almost all of it without a tender."

**Cut:**
- **The cohort and sexenio comparisons** (47% vs 15%, «82 por año con AMLO contra 63 con Peña»). The page concedes that the direct-award share of *all* of CompraNet also rose since 2019, and says «esta página no compara recién llegadas con las demás». A comparison that compares nothing becomes a partisan headline. Drop it.
- **The 1,102-company cohort table as the default view.** It is the data dump the owner rejected. The list is the 27, and the CSV holds the rest.
- **All debug provenance strings.**
- **The 2011 cohort.** It accumulates older companies, which the page itself flags.

**Wording:**
- Headline: «27 empresas con menos de un año de vida recibieron casi todo su primer año sin concurso».
- Do not lead with one name (Whitemed) in the H1. Names belong in the list, each with its own facts.
- Keep «muchas son consorcios creados para una obra».

**Before launch:** run due diligence on any name that appears above the fold (SAT 69-B, SFP sanctioned suppliers, the company registry PSM, press). A 69-B hit is an official record that strengthens the line. Without one, the row stays factual and is never framed as a story.

**Data era:** the page covers 2011 onward, so the 2002–2010 data weakness does not apply.

## 3. /gasto-a-ciegas: SAVE (the best of the five)

**Why it holds.**
- **It says what it isn't**, and says it in its opening paragraph: «Mide visibilidad, no corrupción».
- **Its subjects are public institutions and a decree.** Tren Maya, SEDENA, SEMAR and the trusts are sourced to the Cuenta Pública CSV, the DOF of 22 Nov 2021 and 18 May 2023, and the SCJN ruling in 217/2021. No private company is implied in anything.
- **The method is explainable in two sentences:** "What the Cuenta Pública says each entity spent on purchases and works, against what appears as a contract in CompraNet and ComprasMX. Where the money has no contract, nobody can check it."
- **It already handles its biggest trap,** which is comparing multi-year signatures with annual spending. It uses a floor and ceiling for 2022–24 plus a six-year comparison, and it gives the right reading of the Pemex and CFE «0».

**The one accuracy guard.**
- Never let the single-year floor become the headline. In 2022, Tren Maya is 0.05% visible, but 2020–21 signed about 127,000 MDP against about 39,000 MDP spent. «≈1.5 % visible» quoted alone is wrong in public.
- Lead with the six-year figure (`visSum / exSum`), the "fair comparison" the page itself names. Show the yearly floor only inside the chart.

**Cut to reach the owner's arc (A→E):**
- one headline number: six-year visibility of the national-security projects against the civilian median;
- one visual (the ribbon);
- one example told well (Tren Maya);
- one "what next" (the trusts).

The Monedas, Flujos and Cajón stack can sit below the fold or go.

**Launch cost:** copy and ordering only.

## 4. /rastro: SCRAP as a standalone page (hide for launch)

**Why.**
1. **It repeats Gasto a ciegas.** It makes the same visibility argument with one IMSS peso. As a page it is the D example of Gasto a ciegas, not a pattern of its own.
2. **There is a visible TODO on prod.** `asf.result` is null in `/rastro/trail`, so the rail prints «POR COPIAR: número de resultado (ASF 2023_0234_a.pdf)».
3. **Pile-on risk.** Farmacéuticos Maypo is the named example on /antes-del-fallo («tres lecturas de un proveedor»), on /rastro, and on Focos Rojos and Captura.
   - The only official record is one ASF observation of 152.5 MDP, «por aclarar», on a Birmex service contract. The page correctly calls it «una observación, no una falta probada».
   - Three analysis pages converging on one 20-year supplier, with nothing more than that, reads as a campaign. A lawyer would call it a pattern of insinuation.
   - The line «se firmaron con un nombre en lo alto de la lista, y ahí se acaba el rastro» leans on the ARIA tier as if it were a finding.
4. **Its core point is about our records, not theirs.** «no hay pago, ni entrega, ni precio» describes what RUBLI has gathered, and the notes admit it: «describe los registros que RUBLI reúne, no toda la información pública». That is honest, but weak as a public claim. A critic answers: "it's in SIAFF and the ASF reports, you just didn't get it."

**Keep:**
- **The four "where we lose sight" steps.** They are good explainer copy. Fold them later into Gasto a ciegas §D, with the IMSS as the example and no single company in the frame, or with Maypo only once the ASF result number is copied in.
- **`/rastro/registro`.** It can stay as a utility drill if it is linked from somewhere.

## 5. /captura: SAVE, copy-only fix

**The finding I can defend.** Buyers that gave more than half of their year's spending to a single company, with a floor of 100 MDP. One-buyer concentration is a standard OECD and World Bank red flag, and the page carries the right disclaimer:
- «no prueba de irregularidad: certificación técnica, exclusividad regional…»;
- personas físicas counted apart, with no RFC.

**Method in two sentences:** "For each federal buyer and year we measure how much of its spending went to its biggest supplier. We list those where one company took more than half."

**Must fix (accuracy and legal):**
1. **The headline «La captura cambió de dueño: de Pemex y la CFE a la salud» is a coverage artefact.**
   - Pemex and the CFE left CompraNet after the energy reform, and the next sentence admits it: «desde que salieron del registro».
   - We have not shown that concentration shifted. Energy stopped being visible and health stayed visible. Remove the headline.
2. **«Captura» and «cautivas» are verdict words.** In Mexican and academic usage, *captura institucional* means corruption.
   - Use the nav name already shipped: **«Un comprador, una empresa»**.
   - For the companies: «proveedores dominantes» or «empresas de las que depende el comprador», not «cautivas».
   - «la captura vive en el IMSS» must go. The IMSS is the largest buyer in the register, so it will host the most pairs by base rate.
   - The URL can stay `/captura`, but the copy changes.
3. **Sexenio comparisons that start with Fox and Calderón** rest on 2002–2010 Structure A data (RFC coverage 0.1%, poor vendor deduplication). Concentration is exactly what bad vendor IDs distort.
   - Either start the series at 2010, or mark 2002–2010 with a «dato de baja calidad» band and make no comparison claim across that line.
4. **The "documented cases" layer (`/captura/casos`, 15 GT cases)** is the page's real strength, because it links to official records. Make it example D. Show only cases with an official source (ASF, SFP, a court, or a press investigation with documents), each with that source linked.

**Minimum version:**
- one number: N buyers in 2024–25 where one company took more than half, and how much money that was;
- one visual (the plates);
- one documented case told well;
- the disclaimer kept above the fold.

**Launch cost:** copy edits plus one ordering change.

---

## General rules from this review (apply to whatever survives)

1. **No debug provenance in public copy.** Strings like «GET /…», «rows · …» and «meta.…» go into the notes or a `title` attribute, or are deleted.
2. **No TODO or «POR COPIAR» text can reach prod.** Gate it in the build.
3. **A named private party needs an official record next to the name** (69-B, SFP, ASF, a court) or a purely factual row with no framing verb.
   - Never put a name next to an illegal-act word (fraccionar, capturar, simular) on the strength of a statistical pattern.
   - The persona física policy allows the name, but the context must be neutral, which is a stricter bar than for companies.
4. **One company appears in at most one analysis page as the example.** Right now it is Maypo ×3.
5. **No cross-era comparison across 2010** without a data-quality band.
6. **No "X rose under government Y" headline** unless the baseline was compared. Partisan misreadings are the fastest way to get embarrassed in the first week.
