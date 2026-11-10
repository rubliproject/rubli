import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOC, OFF_NAV } from '@/lib/nav/toc'
import { STORIES } from '@/lib/story-content'
import { DEFAULT_META, MAX_DESCRIPTION, MAX_TITLE, ROUTE_META, clip, metaFor } from './routeMeta'

const LANGS = ['es', 'en'] as const

describe('routeMeta', () => {
  it('covers every TOC / OFF_NAV href, every story slug and the legal pages', () => {
    const hrefs = [
      ...TOC.map((e) => e.href),
      ...OFF_NAV.map((e) => e.href),
      ...STORIES.map((s) => `/stories/${s.slug}`),
      '/privacy', '/terms',
    ]
    for (const h of hrefs) expect(ROUTE_META[h], h).toBeDefined()
  })

  it('titles ≤ 60 chars, descriptions 70–160 chars, in both languages', () => {
    for (const [href, bi] of [...Object.entries(ROUTE_META), ['(default)', DEFAULT_META] as const]) {
      for (const L of LANGS) {
        const { title, description } = bi[L]
        expect(title.length, `${href} ${L} title «${title}»`).toBeLessThanOrEqual(MAX_TITLE)
        expect(description.length, `${href} ${L} description`).toBeGreaterThanOrEqual(70)
        expect(description.length, `${href} ${L} description`).toBeLessThanOrEqual(MAX_DESCRIPTION)
      }
    }
  })

  it('never says «probability of corruption»', () => {
    const all = JSON.stringify(ROUTE_META).toLowerCase()
    expect(all).not.toMatch(/probab\w* (of|de) corrup/)
  })

  it('index.html carries the same default title and description', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')
    expect(html).toContain(`<title>${DEFAULT_META.es.title}</title>`)
    expect(html).toContain(`name="description" content="${DEFAULT_META.es.description}"`)
  })

  it('dossiers take the entity name and the parent description; off-map routes the defaults', () => {
    const m = metaFor('/institutions/42', 'es', 'Instituto Mexicano del Seguro Social')
    expect(m.title).toBe('Instituto Mexicano del Seguro Social · RUBLI')
    expect(m.description).toBe(ROUTE_META['/institutions'].es.description)
    expect(metaFor('/sectors/3/', 'en')).toEqual(ROUTE_META['/sectors'].en)
    expect(metaFor('/vendors/29277', 'es')).toEqual(DEFAULT_META.es)
  })

  it('clip cuts at a word and stays within the budget', () => {
    expect(clip('uno dos tres cuatro', 12)).toBe('uno dos…')
    expect(clip('corto', 12)).toBe('corto')
  })
})
