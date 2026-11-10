/**
 * DocHead — the page toolbar (DESIGN.md §5 + §3.1 «Compact chrome», owner 2026-11-02):
 * ONE row — «Registro › sección › página» left; the page's view switch (`views`, § G3) and its small
 * actions (`actions`: copy, export) right. The default corte · modelo meta prints only when the row
 * carries neither (the top bar already shows the cut). `sticky` pins the row on a list page (≥ 761px);
 * the table heads stick under it (`--ct-stick`).
 */
import { useDataCut } from '@/lib/useDataCut'
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_MODEL_VERSION } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { useLang } from './nav'

export interface Crumb { label: string; to?: string }

export function DocHead({ trail, meta, views, actions, sticky }: { trail: Crumb[]; meta?: ReactNode; views?: ReactNode; actions?: ReactNode; sticky?: boolean }) {
  const cut = useDataCut()
  const lang = useLang()
  const crumbs: Crumb[] = [{ label: lang === 'en' ? 'Record' : 'Registro', to: '/' }, ...trail]
  const tools = !!(views || actions)
  const ref = useRef<HTMLDivElement>(null)
  // a sticky row publishes its real height (it wraps at narrow desktops) so the column heads stick under it
  useEffect(() => {
    const el = ref.current
    if (!sticky || !el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--ct-stick', `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.removeProperty('--ct-stick') }
  }, [sticky])
  const cls = ['ct-dochead', tools && 'has-views', sticky && 'is-sticky'].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={cls}>
      <nav aria-label={lang === 'en' ? 'Location in the record' : 'Ubicación en el registro'}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={i}>
              {i > 0 && ' › '}
              {last ? <b aria-current="page">{c.label}</b> : c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
            </Fragment>
          )
        })}
      </nav>
      {(meta || !tools) && (
        <span className="ct-dochead-meta">
          {meta ?? (
            <>
              {lang === 'en' ? 'Cut-off' : 'Corte'} <b>{formatCut(cut, lang)}</b> · {lang === 'en' ? 'Model' : 'Modelo'} {CURRENT_MODEL_VERSION}
            </>
          )}
        </span>
      )}
      {tools && <div className="ct-dochead-tools">{views}{actions}</div>}
    </div>
  )
}
