/**
 * «El tablero» — the ARIA case as the investigator's evidence board (owner pick, caso-board.html, Round 3e).
 * A pin = one fact of the case; a thread ties it to the supplier; ONE thread scale for every group
 * (thickness = the fact's share of its whole, lib/aria/tablero). Volume = TableroScene (lazy three.js), the
 * labels are DOM links that sit right of their pin heads (never over them). Phone = rows, the rest of the pins
 * in a list under the board. No WebGL / «ver en plano» = the same pins as grouped lists.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hasWebGL, type GlStatus as SceneStatus } from '@/components/kit/motion/gl'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useEdition } from '@/lib/theme'
import { capPins, GROUP_ORDER, groupLabel, layoutBoard, type Pin } from '@/lib/aria/tablero'
import '@/components/contract/objects.css'
import './tablero.css'

const TableroScene = lazy(() => import('./TableroScene'))

/** WCAG 2.5.8: the link's box grows to ≥ 24 px tall; the negative margin keeps the line where it was. */
const HIT = 'relative inline-block py-1 -my-1'

/** A pin's label as a link to its dossier (the chip for entities, a plain link for the rest).
 *  Pattern pins take their visible «P1 · name» as the accessible name — p.read repeated it with the <small> confidence. */
export function PinLabel({ p }: { p: Pin }) {
  const name = p.group === 'buyers' && p.href
    ? <EntityIdentityChip type="institution" id={Number(p.href.split('/').pop())} name={p.label} variant="name" className={HIT} ariaLabel={p.read} />
    : p.group === 'pattern'
      ? <EntityIdentityChip type="pattern" id={p.key.slice(1)} name={p.label} variant="name" className={HIT} />
      : p.group === 'case' && p.href
        ? <EntityIdentityChip type="case" id={p.href.split('/').pop() ?? ''} name={p.label} variant="name" className={HIT} ariaLabel={p.read} />
        : p.href ? <Link to={p.href} className={HIT} aria-label={p.read.includes(p.label) ? p.read : `${p.label} · ${p.read}`}>{p.label}</Link> : <span>{p.label}</span>
  return <><b lang={p.enOnly ? 'en' : undefined}>{name}</b><small>{p.sub}</small></>
}

const usePhone = () => {
  const q = '(max-width: 639px)'
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }, [])
  return m
}

export function ElTablero({ pins, centre, lang }: { pins: Pin[]; centre: { name: string; sub: string }; lang: 'es' | 'en' }) {
  const es = lang === 'es'
  // pin heads are ink (adds) and paper + ring (subtracts): ink is black by day, white at night
  const night = useEdition() === 'night'
  const phone = usePhone()
  const [gl] = useState(hasWebGL)
  const [flat, setFlat] = useState(false)
  const [status, setStatus] = useState<SceneStatus>('idle')
  const [read, setRead] = useState('')
  const vol = gl && !flat && status !== 'nogl'
  const { shown, rest } = useMemo(() => capPins(pins, phone), [pins, phone])
  const layout = useMemo(() => layoutBoard(shown, phone), [shown, phone])
  const onStatus = useCallback((s: SceneStatus) => setStatus(s), [])
  const onHot = useCallback((p: Pin | null, walk?: { k: number; n: number }) => setRead(p ? `${walk ? `${walk.k + 1}/${walk.n} · ` : ''}${p.read}` : ''), [])

  return (
    <div className="obj-board">
      {vol ? (
        <div className="tb-stage" style={{ aspectRatio: `${layout.w + 2} / ${layout.h * 0.95 + 2}` }}>
          <Suspense fallback={null}>
            <TableroScene layout={layout} centre={centre} lang={lang} onStatus={onStatus} onHot={onHot}
              label={es ? 'El tablero en volumen: tachuelas e hilos; el grosor del hilo es la parte del hecho en su total; ↑ ↓ recorren las tachuelas, Enter abre' : 'The board in volume: pins and threads; thread thickness is the fact’s share of its whole; ↑ ↓ walk the pins, Enter opens'} />
          </Suspense>
        </div>
      ) : (
        <div className="tb-flat">
          <p className="tb-centre"><b>{centre.name}</b> <small>{centre.sub}</small></p>
          {GROUP_ORDER.filter((g) => pins.some((p) => p.group === g)).map((g) => (
            <section key={g} className="tb-col">
              <h4>{groupLabel(g, lang)}</h4>
              <ul>{pins.filter((p) => p.group === g).map((p) => (
                <li key={p.key} className={p.red ? 'is-red' : p.neg ? 'is-neg' : ''}>
                  <i aria-hidden="true" style={{ ['--w' as string]: p.w ?? 0.6 }} /><PinLabel p={p} />
                </li>
              ))}</ul>
            </section>
          ))}
        </div>
      )}
      <div className="obj-bar">
        <p className="obj-read" aria-live="polite">{read || (es ? 'Señale una tachuela para leerla; clic o Enter abre su expediente.' : 'Point at a pin to read it; click or Enter opens its record.')}</p>
        {gl && status !== 'nogl' && (
          <button type="button" className="obj-tog" onClick={() => setFlat((f) => !f)}>
            {flat ? (es ? 'ver en volumen ↑' : 'see it in volume ↑') : (es ? 'ver en plano ↓' : 'see it flat ↓')}
          </button>
        )}
      </div>
      {vol && rest.length > 0 && (
        <ul className="tb-rest" aria-label={es ? 'Las demás tachuelas' : 'The other pins'}>
          <li className="k">{es ? 'Las demás tachuelas' : 'The other pins'}</li>
          {rest.map((p) => <li key={p.key} className={p.neg ? 'is-neg' : ''}><PinLabel p={p} /></li>)}
        </ul>
      )}
      <p className="obj-key">
        {es
          ? <><b>tachuela</b> = un hecho del expediente ({night ? 'blanca suma, negra' : 'negra suma, blanca'} con anillo resta al indicador, <b>roja</b> = caso documentado) · <b>hilo</b> = su relación con el proveedor · <b>grosor</b> = la parte del hecho en su propio total (del ingreso, de confianza, de lo que lee el modelo, del dinero del proveedor): compara hilos dentro de una columna, no entre columnas; el hilo rojo del caso es fijo. Luz y sombra solo dan forma.</>
          : <><b>pin</b> = one fact of the record ({night ? 'white adds, black' : 'black adds, white'} with a ring subtracts from the indicator, <b>red</b> = documented case) · <b>thread</b> = its link to the supplier · <b>thickness</b> = the fact's share of its own whole (of income, of confidence, of what the model reads, of the supplier's money): compare threads within a column, not across columns; the case's red thread is fixed. Light and shadow only give form.</>}
      </p>
    </div>
  )
}
