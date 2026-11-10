import { describe, it, expect } from 'vitest'
import { parseRange, formatRange, xToScore, selectRange } from './brush'
import { scoreToX, type FieldInst, type FieldModel } from './field'

describe('parseRange', () => {
  it('reads lo-hi and round-trips', () => {
    expect(parseRange('40-48', 0, 100)).toEqual([40, 48])
    expect(formatRange(parseRange('40-48', 0, 100)!)).toBe('40-48')
  })
  it('orders, rounds and clamps', () => {
    expect(parseRange('48-40', 0, 100)).toEqual([40, 48])
    expect(parseRange('39.6-48.2', 0, 100)).toEqual([40, 48])
    expect(parseRange('5-200', 15, 90)).toEqual([15, 90])
  })
  it('rejects junk and empty ranges', () => {
    for (const s of [null, '', '40', '40-', 'a-b', '-5-10', '40-40', '40–48']) expect(parseRange(s, 0, 100)).toBeNull()
  })
})

describe('xToScore', () => {
  const g = { plotX0: 200, plotW: 800, xMin: 0, xMax: 100 }
  it('inverts scoreToX on whole points', () => {
    for (const s of [0, 28, 44, 47, 100]) expect(xToScore(scoreToX(s, g), g)).toBe(s)
  })
  it('clamps outside the plot', () => {
    expect(xToScore(0, g)).toBe(0)
    expect(xToScore(5000, g)).toBe(100)
  })
})

describe('selectRange', () => {
  const inst = (score: number, val: number) => ({ total_score: score, total_amount_mxn: val }) as FieldInst
  const m = { insts: [inst(39.9, 1), inst(40, 2), inst(44.5, 3), inst(48, 4), inst(48.1, 10)] } as FieldModel
  it('is inclusive at both ends and weighs the scope', () => {
    const s = selectRange(m, [0, 1, 2, 3, 4], [40, 48])
    expect(s.members).toEqual([1, 2, 3])
    expect(s.n).toBe(3)
    expect(s.val).toBe(9)
    expect(s.share).toBeCloseTo(9 / 20)
  })
  it('only looks inside the scope', () => {
    const s = selectRange(m, [2, 4], [40, 48])
    expect(s.members).toEqual([2])
    expect(s.share).toBeCloseTo(3 / 13)
  })
  it('empty scope is a zero share, not NaN', () => {
    expect(selectRange(m, [], [40, 48]).share).toBe(0)
  })
})
