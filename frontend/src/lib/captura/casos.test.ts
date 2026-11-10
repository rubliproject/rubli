import { describe, expect, it } from 'vitest'
import type { CapturaPair } from '@/api/captura'
import { pastDocumented, rankCasos } from './casos'

let vid = 1
const P = (o: Partial<CapturaPair>): CapturaPair => ({
  vendor_id: vid++, institution_id: 1, name: 'X', m: 1e8, sh: 0.9, y0: 2015, y1: 2025, ny: 5, lock0: null, lock1: null,
  lockrun: 0, da: null, flag: 0, post: 0, post_n: 0, gt: null, risk: 0.2, ...o,
})

describe('rankCasos', () => {
  const doc = P({ gt: 'doc', m: 1e8, ny: 3 })
  const big = P({ gt: 'lead', m: 5e9, ny: 10 })
  const small = P({ gt: 'lead', m: 1e9, ny: 2 })
  const model = P({ risk: 0.61, m: 3e9, ny: 10 })
  const r = rankCasos([small, model, big, doc,
    P({ risk: 0.59, m: 9e10 }),                 // high, not critical, no case → out
    P({ gt: 'lead', y1: 2023, m: 9e10 }),       // not current → out
    P({ gt: 'doc', y1: 2022, m: 9e10 })])       // documented but not current → out (pastDocumented)
  it('documented first, then money × years, every row current', () => {
    expect(r.map((c) => c.p)).toEqual([doc, big, model, small])
    expect(r.map((c) => c.status)).toEqual(['doc', 'lead', 'model', 'lead'])
    expect(r.every((c) => c.p.y1 >= 2024)).toBe(true)
  })
  it('model-only needs a critical indicator', () => {
    expect(r.some((c) => c.p.risk === 0.59)).toBe(false)
  })
  it('past documented pairs are listed apart, most money first', () => {
    expect(pastDocumented([doc, P({ gt: 'doc', y1: 2019, m: 1 }), P({ gt: 'doc', y1: 2020, m: 2 })]).map((p) => p.m)).toEqual([2, 1])
  })
})
