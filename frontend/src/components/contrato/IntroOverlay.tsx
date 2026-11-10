/**
 * IntroOverlay — «El expediente», the 2-second intro (owner-approved 2026-10-29; DESIGN.md §7,
 * spec _explore/intro_2026-10-28/README.md direction A).
 *
 * The locked mark (RubliLogoMark, never redrawn) plays its own mount animation once at 112 px on
 * a fixed sheet; one line types with its scan at 850 ms; at 1500 ms the mark FLIPs (400 ms
 * --ease-out) onto the top-bar mark, which mounted in the same commit and so runs at the same
 * phase — the hand-off is pixel-on-pixel. Removed at 2000 ms.
 * Fixed overlay only: the page is laid out and mounted beneath from 0 ms (CLS 0). Once per
 * session, first route only (MainLayout mounts once), click / any key / wheel skips (150 ms),
 * prefers-reduced-motion = no intro. Transform, opacity and clip-path only.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RubliLogoMark } from '@/components/ui/RubliLogoMark'
import { useExecutiveSummary } from '@/hooks/useExecutiveSummary'
import { useDataCutInfo } from '@/lib/useDataCut'
import { formatCut } from '@/lib/nav/toc'
import { formatNumber } from '@/lib/utils'
import { DATA_LAST_YEAR } from '@/lib/constants'
import { useLang } from './nav'

const KEY = 'rubli-intro'
const TYPE_AT = 850
const TYPE_LATEST = 1100 // a figure that lands after this is not typed: the fallback line is
const TYPED_BY = 1450
const FIRST_YEAR = 2002 // the record's first year (backend DATA_FIRST_YEAR)
const LAND_AT = 1500
const END = 2000
const SKIP = 150

/** Pure gate (read-only, so StrictMode's double initializer is safe): no reduced motion, not yet
 *  played this session. Storage that throws (private mode, blocked) → no intro, never a loop. */
export function shouldPlayIntro(): boolean {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    return !window.sessionStorage.getItem(KEY)
  } catch {
    return false
  }
}

export function IntroOverlay() {
  const [play] = useState(shouldPlayIntro)
  return play ? <Intro /> : null
}

type Phase = 'play' | 'land' | 'skip' | 'done'

function Intro() {
  const lang = useLang()
  const en = lang === 'en'
  const cut = useDataCutInfo()?.data_cut
  const head = useExecutiveSummary().query.data?.headline
  const [phase, setPhase] = useState<Phase>('play')
  // The line is a snapshot: typed once, at 850 ms if the count is in, else when it lands (≤ 1100 ms),
  // else at 1100 ms with what there is (span + cut, no count). It never retypes.
  const [line, setLine] = useState<{ cut?: string; head?: typeof head; at: number } | null>(null)
  const t0 = useRef(0)
  const latest = useRef({ cut, head })
  latest.current = { cut, head }
  const mark = useRef<HTMLDivElement>(null)
  const skipRef = useRef<() => void>(undefined)

  // layout effect: the clock and the skip listeners exist before the first paint of the sheet
  useLayoutEffect(() => {
    t0.current = performance.now()
    try { window.sessionStorage.setItem(KEY, '1') } catch { /* gate already refused unusable storage */ }
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)) }
    const off = () => {
      window.removeEventListener('keydown', skip, true)
      window.removeEventListener('wheel', skip)
    }
    let over = false
    function skip() {
      if (over) return
      over = true
      off()
      timers.forEach(clearTimeout)
      setPhase('skip')
      at(SKIP, () => setPhase('done'))
    }
    const show = () => setLine((l) => l ?? { ...latest.current, at: performance.now() - t0.current })
    at(TYPE_AT, () => { if (latest.current.head) show() })
    at(TYPE_LATEST, show)
    at(LAND_AT, () => {
      // FLIP: measured at the hand-off, so a resize or scroll during the first 1.5 s still lands.
      const el = mark.current
      const a = el?.getBoundingClientRect()
      const b = document.querySelector('.ct-top .ct-brand svg')?.getBoundingClientRect()
      if (el && a && b && b.width && b.bottom > 0) {
        el.style.setProperty('--fx', `${b.left - a.left}px`)
        el.style.setProperty('--fy', `${b.top - a.top}px`)
        el.style.setProperty('--fs', String(b.width / a.width))
      }
      // the last 500 ms are the hand-off: no skip (it would snap the mark back), clicks reach the page
      over = true
      off()
      setPhase('land')
    })
    at(END, () => { over = true; off(); setPhase('done') })
    window.addEventListener('keydown', skip, true)
    window.addEventListener('wheel', skip, { passive: true })
    skipRef.current = skip
    return () => { off(); timers.forEach(clearTimeout) }
  }, [])

  useEffect(() => {
    const e = performance.now() - t0.current
    if (head && e >= TYPE_AT && e < TYPE_LATEST) setLine((l) => l ?? { cut, head, at: e })
  }, [head, cut])

  if (phase === 'done') return null

  const text = !line ? '' : [
    line.head && `${formatNumber(line.head.total_contracts)} ${en ? 'contracts' : 'contratos'}`,
    line.head ? `${line.head.min_year}–${line.head.max_year}` : `${FIRST_YEAR}–${DATA_LAST_YEAR}`,
    line.cut && `${en ? 'cut' : 'corte'} ${formatCut(line.cut, lang)}`,
  ].filter(Boolean).map((seg) => String(seg).replace(/ /g, ' ')).join(' · ') // a phone wraps between segments only

  return (
    <div
      className={`ct-intro${phase === 'land' ? ' is-land' : phase === 'skip' ? ' is-skip' : ''}`}
      aria-hidden="true"
      onPointerDown={() => skipRef.current?.()}
    >
      <div className="ct-intro-stage">
        <div className="ct-intro-mark" ref={mark}>
          <RubliLogoMark size={112} />
        </div>
        {line && <p className="ct-intro-line" style={{ ['--n' as string]: text.length, ['--d' as string]: `${Math.max(200, Math.min(600, TYPED_BY - line.at))}ms` }}>{text}</p>}
      </div>
      <p className="ct-intro-hint">
        <span className="ct-intro-fine">{en ? 'click or any key to skip' : 'clic o cualquier tecla para saltar'}</span>
        <span className="ct-intro-touch">{en ? 'tap to skip' : 'toque para saltar'}</span>
      </p>
    </div>
  )
}
