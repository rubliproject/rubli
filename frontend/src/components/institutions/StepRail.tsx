/**
 * StepRail — «Paso n de 5» with ▶ Recorrer («Por pesos» spec §3).
 *
 * Autoplay is off on load. ▶ plays the walk ONCE (never loops; uipro
 * «Continuous Animation»), DWELL_MS per step, and stops on the last step.
 * It pauses on any interaction (the parent bumps `pauseSignal`), when the tab
 * is hidden, or when the field scrolls out of view (IntersectionObserver).
 * The active segment's fill is a Web Animation, paused/cancelled with the
 * walk — no per-frame JS. Reduced motion: no autoplay control at all
 * (WCAG 2.2.2 is then moot; steps stay buttons).
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

export const DWELL_MS = 9000

export function StepRail({
  titles, index, onGo, lang, reduced, watchRef, pauseSignal, onPlayingChange,
}: {
  titles: [es: string, en: string][]
  index: number
  onGo: (i: number) => void
  lang: string
  reduced: boolean
  /** The field: autoplay pauses when it leaves the viewport. */
  watchRef: RefObject<HTMLElement | null>
  /** Any change pauses autoplay (field click, lens toggle, tab switch…). */
  pauseSignal: number
  onPlayingChange?: (playing: boolean) => void
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const n = titles.length
  const [playing, setPlaying] = useState(false)
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([])
  const anim = useRef<Animation | null>(null)

  useEffect(() => { onPlayingChange?.(playing) }, [playing, onPlayingChange])
  useEffect(() => { setPlaying(false) }, [pauseSignal])

  // Advance once per dwell; stop on the last step.
  useEffect(() => {
    if (!playing) return
    if (index >= n - 1) { setPlaying(false); return }
    const t = window.setTimeout(() => onGo(index + 1), DWELL_MS)
    return () => window.clearTimeout(t)
  }, [playing, index, n, onGo])

  // Progress fill on the active segment.
  useEffect(() => {
    anim.current?.cancel()
    anim.current = null
    const el = fillRefs.current[index]
    if (!playing || !el || typeof el.animate !== 'function') return
    anim.current = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DWELL_MS, easing: 'linear', fill: 'forwards' })
    return () => { anim.current?.cancel() }
  }, [playing, index])

  // Pause when hidden or scrolled away.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') setPlaying(false) }
    document.addEventListener('visibilitychange', onVis)
    const el = watchRef.current
    let io: IntersectionObserver | null = null
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) setPlaying(false) }, { threshold: 0.15 })
      io.observe(el)
    }
    return () => { document.removeEventListener('visibilitychange', onVis); io?.disconnect() }
  }, [watchRef])

  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI']
  return (
    <nav aria-label={L('Pasos del recorrido', 'Walkthrough steps')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] ct-sc text-text-muted">{L(`Paso ${index + 1} de ${n}`, `Step ${index + 1} of ${n}`)}</p>
        <div className="flex items-center gap-1">
          {!reduced && (
            <button
              type="button"
              aria-pressed={playing}
              onClick={() => { if (!playing && index >= n - 1) onGo(0); setPlaying((p) => !p) }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-text-primary px-3 text-[12px] ct-sc text-text-primary hover:border-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              {playing ? L('Pausa', 'Pause') : L('Recorrer', 'Play')}
            </button>
          )}
          <button type="button" onClick={() => onGo(index - 1)} disabled={index === 0} aria-label={L('Paso anterior', 'Previous step')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-text-secondary disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onGo(index + 1)} disabled={index === n - 1} aria-label={L('Paso siguiente', 'Next step')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-text-secondary disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ol className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {titles.map(([es, e], k) => {
          const active = k === index
          return (
            <li key={k} style={{ maxWidth: 'none' }}>
              <button
                type="button"
                onClick={() => onGo(k)}
                aria-current={active ? 'step' : undefined}
                className={`relative w-full min-h-11 border-t-2 px-1 pt-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'border-text-primary text-text-primary' : k < index ? 'border-text-muted text-text-secondary hover:text-text-primary' : 'border-border text-text-muted hover:text-text-secondary'}`}
              >
                {/* progress fill over the active segment's rule */}
                <span
                  ref={(el) => { fillRefs.current[k] = el }}
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-[2px] left-0 h-[2px] w-full origin-left bg-text-primary"
                  style={{ transform: 'scaleX(0)' }}
                />
                <span className="block text-[13px] font-mono">{roman[k]}</span>
                <span className="hidden text-[13px] leading-tight sm:block" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500 }}>{en ? e : es}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
