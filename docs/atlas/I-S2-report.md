# Atlas instruments I-S2 «El año» — session report

Spec `.claude/designus/atlas-instruments-2026-10-03/spec-draft.md` § 2, § 3.2, § 3.3, § 5–§ 11 · brief `i-s2-brief.md` · branch `atlas/i-s2` · BUILD_ID `2026-10-06-atlas-i-s2`.

## Commits (origin/main..HEAD)

| Step | Commit | What |
|---|---|---|
| 1 | `81830b0d` | `precompute_atlas_sky.py --years-backfill` (packed keys, 2 tables, 3 columns, meta rows, successors, breaks, memory gates, drift guard) |
| 2 | `465adf9e` | service + router: SKY3 bin / SKY2 shim, manifest `ym` + meta, system years, ETag `"{lv}-y1"` |
| 3 | `477093a0` | pytest: Σ star-years, Σ tie-years, thin rule, year gaps, 1326 gap, daggers, successors, SKY3/SKY2, no RFC, withheld top name |
| 8 | `3e4a1b6c` | copy (ES first), committed before step 5 so later steps compile |
| 4 | `3456db45` | `geometry.ts` SKY3 decoder + SKY2 shim + vitest |
| 5 | `230080fa` (wip) + `ea6a06e3` | SkyRail, engine year mask Z0/Z1/Z2 + hand + arrival ring, rail mount via `--atlas-foot`, desktop period chips removed |
| 6 | `31802d2d` | «El Cuadrante» dock tab (planet + star dials) |
| 7 | `5acb0a66` | sheet tabs Ficha · Cuadrante, «‹ año ›» stepper in the tab row, disc lit by period money, hand on both discs |
| 9 | this commit | BUILD_ID, report, dial co-bid layout, stamp width cap |

## Local backfill (RUBLI_NORMALIZED.db, 7.9 GB, slow D:)

Log: `_atlas_research/atlas2/i-s2/backfill.log`. `layout_version 20261002T181927Z` kept.

| Stage | Runtime | Peak RSS |
|---|---|---|
| 1 accumulate (1,238,494 vendor×institution×year keys, anomalies {}) | 21.3 s | 215 MB |
| 2 fold + drift guard (0 mismatches, rel 1e-6) | 15.7 s | 284 MB |
| 3 star-years + meta | 2.1 s | 284 MB |
| 4 write (one transaction) | 6.7 s | 284 MB |
| **total** | **45.9 s** | **284 MB** (gate 600) |

- `atlas_sky_star_years` 19,101 rows · `atlas_sky_tie_years` 288,950 rows (20,868 drawn vendors, every tie).
- `year_gaps` [2004] · `thin_early` [2000, 2001] · `coverage_drop` [2019, 2020, 2021, 2022] (inst reporting 1,442 in 2018 → 347 / 329 / 333 / 326).
- Successors: SCT 345 → SICT 3671 (2021), DICONSA 1327 → 3785 (2023).
- Σ period_v = star value: 0 stars beyond 1 peso (max 0.0205).
- Readable stars: 1,035 with ≥ 5 non-thin years (92.7 % of sky money); 399 with ≥ 10. Not cited in copy (§ 2.6).
- Payload gz: manifest 130,915 + bin 264,935 = **395,850 B** (gate 460,800). WAL checkpoint (0, 0, 0).
- cgroup headroom check skipped locally (no `/sys/fs/cgroup` memory files); it runs in-container.
- `breaks`: the full list is in the log (sector 3 SCT → SICT; sector 4 PEMEX 311 decline Calderón → Peña Nieto, PEMEX 311 / CFE 104 / PEMEX 1201 stop Peña Nieto → AMLO; sector 9 DICONSA → 3785; sectors 6, 7, 8, 11, 12 declines and stops).

## In-container backfill (for the lead, after the deploy workflow finishes)

```bash
docker exec rubli-backend ps aux | grep -c precompute   # peers first; hold if any
docker exec rubli-backend python -u -m scripts.precompute_atlas_sky --db /app/RUBLI_DEPLOY.db --years-backfill
```

Then the WAL loop to `(0, n, n)`, verify `bin_version = 'SKY3'` and `payload_gz_bytes ≤ 460,800` in `atlas_sky_meta`, and reload. Before it runs, prod serves SKY2: the rail hides years and histogram (never zeros), the dial prints «sin tabla anual».

## Gates (worktree, one at a time)

- `tsc -p tsconfig.app.json` 0 · lenient `tsc` 0 · `npm run build` 0 errors · `npm run lint:tokens` PASS · `npx eslint .` 0 errors (38 pre-existing warnings) · `npx vitest run --maxWorkers=1` 16 files / 141 tests green.
- Backend: the 12 new/affected tests in `test_atlas_sky.py` pass with `DATABASE_PATH=…/RUBLI_NORMALIZED.db`; 3 pre-existing label-drift failures (`test_bin_public_bits`, `test_system_is_gt_documented_only`, `test_glyph_bits_withheld`) are against the stale Oct 2 local layout, untouched.
- Plate gate (`_atlas_research/atlas2/i-s2/plate-i-s2.json`): plate top 211 px at 1440 and 206 px at 1280, EN + ES — Δ 0 vs the face S2 baseline; sky height 560 px at 1440 × 900 (spec ≈ 564).
- Rail on screen: 1440 × 900 rail 823–867 · 1280 × 800 723–767 · 1366 × 768 691–735. No horizontal overflow at any size.
- Probe (1440 + 390, EN + ES): 0 sub-10 px. «clipped» = 17 on every page incl. phone, all in the app chrome (the sr-only skip link and the sidebar numerals «I ·», «II ·»…), none in the atlas surfaces.
- fps (1366 × 768, 3 s wheel, rail ▶ playing): Z1 IMSS **59.7 / 59.0 fps** · Z0 59.0 / 58.3 · Z1 IMSS with the catalog open and 3 pins 52.1 / 53.1 (one 117 ms frame per run — below 55; the per-year page re-render with the catalog mounted, not the canvas). `bench.txt`, `bench_run1.txt`.

## Crops — `_atlas_research/atlas2/i-s2/`

`z1-imss-2019` (bodies lit, hand, 2019–22 stamp, readout «2019 · 63 activos · 9 llegan entre los dibujados · 972 en el resto»), `sweep1..3` (hand at 2015 / 2018 / 2021 via `t` + →), `z0-2004-gap` (hatched + «2004: 7 contratos en CompraNet · hueco de origen…»), `z1-sct-stopped-2022` («sin registros de esta institución desde 2021»), `z1-imss-dial-star-2019`, `z2-dial-cobid` (8 partners), `z2-dial-nocobid` («sin co-licitaciones registradas»), `z2-dial-sole` («único comprador», counts under 5), `phone-dial-2019` (stepper in the sheet tab row), `phone-disc-amlo-2019` (lit by AMLO money + hand) — 1440 / 390 × EN / ES.

## `yr` writers

Desktop: `live.current.yr` in `liveQuery` (every `end` replace, hop, Back, period write), `chooseYear` (250 ms debounced replace) from the rail, the dial tenure gauge and HHI columns; `onPop` re-reads `yr`. Phone: the three `skyQuery` writers carry `st.yr` via `extra`; the stepper and the dial write `writeSearch({ yr, pins })`.

## Spec lines that were wrong or changed

- § 3.3 «the planet at its host at Z2 (Kin `years_here`)»: Kin is S3. At Z2 the rail shows the star's money per year with an ochre underline under the years this supplier was paid there (the bin mask); the basis line says so.
- § 3.2 ghost dial: no ghost state reaches the dock (a ghost hover never opens it), so it is not built.
- § 3.3 phone «PhoneDisc lit by year»: the phone never fetches planets.bin, so it has no year masks. The phone disc lights by money in the sexenio (`period_v`, decision 8) and draws the hand; it does not light by year. MoonDisc does light moons dated in `yr`.
- § 2.5 dagger test named «PEP 311»; the backfill prints it as PEMEX 311 (the star's siglas).

## Unfinished

- The catalog-open fps case (52–53) is below 55; Z1 IMSS itself holds.
- Desktop crops of the rail at 1024 (short segment names) not taken.
