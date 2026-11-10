import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { FALLO_LIVE, FILMS_LIVE, GAP_LIVE, RASTRO_LIVE, STORIES_LIVE } from '@/lib/constants'
import { TOC, TOC_SECTIONS, OFF_NAV, toRoman, numeralOf, entryFor, folioFor, nextFront, FRONT_PAGES } from './toc'

const SRC = resolve(__dirname, '../..')

// The regroup table; /gap rides GAP_LIVE (retired 2026-10-27) /gallery FILMS_LIVE (hidden 2026-10-29), /rastro RASTRO_LIVE and /antes-del-fallo FALLO_LIVE (hidden 2026-11-04), so every numeral after them follows the flags.
const ROWS = [
  'story /', 'story /mapa', 'story /administrations', ...(GAP_LIVE ? ['story /gap'] : []), 'story /captura', 'story /gasto-a-ciegas', 'story /cases', ...(FILMS_LIVE ? ['story /gallery'] : []),
  'money /categories', 'money /institutions', ...(RASTRO_LIVE ? ['money /rastro'] : []),
  'instrument /aria', 'instrument /contracts', ...(FALLO_LIVE ? ['instrument /antes-del-fallo'] : []), 'instrument /arranque',
  'trust /methodology', 'trust /datos', 'trust /press',
]
const N = (href: string) => toRoman(ROWS.findIndex((r) => r.endsWith(` ${href}`)) + 1)

describe('toRoman', () => {
  it('converts the registry range and beyond', () => {
    expect([1, 4, 5, 9, 10, 14, 17, 40, 90].map(toRoman))
      .toEqual(['I', 'IV', 'V', 'IX', 'X', 'XIV', 'XVII', 'XL', 'XC'])
  })
})

describe('TOC uniqueness (face spec § 2, regroup 2026-10-05)', () => {
  it('numerals are unique, consecutive and equal toRoman(index + 1)', () => {
    expect(TOC).toHaveLength(ROWS.length)
    const numerals = TOC.map(numeralOf)
    expect(new Set(numerals).size).toBe(TOC.length)
    TOC.forEach((e, i) => expect(numeralOf(e)).toBe(toRoman(i + 1)))
  })

  it('pins the regroup table', () => {
    expect(TOC.map((e) => `${numeralOf(e)} ${e.section} ${e.href}`)).toEqual(ROWS.map((r, i) => `${toRoman(i + 1)} ${r}`))
    expect(TOC_SECTIONS).toEqual(['story', 'money', 'instrument', 'trust'])
    expect(TOC.filter((e) => e.phone).map(numeralOf)).toEqual(['/mapa', '/administrations', '/cases', '/aria'].map(N))
    expect(FRONT_PAGES.map(numeralOf)).toEqual(ROWS.filter((r) => r.startsWith('story ')).map((_, i) => toRoman(i + 1)))
  })

  it('every href resolves to its own entry; off-TOC routes are null', () => {
    for (const e of TOC) expect(entryFor(e.href)).toBe(e)
    expect(OFF_NAV.map((o) => o.href)).toEqual(STORIES_LIVE ? ['/journalists', '/sectors'] : ['/sectors'])
    for (const r of ['/settings', '/privacy', '/terms', '/no-such-page', '/explore/legacy', '/journalists', '/sectors', '/sectors/3']) {
      expect(folioFor(r)).toBeNull()
    }
  })

  it('matches by longest whole-segment prefix', () => {
    expect(folioFor('/gallery/x')).toBe(FILMS_LIVE ? N('/gallery') : null)
    expect(folioFor('/')).toBe('I')
    expect(folioFor('/institutions/251?tab=x')).toBe(N('/institutions'))
    expect(folioFor('/casesx')).toBeNull()
    expect(folioFor('/mapa')).toBe('II')
  })

  it('nextFront walks the fronts, hands VII to VIII and the index links to I', () => {
    expect(nextFront('/mapa')?.href).toBe('/administrations')
    expect(nextFront('/cases')?.href).toBe(FILMS_LIVE ? '/gallery' : '/categories')
    if (FILMS_LIVE) expect(nextFront('/gallery')?.href).toBe('/categories')
    expect(nextFront('/')?.href).toBe('/mapa')
    expect(nextFront('/sectors')?.href).toBe('/')
    if (STORIES_LIVE) expect(nextFront('/journalists')?.href).toBe('/')
    expect(nextFront('/atlas')).toBeNull()
    expect(nextFront('/settings')).toBeNull()
  })
})

// Typed page numerals. Exempt: the frozen PlateFrame render string, chapter
// folios inside a page, and the /print/* sources.
const EXEMPT = new Set([
  'components/atlas/PlateFrame.tsx',
  'pages/SectorProfile.tsx',
  'pages/VendorProfile.tsx',
  'pages/CategoryProfile.tsx',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('no typed page numerals', () => {
  it('no source outside the exempt list types Folio·<numeral>', () => {
    const hits: string[] = []
    for (const dir of ['pages', 'components', 'lib']) {
      for (const f of walk(join(SRC, dir))) {
        const rel = relative(SRC, f).replace(/\\/g, '/')
        if (EXEMPT.has(rel)) continue
        if (/(Folio|FOLIO)\s?·\s?[IVXLC]+\b/.test(stripComments(readFileSync(f, 'utf8')))) hits.push(rel)
      }
    }
    expect(hits).toEqual([])
  })

  // S2: the index pages adopted PageMasthead, so no page eyebrow prints «Folio·{…}» either.
  it('no source outside the exempt list prints a computed Folio·{…} eyebrow', () => {
    const hits: string[] = []
    for (const dir of ['pages', 'components', 'lib']) {
      for (const f of walk(join(SRC, dir))) {
        const rel = relative(SRC, f).replace(/\\/g, '/')
        if (EXEMPT.has(rel)) continue
        if (/(Folio|FOLIO)·\{/.test(stripComments(readFileSync(f, 'utf8')))) hits.push(rel)
      }
    }
    expect(hits).toEqual([])
  })
})
