import { describe, it, expect } from 'vitest'
import {
  fromV2, fromV3, bridgeSteps, peerDeltas, sortLens, lensContribution, lensOptions, bandPips,
  type AnatomyApi, type GradeV3Api, type PeersV3Api, type CategoryLensRow,
} from './anatomy'

const q = (median: number) => ({ p25: median - 1, median, p75: median + 1 })

// IMSS (id 251), v2 stored pillars as served by /anatomy on 2026-10-08.
const IMSS_V2: AnatomyApi = {
  institution_id: 251, method_version: 'v2-live', grade: 'C+', score: 54.8, ceiling: 90,
  confidence_band: 'high', n_contracts: 661384, ci: null,
  peer_group: { institution_type: 'social_security', is_federal: true, n: 6, rank: 3, median: 48.8, p25: 42.9, p75: 57.5 },
  pillars: [
    { key: 'openness', cap: 20, value: 7.8, peer: q(8.2), all: q(12), drivers: [], penalties: null, category_lens: 'da', exposure: false },
    { key: 'process', cap: 25, value: 15.5, peer: q(18.4), all: q(18), drivers: [], penalties: null, category_lens: 'ye', exposure: false },
    { key: 'tail', cap: 20, value: 9.5, peer: q(8.3), all: q(13), drivers: [], penalties: null, category_lens: 'hr', exposure: false },
    { key: 'external', cap: 15, value: 12.3, peer: q(8.9), all: q(10), drivers: [], penalties: null, category_lens: null, exposure: true },
    { key: 'independence', cap: 10, value: 9.7, peer: null, all: q(5), drivers: [], penalties: null, category_lens: 'top1', exposure: false },
  ],
  dragging_pillar: 'process',
}

// IMSS v3 (grade-v3, CAL-GV3-20261008060330), ledger trimmed to the rows that matter.
const led = (pillar: string, item: string, points: number) => ({ pillar, item, rate: 0.1, national_median: 0.1, peer_median: 0.1, points })
const IMSS_V3: GradeV3Api = {
  institution_id: 251, institution_name: 'IMSS', method_version: 'v3.0', calibration_id: 'CAL', grade: 'D', tier_key: 'Deficiente',
  score: 39.3, score_lo: 38.9, score_hi: 39.7, provisional: false, p_grade: 1, red_flags: [], sanction_gate: false,
  pillars: { competencia: { score: 33.01, rate: 0.55 }, proceso: { score: 8.55, rate: 0.15 }, concentracion: { score: 76.34, rate: 0.03 } },
  peer: { key: 'federal|salud|grande', n: 30, level: 'federal', family: 'salud', size_band: 'grande' },
  badges: { gt_vendor_count: 548, aria_t1_vendor_count: 38, trend: 'estable', model_hr_value_share: 0.55, sanctioned_vendor_count: 0, trend_slope: 0.001 },
  n_contracts: 661384, total_value_mxn: 1.8e12,
  ledger: [
    led('competencia', 'nc_count', -18.57), led('competencia', 'nc_value', -8.86), led('competencia', 'ajuste_pares', 5.1),
    led('proceso', 'split', -23.78), led('proceso', 'ye', -3.62), led('proceso', 'short', -3.08),
    led('concentracion', 'ajuste_pares', -7.89), led('concentracion', 'hhi', 0), led('concentracion', 'top1', 0),
  ],
  computed_at: '2026-10-08',
}
const IMSS_PEERS: PeersV3Api = {
  institution_id: 251, peer_key: 'federal|salud|grande', n: 30, rank: 22, score: q(50),
  pillars: { competencia: q(40), proceso: q(55), concentracion: q(80) },
  cut_points: [{ grade: 'A', min: 76 }, { grade: 'B', min: 60 }, { grade: 'C', min: 44 }, { grade: 'D', min: 28 }],
  data: [],
}

describe('fromV2 (fallback)', () => {
  const v = fromV2(IMSS_V2)
  it('orders pillars by the spec and keeps the 90 ceiling', () => {
    expect(v.pillars.map((p) => p.key)).toEqual(['openness', 'process', 'tail', 'external', 'independence'])
    expect(v.ceiling).toBe(90)
    expect(v.version).toBe('v2')
  })
  it('falls back to the all-institution median when the peer group has no bands', () => {
    expect(v.pillars[4].ref).toBe(5)
    expect(v.pillars[4].refIsPeer).toBe(false)
  })
  it('carves the stored losses down to the score', () => {
    const steps = bridgeSteps(v)
    expect(+(90 - steps.reduce((s, x) => s + x.loss, 0)).toFixed(1)).toBe(54.8)
    expect(steps[0].ghostX0).toBeCloseTo((90 - 11.8) / 90, 5)
    expect(peerDeltas(v)[1]).toEqual({ key: 'process', delta: -2.9 })
  })
  it('offers no model lens on v2', () => {
    expect(lensOptions(v).map((o) => o.key)).toEqual(['openness', 'process', 'tail', 'independence'])
  })
})

describe('fromV3 (live grade)', () => {
  const v = fromV3(IMSS_V3, IMSS_PEERS)
  it('reads three pillars out of 100 with an interval and the peer rank', () => {
    expect(v.version).toBe('v3')
    expect(v.ceiling).toBe(100)
    expect(v.pillars.map((p) => p.key)).toEqual(['competencia', 'proceso', 'concentracion'])
    expect(v.ci).toEqual({ lo: 38.9, hi: 39.7 })
    expect(v.peer.rank).toBe(22)
    expect(v.peer.label_es).toBe('federal · salud · grande')
  })
  it('bridge losses equal the ledger and land on the score', () => {
    const steps = bridgeSteps(v)
    const lost = steps.reduce((s, x) => s + x.loss, 0)
    expect(100 - lost).toBeCloseTo(39.3, 1)
    expect(v.dragging).toBe('proceso')
  })
  it('draws a peer credit over the gross bite', () => {
    const comp = bridgeSteps(v)[0]
    expect(comp.credit?.points).toBeCloseTo(5.1, 5)
    expect(comp.segments.map((s) => s.key)).toEqual(['nc_count', 'nc_value'])
    expect(comp.grossX0).toBeLessThan(comp.x0)
  })
  it('keeps badges beside the grade and drops zero / empty ones', () => {
    expect(v.badges.map((b) => b.key)).toEqual(['gt_vendor_count', 'aria_t1_vendor_count', 'model_hr_value_share', 'trend'])
  })
  it('adds the model lens as a badge lens', () => {
    const opts = lensOptions(v)
    expect(opts.map((o) => o.key)).toEqual(['competencia', 'proceso', 'concentracion', 'modelo'])
    expect(opts[3].badge).toBe(true)
  })
  it('works without peer context', () => {
    const bare = fromV3(IMSS_V3, null)
    expect(bare.pillars.every((p) => p.ref == null)).toBe(true)
    expect(bare.peer.n).toBe(30)
  })
})

describe('category lens', () => {
  const row = (id: number, share: number, da: number, bda: number, value: number): CategoryLensRow => ({
    category_id: id, name_es: `c${id}`, name_en: `c${id}`, sector_id: 1, contract_count: 10,
    total_value_mxn: value, spend_share: share, vendor_count: 3, competitive_count: 5,
    metrics: { da, sb: null, ye: null, hr: null, top1: null },
    baseline: { da: bda, sb: null, ye: null, hr: null, top1: null },
  })
  it('ranks by share × excess over the national baseline, not by spend', () => {
    const big = row(1, 0.6, 60, 70, 600)
    const small = row(2, 0.1, 90, 50, 100)
    expect(lensContribution(big, ['da'])).toBe(0)
    expect(sortLens([big, small], ['da'], 'aporte').map((r) => r.category_id)).toEqual([2, 1])
    expect(sortLens([small, big], ['da'], 'gasto').map((r) => r.category_id)).toEqual([1, 2])
  })
  it('maps confidence bands to pips', () => {
    expect([bandPips('wide'), bandPips('medium'), bandPips('narrow'), bandPips('high'), bandPips(null)]).toEqual([1, 2, 3, 4, 0])
  })
})
