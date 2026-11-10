/**
 * FootNotes — the one notes block (OWNER_REVIEW 2026-10-28 § G1: «the notes are so big; economize space»).
 * Collapsed to one line «Notas y fuentes · N» at the page foot; opens in place (native <details>, no JS).
 * Each note is 12–13px mono. Never mid-page: render it last, before the colophon.
 * `lead` = the one line that must stay visible (the «indicador, no prueba» disclaimer); everything else folds.
 */
import type { ReactNode } from 'react'
import './kit.css'

export function FootNotes({ lang, items, lead, children, className, title }: {
  lang: 'es' | 'en'
  /** One entry per note; numbered. */
  items?: ReactNode[]
  /** Shown above the fold line, always visible. */
  lead?: ReactNode
  /** Extra content under the list (a methodology link, a pattern list). */
  children?: ReactNode
  className?: string
  /** A figure's own reading notes (e.g. the Anaquel) name themselves; the page's foot keeps the default. */
  title?: { es: string; en: string }
}) {
  const list = (items ?? []).filter((x) => x != null && x !== false && x !== '')
  if (!list.length && !children && !lead) return null
  const n = list.length
  const fold = (list.length > 0 || children) ? (
    <details className={className ? `ct-notes ${className}` : 'ct-notes'}>
      <summary>
        <span className="ct-notes-t">{title ? title[lang] : lang === 'en' ? 'Notes and sources' : 'Notas y fuentes'}</span>
        {n > 0 && <span className="ct-notes-n"> · {n}</span>}
      </summary>
      {/* role=list: Safari drops list semantics once list-style is none */}
      {n > 0 && <ol role="list">{list.map((t, i) => <li key={i}>{t}</li>)}</ol>}
      {children}
    </details>
  ) : null
  if (!lead) return fold
  return (
    <div className="ct-notes-foot">
      <p className="ct-notes-lead">{lead}</p>
      {fold}
    </div>
  )
}
