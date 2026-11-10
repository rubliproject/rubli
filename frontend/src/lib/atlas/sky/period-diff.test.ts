import { describe, expect, it } from 'vitest'
import { WHISKER_MIN_PX, cmpOf, cmpToken, defaultPair, diffMarks, diffOf, missingYears, periodDiff, periodLength, whiskerPx, type DiffBody, type DiffStar } from './period-diff'

const meta = {
  year_gaps: [2004], coverage_drop: [2019, 2020, 2021, 2022],
  successors: [[345, 3671, 2021], [1327, 3785, 2023]] as [number, number, number][],
  breaks: {
    '3': { 'pena_nieto>amlo': [[345, 'decline', 3671]] },
    '4': { 'calderon>pena_nieto': [[311, 'decline', null]], 'pena_nieto>amlo': [[311, 'stop', null], [104, 'stop', null], [1201, 'stop', null]] },
  } as unknown as Record<string, Record<string, [number, 'stop' | 'decline', number | null][]>>,
}
const imss: DiffStar = { id: 251, siglas: 'IMSS', sector_id: 1, period_v: [0, 0, 1000, 1000, 100], period_nv: [0, 0, 50, 40, 9], first_data_year: 2010, last_data_year: 2025, gap_years: [] }
const body = (vendor_id: number, pv: number[], pub = true): DiffBody => ({ vendor_id, name: pub ? `V${vendor_id}` : '', public: pub, period_v: pv })
const bodies = [
  body(1, [0, 0, 100, 0, 0]),        // departs
  body(2, [0, 0, 0, 200, 0]),        // arrives
  body(3, [0, 0, 108.9, 15.4, 0]),   // stays, 10.89% → 1.54%
  body(4, [0, 0, 100, 100.5, 0]),    // stays, 10% → 10.05%: under the floor
  body(5, [0, 0, 1, 50, 0], false),  // stays, withheld
]
const run = (star: DiffStar, A = 'pena_nieto' as const, B = 'amlo' as const) =>
  periodDiff({ star, bodies, A, B, meta, rPx: 210, dataCut: '2025-09-28' })

describe('period-diff (spec §3.4, F1, F3, F6)', () => {
  it('arrivals, departures and stays among the drawn; institution-wide counts from period_nv', () => {
    const d = run(imss)
    expect(d.refused).toBeNull()
    expect(d.arrivals.map((r) => r.vendor_id)).toEqual([2])
    expect(d.departures.map((r) => r.vendor_id)).toEqual([1])
    expect(d.stays.map((r) => r.vendor_id).sort()).toEqual([3, 4, 5])
    expect([d.nvA, d.nvB, d.nDrawn]).toEqual([50, 40, 5])
    expect(d.moneyA).toBe(1000)
  })
  it('whiskers only for stays, with the 8 px floor at the Z1 scale', () => {
    const d = run(imss)
    const s3 = d.stays.find((s) => s.vendor_id === 3)!, s4 = d.stays.find((s) => s.vendor_id === 4)!
    expect(s3.shareA).toBeCloseTo(0.1089)
    expect(s3.shareB).toBeCloseTo(0.0154)
    expect(s3.px).toBeGreaterThan(25) // ≈ 31 px at R = 210 (spec §3.4 Px row)
    expect(s3.drawn).toBe(true)
    expect(s4.px).toBeLessThan(WHISKER_MIN_PX)
    expect(s4.drawn).toBe(false)
    expect(whiskerPx(0.1, 0.01, 210)).toBeCloseTo(210 * 0.88 * 0.2)
    expect(d.down.map((s) => s.vendor_id)).toContain(3)
    expect(d.up.map((s) => s.vendor_id)).toContain(5)
  })
  it('refuses a star that stopped reporting: no marks, no counts, the coverage note', () => {
    const cdmx: DiffStar = { id: 1326, siglas: 'CDMX', sector_id: 12, period_v: [0, 9e8, 2.2e10, 1.5e9, 0], period_nv: [0, 61, 196, 82, 0],
      first_data_year: 2008, last_data_year: 2024, gap_years: [2019, 2020, 2021, 2022] }
    const d = run(cdmx)
    expect(d.refused).toEqual({ period: 'amlo', years: [2019, 2020, 2021, 2022], coverage: true })
    expect(d.arrivals).toEqual([])
    expect(d.departures).toEqual([])
    expect(d.stays).toEqual([])
    const z = run(cdmx, 'amlo' as never, 'sheinbaum' as never)
    expect(z.refused?.period).toBe('sheinbaum')
    expect(missingYears(cdmx, 'amlo', [2004])).toEqual([2019, 2020, 2021, 2022])
  })
  it('refuses a period with no money even when no year is missing', () => {
    const d = run({ ...imss, period_v: [0, 0, 1000, 0, 0] })
    expect(d.refused?.period).toBe('amlo')
    expect(d.refused?.coverage).toBe(false)
  })
  it('the successor line (SCT → SICT from 2021) and the sector dagger', () => {
    const sct: DiffStar = { id: 345, siglas: 'SCT', sector_id: 3, period_v: [6e10, 2e11, 3.5e11, 7e7, 0], period_nv: [1, 1, 1, 28, 0],
      first_data_year: 2002, last_data_year: 2020, gap_years: [] }
    const d = run(sct)
    expect(d.refused?.period).toBe('amlo')
    expect(d.successor).toEqual({ to: 3671, year: 2021 })
    expect(d.daggers[0]).toEqual({ star: 345, kind: 'decline', successor: 3671, year: 2021 })
    expect(run(sct, 'calderon' as never, 'pena_nieto' as never).successor).toBeNull()
  })
  it('the Pemex dagger lists the sector for Calderón → Peña Nieto, this star first', () => {
    const pemex: DiffStar = { id: 1201, siglas: 'PEMEX', sector_id: 4, period_v: [2e10, 7.6e10, 4.3e10, 0, 0], period_nv: [9, 9, 9, 0, 0],
      first_data_year: 2002, last_data_year: 2018, gap_years: [] }
    const d = run(pemex, 'calderon' as never, 'pena_nieto' as never)
    expect(d.refused).toBeNull()
    expect(d.daggers).toEqual([{ star: 311, kind: 'decline', successor: null, year: null }])
    const e = run(pemex)
    expect(e.refused?.period).toBe('amlo')
    expect(e.daggers.map((x) => x.star)).toEqual([1201, 311, 104])
  })
  it('Sheinbaum: «sexenio en curso» with the period lengths', () => {
    const d = run(imss, 'amlo' as never, 'sheinbaum' as never)
    expect(d.current).toEqual({ lenA: 6, lenB: periodLength('sheinbaum', '2025-09-28') })
    expect(d.current!.lenB).toBeGreaterThan(0.7)
    expect(d.current!.lenB).toBeLessThan(0.76)
    expect(run(imss).current).toBeNull()
  })
  it('marks by vendor id: none for a refused star; the cmp grammar round-trips', () => {
    const m = diffMarks(run(imss))!
    expect(m.arrive).toEqual([2])
    expect(m.depart).toEqual([1])
    expect(m.whiskers.map((w) => w[0])).not.toContain(4) // under the 8 px floor
    expect(diffMarks(run({ ...imss, period_v: [0, 0, 1000, 0, 0] }))).toBeNull()
    expect(cmpOf(cmpToken(251, 'pena_nieto', 'amlo'))).toEqual({ star: 251, A: 'pena_nieto', B: 'amlo' })
    expect(cmpOf('s251-pena_nieto~s311-amlo')).toBeNull()
    expect(cmpOf('p1~p2')).toBeNull()
  })
  it('default pair and the tab grammar', () => {
    expect(defaultPair('amlo')).toEqual(['pena_nieto', 'amlo'])
    expect(defaultPair(null)).toEqual(['pena_nieto', 'amlo'])
    expect(defaultPair('fox')).toEqual(['fox', 'calderon'])
    expect(diffOf('diff.calderon.amlo')).toEqual(['calderon', 'amlo'])
    expect(diffOf('diff.x.amlo')).toBeNull()
    expect(diffOf('dial')).toBeNull()
  })
})
