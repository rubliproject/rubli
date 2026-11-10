/**
 * Clause «ficha» — a headline figure: label (SC 12) · Δ · fig (17) · optional ruler (12) | dimension line · note (12).
 * Template v3 (DESIGN.md §8, 2026-10-28): the delta rides on the label row; story clauses opt into the 24 figure.
 * (Owner, 2026-10-14: the numbered-clause / «§ Citar» gimmick read as noise; dropped.)
 *
 * Motion (FIX_BRIEF_R1 § D.3): on first view the figure counts up (700ms, framer `animate`
 * writing into a ref — no re-renders) and the ruler fills / settles with it. Reduced motion
 * prints the final state. `#id` in the URL pulls the figure out of line (deep link).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useLang } from './nav'

const CITE_EVENT = 'ct-cite'

export interface ClauseRuler {
  /** 0–1 share of the scale. */
  value: number
  mode: 'fill' | 'pointer'
  /** CSS color for the fill / pointer. */
  color?: string
  /** Labels under the scale: start · middle · end. */
  ends: [string, string, string]
}

/** A figure that counts up on first view: the number and how to print it. */
export interface ClauseCount {
  value: number
  format: (n: number) => string
}

export interface ClauseProps {
  id: string
  /** Unused since 2026-10-14 (kept so callers need no change). */
  ordinal?: string
  title: string
  fig: ReactNode
  /** When set, the figure is this number, counted up once on first view (fig is ignored). */
  count?: ClauseCount | null
  unit?: string
  /** Monto en letra. */
  letra?: string
  ruler?: ClauseRuler
  /** Dimension line for a span («2002 – 2025 · 24 ejercicios»). */
  dim?: string
  note?: ReactNode
  /** Unused since 2026-10-14 (kept so callers need no change). */
  cite?: string
  doc?: string
  critical?: boolean
  /** Change vs the previous week / run, printed on the label row: «▲ 46», «▼ 3 pts». Only on live pages (DESIGN.md §4 risk-3 rule). */
  delta?: { text: string; dir: 'up' | 'down' | 'flat'; label?: string } | null
  /** 'story' keeps the 24 figure of the long-form stories (--text-fig-story); default is the live 17. */
  size?: 'live' | 'story'
}

export function Clause({ id, title, fig, count, unit, letra, ruler, dim, note, critical, delta, size = 'live' }: ClauseProps) {
  const lang = useLang()
  const [pulled, setPulled] = useState(() => typeof window !== 'undefined' && window.location.hash === `#${id}`)
  const root = useRef<HTMLDivElement>(null)
  const figText = useRef<HTMLSpanElement>(null)
  const counted = useRef(false)
  const inView = useInView(root, { once: true, amount: 0.4 })
  const reduce = useReducedMotion()

  useEffect(() => {
    const onCite = (e: Event) => {
      setPulled((e as CustomEvent<string>).detail === id)
    }
    window.addEventListener(CITE_EVENT, onCite)
    return () => window.removeEventListener(CITE_EVENT, onCite)
  }, [id])

  // The figure text is owned by this effect, never by React children, so the count-up
  // writes every frame without a render. Off-screen it reads the FINAL value (screenshots,
  // fast scrollers, find-in-page and print must never see a false 0) and counts up once
  // from 0 when the clause enters; reduced motion always gets the final value.
  const countValue = count?.value
  const formatRef = useRef(count?.format)
  formatRef.current = count?.format
  useLayoutEffect(() => {
    const el = figText.current
    const fmt = formatRef.current
    if (!el) return
    if (countValue == null || !fmt) { el.textContent = '—'; return } // null count (loading / unavailable) prints «—», never blank
    const final = () => { el.textContent = fmt(countValue) }
    window.addEventListener('beforeprint', final)
    if (reduce || counted.current) final()
    else if (!inView) final()
    else {
      // `counted` flips on completion, so a StrictMode remount restarts the count instead of skipping it.
      const c = animate(0, countValue, { duration: 0.7, ease: [0.23, 1, 0.32, 1], onUpdate: (v) => { el.textContent = fmt(v) }, onComplete: () => { counted.current = true } })
      return () => { c.stop(); final(); window.removeEventListener('beforeprint', final) }
    }
    return () => window.removeEventListener('beforeprint', final)
  }, [countValue, inView, reduce, lang])

  return (
    <div id={id} ref={root} className={cn('ct-clause', pulled && 'is-pulled', size === 'story' && 'is-story')} data-in={inView ? '' : undefined}>
      <h3>
        <span>{title}</span>
        {delta && (
          <span className={cn('ct-delta', delta.dir === 'up' && 'is-up')}>
            <span aria-hidden="true">{delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '='} </span>
            {delta.label ? <><span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.label}</span></> : delta.text}
          </span>
        )}
      </h3>
      <span className={cn('ct-fig', critical && 'is-crit')}>
        {count !== undefined ? <span ref={figText} /> : fig}
        {unit && <span className="ct-unit">{unit}</span>}
      </span>
      {letra && <span className="ct-letra">({letra})</span>}
      {ruler && (
        <>
          <div className="ct-mini" aria-hidden="true" style={{ ['--v' as string]: `${Math.max(0, Math.min(1, ruler.value)) * 100}%`, ['--c' as string]: ruler.color }}>
            <span className={ruler.mode === 'fill' ? 'ct-fill' : 'ct-ptr'} />
          </div>
          <div className="ct-ends" aria-hidden="true"><span>{ruler.ends[0]}</span><span>{ruler.ends[1]}</span><span>{ruler.ends[2]}</span></div>
        </>
      )}
      {dim && <div className="ct-dim" aria-hidden="true">{dim}</div>}
      {note && <span className="ct-note">{note}</span>}
    </div>
  )
}
