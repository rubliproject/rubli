# Atlas instruments I-S3 «Qué cambió» — session report

Spec `.claude/designus/atlas-instruments-2026-10-03/spec-draft.md` § 2.5, § 3.4, § 3.5, § 3.7, § 3.8, § 3.9, § 5, § 9 · brief `i-s3-brief.md` · branch `atlas/i-s3` (base origin/main `207f5e07`) · BUILD_ID `2026-10-06-atlas-i-s3` (found in `dist/assets/index-*.js`). Not pushed.

## Commits (origin/main..HEAD)

| # | Commit | What |
|---|---|---|
| 1 | `19d04e74` | `GET /atlas/sky/kin/{planet}`: buyers (≤ 12 + `n_buyers`), `years_here` from `atlas_sky_tie_years`, co-bid partners through `ranking_safe()` (withheld → `name: null`, red only between safe vendors), `drawn` / `host_id`, `n_cobid_not_drawn` (partners with no tie). PK / index reads, ETag `"{lv}-y1"`, no RFC. 4 pytest |
| 2 | `d1d4af11` | Catálogo · Parientes: buyers fly to their star, partners fly to the body or the main buyer («sin cuerpo · vuela a su principal comprador»), red dashed rule, «{n} socios no dibujados», basis «un hilo no es prueba». Lazy (scope open only). Phone Lista gets the chip |
| 3 | `96f20b87` | `period-diff.ts` (pure) + vitest |
| 5 | `7ec31555` | SkyEngine: `marks` pass, `paused`, `SkyApi.snapshot()` (committed before 4 so SkyDiff compiles) |
| 4 | `30a94406` | SkyDiff + «Qué cambió» dock tab (`tab=diff.A.B`), marks on the plate, whisker stamp |
| 6 | `0223679b` | SkyCompare twin plate (`x`, «A \| B» chip, `cmp` pushed, Esc in capture) + SystemDisc `px` / `marks` / `hatched` |
| 7 | `21488c4f` | PNG plate (Exportar ▾ › Lámina PNG) |
| 8 | `92c5328b` | Bitácora: «⌂» origin chip, `{`, `h` popover |
| 9 | `2e72e900` | Phone: A \| B toggle on the disc, «Qué cambió» sheet tab |
| 10 | `015fcba4` | `SKY_KEYS` + x · h · { (the SKY_COPY rows landed with their instruments) |
| — | `9f221bb1` | eslint gate fixes |
| — | `fa3b8c3c` | crop fixes (refusal prints missing years; dagger rows name INS id; «0 socios no dibujados»). The BUILD_ID edit (item 11) rode in this commit |
| 11 | this commit | report |

## Gates (worktree, one at a time)

- `tsc -p tsconfig.app.json` 0 · `npm run lint:tokens` PASS · `npx vitest run --maxWorkers=1` 17 files / 150 tests green (period-diff 9 cases: refusal, coverage note, successor, dagger, stays-only whiskers, 8 px floor, Sheinbaum, marks, cmp grammar; url-state's `cmp` round-trip + pan-preserves unchanged and green) · `npx eslint .` 0 errors (38 warnings, all pre-existing) · `npm run build` 0.
- Backend (`DATABASE_PATH=…/RUBLI_NORMALIZED.db`): `test_atlas_sky.py` 28 pass + the 3 known label-drift failures; the 4 kin tests pass. Kin payload for Grupo Farmacos 29277: 3.3 KB.
- Plate gate (`plate-i-s3.json`): plate top 211 px at 1440, 206 px at 1280, EN + ES — Δ 0 vs I-S2.
- fps (`bench.txt`, 1366 × 768, 3 s wheel): Z1 IMSS **60.0** (p95 16.8 ms) · Z1 IMSS with the PN → AMLO diff marks on **60.0** (p95 16.8, max 17.0).
- Probe, 32 states (1440 + 390, EN + ES): 0 sub-10 px · 0 italic · 0 horizontal overflow (`shoot.log`, `shoot2.log`).

## Crops — `_atlas_research/atlas2/i-s3/` (EN + ES)

`diff-imss-pn-amlo-1440` (484.8 → 725.2 B MXN, 12,641 → 12,315 suppliers, 19 arrived · 5 left · 53 stayed among 80 drawn, whiskers + rings + ticks), `diff-cdmx-refusal-1440` («sin registros … en AMLO: 2019–2022 (cambio de cobertura 2019–2022)»), `diff-sct-successor-1440` (refusal AMLO: 2021–2024 + «† SCT: continúa como SICT desde 2021 · volar a SICT →»), `diff-pemex-dagger-1440` (Calderón → PN: «† PEMEX · INS 311: caída de registros…»), `twin-imss-1440` (PN | AMLO, Esc → `cmp` dropped, dialog gone), `kin-farmacos-1440` (12 buyers + 42 more, 8 partners, «0 socios no dibujados»), `log-h-1440`, `png-plate-1440` (the exported file; no vendor name on it), `phone-diff-imss-390`, `phone-ab-imss-390`, `phone-kin-390`.

## `cmp` writers

Desktop: `cmp` is page state in `live.current`, so `liveQuery` carries it through every writer (the 250 ms `end` replace after a pan, hops, Back's local retrace, period, tab, pins, year). `openCompare` pushes; `closeCompare` (Esc capture, ✕, successor fly) replaces without it; `onPop` re-reads it (`popLive` + `setCmp`). Phone: the three `skyQuery` writers already carry `st.cmp` through `extra`; `writeSearch` keeps it.

## Slipped

Nothing from the slip list. Not built: the `h` popover's per-entry type icon (the kicker is the level name), the phone PNG (spec cut), two-star / two-planet `cmp` (reserved, parse to null).

## Spec lines that were wrong or changed

- § 3.4 refusal «no money in A or B» misses CDMX (1326): it has 1.47 B in AMLO (2023–24 only). The rule is now «no money, or no records for ≥ half the period's data years» (`ponytail:` threshold note in `period-diff.ts`), and the refusal prints the missing years. The 2019–22 coverage note is suppressed when a declared successor explains the stop (SCT).
- § 2.5 Sheinbaum «0.75 a»: computed from `data_cut` it is **0.74 a**.
- § 3.8 «withheld rim names suppressed in the snapshot pass»: the canvas draws institution rim names only; every vendor name is a DOM label, which the plate never redraws — so there is nothing withheld to suppress. The snapshot pass drops the catalog cursor ring.
- § 2.5 dagger test «PEP 311»: the manifest's siglas for 311 is PEMEX (as I-S2 noted); the footnote adds «INS 311» so it cannot be read as 1201.
- § 3.5 Kin buyers: the endpoint lists buyers itself (with `n_buyers`) rather than reading `system.bodies[].also`, so an undrawn vendor still gets its buyers.

Local stack used: backend 8002 (`PYTHONPATH` = worktree backend; the shared 8001 runs the main checkout and 404s on `/kin`) + Vite 3014 (`VITE_API_URL=http://127.0.0.1:8002`).
