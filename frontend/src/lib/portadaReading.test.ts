import { describe, expect, it } from 'vitest'
import { reasonOf, riskDrivers, topBuyer } from './portadaReading'

describe('topBuyer', () => {
  it('names the largest spender and its share of the sky', () => {
    const t = topBuyer({ id: [1, 251, 3], name: ['A', 'IMSS', 'C'], siglas: ['', 'IMSS', ''], v: [10, 30, 60 - 0] })
    expect(t).toEqual({ id: 3, name: 'C', siglas: '', share: 0.6 })
  })
  it('ignores negative or missing values', () => {
    expect(topBuyer({ id: [1, 2], name: ['A', 'B'], v: [-5, 5] })).toEqual({ id: 2, name: 'B', siglas: null, share: 1 })
  })
  it('is null with no money', () => {
    expect(topBuyer({ id: [1], name: ['A'], v: [0] })).toBeNull()
    expect(topBuyer(null)).toBeNull()
  })
})

const f = (feature: string, z: number, coefficient: number) => ({ feature, label: feature, z_score: z, coefficient, contribution: z * coefficient })

describe('riskDrivers', () => {
  // GET /contracts/3240132/risk-explain, 2026-11-03 (trimmed)
  const real = [
    f('price_ratio', 3.482, 0.4563), f('rt4_log', 2.303, 0.5916), f('vendor_concentration', 3.122, 0.173),
    f('partida_price_residual_z_loo', 4.587, 0.0887), f('price_volatility', 0.498, 0.8108),
    f('cobid_herfindahl', 1.0, -0.3038), f('direct_award', -1.902, 0.0489), f('recency_z', -0.718, -0.0663),
  ]
  it('keeps only the strongest reasons clearly above usual (z ≥ 1), strongest first', () => {
    expect(riskDrivers(real).map((d) => d.feature)).toEqual(['price_ratio', 'vendor_concentration'])
  })
  it('never names a reason inside the usual range or read in the opposite direction', () => {
    const names = riskDrivers(real, 99).map((d) => d.feature)
    expect(names).not.toContain('price_volatility') // z 0.5: inside the usual range (the live bug)
    expect(names).not.toContain('direct_award') // z < 0: it was tendered
    expect(names).not.toContain('cobid_herfindahl') // negative coefficient
    expect(names).not.toContain('recency_z') // no plain phrase
    expect(names).not.toContain('rt4_log') // raw units, not SD
    expect(names).not.toContain('partida_price_residual_z_loo') // another baseline
  })
  it('is empty without an explanation', () => { expect(riskDrivers(undefined)).toEqual([]) })
})

const d = (feature: string, z: number, raw: number | null = null) => ({ feature, z, contribution: 1, raw })
const say = (r: { pre: string; b?: string; post: string }) => `${r.pre}${r.b ?? ''}${r.post}`

describe('reasonOf', () => {
  it('turns the amount ratio into «N veces lo normal en <sector>» with both amounts and N unit dots', () => {
    const r = reasonOf(d('price_ratio', 3.5, 8.04), 80_400_000, false, 'Salud')
    expect(say(r)).toBe('Su monto es 8 veces lo normal en Salud.')
    expect(r.cmp).toMatchObject({ kind: 'times', self: 80_400_000, n: 8 })
    expect(r.cmp?.kind === 'times' && r.cmp.typical).toBeCloseTo(10_000_000)
    expect(say(reasonOf(d('price_ratio', 3.5, 42.6), 1, true, 'Health'))).toBe('Its amount is 43 times the norm in Health.')
    expect(say(reasonOf(d('price_ratio', 3.5, 8), 1, false))).toBe('Su monto es 8 veces lo normal en su sector.')
  })
  it('past 100× says «más de 100 veces»; past 50× keeps the amounts but drops the dots', () => {
    const r = reasonOf(d('price_ratio', 3.5, 451), 66.9e6, false)
    expect(r.b).toBe('más de 100 veces'); expect(r.cmp).toMatchObject({ kind: 'times', n: null })
    expect(r.cmp?.kind === 'times' && r.cmp.typical).toBeCloseTo(148_337, 0)
    expect(reasonOf(d('price_ratio', 3.5, 60), 1e9, false).cmp).toMatchObject({ n: null })
    // under 3× the dots would round away the gap the sentence states → amounts only
    const s = reasonOf(d('price_ratio', 3.5, 2.4), 1e9, false)
    expect(s.b).toBe('2.4 veces'); expect(s.cmp).toMatchObject({ n: null })
    // with dots, the sentence and the dot count say the same whole number
    const t = reasonOf(d('price_ratio', 3.5, 4.6), 1e9, false)
    expect(t.b).toBe('5 veces'); expect(t.cmp).toMatchObject({ n: 5 })
  })
  it('falls back to words, with no picture, when the ratio or the amount is missing or small', () => {
    for (const r of [reasonOf(d('price_ratio', 2), 1e6, false), reasonOf(d('price_ratio', 2, 1.2), 1e6, false)]) {
      expect(r.b).toBeUndefined(); expect(r.cmp).toBeUndefined()
    }
    expect(reasonOf(d('price_ratio', 2, 8), null, false).cmp).toBeUndefined()
  })
  it('reads concentration as pesos of every 100 the sector spent', () => {
    const r = reasonOf(d('vendor_concentration', 3.1, 0.312), null, false, 'Salud')
    expect(say(r)).toBe('Hasta el año pasado, la empresa cobró 31 de cada 100 pesos de Salud.')
    expect(r.cmp).toMatchObject({ kind: 'per100', n: 31 })
    // 0.2 % is far above usual for its sector but reads small → words, no picture
    const w = reasonOf(d('vendor_concentration', 1.2, 0.0019), null, true)
    expect(w.cmp).toBeUndefined(); expect(w.b).toBeUndefined()
    expect(reasonOf(d('vendor_concentration', 2, 3), null, false).b).toBeUndefined() // never «300 de cada 100»
  })
  it('inverts a binary z into the sector rate, never past the scorer clip', () => {
    // p = 0.2 → z = (1 − 0.2)/√(0.2·0.8) = 2
    const r = reasonOf(d('single_bid', 2), null, false, 'Salud')
    expect(r.b).toBe('20 de cada 100'); expect(r.cmp).toMatchObject({ kind: 'per100', n: 20 })
    expect(reasonOf(d('single_bid', 5), null, false).b).toBeUndefined()
    expect(reasonOf(d('single_bid', 5), null, false).cmp).toBeUndefined()
  })
  it('keeps every sentence ≤ 15 words and never says «precio» / «price»', () => {
    for (const ft of ['price_ratio', 'price_volatility', 'vendor_concentration', 'direct_award', 'single_bid', 'same_day_count'])
      for (const en of [false, true]) for (const raw of [null, 3, 0.3]) for (const sec of [null, 'Infraestructura']) {
        const t = say(reasonOf(d(ft, 2, raw), 1e6, en, sec))
        expect(t).not.toMatch(/precio|price/i)
        expect(t.split(/\s+/).length).toBeLessThanOrEqual(15)
      }
  })
})
