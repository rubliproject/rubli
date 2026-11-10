/**
 * RiskGauge — «La cifra» (owner pick 2026-10-21, concept A in _ui_v4/concepts/gauge):
 * the risk indicator is its number + level word, colored by level; nothing drawn. Critical
 * prints its value: since 2026-10-28 the display score is squashed above 0.60 (max 0.95), so no
 * reading saturates at 1.00 (docs/SCORING.md «Display score»).
 * Thresholds are printed once, by `RiskGaugeScale` in the column header (.25 · .40 · .60).
 * Unscored (NULL / pending_score, ComprasMX until a model passes) prints NO_RISK_LABEL.
 * A LOW reading with `thinHistory` (the API's thin_history) prints «Historial insuficiente»
 * with the reason as its tooltip: a low value from a vendor without history means «no data».
 */
import { NO_RISK_LABEL, THIN_HISTORY_LABEL, THIN_HISTORY_NOTE, THIN_HISTORY_NOTE_VENDOR, getRiskLevelOrNone, isThinHistoryLow } from '@/lib/constants'
import { useLang } from './nav'

const WORD = {
  critical: { es: 'Crítico', en: 'Critical' },
  high: { es: 'Alto', en: 'High' },
  medium: { es: 'Medio', en: 'Medium' },
  low: { es: 'Bajo', en: 'Low' },
} as const

export function RiskGauge({ value, tier, modelVersion, thinHistory, vendor }: { value: number | null | undefined; tier?: number | null; modelVersion?: string | null; thinHistory?: boolean | null; vendor?: boolean }) {
  const lang = useLang()
  const level = getRiskLevelOrNone(value, modelVersion)
  if (level === 'none' || value == null) return <div className="ct-gw is-none"><span className="ct-none">{NO_RISK_LABEL[lang]}</span></div>
  const v = Math.max(0, Math.min(1, value))
  if (isThinHistoryLow(value, thinHistory)) {
    const note = (vendor ? THIN_HISTORY_NOTE_VENDOR : THIN_HISTORY_NOTE)[lang]
    return (
      <div className="ct-gw is-thin">
        <div>
          <span className="ct-rv">{v.toFixed(2)}</span>
          <span className="ct-lvl" title={note}>{THIN_HISTORY_LABEL[lang]}</span>
          {tier != null && <span className="ct-tier" title={lang === 'en' ? `ARIA tier ${tier}` : `Nivel ARIA ${tier}`}>T{tier}</span>}
          <span className="sr-only">{`${lang === 'en' ? 'risk indicator' : 'indicador de riesgo'}. ${note}`}</span>
        </div>
      </div>
    )
  }
  return (
    <div className={`ct-gw is-${level}`}>
      <div>
        <span className="ct-rv">{v.toFixed(2)}</span>
        <span className="ct-lvl">{WORD[level][lang]}</span>
        {tier != null && <span className="ct-tier" title={lang === 'en' ? `ARIA tier ${tier}` : `Nivel ARIA ${tier}`}>T{tier}</span>}
        <span className="sr-only">{lang === 'en' ? 'risk indicator' : 'indicador de riesgo'}</span>
      </div>
    </div>
  )
}

export function RiskGaugeScale() {
  const lang = useLang()
  return <div className="ct-hs" aria-hidden="true">{lang === 'en' ? 'thresholds' : 'umbrales'} .25 · .40 · .60</div>
}
