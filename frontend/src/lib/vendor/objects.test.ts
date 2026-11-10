import { describe, expect, it } from 'vitest'
import type { VendorInstitutionsTimelineResponse } from '@/api/types'
import { buildExpediente } from './expediente'
import { buildLectura } from './lectura'
import { albersClaims, albersSlabs, albersSpec, columnClaims, columnModules, columnSpec, laneName } from './objects'

type Cell = { inst: number; year: number; v: number; n?: number; da?: number }

function payload(cells: Cell[], names: Record<number, string | null> = {}): VendorInstitutionsTimelineResponse {
  const c = cells.map((x) => ({ institution_id: x.inst, year: x.year, amount_mxn: x.v, n_contracts: x.n ?? 10, n_direct_award: x.da ?? 0, avg_risk_score: 0.5 }))
  const ids = [...new Set(c.map((x) => x.institution_id))]
  const institutions = ids.map((id) => {
    const mine = c.filter((x) => x.institution_id === id), ys = mine.map((x) => x.year)
    return {
      institution_id: id, name: id in names ? names[id] : `INST ${id}`, siglas: id in names ? null : `I${id}`, is_top: true,
      first_year: Math.min(...ys), last_year: Math.max(...ys), amount_mxn: mine.reduce((s, x) => s + x.amount_mxn, 0),
      n_contracts: mine.reduce((s, x) => s + x.n_contracts, 0), n_direct_award: 0, avg_risk_score: 0.5,
    }
  }).sort((a, b) => b.amount_mxn - a.amount_mxn)
  const years = [...new Set(c.map((x) => x.year))].sort().map((year) => {
    const mine = c.filter((x) => x.year === year)
    return { year, amount_mxn: mine.reduce((s, x) => s + x.amount_mxn, 0), n_contracts: mine.reduce((s, x) => s + x.n_contracts, 0), n_direct_award: mine.reduce((s, x) => s + x.n_direct_award, 0), avg_risk_score: 0.5 }
  })
  return { vendor_id: 1, top: institutions.length, n_institutions: institutions.length, institutions, years, cells: c }
}
const model = (cs: Cell[], names?: Record<number, string | null>) => buildExpediente(payload(cs, names))!
const keys = (cs: { key: string }[]) => cs.map((c) => c.key)

// 2002 thin, 2004 missing, 2011–2014 dark (da 9/10), 2018 the widest
const column = model([
  { inst: 1, year: 2002, v: 166e6 }, { inst: 1, year: 2003, v: 400e6 }, { inst: 1, year: 2005, v: 500e6 },
  ...[2011, 2012, 2013, 2014].map((year) => ({ inst: 1, year, v: 2e9, da: 9 })),
  { inst: 1, year: 2018, v: 10e9, da: 2 },
])

describe('La columna', () => {
  it('one module per calendar year; width = money / widest, no floor in the model; da only from 2011', () => {
    const mods = columnModules(column)
    expect(mods.map((d) => d.year)[0]).toBe(2002)
    expect(mods.find((d) => d.year === 2004)!.n).toBe(0)
    expect(mods.find((d) => d.year === 2018)!.w).toBe(1)
    expect(mods.find((d) => d.year === 2002)!.w).toBeCloseTo(166e6 / 10e9)
    expect(mods.find((d) => d.year === 2003)!.da).toBeNull()
    expect(mods.find((d) => d.year === 2011)!.da).toBeCloseTo(0.9)
  })
  it('the money label rides the thin years; an empty year is a dotted piece', () => {
    const spec = columnSpec(columnModules(column), 'es', false)
    expect(spec.labels.some((l) => l.text.startsWith('2002 · '))).toBe(true)
    expect(spec.labels.some((l) => l.text === '2018')).toBe(true) // the last year carries its year
    expect(spec.labels.some((l) => l.text === '2012')).toBe(false) // wide, not a 4th year: no label
    expect(spec.pieces.filter((p) => p.shape === 'oct-dash')).toHaveLength(spec.picks.filter((p) => /sin contratos/.test(p.read)).length)
    expect(spec.picks).toHaveLength(columnModules(column).length)
  })
  it('claims: peak and gap true here; case only with a span; dark only when most recorded years are ≥ 3/4', () => {
    const mods = columnModules(column)
    const c = columnClaims(mods)
    expect(keys(c)).toEqual(expect.arrayContaining(['peak', 'gap', 'dark']))
    expect(c.find((x) => x.key === 'peak')!.es).toContain('2018')
    expect(c.find((x) => x.key === 'gap')!.es).toBe('Sin contratos en 9 de 17 años (los módulos punteados).')
    expect(keys(c)).not.toContain('case')
    const withCase = columnClaims(columnModules(column, { from: 2011, to: 2013 }))
    expect(withCase.find((x) => x.key === 'case')!.es).toContain('2011–2013')
    const light = columnClaims(columnModules(model([2011, 2012, 2013].map((year) => ({ inst: 1, year, v: 1e9, da: 2 })))))
    expect(keys(light)).not.toContain('dark')
    expect(keys(light)).not.toContain('gap')
  })
})

// three administrations; supplier 1 holds most of AMLO, nothing before 2007
const inst = model([
  ...[2008, 2010].map((year) => ({ inst: 1, year, v: 1e9 })),
  ...[2014, 2016].map((year) => ({ inst: 2, year, v: 2e9, da: 3 })),
  ...[2014, 2016].map((year) => ({ inst: 3, year, v: 1e9, da: 1 })),
  ...[2020, 2022].map((year) => ({ inst: 1, year, v: 4e9, da: 9 })),
  { inst: 4, year: 2020, v: 1e9, da: 10 },
], { 4: null })

describe('Homenaje al cuadrado', () => {
  it('side = √(money / the largest term) so area is money; inner = the term’s three largest lanes', () => {
    const slabs = albersSlabs(inst)
    expect(slabs.map((s) => s.chapter.key)).toEqual(['calderon', 'epn', 'amlo'])
    const amlo = slabs.find((s) => s.chapter.key === 'amlo')!
    expect(amlo.side).toBe(1)
    const epn = slabs.find((s) => s.chapter.key === 'epn')!
    expect(epn.side ** 2).toBeCloseTo(6e9 / 9e9)
    expect(epn.inner.map((r) => r.lane.id)).toEqual([2, 3])
    expect(slabs[0].chapter.da).toBeNull() // Calderón opens before 2011: no procedure reading
  })
  it('every inner square stays inside the one under it; labels hang from the near edge', () => {
    const spec = albersSpec(albersSlabs(inst), 'es', true)
    expect(spec.labels.every((l) => l.anchor === 't' && l.at[1] === 0)).toBe(true)
    expect(spec.labels.map((l) => l.row)).toEqual([0, 1, 0])
    const slab = spec.pieces.find((p) => p.size[1] > 0.3 && p.at[0] === spec.pieces[spec.pieces.length - 1].at[0])!
    for (const p of spec.pieces.filter((q) => q.at[0] === slab.at[0] && q !== slab)) {
      expect(p.at[2] + p.size[2] / 2).toBeLessThanOrEqual(slab.size[2] / 2)
      expect(p.at[2] - p.size[2] / 2).toBeGreaterThanOrEqual(-slab.size[2] / 2)
    }
  })
  it('claims: largest / dark / heavy hold here and fail on a flat, tendered record', () => {
    const c = albersClaims(albersSlabs(inst))
    expect(c.find((x) => x.key === 'largest')!.es).toContain('AMLO')
    expect(c.find((x) => x.key === 'dark')!.es).toContain('1 de 2')
    expect(c.find((x) => x.key === 'heavy')!.es).toContain('100% del dinero de Calderón')
    const flat = albersClaims(albersSlabs(model([2014, 2020].map((year) => ({ inst: 1, year, v: 1e9, da: 1 })).concat([2014, 2020].map((year) => ({ inst: 2, year, v: 1e9, da: 1 }))))))
    expect(keys(flat)).not.toContain('dark')
    expect(keys(flat)).toContain('heavy') // 50% of each term is still ≥ 25%
    expect(keys(albersClaims(albersSlabs(model([{ inst: 1, year: 2014, v: 1e9 }]))))).not.toContain('largest')
  })
  it('a withheld name reads as a persona física, never blank', () => {
    const lane = inst.lanes.find((l) => l.id === 4)!
    expect(laneName({ ...lane, type: 'vendor' }, 'es')).toBe('Nombre no publicado')
    expect(laneName({ ...lane, type: 'vendor' }, 'en')).toBe('Name not published')
  })
})

describe('La lectura counts', () => {
  it('the loyalty count prints the record’s count when given, the cells’ sum otherwise', () => {
    const m = model([2019, 2020, 2021, 2022, 2023].map((year) => ({ inst: 1, year, v: 1e9, n: 10 })))
    const sum = buildLectura(m).claims.find((c) => c.key === 'loyal')!
    expect(JSON.stringify(sum.es)).toContain('50 contratos')
    const api = buildLectura(m, { 1: 46 }).claims.find((c) => c.key === 'loyal')!
    expect(JSON.stringify(api.es)).toContain('46 contratos')
  })
})

describe('review build 1 fixes', () => {
  it('B1 · every inner square is drawn at its true area (side = 7·√(money / largest term)), never shrunk to fit', () => {
    const slabs = albersSlabs(inst)
    const maxA = Math.max(...slabs.map((s) => s.chapter.amount))
    const spec = albersSpec(slabs, 'es', false)
    const inner = spec.pieces.filter((p) => p.pick != null && spec.picks[p.pick].key.includes(':'))
    const want = slabs.flatMap((s) => s.inner.map((r) => 7 * Math.sqrt(r.amount / maxA)))
    expect(inner.map((p) => p.size[0])).toEqual(want.map((w) => expect.closeTo(w, 9)))
  })
  it('B2 · no procedure on record (before 2011) is hatched, never a ramp tone', () => {
    const col = columnSpec(columnModules(column), 'es', false)
    const y2003 = col.pieces.find((p) => p.pick != null && col.picks[p.pick].key === '2003')!
    expect(y2003.tone).toEqual({ hatch: true })
    const y2011 = col.pieces.find((p) => p.pick != null && col.picks[p.pick].key === '2011')!
    expect(y2011.tone).toEqual({ mix: 0.9 })
    const alb = albersSpec(albersSlabs(inst), 'es', false)
    expect(alb.pieces.find((p) => p.pick != null && alb.picks[p.pick].key === 'calderon')!.tone).toEqual({ hatch: true })
  })
  it('B3 · the column starts at the first year with a contract (no invented empty years before it)', () => {
    const late = model([2017, 2019].map((year) => ({ inst: 1, year, v: 1e9 }))) // the expediente axis opens in 2013 (the sexenio)
    expect(late.start).toBeLessThan(2017)
    const mods = columnModules(late)
    expect(mods[0].year).toBe(2017)
    expect(mods.map((d) => d.year)).toEqual([2017, 2018, 2019])
    expect(columnSpec(mods, 'es', false).labels.filter((l) => l.kind === 'yr').map((l) => l.text.slice(0, 4))).toEqual(['2017', '2018', '2019'])
  })
})
