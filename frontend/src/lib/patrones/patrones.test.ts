import { describe, expect, it } from 'vitest'
import type { NsvPage } from '@/api/noSeVe'
import { buildModel } from '@/lib/noSeVe/model'
import page from '@/lib/noSeVe/__fixtures__/page.json'
import { ageFinding, applyFilter, buyers, shareOf, finding, firms, inFirstYear, inPattern, type FirmRow } from './arranque'
import { BLIND_BELOW, enteRows, quienFinding, ratioOf, span, tagOf } from './gasto'

const firm = (o: Partial<FirmRow>): FirmRow => ({
  vendor_id: 1, vendor_name: 'EMPRESA SA DE CV', first_date: '2024-04-25', first_year: 2024, first_contract_id: 9,
  y1_mxn: 200e6, y1_n: 3, y1_da_share: 1, days_to_threshold: 1, incorp_bucket: 'lt180', censored: 0, flag_10b: 0,
  age_days: 150, institution_id: 251, institution_name: 'IMSS', institution_siglas: 'IMSS', sector_id: 1, ...o,
})

describe('El arranque · the pattern', () => {
  it('keeps a firm under a year old, mostly without a tender', () => {
    expect(inPattern(firm({}))).toBe(true)
  })
  it('drops a firm a year old or more, a tendered one, an unnamed one, an APP vehicle', () => {
    expect(inPattern(firm({ age_days: 365 }))).toBe(false)
    expect(inPattern(firm({ y1_da_share: 0.49 }))).toBe(false)
    expect(inPattern(firm({ vendor_id: null }))).toBe(false)
    expect(inPattern(firm({ vendor_name: 'APP CARRETERA SA DE CV' }))).toBe(false)
  })
  it('falls back to the bucket when the age is not dated', () => {
    expect(inPattern(firm({ age_days: null, incorp_bucket: 'lt365' }))).toBe(true)
    expect(inPattern(firm({ age_days: null, incorp_bucket: 'ge5y' }))).toBe(false)
  })
  it('ranks by first-year money and filters by sector and buyer', () => {
    const R = firms([firm({ vendor_id: 1, y1_mxn: 1e8 }), firm({ vendor_id: 2, y1_mxn: 9e8, sector_id: 3, institution_id: 117 }), firm({ vendor_id: 3, age_days: 900 })])
    expect(R.map((r) => r.vendor_id)).toEqual([2, 1])
    expect(applyFilter(R, { sector: 3 }).map((r) => r.vendor_id)).toEqual([2])
    expect(applyFilter(R, { buyer: 251 }).map((r) => r.vendor_id)).toEqual([1])
    expect(applyFilter(R, {}).length).toBe(2)
    expect(buyers([...R, firm({ vendor_id: 4 })]).map((b) => [b.id, b.n])).toEqual([[251, 2], [117, 1]])
  })
  it('finds the median age and the youngest firm, skipping undated ones', () => {
    const F = ageFinding([firm({ vendor_id: 1, age_days: 300 }), firm({ vendor_id: 2, age_days: 9 }), firm({ vendor_id: 3, age_days: 200 }), firm({ vendor_id: 4, age_days: null })])!
    expect(F.n).toBe(3)
    expect(F.median).toBe(200)
    expect(F.youngest.vendor_id).toBe(2)
    expect(F.median === 300).toBe(false)
    expect(ageFinding([firm({ age_days: 100 }), firm({ age_days: 200 })])!.median).toBe(150)
    expect(ageFinding([firm({ age_days: null })])).toBeNull()
  })
  it('shares first-year money of the listed total', () => {
    const R = [firm({ y1_mxn: 300 }), firm({ y1_mxn: 100 })]
    expect(shareOf(R[0], R)).toBe(0.75)
    expect(shareOf(R[0], [])).toBe(0)
  })
  it('windows the first year and computes the finding', () => {
    expect(inFirstYear('2024-04-25', '2025-04-24')).toBe(true)
    expect(inFirstYear('2024-04-25', '2025-04-25')).toBe(false)
    expect(inFirstYear('2024-04-25', '2024-04-24')).toBe(false)
    expect(inFirstYear('2024-04-25', null)).toBe(false)
    const f = finding([firm({ age_days: 100 }), firm({ vendor_id: 2, age_days: 300, sector_id: 3, institution_id: 117 })])
    expect(f).toEqual({ n: 2, mxn: 400e6, under180: 1, sectors: 2, buyers: 2 })
  })
})

describe('Gasto a ciegas · the board', () => {
  const p = page as unknown as NsvPage
  const m = buildModel(p.entities, p.meta.cp_years)!
  const R = enteRows(m)
  it('leads with the project and lists its own units once', () => {
    expect(R[0].e.grp).toBe('proj')
    const keys = R.map((r) => r.e.key)
    for (const e of m.ents) if (e.grp !== 'proj' && e.ids.every((id) => m.proj.ids.includes(id))) expect(keys).not.toContain(e.key)
  })
  it('orders comparable rows blindest first, then not comparable, then out by law', () => {
    const tags = R.slice(1).map((r) => r.tag)
    const firstNoComp = tags.indexOf('nocomp'), firstFuera = tags.indexOf('fuera')
    if (firstNoComp >= 0) expect(tags.slice(firstNoComp).every((t) => t === 'nocomp' || t === 'singasto' || t === 'fuera')).toBe(true)
    if (firstFuera >= 0) expect(tags.slice(firstFuera).every((t) => t === 'fuera')).toBe(true)
    const shares = R.slice(1).filter((r) => r.tag === 'ciegas' || r.tag === 'visible').map((r) => r.e.share!)
    expect(shares).toEqual([...shares].sort((a, b) => a - b))
  })
  it('tags each row and gives the ratio only when comparable', () => {
    const e = { ...m.proj, share: 0.3 }
    expect([tagOf(e), ratioOf(e)]).toEqual(['ciegas', 0.3])
    expect([tagOf({ ...e, share: 0.5 }), ratioOf({ ...e, share: 0.95 })]).toEqual(['visible', 0.95])
    expect([tagOf({ ...e, share: 1.1 }), ratioOf({ ...e, share: 1.1 })]).toEqual(['nocomp', null])
    expect([tagOf({ ...e, grp: 'ley' }), ratioOf({ ...e, grp: 'ley' })]).toEqual(['fuera', null])
    expect(tagOf({ ...e, share: null })).toBe('singasto')  // zero spending is not «its own law»
    expect(span({ ...R[0], y0: 2020, y1: 2025 })).toBe('2020–25')
    expect(span({ ...R[0], y0: 2024, y1: 2024 })).toBe('2024')
  })
})

describe('Gasto a ciegas · chapter I finding', () => {
  const p = page as unknown as NsvPage
  const m = buildModel(p.entities, p.meta.cp_years)!
  it('counts only comparable entities, and blind ones under half', () => {
    const F = quienFinding(m)
    const comp = m.ents.filter((e) => e.grp !== 'ley' && e.share != null && e.share <= 1)
    expect(F.n).toBe(comp.length)
    expect(F.blind).toBe(comp.filter((e) => e.share! < BLIND_BELOW).length)
    expect(F.blind <= F.n).toBe(true)
    expect(F.civMedian).toBe(m.civMedian)
    expect(F.semar == null || F.semar <= 1).toBe(true)
  })
})
