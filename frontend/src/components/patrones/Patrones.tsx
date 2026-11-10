/**
 * Los patrones — the pieces both MAGENTA boards share (docs/BACKLOG_LOS_PATRONES.md § «¿Qué es esto? ¿Quién es?»):
 *   Toggle    the row's door: one button per row; its ::after spans the row (the whole row opens), aria-expanded
 *   Opened    the opened record under a row: breadcrumb + «← Volver a la lista», focus moves in, Esc walks back
 *   ComoLeer  «Cómo leer esto»: three steps over the same board (no second chart)
 * The opened row is in the URL (useOpenParam), so Back closes it and a link can share it.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Lang } from '@/components/contrato/nav'
import './patrones.css'

/** ?{param}= the opened row's key (validated by `ok`). */
export function useOpenParam(param: string, ok: (v: string) => boolean) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(param)
  const open = raw && ok(raw) ? raw : null
  const set = (v: string | null) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (v == null) n.delete(param)
    else n.set(param, v)
    return n
  }, { preventScrollReset: true })
  return [open, set] as const
}

export const toggleId = (scope: string, key: string) => `pt-${scope}-${key}`

export function Toggle({ scope, k, open, label, onToggle, children }: {
  scope: string; k: string; open: boolean; label: string; onToggle: () => void; children: ReactNode
}) {
  return (
    <button type="button" id={toggleId(scope, k)} className="bd-go pt-go" aria-expanded={open} aria-controls={open ? `${toggleId(scope, k)}-open` : undefined} aria-label={label} onClick={onToggle}>
      {children}
    </button>
  )
}

/** The chevron in the row's lead cell (decorative: the row's Toggle carries the state). */
export const Chev = ({ open }: { open: boolean }) => (
  <span className={`pt-chev${open ? ' is-open' : ''}`} aria-hidden="true"><ChevronRight /></span>
)

export function Opened({ scope, k, crumbs, onClose, lang, children }: {
  scope: string; k: string; crumbs: string[]; onClose: () => void; lang: Lang; children: ReactNode
}) {
  const en = lang === 'en'
  const head = useRef<HTMLHeadingElement>(null)
  // focus moves in only when the reader just opened it (its toggle has focus); a deep link leaves focus at the page start
  useEffect(() => { if (document.activeElement?.id === toggleId(scope, k)) head.current?.focus({ preventScroll: true }) }, [scope, k])
  const back = () => { onClose(); requestAnimationFrame(() => document.getElementById(toggleId(scope, k))?.focus()) }
  return (
    <li id={`${toggleId(scope, k)}-open`} className="rg-open pt-open" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); back() } }}>
      <div className="pt-crumbs">
        <nav aria-label={en ? 'Where you are' : 'Dónde está'}>
          {crumbs.map((c, i) => (
            <span key={i}>{i > 0 && ' › '}{i === crumbs.length - 1 ? <b aria-current="location">{c}</b> : c}</span>
          ))}
        </nav>
        <button type="button" className="pt-back" onClick={back}>
          {en ? '← Back to the list' : '← Volver a la lista'} <kbd>Esc</kbd>
        </button>
      </div>
      <h3 ref={head} tabIndex={-1} className="pt-open-h">{crumbs[crumbs.length - 1]}</h3>
      {children}
    </li>
  )
}

export function ComoLeer({ steps, lang }: { steps: { b: ReactNode; t: ReactNode }[]; lang: Lang }) {
  const en = lang === 'en'
  return (
    <section className="pt-leer" aria-labelledby="pt-leer-h">
      <h2 id="pt-leer-h" className="pt-k">{en ? 'How to read this' : 'Cómo leer esto'}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={i}><span className="pt-n">{String(i + 1).padStart(2, '0')}</span><p><b>{s.b}</b> {s.t}</p></li>
        ))}
      </ol>
    </section>
  )
}
