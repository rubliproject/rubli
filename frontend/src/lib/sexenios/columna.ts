/**
 * «La columna» (/administrations) — the payload of GET /sexenios/columna
 * (backend/scripts/precompute_sexenios_columna.py) and the pure readings the page prints.
 * Every sentence here is computed from the payload; vitest holds each one true/false (columna.test.ts).
 */
import type { AdministrationKey } from '@/lib/administrations'

export interface ColVendor { id: number; name: string | null; persona_fisica: boolean; value: number; share: number; contracts?: number }
export interface ColInstitution { id: number; name: string | null; value: number; share: number }
export interface ColMonth { month: number; contracts: number; value: number; crit100: number | null }
export interface ColContract {
  id: number; title: string | null; amount: number; date: string; risk_score: number | null; flag: boolean
  /** public_labels.amount_flag: listed, tagged «Revisar», never a leader (the suppliers/buyers ranks leave it out) */
  amount_flag?: 'suspect_decimal' | 'review' | null
  direct_award: boolean | null
  vendor: { id: number; name: string | null; persona_fisica: boolean } | null
  institution: { id: number; name: string | null } | null
}
export interface ColYear {
  year: number; term: string; contracts: number; value: number
  /** share of the money awarded without a tender; null before 2011 (not recorded) */
  da_share: number | null
  /** count of direct-award contracts that year; null before 2011 */
  da_contracts?: number | null
  /** contracts with indicator ≥ 0.60 per 100 contracts */
  crit100: number | null
  months: ColMonth[]; vendors: ColVendor[]; top_contracts: ColContract[]
}
export interface ColTerm {
  key: string; years: number[]; contracts: number; value: number; value_per_year: number
  da_share: number | null; da_years: number[]; crit100: number | null
  /** direct-award contracts, counted out of da_base (the contracts of the years that record it) */
  da_contracts?: number | null; da_base?: number | null
  vendors: ColVendor[]; institutions: ColInstitution[]; sectors: { sector_id: number; value: number; share: number }[]
}
export interface Columna { cut: string; first_year: number; last_year: number; years: ColYear[]; terms: ColTerm[]; updated_at?: string }

/** Backend term keys → the frontend's canonical keys (lib/administrations). */
const KEY: Record<string, AdministrationKey> = { fox: 'fox', calderon: 'calderon', pena_nieto: 'epn', amlo: 'amlo', sheinbaum: 'sheinbaum' }
export const termKey = (k: string): AdministrationKey | null => KEY[k] ?? null
/** URL slugs (?g=) in column order. */
export const TERM_SLUGS = ['fox', 'calderon', 'pena-nieto', 'amlo', 'sheinbaum'] as const
export type TermSlug = typeof TERM_SLUGS[number]
export const slugOf = (k: string): TermSlug | null => (TERM_SLUGS as readonly string[]).find((s) => s.replace('-', '_') === k) as TermSlug | undefined ?? null
export const backendKeyOf = (s: TermSlug) => s.replace('-', '_')

/** A year with less than this share of the median year's money is «casi sin registro» (2004). */
export const THIN = 0.05

export interface Level { g: TermSlug | null; y: number | null }

/** ?g=&y= → a level that exists in the payload: a year outside its term drops; a year alone opens its term. */
export function levelOf(params: URLSearchParams, data: Columna | undefined): Level {
  const gRaw = params.get('g')
  const g = (TERM_SLUGS as readonly string[]).includes(gRaw ?? '') ? gRaw as TermSlug : null
  const yNum = Number(params.get('y'))
  const year = data?.years.find((r) => r.year === yNum)
  if (!year || !year.contracts) return { g, y: null }
  const yg = slugOf(year.term)
  return g && g !== yg ? { g, y: null } : { g: yg, y: year.year }
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

/** Years whose money is a sliver of a normal year (2004): drawn as an empty frame, «casi sin registro». */
export function thinYears(years: ColYear[]): Set<number> {
  const m = median(years.map((y) => y.value))
  return new Set(years.filter((y) => y.value < THIN * m).map((y) => y.year))
}

type Lang = 'es' | 'en'
type Fmt = (n: number) => string
const pct = (x: number) => Math.round(100 * x)

/** Level 0: the widest slab. */
export function findingColumn(d: Columna, lang: Lang, money: Fmt): string {
  const top = d.years.reduce((a, b) => (b.value > a.value ? b : a))
  // the record's last year stops at the cut (28 Sep 2025): say so, never let it read as a full year
  const partial = top.year === Number(d.cut.slice(0, 4))
  if (lang === 'es') return partial
    ? `${top.year} ya es el año con más dinero, y solo llega a septiembre: ${money(top.value)}.`
    : `${top.year} es el año con más dinero contratado: ${money(top.value)}.`
  return partial
    ? `${top.year} is already the year with the most money, and it only runs to September: ${money(top.value)}.`
    : `${top.year} is the year with the most money contracted: ${money(top.value)}.`
}

/** Level 1: the sector that took the most of the term's money. */
export function findingTerm(t: ColTerm, who: string, sectorName: (id: number) => string, lang: Lang, open: boolean): string | null {
  const s = t.sectors[0]
  if (!s || !t.value) return null
  const n = pct(s.share), name = sectorName(s.sector_id)
  const last = t.years[t.years.length - 1]
  if (lang === 'es') return open ? `Con ${who}, en ${last}, ${name.toLowerCase()} se lleva ${n} de cada 100 pesos.` : `Con ${who}, ${name.toLowerCase()} se llevó ${n} de cada 100 pesos.`
  return open ? `Under ${who}, in ${last}, ${name.toLowerCase()} takes ${n} of every 100 pesos.` : `Under ${who}, ${name.toLowerCase()} took ${n} of every 100 pesos.`
}

/** Level 2: the year's critical contracts, by count (the open year leads with its risk contracts). */
export function findingYear(y: ColYear, lang: Lang, critN?: number): string | null {
  if (critN == null && (!y.contracts || y.crit100 == null)) return null
  // the exact count when the month signals are in (crit100 is rounded to 2 decimals)
  const n = (critN ?? Math.round(((y.crit100 as number) * y.contracts) / 100)).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')
  return lang === 'es'
    ? `En ${y.year}, ${n} contratos tuvieron indicador de riesgo crítico.`
    : `In ${y.year}, ${n} contracts had a critical risk indicator.`
}

/** Words in a sentence (the ≤ 15-word copy rule). */
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** The profile of one government, in plain sentences (≤ 15 words each). `open` = the term still running. */
export interface Profile { spent: string; noTender: string; noTenderCount: string | null; crit: string | null }

export function profileOf(t: ColTerm, slug: TermSlug, lang: Lang, money: Fmt, open: boolean): Profile {
  const es = lang === 'es'
  const last = t.years[t.years.length - 1]
  const spent = open
    ? (es ? `En ${last} contrató ${money(t.value)}, hasta el corte del registro.` : `In ${last} it contracted ${money(t.value)}, up to the record's cut-off.`)
    : (es ? `Entre ${t.years[0]} y ${last} contrató ${money(t.value)}.` : `From ${t.years[0]} to ${last} it contracted ${money(t.value)}.`)
  const noTender = t.da_share == null
    ? (es ? 'Antes de 2011 no se anotaba si hubo concurso.' : 'Before 2011 the record did not say if there was a tender.')
    : (es ? `${pct(t.da_share)} de cada 100 pesos se dieron sin concurso` : `${pct(t.da_share)} of every 100 pesos went out with no tender`)
      + (slug === 'calderon' ? (es ? ' (solo 2011 y 2012 lo anotan).' : ' (only 2011 and 2012 record it).') : '.')
  const noTenderCount = t.da_contracts != null && t.da_base
    ? (es ? `Por número, ${pct(t.da_contracts / t.da_base)} de cada 100 contratos fueron sin concurso.` : `By count, ${pct(t.da_contracts / t.da_base)} of every 100 contracts had no tender.`)
    : null
  const c = t.crit100 == null ? null : Math.round(t.crit100)
  const crit = c == null ? null
    : (es ? `${c} de cada 100 contratos tienen indicador crítico.` : `${c} of every 100 contracts have a critical indicator.`)
  return { spent, noTender, noTenderCount, crit }
}

/** A period's money by spending category (GET /contracts/by-category?year=&month=), largest first. */
export interface SplitRow { category_id: number | null; name_es: string | null; name_en: string | null; contracts: number; value: number }
export interface PeriodSplit { year: number; month: number | null; contracts: number; value: number; rows: SplitRow[] }

/** ?m= → a month of the open year that has contracts, else null (Oct–Dec 2025 are past the cut). */
export function monthOf(params: URLSearchParams, y: ColYear | undefined): number | null {
  const m = Number(params.get('m'))
  return y?.months.find((x) => x.month === m && x.contracts > 0)?.month ?? null
}

/** W7 risk contracts first — GET /sexenios/month-signals?year= (the column's rows: CompraNet without ComprasMX,
 *  0 < amount <= 100B, dated). Every sentence below is shown only when true (columna.test.ts). */
export interface SigSector { sector_id: number; share: number; year_share: number; lift: number }
export interface SigMonth { month: number; contracts: number; value: number; crit_n: number; crit_value: number; da_value: number; top_sector: SigSector | null }
export interface SigVendor { id: number; name: string | null; persona_fisica: boolean; value: number; share: number; crit_n: number }
export interface MonthSignals {
  year: number; value: number; contracts: number; crit_n: number; crit_value: number; crit_share: number | null
  source: 'compranet'; months: SigMonth[]; new_vendor: SigVendor | null
}

/** The month's pesos in contracts with indicador crítico (>= 0.60), as a share of its pesos. */
export const critShare = (m: Pick<SigMonth, 'value' | 'crit_value'>): number | null => (m.value > 0 ? m.crit_value / m.value : null)

/** A real month: >= 1/48 of the year's money (the stray weeks past the 2025 cut are not). */
export const fullMonth = (m: SigMonth, s: MonthSignals) => s.value > 0 && m.value >= s.value / 48

/** The sector that pops out: >= 20 % of the month AND >= 10 share points above its share of the year. */
export function standout(m: SigMonth): SigSector | null {
  const s = m.top_sector
  return s && s.share >= 0.2 && s.lift >= 0.1 ? s : null
}

const cap = (w: string) => `${w[0].toUpperCase()}${w.slice(1)}`

/** «Qué significa»: the year's pesos in critical contracts, in tenths (RED-checked wording, 2026-11-06). */
export function findingCritPesos(s: MonthSignals, lang: Lang): string | null {
  if (!s.value || s.crit_share == null) return null
  const t = Math.round(10 * s.crit_share)
  return lang === 'es'
    ? `${t} de cada 10 pesos fueron a contratos con indicador de riesgo crítico.`
    : `${t} of every 10 pesos went to contracts with a critical risk indicator.`
}

/** The quiet line that always follows it: by count, the critical contracts are few. */
export function findingCritCount(s: MonthSignals, lang: Lang): string | null {
  if (!s.contracts) return null
  const n = Math.round((100 * s.crit_n) / s.contracts)
  return lang === 'es'
    ? `Los contratos grandes pesan más: por número, solo ${n} de cada 100 son críticos.`
    : `Large contracts weigh more: by count, only ${n} of every 100 are critical.`
}

export interface Destaca { kind: 'sector' | 'spike' | 'vendor'; month: number | null; text: string }

/** «Lo que destaca»: up to three plain sentences, each only when true. `money` = the lead-amount helper. */
export function destacan(s: MonthSignals, monthName: (m: number) => string, sectorName: (id: number) => string, lang: Lang, money: Fmt): Destaca[] {
  const out: Destaca[] = []
  const full = s.months.filter((m) => fullMonth(m, s))
  // 1. the sector that jumps: the largest lift over its share of the year
  const jump = full.map((m) => ({ m, x: standout(m) })).filter((r) => r.x).sort((a, b) => b.x!.lift - a.x!.lift)[0]
  if (jump) {
    const { m, x } = jump as { m: SigMonth; x: SigSector }
    out.push({ kind: 'sector', month: m.month, text: lang === 'es'
      ? `En ${monthName(m.month)}, ${sectorName(x.sector_id)} subió a ${pct(x.share)} de cada 100 pesos; en el año, ${pct(x.year_share)}.`
      : `In ${cap(monthName(m.month))}, ${sectorName(x.sector_id)} rose to ${pct(x.share)} of every 100 pesos; ${pct(x.year_share)} for the year.` })
  }
  // 2. a month spike: the most critical contracts, at least 1.5 times the monthly average
  if (full.length >= 3) {
    const avg = full.reduce((a, m) => a + m.crit_n, 0) / full.length
    const top = full.reduce((a, b) => (b.crit_n > a.crit_n ? b : a), full[0])
    const k = avg ? top.crit_n / avg : 0
    if (k >= 1.5) {
      const x = k.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })
      const n = top.crit_n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')
      out.push({ kind: 'spike', month: top.month, text: lang === 'es'
        ? `${cap(monthName(top.month))} tuvo ${n} contratos críticos: ${x} veces el promedio mensual.`
        : `${cap(monthName(top.month))} had ${n} critical contracts: ${x} times the monthly average.` })
    }
  }
  // 3. a new supplier with big money: first contract this year and >= 5 of every 1,000 pesos of the year
  const v = s.new_vendor
  if (v && v.share >= 0.005) {
    out.push({ kind: 'vendor', month: null, text: lang === 'es'
      ? `ganó ${money(v.value)} en ${s.year}, su primer año con contratos federales.`
      : `won ${money(v.value)} in ${s.year}, its first year with federal contracts.` })
  }
  return out
}

/** The split's rows on screen: the `k` largest named categories; the rest (and the uncategorised) summed. */
export function splitRows(s: PeriodSplit, k = 7): { top: SplitRow[]; rest: { n: number; value: number }; none: number } {
  const named = s.rows.filter((r) => r.category_id != null)
  const top = named.slice(0, k)
  const rest = named.slice(k)
  return { top, rest: { n: rest.length, value: rest.reduce((a, r) => a + r.value, 0) }, none: s.rows.filter((r) => r.category_id == null).reduce((a, r) => a + r.value, 0) }
}

/** «¿En qué se gastó?»: the largest named category's share of the period. `when` = «2024» / «marzo de 2024». */
export function findingSplit(s: PeriodSplit, when: string, lang: Lang): string | null {
  const r = s.rows.find((x) => x.category_id != null)
  if (!r || !s.value) return null
  const name = (lang === 'es' ? r.name_es : r.name_en || r.name_es) ?? ''
  return lang === 'es'
    ? `${name} se llevó ${pct(r.value / s.value)} de cada 100 pesos en ${when}.`
    : `${name} took ${pct(r.value / s.value)} of every 100 pesos in ${when}.`
}
