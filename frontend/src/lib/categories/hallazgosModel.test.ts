import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/hallazgos.json'
import { buildFindings, buildLectura, buildModel, cien, ID, type Payload } from './hallazgosModel'

const base = () => JSON.parse(JSON.stringify(fixture)) as Payload
const keys = (p: Payload) => buildLectura(buildModel(p)).map((c) => c.key)
const text = (p: Payload, k: string) => buildLectura(buildModel(p)).find((c) => c.key === k)!.es.map((t) => (typeof t === 'string' ? t : 'b' in t ? t.b : t.label)).join('')

describe('model (REVIEW_6 figures, DB 2026-10-28)', () => {
  const m = buildModel(base())
  it('F1: 36 → 63%, switch 2023, only 2021 before', () => {
    expect([cien(m.f1.before), cien(m.f1.after), m.f1.switchYear]).toEqual([36, 63, 2023])
    expect(m.f1.earlyHalf).toEqual([2021])
    expect(cien(m.f1.mx.da)).toBe(92)
  })
  it('F2: 3.6 × and four flagged', () => {
    expect(m.f2.ratio.toFixed(1)).toBe('3.6')
    expect(m.f2.big).toHaveLength(4)
  })
  it('F3: 4 of 34 owners', () => expect([m.f3.n40, m.f3.nAll]).toEqual([4, 34]))
  it('personas físicas: flagged by the payload, named, labelled in the claims', () => {
    const p = base(); const id = p.f3.rows.find((r) => r.cat === ID.ti)!.v as number
    p.persona_fisica = [id]
    const mm = buildModel(p)
    expect(mm.isPF(id)).toBe(true)
    expect(mm.isPF(null)).toBe(false)
    const ti = buildLectura(mm).find((c) => c.key === 'ti')!
    expect(ti.es.some((t) => typeof t === 'object' && 'ent' in t && t.id === id && t.pf === true)).toBe(true)
  })
})

describe('La lectura: each claim true / false', () => {
  it('giro', () => {
    expect(keys(base())).toContain('giro')
    const p = base(); p.f1_years.forEach((y) => { y.da = 0.3 })
    expect(keys(p)).not.toContain('giro')
  })
  it('mx', () => {
    expect(keys(base())).toContain('mx')
    const p = base(); p.f1.mx_da = 0.2
    expect(keys(p)).not.toContain('mx')
  })
  it('resto', () => {
    expect(keys(base())).toContain('resto')
    const p = base(); p.fed['2024'].dam = 0
    expect(keys(p)).not.toContain('resto')
  })
  it('curacion', () => {
    expect(keys(base())).toContain('curacion')
    const p = base(); p.f1.shifts[String(ID.curacion)].after = 0.1
    expect(keys(p)).not.toContain('curacion')
  })
  it('birmex', () => {
    expect(keys(base())).toContain('birmex')
    const p = base(); p.f2.bir_mx_da = 0.4
    expect(keys(p)).not.toContain('birmex')
  })
  it('veces names all four flagged contracts and the remainder', () => {
    const t = text(base(), 'veces')
    expect(t).toMatch(/Liomont/i)
    expect(t).toMatch(/uno sin proveedor/)
    expect(t).toMatch(/siguen siendo/)
    const p = base(); p.f2.bir_all_mx_m = p.f2.bir_life_m / 2
    expect(keys(p)).not.toContain('veces')
  })
  it('relevo', () => {
    expect(keys(base())).toContain('relevo')
    const p = base(); p.f2.imssb_first = 2020
    expect(keys(p)).not.toContain('relevo')
  })
  it('imss', () => {
    expect(keys(base())).toContain('imss')
    const p = base(); p.f2.imss_mx_m = p.f2.imss2025 * 2
    expect(keys(p)).not.toContain('imss')
  })
  it('duenos', () => {
    expect(text(base(), 'duenos')).toMatch(/era una/)
    const p = base(); p.f3.rows.forEach((r) => { r.share = 0.2 })
    expect(keys(p)).not.toContain('duenos')
  })
  it('gasolina', () => {
    expect(text(base(), 'gasolina')).toMatch(/una sola compra/)
    const p = base(); p.f3.rows.find((r) => r.cat === ID.fuel)!.share = 0.3
    expect(keys(p)).not.toContain('gasolina')
  })
  it('vales', () => {
    expect(keys(base())).toContain('vales')
    const p = base(); p.f3.mx57.broxel = 0
    expect(keys(p)).not.toContain('vales')
  })
  it('ti', () => {
    expect(keys(base())).toContain('ti')
    const p = base(); p.f3.rows.find((r) => r.cat === ID.ti)!.share_before = 0.9
    expect(keys(p)).not.toContain('ti')
  })
  it('lab', () => {
    expect(keys(base())).toContain('lab')
    const p = base(); p.f4.find((s) => s.cat === ID.lab)!.rows.find((r) => r.id === ID.issste)!.da = 0.2
    expect(keys(p)).not.toContain('lab')
  })
  it('hosp', () => {
    expect(keys(base())).toContain('hosp')
    const p = base(); p.f4.find((s) => s.cat === ID.hosp)!.rows.find((r) => r.id === ID.issste)!.da = 0.1
    expect(keys(p)).not.toContain('hosp')
  })
  it('curacion4', () => {
    expect(keys(base())).toContain('curacion4')
    const p = base(); p.f4.find((s) => s.cat === ID.curacion)!.rows.find((r) => r.id === ID.imss)!.da = 0.1
    expect(keys(p)).not.toContain('curacion4')
  })
  it('never «probabilidad» or «cola»', () => {
    const all = JSON.stringify(buildLectura(buildModel(base())))
    expect(all).not.toMatch(/probabilidad|probability|\bcola\b/i)
  })
})

describe('by sector (owner 11-06): the generic owner finding', () => {
  const fk = (p: Payload) => buildFindings(buildModel(p)).map((f) => f.key)
  it('never on the national payload', () => { expect(fk(base())).not.toContain('dueno') })
  it('on a sector payload where the fuel story does not hold: the category whose top supplier takes the most', () => {
    const p = base(); p.sector = 9
    p.f3.rows = p.f3.rows.filter((r) => r.cat !== ID.fuel)
    const f = buildFindings(buildModel(p)).find((x) => x.key === 'dueno')!
    const top = [...p.f3.rows].filter((r) => r.share >= 0.4).sort((a, b) => b.share - a.share)[0]
    expect(f.cat).toBe(top.cat)
    expect(f.es).toContain(`${cien(top.share)} de cada 100 pesos`)
    expect(f.es.split(/\s+/).length).toBeLessThanOrEqual(15)
  })
  it('not when no category in the sector has an owner at 40 % or more', () => {
    const p = base(); p.sector = 9
    p.f3.rows = p.f3.rows.map((r) => ({ ...r, share: 0.3 }))
    expect(fk(p)).not.toContain('dueno')
  })
  it('not twice: when the fuel story holds in the sector, it is the owner finding', () => {
    const p = base(); p.sector = 7
    expect(fk(p)).toContain('combustible'); expect(fk(p)).not.toContain('dueno')
  })
})

describe('the four findings: each sentence true / false, ≤ 15 words', () => {
  const fk = (p: Payload) => buildFindings(buildModel(p)).map((f) => f.key)
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  it('all four hold on the fixture, each ≤ 15 words in both languages', () => {
    const fs = buildFindings(buildModel(base()))
    expect(fs.map((f) => f.key)).toEqual(['medicina', 'birmex', 'combustible', 'laboratorio'])
    fs.forEach((f) => { expect(words(f.es)).toBeLessThanOrEqual(15); expect(words(f.en)).toBeLessThanOrEqual(15) })
    expect(fs[0].es).toBe('Desde 2023, más de la mitad del dinero de las medicinas va sin concurso.')
    expect(fs[3].es).toBe('En laboratorio, el ISSSTE da sin concurso 66 de cada 100 pesos; el IMSS, 16.')
  })
  it('medicina', () => {
    const p = base(); p.f1_years.forEach((y) => { y.da = 0.3 })
    expect(fk(p)).not.toContain('medicina')
  })
  it('birmex needs to hold without the flagged contracts', () => {
    const p = base(); p.f2.bir_flag_m = p.f2.bir_all_mx_m
    expect(fk(p)).not.toContain('birmex')
  })
  it('combustible', () => {
    const p = base(); p.f3.rows.forEach((r) => { if (r.cat === ID.fuel) r.share = 0.3 })
    expect(fk(p)).not.toContain('combustible')
  })
  it('laboratorio', () => {
    const p = base(); p.f4.forEach((s) => s.rows.forEach((r) => { if (r.id === ID.issste) r.da = 0.2 }))
    expect(fk(p)).not.toContain('laboratorio')
  })
})
