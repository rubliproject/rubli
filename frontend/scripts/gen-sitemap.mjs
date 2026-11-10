/**
 * gen-sitemap.mjs — write public/sitemap.xml from the route registries (launch S2).
 *
 * Runs as `prebuild`. Routes come from lib/nav/toc.ts (TOC + OFF_NAV),
 * lib/story-content.ts (STORIES), lib/constants.ts (SECTORS, PATTERN_COLORS)
 * via registry-bridge.mjs — nothing is listed by hand except the legal pages.
 * Paths disallowed by public/robots.txt are dropped. No hreflang: the app picks
 * its language from localStorage / the browser, not from the URL.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadModules } from './registry-bridge.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://rubli.xyz'
const LEGAL = ['/privacy', '/terms']

const [toc, stories, constants, { NOINDEX_PREFIXES }] = await loadModules([
  '/src/lib/nav/toc.ts', '/src/lib/story-content.ts', '/src/lib/constants.ts', '/src/lib/seo/routeMeta.ts',
])

const robots = await fs.readFile(path.join(root, 'public', 'robots.txt'), 'utf8')
// noindex pages are crawlable but never listed (launch audit 2026-10-28 S4)
const disallow = [...[...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]), ...NOINDEX_PREFIXES]
const allowed = (p) => !disallow.some((d) => p.startsWith(d))

// Stories: the file's last commit date (a checkout resets mtime); mtime where
// there is no git, e.g. inside the Docker build context.
const storyFile = path.join(root, 'src', 'lib', 'story-content.ts')
let storyMod
try {
  storyMod = execFileSync('git', ['log', '-1', '--format=%cs', '--', storyFile], { cwd: root, encoding: 'utf8' }).trim()
} catch { /* no git */ }
if (!/^\d{4}-\d{2}-\d{2}$/.test(storyMod ?? '')) storyMod = (await fs.stat(storyFile)).mtime.toISOString().slice(0, 10)
const cut = constants.DATA_CUT_ISO

// Institution dossiers (public bodies — SEO audit 2026-10-26): the federal register from the live API.
// Best effort: offline (e.g. a build without network) the sitemap simply omits them.
async function institutionIds() {
  const ids = []
  try {
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${ORIGIN}/api/v1/institutions?per_page=100&page=${page}`, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      ids.push(...d.data.map((i) => i.id))
      if (page >= d.pagination.total_pages) break
    }
  } catch (e) {
    console.warn(`sitemap: institutions skipped (${e.message})`)
    return []
  }
  return ids
}

const entries = [
  ...[...toc.TOC, ...toc.OFF_NAV, ...LEGAL.map((href) => ({ href }))].map((e) => [e.href, cut]),
  ...(constants.STORIES_LIVE ? stories.STORIES.map((s) => [`/stories/${s.slug}`, storyMod]) : []),
  ...constants.SECTORS.map((s) => [`/sectors/${s.id}`, cut]),
  ...Object.keys(constants.PATTERN_COLORS).map((code) => [`/patterns/${code}`, cut]),
  ...(await institutionIds()).map((id) => [`/institutions/${id}`, cut]),
]

const seen = new Set()
const urls = entries.filter(([p]) => allowed(p) && !seen.has(p) && seen.add(p))
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(([p, lastmod]) => `  <url><loc>${ORIGIN}${p === '/' ? '/' : p}</loc><lastmod>${lastmod}</lastmod></url>`),
  '</urlset>',
  '',
].join('\n')

await fs.writeFile(path.join(root, 'public', 'sitemap.xml'), xml)
console.log(`sitemap.xml: ${urls.length} URLs (${entries.length - urls.length} dropped by robots/dedupe)`)
