# Weekend Tracks E + F — shared components and Atlas follow-ups

**Branch:** `weekend/track-ef` (worktree `atlas-sky`, off origin/main `3bde5558` = prod BUILD_ID `2026-10-03-weekend-d4`). **Brief:** `.claude/designs/weekend/trackEF-shared-atlas-brief.md`. **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track E, `docs/weekend/TRACK-D4.md` § Weekend backlog.

All ten items shipped on the branch: F1–F8 and E1–E2. Nothing is pushed and BUILD_ID is untouched.

**Method.** The "before" probe ran against prod `rubli.xyz`, which served the same commit as the branch base. The "after" probe ran against local Vite on 3012, which proxies the prod API. E1 and E2 were verified on Vite 3013 against a local backend started from this worktree with the real DB (`_atlas_research/weekend/trackEF/local_backend.py`, a no-scan launcher). Scripts, logs and screenshots are in `_atlas_research/weekend/trackEF/` in the main checkout.

## Commits

| Item | Commit | One line |
|---|---|---|
| F1 | `2eaa857b` | `EntityIdentityChip` is 44px tall below `md`. Desktop keeps 20/24/32px. |
| F4 | `244e1358` | `RISK_TEXT_COLORS.medium` becomes `#854d0e`, and 15 `text-risk-medium` class sites move to `text-risk-medium-text`. |
| F2 | `a017d459` | The header crumb shows whole dossier names. |
| F3 | `bedc19f7` | The vendor hero paints once its flags settle. |
| F8 | `3f659562` | Three honesty fixes, with a new computed field on `/analysis/model/metadata`. |
| F5 | `e72c2670` | The dashboard and El Mapa hero figures are computed. |
| F6 | `298892b1` | The emergency calendar is readable without hover. |
| F7 | `0a25355e` | The font-family codemod. |
| E2 | `a3f90ec9` | `GET /atlas/sky/band` names band members on the phone list and in the desktop hover. |
| E1 | `efd6e465`, `7a5cafc1` | Lasso → La Cola, plus the banner accent fix. |

## F — shared components

### F1 · `EntityIdentityChip` touch target

The chip takes `max-md:min-h-11`, so it is 44px below 768px. On desktop it keeps its 20/24/32px heights; the `/dashboard` check read `24,24,24,24,24,32,32,32` at 1440. The name ink was already plate-AA from D3, and low risk stays muted zinc.

| Probe, 16 tabs + `/vendors/29277` + `/institutions/251`, EN/ES | Before | After |
|---|---|---|
| Chips at 390 | 914 | 963 |
| Chips under 44px at 390 | **584** | **0** |
| Lowest chip-name contrast, all widths | 4.68 | 4.68 (≥ 4.5) |

### F2 · Header crumb

- **Desktop** shows the whole name on up to two lines. On dossier routes the 223px ES dateline yields below `2xl`; it had left IMSS about 50px at 1440 ES.
- **Phone** shows a mono type kicker («PROVEEDOR», «INSTITUCIÓN», …) over the name. The name is cut at a whole word with «…» past 40 characters, never mid-word.
- **Sign-in** is icon-only below `sm`. Its 138px ES label had left the crumb 74px wide.
- **Names.** The institution crumb now reads the dossier cache (it showed the static «Expediente institucional»). The contract crumb no longer cuts at character 47 mid-word. The vendor crumb passes `maxLength 300`; it had been cut at 28 characters. The `/vendors` parent label is localized («Proveedores»).

| Crumb, `crumb-{before,after}.log` | Before | After |
|---|---|---|
| 1440 ES title clipped (5 dossiers) | 5 of 5 | 0 |
| 390 ES crumb width | 74px | 170px |
| Vendor name | «Grupo Farmacos Especializad…» | «Grupo Farmacos Especializados» |
| Probe «clipped» on `/vendors/29277` | 4 | 0 |

### F3 · Vendor `PriorityAlert` fan-out

The chosen fix is the smaller honest change. The hero now waits for the four fast flag queries (aria, GT, external-flags, waterfall). They land about 0.3 s after the vendor row, so the marginal note paints once instead of growing. Co-bidders lands about 2.5 s later still. While it is in flight, a same-geometry dashed placeholder pill («Revisando co-licitación…») holds its slot, so the flag lands without a shift. The external-flags payload does not carry these flags, so batching was not available.

| CLS on `/vendors/29277`, 1366×768, ×5 | Runs | Max |
|---|---|---|
| Before (prod) | 0.136 · 0.194 · 0.058 · 0.028 · 0.150 | 0.194 |
| After (final run) | 0.011 · 0.011 · 0.026 · 0.026 · 0.027 | **0.027** |

### F4 · Medium-risk text colour

`RISK_TEXT_COLORS.medium` changes from `#a16207` to `#854d0e`. Contrast goes from 4.36 to 6.1:1 on the plate paper, and to 6.5:1 on the page. `RISK_COLORS.medium`, which drives the fills, is unchanged.

The change reaches every medium-risk text use:

- 16 direct `RISK_TEXT_COLORS.medium` uses and about 40 indexed `RISK_TEXT_COLORS[level]` uses, plus `textInk()` through `INK_BY_MARK`.
- 15 `text-risk-medium` class sites in `DossierCard`, `SharedContractsModal`, `badge`, `RedaccionWidget`, `RiskLevelPill`, `toast`, `Administrations` ×2, `Investigation` ×4, `Methodology`, `PatternDossier` and `Settings`. They become `text-risk-medium-text`.
- The light `.risk-medium` badge in `index.css`.

The probe's `/sectors` contrast count goes from 8 to 0 at both widths.

### F5 · Typed hero figures

All four figures come from the dashboard bundle, which the page already loads.

| Surface | Before (typed) | After (computed) | Source |
|---|---|---|---|
| `/dashboard` h1, years | «Twenty-three years» | `yearly_trends.length` = 23 | `executive_summary.yearly_trends` |
| `/dashboard` h1, spend | «MX$9.9 trillion» | MX$9.9 trillion / MX$9.9 billones | `headline.total_value` |
| `/dashboard` h1, share | «More than 7 in 10» | **«More than 6 in 10»** | `procedures.direct_award_pct` = 65.33 % |
| Dateline | «across 23 years», «trained on {today's count}» | years, plus the training-time count (F8) | same |
| Chapter I tile | «9.9T», «over 23 years» | computed | same |
| Top-8 footer | «of MX$9.9T total» | computed | same |
| El Mapa | «9.9 billones de pesos» | computed | the treemap payload's `total_value_mxn` |

A settled miss reads «cifra no disponible». During loading, em-dash placeholders keep the final token shape and the h1 stays hidden, so revealing it causes no shift. Dashboard CLS ×5 is 0.018 on every run; the prod baseline is 0.032.

**The «7 in 10» claim was wrong.** The register's own figure is 65.3 %, so the headline now says «More than 6 in 10».

### F6 · Emergency story calendar (`/stories/el-ano-de-la-emergencia`, Figure III)

- **Award days** are `<button>`s with a full `aria-label`: date, number of awards, amount, buyer, and whether all were direct. There are 31 award days.
- **Caption line.** A tap, click or keyboard focus writes the reading into an `aria-live` caption line under the calendar. Empty days are `aria-hidden`.
- **Month legend.** Each month row prints its own legend (award days and amount), with a caption that explains the column.

Title-only cells go from 366 to 0 at 1440 EN and 390 ES. Crops are `{before,after}-calendar-*`.

### F7 · Font-family codemod

The codemod (`fontmod.py`) rewrote 178 CSS and SVG literals in 66 files to tokens:

| Literal stack | Token |
|---|---|
| `"EB Garamond", …` | `var(--font-family-editorial)` |
| `"IBM Plex Mono", …` | `var(--font-family-archival)` |
| Stacks led by JetBrains Mono | `var(--font-family-mono)` |
| Stacks led by Playfair Display | `var(--font-family-serif)` |

Chromium resolves `var()` inside SVG presentation attributes, but Safari's support is unproven. The 25 SVG `fontFamily=` attributes therefore moved into `style`.

| Count | Before | After |
|---|---|---|
| Code literals naming EB Garamond / IBM Plex | 192 | **14** |
| Lines including comments | 225 | 47 (33 are comments) |

The 14 that remain are canvas `ctx.font` strings or `measureLabel()` strings, which cannot take `var()`. They sit in the sky engine (`SkyLabels`), `PhoneDisc`, `MeshPlano`, `SpectralRegister`, `PairLedger`, the two network graphs, `CategoryAlzado` and `ArqueoMesa`. A first pass had also tokenized constants that feed those strings. `fontrevert.py` and `fontcheck.py` reverted them and confirmed 0 shorthand uses remain.

### F8 · Honesty fixes and their sources of truth

**(a) Case count at training time.** No endpoint carried it, and `model_calibration.n_positive` is NULL.

- **New field.** `GET /analysis/model/metadata` now returns `gt_cases_at_training`: the count of `ground_truth_cases` rows with `created_at` ≤ the model's `trained_at` (2026-05-02 02:12). It reads **1,399** on the source DB; prod computes its own value. Neither typed figure (1,401, 1,417) matches it.
- **One hook.** Every surface reads the same field through `useCaseCountLabels`. The surfaces are the `/methodology` lede, provenance footer, calibration record and limitations item, the `/captura` provenance, the vendor dossier provenance, the story methodology paragraph, `/press`, and the dashboard dateline.
- **Wording.** The strings now say «cases on record at training: N» or «casos registrados al entrenar: N».
- **Live count.** «Today» reads the live case count (`executive_summary.ground_truth.cases`, 1,427 on prod). The `/methodology` validation paragraph said «The model was trained on … 1,427». It now reads «RUBLI's case set today: {today}».
- **Stories.** Story prose cannot interpolate, so it drops the figure.
- **Pytest:** `test_analysis.py::TestModelMetadataTrainingCases`.

**(b) Tier III «412K».** The card now shows critical plus high from the same summary as the tier table: 152,001 + 182,065 = **334,066** on prod. The tier table's own typed fallbacks are gone too.

**(c) Severity summary.** It typed 5/5/4 (= 14) over a 15-row table, and the rows carry no impact grade. The rows are now read from the locale, and one line reads «15 limitaciones conocidas, enlistadas abajo · grado de impacto por fila: cifra no disponible». Grading each row is the owner's call.

## E — Atlas follow-ups

### E2 · Band member names

`GET /atlas/sky/band?inst=&year=` (service `build_band`) reads `atlas_sky_ties` on the precompute's own band basis: the vendor's primary host is this star, it has no drawn body, and this is its first year here. Its totals equal the system's remainder row exactly; IMSS 2015 reads 1,381 vendors and 34,640,828,411 MXN on both.

- **Names.** Up to 60 members are named, by value, and all are ranking-safe (no suppressed label, GT false positive or persona física). The output uses named columns and `redact_person_rfcs` names, with no RFC.
- **Access.** It accepts a canonical or raw `inst` and queries through the PK and `idx_ast_vendor`.
- **Phone Lista.** Each band year is now a 44px toggle that fetches lazily and lists `EntityIdentityChip`s with amounts: «60 de 1,140 nombrados, por monto (sin personas físicas ni etiquetas retenidas)». Shots: `e2-phone-lista-{es,en}.png`.
- **Desktop.** Hovering the rim track reads its year («2024 · 749 suppliers not drawn · 18.0B MXN»). The tooltip then lazily appends the first three names. Only the hit test and tooltip in `SkyEngine` changed; zoom, flight and layout code is untouched.
- **Pytest:** `test_atlas_sky_band.py` 3/3 (totals = remainder row, public basis, no RFC, validation).

### E1 · Lasso → La Cola

- **Gesture.** Shift-drag draws a dashed polygon at Z0 or Z1. The lasso calls `preventDefault` on the Shift pointerdown, which suppresses the mousedown that d3-zoom listens for, so no engine code changed. The polygon maps to world coordinates through the engine's per-frame `SkyView`. A release never falls through as a click, and Esc clears the lasso without stepping back in the log.
- **Public basis.** `POST /atlas/sky/selection` (`build_selection`, ≤ 5,000 ids) returns the drawn bodies on the ranking-safe basis. Each row carries the host tie's value, contract count, years and risk indicator, with named columns and no RFC.
- **Panel.** It shows the drawn count, value with the host star, the withheld count and the risk mix. It offers «CSV (sin RFC)», «Abrir en La Cola (n)» → `/aria?ids=` (≤ 200 by value), and «Borrar (Esc)».
- **Keyboard alternative.** «Lazo: seleccionar este sistema» at Z1.
- **Legend.** A legend row and a key-map row explain the gesture.
- **La Cola.** `GET /aria/queue` gains `ids` (≤ 200, regex-validated), which is ANDed with every other filter. The page reads `?ids=`, defaults to all tiers, and shows the banner «Selección trazada en El Atlas · N proveedores … · ver toda la cola».
- **Pytest:** `test_atlas_lasso.py` 3/3 (public basis, no RFC, validation, additive filter).

**Flow verified in Edge, ES and EN** (`e1.mjs`):

1. A polygon around IMSS selected 80 drawn bodies, of which 68 are public and 12 withheld. The risk mix was critical 34, high 16, medium 13, low 5, worth 655.5B MXN.
2. The CSV had 68 rows, and its header carries no RFC column.
3. «Abrir en La Cola» opened `/aria?ids=` with 68 ids and the banner.
4. The keyboard path gave the same summary, and Esc cleared the panel while the URL kept `star=251`.
5. The drag did not pan, and there were no page errors.

Shots: `e1-1-polygon-*`, `e1-2-summary-*`, `e1-3-lacola-*`.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 58.8 s |
| `npm run lint:tokens` | PASS, 0 forbidden (55 warnings, same as D4) |
| `npx eslint .` | 0 errors, 37 warnings (same as D4) |
| `vitest run --no-file-parallelism` | 106/106 |
| pytest, real DB (`test_amount_histogram.py` ignored, see below) | 979 passed, 6 failed. One failure is the known parity break (`test_z2_vendor_pool_flags`). The other five (`test_atlas_sky` public-bits / GT-documented / glyph-withheld, and `test_atlas_cluster_stats` patterns / period) **fail identically on the base commit `3bde5558`**, checked in a throwaway worktree. The DB's label sets have drifted from the sky precompute; this track did not cause them. The new tests pass: `test_atlas_sky_band` 3/3, `test_atlas_lasso` 3/3, `TestModelMetadataTrainingCases` 1/1. |
| Probe (16 tabs + 2 dossiers × 1440/390 × EN/ES) | sub-10px 0 → 0 · raw hex 0 → 0 · title-only 0 → 0 · clipped 184 → 180 · contrast 226 → 218 |
| Probe, E surfaces (`/atlas`, `/aria`, `/aria?ids=` × 1440/390 × EN/ES) | 0 sub-10 · 0 clipped · 0 raw hex; the `?ids=` banner contrast hit 1 → 0 after `7a5cafc1` |
| CLS `/vendors/29277` ×5 | max 0.027 (< 0.05 every run) |

**Not 0/0/0, and unchanged by this track:**

- **Clipped.** `/gap` has 164 clipped items and `/cases` has 16. They are the `line-clamp` register titles and case summaries (D4 backlog 13).
- **Contrast.** El Mapa has 218 hits. They are white treemap labels whose SVG cell fill the probe cannot see.

Both counts are identical before and after.

## Left for the judge or the owner

- **Ship order.** The backend must deploy with the frontend. Until `/analysis/model/metadata` carries `gt_cases_at_training`, those surfaces print «cifra no disponible» by design.
- **Still typed.** These typed figures remain outside F8's three items:
  - `tierIIIEx2` «6,118» (it matches ARIA P2).
  - The `/methodology` origin breakdown «363 / 25 / 1 / 989 / 49».
  - The static v5.2 layer stats.
  - The `Executive` `stats` fallbacks (3,058,286 · 9.881T · 337,693), which feed charts rather than the hero.
  - `GROUND_TRUTH_CASE_COUNT_FALLBACK` (1417) in `useGroundTruthCount` and `ReportCard`.
- **Severity grades.** The limitations rows need their impact grades from the owner.
- **Lasso panel.** While it is open, it covers the bottom-left honesty stamps («ORDEN DENTRO DEL AÑO: ARBITRARIO …»). It is transient and clears with Esc.
- **Phone lasso.** There is none; the phone Lista is the phone path.
- **Selection scope.** The selection covers drawn bodies only. Band members are reachable through E2, not through the lasso.
- **Histogram tests.** The first full pytest run hung for 45 minutes at test 39, which is in `test_amount_histogram.py` (bounds / live-shape over 3.1M contracts on a cold D:). That file was ignored in the gated run. It has nothing to do with this track.
- **Atlas sky precompute.** The five pre-existing atlas test failures suggest the sky precompute needs a rerun against the current label sets.
- **Prod load.** The before-probe and some checks hit prod directly or through the 3012 proxy. Prod returned intermittent 500/503s, as D1 and D4 also saw. The E checks moved to the local backend.
