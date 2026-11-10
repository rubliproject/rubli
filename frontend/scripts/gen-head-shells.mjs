/**
 * gen-head-shells.mjs — per-page <head> for crawlers and link previews (joker review 09).
 *
 * Runs as `postbuild`. The SPA ships one dist/index.html whose head describes the
 * homepage, so a shared story link previews as the generic card and its canonical
 * points at "/". For each story (lib/story-index.ts) and for /datos this writes
 * dist/<path>.html: the SAME document (same bundle, same body) with that page's
 * title, description, og/twitter tags, canonical and JSON-LD. nginx serves
 * /stories/<slug> and /datos from these files (location in nginx.conf); the app
 * boots exactly as from index.html, and routeMeta keeps retitling on navigation.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadModules } from './registry-bridge.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const ORIGIN = 'https://rubli.xyz'
// the current release (frontend/src/lib/constants.ts DATASET_DOI / DATASET_VERSION)
const DOI_URL = 'https://doi.org/10.5281/zenodo.23694198'
const ZENODO_FILES = 'https://zenodo.org/records/23694198/files'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,;:—-]+$/, '') + '…')

/** Replace the content of one tag (meta by name/property, title, canonical). Throws if absent. */
function setTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`gen-head-shells: tag not found: ${pattern}`)
  return html.replace(pattern, replacement)
}

function shell(base, { title, description, url, type, jsonLd, noindex }) {
  let h = base
  if (noindex) h = setTag(h, /<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex" />')
  h = setTag(h, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  h = setTag(h, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
  h = setTag(h, /<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${type}" />`)
  h = setTag(h, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`)
  h = setTag(h, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(description)}" />`)
  h = setTag(h, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`)
  h = setTag(h, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(description)}" />`)
  // JSON-LD is data, not script: CSP script-src does not apply to it.
  const ld = JSON.stringify(jsonLd).replace(/</g, '\\u003c')
  // index.html carries no canonical/og:url (it serves every route); each shell adds its own.
  return h.replace('</head>', `    <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n`
    + `    <script type="application/ld+json">${ld}</script>\n  </head>`)
}

const PUBLISHER = { '@type': 'Organization', name: 'RUBLI', url: ORIGIN + '/' }

const [{ STORY_HEADLINES: ALL_STORIES }, { ROUTE_META, SITE_ORIGIN, NOINDEX_PREFIXES }, { STORIES_LIVE }] = await loadModules(['/src/lib/story-index.ts', '/src/lib/seo/routeMeta.ts', '/src/lib/constants.ts'])
// stories off (STORIES_LIVE=false): no article shells, so /stories/* falls through to the SPA, which redirects to /
const STORY_HEADLINES = STORIES_LIVE ? ALL_STORIES : []
const base = await fs.readFile(path.join(dist, 'index.html'), 'utf8')

const pages = STORY_HEADLINES.map((s) => {
  const title = `${s.headline_es ?? s.headline} · RUBLI`
  const description = clip(s.subheadline_es ?? s.subheadline, 160)
  const url = `${ORIGIN}/stories/${s.slug}`
  return {
    file: path.join(dist, 'stories', `${s.slug}.html`),
    title, description, url, type: 'article',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'NewsArticle',
      headline: (s.headline_es ?? s.headline).slice(0, 110),
      alternativeHeadline: s.headline,
      description, inLanguage: 'es-MX', url, mainEntityOfPage: url,
      image: `${ORIGIN}/og/rubli-card.png`,
      author: PUBLISHER, publisher: PUBLISHER,
    },
  }
})

pages.push({
  file: path.join(dist, 'datos.html'),
  title: 'Los Datos · RUBLI — contratos federales de México, 2002–2026',
  description: 'Descarga el conjunto de datos de RUBLI: más de 3 millones de contratos federales de México (CompraNet y ComprasMX, 2002–2026) con indicadores de riesgo. Zenodo; la versión 2026.11 se publicó con licencia CC BY 4.0.',
  url: `${ORIGIN}/datos`, type: 'website',
  jsonLd: {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: 'RUBLI — Mexican Federal Procurement Dataset (2002–2026)',
    description: 'Contratos de la administración pública federal de México publicados en CompraNet (2002 a septiembre de 2025) y en los datos abiertos de ComprasMX (hasta octubre de 2026), normalizados, con proveedores, instituciones, sectores e indicadores de riesgo del modelo RUBLI. Versión 2026.11.',
    identifier: DOI_URL, url: `${ORIGIN}/datos`, sameAs: DOI_URL,
    // JSON-LD describes the 2026.11 Zenodo record, which was published CC BY 4.0; RUBLI's own licence going forward is CC BY-NC 4.0 (owner 2026-10-28)
    version: '2026.11', datePublished: '2026-10-27', license: 'https://creativecommons.org/licenses/by/4.0/',
    // The Zenodo record's files (SEO audit 2026-10-26 fix #6: Dataset rich results want a distribution).
    distribution: [
      { '@type': 'DataDownload', name: 'csv.zip', encodingFormat: 'application/zip', contentUrl: `${ZENODO_FILES}/csv.zip?download=1` },
      { '@type': 'DataDownload', name: 'RUBLI_PUBLIC.db', encodingFormat: 'application/vnd.sqlite3', contentUrl: `${ZENODO_FILES}/RUBLI_PUBLIC.db?download=1` },
      { '@type': 'DataDownload', name: 'RUBLI_PUBLIC_lite.db', encodingFormat: 'application/vnd.sqlite3', contentUrl: `${ZENODO_FILES}/RUBLI_PUBLIC_lite.db?download=1` },
    ],
    isBasedOn: 'CompraNet — Secretaría de Hacienda y Crédito Público (registro federal de contrataciones, 2002–2025) y datos abiertos de ComprasMX (2025–2026)',
    temporalCoverage: '2002/2026', spatialCoverage: { '@type': 'Place', name: 'México' },
    inLanguage: ['es', 'en'], isAccessibleForFree: true,
    keywords: ['contratos gubernamentales', 'compras públicas', 'adjudicación directa', 'CompraNet', 'México', 'procurement'],
    creator: PUBLISHER, publisher: PUBLISHER,
  },
})

// Every single-segment page in the route registry (TOC, OFF_NAV, legal) gets its own head too:
// without it a shared /sectors link previews as the homepage, canonical "/" (SEO audit 2026-10-26).
// Spanish first: the static document is lang="es". /datos keeps its richer Dataset block above.
let routeShells = 0
for (const [route, meta] of Object.entries(ROUTE_META)) {
  if (!/^\/[a-z0-9-]+$/.test(route) || route === '/datos') continue
  const url = `${SITE_ORIGIN}${route}`
  pages.push({
    file: path.join(dist, `${route.slice(1)}.html`),
    title: meta.es.title, description: meta.es.description, url, type: 'website',
    noindex: NOINDEX_PREFIXES.some((p) => route.startsWith(p)),
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: meta.es.title, description: meta.es.description, url, inLanguage: 'es-MX', isPartOf: { '@type': 'WebSite', name: 'RUBLI', url: ORIGIN + '/' }, publisher: PUBLISHER },
  })
  routeShells++
}

for (const p of pages) {
  await fs.mkdir(path.dirname(p.file), { recursive: true })
  await fs.writeFile(p.file, shell(base, p))
}
// Real 404s (press fact-check 2026-10-30): the route patterns of App.tsx become an nginx map, so a
// path no route matches gets HTTP 404 + dist/404.html (same SPA document, robots noindex; the app
// still boots and renders NotFound). `:param` matches one segment; ids of the three entity dossiers
// are numeric. A pattern this misses only costs a 404 status: the 404 body is the SPA, so the page
// still renders. The Dockerfile moves known-routes.map to /etc/nginx/ (nginx.conf includes it).
const app = await fs.readFile(path.join(root, 'src', 'App.tsx'), 'utf8')
const routes = [...new Set([...app.matchAll(/\bpath="([^"*]+)"/g)].map((m) => m[1].replace(/^\/+|\/+$/g, '')))].filter(Boolean).sort()
if (routes.length < 50) throw new Error(`gen-head-shells: only ${routes.length} route paths found in App.tsx`)
const toRe = (r) => r.split('/').map((seg) => {
  if (!/^:?[a-z0-9_-]+$/i.test(seg)) throw new Error(`gen-head-shells: unsupported route segment ${seg} in ${r}`)
  if (!seg.startsWith(':')) return seg
  return seg === ':id' && /^(print\/)?(vendors|contracts|institutions)\//.test(r) ? '[0-9]+' : '[^/]+'
}).join('/')
await fs.writeFile(path.join(dist, 'known-routes.map'),
  '# generated by scripts/gen-head-shells.mjs from src/App.tsx — do not edit\n/ 1;\n'
  + routes.map((r) => `"~*^/${toRe(r)}/?$" 1;`).join('\n') + '\n')
await fs.writeFile(path.join(dist, '404.html'), setTag(
  setTag(base, /<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex" />'),
  /<title>[^<]*<\/title>/, '<title>Página no encontrada · RUBLI</title>'))

console.log(`404: ${routes.length} route patterns → known-routes.map`)
console.log(`head shells: ${pages.length} (${STORY_HEADLINES.length} stories + /datos + ${routeShells} routes)`)
