/**
 * FlightPlayer — «El Atlas» flights. Spec .claude/designs/atlas-2026-10-02-spec.md §3.11
 * (graft G5 from «La Bitácora»: the declarative flight model; precedent NYT
 * camera-follows-narrative) and §4 (phone: no autoplay, swipe advances).
 *
 *  - The URL is the only writer of flight position (`vuelo=&n=`); this component
 *    receives `n` and asks for a new one through `onGo`.
 *  - The highlight set is derived in render (`compileWaypoint`), never stored.
 *  - One camera effect, on [flight, n, viewport]; it calls the engine's imperative
 *    `fly` and writes no React state. The engine copies `highlight` into a ref.
 *  - A programmatic `end` does nothing here; only a reader's gesture takes the
 *    controls (the page passes `taken`).
 *  - Every figure comes from the flight-stats registry. No typed fallback.
 *  - Withheld-vendor rule: a chapter's planet is a focal target or a name only if
 *    the host system's `ranked` list (ranking_safe) carries it; otherwise the
 *    camera keeps the star frame and the card names nothing.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import type { HopTarget } from './SkyEngine'
import type { Story, StoryChapter } from '@/lib/atlas-stories'
import { useFlightStat } from '@/lib/atlas/flight-stats'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { formatEntityName } from '@/lib/entity/format'
import type { CompiledWaypoint } from './compileWaypoint'
import { STORIES_LIVE } from '@/lib/constants'

const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'
const DISPLAY = '"Playfair Display", Georgia, serif'
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

/** `${innerWidth}x${innerHeight}`, as a store — the camera effect's viewport key. */
const subscribeResize = (cb: () => void) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) }
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`

export interface FlightPlayerProps {
  flight: Story
  /** 0 … chapters.length (the end card) */
  n: number
  compiled: CompiledWaypoint | null
  lang: 'en' | 'es'
  lv: string | undefined
  cut: string
  /** the engine's imperative camera (desktop) — null on phone */
  apiRef: MutableRefObject<{ fly: (t: HopTarget) => void } | null> | null
  /** desktop autoplay; false on phone and under reduced motion */
  autoplay: boolean
  /** the reader took the controls (a user gesture on the sky) */
  taken: boolean
  onGo: (n: number) => void
  onTake: () => void
  onResume: () => void
  onClose: () => void
  /** the × (leave the tour); defaults to onClose. «Tomar los mandos» stays on onClose (keeps the camera). */
  onExit?: () => void
  onNextFlight: (id: string) => void
  onFlyBody?: (vendor: number) => void
  nextFlight: Story | null
  phone?: boolean
}

export function FlightPlayer(p: FlightPlayerProps) {
  // Destructured once: `p` carries `apiRef`, so the compiler would treat every
  // `p.x` read in render as a ref read.
  const { flight, n, compiled, lang, phone, apiRef, autoplay, taken, cut, nextFlight, onFlyBody } = p
  const { onGo: go, onTake, onResume, onClose, onNextFlight } = p
  const N = flight.chapters.length
  const ch: StoryChapter | undefined = flight.chapters[n]
  const vk = useSyncExternalStore(subscribeResize, viewportKey, viewportKey)
  const [paused, setPaused] = useState(false)
  const stat = useFlightStat(ch?.stat, lang, p.lv)

  // ── the one camera effect: [flight, n, viewport] → engine.fly (imperative, no React state) ──
  // The target is read from this render's compiled waypoint (derived in render);
  // a later `compiled` (bodies/system arriving) must not re-fly, so it is not a dep.
  const target = compiled?.target
  useEffect(() => {
    if (!ch || !target) return
    apiRef?.current?.fly(target)
  }, [flight.id, n, vk]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── dwell: advance by writing n+1 to the URL; no effect writes its own dependency ──
  useEffect(() => {
    if (!ch || !autoplay || taken || paused) return
    const t = window.setTimeout(() => go(n + 1), ch.dwellMs)
    return () => window.clearTimeout(t)
  }, [flight.id, n, autoplay, taken, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── phone: swipe advances (horizontal only; vertical still scrolls the page) ──
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onUp = (e: PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) go(Math.max(0, Math.min(N, n + (dx < 0 ? 1 : -1))))
  }

  const btn: CSSProperties = {
    fontFamily: MONO, fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-background-card)',
    border: '1px solid var(--color-border)', padding: '0 10px', minHeight: phone ? 44 : 30, minWidth: phone ? 44 : 30, cursor: 'pointer',
  }
  const eyebrow: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)' }
  const fill = (s: string, vars: Record<string, string>) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(v), s)
  const statText = stat?.state === 'ok' ? stat.value! : skyCopy('dash', lang)
  const body = ch ? fill(lang === 'en' ? ch.body.en : ch.body.es, { stat: statText }) : ''

  const dots = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={skyCopy('chapterOf', lang, { i: Math.min(n + 1, N), n: N })}>
      {flight.chapters.map((c, i) => (
        <button
          key={c.id}
          type="button"
          aria-label={skyCopy('goCh', lang, { i: i + 1 })}
          aria-current={i === n ? 'step' : undefined}
          onClick={() => go(i)}
          className={`rounded-full ${RING}`}
          style={{ width: phone ? 28 : 16, height: phone ? 28 : 16, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: i < n ? 'var(--color-text-muted)' : 'transparent', border: `1.5px solid ${i === n ? 'var(--color-accent)' : 'var(--color-text-muted)'}` }} />
        </button>
      ))}
    </div>
  )

  return (
    <section
      aria-live="polite"
      aria-label={lang === 'en' ? flight.title.en : flight.title.es}
      onPointerDown={phone ? onDown : undefined}
      onPointerUp={phone ? onUp : undefined}
      className="flex flex-col"
      style={{ gap: 10, padding: phone ? '14px 16px 18px' : '14px 18px 16px', borderLeft: `3px solid ${flight.accent}`, background: 'var(--color-background)', touchAction: 'pan-y', minHeight: phone ? undefined : '100%', overflowY: phone ? undefined : 'auto' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ ...eyebrow, color: 'var(--color-text-muted)' }}>{skyCopy('flights', lang)} · {lang === 'en' ? flight.title.en : flight.title.es}</span>
        <button type="button" aria-label={skyCopy('closeFlight', lang)} onClick={p.onExit ?? onClose} className={RING} style={{ ...btn, border: 'none', background: 'transparent', minWidth: phone ? 44 : 24, padding: 0, fontSize: 16 }}>×</button>
      </div>
      {dots}

      {ch ? (
        <>
          <div style={{ ...eyebrow, color: 'var(--color-accent)', fontWeight: 600 }}>
            {ROMAN[n] ?? n + 1} · {lang === 'en' ? ch.yearLabel.en : ch.yearLabel.es}
          </div>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 500, fontSize: phone ? 24 : 26, lineHeight: 1.15, margin: 0, color: 'var(--color-text-primary)' }}>
            {lang === 'en' ? ch.title.en : ch.title.es}
          </h2>
          <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.5, margin: 0, color: 'var(--color-text-secondary)' }}>{body}</p>
          {ch.stat && stat && (
            <div>
              {stat.state === 'ok' ? (
                <>
                  {/* formatDualCurrency's «MXN · ≈US$» tail drops to its own line so the anchor never overflows 380 px */}
                  <div style={{ fontFamily: DISPLAY, fontStyle: 'normal', fontWeight: 800, fontSize: 40, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: flight.accent }}>
                    {stat.value!.split(' · ')[0]}
                  </div>
                  {stat.value!.includes(' · ') && (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-primary)', marginTop: 2 }}>{stat.value!.split(' · ').slice(1).join(' · ')}</div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {fill(lang === 'en' ? ch.stat.caption.en : ch.stat.caption.es, stat.vars)}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>
                    {skyCopy('live', lang, { path: stat.source, cut: cut })}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
                  {skyCopy(stat.state === 'loading' ? 'statLoading' : 'statMissing', lang, { path: stat.source })}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 2 }}>
            {!phone && autoplay && !taken && (
              <button type="button" onClick={() => setPaused((x) => !x)} aria-label={skyCopy(paused ? 'play' : 'pause', lang)} className={RING} style={btn}>{paused ? '▶' : '❚❚'}</button>
            )}
            <button type="button" onClick={() => go(Math.max(0, n - 1))} disabled={n === 0} aria-label={skyCopy('prevCh', lang)} className={RING} style={{ ...btn, opacity: n === 0 ? 0.5 : 1 }}>◀</button>
            <button type="button" onClick={() => go(n + 1)} aria-label={skyCopy('nextCh', lang)} className={RING} style={btn}>▶</button>
            {!phone && (
              <button type="button" onClick={taken ? onResume : onTake} className={RING} style={{ ...btn, color: 'var(--color-accent)' }}>
                {skyCopy(taken ? 'resume' : 'take', lang)}
              </button>
            )}
          </div>
          {phone && <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)' }}>{skyCopy('swipe', lang)}</div>}
          {compiled && compiled.focus.length > 0 && (
            <div>
              <div style={{ ...eyebrow, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{skyCopy('inChapter', lang)}</div>
              <ul className="flex flex-col gap-1" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {compiled.focus.map((f) => (
                  <li key={f.vendor_id}>
                    <button
                      type="button"
                      onClick={onFlyBody ? () => onFlyBody!(f.vendor_id) : undefined}
                      className={RING}
                      style={{ fontFamily: SERIF, fontSize: 14, textAlign: 'left', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', padding: phone ? '8px 0' : 0, cursor: 'pointer' }}
                    >
                      {formatEntityName('vendor', f.name, 'full')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...eyebrow, color: 'var(--color-accent)', fontWeight: 600 }}>{skyCopy('endKicker', lang)}</div>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 500, fontSize: 26, lineHeight: 1.15, margin: 0 }}>
            {lang === 'en' ? flight.closing.headline.en : flight.closing.headline.es}
          </h2>
          <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.5, margin: 0, color: 'var(--color-text-secondary)' }}>
            {lang === 'en' ? flight.closing.body.en : flight.closing.body.es}
          </p>
          <div className="flex flex-col items-start gap-2">
            <button type="button" onClick={onClose} className={RING} style={{ ...btn, color: 'var(--color-accent)' }}>{skyCopy('take', lang)}</button>
            {nextFlight && (
              <button type="button" onClick={() => onNextFlight(nextFlight!.id)} className={RING} style={{ ...btn, textAlign: 'left' }}>
                {skyCopy('nextFlight', lang, { title: lang === 'en' ? nextFlight.title.en : nextFlight.title.es })}
              </button>
            )}
            {STORIES_LIVE && flight.longformSlug && (
              <Link to={`/stories/${flight.longformSlug}`} className={RING} style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                {skyCopy('readLong', lang)}
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  )
}
