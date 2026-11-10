/**
 * Entity verdict — 4-bucket classification per entity type.
 *
 * Per docs/VENDOR_DOSSIER_SCHEME.md § 8: every dossier ends with an
 * honest classification that distinguishes structural-but-legitimate
 * concentration (BAXTER, FRESENIUS) from documented capture (GRUFESA)
 * from ghost companies. This is the false-positive guard the audit
 * found missing across the platform.
 */
import type { EntityType } from './format'
import type { LedeContext } from './lede'
import { getRiskLevelFromScore } from '@/lib/constants'

export type VerdictBucket =
  | 'critical'      // Documented case · critical indicator
  | 'high'          // Single-buyer dependence
  | 'medium'        // Structural monopoly
  | 'neutral'       // No documented case — elevated or low indicator

export interface Verdict {
  bucket: VerdictBucket
  label_es: string
  label_en: string
  rationale_es: string
  rationale_en: string
}

interface VendorVerdictInput extends LedeContext {
  is_false_positive?: boolean | number
  fp_reason?: string
  in_ground_truth?: boolean | number
  /** The top buyer's share of the vendor's VALUE (0–1) — printed "of total
   *  value"; aria.top_institution_ratio is a contract-count share. */
  top_institution_pct?: number
  ghost_companion_score?: number
  /** Most of its contracts were scored with < 3 prior contracts (API thin_history) */
  thin_history?: boolean | null
}

export function getVerdictForVendor(ctx: VendorVerdictInput): Verdict {
  const isFP = ctx.is_false_positive === true || ctx.is_false_positive === 1
  const inGT = ctx.in_ground_truth === true || ctx.in_ground_truth === 1
  const topPct = ctx.top_institution_pct ?? 0
  const ghost = ctx.ghost_companion_score ?? 0
  const risk = ctx.avg_risk_score ?? 0

  // Bucket 1: structural FP override (BAXTER/FRESENIUS/INFRA/PRAXAIR)
  if (isFP) {
    return {
      bucket: 'medium',
      label_es: 'Monopolio estructural',
      label_en: 'Structural monopoly',
      rationale_es:
        'Proveedor multinacional o estructural. La concentración refleja la posición del mercado, no evidencia de fraude. ' +
        (ctx.fp_reason ? `Motivo: ${ctx.fp_reason}.` : ''),
      rationale_en:
        'Multinational or structural vendor. Concentration reflects market position, not fraud evidence. ' +
        (ctx.fp_reason ? `Reason: ${ctx.fp_reason}.` : ''),
    }
  }

  // Bucket 2: GT case + high institution capture → likely fraud
  if (inGT && (risk >= 0.6 || ghost >= 0.6)) {
    return {
      bucket: 'critical',
      label_es: 'Caso documentado · indicador crítico',
      label_en: 'Documented case · critical indicator',
      rationale_es:
        'Proveedor en caso documentado de corrupción con indicador de riesgo crítico. ' +
        (ctx.case_name ? `Caso: ${ctx.case_name}. ` : '') +
        'Investigación recomendada.',
      rationale_en:
        'Vendor in documented corruption case with critical risk indicator. ' +
        (ctx.case_name ? `Case: ${ctx.case_name}. ` : '') +
        'Investigation recommended.',
    }
  }

  // Bucket 3: high institution capture but no GT case
  if (topPct >= 0.40 && (risk >= 0.4 || inGT)) {
    return {
      bucket: 'high',
      label_es: 'Dependencia de un solo comprador',
      label_en: 'Single-buyer dependence',
      rationale_es:
        'Proveedor que depende de una sola institución (' +
        `${(topPct > 1.5 ? topPct : topPct * 100).toFixed(0)}% de su valor total). ` +
        'Patrón consistente con captura institucional o regulatoria.',
      rationale_en:
        'Vendor depends on one institution (' +
        `${(topPct > 1.5 ? topPct : topPct * 100).toFixed(0)}% of total value). ` +
        'Pattern consistent with institutional or regulatory capture.',
    }
  }

  // Not scored yet (ComprasMX loads unscored): say so — never «indicador bajo».
  if (ctx.avg_risk_score == null) {
    return {
      bucket: 'neutral',
      label_es: 'Sin indicador de riesgo aún',
      label_en: 'No risk indicator yet',
      rationale_es:
        'Sus contratos entraron sin puntuar hasta que un modelo pase la validación; ' +
        'las señales estructurales (adjudicación directa, un solo adjudicado) siguen a la vista.',
      rationale_en:
        'Its contracts were loaded unscored until a model passes validation; ' +
        'structural signals (direct award, single award) still show.',
    }
  }

  // Bucket 4: no documented case — gated on the score (PARALLAX D13b § 5): a
  // 9/100 vendor was told it had an "elevated risk indicator".
  const level = getRiskLevelFromScore(risk)
  if (level === 'critical' || level === 'high') {
    return {
      bucket: 'neutral',
      label_es: 'Indicador elevado · sin caso documentado',
      label_en: 'Elevated indicator · no documented case',
      rationale_es:
        'El indicador de riesgo es alto o crítico y ningún caso documentado nombra a este proveedor: ' +
        'una pista para revisar, no un hallazgo.',
      rationale_en:
        'The risk indicator is high or critical and no documented case names this vendor: ' +
        'a lead for review, not a finding.',
    }
  }
  // A low average from a vendor without history means «no data», not «low» (house fix F3):
  // point to the signals that do not need history.
  if (ctx.thin_history && level === 'low') {
    return {
      bucket: 'neutral',
      label_es: 'Historial insuficiente · sin caso documentado',
      label_en: 'Insufficient history · no documented case',
      rationale_es:
        'La mayoría de sus contratos se calificó cuando tenía menos de 3 contratos previos, y con tan poco historial ' +
        'el indicador casi no puede subir. Para un proveedor nuevo pesan más las señales que no dependen del modelo: ' +
        'el riesgo de proveedor nuevo de ARIA, las listas del SAT (EFOS) y de la SFP, y las ráfagas de contratos.',
      rationale_en:
        'Most of its contracts were scored when it had fewer than 3 prior contracts, and with so little history ' +
        'the indicator can barely rise. For a new vendor the signals that do not depend on the model weigh more: ' +
        "ARIA's new-vendor risk, the SAT (EFOS) and SFP lists, and contract bursts.",
    }
  }
  return {
    bucket: 'neutral',
    label_es: 'Sin caso documentado · indicador bajo',
    label_en: 'No documented case · low indicator',
    rationale_es:
      'El modelo no destaca a este proveedor: su indicador de riesgo está por debajo del umbral alto ' +
      'y ningún caso documentado lo nombra.',
    rationale_en:
      'The model does not single this vendor out: its risk indicator is below the high threshold ' +
      'and no documented case names it.',
  }
}

interface CategoryVerdictInput extends LedeContext {
  hhi?: number
  unique_vendors?: number
  direct_award_pct?: number
  avg_risk_score?: number
}

export function getVerdictForCategory(ctx: CategoryVerdictInput): Verdict {
  const hhi = ctx.hhi ?? 0
  const da = ctx.direct_award_pct ?? 0
  const daPct = da > 1.5 ? da : da * 100
  const risk = ctx.avg_risk_score ?? 0

  // Bucket 1: high HHI + high DA + high risk = capturado
  if (hhi >= 0.25 && daPct >= 70 && risk >= 0.4) {
    return {
      bucket: 'critical',
      label_es: 'Mercado capturado',
      label_en: 'Captured market',
      rationale_es:
        `Concentración HHI ${hhi.toFixed(2)}, ${daPct.toFixed(0)}% adjudicación directa, ` +
        `riesgo promedio ${risk.toFixed(2)}. Pocos vendors dominantes, baja competencia.`,
      rationale_en:
        `HHI concentration ${hhi.toFixed(2)}, ${daPct.toFixed(0)}% direct-award, ` +
        `avg risk ${risk.toFixed(2)}. Few dominant vendors, low competition.`,
    }
  }

  // Bucket 2a: oligopólico — only when the market IS concentrated (HHI). A competitive
  // market with heavy direct award is a different finding (2b), not an oligopoly.
  if (hhi >= 0.15) {
    return {
      bucket: 'high',
      label_es: 'Mercado oligopólico',
      label_en: 'Oligopolistic market',
      rationale_es:
        `Mercado dominado por pocos proveedores (HHI ${hhi.toFixed(2)}). Patrón que requiere monitoreo continuo.`,
      rationale_en:
        `Market dominated by few vendors (HHI ${hhi.toFixed(2)}). Pattern requires ongoing monitoring.`,
    }
  }
  // Bucket 2b: adjudicación directa dominante con riesgo elevado, en un mercado no concentrado
  if (daPct >= 60 && risk >= 0.3) {
    return {
      bucket: 'high',
      label_es: 'Adjudicación directa dominante',
      label_en: 'Direct award dominant',
      rationale_es:
        `${daPct.toFixed(0)}% de los contratos sin licitación con indicador promedio ${risk.toFixed(2)}, en un mercado con muchos proveedores (HHI ${hhi.toFixed(2)}). Es un indicador, no un hallazgo.`,
      rationale_en:
        `${daPct.toFixed(0)}% of contracts awarded without a tender at an average indicator of ${risk.toFixed(2)}, in a market with many vendors (HHI ${hhi.toFixed(2)}). An indicator, not a finding.`,
    }
  }

  // Bucket 3: estructural — high spend but expected concentration
  if (hhi >= 0.08) {
    return {
      bucket: 'medium',
      label_es: 'Concentración estructural',
      label_en: 'Structural concentration',
      rationale_es:
        'Concentración esperada por la naturaleza del mercado (especialización técnica, regulación).',
      rationale_en:
        'Expected concentration given market nature (technical specialization, regulation).',
    }
  }

  // Bucket 4: competitivo
  return {
    bucket: 'neutral',
    label_es: 'Mercado competitivo',
    label_en: 'Competitive market',
    rationale_es:
      `Múltiples proveedores activos (${ctx.unique_vendors ?? '—'}), HHI ${hhi.toFixed(2)}.`,
    rationale_en:
      `Multiple active vendors (${ctx.unique_vendors ?? '—'}), HHI ${hhi.toFixed(2)}.`,
  }
}

interface InstitutionVerdictInput extends LedeContext {
  governance_grade?: string
  hhi?: number
  avg_risk_score?: number
}

export function getVerdictForInstitution(ctx: InstitutionVerdictInput): Verdict {
  const grade = ctx.governance_grade?.toLowerCase() ?? ''
  const risk = ctx.avg_risk_score ?? 0

  if (grade === 'critico' || grade === 'critical' || risk >= 0.5) {
    return {
      bucket: 'critical',
      label_es: 'Gobernanza en escándalo',
      label_en: 'Scandal-tier governance',
      rationale_es: 'Indicadores de capture institucional severo o casos documentados.',
      rationale_en: 'Indicators of severe institutional capture or documented cases.',
    }
  }
  if (grade === 'deficiente' || grade === 'poor' || risk >= 0.35) {
    return {
      bucket: 'high',
      label_es: 'Gobernanza asediada',
      label_en: 'Besieged governance',
      rationale_es: 'Múltiples señales de riesgo concentradas en pocos proveedores.',
      rationale_en: 'Multiple risk signals concentrated in few vendors.',
    }
  }
  if (grade === 'regular' || risk >= 0.25) {
    return {
      bucket: 'medium',
      label_es: 'Gobernanza vigilada',
      label_en: 'Monitored governance',
      rationale_es: 'Indicadores moderados, requiere monitoreo continuo.',
      rationale_en: 'Moderate indicators, requires ongoing monitoring.',
    }
  }
  return {
    bucket: 'neutral',
    label_es: 'Gobernanza saludable',
    label_en: 'Healthy governance',
    rationale_es: 'Indicadores dentro del rango esperado.',
    rationale_en: 'Indicators within expected range.',
  }
}

/** Universal entry point. Routes to the type-specific verdict. */
export function getVerdictFor(type: EntityType, ctx: LedeContext): Verdict | null {
  switch (type) {
    case 'vendor': return getVerdictForVendor(ctx as VendorVerdictInput)
    case 'category': return getVerdictForCategory(ctx as CategoryVerdictInput)
    case 'institution': return getVerdictForInstitution(ctx as InstitutionVerdictInput)
    default: return null
  }
}
