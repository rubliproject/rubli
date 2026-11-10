import { describe, expect, it } from 'vitest'
import type { VendorInstitutionsTimelineResponse } from '@/api/types'
import { buildExpediente } from './expediente'
import { buildLectura, type Claim, type Token } from './lectura'

type Cell = { inst: number; year: number; v: number; n?: number; da?: number; r?: number | null }

/** Build a payload from buyer × year cells (inst 1 = top buyer). */
function payload(cells: Cell[], first: Record<number, number> = {}): VendorInstitutionsTimelineResponse {
  const c = cells.map((x) => ({ institution_id: x.inst, year: x.year, amount_mxn: x.v, n_contracts: x.n ?? 1, n_direct_award: x.da ?? (x.n ?? 1), avg_risk_score: x.r === undefined ? 0.7 : x.r }))
  const ids = [...new Set(c.map((x) => x.institution_id))]
  const institutions = ids.map((id) => {
    const mine = c.filter((x) => x.institution_id === id)
    const ys = mine.map((x) => x.year)
    return {
      institution_id: id, name: `INST ${id}`, siglas: `I${id}`, is_top: true,
      first_year: first[id] ?? Math.min(...ys), last_year: Math.max(...ys),
      amount_mxn: mine.reduce((s, x) => s + x.amount_mxn, 0), n_contracts: mine.length, n_direct_award: 0, avg_risk_score: 0.5,
    }
  }).sort((a, b) => b.amount_mxn - a.amount_mxn)
  const years = [...new Set(c.map((x) => x.year))].sort().map((year) => {
    const mine = c.filter((x) => x.year === year)
    const n = mine.reduce((s, x) => s + x.n_contracts, 0)
    const rs = mine.filter((x) => x.avg_risk_score != null)
    return {
      year, amount_mxn: mine.reduce((s, x) => s + x.amount_mxn, 0), n_contracts: n,
      n_direct_award: mine.reduce((s, x) => s + x.n_direct_award, 0),
      avg_risk_score: rs.length ? rs.reduce((s, x) => s + (x.avg_risk_score as number), 0) / rs.length : null,
    }
  })
  return { vendor_id: 1, top: institutions.length, n_institutions: institutions.length, institutions, years, cells: c }
}

const read = (p: VendorInstitutionsTimelineResponse) => buildLectura(buildExpediente(p)!)
const has = (cs: Claim[], k: Claim['key']) => cs.some((c) => c.key === k)
const text = (ts: Token[]) => ts.map((t) => (typeof t === 'string' ? t : 'b' in t ? t.b : t.inst.siglas)).join('')
const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

describe('buildLectura', () => {
  it('loyalty: only when the top buyer is there every active year', () => {
    const yes = read(payload(span(2010, 2016).map((year) => ({ inst: 1, year, v: 100 }))))
    expect(has(yes.claims, 'loyal')).toBe(true)
    expect(text(yes.claims.find((c) => c.key === 'loyal')!.es)).toContain('7 de 7 años')
    const gap = span(2010, 2016).filter((y) => y !== 2013).map((year) => ({ inst: 1, year, v: 100 }))
    const no = read(payload([...gap, { inst: 2, year: 2013, v: 5 }]))
    expect(has(no.claims, 'loyal')).toBe(false)
  })

  it('newcomers: a buyer arriving in ≥ 3 later sexenios', () => {
    const base = span(2003, 2026).map((year) => ({ inst: 1, year, v: 1000 }))
    const yes = read(payload([...base, { inst: 2, year: 2008, v: 100 }, { inst: 3, year: 2014, v: 100 }, { inst: 4, year: 2020, v: 100 }]))
    const c = yes.claims.find((x) => x.key === 'newcomers')!
    expect(text(c.es)).toContain('3 de 4 sexenios')
    expect(text(c.en)).toContain('I2 under Calderón')
    const no = read(payload([...base, { inst: 2, year: 2008, v: 100 }, { inst: 3, year: 2014, v: 100 }]))
    expect(has(no.claims, 'newcomers')).toBe(false)
  })

  it('switch: tendered until Y, then direct ≥ 3 years to the end', () => {
    const cells = span(2011, 2020).map((year) => ({ inst: 1, year, v: 100, n: 4, da: year <= 2015 ? 0 : 4 }))
    const c = read(payload(cells)).claims.find((x) => x.key === 'switch')!
    expect(text(c.es)).toContain('Hasta 2015')
    expect(text(c.es)).toContain('5 años')
    const short = span(2011, 2017).map((year) => ({ inst: 1, year, v: 100, n: 4, da: year <= 2015 ? 0 : 4 }))
    expect(has(read(payload(short)).claims, 'switch')).toBe(false)
    const never = span(2011, 2017).map((year) => ({ inst: 1, year, v: 100, n: 4, da: 4 }))
    expect(has(read(payload(never)).claims, 'switch')).toBe(false)
    // before 2011 the direct-award flag is empty: a 0 there is no tender
    const blank = span(2005, 2016).map((year) => ({ inst: 1, year, v: 100, n: 4, da: year <= 2010 ? 0 : 4 }))
    expect(has(read(payload(blank)).claims, 'switch')).toBe(false)
    // …it reads as «direct since 2011» instead (≥ 5 recorded years, none tendered)
    expect(text(read(payload(blank)).claims.find((x) => x.key === 'direct')!.es)).toContain('Desde 2011')
    expect(text(read(payload(blank)).claims.find((x) => x.key === 'direct')!.es)).toContain('6 de 6 años')
    expect(has(read(payload(span(2011, 2014).map((year) => ({ inst: 1, year, v: 100, n: 4, da: 4 })))).claims, 'direct')).toBe(false)
    expect(has(read(payload(cells)).claims, 'direct')).toBe(false)
  })

  it('concentration: top share ≥ 25% or half the years critical', () => {
    const yes = read(payload([...span(2010, 2013).map((year) => ({ inst: 1, year, v: 100, r: 0.1 })), { inst: 2, year: 2012, v: 50, r: 0.1 }]))
    const c = yes.claims.find((x) => x.key === 'concentration')!
    expect(text(c.es)).toContain('89%')
    expect(text(c.es)).not.toContain('crítico')
    const crit = read(payload(span(2010, 2013).flatMap((year) => [1, 2, 3, 4, 5].map((inst) => ({ inst, year, v: 100, r: 0.8 })))))
    expect(text(crit.claims.find((x) => x.key === 'concentration')!.es)).toContain('4 de 4 años')
    const no = read(payload(span(2010, 2013).flatMap((year) => [1, 2, 3, 4, 5].map((inst) => ({ inst, year, v: 100, r: 0.1 })))))
    expect(has(no.claims, 'concentration')).toBe(false)
  })

  it('era: one administration with ≥ 40% of the money, among ≥ 2', () => {
    const yes = read(payload([{ inst: 1, year: 2010, v: 900 }, { inst: 1, year: 2020, v: 100 }]))
    expect(text(yes.claims.find((c) => c.key === 'era')!.es)).toContain('90% de su dinero llegó con Calderón')
    const even = read(payload([2004, 2010, 2016, 2020].map((year) => ({ inst: 1, year, v: 100 }))))
    expect(has(even.claims, 'era')).toBe(false)
    expect(has(read(payload([{ inst: 1, year: 2010, v: 900 }])).claims, 'era')).toBe(false)
  })

  it('figures: buyers ≥ 1%, critical years, tendered cells, span', () => {
    const f = read(payload([{ inst: 1, year: 2012, v: 990, r: 0.7, n: 2, da: 0 }, { inst: 2, year: 2014, v: 10, r: 0.1 }, { inst: 2, year: 2009, v: 1, r: null, n: 2, da: 0 }])).figures
    expect(f.map((x) => x.value)).toEqual(['2', '1 / 2', '1 / 2', '2009 · 2014'])
  })
})

describe('buildExpediente', () => {
  it('opens the axis on the term start and folds the rest into grey', () => {
    const m = buildExpediente(payload([{ inst: 1, year: 2009, v: 10 }, { inst: 2, year: 2011, v: 5 }]))!
    expect(m.start).toBe(2007)
    expect(m.years).toHaveLength(5)
    expect(m.chapters.map((c) => c.key)).toEqual(['calderon'])
    expect(m.facts[0]).toMatchObject({ kind: 'first', year: 2009 })
  })
})
