# Production audit — rubli.xyz, 2026-10-26 (launch Tue Nov 17)

**Production audit: 68/100, risky.** The app surface is sound: auth on writes, rate limits, headers, no secrets in the bundle. Operations are the gap: no backup off the server, no alerting (today's 28-minute DB outage was caught by a person, not a monitor), no CI, and one public endpoint can occupy a worker for 60 s.

## Blockers (fix before Nov 17)
1. **Offsite backups: none.** Every copy sits on the one VPS disk: two verified backups from 2026-10-26 plus `pre_cmx_v092`. `scripts/offsite-backup.sh` exists but no target is configured and no cron runs it. Owner picks B2 / R2 / Drive → configure → do one restore drill from offsite.
2. **No alerting.** `SENTRY_DSN` is empty in `.env.prod` (0 errors reported), and no uptime monitor is set up (the UptimeRobot item has been parked since 10-14). The 16:21–16:49Z incident (`.claude/ACTIVE_WORK.md`) would have gone unseen at night. Minimum: UptimeRobot on `/api/v1/health` every 5 min with email, plus the Sentry DSN.
3. **Slow public endpoint.** `GET /api/v1/analysis/amount-histogram?min=200000&max=400000&bucket=1000` takes over 60 s on prod: 406,142 rows read through `idx_c_amount`, each followed by a lookup into the 8 GB table. It's unauthenticated and parameterised (the 10-minute cache doesn't help a new key). A few requests can tie up the 6 workers. Only the hidden 300k story reads it. Fix: a covering index `contracts(amount_mxn, is_direct_award, contract_year, institution_id)` (prod schema change, so owner OK plus coordination with the deploy session), or turn the route off while `STORIES_LIVE=false`.

## High-value fixes
- **Ship the open branches** (none on main yet): `feat/hide-stories-launch` (stories off, bilingual copy unchanged, gates green), `fix/aria-counts-v092` (site copy T1 98→61, public P2 3,024→1,760), `fix/press-kit-verify`, `fix/export-2026-11` (PII mask for `comprasmx_contracts.proveedor`), `docs/dataset-2026-11`.
- **CI is dead** (GitHub Actions billing-blocked; every run fails in 3–4 s). Gates run only locally. Local backend suite: 40 passed, then the histogram test hung for over 600 s on the cold local DB (same root cause as blocker 3). Frontend: vitest 243 passed / 1 skipped, tsc 0, build OK.
- **robots.txt** still disallows `/vendors/`, `/aria/` and `/explore/`, so the vendor dossiers that journalists will cite never get indexed. Owner decision.
- **Data-dependent copy** keeps going stale after each rescore (the ARIA counts fixed tonight are one example). Read the live endpoints instead of hard-coding numbers (`/aria/stats.tier_counts` already exists).
- **Old DB rollback point** `/root/RUBLI_DEPLOY.backup_pre_cmx_v092_20261022.db` (6.8 GB): keep until the offsite copy exists.

## Checked and fine
- 28 write routes: 22 need admin or a user; 3 are auth (register/login 5/min); 2 are deliberate (anonymous issue form with field caps under the global 100/min per IP; read-only lasso); 1 is logout.
- Rate-limit key: `X-Forwarded-For` is trusted only from a private peer, and Caddy rewrites untrusted XFF.
- Headers on `/`: HSTS preload, a strict CSP (`frame-ancestors 'none'`, `object-src 'none'`), XFO DENY, nosniff, referrer and permissions policies. CORS doesn't echo a foreign origin.
- Errors don't leak internals (404 / 422 bodies are generic); `per_page` is capped at 100.
- Built bundle (`feat/hide-stories-launch`): no keys, tokens or RFC patterns.
- Health: `ok`, DB connected, `last_backup` populated (2026-10-26 17:37Z), WAL now on the host (deploy session, `e1b4ad49`).
- Code rollback: `deploy-safe.sh` prints the previous SHA; roll back by pushing a revert.

## Evidence missing
Real-device checks (owner), Lighthouse / Core Web Vitals, a load test (not run against prod), the offsite restore drill, the CompraNet / ComprasMX reuse terms for the dataset license.

## Next action
Owner: pick the offsite storage and sign up for UptimeRobot (about 15 minutes in total). Then decide blocker 3 (index vs turn the route off).
