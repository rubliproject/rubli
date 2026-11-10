import { describe, expect, it } from 'vitest'
import type { VendorInstitutionsTimelineResponse } from '@/api/types'
import {
  buyerMeans, catMeans, compactTimeline, cutOf, fichaFinding, peakGob, riskMeans, shareWords, sortBuyers, type VBuyer, type VCategory,
} from './panorama'

const b = (id: number, m: number, share: number, gobs: VBuyer['gobs']): VBuyer => ({
  institution_id: id, name: `B${id}`, siglas: null, amount_mxn: m, contracts: 1, share_pct: share, da_pct: null, avg_risk: null,
  first_year: 2010, last_year: 2025, years: [], gobs,
})

describe('cutOf', () => {
  it('Hoy is this government; Historia all or one government', () => {
    expect(cutOf('hoy', 'epn')).toEqual({ since: '2024-10-01' })
    expect(cutOf('historia', null)).toEqual({})
    expect(cutOf('historia', 'amlo')).toEqual({ since: '2019-01-01', until: '2024-09-30' })
  })
})

describe('fichaFinding', () => {
  it('states money, contracts, since and the no-tender share', () => {
    expect(fichaFinding({ contracts: 18216, da_pct: 82.2, first_year: 2002 }, '86,243 MDP', 'historia', 'es'))
      .toBe('Desde 2002, cobró 86,243 MDP en 18,216 contratos. 82 de cada 100, sin concurso.')
  })
  it('drops the share when the procedure is unknown, and says when there are no contracts', () => {
    expect(fichaFinding({ contracts: 3, da_pct: null, first_year: 2005 }, '1 MDP', 'hoy', 'es')).toBe('Con este gobierno cobró 1 MDP en 3 contratos.')
    expect(fichaFinding({ contracts: 0, da_pct: null, first_year: null }, '0', 'hoy', 'en')).toMatch(/No contracts under this government/)
  })
})

describe('shareWords / buyerMeans', () => {
  it('«la mitad» only near 50', () => {
    expect(shareWords(50.5, 'es')).toBe('la mitad de su dinero')
    expect(shareWords(23.2, 'es')).toBe('23 de cada 100 pesos')
  })
  it('names the largest buyer, or says it is the only one, or none', () => {
    expect(buyerMeans([b(1, 9, 50.5, {}), b(2, 1, 49.5, {})], 'es').text).toBe(' le dio la mitad de su dinero.')
    expect(buyerMeans([b(1, 9, 100, {})], 'es').text).toBe(' es su único comprador aquí.')
    expect(buyerMeans([], 'es').buyer).toBeNull()
  })
})

describe('peakGob / sortBuyers', () => {
  it('por gobierno: newest peak government first, then money', () => {
    const rows = [b(1, 100, 50, { epn: 80, amlo: 20 }), b(2, 50, 25, { sheinbaum: 50 }), b(3, 60, 25, { amlo: 60 })]
    expect(peakGob(rows[0])).toBe('epn')
    expect(sortBuyers(rows, 'gobierno').map((x) => x.institution_id)).toEqual([2, 3, 1])
    expect(sortBuyers(rows, 'dinero').map((x) => x.institution_id)).toEqual([1, 3, 2])
  })
  it('a buyer with no government money has no peak', () => {
    expect(peakGob(b(9, 1, 1, {}))).toBeNull()
  })
})

describe('compactTimeline', () => {
  const inst = (id: number, top: boolean) => ({ institution_id: id, name: null, siglas: null, first_year: 2010, last_year: 2020, is_top: top, amount_mxn: 10 - id, n_contracts: 1, n_direct_award: 0, avg_risk_score: null })
  const raw = { vendor_id: 1, top: 3, n_institutions: 4, institutions: [inst(1, true), inst(2, true), inst(3, true), inst(4, false)], years: [], cells: [] } as VendorInstitutionsTimelineResponse
  it('keeps N lanes in money order', () => {
    expect(compactTimeline(raw, 'dinero', 2, []).institutions.map((i) => [i.institution_id, i.is_top])).toEqual([[1, true], [2, true], [3, false], [4, false]])
  })
  it('reorders by peak government', () => {
    const buyers = [b(1, 9, 50, { fox: 9 }), b(2, 8, 30, { sheinbaum: 8 }), b(3, 7, 20, { amlo: 7 })]
    expect(compactTimeline(raw, 'gobierno', 2, buyers).institutions.filter((i) => i.is_top).map((i) => i.institution_id)).toEqual([2, 3])
  })
})

describe('catMeans', () => {
  const c = (share: number): VCategory => ({ category_id: 1, name_es: 'Medicamentos', name_en: 'Medicines', amount_mxn: 1, contracts: 1, share_pct: share, da_pct: null, avg_risk: null, subs: [] })
  it('the largest category as pesos of 100', () => {
    expect(catMeans([c(76.2)], 'es')).toBe('76 de cada 100 pesos fueron medicamentos.')
  })
  it('none on record', () => {
    expect(catMeans([], 'en')).toBe('No category on record.')
  })
})

describe('riskMeans', () => {
  it('critical share when there are critical contracts', () => {
    expect(riskMeans({ critical: 16959, high: 550, medium: 688, low: 19, none: 0 }, 'es')).toBe('93 de cada 100 contratos, con indicador crítico.')
  })
  it('falls to high, then to none, then to unscored', () => {
    expect(riskMeans({ critical: 0, high: 1, medium: 0, low: 199, none: 0 }, 'es')).toBe('Menos de 1 de cada 100 contratos, con indicador alto.')
    expect(riskMeans({ critical: 0, high: 0, medium: 3, low: 5, none: 0 }, 'es')).toBe('Ningún contrato con indicador alto o crítico.')
    expect(riskMeans({ critical: 0, high: 0, medium: 0, low: 0, none: 4 }, 'en')).toBe('None of these contracts has a risk indicator.')
  })
})

describe('yearSpan', () => {
  it('collapses a one-year span', async () => {
    const { yearSpan } = await import('./panorama')
    expect(yearSpan(2025, 2025)).toBe('2025')
    expect(yearSpan(2024, 2025)).toBe('2024–2025')
    expect(yearSpan(2024, null)).toBe('2024')
  })
})
