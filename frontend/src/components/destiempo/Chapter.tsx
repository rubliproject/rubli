/**
 * The chapter skeleton of «A destiempo» and «El arranque» (concept `_explore/analisis_trio_concepts_2026-10-28`,
 * src/common.js `chapter()`): head (claim + meta · verdict) → cifras → object (graphic + caption) beside «La lectura»
 * → the drill (crumbs + level; under the object, beside the rail on desktop) → notes. The drill stack lives in the URL hash (`#fallo:SEDENA:2025-04-29`) and only
 * moves on a reader's action, so two chapters on one page never overwrite each other's deep link.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { pfLabel, vn, type Claim, type Lang, type Token } from '@/lib/destiempo/lectura'
import './destiempo.css'

export function Tokens({ t, lang }: { t: Token[]; lang: Lang }) {
  return (
    <>
      {t.map((x, i) =>
        typeof x === 'string' ? <span key={i}>{x}</span>
          : 'b' in x ? <b key={i}>{x.b}</b>
            : <span key={i}>{x.vendor != null ? <EntityIdentityChip type="vendor" id={x.vendor} name={x.name} variant="name" className="dt-ent" />
              : <b className="dt-ent">{vn(x.name, 60)}</b>}{x.pf && <span className="dt-pf">{pfLabel(lang)}</span>}</span>,
      )}
    </>
  )
}

/** Drill keys of chapter `id` from the hash (`#id:k1:k2`), or null; `set` replaces the hash, keeping the query. */
export function useHashDrill(id: string): [string[] | null, (keys: string[]) => void] {
  const loc = useLocation(), nav = useNavigate()
  const h = loc.hash.slice(1)
  const keys = h.startsWith(id + ':') ? h.slice(id.length + 1).split(':').map(decodeURIComponent) : null
  const set = useCallback((k: string[]) => nav({ search: loc.search, hash: `#${id}${k.length ? ':' + k.map(encodeURIComponent).join(':') : ''}` }, { replace: true }),
    [nav, loc.search, id])
  return [keys, set]
}

export interface Level { key: string; label: string }
export interface Cifra { n: string; t: string; seal?: boolean }

export interface ChapterProps {
  id: string; level: 1 | 2; lang: Lang
  kicker?: string; source?: string
  h: string; meta: Token[]
  verdict: { read: string; seal?: boolean; lvl: string; tier: string; lede: ReactNode }
  cifras: Cifra[]
  graphic: ReactNode; caption: ReactNode
  railK: string; claims: Claim[]
  drillTitle: string; drillK: string
  /** the open stack (level 1 = the row / cohort); `onCrumb(i)` cuts it to i + 1 levels */
  /** the open level, given how many rows fit beside «La lectura» (desktop: the drill list ends where the rail ends) */
  stack: Level[]; onCrumb: (i: number) => void; drill: (fit: number) => ReactNode
  /** bumped by the chapter on a reader's action: focus moves to the drill heading */
  focusTick: number
  notes: ReactNode
}

export function Chapter(p: ChapterProps) {
  const en = p.lang === 'en'
  const H = p.level === 1 ? 'h1' : 'h2'
  const h3 = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (p.focusTick) h3.current?.focus() }, [p.focusTick])
  // rows that fit between the first drill row and the rail's end (proof:ui RAGGED); 14 on the phone, 6–40 on desktop
  const rail = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(14)
  useLayoutEffect(() => {
    // ponytail: converges over renders (adds or drops whole rows until the list ends within one row of the rail)
    const measure = () => {
      const lis = host.current?.querySelectorAll('.dt-rows li:not(.hd)')
      if (!rail.current || !lis?.length || window.innerWidth < 600) return setFit((f) => (f === 14 ? f : 14))
      const top = lis[0].getBoundingClientRect().top, bottom = lis[lis.length - 1].getBoundingClientRect().bottom
      const step = Math.floor((rail.current.getBoundingClientRect().bottom - bottom) / ((bottom - top) / lis.length))
      if (step) setFit((f) => Math.max(6, Math.min(40, f + step)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (rail.current) ro.observe(rail.current)
    void document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [p.drill])
  return (
    <section className={`dt-chapter${p.level === 2 ? ' is-sub' : ''}`} id={p.id} aria-labelledby={`${p.id}-h`}>
      {p.level === 2 && <div className="dt-chk"><span className="dt-sc">{p.kicker}</span><span className="dt-mono">{p.source}</span></div>}
      <div className="dt-head">
        <div>
          <H className="dt-claim" id={`${p.id}-h`}>{p.h}</H>
          <p className="dt-meta"><Tokens t={p.meta} lang={p.lang} /></p>
        </div>
        <div className="dt-verdict">
          <span className={`dt-read${p.verdict.seal ? ' is-seal' : ''}`}>{p.verdict.read}</span>
          <span><span className="dt-lvl">{p.verdict.lvl}</span> <span className="dt-tier">· {p.verdict.tier}</span></span>
          <p>{p.verdict.lede}</p>
        </div>
      </div>
      <dl className="dt-cifras">
        {p.cifras.map((c, i) => <div key={i}><dt className="sr-only">{c.t}</dt><dd><b className={c.seal ? 'is-seal' : undefined}>{c.n}</b><span aria-hidden="true">{c.t}</span></dd></div>)}
      </dl>
      <div className="dt-object">
        <div className="dt-main">
          <figure className="dt-fig">
            {p.graphic}
            <figcaption className="dt-caption">{p.caption}</figcaption>
          </figure>
          <div className="dt-drill">
            <h3 ref={h3} tabIndex={-1}><span>{p.drillTitle}</span><span className="dt-k">{p.drillK}</span></h3>
            <nav className="dt-crumbs" aria-label={en ? 'Drill level' : 'Nivel del expediente'}>
              {p.stack.map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="dt-sep" aria-hidden="true"> › </span>}
                  <a href={`#${p.id}:${p.stack.slice(0, i + 1).map((x) => encodeURIComponent(x.key)).join(':')}`} aria-current={i === p.stack.length - 1 ? 'location' : undefined}
                    onClick={(e) => { e.preventDefault(); p.onCrumb(i) }}>{s.label}</a>
                </span>
              ))}
            </nav>
            <div aria-live="polite" ref={host}>{p.drill(fit)}</div>
          </div>
        </div>
        <aside className="dt-rail" ref={rail} aria-label={en ? 'The reading' : 'La lectura'}>
          <h3><span>{en ? 'The reading' : 'La lectura'}</span><span className="dt-k">{p.railK}</span></h3>
          <ul className="dt-lectura">
            {p.claims.map((c) => (
              <li key={c.key}>
                <b className="dt-n" style={c.color ? { color: c.color } : undefined}>{c.fig}</b>
                <span><Tokens t={c.t} lang={p.lang} /><span className="dt-src">{c.src}</span></span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="dt-notas"><span className="dt-sc">{en ? 'Notes' : 'Notas'}</span> {p.notes}</div>
    </section>
  )
}

/** One transparent native button per SVG row, positioned over it: the SVG stays decorative (role="img"). */
export function RowHits({ rows, H, pressed, onOpen, label }: { rows: { key: string; y0: number; h: number; name: string }[]; H: number; pressed: string | null; onOpen: (k: string) => void; label: string }) {
  return (
    <div className="dt-hits" role="group" aria-label={label}>
      {rows.map((r) => (
        <button key={r.key} type="button" aria-label={r.name} aria-pressed={pressed === r.key}
          style={{ top: `${(r.y0 / H) * 100}%`, height: `${(r.h / H) * 100}%` }} onClick={() => onOpen(r.key)} />
      ))}
    </div>
  )
}

/** «N más en la lista completa (CSV) →» — the route's list view. */
export function More({ n, to, lang }: { n: number; to: string; lang: Lang }) {
  if (n <= 0) return null
  return <li className="dt-more"><Link to={to}>{lang === 'en' ? `${n.toLocaleString('en-US')} more in the full list (CSV) →` : `${n.toLocaleString('es-MX')} más en la lista completa (CSV) →`}</Link></li>
}

/** Phone layout below 600 px (the concept's breakpoint). */
export const isPhoneW = (w: number) => w > 0 && w < 560
