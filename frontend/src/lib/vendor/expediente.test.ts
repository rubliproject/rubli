import { describe, expect, it } from 'vitest'
import { adminTurn, indFmt, laneColor, RIBBON_LANES, type Chapter } from './expediente'
import { CATEGORICAL } from '@/lib/constants'

const ch = (name: string, from: number, to: number, amount: number): Chapter =>
  ({ key: name, name, from, to, amount, share: 0, risk: null, n: 1, da: null })

describe('indFmt — no saturated 1.00 (DESIGN §0.6)', () => {
  it('prints two decimals without the leading zero', () => expect(indFmt(0.614)).toBe('.61'))
  it('never prints 1.00', () => {
    expect(indFmt(1)).toBe('.95')
    expect(indFmt(0.999)).toBe('.95')
  })
})

describe('laneColor — distinct hues, never teal beside cyan (rubli-dataviz §2)', () => {
  it('uses five hues and no cyan', () => {
    const hues = Array.from({ length: RIBBON_LANES }, (_, i) => laneColor(i))
    expect(new Set(hues).size).toBe(5)
    expect(hues).not.toContain(CATEGORICAL[5])
  })
  it('folds lanes past the fifth into slate', () => expect(laneColor(5)).toBe(CATEGORICAL[7]))
})

describe('adminTurn — the sexenio change where the money per year moved most', () => {
  it('true: names the chapter where the yearly money at least doubled', () => {
    const t = adminTurn([ch('Calderón', 2007, 2012, 600), ch('Peña Nieto', 2013, 2018, 1800)])
    expect(t).toMatchObject({ kind: 'admin', year: 2013, name: 'Peña Nieto' })
    expect(t?.ratio).toBeCloseTo(3)
  })
  it('true: a halving counts too', () => {
    expect(adminTurn([ch('Peña Nieto', 2013, 2018, 1800), ch('AMLO', 2019, 2024, 600)])?.year).toBe(2019)
  })
  it('false: a change under ×2 is no turning point', () => {
    expect(adminTurn([ch('Calderón', 2007, 2012, 600), ch('Peña Nieto', 2013, 2018, 900)])).toBeNull()
  })
  it('false: out of Fox (2002–06) the rise reads the coverage, not the vendor', () => {
    expect(adminTurn([ch('Fox', 2002, 2006, 100), ch('Calderón', 2007, 2012, 6000)])).toBeNull()
  })
  it('false: a one-year chapter reads a part year', () => {
    expect(adminTurn([ch('Calderón', 2007, 2012, 600), ch('Peña Nieto', 2013, 2013, 9000)])).toBeNull()
  })
  it('false: a chapter that reaches the 2025 switch mixes two records', () => {
    expect(adminTurn([ch('AMLO', 2019, 2024, 6000), ch('Sheinbaum', 2025, 2026, 100)])).toBeNull()
  })
})
