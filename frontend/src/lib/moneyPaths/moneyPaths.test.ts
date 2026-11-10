/** Money paths: the ladder registry, the trail's claims, the wall's encodings and Captura's claims — each true on the
 *  real shape and false when the fact under it breaks. */
import { describe, expect, it } from 'vitest'
import type { CapturaBuyer, CapturaPair, CapturaPairDetail } from '@/api/captura'
import type { ContractDetail } from '@/api/types'
import type { NsvEntity } from '@/api/noSeVe'
import page from '@/lib/noSeVe/__fixtures__/page.json'
import { buildModel } from '@/lib/noSeVe/model'
import { IMSS as IMSS_ID, YEARS, buildRelevo } from '@/lib/captura/relevo'
import { HOLDS, STEPS, rungsFor, type MpPage } from './ladder'
import { RASTRO, chapters, claimsHold, despues, despuesHolds, head, nests, stages, trailOk, type RastroPack } from './rastro'
import { capturaHolds, capturaCopy, HEMOSER } from './captura'
import { capturaGrid, capturaSpec, gastoGrid, gastoSpec, rastroSpec } from './muro'
import { cv, pct } from './fmt'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

describe('la escalera', () => {
  const pages: MpPage[] = ['gasto', 'captura', 'rastro']
  it('every rung is held by at least one page, and an away rung links to a page that holds it', () => {
    for (const s of STEPS) expect(pages.some((p) => HOLDS[p][s.k])).toBe(true)
    for (const p of pages) for (const r of rungsFor(p, {}, 'es')) {
      if (r.here) expect(HOLDS[p][r.k]).toBeTruthy()
      else { const [path, hash] = r.href!.split('#'); const holder = pages.find((q) => path.endsWith(q === 'gasto' ? 'gasto-a-ciegas' : q)); expect(holder && HOLDS[holder][r.k]).toBe(hash) }
    }
  })
  it('a page prints its own instance; an away rung never prints a figure', () => {
    const rs = rungsFor('gasto', { 1: 'Cuenta Pública 2020–2025 · 19 entes' }, 'es')
    expect(rs[0].inst).toContain('19 entes')
    for (const r of rs.filter((q) => !q.here)) expect(r.inst).not.toMatch(/\d/)
  })
})

describe('El rastreo de un peso · the trail', () => {
  it('nests 100 > 47 > 42 > 14 > 2.2 > 0', () => {
    expect(nests()).toBe(true)
    const b = clone(RASTRO); b.c.maypo = 20
    expect(nests(b)).toBe(false)
  })
  it('every claim the V2 copy makes holds on the pack', () => {
    const h = claimsHold()
    for (const [k, v] of Object.entries(h)) expect([k, v]).toEqual([k, true])
  })
  it('each claim fails when its fact breaks', () => {
    const b = (f: (r: RastroPack) => void) => { const r = clone(RASTRO); f(r); return claimsHold(r) }
    expect(b((r) => { r.c.reg = 60 }).overHalfUnmatched).toBe(false)
    expect(b((r) => { r.reg24.da = r.reg24.mdp * 0.95 }).nearlyNineInTen).toBe(false)
    expect(b((r) => { r.nonda.sb_n = r.nonda.np }).nearlySixInTen).toBe(false)
    expect(b((r) => { r.exc24[1].mdp = 1e9 }).lossesTopByMoney).toBe(false)
    expect(b((r) => { r.exc24[2].n = 1 }).unforeseenTopByCountThirdByMoney).toBe(false)
    expect(b((r) => { r.reg_cn['2025'].mdp = 1 }).signedOverSpent2025).toBe(false)
    expect(b((r) => { r.top24[0].id = RASTRO.maypo.id; r.top24[2].id = 1 }).maypoThird).toBe(false)
    expect(b((r) => { r.cmxp.cite = 10 }).mostCiteNewLaw).toBe(false)
  })
  it('the after-beat comparisons hold, and fail when Maypo stops falling', () => {
    const h = despuesHolds()
    expect(Object.values(h).every(Boolean)).toBe(true)
    const r = clone(RASTRO); r.close.n['2026'] = 5000
    expect(despuesHolds(r).fallsEveryYear).toBe(false)
  })
  it('the after-beat names the latest and largest buyers; «otra vez» only for the IMSS', () => {
    expect(despues('es').p).toContain('octubre, otra vez con el IMSS. El más grande de este año también fue con el IMSS:')
    expect(despues('en').p).toContain('October, again with the IMSS. This year’s largest was with the IMSS too:')
    const r = clone(RASTRO); r.close.last_sig = 'ISSSTE'
    expect(despues('es', r).p).toContain('octubre, con otro comprador (ISSSTE). El más grande de este año fue con el IMSS:')
    expect(despues('en', r).p).toContain('October, with ISSSTE. This year’s largest was with the IMSS:')
    r.close.big_sig = 'INER'
    expect(despues('es', r).p).toContain('fue con otro comprador (INER):')
    expect(despues('en', r).p).not.toMatch(/again|too:/)
  })
  it('prints the verdict line and «el último día» only on 31 December', () => {
    expect(head('es', '2024-12-31').verdict).toEqual(['47', '42', '14', '2.2', '0'])
    expect(head('es', '2024-12-31').h1).toMatch(/^El último día de 2024/)
    expect(head('es', '2024-12-30').h1).not.toMatch(/último día/)
  })
  it('the six stages: struck coins never grow, red only on Maypo', () => {
    const st = stages('es')
    for (let k = 1; k < st.length; k++) expect(st[k].c).toBeLessThanOrEqual(st[k - 1].c)
    expect(st.filter((s) => s.seal).map((s) => s.k)).toEqual(['maypo'])
    const sp = rastroSpec(RASTRO.contract as unknown as ContractDetail, 'es', false)
    expect(sp.trays.map((t) => t.struck)).toEqual([100, 47, 42, 14, 2, 0])
    expect(sp.vaults).toHaveLength(3)
    expect(sp.trays.filter((t) => t.seal)).toHaveLength(1)
  })
  it('the ASF line keeps its source and an editor TODO flag (not rendered) until the result number is copied', () => {
    const r = chapters('es', null)[2].rail[1]
    expect(r.src).toBe('ASF · Cuenta Pública 2023 · auditoría 234 · contrato de servicios 048/2022')
    expect(r.t).toContain('«por aclarar»')
    expect(r.todo).toMatch(/POR COPIAR/)
    expect(r.n).toBe('152.5 millones')
    const p = clone(RASTRO) as RastroPack & { asf: { result: string | null } }; p.asf.result = '5'
    expect(chapters('es', null, p as RastroPack)[2].rail[1].todo).toBeUndefined()
  })
  it('the Gasto hinge prints only with the IMSS figures loaded', () => {
    expect(chapters('es', null)[0].rail).toHaveLength(4)
    expect(chapters('es', { ex: 208.9e9, vis: 121e9 })[0].rail[4].n).toBe(pct(121 / 208.9, 'es'))
  })
  it('a weekly trail replaces the bundled pack only while every claim holds on it', () => {
    expect(trailOk(RASTRO)).toBe(true)
    const r = clone(RASTRO); r.c.reg = 60
    expect(trailOk(r)).toBe(false)
    expect(trailOk({ detail: 'Not Found' })).toBe(false)
    expect(trailOk(undefined)).toBe(false)
    const other = clone(RASTRO); other.contract.id = 1   // another contract: the «31 de diciembre» copy is unchecked
    expect(trailOk(other)).toBe(false)
    const noFrI = clone(RASTRO); noFrI.maypo.imss24.exc = noFrI.maypo.imss24.exc.filter((e) => e.s !== 'fr. I')
    expect(trailOk(noFrI)).toBe(false)
    const t2 = clone(RASTRO); t2.maypo.tier = 2
    expect(claimsHold(t2).maypoTopTier).toBe(false)
    expect(trailOk(t2)).toBe(false)
  })
  it('formats centavos as the copy does', () => { expect(cv(2.2239, 'es', 1)).toBe('2.2'); expect(cv(0, 'es')).toBe('0') })
})

describe('El muro · Gasto', () => {
  const m = buildModel((page as { entities: NsvEntity[] }).entities, (page as { meta: { cp_years: number[] } }).meta.cp_years)!
  const sp = gastoSpec(m, 'es', false)
  const cells = sp.walls[0].cells
  it('one box per entity-year with spend; out-by-law boxes are lidded and empty', () => {
    const n = m.ents.reduce((s, e) => s + e.ex.filter((v) => v > 0).length, 0)
    expect(cells.length).toBe(n + 1)
    for (const c of cells.filter((q) => q.lid)) expect(c.fill).toBe(0)
  })
  it('the block never passes the box; a lip marks every share over 100%', () => {
    for (const c of cells) expect(c.fill ?? 0).toBeLessThanOrEqual(1)
    const over = m.ents.filter((e) => e.grp !== 'ley').flatMap((e) => e.ex.map((v, i) => (v > 0 && e.vis[i] / v > 1 ? 1 : 0))).reduce<number>((a, b) => a + b, 0)
    expect(cells.filter((c) => c.lip).length).toBe(over)
  })
  it('the Tren Maya 2022–24 box: floor = block, ceiling = translucent, never red', () => {
    const t = cells[cells.length - 1]
    expect(t.fill).toBeCloseTo(m.mid.share); expect(t.ghost).toBeCloseTo(m.mid.ub); expect(t.crit).toBeFalsy()
    expect(cells.some((c) => c.crit)).toBe(false)
  })
  it('the twin has one row per entity plus the 2022–24 row', () => { expect(sp.twin.rows).toHaveLength(m.ents.length + 1) })
})

describe('El muro, plano · Gasto (owner 11-06: one row per entity, one cell per year, number printed)', () => {
  const m = buildModel((page as { entities: NsvEntity[] }).entities, (page as { meta: { cp_years: number[] } }).meta.cp_years)!
  const g = gastoGrid(m, 'es')
  it('one row per entity, one cell per year', () => {
    expect(g.rows).toHaveLength(m.ents.length)
    for (const r of g.rows) expect(r.cells).toHaveLength(m.years.length)
    expect(g.cols.map((c) => c.k)).toEqual(m.years.map(String))
  })
  it('the fill is the share in view, capped at 100 % and marked «+100%» above it; by-law and no-spend cells have no bar', () => {
    m.ents.forEach((e, k) => e.ex.forEach((ex, i) => {
      const c = g.rows[k].cells[i]
      if (!(ex > 0)) { expect(c.kind).toBe('none'); expect(c.v).toBeNull(); return }
      if (e.grp === 'ley') { expect(c.kind).toBe('ley'); expect(c.v).toBeNull(); return }
      const sh = e.vis[i] / ex
      expect(c.v).toBeCloseTo(Math.min(1, sh))
      expect(c.kind === 'over').toBe(sh > 1)
      if (sh <= 1) expect(c.label).toBe(pct(sh, 'es'))
    }))
  })
  it('Mariana’s three lines are there, and the finding carries the civilian median', () => {
    expect(g.lines.every((s) => s.length > 0)).toBe(true)
    expect(g.lines[2]).toContain(pct(m.civMedian, 'es'))
    expect(g.note).toContain(pct(m.mid.share, 'es'))
  })
})

describe('El muro · Captura (every box full; colour = captive money; red only on the crítico contract)', () => {
  let vid = 1
  const buyer = (id: number, sector: number, total: number, cap: number): CapturaBuyer => ({ institution_id: id, name: `B${id}`, siglas: id === IMSS_ID ? 'IMSS' : null, sector_id: sector, total: 0, cap: 0, cap_share: 0, n: 1, da: null, m11: 0, post: 0, post_n: 0, post_total: 1e9, post_total_n: 0, y_total: YEARS.map(() => total), y_cap: YEARS.map(() => cap), y_n: YEARS.map(() => 0), pf_n: 0, pf_m: 0, pub_n: 0, pub_m: 0, fp_n: 0, n_doc: 0, n_lead: 0, median_years: 0 })
  const pair = (inst: number, y0: number, y1: number, m: number, id?: number): CapturaPair => ({ vendor_id: id ?? vid++, institution_id: inst, name: 'X, S.A. DE C.V.', m, sh: 0.9, y0, y1, ny: y1 - y0 + 1, lock0: null, lock1: null, lockrun: 0, da: null, flag: 0, post: 0, post_n: 0, gt: null, risk: 0.2 })
  const world = (energyBig = true, healthCur = true) => buildRelevo(
    [buyer(311, 4, 10e9, energyBig ? 3e9 : 1e8), buyer(IMSS_ID, 1, 10e9, 2e9), buyer(9, 3, 1e9, 0)],
    [...Array.from({ length: 30 }, () => pair(311, 2003, healthCur ? 2015 : 2025, energyBig ? 9e9 : 1e7)), ...Array.from({ length: 20 }, () => pair(IMSS_ID, 2010, healthCur ? 2025 : 2020, 1e8)), pair(IMSS_ID, 2002, 2025, 14e9, HEMOSER)])
  const detail: CapturaPairDetail = { pair: { ...pair(IMSS_ID, 2002, 2025, 14e9, HEMOSER), sh: 0.83, vt: 17e9, n: 310, lockn: 13, m11: 0, tier: 2, p6: 0, efos: 0, sfp: 0, nbuyers: 14, yrs: [[2002, 1e6], [2020, 4e9], [2021, 3e9]], da: 0.05, post: 3e8, post_n: 9, risk: 0.715 }, contracts: [{ id: 7, year: 2020, amount_mxn: 3.18e9, is_direct_award: 0, title: 'Laboratorio' }], by_year: [], proc: [{ type: 'licitacion', n: 150, m: 13.6e9 }] }
  const contract = (risk: number) => ({ id: 7, contract_number: '2394005', title: 'SERVICIO DE LABORATORIO', amount_mxn: 3.18e9, contract_date: '2020-08-13', risk_score: risk, is_direct_award: false, procedure_character: 'Internacional bajo TLC', start_date: '2020-07-02', end_date: '2022-06-14', publication_date: '2019-10-31', award_date: '2019-12-06', risk_factors: ['price_anomaly', 'split_2'] }) as unknown as ContractDetail
  it('every buyer box with 2024–25 spend is full; the coloured block is the captive share', () => {
    const m = world()
    const sp = capturaSpec({ m, pair: detail, contract: contract(0.95), vendorName: 'HEMOSER, S.A. DE C.V.' }, 'es', false)
    const all = sp.walls.flatMap((w) => w.cells)
    for (const c of all.filter((q) => !q.dark && q.fill !== 0)) expect(c.fill).toBe(1)
    expect(all.filter((c) => c.crit)).toHaveLength(1)
    expect(sp.states).toHaveProperty('4')
  })
  it('plano: rows = the top buyers, columns = the five administrations, fill = their captive share of the term', () => {
    const m = world()
    const g = capturaGrid(m, 'es', IMSS_ID)
    expect(g.cols.map((c) => c.k.replace('­', ''))).toEqual(m.chapters.map((c) => c.name))
    expect(g.rows.map((r) => r.key)).toEqual(m.register.slice(0, 12).map((b) => String(b.institution_id)))
    const imss = g.rows.find((r) => r.key === String(IMSS_ID))!
    expect(imss.hi).toBe(true)
    for (const c of imss.cells) expect(c.v).toBeCloseTo(0.2)               // 2e9 of 10e9 every year
    const none = g.rows.find((r) => r.key === '9')!
    for (const c of none.cells) expect(c.v).toBeCloseTo(0)                 // spend, nothing captive: an empty bar, not «—»
    expect(g.lines[2]).toContain(pct(m.chapters[0].share, 'es'))
  })
  it('no red top when the contract is not crítico', () => {
    const sp = capturaSpec({ m: world(), pair: detail, contract: contract(0.5), vendorName: 'X' }, 'es', false)
    expect(sp.walls.flatMap((w) => w.cells).some((c) => c.crit)).toBe(false)
  })
  it('the handover claim prints only when energy took most and health holds the current captives', () => {
    expect(capturaHolds(world(), null, null).energyLargestEver).toBe(true)
    expect(capturaHolds(world(false), null, null).energyLargestEver).toBe(false)
    expect(capturaHolds(world(true, false), null, null).healthHoldsCurrent).toBe(false)
  })
  it('the sourced Hemoser paragraphs print only for that pair', () => {
    const m = world()
    const p3 = (d: CapturaPairDetail) => capturaCopy({ m, maj: null, pair: d, contract: contract(0.95) }, 'es').chapters.find((c) => c.k === 3)!
    expect(p3(detail).prose.join(' ')).toContain('Competencia Económica')
    const other = clone(detail); other.pair.vendor_id = 1
    expect(p3(other).prose.join(' ')).not.toContain('Competencia Económica')
  })
  it('chapter IV says «crítico» only when the indicator is', () => {
    const iv = (r: number) => capturaCopy({ m: world(), maj: null, pair: detail, contract: contract(r) }, 'es').chapters.find((c) => c.k === 4)!
    expect(iv(0.95).prose.join(' ')).toContain('crítico')
    expect(iv(0.3).prose.join(' ')).not.toContain('crítico')
  })
})
