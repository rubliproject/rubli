/**
 * Vendor profile B2 (docs/PROFILE_CONTENT_VENDOR_2026-11-05.md v2, «reuse + compact»; parts of /institutions/:id B2).
 * The data (GET /vendors/{id}/panorama) and every computed sentence of the page (each ≤ 15 words, finding first —
 * Mariana's rule). Pure: panorama.test.ts holds a true and a false case per sentence.
 */
import { api } from '@/api/client'
import type { VendorInstitutionsTimelineResponse } from '@/api/types'
import type { AdministrationKey } from '@/lib/administrations'
import { GOB_DATES, GOB_NAME, HOY_FROM, type Lang, type Vista } from '@/lib/institution/panorama'

export type Level = 'critical' | 'high' | 'medium' | 'low'
export const LEVELS: Level[] = ['critical', 'high', 'medium', 'low']

interface Agg { amount_mxn: number; contracts: number; share_pct: number | null; da_pct: number | null; avg_risk: number | null }
export interface VBuyer extends Agg {
  institution_id: number
  name: string | null
  siglas: string | null
  first_year: number | null
  last_year: number | null
  years: [number, number][]
  gobs: Partial<Record<AdministrationKey, number>>
}
export interface VSub extends Agg { subcategory_id: number; code?: string | null; name_es: string | null; name_en: string | null }
export interface VCategory extends Agg { category_id: number; name_es: string | null; name_en: string | null; subs: VSub[] }
export interface VPanorama extends Agg {
  vendor_id: number
  since: string | null
  until: string | null
  first_year: number | null
  last_year: number | null
  levels: Record<Level | 'none', number>
  buyers_n: number
  buyers: VBuyer[]
  categories: VCategory[]
}

export const vendorPanoramaApi = {
  async get(id: number, q: { since?: string; until?: string }): Promise<VPanorama> {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v)
    const { data } = await api.get<VPanorama>(`/vendors/${id}/panorama?${p}`)
    return data
  },
}

/** The API cut: Hoy = this government; Historia = all, or one government's dates. */
export function cutOf(vista: Vista, gob: AdministrationKey | null): { since?: string; until?: string } {
  if (vista === 'hoy') return { since: HOY_FROM }
  if (gob) return { since: GOB_DATES[gob][0], until: GOB_DATES[gob][1] }
  return {}
}

const pct = (x: number | null | undefined) => Math.round(x ?? 0)
const n = (x: number, lang: Lang) => x.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX')

/** § 1 the ficha's finding (h1): money, contracts, since when; then «N de cada 100, sin concurso». `money` is pre-formatted. */
export function fichaFinding(p: Pick<VPanorama, 'contracts' | 'da_pct' | 'first_year'>, money: string, vista: Vista, lang: Lang): string {
  const en = lang === 'en'
  if (!p.contracts) return vista === 'hoy' ? (en ? 'No contracts under this government yet.' : 'Sin contratos con este gobierno todavía.') : (en ? 'No contracts on record.' : 'Sin contratos registrados.')
  const head = vista === 'hoy'
    ? (en ? `Under this government it was paid ${money} in ${n(p.contracts, lang)} contracts.` : `Con este gobierno cobró ${money} en ${n(p.contracts, lang)} contratos.`)
    : (en ? `Since ${p.first_year}, it was paid ${money} in ${n(p.contracts, lang)} contracts.` : `Desde ${p.first_year}, cobró ${money} en ${n(p.contracts, lang)} contratos.`)
  if (p.da_pct == null) return head
  return `${head} ${en ? `${pct(p.da_pct)} of every 100 had no tender.` : `${pct(p.da_pct)} de cada 100, sin concurso.`}`
}

/** «la mitad» when the share is within 48–52 of 100; otherwise «N de cada 100 pesos». */
export function shareWords(share: number, lang: Lang): string {
  const en = lang === 'en'
  if (share >= 48 && share <= 52) return en ? 'half of its money' : 'la mitad de su dinero'
  return en ? `${pct(share)} of every 100 pesos` : `${pct(share)} de cada 100 pesos`
}

/** § 2 «Qué significa»: the largest buyer and its share. The page renders the buyer as a chip before the text. */
export function buyerMeans(buyers: VBuyer[], lang: Lang): { buyer: VBuyer | null; text: string } {
  const en = lang === 'en'
  const b = buyers[0]
  if (!b) return { buyer: null, text: en ? 'No buyer in this period.' : 'Ningún comprador en este periodo.' }
  if (buyers.length === 1) return { buyer: b, text: en ? ' is its only buyer here.' : ' es su único comprador aquí.' }
  return { buyer: b, text: en ? ` gave it ${shareWords(b.share_pct ?? 0, lang)}.` : ` le dio ${shareWords(b.share_pct ?? 0, lang)}.` }
}

export type Orden = 'dinero' | 'gobierno'
/** Newest government first: «por gobierno» reads which government gave each buyer's money. */
const GOB_RECENT: AdministrationKey[] = ['sheinbaum', 'amlo', 'epn', 'calderon', 'fox']
/** The government in which this buyer paid it the most. */
export function peakGob(b: Pick<VBuyer, 'gobs'>): AdministrationKey | null {
  let best: AdministrationKey | null = null
  for (const g of GOB_RECENT) if ((b.gobs[g] ?? 0) > (best ? b.gobs[best] ?? 0 : 0)) best = g
  return best
}
export function sortBuyers(rows: VBuyer[], orden: Orden): VBuyer[] {
  if (orden === 'dinero') return [...rows].sort((a, b) => b.amount_mxn - a.amount_mxn)
  const rank = (b: VBuyer) => { const g = peakGob(b); return g ? GOB_RECENT.indexOf(g) : 99 }
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.amount_mxn - a.amount_mxn)
}
/** «2024–2025», or one year when both ends match («2025», never «2025–2025»). */
export const yearSpan = (a: number, b?: number | null) => (b == null || b === a ? `${a}` : `${a}–${b}`)
export const gobWords = (g: AdministrationKey | null, lang: Lang) => (g ? (lang === 'en' ? `most under ${GOB_NAME[g]}` : `más con ${GOB_NAME[g]}`) : '')

/** The expediente's lanes, compacted: reorder the buyers (por dinero / por gobierno, via the panorama's per-government
 *  money) and keep `lanes` of them as lanes; the rest fold into «otros» in the ribbon (buildExpediente reads is_top). */
export function compactTimeline(raw: VendorInstitutionsTimelineResponse, orden: Orden, lanes: number, buyers: VBuyer[]): VendorInstitutionsTimelineResponse {
  const tops = raw.institutions.filter((i) => i.is_top)
  let order = tops
  if (orden === 'gobierno') {
    const by = new Map(buyers.map((b) => [b.institution_id, b]))
    const sorted = sortBuyers(tops.map((t) => by.get(t.institution_id) ?? ({ institution_id: t.institution_id, amount_mxn: t.amount_mxn, gobs: {} } as VBuyer)), 'gobierno')
    order = sorted.map((b) => tops.find((t) => t.institution_id === b.institution_id)!)
  }
  const keep = new Set(order.slice(0, lanes).map((i) => i.institution_id))
  const rest = raw.institutions.filter((i) => !i.is_top)
  return { ...raw, institutions: [...order, ...rest].map((i) => ({ ...i, is_top: keep.has(i.institution_id) })) }
}

/** § 3 «Qué significa»: «76 de cada 100 pesos fueron medicamentos y farmacéuticos.» */
export function catMeans(cats: VCategory[], lang: Lang): string {
  const en = lang === 'en'
  const c = cats[0]
  if (!c) return en ? 'No category on record.' : 'Sin categoría registrada.'
  const name = ((en ? c.name_en : c.name_es) ?? `#${c.category_id}`).toLowerCase()
  return en ? `${pct(c.share_pct)} of every 100 pesos were ${name}.` : `${pct(c.share_pct)} de cada 100 pesos fueron ${name}.`
}

/** § 4 «Qué significa»: the share of its contracts at the highest level that has any. */
export function riskMeans(levels: VPanorama['levels'], lang: Lang): string {
  const en = lang === 'en'
  const scored = LEVELS.reduce((s, l) => s + (levels[l] ?? 0), 0)
  if (!scored) return en ? 'None of these contracts has a risk indicator.' : 'Ninguno de estos contratos tiene indicador de riesgo.'
  const word = { critical: ['crítico', 'critical'], high: ['alto', 'high'] } as const
  for (const l of ['critical', 'high'] as const) {
    const k = levels[l] ?? 0
    if (k) {
      const raw = (100 * k) / scored
      return en ? `${raw < 1 ? 'Under 1' : Math.round(raw)} of every 100 contracts with a ${word[l][1]} indicator.` : `${raw < 1 ? 'Menos de 1' : Math.round(raw)} de cada 100 contratos, con indicador ${word[l][0]}.`
    }
  }
  return en ? 'No contract with a high or critical indicator.' : 'Ningún contrato con indicador alto o crítico.'
}
