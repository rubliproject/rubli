# Los patrones: save or scrap. The 3-agent verdict (2026-11-04, night)

The three reviewers worked independently: a data journalist, an information designer and a skeptical editor. The full files are `journalist.md`, `designer.md` and `editor.md` in this folder. The majority decides; **the owner confirms.**

| Page | Journalist | Designer | Editor | **Majority** | The finding / what to keep |
|---|---|---|---|---|---|
| A destiempo `/antes-del-fallo` | Scrap | Save («antes del fallo» only) | Scrap | **SCRAP: hide for launch** | The «fecha de inicio» is a validity date, not proof that work started. «El mismo día» fails its own placebo test. Debug strings show on prod. The 31 pre-bid contracts become ARIA leads. |
| El arranque `/arranque` | Save | Scrap | Save (narrow) | **SAVE, narrow** | «27 empresas con menos de un año y ≥90 % adjudicación directa recibieron 8,342 MDP en su primer año.» Exclude the special-purpose companies the law requires (designer's catch). Cut the cohort and sexenio comparisons and the debug strings. Check SAT/SFP on every name. |
| Gasto a ciegas `/gasto-a-ciegas` | Save | Save | Save | **SAVE: the best of the five** | «De cada diez pesos que el Tren Maya gastó (2020–25), siete no aparecen en ningún contrato público.» Use the cumulative figure, never the one-year one. Check whether `pct_visible` is a fraction or a percent. One infographic: «El iceberg» or Albers nested squares. |
| El rastro `/rastro` | Scrap | Save (one case) | Scrap | **SCRAP as a page: hide** | «POR COPIAR» is live on prod. It repeats Gasto a ciegas, and it piles on Maypo. Its best number (89 % of IMSS medicine money went without a tender) moves into Gasto a ciegas. |
| Un comprador, una empresa `/captura` | Save | Save | Save | **SAVE** | «En 2024, uno de cada seis grandes compradores federales le dio más de la mitad de su gasto a una sola empresa» (33 of 199). Delete the false headline «de Pemex y la CFE a la salud», which is a coverage artefact. Mark 2002–2010 as weak data. Fix the 33-vs-23 inconsistency. |

**Urgent, already on prod:** /rastro shows «POR COPIAR», and /antes-del-fallo shows debug strings. If the owner agrees, hide both pages now. The branch is prepared separately.
