import { describe, it, expect } from 'vitest'
import { subcategorySplit, orderSubs, restOf, consolidatedShare, zoomFrom, largestKind, foldSubs } from './drill'

const sub = (id: number, v: number, catchAll = false) => ({ subcategory_id: id, total_value: v, is_catch_all: catchAll })

describe('subcategorySplit', () => {
  it('medicines-shaped shelf (68 % catch-all, two named kinds) is useful', () => {
    const s = subcategorySplit([sub(1, 810, true), sub(2, 280), sub(3, 59), sub(4, 24)])
    expect(s.useful).toBe(true)
    expect(s.namedShare).toBeCloseTo(363 / 1173, 5)
    expect(s.catchAll?.subcategory_id).toBe(1)
  })
  it('a shelf swallowed by its catch-all (97 %) is skipped', () => {
    expect(subcategorySplit([sub(1, 382, true), sub(2, 4.5), sub(3, 3.1)]).useful).toBe(false)
  })
  it('one named kind alone is not a breakdown', () => {
    expect(subcategorySplit([sub(1, 50, true), sub(2, 50), sub(3, 0)]).useful).toBe(false)
  })
  it('empty or missing rows are not useful', () => {
    expect(subcategorySplit([]).useful).toBe(false)
    expect(subcategorySplit(undefined).total).toBe(0)
  })
})

describe('orderSubs / restOf', () => {
  it('sorts by value with the catch-all last', () => {
    expect(orderSubs([sub(1, 900, true), sub(2, 10), sub(3, 50)]).map((r) => r.subcategory_id)).toEqual([3, 2, 1])
  })
  it('rest never goes negative', () => {
    expect(restOf(100, [60, 30])).toBe(10)
    expect(restOf(100, [80, 30])).toBe(0)
  })
})

describe('consolidatedShare', () => {
  it('weights each row by its value', () => {
    expect(consolidatedShare([{ total_value: 300, consolidated_value_pct: 50 }, { total_value: 100, consolidated_value_pct: 10 }])).toBeCloseTo(40, 6)
  })
  it('is null when no row reports it (a DB before the 2026-11-03 swap)', () => {
    expect(consolidatedShare([{ total_value: 10, consolidated_value_pct: null }, { total_value: 5 }])).toBeNull()
  })
})

describe('zoomFrom', () => {
  it('maps the segment we came from onto the whole strip', () => {
    const z = zoomFrom(0.25, 0.5)
    expect(z.at + z.size * 0.25).toBeCloseTo(0, 9)
    expect(z.at + z.size * 0.75).toBeCloseTo(1, 9)
  })
  it('a zero-size segment means no zoom', () => {
    expect(zoomFrom(0.3, 0)).toEqual({ at: 0, size: 1 })
  })
})

describe('largestKind', () => {
  const r = (id: number, v: number, code: string, c = false) => ({ subcategory_id: id, total_value: v, is_catch_all: c, code })
  it('skips the catch-all and the «class not stated» shelves (patent / generic)', () => {
    const rows = orderSubs([r(1, 872, 'other_pharma', true), r(2, 100, 'branded_drugs'), r(3, 62, 'vaccines_biologics'), r(4, 2, 'generic_drugs')])
    expect(largestKind(rows)?.subcategory_id).toBe(3)
  })
  it('null when nothing names a kind', () => {
    expect(largestKind([r(1, 5, 'other_x', true), r(2, 3, 'generic_drugs')])).toBeNull()
  })
})

describe('foldSubs', () => {
  const rows = orderSubs([sub(99, 900, true), ...Array.from({ length: 16 }, (_, i) => sub(i + 1, 100 - i))])
  it('a long shelf shows its first named rows and always the catch-all', () => {
    const f = foldSubs(rows, 10, false)
    expect(f.shown.map((x) => x.subcategory_id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99])
    expect(f.hidden).toBe(6)
  })
  it('open shows every row; a short shelf never folds; a fold of one is not a fold', () => {
    expect(foldSubs(rows, 10, true).shown).toHaveLength(17)
    expect(foldSubs(rows.slice(0, 5), 10, false).hidden).toBe(0)
    expect(foldSubs(orderSubs([sub(99, 9, true), ...Array.from({ length: 11 }, (_, i) => sub(i + 1, 50 - i))]), 10, false).hidden).toBe(0)
  })
})

describe('orderSubs — named kinds before the «sin clase» shelves', () => {
  const r = (id: number, v: number, code: string, c = false) => ({ subcategory_id: id, total_value: v, is_catch_all: c, code })
  it('patent / generic «sin clase» sit after every named kind, the catch-all last', () => {
    const o = orderSubs([r(1, 872, 'other_pharma', true), r(2, 100, 'branded_drugs'), r(3, 62, 'vaccines_biologics'), r(4, 2, 'generic_drugs'), r(5, 48, 'controlled_substances')])
    expect(o.map((x) => x.subcategory_id)).toEqual([3, 5, 2, 4, 1])
  })
})
