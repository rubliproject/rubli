import { describe, expect, it } from 'vitest'
import { categoryPredictionText, contractPredictionText, institutionPredictionText, pairPredictionText, vendorPredictionText } from './predictions'
import type { CategoryPrediction, ContractPrediction, InstitutionPrediction, PairPrediction, VendorPrediction } from '@/api/types'

const meta = { last_year: 2025, target_year: 2026, data_through: '2025-09-28' }
const short = (s: string) => s.split(/(?<=\.)\s+/).every((x) => x.split(/\s+/).length <= 15)

describe('institutionPredictionText', () => {
  const base: InstitutionPrediction = { ...meta, available: true, reason: null, band: 10, backtest: { year: 2024, n: 174, mae: 6.8, within_band: 0.747 }, point: 66.5, low: 56.5, high: 76.5 }
  it('says next year, the point and the band', () => {
    const t = institutionPredictionText(base, true)!
    expect(t.kicker).toBe('Si sigue así')
    expect(t.finding).toBe('En 2026, unos 67 de cada 100 contratos serán sin concurso (entre 57 y 77).')
    expect(t.caveat).toContain('75 de cada 100 instituciones')
    expect(t.caveat).toContain('28 sep 2025')
    expect(short(t.finding) && short(t.caveat)).toBe(true)
  })
  it('thin institution → nothing', () => {
    expect(institutionPredictionText({ ...base, available: false, reason: 'thin', point: undefined }, false)).toBeNull()
  })
})

describe('pairPredictionText', () => {
  const rep: PairPrediction = { ...meta, available: true, reason: null, streak: 3, pair_class: 'repeat', rate: 0.668, rate_n: 23112, base_rate: 0.514, test: '2023→2024', last_signed: 2025 }
  it('repeat pair → likely to sign again, 7 of 10', () => {
    const t = pairPredictionText(rep, true, false)!
    expect(t.finding).toBe('En 2026 lo más probable es que vuelvan a firmar. Parejas que ya repitieron lo hacen 7 de cada 10 veces.')
    expect(short(t.finding) && short(t.caveat)).toBe(true)
  })
  it('first-time pair under 50 % → says «no»', () => {
    const t = pairPredictionText({ ...rep, streak: 1, pair_class: 'first', rate: 0.404 }, true, false)!
    expect(t.finding).toBe('En 2026 lo más probable es que no vuelvan a firmar. Parejas nuevas como esta lo hacen 4 de cada 10 veces.')
    expect(pairPredictionText({ ...rep, streak: 1, pair_class: 'first', rate: 0.404 }, false, false)!.finding).toContain('most likely not sign again')
  })
  it('persona física, stale pair, loading → nothing', () => {
    expect(pairPredictionText(rep, true, true)).toBeNull()
    expect(pairPredictionText({ ...meta, available: false, reason: 'persona_fisica' }, true, false)).toBeNull()
    expect(pairPredictionText({ ...meta, available: false, reason: 'not_recent', last_signed: 2019 }, true, false)).toBeNull()
    expect(pairPredictionText(undefined, true, false)).toBeNull()
  })
})

const track = { n_test: 5486, base: 0.83, auc: 0.71, test: '2023→2024' }

describe('vendorPredictionText', () => {
  const v: VendorPrediction = { ...meta, ...track, available: true, reason: null, decile: 8, rate: 0.94, top_buyer: { id: 251, name: 'IMSS' }, top_share: 0.5, dep90: false, main_buyer_stays: { rate: 0.77, n: 4000 }, dep90_stays: { rate: 0.84, n: 2285 } }
  it('keeps winning 9 of 10 + sells again to its main buyer', () => {
    const t = vendorPredictionText(v, true, false)!
    expect(t.finding).toBe('En 2026 seguirá ganando: empresas con este historial lo hacen 94 de cada 100 veces.')
    expect(t.segs).toEqual(['Lo más probable es que vuelva a venderle a ', { id: 251, name: 'IMSS' }, ': pasó 8 de cada 10 veces.'])
    expect(t.caveat).toContain('5,486 empresas')
    expect(short(t.finding)).toBe(true)
  })
  it('≥90 % one buyer → the dependence line, never «#1»', () => {
    const t = vendorPredictionText({ ...v, dep90: true, top_share: 0.97 }, true, false)!
    expect(t.segs).toEqual([{ id: 251, name: 'IMSS' }, ' le paga casi todo. En 2026 también: pasó 8 de cada 10 veces.'])
    expect(JSON.stringify(t)).not.toMatch(/#1|número uno/)
  })
  it('persona física / thin → nothing', () => {
    expect(vendorPredictionText(v, true, true)).toBeNull()
    expect(vendorPredictionText({ ...meta, available: false, reason: 'thin' }, true, false)).toBeNull()
  })
})

describe('contractPredictionText', () => {
  const pair: PairPrediction = { ...meta, available: true, reason: null, streak: 2, pair_class: 'repeat', rate: 0.668, rate_n: 23112, test: '2023→2024' }
  const c: ContractPrediction = { ...meta, ...track, n_test: 38423, available: true, reason: null, decile: 9, rate: 0.73 }
  it('uses the decile when the triple is active', () => {
    expect(contractPredictionText(c, pair, true, false)!.finding).toBe('Contratos parecidos se repitieron al año siguiente 7 de cada 10 veces.')
  })
  it('falls back to the pair line; persona física → nothing', () => {
    expect(contractPredictionText({ ...meta, available: false, reason: 'not_recent' }, pair, true, false)!.finding).toMatch(/^En 2026 lo más probable/)
    expect(contractPredictionText({ ...meta, available: false, reason: 'persona_fisica' }, pair, true, false)).toBeNull()
    expect(contractPredictionText(undefined, pair, true, false)).toBeNull()
  })
})

describe('categoryPredictionText', () => {
  const k: CategoryPrediction = { ...meta, available: true, band: 10, share: 57.6, suppliers: 1234, suppliers_year: 2024, share_within_band: 0.87, share_n: 60, suppliers_within_25: 0.78, suppliers_n: 69, top_stays: 0.15, top_n: 69, test: '2023→2024', sub_top_stays: { stay: 0.16, n: 112, test: '2023→2024' } }
  it('share ±10, suppliers ±25 %, churn 1 in 7, with the track record', () => {
    const t = categoryPredictionText(k, true, false)!
    expect(t.finding).toBe('En 2026, unos 58 de cada 100 contratos serán sin concurso (±10). Tendrá unos 1,234 proveedores (±25 %). El que más cobra hoy repite como líder solo 1 de cada 7 veces.')
    expect(t.caveat).toContain('87 de cada 100 categorías')
    expect(short(t.finding)).toBe(true)
  })
  it('subcategory → churn only, 1 in 6', () => {
    expect(categoryPredictionText(k, true, true)!.finding).toBe('El líder de hoy repite como líder solo 1 de cada 6 veces.')
    expect(categoryPredictionText(undefined, true, true)).toBeNull()
  })
})
