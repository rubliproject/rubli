/**
 * ViewTabs — the big page-view tabs (WAI-ARIA tablist, roving tabindex,
 * ←/→/Home/End). Lifted from /categories «El Anaquel · La hoja de conteo ·
 * Hallazgos» (9a1f0cf8) so /institutions can share the same tab grammar.
 * Panels are rendered by the caller with id `${idPrefix}-panel-${key}` and
 * aria-labelledby `${idPrefix}-tab-${key}`.
 */
import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface ViewTabItem<K extends string> {
  key: K
  es: string
  en: string
  subEs: string
  subEn: string
  /** Phone label (< sm) when the full one would wrap. */
  shortEs?: string
  shortEn?: string
}

export function ViewTabs<K extends string>({ items, view, onChange, lang, idPrefix, ariaLabel }: {
  items: ViewTabItem<K>[]
  view: K
  onChange: (v: K) => void
  lang: string
  idPrefix: string
  ariaLabel: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = items.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (next == null) return
    e.preventDefault()
    onChange(items[next].key)
    refs.current[next]?.focus()
  }
  const es = lang !== 'en'
  return (
    <div role="tablist" aria-label={ariaLabel} className="mt-3 grid border-b border-border" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => {
        const active = it.key === view
        return (
          <button
            key={it.key}
            ref={(el) => { refs.current[i] = el }}
            id={`${idPrefix}-tab-${it.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${it.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              '-mb-px flex min-h-14 flex-col justify-start border-b-[3px] px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-4',
              active ? 'border-accent bg-background-elevated text-text-primary' : 'border-transparent text-text-muted hover:bg-background-elevated/60 hover:text-text-secondary',
            )}
          >
            <span className="block leading-tight" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: active ? 600 : 500, fontSize: 'clamp(16px, 1.7vw, 22px)' }}>
              <span className={it.shortEs ? 'hidden sm:inline' : undefined}>{es ? it.es : it.en}</span>
              {it.shortEs && <span className="sm:hidden">{es ? it.shortEs : it.shortEn}</span>}
            </span>
            <span className="mt-0.5 hidden truncate font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted sm:block">
              {es ? it.subEs : it.subEn}
            </span>
          </button>
        )
      })}
    </div>
  )
}
