# Security hardening — application layer, 2026-10-28

Owner brief: «implement security measures so that we don't get hacked».
Scope: the code in this repo (FastAPI backend, nginx frontend container, Caddy edge,
dependencies, git history). The server itself (SSH, firewall, job containers, backups)
is the lead's track — listed in § 7.

Request path: **Caddy** (TLS, edge headers) → **nginx** in `rubli-frontend` (SPA, CSP,
rate limits, API cache) → **gunicorn/uvicorn** in `rubli-backend` (uid 100) → SQLite.

---

## § 1 Dependencies

| Check | Before | After |
|---|---|---|
| `npm audit --omit=dev` (frontend) | 2 high: `follow-redirects` 1.16.0 (credential headers leak on cross-origin redirect), `source-map-js` 1.2.1 (event-loop DoS) | **0** — lockfile-only bumps to 1.16.2 / 1.2.2 |
| `pip-audit -r backend/requirements-api.txt` (the image's file, all pins) | — | **no known vulnerabilities** |
| `pip-audit` on the full 43-package manylinux resolution of that file (transitives: starlette 1.10.0, urllib3 2.8.0, h11 0.16.0, anyio 4.15.1 …) | — | **no known vulnerabilities** |

Not bumpable / not audited: `backend/requirements.txt` and `requirements-scripts.txt` use
`>=` ranges (dev + pipeline machines, never in the API image), so pip-audit cannot pin them.
The owner's local Python carries old packages (tornado 6.4.2, urllib3 1.26.20, werkzeug
3.0.6, weasyprint 68.1, ujson 5.11.0) — local only, not shipped; upgrade when convenient.

## § 2 Secrets

- **gitleaks 8.21.2 over all 4,864 commits** (`gitleaks detect --source .`, redacted):
  21 hits, all `generic-api-key` false positives — localStorage key names
  (`PINS_KEY`, `RECENT_KEY`, … in `frontend/src`) and `SITE_KEY` in
  `_comprasmx/cnet_sign.py` / `backend/scripts/comprasmx/cnet_sign.py` (commits
  `e1600142`, `c7bbffe2`), which is the public site key lifted from ComprasMX's own
  JavaScript bundle, not a credential.
- Regex sweep of history (all refs, pickaxe `-G`) for Zenodo tokens, `sk-ant-` keys, PEM
  private keys, and literal `RUBLI_JWT_SECRET=` / `RUBLI_WRITE_KEY=` values: one hit,
  commit `992df59f` (2026-04-08) — `.env.prod.example` with a `change-me`-style
  placeholder for `RUBLI_WRITE_KEY`, not a real key.
- Files ever added that look secret-shaped: only `*.example` templates
  (`.env.prod.example`, `backend/.env.example`, `frontend/.env.example`).
- **Nothing to rotate.**
- `.gitignore` now covers every `.env*` (except `*.example`) at any depth, `*.pem`,
  `*.key`, `*.p12`, `*.pfx`, SSH keys, `*.sqlite*`, `*.db-journal`, compressed DB dumps,
  and any `backups/` directory.

## § 3 HTTP headers

| Header | Where | Value |
|---|---|---|
| Content-Security-Policy | nginx (`$csp`) | `script-src 'self'` — **`'unsafe-inline'` removed**; `form-action 'self'` added. The built pages carry no executable inline script: the only inline `<script>` blocks are `type="application/ld+json"` (index.html + `scripts/gen-head-shells.mjs`), which are data and not governed by `script-src`; no inline event handlers. `style-src` keeps `'unsafe-inline'` (React `style={{}}`, chart libs). |
| Strict-Transport-Security | Caddy | `max-age=31536000; includeSubDomains; preload` on `rubli.xyz` **and now on the `www` redirect** (an hstspreload.org requirement). |
| Permissions-Policy | Caddy | geolocation, microphone, camera, payment, usb, serial, bluetooth, browsing-topics all `()`. |
| Cross-Origin-Opener-Policy | Caddy | `same-origin` (new). |
| Referrer-Policy | Caddy + nginx + FastAPI | `strict-origin-when-cross-origin` (already). |
| X-Frame-Options / X-Content-Type-Options | Caddy (`DENY`, wins — the `-Server` line makes Caddy's header block deferred) + nginx | already. |

**Found while verifying:** `rollup-plugin-visualizer` wrote `dist/stats.html`, so prod
serves `https://rubli.xyz/stats.html` (200, 2.4 MB) — a treemap of every source module
path, with an inline `<script>` (it would break under the new CSP anyway). Now written to
`frontend/bundle-stats.html` (gitignored), outside the image.

Verified: `npm run build` + `gen-head-shells.mjs` → 21 HTML files whose only inline
scripts are `application/ld+json`; served with the nginx `$csp` and loaded headless on 10
routes (/, /?vista=vinculos, /aria, /sectors, /methodology, /vendors/1, /contracts, a
story, /datos, /gap): all rendered, 0 CSP violations, 0 page errors.

HSTS preload: ready (≥ 1 year, includeSubDomains, preload, HTTP→HTTPS redirect on the
apex and `:80`, HSTS on the `www` redirect). Submitting to hstspreload.org is an owner
decision — it is hard to undo and binds every future subdomain to HTTPS.

## § 4 API

- **Rate limits cover every `/api/` route.** `location /api/` (prefix) catches all paths,
  including `/stats/data-cut`, `/recent-activity`, `/sexenio-actual`, `/executive/*`,
  `/search`: `api_limit` 600 r/min per IP, burst 100. `/api/v1/issues` keeps its own
  1 r/min. The backend's slowapi default (100/min, per real client IP) sits behind it.
- **New `heavy_limit` zone**, 30 r/min per IP, burst 30, applied *in addition* for:
  `/api/v1/search`, `/api/v1/institutions/search`, `/api/v1/export/*` (CSV/Excel),
  `/api/v1/dossier/*` (ZIP bundles), `/api/v1/reports/*`, `/api/v1/watchlist/folders/export/*`.
  Implemented as a `map $uri $heavy_key` → empty key = not counted, so no location
  block is duplicated.
- **Body size limit:** `client_max_body_size 128k` (the API takes only small JSON; no
  uploads). Larger → 413 at nginx.
- **Corrupt precomputed JSON → 503.** One `JSONDecodeError` handler in
  `register_error_handlers` covers all ~127 `json.loads` sites over stored rows (none parse
  request input). Before: 422 «Invalid input». Body:
  `{"error":{"code":"DATA_UNAVAILABLE","message":"This data is temporarily unavailable."}}`.
- **No stack traces:** the global `Exception` handler returns a generic 500; no router
  puts `str(e)` in an HTTP response (grep for `detail=str(e)`, `{e}` in details,
  `traceback.format`: 0 hits).
- **SQL:** the 41 backend files touched since 2026-10-20 hold ~270 f-string SQL
  statements. Every interpolation is a whitelisted fragment (sort column/direction from a
  fixed map or `pattern="^(asc|desc)$"`), a `?` placeholder list, or a module constant;
  all values are bound parameters. No injection found.

## § 5 Backend process

- `TrustedHostMiddleware` when `RUBLI_ENV=production`: `rubli.xyz, www.rubli.xyz,
  localhost, 127.0.0.1, backend` (override: `ALLOWED_HOSTS`). Forged Host → 400.
- `/docs`, `/redoc`, `/openapi.json`: off unless `ENABLE_DOCS=true` (was already so;
  nginx also denies them to non-loopback). Now pinned by a test.
- gunicorn `--forwarded-allow-ips 127.0.0.1` on the command line: uvicorn rewrites the
  client address only for loopback peers, so `FORWARDED_ALLOW_IPS=*` in an env can't
  widen it. Rate-limit keys still use the real visitor IP via `dependencies.client_ip`
  (XFF trusted only from a private docker-bridge peer — the frontend container).

## § 6 Deploy notes (for the lead)

Changed deploy files: `frontend/nginx.conf`, `Caddyfile`, `backend/Dockerfile`. No
compose change. The normal `deploy-safe.sh` rebuilds both images; **Caddy only reads the
Caddyfile on (re)start/reload** — after deploy run
`docker exec rubli-caddy caddy reload --config /etc/caddy/Caddyfile`.

Before or right after deploy:

```bash
docker exec rubli-frontend nginx -t                       # syntax ok / test is successful
```

Verify:

```bash
# CSP without unsafe-inline in script-src; form-action present
curl -sI https://rubli.xyz/ | grep -i content-security-policy
# COOP + Permissions-Policy + HSTS on apex
curl -sI https://rubli.xyz/ | grep -iE 'cross-origin-opener|permissions-policy|strict-transport'
# HSTS on the www redirect (preload requirement)
curl -sI https://www.rubli.xyz/ | grep -iE '^(HTTP|location|strict-transport)'
# Host allow-list: a forged Host reaching the backend → 400 (via nginx, which forwards Host)
docker exec rubli-frontend wget -qSO- --header 'Host: evil.example' http://backend:8001/health 2>&1 | head -1   # 400
curl -s -o /dev/null -w '%{http_code}\n' https://rubli.xyz/api/v1/health    # 200
# Bundle visualizer gone (SPA shell, not the 2.4 MB treemap)
curl -s https://rubli.xyz/stats.html | grep -c rollup-plugin-visualizer     # 0
# Docs hidden
curl -s -o /dev/null -w '%{http_code}\n' https://rubli.xyz/openapi.json    # 403 (nginx) — and 404 from the app
# Body size: >128 KB → 413
head -c 200000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data-binary @- https://rubli.xyz/api/v1/feedback   # 413
# heavy_limit: ~31 searches fired back-to-back → the rest 429 (burst 30, refill 1 per 2 s)
for i in $(seq 1 45); do curl -s -o /dev/null -w '%{http_code} ' "https://rubli.xyz/api/v1/search?q=pemex$i"; done; echo   # 200s then 429s
```

Then open https://rubli.xyz/, `/aria`, a vendor dossier and a story in a browser with
DevTools → Console: **no "Refused to execute inline script" / CSP errors**. Rollback for
CSP alone: put `'unsafe-inline'` back in `$csp` and redeploy the frontend.

## § 7 Left for the server (lead's track)

- SSH: key-only, no root login, fail2ban/sshguard (726 brute-force attempts/day observed).
- Job containers (`backup-cron` runs as `0:0`; crawler / ARIA job containers) → non-root
  users, read-only root FS where possible.
- Crawler systemd units: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`,
  `ReadWritePaths=` only the DB dir.
- Offsite backups (encrypted, tested restore) — the 3-nightly local rotation is not a
  backup against disk loss or compromise.
- Alerting on 5xx rate and on backup failure.
- Unattended security upgrades for the host OS; Docker base images re-pulled by digest
  monthly.

## § 8 Monthly checklist

1. `cd frontend && npm audit --omit=dev` → 0 high/critical; fix with
   `npm audit fix --package-lock-only --omit=dev`, then `npx tsc --noEmit -p tsconfig.app.json && npm run build`.
2. `pip-audit -r backend/requirements-api.txt` → clean; bump a pin one at a time with the test suite.
3. Bump the pinned image digests (python:3.11-slim, node:22-alpine, nginx:alpine, caddy, sqlite3) in `Dockerfile`s / compose.
4. `gitleaks detect --source . --redact` → only the known false positives in § 2.
5. Headers: run the § 6 curl block; check https://securityheaders.com/?q=rubli.xyz (target A+ apart from style-src).
6. `docker exec rubli-frontend nginx -t`; scan nginx logs for 429 spikes (`grep ' 429 '`) and 413s.
7. Review `RUBLI_ADMIN_EMAILS`, rotate `RUBLI_JWT_SECRET` / `RUBLI_WRITE_KEY` if anyone with access left.
8. Restore one backup to a scratch dir and `PRAGMA quick_check`.
9. SSH auth log: failed-login count and any successful login from an unknown IP.
