# RUBLI — Mexican Government Procurement Analysis

AI-powered corruption detection for Mexican federal procurement. ~3.18M contracts (2002–2026: CompraNet to Sep 2025 + ComprasMX), ~10.45T MXN validated value (prod `/executive/summary`, 2026-10-28).

> **Lean by design.** Only hard rules live here. Reference material is read on demand: `docs/FRONTEND_REFERENCE.md` (Atlas, stories, story graphics, currency, UI primitives, pitch matrix), `docs/SCORING.md`, `docs/RISK_METHODOLOGY_v6.md`, `frontend/DESIGN.md`. Session-start sanity: this checkout must be on/near `origin/main` — a stale branch loads a stale CLAUDE.md.

---

## Storage — D Drive Only

**C drive is full.** All writes, installs, builds, temp files, caches → `D:\` only. npm cache `D:\Python\.npm-cache`. Worktrees in `.claude/worktrees/`. Dev ports 3009 → 3010 → 3011 (check `netstat` first).

---

## Core Behavior

### Reasoning + ponytail (how they fit)
- **Read deeply, build lazily.** Read full file context, trace schema → API → UI, find the root cause — THEN apply ponytail: shortest correct diff, reuse before writing, no unrequested abstractions. Ponytail shortens the solution, never the reading.
- **Surface what you notice** in one sentence — don't fix unsolicited, don't stay silent.
- **Name tradeoffs** when there are multiple valid approaches; recommend one.

### Working Style
- **Implementation first.** Plan doc only when the user says "make a plan".
- **When interrupted ("stop", "wait", reject) — pause and ask.** Don't restart the same action.
- **Incremental delivery.** 1-line summary after each file change.
- **No unsolicited refactoring.** Only change what was asked.

### Skill routing (default — invoke without being asked)
| Task | Skill |
|---|---|
| Any frontend/UI work | `rubli-ui` = the PROCESS: it makes you INVOKE the real skills (Skill tool, never a summary). New/redesign → `frontend-design` + `taste-skill` + `dataviz` per chart. Fix → `impeccable` + `emil-design-eng`/`animate`. Then an independent reviewer runs `web-design-guidelines` + `ui-ux-pro-max` + `frontend-a11y` + `rubli-bilingual-audit` → ship/fix verdict BEFORE the owner sees it. Target = the owner-approved pages (dossier template, Captura, Vínculos, /aria), not the old Contrato shell. |
| Before committing a touched TSX file | `rubli-bilingual-audit` |
| Bug / regression / "it's broken" | `diagnose` |
| Scoring, ETL, risk model, money paths | `tdd` |
| Any published claim (story, film, memo, press) | `fact-check-workflow` |
| Big plan before spending agents | `grill-me` |
| Invent a new design (no known target) | `designus` |
| Films | `eraserhead` |
| Docs/methodology/pipeline diagrams (NOT site charts) | `diagram-design` |
| Deploy | `rubli-prod-deploy` |
| End of a thread / context full | `handoff` |
| After a deploy | `canary-watch` skill + `security-reviewer` agent |
| ComprasMX / CKAN crawler work (post-Sep-2025 feed) | `data-scraper-agent` skill |

**Review agents ("joker" picks, copied from the ecc plugin into `.claude/agents/`):** `mle-reviewer` (risk model / retrain — leakage, calibration, reproducibility) · `fastapi-reviewer` + `python-reviewer` + `silent-failure-hunter` (backend) · `react-reviewer` + `a11y-architect` (frontend) · `opensource-sanitizer` (before any public release — secrets, RFC/PII) · `seo-specialist` (launch). The full ecc plugin is off; "joker on" re-enables it.

**Always-on:** `ponytail` (hook) for code + `caveman` for **chat replies to the owner** (owner doesn't read long text). Caveman never touches site copy, stories, films, docs, or commit messages. Never default: `triage`/`to-issues`/`to-prd` (no tracker).

### Edit Safety
- **Start with docs/PROJECT_MAP.md; use claude-mem smart_outline/smart_search before reading whole files.**
- Re-read files after ~8–10 messages or when switching domains. Files >500 LOC: read in chunks.
- Tool outputs >50K chars are silently truncated — narrow and re-run if results look thin.
- **Renames**: grep separately for direct calls, type refs, string literals, dynamic imports, barrels, test mocks.
- **Refactors >300 LOC**: dead-code cleanup commit first, real work second.

### Multi-Agent Coordination
- Check `.claude/ACTIVE_WORK.md` before DB or scoring work. Two agents never write the same DB table / scoring column at once.

---

## Architecture + Gates

| Item | Value |
|---|---|
| Database | `backend/RUBLI_NORMALIZED.db` (deploy: `backend/RUBLI_DEPLOY.db`) |
| Backend | `uvicorn api.main:app --port 8001` from `backend/` (NOT `main:app`); boot scans 3.2M rows (30–60s, expected) |
| Frontend | `npm run dev` from `frontend/` → port 3009 |
| Backend tests | `python -m pytest backend/tests/ -q --tb=short -p no:cacheprovider` |
| Frontend gate | `npx tsc --noEmit -p tsconfig.app.json` AND `npm run build` — 0 errors (`tsconfig.app.json` enforces noUnused*) |
| Spacing gate | `MSYS_NO_PATHCONV=1 npm run proof:ui -- /route` with dev server up — VOID/CHASM/RAGGED/OVERFLOW = 0 at 1440 and 390 before commit and before showing the owner |
| Header gate | `MSYS_NO_PATHCONV=1 npm run proof:head -- /route` — every page opens with `kit/PageHead` (one crumbs row, one h1 = the finding, no second title, same edge + size); 0 at 1440 and 390 · `docs/HEADERS_2026-11-09.md` |
| Token gate | `npm run lint:tokens` — fails on raw hex / forbidden tailwind |

**Python 3.11**: no backslashes inside f-string expressions.

Key files: ETL `backend/scripts/etl_pipeline.py` · ARIA `backend/scripts/aria_pipeline.py` · WAL `backend/scripts/_wal_checkpoint.py` · active work `.claude/ACTIVE_WORK.md`.

---

## Critical Data Rules

Contract value **> 100B MXN → REJECT** · **> 10B → FLAG** · else accept. (Detail: `.claude/rules/data-validation.md`.) Why: trillion-peso decimal errors destroyed the predecessor project's analytics.

## 12-Sector Taxonomy

| ID | Code | Ramo | Color |
|---|---|---|---|
| 1 | salud | 12, 50, 51 | #dc2626 |
| 2 | educacion | 11, 25, 42, 48 | #3b82f6 |
| 3 | infraestructura | 09, 15, 21 | #ea580c |
| 4 | energia | 18, 45, 46, 52, 53 | #eab308 |
| 5 | defensa | 07, 13 | #1e3a5f |
| 6 | tecnologia | 38, 43 | #8b5cf6 |
| 7 | hacienda | 06, 23, 24 | #16a34a |
| 8 | gobernacion | 01-05, 17, 22, 27, 35, 36, 44 | #be123c |
| 9 | agricultura | 08 | #22c55e |
| 10 | ambiente | 16 | #10b981 |
| 11 | trabajo | 14, 19 | #f97316 |
| 12 | otros | (default) | #64748b |

---

## Risk Model — v0.9.2 (ACTIVE, 2026-10-23)

v0.9.1's recipe re-fitted on **as-of** features (`contract_features_v10`), chosen by the signed rematch (`_v10/RESULT_2.md`). Forward-chained vendor-year AUC 0.827 (lower CI 0.763) · size-controlled 0.741 · HR 9.95% · intercept −3.6328 · c_pu 0.4360 · T 0.530 · 17 features, 16 non-zero (top standardised β: rt4_log, price_volatility, inst_hhi_prior, price_ratio; negative: sector_spread, cobid_herfindahl — `docs/MODEL_CARD_v0.9.2.md` § 1). Distribution (prod `/analysis/risk-overview` 2026-10-30): Critical ≥0.60 5.2% · High ≥0.40 4.8% · Medium ≥0.25 12.5% · Low 77.6%. Never print v0.9.1's 0.852 next to 0.827 (different test). Site copy reads `MODEL_AUC*` / `CURRENT_MODEL_VERSION` from `@/lib/constants`. Scores ComprasMX (structure E) too.

- **Scorer: `_v10/score_v092.py`** (frozen artifact `_v10/rematch_result.json`). **Read `docs/SCORING.md` before any rescore.** v0.9.1's stored features had look-ahead — never reuse `contract_z_features*` for a model.
- **DO NOT** score without intercept < −0.5, c_pu > 0.30, HR 2–15% (scorer enforces).
- **Display score:** `risk_score` = q = σ(z)/c_pu up to 0.60, squashed above it (0.60 + 0.35·tanh((q−0.60)/0.46) < 0.95, no 1.00 ties, levels unchanged); `risk_score_v92` = capped min(q, 1), the source/rollback (`docs/SCORING.md` § Display score).
- `rt4_log` (vendor breadth) works *against* P6 capture — the score is not a capture detector; use ARIA P6 / `/captura`.
- Preserved: `risk_score_v91` (v0.9.1, rollback; or `score_v092.py --rollback` from `_risk_pre_v092`), `risk_score_v8`, `risk_score_v6`, `risk_score_v5` (leakage), `risk_score_v4`.

## Data Sources

COMPRANET structures: A 2002–10 (RFC 0.1%, risk underestimated) · B 2010–17 (15.7%, UPPERCASE) · C 2018–22 (30.3%) · D 2023–25 (47.4%, Partida codes) — CompraNet feed froze **Sep 28 2025**. **E = ComprasMX** open-data contract CSVs 2025–26 (`source_structure='E'`, deduped vs CompraNet, 120,844 at the Oct 23 load), scored and in the public register; refreshed weekly by `scripts/comprasmx_weekly.py`; record cut = `/stats/data-cut` (2026-10-28). Fallo-OCR gap rows stay in `gap_contracts` (`/gap`).

## ARIA

9-module pipeline → tiered queue (`docs/ARIA_SPEC.md`). `cd backend && python -m scripts.aria_pipeline`; memos `python -m scripts.aria_generate_memos --tier 1 --limit 20`. Frontend: Focos Rojos (`/aria`). Spanish copy: never «cola» — use «la fila de investigación».

---

## Frontend — Hard rules (every commit)

1. `<EntityIdentityChip>` is the **only** way to render an entity outside its own dossier. No plain `<Link to={`/vendors/${id}`}>{name}</Link>`.
2. Risk thresholds via `getRiskLevelFromScore` from `@/lib/constants` (0.60 / 0.40 / 0.25). No inline ladders.
3. Vendor names via `formatVendorName` / `formatEntityName(type, name, size)`. No raw `{vendor.name}`.
4. Data from `vendor_stats.*` / `category_stats.*` / `institution_stats.*`, not raw `vendors.avg_risk_score`.
5. Risk copy: "indicador de riesgo" / "risk indicator" — never "X% probability of corruption".
6. Spanish § kickers for editorial sections (English via i18n). Every visible string bilingual.
7. No green for low risk. `low` → `text-text-muted`.
8. Commit messages cite doc + § (e.g. `feat(dossier P3 § 2): …`).
9. Colors from `@/lib/constants` / tokens; hex via `style={{color}}`, never as a className.
10. Currency helper by surface: hero/footer `formatDualCurrency`, table/axis/tooltip `formatCompactMXN` (ES = MDP / billones, never "B MXN"). **Every money figure shown to readers carries USD next to MXN** (international audience, owner 2026-10-31): hero/headline/cards/lead amount of a sentence via `formatDualCurrency(mxn, year?)` (or `moneyDual` / `mxnDual` in `lib/`), at the year's rate when the figure is one year; **the Spanish edition shows MXN only** (USD lives in the English edition; the helpers already do this); tables keep MXN in the cell with USD as a column or `title` (`AmountCell`). Naming + copy rules: `docs/NAMING_STANDARDS.md`.
11. Dot charts only via `<DotBar>` / `<DotStrip>` — never inline `<circle>` strips.

**Navigation:** one registry numbers every page — `frontend/src/lib/nav/toc.ts` (`TOC`, `OFF_NAV`, `folioFor`). Never type a page numeral. Headers via `<PageMasthead>`. El Mapa (`/mapa`; `/` is the Portada) opens on «Vínculos» (the sky, default since 2026-10-26; boxed `VistaBlock` switch) with «Cifras» at `?vista=cifras`; `/atlas`, `/network*` etc. redirect there — build links with `cieloHref()` from `lib/vista.ts`.

Specialized agents live in `.claude/agents/` (data-quality-guardian, schema-architect, risk-model-engineer, network-detective, viz-storyteller, api-designer, frontend-architect, design-visionary, ground-truth-analyst).

*RUBLI — open-source procurement intelligence for Mexican federal contracting data.*
