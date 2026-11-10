import { describe, it, expect } from 'vitest'
import { decodeField, type FieldPayload, type FieldModel } from './field'
import { allocate, layoutWaffle, morphLayout, dfShare, UNIT_SIZE, type WaffleGroup } from './waffle'
import { layoutField } from '@/lib/field/layout'

const COLS = [
  'id', 'name', 'siglas', 'score', 'grade', 'provisional', 'score_lo', 'score_hi',
  'pillar_competencia', 'pillar_proceso', 'pillar_concentracion',
  'level', 'family', 'size_band', 'sector_id', 'n_contracts', 'total_value_mxn',
  'gt_vendor_count', 'top_loss_pillar', 'top_loss_points', 'v2_score', 'v2_grade', 'group',
  'coverage_pct', 'coverage_band', 'coverage_lb', 'is_historical', 'last_year', 'p_grade', 'flagged_n', 'flagged_value_mxn',
]
const grade = (s: number) => (s >= 76 ? 'A' : s >= 60 ? 'B' : s >= 44 ? 'C' : s >= 28 ? 'D' : 'F')

// IMSS-like D giant · historical B energy giants · 300 federal mid buyers · 600 tiny municipal buyers.
function synth(): FieldModel {
  const rows: unknown[][] = []
  const push = (id: number, score: number, level: string, fam: string, value: number, n: number, hist = false) => rows.push([
    id, `I${id}`, null, score, grade(score), false, score - 2, score + 2, 50, 50, 50,
    level === 'estatal' ? 'state' : level, fam, 'media', 1, n, value, 0, 'proceso', -10, 50, 'C', `${level}|${fam}`,
    null, null, null, hist, hist ? 2015 : 2025, 0.9, 0, 0,
  ])
  push(1, 39.3, 'federal', 'salud', 1_818_403_274_903, 661_384)
  push(2, 69, 'federal', 'empresa', 858_604_884_552, 40_000, true)
  push(3, 74.5, 'federal', 'empresa', 666_106_735_418, 60_000, true)
  for (let i = 0; i < 300; i++) push(10 + i, 20 + ((i * 37) % 75), 'federal', i % 2 ? 'ejecutivo' : 'educacion', 1e9 + i * 7.3e8, 800 + i)
  for (let i = 0; i < 600; i++) push(1000 + i, 15 + ((i * 53) % 80), 'municipal', 'municipio', 1.2e8 + i * 3.1e5, 40 + (i % 50))
  return decodeField({ method: 'v3', computed_at: 'x', scale: [0, 100], cut_points: [76, 60, 44, 28], columns: COLS, rows } as FieldPayload)
}

const m = synth()
const byLevel = (model: FieldModel): WaffleGroup[] => ['federal', 'municipal'].map((key) => ({
  key, members: model.insts.map((_, i) => i).filter((i) => model.insts[i].level === key),
}))
const OPTS = { width: 600, size: 12, gap: 2, labelH: 18, groupGap: 12 }

describe('money waffle («Por pesos» spec §3)', () => {
  it('totals are exact: Σ cells = round(Σ weight / unit), pesos and contratos', () => {
    for (const unit of ['pesos', 'contratos'] as const) {
      const blocks = allocate(m, byLevel(m), unit)
      const sum = blocks.reduce((a, b) => a + b.value, 0)
      expect(blocks.reduce((a, b) => a + b.cells, 0)).toBe(Math.round(sum / UNIT_SIZE[unit]))
      for (const b of blocks) {
        const exact = b.value / UNIT_SIZE[unit]
        expect(b.cells === Math.floor(exact) || b.cells === Math.floor(exact) + 1).toBe(true)
      }
    }
  })

  it('the giant D buyer is one outlined ~182-cell block; small buyers pool; historical runs are separate', () => {
    const blocks = allocate(m, byLevel(m), 'pesos')
    const imss = blocks.find((b) => b.key === 'i1')!
    expect(imss.inst).not.toBeNull()
    expect(imss.cells).toBe(182)
    expect(imss.grade).toBe('D')
    expect(blocks.find((b) => b.key === 'i2')?.historical).toBe(true)
    const muni = blocks.filter((b) => b.group === 'municipal')
    expect(muni.every((b) => b.inst == null)).toBe(true)
    expect(blocks.filter((b) => b.key.endsWith('|h')).every((b) => b.historical)).toBe(true)
  })

  it('cell ids are stable across a re-flow (new width) and across excluding the giant', () => {
    const a = layoutWaffle(m, byLevel(m), 'pesos', OPTS)
    const b = layoutWaffle(m, byLevel(m), 'pesos', { ...OPTS, width: 900 })
    expect(new Set(a.cells.map((c) => c.id))).toEqual(new Set(b.cells.map((c) => c.id)))
    expect(new Set(a.cells.map((c) => c.id)).size).toBe(a.cells.length)
    const ex = layoutWaffle(m, byLevel(m), 'pesos', { ...OPTS, exclude: new Set([0]) })
    expect(ex.cells.some((c) => c.block === 'i1')).toBe(false)
    // the other buyers' own blocks keep their ids
    for (const id of a.cells.filter((c) => c.block === 'i2').map((c) => c.id)) expect(ex.cells.some((c) => c.id === id)).toBe(true)
    // D/F share drops when the giant leaves, computed from values not cells
    expect(dfShare(m, m.insts.map((_, i) => i), 'pesos', new Set([0]))).toBeLessThan(dfShare(m, m.insts.map((_, i) => i), 'pesos'))
  })

  it('every institution has an in-bounds morph target; cells sit inside the grid', () => {
    const w = layoutWaffle(m, byLevel(m), 'pesos', OPTS)
    expect(w.target.size).toBe(m.insts.length)
    for (const t of w.target.values()) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.x).toBeLessThanOrEqual(OPTS.width)
      expect(t.y).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeLessThanOrEqual(w.height)
    }
    for (const c of w.cells) {
      expect(c.x + OPTS.size).toBeLessThanOrEqual(OPTS.width)
      expect(c.y + OPTS.size).toBeLessThanOrEqual(w.height)
    }
  })

  it('five rapid lens flips reverse cleanly: targets carry no history, the tween lands on the last target, no overshoot', () => {
    const n = m.insts.length
    const dots = layoutField(m.insts.map((i) => i.total_score),
      [{ key: 'all', members: m.insts.map((_, i) => i) }],
      { width: 600, plotX0: 120, plotW: 400, xMin: 0, xMax: 100, r: 2, gap: 0.5, labelH: 0, axisH: 20, railH: 12, minRowH: 30, maxH: 400 })
    const waffle = morphLayout(layoutWaffle(m, byLevel(m), 'pesos', OPTS), n, 2)
    const target = (lens: 'instituciones' | 'pesos') => (lens === 'pesos' ? waffle : dots)
    // DotField semantics: a new target starts from the CURRENT interpolated state, cubic-out.
    const ease = (t: number) => 1 - (1 - t) ** 3
    let cx = Float32Array.from(dots.x)
    let ca = Float32Array.from(dots.a)
    const flips: ('instituciones' | 'pesos')[] = ['pesos', 'instituciones', 'pesos', 'instituciones', 'pesos', 'instituciones']
    flips.forEach((lens, f) => {
      const to = target(lens)
      const fromX = cx.slice()
      const fromA = ca.slice()
      const stopAt = f === flips.length - 1 ? 1 : 0.35 // interrupted mid-flight, except the last
      for (let t = 0; t <= stopAt + 1e-9; t += 0.05) {
        const e = ease(Math.min(1, t))
        for (let i = 0; i < n; i++) {
          cx[i] = fromX[i] + (to.x[i] - fromX[i]) * e
          ca[i] = fromA[i] + (to.a[i] - fromA[i]) * e
          // never outside the segment between where it was and where it is going
          expect(cx[i]).toBeGreaterThanOrEqual(Math.min(fromX[i], to.x[i]) - 1e-3)
          expect(cx[i]).toBeLessThanOrEqual(Math.max(fromX[i], to.x[i]) + 1e-3)
        }
      }
    })
    // after the final (uninterrupted) flip back, the dots are exactly the dot layout again
    for (let i = 0; i < n; i++) {
      expect(cx[i]).toBeCloseTo(dots.x[i], 3)
      expect(ca[i]).toBeCloseTo(dots.a[i], 3)
    }
    // and the waffle target is the same object-free function of the lens every time
    expect(Array.from(morphLayout(layoutWaffle(m, byLevel(m), 'pesos', OPTS), n, 2).x)).toEqual(Array.from(waffle.x))
  }, 30_000)  // lays out ~2,200 dots five times: 5 s flakes on a loaded machine
})

describe('waffle follows the rounded-score pass rule', () => {
  it('a C that rounds to 6.0 passes: it sits with B, never in a failing block', () => {
    const insts = m.insts.map((i, k) => (k === 5 ? { ...i, grade: 'C', total_score: 59.6, fail: false } : i))
    const model = { ...m, insts } as FieldModel
    const blocks = allocate(model, byLevel(model), 'contratos')
    const home = blocks.find((b) => b.members.includes(5))!
    expect(home.grade).toBe('B')
    const lay = layoutWaffle(model, byLevel(model), 'contratos', OPTS)
    expect(lay.cells.filter((c) => c.block === home.key).every((c) => !c.deficient)).toBe(true)
  })
  it('59.4 rounds to 5.9 and still fails; a D-lettered 59.6 passes with B', () => {
    const fail = { ...m, insts: m.insts.map((i, k) => (k === 5 ? { ...i, grade: 'C', total_score: 59.4, fail: true } : i)) } as FieldModel
    expect(allocate(fail, byLevel(fail), 'contratos').find((b) => b.members.includes(5))!.grade).toBe('C')
    const d = { ...m, insts: m.insts.map((i, k) => (k === 5 ? { ...i, grade: 'D', total_score: 59.6, fail: false } : i)) } as FieldModel
    expect(allocate(d, byLevel(d), 'contratos').find((b) => b.members.includes(5))!.grade).toBe('B')
  })
})
