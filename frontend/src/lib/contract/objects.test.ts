import { describe, expect, it } from 'vitest'
import { coinCount, coinStacks, coinUnit, coinsClaim, ghostCount, nearQueries, pickNearest, unitWord, ringLines, selloClaim, shortVendor, stampsOf, termWords, type StampInput } from './objects'

const self = { id: 1, amount_mxn: 35_175_000_000, contract_date: '2026-09-12' }

describe('pickNearest', () => {
  it('excludes self and zero amounts, nearest in log-amount and date first', () => {
    const rows = [
      self,
      { id: 2, amount_mxn: 12_524_000_000, contract_date: '2026-10-07' },
      { id: 3, amount_mxn: 3_000_000_000, contract_date: '2026-09-12' },
      { id: 4, amount_mxn: 30_000_000_000, contract_date: '2026-01-02' },
      { id: 5, amount_mxn: 0, contract_date: '2026-09-12' },
    ]
    expect(pickNearest(rows, self).map((r) => r.id)).toEqual([4, 2, 3])
    expect(pickNearest(rows, self, 1).map((r) => r.id)).toEqual([4])
  })
  it('asks both sides of the amount (largest below, smallest above), never above 100B', () => {
    const [below, above] = nearQueries(146_100)
    expect(below).toEqual({ max_amount: 146_100, sort_order: 'desc' })
    expect(above).toEqual({ min_amount: 146_100, max_amount: 100_000_000_000, sort_order: 'asc' })
  })
})

describe('coins', () => {
  it('picks 500 MDP for a 35,175 MDP contract (≤ 80 coins) and 50 MDP for 1,735 MDP', () => {
    expect(coinUnit(35_175_000_000)).toBe(500e6)
    expect(coinUnit(1_734_780_250)).toBe(50e6)
  })
  it('rounds to the nearest coin; under half a coin nothing is struck', () => {
    expect(coinCount(35_175_000_000, 500e6)).toBe(70)
    expect(coinCount(240e6, 500e6)).toBe(0)
    expect(coinCount(260e6, 500e6)).toBe(1)
  })
  it('the ghost exists only for a suspect decimal', () => {
    expect(ghostCount(35_175_000_000, 500e6, 'suspect_decimal')).toBe(7)
    expect(ghostCount(35_175_000_000, 500e6, 'review')).toBeNull()
  })
  it('a contract under 1 MDP still gets coins (ladder down to 1,000 MXN)', () => {
    const { unit, stacks } = coinStacks({ id: 1, amount_mxn: 146_100 }, [{ id: 2, amount_mxn: 215_517 }])
    expect(unit).toBe(5e3)
    expect(stacks.every((s) => s.coins >= 1)).toBe(true)
    expect(unitWord(5e3, 'es')).toBe('5 mil MXN'); expect(unitWord(500e6, 'es')).toBe('500 MDP'); expect(unitWord(500e6, 'en')).toBe('500M MXN')
  })
  it('stacks carry critical only at ≥ 0.60', () => {
    const { stacks } = coinStacks({ ...self, risk_score: 0.6 }, [{ id: 2, amount_mxn: 1e9, risk_score: 0.59 }])
    expect(stacks.map((s) => s.critical)).toEqual([true, false])
  })
})

describe('coinsClaim (each true only when it holds; amounts, not coins)', () => {
  const st = (amts: number[], ghost: number | null = null) => amts.map((c, k) => ({ id: k, self: k === 0, amount: c, coins: Math.round(c), ghost: k === 0 ? ghost : null, critical: false, date: null, vendorId: null, vendorName: null, individual: false, institutionName: null }))
  it('taller than the three put together', () => {
    expect(coinsClaim(st([70, 25, 8, 6]), 'es')).toBe('Su pila es más alta que las de sus tres parecidos juntos.')
  })
  it('tallest but not taller than the sum', () => {
    expect(coinsClaim(st([30, 25, 8, 6]), 'en')).toBe('Its stack is the tallest beside its three nearest.')
  })
  it('shortest', () => {
    expect(coinsClaim(st([3, 25, 8, 6]), 'es')).toBe('Su pila es la más baja junto a sus tres parecidos.')
  })
  it('among otherwise; null with nothing to compare', () => {
    expect(coinsClaim(st([10, 25, 8, 6]), 'es')).toBe('Su pila queda entre las de sus tres parecidos.')
    expect(coinsClaim(st([10]), 'es')).toBeNull()
  })
  it('a suspect decimal leads the claim, with the slipped stack (3200202: 7 coins, below Pfizer)', () => {
    expect(coinsClaim(st([35175, 12524, 3798, 3161], 7), 'es')).toBe('Con el monto registrado —marcado como posible error decimal— su pila es más alta que las de sus tres parecidos juntos; si el decimal corrió, serían 7 monedas, por debajo de la más alta de ellos.')
    expect(coinsClaim(st([350000, 12524, 3798, 3161], 70), 'en')).toBe('With the recorded amount (flagged as a possible decimal error) its stack is taller than its three nearest put together; if the decimal slipped it would be 70 coins, still taller than any of them.')
  })
})

describe('shortVendor', () => {
  it('drops the legal suffix and keeps two words (no mid-word cut)', () => {
    expect(shortVendor('LABORATORIOS LIOMONT, S.A. DE C.V.')).toBe('LABORATORIOS LIOMONT')
    expect(shortVendor('PFIZER SA DE CV')).toBe('PFIZER')
    expect(shortVendor('ASTRAZENECA')).toBe('ASTRAZENECA')
  })
})

describe('El sello', () => {
  const base: StampInput = { procedure_label: 'Adjudicación directa', is_direct_award: true, scored: true, risk_score: 0.95, start_date: '2026-09-12', end_date: '2030-12-31', award_date: '2026-09-11', amount_flag: 'suspect_decimal' }
  const d = (s: string) => s
  it('ring = the article verbatim; hollow «sin dato» when empty', () => {
    const a = stampsOf({ ...base, exception_article: 'ART. 54 FR. I' }, 'es', d)[0]
    expect(a.lines).toEqual(['ART. 54 FR. I']); expect(a.none).toBe(false)
    const b = stampsOf(base, 'es', d)[0]
    expect(b.lines).toEqual(['SIN DATO']); expect(b.none).toBe(true)
  })
  it('caso fortuito «sin dato» when absent; award only when recorded; flag and crítico red', () => {
    const s = stampsOf(base, 'es', d)
    expect(s.find((x) => x.key === 'fortuito')?.lines).toEqual(['sin dato'])
    expect(s.find((x) => x.key === 'award')).toBeTruthy()
    expect(s.find((x) => x.key === 'risk')?.red).toBe(true)
    expect(s.find((x) => x.key === 'flag')?.red).toBe(true)
    const t = stampsOf({ ...base, award_date: null, amount_flag: null, risk_score: 0.59 }, 'en', d)
    expect(t.find((x) => x.key === 'award')).toBeUndefined()
    expect(t.find((x) => x.key === 'flag')).toBeUndefined()
    expect(t.find((x) => x.key === 'risk')?.red).toBe(false)
  })
  it('«OTRO» in the caso fortuito field is not an act of God (2915511, Art. 41 fr. I)', () => {
    const s = stampsOf({ ...base, exception_article: 'ART. 41 FR. I', caso_fortuito: 'OTRO' }, 'en', d)
    expect(s.find((x) => x.key === 'fortuito')?.lines).toEqual(['not invoked (record: OTRO)'])
    expect(selloClaim({ ...base, exception_article: 'ART. 41 FR. I', caso_fortuito: 'OTRO' }, 'es')).toBe('Sellado con fundamento ART. 41 FR. I.')
    expect(stampsOf({ ...base, caso_fortuito: 'DESASTRE NATURAL' }, 'es', d).find((x) => x.key === 'fortuito')?.none).toBe(false)
  })
  it('unscored never prints a number', () => {
    expect(stampsOf({ ...base, scored: false }, 'es', d).find((x) => x.key === 'risk')?.title).toBe('INDICADOR DE RIESGO')
  })
  it('term in words', () => {
    expect(termWords('2026-09-12', '2030-12-31', 'es')).toBe('4 años y 4 meses')
    expect(termWords('2020-03-31', '2020-12-31', 'en')).toBe('9 months')
    expect(termWords('2020-03-31', '2020-03-31', 'es')).toBe('1 día')
    expect(termWords('2021-01-01', '2020-01-01', 'es')).toBeNull()
  })
  it('ring lines fit the centre', () => {
    expect(ringLines('ART. 54 FR. I')).toEqual(['ART. 54', 'FR. I'])
    expect(ringLines('ART. 41 FR. III LAASSP REFORMA 2024').length).toBeLessThanOrEqual(3)
  })
  it('claim: stamped / not recorded / direct award without basis', () => {
    expect(selloClaim({ ...base, exception_article: 'ART. 54 FR. I' }, 'es')).toBe('Sellado con fundamento ART. 54 FR. I.')
    expect(selloClaim(base, 'es')).toBe('El registro no trae el fundamento legal, aunque se adjudicó sin licitación.')
    expect(selloClaim({ ...base, is_direct_award: false }, 'en')).toBe('The record carries no legal basis.')
  })
})
