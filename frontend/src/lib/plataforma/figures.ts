/**
 * Plataforma pages (/methodology, /datos, /press): the live figures they print, computed from the
 * executive summary, plus the export-link builder on /datos. Pure, so every claim has a true/false test.
 */
import type { ExecutiveSummaryRisk } from '@/api/types'

export const LEVELS = ['critical', 'high', 'medium', 'low'] as const
export type Level = (typeof LEVELS)[number]
export interface Share { level: Level; pct: number; count: number }

/** The four shares, or null when the summary is missing or its percentages do not add up (99–101). */
export function riskShares(risk: ExecutiveSummaryRisk | null | undefined): Share[] | null {
  if (!risk) return null
  const rows = LEVELS.map((level) => ({ level, pct: risk[`${level}_pct`], count: risk[`${level}_count`] }))
  if (rows.some((r) => typeof r.pct !== 'number' || typeof r.count !== 'number' || r.pct < 0)) return null
  const sum = rows.reduce((a, r) => a + r.pct, 0)
  return sum >= 99 && sum <= 101 ? rows : null
}

/** File sizes in decimal units, as Zenodo lists them. */
export const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)

export const EXPORT_MAX_ROWS = 100_000
/** backend export.py UNFILTERED_EXPORT_ROWS: with no filter the API refuses more rows than this (422). */
export const EXPORT_UNFILTERED_ROWS = 10_000
export interface ExportQuery {
  format: 'csv' | 'excel'
  sectorId?: number | null
  year?: number | null
  riskMin?: 'critical' | 'high' | 'medium' | null
  limit: number
}

/** The /export/contracts URL for a query; out-of-range values are dropped, never sent, and an
 *  unfiltered query is capped at the rows the API accepts without a filter. */
export function exportUrl(api: string, q: ExportQuery, lastYear: number): string {
  const p = new URLSearchParams()
  if (q.sectorId && q.sectorId >= 1 && q.sectorId <= 12) p.set('sector_id', String(q.sectorId))
  if (q.year && q.year >= 2002 && q.year <= lastYear) p.set('year', String(q.year))
  if (q.riskMin) p.set('risk_level_min', q.riskMin)
  const cap = [...p.keys()].length ? EXPORT_MAX_ROWS : EXPORT_UNFILTERED_ROWS
  p.set('limit', String(Math.min(Math.max(1, Math.round(q.limit)), cap)))
  return `${api}/export/contracts/${q.format}?${p.toString()}`
}
