/**
 * «El muro», plano: the readable default of the wall on /gasto-a-ciegas and /captura (owner 2026-11-06: the 3D wall was
 * «broken and unusable»). One row per entity (name on the row), one cell per period, the cell filled to the share with the
 * number printed. Mariana's three lines above it. A real table, so it is its own list view; the 3D wall stays behind a toggle.
 */
import type { ReactNode } from 'react'
import type { Grid, Open } from '@/lib/moneyPaths/muro'
import type { Lang } from '@/lib/moneyPaths/fmt'

export function MuroPlano({ grid, lang, onOpen, tools }: { grid: Grid; lang: Lang; onOpen?: (o: Open) => void; tools?: ReactNode }) {
  const K = lang === 'en' ? ['What you see', 'How to read it', 'What it means'] : ['Qué ves', 'Cómo se lee', 'Qué significa']
  return (
    <figure className="mpp">
      <div className="mpp-lines">
        {grid.lines.map((s, i) => s && <p key={i} className={i === 2 ? 'is-finding' : undefined}><span className="mp-k">{K[i]}</span> {s}{i === 2 && tools ? <> · {tools}</> : null}</p>)}
      </div>
      <div className="mpp-wrap">
        <table className="mpp-t">
          <caption className="sr-only">{grid.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="mpp-nm"><span className="sr-only">{grid.rowHead}</span></th>
              {grid.cols.map((c) => <th key={c.k} scope="col">{c.k}{c.sub && <small>{c.sub}</small>}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.key} className={r.hi ? 'is-hi' : undefined}>
                <th scope="row" className="mpp-nm">
                  {r.open && onOpen
                    ? <button type="button" title={r.full} onClick={() => onOpen(r.open!)}>{r.name}</button>
                    : <span title={r.full}>{r.name}</span>}
                  {r.hi && grid.hiNote && <span className="sr-only"> ({grid.hiNote})</span>}
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className={c.kind ? `is-${c.kind}` : undefined}>
                    <span className="mpp-bar" aria-hidden="true">{c.v != null && <i style={{ width: `${Math.round(c.v * 100)}%` }} />}</span>
                    <span className="mpp-v" aria-hidden="true">{c.label}</span>
                    <span className="sr-only">{c.t}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grid.note && <p className="mpp-note">{grid.note}</p>}
    </figure>
  )
}
