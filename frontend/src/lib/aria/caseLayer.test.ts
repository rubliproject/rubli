import { describe, expect, it } from 'vitest'
import type { VendorInstitutionsTimelineResponse } from '@/api/types'
import { buildExpediente } from '@/lib/vendor/expediente'
import type { Token } from '@/lib/vendor/lectura'
import { caseClaims, caseFacts, caseYear, crossing } from './caseLayer'

/** One buyer, one cell a year, with that year's indicator. */
function model(risk: Record<number, number | null>) {
  const cells = Object.entries(risk).map(([y, r]) => ({ institution_id: 1, year: Number(y), amount_mxn: 100, n_contracts: 1, n_direct_award: 1, avg_risk_score: r }))
  const p: VendorInstitutionsTimelineResponse = {
    vendor_id: 1, top: 1, n_institutions: 1, cells,
    institutions: [{ institution_id: 1, name: 'INST 1', siglas: 'I1', is_top: true, first_year: cells[0].year, last_year: cells[cells.length - 1].year, amount_mxn: 100 * cells.length, n_contracts: cells.length, n_direct_award: 0, avg_risk_score: 0.5 }],
    years: cells.map((c) => ({ year: c.year, amount_mxn: 100, n_contracts: 1, n_direct_award: 1, avg_risk_score: c.avg_risk_score })),
  }
  return buildExpediente(p)!
}
const text = (ts: Token[]) => ts.map((t) => (typeof t === 'string' ? t : 'b' in t ? t.b : t.inst.siglas)).join('')
const name = (p: string) => (p === 'P1' ? 'Peso en su sector' : p)
const P1 = { primary_pattern: 'P1', pattern_confidence: 0.65, top_institution_ratio: 0.73 }

describe('crossing', () => {
  it('first year ≥ 0.60 and the year it holds from', () => {
    expect(crossing(model({ 2010: 0.3, 2011: 0.7, 2012: 0.5, 2013: 0.8, 2014: 0.9, 2015: 1 }))).toEqual({ first: 2011, holdsFrom: 2013, run: 3 })
    expect(crossing(model({ 2010: 0.3, 2011: 0.4 }))).toEqual({ first: null, holdsFrom: null, run: 0 })
  })
})

describe('caseClaims · crossed', () => {
  it('renders when it crossed and stayed ≥ 3 years', () => {
    const c = caseClaims(model({ 2010: 0.3, 2011: 0.7, 2012: 0.8, 2013: 0.9 }), null, name)
    expect(text(c.find((x) => x.key === 'crossed')!.es)).toBe('El indicador cruzó 0.60 en 2011 y no ha bajado: 3 años seguidos en crítico.')
  })
  it('names both years when it dipped before holding', () => {
    const c = caseClaims(model({ 2010: 0.7, 2011: 0.5, 2012: 0.8, 2013: 0.9, 2014: 0.9 }), null, name)
    expect(text(c.find((x) => x.key === 'crossed')!.es)).toContain('por primera vez en 2010; desde 2012')
  })
  it('is absent when it came back down or never crossed', () => {
    expect(caseClaims(model({ 2010: 0.7, 2011: 0.8, 2012: 0.9, 2013: 0.5 }), null, name).some((x) => x.key === 'crossed')).toBe(false)
    expect(caseClaims(model({ 2010: 0.2, 2011: 0.3, 2012: 0.4 }), null, name).some((x) => x.key === 'crossed')).toBe(false)
    expect(caseClaims(model({ 2010: 0.2, 2011: 0.7, 2012: 0.8 }), null, name).some((x) => x.key === 'crossed')).toBe(false)
  })
})

describe('caseClaims · pattern', () => {
  const m = model({ 2010: 0.3, 2011: 0.4 })
  it('P1/P6 with ≥ 50% of contracts from one buyer', () => {
    const c = caseClaims(m, P1, name).find((x) => x.key === 'pattern')!
    expect(text(c.es)).toBe('Patrón P1 · peso en su sector (puntaje de regla 0.65); un solo comprador firma el 73% de sus contratos.')
    expect(caseClaims(m, { ...P1, primary_pattern: 'P6' }, name).some((x) => x.key === 'pattern')).toBe(true)
  })
  it('absent for other patterns, a low share, or no queue row', () => {
    expect(caseClaims(m, { ...P1, primary_pattern: 'P5' }, name).some((x) => x.key === 'pattern')).toBe(false)
    expect(caseClaims(m, { ...P1, top_institution_ratio: 0.4 }, name).some((x) => x.key === 'pattern')).toBe(false)
    expect(caseClaims(m, null, name)).toHaveLength(0)
  })
})

describe('caseFacts + caseYear', () => {
  it('marks the crossing and the case year inside the axis', () => {
    const m = model({ 2010: 0.3, 2011: 0.7, 2012: 0.8 })
    expect(caseFacts(m, { caseYear: 2012 }).map((f) => `${f.kind}${f.year}`)).toEqual(['crosses2011', 'case2012'])
    expect(caseFacts(m, { caseYear: 1999 }).map((f) => f.kind)).toEqual(['crosses'])
  })
  it('year_start wins; else a year in the name; else none', () => {
    const base = { case_id: 1, case_type: 'x' }
    expect(caseYear({ ...base, case_name: 'Ring 2025', year_start: 2019 })).toBe(2019)
    expect(caseYear({ ...base, case_name: 'BIRMEX Medicine Overpricing Ring 2025' })).toBe(2025)
    expect(caseYear({ ...base, case_name: 'Vitalmex — 32.06B ISSSTE' })).toBeNull()
    expect(caseYear(null)).toBeNull()
  })
})
