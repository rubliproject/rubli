import { describe, expect, it } from 'vitest'
import { bbox, camera, cleanSubs, frame, layout, wrap, type BodegaItem } from './CategoryBodega'
import { MAPPED_IDS } from '@/lib/categories/families'

const item = (id: number, v: number, da: number): BodegaItem => ({ category_id: id, name_es: `c${id}`, name_en: `c${id}`, total_value: v, total_contracts: 1, direct_award_pct: da })

describe('layout', () => {
  const items = [item(20, 600, 90), item(26, 300, 10), item(91, 100, 50), item(42, 0, 0)]
  const boxes = layout(items, 1000, 500)
  it('drops empty categories and keeps area ∝ money', () => {
    expect(boxes.map((b) => b.id).sort()).toEqual([20, 26, 91])
    const a = (id: number) => { const b = boxes.find((x) => x.id === id)!; return b.w * b.h }
    expect(a(20) / a(26)).toBeGreaterThan(1.8)
    expect(a(20) / a(26)).toBeLessThan(2.2)
  })
  it('height grows with the share bought sin concurso', () => {
    const z = (id: number) => boxes.find((x) => x.id === id)!.z
    expect(z(20)).toBeGreaterThan(z(91))
    expect(z(91)).toBeGreaterThan(z(26))
  })
  it('stays inside the plan', () => {
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(1000 + 1e-6); expect(b.y + b.h).toBeLessThanOrEqual(500 + 1e-6)
    }
  })
})

describe('camera', () => {
  it('t = 0 is the plain top-down plan (El piso)', () => {
    const c = camera(1000, 500, 500, 0)
    expect(c.P(1000, 500, 40)).toEqual([500, 250])
    expect(c.height).toBe(250)
  })
  it('t = 1 lifts by height (La bodega)', () => {
    const c = camera(1000, 500, 500, 1)
    expect(c.P(10, 10, 0)[1]).toBeGreaterThan(c.P(10, 10, 30)[1])
  })
})

describe('families', () => {
  it('map every category id at most once', () => {
    expect(new Set(MAPPED_IDS).size).toBe(MAPPED_IDS.length)
  })
})

describe('filterItems', () => {
  it('sums only the chosen sexenio and buyer sector, and recomputes sin concurso over procedure-known contracts', async () => {
    const { filterItems } = await import('./CategoryBodega')
    const base = [item(20, 999, 50), item(26, 999, 50)]
    const rows: [number, number, string, number, number, number, number][] = [
      [20, 1, 'amlo', 10, 100, 9, 10], [20, 1, 'fox', 10, 500, 0, 0], [20, 3, 'amlo', 10, 50, 0, 10], [26, 3, 'amlo', 4, 40, 1, 4],
    ]
    const r = filterItems(base, rows, 'amlo', 1)
    expect(r.find((c) => c.category_id === 20)).toMatchObject({ total_value: 100, total_contracts: 10, direct_award_pct: 90 })
    expect(r.find((c) => c.category_id === 26)).toMatchObject({ total_value: 0, total_contracts: 0, direct_award_pct: null })
    expect(filterItems(base, rows, 'amlo', null).find((c) => c.category_id === 20)!.total_value).toBe(150)
  })
})

describe('drill frame', () => {
  const all = layout([item(20, 600, 90), item(21, 200, 40), item(26, 300, 10)], 1000, 500)
  const salud = layout([item(20, 600, 90), item(21, 200, 40)], 1000, 500)
  const A = bbox(all.filter((b) => b.fam === 'salud'))!
  it('k = 0 is the old picture, k = 1 the new one', () => {
    const f0 = frame(all, salud, A, 1, 0, 1000, 500)
    for (const b of all) expect(f0.find((d) => d.key === b.key)!.x).toBeCloseTo(b.x)
    const f1 = frame(all, salud, A, 1, 1, 1000, 500).filter((d) => d.o > 0)
    expect(f1.map((d) => d.key).sort()).toEqual(['c20', 'c21'])
    for (const b of salud) expect(f1.find((d) => d.key === b.key)!.w).toBeCloseTo(b.w)
  })
  it('drilling in blows the other family out of the frame; drilling out brings it back', () => {
    const away = frame(all, salud, A, 1, 1, 1000, 500).find((d) => d.key === 'c26')!
    expect(away.o).toBe(0)
    expect(away.x >= 1000 || away.y >= 500 || away.x + away.w <= 0 || away.y + away.h <= 0).toBe(true)
    const back = frame(salud, all, A, -1, 0, 1000, 500).find((d) => d.key === 'c26')!
    expect(back.o).toBe(0)
    expect(back.x).toBeCloseTo(away.x)
  })
})

describe('wrap', () => {
  it('two lines at most, never «…»: no label when it does not fit', () => {
    expect(wrap('Servicios hospitalarios', 30)).toEqual(['Servicios hospitalarios'])
    expect(wrap('Servicios hospitalarios', 13)).toEqual(['Servicios', 'hospitalarios'])
    expect(wrap('Servicios hospitalarios', 12)).toEqual([])
    expect(wrap('Medicamentos', 6)).toEqual([])
  })
})

describe('cleanSubs (SILVER-8)', () => {
  const sub = (code: string, name = code, v = 1) => ({ code, total_value: v, name_es: name, name_en: name })
  it('drops the misfiled offshore-oil works and empty rows, renames only the raw catch-all', () => {
    const out = cleanSubs([sub('oil_offshore_misfiled'), sub('other_medical_supplies', 'Material de curación sin tipo en el texto'), sub('drainage_stoma'), sub('x', 'x', 0)])
    expect(out.map((x) => x.code)).toEqual(['other_medical_supplies', 'drainage_stoma'])
    expect(out[0].name_es).toBe('Otro material de curación (sin detalle)')
    expect(cleanSubs([sub('other_medical_supplies', 'Otros Insumos Médicos')])[0].name_es).toBe('Otros Insumos Médicos')
  })
})
