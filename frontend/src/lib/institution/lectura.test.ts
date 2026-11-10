import { describe, expect, it } from 'vitest'
import type { InstitutionVendorsTimelineResponse } from '@/api/types'
import { buildExpediente } from '@/lib/vendor/expediente'
import type { Token } from '@/lib/vendor/lectura'
import { buildInstitutionLectura, type Claim } from './lectura'

type Cell = { v: number; year: number; amt: number; n?: number; da?: number; r?: number | null }

/** An institution payload from vendor × year cells (vendor 1 = the largest). top5/top come from the cells. */
function payload(cells: Cell[]): InstitutionVendorsTimelineResponse {
  const c = cells.map((x) => ({ vendor_id: x.v, year: x.year, amount_mxn: x.amt, n_contracts: x.n ?? 1, n_direct_award: x.da ?? (x.n ?? 1), avg_risk_score: x.r === undefined ? 0.3 : x.r }))
  const ids = [...new Set(c.map((x) => x.vendor_id))]
  const vendors = ids.map((id) => {
    const mine = c.filter((x) => x.vendor_id === id)
    const ys = mine.map((x) => x.year)
    return {
      vendor_id: id, name: `VENDOR ${id}`, is_top: true, first_year: Math.min(...ys), last_year: Math.max(...ys),
      amount_mxn: mine.reduce((s, x) => s + x.amount_mxn, 0), n_contracts: mine.length, n_direct_award: 0, avg_risk_score: 0.3,
    }
  }).sort((a, b) => b.amount_mxn - a.amount_mxn)
  const years = [...new Set(c.map((x) => x.year))].sort().map((year) => {
    const mine = c.filter((x) => x.year === year).sort((a, b) => b.amount_mxn - a.amount_mxn)
    const v = mine.reduce((s, x) => s + x.amount_mxn, 0)
    const rs = mine.filter((x) => x.avg_risk_score != null)
    return {
      year, amount_mxn: v, n_contracts: mine.reduce((s, x) => s + x.n_contracts, 0),
      n_direct_award: mine.reduce((s, x) => s + x.n_direct_award, 0),
      avg_risk_score: rs.length ? rs.reduce((s, x) => s + (x.avg_risk_score as number), 0) / rs.length : null,
      top_vendor_id: mine[0].vendor_id, top_share: mine[0].amount_mxn / v,
      top5_share: mine.slice(0, 5).reduce((s, x) => s + x.amount_mxn, 0) / v, hhi: null,
    }
  })
  return { institution_id: 1, top: vendors.length, n_vendors: vendors.length, vendors, years, cells: c }
}

const read = (p: InstitutionVendorsTimelineResponse) => buildInstitutionLectura(buildExpediente(p)!)
const get = (cs: Claim[], k: Claim['key']) => cs.find((c) => c.key === k)
const text = (ts: Token[]) => ts.map((t) => (typeof t === 'string' ? t : 'b' in t ? t.b : t.inst.name)).join('')
/** n vendors with equal money in each given year. */
const flat = (years: number[], n: number, amt = 100, extra: Partial<Cell> = {}) =>
  years.flatMap((year) => Array.from({ length: n }, (_, k) => ({ v: k + 1, year, amt, ...extra })))

describe('buildInstitutionLectura', () => {
  it('concentration: needs ≥ 5 vendors; the trend only when the top 5 moved ≥ 5 points', () => {
    const steady = read(payload(flat([2008, 2014], 10)))
    expect(text(get(steady.claims, 'concentration')!.es)).toContain('50%')
    expect(text(get(steady.claims, 'concentration')!.es)).not.toContain('pasaron')
    // 2008: 5 of 10 equal vendors (50%); 2014: vendor 1 alone holds most (top 5 ≈ 96%)
    const moved = read(payload([...flat([2008], 10), { v: 1, year: 2014, amt: 5000 }, ...flat([2014], 10).filter((c) => c.v > 1).map((c) => ({ ...c, amt: 40 }))]))
    expect(text(get(moved.claims, 'concentration')!.es)).toMatch(/pasaron de 50% con Calderón a \d+% con Peña Nieto/)
    expect(get(read(payload(flat([2008, 2014], 4))).claims, 'concentration')).toBeUndefined()
  })

  it('largest: from 1% of the spend; «led the year» from 2 years', () => {
    const p = payload([...[2010, 2011, 2012].map((year) => ({ v: 1, year, amt: 500 })), ...flat([2010, 2011, 2012], 3).filter((c) => c.v > 1)])
    const c = get(read(p).claims, 'largest')!
    expect(text(c.es)).toContain('VENDOR 1')
    expect(text(c.es)).toContain('3 veces')
    expect(text(c.en)).toContain('2010–2012')
    const tiny = payload([{ v: 1, year: 2010, amt: 1 }, ...Array.from({ length: 200 }, (_, k) => ({ v: k + 2, year: 2010, amt: 1 }))])
    expect(get(read(tiny).claims, 'largest')).toBeUndefined()
  })

  it('daShift: ≥ 10 points between the first and last sexenio with ≥ 50 contracts', () => {
    const yes = read(payload([{ v: 1, year: 2014, amt: 100, n: 100, da: 40 }, { v: 1, year: 2020, amt: 100, n: 100, da: 80 }]))
    expect(text(get(yes.claims, 'daShift')!.es)).toBe('Sin licitación: 40% de sus contratos con Peña Nieto, 80% con AMLO.')
    expect(yes.figures.find((f) => f.key === 'da')).toBeUndefined() // the claim says it
    const small = read(payload([{ v: 1, year: 2014, amt: 100, n: 100, da: 70 }, { v: 1, year: 2020, amt: 100, n: 100, da: 75 }]))
    expect(small.figures.find((f) => f.key === 'da')!.value).toBe('70% → 75%')
    const flatDa = read(payload([{ v: 1, year: 2014, amt: 100, n: 100, da: 40 }, { v: 1, year: 2020, amt: 100, n: 100, da: 45 }]))
    expect(get(flatDa.claims, 'daShift')).toBeUndefined()
    const thin = read(payload([{ v: 1, year: 2014, amt: 100, n: 10, da: 1 }, { v: 1, year: 2020, amt: 100, n: 100, da: 80 }]))
    expect(get(thin.claims, 'daShift')).toBeUndefined()
    // before 2011 the flag is empty: Calderón's 0% is a missing field, not a tender
    const blank = read(payload([{ v: 1, year: 2008, amt: 100, n: 100, da: 0 }, { v: 1, year: 2020, amt: 100, n: 100, da: 80 }]))
    expect(get(blank.claims, 'daShift')).toBeUndefined()
  })

  it('oneTerm: a large vendor whose run fits one closed sexenio', () => {
    const base = flat([2004, 2010, 2016, 2022], 3)
    const yes = read(payload([...base, { v: 9, year: 2014, amt: 300 }, { v: 9, year: 2017, amt: 300 }]))
    expect(text(get(yes.claims, 'oneTerm')!.es)).toContain('1 de 4')
    expect(text(get(yes.claims, 'oneTerm')!.es)).toContain('sólo con Peña Nieto (2014–2017)')
    // still selling in the last year: not «one sexenio»
    expect(get(read(payload([...base, { v: 9, year: 2021, amt: 300 }, { v: 9, year: 2022, amt: 300 }])).claims, 'oneTerm')).toBeUndefined()
    expect(get(read(payload(base)).claims, 'oneTerm')).toBeUndefined()
  })

  it('leaders: the vendor that led most years of each sexenio, from 2 sexenios', () => {
    const p = payload([
      ...[2013, 2014, 2015].map((year) => ({ v: 1, year, amt: 500 })), { v: 2, year: 2016, amt: 900 },
      ...[2019, 2020].map((year) => ({ v: 3, year, amt: 700 })),
      ...flat([2013, 2014, 2015, 2016, 2019, 2020], 4, 100).map((c) => ({ ...c, v: c.v + 10 })),
    ])
    const l = read(p).leaders
    expect(l.map((x) => [x.chapter, x.inst.id, x.years, x.of])).toEqual([['Peña Nieto', 1, 3, 4], ['AMLO', 3, 2, 2]])
    expect(read(payload(flat([2013, 2014], 3))).leaders).toEqual([])
  })

  it('figures: vendors ≥ 1%, critical years', () => {
    const f = read(payload([{ v: 1, year: 2010, amt: 990, r: 0.7 }, { v: 2, year: 2012, amt: 10, r: 0.1 }])).figures
    expect(f.map((x) => x.key)).toEqual(['big', 'crit'])
    expect(f.map((x) => x.value)).toEqual(['2', '1 / 2'])
  })
})

describe('buildExpediente on an institution', () => {
  it('draws the concentration when the lanes hold too little of the money', () => {
    const many = [...flat([2010, 2011], 40, 100), ...flat([2010, 2011], 1, 10).map((c) => ({ ...c, v: 99 }))]
    const p = payload(many)
    p.vendors = p.vendors.map((v, k) => ({ ...v, is_top: k < 8 }))
    const m = buildExpediente(p)!
    expect(m.laneType).toBe('vendor')
    expect(m.lanes[0].type).toBe('vendor')
    expect(m.ribbonMode).toBe('share')
    expect(m.facts.some((f) => f.kind === 'first')).toBe(false)
    const few = buildExpediente(payload(flat([2010, 2011], 3)))!
    expect(few.ribbonMode).toBe('stack')
  })

  it('a sliver year (2004: 1 contract) is no concentration reading', () => {
    const m = buildExpediente(payload([...flat([2003, 2005], 10, 100, { n: 100 }), { v: 99, year: 2004, amt: 1, n: 1 }]))!
    expect(m.shareYears).toEqual([2003, 2005])
    expect(m.shareMax).toBe(0.5)
  })
})
