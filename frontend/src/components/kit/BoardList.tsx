/**
 * BoardList — the Portada's list look («Contratos recientes», components/portada/Tablero.tsx) as a STILL list for any
 * page (owner 2026-11-09: «the lists in Sexenios must look like the ones in Portada. All of them should look like
 * that»). Same board CSS (kit.css `.bd*`: board colours, mono head, rank, serif names, amber amounts, level chips),
 * no flaps, no cycling. A page passes its columns (CSS track + which ones stay on the phone) and its rows; a row may
 * carry an `open` node shown full-width under it (open-in-place drills). `fold` shows the first N with a «ver todos».
 * Cell classes from the board: `bd-buyer` (a name), `bd-amt` (money), `bl-rk` (rank), `bl-num` (a figure).
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import './kit.css'

export interface BoardCol { label: ReactNode; w: string; r?: boolean; cls?: string; /** keep on the phone */ phone?: boolean }
export interface BoardRow { key: string | number; cells: ReactNode[]; open?: ReactNode }

export function BoardList({ title, when, desc, bar, cols, rows, fold, note, lang, id, label, className }: {
  title?: ReactNode; when?: ReactNode; desc?: ReactNode
  /** the board's bar under the head: tabs, sort buttons, tools */
  bar?: ReactNode
  cols: BoardCol[]; rows: BoardRow[]
  fold?: number; note?: ReactNode; lang: 'es' | 'en'; id?: string
  /** the list's accessible name when there is no title */
  label?: string; className?: string
}) {
  const [all, setAll] = useState(false)
  const shown = fold && !all ? rows.slice(0, fold) : rows
  const style = {
    '--bl-cols': cols.map((c) => c.w).join(' '),
    '--bl-cols-sm': cols.filter((c) => c.phone).map((c) => c.w).join(' '),
  } as CSSProperties
  const cell = (c: BoardCol) => ['bd-c', c.cls, c.r && 'r', !c.phone && 'bl-x'].filter(Boolean).join(' ')
  const hid = id ? `${id}-h` : undefined
  return (
    <section className={['bd bl', className].filter(Boolean).join(' ')} style={style} aria-labelledby={title ? hid : undefined} aria-label={title ? undefined : label}>
      {(title || when || desc) && (
        <div className="bd-head">
          {title && <h3 id={hid} className="bd-h">{title}</h3>}
          {when && <p className="bd-when">{when}</p>}
          {desc && <p className="bd-desc">{desc}</p>}
        </div>
      )}
      {bar && <div className="bd-bar">{bar}</div>}
      <ol id={id} className="bd-list" role="list">
        <li className="bd-row bd-cols" aria-hidden="true">
          {cols.map((c, j) => <span key={j} className={cell(c)}>{c.label}</span>)}
        </li>
        {shown.map((r) => (
          <li key={r.key} className="bl-li">
            <div className="bd-row">{r.cells.map((x, j) => <span key={j} className={cell(cols[j])}>{x}</span>)}</div>
            {r.open && <div className="bl-open">{r.open}</div>}
          </li>
        ))}
      </ol>
      {fold != null && rows.length > fold && (
        <button type="button" className="bl-more bd-link" aria-expanded={all} aria-controls={id} onClick={() => setAll((x) => !x)}>
          {all
            ? (lang === 'en' ? `Show only the first ${fold}` : `Ver solo los ${fold} primeros`)
            : (lang === 'en' ? `Show all ${rows.length}` : `Ver los ${rows.length}`)}
        </button>
      )}
      {note && <p className="bd-note">{note}</p>}
    </section>
  )
}
