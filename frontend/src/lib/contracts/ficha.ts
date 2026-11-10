/**
 * «La ficha» — the contract card's computed layer (archive README 2026-10-28, direction A).
 * Pure: the contract, its /context and its /risk-explain in; dates, claims and neighbours out.
 * Every «La lectura» claim renders only when its condition holds (vitest true/false per claim).
 */
import type { ContractContextResponse, ContractDetail, ContractListItem, RiskFeatureContribution } from '@/api/types'
import { modelFeatureLabel } from '@/lib/model/featureLabels'

type Lang = 'es' | 'en'
const DAY = 86_400_000
const parse = (d?: string | null) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  return Number.isFinite(t) ? t : null
}

/** Days from publication to signing (negative = signed before it was published); null when a date is missing. */
export function dayGap(published?: string | null, signed?: string | null): number | null {
  const a = parse(published), b = parse(signed)
  return a == null || b == null ? null : Math.round((b - a) / DAY)
}

export function gapPhrase(gap: number, lang: Lang): string {
  if (gap === 0) return lang === 'es' ? 'el mismo día' : 'the same day'
  const n = Math.abs(gap), unit = lang === 'es' ? (n === 1 ? 'día' : 'días') : (n === 1 ? 'day' : 'days')
  const side = gap < 0 ? (lang === 'es' ? 'antes' : 'before') : (lang === 'es' ? 'después' : 'after')
  return `${n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')} ${unit} ${side}`
}

export interface LecturaClaim { key: string; es: string; en: string; crit?: boolean }
const nf = (n: number, lang: Lang) => n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 0 })

export function buildFichaLectura(c: ContractDetail, ctx?: ContractContextResponse | null): LecturaClaim[] {
  const out: LecturaClaim[] = []
  const art = ctx?.official?.exception_article
  if (c.is_direct_award) {
    out.push(art
      ? { key: 'direct', es: `Se adjudicó sin competencia, con la excepción ${art}.`, en: `Awarded without competition, under exception ${art}.` }
      : { key: 'direct', es: 'Se adjudicó sin competencia; la fuente no registra el artículo de excepción.', en: 'Awarded without competition; the source records no exception article.' })
  } else if (c.is_single_bid) {
    out.push({ key: 'single', es: 'Se licitó, pero lo ganó un solo proveedor.', en: 'It was tendered, but a single vendor won.' })
  }
  const gap = dayGap(c.publication_date, c.contract_date)
  if (gap != null && gap >= 0 && gap <= 5) {
    out.push({
      key: 'fast',
      es: `Se firmó ${gap === 0 ? 'el mismo día en que' : gap === 1 ? 'un día después de que' : `${gap} días después de que`} se publicó.`,
      en: `Signed ${gap === 0 ? 'the same day it' : gap === 1 ? 'one day after it' : `${gap} days after it`} was published.`,
    })
  }
  if (gap != null && gap < 0) out.push({ key: 'before', es: `Se firmó ${-gap} días antes de publicarse.`, en: `Signed ${-gap} days before it was published.` })
  const p99 = ctx?.size_vs_p99
  if (p99 != null && p99 >= 2) {
    out.push({ key: 'p99', es: `Vale ${nf(p99, 'es')} veces el contrato grande típico de su sector (p99).`, en: `Worth ${nf(p99, 'en')}× the typical large contract of its sector (p99).` })
  }
  const p = ctx?.pair
  if (p && p.total_contracts > 1 && p.this_rank) {
    const yrs = p.first_year && p.last_year ? ` (${p.first_year}–${p.last_year})` : ''
    out.push({ key: 'pair', es: `Es el ${p.this_rank}.º mayor de ${nf(p.total_contracts, 'es')} contratos entre este proveedor y este comprador${yrs}.`, en: `Rank ${p.this_rank} of ${nf(p.total_contracts, 'en')} contracts between this supplier and this buyer${yrs}.` })
  } else if (p && p.total_contracts === 1) {
    out.push({ key: 'pair', es: 'Es el único contrato entre este proveedor y este comprador.', en: 'The only contract between this supplier and this buyer.' })
  }
  const s = ctx?.vendor_standing
  if (s?.in_ground_truth) out.push({ key: 'gt', es: 'El proveedor figura en casos documentados.', en: 'The supplier appears in documented cases.' })
  if (s?.is_efos_definitivo) out.push({ key: 'efos', es: 'El SAT lo lista como EFOS definitivo.', en: 'Listed by SAT as a definitive EFOS.' })
  if (s?.is_sfp_sanctioned) out.push({ key: 'sfp', es: 'Sanción registrada por la SFP (registro histórico).', en: 'SFP sanction on record (historical registry).' })
  if (c.amount_flag === 'suspect_decimal') {
    out.push({ key: 'decimal', crit: true, es: 'Posible error decimal en la fuente: el monto está en revisión.', en: 'Possible decimal error in the source: the amount is under review.' })
  } else if (c.amount_flag === 'review' || c.amount_mxn > 1e10) {
    out.push({ key: 'review', es: 'Monto en revisión: más de 10,000 MDP.', en: 'Amount under review: above 10B MXN.' })
  }
  if (c.risk_score == null) out.push({ key: 'unscored', es: 'Sin indicador de riesgo aún: el modelo no ha leído este registro.', en: 'No risk indicator yet: the model has not read this record.' })
  return out
}

/** The model's three largest signed pushes on this contract (zero contributions dropped). */
export function topFactors(features: RiskFeatureContribution[] | undefined, k = 3): RiskFeatureContribution[] {
  return (features ?? []).filter((f) => f.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, k)
}

/** In-line (lower-case first letter, so «HHI» keeps its case); the shared map, else the API label. */
export const factorLabel = (f: RiskFeatureContribution, lang: Lang) => {
  const l = modelFeatureLabel(f.feature, lang)
  return l ? l.charAt(0).toLowerCase() + l.slice(1) : (f.label || f.feature).toLowerCase()
}

/** «Los 3 más parecidos»: same sector and procedure (the query), then nearest log-amount, then nearest date. A heuristic, not the model's similarity. */
export function pickNearest<T extends Pick<ContractListItem, 'id' | 'amount_mxn' | 'contract_date'>>(rows: T[], target: { id: number; amount_mxn: number; contract_date?: string | null }, k = 3): T[] {
  const lg = Math.log10(Math.max(1, target.amount_mxn)), t0 = parse(target.contract_date)
  const dist = (r: T) => {
    const da = Math.abs(Math.log10(Math.max(1, r.amount_mxn)) - lg)
    const t = parse(r.contract_date)
    return da + (t0 != null && t != null ? Math.abs(t - t0) / (3650 * DAY) : 0.5)
  }
  return rows.filter((r) => r.id !== target.id && r.amount_mxn > 0).sort((a, b) => dist(a) - dist(b)).slice(0, k)
}
