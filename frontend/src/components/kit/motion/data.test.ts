import { describe, expect, it } from 'vitest'
import type { ContractDetail } from '@/api/types'
import { buildExpediente, type EntityTimeline } from '@/lib/vendor/expediente'
import {
  flowFromExpediente, graphFromTimeline, layoutGraph, niceQuantum, particleBudget, radiusFor,
  terrainFromExpediente, terrainFromSexenios, unfoldContract,
} from './data'

const cell = (amount_mxn: number, n = 1) => ({ amount_mxn, n_contracts: n, n_direct_award: n, avg_risk_score: 0.5 })
const tl: EntityTimeline = {
  laneType: 'institution', n_entities: 3,
  entities: [
    { id: 1, name: 'IMSS', siglas: 'IMSS', first_year: 2019, last_year: 2021, is_top: true, ...cell(300, 3) },
    { id: 2, name: 'ISSSTE', siglas: null, first_year: 2020, last_year: 2021, is_top: true, ...cell(100, 2) },
    { id: 3, name: 'X', siglas: null, first_year: 2021, last_year: 2021, is_top: false, ...cell(50, 1) },
  ],
  years: [{ year: 2019, ...cell(100) }, { year: 2020, ...cell(150, 2) }, { year: 2021, ...cell(200, 3) }],
  cells: [
    { id: 1, year: 2019, ...cell(100) }, { id: 1, year: 2020, ...cell(100) }, { id: 1, year: 2021, ...cell(100) },
    { id: 2, year: 2020, ...cell(50) }, { id: 2, year: 2021, ...cell(50) },
    { id: null, year: 2021, ...cell(50) },
  ],
}
const m = buildExpediente(tl)!

describe('flowFromExpediente', () => {
  it('keeps the money: edges sum to the total, the rest becomes a grey source', () => {
    const f = flowFromExpediente(m, 'MAYPO')
    expect(f.edges.reduce((s, e) => s + e.amount, 0)).toBe(450)
    expect(f.total).toBe(450)
    expect(f.sources.at(-1)).toMatchObject({ id: null, label: '+1' })
  })
})

describe('particleBudget', () => {
  it('1 particle = one nice quantum; counts round, never inflating a sliver', () => {
    const { quantum, counts } = particleBudget([{ source: 0, year: 2019, amount: 8.96e8 }, { source: 1, year: 2019, amount: 1e8 }, { source: 2, year: 2019, amount: 4e6 }], 100)
    expect(quantum).toBe(1e7)
    expect(counts).toEqual([90, 10, 0])
  })
  it('niceQuantum snaps to 1·2·5 and floors at 1 M', () => {
    expect(niceQuantum(3.3e7)).toBe(5e7); expect(niceQuantum(1.1e7)).toBe(2e7); expect(niceQuantum(12)).toBe(1e6)
  })
})

describe('terrain', () => {
  it('lanes × years grid with sexenio bands; heights are the raw money', () => {
    const t = terrainFromExpediente(m)
    expect(t.cols).toEqual(['2019', '2020', '2021'])
    expect(t.lanes.map((l) => l.label)).toEqual(['IMSS', 'ISSSTE', '+1'])
    expect(t.cells[0]).toEqual([100, 100, 100]); expect(t.cells[2]).toEqual([0, 0, 50])
    expect(t.bands[0]).toMatchObject({ label: 'AMLO', from: 0, to: 2 })
    expect(t.vmax).toBe(100)
  })
  it('sexenio rows: top N by lifetime value, one column per term in order', () => {
    const t = terrainFromSexenios([
      { id: 1, label: 'A', administrations: { Fox: { value: 1 }, AMLO: { value: 5 } } },
      { id: 2, label: 'B', administrations: { Calderón: { value: 20 } } },
      { id: 3, label: 'C', administrations: { Sheinbaum: { value: 2 } } },
    ], 2)
    expect(t.lanes.map((l) => l.label)).toEqual(['B', 'A'])
    expect(t.cols).toEqual(['Fox', 'Calderón', 'Peña Nieto', 'AMLO', 'Sheinbaum'])
    expect(t.cells[1]).toEqual([1, 0, 0, 5, 0])
  })
})

describe('graph', () => {
  it('centre first, every counterpart linked to it, area-honest radii', () => {
    const g = graphFromTimeline(tl, { label: 'MAYPO' })
    expect(g.nodes[0].isCenter).toBe(true)
    expect(g.links).toHaveLength(3); expect(g.links.every((l) => l.source === 0)).toBe(true)
    expect(radiusFor(100, 400, 2, 10)).toBe(6)
    expect(radiusFor(0, 400)).toBe(2.5)
  })
  it('layout is deterministic and inside the unit cube, centre pinned', () => {
    const g = graphFromTimeline(tl, { label: 'c' })
    const a = layoutGraph(g, 50), b = layoutGraph(g, 50)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(a.slice(0, 3)).toEqual(new Float32Array(3))
    expect(Array.from(a).every((v) => Math.abs(v) <= 1)).toBe(true)
  })
})

describe('unfoldContract', () => {
  it('turns a record into labelled parts; direct award and risk factors read critical', () => {
    const c = {
      id: 2271271, title: 'Levanting', amount_mxn: 1.7e9, currency: 'USD', amount_original: 80725000, vendor_id: 264374, vendor_name: 'LEVANTING',
      institution_id: 251, institution_name: 'IMSS', procedure_type: 'ADJUDICACIÓN DIRECTA', is_direct_award: true, start_date: '2020-03-31', end_date: '2020-12-31',
      risk_factors: ['direct_award', 'price_hyp:extreme_overpricing:0.95'],
    } as unknown as ContractDetail
    const u = unfoldContract(c, 'es', (v) => `${v / 1e6} MDP`)
    expect(u.head).toBe('Levanting')
    expect(u.parts.find((p) => p.key === 'procedure')).toMatchObject({ tone: 'critical' })
    expect(u.parts.find((p) => p.key === 'term')?.value).toContain('275 días')
    expect(u.parts.filter((p) => p.key.startsWith('rf-')).map((p) => p.value)).toEqual(['adjudicación directa', 'monto atípico 0.95'])
    expect(u.parts.find((p) => p.key === 'vendor')?.href).toBe('/vendors/264374')
  })
})
