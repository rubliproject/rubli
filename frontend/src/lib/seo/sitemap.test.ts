import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOC } from '@/lib/nav/toc'
import { STORIES } from '@/lib/story-content'
import { STORIES_LIVE } from '@/lib/constants'
import { NOINDEX_PREFIXES } from '@/lib/seo/routeMeta'

// public/sitemap.xml is written by scripts/gen-sitemap.mjs (npm prebuild).
const pub = resolve(__dirname, '../../../public')
const xml = readFileSync(resolve(pub, 'sitemap.xml'), 'utf8')
const disallow = [...readFileSync(resolve(pub, 'robots.txt'), 'utf8').matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1])
// out of search but crawlable (launch audit 2026-10-28 S4): never listed, never Disallowed
const unlisted = [...disallow, ...NOINDEX_PREFIXES]

describe('sitemap.xml', () => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const locs = [...doc.getElementsByTagName('loc')].map((n) => n.textContent ?? '')

  it('parses as XML', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.documentElement.nodeName).toBe('urlset')
  })

  it('every <loc> is on https://rubli.xyz/ and none is disallowed by robots.txt', () => {
    for (const loc of locs) {
      expect(loc.startsWith('https://rubli.xyz/'), loc).toBe(true)
      const p = loc.slice('https://rubli.xyz'.length)
      for (const d of unlisted) expect(p.startsWith(d), `${loc} vs unlisted ${d}`).toBe(false)
    }
  })

  it('noindex prefixes stay crawlable, or Google never sees the noindex', () => {
    for (const p of NOINDEX_PREFIXES) expect(disallow.some((d) => p.startsWith(d) || d.startsWith(p)), p).toBe(false)
  })

  it('has every crawlable TOC page, and every story only while STORIES_LIVE', () => {
    expect(locs.length).toBeGreaterThanOrEqual(STORIES_LIVE ? 35 : 20)
    for (const e of TOC) {
      if (unlisted.some((d) => e.href.startsWith(d))) continue // e.g. /aria, kept out of search on purpose
      expect(locs, e.href).toContain(`https://rubli.xyz${e.href}`)
    }
    for (const s of STORIES) {
      if (STORIES_LIVE) expect(locs, s.slug).toContain(`https://rubli.xyz/stories/${s.slug}`)
      else expect(locs, s.slug).not.toContain(`https://rubli.xyz/stories/${s.slug}`)
    }
  })
})
