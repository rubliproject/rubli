/**
 * «Gasto a ciegas» — the page model, derived once from GET /no-se-ve (lib/noSeVe/lectura.ts reads it).
 * Every figure on the page is computed here from the payload; nothing is typed.
 * Exercised = Cuenta Pública MONTO_EJERCIDO, capítulos 2000·3000·5000·6000 (purchases + works).
 * Visible = contracts in the register (0 < amount ≤ 100,000 MDP) of the entity's institutions — or, for the
 * project, every contract whose title or description names it.
 */
import type { NsvEntity, NsvGroup, NsvYear } from '@/api/noSeVe'

export interface Ent {
  key: string
  grp: NsvGroup
  label: { es: string; en: string }
  short: string
  cp: string
  ids: number[]
  raw: NsvEntity
  /** by CP year (YEARS order); 0 where the UR did not exist */
  ex: number[]
  vis: number[]
  n: number[]
  da: number[]
  tr: number[]
  cap1: number[]
  cap4: number[]
  cap6: number[]
  tot: number[]
  /** the years the UR existed (exercised > 0) */
  live: boolean[]
  exSum: number
  visSum: number
  trSum: number
  /** visSum ÷ exSum over the six years (null when nothing was exercised) */
  share: number | null
  /** register-only years around the CP window (2019, 2026 ComprasMX) */
  visBefore: number
  visAfter: number
  /** contracts on the ribbon axis (Model.axis: the CP years + the register years after them, 2026 ComprasMX).
   *  Never divided by anything: a year past the CP window has no exercised figure yet. */
  visAx: number[]
  nAx: number[]
}

export interface Model {
  /** Cuenta Pública years: every share, sum and claim is computed on these only */
  years: number[]
  /** the ribbon / drawer axis: `years` + the register-only years after them (2026: contracts yes, exercised not yet
   *  published — Cuenta Pública 2026 comes out in 2027) */
  axis: number[]
  ents: Ent[]
  by: Map<string, Ent>
  proj: Ent
  /** the project's spend by UR (W3N fondo · W3X · H0M · otros), per year */
  projByUr: { ur: string; vals: number[] }[]
  /** 2020–21: contracts signed vs exercised */
  pre: { ex: number; vis: number; ratio: number }
  /** 2022–24: exercised vs contracts signed in those years (`share`, the floor of what is visible). A multi-year
   *  contract is booked when signed, so earlier signatures may also pay for 2022–24 work: `carry` = what was left of
   *  them at end-2021 — 2020–21 signed − exercised (≥ 0), plus every pre-window signature (2019, no CP year to net
   *  against), as if none of it had been spent — `ub` = (vis + carry) ÷ ex capped at 1 (the ceiling),
   *  `dark` = ex − vis − carry: spending no register contract can cover under any assumption (fact-check 2026-10-29). */
  mid: { ex: number; vis: number; share: number; carry: number; ub: number; dark: number }
  peak: { y: number; ex: number; vis: number }
  civMedian: number
  /** 2024 trust contributions (partida 46101) of every national-security entity that made one, largest first */
  trusts24: { key: string; v: number }[]
  /** the three largest of them (the ones the flows draw) */
  trusts24Top3: number
  /** the rest of the national-security contributions that year */
  trusts24Rest: number
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
export const idx = (m: Model, y: number) => m.years.indexOf(y)

function ent(e: NsvEntity, years: number[], axis: number[]): Ent {
  const at = new Map<number, NsvYear>(e.years.map((y) => [y.year, y]))
  const colOn = (ys: number[], f: (y: NsvYear) => number | null) => ys.map((y) => { const r = at.get(y); return r ? f(r) ?? 0 : 0 })
  const col = (f: (y: NsvYear) => number | null) => colOn(years, f)
  const ex = col((r) => r.exercised_cap2356), vis = col((r) => r.contracts_visible_mxn)
  const exSum = sum(ex), visSum = sum(vis)
  const y0 = years[0], y1 = years[years.length - 1]
  return {
    key: e.entity_key, grp: e.grp, label: { es: e.label_es, en: e.label_en }, short: e.short, cp: e.cp_code, ids: e.institution_ids, raw: e,
    ex, vis, n: col((r) => r.contracts_n), da: col((r) => r.contracts_da_mxn), tr: col((r) => r.trusts_46101),
    cap1: col((r) => r.exercised_cap1), cap4: col((r) => r.exercised_cap4), cap6: col((r) => r.exercised_cap6), tot: col((r) => r.exercised_total),
    live: ex.map((v) => v > 0),
    exSum, visSum, trSum: sum(col((r) => r.trusts_46101)), share: exSum > 0 ? visSum / exSum : null,
    visBefore: sum(e.years.filter((r) => r.year < y0).map((r) => r.contracts_visible_mxn)),
    visAfter: sum(e.years.filter((r) => r.year > y1).map((r) => r.contracts_visible_mxn)),
    visAx: colOn(axis, (r) => r.contracts_visible_mxn), nAx: colOn(axis, (r) => r.contracts_n),
  }
}

/** The project's bands, from the ramo/UR rows of its cartera: the FONATUR fund, FONATUR Tren Maya, Tren Maya S.A.; the rest pooled. */
export const PROJ_URS = ['W3N', 'W3X', 'H0M'] as const

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

export function buildModel(entities: NsvEntity[], years: number[]): Model | null {
  const y1 = years[years.length - 1]
  const axis = [...years, ...[...new Set(entities.flatMap((e) => e.years.map((r) => r.year)))].filter((y) => y > y1).sort((a, b) => a - b)]
  const ents = entities.map((e) => ent(e, years, axis))
  const by = new Map(ents.map((e) => [e.key, e]))
  const proj = ents.find((e) => e.grp === 'proj')
  if (!proj || years.length < 5) return null
  const pick = (e: Ent, ys: number[], f: 'ex' | 'vis') => sum(ys.map((y) => e[f][years.indexOf(y)] ?? 0))
  const preY = years.filter((y) => y <= 2021), midY = years.filter((y) => y >= 2022 && y <= 2024)
  const pre = { ex: pick(proj, preY, 'ex'), vis: pick(proj, preY, 'vis'), ratio: 0 }
  pre.ratio = pre.ex > 0 ? pre.vis / pre.ex : 0
  const mid = { ex: pick(proj, midY, 'ex'), vis: pick(proj, midY, 'vis'), share: 0, carry: Math.max(0, pre.vis - pre.ex) + proj.visBefore, ub: 0, dark: 0 }
  mid.share = mid.ex > 0 ? mid.vis / mid.ex : 0
  mid.ub = mid.ex > 0 ? Math.min(1, (mid.vis + mid.carry) / mid.ex) : 0
  mid.dark = Math.max(0, mid.ex - mid.vis - mid.carry)
  const pk = proj.ex.reduce((b, v, k) => (v > proj.ex[b] ? k : b), 0)
  const rows = proj.raw.by_ur ?? []
  const projByUr = [...PROJ_URS, 'otros'].map((ur) => ({
    ur, vals: years.map((y) => sum(rows.filter((r) => r.year === y && (ur === 'otros' ? !(PROJ_URS as readonly string[]).includes(r.ur) : r.ur === ur)).map((r) => r.exercised_cap2356))),
  }))
  const civ = ents.filter((e) => e.grp === 'civ' && e.share != null).map((e) => e.share as number)
  const k24 = years.indexOf(2024)
  const trusts24 = k24 < 0 ? [] : ents.filter((e) => e.grp === 'ns' && e.tr[k24] > 0).map((e) => ({ key: e.key, v: e.tr[k24] })).sort((a, b) => b.v - a.v)
  return {
    years, axis, ents, by, proj, projByUr, pre, mid,
    peak: { y: years[pk], ex: proj.ex[pk], vis: proj.vis[pk] },
    civMedian: civ.length ? median(civ) : 0,
    trusts24, trusts24Top3: sum(trusts24.slice(0, 3).map((t) => t.v)), trusts24Rest: sum(trusts24.slice(3).map((t) => t.v)),
  }
}
