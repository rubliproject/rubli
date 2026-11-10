/**
 * HowToRead — «Cómo leer esto»: a short step-through that shows how one figure is made, a few seconds per step
 * (owner 2026-11-03, after a lay reader asked «¿cómo se mide el riesgo?»). Reusable: the caller passes the steps;
 * this owns the timing, the controls and the motion rules.
 *
 * - Until it is first seen every step is shown in full (no blank panels on a page read or captured top to bottom).
 * - Plays once when its top passes 70 % of the viewport (stepMs per step, default 3.3 s: three steps ≈ 10 s); holds while
 *   off screen or in a hidden tab; never loops.
 * - Every step is a button (1 · 2 · 3): it stops the play and shows that step and the ones before it. «Ver todo»
 *   skips to the end; «Repetir» plays it again. Native buttons, so Tab / Enter / Space do it all.
 * - Each step's body is always in the DOM (readers and screen readers get all three); a step not reached yet is
 *   dimmed, never blank. Its inner motion keys off `[data-on]` (CSS transitions: transform + opacity only, kit.css `.htr`).
 * - Reduced motion: the three steps as static panels, no play, no controls.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Lang } from '@/components/contrato/nav'
import './howtoread.css'

export interface HowToReadStep { label: string; body: ReactNode }

const reduceQ = '(prefers-reduced-motion: reduce)'

export function HowToRead({ title, sub, steps, lang, stepMs = 3300, className }: {
  title: string
  sub?: ReactNode
  steps: HowToReadStep[]
  lang: Lang
  stepMs?: number
  className?: string
}) {
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const n = steps.length
  const hid = useId()
  const [reduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(reduceQ).matches)
  // step = how many panels are shown (0 before the play starts)
  const [step, setStep] = useState(reduce ? n : 0)
  const [playing, setPlaying] = useState(false)
  const [seen, setSeen] = useState(false)
  const [awake, setAwake] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (reduce || !el || typeof IntersectionObserver === 'undefined') { if (!reduce) setStep(n); return }
    let inView = false
    const set = () => setAwake(inView && !document.hidden)
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      if (inView) setSeen(true)
      set()
    }, { threshold: 0, rootMargin: '0px 0px -30% 0px' }) // top past 70 % of the viewport: a tall phone stack never reaches a 40 % ratio
    io.observe(el)
    document.addEventListener('visibilitychange', set)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', set) }
  }, [reduce, n])
  // the first sight starts the play, once
  useEffect(() => { if (seen && !reduce) setPlaying(true) }, [seen, reduce])
  useEffect(() => {
    if (!playing || !awake) return
    if (step >= n) { setPlaying(false); return }
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 300 : stepMs)
    return () => window.clearTimeout(t)
  }, [playing, awake, step, n, stepMs])

  const go = (i: number) => { setPlaying(false); setStep(i) }
  const done = step >= n && !playing

  return (
    <section ref={ref} className={`htr${reduce ? ' is-still' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={hid}>
      <div className="htr-head">
        <h2 id={hid} className="htr-h">{title}</h2>
        {sub && <p className="htr-sub">{sub}</p>}
        {!reduce && (
          <div className="htr-ctl" role="group" aria-label={L('Pasos', 'Steps')}>
            {steps.map((s, i) => (
              <button key={i} type="button" aria-pressed={step === i + 1} aria-label={`${i + 1}. ${s.label}`} onClick={() => go(i + 1)}>
                <span className="htr-cn">{i + 1}</span><span className="htr-cl">{s.label}</span>
                {playing && awake && step === i + 1 && i + 1 < n && <i key={step} className="htr-prog" style={{ animationDuration: `${stepMs}ms` }} aria-hidden="true" />}
              </button>
            ))}
            <button type="button" className="htr-skip" onClick={() => (done ? (setStep(0), setPlaying(true)) : go(n))}>
              {done ? L('Repetir', 'Replay') : L('Ver todo', 'Show all')}
            </button>
          </div>
        )}
      </div>
      <ol className="htr-steps">
        {steps.map((s, i) => (
          <li key={i} data-on={step > i || (!seen && !playing) || undefined} aria-current={!reduce && step === i + 1 ? 'step' : undefined}>
            <p className="htr-l"><span className="htr-cn">{i + 1}</span>{s.label}</p>
            <div className="htr-b">{s.body}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}
