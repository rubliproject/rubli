/**
 * «El sello» — the contract's legal basis as a stamped sheet (owner pick, _explore/dossier_objects_2026-10-29
 * contract-stamp.html, Round 3e). Each stamp = one field of the record, verbatim (lib/contract/objects
 * `stampsOf`): the round one is the exception article, hollow «sin dato» when the record is empty; red only
 * for crítico or a flagged amount. The sheet is real HTML; the relief under it (SelloRelief, lazy three.js)
 * only raises the plates. ↑/↓ walk the stamps (aria-live read-out); the procedure number is a link.
 * No WebGL / «ver en plano» / reduced motion → the same sheet, flat and static.
 */
import { lazy, Suspense, useCallback, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { hasWebGL, type GlStatus as SceneStatus } from '@/components/kit/motion/gl'
import { ringLines, type Stamp } from '@/lib/contract/objects'
import './objects.css'

const SelloRelief = lazy(() => import('./SelloRelief'))

function Ring({ s, id }: { s: Stamp; id: string }) {
  const lines = ringLines(s.lines[0])
  const y0 = 64 - (lines.length - 1) * 7
  return (
    <svg className={`sl-ring${s.none ? ' is-none' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
      <defs><path id={id} d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0" /></defs>
      <circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="34" />
      <text className="sl-ring-t"><textPath href={`#${id}`} startOffset="2%">{s.title}</textPath></text>
      <text className="sl-ring-m" textAnchor="middle">{lines.map((l, i) => <tspan key={i} x="60" y={y0 + i * 14}>{l}</tspan>)}</text>
    </svg>
  )
}

export function ElSello({ stamps, head, footer, lang, compact = false }: { stamps: Stamp[]; head: ReactNode; footer: ReactNode; lang: 'es' | 'en'; /** no hint bar or legend (the contract page, owner 11-06) */ compact?: boolean }) {
  const es = lang === 'es'
  const uid = useId().replace(/:/g, '')
  const [gl] = useState(hasWebGL)
  const [flat, setFlat] = useState(false)
  const [status, setStatus] = useState<SceneStatus>('idle')
  const [cur, setCur] = useState(-1)
  const [read, setRead] = useState('')
  const relief = gl && !flat && status !== 'nogl'
  const readOf = (s: Stamp) => `${s.kind === 'ring' ? (es ? 'Fundamento legal' : 'Legal basis') : s.title}: ${s.lines.join(' · ')}`
  const onStatus = useCallback((s: SceneStatus) => setStatus(s), [])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + stamps.length) % stamps.length
    setCur(n)
    setRead(`${n + 1}/${stamps.length} · ${readOf(stamps[n])}`)
  }

  return (
    <div className="obj-sello">
      <div
        className={`sl-box${relief ? ' is-relief' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={es ? 'El contrato como hoja sellada: cada sello es un campo del registro; ↑ ↓ recorren los sellos' : 'The contract as a stamped sheet: each stamp is a field of the record; ↑ ↓ walk the stamps'}
        onKeyDown={onKey}
      >
        {relief && <Suspense fallback={null}><SelloRelief onStatus={onStatus} /></Suspense>}
        <article className="sl-doc">
          <header className="sl-h">{head}</header>
          <ul className="sl-stamps" aria-label={es ? 'Los sellos' : 'The stamps'}>
            {stamps.map((s, k) => (
              <li
                key={s.key}
                className={`sl-stamp${s.kind === 'ring' ? ' is-ring' : ''}${k === cur ? ' is-cur' : ''}`}
                style={{ ['--i' as string]: k }}
                onPointerEnter={() => setRead(readOf(s))}
                aria-label={readOf(s)}
              >
                <div className={`sl-ink${s.red ? ' is-red' : ''}${s.none ? ' is-none' : ''}`}>
                  {s.kind === 'ring' ? <Ring s={s} id={`sl-rp-${uid}`} /> : (
                    <div className="sl-plate" aria-hidden="true"><b>{s.title}</b>{s.lines.map((l, i) => <span key={i}>{l}</span>)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <footer className="sl-f">{footer}</footer>
        </article>
      </div>
      {!compact && <><div className="obj-bar">
        <p className="obj-read" aria-live="polite">{read || (es ? 'Señale un sello para leerlo · ↑ ↓ los recorren.' : 'Point at a stamp to read it · ↑ ↓ walk them.')}</p>
        {gl && status !== 'nogl' && (
          <button type="button" className="obj-tog" onClick={() => setFlat((f) => !f)}>
            {flat ? (es ? 'ver en relieve ↑' : 'see it in relief ↑') : (es ? 'ver en plano ↓' : 'see it flat ↓')}
          </button>
        )}
      </div>
      <p className="obj-key">
        {es
          ? <><b>Cada sello = un campo del registro</b>, tal como consta: el redondo es el fundamento legal (hueco y «sin dato» si el registro no lo trae); los rectangulares, procedimiento, caso fortuito, vigencia, fallo e indicador de riesgo. <b>Rojo</b> solo si el indicador es crítico o el monto está marcado. El relieve solo da forma; no codifica ningún valor.</>
          : <><b>Each stamp = one field of the record</b>, as recorded: the round one is the legal basis (hollow and «no data» when the record lacks it); the rectangular ones, procedure, caso fortuito, term, award and risk indicator. <b>Red</b> only when the indicator is critical or the amount is flagged. The relief only gives form; it encodes no value.</>}
      </p></>}
    </div>
  )
}
