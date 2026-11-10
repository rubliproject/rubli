# RUBLI — Launch plan, October 2026

**Written:** 2026-10-03 (Fable) · **Target:** public launch before 2026-10-31 · **State today:** prod live at rubli.xyz, all CI workflows green, Atlas rebuilt (S1–S5 + E), frontend refinement weekend complete (lining, motion, lint, 16-tab sweep, shared components). The user: "I want to launch by this month. It's achievable."

Owner legend: **U** = only the user can do it · **F/O** = Fable plans and judges, Opus executes.

## 1 · Design work still in flight (F/O) — the user's current mandate
| # | Item | Status | Ship by |
|---|---|---|---|
| L1 | **One masthead system + sidebar + five front pages** (DESIGNUS `platform-face-2026-10-03`, 8 header grammars → ≤3 archetypes) | panel running → spec → 3 executor sessions | Oct 8 |
| L2 | **Atlas instruments / views / navigation** (DESIGNUS `atlas-instruments-2026-10-03`) | brief written; panel after L1's judge → 3 sessions | Oct 14 |
| L3 | Per-page header adoption QA (25 pages, EN/ES, 1440/390) + lining census + PARALLAX probe | part of L1 sessions 2–3 | Oct 9 |
| L4 | Weekend backlog leftovers: /gap 3-line clamps, Atlas 15 px sky labels (layout contract), 14 canvas font literals, limitations impact grades (**U** to grade the 15 rows) | docs/weekend/TRACK-D4 + TRACK-EF | Oct 12 |

## 2 · Pre-publication blockers (from `docs/PREPUB_AUDIT_2026-09-24.md`, status 2026-09-30 + today)
| # | Item | Owner | Status / action |
|---|---|---|---|
| P0-3 | Operator identity: pseudonymous repo cut-over (old repos private, live links removed) — **remaining: push the clean repo as the public remote** | **U** (gh login) + F/O | Prepare the orphan-squashed tree; the user pushes; then repoint README/press/MODEL_CARD links |
| P1-M | Model honesty: AUC 0.656 forward / 0.733 in-sample disclosed; label provenance 69 % model-discovery disclosed; training-set count now computed (1,399 on record at training) | done as disclosure; **v0.9 retrain is NOT a launch blocker** — launch with the disclosed v0.8.5 | — |
| P1-X | Open dataset: export run (`export_public_dataset.py`), datasheet (`/dataset-datasheet` skill), model card refresh | F/O | Run the export against the deploy DB after the final label state; publish under `/dataset` with the datasheet; Oct 20 |
| P1-I | `investigation_dossiers` content review (LLM narratives, templated prompts, stubs — badges exist) | **U** reads; F/O fixes copy | Oct 18 |
| P1-D | 179K Structure-B rows with NULL `contract_month`; D2 NULL-id contracts fixed | F/O | Disclose on /methodology data section if not backfilled; Oct 15 |
| Sec | Write key rotated + admin allow-list + JWT guards live (`ce643f57`); HTML carries no key | done | re-verify on launch day |

## 3 · Product surface readiness (F/O unless noted)
| # | Item | Evidence today | Action | By |
|---|---|---|---|---|
| S1 | Social cards | `og:image` = `/favicon.svg`; no per-page OG | Real 1200×630 OG card (folio plate with the edition strip), per-route title/description via a tiny route meta map; `twitter:image` | Oct 10 |
| S2 | Sitemap | none in `frontend/public/` | Generate `sitemap.xml` (static routes + 13 stories + top dossiers) in the build; `robots.txt` exists | Oct 10 |
| S3 | Lighthouse | workflow exists, no runs recorded | Run on `/`, `/dashboard`, `/atlas`, `/sectors`, a story; budget: LCP ≤ 2.5 s, CLS ≤ 0.1 (already ≤ 0.06), TBT ≤ 300 ms | Oct 12 |
| S4 | Error tracking | Sentry init present in `main.tsx` (verify DSN only in prod env, PII scrubbing on) | Confirm release tagging with BUILD_ID | Oct 12 |
| S5 | Analytics | none (grep: no plausible/umami/gtag) | Decide: privacy-first (Plausible/Umami self-hosted) or none; **U** decides | Oct 8 |
| S6 | Legal | Privacy.tsx, Terms.tsx, Press.tsx exist; ARCO contact pseudonymous since Sep 30 | Re-read after L1 (masthead); confirm contact channel | Oct 15 |
| S7 | Intro / about the edition | `/intro` duplicates `/` | Resolved by L1 (the front-page designer decides) | Oct 8 |
| S8 | 404 / error / offline states | unverified | Probe the 404 page, API-down state ("cifra no disponible" pattern), slow network | Oct 12 |
| S9 | Accessibility pass | probe 0 sub-10px/clipped/raw-hex; focus rings global | One screen-reader walk of the 5 front pages + a dossier (NVDA), landmarks, skip link | Oct 16 |
| S10 | Phone QA on real hardware | emulated only | **U** on an iPhone + an Android: El Mapa, Dashboard, Atlas Descenso, a story, La Cola | Oct 18 |

## 4 · Operations
| # | Item | Action | By |
|---|---|---|---|
| O1 | Deploys | push-to-main auto-deploys (deploy.yml); precompute after any label change; `deploy-safe.sh` redundant | document in README (done in the skill) |
| O2 | Backups | `rubli-backup-cron` healthy; offsite script exists | verify one restore of `RUBLI_DEPLOY.db` from the offsite copy | Oct 14 |
| O3 | Capacity | 5.4 GB DB, 6 workers, load ~0.2 idle; heavy endpoints cached; `amount-histogram` single-flight guard still missing | add the guard; cold-start warmer elected once | Oct 14 |
| O4 | Monitoring | health endpoint + visual-review cron | uptime ping + alert to the user's inbox | Oct 14 |
| O5 | Domain / TLS | rubli.xyz via Caddy | confirm HSTS, www redirect, cert renewal | Oct 10 |
| O6 | Launch freeze | last feature push Oct 24; Oct 25–30 fixes only; Oct 31 announce | — |

## 5 · Communications (U with F/O support)
Press kit (`/press`, `docs/press/*`) refreshed with the honest pitch matrix (CLAUDE.md § Honest pitch), the datasheet and model card linked, a launch note for the Newsroom (what RUBLI is, what it is not, how to report an issue), embargo list, social cards from S1.

## 6 · Order of work from here
1. L1 panel → approval → sessions 1–3 (this week).
2. L2 Atlas instruments panel → sessions (next week), in parallel with S1–S3, O2–O5 small items.
3. P1-X dataset export + datasheet, P1-D disclosure, S8–S9 (week of Oct 13).
4. **U:** P0-3 push, S5 analytics decision, S10 real-device QA, P1-I review, L4 impact grades, comms.
5. Freeze Oct 24 · launch Oct 31.
