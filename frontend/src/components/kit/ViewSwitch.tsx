/**
 * ViewSwitch — the page-level segmented control (OWNER_REVIEW 2026-10-28 § G3).
 * Every page names its OWN views by what the reader sees («El muro · La fila»), never «Visualización · Lista».
 * Sits at the right of the page head (DocHead `views` slot). Pressed buttons in a group (aria-pressed),
 * not tabs: the views are the same record, not panels.
 */
import './kit.css'

export interface ViewOpt<K extends string> { key: K; es: string; en: string }

export function ViewSwitch<K extends string>({ views, value, onChange, lang, className, onHover, label }: {
  views: readonly ViewOpt<K>[]
  value: K
  onChange: (k: K) => void
  lang: 'es' | 'en'
  className?: string
  /** the group's accessible name; default «Vista» / «View». */
  label?: string
  /** pointer-enter / focus on a view (prefetch). */
  onHover?: (k: K) => void
}) {
  return (
    <div className={className ? `ct-viewswitch is-page ${className}` : 'ct-viewswitch is-page'} role="group" aria-label={label ?? (lang === 'en' ? 'View' : 'Vista')}>
      {views.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={value === v.key}
          className="ct-view"
          onClick={() => { if (v.key !== value) onChange(v.key) }}
          onPointerEnter={onHover ? () => onHover(v.key) : undefined}
          onFocus={onHover ? () => onHover(v.key) : undefined}
        >
          {lang === 'en' ? v.en : v.es}
        </button>
      ))}
    </div>
  )
}
