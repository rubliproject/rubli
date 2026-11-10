/**
 * Unfold — one record opening into its parts, as a 2.5D sheet (CSS only: transform + opacity, composited).
 * Pure DOM, so it is its own 2D twin and reads to screen readers as a list. Plays once on reveal;
 * `prefers-reduced-motion` shows the final state. Parts with `href` link to their dossier.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { UnfoldData } from './data'
import { useReducedMotion } from './scene'
import './motion.css'

export default function Unfold({ data, lang }: { data: UnfoldData; lang: 'es' | 'en' }) {
  const en = lang === 'en'
  const reduced = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const [live, setLive] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced || live) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setLive(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [reduced, live])
  const cls = ['mk mk-unfold', !reduced && 'is-armed', live && 'is-live'].filter(Boolean).join(' ')
  return (
    <section ref={ref} className={cls} aria-label={en ? `The record ${data.head} and its ${data.parts.length} parts` : `El registro ${data.head} y sus ${data.parts.length} partes`}>
      <div className="mk-unfold-head"><b>{data.head}</b><span>{data.sub}</span></div>
      <ol>
        {data.parts.map((p, i) => (
          <li key={p.key} className={p.tone ? `is-${p.tone}` : undefined} style={{ '--i': i } as CSSProperties}>
            <span className="l">{p.label}</span>
            <span className="v">{p.href ? <Link to={p.href}>{p.value}</Link> : p.value}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
