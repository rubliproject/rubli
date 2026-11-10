import { describe, it, expect } from 'vitest'
import {
  decodeField, wilson, buildRows, layoutField, heroFinding, gtShift, deficientFlows, isDeficient,
  isAltDeficient, membersOf, zoomDim, OTHER_KEY, type FieldPayload, type Geometry, type BandSpec,
} from './field'

const V3_COLS = [
  'id', 'name', 'siglas', 'score', 'grade', 'provisional', 'score_lo', 'score_hi',
  'pillar_competencia', 'pillar_proceso', 'pillar_concentracion',
  'level', 'family', 'size_band', 'sector_id', 'n_contracts', 'total_value_mxn',
  'gt_vendor_count', 'top_loss_pillar', 'top_loss_points', 'v2_score', 'v2_grade', 'group',
]
const V2_COLS = [
  'id', 'name', 'siglas', 'total_score', 'grade',
  'pillar_openness', 'pillar_price', 'pillar_vendors', 'pillar_process', 'pillar_external',
  'confidence_band', 'is_federal', 'level', 'institution_type', 'sector_id',
  'total_contracts', 'total_amount_mxn', 'gt_exposed', 'group',
]

const v3grade = (s: number) => (s >= 76 ? 'A' : s >= 60 ? 'B' : s >= 44 ? 'C' : s >= 28 ? 'D' : 'F')

// Deterministic synthetic v3 population: municipio worst, scores spread 3–97.
function synthV3(n = 400): FieldPayload {
  const groups = [['municipal', 'municipio'], ['estatal', 'ejecutivo'], ['federal', 'salud'], ['federal', 'educacion']] as const
  const rows = Array.from({ length: n }, (_, i) => {
    const [lv, fam] = groups[i % 4]
    const score = Math.max(3, Math.min(97, 3 + ((i * 37) % 95) - (fam === 'municipio' ? 12 : 0)))
    const comp = Math.max(0, score - 10), proc = Math.min(100, score + 15), conc = Math.min(100, score + 5)
    const v2 = 20 + ((i * 13) % 65)
    return [
      i + 1, `Inst ${i}`, null, score, v3grade(score), i % 3 === 0, score - 4, score + 4,
      comp, proc, conc, lv === 'estatal' ? 'state' : lv, fam, ['chica', 'media', 'grande'][i % 3], 1 + (i % 12),
      50 + i * 40, 1e6, i % 2 ? 5 : 0, 'competencia', (comp - 100) / 3, v2, v2 < 30 ? 'D-' : v2 < 40 ? 'D' : 'C+', `${lv}|${fam}`,
    ]
  })
  return { method: 'v3', computed_at: 'x', scale: [0, 100], cut_points: [76, 60, 44, 28], columns: V3_COLS, rows }
}

function synthV2(n = 200): FieldPayload {
  const rows = Array.from({ length: n }, (_, i) => {
    const score = 16 + ((i * 37) % 69)
    const grade = score < 30 ? 'D-' : score < 40 ? 'D' : score < 50 ? 'C' : 'B'
    return [i + 1, `I${i}`, null, score, grade, 15, 20, 15, i % 2 ? 2 : 14, 5,
      i % 3 ? 'narrow' : 'wide', 1, 'federal', 'federal_agency', 1, 100, 1e6, i % 2 === 1, i % 2 ? 'fed-dec' : 'fed-other']
  })
  return { computed_at: 'x', columns: V2_COLS, rows }
}

const GEOM: Geometry = {
  width: 900, plotX0: 200, plotW: 550, xMin: 0, xMax: 100, r: 2.5, gap: 0.6, labelH: 0, axisH: 20, railH: 14, minRowH: 26, maxH: 560,
}

describe('El Tamiz field model — v3 (tamiz-v3)', () => {
  const m = decodeField(synthV3())
  const all = m.insts.map((_, i) => i)

  it('decodes the v3 payload: A–F, 0–100 axis, reprobada < 60, cut points from calibration', () => {
    expect(m.method).toBe('v3')
    expect([m.xMin, m.xMax]).toEqual([0, 100])
    expect(m.deficientBelow).toBe(60)
    expect(m.lines).toEqual([28, 44, 60, 76])
    expect(m.pillars.map((p) => p.key)).toEqual(['competencia', 'proceso', 'concentracion'])
    for (const i of m.insts) expect(isDeficient(i)).toBe(Math.round(i.total_score) < 60)
    expect(m.insts[0].loss.key).toBe('competencia')
    expect(m.insts[0].loss.lost).toBeCloseTo((100 - m.insts[0].pillars.competencia) / 3) // points on the 0–100 total
    // the alternate is the historical v2 grade
    expect(isAltDeficient(m.insts[0], m)).toBe(['D', 'D-'].includes(m.insts[0].alt_grade ?? ''))
  })

  it('the data picks the hero group (n ≥ 30, worst % D/F)', () => {
    const h = heroFinding(m)
    const rows = buildRows(m, all, 'grp').filter((r) => r.key !== OTHER_KEY && r.n >= 30)
    expect(h.group?.key).toBe(rows[0].key)
    expect(h.group?.key).toBe('municipal|municipio')
    expect(h.overall.n).toBe(m.insts.length)
    expect(h.driver?.key).toBe('competencia')
  })

  it('v2→v3 shift and flows are computed, groups zoom by size', () => {
    const s = gtShift(m)
    expect(s.gt.n + s.rest.n).toBe(m.insts.length)
    const f = deficientFlows(m)
    expect(f.left).toBeGreaterThanOrEqual(0)
    expect(zoomDim(m, 'grp')).toBe('size')
    expect(membersOf(m, 'grp', 'municipal|municipio').length).toBe(100)
  })

  it('layout: finite, in bounds, dot i keeps its score-x across steps', () => {
    const scores = m.insts.map((i) => i.total_score)
    const steps: BandSpec[][] = [
      [{ key: 'all', members: all }],
      buildRows(m, all, 'level').map((r) => ({ key: r.key, members: r.members })),
      buildRows(m, all, 'grp').map((r, k) => ({ key: r.key, members: r.members, rail: k > 0 })),
    ]
    const xs: Float32Array[] = []
    for (const spec of steps) {
      const L = layoutField(scores, spec, GEOM)
      for (let i = 0; i < m.insts.length; i++) {
        expect(Number.isFinite(L.x[i]) && Number.isFinite(L.y[i])).toBe(true)
        expect(L.x[i]).toBeGreaterThanOrEqual(GEOM.plotX0)
        expect(L.x[i]).toBeLessThanOrEqual(GEOM.plotX0 + GEOM.plotW)
        expect(L.y[i]).toBeGreaterThan(0)
        expect(L.y[i]).toBeLessThanOrEqual(L.height)
      }
      expect(L.height).toBeLessThanOrEqual(GEOM.maxH)
      xs.push(L.x)
    }
    expect(Array.from(xs[1])).toEqual(Array.from(xs[0]))
    expect(Array.from(xs[2])).toEqual(Array.from(xs[0]))
  })
})

describe('trend (phase 2 § 3)', () => {
  it('decodes trend + slope when present, null when absent', () => {
    const p = synthV3(4)
    expect(decodeField(p).insts.every((i) => i.trend === null && i.trend_slope === null)).toBe(true)
    p.columns = [...p.columns, 'trend', 'trend_slope', 'trend_t']
    p.rows = p.rows.map((r, k) => [...r, k === 0 ? 'empeora' : null, k === 0 ? 0.024 : null, k === 0 ? 2.5 : null])
    const m = decodeField(p)
    expect(m.insts[0].trend).toBe('empeora')
    expect(m.insts[0].trend_slope).toBeCloseTo(0.024)
    expect(m.insts[1].trend).toBeNull()
  })
})

describe('El Tamiz field model — v2 fallback', () => {
  it('decodes v2 with the X-ray as the alternate and the 15–90 axis', () => {
    const m = decodeField(synthV2())
    expect(m.method).toBe('v2')
    expect([m.xMin, m.xMax]).toEqual([15, 90])
    const mean = m.insts.reduce((a, i) => a + i.pillars.pillar_process, 0) / m.insts.length
    expect(m.insts[0].alt_score).toBeCloseTo(m.insts[0].total_score - m.insts[0].pillars.pillar_process + mean)
    expect(m.insts.filter((i) => i.provisional).length).toBeGreaterThan(0)
    // costliest = most points lost against the caps
    expect(m.insts[1].loss.key).toBe('pillar_process') // 15 − 2 = 13 lost
  })

  it('wilson interval brackets the estimate and stays in [0,1]', () => {
    const [lo, hi] = wilson(61, 153)
    expect(lo).toBeLessThan(61 / 153)
    expect(hi).toBeGreaterThan(61 / 153)
    expect(wilson(0, 0)).toEqual([0, 0])
  })

  it('rows partition, sort worst-first and merge small groups', () => {
    const m = decodeField(synthV3())
    const all = m.insts.map((_, i) => i)
    const rows = buildRows(m, all, 'sector')
    expect(rows.reduce((a, r) => a + r.n, 0)).toBe(m.insts.length)
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].pct).toBeGreaterThanOrEqual(rows[k].pct)
    expect(buildRows(m, all.slice(0, 40), 'sector').some((r) => r.key === OTHER_KEY)).toBe(true)
  })
})

describe('tierLedger (bar purge 11-07)', () => {
  const T = ['A', 'B', 'C'] as const
  const of = (g: string) => g as (typeof T)[number]
  const i = (grade: string, v: number, level = 'federal') => ({ grade, level, total_amount_mxn: v })
  it('shares are of federal pesos only and the top tier holds the most pesos', async () => {
    const { tierLedger } = await import('./field')
    const r = tierLedger([i('A', 10), i('B', 60), i('B', 10), i('C', 20), i('A', 999, 'state')], T, of)!
    expect(r.tot).toBe(100)
    expect(r.rows.map((x) => x.share)).toEqual([0.1, 0.7, 0.2])
    expect(r.rows[1].n).toBe(2)
    expect(r.top.k).toBe('B')
    expect(r.top.k === 'A').toBe(false)
  })
  it('is null with no federal money', async () => {
    const { tierLedger } = await import('./field')
    expect(tierLedger([i('A', 5, 'state')], T, of)).toBeNull()
  })
})
