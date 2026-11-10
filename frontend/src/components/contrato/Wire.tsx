/**
 * Wire — «Última hora», the week's events under the head (DESIGN.md §5 / §7). Fed by GET /events;
 * every item is a link (the buyer through EntityIdentityChip, the words to the contract or the record)
 * and carries its own date («1 nov · ayer»): the data is weekly, never «now».
 *
 * Stepped, not rolled (owner 2026-11-02: «it goes by so fast I can't even read it»). A marquee moves the
 * text while it is being read; here one item sits still for dwellMs() (4–8 s by its length) and only the
 * swap moves: 240 ms, opacity + 6 px rise, CSS (off the main thread, one small element). It holds on hover,
 * focus, touch, a hidden tab and «detener»; ‹ › step by hand. Reduced motion: the six newest as a still list.
 * Mount it ONLY where the page has a scoped feed (DESIGN.md §4 risk-3 rule).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { fdate } from '@/components/newtabs/ntShared'
import { SECTORS } from '@/lib/constants'
import { inferSiglasFromName } from '@/lib/entity/siglas'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'
import { ago, dwellMs, eventsQuery, wireItems, type WireItem } from '@/lib/wire'
import { useLang, type Lang } from './nav'

const reduceQ = '(prefers-reduced-motion: reduce)'

/** The buyer's sector as its colour square (as on El Mapa): colour carries the sector, the name rides in the title. */
export function Sw({ id, lang }: { id: number | null; lang: Lang }) {
  const s = id != null ? SECTORS.find((x) => x.id === id) : undefined
  return s ? <i className="pt-sw" style={{ background: s.color }} title={lang === 'en' ? s.nameEN : s.name} aria-hidden="true" /> : null
}

/** The buyer by its siglas when it has them (the full name on hover and for screen readers), as in «Lo más reciente». */
function Buyer({ id, name }: { id: number; name: string }) {
  const sig = inferSiglasFromName(name)
  return sig
    ? <EntityIdentityChip type="institution" id={id} name={name} variant="name" ariaLabel={`${sig} — ${formatEntityName('institution', name, 'full')}`}>{sig}</EntityIdentityChip>
    // no siglas: the short form (≤ 48 characters, «A.C.» cased) keeps the line to two rows on a phone; the full name on hover and for screen readers
    : <EntityIdentityChip type="institution" id={id} name={name} variant="name" ariaLabel={formatEntityName('institution', name, 'full')}>{formatEntityName('institution', name, 'md')}</EntityIdentityChip>
}

function Item({ it, lang }: { it: WireItem; lang: Lang }) {
  return (
    <>
      <time className="ct-wire-when" dateTime={it.date}>{fdate(it.date, lang).replace(/ \d{4}$|, \d{4}$/, '')} · {ago(it.date, lang)}</time>
      <span className="ct-wire-what">
        {it.institutionId != null && it.institution && <><Sw id={it.sectorId} lang={lang} /><Buyer id={it.institutionId} name={it.institution} /></>}{' '}
        <Link to={it.href} className={it.critical ? 'ct-wire-txt is-crit' : 'ct-wire-txt'}>{it.text}</Link>
      </span>
    </>
  )
}

export function Wire() {
  const lang = useLang()
  const en = lang === 'en'
  const [held, setHeld] = useState(false)      // «detener» or a touch: stays until «reanudar»
  const [paused, setPaused] = useState(false)  // hover / focus: lifts when the pointer or focus leaves
  const [hidden, setHidden] = useState(false)
  const [i, setI] = useState(0)
  const [reduce, setReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(reduceQ).matches)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    const mq = matchMedia(reduceQ)
    const onR = () => setReduce(mq.matches)
    document.addEventListener('visibilitychange', on)
    mq.addEventListener('change', onR)
    return () => { document.removeEventListener('visibilitychange', on); mq.removeEventListener('change', onR) }
  }, [])
  const q = useQuery(eventsQuery)  // shared with the Portada's «Lo más reciente»: one fetch
  const items = q.data ? wireItems(q.data.events, lang, formatCompactMXN) : []
  const n = items.length
  const cur = n ? items[i % n] : null
  const still = held || paused || hidden || reduce
  // the buyer's chip reads as siglas or a short name: a third of its letters counts toward the hold
  const dwell = cur ? dwellMs((cur.institution?.length ?? 0) / 3 + cur.text.length) : 0
  const curKey = cur?.key
  useEffect(() => {
    if (still || n < 2 || !curKey) return
    const t = window.setTimeout(() => setI((x) => (x + 1) % n), dwell)
    return () => window.clearTimeout(t)
  }, [still, n, curKey, dwell])

  // while the feed is on its way the strip keeps its height, so the page under it never drops (Portada CLS, 2026-10-29)
  if (q.isPending) return <div className="ct-wire" aria-hidden="true" />
  if (!cur) return null // no feed, no wire: the dochead alone says the cut
  const label = <p className="ct-wire-lbl"><span aria-hidden="true">▲</span>{en ? 'Latest' : 'Última hora'}</p>

  if (reduce) {
    return (
      <section className="ct-wire is-still" aria-label={en ? "This week's events" : 'Los hechos de esta semana'}>
        {label}
        <ul>{items.slice(0, 6).map((it) => <li key={it.key} className="ct-wire-it"><Item it={it} lang={lang} /></li>)}</ul>
      </section>
    )
  }

  const step = (d: number) => { setHeld(true); setI((x) => (x + d + n) % n) }
  return (
    <section
      className="ct-wire"
      aria-label={en ? "This week's events" : 'Los hechos de esta semana'}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPaused(false) }}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse' && !(e.target as Element).closest('button')) setHeld(true) }}  // a tap on «detener» is the button's own toggle
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}
    >
      {label}
      {/* one item at a time; the key remounts the inner line so the swap plays (CSS ct-wire-in). The live region is the
          stable wrapper (a region inserted already full is not announced). Polite only while held: a self-advancing
          region that announces every few seconds would talk over the page */}
      <div className="ct-wire-slot" aria-live={held ? 'polite' : 'off'} aria-atomic="true">
        <p key={cur.key} className="ct-wire-it"><Item it={cur} lang={lang} /></p>
      </div>
      <div className="ct-wire-ctl">
        <button type="button" onClick={() => step(-1)} aria-label={en ? 'Previous event' : 'Hecho anterior'}>‹</button>
        <span className="ct-wire-n">{(i % n) + 1}/{n}</span>
        <button type="button" onClick={() => step(1)} aria-label={en ? 'Next event' : 'Hecho siguiente'}>›</button>
        <button type="button" className="ct-wire-stop" aria-pressed={held} onClick={() => setHeld((h) => !h)}>
          {held ? (en ? 'resume' : 'reanudar') : (en ? 'hold' : 'detener')}
        </button>
      </div>
    </section>
  )
}
