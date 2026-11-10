import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/client', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ formatCompactMXN: (n: number) => `${Math.round(n / 1e6)} MDP` }))

import {
  columnPieces, findingC3, findingP2, findingP3, findingP4, halfCount, inactiveSince, isAlways, isNew, lensRows, queryOf,
  scopeLabel, segText, splitDigits, leaderShare, squaresOf, HOY_FROM, type Panorama, type PanoramaSupplier,
} from './panorama'

const sup = (id: number, amount: number, o: Partial<PanoramaSupplier> = {}): PanoramaSupplier => ({
  vendor_id: id, vendor_name: `V${id}`, amount_mxn: amount, contracts: 10, share_pct: null, da_pct: 50, da_amount_mxn: amount / 2,
  avg_risk: 0.3, hr_pct: 10, first_year: 2020, last_year: 2025, first_year_all: 2015, last_year_all: 2025, years: [[2025, amount]],
  main_category_id: 20, primary_pattern: null, in_ground_truth: false, efos: false, sfp: false, persona_fisica: false, ...o,
})
const pano = (sups: PanoramaSupplier[], total: number, o: Partial<Panorama> = {}): Panorama => ({
  institution_id: 1, since: null, until: null, year: null, category_id: null, amount_mxn: total, contracts: 100, da_pct: 70, avg_risk: 0.3, hr_pct: 10,
  vendors: sups.length + 10, suppliers: sups.map((s) => ({ ...s, share_pct: Math.round((10000 * s.amount_mxn) / total) / 100 })),
  rest: { vendors: 10, amount_mxn: total - sups.reduce((a, s) => a + s.amount_mxn, 0), contracts: 50 }, categories: [], years: [], sexenios: [], ...o,
})
// Casa de Moneda-like: concentrated · IMSS-like: spread
const CONC = pano([sup(1, 27e6), sup(2, 15e6), sup(3, 10e6), sup(4, 5e6)], 100e6)
const SPREAD = pano([sup(1, 4e6), sup(2, 3e6), sup(3, 3e6)], 100e6)

describe('scope', () => {
  it('Hoy is cut from the day this government began; Historia «gobierno» is its years', () => {
    expect(queryOf({ vista: 'hoy', year: null, gob: null, cat: null })).toEqual({ since: HOY_FROM })
    expect(queryOf({ vista: 'historia', year: null, gob: 'epn', cat: 20 })).toEqual({ since: '2013-01-01', until: '2018-12-31', category_id: 20 })
    expect(queryOf({ vista: 'historia', year: null, gob: 'sheinbaum', cat: null })).toEqual({ since: HOY_FROM, until: '2030-12-31' })
    expect(queryOf({ vista: 'historia', year: null, gob: 'amlo', cat: null }).until).toBe('2024-09-30')
    expect(queryOf({ vista: 'historia', year: 2019, gob: null, cat: null })).toEqual({ year: 2019 })
  })
  it('labels the scope in both languages', () => {
    expect(scopeLabel({ vista: 'hoy', year: null, gob: null, cat: null }, 'es')).toBe('con este gobierno')
    expect(scopeLabel({ vista: 'historia', year: null, gob: 'epn', cat: null }, 'en')).toBe('under Peña Nieto')
    expect(scopeLabel({ vista: 'historia', year: null, gob: null, cat: 20 }, 'es', 'Medicamentos')).toBe('en medicamentos')
  })
})

describe('half the money', () => {
  it('true: three plates reach half (concentrated)', () => expect(halfCount(CONC)).toBe(3))
  it('false: the named suppliers never reach half (spread)', () => expect(halfCount(SPREAD)).toBeNull())
})

describe('findingP2', () => {
  it('concentrated: names the supplier with its share', () => {
    const t = segText(findingP2(CONC, 'dinero', 'con este gobierno', 2026, 'es'))
    expect(t).toBe('3 proveedores juntan la mitad del dinero con este gobierno. V1: 27 de cada 100 pesos.')
  })
  it('spread: says nobody passes N of 100 (and is not the concentrated sentence)', () => {
    const t = segText(findingP2(SPREAD, 'dinero', 'de 2002 a 2026', 2026, 'es'))
    expect(t).toBe('Ni sus 3 mayores juntan la mitad del dinero de 2002 a 2026. Gasto repartido: ninguno pasa de 4 de cada 100 pesos.')
    expect(t).not.toMatch(/V1:/)
  })
  it('lists lens: true and false', () => {
    const listed = pano([sup(1, 30e6, { efos: true }), sup(2, 20e6)], 100e6)
    expect(segText(findingP2(listed, 'listas', 'x', 2026, 'es'))).toMatch(/1 de sus 2 mayores están en casos documentados/)
    expect(segText(findingP2(CONC, 'listas', 'x', 2026, 'en'))).toMatch(/None of its 4 largest is on a public list\./)
  })
  it('carries the persona-física flag with the name', () => {
    const p = pano([sup(1, 60e6, { persona_fisica: true })], 100e6)
    expect(findingP2(p, 'dinero', 'x', 2026, 'es').find((s) => typeof s !== 'string')).toEqual({ id: 1, name: 'V1', pf: true })
  })
  it('every sentence is ≤ 15 words', () => {
    for (const lens of ['dinero', 'directo', 'siempre', 'nuevos', 'listas'] as const) {
      for (const p of [CONC, SPREAD]) {
        for (const lang of ['es', 'en'] as const) {
          for (const s of segText(findingP2(p, lens, 'con este gobierno', 2026, lang)).split(/(?<=\.)\s/)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(15)
        }
      }
    }
  })
  it('no contracts: says so', () => expect(segText(findingP2(pano([], 0), 'dinero', 'en 2019', 2026, 'es'))).toBe('Sin contratos en 2019.'))
})

describe('lenses', () => {
  it('siempre / nuevos: true and false', () => {
    expect(isAlways(sup(1, 1, { first_year_all: 2003, last_year_all: 2026 }), 2026)).toBe(true)
    expect(isAlways(sup(1, 1, { first_year_all: 2003, last_year_all: 2019 }), 2026)).toBe(false)
    expect(isNew(sup(1, 1, { first_year_all: 2025 }), 2026)).toBe(true)
    expect(isNew(sup(1, 1, { first_year_all: 2023 }), 2026)).toBe(false)
  })
  it('sin concurso sorts by money without a tender', () => {
    const rows = [sup(1, 10, { da_amount_mxn: 1 }), sup(2, 5, { da_amount_mxn: 4 })]
    expect(lensRows(rows, 'directo', 2026).map((r) => r.vendor_id)).toEqual([2, 1])
  })
  it('inactive since: true before this government, false otherwise', () => {
    expect(inactiveSince(sup(1, 1, { last_year_all: 2019 }))).toBe(2019)
    expect(inactiveSince(sup(1, 1, { last_year_all: 2025 }))).toBeNull()
  })
})

describe('the column', () => {
  it('compresses «los demás» when it would dominate, and marks half the money inside the plates when it falls there', () => {
    const s = columnPieces(SPREAD)
    const cap = s.pieces.find((p) => p.kind === 'cap')!
    expect(cap.kind === 'cap' && cap.compressed).toBe(true)
    expect(s.halfY).toBeNull()
    const c = columnPieces(CONC)
    expect(c.halfY).not.toBeNull()
    expect(c.pieces.filter((p) => p.kind === 'plate').length).toBe(4)
  })
  it('folds plates thinner than 3 px into one band', () => {
    const p = pano([sup(1, 90e6), sup(2, 0.1e6), sup(3, 0.1e6)], 100e6)
    expect(columnPieces(p).pieces.map((x) => x.kind)).toEqual(['plate', 'tiny', 'cap'])
  })
})

describe('P3 · P4 · C3 findings', () => {
  const P = pano([], 1, { sexenios: [
    { key: 'calderon', from: 2007, to: 2012, amount_mxn: 5, contracts: 1, da_pct: 90, avg_risk: null, hr_pct: null, top3: [] },
    { key: 'epn', from: 2013, to: 2018, amount_mxn: 5, contracts: 1, da_pct: 74, avg_risk: null, hr_pct: null, top3: [] },
    { key: 'amlo', from: 2019, to: 2024, amount_mxn: 5, contracts: 1, da_pct: 82, avg_risk: null, hr_pct: null, top3: [] },
  ] })
  it('P3 Historia names the two sexenios with most direct awards, skipping partial ones', () => {
    expect(findingP3(squaresOf(P, 'historia', 'es'), 'historia', 'es')).toBe('Con AMLO, 82 de cada 100 contratos fueron sin concurso. Con Peña Nieto, 74.')
  })
  it('P3 falls back to the biggest square when fewer than two have a share', () => {
    const one = pano([], 1, { years: [{ year: 2025, amount_mxn: 9e6, contracts: 1, da_pct: null, avg_risk: null, hr_pct: null, top3: [] }] })
    expect(findingP3(squaresOf(one, 'hoy', 'es'), 'hoy', 'es')).toBe('Más dinero: 2025, 9 MDP.')
  })
  it('P4: the top category, and the most direct one only with ≥ 20 contracts', () => {
    const cats = [
      { category_id: 20, name_es: 'Medicamentos', name_en: 'Medicines', share_pct: 42, amount_mxn: 1, contracts: 500, da_pct: 60, avg_risk: null, hr_pct: null },
      { category_id: 26, name_es: 'Obra', name_en: 'Works', share_pct: 10, amount_mxn: 1, contracts: 5, da_pct: 99, avg_risk: null, hr_pct: null },
    ]
    expect(findingP4(cats, 'es')).toBe('Medicamentos: 42 de cada 100 pesos. Más sin concurso: Medicamentos, 60 de 100.')
    expect(findingP4([], 'en')).toBe('No category on record.')
  })
  it('C3 competencia names who was paid most without a tender', () => {
    expect(segText(findingC3([sup(1, 10e6, { da_amount_mxn: 2e6 }), sup(2, 9e6, { da_amount_mxn: 8e6 })], 'competencia', 'es'))).toBe('V2 cobró 8 MDP sin concurso, más que nadie.')
    expect(segText(findingC3([], 'proceso', 'en'))).toBe('No supplier behind this pillar.')
  })
})

describe('splitDigits / leaderShare — a tie at the printed precision gets one more decimal', () => {
  it('adds decimals until the two print apart', () => {
    expect(splitDigits(3.62, 3.61)).toBe(2)
    expect(splitDigits(3.6, 1.2)).toBe(0)
    expect(splitDigits(3.6, 3.6, 1)).toBe(2) // capped
  })
  it('names the runner-up when it ties', () => {
    const rows = [sup(1, 100, { share_pct: 3.62 }), sup(2, 99, { share_pct: 3.61 })]
    expect(segText(leaderShare(rows, 'es'))).toBe(': 3.62 de cada 100 pesos, casi empatado con V2 (3.61).')
    expect(segText(leaderShare([sup(1, 100, { share_pct: 12.4 }), sup(2, 50, { share_pct: 6.1 })], 'en'))).toBe(': 12 of every 100 pesos.')
  })
})
