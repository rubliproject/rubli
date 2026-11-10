import { describe, expect, it } from 'vitest'
import type { CapturaBuyer, CapturaPair } from '@/api/captura'
import { buildCapturaLectura, type Claim } from './lectura'
import { CFE, IMSS, PEP, YEARS, buildRelevo } from './relevo'

const N = YEARS.length
const k = (y: number) => y - 2002
function buyer(id: number, sector: number, total: (y: number) => number, cap: (y: number) => number): CapturaBuyer {
  return {
    institution_id: id, name: `B${id}`, siglas: null, sector_id: sector, total: 0, cap: 0, cap_share: 0, n: 0, da: null, m11: 0,
    post: 0, post_n: 0, post_total: 0, post_total_n: 0, y_total: YEARS.map(total), y_cap: YEARS.map(cap), y_n: Array(N).fill(0),
    pf_n: 0, pf_m: 0, pub_n: 0, pub_m: 0, fp_n: 0, n_doc: 0, n_lead: 0, median_years: 0,
  }
}
let vid = 1
function pairs(inst: number, n: number, y0: number, y1: number, risk = 0.2): CapturaPair[] {
  return Array.from({ length: n }, () => ({
    vendor_id: vid++, institution_id: inst, name: 'X', m: 1e8, sh: 0.9, y0, y1, ny: y1 - y0 + 1, lock0: null, lock1: null, lockrun: 0,
    da: null, flag: 0, post: 0, post_n: 0, gt: null, risk,
  }))
}

/** A world where every claim holds: energy left CompraNet, health holds the current captives, the IMSS
 *  peaked at 50% in 2021, Fox's cohort survives less than AMLO's, the indicator is low. */
function world(o: { pepStays?: boolean; healthSmall?: boolean; imssLow?: boolean; foxSurvives?: boolean; risk?: number; empty?: boolean; noPost?: boolean } = {}) {
  const B = [
    buyer(PEP, 4, (y) => (o.empty ? 0 : o.pepStays || y <= 2015 ? 10e9 : 0), (y) => (o.empty ? 0 : y <= 2015 ? 4e9 : 0)),
    buyer(CFE, 4, (y) => (o.empty ? 0 : y <= 2018 ? 10e9 : 0), (y) => (o.empty ? 0 : y <= 2018 ? 3e9 : 0)),
    buyer(IMSS, 1, () => (o.empty ? 0 : 10e9), (y) => (o.empty ? 0 : y === 2021 ? (o.imssLow ? 1e9 : 5e9) : 2e9)),
  ]
  const P = [
    ...pairs(PEP, 60, 2003, o.foxSurvives ? 2025 : 2014, o.risk), ...pairs(CFE, 40, 2008, 2018, o.risk),
    ...pairs(IMSS, o.foxSurvives ? 60 : 6, 2003, 2025, o.risk), ...pairs(IMSS, o.foxSurvives ? 0 : 54, 2003, 2010, o.risk),
    ...pairs(IMSS, 60, 2019, o.healthSmall ? 2020 : 2025, o.risk), ...pairs(PEP, o.healthSmall ? 80 : 0, 2019, 2025, o.risk),
  ]
  if (!o.noPost) P[P.length - 1] = { ...P[P.length - 1], post_n: 3, post: 1e7 }
  return buildRelevo(B, P)
}
const keys = (cs: Claim[]) => cs.map((c) => c.key)

describe('captura «La lectura»', () => {
  it('every claim renders when its condition holds', () => {
    expect(keys(buildCapturaLectura(world()))).toEqual(['vigentes', 'siguen', 'sexenios', 'energia', 'salud', 'imss', 'cohortes', 'modelo'])
  })
  it('siguen: absent when no captive signed after the blackout; vigentes: absent with no current pair', () => {
    expect(keys(buildCapturaLectura(world({ noPost: true })))).not.toContain('siguen')
    expect(keys(buildCapturaLectura(buildRelevo([], [])))).not.toContain('vigentes')
  })
  it('sexenios: absent without spend', () => {
    expect(keys(buildCapturaLectura(world({ empty: true })))).not.toContain('sexenios')
  })
  it('energia: absent while Pemex Exploración still publishes', () => {
    expect(keys(buildCapturaLectura(world({ pepStays: true })))).not.toContain('energia')
  })
  it('salud: absent when another sector holds more current captives', () => {
    expect(keys(buildCapturaLectura(world({ healthSmall: true })))).not.toContain('salud')
  })
  it('imss: absent when no IMSS year reaches 40%', () => {
    const r = world({ imssLow: true })
    expect(r.buyerPeak(IMSS)!.share).toBeLessThan(0.4)
    expect(keys(buildCapturaLectura(r))).not.toContain('imss')
  })
  it('cohortes: absent when the oldest cohort survives as well as the newest', () => {
    expect(keys(buildCapturaLectura(world({ foxSurvives: true })))).not.toContain('cohortes')
  })
  it('modelo: absent when the mean indicator is high', () => {
    expect(keys(buildCapturaLectura(world({ risk: 0.7 })))).not.toContain('modelo')
  })
  it('the model: sexenio shares, energy first in the ribbon, the last CompraNet year', () => {
    const r = world()
    expect(r.series[0].sector).toBe(4)
    expect(r.leaves(PEP)).toBe(2016)
    expect(r.chapters.find((c) => c.key === 'fox')!.share).toBeCloseTo(0.3, 5)
    expect(r.buyerPeak(IMSS)).toMatchObject({ y: 2021, share: 0.5 })
    expect(r.cur.every((p) => p.y1 >= 2024)).toBe(true)
    expect(k(2025)).toBe(N - 1)
  })
})
