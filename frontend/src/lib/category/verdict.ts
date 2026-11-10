/**
 * Category verdict engine — the cover «El caudal» (concept
 * `_ui_v4/concepts/catcover/_catcover.js § VERDICT ENGINE`). Replaces the HHI
 * buckets of lib/entity/verdict.ts for categories only; every number names its
 * measure (por dinero / por contratos).
 *
 *   concentration  top-3 share of the MONEY: ≥ 50% «Mercado de tres» · 30–50% «Ganadores recurrentes» · < 30% «Muchos ganadores»
 *   procedure      direct award ≥ 50% of the MONEY → «el dinero se adjudica sin concurso»;
 *                  else ≥ 70% of the CONTRACTS → «el dinero se licita, los contratos no»; else «el dinero se licita»
 *   trend          direct award by money, 2019–2025 vs 2007–2018 (years with procedure data only), ± 8 points
 *   risk           a figure with its rank, never a class; «indicador», never probability
 */
import type { CategoryCoverData } from '@/api/categoryCover'

export type Conc = 'tres' | 'pocos' | 'muchos'
export type Proc = 'directa' | 'chica' | 'licita'
export type Trend = 'up' | 'down' | 'flat'

export interface CategoryVerdict {
  conc: Conc
  proc: Proc
  trend: Trend
  /** shares 0–1 */
  daMoney: number
  daCount: number
  top3: number
  /** competitive procedures that ended with one awarded supplier (not one bidder) */
  singleAward: number
  highRisk: number
  p0: number
  p1: number
  postDaMoney: number
  kicker: string
}

const sh = (a: number, b: number) => (b ? a / b : 0)

/** Direct award by money over the years in [a, b] that carry a procedure flag. */
export function periodDirect(years: CategoryCoverData['years'], a: number, b: number): number {
  const ys = years.filter((y) => y.y >= a && y.y <= b && y.da_v != null)
  return sh(ys.reduce((s, y) => s + (y.da_v ?? 0), 0), ys.reduce((s, y) => s + y.v, 0))
}

export function categoryVerdict(d: CategoryCoverData, en: boolean): CategoryVerdict {
  const T = d.totals
  const daMoney = sh(T.da_v, T.v)
  const daCount = sh(T.da_n, T.n)
  const top3 = sh(d.suppliers.slice(0, 3).reduce((s, v) => s + v.v, 0), T.v)
  const p0 = periodDirect(d.years, 2007, 2018)
  const p1 = periodDirect(d.years, 2019, 2025)
  const delta = p1 - p0
  const conc: Conc = top3 >= 0.5 ? 'tres' : top3 >= 0.3 ? 'pocos' : 'muchos'
  const proc: Proc = daMoney >= 0.5 ? 'directa' : daCount >= 0.7 ? 'chica' : 'licita'
  const trend: Trend = delta >= 0.08 ? 'up' : delta <= -0.08 ? 'down' : 'flat'
  const L = (es: string, e: string) => (en ? e : es)
  const concW = { tres: L('Mercado de tres', 'A three-name market'), pocos: L('Ganadores recurrentes', 'Recurring winners'), muchos: L('Muchos ganadores', 'Many winners') }[conc]
  const procW = {
    directa: L('el dinero se adjudica sin concurso', 'the money is awarded without a tender'),
    chica: L('el dinero se licita, los contratos no', 'the money is tendered, the contracts are not'),
    licita: L('el dinero se licita', 'the money is tendered'),
  }[proc]
  const trendW = { up: L('la directa va a más', 'direct award is rising'), down: L('la directa va a menos', 'direct award is falling'), flat: '' }[trend]
  return {
    conc, proc, trend, daMoney, daCount, top3, p0, p1,
    singleAward: sh(T.sb_n, T.comp_n),
    highRisk: sh(T.hr_n, T.n),
    postDaMoney: sh(d.post.da_v, d.post.v),
    kicker: [concW, procW, trendW && `${trendW}, ${p100(p0)} → ${p100(p1)}`].filter(Boolean).join(' · '),
  }
}

/** «de cada 100»: round, but never print 0 for a real share. */
export const p100 = (x: number): string => (x > 0 && x < 0.005 ? '<1' : String(Math.round(100 * x)))
