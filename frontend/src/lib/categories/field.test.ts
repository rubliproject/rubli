import { describe, expect, it } from 'vitest'
import { layoutField } from '@/lib/field/layout'
import { buildRows, decodeField, findingOf, halfOf, litSet, MEASURES, MIN_RATE_DOTS, REST_KEY, TOP_BANDS, toSpecs, type FieldSort, type Pair } from './field'

const cols = ['category_id', 'institution_id', 'institution_name', 'siglas', 'contract_count', 'total_value_mxn', 'avg_risk_score', 'direct_award_pct', 'high_risk_count']
const cats = [{ category_id: 1, sector_code: 'salud' }, { category_id: 2, sector_code: 'salud' }, { category_id: 3, sector_code: 'energia' }]
const rows = Array.from({ length: 60 }, (_, i) => [
  (i % 3) + 1, i, `INST ${i}`, null, 100 + i * 37, 1e7 * (i + 1) ** 2, (i % 10) / 10 + 0.05, (i * 7) % 101, i % 4,
])
const pairs: Pair[] = decodeField({ computed_at: 'x', min_contracts: 100, columns: cols, rows, totals: null }, cats)
const all = pairs.map((_, i) => i)
const sorts: FieldSort[] = ['spend', 'risk', 'contracts', 'direct_award']
const geom = { width: 900, plotX0: 200, plotW: 550, xMin: 0, xMax: 1, r: 2.6, gap: 0.6, labelH: 0, axisH: 22, railH: 14, minRowH: 40, maxH: 600 }

describe('categories field', () => {
  it('decodes columns and maps sectors from the category list', () => {
    expect(pairs).toHaveLength(60)
    expect(pairs[2].sector_code).toBe('energia')
    expect(pairs[0].value).toBe(1e7)
  })

  it('halfOf returns the fewest dots holding at least half', () => {
    const lit = halfOf(pairs, all, (p) => p.value)
    const total = pairs.reduce((s, p) => s + p.value, 0)
    const litSum = lit.reduce((s, k) => s + pairs[k].value, 0)
    expect(litSum).toBeGreaterThanOrEqual(total / 2)
    expect(litSum - pairs[lit[lit.length - 1]].value).toBeLessThan(total / 2)
  })

  it('bands partition the population in every layout, with and without a sector', () => {
    for (const s of sorts) {
      for (const sector of [null, 'salud']) {
        const r = buildRows(pairs, s, sector)
        const seen = r.flatMap((q) => q.members).sort((a, b) => a - b)
        expect(seen).toEqual(all)
        if (sector) expect(r[r.length - 1].key).toBe(REST_KEY)
        const ranked = r.filter((q) => !q.rail).map((q) => q.agg)
        expect(ranked).toEqual([...ranked].sort((a, b) => b - a))
      }
    }
  })

  it('rows are the top categories under the sort, rate layouts skip thin categories, the rest is one rail', () => {
    // 30 categories: category c has c+1 dots.
    const many: Pair[] = Array.from({ length: 30 }, (_, c) => Array.from({ length: c + 1 }, (_, j) => ({
      category_id: c, sector_code: 'otros', institution_id: j, institution_name: 'X', siglas: null,
      contracts: 100 + j, value: 1e6 * (c + 1), risk: 0.9 - c * 0.01, da: 50, high_risk: 0,
    }))).flat()
    for (const s of sorts) {
      const r = buildRows(many, s, null)
      expect(r.length).toBe(TOP_BANDS + 1)
      expect(r[r.length - 1]).toMatchObject({ key: REST_KEY, rail: true, cats: 30 - TOP_BANDS })
      if (s === 'risk' || s === 'direct_award') {
        expect(r.filter((q) => !q.rail).every((q) => q.members.length >= MIN_RATE_DOTS)).toBe(true)
      }
    }
    // a sector — or `all` — shows every category; in rate layouts thin ones go last, flagged
    for (const s of sorts) {
      for (const r of [buildRows(many, s, 'otros'), buildRows(many, s, null, true)]) {
        expect(r.filter((q) => !q.rail)).toHaveLength(30)
        expect(r.some((q) => q.rail)).toBe(false)
        const thin = r.map((q) => q.thin)
        expect(thin).toEqual([...thin].sort((a, b) => Number(a) - Number(b)))
        expect(thin.filter(Boolean)).toHaveLength(s === 'risk' || s === 'direct_award' ? MIN_RATE_DOTS - 1 : 0)
      }
    }
    // risk ranks the riskiest eligible category first (lowest id with >= 8 dots)
    expect(buildRows(many, 'risk', null)[0].key).toBe(String(MIN_RATE_DOTS - 1))
  })

  it('every layout places every dot at a finite in-bounds position (dot i stays pair i)', () => {
    for (const s of sorts) {
      const m = MEASURES[s]
      const xs = Float32Array.from(pairs, (p) => (m.x(p) - m.domain[0]) / (m.domain[1] - m.domain[0]))
      const lay = layoutField(xs, toSpecs(buildRows(pairs, s, 'salud')), geom)
      expect(lay.x).toHaveLength(60)
      for (let i = 0; i < 60; i++) {
        expect(Number.isFinite(lay.x[i]) && Number.isFinite(lay.y[i])).toBe(true)
        expect(lay.x[i]).toBeGreaterThanOrEqual(geom.plotX0)
        expect(lay.x[i]).toBeLessThanOrEqual(geom.plotX0 + geom.plotW)
        expect(lay.y[i]).toBeLessThanOrEqual(lay.height)
      }
    }
  })

  it('findings agree with the lit set', () => {
    for (const s of sorts) {
      const f = findingOf(pairs, all, s)
      expect(f.lit).toBe(litSet(pairs, all, s).length)
      expect(f.litValue).toBeLessThanOrEqual(f.value)
    }
    expect(findingOf(pairs, all, 'risk').lit).toBe(pairs.filter((p) => (p.risk ?? 0) >= 0.4).length)
  })
})

describe('layout maxStack', () => {
  it('spills a tied value sideways instead of towering, staying in the plot', () => {
    const scores = new Float32Array(200).fill(1) // 200 dots at the axis end
    const g = { ...geom, maxStack: 5, maxH: 100000 }
    const capped = layoutField(scores, [{ key: 'a', members: Array.from({ length: 200 }, (_, i) => i) }], g)
    const free = layoutField(scores, [{ key: 'a', members: Array.from({ length: 200 }, (_, i) => i) }], { ...g, maxStack: undefined })
    expect(capped.height).toBeLessThan(free.height)
    for (let i = 0; i < 200; i++) {
      expect(capped.x[i]).toBeGreaterThanOrEqual(g.plotX0)
      expect(capped.x[i]).toBeLessThanOrEqual(g.plotX0 + g.plotW)
    }
    const d = 2 * g.r + g.gap
    for (let i = 0; i < 200; i++) expect(g.plotX0 + g.plotW - capped.x[i]).toBeLessThanOrEqual(4 * d) // ≤ 3 columns off
    const seen = new Set(Array.from({ length: 200 }, (_, i) => `${capped.x[i].toFixed(1)}|${capped.y[i].toFixed(1)}`))
    expect(seen.size).toBe(200) // no two dots share a slot
  })
})

describe('layout band height', () => {
  it('with a pile cap, gives every dot band the same short height whatever its population', () => {
    const scores = new Float32Array(130).fill(0.5) // band a: 120 tied dots (a tall pile), band b: 10
    const specs = [
      { key: 'a', members: Array.from({ length: 120 }, (_, i) => i) },
      { key: 'b', members: Array.from({ length: 10 }, (_, i) => 120 + i) },
    ]
    const lay = layoutField(scores, specs, { ...geom, maxStack: 5, maxColK: 5, maxH: 100000 })
    expect(lay.bands[0].h).toBe(lay.bands[1].h)
    expect(lay.bands[0].h).toBeLessThanOrEqual(2 * 5 * (2 * geom.r + geom.gap) + 2 * geom.r + 8)
  })
})
