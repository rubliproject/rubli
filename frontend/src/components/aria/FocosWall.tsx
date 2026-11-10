/**
 * FocosWall — Focos Rojos «Rayos X» (owner pick C, 2026-10-15): the tier-1
 * vendors as a wall of cards, each holding a rosette of its largest contracts.
 * Angle = year (2002 at 12 o'clock, clockwise to 2025) · radius = log monto ·
 * colour = the contract's indicador · filled = adjudicación directa.
 * Sort tabs are cameras: the same cards travel to new seats (FLIP 450 ms).
 * Click = docked FieldCard with the large rosette and «abrir expediente».
 * Data: /aria/queue tier 1 (one page) + /aria/rosettes (analyst false positives off the wall).
 * Lenses (owner 2026-10-16): «Nuevos» (default) = tier-2 vendors with no public case link, active
 * 2019+, as the wall + a dense tier-3 register below; «Con registro externo» = the tier-1 wall (tier 1 requires one).
 * Navigation (owner 2026-11-02: «how am I supposed to go through this?»): a dense masthead (the fila's counts,
 * run, how to read a rosette) + one sticky bar — lens · pattern · sector · type · «desde 28 sep 2025» · search ·
 * order · Rosetas/Lista — all in the URL; filters narrow the same set, ←/→/↑/↓ walk the cards or rows.
 */
import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ariaApi } from '@/api/client'
import { ariaRosettesQuery } from '@/api/entityQueries'
import type { AriaNuevoItem } from '@/api/types'
import { AnimatePresence, useInView } from 'framer-motion'
import { RayosX, Rosette, type RxVendor, type Tuple } from '@/components/aria/RayosX'
import { RankCell, RankTh, rankNo } from '@/components/kit/ListRow'
import { AmountCell, IndicatorCell, NameCell, NumCell } from '@/components/kit/ListCells'
import { PATTERN_COLORS, getSectorName } from '@/lib/constants'
import { patternName } from '@/lib/aria/patterns'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { DocHead, type Crumb } from '@/components/contrato/DocHead'
import { ShareViewButton } from '@/components/explore/CanvasControls'
import '@/components/kit/kit.css'

type Sort = 'ips' | 'value' | 'recent'
type Vendor = RxVendor
type Lens = 'nuevos' | 'conocidos'
type View = 'muro' | 'lista'
const FIRST_CARDS = 60
const NEXT_CARDS = 30

// accent-blind search: «Tecnologia» finds «Tecnología»
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// the legend's schematic rosette: four made-up contracts, one per quadrant (labelled «esquema», never data)
const KEY_LIST: Tuple[] = [[2004, 3e6, 0.2, 0], [2009, 4e8, 0.45, 1], [2016, 2e5, 0.3, 1], [2021, 3e9, 0.7, 0]]
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Words of 17+ letters (Telecomunicaciones) outrun a 3-up phone card at 12px: give them one
// soft hyphen at a vowel|consonant-vowel syllable break near the middle, so a break shows «-».
const VOW = /[aeiouáéíóú]/i
const shy = (name: string) => name.replace(/\S{17,}/g, (w) => {
  const m = w.length >> 1
  for (let d = 0; d < m - 3; d++) for (const i of [m + d, m - d]) {
    if (VOW.test(w[i - 1]) && !VOW.test(w[i]) && VOW.test(w[i + 1] ?? '')) return `${w.slice(0, i)}\u00AD${w.slice(i)}`
  }
  return w
})

export function FocosWall({ lang, tierCounts, queueTotal, t1Split, trail, views, runMeta }: {
  lang: 'en' | 'es'
  /** the DocHead trail and the page's view switch: the wall carries them in its own toolbar row */
  trail: Crumb[]
  views?: React.ReactNode
  /** «corrida · modelo», first on the meta line */
  runMeta?: React.ReactNode
  tierCounts: Record<number, number>
  /** vendors the run examined (stats.queue_total) */
  queueTotal?: number | null
  /** «N documentados · M sin verificar», from the API's public labels */
  t1Split?: string | null
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  const lens: Lens = params.get('lente') === 'conocidos' ? 'conocidos' : 'nuevos'
  const setLens = (l: Lens) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (l === 'nuevos') n.delete('lente'); else n.set('lente', l)
    n.delete('foco')
    return n
  }, { replace: true })
  const known = lens === 'conocidos'
  const t1 = useQuery({ queryKey: ['aria-queue-t1-gt'], queryFn: () => ariaApi.getQueue({ tier: 1, per_page: 100 }), staleTime: 300_000, enabled: known })
  const ros = useQuery(ariaRosettesQuery(100, known ? 'tier1' : 'nuevos'))
  // the tier-3 list sits below the wall: asked after the wall lands, so the two cold scans never contend
  // …and only once the reader nears the wall's floor: its ~1 MB parse + table was ~1 s of a phone's load (launch audit S4)
  const floorRef = useRef<HTMLDivElement>(null)
  const nearFloor = useInView(floorRef, { once: true, margin: '1500px 0px' })
  const t3 = useQuery({ ...ariaRosettesQuery(0, 'nuevos', 3), enabled: !known && ros.isSuccess && nearFloor })
  // Order the tuples once (a copy — never the query cache): low indicator first so red paints on top.
  const lists = useMemo(() => {
    const out: Record<string, Tuple[]> = {}
    for (const [k, l] of Object.entries(ros.data?.vendors ?? {})) out[k] = l.slice().sort((u, v) => (u[2] ?? 0) - (v[2] ?? 0))
    return out
  }, [ros.data])
  const vendors: Vendor[] = useMemo(() => {
    const rows = (known ? t1.data?.data ?? [] : ros.data?.items ?? []) as unknown as Vendor[]
    return rows.filter((v) => lists[String(v.vendor_id)])
  }, [known, t1.data, ros.data, lists])
  // Ranked by the indicator, not by money: by value the top rows are multinationals with patents.
  const tier3: AriaNuevoItem[] = useMemo(
    () => (t3.data?.items ?? []).slice().sort((x, y) => y.ips_final - x.ips_final || y.total_value_mxn - x.total_value_mxn),
    [t3.data],
  )

  // «N documentados · M sin verificar» from the API's public labels (review § 3 A3), never typed
  const split = t1.data?.summary && t1.data.summary.total_t1 > 0 ? t1.data.summary : null

  // sort (?orden=) and the open card (?foco=) live in the URL: caso → Back keeps the sort, and on a
  // phone Back closes the dock instead of leaving the page (CLICKPATH_AUDIT_2026-10-30 § 8)
  const navigate = useNavigate()
  const oq = params.get('orden')
  const sort: Sort = oq === 'value' || oq === 'recent' ? oq : 'ips'
  const setSort = (s: Sort) => setParams((p) => { const n = new URLSearchParams(p); if (s === 'ips') n.delete('orden'); else n.set('orden', s); return n }, { replace: true })
  // every filter lives in the URL (Back from a caso returns to the same slice); never the La fila keys
  // (q, pattern, tier…), which would flip AriaQueue to its register
  const setKey = (k: string, v: string | null) => { pushed.current = false; setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); n.delete('foco'); return n }, { replace: true }) }
  const q = params.get('buscar') ?? ''
  const pat = params.get('patron')
  const sec = params.get('sec')
  const tipo = params.get('tipo') // 'pf' | 'pm'
  const desde = params.get('desde') === '1'
  const view: View = params.get('ver') === 'lista' ? 'lista' : 'muro'
  const [moreOpen, setMoreOpen] = useState(false)
  const [headOpen, setHeadOpen] = useState(false)
  const picked = Number(params.get('foco')) || null
  const pushed = useRef(false)
  const setPicked = (id: number | null) => {
    const push = id != null && picked == null
    if (push) pushed.current = true
    setParams((p) => { const n = new URLSearchParams(p); if (id == null) n.delete('foco'); else n.set('foco', String(id)); return n }, { replace: !push })
  }
  const [hover, setHover] = useState<number | null>(null)
  // roving tabindex: one card / row in the Tab order (the last one focused), the arrows walk the rest
  const [cursor, setCursor] = useState<number | null>(null)
  // 169 cards in one commit blocked a 4×-throttled phone for ~0.5 s: the first screenful (5 desktop rows)
  // mounts at once, the rest one slice per frame into seats held by same-size skeletons (no shift).
  const [shown, setShown] = useState(FIRST_CARDS)
  useEffect(() => {
    if (shown >= vendors.length) return
    const r = requestAnimationFrame(() => setShown((n) => n + NEXT_CARDS))
    return () => cancelAnimationFrame(r)
  }, [shown, vendors.length])

  const ordered = useMemo(() => {
    const key = (v: Vendor) => (sort === 'ips' ? v.ips_final : sort === 'value' ? v.total_value_mxn : v.last_contract_year ?? 0)
    return vendors.slice().sort((a, b) => key(b) - key(a) || b.ips_final - a.ips_final)
  }, [vendors, sort])
  // the № stays the vendor's place in the whole set under this order, so a filter never renumbers it
  const rankOf = useMemo(() => new Map(ordered.map((v, i) => [v.vendor_id, i + 1])), [ordered])
  const qq = fold(useDeferredValue(q).trim())
  const filtered = useMemo(() => ordered.filter((v) =>
    (!pat || v.primary_pattern === pat)
    && (!sec || v.primary_sector_name === sec)
    && (!tipo || (tipo === 'pf') === !!v.persona_fisica)
    && (!desde || (v.post_blackout_mxn ?? 0) > 0)
    && (qq.length < 2 || fold(v.vendor_name ?? '').includes(qq))), [ordered, pat, sec, tipo, desde, qq])
  // the bar offers only what the set holds (prod «Nuevos» rows carry no sector until the API ships it)
  const facet = (f: (v: Vendor) => string | null | undefined) => {
    const m = new Map<string, number>()
    for (const v of vendors) { const k = f(v); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m].sort((a, b) => b[1] - a[1])
  }
  const patterns = facet((v) => v.primary_pattern)
  const sectors = facet((v) => v.primary_sector_name)
  const nPF = vendors.filter((v) => v.persona_fisica).length
  const post = vendors.filter((v) => (v.post_blackout_mxn ?? 0) > 0)
  const postV = post.reduce((s, v) => s + (v.post_blackout_mxn ?? 0), 0)
  // prod «Nuevos» rows carry no risk indicator until the API ships it: drop the column rather than print «sin indicador»
  const hasRisk = vendors.some((v) => v.avg_risk_score !== undefined)
  const rover = filtered.some((v) => v.vendor_id === cursor) ? cursor : filtered[0]?.vendor_id ?? null
  const nFilters = [pat, sec, tipo, desde || null, qq.length >= 2 || null].filter(Boolean).length

  // FLIP: on a sort change the same cards travel to their new seats (the wall only: never inside a table).
  const wallRef = useRef<HTMLDivElement>(null)
  const seats = useRef(new Map<string, DOMRect>())
  const captureSeats = () => {
    seats.current.clear()
    if (view !== 'muro') return
    wallRef.current?.querySelectorAll<HTMLElement>('[data-vid]').forEach((el) => seats.current.set(el.dataset.vid!, el.getBoundingClientRect()))
  }
  useLayoutEffect(() => {
    if (!seats.current.size || reduced()) return
    wallRef.current?.querySelectorAll<HTMLElement>('[data-vid]').forEach((el) => {
      const a = seats.current.get(el.dataset.vid!)
      if (!a) return
      const b = el.getBoundingClientRect()
      el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.23,1,.32,1)' })
    })
    seats.current.clear()
  }, [ordered])
  // Closing hands focus back to the card now on show (the clicked one, or where ←/→ walked to).
  const closeDock = () => {
    const id = picked
    if (pushed.current) { pushed.current = false; navigate(-1) } else setPicked(null)
    if (id != null) wallRef.current?.querySelector<HTMLElement>(`[data-vid="${id}"]`)?.focus()
  }
  // the list's column heads stick under the toolbar, whose height wraps with the viewport
  const barRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => el.parentElement?.style.setProperty('--fw-bar-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pickSort = (s: Sort) => { if (s !== sort) { captureSeats(); setSort(s) } }
  // Arrow keys walk the cards (a grid: ↑/↓ jump a row) or the rows; Home/End the ends. Enter opens.
  const onWalk = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return
    const box = e.currentTarget
    const items = [...box.querySelectorAll<HTMLElement>('[data-vid]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const grid = box.querySelector<HTMLElement>('.fw-wall')
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1
    const j = k === 'ArrowLeft' ? i - 1 : k === 'ArrowRight' ? i + 1 : k === 'ArrowUp' ? i - cols : k === 'ArrowDown' ? i + cols : k === 'Home' ? 0 : items.length - 1
    if (j < 0 || j >= items.length) return
    e.preventDefault()
    items[j].focus()
    items[j].scrollIntoView({ block: 'nearest' })
  }

  const totV = vendors.reduce((s, v) => s + v.total_value_mxn, 0)
  const totN = vendors.reduce((s, v) => s + v.total_contracts, 0)
  const pi = filtered.findIndex((v) => v.vendor_id === picked)
  const pv = pi >= 0 ? filtered[pi] : null
  const hv = vendors.find((v) => v.vendor_id === hover) ?? null
  const nameOf = (v: Vendor) => (v.vendor_name
    ? formatVendorName(v.vendor_name, 200) + (v.persona_fisica ? L(' · persona física', ' · individual') : '')
    : L('Persona física', 'Individual'))

  const claim = (nV: number, v: number, c: number) => (known
    ? (en
      ? <><b>{formatNumber(nV)}</b> tier-1 vendors, each with an external record{split ? <> ({formatNumber(split.documented_t1)} documented · {formatNumber(split.lead_t1)} unverified)</> : null}: {formatDualCurrency(v)} in {formatNumber(c)} contracts.</>
      : <><b>{formatNumber(nV)}</b> proveedores de nivel 1, todos con registro externo{split ? <> ({formatNumber(split.documented_t1)} documentados · {formatNumber(split.lead_t1)} sin verificar)</> : null}: {formatDualCurrency(v)} en {formatNumber(c)} contratos.</>)
    : (en
      ? <><b>{formatNumber(nV)}</b> vendors that no public case names yet, with contracts in 2019 or later: {formatDualCurrency(v)} in {formatNumber(c)} contracts.</>
      : <><b>{formatNumber(nV)}</b> proveedores que ningún caso público nombra todavía, con contratos en 2019 o después: {formatDualCurrency(v)} en {formatNumber(c)} contratos.</>))

  if ((known && t1.isError) || ros.isError) {
    return <p className="ct-note py-8">{L('No se pudo cargar esta vista. Pruebe la vista de lista.', 'The wall failed to load. Try the List view.')}</p>
  }
  const loading = (known && t1.isLoading) || ros.isLoading
  const fig = (x: number | null | undefined) => (x == null || loading ? '—' : formatNumber(x))
  const ready = !loading && queueTotal != null && tierCounts[1] > 0
  const ledger = (qt: number, tc: Record<number, number>, sp: string | null, nPost: number, nV: number, pV: number) => (
    <p className={headOpen ? 'fw-ledger is-open' : 'fw-ledger'}>
      {runMeta && <span>{runMeta}</span>}
      <span>{L('La fila de investigación', 'The investigation queue')}: <b>{formatNumber(qt)}</b> {L('proveedores examinados', 'vendors examined')}</span>
      <span>{L('nivel 1', 'tier 1')}: <b>{formatNumber(tc[1])}</b>{sp ? <> ({sp})</> : null}</span>
      <span>{L('nivel 2', 'tier 2')}: <b>{formatNumber(tc[2])}</b></span>
      <span>{L('nivel 3', 'tier 3')}: <b>{formatNumber(tc[3])}</b></span>
      <span>{L('sin señal', 'no signal')}: <b>{formatNumber(tc[4])}</b></span>
      {!known && <span>{L('con contratos desde el 28 sep 2025', 'with contracts since 28 Sep 2025')}: <b>{formatNumber(nPost)}</b> {L('de', 'of')} {formatNumber(nV)}{pV > 0 ? <> · {formatCompactMXN(pV)}</> : null}</span>}
      <span>{L('un indicador no es prueba', 'an indicator is not proof')}</span>
    </p>
  )
  const selName = L('Filtrar por', 'Filter by')
  // the order rides the toolbar; on a phone it folds into «Filtros» so the sticky toolbar stays two rows
  const sortSelect = (cls: string) => (
    <select className={`aria-select fw-sel ${cls}`} value={sort} onChange={(e) => pickSort(e.target.value as Sort)} aria-label={L('Orden', 'Order')}>
      <option value="ips">{L('Orden: prioridad', 'Order: priority')}</option>
      <option value="value">{L('Orden: monto', 'Order: amount')}</option>
      <option value="recent">{L('Orden: reciente', 'Order: recent')}</option>
    </select>
  )

  return (
    <div className="fw">
      {/* TOOLBAR — El Mapa's compaction (owner 2026-11-02, ui/mapa-compact 324c75c4): trail · switches · small
          actions on one sticky row; the filters fold behind «Filtros». */}
      <div className="fw-bar" ref={barRef}>
        <DocHead trail={trail} meta={<></>} views={
          <div className="fw-tools" role="group" aria-label={L('Recorrer la fila', 'Go through the queue')}>
            <div className="fw-seg" role="group" aria-label={L('Qué proveedores', 'Which vendors')}>
              {(['nuevos', 'conocidos'] as Lens[]).map((l) => (
                <button key={l} type="button" aria-pressed={lens === l} className="ct-subtab" onClick={() => { pushed.current = false; setLens(l) }}
                  title={l === 'nuevos' ? L('Nivel 2, sin caso público, con contratos desde 2019', 'Tier 2, no public case, contracts since 2019') : L('Nivel 1: todos con registro externo', 'Tier 1: each with an external record')}>
                  {l === 'nuevos' ? L('Nuevos · N2', 'New · T2') : L('Con registro · N1', 'On record · T1')}
                </button>
              ))}
            </div>
            <input type="search" className="fw-q" value={q} onChange={(e) => setKey('buscar', e.target.value || null)} placeholder={L('Buscar', 'Find')} aria-label={L('Buscar proveedor', 'Find vendor')} />
            <button type="button" className="ct-chip" aria-expanded={moreOpen} aria-controls={moreOpen ? 'fw-filters' : undefined} onClick={() => setMoreOpen((o) => !o)}>
              {L('Filtros', 'Filters')}<small>{nFilters || ''}</small>
            </button>
            {sortSelect('fw-ord')}
            <span className={nFilters ? 'fw-count is-filtered' : 'fw-count'} aria-live="polite" aria-atomic="true">{loading ? '—' : <><b>{formatNumber(filtered.length)}</b> {L('de', 'of')} {formatNumber(vendors.length)}</>}</span>
            <div className="fw-seg" role="group" aria-label={L('Cómo se muestra', 'How it shows')}>
              {(['muro', 'lista'] as View[]).map((x) => (
                <button key={x} type="button" className="ct-subtab" aria-pressed={view === x} onClick={() => setKey('ver', x === 'lista' ? 'lista' : null)}>
                  {x === 'muro' ? L('Rosetas', 'Rosettes') : L('Lista', 'List')}
                </button>
              ))}
            </div>
            <span className="fw-share"><ShareViewButton lang={lang} /></span>
            {views}
          </div>
        } />
        {moreOpen && (
          <div id="fw-filters" className="fw-filters">
            <select className="aria-select fw-sel" value={pat ?? ''} onChange={(e) => setKey('patron', e.target.value || null)} aria-label={`${selName}: ${L('patrón', 'pattern')}`}>
              <option value="">{L('Todos los patrones', 'All patterns')}</option>
              {patterns.map(([p, c]) => <option key={p} value={p}>{p} {patternName(p, lang)} · {c}</option>)}
            </select>
            {sectors.length > 0 && (
              <select className="aria-select fw-sel" value={sec ?? ''} onChange={(e) => setKey('sec', e.target.value || null)} aria-label={`${selName}: ${L('sector', 'sector')}`}>
                <option value="">{L('Todos los sectores', 'All sectors')}</option>
                {sectors.map(([s, c]) => <option key={s} value={s}>{getSectorName(s, lang)} · {c}</option>)}
              </select>
            )}
            {nPF > 0 && (
              <select className="aria-select fw-sel" value={tipo ?? ''} onChange={(e) => setKey('tipo', e.target.value || null)} aria-label={`${selName}: ${L('tipo de proveedor', 'vendor type')}`}>
                <option value="">{L('Empresas y personas', 'Companies and individuals')}</option>
                <option value="pm">{L('Solo empresas', 'Companies only')} · {vendors.length - nPF}</option>
                <option value="pf">{L('Solo personas físicas', 'Individuals only')} · {nPF}</option>
              </select>
            )}
            {!known && (
              <button type="button" className="ct-chip" aria-pressed={desde} onClick={() => setKey('desde', desde ? null : '1')} title={L('Proveedores con contratos federales después del 28 sep 2025 (ComprasMX)', 'Vendors with federal contracts after 28 Sep 2025 (ComprasMX)')}>
                {L('Con contratos desde el 28 sep 2025', 'With contracts since 28 Sep 2025')}<small>{fig(post.length)}</small>
              </button>
            )}
            {sortSelect('fw-ord-phone')}
            {nFilters > 0 && <button type="button" className="ct-chip is-plain" onClick={() => { pushed.current = false; setParams((p) => { const n = new URLSearchParams(p); for (const k of ['buscar', 'patron', 'sec', 'tipo', 'desde', 'foco']) n.delete(k); return n }, { replace: true }) }}>{L('Quitar filtros', 'Clear filters')}</button>}
          </div>
        )}
      </div>

      {/* HEAD — one-line claim, one meta line, «más» opens the rest in place (the ZKickerBand pattern) */}
      <header className="fw-mast">
        <h1 className="fw-claim">
          {/* loading: the same sentence, unpainted, so the h1 keeps its loaded shape (CLS) */}
          {loading ? <span className="invisible" aria-hidden="true">{claim(169, 3.4e11, 28_497)}</span> : claim(vendors.length, totV, totN)}
        </h1>
        <div className="fw-meta-row">
          {/* loading: a typical ledger, unpainted, so nothing on the line moves when the counts land (CLS) */}
          {ready
            ? ledger(queueTotal!, tierCounts, t1Split ?? null, post.length, vendors.length, postV)
            : <div className="invisible min-w-0 flex-1" aria-hidden="true">{ledger(201_533, { 1: 60, 2: 982, 3: 4_731, 4: 195_714 }, L('12 documentados · 48 sin verificar', '12 documented · 48 unverified'), 95, 170, 3.97e10)}</div>}
          <button type="button" className="fw-mas" aria-expanded={headOpen} aria-controls={headOpen ? 'fw-more' : undefined} onClick={() => setHeadOpen((o) => !o)}
            title={headOpen ? L('Mostrar menos', 'Show less') : L('Las cifras completas y cómo leer una roseta', 'The full counts and how to read a rosette')}>
            {headOpen ? L('menos', 'less') : L('más · cómo leer', 'more · how to read')}
          </button>
        </div>
        {headOpen && (
          <figure id="fw-more" className="fw-legend">
            <figcaption>
              <span className="fw-legend-ros"><Rosette list={KEY_LIST} size={56} /></span>
              <b>{L('Cómo leer una roseta', 'How to read a rosette')}</b> <span className="fw-legend-x">({L('esquema', 'schematic')})</span>
              <span>{L('Cada punto es uno de sus contratos más grandes: ↑ 2002 y el año gira con el reloj · más lejos del centro, más dinero · ● adjudicación directa, ○ otra · color = indicador de riesgo (rojo = crítico).',
                'Each dot is one of its largest contracts: ↑ 2002, the year turns clockwise · farther from the centre, more money · ● direct award, ○ other · colour = risk indicator (red = critical).')}</span>
              <span>
                {L('Toque una tarjeta o un renglón para abrir su detalle; dentro, «Anterior» y «Siguiente» recorren la fila sin cerrarla.', 'Tap a card or a row to open its X-ray; inside, «Previous» and «Next» walk the queue without closing it.')}
                <span className="fw-kb">{L(' Teclado: flechas para moverse, Enter abre, Esc cierra.', ' Keyboard: arrows to move, Enter opens, Esc closes.')}</span>
              </span>
            </figcaption>
          </figure>
        )}
      </header>

      <div ref={wallRef} onKeyDown={onWalk} onMouseLeave={() => setHover(null)}>
        {view === 'muro' ? (
          <div className="fw-wall">
            {loading
              // a loaded card's shape (rosette seat + three name lines), so the wall does not grow when it lands (CLS)
              ? Array.from({ length: 98 }, (_, i) => <div key={i} className="fw-card is-skel" aria-hidden="true"><span className="fw-nm" /></div>)
              : filtered.map((v, i) => {
                if (i >= shown) return <div key={v.vendor_id} className="fw-card is-skel" aria-hidden="true"><span className="fw-nm" /></div>
                const id = v.vendor_id
                const nm = nameOf(v)
                return (
                  <button
                    key={id}
                    type="button"
                    data-vid={id}
                    tabIndex={id === rover ? 0 : -1}
                    className={`fw-card${picked === id ? ' is-on' : ''}`}
                    style={{ animationDelay: reduced() ? '0ms' : `${i * 6}ms` }}
                    onClick={() => setPicked(id)}
                    onMouseEnter={() => setHover(id)}
                    onFocus={() => { setHover(id); setCursor(id) }}
                    aria-haspopup="dialog"
                  >
                    {/* WCAG 2.5.3: the name is the card's visible text, the word «indicador» read off-screen */}
                    <span className="fw-rk">{rankOf.get(id)}</span>
                    <span className="sr-only">{L(' · indicador ', ' · indicator ')}</span>
                    <span className="fw-ip">{v.ips_final.toFixed(2)}</span>
                    <span className="fw-fl" aria-hidden="true">
                      {v.primary_pattern && <i style={{ background: PATTERN_COLORS[v.primary_pattern] }} />}
                      {!!v.in_ground_truth && <i className="is-doc" />}
                      {!!v.is_efos_definitivo && <span>◇</span>}
                      {!!v.is_sfp_sanctioned && <span>✕</span>}
                    </span>
                    {/* The beat: each rosette sweeps 2002 → 2025 once when the wall lands (painted in rAF, no re-renders). */}
                    <Rosette list={lists[String(id)]} size={64} beat={0} ms={800} delay={250} />
                    <span className="fw-nm" title={nm}>{shy(nm)}</span>
                    <span className="fw-open" aria-hidden="true">{L('abrir', 'open')} ›</span>
                  </button>
                )
              })}
          </div>
        ) : (
          <div className="fw-list-wrap"><table className="ct-table ct-stack fw-list" aria-busy={loading || undefined}>
            <caption className="sr-only">{L('La misma fila como lista, en el orden elegido', 'The same queue as a list, in the chosen order')}</caption>
            <thead><tr>
              <RankTh lang={lang} />
              <th scope="col">{L('Proveedor', 'Vendor')}</th>
              <th scope="col">{L('Patrón', 'Pattern')}</th>
              <th scope="col" className="num">{L('Prioridad', 'Priority')}</th>
              {hasRisk && <th scope="col" className="gauge">{L('Indicador de riesgo', 'Risk indicator')}</th>}
              <th scope="col" className="num">{L('Contratos', 'Contracts')}</th>
              <th scope="col" className="num">{L('Monto', 'Amount')}</th>
              <th scope="col">{L('Comprador principal', 'Main buyer')}</th>
              <th scope="col" className="num">{L('Último año', 'Last year')}</th>
              {!known && <th scope="col" className="num">{L('Desde 28 sep 2025', 'Since 28 Sep 2025')}</th>}
            </tr></thead>
            <tbody>
              {filtered.map((v) => {
                const id = v.vendor_id
                const no = rankNo(rankOf.get(id) ?? 0)
                return (
                  <tr key={id} className={`ct-row fw-tr${picked === id ? ' is-on' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setPicked(id) }}>
                    <td className="ct-rank">
                      <button type="button" data-vid={id} tabIndex={id === rover ? 0 : -1} onFocus={() => setCursor(id)} className="aria-rank" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); setPicked(id) }}
                        aria-label={`${no} · ${nameOf(v)}: ${L('abrir Rayos X', 'open X-ray')}`}>
                        <b>{no}</b><small>{L('abrir', 'open')}</small>
                      </button>
                    </td>
                    <NameCell type="vendor" id={id} name={v.vendor_name} sub={v.persona_fisica ? L('persona física', 'individual') : undefined} />
                    <td className="ls-txt" data-l={L('patrón', 'pattern')} title={v.primary_pattern ? patternName(v.primary_pattern, lang) : undefined}>
                      {v.primary_pattern ? <><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[v.primary_pattern] }} />{v.primary_pattern}<span className="sr-only"> {patternName(v.primary_pattern, lang)}</span></> : '—'}
                    </td>
                    <NumCell label={L('prioridad', 'priority')}>{v.ips_final.toFixed(2)}</NumCell>
                    {hasRisk && <IndicatorCell value={v.avg_risk_score ?? null} />}
                    <NumCell label={L('contratos', 'contracts')}>{formatNumber(v.total_contracts)}</NumCell>
                    <AmountCell value={v.total_value_mxn} />
                    {v.top_institution ? <NameCell type="institution" id={v.top_institution_id} name={v.top_institution} /> : <td>—</td>}
                    <NumCell label={L('último año', 'last year')}>{v.last_contract_year ?? '—'}</NumCell>
                    {!known && <NumCell label={L('desde sep 2025', 'since Sep 2025')}>{v.post_blackout_mxn ? <><span className="fw-new">{L('nuevo', 'new')}</span> {formatCompactMXN(v.post_blackout_mxn)}</> : '—'}</NumCell>}
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="ct-note fw-empty">{L('Ningún proveedor con estos filtros.', 'No vendor with these filters.')}</p>
        )}
      </div>

      <div ref={floorRef} />

      {!known && tier3.length > 0 && (
        <section className="fw-reg" aria-labelledby="fw-reg-h">
          <h2 id="fw-reg-h" className="fw-reg-h">
            {en
              ? <>Behind them: <b>{formatNumber(tier3.length)}</b> tier-3 vendors with no public case, with contracts in 2019 or later · {formatDualCurrency(tier3.reduce((t, v) => t + v.total_value_mxn, 0))}</>
              : <>Detrás: <b>{formatNumber(tier3.length)}</b> proveedores de nivel 3 sin caso público, con contratos en 2019 o después · {formatDualCurrency(tier3.reduce((t, v) => t + v.total_value_mxn, 0))}</>}
          </h2>
          <div className="ct-table-wrap"><table className="ct-table ct-stack fw-reg-t">
            <thead><tr>
              <RankTh lang={lang} />
              <th scope="col">{L('Proveedor', 'Vendor')}</th>
              <th scope="col" className="num">{L('Contratos', 'Contracts')}</th>
              <th scope="col" className="num">{L('Monto 2002–2026', 'Amount 2002–2026')}</th>
              <th scope="col" className="num">{L('Indicador', 'Indicator')}</th>
              <th scope="col">{L('Comprador principal', 'Main buyer')}</th>
              <th scope="col" className="num">{L('De su dinero', 'Of its money')}</th>
              <th scope="col" className="num">{L('Último año', 'Last year')}</th>
              <th scope="col" className="num">{L('Desde el 28 sep 2025', 'Since 28 Sep 2025')}</th>
            </tr></thead>
            <tbody>
              {tier3.slice(0, 40).map((v, i) => (
                <tr key={v.vendor_id} className="ct-row">
                  <RankCell n={i + 1} />
                  <NameCell type="vendor" id={v.vendor_id} name={v.vendor_name} />
                  <NumCell label={L('contratos', 'contracts')}>{formatNumber(v.total_contracts)}</NumCell>
                  <AmountCell value={v.total_value_mxn} />
                  <NumCell label={L('indicador', 'indicator')}>{v.ips_final.toFixed(2)}</NumCell>
                  <NameCell type="institution" id={v.top_institution_id} name={v.top_institution} />
                  <NumCell label={L('de su dinero', 'of its money')}>{v.top_institution_ratio != null ? `${Math.round(v.top_institution_ratio * 100)}%` : '—'}</NumCell>
                  <NumCell label={L('último año', 'last year')}>{v.last_contract_year ?? '—'}</NumCell>
                  <NumCell label={L('desde sep 2025', 'since Sep 2025')}>{v.post_blackout_mxn ? formatCompactMXN(v.post_blackout_mxn) : '—'}</NumCell>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Link to="/aria?vista=lista&tier=3" className="ct-more ct-link">{L(`Ver los ${formatNumber(tier3.length)} en la lista`, `See all ${formatNumber(tier3.length)} in the list`)}</Link>
        </section>
      )}

      {hv && !pv && view === 'muro' && (
        <div className="fw-tip" aria-hidden="true">
          <b>{formatVendorName(hv.vendor_name, 200)}</b> · {formatDualCurrency(hv.total_value_mxn)} · {formatNumber(hv.total_contracts)} {L('contratos', 'contracts')}
          {hv.top_institution ? <> · {formatEntityName('institution', hv.top_institution, 'full')}</> : null}
        </div>
      )}

      <AnimatePresence>
        {pv && pi >= 0 && (
          <RayosX
            key="rx"
            vendor={pv}
            list={lists[String(pv.vendor_id)]}
            index={pi}
            total={filtered.length}
            lang={lang}
            onPrev={pi > 0 ? () => setPicked(filtered[pi - 1].vendor_id) : null}
            onNext={pi < filtered.length - 1 ? () => setPicked(filtered[pi + 1].vendor_id) : null}
            prevName={pi > 0 ? nameOf(filtered[pi - 1]) : null}
            nextName={pi < filtered.length - 1 ? nameOf(filtered[pi + 1]) : null}
            onClose={closeDock}
            neighbors={[filtered[pi - 1]?.vendor_id, filtered[pi + 1]?.vendor_id]}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default FocosWall
