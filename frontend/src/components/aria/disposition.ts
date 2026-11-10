/**
 * Disposition bucketing for the ARIA queue — "la máquina propone, el analista
 * dispone." The DB carries 15 raw review_status values (4 canonical UI states
 * + 11 CENTINELA script-written states); the UI reads them through 6 buckets.
 *
 * Verified against RUBLI_NORMALIZED 2026-06-12: T1 = confirmed 164 ·
 * needs_review 83 · confirmed_corrupt 41 · reviewed 6 · false_positive 3 ·
 * skipped 2 — and ZERO 'pending'. Any "start here" mechanic must key on
 * needs_review, never pending (audit finding F1, designus aria-fila run).
 */

import { RISK_INK_ON_PLATE, RISK_TEXT_COLORS } from '@/lib/constants'

export type DispositionBucket =
  | 'pendiente'      // pending / null — untouched
  | 'por_revisar'    // needs_review (CENTINELA asks for human eyes) + reviewing
  | 'confirmada'     // confirmed + confirmed_corrupt
  | 'descartada'     // dismissed + false_positive + fp_excluded
  | 'revisada'       // reviewed — also what the API sends for an undocumented 'confirmed' (public_labels)
  | 'pipeline'       // reviewed / skipped / other script states

export function bucketStatus(raw: string | null | undefined): DispositionBucket {
  switch (raw ?? 'pending') {
    case 'pending':
    case '':
      return 'pendiente'
    case 'needs_review':
    case 'reviewing':
      return 'por_revisar'
    case 'confirmed':
    case 'confirmed_corrupt':
      return 'confirmada'
    case 'dismissed':
    case 'false_positive':
    case 'fp_excluded':
      return 'descartada'
    case 'reviewed':
      return 'revisada'
    default:
      return 'pipeline'
  }
}

export const DISPOSITION_META: Record<
  DispositionBucket,
  { es: string; en: string; color: string; railColor: string }
> = {
  pendiente: {
    es: 'Pendiente',
    en: 'Pending',
    color: 'var(--color-text-muted)',
    railColor: 'transparent',
  },
  por_revisar: {
    es: 'Por revisar',
    en: 'To review',
    // Type takes the AA ink twin; the rail the amber mark (DESIGN.md §6.2 tokens, no hex).
    color: RISK_INK_ON_PLATE.high,
    railColor: 'var(--color-risk-high)',
  },
  confirmada: {
    es: 'Confirmada',
    en: 'Confirmed',
    color: RISK_TEXT_COLORS.critical,
    railColor: 'var(--color-risk-critical)',
  },
  descartada: {
    es: 'Descartada',
    en: 'Dismissed',
    color: 'var(--color-text-muted)',
    railColor: 'var(--color-border)',
  },
  revisada: {
    es: 'Revisada',
    en: 'Reviewed',
    color: 'var(--color-text-muted)',
    railColor: 'var(--color-border)',
  },
  pipeline: {
    // Script-written states (skipped & co.) — Spanish label, not the raw word (spec G6).
    es: 'Automática',
    en: 'Automated',
    color: 'var(--color-text-muted)',
    railColor: 'transparent',
  },
}

/** Sum raw status counts (e.g. stats.t1_status_counts) into buckets. */
export function bucketCounts(raw: Record<string, number> | null | undefined) {
  const out: Record<DispositionBucket, number> = {
    pendiente: 0,
    por_revisar: 0,
    confirmada: 0,
    descartada: 0,
    revisada: 0,
    pipeline: 0,
  }
  if (!raw) return out
  for (const [status, n] of Object.entries(raw)) {
    out[bucketStatus(status)] += n
  }
  return out
}

/**
 * A stored date as a calendar date in the page language — "3 May 2026" /
 * "3 may 2026" (PARALLAX D14 § 3). ISO strings read their own Y-M-D in UTC so
 * no viewer timezone shifts the day; RFC/HTTP dates ("Mon, 25 Jan 2021
 * 08:00:00 GMT", from Centinela sources) are parsed too (spec G6 — they used
 * to pass through raw). Unparseable input renders nothing.
 */
export function formatAriaDate(iso: string | null | undefined, isEs: boolean): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.parse(String(iso))
  if (Number.isNaN(t)) return null
  return new Intl.DateTimeFormat(isEs ? 'es-MX' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t))
}

/** Centinela web-evidence verdicts in the page language (spec G6: raw enums leaked). */
export const VERDICT_LABEL: Record<string, { es: string; en: string }> = {
  SANCTION: { es: 'sanción', en: 'sanction' },
  CORRUPTION_MENTION: { es: 'mención de corrupción', en: 'corruption mention' },
  JOURNALISM: { es: 'prensa', en: 'press' },
  SHELL_SIGNAL: { es: 'señal de empresa fachada', en: 'shell-company signal' },
  NEGATIVE: { es: 'sin hallazgo', en: 'no finding' },
}

/** Mills notation for IPS: 0.87367 → "·874". Restores the spread the ×100 rounding destroyed. */
export function ipsMills(ips: number | null | undefined): string {
  if (ips == null) return '·—'
  return '·' + String(Math.round(ips * 1000)).padStart(3, '0')
}

/**
 * APORTE — the IPS as its additive parts (aria_pipeline.py compute_ips):
 * IPS = 0.40·max(risk, mahalanobis) + 0.20·earlier model + 0.20·external + 0.20·scale − fp_penalty.
 * Honest names (FLAG_METHODOLOGY_REVIEW_2026-10-28 § 3 A1): slot A is not an anomaly measure but
 * an earlier model's sector-averaged risk score (vendor_shap_v52, Mar–May 2026); slot $ is
 * log10(total value)/30, which tops out near 0.37. R names whichever of risk / Mahalanobis counted.
 */
export type AporteKey = 'R' | 'A' | 'X' | '$'
export interface AporteSlot {
  key: AporteKey; weight: number; value: number; contrib: number
  /** label + Spanish article («el», «la», «los») for the computed sentence */
  es: string; en: string; art: string
  /** R only: which input won the max */
  src?: 'risk' | 'maha'
}

/** The practical ceiling of the money-scale slot: log10(1e11 MXN)/30 ≈ 0.37. */
export const SCALE_CEILING = 0.37

export function aporte(item: {
  risk_score_norm?: number | null
  mahalanobis_norm?: number | null
  ensemble_norm?: number | null
  external_flags_score?: number | null
  financial_scale_norm?: number | null
}): AporteSlot[] {
  const clamp = (v: number | null | undefined) => Math.max(0, Math.min(1, v ?? 0))
  const risk = clamp(item.risk_score_norm)
  const maha = clamp(item.mahalanobis_norm)
  const byMaha = maha > risk
  const slots: Array<Omit<AporteSlot, 'contrib'>> = [
    byMaha
      ? { key: 'R', weight: 0.4, value: maha, es: 'contrato más inusual', en: 'most unusual contract', art: 'el', src: 'maha' }
      : { key: 'R', weight: 0.4, value: risk, es: 'indicador de riesgo', en: 'risk indicator', art: 'el', src: 'risk' },
    { key: 'A', weight: 0.2, value: clamp(item.ensemble_norm), es: 'modelo anterior', en: 'earlier model', art: 'el' },
    // external_flags_score is 1.0 for any vendor linked to the case set (documented or not)
    { key: 'X', weight: 0.2, value: clamp(item.external_flags_score), es: 'registros externos', en: 'external records', art: 'los' },
    { key: '$', weight: 0.2, value: clamp(item.financial_scale_norm), es: 'escala del dinero', en: 'money scale', art: 'la' },
  ]
  return slots.map((s) => ({ ...s, contrib: s.weight * s.value }))
}

/**
 * The Mahalanobis input when the row lacks it (the queue list does not send it; only the detail
 * call does): IPS_raw = 0.40·R + 0.20·(A + X + $), so R = (raw − rest)/0.40. When that R sits
 * above the risk input, R came from Mahalanobis and equals it; otherwise Mahalanobis did not
 * count and its value stays unknown (null).
 */
export function inferMaha(item: {
  mahalanobis_norm?: number | null; ips_raw?: number | null; risk_score_norm?: number | null
  ensemble_norm?: number | null; external_flags_score?: number | null; financial_scale_norm?: number | null
}): { value: number | null; inferred: boolean } {
  if (item.mahalanobis_norm != null) return { value: item.mahalanobis_norm, inferred: false }
  if (item.ips_raw == null) return { value: null, inferred: false }
  const c = (v: number | null | undefined) => Math.max(0, Math.min(1, v ?? 0))
  const r = (item.ips_raw - 0.2 * (c(item.ensemble_norm) + c(item.external_flags_score) + c(item.financial_scale_norm))) / 0.4
  return r > c(item.risk_score_norm) + 0.0125 ? { value: c(r), inferred: true } : { value: null, inferred: false }
}

const AT_TOP = 0.995

/**
 * One computed sentence naming what sets the rank: the components at their ceiling, and the one
 * with the largest weighted gap to it. The money scale never reaches 1 (ceiling ≈ 0.37), so it is
 * never named as «the gap» — it would be, for practically every vendor (review § 0.3).
 */
export function aporteSentence(slots: AporteSlot[], isEs: boolean): string {
  const name = (s: AporteSlot) => (isEs ? s.es : s.en)
  const list = (xs: string[]) =>
    xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${isEs ? 'y' : 'and'} ${xs[xs.length - 1]}`
  const core = slots.filter((s) => s.key !== '$')
  const top = core.filter((s) => s.value >= AT_TOP)
  const rest = core.filter((s) => s.value < AT_TOP)
  const scale = slots.find((s) => s.key === '$')
  const tail = scale
    ? (isEs ? ` La escala del dinero suma ${scale.contrib.toFixed(2)} (no pasa de 0.07).` : ` The money scale adds ${scale.contrib.toFixed(2)} (never more than 0.07).`)
    : ''
  if (rest.length === 0) {
    return (isEs ? 'Los otros tres componentes al tope.' : 'The other three components at their ceiling.') + tail
  }
  const gap = rest.reduce((a, b) => (b.weight * (1 - b.value) > a.weight * (1 - a.value) ? b : a))
  const lead = top.length
    ? `${list(top.map(name))} ${isEs ? 'al tope' : (top.length === 1 ? 'at its ceiling' : 'at their ceiling')}; `
    : isEs ? 'Ningún componente al tope; ' : 'No component at its ceiling; '
  const sep = isEs
    ? `lo ${gap.art === 'los' ? 'separan' : 'separa'} ${gap.art} ${name(gap)} (${gap.value.toFixed(2)})`
    : `${name(gap)} ${gap.key === 'X' ? 'set' : 'sets'} it apart (${gap.value.toFixed(2)})`
  const s = lead + sep + '.'
  return s.charAt(0).toUpperCase() + s.slice(1) + tail
}

/**
 * Corroboration ticks from the same evidence the expand shows (spec G4: rows
 * with a SANCTION web verdict printed an empty S while the expand showed the
 * sanction). S = SFP registry OR a sanction found by Centinela; W = press.
 */
export function corroboration(item: {
  is_efos_definitivo?: boolean | null
  is_sfp_sanctioned?: boolean | null
  web_evidence_verdict?: string | null
}) {
  const v = item.web_evidence_verdict
  return {
    e: !!item.is_efos_definitivo,
    s: !!item.is_sfp_sanctioned || v === 'SANCTION',
    w: v === 'CORRUPTION_MENTION' || v === 'JOURNALISM',
  }
}
