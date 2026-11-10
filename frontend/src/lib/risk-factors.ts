/**
 * Risk Factor Label Parser
 *
 * Converts raw risk_factors strings from the database into human-readable labels.
 * The risk_factors column stores comma-separated strings like:
 *   "single_bid,split_2,co_bid_med:71%:2p,inst_risk:state_enterprise_energy"
 *
 * This parser handles all parametric patterns from calculate_risk_scores.py
 */

export type FactorCategory =
  | 'competition'
  | 'pricing'
  | 'timing'
  | 'network'
  | 'institutional'
  | 'procedural'
  | 'interaction'

export interface ParsedFactor {
  label: string
  category: FactorCategory
  raw: string
}

const CATEGORY_COLORS: Record<FactorCategory, string> = {
  competition: '#f87171',   // red — single award, concentration
  pricing: '#fbbf24',       // amber — price anomaly, overpricing
  timing: '#8b5cf6',        // violet — year end, short ad, splitting
  network: '#3b82f6',       // blue — network risk, co-bidding
  institutional: '#6366f1', // indigo — institution risk, mismatch
  procedural: '#ec4899',    // pink — direct award, restricted
  interaction: '#94a3b8',   // slate — interaction effects
}

export function getFactorCategoryColor(category: FactorCategory): string {
  return CATEGORY_COLORS[category]
}

// AA text twins (≥ 4.5:1 on the tinted chip over paper) — the vivid hex above
// stays the chip's fill/border; type uses these (PARALLAX D12 § Change 4).
const CATEGORY_TEXT_COLORS: Record<FactorCategory, string> = {
  competition: '#b91c1c',
  pricing: '#92400e',
  timing: '#5b21b6',
  network: '#1e40af',
  institutional: '#3730a3',
  procedural: '#9d174d',
  interaction: '#475569',
}

// Night edition (DESIGN.md §6.7): the day twins read 2.1–3.3:1 on black; light twins ≥ 4.5:1.
if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'night') {
  Object.assign(CATEGORY_TEXT_COLORS, {
    competition: '#f05252', pricing: '#f2b35a', timing: '#a78bfa', network: '#7aa2ff',
    institutional: '#a5b4fc', procedural: '#f472b6', interaction: '#94a3b8',
  })
}

export function getFactorCategoryTextColor(category: FactorCategory): string {
  return CATEGORY_TEXT_COLORS[category]
}

// Readable halves of the four `interaction:A+B` codes the scorer emits.
export const INTERACTION_PART_EN: Record<string, string> = {
  non_open: 'non-open',
  year_end: 'year-end',
  single_bid: 'single award',
  short_ad_period: 'short ad',
  network_risk: 'network',
  threshold_split: 'split',
}
export const INTERACTION_PART_ES: Record<string, string> = {
  non_open: 'no abierto',
  year_end: 'fin de año',
  single_bid: 'un solo adjudicado',
  short_ad_period: 'convocatoria corta',
  network_risk: 'red',
  threshold_split: 'fraccionamiento',
}

/** `data_flag:*` codes are data-quality review flags (amount > 10B MXN),
 *  not risk tags — never a chip, never counted as an objection. */
export function isReviewFlag(raw: string): boolean {
  return raw.startsWith('data_flag:')
}

/** `lang` defaults to 'en' so legacy callers are unchanged; pass the UI
 *  language so Spanish pages never print English chips (archive § G2). */
export function parseFactorLabel(raw: string, lang: 'en' | 'es' = 'en'): ParsedFactor {
  const es = lang === 'es'
  const f = (en: string, esLabel: string, category: FactorCategory): ParsedFactor =>
    ({ label: es ? esLabel : en, category, raw })

  // --- Exact matches first ---
  if (raw === 'single_bid') return f('Single award', 'Un solo adjudicado', 'competition')
  if (raw === 'direct_award') return f('Direct Award', 'Adjudicación directa', 'procedural')
  if (raw === 'restricted_procedure') return f('Restricted Procedure', 'Procedimiento restringido', 'procedural')
  if (raw === 'price_anomaly') return f('Amount Anomaly', 'Anomalía de monto', 'pricing')
  if (raw === 'year_end') return f('Year-End Timing', 'Fin de año', 'timing')
  if (raw === 'industry_mismatch') return f('Industry Mismatch', 'Fuera de su giro', 'institutional')
  if (raw === 'vendor_concentration' || raw === 'concentration')
    return f('Vendor Concentration', 'Concentración de proveedor', 'competition')
  if (raw === 'threshold_split' || raw === 'split') return f('Threshold Splitting', 'Fraccionamiento', 'timing')
  if (raw === 'network_risk' || raw === 'network') return f('Network Risk', 'Red de proveedores', 'network')
  if (raw === 'short_ad' || raw === 'short_ad_period') return f('Short Ad Period', 'Convocatoria corta', 'timing')
  if (raw === 'price_hyp') return f('Amount Outlier', 'Monto atípico', 'pricing')
  if (raw === 'co_bid') return f('Co-Bidding Pattern', 'Coparticipación', 'network')
  if (raw === 'co_bid_high') return f('Co-Bidding Risk (High)', 'Coparticipación (alta)', 'network')
  if (raw === 'co_bid_med') return f('Co-Bidding Risk (Medium)', 'Coparticipación (media)', 'network')
  if (raw === 'inst_risk' || raw.startsWith('inst_risk:'))
    return f('Institution Risk', 'Riesgo institucional', 'institutional')

  // --- Parametric patterns ---

  // network_N → "Network Risk (N members)"
  const networkMatch = raw.match(/^network_(\d+)$/)
  if (networkMatch) {
    const n = networkMatch[1]
    return f(`Network Risk (${n} members)`, `Red de proveedores (${n} miembros)`, 'network')
  }

  // split_N → "Split Contracts (N)"
  const splitMatch = raw.match(/^split_(\d+)$/)
  if (splitMatch) {
    return f(`Split Contracts (${splitMatch[1]})`, `Fraccionamiento (${splitMatch[1]})`, 'timing')
  }

  // short_ad_<Nd → "Short Ad Period (<N days)"
  const shortAdMatch = raw.match(/^short_ad_<(\d+)d$/)
  if (shortAdMatch) {
    return f(`Short Ad (<${shortAdMatch[1]} days)`, `Convocatoria corta (<${shortAdMatch[1]} días)`, 'timing')
  }

  // price_hyp:type:confidence → descriptive label
  const priceHypMatch = raw.match(/^price_hyp:([^:]+)(?::(.+))?$/)
  if (priceHypMatch) {
    const type = priceHypMatch[1]
    if (type === 'extreme_overpricing') return f('Extreme Amount', 'Monto extremo', 'pricing')
    if (type === 'statistical_outlier') return f('Statistical Outlier', 'Valor atípico', 'pricing')
    const words = type.replace(/_/g, ' ')
    return f(words.replace(/\b\w/g, (c) => c.toUpperCase()), `Monto: ${words}`, 'pricing')
  }

  // co_bid_level:pct:Np → "Co-Bidding (Level)" — the legacy % has undocumented
  // semantics (it exceeds 100% on 642,860 tags), so it is never printed.
  const coBidMatch = raw.match(/^co_bid_(high|med|low):\d+%?(?::\d+p)?$/)
  if (coBidMatch) {
    const levelEn: Record<string, string> = { high: 'High', med: 'Medium', low: 'Low' }
    const levelEs: Record<string, string> = { high: 'alta', med: 'media', low: 'baja' }
    const k = coBidMatch[1]
    return f(`Co-Bidding (${levelEn[k]})`, `Coparticipación (${levelEs[k]})`, 'network')
  }

  // vendor_concentration_X → "Vendor Concentration (X)"
  const vcMatch = raw.match(/^vendor_concentration_(.+)$/)
  if (vcMatch) {
    const level = vcMatch[1].charAt(0).toUpperCase() + vcMatch[1].slice(1)
    const levelEs: Record<string, string> = { high: 'alta', medium: 'media', med: 'media', low: 'baja' }
    return f(
      `Vendor Concentration (${level})`,
      `Concentración de proveedor (${levelEs[vcMatch[1].toLowerCase()] ?? vcMatch[1]})`,
      'competition',
    )
  }

  // industry_mismatch:X->sN → "Industry Mismatch"
  if (raw.startsWith('industry_mismatch:')) {
    return f('Industry Mismatch', 'Fuera de su giro', 'institutional')
  }

  // interaction:X+Y → "Interaction: X × Y"
  const interactionMatch = raw.match(/^interaction:(.+)\+(.+)$/)
  if (interactionMatch) {
    const parts = es ? INTERACTION_PART_ES : INTERACTION_PART_EN
    const part = (p: string) => parts[p] ?? p.replace(/_/g, ' ')
    const pair = `${part(interactionMatch[1])} × ${part(interactionMatch[2])}`
    return f(`Interaction: ${pair}`, `Interacción: ${pair}`, 'interaction')
  }

  // data_flag:* — a data-quality review flag (>10B MXN), not a risk tag.
  if (isReviewFlag(raw)) {
    return f('Amount flagged for review', 'Monto marcado para revisión', 'procedural')
  }

  // Fallback: title-case the raw string (codes are English identifiers;
  // Spanish keeps them in sentence case rather than inventing a translation)
  const words = raw.replace(/[_:]/g, ' ')
  return f(words.replace(/\b\w/g, (c) => c.toUpperCase()), words.charAt(0).toUpperCase() + words.slice(1), 'procedural')
}
