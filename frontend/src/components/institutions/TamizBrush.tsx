/**
 * TamizBrush — drag a score range along El Tamiz's axis (institutions-phase2 § 1).
 *
 * A track aligned to the field's plot: press and drag to draw a range, or grab
 * an end to move it. While dragging the caller gets `onDraft` (live highlight,
 * no history spam); on release `onCommit` writes `?rango=`. Snaps to whole
 * points. The keyboard path is the two number inputs the caller renders
 * beside the readout — the handles themselves are pointer-only.
 */
import { useRef } from 'react'
import { scoreToX } from '@/lib/institutions/field'
import { xToScore, type Range } from '@/lib/institutions/brush'

interface Props {
  plotX0: number
  plotW: number
  xMin: number
  xMax: number
  /** The D line (score below = deficient), drawn as a tick for orientation. */
  deficientBelow: number
  range: Range | null
  /** 44 px track and handle targets. */
  touch: boolean
  reduced: boolean
  onDraft: (r: Range | null) => void
  onCommit: (r: Range | null) => void
  lang: string
}

export function TamizBrush({ plotX0, plotW, xMin, xMax, deficientBelow, range, touch, reduced, onDraft, onCommit, lang }: Props) {
  const en = lang === 'en'
  const g = { plotX0, plotW, xMin, xMax }
  const drag = useRef<{ anchor: number; last: Range | null } | null>(null)
  const h = touch ? 44 : 28
  const grab = touch ? 22 : 10

  const scoreAt = (e: React.PointerEvent<HTMLDivElement>) => xToScore(e.clientX - e.currentTarget.getBoundingClientRect().left, g)
  const toRange = (a: number, b: number): Range | null => (a === b ? null : [Math.min(a, b), Math.max(a, b)])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    // Grabbing an end keeps the other end as the anchor; elsewhere starts a new range.
    let anchor = xToScore(x, g)
    if (range) {
      if (Math.abs(x - scoreToX(range[0], g)) <= grab) anchor = range[1]
      else if (Math.abs(x - scoreToX(range[1], g)) <= grab) anchor = range[0]
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { anchor, last: range }
    e.preventDefault()
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const r = toRange(drag.current.anchor, scoreAt(e))
    drag.current.last = r
    onDraft(r)
  }
  const onUp = () => {
    if (!drag.current) return
    const r = drag.current.last
    drag.current = null
    onCommit(r)
  }

  const x0 = range ? scoreToX(range[0], g) : 0
  const x1 = range ? scoreToX(range[1], g) : 0
  const xd = scoreToX(deficientBelow, g)
  const trans = reduced ? undefined : 'left 120ms ease-out, width 120ms ease-out'

  return (
    <div
      aria-hidden="true"
      className="relative cursor-crosshair select-none"
      style={{ height: h, touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      title={en ? 'Drag along the score axis to select a range' : 'Arrastre sobre el eje para elegir un rango de calificación'}
    >
      <div className="absolute top-1/2 h-px bg-border" style={{ left: plotX0, width: plotW }} />
      <div className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-risk-critical" style={{ left: xd }} />
      {!range && (
        <span className="pointer-events-none absolute top-0 text-[12px] font-mono text-text-muted" style={{ left: plotX0 }}>
          {en ? 'drag to select a score range' : 'arrastre para elegir un rango'}
        </span>
      )}
      {range && (
        <>
          <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ left: x0, width: x1 - x0, transition: trans }} />
          {([x0, x1] as const).map((x, k) => (
            <div key={k} className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ left: x, width: grab * 2, height: h, transition: reduced ? undefined : 'left 120ms ease-out' }}>
              <span className="block h-4 w-[3px] rounded-sm bg-text-primary" />
              <span className={`absolute ${touch ? '-top-0.5' : '-top-1.5'} font-mono text-[12px] tabular-nums text-text-primary`}>{range[k]}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
