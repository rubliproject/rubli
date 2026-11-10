/**
 * Los patrones § El arranque (docs/BACKLOG_LOS_PATRONES.md § El arranque, MAGENTA build 2026-11-05) — the board's model.
 * The pattern, general (owner 2026-11-05): a company under a year old at its first federal contract that took ≥ 100 MDP
 * in its first 365 days, most of it (≥ 50 %) with no tender — any buyer, any sector, any year. APP special-purpose
 * companies are left out (born for one tendered contract by law). Rows come from GET /newtabs/arranque.
 */
import { isSpv, type ArrRow } from '@/lib/destiempo/model'

/** The board's extra columns (backend newtabs.arranque, MAGENTA): the first contract's buyer and the age gap. */
export type FirmRow = ArrRow & {
  age_days?: number | null
  institution_id?: number | null; institution_name?: string | null; institution_siglas?: string | null
  sector_id?: number | null; first_risk_score?: number | null; first_procedure?: string | null
  category_id?: number | null; category_es?: string | null; category_en?: string | null
}

export const YEAR_DAYS = 365
export const DA_MIN = 0.5

/** Under a year old at the first contract (by the dated age, else the frozen bucket). */
export const isYoung = (r: FirmRow) =>
  r.age_days != null ? r.age_days < YEAR_DAYS : r.incorp_bucket === 'lt180' || r.incorp_bucket === 'lt365'

export const inPattern = (r: FirmRow) => r.vendor_id != null && isYoung(r) && r.y1_da_share >= DA_MIN && !isSpv(r)

/** Every firm in the pattern, largest first-year money first. */
export function firms(rows: FirmRow[]): FirmRow[] {
  return rows.filter(inPattern).sort((a, b) => b.y1_mxn - a.y1_mxn)
}

export interface Filter { sector?: number | null; buyer?: number | null }
export const applyFilter = (rows: FirmRow[], f: Filter) =>
  rows.filter((r) => (f.sector == null || r.sector_id === f.sector) && (f.buyer == null || r.institution_id === f.buyer))

/** Buyers that appear, most firms first (ties by name): the buyer filter's options. */
export function buyers(rows: FirmRow[]): { id: number; name: string; siglas: string | null; n: number }[] {
  const by = new Map<number, { id: number; name: string; siglas: string | null; n: number }>()
  for (const r of rows) {
    if (r.institution_id == null) continue
    const b = by.get(r.institution_id) ?? { id: r.institution_id, name: r.institution_name ?? '', siglas: r.institution_siglas ?? null, n: 0 }
    b.n += 1
    by.set(r.institution_id, b)
  }
  return [...by.values()].sort((a, b) => b.n - a.n || (a.siglas ?? a.name).localeCompare(b.siglas ?? b.name))
}

/** The board's one finding (owner 11-07, no bars): of the listed firms with a dated age, the median days old at the first
 *  contract and the youngest firm. Null when no firm is dated. */
export function ageFinding(rows: FirmRow[]) {
  const dated = rows.filter((r) => r.age_days != null).sort((a, b) => a.age_days! - b.age_days!)
  if (!dated.length) return null
  const k = dated.length >> 1
  const median = dated.length % 2 ? dated[k].age_days! : Math.round((dated[k - 1].age_days! + dated[k].age_days!) / 2)
  return { n: dated.length, median, youngest: dated[0] }
}

/** Each firm's first-year money as a share of the listed firms' total («% del total»). */
export const shareOf = (r: FirmRow, rows: FirmRow[]) => {
  const tot = rows.reduce((s, x) => s + x.y1_mxn, 0)
  return tot > 0 ? r.y1_mxn / tot : 0
}

/** The first year's contracts: [first_date, first_date + 365 d). */
export function inFirstYear(firstDate: string, contractDate: string | null | undefined): boolean {
  if (!contractDate) return false
  const d0 = Date.parse(firstDate), d = Date.parse(contractDate.slice(0, 10))
  return d >= d0 && d < d0 + YEAR_DAYS * 86_400_000
}

/** The finding, computed: how many firms, how much, how many born < 6 months before. */
export function finding(rows: FirmRow[]) {
  return {
    n: rows.length,
    mxn: rows.reduce((s, r) => s + r.y1_mxn, 0),
    under180: rows.filter((r) => r.age_days != null && r.age_days < 180).length,
    sectors: new Set(rows.map((r) => r.sector_id).filter((s) => s != null)).size,
    buyers: new Set(rows.map((r) => r.institution_id).filter((s) => s != null)).size,
  }
}
