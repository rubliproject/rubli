# Los patrones: the information designer's verdict

**Reviewer:** information designer, one of 3 independent reviewers. I have not read the other verdicts.
**Date:** 2026-11-04.
**Evidence:**
- Production API payloads read 2026-11-03/04: `/analysis/antes-del-fallo`, `/newtabs/arranque`, `/newtabs/mismo-dia`, `/no-se-ve`, `/rastro/trail`, `/captura/plates?scope=federal`, `/captura/majority`.
- Page source on `origin/main`.
- I did not get a usable render. The shared browser pane timed out, so these verdicts judge the data and the form a visual could take, not today's pixels.

**Test applied to each page:** is there ONE visual form that makes the pattern obvious to a newcomer in 5 seconds? It must be honestly encoded, in the quiet sculptural language: ink, paper and greys, one muted accent, red only for the pulled record. Every infographic below carries the three reading lines (qué ves · cómo se lee · qué significa), a list/table twin, and a phone layout. Per DESIGN.md, nothing goes under 12px, and there are no big numerals.

| Page | Verdict | The one finding |
|---|---|---|
| /antes-del-fallo | **SAVE** chapter 1 only; scrap «El mismo día» | 1,042 contracts started before a winner existed. Half of them are SEDENA's. |
| /arranque | **SCRAP** | No honest finding. The striking cases are legal SPVs and established firms. |
| /gasto-a-ciegas | **SAVE** | Of every 100 pesos spent on the Tren Maya, about 1.5 appear in a public contract. |
| /rastro | **SAVE** (as the explainer, not a pattern) | Of 100 pesos IMSS spent on medicines in 2024, 47 are in a contract and 42 were direct awards. |
| /captura | **SAVE** | Each year about 1 in 6 large federal buyers gives half its money to one company, in every sexenio. |

---

## 1. /antes-del-fallo: SAVE, but only «Antes del fallo»

### Why save
The idea needs no training: the work started before anyone had won. The data separates cleanly into two groups. Of 54,076 ComprasMX contracts in competitive procedures, 1,042 (1.9%) have a start date earlier than the fallo. Most of those sit within 30 days before it.

The concentration is the finding:
- SEDENA holds 490 of the 1,042.
- 110 of SEDENA's 1,087 procedures (10%) started early, against 315 of 22,627 (1.4%) for everyone.

### Why cut «El mismo día»
The payload carries its own placebo, `placebo_lots_by_m`:

| Cap tested | Same-day lots |
|---|---|
| 0.5× | 1,368 |
| 0.75× | 1,550 |
| 1.0× (the real cap) | 1,622 |
| 1.25× | 1,612 |
| 1.5× | 1,640 |
| 2.0× | 1,527 |

There is no spike at the real cap. A visual of this chapter would either show a flat line, which reads as no story, or imply a bunching that the data doesn't have. The total is also only about 1.8 thousand MDP. Cut it.

### The infographic: «La raya del fallo»
- **Form:** one horizontal day axis, from −60 to +60 days. A single vertical ink rule marks day 0, «el fallo: aquí se sabe quién ganó». The rule is the object, a Judd-like wall.
- **Marks:**
  - **Right of the wall:** the 53,034 on-time contracts form a quiet grey density band. It is a binned area at 1-day bins, honest counts, with no dots.
  - **Left of the wall:** the 1,042 early contracts are individual 4px squares, stacked upward by day. One square is one contract, so the left side is countable.
- **Encoding:**
  - x = days between the contract's start and the fallo.
  - Square fill: SEDENA in ink, every other institution in warm grey `#6f6a63`.
  - The 173 contracts that start on January 1 get a hollow outline and their own note, «arranque de ejercicio fiscal: convención presupuestal, no necesariamente irregular». This keeps the claim honest.
- **Annotations, set directly on the chart:** at most 2.
  - At the wall: «el fallo».
  - On the left stack: «1,042 contratos ya corrían antes de que hubiera ganador · 490 son de la SEDENA».
- **Three lines:**
  - **Qué ves:** cada cuadrito a la izquierda de la raya es un contrato que empezó antes de que se anunciara al ganador.
  - **Cómo se lee:** más lejos de la raya, más días de anticipación; negro = SEDENA, gris = el resto; la mancha gris de la derecha son los 53 mil contratos que sí esperaron.
  - **Qué significa:** en 2 de cada 100 contratos el trabajo empezó antes del concurso; en la SEDENA pasa 7 veces más seguido. Es un indicador de riesgo, no una prueba.
- **Look closer:** hovering a square shows the contract code, the vendor (`EntityIdentityChip`), the amount and the days early. Clicking opens the contract. The twin is the existing CSV table «Los registros».
- **Phone:** turn the axis vertical. The wall becomes a horizontal rule, the early squares stack upward above it, and the grey mass sits below. Width 343px, ±30 days.

---

## 2. /arranque: SCRAP

The page claims that newcomers start at the top: 1,102 vendors whose first federal year was in the top 1%, worth 668.9 thousand MDP. Every way of drawing that encodes something other than risk.

- **Most of these vendors are not new companies.** The median age at the first contract is 2,553 days, about 7 years. 425 are older than 5 years, and 395 have no incorporation date at all. The biggest names are established firms (Marhnos, ICA, Alstom) entering a federal market. That is normal.
- **The young-company tail is mostly a legal artifact.** 78 firms were under a year old. Their leaders are «APP Arriaga–Tapachula», «APP Tamaulipas», «Consorcio Carretero Campeche–Mérida» and «Conservación Matehuala–SLP». These are special-purpose companies that the APP law requires to be created for the contract, so «born yesterday, won billions» is true by construction. A visual would make a false positive the most prominent mark.
- **The page's own answers are absent or reassuring.** «How big is it?» has no denominator a newcomer can feel: 1,102 out of 271,426 first-timers. «Is it suspicious?» gets the reply «mostly not».
- **No form fixes a missing finding.** A scatter of age against first-year money would be honest and empty.

**Disposal:** remove the page from the nav. If the journalist finds non-APP firms under a year old that also received direct awards (for example Consorcio Empresarial Adper: 1,850 MDP, 91% direct awards, under a year old), send them as leads to Focos Rojos and the case file, not as a pattern page.

---

## 3. /gasto-a-ciegas: SAVE

This is the strongest pattern of the five. The money is real (Cuenta Pública, MONTO_EJERCIDO), and the gap is enormous on exactly the projects people know: Tren Maya, AIFA, Dos Bocas, Mexicana, and the Istmo corridor (CIIT/FIT).

### Honesty constraint
Several large ministries (IMSS, CFE, Pemex, SEP) show a visible share above 100% in some years. That means contract totals and the exercised budget are not like-for-like for them. Draw only the entities where the comparison holds: the militarised megaprojects, the same chapters, the same years.

**Open check before building:** the payload's `pct_visible` mixes scales (0.05, 1.74, 9.6). Confirm whether it is stored as a fraction or a percent, and confirm the Tren Maya ≈1.5% figure from the 10-28 Cuenta Pública note, before any number is printed.

### The infographic: «Lo que se ve»
- **Form:** Albers nested squares as small multiples, one per megaproject, in a single row. These are 5 objects, not a chart stack.
  - The outer square, a light grey field, is 100% of what the project spent in its latest comparable year.
  - The inner square, solid ink, is the share that appears in a public contract.
  - The two squares share their bottom-left corner, like an Albers *Homage*.
- **Encoding:** area is proportional to the share, so the inner side = √share × the outer side. At 1.5%, the inner square is a side of 12%: a small, unmistakable ink block in a large grey field. That is the whole story. The outer squares are all the same size because the reader compares shares, not budgets. The budget is printed small under each one in `formatCompactMXN`.
- **Annotation:** one leader line on Tren Maya: «de cada 100 pesos, ~1.5 están en un contrato público».
- **Three lines:**
  - **Qué ves:** cada cuadro gris es todo lo que gastó un megaproyecto en un año; el cuadrito negro es la parte que aparece en un contrato que cualquiera puede consultar.
  - **Cómo se lee:** el área es proporcional: si el negro ocupa poco, casi todo el gasto no tiene contrato público.
  - **Qué significa:** las obras más grandes del sexenio se pagaron casi sin dejar rastro en los registros de compras; no prueba desvío, pero impide revisar a quién se pagó.
- **Look closer:** hovering a square shows exercised against visible by year (2019–2024). Clicking opens the existing drawer (`/no-se-ve/{key}`). The twin is a table with entity · year · ejercido · visible · %.
- **Phone:** a 2-column grid of the squares, each about 160px. The annotation goes under the first square.

---

## 4. /rastro: SAVE, as an explainer rather than a pattern

This is one case, not a pattern: IMSS, partida 25301, 2024. The page should be presented honestly as «cómo seguimos un peso». As an infographic, though, it is the clearest of the five, because every step is a subset of the one before:

| Step | Pesos of every 100 |
|---|---|
| Spent | 100 |
| In a contract | 47.1 |
| Direct award | 41.9 |
| Paid to vendors flagged in ARIA tiers 1–2 | 13.8 |
| Paid to Farmacéuticos Maypo | 2.2 |

The underlying values: 81.9 thousand MDP exercised, 38.6 thousand MDP registered in 17,132 contracts, 34.3 thousand MDP of that by direct award.

### The infographic: «Un peso, cien centavos»
- **Form:** a 10×10 grid of 100 square cells, one cell per centavo of every peso the IMSS spent on medicines in 2024. This is a quiet unit object, closer to Agnes Martin than to a chart.
- **Marks and encoding:** one grid; each step re-tones the cells it removes, with no new chart.

  | Cells | Tone | Meaning |
  |---|---|---|
  | 53 | paper, with a 1px rule outline | not found in any contract |
  | 5 | light grey | in a contract, competed |
  | 28 | mid grey | direct award |
  | 12 | ink | direct award to tier 1–2 vendors (other than Maypo) |
  | 2 | seal red, the pulled record | Maypo |

  - Fill order goes from the bottom-left, so the shares read as heights.
  - Use rounded integers that sum to 100, and give the exact decimals in the twin.
- **Motion:** five scroll steps re-tone the grid, one step per beat, with one sentence each. Under reduced motion, the grid shows the final state plus the step list.
- **Three lines:**
  - **Qué ves:** 100 cuadritos = 1 peso que el IMSS gastó en medicinas en 2024.
  - **Cómo se lee:** cada paso apaga los centavos que ya no podemos seguir o que pasan a la siguiente categoría.
  - **Qué significa:** de cada peso, menos de la mitad deja un contrato, casi todo eso fue por adjudicación directa, y 2 centavos terminan en una sola empresa ya señalada.
- **Look closer:** hovering a tone band shows its MDP, contract count and legal exception (fr. III / V). The red cells link to the Maypo dossier.
- **Phone:** the 10×10 grid at 300px (cells 26px with 4px gaps). The step text sits above the grid as a sticky line.

---

## 5. /captura: SAVE

The pattern is real and stable. The newcomer doesn't need to know what «captura» means. «Half of all its money to one company» is enough.

- Of federal buyers spending ≥100 MDP in a year, the share giving ≥50% of their money to a single vendor is 16% under Fox, 18% Calderón, 14% Peña Nieto, 13% AMLO and 20% in 2025.
- In 2024, that was 33 of 199.
- The plates' stricter definition (≥80% share, ≥3 years) finds 3,957 pairs across 150 buyers, worth 1.79 million MDP.

### The infographic: «Uno de cada seis»
- **Form:** a field of 199 identical squares (Judd boxes). One square is one federal buyer that spent ≥100 MDP in 2024.
- **Marks and encoding:**
  - A filled ink square means one company received at least half of that buyer's money.
  - A hollow square (1px rule) means no company did.
  - The 33 filled squares are grouped at the front of the field, so their proportion reads at a glance.
  - Only one property is encoded: filled or not. Size is deliberately not encoded.
- **Annotation:** one line under the field: «Así ha sido en cada sexenio desde 2002: entre 13 y 20 de cada 100». This is a text line, not a second chart, which keeps it to one visual per screen.
- **Mandatory honesty note:** «a veces hay un solo proveedor posible (patentes, empresas del Estado); el patrón señala dónde mirar, no culpables».
- **Three lines:**
  - **Qué ves:** cada cuadro es una dependencia federal que gastó más de 100 millones en 2024.
  - **Cómo se lee:** negro = una sola empresa se llevó la mitad o más de su dinero.
  - **Qué significa:** 1 de cada 6 grandes compradores depende de una sola empresa, y eso no cambió con ningún gobierno.
- **Look closer:** hovering a filled square shows the buyer, the vendor (`EntityIdentityChip`), the share and the years. Clicking opens the existing pair view (`/captura/pair`) and then the dossiers the owner loves. The twin is a sortable table.
- **Phone:** 199 squares at 12px with 4px gaps, 20 per row: 10 rows, about 320×160px.

---

## Shared notes for the build round
- These are 4 pages with one object each: a wall, Albers squares, a coin grid and Judd boxes. All are monochrome ink and grey. Seal red appears only once, on Maypo in /rastro. Under dataviz, no categorical palette is needed, so there is nothing to validate beyond ink, grey and red, and the risk palette is untouched.
- None of the four needs a big numeral. The finding lives in the «qué significa» line, at body size.
- Each page keeps its existing table or CSV as the twin, and drops every other block (the leads lists, rows with side charts), per the 11-03 lessons.
