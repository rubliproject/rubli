/**
 * RuledBar — shares / amounts on a ruled axis (DESIGN.md §7): mono ticks over a
 * 16px ruled track, a 2px bar with an end-cap tick, the value right-aligned mono.
 * Critical rows go red with «indicador ≥ 0.60».
 */
import { Fragment, useId, useRef, useState, type DOMAttributes, type ReactNode } from 'react'
import { useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useLang } from './nav'
import { FoldToggle } from './Fold'

export interface RuledRow {
  name: ReactNode
  /** Second line under the name (mono, gray). */
  sub?: ReactNode
  /** 0–1 position on the axis. */
  share: number
  value: ReactNode
  critical?: boolean
  /** Bar color override (CSS); critical rows use the risk red. */
  color?: string
  href?: string
  /** L1 linked hover (components/dossier/layers): lit, and the handlers that light its twins. */
  hot?: boolean
  bind?: DOMAttributes<HTMLElement>
  /** L3: an opened drill, set under the row. */
  after?: ReactNode
}

export function RuledBar({ ticks, rows, label, mark, fold }: {
  /** Axis labels; `at` is the 0–1 position (log axes place their own). */
  ticks: Array<{ label: string; at: number }>
  rows: RuledRow[]
  label?: string
  /** A reference rule through every row (the EU 10% line, the national mean), red, labelled on the axis. */
  mark?: { at: number; label: string }
  /** Show this many rows; the rest open in place under «ver los N restantes» (never hides a single row). */
  fold?: number
}) {
  const lang = useLang()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const [open, setOpen] = useState(false)
  const foldId = useId()
  const cut = fold != null && rows.length > fold + 1 ? fold : rows.length
  const rest = rows.length - cut
  const row = (r: RuledRow, i: number) => {
    const body = (
      <>
        <div className="ct-nm">
          {r.name}
          {r.critical && <em>{lang === 'en' ? 'indicator ≥ 0.60' : 'indicador ≥ 0.60'}</em>}
          {r.sub && <small>{r.sub}</small>}
        </div>
        <div className="ct-trk" style={{ ['--v' as string]: `${Math.max(0, Math.min(1, r.share)) * 100}%`, ['--c' as string]: r.critical ? 'var(--color-risk-critical)' : r.color }}>
          <i style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }} />
          {mark && <b style={{ left: `${mark.at * 100}%` }} aria-hidden="true" />}
        </div>
        <div className="ct-val">{r.value}</div>
      </>
    )
    const cls = r.hot ? 'ct-brow is-hot' : 'ct-brow'
    return (
      <Fragment key={i}>
        {r.href
          ? <Link to={r.href} className={cls} role="listitem" {...r.bind}>{body}</Link>
          : <div className={cls} role="listitem" {...r.bind}>{body}</div>}
        {r.after}
      </Fragment>
    )
  }
  return (
    <>
    <div ref={ref} role="list" aria-label={label} data-in={inView ? '' : undefined}>
      <div className="ct-axis" aria-hidden="true">
        <div className="ct-trk">
          {ticks.map((t, i) => (
            <span key={i} style={{ left: `${t.at * 100}%`, transform: t.at <= 0 ? 'none' : t.at >= 1 ? 'translateX(-100%)' : undefined }}>{t.label}</span>
          ))}
          {mark && <span className="ct-mark" style={{ left: `${mark.at * 100}%`, transform: mark.at >= 0.8 ? 'translateX(-100%)' : 'none' }}>{mark.label}</span>}
        </div>
      </div>
      {rows.slice(0, cut).map(row)}
      {rest > 0 && (
        <div id={foldId} className="ct-fold" data-open={open || undefined} inert={!open}>
          <div>{rows.slice(cut).map((r, i) => row(r, i + cut))}</div>
        </div>
      )}
    </div>
    <FoldToggle open={open} rest={rest} onToggle={() => setOpen((o) => !o)} controls={foldId} />
    </>
  )
}
