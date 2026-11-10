/**
 * /institutions ?ver=anatomia|diagrama — the pure model behind both graphics (GET /scorecards/institutions/anatomy).
 * Each of the N biggest active federal buyers is taken apart into three parts, each one share of its pesos:
 *   1 · cómo compra   — da_share: pesos awarded without a tender (adjudicación directa)
 *   2 · a quién       — top_share: pesos that went to its single biggest supplier
 *   3 · con qué riesgo — hr_share: pesos in contracts whose risk indicator is alto or crítico (≥ RISK_THRESHOLDS.high)
 * Every claim the page prints comes from here, so each has a true/false test (anatomy.test.ts).
 */
import { RISK_THRESHOLDS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'

export interface AnatomyVendor { id: number | null; name: string | null; kind: 'co' | 'pub' | 'pf' }
export interface AnatomyRow {
  id: number
  name: string
  siglas: string | null
  sector_id: number
  score: number
  grade: string
  n_contracts: number
  total_value_mxn: number
  last_year: number | null
  da_share: number | null
  top_share: number | null
  hr_share: number | null
  top_vendor: AnatomyVendor | null
}
export interface AnatomyPayload { computed_at: string; rows: AnatomyRow[] }

/** v3 pass mark: a rounded score under 60 (6 de 10) fails (lib/institutions/field `fail`). */
export const PASS = 60
export const fails = (r: Pick<AnatomyRow, 'score'>) => Math.round(r.score) < PASS

/** The level whose colour the risk part wears: the floor of «alto o crítico», through the one ladder. */
export const HR_LEVEL = getRiskLevelFromScore(RISK_THRESHOLDS.high)

/** The lowest grade in the set (ties keep the first, i.e. the bigger buyer); null when empty. */
export function worstOf(rows: readonly AnatomyRow[]): AnatomyRow | null {
  let w: AnatomyRow | null = null
  for (const r of rows) if (w == null || r.score < w.score) w = r
  return w
}

/** Worst grade first; the order the diagram reads. */
export const byGrade = (rows: readonly AnatomyRow[]) => [...rows].sort((a, b) => a.score - b.score || b.total_value_mxn - a.total_value_mxn)

/** «35 %» (es) / «35%» (en); shares under 1 % print one decimal so a real 0.3 % never reads «0 %». */
export function pct(x: number | null | undefined, lang: string): string {
  if (x == null || Number.isNaN(x)) return '—'
  const v = x * 100
  const s = v > 0 && v < 1 ? v.toFixed(1) : String(Math.round(v))
  return lang === 'en' ? `${s}%` : `${s} %`
}

export const sectorOf = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]

/** Which of the three parts is this buyer's widest (the one its sentence names); null without data. */
export function widestPart(r: AnatomyRow): 'da' | 'top' | 'hr' | null {
  const parts = ([['da', r.da_share], ['top', r.top_share], ['hr', r.hr_share]] as const).filter((p) => p[1] != null)
  if (!parts.length) return null
  return parts.reduce((a, b) => ((b[1] as number) > (a[1] as number) ? b : a))[0]
}

/** How many of the set fail (score < 6 de 10). */
export const failing = (rows: readonly AnatomyRow[]) => rows.filter(fails).length

/** «3.1 de 10» (es-MX point decimal) / «3.1 out of 10» (en); the grade on the 0–100 v3 score, one decimal. */
export function gradeTen(score: number | null | undefined, lang: string): string {
  if (score == null || Number.isNaN(score)) return '—'
  const t = (Math.round(score) / 10).toFixed(1)
  return lang === 'en' ? `${t} out of 10` : `${t} de 10`
}

/** The «Con qué riesgo» bar's colour: a stated rule on the SHARE of pesos with an alto/crítico indicator (not a score):
 *  9 of every 10 pesos or more → crítico (red) · 6 to 9 → alto (amber) · under 6 → medio (ochre). Low never shows:
 *  the bar is already a share of alto/crítico pesos. */
export const HR_SHARE_CRITICAL = 0.9
export const HR_SHARE_HIGH = 0.6
export function hrLevel(share: number | null | undefined): 'critical' | 'high' | 'medium' | null {
  if (share == null || Number.isNaN(share)) return null
  return share >= HR_SHARE_CRITICAL ? 'critical' : share >= HR_SHARE_HIGH ? 'high' : 'medium'
}
