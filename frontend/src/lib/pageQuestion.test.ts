import { describe, expect, it } from 'vitest'
import type { FieldInst } from '@/lib/institutions/field'
import { risingSince2019 } from '@/components/administrations/CienPesos'
import { mainBuyer, mapaRiesgo, mapaSectors, topBy, topPatterns, topReal, versusSector, worstGraded } from './pageQuestion'

const inst = (id: number, total_score: number, extra: Partial<FieldInst> = {}) =>
  ({ id, total_score, level: 'federal', provisional: false, historical: false, ...extra }) as FieldInst

describe('topBy', () => {
  it('picks the largest, keeps the first on a tie, null when empty', () => {
    expect(topBy([{ v: 1 }, { v: 3 }, { v: 3 }], (r) => r.v)).toEqual({ v: 3 })
    expect(topBy([{ k: 'a', v: 2 }, { k: 'b', v: 2 }], (r) => r.v)?.k).toBe('a')
    expect(topBy([], () => 0)).toBeNull()
  })
})

describe('worstGraded', () => {
  it('is the lowest federal, settled, active grade', () => {
    expect(worstGraded([inst(1, 50), inst(2, 20), inst(3, 70)])?.id).toBe(2)
  })
  it('skips provisional, historical and non-federal buyers', () => {
    const rows = [
      inst(1, 40),
      inst(2, 5, { provisional: true }),
      inst(3, 6, { historical: true }),
      inst(4, 7, { level: 'state' }),
    ]
    expect(worstGraded(rows)?.id).toBe(1)
  })
  it('is null when no buyer qualifies', () => {
    expect(worstGraded([inst(1, 10, { provisional: true })])).toBeNull()
  })
})

describe('risingSince2019 (Sexenios claim)', () => {
  const row = (key: string, share: number) => ({ key, share }) as never
  it('is true only when Peña Nieto < AMLO < Sheinbaum', () => {
    expect(risingSince2019([row('epn', 0.32), row('amlo', 0.45), row('sheinbaum', 0.64)])).toBe(true)
    expect(risingSince2019([row('epn', 0.32), row('amlo', 0.45), row('sheinbaum', 0.40)])).toBe(false)
  })
})

describe('topReal (Sexenios top supplier, 2024 pesos)', () => {
  const v = (vendor_id: number, yearly: [number, number][]) =>
    ({ vendor_id, yearly: yearly.map(([year, total_mxn]) => ({ year, total_mxn })) }) as never
  it('ranks by deflated pesos, not nominal', () => {
    // nominal: 1 = 100, 2 = 90; real: 1 = 100/1.0 = 100, 2 = 90/0.5 = 180
    expect(topReal([v(1, [[2024, 100]]), v(2, [[2010, 90]])], { 2024: 1, 2010: 0.5 })?.v).toMatchObject({ vendor_id: 2 })
  })
  it('keeps a year without INPC nominal, and is null when empty', () => {
    expect(topReal([v(1, [[2026, 50]])], {})?.real).toBe(50)
    expect(topReal([], {})).toBeNull()
  })
})

describe('topPatterns', () => {
  it('returns the single most common type', () => {
    expect(topPatterns([{ fraud_type: 'bribery', count: 2 }, { fraud_type: 'overpricing', count: 5 }])).toEqual(['overpricing'])
  })
  it('returns ties together', () => {
    expect(topPatterns([{ fraud_type: 'a', count: 3 }, { fraud_type: 'b', count: 3 }, { fraud_type: 'c', count: 1 }])).toEqual(['a', 'b'])
  })
  it('is null with no counts', () => {
    expect(topPatterns([])).toBeNull()
    expect(topPatterns(undefined)).toBeNull()
  })
})

describe('mainBuyer', () => {
  const buyers = [
    { institution_id: 2, institution_name: 'B', total_value_mxn: 20 },
    { institution_id: 1, institution_name: 'A', total_value_mxn: 50 },
  ]
  it('picks the largest buyer by money and its share', () => {
    expect(mainBuyer(buyers, 100)).toEqual({ id: 1, name: 'A', share: 50 })
  })
  it('caps the share at 100', () => {
    expect(mainBuyer(buyers, 40)?.share).toBe(100)
  })
  it('is null without buyers; names the buyer without a share when the total is missing', () => {
    expect(mainBuyer([], 100)).toBeNull()
    expect(mainBuyer(buyers, 0)).toEqual({ id: 1, name: 'A', share: null })
  })
})

describe('versusSector', () => {
  it('reads above, below and similar', () => {
    expect(versusSector(97, 60)).toBe('above')
    expect(versusSector(40, 60)).toBe('below')
    expect(versusSector(62, 60)).toBe('similar')
  })
  it('is null when either side is missing', () => {
    expect(versusSector(null, 60)).toBeNull()
    expect(versusSector(50, undefined)).toBeNull()
  })
})

describe('mapaSectors', () => {
  it('picks the biggest sector by money and the one with the most of its money at high risk', () => {
    // sector 1: 100 at 10% · sector 2: 30 at 50% · sector 3: no money (left out)
    const r = mapaSectors({ sector: [1, 1, 2, 3], v: [60, 40, 30, 0], h: [0.1, 0.1, 0.5, 1] })
    expect(r?.top).toBe(1)
    expect(r?.topShare).toBeCloseTo(100 / 130)          // the «Sectores» finding: its share of all the money
    expect(r?.riskiest).toBe(2)
    expect(r?.riskShare).toBeCloseTo(0.5)
  })
  it('weights each agency by its money', () => {
    expect(mapaSectors({ sector: [1, 1, 2], v: [90, 10, 50], h: [0, 1, 0.2] })?.riskiest).toBe(2)
  })
  it('is null with no stars', () => {
    expect(mapaSectors({ sector: [], v: [], h: [] })).toBeNull()
  })
})

describe('mapaRiesgo', () => {
  // 0: 100 at 50% (50 risky) · 1: 400 at 10% (40) · 2: 10 at 100% (10) · 3: 50 at 0% · 4: no money
  const stars = { sector: [1, 1, 2, 2, 2], v: [100, 400, 10, 50, 0], h: [0.5, 0.1, 1, 0, 1] }
  it('ranks by money in high or critical contracts, not by share', () => {
    expect(mapaRiesgo(stars)?.order).toEqual([0, 1, 2])
  })
  it('weights the reference share by money and counts the 0% column', () => {
    const r = mapaRiesgo(stars)!
    expect(r.avg).toBeCloseTo(100 / 560)
    expect(r.none).toBe(1)
    expect(r.agencies).toBe(4)
  })
  it('narrows to one sector and to n names', () => {
    expect(mapaRiesgo(stars, 2)?.order).toEqual([2])
    expect(mapaRiesgo(stars, null, 1)?.order).toEqual([0])
  })
  it('is null with no money', () => {
    expect(mapaRiesgo({ sector: [1], v: [0], h: [1] })).toBeNull()
  })
})
