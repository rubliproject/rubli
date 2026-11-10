import { describe, expect, it } from 'vitest'
import type { NsvEntity, NsvGroup } from '@/api/noSeVe'
import page from './__fixtures__/page.json'
import { buildLectura, pct, type Claim, type ClaimKey } from './lectura'
import { buildModel } from './model'

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025]
const M = 1e6

/** A synthetic entity: exercised / visible / trusts / total per year, in MDP. */
function ent(key: string, grp: NsvGroup, ex: number[], vis: number[], tr: number[] = [], tot: number[] = []): NsvEntity {
  return {
    entity_key: key, sort: 0, grp, label_es: key, label_en: key, short: key.toUpperCase(), cp_code: '00-X', institution_ids: [1],
    project_key: grp === 'proj' ? 'C' : null,
    years: YEARS.map((y, k) => ({
      year: y, ur_codes: null, exercised_cap2356: ex[k] * M, exercised_cap1: 0, exercised_cap4: (tr[k] ?? 0) * M, exercised_cap6: 0,
      exercised_total: (tot[k] ?? ex[k] + (tr[k] ?? 0)) * M, trusts_46101: (tr[k] ?? 0) * M,
      contracts_visible_mxn: vis[k] * M, contracts_n: 1, contracts_da_mxn: 0, pct_visible: ex[k] ? vis[k] / ex[k] : null,
    })),
  }
}

/** A world where every claim holds (shaped like the real one); each flag breaks one claim. */
function world(o: Partial<Record<'signedLater' | 'preCovers' | 'midVisible' | 'tsaVisible' | 'fewTrusts' | 'sedenaBuys' | 'ciitBuilds' | 'imssTrust' | 'fewCiv' | 'semarVisible' | 'leySigns' | 'noneOver', boolean>> = {}) {
  const z = [0, 0, 0, 0, 0, 0]
  const E: NsvEntity[] = [
    ent('tren-maya', 'proj', [7, 32, 179, 98, 151, 28], o.signedLater ? [1, 1, 9, 6, 5, 1] : [o.preCovers ? 500 : 72, 56, o.midVisible ? 150 : 9, o.midVisible ? 90 : 6, o.midVisible ? 140 : 5, 1]),
    ent('tren-maya-sa', 'ns', [0, 0, 0, 2, 18, 27], [0, 0, 0, 0, o.tsaVisible ? 10 : 0.26, 1.2], [0, 0, 0, 8, 12, 0]),
    ent('sedena', 'ns', [33, 24, 27, 30, 31, 29], [15, 18, 12, 20, 22, 15], o.sedenaBuys ? [1, 1, 1, 1, 1, 0] : [27, 45, 40, 17, 73, 0]),
    ent('semar', 'ns', [14, 17, 18, 22, 27, 27], o.semarVisible ? [10, 12, 14, 18, 22, 20] : [3, 3, 7, 4, 4, 4], o.fewTrusts ? z : [0, 0, 0, 0, 2, 0]),
    ent('ciit', 'ns', [0.1, 0.1, 0.2, 0.1, 0.05, 0], [0, 0, 0, 0, 0.02, 0], o.fewTrusts ? z : [0, 0, 0, 0, 31, 0], o.ciitBuilds ? [1, 1, 1, 1, 60, 1] : []),
    ent('fit', 'ns', [1.5, 1, 2.6, 3.3, 31, 3.6], [3.4, 0.3, 0.7, 0.6, 2.5, 5]),
    ent('aifa', 'ns', [0, 0.2, 0.9, 1, 1, 0.5], o.noneOver ? [0, 0, 0, 0, 0, 0] : [0, 0, 0.6, 0.8, 1.3, 1.4]),
    ent('imss', 'civ', [99, 112, 148, 175, 209, 227], [123, 132, 151, 108, 121, 292], o.imssTrust ? [0, 0, 0, 0, 5, 0] : z),
    ent('issste', 'civ', [70, 49, 74, 74, 83, 76], [34, 22, 43, 22, 23, 62]),
    ...(o.fewCiv ? [] : [ent('sep', 'civ', [3, 3, 4, 3, 5, 6], [3, 4, 3, 1, 2, 4]), ent('sict', 'civ', [37, 37, 40, 48, 50, 52], [21, 29, 27, 24, 8, 29])]),
    ent('pemex', 'ley', [230, 302, 372, 362, 361, 371], o.leySigns ? [1, 0, 0, 0, 0, 0] : z),
    ent('cfe', 'ley', [338, 382, 403, 352, 391, 412], z),
  ]
  return buildLectura(buildModel(E, YEARS)!)
}
const keys = (cs: Claim[]) => cs.map((c) => c.key)
const ALL: ClaimKey[] = ['firmado', 'gastado', 'seis', 'tsa', 'fideicomisos', 'sedena', 'ciit', 'imss', 'mediana', 'marina', 'ley', 'visibles']

describe('«Gasto a ciegas» — La lectura, each claim true and false', () => {
  it('all twelve hold in the base world', () => expect(keys(world())).toEqual(ALL))
  const cases: [ClaimKey[], Parameters<typeof world>[0]][] = [
    [['firmado'], { signedLater: true }],                 // 2020–21 contracts below the spend → not «signed first»
    [['firmado', 'gastado', 'seis'], { midVisible: true }], // 2022–24 visible → not dark, not «signed first», six years over 100%
    [['gastado', 'seis'], { preCovers: true }],             // 2020–21 balance could cover all 2022–24 spend → nothing left «sin contrato»
    [['tsa'], { tsaVisible: true }],
    [['fideicomisos', 'ciit'], { fewTrusts: true }],      // only two entities with trusts in 2024
    [['sedena'], { sedenaBuys: true }],
    [['ciit'], { ciitBuilds: true }],                     // trusts < 90% of its budget
    [['imss'], { imssTrust: true }],
    [['mediana'], { fewCiv: true }],
    [['marina'], { semarVisible: true }],
    [['ley'], { leySigns: true }],
    [['visibles'], { noneOver: true }],
  ]
  it.each(cases)('drops %j when its condition fails', (gone, flags) => {
    const got = keys(world(flags))
    for (const k of gone) expect(got).not.toContain(k)
    for (const k of ALL.filter((a) => !gone.includes(a))) expect(got).toContain(k)
  })
  it('«gastado» names the 2020–21 ceiling only when there is a balance to carry', () => {
    const txt = (cs: Claim[], l: 'es' | 'en') => cs.find((c) => c.key === 'gastado')![l].map((t) => (typeof t === 'string' ? t : 'b' in t ? t.b : t.label)).join('')
    expect(txt(world(), 'es')).toMatch(/hasta 2021 .* no pasaría de .* quedan sin contrato/)
    expect(txt(world(), 'en')).toMatch(/through 2021 .* would not pass .* is left with no contract/)
    expect(txt(world({ signedLater: true }), 'es')).not.toContain('hasta 2021')  // no carry-in → floor only
    expect(txt(world({ signedLater: true }), 'es')).toContain('quedan sin contrato')
  })
  it('the «all dark» tail of «visibles» follows the dark years', () => {
    const tail = (cs: Claim[]) => cs.find((c) => c.key === 'visibles')!.es.join('')
    expect(tail(world())).toContain('lo oscuro es el tren')
    expect(world({ midVisible: true }).find((c) => c.key === 'visibles')!.es.some((t) => typeof t === 'string' && t.includes('oscuro'))).toBe(false)
  })
})

describe('fact-check: the published figures, recomputed from the payload (CP 2020–2025 × register 2026-10-29, prod)', () => {
  const m = buildModel((page as { entities: NsvEntity[] }).entities, page.meta.cp_years)!
  const byKey = Object.fromEntries(buildLectura(m).map((c) => [c.key, c]))
  const B = (v: number) => Math.round(v / 1e6)
  it('Tren Maya: ×3.2 in 2020–21, 4.8% in 2022–24 (20,508 of 428,980 MDP), 30% over six years', () => {
    expect(m.pre.ratio.toFixed(1)).toBe('3.2')
    expect([B(m.mid.vis), B(m.mid.ex)]).toEqual([20508, 428980])
    expect(pct(m.mid.share)).toBe('4.8%')
    expect(Math.round(100 * m.mid.share)).toBe(5)                      // 5 coins filled: signed in 2022–24
  })
  it('Tren Maya 2022–24 range (fact-check 2026-10-29): carry 88,835 MDP (2020–21 balance 88,055 + 2019 signatures 780), ceiling 25.5%, > 319 bn with no contract', () => {
    expect(B(m.pre.vis - m.pre.ex)).toBe(88055)
    expect(B(m.mid.carry)).toBe(88835)
    expect(B(m.proj.visBefore)).toBe(780)
    expect(m.mid.ub.toFixed(3)).toBe('0.255')
    expect(pct(m.mid.ub)).toBe('25%')
    expect(Math.round(100 * m.mid.ub) - Math.round(100 * m.mid.share)).toBe(20)  // 20 hatched coins
    expect(B(m.mid.dark)).toBe(319638)
    expect(Math.floor(m.mid.dark / 1e9)).toBe(319)                    // h1 «más de 319 mil millones»
    expect(m.mid.ex - m.mid.vis - m.mid.carry).toBeCloseTo(m.mid.dark, 0)
    expect([B(m.proj.visSum), B(m.proj.exSum), pct(m.proj.share!)]).toEqual([148983, 496667, '30%'])
    expect([m.peak.y, B(m.peak.ex), B(m.peak.vis)]).toEqual([2022, 179464, 9437])
  })
  it('Tren Maya S.A. 2024: 259 of 17,809 MDP = 1.5%; 11,611 to a trust', () => {
    const t = m.by.get('tren-maya-sa')!, k = m.years.indexOf(2024)
    expect([B(t.vis[k]), B(t.ex[k]), t.n[k], B(t.tr[k]), pct(t.vis[k] / t.ex[k])]).toEqual([259, 17809, 32, 11611, '1.5%'])
  })
  it('trusts: 115,552 MDP in 2024 (SEDENA 73,196 · CIIT 30,744 · Tren Maya S.A. 11,611) + SEMAR 1,702; SEDENA 202,633 > 173,530', () => {
    expect(m.trusts24.map((t) => [t.key, B(t.v)])).toEqual([['sedena', 73196], ['ciit', 30744], ['tren-maya-sa', 11611], ['semar', 1702]])
    expect(B(m.trusts24Top3)).toBe(115552)
    const s = m.by.get('sedena')!
    expect([B(s.trSum), B(s.exSum)]).toEqual([202633, 173530])
    expect(byKey.ciit.fig.es).toBe('99%')
  })
  it('SEMAR 20%, SEDENA 59%, civilian median 66%, Pemex + CFE 4.28 billones with 0 contracts', () => {
    expect(pct(m.by.get('semar')!.share!)).toBe('20%')
    expect(pct(m.by.get('sedena')!.share!)).toBe('59%')
    expect(pct(m.civMedian)).toBe('66%')
    expect(byKey.ley.fig).toEqual({ es: '4.28 billones MXN', en: '4.28T MXN' })
    expect(byKey.fideicomisos.fig).toEqual({ es: '115,552 MDP', en: '115.6B MXN' })
    // EN never prints MDP / billones, ES never «B MXN»; SEMAR (the rest) is clickable like the other three
    for (const c of buildLectura(m)) { expect(c.fig.en + c.src.en).not.toMatch(/MDP|billones|instituciones|mediana/); expect(c.fig.es).not.toMatch(/B MXN/) }
    expect(byKey.fideicomisos.en.some((t) => typeof t === 'object' && 'ente' in t && t.ente === 'semar')).toBe(true)
    expect(byKey.visibles.es.filter((t) => typeof t === 'object' && 'ente' in t).map((t) => (t as { ente: string }).ente)).toEqual(['aifa', 'dos-bocas'])
  })
  it('every claim holds on the real data', () => expect(keys(buildLectura(m))).toEqual(ALL))
  it('2026 (fact-check 2026-10-29): contracts on the axis, no exercised year, no share touched', () => {
    expect(m.years).toEqual([2020, 2021, 2022, 2023, 2024, 2025])     // spending window = CP years only
    expect(m.axis).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]) // the ribbon runs to 2026
    const k = m.axis.indexOf(2026)
    expect([B(m.proj.visAx[k]), m.proj.nAx[k]]).toEqual([881, 33])     // «sigue en ComprasMX» fact
    expect(m.proj.visAx.slice(0, 6)).toEqual(m.proj.vis)
    // a 2026 contract can enter no share: the six-year sums stop at 2025
    const tsa = m.by.get('tren-maya-sa')!
    expect(B(tsa.visSum)).toBe(259 + 1226)
    expect(B(tsa.visAx[k])).toBeGreaterThan(0)
  })
  it('the axis follows the payload: no register year past the CP window → axis = years', () => {
    const cut = (page as { entities: NsvEntity[] }).entities.map((e) => ({ ...e, years: e.years.filter((y) => y.year <= 2025) }))
    expect(buildModel(cut, page.meta.cp_years)!.axis).toEqual(page.meta.cp_years)
  })
})
