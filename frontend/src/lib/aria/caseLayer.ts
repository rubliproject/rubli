/**
 * The ARIA case layer on the vendor expediente (owner 2026-10-27: a case = the vendor template +
 * a case layer; _explore/dossier_concepts_2026-10-27/README.md § B, ARIA payload). Pure: the
 * expediente model + the queue row in, facts for the spine's «Hechos» row and claims for
 * «La lectura» out. Every claim renders only when its condition holds.
 */
import type { AriaQueueItem, VendorGroundTruthCaseInfo } from '@/api/types'
import type { Expediente, Fact } from '@/lib/vendor/expediente'
import type { Claim } from '@/lib/vendor/lectura'

const CRIT = 0.6

/** The yearly mean indicator: the first year at ≥ 0.60, and the year from which it never fell back. */
export function crossing(m: Expediente): { first: number | null; holdsFrom: number | null; run: number } {
  const ys = m.src.years.filter((y) => y.avg_risk_score != null).sort((a, b) => a.year - b.year)
  const first = ys.find((y) => (y.avg_risk_score as number) >= CRIT)?.year ?? null
  let k = ys.length
  while (k > 0 && (ys[k - 1].avg_risk_score as number) >= CRIT) k--
  const holdsFrom = k < ys.length ? ys[k].year : null
  return { first, holdsFrom, run: ys.length - k }
}

/** The documented case's year: the record's year_start, else a year in its name (prod before the field shipped). */
export function caseYear(c: VendorGroundTruthCaseInfo | null | undefined): number | null {
  if (!c) return null
  if (c.year_start) return c.year_start
  const y = /\b(20[0-3]\d)\b/.exec(c.case_name ?? '')
  return y ? Number(y[1]) : null
}

export function caseFacts(m: Expediente, opts: { caseYear: number | null }): Fact[] {
  const out: Fact[] = []
  const { first } = crossing(m)
  if (first != null) out.push({ year: first, kind: 'crosses' })
  const cy = opts.caseYear
  if (cy != null && cy >= m.start && cy <= m.end) out.push({ year: cy, kind: 'case' })
  return out
}

export function caseClaims(m: Expediente, item: Pick<AriaQueueItem, 'primary_pattern' | 'pattern_confidence' | 'top_institution_ratio'> | null | undefined, patternName: (p: string, lang: 'es' | 'en') => string): Claim[] {
  const claims: Claim[] = []

  // 1 · the indicator crossed 0.60 and has not come down (≥ 3 years running to its last year).
  const { first, holdsFrom, run } = crossing(m)
  if (first != null && holdsFrom != null && run >= 3) {
    claims.push(first === holdsFrom ? {
      key: 'crossed',
      es: ['El indicador cruzó 0.60 en ', { b: String(first) }, ' y no ha bajado: ', { b: `${run} años` }, ' seguidos en crítico.'],
      en: ['The indicator crossed 0.60 in ', { b: String(first) }, ' and has not come down: ', { b: `${run} years` }, ' running at critical.'],
    } : {
      key: 'crossed',
      es: ['El indicador cruzó 0.60 por primera vez en ', { b: String(first) }, '; desde ', { b: String(holdsFrom) }, ' no ha bajado (', { b: `${run} años` }, ' seguidos).'],
      en: ['The indicator first crossed 0.60 in ', { b: String(first) }, '; since ', { b: String(holdsFrom) }, ' it has not come down (', { b: `${run} years` }, ' running).'],
    })
  }

  // 2 · a single-buyer pattern (P1 monopoly · P6 dependence) and the count share that supports it.
  const p = item?.primary_pattern
  const ratio = item?.top_institution_ratio ?? 0
  if (item && (p === 'P1' || p === 'P6') && ratio >= 0.5) {
    const pc = Math.round(ratio * 100)
    const conf = (item.pattern_confidence ?? 0).toFixed(2)
    claims.push({
      key: 'pattern',
      es: ['Patrón ', { b: p }, ` · ${patternName(p, 'es').toLowerCase()} (puntaje de regla ${conf}); un solo comprador firma el `, { b: `${pc}%` }, ' de sus contratos.'],
      en: ['Pattern ', { b: p }, ` · ${patternName(p, 'en').toLowerCase()} (rule score ${conf}); a single buyer signs `, { b: `${pc}%` }, ' of its contracts.'],
    })
  }
  return claims
}
