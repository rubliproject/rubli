import { describe, expect, it } from 'vitest'
import type { ContractContextResponse, ContractDetail } from '@/api/types'
import { buildFichaLectura, dayGap, factorLabel, gapPhrase, pickNearest, topFactors } from './ficha'

const base: ContractDetail = { id: 1, amount_mxn: 1e9, is_direct_award: false, is_single_bid: false, is_framework: false, is_consolidated: false, is_multiannual: false, is_high_value: false, is_year_end: false, is_threshold_gaming: false, risk_score: 0.3 }
const ctx = (o: Partial<ContractContextResponse> = {}): ContractContextResponse => ({
  contract_id: 1, amount_mxn: 1e9, official: {}, pair: { total_contracts: 0, total_amount_mxn: 0 }, vendor_total_contracts: 0, ...o,
})
const keys = (c: Partial<ContractDetail>, x?: ContractContextResponse) => buildFichaLectura({ ...base, ...c }, x).map((k) => k.key)

describe('dayGap', () => {
  it('counts days from publication to signing', () => { expect(dayGap('2020-03-30', '2020-03-31')).toBe(1) })
  it('is zero on the same day', () => { expect(dayGap('2020-03-30', '2020-03-30')).toBe(0) })
  it('is negative when signed before publication', () => { expect(dayGap('2020-04-10', '2020-04-01')).toBe(-9) })
  it('crosses a DST/month/year boundary exactly', () => { expect(dayGap('2019-12-31', '2020-03-01')).toBe(61) })
  it('is null when a date is missing or malformed', () => {
    expect(dayGap(null, '2020-03-30')).toBeNull()
    expect(dayGap('2020-03-30', undefined)).toBeNull()
    expect(dayGap('30/03/2020', '2020-03-30')).toBeNull()
  })
  it('phrases the gap', () => {
    expect(gapPhrase(0, 'es')).toBe('el mismo día')
    expect(gapPhrase(1, 'es')).toBe('1 día después')
    expect(gapPhrase(-3, 'en')).toBe('3 days before')
  })
})

describe('La lectura claims (each true / false)', () => {
  it('direct: with the exception article', () => {
    const c = buildFichaLectura({ ...base, is_direct_award: true }, ctx({ official: { exception_article: 'ART. 41 FR. I' } }))
    expect(c[0].es).toContain('ART. 41 FR. I')
  })
  it('direct: without the article says so', () => { expect(buildFichaLectura({ ...base, is_direct_award: true })[0].es).toContain('no registra') })
  it('direct: false for a tender', () => { expect(keys({})).not.toContain('direct') })
  it('single bid: true only for a tender with one awardee', () => {
    expect(keys({ is_single_bid: true })).toContain('single')
    expect(keys({ is_single_bid: true, is_direct_award: true })).not.toContain('single')
    expect(keys({})).not.toContain('single')
  })
  it('fast: signed within 5 days of publication', () => {
    expect(keys({ publication_date: '2020-03-30', contract_date: '2020-03-31' })).toContain('fast')
    expect(keys({ publication_date: '2020-03-01', contract_date: '2020-03-31' })).not.toContain('fast')
    expect(keys({ contract_date: '2020-03-31' })).not.toContain('fast')
  })
  it('before: signed before publication', () => {
    expect(keys({ publication_date: '2020-04-10', contract_date: '2020-04-01' })).toContain('before')
    expect(keys({ publication_date: '2020-04-01', contract_date: '2020-04-10' })).not.toContain('before')
  })
  it('p99: true at ≥ 2× the sector p99', () => {
    expect(keys({}, ctx({ size_vs_p99: 44 }))).toContain('p99')
    expect(keys({}, ctx({ size_vs_p99: 1.5 }))).not.toContain('p99')
    expect(keys({}, ctx({ size_vs_p99: null }))).not.toContain('p99')
  })
  it('pair: rank among many, or the only one, or nothing', () => {
    const many = buildFichaLectura(base, ctx({ pair: { total_contracts: 12, total_amount_mxn: 1, this_rank: 3, first_year: 2010, last_year: 2020 } }))
    expect(many.find((k) => k.key === 'pair')?.es).toContain('3.º mayor de 12')
    const one = buildFichaLectura(base, ctx({ pair: { total_contracts: 1, total_amount_mxn: 1, this_rank: 1 } }))
    expect(one.find((k) => k.key === 'pair')?.es).toContain('único')
    expect(keys({}, ctx())).not.toContain('pair')
  })
  it('standing: documented case, EFOS, SFP — each only when set', () => {
    const s = { in_ground_truth: true, is_efos_definitivo: true, is_sfp_sanctioned: true }
    expect(keys({}, ctx({ vendor_standing: s }))).toEqual(expect.arrayContaining(['gt', 'efos', 'sfp']))
    const none = keys({}, ctx({ vendor_standing: { in_ground_truth: false, is_efos_definitivo: false, is_sfp_sanctioned: false } }))
    expect(none).not.toContain('gt'); expect(none).not.toContain('efos'); expect(none).not.toContain('sfp')
  })
  it('decimal: suspect_decimal is a critical claim (contract 3200202)', () => {
    const c = buildFichaLectura({ ...base, amount_mxn: 35_175_000_000, amount_flag: 'suspect_decimal' })
    expect(c.find((k) => k.key === 'decimal')?.crit).toBe(true)
    expect(c.map((k) => k.key)).not.toContain('review')
    expect(keys({})).not.toContain('decimal')
  })
  it('review: above 10,000 MDP or flagged review', () => {
    expect(keys({ amount_mxn: 2e10 })).toContain('review')
    expect(keys({ amount_flag: 'review' })).toContain('review')
    expect(keys({ amount_mxn: 9e9 })).not.toContain('review')
  })
  it('unscored: only when there is no indicator', () => {
    expect(keys({ risk_score: null })).toContain('unscored')
    expect(keys({ risk_score: 0.1 })).not.toContain('unscored')
  })
})

describe('topFactors / pickNearest', () => {
  it('takes the three largest |contribution|, dropping zeros', () => {
    const f = [0.1, -2, 0, 0.77, 2.28].map((c, i) => ({ feature: `f${i}`, label: '', z_score: 0, coefficient: 0, contribution: c }))
    expect(topFactors(f).map((x) => x.contribution)).toEqual([2.28, -2, 0.77])
  })
  it('orders neighbours by amount then date and excludes itself', () => {
    const rows = [
      { id: 1, amount_mxn: 1e9, contract_date: '2020-01-01' },
      { id: 2, amount_mxn: 1.05e9, contract_date: '2020-02-01' },
      { id: 3, amount_mxn: 5e9, contract_date: '2020-01-01' },
      { id: 4, amount_mxn: 1.05e9, contract_date: '2012-01-01' },
      { id: 5, amount_mxn: 0.9e9, contract_date: '2020-01-05' },
    ]
    expect(pickNearest(rows, { id: 1, amount_mxn: 1e9, contract_date: '2020-01-01' }).map((r) => r.id)).toEqual([2, 5, 3])
  })
})

describe('factorLabel', () => {
  const f = (feature: string, label = '') => ({ feature, label, z_score: 0, coefficient: 0, contribution: 0 })
  it('reads the shared model map, in-line case', () => {
    expect(factorLabel(f('single_bid'), 'es')).toBe('un solo adjudicado')
    expect(factorLabel(f('cobid_herfindahl'), 'en')).toBe('co-awardee concentration (HHI)')
  })
  it('takes the API column spellings', () => {
    expect(factorLabel(f('z_price_volatility'), 'en')).toBe('uneven contract sizes')
    expect(factorLabel(f('partida_price_residual_z'), 'es')).toBe('monto frente a su partida')
  })
  it('falls back to the API label for an unknown key', () => { expect(factorLabel(f('mystery', 'Mystery Term'), 'en')).toBe('mystery term') })
})
