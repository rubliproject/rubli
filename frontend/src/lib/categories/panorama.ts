/**
 * Category / subcategory profile B2 (docs/PROFILE_CONTENT_CATEGORY_2026-11-05.md § 1–5 + § «Subcategory profile»).
 * GET /categories/:id/panorama?since&until&sub=<code> (backend api/services/category_panorama.py) + the computed
 * «Qué significa» lines. Each finding is plain words, ≤ 15 words per sentence (Mariana), finding first.
 */
import { api } from '@/api/client'
import { HOY_FROM } from '@/lib/institution/panorama'
import { ADMINISTRATIONS, type AdministrationKey } from '@/lib/administrations'
import { SECTORS } from '@/lib/constants'

export type Lang = 'es' | 'en'
export type Vista = 'hoy' | 'historia'
export { HOY_FROM }

interface Agg { amount_mxn: number; contracts: number; share_pct: number | null; da_pct: number | null; avg_risk: number | null; hr_pct: number | null }
export interface CatSub extends Agg { code: string | null; name_es: string | null; name_en: string | null; is_catch_all: boolean }
export interface CatYear extends Agg { year: number }
export interface CatGob extends Agg { key: AdministrationKey; from: number; to: number }
export interface CatSupplier extends Agg { vendor_id: number; vendor_name: string | null; persona_fisica?: boolean }
export interface CatBuyer extends Agg { institution_id: number; name: string | null; siglas: string | null }
export interface CatPair extends Agg { vendor_id: number; vendor_name: string | null; persona_fisica?: boolean; institution_id: number; institution_name: string | null; siglas: string | null; of_buyer_pct: number | null }
export interface CatContract {
  id: number; title: string | null; vendor_id: number | null; vendor_name: string | null; persona_fisica?: boolean
  institution_id: number | null; institution_name: string | null; amount_mxn: number; contract_date: string | null
  contract_year: number | null; is_direct_award: boolean | null; risk_score: number | null; source_structure: string | null
  /** 'suspect_decimal' | 'review' (> 10B): listed, marked, kept out of totals and leaders (backend category_panorama) */
  amount_flag?: string | null
}
export interface CatPanorama extends Agg {
  category_id: number
  sub: { subcategory_id: number; code: string; name_es: string; name_en: string; is_catch_all: boolean } | null
  since: string | null; until: string | null
  levels: Record<'critical' | 'high' | 'medium' | 'low' | 'none', number>
  crit_pct: number | null; crit_value_pct: number | null; dec_pct: number | null
  vendors_n: number; buyers_n: number; first_year: number | null; last_year: number | null
  years: CatYear[]; gobs: CatGob[]; subs: CatSub[]; suppliers: CatSupplier[]; buyers: CatBuyer[]; pairs: CatPair[]; top_contracts: CatContract[]
}

/** The /categories filters (La bodega: ?sx=<sexenio>&sector=<id>) carried into a category / subcategory page, so the
 *  box and the profile print the same numbers (AUDIT_JOURNALIST 11-07 P0). Same cut as precomputed category_cube:
 *  buyer sector, sexenio by contract year. */
export interface CatFilter { sx: AdministrationKey | null; sector: number | null }
export function catFilterOf(sp: URLSearchParams): CatFilter {
  const x = sp.get('sx')
  const sec = Number(sp.get('sector'))
  return {
    sx: ADMINISTRATIONS.some((a) => a.key === x) ? (x as AdministrationKey) : null,
    sector: SECTORS.some((s) => s.id === sec) ? sec : null,
  }
}
/** `sx=…&sector=…` (no «?»), '' when no filter */
export function catFilterSearch(f: CatFilter): string {
  const p = new URLSearchParams()
  if (f.sx) p.set('sx', f.sx)
  if (f.sector != null) p.set('sector', String(f.sector))
  return p.toString()
}
export const withSearch = (href: string, search: string) => (search ? `${href}${href.includes('?') ? '&' : '?'}${search}` : href)
/** The sexenio's contract years (2002 = the data floor) */
export function sxYears(sx: AdministrationKey): [number, number] {
  const a = ADMINISTRATIONS.find((x) => x.key === sx)!
  return [Math.max(2002, a.yearStart), a.yearEnd]
}

export const catPanoramaApi = {
  async get(id: number, q: { since?: string; sub?: string | null; filter?: CatFilter }): Promise<CatPanorama> {
    const p = new URLSearchParams()
    if (q.since) p.set('since', q.since)
    if (q.sub) p.set('sub', q.sub)
    if (q.filter?.sector != null) p.set('sector', String(q.filter.sector))
    if (q.filter?.sx) { const [a, b] = sxYears(q.filter.sx); p.set('year_from', String(a)); p.set('year_to', String(b)) }
    const { data } = await api.get<CatPanorama>(`/categories/${id}/panorama?${p}`)
    return data
  },
}

export const subHref = (categoryId: number, code: string) => `/categories/${categoryId}/sub/${encodeURIComponent(code)}`
const r0 = (v: number | null | undefined) => Math.round(v ?? 0)
const nm = (x: { name_es: string | null; name_en: string | null }, lang: Lang) => (lang === 'en' ? x.name_en || x.name_es : x.name_es) ?? '—'

/** Block 2: the catch-all's money share when it is the biggest box, else the riskiest named subcategory (≥ 50 contracts). */
export function findingSubs(p: Pick<CatPanorama, 'amount_mxn' | 'subs'>, lang: Lang): string {
  const en = lang === 'en'
  const named = p.subs.filter((s) => !s.is_catch_all && s.code)
  const blind = p.subs.filter((s) => s.is_catch_all).reduce((a, s) => a + s.amount_mxn, 0)
  const tenths = p.amount_mxn > 0 ? Math.round((10 * blind) / p.amount_mxn) : 0
  const risky = named.filter((s) => s.contracts >= 50 && s.hr_pct != null).sort((a, b) => (b.hr_pct ?? 0) - (a.hr_pct ?? 0))[0]
  const out: string[] = []
  if (tenths >= 3) out.push(en ? `${tenths} of every 10 pesos do not say what was bought.` : `${tenths} de cada 10 pesos no dicen qué se compró.`)
  if (risky) out.push(en ? `Most risk: ${nm(risky, lang)}, ${r0(risky.hr_pct)} of 100 contracts high or critical.` : `Más riesgo: ${nm(risky, lang)}, ${r0(risky.hr_pct)} de 100 contratos alto o crítico.`)
  if (!out.length && named[0]) out.push(en ? `The biggest box: ${nm(named[0], lang)}.` : `La caja más grande: ${nm(named[0], lang)}.`)
  return out.join(' ') || (en ? 'No mini-category with money in this period.' : 'Ninguna minicategoría con dinero en este periodo.')
}

/** Block 3: the largest supplier's share, then the strongest pair (its share of that buyer's money here) when ≥ 50. */
export type Seg = string | { kind: 'vendor' | 'institution'; id: number; name: string; pf?: boolean }
export function findingWho(p: Pick<CatPanorama, 'suppliers' | 'pairs'>, lang: Lang): Seg[] {
  const en = lang === 'en'
  const top = p.suppliers[0]
  if (!top) return [en ? 'No suppliers in this period.' : 'Sin proveedores en este periodo.']
  const out: Seg[] = [{ kind: 'vendor', id: top.vendor_id, name: top.vendor_name ?? '—', pf: top.persona_fisica },
    en ? ` sells the most: ${r0(top.share_pct)} of every 100 pesos.` : ` es quien más vende: ${r0(top.share_pct)} de cada 100 pesos.`]
  const pair = p.pairs.find((x) => (x.of_buyer_pct ?? 0) >= 50 && x.contracts >= 5)
  if (pair) out.push(' ', { kind: 'institution', id: pair.institution_id, name: pair.siglas || pair.institution_name || '—' },
    en ? ` buys ${r0(pair.of_buyer_pct)} of its 100 pesos here from one firm.` : ` compra aquí ${r0(pair.of_buyer_pct)} de sus 100 pesos a una sola empresa.`)
  return out
}

/** Ficha: money share AND count share of critical contracts (big contracts score higher — say both). */
export function critLine(p: Pick<CatPanorama, 'crit_value_pct' | 'crit_pct'>, lang: Lang): string | null {
  if (p.crit_value_pct == null || p.crit_pct == null) return null
  const v = r0(p.crit_value_pct), n = p.crit_pct < 1 && p.crit_pct > 0 ? '<1' : String(r0(p.crit_pct))
  return lang === 'en'
    ? `${v} of every 100 pesos go to contracts with a critical risk indicator. By count, ${n} of every 100.`
    : `${v} de cada 100 pesos van a contratos con indicador de riesgo crítico. Por número, ${n} de cada 100.`
}

/** Subcategory S2: its high-or-critical share next to its category's, said only when it differs by ≥ 5 points. */
export function subVsCat(sub: Pick<CatPanorama, 'hr_pct'>, cat: Pick<CatPanorama, 'hr_pct'> | undefined, lang: Lang): string | null {
  if (sub.hr_pct == null || cat?.hr_pct == null) return null
  const s = r0(sub.hr_pct), c = r0(cat.hr_pct)
  if (Math.abs(s - c) < 5) return lang === 'en' ? `Like its category: ${s} of 100 contracts high or critical.` : `Como su categoría: ${s} de 100 contratos alto o crítico.`
  const word = s >= 2 * c && c > 0 ? (lang === 'en' ? 'More than double' : 'Más del doble que') : s > c ? (lang === 'en' ? 'More than' : 'Más que') : (lang === 'en' ? 'Less than' : 'Menos que')
  return lang === 'en' ? `${s} of 100 contracts high or critical. ${word} its category (${c}).` : `${s} de 100 contratos alto o crítico. ${word} su categoría (${c}).`
}

/** Block 5: the largest contract's share of all the money, and how many of the list had no tender. */
export function findingBig(p: Pick<CatPanorama, 'amount_mxn' | 'top_contracts'>, lang: Lang): string {
  const ks = p.top_contracts
  const big = ks.find((k) => !k.amount_flag) // a flagged amount is not in the total: never «the largest alone is…»
  if (!ks.length) return lang === 'en' ? 'No contracts in this period.' : 'Sin contratos en este periodo.'
  const share = big && p.amount_mxn > 0 ? (100 * big.amount_mxn) / p.amount_mxn : 0
  const direct = ks.filter((k) => k.is_direct_award).length
  // audit 11-07 (A5): the list is ranked by amount, so when row 1 is a flagged amount the sentence must say so, not skip it
  const flaggedFirst = !!ks[0]?.amount_flag
  const pct = `${Math.round(share)} %`
  const s1 = share < 1 ? '' : flaggedFirst
    ? (lang === 'en' ? `The first one is flagged for review; the largest confirmed is ${pct} of the total.` : `El primero está marcado para revisión; el mayor confirmado es ${pct} del total.`)
    : (lang === 'en' ? `The largest alone is ${pct} of the total.` : `El mayor solo es ${pct} del total.`)
  const s2 = lang === 'en' ? `${direct} of these ${ks.length} had no tender.` : `${direct} de estos ${ks.length} fueron sin concurso.`
  return [s1, s2].filter(Boolean).join(' ')
}

