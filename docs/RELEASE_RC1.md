# Release candidate RC1 — `release/nov-rc1`

> **Status: final tree `13dd3973` + BUILD_ID `2026-10-29-nov-rc1b`, deployed 2026-10-29.** `sec/app-hardening`
> landed on main (`cd5ec895`, the previous prod) and is merged in (`41f196ad`): only conflict was BUILD_ID.
> nginx kept main's headers/zones plus RC1's `X-Robots-Tag` map; index.html keeps main's CSP (no inline
> scripts besides JSON-LD); the Caddyfile is identical to prod, so no Caddy restart.

Base: `origin/main` @ `2f259ba4`; main re-merged at `2d54bf8a`, `c23f767f` (ui/cases-compact) and
`88748bdc` (ui/vendor-dossier-life). Built 2026-10-29.

## Merged branches (in order, origin heads)

| # | Branch | Head | Merge commit | Conflicts → resolution |
|---|---|---|---|---|
| 1 | fix/gasto-a-ciegas-honest | `d78f5cca` | `d56a00d4` | none |
| 2 | ui/captura-tighten | `b03ab014` | `dd7f0626` | `nav.json` en/es: branch title «Un comprador, una empresa» / «One buyer, one supplier» + main's `noSeVe` key |
| 3 | fix/house-credibility | `c31f74f8` | `1f29ef43` | `types.ts`: main's `vendor_name: string \| null` + `thin_history`; `RegisterRow.tsx`: main's `td.gauge` + `thinHistory`/`vendor`; `contrato.css`: `.is-thin` + main's `--track-sc` tokens. RiskGauge auto-merged: v3 real values (`v.toFixed(2)`) + «Historial insuficiente» |
| 4 | feat/evidence-fields | `0c4a4a4c` | `125dcc6b` | none |
| 5 | fix/stale-numbers | `3fab56de` | `e4e83d6f` | `methodology.json` `v33section.tableAriaLabel`: kept main's «v3.3 vs v0.9.2» (the branch's intent; key unused) |
| 6 | fix/launch-audit-should | `2642070e` | `ceb41363` | `Captura.tsx`: captura-tighten removed the «En cifras» block, so the N1 sr-only h2 went with it (outline h1 → h2 → h3 holds). nginx clean |
| 7 | ops/backup-alert | `163603bd` | `673471cf` | none |
| — | BUILD_ID | — | `5ad73c02` | `2026-10-28-gasto-a-ciegas` → `2026-10-29-nov-rc1` (`frontend/src/lib/constants.ts`) |
| — | drop CasesBand h1 | — | `2f0ee7a5` | launch-should's `CasesBand` h2→h1 reverted to main's; /cases heading belongs to ui/cases-compact (now on main) |
| 8 | fix/hide-films (owner) | `4a3642ef` | `cc3b6b88` | none. `FILMS_LIVE=false`, /gallery out of the TOC, redirects |
| 9 | ui/plataforma | `0af2d055` | `bd8f9b50` | `Privacy.tsx`: plataforma's copy (supersedes stale-numbers' 3.2 M line). `Methodology.tsx`: plataforma's remake, then main's additions re-applied: the **Focos Rojos** section (`FocosRojosMethod`, main 17b6387b) as a `PfSection` before «Los datos», and the Declaraciones as the folded `<FootNotes>` (main 30957c9b § G1). gen-head-shells merged clean |
| 10 | ui/trio-port | `03465db1` | `ad4613c6` | none |
| 11 | ui/categorias-hallazgos | `037e8841` | `a7c2b301` | `lib/categories/hallazgos.ts` deleted (data now from the precompute). house-credibility's mechanical-trend caveat lived on the old «advertising 23 %→36 %» finding, which the new four «Tendencias» do not carry, so nothing to port. `CategoriesIndex.tsx`: main's ViewTabs in the DocHead, with the branch's `tendencias: 4` key |
| 12 | ui/plataforma (re-merge) | `33f2ae5c` | `c612c9a6` | none (methodology plates III·a / III·c) |
| 13 | ui/trio-port (re-merge) | `0a2c433d` | `88f44cc7` | none (EntityIdentityChip `size="inherit"`) |
| — | origin/main | `dd9df108` | `080f283a` | none |
| 14 | ui/table-standard (pass 1, not -2-wip) | `090ab6ea` | `431cb5f2` | none |
| 15 | fix/gasto-a-ciegas-2026 | `70fea430` | `768ba233` | none |
| — | ui/categorias-hallazgos | `48bc9d81` | already in via `3db4e4e4` | — |
| — | origin/main (sec/app-hardening + data-counts) | `cd5ec895` | `41f196ad` | `constants.ts` BUILD_ID → `2026-10-29-nov-rc1b` |
| 16 | ui/dossier-objects | `7361c6aa` | `6b5bb4e1` | none |
| 17 | ui/dossier-objects-2 | `fb9720ea` | `13dd3973` | none. Adds `three` 0.186.1: `package-lock.json` re-synced to the exact pins (npm ci) |

## Gates (final tree `13dd3973`, run serially)

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | PASS, 0 errors (after `npm install` brought in `three`) |
| `npx vitest run --maxWorkers=1` | PASS, 66 files, 471 passed / 1 skipped |
| `npm run lint:tokens` | PASS, 0 forbidden (526 warnings) |
| `npm run build` | PASS; three.js only in the lazy `vendor-three-*` chunk (not preloaded); head shells 18 |
| `pytest` touched modules + `test_register_counts.py` | PASS, 25 passed / 57 skipped (DB-backed tests skip: the worktree has no full DB) |
| `proof:ui` @1440 + @390, 14 routes (vite :3250, API = rubli.xyz) | 25/28 PASS. RAGGED @1440 only: `/captura` `.cr-pr-grid` Δ72 (Casos fallback, `/captura/casos` 404 on old prod), `/antes-del-fallo` `.dt-object` Δ101, `/arranque` `.dt-object` Δ86 (old prod newtabs data). Re-run against prod after the data steps |

proof:ui used the **prod API**, which lacks this release's backend: `/api/v1/captura/casos` 404,
`/api/v1/categories/hallazgos` 404, and contract `thin_history` / `exception_article` / `caso_fortuito`
plus vendor `thin_history` absent. So /captura «Casos», /categories «Tendencias», «Historial insuficiente»
and the contract legal-basis row were measured empty or in fallback. Re-check them after deploy.

## Data steps prod needs

**Run BEFORE the frontend goes live** (inside the backend container, against the prod DB at
`/var/lib/rubli-db/RUBLI_DEPLOY.db`; take a `sqlite3 .backup` first):

1. `python -m scripts.precompute_category_hallazgos --db <prod db>`: writes
   `precomputed_stats['category_hallazgos']`. Without it `/categories/hallazgos` 404s and «Tendencias» is empty.
2. `python -m scripts.precompute_newtabs --db <prod db>`: trio-port changed the definitions (CompraNet-only
   rows, `source_structure <> 'E'`, so 2025 stops double-counting; new `apf_buyers` in meta). It rebuilds the
   `newtabs_*` tables used by /arranque and /mismo-dia.

3. `python -m scripts.precompute_budget_visibility --db <prod db>` (no `--csv`: reuses `budget_exercised`).

No step needed for: `thin_history` (computed per request, cached 1 h, existing `idx_c_vendor_year`),
legal basis (existing `contracts.exception_article` / `caso_fortuito`), `/captura/casos` (existing
`captura_pairs`), `/fallo` (computed live, cache key bumped to v3).

**Ops, once, owner ≈ 5 min** (ops/backup-alert; docs/OPS_LAUNCH.md § 5): `install -m 600
/opt/rubli/scripts/rubli-ops.env.example /etc/rubli-ops.env`, fill `RUBLI_OFFSITE`, `RUBLI_NTFY_TOPIC`,
`RUBLI_HC_BACKUP_URL`, `RUBLI_HC_UPTIME_URL`; `install -m 644 /opt/rubli/scripts/rubli-ops.cron
/etc/cron.d/rubli-ops`; then `bash /opt/rubli/scripts/restore-test.sh` should print `RESTORE OK`.
Until this is done, no offsite copy and no alerts run.

## Risks

- **«Historial insuficiente» relabel (~81 % of vendors, per house-credibility).** A low reading from a vendor
  with < 3 earlier contracts now prints «Historial insuficiente» instead of «Bajo» on contract gauges, vendor
  covers and the ARIA register. Scores are untouched, but most vendor pages change their visible verdict, so
  expect reader and press questions. The relabel is honest: 0.29 % of no-history contracts read high, against
  about 12 % of the rest.
- Cold cache: the first request per vendor / vendor-year runs an indexed COUNT (LIMIT 3). List endpoints
  (≤ 100 rows) may be slower right after deploy.
- `X-Robots-Tag: noindex` on `/aria*` and `/vendors/*` drops those pages from search results (intended, S4).
- Films hidden (`FILMS_LIVE=false`): /gallery redirects; the head shells drop from 20 to 18.
- The Methodology merge is hand-made: plataforma's reviewed remake plus main's Focos Rojos section and
  folded foot notes. proof:ui passed, but nobody has reviewed it visually yet.
- If the data steps run late, /categories «Tendencias» is empty and /arranque shows the old definitions.

## Rollback (5 lines) — previous prod = `cd5ec895`

1. Before deploy, note the live commit: `ssh root@37.60.232.109 "cd /opt/rubli && git rev-parse HEAD"`.
2. Revert the RC merge on main: `git revert -m 1 <rc1-merge-sha>`, then push to `origin` and `prod` main (docs/ROLLBACK.md § 1).
3. That push redeploys through `deploy-safe.sh`; watch the newest `/root/deploy-*.log`.
4. Verify: `curl -sI https://rubli.xyz/` returns 200, the bundle hash is back to the previous one, and `/api/v1/health` shows `db_connected:true`.
5. The precomputes only add or refresh `precomputed_stats` / `newtabs_*` rows, which the old code ignores or reads as before. If needed, restore the pre-step `.backup`. The ops cron can stay, or remove it with `rm /etc/cron.d/rubli-ops`.
