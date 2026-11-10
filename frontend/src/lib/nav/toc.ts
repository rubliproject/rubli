/**
 * toc.ts — the one table of contents («EL ÍNDICE», face spec § 2).
 *
 * Every page numeral on the face is derived from an entry's position here by
 * `toRoman`; no page types a numeral. The sidebar, the top bar's running
 * head, the bottom nav, the masthead address slot and the page-prefixed plate
 * folios all read this array, so they cannot disagree.
 *
 * Rollbacks without touching consumers:
 *   - `folio` overrides an entry's printed numeral (the legacy-numeral table).
 *   - `icon` is carried but not rendered by the sidebar (the icon rollback).
 */
import { analysisApi } from '@/api/client'
import { FALLO_LIVE, FILMS_LIVE, GAP_LIVE, RASTRO_LIVE, STORIES_LIVE } from '@/lib/constants'

export type TocSection = 'story' | 'money' | 'instrument' | 'trust'

export interface TocEntry {
  /** Canonical route. `/` matches exactly; every other href also matches its sub-paths. */
  href: string
  /** `nav:toc.<key>` holds the shipped name (§ 12). */
  key: string
  /** Section head key: `nav:sections.<section>`. */
  section: TocSection
  /** One of the four phone bottom-nav destinations (§ 8). */
  phone?: boolean
  /** Which existing query feeds the row's count (§ 4). */
  count?: 'aria-t1' | 'cases'
  /** Printed-numeral override (rollback table). Defaults to `toRoman(index + 1)`. */
  folio?: string
  /** Lucide icon name; carried for the icon rollback, unrendered in the sidebar. */
  icon?: string
}

// The regroup (owner decision 2026-10-05): four groups, numbered rows (La Galería restored 2026-10-06; Sectores moved to OFF_NAV 2026-10-07;
// El Atlas folded into El Mapa as its Vínculos view and La Trama into that view 2026-10-08 — Casos takes the phone tab;
// the Portada joined as row I 2026-10-08; 2026-10-20 the Portada took `/` and El Mapa moved to `/mapa`).
export const TOC: readonly TocEntry[] = [
  { href: '/',                key: 'dashboard',       section: 'story',      icon: 'LayoutDashboard' },
  { href: '/mapa',            key: 'map',             section: 'story',      phone: true, icon: 'Map' },
  { href: '/administrations', key: 'administrations', section: 'story',      phone: true, icon: 'History' },
  ...(GAP_LIVE ? [{ href: '/gap', key: 'gap', section: 'story', icon: 'FileSearch' } as const] : []),
  { href: '/captura',         key: 'capture',         section: 'story',      icon: 'GitCompareArrows' },
  { href: '/gasto-a-ciegas',  key: 'noSeVe',           section: 'story',      icon: 'EyeOff' },
  { href: '/cases',           key: 'cases',           section: 'story',      phone: true, count: 'cases', icon: 'Library' },
  ...(FILMS_LIVE ? [{ href: '/gallery', key: 'gallery', section: 'story', icon: 'Clapperboard' } as const] : []),
  { href: '/categories',      key: 'categories',      section: 'money',      icon: 'Tag' },
  { href: '/institutions',    key: 'institutions',    section: 'money',      icon: 'Building2' },
  ...(RASTRO_LIVE ? [{ href: '/rastro', key: 'rastro', section: 'money', icon: 'Split' } as const] : []),
  { href: '/aria',            key: 'watchlist',       section: 'instrument', phone: true, count: 'aria-t1', icon: 'Shield' },
  { href: '/contracts',       key: 'archive',         section: 'instrument', icon: 'Archive' },
  ...(FALLO_LIVE ? [{ href: '/antes-del-fallo', key: 'fallo', section: 'instrument', icon: 'CalendarClock' } as const] : []),
  { href: '/arranque',        key: 'arranque',        section: 'instrument', icon: 'Rocket' },
  { href: '/methodology',     key: 'methodology',     section: 'trust',      icon: 'BookOpen' },
  { href: '/datos',           key: 'data',            section: 'trust',      icon: 'Database' },
  { href: '/press',           key: 'press',           section: 'trust',      icon: 'Megaphone' },
]

export const TOC_SECTIONS: readonly TocSection[] = ['story', 'money', 'instrument', 'trust']

/** Index links: real pages outside the numbered contents (address slot prints `RUBLI`). */
export const OFF_NAV: readonly Pick<TocEntry, 'href' | 'key' | 'icon'>[] = [
  ...(STORIES_LIVE ? [{ href: '/journalists', key: 'newsroom', icon: 'Newspaper' } as const] : []),
  // Out of the contents 2026-10-07 (owner): sectors are reached from El Mapa and the Atlas.
  { href: '/sectors',     key: 'sectors',   icon: 'BarChart3' },
]

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

export function toRoman(n: number): string {
  let out = ''
  let rest = Math.floor(n)
  for (const [v, s] of ROMAN) {
    while (rest >= v) { out += s; rest -= v }
  }
  return out
}

/** The printed numeral of a registry entry. */
export function numeralOf(entry: TocEntry): string {
  return entry.folio ?? toRoman(TOC.indexOf(entry) + 1)
}

/** Longest-prefix registry match on a whole path segment; `null` off-TOC. */
export function entryFor(pathname: string): TocEntry | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  let best: TocEntry | null = null
  for (const e of TOC) {
    const hit = e.href === '/'
      ? path === '/'
      : path === e.href || path.startsWith(e.href + '/')
    if (hit && (!best || e.href.length > best.href.length)) best = e
  }
  return best
}

/** The page numeral for a route (`/institutions` → `VIII`); `null` off-TOC. */
export function folioFor(pathname: string): string | null {
  const e = entryFor(pathname)
  return e ? numeralOf(e) : null
}

/** The front pages, I–V: the 'story' section. */
export const FRONT_PAGES: readonly TocEntry[] = TOC.filter((e) => e.section === 'story')

const onOffNav = (pathname: string): boolean => {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '')
  return OFF_NAV.some((o) => path === o.href || path.startsWith(o.href + '/'))
}

/** The page a front page's jump line points at (V → VI; an index link → I); `null` elsewhere. */
export function nextFront(pathname: string): TocEntry | null {
  const e = entryFor(pathname)
  if (e) return e.section === 'story' ? TOC[TOC.indexOf(e) + 1] ?? null : null
  return onOffNav(pathname) ? TOC[0] : null
}

/**
 * The `/stats/data-quality` query, shared by the Header's DQ chip, the
 * sidebar footer and the edition line. Same key + same queryFn everywhere, so
 * react-query dedupes to one request (0 new calls).
 */
export const DATA_QUALITY_QUERY = {
  queryKey: ['data-quality'] as const,
  queryFn: () => analysisApi.getDataQuality(),
  staleTime: 60 * 60 * 1000, // 1 hour — quality metrics are very stable
  gcTime: 120 * 60 * 1000,
  retry: 0, // the endpoint can be expensive cold; never retry from chrome
  refetchOnWindowFocus: false,
  refetchOnMount: false,
}

/** `28 sep 2025` / `Sep 28, 2025` from the data-cut constant — never the reader's clock. */
// one formatter per language: building an Intl.DateTimeFormat per call cost ~100 ms on a phone on /aria (YELLOW 11-04)
const CUT_FMT = new Map<string, Intl.DateTimeFormat>()
export function formatCut(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  let f = CUT_FMT.get(loc)
  if (!f) CUT_FMT.set(loc, (f = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })))
  return f.format(Date.UTC(y, m - 1, d)).replace(/\./g, '')
}
