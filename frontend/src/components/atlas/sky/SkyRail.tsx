/**
 * SkyRail — «La Manecilla / The Year Rail». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md
 * §3.3 (F12, F17), §2.5 coverage stamps. Precedent: SkySafari's time-flow bar under the sky.
 *
 * A page sibling BELOW the sky host (never an engine child): its arrow keys never reach the engine's pan, and
 * every key it handles stops propagation so the page's Esc → back() never fires from here. Three rows in 44 px:
 * histogram (money per year in scope, linear on the scope's own max) · year ticks · sexenio segments (the five
 * period keys — this row replaces the desktop period chips). Coverage stamps hatch their columns: the global
 * source gap (2004), the thin early years (2000–01), the sky-wide 2019–22 drop, the located star's own silence.
 * Positions never move: the year only lights bodies (the engine's draw pass).
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { N_YEARS, YEAR0, type SkyYearMeta } from '@/lib/atlas/sky/geometry'
import { periodName, type PeriodKey } from '@/lib/atlas/sky/url-state'
import { FONT_MONO } from './SkyLabels'
import { SkyPeriod } from './SkyPeriod'

export const RAIL_PX = 44
const LAST = YEAR0 + N_YEARS - 1
/** CYAN 2026-11-04 (MAPA_WALKTHROUGH §3.1): the rail shows 2002 → LAST; 2000–01 (a handful of stray contracts) stay
 *  in the data and the Colofón count, not on the bar */
const R0 = 2002
const NR = LAST - R0 + 1
const YEARS = Array.from({ length: NR }, (_, k) => R0 + k)
/** sexenio spans on the 2000–LAST axis (outgoing-president years, as period_q) */
const SPANS: [PeriodKey, number, number][] = [['fox', R0, 2006], ['calderon', 2007, 2012], ['pena_nieto', 2013, 2018], ['amlo', 2019, 2024], ['sheinbaum', 2025, LAST]]
/** one name per president everywhere (walkthrough §1.8: never «CSP» here and «Sheinbaum» there) */
const SHORT: Record<PeriodKey, string> = { fox: 'Fox', calderon: 'Calderón', pena_nieto: 'Peña', amlo: 'AMLO', sheinbaum: 'Sheinbaum' }
const periodOf = (y: number) => SPANS.find(([, a, b]) => y >= a && y <= b)?.[0] ?? 'fox'
const HATCH = 'repeating-linear-gradient(135deg, var(--color-border) 0 1px, transparent 1px 4px)'

export interface RailHist {
  /** 26 values, index y − 2000, in the scope's unit (money, or institutions) */
  values: number[]
  /** years of the focused planet at its host (Z2): an ochre underline under those columns */
  under?: number
}

interface Props {
  lang: 'en' | 'es'
  railRef: RefObject<HTMLDivElement | null>
  /** SKY3 meta; null under the SKY2 shim → no years, no histogram (never zeros), segments only */
  meta: SkyYearMeta | null
  year: number | null
  onYear: (y: number | null) => void
  period: PeriodKey | null
  onPeriod: (p: PeriodKey | null) => void
  blink: boolean
  onBlink: (on: boolean) => void
  onBlinkFrame: (p: PeriodKey | null) => void
  bySize: boolean
  onBySize: (on: boolean) => void
  hist: RailHist | null
  /** F1: the located star's coverage — its own gap years and its last year with money */
  star: { first: number; last: number; gaps: number[] } | null
  /** a flight owns the highlight: the rail is disabled until the reader takes the controls */
  disabled: boolean
  /** play skipped a stamped year (shown by the page in the stamp column for one step) */
  onSkip: (y: number | null) => void
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function SkyRail({ lang, railRef, meta, year, onYear, period, onPeriod, blink, onBlink, onBlinkFrame, bySize, onBySize, hist, star, disabled, onSkip }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const [pxYear, setPxYear] = useState(35)
  const [playOn, setPlaying] = useState(false)
  // a flight disables the rail and so stops play (derived, no effect)
  const playing = playOn && !disabled
  const yRef = useRef(year)
  useEffect(() => { yRef.current = year }, [year])
  const gaps = meta?.year_gaps ?? []

  useEffect(() => {
    const el = areaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setPxYear(el.getBoundingClientRect().width / NR))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ▶ 700 ms per year; a global gap year is skipped with its stamp shown; stops at the last year
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      let y = yRef.current == null || yRef.current >= LAST ? 2002 : yRef.current + 1
      let skipped: number | null = null
      while (gaps.includes(y) && y < LAST) { skipped = y; y++ }
      onSkip(skipped)
      onYear(y)
      if (y >= LAST) setPlaying(false)
    }, 700)
    return () => window.clearInterval(t)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const years = !!meta
  const step = (d: number) => onYear(Math.min(LAST, Math.max(R0, (year ?? (d > 0 ? R0 - 1 : LAST + 1)) + d)))
  const stepTerm = (d: number) => {
    const k = year == null ? (d > 0 ? -1 : SPANS.length) : SPANS.findIndex(([p]) => p === periodOf(year))
    const s = SPANS[Math.min(SPANS.length - 1, Math.max(0, k + d))]
    onYear(Math.max(s[1], 2002))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const onButton = (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT'
    const act: Record<string, (() => void) | undefined> = {
      ArrowLeft: years ? () => (e.shiftKey ? stepTerm(-1) : step(-1)) : undefined,
      ArrowRight: years ? () => (e.shiftKey ? stepTerm(1) : step(1)) : undefined,
      Home: years ? () => onYear(2002) : undefined,
      End: years ? () => onYear(LAST) : undefined,
      ' ': years && !onButton && !reduced() ? () => setPlaying((p) => !p) : undefined,
      Escape: () => { setPlaying(false); onSkip(null); onYear(null) },
    }
    const f = act[e.key]
    // the rail owns these keys: never the engine's pan, never the page's Esc → back()
    if (f) { e.preventDefault(); e.stopPropagation(); if (e.key !== ' ') onSkip(null); f() }
  }

  const max = hist ? Math.max(1, ...hist.values) : 1
  const drop = meta?.coverage_drop ?? []
  const inst = meta?.inst_reporting ?? []
  const stampOf = (y: number): string | null => {
    if (!meta) return null
    if (gaps.includes(y)) return skyCopy('gap2004', lang, { y, n: meta.year_contracts[y - YEAR0] })
    if (meta.thin_early.includes(y)) return skyCopy('thinEarly', lang, { n: meta.thin_early.reduce((a, t) => a + meta.year_contracts[t - YEAR0], 0) })
    if (star && star.gaps.includes(y)) return skyCopy('starGap', lang, { y })
    if (star && y > star.last) return skyCopy('starStopped', lang, { y: star.last + 1 })
    if (y === LAST) return skyCopy('partial', lang)
    return null
  }
  const hatched = (y: number) => !!meta && (gaps.includes(y) || meta.thin_early.includes(y) || (!!star && (star.gaps.includes(y) || y > star.last)))
  const dropText = drop.length && meta
    ? skyCopy('coverageDrop', lang, {
      a: drop[0], b: drop[drop.length - 1],
      n: Math.round(drop.reduce((s, y) => s + inst[y - YEAR0], 0) / drop.length).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX'),
      m: (inst[drop[0] - 1 - YEAR0] ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX'), y0: drop[0] - 1,
    })
    : ''
  // Structure B onset: the first year after the early run where reporting institutions grow > 40% (not a recovery)
  const onset = meta ? YEARS.find((y) => y > 2005 && !drop.includes(y - 1) && !gaps.includes(y - 1) && inst[y - 1 - YEAR0] > 0 && inst[y - YEAR0] > 1.4 * inst[y - 1 - YEAR0]) : undefined

  // four digits only when they breathe (≥ 42 px a year); else «02 03 …», never «≤02»
  const lbl = (y: number) => (pxYear >= 42 ? String(y) : String(y).slice(2))
  const showTick = (y: number) => pxYear >= 26 || y % 2 === 0
  const colLeft = (y: number) => `${((y - R0) / NR) * 100}%`
  const colW = `${100 / NR}%`
  const curTerm = year != null ? periodOf(year) : null
  const mono = (size: number, color = 'var(--color-text-muted)'): CSSProperties => ({ fontFamily: FONT_MONO, fontSize: size, color, letterSpacing: '0.04em' })
  const ctl: CSSProperties = { ...mono(12, 'var(--color-text-primary)'), width: 26, height: 22, padding: 0, border: '1px solid var(--color-border)', background: 'var(--color-background)', cursor: disabled ? 'default' : 'pointer' }
  const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <div
      ref={railRef} data-pq-target="years" role="group" tabIndex={0} aria-label={skyCopy('railAria', lang)} aria-disabled={disabled || undefined}
      onKeyDown={onKey} className={`flex items-stretch ${RING}`}
      style={{ height: RAIL_PX, borderTop: '1px solid var(--color-border)', background: 'var(--color-background)', opacity: disabled ? 0.55 : 1 }}
      title={disabled ? skyCopy('railFlight', lang) : undefined}
    >
      <div className="flex flex-col justify-between" style={{ width: 92, flex: '0 0 92px', padding: '3px 6px 2px 0' }}>
        <div className="flex gap-1">
          {years && !reduced() && (
            <button type="button" disabled={disabled} onClick={() => setPlaying((p) => !p)} aria-label={skyCopy(playing ? 'railPause' : 'railPlay', lang)} title={skyCopy(playing ? 'railPause' : 'railPlay', lang)} className={RING} style={ctl}>{playing ? '❚❚' : '▶'}</button>
          )}
          {years && (
            <button type="button" disabled={disabled || year == null} onClick={() => { setPlaying(false); onSkip(null); onYear(null) }} aria-label={skyCopy('railClear', lang)} title={skyCopy('railClear', lang)} className={RING} style={{ ...ctl, color: year == null ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>✕</button>
          )}
        </div>
        <div style={{ ...mono(12), letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {skyCopy('railLabel', lang)} <span style={{ ...mono(12, year != null ? 'var(--color-text-primary)' : 'var(--color-text-muted)'), letterSpacing: 0 }}>{year ?? '—'}</span>
        </div>
      </div>

      <div ref={areaRef} className="relative" style={{ flex: 1, minWidth: 0 }}>
        {years && YEARS.map((y) => {
          const v = hist?.values[y - YEAR0] ?? 0
          const on = year === y
          const tip = [skyCopy('railYear', lang, { y }), stampOf(y)].filter(Boolean).join(' · ')
          return (
            <button
              key={y} type="button" tabIndex={-1} disabled={disabled} aria-pressed={on} aria-label={tip} title={tip}
              onClick={() => { onSkip(null); onYear(on ? null : y) }}
              className="absolute" style={{ left: colLeft(y), width: colW, top: 0, height: 30, padding: 0, border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer' }}
            >
              <span aria-hidden="true" className="absolute" style={{ left: 1, right: 1, top: 1, height: 16, background: hatched(y) ? HATCH : on ? 'var(--color-background-card)' : 'transparent' }} />
              {hist && !hatched(y) && v > 0 && (
                <span aria-hidden="true" className="absolute" style={{ left: 2, right: 2, bottom: 13, height: Math.max(1, Math.round((v / max) * 15)), background: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)', opacity: on ? 1 : 0.55 }} />
              )}
              {hist?.under != null && ((hist.under >>> (y - YEAR0)) & 1) === 1 && (
                <span aria-hidden="true" className="absolute" style={{ left: 2, right: 2, top: 17, height: 2, background: 'var(--color-accent)' }} />
              )}
              {showTick(y) && (
                <span aria-hidden="true" className="absolute" style={{ ...mono(12, on ? 'var(--color-text-primary)' : 'var(--color-text-muted)'), fontWeight: on ? 700 : 400, left: 0, right: 0, top: 19, lineHeight: '13px', textAlign: 'center', textDecoration: y === LAST ? 'underline dotted' : undefined }}>{lbl(y)}</span>
              )}
            </button>
          )
        })}
        {/* the sky-wide coverage drop (2019–22), at every scope */}
        {years && drop.length > 0 && (
          <div
            aria-hidden="true" title={dropText} className="absolute pointer-events-none flex justify-end"
            style={{ left: colLeft(drop[0]), width: `${(drop.length / NR) * 100}%`, top: 0, height: 17, borderTop: '1px dashed var(--color-text-muted)' }}
          >
          </div>
        )}
        {years && onset != null && (
          <span aria-hidden="true" title={skyCopy('onsetB', lang)} className="absolute pointer-events-none" style={{ left: colLeft(onset), top: 0, width: 1, height: 17, background: 'var(--color-text-muted)' }} />
        )}
        <div className="absolute flex" style={{ left: 0, right: 0, bottom: 0, height: 14 }}>
          {SPANS.map(([p, a, b]) => {
            const w = ((b - a + 1) / NR) * 100
            const on = period === p
            const name = periodName(p)
            const fits = (pxYear * (b - a + 1)) >= name.length * 6.2 + 8
            return (
              <button
                key={p} type="button" disabled={disabled} aria-pressed={on} aria-label={skyCopy('railTerm', lang, { name })} title={skyCopy('railTerm', lang, { name })}
                onClick={() => { onSkip(null); onYear(null); onPeriod(on ? null : p) }}
                className={RING}
                style={{
                  ...mono(12, on ? 'var(--color-background)' : curTerm === p ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                  width: `${w}%`, height: 14, padding: 0, lineHeight: '12px', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
                  background: on ? 'var(--color-text-primary)' : curTerm === p ? 'var(--color-background-card)' : 'transparent',
                  border: '1px solid var(--color-border)', marginLeft: p === 'fox' ? 0 : -1,
                }}
              >
                {fits ? name : SHORT[p]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end" style={{ flex: '0 0 auto', minWidth: 120, paddingLeft: 8 }}>
        <SkyPeriod lang={lang} period={period} onPeriod={onPeriod} blink={blink} onBlink={onBlink} onBlinkFrame={onBlinkFrame} bySize={bySize} onBySize={onBySize} controlsOnly />
      </div>
    </div>
  )
}

