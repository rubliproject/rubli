# El Atlas — Session 5 «Sweep» — executor report

Brief `.claude/designus/atlas-2026-10-02/s5-sweep-brief.md`. Spec `.claude/designs/atlas-2026-10-02-spec.md`. Worktree `.claude/worktrees/atlas-sky`, branch `atlas/sky-s5-sweep` (base `86f44314`, Sessions 1–4 live). Not pushed, not deployed, BUILD_ID untouched. Diff vs base: 14 files, +257 / −68 (before this report).

**The precompute changed (A1).** It was rerun locally against `backend/RUBLI_NORMALIZED.db`. Prod needs the in-container rerun at ship, after the deploy workflow has finished (see the deploy-skill section added in A10).

## A — Corrections

| # | Item | Status | Commit(s) | What changed |
|---|---|---|---|---|
| A1 | Remainder counts ghost money | **Done** | `7f16ed69` | «el resto» is computed on the primary-host basis: band money ÷ (drawn + band) money of the vendors whose top buyer is the star. A multi-buyer vendor's ties at other stars no longer count as «not drawn». The precompute asserts drawn + remainder = 100 % of primary money, per star and overall. The manifest's per-star `rem` and a new `np` count (vendors based at the star) come from the same rows. The dock line says «{n} de {N} proveedores con su comprador principal aquí, dibujados · el resto suma {x} % de su gasto aquí». The colofón fold carries the basis line. |
| A2 | Expediente totals ≠ dossier | **Done** | `99ec74ee` | `total_contracts`, `total_amount_mxn` and `risk_score` come from `vendor_stats` by PK, for drawn bodies and for the search focus row. The «here» fields stay on the tie basis. `test_expediente_totals_are_vendor_stats` pins dock = dossier. |
| A3 | Skipped moons counted, not printed | **Done** | `09fd23e6`, `aaead14e` | The caption prints «{n} contratos con monto ≤ 0 omitidos» when n > 0. Undated contracts are counted separately as «{n} contratos sin fecha omitidos», so the stated reason is always true. The same lines appear under the phone moon disc. |
| A4 | Finder covers a star label | **Done** | `cb026dfd`, `2c202619`, `aaead14e` | The finder, the stamp rows and the zoom buttons are measured from the DOM and reserved before any label is placed. The rects are re-measured with the labels (≤ 10 Hz), never per frame. ISSSTE's Z0 label is dropped rather than covered (0 labels intersect furniture at 1440 / 1280, EN / ES). The sweep found two more collisions of the same kind and fixed them. The Z1 «Peña Nieto» spoke name printed half under the stamps; canvas captions are now dropped where furniture sits. The Z2 moon caption sat under the finder; it is now placed before the thread names, at the first spot clear of furniture and names, and a colliding thread name is dropped while its arrow stays. |
| A5 | Masthead kicker wraps in Spanish | **Done** | `3c428040` | Row 1 holds the kicker plus a glued «datos al … ⓘ» unit; both are nowrap and tracked at 0.14em. Row 2 is the period count. Checked at 1280 and 1440, EN and ES. |
| A6 | Flight chapters use replaceState | **Done** | `ddc49798` | Every chapter step pushes a history entry: dwell, dots, arrows and swipe, on desktop and phone. Back from chapter 3 goes to 2, then 1, then out of the flight (`flightback.cjs`). |
| A7 | Phone off-chart search lacks the note | **Done** | `40c27892` | An off-chart supplier, or a failed lookup, stays in the search sheet. The sheet shows «No está en la carta: < 10 MDP y sin nivel ARIA T1–T3», the dossier chip and «Volar a su principal comprador». There is no silent navigation. Example: METALYZINC (PV 2299) flies to CFE. |
| A8 | Phone disc stamps | **Done** | `3faa49e8` | «orden dentro del año: arbitrario» sits under the phone system disc, EN and ES. |
| A9 | Infrastructure warm blob at Z0 | **Done** | `2c5df439` | The 1/√n disc alpha was already in code (Infrastructure 0.206). The warmth came from its 179 sector-relative halos, blitted at a flat 0.4 below k 3. The same density factor, with a 0.3 floor, now scales that halo dim. |
| A10 | Deploy skill doc | **Done** | `100bbb02` | New section «Push to main auto-deploys» in `.claude/skills/rubli-prod-deploy/SKILL.md`. It is written from `.github/workflows/deploy.yml`: an rsync plus `compose up --build` that recreates the containers. |

No A item was moved to C.

### A1 numbers (local precompute, layout `20261002T181927Z`)
| Quantity | Before (all-tie basis) | After (primary-host basis) |
|---|---|---|
| remainder_share | 0.521042 | **0.326799** |
| denominator | Σ all ties 9.524 T MXN | Σ primary ties 6.776 T MXN |
| drawn money | 4.562 T MXN | 4.562 T MXN |
| band money | — | 2.214 T MXN |

The rest of the layout is unchanged: n_drawn 20,868 · n_sky 47,097 · overflow 26,229 · per-star max 80 · σ 0.86984 · residual overlaps 129 · backbone 68.1 % · payload gz 357,881 B (gate 460,800). The run log is at `_atlas_research/s5/precompute.log`.

## B — Verifications

| Check | Result |
|---|---|
| Reduced motion (`reducedMotion: 'reduce'`, flag unset) | **Pass.** No first-visit flight and no «Saltar» banner. A hop is a cut: canvas opacity goes 0.3 → 1. A flight does not advance in 16 s (`reduced.cjs`). |
| ES flight ch 1–3, «El Monopolio Invisible» (`vuelo=pharma_cartel`), 1440 | **Pass.** Labels, card and figures are localized («1.8 billones MXN», «79,984 MDP»). The card does not cover the target. One collision, the «Pe…» spoke under the stamps, was fixed under A4. |
| Bench, S3 method (1366×768, 3 s wheel) | **Pass.** Z0 55.9 fps · Z1 IMSS 56.2 · Z1 with flight 56.2 · Z0 with flight 56.4. p95 ≤ 18.3 ms (`bench.txt`). The margin over 55 stays thin, as in S2/S3. |
| `/dashboard` drawer | **Pass.** 37 Observatory bodies, and VendorFile is visible (`shots/dashboard-drawer.png`). |
| `/atlas/stories/estafa_maestra` | **Pass.** It redirects to `/atlas?…&vuelo=estafa_maestra`. |
| Expediente = dossier (Grupo Fármacos Especializados, PV 29277) | **Pass.** Both show 6,303 contracts · 133.2 B MXN (≈ US$7B) · 99. The tie basis had printed 6,301. |

## C — Accepted deviations

| Item | Why accepted | Where it is disclosed on screen |
|---|---|---|
| Drawn-N cap of 60 (hard 80) per star; bands cover 100 % of the money | A legible system needs a cap. The bands keep every peso on the chart, and A1 now asserts drawn + band = 100 %. | Colofón: «20,868 de 47,097 cuerpos elegibles dibujados (tope 60 por estrella)» plus the remainder basis line. Star dock: «n de N … dibujados · el resto suma x %». Rim track: «resto · no a escala». |
| Ghosts only for vendors with a body elsewhere | A ghost points at a body to fly to. A band vendor has no body to point at. | Colofón basis line: «si tiene cuerpo, aparece allí como «fantasma»». Legend channel row: «fantasma / hilo — non-primary ties». |
| > 12 memberships shown as 12 threads plus «+N» | A bundled fan for hundreds of buyers is unreadable. The count stays exact. | «+N» printed beside the focused body. |
| Moons keyed on the canonical id (merged-member contracts are not moons) | The contract list is filtered by the vendor id, the same basis as `/vendors/:id`. The two surfaces therefore agree (A2). | The moon caption «n de N contratos» uses the same N as the dossier. Merged members are not separately disclosed. |
| Period dimming by money in the period (`period_q`), not by `y0/y1` tenure | Money in the sexenio is the honest «was active then» test. Tenure bytes would light a body for years in which it was paid nothing. | **New** legend row (`9f8d185a`): «brilla quien recibió dinero de la estrella en ese sexenio (monto por periodo, no años de relación); en El Campo el resto se atenúa al 8 %». |
| Blink pairs a sexenio with its predecessor | It is one obvious comparison with no second picker. | The button reads «Parpadeo · AMLO ⇄ Peña Nieto». |
| Toolbar in the masthead row | It keeps the canvas height fixed (S3 judge round). | Layout only. |
| Flights frame the system and ring the planet | One camera target per chapter; the planet is located by its ring. | Ring on the canvas, plus «En este capítulo» with the planet's name in the card. |
| Chapter card in the dock column | The engine centres the target in the free area, so the card never covers it. | Layout only. |
| Phone Lista band rows as per-year aggregates | Per-vendor band rows need a new endpoint (Phase 2). | «{y} · {n} proveedores no dibujados · {v}». |
| `/patterns/:code/constellation` goes to the pattern dossier | The pattern dossier is the canonical surface; the sky has no pattern lens. | Redirect; nothing on screen. |
| Codec at `lib/atlas/sky/url-state.ts` (spec says `lib/atlas/url-state.ts`) | Path only; the behaviour is the spec's. | Not user-facing. |
| Uniform σ on positions and R_sys | One scale keeps sizes comparable across sectors. Positions are arbitrary anyway. | Stamp «POSICIÓN DE SECTORES Y ESTRELLAS: ARBITRARIA …» on the canvas and in the colofón. |
| 129 residual system overlaps | De-overlap at a fixed reference zoom leaves 129 contacts. Positions carry no meaning. | **New** colofón line (`12208c3e`): «129 sistemas aún se tocan tras el desempalme (posición arbitraria)». |

## Gates
| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 36 s, 0 errors |
| `npm run lint:tokens` | PASS, 0 forbidden (58 pre-existing warnings) |
| `npx vitest run src/lib/atlas src/components/atlas` | 2 files, 9/9 |
| `pytest backend/tests/` with `DATABASE_PATH` = real DB | 995 passed, 1 failed. The failure is the known parity break `test_z2_vendor_pool_flags::test_backfilled_counts_match_live_aggregate` (inst 251, vendor 235708: 2144 ≠ 2142). |
| `pytest backend/tests/test_atlas_sky.py` | 17/17, including the new `test_remainder_primary_basis` and `test_expediente_totals_are_vendor_stats` |
| Source scan of the S5 diff | 0 raw hex in className · 0 italic · 0 sub-10 px literals |
| PARALLAX probe (`_atlas_research/s5/probe.cjs`) | **PASS 0/0/0.** 44 states: 1440 × 10 and 390 × 12, EN and ES. 0 sub-10 px, 0 clipped, 0 overflow, 0 italic. The S4 states plus the period line, two Z2 captions, the omitted-moon vendor and the phone off-chart search. The colofón fold was checked open separately: 11 lines per language, 0 bad. |

## Screenshots (`_atlas_research/s5/shots/`)
- `k1-en.png`: Infrastructure calmer. ISSSTE's label is dropped, not covered.
- `es-masthead-1440.png`, `es-masthead-1280.png`
- `expediente-vs-dossier.png`: the dock and `/vendors/29277` side by side, both 6,303 contracts · US$7B · 99.
- `z2-omitted.png`: Villagomez Jurado, «56 of 59 contracts drawn … 3 contracts with amount ≤ 0 omitted».
- `flight-back.png`: after Back from chapter 3 the URL is `n=1` (chapter 2).
- `phone-search-offchart.png`
- `es-flight-ch1.png` (plus `es-flight-ch2.png`, `es-flight-ch3.png`)
- Extra: `phone-disc-stamp-es.png`, `phone-disc-stamp-en.png`, `dashboard-drawer.png`, `k16-imss.png`

## For the ship
1. Push, then wait for `deploy.yml` to finish.
2. Rerun `python -m scripts.precompute_atlas_sky` in the container, then the `wal_checkpoint(TRUNCATE)` loop. Until then prod's colofón shows the old 52.1 %.
3. Expect `remainder_share` ≈ 0.3268 and `/atlas/sky/manifest` `stars.np` present.

The manifest computes per-star `rem` and `np` from the existing `atlas_sky_layout` rows, so the dock line is right as soon as the code deploys. Only the global colofón share waits for the rerun.

## Not verified
- Real touch hardware and iOS Safari. Phone checks were emulated in Edge at 390×844.
- Nothing ran in-container or on prod.
- The bench is headless Edge at a 60 Hz rAF cap, with no integrated-GPU run.
- The dashboard Observatory drawer shows «US$7B · 6,303 contracts» from its own endpoint. That surface is outside S5 and was only checked for rendering.

## Environment notes
- The 8001 backend left by S4 served pre-edit code. It was restarted from this worktree with `DATABASE_PATH` set to the real DB. Its first run hit the 30-minute background limit and was restarted. Vite on 3011 serves this worktree.
- Scripts: `_atlas_research/s5/{look,overlap,flightback,phonesearch,phonedisc,reduced,flight-es,bench,regress,expvd,colofon,probe}.cjs`. Logs: `precompute.log`, `probe.log`, `pytest_full.log`, `build.log`, `lint.log`, `vitest.log`, `bench.txt`.
