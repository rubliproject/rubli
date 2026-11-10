/**
 * The money-path frame shared by /gasto-a-ciegas, /captura and /rastro (concept _explore/money_paths_2026-10-29, «El muro»):
 *   <Escalera>  the four-rung ladder (one registry, lib/moneyPaths/ladder.ts): the page's rungs re-aim its object,
 *               the others link to the page that holds them.
 *   <Objeto>    the object: lazy MuroScene (three.js in vendor-three), «vista plana» = the 2D twin (also the no-WebGL
 *               path), the «Cómo leer» caption, a live read-out, and the ficha (non-modal record card).
 *   <Frame>     the object stays (sticky on desktop) while the chapters scroll past it and re-aim the camera.
 *   <Md>        **bold** / *italic* inside copy strings.
 */
import { Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasWebGL } from '@/components/kit/motion/gl'
import { FlatToggle, MotionTable } from '@/components/kit/motion/MotionTable'
import type { SceneStatus } from '@/components/kit/motion/scene'
import { rungsFor, type MpPage, type RungK } from '@/lib/moneyPaths/ladder'
import type { Open, Spec } from '@/lib/moneyPaths/muro'
import type { Lang } from '@/lib/moneyPaths/fmt'
import '@/components/kit/motion/motion.css'
import './mp.css'

const MuroScene = lazy(() => import('./MuroScene'))

/** «**b**» and «*i*» inside a copy string. */
export function Md({ s }: { s: string }) {
  return <>{s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>)}</>
}

const isRoute = (h: string) => h.startsWith('/')
function Go({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return isRoute(href) ? <Link className={className} to={href}>{children}</Link> : <a className={className} href={href}>{children}</a>
}

export function Escalera({ page, inst, on, onRung, lang }: { page: MpPage; inst: Partial<Record<RungK, string>>; on: RungK | null; onRung: (k: RungK) => void; lang: Lang }) {
  const en = lang === 'en'
  return (
    <nav className="mp-ladder" aria-label={en ? 'From the budget to the contract' : 'Del presupuesto al contrato'}>
      {rungsFor(page, inst, lang).map((r) => {
        const body = <><span className="mp-step"><b>{r.k} · {r.t}</b></span><span className="mp-inst">{r.inst}</span><span className="mp-nosee">{r.nosee}</span></>
        return (
          <div key={r.k} className={`${r.here ? 'is-here' : 'is-away'}${on === r.k ? ' is-on' : ''}`}>
            {r.here
              ? <button type="button" className="mp-main" aria-current={on === r.k ? 'step' : undefined} onClick={() => onRung(r.k)}>{body}</button>
              : <Link className="mp-main" to={r.href!}>{body}</Link>}
            {r.also.length > 0 && <span className="mp-also">{en ? 'also' : 'también'}: {r.also.map((a, i) => <Fragment key={a.href}>{i > 0 && ' · '}<Link to={a.href} title={a.inst}>{a.name} →</Link></Fragment>)}</span>}
          </div>
        )
      })}
    </nav>
  )
}

type Ficha = Extract<Open, { kind: 'ficha' }>
function FichaCard({ f, onClose, lang }: { f: Ficha; onClose: () => void; lang: Lang }) {
  const en = lang === 'en'
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => { ref.current?.focus() }, [f])
  return (
    <div className="mp-ficha" role="dialog" aria-modal="false" aria-label={f.title} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="mp-ficha-h"><b>{f.title}</b><button ref={ref} type="button" onClick={onClose} aria-label={en ? 'close' : 'cerrar'}>✕</button></div>
      <dl>{f.rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      {f.href && <Go className="ct-link" href={f.href}>{f.hrefLabel ?? (en ? 'open in RUBLI →' : 'abrir en RUBLI →')}</Go>}
    </div>
  )
}

/** The object: GL when it can, the twin when it cannot or when the reader asks for «plana». */
export function Objeto({ spec, focus, lang, onOpen }: { spec: Spec; focus: string; lang: Lang; onOpen?: (o: Open) => void }) {
  const en = lang === 'en'
  const nav = useNavigate()
  const [gl] = useState(() => hasWebGL())
  const [flat, setFlat] = useState(false)
  const [status, setStatus] = useState<SceneStatus>('idle')
  const [hot, setHot] = useState('')
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [reduced] = useState(() => typeof matchMedia !== 'undefined' && (matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('rm') === '1'))
  const open = useCallback((o: Open) => {
    if (o.kind === 'ficha') { opener.current = document.activeElement as HTMLElement; setFicha(o) }
    else if (o.kind === 'nav') nav(o.href)
    else onOpen?.(o)
  }, [nav, onOpen])
  const close = () => { setFicha(null); opener.current?.focus() }
  const plano = flat || !gl || status === 'nogl'
  return (
    <figure className={`mp-obj${plano ? ' is-plano' : ''}`}>
      {!plano && (
        <div className="mp-stage">
          <Suspense fallback={<div className="mp-gl" aria-busy="true" />}>
            <MuroScene spec={spec} focus={focus} reduced={reduced} label={`${spec.aria}. ${en ? '↑ ↓ walk the pieces, Enter opens, ← → turn a little.' : '↑ ↓ recorren las piezas, Enter abre, ← → giran un poco.'}`} onStatus={setStatus} onHot={setHot} onOpen={open} />
          </Suspense>
          {ficha && <FichaCard f={ficha} onClose={close} lang={lang} />}
        </div>
      )}
      <div className="mp-bar">
        <p className="mp-read" aria-live="polite">{plano ? '' : hot || (en ? 'Point at a piece to read it; click or Enter opens it.' : 'Señale una pieza para leerla; clic o Enter la abre.')}</p>
        {gl && status !== 'nogl' && <FlatToggle flat={flat} setFlat={setFlat} lang={lang} />}
      </div>
      <figcaption className="mp-cap"><span className="mp-k">{en ? 'How to read' : 'Cómo leer'}</span> <Md s={spec.cap} />{!gl || status === 'nogl' ? <> {en ? 'Without WebGL the object is shown as a list.' : 'Sin WebGL el objeto se muestra como lista.'}</> : null}</figcaption>
      <MotionTable caption={spec.twin.caption} head={spec.twin.head} rows={spec.twin.rows} visible={plano} />
    </figure>
  )
}

export interface FrameChap { k: RungK; id: string; head: ReactNode; body: ReactNode }
/** One frame: the object stays (sticky on desktop), the chapters scroll past and re-aim it. */
export function Frame({ object, chapters, onChapter, cap, lang }: { object: ReactNode; chapters: FrameChap[]; onChapter: (k: RungK) => void; cap?: string; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onChapter); cb.current = onChapter
  useEffect(() => {
    const els = ref.current?.querySelectorAll<HTMLElement>('[data-rung]')
    if (!els?.length) return
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) cb.current(Number(e.target.getAttribute('data-rung')) as RungK) }, { rootMargin: '-35% 0px -55% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [chapters.length])
  // phones: the object sticks to the top, so a chapter scrolled to by the ladder must land below it (measured, not guessed)
  const objRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const o = objRef.current, f = ref.current
    if (!o || !f) return
    const ro = new ResizeObserver(() => f.style.setProperty('--mp-obj-h', `${Math.ceil(o.getBoundingClientRect().height)}px`))
    ro.observe(o)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="mp-frame" ref={ref}>
      <div className="mp-frame-obj" ref={objRef}>{object}</div>
      <div className="mp-chaps">
        {cap && <p className="mp-cap mp-cap-ph"><span className="mp-k">{lang === 'en' ? 'How to read' : 'Cómo leer'}</span> <Md s={cap} /></p>}
        {chapters.map((c) => (
          <section key={c.id} id={c.id} data-rung={c.k} className="mp-chap" aria-labelledby={`${c.id}-h`}>
            {c.head}
            {c.body}
          </section>
        ))}
      </div>
    </div>
  )
}

/** A chapter head: § kicker, numeral, title. */
export function ChapHead({ id, n, kicker, title }: { id: string; n: string; kicker: string; title: string }) {
  return <><p className="mp-kicker">{kicker}</p><h2 id={`${id}-h`} className="mp-h2"><span className="mp-rn">{n}</span>{title}</h2></>
}

export interface RailRow { n: string; t: string; src?: ReactNode; seal?: boolean; /** editor flag only — never rendered (no «POR COPIAR» on a live page) */ todo?: string }
export function Rail({ k, rows, lang }: { k: string; rows: RailRow[]; lang: Lang }) {
  const en = lang === 'en'
  if (!rows.length) return null
  return (
    <aside className="mp-rail" aria-label={en ? 'The reading' : 'La lectura'}>
      <h3><span>{en ? 'The reading' : 'La lectura'}</span><span className="mp-rail-k">{k}</span></h3>
      <ul>{rows.map((r, i) => (
        <li key={i}><b className={r.seal ? 'is-seal' : undefined}>{r.n}</b><span><Md s={r.t} />{r.src ? <span className="mp-src">{r.src}</span> : null}</span></li>
      ))}</ul>
    </aside>
  )
}

/** Scroll to the rung's section on this page. */
export function scrollToRung(id: string | undefined) {
  if (!id) return
  const el = document.getElementById(id)
  if (!el) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}
