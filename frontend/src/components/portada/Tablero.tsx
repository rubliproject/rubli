/**
 * «Contratos recientes» (was «Contratos de la semana») — the Portada's split-flap board (v2 2026-11-03, owner: «no airplane … put some symbols,
 * put other columns, describe it a little better»; «unreadable names … it is all black»). Was «Salidas»: the board (owner 2026-11-02: «if this new info about contracts is gonna be our
 * centerpiece, it better look like an airport dashboard … a big scoreboard»; «too much data, too spread out, make it
 * dynamic»). Under El Mapa, full width, one group at a time (12 rows at desktop, 8 on the phone), the groups as tabs.
 *
 * A row: date · sector (dot + name) · BUYER (published siglas, else the short name; full name in title/label) ·
 * VENDOR · amount · procedure glyph (■ directa · ● licitación · ◐ invitación · ○ other tender) · indicator chip
 * (getRiskLevelFromScore levels, low = muted outline, never green) · status (NUEVO since the last visit ·
 * REVISAR > 10,000 MDP). A legend row reads every symbol. Light board by day, dark by night (--board-* tokens). Every row is a door to its contract (stretched link; the chips
 * stay their own doors). The approved exception to «no big numerals» (DESIGN.md §0.1): this board only, 20 px rows.
 *
 * Sources of «new», each dated: the weekly ComprasMX load (GET /stats/data-cut), the week's events by contract date
 * (GET /events, digest() groups), and the newest Focos Rojos run (GET /aria/stats latest_run) with its «Nuevos» that
 * kept getting ComprasMX money after CompraNet closed. A persona física is named and labelled, never by RFC (the events
 * feed and the Nuevos API flag `persona_fisica`; owner policy 2026-10-29).
 *
 * Motion (skills: animate · motion-design · rubli-motion-viz · animation-performance): a station board. Every
 * BOARD_CYCLE_MS (20 s) the window moves one contract down its group (the contract groups roll past the week
 * into older contracts, newest first, paged lazily: PAGE 24 up to POOL_MAX 200; a heavy rule marks the week's end) and every cell flips
 * once and is never blank: the new face, opaque on the board colour, falls from the top hinge over the old one
 * (rotateX −90° → −4° on --ease-swap, then a small settle to 0 on --ease-out: FLAP_MS 750 ms, owner «too fast»); the old face stays whole underneath and leaves only when the flap has
 * landed. Rows staggered 75 ms, cells 30 ms (up to 96 flaps, the last lands at ≈ 1.8 s). Rows are keyed by position, so React swaps cell content instead of unmounting the list. Rows are one line each (buyer, vendor
 * clamp with «…»; the category shows its short label, lib/categoryShortName, whole), so nothing reflows. At the end of a pool the next group comes up. It holds on hover,
 * focus, touch, «detener», a hidden tab and when scrolled out of view; reduced motion: no flip, no cycling.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api, ariaApi } from '@/api/client'
import { ariaRosettesQuery } from '@/api/entityQueries'
import type { AriaStatsResponse } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMediaQuery } from '@/hooks/useIsMobile'
import { fdate, nf } from '@/components/newtabs/ntShared'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { categoryShortName } from '@/lib/categoryShortName'
import { institutionShortName } from '@/lib/institutionShortName'
import { useArrivals } from '@/lib/arrivals'
import { formatEntityName } from '@/lib/entity/format'
import { useLastGood } from '@/lib/lastGood'
import { useDataCutInfo } from '@/lib/useDataCut'
import { formatCompactMXN, formatCompactUSD } from '@/lib/utils'
import { ago, boardWindow, digest, eventsQuery, weekOf, type EventsFeed, type FeedEvent } from '@/lib/wire'
import type { Lang } from '@/components/contrato/nav'

export type Level = 'critical' | 'high' | 'medium' | 'low'
/** directa ■ · licitacion ● · invitacion ◐ · concurso ○ (a tender of unknown kind: feeds before 2026-11-03) · otro ○ */
export type Proc = 'directa' | 'licitacion' | 'invitacion' | 'concurso' | 'otro'
type Tab = 'award' | 'critical' | 'first_supplier' | 'direct_spike' | 'nuevos'
interface Row {
  key: string
  date: string
  buyer: { id: number | null; name: string; siglas?: string | null; sector: number | null } | null
  vendor: ReactNode
  /** The contract's spending category (/categories/:id), when the feed carries it. */
  category: { id: number; es: string; en: string } | null
  /** The vendor (or, for a direct-award rise, the buyer) in words: the row link's accessible name. */
  who: string
  amount: number | null
  flagged?: boolean
  proc: Proc | null
  status: { level: Level } | null
  href: string
}

/** Rows in the window: 12 at desktop, 8 on the phone's three-line cards (owner 2026-11-03; ≤ 900 px = the phone grid in kit.css). */
const ROWS_DESK = 12
const ROWS_PHONE = 8
/** Rows per group from the first feed (the Focos Rojos and direct-award groups step through these). */
const POOL = 24
/** The contract groups roll on past the week into older contracts, newest first: GET /events?type&offset, one page
 *  of PAGE at a time as the window nears the end of what is loaded, up to POOL_MAX (owner 2026-11-03). */
const ROLL: ReadonlySet<Tab> = new Set<Tab>(['award', 'critical', 'first_supplier'])
const PAGE = 24
const POOL_MAX = 200
const DAY = 86_400_000
/** One step of the board (owner 2026-11-03: «every 20 seconds»): the window moves down one contract — every row
 *  flips — and at the end of a group's pool the next group comes up. */
const BOARD_CYCLE_MS = 20_000
/** One cell's flap: the new face falls over the old one, which stays whole underneath until the flap has landed. */
const FLAP_MS = 750
const reduceQ = '(prefers-reduced-motion: reduce)'
export const LEVEL: Record<Level, { es: string; en: string }> = {
  critical: { es: 'Crítico', en: 'Critical' }, high: { es: 'Alto', en: 'High' }, medium: { es: 'Medio', en: 'Medium' }, low: { es: 'Bajo', en: 'Low' },
}
/** Plain tab names (owner 2026-11-03: «what does that mean?»), each with the one line shown under the tabs. Every line
 *  says only what the group's query selects (scripts/precompute_events.py; GET /aria/rosettes?set=nuevos). */
const TAB: Record<Tab, { es: string; en: string }> = {
  award: { es: 'Contratos grandes', en: 'Large contracts' },
  critical: { es: 'Contratos de riesgo crítico', en: 'Critical-risk contracts' },
  first_supplier: { es: 'Empresas nuevas', en: 'New companies' },
  direct_spike: { es: 'Dependencias que licitan menos', en: 'Agencies tendering less' },
  nuevos: { es: 'Focos Rojos sin caso público', en: 'Red Flags, no public case' },
}
const TAB_DESC: Record<Tab, { es: string; en: string }> = {
  award: { es: 'Contratos de 100 millones de pesos o más.', en: 'Contracts of 100 million pesos or more.' },
  critical: {
    es: 'Contratos de 10 millones de pesos o más con indicador de riesgo de 0.60 o más: los que más se parecen a casos documentados.',
    en: 'Contracts of 10 million pesos or more with a risk indicator of 0.60 or above: the ones most like documented cases.',
  },
  first_supplier: {
    es: 'Empresas o personas que firmaron su primer contrato federal registrado desde 2002, de 10 millones de pesos o más.',
    en: 'Companies or individuals signing their first federal contract on record since 2002, of 10 million pesos or more.',
  },
  direct_spike: {
    es: 'Dependencias que en los últimos 14 días compraron sin licitación una parte mucho mayor de lo habitual (25 puntos o más sobre sus 12 meses previos).',
    en: 'Agencies that in the last 14 days bought far more than usual without a tender (25 points or more above their previous 12 months).',
  },
  // shown with «Focos Rojos» as a link (see the note under the tabs)
  nuevos: {
    es: 'Empresas o personas en Focos Rojos, nuestra lista de proveedores para revisar, que ningún caso público ha documentado; el monto es lo que han cobrado en ComprasMX desde el cierre de CompraNet (28 sep 2025). Estar ahí no prueba nada.',
    en: 'Companies or individuals in Red Flags, our list of suppliers to review, that no public case has documented; the amount is what they have been paid on ComprasMX since CompraNet closed (Sep 28, 2025). Being there proves nothing.',
  },
}
export const PROC: Record<Proc, { es: string; en: string; long: { es: string; en: string } }> = {
  directa: { es: 'Directa', en: 'Direct', long: { es: 'Adjudicación directa (sin concurso)', en: 'Direct award (no tender)' } },
  licitacion: { es: 'Licitación', en: 'Open tender', long: { es: 'Licitación pública', en: 'Open public tender' } },
  invitacion: { es: 'Invitación', en: 'Invitation', long: { es: 'Invitación a cuando menos tres', en: 'Restricted tender (3+ invited)' } },
  concurso: { es: 'Concurso', en: 'Tender', long: { es: 'Con concurso', en: 'Tendered' } },
  otro: { es: 'Otro', en: 'Other', long: { es: 'Otro procedimiento', en: 'Other procedure' } },
}
const catOf = (d: Record<string, unknown> | null | undefined): Row['category'] =>
  typeof d?.category_id === 'number' && typeof d.category_es === 'string'
    ? { id: d.category_id, es: d.category_es, en: typeof d.category_en === 'string' ? d.category_en : d.category_es }
    : null
const procOf = (d: Record<string, unknown> | null | undefined): Proc | null => {
  const p = d?.procedure
  if (p === 'directa' || p === 'licitacion' || p === 'invitacion' || p === 'otro') return p
  return d?.direct_award == null ? null : d?.direct_award ? 'directa' : 'concurso'
}
const levelOf = (s: string | null | undefined): Level | null => (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' ? s : null)

const sectorOf = (id: number | null | undefined) => (id != null ? SECTORS.find((s) => s.id === id) : undefined)

/** The sector's dot (its canonical colour; the edition swaps it) — identity rides in the name beside it, never colour alone. */
export function Dot({ id, lang }: { id: number | null | undefined; lang: Lang }) {
  const s = sectorOf(id)
  return s
    ? <i className="bd-dot" style={{ background: s.color }} title={lang === 'en' ? s.nameEN : s.name} aria-hidden="true" />
    : <i className="bd-dot is-none" aria-hidden="true" />
}

/** The buyer in board ink (≥ 4.5:1 both editions), one line: institutionShortName (siglas from the data, else the vetted
 *  acronym map, else the compacted name, clamped with «…»); the full name in the title and the label. */
export function Buyer({ b, lang }: { b: NonNullable<Row['buyer']>; lang: Lang }) {
  const { short, full } = institutionShortName(b.name, b.siglas)
  const sec = sectorOf(b.sector)
  const body = <>
    <Dot id={b.sector} lang={lang} />
    {sec && <span className="sr-only">{lang === 'en' ? `${sec.nameEN} sector: ` : `Sector ${sec.name}: `}</span>}
    {short}
  </>
  if (b.id == null) return <span title={full}>{body}</span>
  return (
    <EntityIdentityChip type="institution" id={b.id} name={b.name} variant="name" className="bd-chip" ariaLabel={short === full ? full : `${short} — ${full}`}>
      {body}
    </EntityIdentityChip>
  )
}

/** The procedure's glyph (shape, never colour: square = no tender, circles = tendered, the approved dossier vocabulary). */
export const Glyph = ({ p }: { p: Proc }) => <i className={`bd-g is-${p}`} aria-hidden="true" />

function eventRow(e: FeedEvent, lang: Lang): Row {
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const buyer = e.institution ? { id: e.institution_id, name: e.institution, siglas: e.institution_siglas, sector: e.sector_id } : null
  if (e.type === 'direct_spike') {
    const d = e.detail ?? {}
    const was = Number(d.trailing_share ?? 0)
    const now = Number(d.recent_share ?? 0)
    const p = (x: number) => `${Math.round(x * 100)}${lang === 'en' ? '%' : ' %'}`
    return {
      key: `ds-${e.institution_id}`, date: e.date, buyer, who: e.institution ?? '', category: null,
      // before → now: the share of value awarded with no tender, its 12-month average against the last 14 days
      vendor: (
        <span className="bd-shift">
          <span className="bd-pair" aria-hidden="true"><i style={{ width: `${was * 100}%` }} /><i style={{ width: `${now * 100}%` }} /></span>
          <span className="sr-only">{L(`Antes ${p(was)}, ahora ${p(now)}`, `Before ${p(was)}, now ${p(now)}`)}</span>
          <span aria-hidden="true"><span className="bd-was">{p(was)}</span> → <b>{p(now)}</b></span>
        </span>
      ),
      amount: typeof d.recent_da_value === 'number' ? d.recent_da_value : null,
      proc: 'directa', status: null,
      href: e.institution_id != null ? `/institutions/${e.institution_id}` : '/contracts',
    }
  }
  return {
    key: `${e.type}-${e.contract_id}`, date: e.date, buyer,
    who: e.vendor_id != null && e.vendor
      ? `${formatEntityName('vendor', e.vendor, 'full')}${e.persona_fisica ? L(' (persona física)', ' (individual)') : ''}`
      : L('proveedor sin nombre publicado', 'supplier with no published name'),
    category: catOf(e.detail),
    vendor: e.vendor_id != null && e.vendor
      ? <><EntityIdentityChip type="vendor" id={e.vendor_id} name={e.vendor} variant="name" className="bd-chip" />{e.persona_fisica && <span className="bd-dim">{L(' · persona física', ' · individual')}</span>}</>
      : <span className="bd-dim">{L('Nombre no publicado', 'Name not published')}</span>,
    amount: e.amount, flagged: Boolean(e.detail?.flagged),
    proc: procOf(e.detail),
    status: levelOf(e.risk_level) ? { level: levelOf(e.risk_level)! } : null,
    href: e.contract_id != null ? `/contracts/${e.contract_id}` : '/contracts',
  }
}

export function Tablero({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const eq = useQuery(eventsQuery)
  const { data: feed, savedAt } = useLastGood('events-feed', eq.data, eq.isError)
  const w = useDataCutInfo()
  const st = useQuery<AriaStatsResponse>({ queryKey: ['aria-stats'], queryFn: () => ariaApi.getStats(), staleTime: 5 * 60_000 })
  const nq = useQuery(ariaRosettesQuery(0, 'nuevos'))
  const run = st.data?.latest_run?.completed_at ?? null

  const groups = useMemo(() => {
    const out = new Map<Tab, { n: number; rows: Row[] }>()
    if (feed) {
      const dg = digest(feed, POOL)
      const week = weekOf(feed.events)
      for (const g of dg?.groups ?? []) out.set(g.type, { n: week.filter((e) => e.type === g.type).length, rows: g.items.map((e) => eventRow(e, lang)) })
    }
    const nv = (nq.data?.items ?? []).filter((v) => (v.post_blackout_mxn ?? 0) > 0 && v.vendor_name)
      .sort((a, b) => (b.post_blackout_mxn ?? 0) - (a.post_blackout_mxn ?? 0))
    if (run && nv.length) {
      out.set('nuevos', {
        n: nv.length,
        rows: nv.slice(0, POOL).map((v) => ({
          key: `nv-${v.vendor_id}`, date: run, who: formatEntityName('vendor', v.vendor_name!, 'full'), category: null,
          buyer: v.top_institution ? { id: v.top_institution_id ?? null, name: v.top_institution, sector: null } : null,
          vendor: <>
            <EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name!} variant="name" className="bd-chip" />
            {/* owner policy 2026-10-29: a persona física's published name, labelled; never an RFC */}
            {v.persona_fisica && <span className="bd-dim">{L(' · persona física', ' · individual')}</span>}
          </>,
          amount: v.post_blackout_mxn ?? null, proc: null,
          status: v.avg_risk_score != null ? { level: getRiskLevelFromScore(v.avg_risk_score) } : null,
          href: `/aria/caso/${v.vendor_id}`,
        })),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, nq.data, run, lang])
  const allRows = useMemo(() => [...groups.values()].flatMap((g) => g.rows), [groups])
  const settled = !!feed && !nq.isPending && !st.isPending
  const arr = useArrivals(settled && allRows.length ? allRows : undefined, (r) => r.key, (r) => r.date, 'portada-board')
  // stable across re-renders: the 20 s timer depends on it
  const tabs = useMemo(() => (['award', 'critical', 'first_supplier', 'direct_spike', 'nuevos'] as Tab[]).filter((t) => groups.has(t)), [groups])

  const [tab, setTab] = useState<Tab | null>(null)
  const [held, setHeld] = useState(false)
  const [paused, setPaused] = useState(false)
  const [offset, setOffset] = useState(0)
  // the board sleeps when nobody can see it: a hidden tab or scrolled out of view
  const [asleep, setAsleep] = useState(false)
  const section = useRef<HTMLElement>(null)
  // the rows on the board before the current step: each cell keeps its old content until its own flap swaps it
  const last = useRef<{ k: string; rows: Row[] }>({ k: '', rows: [] })
  const prev = useRef<Row[]>([])
  useEffect(() => {
    let hidden = document.hidden
    let off = false
    const set = () => setAsleep(hidden || off)
    const onVis = () => { hidden = document.hidden; set() }
    document.addEventListener('visibilitychange', onVis)
    const io = typeof IntersectionObserver !== 'undefined' && section.current
      ? new IntersectionObserver(([e]) => { off = !e.isIntersecting; set() })
      : null
    if (io && section.current) io.observe(section.current)
    return () => { document.removeEventListener('visibilitychange', onVis); io?.disconnect() }
  }, [])
  const ROWS = useMediaQuery('(max-width: 900px)') ? ROWS_PHONE : ROWS_DESK
  const [reduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(reduceQ).matches)
  const [, tick] = useState(0)
  const cur = tab && groups.has(tab) ? tab : tabs[0] ?? null
  useEffect(() => {  // «hace N días» stays true while the page sits open
    const t = window.setInterval(() => tick((x) => x + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])
  // a contract group rolls on into older contracts: its pages, newest first (the first feed's rows stand in until
  // page one lands; same order, so nothing reorders when it does)
  const roll = cur && ROLL.has(cur) ? cur : null
  const pq = useInfiniteQuery({
    queryKey: ['events', 'board', roll],
    enabled: !!roll,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => (await api.get<EventsFeed>('/events', { params: { type: roll, limit: PAGE, offset: pageParam } })).data,
    getNextPageParam: (last, pages) => {
      const n = pages.length * PAGE
      // an API without `offset` answers page one again: stop rather than repeat it
      if (pages.length > 1 && last.events[0]?.contract_id === pages[0].events[0]?.contract_id) return undefined
      return last.events.length === PAGE && n < POOL_MAX && (last.total ?? 0) > n ? n : undefined
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const rows = useMemo(() => {
    if (!cur) return []
    if (!roll || !pq.data) {
      // stand-in: the first feed's events of this group, in the API's order
      return roll && feed ? feed.events.filter((e) => e.type === roll).map((e) => eventRow(e, lang)) : groups.get(cur)?.rows ?? []
    }
    const seen = new Set<string>()
    return pq.data.pages.flatMap((p) => p.events).map((e) => eventRow(e, lang))
      .filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))).slice(0, POOL_MAX)
  }, [cur, roll, pq.data, feed, groups, lang])
  const pool = rows.length
  // a failed page ends the roll (v5 keeps hasNextPage true after an error): the group then hands on as before
  const more = !!pq.hasNextPage && !pq.isFetchNextPageError
  const { fetchNextPage, isFetchingNextPage } = pq
  const live = !held && !paused && !asleep && !reduce && !!cur && (pool > ROWS || more || tabs.length > 1)
  // a step lasts BOARD_CYCLE_MS from when it began (or resumed), even if a page lands in the middle of it
  const stepAt = useRef(0)
  useEffect(() => { stepAt.current = Date.now() }, [cur, offset, live])
  useEffect(() => {
    if (!live || !cur) return
    const t = window.setTimeout(() => {
      if (offset + ROWS < pool) setOffset(offset + 1)  // the next contract in: every row flips one place up
      else if (more) void fetchNextPage()  // the next page is late: hold this step, then go on down
      else { setOffset(0); if (tabs.length > 1) setTab(tabs[(tabs.indexOf(cur) + 1) % tabs.length]) }
    }, Math.max(0, BOARD_CYCLE_MS - (Date.now() - stepAt.current)))
    return () => window.clearTimeout(t)
  }, [live, cur, offset, pool, more, tabs, fetchNextPage, ROWS])
  // the next page comes in a few steps before the window reaches the end of what is loaded
  useEffect(() => {
    if (live && more && !isFetchingNextPage && offset + ROWS + 4 >= pool) void fetchNextPage()
  }, [live, more, offset, pool, isFetchingNextPage, fetchNextPage, ROWS])

  useEffect(() => {
    const b = cur ? document.getElementById(`bd-tab-${cur}`) : null
    const row = b?.parentElement
    if (b && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, b.offsetLeft - row.offsetLeft - 16), behavior: reduce ? 'auto' : 'smooth' })
  }, [cur, reduce])

  // the board never shrinks while it cycles: the page under it must not jump (the tallest group seen sets the floor)
  const panel = useRef<HTMLDivElement>(null)
  const floor = useRef(0)
  const floorW = useRef(0)
  useLayoutEffect(() => {
    const el = panel.current
    if (!el || !el.querySelector('.bd-list li')) return  // the loading skeleton never sets the floor
    // ponytail: re-measured on render only; a resize keeps the old floor until the next group change
    if (el.offsetWidth !== floorW.current) { floorW.current = el.offsetWidth; floor.current = 0 }
    el.style.minHeight = ''
    floor.current = Math.max(floor.current, el.offsetHeight)
    el.style.minHeight = `${floor.current}px`
  })

  if (!feed && eq.isError) return null
  const g = cur ? groups.get(cur) : undefined
  const pick = (t: Tab) => { setTab(t); setOffset(0); setHeld(true) }
  // a refetch can shrink the pool: never show a short window
  const off = Math.min(offset, Math.max(0, rows.length - ROWS))
  // the week = the 7 days ending at the newest event (weekOf, the tab counts' cut); the first older row on the board
  // carries a heavy rule. The week's rows stay pinned above it and only the older rows roll (boardWindow), so the
  // rows above the rule always equal the tab's count.
  const newest = feed?.events.length ? Math.max(...feed.events.map((e) => Date.parse(e.date))) : null
  const past = (r: Row) => newest != null && Date.parse(r.date) <= newest - 7 * DAY
  const lead = rows.findIndex(past)
  const week = roll ? (lead < 0 ? rows.length : lead) : 0
  const shown = boardWindow(rows, week, ROWS, off)
  // pinned rows never flap: the rolling rows' stagger starts at the first row under the rule
  const pinN = week > 0 && week < ROWS ? week : 0
  const all = rows
  // the category column shows only when this group's rows carry one (feeds before 2026-11-03 do not); read from the
  // first page only, so a later page never changes the columns mid-cycle
  const hasCat = all.slice(0, PAGE).some((r) => r.category)
  // «Más sin concurso»: every row is a direct award with no indicator, so those two columns drop out
  const ds = cur === 'direct_spike'
  // a column empty for the whole group drops out (sector: the Focos Rojos rows carry no buyer sector; procedure: they
  // are suppliers, not contracts)
  const hasSec = all.some((r) => r.buyer?.sector != null)
  const hasProc = !ds && all.some((r) => r.proc)
  const firstPast = shown.findIndex((r, i) => past(r) && !past(i > 0 ? shown[i - 1] : all[off - 1] ?? r))
  const onKey = (e: KeyboardEvent) => {
    if (!cur || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    const i = (tabs.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    pick(tabs[i]);
    (document.getElementById(`bd-tab-${tabs[i]}`) as HTMLButtonElement | null)?.focus()
  }
  // ES: MDP (formatCompactMXN); EN: US$ at the row year's Banxico FIX mean (formatCompactUSD → lib/exchangeRates)
  const money = (amt: number, date: string) => (en ? formatCompactUSD(amt, Number(date.slice(0, 4))) : formatCompactMXN(amt))
  // a cell's flap starts at row × 75 ms + column × 30 ms and lasts FLAP_MS; the last of the 96 lands at ≈ 1.8 s
  const at = (r: number, c: number) => Math.max(0, r - pinN) * 75 + c * 30
  const step = `${cur ?? 'none'}-${off}`
  if (last.current.k !== step) { prev.current = last.current.rows; last.current = { k: step, rows: shown } } else last.current.rows = shown
  const cellsOf = (r: Row): Array<{ cls: string; node: ReactNode; title?: string }> => {
    const sec = sectorOf(r.buyer?.sector)
    return [
      { cls: 'bd-age', title: ago(r.date, lang), node: <time dateTime={r.date}>{fdate(r.date, lang).replace(/,? \d{4}$/, '')}</time> },
      { cls: 'bd-sec', node: sec ? <><Dot id={sec.id} lang={lang} />{L(sec.name, sec.nameEN)}</> : '—' },
      { cls: 'bd-buyer', node: r.buyer ? <Buyer b={r.buyer} lang={lang} /> : '—' },
      { cls: 'bd-vendor', node: r.vendor },
      {
        cls: 'bd-cat',
        node: r.category
          ? <EntityIdentityChip type="category" id={r.category.id} name={L(r.category.es, r.category.en)} variant="name" className="bd-chip" ariaLabel={L(r.category.es, r.category.en)}>{categoryShortName(r.category.id, L(r.category.es, r.category.en), lang)}</EntityIdentityChip>
          : <span className="bd-dim" title={L('El registro no trae categoría', 'The record carries no category')}>—</span>,
      },
      {
        cls: 'bd-amt r',
        node: <Link to={r.href} className="bd-go" aria-label={`${r.who ? `${r.who}, ` : ''}${r.amount != null ? money(r.amount, r.date) : ''} — ${cur === 'direct_spike' ? L('ver comprador', 'open buyer') : cur === 'nuevos' ? L('ver caso', 'open case') : L('ver contrato', 'open contract')}`}>{r.amount != null ? money(r.amount, r.date) : L('ver', 'open')}</Link>,
      },
      {
        cls: 'bd-proc',
        title: r.proc ? L(PROC[r.proc].long.es, PROC[r.proc].long.en) : undefined,
        node: r.proc ? <><Glyph p={r.proc} /><span className="bd-pn">{L(PROC[r.proc].es, PROC[r.proc].en)}</span></> : '—',
      },
      {
        cls: 'bd-risk',
        node: <>
          {r.status && (
            <span className={`bd-st is-${r.status.level}`}>
              <span className="sr-only">{L('Indicador de riesgo: ', 'Risk indicator: ')}</span>
              {L(LEVEL[r.status.level].es, LEVEL[r.status.level].en)}
            </span>
          )}
          {arr.isNew(r.key) && <span className="bd-tag is-new">{L('Nuevo', 'New')}</span>}
          {r.flagged && <span className="bd-tag is-flag" title={L('Más de 10,000 MDP: marcado para revisión manual', 'Above MXN 10B: flagged for manual review')}>{L('Revisar', 'Review')}</span>}
        </>,
      },
    ]
  }

  return (
    <section
      ref={section}
      className="bd"
      aria-labelledby="bd-h"
      aria-busy={!feed || undefined}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPaused(false) }}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse' && !(e.target as Element).closest('button')) setHeld(true) }}
      onFocus={(e) => { if ((e.target as Element).matches(':focus-visible') && !(e.target as Element).closest('.bd-stop')) setPaused(true) }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}
    >
      <div className="bd-head">
        <h2 id="bd-h" className="bd-h">{L('Contratos recientes', 'Recent contracts')}</h2>
        <p className="bd-when">
          {w?.weekly_finished
            ? <>{L('Carga del', 'Load of')} <b>{fdate(w.weekly_finished, lang)}</b> ({ago(w.weekly_finished, lang)}){w.weekly_new_contracts ? <> · <b>{nf(w.weekly_new_contracts)}</b> {L('contratos nuevos en la semana', 'new contracts this week')}</> : null}{w.weekly_status === 'degraded' ? <> · <span className="bd-warn">{L('actualización parcial', 'partial update')}</span></> : null}{w.next_update ? <> · {L('próxima', 'next')}: <b>{fdate(w.next_update, lang)}</b></> : null}</>
            : L('ComprasMX, semanal', 'ComprasMX, weekly')}
        </p>
        <p className="bd-desc">
          {L('Los contratos federales que publicó ComprasMX, del más reciente al más antiguo', 'The federal contracts published on ComprasMX, newest first')}
          {w?.data_cut ? <>{L(', con corte al ', ', cut on ')}<b>{fdate(w.data_cut, lang)}</b></> : null}
          {L('. El tablero sigue bajando hacia contratos anteriores: una raya gruesa marca dónde termina la última semana, y la cifra de cada grupo cuenta solo esa semana. Cada fila: quién compra, a quién, cuánto, cómo se adjudicó y su indicador de riesgo.', '. The board keeps rolling down into older contracts: a heavy rule marks where the last week ends, and each group’s count is that week only. Each row: who buys, from whom, how much, how it was awarded and its risk indicator.')}
        </p>
      </div>
      <div className="bd-bar">
        <div className="bd-tabs" role="tablist" aria-label={L('Grupos', 'Groups')} onKeyDown={onKey}>
          {tabs.map((t) => (
            <button
              key={t} id={`bd-tab-${t}`} type="button" role="tab" aria-selected={t === cur} aria-controls="bd-panel" tabIndex={t === cur ? 0 : -1}
              className={t === 'critical' ? 'is-crit' : undefined}
              onClick={() => pick(t)}
            >
              {L(TAB[t].es, TAB[t].en)} <span className="bd-n">{nf(groups.get(t)!.n)}</span>
              {t === cur && live && <i key={`${t}-${offset}`} className="bd-prog" style={{ animationDuration: `${BOARD_CYCLE_MS}ms` }} aria-hidden="true" />}
            </button>
          ))}
        </div>
        {!reduce && (pool > ROWS || tabs.length > 1) && (
          <button
            type="button" className="bd-stop" aria-pressed={held} onClick={() => setHeld((h) => !h)}
            aria-label={held ? L('Reanudar el tablero', 'Resume the board') : L('Detener el tablero', 'Hold the board')}
          >
            {held ? L('reanudar', 'resume') : L('detener', 'hold')}
          </button>
        )}
      </div>
      {cur && (
        <p id="bd-tab-desc" className="bd-note">
          {/* «Focos Rojos» in the line is a door to /aria */}
          {L(TAB_DESC[cur].es, TAB_DESC[cur].en).split(L('Focos Rojos', 'Red Flags')).flatMap((part, i) => (i ? [<Link key={i} to="/aria" className="bd-link">{L('Focos Rojos', 'Red Flags')}</Link>, part] : [part]))}
          {cur === 'nuevos' && run ? L(` Lista del ${fdate(run, lang)}.`, ` List of ${fdate(run, lang)}.`) : ''}
        </p>
      )}
      <div ref={panel} id="bd-panel" role="tabpanel" aria-labelledby={cur ? `bd-tab-${cur}` : undefined} aria-describedby={cur ? 'bd-tab-desc' : undefined} className={`bd-grid${hasCat ? '' : ' no-cat'}${hasSec ? '' : ' no-sec'}${hasProc ? '' : ' no-proc'}${ds ? ' no-risk' : ''}`}>
        <div className="bd-row bd-cols" aria-hidden="true">
          <span>{L('Fecha', 'Date')}</span><span className="bd-sec">{L('Sector', 'Sector')}</span><span>{L('Comprador', 'Buyer')}</span>
          <span>{cur === 'direct_spike' ? L('Sin concurso: antes → ahora', 'No tender: before → now') : L('Proveedor', 'Supplier')}</span>
          <span className="bd-cat" title={L('Categoría de gasto: el tipo de bien o servicio contratado', 'Spending category: the kind of good or service contracted')}>{L('Qué se compró', 'What was bought')}</span>
          <span className="r">{cur === 'nuevos' ? L('Contratado en ComprasMX', 'Paid on ComprasMX') : cur === 'direct_spike' ? L('Directo, 14 días', 'Direct, 14 days') : L('Monto', 'Amount')}</span><span className="bd-hp">{L('Procedimiento', 'Procedure')}</span>
          <span className="bd-hr">{L('Indicador · estado', 'Indicator · status')}</span>
        </div>
        {!g && <div className="bd-skel" aria-hidden="true" />}
        {/* rows keyed by position: a step swaps each cell's content under its own flap (old folds away, new falls in);
            no aria-live, the list stays a plain list and the board holds while focus is inside it */}
        <ul className="bd-list">
          {shown.map((r, i) => {
            const now = cellsOf(r)
            const old = reduce ? undefined : prev.current[i]
            const was = old && old.key !== r.key ? cellsOf(old) : null  // a pinned row (same contract) stays still
            return (
              <li
                key={i}
                className={`bd-row${arr.isNew(r.key) ? ' is-new' : ''}${i === firstPast ? ' is-past' : ''}`}
                // the week's rule lands with its row's first flap
                style={i === firstPast && was ? ({ '--bd-d': `${at(i, 0) + FLAP_MS}ms` } as CSSProperties) : undefined}
              >
                {now.map((c, j) => (
                  <span key={j} className={`bd-c ${c.cls}`}>
                    {was && <span key={`o${old!.key}`} className="bd-o" aria-hidden="true" inert style={{ animationDelay: `${at(i, j) + FLAP_MS}ms` }}>{was[j].node}</span>}
                    <span key={`n${r.key}`} className="bd-f" title={c.title} style={reduce ? undefined : { animationDelay: `${at(i, j)}ms`, animationDuration: `${FLAP_MS}ms` }}>{c.node}</span>
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </div>
      <ul className="bd-legend" aria-label={L('Cómo leer el tablero', 'How to read the board')}>
        {(['directa', 'licitacion', 'invitacion', 'concurso', 'otro'] as Proc[]).filter((p) => hasProc && all.some((r) => r.proc === p)).map((p) => (
          <li key={p}><Glyph p={p} />{p === 'concurso' ? L('Con concurso (tipo sin dato)', 'Tendered (kind not recorded)') : L(PROC[p].long.es, PROC[p].long.en)}</li>
        ))}
        {all.some((r) => r.buyer?.sector != null) && <li className="bd-lg-gap"><i className="bd-dot is-key" aria-hidden="true" />{L('Color = sector del comprador', 'Colour = the buyer’s sector')}</li>}
        {!ds && <li className="bd-lg-gap">
          {(['critical', 'high', 'medium', 'low'] as Level[]).filter((l) => all.some((r) => r.status?.level === l)).map((l) => (
            <span key={l} className={`bd-st is-${l}`}>{L(LEVEL[l].es, LEVEL[l].en)}{l === 'critical' ? ' ≥ 0.60' : l === 'high' ? ' ≥ 0.40' : l === 'medium' ? ' ≥ 0.25' : ' < 0.25'}</span>
          ))}
        </li>}
        {!ds && all.some((r) => arr.isNew(r.key)) && <li className="bd-lg-gap"><span className="bd-tag is-new">{L('Nuevo', 'New')}</span>{L('desde su última visita', 'since your last visit')}</li>}
        {all.some((r) => r.flagged) && <li className="bd-lg-gap"><span className="bd-tag is-flag">{L('Revisar', 'Review')}</span>{L('más de 10,000 MDP', 'above MXN 10B')}</li>}
      </ul>
      <p className="bd-foot">
        {en ? 'Amounts in US$ at each year’s Banxico FIX average. ' : ''}
        {savedAt ? L(`Lista guardada del ${fdate(savedAt, lang)}: el servidor no respondió. `, `List saved on ${fdate(savedAt, lang)}: the server did not answer. `) : ''}
        {cur === 'direct_spike'
          ? L('Antes = promedio de sus 12 meses previos; ahora = los últimos 14 días. ', 'Before = its average over the previous 12 months; now = the last 14 days. ')
          : L('Indicador de riesgo (0–1): señala patrones parecidos a casos documentados; no prueba irregularidades. ', 'Risk indicator (0–1): it flags patterns like documented cases; it does not prove wrongdoing. ')}
        <Link to="/methodology" className="bd-link">{L('Cómo se calcula →', 'How it is computed →')}</Link>{' '}
        <Link to="/contracts" className="bd-link">{L('Todos los contratos →', 'Every contract →')}</Link>
      </p>
    </section>
  )
}
