/**
 * Concept B2 «Dos caras · La columna» (owner pick 2026-11-06; _explore/instituciones_concepts_2026-11-06/B2.html on
 * concept/instituciones-fable; content doc docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md). The data (GET
 * /institutions/{id}/panorama), the column geometry and every computed sentence of the page (each ≤ 15 words,
 * finding first — Mariana's rule). Pure: panorama.test.ts holds a true and a false case per sentence.
 */
import { api } from '@/api/client'
import { formatCompactMXN } from '@/lib/utils'
import type { AdministrationKey } from '@/lib/administrations'

export type Lang = 'es' | 'en'
export type Vista = 'hoy' | 'historia'
/** «Hoy» = this government: CompraNet + ComprasMX from the day Sheinbaum took office. */
export const HOY_FROM = '2024-10-01'
export const HOY_YEAR = 2024

export interface PanoramaMini { vendor_id: number; vendor_name: string | null; amount_mxn: number; share_pct: number | null; persona_fisica?: boolean }
export interface PanoramaSupplier {
  vendor_id: number
  vendor_name: string | null
  amount_mxn: number
  contracts: number
  share_pct: number | null
  da_pct: number | null
  da_amount_mxn: number
  avg_risk: number | null
  hr_pct: number | null
  first_year: number
  last_year: number
  first_year_all: number
  last_year_all: number
  years: [number, number][]
  main_category_id: number | null
  primary_pattern: string | null
  in_ground_truth: boolean
  efos: boolean
  sfp: boolean
  persona_fisica: boolean
}
interface Agg { amount_mxn: number; contracts: number; da_pct: number | null; avg_risk: number | null; hr_pct: number | null }
export interface PanoramaCategory extends Agg { category_id: number; name_es: string | null; name_en: string | null; share_pct: number | null }
export interface PanoramaYear extends Agg { year: number; top3: PanoramaMini[] }
export interface PanoramaSexenio extends Agg { key: AdministrationKey; from: number; to: number; top3: PanoramaMini[] }
export interface Panorama extends Agg {
  institution_id: number
  since: string | null
  until: string | null
  year: number | null
  category_id: number | null
  vendors: number
  suppliers: PanoramaSupplier[]
  rest: { vendors: number; amount_mxn: number; contracts: number }
  categories: PanoramaCategory[]
  years: PanoramaYear[]
  sexenios: PanoramaSexenio[]
}
export interface PanoramaQuery { since?: string; until?: string; year?: number; category_id?: number }

export const panoramaApi = {
  async get(id: number, q: PanoramaQuery): Promise<Panorama> {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v != null) p.set(k, String(v))
    const { data } = await api.get<Panorama>(`/institutions/${id}/panorama?${p}`)
    return data
  },
}

// ── the scope of the column: the toggle sentence «¿A quién le adjudica [inst] en [año] · [gobierno] · [categoría]?» ──
export type GobKey = AdministrationKey
export interface Scope { vista: Vista; year: number | null; gob: GobKey | null; cat: number | null }
export const GOB_YEARS: Record<GobKey, [number, number]> = { fox: [2002, 2006], calderon: [2007, 2012], epn: [2013, 2018], amlo: [2019, 2024], sheinbaum: [2025, 2030] }
export const GOB_NAME: Record<GobKey, string> = { fox: 'Fox', calderon: 'Calderón', epn: 'Peña Nieto', amlo: 'AMLO', sheinbaum: 'Sheinbaum' }

/** A government's dates for the column: by year, except the AMLO → Sheinbaum seam, cut on the day like «Hoy». */
export const GOB_DATES: Record<GobKey, [string, string]> = {
  fox: ['2002-01-01', '2006-12-31'], calderon: ['2007-01-01', '2012-12-31'], epn: ['2013-01-01', '2018-12-31'],
  amlo: ['2019-01-01', '2024-09-30'], sheinbaum: [HOY_FROM, '2030-12-31'],
}
/** The years a government's picker offers (2024 sits on both sides of the seam). */
export const gobYears = (g: GobKey): [number, number] => [Number(GOB_DATES[g][0].slice(0, 4)), Number(GOB_DATES[g][1].slice(0, 4))]

/** The API cut for a scope. Hoy fixes the government (from 2024-10-01); Historia's «gobierno» is its dates. */
export function queryOf(s: Scope): PanoramaQuery {
  const q: PanoramaQuery = {}
  if (s.vista === 'hoy') q.since = HOY_FROM
  else if (s.gob) { const [a, b] = GOB_DATES[s.gob]; q.since = a; q.until = b }
  if (s.year != null) q.year = s.year
  if (s.cat != null) q.category_id = s.cat
  return q
}

/** «con este gobierno» · «de 2002 a 2026» · «en 2019» · «con Peña Nieto» · «en medicamentos» (the finding's tail). */
export function scopeLabel(s: Scope, lang: Lang, catName?: string | null): string {
  const en = lang === 'en'
  if (s.cat != null && catName) return en ? `in ${catName.toLowerCase()}` : `en ${catName.toLowerCase()}`
  if (s.year != null) return en ? `in ${s.year}` : `en ${s.year}`
  if (s.vista === 'hoy') return en ? 'under this government' : 'con este gobierno'
  if (s.gob) return en ? `under ${GOB_NAME[s.gob]}` : `con ${GOB_NAME[s.gob]}`
  return en ? 'from 2002 to 2026' : 'de 2002 a 2026'
}

// ── the lenses (content doc P2): one object, five ways to look ──
export type LensKey = 'dinero' | 'directo' | 'siempre' | 'nuevos' | 'listas'
export const LENSES: { key: LensKey; es: string; en: string }[] = [
  { key: 'dinero', es: 'por dinero', en: 'by money' },
  { key: 'directo', es: 'sin concurso', en: 'without a tender' },
  { key: 'siempre', es: 'siempre los mismos', en: 'always the same' },
  { key: 'nuevos', es: 'nuevos', en: 'new' },
  { key: 'listas', es: 'en listas', en: 'on lists' },
]
/** «Siempre los mismos»: selling to this buyer since Fox's government and still in the last two years of the record. */
export const ALWAYS_FROM = 2006
/** «Nuevos»: first contract with this buyer less than two years before the cut. */
export const isNew = (s: PanoramaSupplier, cutYear: number) => s.first_year_all >= cutYear - 1
export const isAlways = (s: PanoramaSupplier, cutYear: number) => s.first_year_all <= ALWAYS_FROM && s.last_year_all >= cutYear - 1
export const onLists = (s: PanoramaSupplier) => s.in_ground_truth || s.efos || s.sfp

export function lensRows(rows: PanoramaSupplier[], key: LensKey, cutYear: number): PanoramaSupplier[] {
  switch (key) {
    case 'dinero': return [...rows].sort((a, b) => b.amount_mxn - a.amount_mxn)
    case 'directo': return rows.filter((r) => r.da_pct != null && r.da_amount_mxn > 0).sort((a, b) => b.da_amount_mxn - a.da_amount_mxn)
    case 'siempre': return rows.filter((r) => isAlways(r, cutYear)).sort((a, b) => (b.last_year_all - b.first_year_all) - (a.last_year_all - a.first_year_all) || b.amount_mxn - a.amount_mxn)
    case 'nuevos': return rows.filter((r) => isNew(r, cutYear)).sort((a, b) => b.amount_mxn - a.amount_mxn)
    case 'listas': return rows.filter(onLists).sort((a, b) => b.amount_mxn - a.amount_mxn)
  }
}

/** How many of the named suppliers it takes to reach half the money; null when even all of them do not. */
export function halfCount(p: Pick<Panorama, 'amount_mxn' | 'suppliers'>): number | null {
  let acc = 0
  for (let i = 0; i < p.suppliers.length; i++) {
    acc += p.suppliers[i].amount_mxn
    if (acc >= p.amount_mxn / 2) return i + 1
  }
  return null
}

/** A sentence with entities in it: strings, and suppliers rendered by the page as EntityIdentityChip. */
export type Seg = string | { id: number; name: string; pf?: boolean }
export const segText = (segs: Seg[]) => segs.map((s) => (typeof s === 'string' ? s : s.name)).join('')
const v = (s: { vendor_id: number; vendor_name: string | null; persona_fisica?: boolean }): Seg => ({ id: s.vendor_id, name: s.vendor_name ?? '—', pf: !!s.persona_fisica })

/** Decimals needed so `a` and `b` print differently: at least `min`, at most `max`. A tie at the printed precision gets
 *  one more decimal (AUDIT_JOURNALIST 11-07: Pisa 3.6 vs Astrazeneca 3.6 both printed «4 de cada 100»). */
export function splitDigits(a: number, b: number | null | undefined, min = 0, max = 2): number {
  let d = min
  while (b != null && d < max && a.toFixed(d) === b.toFixed(d)) d++
  return d
}

/** «: N de cada 100 pesos.» for the largest supplier; when the second ties at that precision, it is named too. */
export function leaderShare(rows: Pick<PanoramaSupplier, 'vendor_id' | 'vendor_name' | 'persona_fisica' | 'share_pct'>[], lang: Lang): Seg[] {
  const en = lang === 'en'
  const [t, u] = rows
  const a = t.share_pct ?? 0, b = u?.share_pct
  const d = splitDigits(a, b)
  const f = (x: number) => x.toLocaleString(en ? 'en-US' : 'es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (u && b != null && d > 0) return [en ? `: ${f(a)} of every 100 pesos, almost tied with ` : `: ${f(a)} de cada 100 pesos, casi empatado con `, v(u), ` (${f(b)}).`]
  return [en ? `: ${f(a)} of every 100 pesos.` : `: ${f(a)} de cada 100 pesos.`]
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** P2 «Qué significa»: how many suppliers make half the money, then the lens's own finding. */
export function findingP2(p: Panorama, lens: LensKey, label: string, cutYear: number, lang: Lang): Seg[] {
  const en = lang === 'en'
  const rows = p.suppliers, N = rows.length
  if (!N) return [en ? `No contracts ${label}.` : `Sin contratos ${label}.`]
  const h = halfCount(p)
  const first: Seg = h
    ? (en ? `${h} ${plural(h, 'supplier takes', 'suppliers take')} half the money ${label}. ` : `${h} ${plural(h, 'proveedor junta', 'proveedores juntan')} la mitad del dinero ${label}. `)
    : (en ? `Not even its ${N} largest take half the money ${label}. ` : `Ni sus ${N} mayores juntan la mitad del dinero ${label}. `)
  const L = lensRows(rows, lens, cutYear)
  switch (lens) {
    case 'dinero': {
      const t = rows[0], share = t.share_pct ?? 0
      return share >= 10
        ? [first, v(t), ...leaderShare(rows, lang)]
        : [first, en ? `Spread out: none takes more than ${Math.ceil(share)} of every 100 pesos.` : `Gasto repartido: ninguno pasa de ${Math.ceil(share)} de cada 100 pesos.`]
    }
    case 'directo':
      return L[0]
        ? [first, en ? 'Most without a tender: ' : 'Más sin concurso: ', v(L[0]), `, ${formatCompactMXN(L[0].da_amount_mxn)}.`]
        : [first, en ? 'No procedure on record for these years.' : 'Sin procedimiento registrado en estos años.']
    case 'siempre':
      return [first, L.length
        ? (en ? `${L.length} of its ${N} largest have sold to it since Fox.` : `${L.length} de sus ${N} mayores le venden desde el gobierno de Fox.`)
        : (en ? `None of its ${N} largest has sold to it since Fox.` : `Ninguno de sus ${N} mayores le vende desde el gobierno de Fox.`)]
    case 'nuevos':
      return [first, L.length
        ? (en ? `${L.length} under two years old already rank among its ${N} largest.` : `${L.length} con menos de dos años ya están entre sus ${N} mayores.`)
        : (en ? `No new supplier among its ${N} largest.` : `Ningún proveedor nuevo entre sus ${N} mayores.`)]
    case 'listas':
      return [first, L.length
        ? (en ? `${L.length} of its ${N} largest are in documented cases or official lists.` : `${L.length} de sus ${N} mayores están en casos documentados o listas oficiales.`)
        : (en ? `None of its ${N} largest is on a public list.` : `Ninguno de sus ${N} mayores está en listas públicas.`)]
  }
}

// ── «La columna de los 100 pesos»: one plate per supplier, height = its share; «los demás» a compressed cap ──
export interface Plate { kind: 'plate'; s: PanoramaSupplier; y: number; h: number }
export interface Tiny { kind: 'tiny'; n: number; m: number; y: number; h: number }
export interface Cap { kind: 'cap'; m: number; y: number; h: number; compressed: boolean; trueH: number }
export type ColumnPiece = Plate | Tiny | Cap
/** Named suppliers fill HN px; plates under 3 px fold into one «más pequeños» band; «los demás» is drawn true to scale
 *  up to CAPMAX and compressed above it (the break mark says so, and by how much). */
export function columnPieces(p: Pick<Panorama, 'amount_mxn' | 'suppliers' | 'rest'>, HN = 440, CAPMAX = 96): { pieces: ColumnPiece[]; H: number; halfY: number | null } {
  const total = p.amount_mxn
  if (!(total > 0)) return { pieces: [], H: 0, halfY: null }
  const named = p.suppliers.reduce((s, r) => s + r.amount_mxn, 0)
  const scale = HN / Math.max(named / total, 0.05)
  const pieces: ColumnPiece[] = []
  let y = 0, acc = 0, halfY: number | null = null
  const tiny: PanoramaSupplier[] = []
  for (const s of p.suppliers) {
    const h = (s.amount_mxn / total) * scale
    if (h >= 3) { pieces.push({ kind: 'plate', s, y, h }); y += h } else tiny.push(s)
    acc += s.amount_mxn
    if (halfY == null && acc >= total / 2 && h >= 3) halfY = y
  }
  if (tiny.length) {
    const m = tiny.reduce((s, r) => s + r.amount_mxn, 0), h = (m / total) * scale
    pieces.push({ kind: 'tiny', n: tiny.length, m, y, h }); y += h
    if (halfY == null && acc >= total / 2) halfY = y
  }
  const restM = Math.max(0, total - named)
  if (restM > 0) {
    const trueH = (restM / total) * scale, compressed = trueH > CAPMAX
    pieces.push({ kind: 'cap', m: restM, y, h: compressed ? CAPMAX : trueH, compressed, trueH })
    y += compressed ? CAPMAX : trueH
  }
  return { pieces, H: y, halfY }
}

/** «Sin concurso» as the TONE of a hue (owner 11-06: no grey): 30 % of the hue on paper at 0, the full hue at 100. */
export const hueTone = (hue: string, da: number | null) =>
  da == null ? null : `color-mix(in srgb, ${hue} ${Math.round(30 + 0.7 * Math.min(100, Math.max(0, da)))}%, var(--color-background))`

/** Historia: a supplier with no contract year since this government began. ponytail: year-level — a supplier whose last
 *  contract was Jan–Sep 2024 is not flagged; the exact rule needs the last contract date in the payload. */
export const inactiveSince = (s: PanoramaSupplier): number | null => (s.last_year_all < HOY_YEAR ? s.last_year_all : null)

// ── P3 «Homenaje al cuadrado»: Hoy by year of this term, Historia by sexenio ──
export interface Square { key: string; label: string; from: number; to: number; amount: number; contracts: number; da: number | null; admin: AdministrationKey; top3: PanoramaMini[]; partial: boolean }
export function squaresOf(p: Panorama, vista: Vista, lang: Lang): Square[] {
  if (vista === 'hoy') {
    return p.years.filter((y) => y.year >= HOY_YEAR).map((y) => ({
      key: String(y.year), label: y.year === HOY_YEAR ? (lang === 'en' ? '2024 · Oct–Dec' : '2024 · oct–dic') : String(y.year),
      from: y.year, to: y.year, amount: y.amount_mxn, contracts: y.contracts, da: y.da_pct, admin: 'sheinbaum' as const, top3: y.top3, partial: false,
    }))
  }
  return p.sexenios.map((s) => ({ key: s.key, label: GOB_NAME[s.key], from: s.from, to: Math.min(s.to, 2026), amount: s.amount_mxn, contracts: s.contracts, da: s.da_pct, admin: s.key, top3: s.top3, partial: s.from < 2011 }))
}
export function findingP3(sq: Square[], vista: Vista, lang: Lang): string {
  const en = lang === 'en'
  const named = sq.filter((s) => s.da != null && !s.partial && s.amount > 0).sort((a, b) => (b.da ?? 0) - (a.da ?? 0))
  if (named.length >= 2) {
    const [a, b] = named
    const pre = (s: Square) => (vista === 'hoy' ? (en ? `In ${s.from}` : `En ${s.from}`) : (en ? `Under ${s.label}` : `Con ${s.label}`))
    return en
      ? `${pre(a)}, ${Math.round(a.da!)} of every 100 contracts had no tender. ${pre(b)}, ${Math.round(b.da!)}.`
      : `${pre(a)}, ${Math.round(a.da!)} de cada 100 contratos fueron sin concurso. ${pre(b)}, ${Math.round(b.da!)}.`
  }
  const big = [...sq].sort((a, b) => b.amount - a.amount)[0]
  if (!big) return en ? 'No contracts in this period.' : 'Sin contratos en este periodo.'
  return en ? `Most money: ${big.label}, ${formatCompactMXN(big.amount)}.` : `Más dinero: ${big.label}, ${formatCompactMXN(big.amount)}.`
}

// ── P4 «Qué compra» ──
export function findingP4(cats: PanoramaCategory[], lang: Lang): string {
  const en = lang === 'en'
  const name = (c: PanoramaCategory) => (en ? c.name_en : c.name_es) ?? `#${c.category_id}`
  const top = cats[0]
  if (!top) return en ? 'No category on record.' : 'Sin categoría registrada.'
  const tall = cats.filter((c) => c.da_pct != null && c.contracts >= 20).sort((a, b) => (b.da_pct ?? 0) - (a.da_pct ?? 0))[0]
  const a = en ? `${name(top)}: ${Math.round(top.share_pct ?? 0)} of every 100 pesos.` : `${name(top)}: ${Math.round(top.share_pct ?? 0)} de cada 100 pesos.`
  if (!tall) return a
  return a + (en ? ` Most without a tender: ${name(tall)}, ${Math.round(tall.da_pct!)} of 100.` : ` Más sin concurso: ${name(tall)}, ${Math.round(tall.da_pct!)} de 100.`)
}

// ── Calificación: the pillar → suppliers bridge (C3) ──
export type PillarKey3 = 'competencia' | 'proceso' | 'concentracion'
export const PILLAR_RULE: Record<PillarKey3, { lens: LensKey; rows: (r: PanoramaSupplier[]) => PanoramaSupplier[]; why: [string, string]; word: [string, string] }> = {
  competencia: { lens: 'directo', rows: (r) => [...r].filter((x) => x.da_amount_mxn > 0).sort((a, b) => b.da_amount_mxn - a.da_amount_mxn), why: ['cobran más dinero sin concurso', 'are paid the most without a tender'], word: ['comprar sin concurso', 'buying without a tender'] },
  proceso: { lens: 'dinero', rows: (r) => [...r].sort((a, b) => b.contracts - a.contracts), why: ['reciben más contratos pequeños y repetidos', 'get the most small, repeated contracts'], word: ['partir contratos y comprar a fin de año', 'splitting contracts and year-end buying'] },
  concentracion: { lens: 'dinero', rows: (r) => [...r].sort((a, b) => (b.share_pct ?? 0) - (a.share_pct ?? 0)), why: ['se llevan la mayor parte del dinero', 'take most of the money'], word: ['depender de pocos proveedores', 'relying on few suppliers'] },
}
export const isPillar3 = (k: string | null | undefined): k is PillarKey3 => k === 'competencia' || k === 'proceso' || k === 'concentracion'
export function findingC3(rows: PanoramaSupplier[], key: PillarKey3, lang: Lang): Seg[] {
  const en = lang === 'en'
  const r = PILLAR_RULE[key].rows(rows).slice(0, 8), t = r[0]
  if (!t) return [en ? 'No supplier behind this pillar.' : 'Ningún proveedor detrás de este pilar.']
  if (key === 'competencia') return [v(t), en ? ` was paid ${formatCompactMXN(t.da_amount_mxn)} without a tender, the most.` : ` cobró ${formatCompactMXN(t.da_amount_mxn)} sin concurso, más que nadie.`]
  if (key === 'concentracion') { const s = Math.round(r.reduce((a, x) => a + (x.share_pct ?? 0), 0)); return [en ? `The eight largest take ${s} of every 100 pesos.` : `Los ocho mayores suman ${s} de cada 100 pesos.`] }
  return [v(t), en ? ` has ${t.contracts.toLocaleString('en-US')} contracts here: many and small.` : ` tiene ${t.contracts.toLocaleString('es-MX')} contratos aquí: muchos y pequeños.`]
}
