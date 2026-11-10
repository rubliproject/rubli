/**
 * ProcurementGradeCard — composite OECD-benchmark grade for an admin.
 *
 * Computes an A–F score from three metrics (direct-award rate, high-risk
 * rate, single-award rate) and renders a tier badge + 3 detail tiles.
 *
 * Extracted from pages/Administrations.tsx (2026-05-11) so AdminDossierPanel
 * can import this as a peer component instead of forward-referencing it
 * inside the same module.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { gradeToTierKey, TIER_STYLES, gradeOutOf10, formatGrade } from '@/lib/tiers'
import { RISK_TEXT_COLORS, PROCEDURE_TYPE_FIRST_YEAR } from '@/lib/constants'
import type { AdminAgg } from './types'

interface ProcurementGradeResult {
  /** null = no grade: direct award / single award unknown (no procedure type before 2011) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  score: number
  details: Array<{ labelKey: string; value: string; grade: string; score: number }>
}

function computeProcurementGrade(agg: AdminAgg): ProcurementGradeResult {
  if (agg.directAwardPct == null || agg.singleBidPct == null) {
    return {
      grade: null,
      score: 0,
      details: [
        { labelKey: 'dossier.fingerprint.directAward', value: '—', grade: '—', score: 0 },
        { labelKey: 'dossier.fingerprint.highRisk', value: `${agg.highRiskPct.toFixed(1)}%`, grade: '—', score: 0 },
        { labelKey: 'dossier.fingerprint.singleBid', value: '—', grade: '—', score: 0 },
      ],
    }
  }
  const daScore = agg.directAwardPct < 30 ? 4 : agg.directAwardPct < 50 ? 3 : agg.directAwardPct < 65 ? 2 : agg.directAwardPct < 80 ? 1 : 0
  const hrScore = agg.highRiskPct < 8 ? 4 : agg.highRiskPct < 12 ? 3 : agg.highRiskPct < 16 ? 2 : agg.highRiskPct < 22 ? 1 : 0
  const sbScore = agg.singleBidPct < 10 ? 4 : agg.singleBidPct < 20 ? 3 : agg.singleBidPct < 30 ? 2 : agg.singleBidPct < 40 ? 1 : 0
  const total = (daScore + hrScore + sbScore) / 12
  const grade: ProcurementGradeResult['grade'] = total >= 0.83 ? 'A' : total >= 0.66 ? 'B' : total >= 0.5 ? 'C' : total >= 0.33 ? 'D' : 'F'
  return {
    grade,
    score: Math.round(total * 100),
    details: [
      { labelKey: 'dossier.fingerprint.directAward', value: `${agg.directAwardPct.toFixed(0)}%`, grade: daScore >= 3 ? 'A' : daScore >= 2 ? 'B' : daScore >= 1 ? 'C' : 'F', score: (daScore / 4) * 100 },
      { labelKey: 'dossier.fingerprint.highRisk',    value: `${agg.highRiskPct.toFixed(1)}%`,    grade: hrScore >= 3 ? 'A' : hrScore >= 2 ? 'B' : hrScore >= 1 ? 'C' : 'F', score: (hrScore / 4) * 100 },
      { labelKey: 'dossier.fingerprint.singleBid',   value: `${agg.singleBidPct.toFixed(1)}%`,   grade: sbScore >= 3 ? 'A' : sbScore >= 2 ? 'B' : sbScore >= 1 ? 'C' : 'F', score: (sbScore / 4) * 100 },
    ],
  }
}

// Bible §3.10: the good-end grades are neutral slate (mirrors TIER_STYLES
// Excelente/Satisfactorio), never green — a procurement model can't certify
// "good". The warm escalation (yellow → orange → red) carries the bad end.
/** Grade letters as TYPE take the AA-safe risk text ramp (PARALLAX D8
 *  § Change 4); (the tile is unboxed since UI v4). */
const GRADE_TEXT_COLORS: Record<string, string> = {
  A: RISK_TEXT_COLORS.low,
  B: RISK_TEXT_COLORS.low,
  C: RISK_TEXT_COLORS.medium,
  D: RISK_TEXT_COLORS.high,
  F: RISK_TEXT_COLORS.critical,
}


interface Props {
  agg: AdminAgg
}

export function ProcurementGradeCard({ agg }: Props) {
  const { t, i18n } = useTranslation('administrations')
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  // Tier labels live in the institutionleague namespace ("Crítico" ES / "Critical" EN)
  const { t: tTier } = useTranslation('institutionleague')
  const result = useMemo(() => computeProcurementGrade(agg), [agg])

  if (result.grade == null) {
    // no grade from missing data: procedure type is coded from 2011 (DQ1 § 2)
    return (
      <div className="mt-3">
        <div className="ct-sc text-[13px] text-text-muted mb-2">
          {t('grade.title', { defaultValue: 'PROCUREMENT GRADE' })}
        </div>
        <div className="text-4xl font-mono font-black leading-none text-text-muted">—</div>
        <div className="text-[12px] text-text-muted mt-2 leading-[1.55] prose-just">
          {lang === 'en'
            ? `No grade: direct award and single award are not recorded before ${PROCEDURE_TYPE_FIRST_YEAR}.`
            : `Sin calificación: la adjudicación directa y el solo adjudicado no se registran antes de ${PROCEDURE_TYPE_FIRST_YEAR}.`}
        </div>
      </div>
    )
  }
  const grade = result.grade

  return (
    <div className="mt-3">
      <div className="ct-sc text-[13px] text-text-muted mb-2">
        {t('grade.title', { defaultValue: 'PROCUREMENT GRADE' })}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-center">
          {(() => {
            const tk = gradeToTierKey(grade)
            const ts = tk ? TIER_STYLES[tk] : null
            return ts ? (
              <span className="inline-flex items-center ct-sc text-[15px]" style={{ color: ts.ink }}>
                <span className="ct-sq" style={{ ['--c' as string]: ts.color }} aria-hidden="true" />
                {tTier(`tiers.${tk}`, tk)}
              </span>
            ) : (
              <div className="text-4xl font-mono font-black leading-none" style={{ color: GRADE_TEXT_COLORS[grade] }}>
                {gradeOutOf10(result.score)}
              </div>
            )
          })()}
          <div className="text-[13px] font-mono text-text-muted mt-1">
            {formatGrade(result.score, lang)}
          </div>
        </div>
      </div>
      {/* The three component grades as label · grade · value rows: a ~230px
          column cannot hold three side-by-side tiles at an 11px floor without
          breaking words (PARALLAX D8 § Change 4). */}
      <dl className="mt-2.5 space-y-1">
        {result.details.map((d) => (
          <div key={d.labelKey} className="flex items-baseline justify-between gap-2 border-t border-border/20 pt-1">
            <dt className="text-[13px] ct-sc font-mono text-text-muted">{t(d.labelKey)}</dt>
            <dd className="whitespace-nowrap font-mono tabular-nums">
              <span className="text-[13px] font-bold" style={{ color: GRADE_TEXT_COLORS[d.grade] ?? RISK_TEXT_COLORS.low }}>
                {gradeOutOf10(d.score)}
              </span>{' '}
              <span className="text-[13px] text-text-muted">{d.value}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="text-[12px] text-text-muted mt-2 leading-[1.55] prose-just">
        {t('grade.procurement', { defaultValue: 'Based on direct award rate, high-risk rate, and single-award rate.' })}
      </div>
    </div>
  )
}

export default ProcurementGradeCard
