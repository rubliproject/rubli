import { describe, expect, it } from 'vitest'
import type { AriaEscenarioResponse } from '@/api/types'
import { buyersIn, decodeEscenario, hasCase, inScenario, moneyIn, patternsIn, questionText, rankScenario, sectorSplit, totals, vendorSky, whyList } from './escenario'

const payload: AriaEscenarioResponse = {
  run: null, sexenios: ['fox', 'calderon', 'pena_nieto', 'amlo', 'sheinbaum'], n: 3,
  cols: {
    id: [1, 2, 3], name: ['A SA', 'B SA', 'C SA'], pf: [0, 1, 0], sec: [1, 1, 4], pat: ['P6', 'P2', null], tier: [1, 2, 3],
    ips: [0.9, 0.7, 0.5], risk: [0.7, 0.3, null], inst: [10, 10, 20], inst_name: ['IMSS', 'IMSS', 'PEMEX'],
    value: [100, 50, 500], n: [3, 2, 9], y0: [2010, 2020, 2003], y1: [2024, 2024, 2024], da: [1, 0.5, 0.2], sb: [null, null, null], ratio: [0.9, 0.5, 0.3],
    gone: [0, 0, 0], efos: [0, 1, 0], sfp: [0, 0, 0], gt: [1, 0, 0],
    sx: [[0, 20, 30, 50, 0], [0, 0, 0, 50, 0], [100, 100, 100, 100, 100]],
    // vendor 1 sells mostly in Salud (1) but also in Energía (4) under AMLO; vendor 3 only in Energía
    ss: [[[1, [0, 20, 30, 20, 0]], [4, [0, 0, 0, 30, 0]]], [[1, [0, 0, 0, 50, 0]]], [[4, [100, 100, 100, 100, 100]]]],
    asp: [[['ratio', 0.9, 0.95]], [['efos', 1, 0.98], ['new', 2020, 0.9]], []],
  },
}

describe('escenario', () => {
  const vs = decodeEscenario(payload)
  it('decodes columns into rows and re-indexes sexenio money', () => {
    expect(vs).toHaveLength(3)
    expect(vs[0].sx).toEqual([0, 20, 30, 50, 0])
    expect(vs[1].persona_fisica).toBe(true)
    expect(vs[1].aspects.map((a) => a.k)).toEqual(['efos', 'new'])
    expect(moneyIn(vs[0], null)).toBe(100)
    expect(moneyIn(vs[0], 'amlo')).toBe(50)
    expect(moneyIn(vs[0], 'fox')).toBe(0)
    // in a sector: only what it received there
    expect(moneyIn(vs[0], null, 1)).toBe(70)
    expect(moneyIn(vs[0], 'amlo', 4)).toBe(30)
    expect(moneyIn(vs[0], 'amlo', 2)).toBe(0)
    expect(sectorSplit(vs[0], 'amlo')).toEqual([{ sector: 4, money: 30 }, { sector: 1, money: 20 }])
  })
  it('a sector filter keeps every vendor that sells there and ranks by its money in that sector', () => {
    const all = { sx: null, sector: null, inst: null, pat: null, caso: true }
    // Energía: vendor 3 (main) and vendor 1 (sells there under AMLO) — vendor 2 never
    expect(rankScenario(vs, { ...all, sector: 4 }, 'money').map((v) => [v.vendor_id, moneyIn(v, null, 4)])).toEqual([[3, 500], [1, 30]])
    expect(rankScenario(vs, { ...all, sector: 4, sx: 'fox' }, 'money').map((v) => v.vendor_id)).toEqual([3])
    // the sky keeps one dot per vendor, in its main sector, whatever the focus
    const m = vendorSky(vs, null, null, 12, 4)
    expect(m.stars.id).toHaveLength(3)
    expect(m.stars.sector[m.stars.id.indexOf(1)]).toBe(1)
    expect(m.stars.v[m.stars.id.indexOf(3)]).toBe(500)
    // a side line (< ¼ of its money in the period, not its main sector) is not «who sells in Energía»
    const side = { ...vs[0], ss: [{ sector: 1, sx: [0, 20, 30, 30, 0] }, { sector: 4, sx: [0, 0, 0, 20, 0] }] }
    expect(inScenario([side], { ...all, sector: 4 })).toHaveLength(0)
    expect(inScenario([side], { ...all, sector: 4, sx: 'amlo' })).toHaveLength(1)
  })
  it('a RUBLI case citing the press counts as a public case (never «nadie lo ha investigado»)', () => {
    const pub = decodeEscenario({ ...payload, cols: { ...payload.cols, pub: [0, 0, 1] } })
    expect(pub.map(hasCase)).toEqual([true, true, true])
    expect(rankScenario(pub, { sx: null, sector: null, inst: null, pat: null })).toHaveLength(0)
  })
  it('hides the vendors with a public case unless asked, and ranks by signals (IPS)', () => {
    expect(vs.map(hasCase)).toEqual([true, true, false])
    const all = { sx: null, sector: null, inst: null, pat: null, caso: true }
    expect(rankScenario(vs, { ...all, caso: false }).map((v) => v.vendor_id)).toEqual([3])
    expect(rankScenario(vs, all).map((v) => v.vendor_id)).toEqual([1, 2, 3])
    // equal to two decimals = a tie: same Nº, the indicator orders it
    const tie = [{ ...vs[2], vendor_id: 7, ips_final: 0.866, avg_risk_score: 0.3 }, { ...vs[2], vendor_id: 8, ips_final: 0.869, avg_risk_score: 0.7 }, { ...vs[2], vendor_id: 9, ips_final: 0.8 }]
    expect(rankScenario(tie, all).map((v) => [v.vendor_id, v.rank])).toEqual([[8, 1], [7, 1], [9, 3]])
    expect(rankScenario(vs, { ...all, sx: 'fox' }).map((v) => v.vendor_id)).toEqual([3])
    expect(rankScenario(vs, { ...all, sx: 'amlo', sector: 1 }).map((v) => v.vendor_id)).toEqual([1, 2])
    expect(rankScenario(vs, { ...all, sx: 'amlo', sector: 1, inst: 10, pat: 'P2' }).map((v) => v.vendor_id)).toEqual([2])
    expect(rankScenario(vs, all, 'money').map((v) => v.vendor_id)).toEqual([3, 1, 2])
    expect(rankScenario(vs, all, 'contracts').map((v) => v.vendor_id)).toEqual([3, 1, 2])
    expect(rankScenario(vs, all, 'risk')[0].vendor_id).toBe(1)
    // two críticos tie at «≥ 0.60»: the money decides, never the hidden decimal
    const tied = vs.map((v) => ({ ...v, avg_risk_score: v.vendor_id === 3 ? 0.61 : v.vendor_id === 1 ? 0.95 : 0.1 }))
    expect(rankScenario(tied, all, 'risk').map((v) => v.vendor_id)).toEqual([3, 1, 2])
    expect(rankScenario(vs, { ...all, sx: 'amlo' })[0].rank).toBe(1)
  })
  it('says why in plain words: the pattern first, then what sets it apart from the OTHER listed rows', () => {
    const w = whyList(vs, 'es')
    expect(w[0]).toEqual(['comprador único', '9 de cada 10 contratos con IMSS'])
    // row 2 has a buyer share too, but row 1 took that kind: its arrival is the next standout
    expect(w[1][0]).toBe('sin historial')
    expect(w[1][1]).toMatch(/^apareció en 2020: .+ en 5 años$/)
    expect(w[2]).toEqual([])  // nothing distinctive, no pattern → «—»
    expect(whyList([vs[1]], 'en')[0][0]).toBe('no track record')
    // never «X MDP por contrato», never the indicator; P1 never restated by the weight aspect
    const bare = { ...vs[2], primary_pattern: null }
    expect(whyList([{ ...bare, aspects: [{ k: 'vpc', v: 5, pct: 0.9 }, { k: 'risk', v: 0.7, pct: 0.9 }] }], 'es')).toEqual([[]])
    expect(whyList([{ ...bare, primary_pattern: 'P1', aspects: [{ k: 'conc', v: 1, pct: 1 }] }], 'es')).toEqual([['peso grande en su sector']])
    // a saturated sector percentile reads in words, never «99 %»; a lower one keeps its number
    expect(whyList([{ ...bare, aspects: [{ k: 'vol', v: 0.999, pct: 0.999 }] }], 'es')).toEqual([['montos entre los más dispares de su sector']])
    expect(whyList([{ ...bare, aspects: [{ k: 'vol', v: 0.72, pct: 0.72 }] }], 'es')).toEqual([['montos más dispares que el 72 % de su sector']])
  })
  it('a large amount ratio reads as an order of magnitude, never a price', () => {
    const bare = { ...vs[2], primary_pattern: null }
    const pr = (x: number, lang: 'es' | 'en' = 'es') => whyList([{ ...bare, aspects: [{ k: 'pr', v: x, pct: 0.99 }] }], lang)[0][0]
    expect(pr(1816)).toBe('contratos miles de veces más grandes que el contrato mediano de su sector')
    expect(pr(250)).toBe('contratos cientos de veces más grandes que el contrato mediano de su sector')
    expect(pr(3.2, 'en')).toBe("contracts 3.2 times larger than its sector's median contract")
    expect(pr(1816) + pr(1816, 'en')).not.toMatch(/precio|price|×/i)
  })
  it('no reason takes more than a third of the listed rows unless it is the only signal', () => {
    // twelve tail vendors: every one saturates its sector on uneven amounts; each also has one concrete fact
    const facts = [{ direct_award_rate: 0.95 }, { single_bid_rate: 0.8 }, { top_institution_ratio: 0.95 }, { is_disappeared: true, last_contract_year: 2019 }]
    const rows = Array.from({ length: 12 }, (_, i) => ({
      ...vs[2], vendor_id: 100 + i, primary_pattern: null, top_institution_ratio: 0.1, direct_award_rate: 0.1, single_bid_rate: 0.1,
      aspects: [{ k: 'vol' as const, v: 0.99, pct: 0.99 }], ...facts[i % 4],
    }))
    const why = whyList(rows, 'es').map((p) => p[0])
    const counts = new Map<string, number>()
    for (const t of why) counts.set(t, (counts.get(t) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(4)
    expect(why.some((t) => t.startsWith('montos'))).toBe(false)  // the concrete fact wins over the saturated percentile
    // every row with only the saturated signal still says it
    const only = whyList(rows.map((r) => ({ ...r, direct_award_rate: 0.1, single_bid_rate: 0.1, top_institution_ratio: 0.1, is_disappeared: false })), 'es')
    expect(only.every((p) => p[0] === 'montos entre los más dispares de su sector')).toBe(true)
  })
  it('keeps every sector in the sky set (the sector is the camera, not a cut)', () => {
    expect(inScenario(vs, { sx: 'amlo', sector: 1, inst: null, pat: null, caso: true }, false)).toHaveLength(3)
    expect(inScenario(vs, { sx: 'amlo', sector: 1, inst: null, pat: null, caso: true })).toHaveLength(2)
  })
  it('lists the buyers and patterns present before their own filter', () => {
    expect(buyersIn(vs, { sx: null, sector: null, inst: 20, pat: null, caso: true }).map((b) => b.id)).toEqual([20, 10])
    expect(patternsIn(vs, { sx: null, sector: 1, inst: null, pat: 'P6', caso: true }).map((p) => p.code)).toEqual(['P6', 'P2'])
  })
  it('totals count the critical indicators', () => {
    const t = totals(vs, null)
    expect(t).toMatchObject({ n: 3, money: 650, crit: 1 })
    expect(t.bySector.get(1)).toEqual({ n: 2, money: 150 })
  })
  it('builds a sky with one star per vendor, the largest at its constellation centre, rings on the críticos without a case', () => {
    const m = vendorSky(vs.map((v) => ({ ...v, in_ground_truth: false, avg_risk_score: 0.7 })), null)
    expect(m.stars.id).toHaveLength(3)
    expect(m.sectors).toHaveLength(12)
    const c = m.sectors.find((s) => s.id === 1)!
    const iA = m.stars.id.indexOf(1), iB = m.stars.id.indexOf(2)
    // the centre is the highest priority (vendor 1, IPS 0.9), not the money winner
    expect([m.stars.x[iA], m.stars.y[iA]]).toEqual([c.x, c.y])
    expect(Math.hypot(m.stars.x[iB] - c.x, m.stars.y[iB] - c.y)).toBeGreaterThan(0)
    expect(m.stars.h[iA]).toBe(0.9)  // ringed: h = its priority, and the sector's p90 is the smallest ringed h
    expect(c.h_p90).toBe(0.9)
    expect(m.stars.h[iB]).toBe(0)  // EFOS: a case exists
    expect(vendorSky(vs, null).stars.h[iA]).toBe(0)  // documented case, no ring
    expect(c.n_stars).toBe(2)
  })
  it('writes the question in both languages', () => {
    const names = { sector: (id: number) => `S${id}`, inst: (id: number) => `I${id}` }
    expect(questionText({ sx: 'amlo', sector: 1, inst: 10, pat: 'P6' }, 'es', names)).toBe('¿Quién muestra más señales de riesgo sin caso público con AMLO (2019–2024), en S1, vendiendo sobre todo a I10, con el patrón «Comprador único»?')
    expect(questionText({ sx: null, sector: null, inst: null, pat: null, caso: true }, 'en', names)).toBe('Who shows the most risk signals over the whole period?')
  })
})
