/**
 * SkyPeriod — period + «Parpadeo» blink comparator. Spec .claude/designs/atlas-2026-10-02-spec.md
 * §3.8 (graft G2d from «Uranometría»). Keys are the backend ADMINISTRATION_KEYS verbatim (the
 * URL never says «epn»). Selecting a sexenio dims bodies with no money there (Z0, 8%) and
 * tints its wedge (Z1, 6% ochre); «Parpadeo» alternates the sexenio with its predecessor every
 * 900 ms; «tamaño = dinero en el periodo» re-sizes bodies. Positions never move.
 */
import { useEffect, type CSSProperties } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { PERIOD_KEYS, periodName, type PeriodKey } from '@/lib/atlas/sky/url-state'
import { FONT_MONO } from './SkyLabels'

interface Props {
  lang: 'en' | 'es'
  period: PeriodKey | null
  onPeriod: (p: PeriodKey | null) => void
  blink: boolean
  onBlink: (on: boolean) => void
  /** the sexenio currently shown while blinking */
  onBlinkFrame: (p: PeriodKey | null) => void
  bySize: boolean
  onBySize: (on: boolean) => void
  /** §4 phone: one compact row in the Descenso header — no blink, no re-size (the phone disc has neither) */
  compact?: boolean
  /** instruments §3.3: desktop — the year rail carries the five sexenios; only «Parpadeo» and the size toggle stay */
  controlsOnly?: boolean
}

const btn = (on: boolean): CSSProperties => ({
  fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '0.04em', padding: '3px 7px', cursor: 'pointer',
  color: on ? 'var(--color-background)' : 'var(--color-text-secondary)',
  background: on ? 'var(--color-text-primary)' : 'var(--color-background)',
  border: '1px solid var(--color-border)', marginLeft: -1,
})

export function SkyPeriod({ lang, period, onPeriod, blink, onBlink, onBlinkFrame, bySize, onBySize, compact = false, controlsOnly = false }: Props) {
  const pair: [PeriodKey, PeriodKey] | null = period
    ? [period, PERIOD_KEYS[PERIOD_KEYS.indexOf(period) - 1] ?? PERIOD_KEYS[1]]
    : null
  useEffect(() => {
    if (!blink || !pair) { onBlinkFrame(period); return }
    let n = 0
    onBlinkFrame(pair[0])
    const t = window.setInterval(() => onBlinkFrame(pair[++n % 2]), 900)
    return () => window.clearInterval(t)
  }, [blink, period]) // eslint-disable-line react-hooks/exhaustive-deps

  if (controlsOnly) {
    return pair ? (
      <div className="flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
        <button type="button" aria-pressed={blink} style={btn(blink)} onClick={() => onBlink(!blink)}
          title={`${skyCopy('blink', lang)} · ${periodName(pair[0])} ⇄ ${periodName(pair[1])}`}>{skyCopy('blink', lang)}</button>
        <label className="inline-flex items-center gap-1" title={skyCopy('sizeByPeriod', lang)} style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={bySize} onChange={(e) => onBySize(e.target.checked)} />
          {skyCopy('sizeShort', lang)}
        </label>
      </div>
    ) : null
  }

  return (
    <div role="group" aria-label={skyCopy('period', lang)} className={`flex flex-wrap items-center ${compact ? 'justify-start' : 'justify-end'}`} style={{ pointerEvents: 'auto', rowGap: 4 }}>
      <span style={{ fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)', marginRight: 8 }}>
        {skyCopy('period', lang)}
      </span>
      <button type="button" className="max-sm:min-w-11" aria-pressed={!period} style={btn(!period)} onClick={() => { onBlink(false); onPeriod(null) }}>{skyCopy('allPeriods', lang)}</button>
      {PERIOD_KEYS.map((p) => (
        <button key={p} type="button" className="max-sm:min-w-11" aria-pressed={period === p} style={btn(period === p)} onClick={() => onPeriod(p)}>{periodName(p)}</button>
      ))}
      {pair && !compact && (
        <>
          <button type="button" aria-pressed={blink} style={{ ...btn(blink), marginLeft: 8 }} onClick={() => onBlink(!blink)}>
            {skyCopy('blink', lang)} · {periodName(pair[0])} ⇄ {periodName(pair[1])}
          </button>
          <label className="inline-flex items-center gap-1" style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={bySize} onChange={(e) => onBySize(e.target.checked)} />
            {skyCopy('sizeByPeriod', lang)}
          </label>
        </>
      )}
    </div>
  )
}
