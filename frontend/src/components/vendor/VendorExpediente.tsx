/**
 * Expediente + Orbit — the dossier's signature block, for a vendor (lanes = its buyers) and for an
 * institution (lanes = its suppliers); VendorExpediente / VendorOrbit are the vendor wrappers,
 * components/institution/InstitutionExpediente the institution ones (owner decision 2026-10-27,
 * _explore/dossier_concepts_2026-10-27: B «El expediente por sexenios» + C's procedure glyphs as a
 * lens + A's orbit, small, in the head). DESIGN.md §6.3: buyers carry the categorical set by index;
 * red only where the indicator itself is critical (§6.2). §5.1: object first, full measure.
 *
 * Desktop: chapters (sexenios with money · share · indicator) over a money ribbon stacked by the
 * largest buyers, one lane per buyer (width = money of the year), the yearly indicator as numerals,
 * and a row of computed facts. Phone (< 640 px measured): transposed — years as rows, lanes as columns.
 * HTML owns the entity names (EntityIdentityChip), SVG owns the geometry (measured px, no scaling).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { vendorApi } from '@/api/client'
import type { InstitutionVendorsTimelineResponse, VendorInstitutionsTimelineResponse, VendorTimelineCell } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { ADMINISTRATIONS } from '@/lib/administrations'
import { CATEGORICAL, NOMINAL_NOTE, RAMP_INK, RISK_TEXT_COLORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import {
  DA_RECORDED_FROM, SWITCH_AT, SWITCH_YEAR, buildExpediente, indFmt, isTendered, laneColor, smooth, toTimeline,
  type EntityTimeline, type Expediente, type Fact, type Lane, type LaneType,
} from '@/lib/vendor/expediente'
import { buildLectura, type Claim, type Token } from '@/lib/vendor/lectura'
import { buildInstitutionLectura } from '@/lib/institution/lectura'

type TimelineData = VendorInstitutionsTimelineResponse | InstitutionVendorsTimelineResponse

type Lang = 'en' | 'es'
type Lens = 'money' | 'proc'

/** One query for the spine and the orbit; a 404 (endpoint not deployed yet) hides both. */
export function useVendorInstitutionsTimeline(vendorId: number) {
  return useQuery({
    queryKey: ['vendor', vendorId, 'institutions-timeline'],
    queryFn: () => vendorApi.getInstitutionsTimeline(vendorId, 8),
    enabled: Number.isFinite(vendorId) && vendorId > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

const phoneW = (width: number) => width > 0 && width < 640

const pctFmt = (x: number, lang: Lang) => x > 0 && x < 0.001 ? '< 0.1%' :
  `${(x * 100).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: x < 0.01 ? 1 : 0 })}%`

/** Indicator ink: red only at «crítico», muted when low (no green), ink otherwise. */
const indInk = (r: number | null | undefined) =>
  r == null ? 'var(--ct-gray)' : getRiskLevelFromScore(r) === 'critical' ? RISK_TEXT_COLORS.critical : getRiskLevelFromScore(r) === 'low' ? 'var(--ct-gray)' : 'var(--ct-ink)'

/** The lanes' word: a vendor's buyers, an institution's suppliers. */
const laneWords = (t: LaneType, en: boolean) => t === 'institution'
  ? (en ? { one: 'buyer', many: 'buyers', Many: 'Buyers', others: 'its other buyers' } : { one: 'comprador', many: 'compradores', Many: 'Compradores', others: 'sus otros compradores' })
  : (en ? { one: 'supplier', many: 'suppliers', Many: 'Suppliers', others: 'its other suppliers' } : { one: 'proveedor', many: 'proveedores', Many: 'Proveedores', others: 'sus otros proveedores' })

const entLabel = (type: LaneType, name: string | null, siglas: string | null, size: 'sm' | 'md' | 'full' = 'sm') =>
  siglas ?? (type === 'vendor' ? formatEntityName('vendor', name, size) : formatEntityName('institution', name, size === 'full' ? 'full' : 'md'))

function laneLabel(l: Lane) {
  return entLabel(l.type, l.name, l.siglas, 'full')  // names never truncate (DESIGN.md §9): the lane wraps
}

function LaneChip({ lane }: { lane: Lane }) {
  return (
    <EntityIdentityChip type={lane.type} id={lane.id} name={lane.name} variant="name" className="vd-exp-chip">
      {laneLabel(lane)}
    </EntityIdentityChip>
  )
}

function LensToggle({ lens, setLens, lang }: { lens: Lens; setLens: (l: Lens) => void; lang: Lang }) {
  const en = lang === 'en'
  return (
    <div className="vd-lens" role="group" aria-label={en ? 'Read the lanes by' : 'Leer los carriles por'}>
      <button type="button" aria-pressed={lens === 'money'} onClick={() => setLens('money')}>{en ? 'Money' : 'Dinero'}</button>
      <button type="button" aria-pressed={lens === 'proc'} onClick={() => setLens('proc')}>{en ? 'Procedure' : 'Procedimiento'}</button>
    </div>
  )
}

/** The fact as plain text — to measure its label before it is drawn. */
function factPlain(f: Fact, lang: Lang): string {
  const en = lang === 'en', inst = f.lane ? laneLabel(f.lane) : ''
  switch (f.kind) {
    case 'first': return (en ? 'first contract: ' : 'primer contrato: ') + inst
    case 'enters': return `${en ? '' : 'entra '}${inst}${en ? ' arrives' : ''}: ${formatCompactMXN(f.amount!)}`
    case 'peak': return `${en ? 'peak' : 'tope'}: ${formatCompactMXN(f.amount!)}`
    case 'record': return `${formatNumber(f.n!)} ${en ? 'contracts, its record' : 'contratos, su récord'}`
    case 'still': return `${en ? 'still signing' : 'sigue firmando'}: ${formatNumber(f.n!)} ${en ? 'in' : 'en'} ${f.year}`
    case 'crosses': return en ? 'indicator crosses 0.60' : 'indicador cruza 0.60'
    case 'case': return en ? 'documented case' : 'caso documentado'
    case 'admin': {
      const r = f.ratio ?? 1
      const d = r >= 1 ? `×${r.toFixed(1)}` : `−${Math.round((1 - r) * 100)}%`
      return en ? `under ${f.name}: ${d} a year` : `con ${f.name}: ${d} al año`
    }
    case 'switch': return 'CompraNet → ComprasMX'   // the date rides the caption («línea punteada = 28 sep 2025»)
  }
}

/** Where a fact's leader stands: the CompraNet → ComprasMX switch at its day, a sexenio turn on the cut. */
const factX = (f: Fact, X: (y: number) => number, cw: number) =>
  f.kind === 'switch' ? X(SWITCH_YEAR) + cw * SWITCH_AT : f.kind === 'admin' ? X(f.year) + 0.5 : X(f.year) + cw / 2

function factText(f: Fact, lang: Lang) {
  const en = lang === 'en'
  switch (f.kind) {
    case 'first':
      return f.lane ? <>{en ? 'first contract: ' : 'primer contrato: '}<LaneChip lane={f.lane} /></> : <>{en ? 'first contract' : 'primer contrato'}</>
    case 'enters':
      return <>{en ? '' : 'entra '}<LaneChip lane={f.lane!} />{en ? ` arrives: ${formatCompactMXN(f.amount!)}` : `: ${formatCompactMXN(f.amount!)}`}</>
    case 'peak':
      return <>{en ? `peak: ${formatCompactMXN(f.amount!)}` : `tope: ${formatCompactMXN(f.amount!)}`}</>
    case 'record':
      return <>{en ? `${formatNumber(f.n!)} contracts, its record` : `${formatNumber(f.n!)} contratos, su récord`}</>
    case 'still':
      return <>{en ? `still signing: ${formatNumber(f.n!)} in ${f.year}` : `sigue firmando: ${formatNumber(f.n!)} en ${f.year}`}</>
    case 'crosses':
    case 'case':
    case 'admin':
    case 'switch':
      return <>{factPlain(f, lang)}</>
  }
}

/** The ARIA case layer's facts read in red (DESIGN.md §6.2 crítico · §6.1 the case seal). */
const factClass = (f: Fact) => (f.kind === 'crosses' || f.kind === 'case' ? 'is-case' : undefined)

/** C's glyph: square = majority without tender, hollow circle = majority tendered; size = money (3 decades, log). */
function Glyph({ c, year, x, y, max, cellMax, color }: { c: VendorTimelineCell; year: number; x: number; y: number; max: number; cellMax: number; color: string }) {
  const t = Math.min(1, Math.max(0, (Math.log10(Math.max(c.amount_mxn, 1)) - (Math.log10(cellMax) - 3)) / 3))
  const s = 3 + (max - 3) * t
  // before 2011 CompraNet did not record the procedure: a grey dot, neither square nor circle
  if (year < DA_RECORDED_FROM) return <circle cx={x} cy={y} r={Math.max(1.5, s / 4)} fill={RAMP_INK[2]} />
  return isTendered(c)
    ? <circle cx={x} cy={y} r={Math.max(1.5, s / 2 - 0.75)} fill="none" stroke={color} strokeWidth={1.5} />
    : <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={color} />
}

const cellTitle = (lane: string, y: number, c: VendorTimelineCell, lang: Lang) => lang === 'en'
  ? `${lane} · ${y}: ${formatCompactMXN(c.amount_mxn)} · ${formatNumber(c.n_contracts)} contracts, ${formatNumber(c.n_direct_award)} direct awards${c.avg_risk_score != null ? ` · indicator ${indFmt(c.avg_risk_score)}` : ''}`
  : `${lane} · ${y}: ${formatCompactMXN(c.amount_mxn)} · ${formatNumber(c.n_contracts)} contratos, ${formatNumber(c.n_direct_award)} sin licitación${c.avg_risk_score != null ? ` · indicador ${indFmt(c.avg_risk_score)}` : ''}`

// ─── look closer: the year scrub and the drill card ─────────────────────────────
export type Nav = {
  scrub: Scrub | null
  setScrub: (f: (s: Scrub | null) => Scrub | null) => void
  pick: Pick | null
  setPick: (p: Pick | null) => void
  say: (s: string) => void
  contractsHref: string
}

/** The year in one line (the scrub's readout and what a screen reader hears on ← →). */
function yearLine(m: Expediente, y: number, lang: Lang): string {
  const en = lang === 'en', c = m.byYear[y]
  if (!c) return en ? `${y}: no contracts` : `${y}: sin contratos`
  const ind = c.avg_risk_score != null ? ` · ${en ? 'indicator' : 'indicador'} ${indFmt(c.avg_risk_score)}` : ''
  return `${y}: ${formatCompactMXN(c.amount_mxn)} · ${formatNumber(c.n_contracts)} ${en ? 'contracts' : 'contratos'}${ind}`
}

/** ← → walk the years, Enter / Space open the year, Esc closes (the plot is one tab stop). */
function scrubKeys(m: Expediente, nav: Nav, lang: Lang) {
  return (e: KeyboardEvent<Element>) => {
    const cur = nav.scrub?.on ? nav.scrub.year : null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
      const y = Math.max(m.start, Math.min(m.end, cur == null ? (step > 0 ? m.start : m.end) : cur + step))
      nav.setScrub(() => ({ year: y, on: true }))
      nav.say(yearLine(m, y, lang))
    } else if ((e.key === 'Enter' || e.key === ' ') && cur != null) {
      e.preventDefault()
      nav.setPick({ year: cur, lane: null, from: null })
    } else if (e.key === 'Escape') {
      nav.setPick(null); nav.setScrub((s) => (s ? { ...s, on: false } : s))
    }
  }
}

const CARD_W = 300

/** The year opened from the spine: its money, contracts, procedure and indicator, the lanes that
 *  bought (or sold) that year, and the contracts behind it. It docks out of the clicked mark: origin
 *  at the click, 16 px of travel, 240 ms --ease-out (the Instituciones card, TamizTiempo). */
export function YearCard({ m, pick, nav, lang, style, back, quiet }: { m: Expediente; pick: Pick; nav: Nav; lang: Lang; style?: CSSProperties; back: () => void
  /** A standing read-out (the column's year in hand): no focus grab, no entrance, no close — not a dialog. */
  quiet?: boolean }) {
  const en = lang === 'en'
  const ref = useRef<HTMLDivElement>(null)
  const { year, lane } = pick
  const c = m.byYear[year]
  const chapter = m.chapters.find((ch) => year >= ch.from && year <= ch.to)
  const w = laneWords(m.laneType, en)
  const rows = m.lanes.filter((l) => l.cells[year]).sort((a, b) => (a === lane ? -1 : b === lane ? 1 : b.cells[year].amount_mxn - a.cells[year].amount_mxn)).slice(0, 3)
  const sep = nav.contractsHref.includes('?') ? '&' : '?'
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || quiet) return
    el.focus({ preventScroll: true })
    const from = pick.from
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!from || reduced || typeof el.animate !== 'function') return
    const r = el.getBoundingClientRect()
    const ox = Math.max(0, Math.min(r.width, from.x - r.left)), oy = Math.max(0, Math.min(r.height, from.y - r.top))
    const dx = from.x - (r.left + ox), dy = from.y - (r.top + oy), d = Math.hypot(dx, dy) || 1
    el.style.transformOrigin = `${ox}px ${oy}px`
    el.animate([{ opacity: 0, transform: `translate(${(dx / d) * 16}px, ${(dy / d) * 16}px) scale(.96)` }, { opacity: 1, transform: 'none' }],
      { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' })
  }, [year, lane]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { nav.setPick(null); back() }
  const hid = `vd-exp-card-${year}`
  return (
    <div ref={ref} className="vd-exp-card" style={style} role={quiet ? undefined : 'dialog'} tabIndex={quiet ? undefined : -1} aria-labelledby={quiet ? undefined : hid}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
      <div className="vd-exp-card-h">
        <b id={hid}>{year}</b>
        {chapter && <span>{chapter.name}</span>}
        {!quiet && <button type="button" onClick={close}>{en ? 'Close' : 'Cerrar'}</button>}
      </div>
      {c ? (
        <dl className="vd-exp-card-d">
          <div><dt>{en ? 'Money' : 'Dinero'}</dt><dd>{formatCompactMXN(c.amount_mxn)}{m.total > 0 && <small> · {pctFmt(c.amount_mxn / m.total, lang)} {en ? 'of the record' : 'del expediente'}</small>}</dd></div>
          <div><dt>{en ? 'Contracts' : 'Contratos'}</dt><dd>{formatNumber(c.n_contracts)}</dd></div>
          <div><dt>{en ? 'Without a tender' : 'Sin licitación'}</dt><dd>{year < DA_RECORDED_FROM
            ? (en ? 'not recorded before 2011' : 'sin registro antes de 2011')
            : `${formatNumber(c.n_direct_award)} ${en ? 'of' : 'de'} ${formatNumber(c.n_contracts)}`}</dd></div>
          {c.avg_risk_score != null && (
            <div><dt>{en ? 'Mean risk indicator' : 'Indicador de riesgo medio'}</dt><dd style={{ color: indInk(c.avg_risk_score), fontWeight: 700 }}>{indFmt(c.avg_risk_score)}</dd></div>
          )}
        </dl>
      ) : <p className="vd-exp-card-n">{en ? 'No contracts that year.' : 'Sin contratos ese año.'}</p>}
      {rows.length > 0 && (
        <ul className="vd-exp-card-l" aria-label={en ? `Its largest ${w.many} that year` : `Sus mayores ${w.many} ese año`}>
          {rows.map((l) => (
            <li key={l.id} className={l === lane ? 'is-on' : undefined}>
              <i style={{ background: l.color }} aria-hidden="true" />
              <LaneChip lane={l} />
              <span>{formatCompactMXN(l.cells[year].amount_mxn)}</span>
            </li>
          ))}
        </ul>
      )}
      {c && (
        <p className="vd-exp-card-a">
          {lane && lane.cells[year] && (
            <Link className="ct-link" to={`${nav.contractsHref}${sep}${lane.type}_id=${lane.id}&year=${year}`}>
              {en ? `Its ${formatNumber(lane.cells[year].n_contracts)} contracts with ${laneLabel(lane)} →` : `Sus ${formatNumber(lane.cells[year].n_contracts)} contratos con ${laneLabel(lane)} →`}
            </Link>
          )}
          <Link className="ct-link" to={`${nav.contractsHref}${sep}year=${year}`}>
            {en ? `All ${formatNumber(c.n_contracts)} contracts of ${year} →` : `Los ${formatNumber(c.n_contracts)} contratos de ${year} →`}
          </Link>
        </p>
      )}
    </div>
  )
}

const clickAt = (e: MouseEvent<Element>) => ({ x: e.clientX, y: e.clientY })

// ─── desktop geometry (px) ───────────────────────────────────────────────────
const KEY_W = 256, GAP = 16, HEAD = 44, RIB = 116, TICK = 20, LANEKEY = 22, LH = 30, IND = 24, FACT_ROW = 20, SHARE_W = 56

export function VendorExpediente({ data, loading, vendorId, caseYear, counts, lang }: {
  data: VendorInstitutionsTimelineResponse | undefined
  loading: boolean
  vendorId: number
  /** The year of its documented case, if any: a «why» mark on the spine. */
  caseYear?: number | null
  counts?: Record<number, number>
  lang: Lang
}) {
  const extend = useCallback((m: Expediente) => ({
    facts: caseYear != null && caseYear >= m.start && caseYear <= m.end ? [{ year: caseYear, kind: 'case' as const }] : [],
    claims: [],
  }), [caseYear])
  return <Expediente data={data} loading={loading} contractsHref={`/contracts?vendor_id=${vendorId}`} extend={caseYear != null ? extend : undefined} counts={counts} lang={lang} />
}

/** The spine draws in once, left to right (phone: top to bottom), when it first reaches the screen;
 *  already on screen = plays with the data's arrival (DESIGN §7, t0 = data). Reduced motion: never
 *  set, the final state paints. 'wait' clips it until the reader scrolls to it. */
function useRevealOnce(ref: RefObject<HTMLElement | null>, ready: boolean) {
  const [st, setSt] = useState<'wait' | 'play' | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!ready || !el || st === 'play') return
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) { setSt('play'); return }
    setSt('wait')
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSt('play'); io.disconnect() } }, { rootMargin: '0px 0px -15% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  return st ?? undefined
}

/** The year the reader points at (scrub) and the year/lane the reader opened (drill card). */
type Scrub = { year: number; on: boolean }
export type Pick = { year: number; lane: Lane | null; from: { x: number; y: number } | null }

export function Expediente({ data, loading, contractsHref, extend, counts, lang }: {
  data: TimelineData | undefined
  loading: boolean
  contractsHref: string
  /** A layer on top (the ARIA case): more facts for the spine, claims that lead «La lectura». Keep it stable (useCallback). */
  extend?: (m: Expediente) => { facts: Fact[]; claims: Claim[] }
  /** Contracts per lane from the entity's own record (lectura counts; see buildLectura). */
  counts?: Record<number, number>
  lang: Lang
}) {
  const ref = useRef<HTMLElement>(null)
  const width = useMeasuredWidth(ref)
  const [lens, setLens] = useState<Lens>('money')
  const [scrub, setScrub] = useState<Scrub | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [said, setSaid] = useState('')
  const { model, lead } = useMemo(() => {
    const m = data ? buildExpediente(data) : null
    if (!m || !extend) return { model: m, lead: [] as Claim[] }
    const x = extend(m)
    return { model: { ...m, facts: [...m.facts, ...x.facts].sort((a, b) => a.year - b.year) }, lead: x.claims }
  }, [data, extend])
  const en = lang === 'en'
  const reveal = useRevealOnce(ref, !!model && width > 0)
  // a new entity (route change on the same page) closes the card and the scrub
  useEffect(() => { setPick(null); setScrub(null) }, [model?.src])
  if (!loading && !model) return null
  const w = model ? laneWords(model.laneType, en) : null
  const shareRibbon = model?.ribbonMode === 'share' && !phoneW(width)
  const phone = phoneW(width)
  const wide = width >= 1100           // the rail sits beside the spine; below, it stacks under it
  const spineW = wide ? width - RAIL_W - 32 : width
  return (
    <section ref={ref} className="vd-exp" data-reveal={reveal} aria-labelledby="vd-exp-h" aria-busy={loading || undefined} style={loading ? { minHeight: 480 } : undefined}>
      <h2 id="vd-exp-h" className="sr-only">{en ? 'The record by administration' : 'El expediente por sexenios'}</h2>
      {model && w && width > 0 && (
        <div className={wide ? 'vd-exp-body is-wide' : 'vd-exp-body'} style={wide ? { gridTemplateColumns: `minmax(0, 1fr) ${RAIL_W}px` } : undefined}>
          <div>
            {(() => {
              const nav = { scrub, setScrub, pick, setPick, say: setSaid, contractsHref }
              return phone
                ? <SpinePhone m={model} width={spineW} lens={lens} setLens={setLens} lang={lang} nav={nav} />
                : <SpineDesk m={model} width={spineW} lens={lens} setLens={setLens} lang={lang} nav={nav} />
            })()}
            <p className="sr-only" aria-live="polite">{said}</p>
            <p className="vd-exp-cap">
              {lens === 'money'
                ? (en
                  ? <><b>Chapters</b> = administrations · <b>ribbon</b> = {shareRibbon ? <>share of the year's money held by its 5 largest suppliers (light) and by the largest one (dark, named)</> : <>money of the year by {w.one}</>} · <b>lanes</b> = its {model.lanes.length} largest {w.many}, width = money of the year · <b>numerals</b> = mean indicator of the year.</>
                  : <><b>Capítulos</b> = sexenios · <b>cinta</b> = {shareRibbon ? <>parte del dinero del año en sus 5 mayores proveedores (claro) y en el mayor (oscuro, con nombre)</> : <>dinero del año por {w.one}</>} · <b>carriles</b> = sus {model.lanes.length} mayores {w.many}, ancho = dinero del año · <b>cifras</b> = indicador medio del año.</>)
                : (en
                  ? <><b>Square</b> = most contracts that year without a tender · <b>circle</b> = most tendered · <b>size</b> = money of the year (log) · colour = {w.one} · <b>grey dot</b> = before {DA_RECORDED_FROM}, when CompraNet did not record the procedure.</>
                  : <><b>Cuadro</b> = la mayoría de sus contratos del año sin licitación · <b>círculo</b> = la mayoría licitados · <b>tamaño</b> = dinero del año (log) · color = {w.one} · <b>punto gris</b> = antes de {DA_RECORDED_FROM}, cuando CompraNet no registraba el procedimiento.</>)}
              {model.end >= SWITCH_YEAR && (en
                ? ' Dashed line = 28 Sep 2025, when CompraNet froze and ComprasMX took over the record.'
                : ' Línea punteada = 28 sep 2025, cuando CompraNet se congeló y ComprasMX tomó el registro.')}
              {' '}{en ? 'Point at a year to read it; click it to open it.' : 'Señale un año para leerlo; haga clic para abrirlo.'}
              {' '}{en ? `Source: its ${formatNumber(model.totalN)} contracts.` : `Fuente: sus ${formatNumber(model.totalN)} contratos.`}
              {' '}{en ? NOMINAL_NOTE.en : NOMINAL_NOTE.es}
              {' '}<Link className="ct-link" to={contractsHref}>{en ? 'Open the contracts' : 'Abrir los contratos'}</Link>
            </p>
          </div>
          <Lectura m={model} lead={lead} counts={counts} lang={lang} />
        </div>
      )}
    </section>
  )
}

const RAIL_W = 320 // Source Serif 4 sets ≈ 6% wider than Spectral: 300 → 320 keeps the rail's line count (proof:ui RAGGED, DESIGN §2 2026-10-28)

function Tokens({ ts }: { ts: Token[] }) {
  return <>{ts.map((t, i) => typeof t === 'string'
    ? t
    : 'b' in t
      ? <b key={i}>{t.b}</b>
      : (() => {
        const type = t.inst.type ?? 'institution'
        const chip = (
          <EntityIdentityChip key={i} type={type} id={t.inst.id} name={t.inst.name} variant="name" className="vd-exp-chip">
            {entLabel(type, t.inst.name, t.inst.siglas, 'md')}
          </EntityIdentityChip>
        )
        return t.bold ? <b key={i}>{chip}</b> : chip
      })())}</>
}

/** «La lectura»: the claims the cells support (each only when its condition holds) + four figures. */
function Lectura({ m, lead, counts, lang }: { m: Expediente; lead: Claim[]; counts?: Record<number, number>; lang: Lang }) {
  const en = lang === 'en'
  // the lanes are buyers on a vendor dossier, suppliers on an institution's
  const { claims, figures, leaders } = useMemo(() => (m.laneType === 'institution' ? { ...buildLectura(m, counts), leaders: [] } : buildInstitutionLectura(m)), [m, counts])
  return (
    <aside className="vd-lec" aria-labelledby="vd-lec-h">
      <h3 id="vd-lec-h" className="vd-lec-h">
        <span>{en ? 'The reading' : 'La lectura'}</span>
        <span className="vd-lec-k">{en ? '§ computed' : '§ calculada'}</span>
      </h3>
      {[...lead, ...claims].map((c) => <p key={c.key} className="vd-lec-claim"><Tokens ts={en ? c.en : c.es} /></p>)}
      {leaders.length > 0 && (
        <div className="vd-lec-lead" role="group" aria-label={en ? "The year's largest supplier, by administration" : 'El mayor proveedor del año, por sexenio'}>
          <div className="vd-lec-k">{en ? "The year's largest, by administration" : 'El mayor del año, por sexenio'}</div>
          {/* WCAG 1.3.1: the caption sits outside the <dl>, which may hold only dt/dd groups */}
          <dl>{leaders.map((l) => (
            <div key={l.chapter}>
              <dt>{l.chapter}</dt>
              <dd><Tokens ts={[{ inst: l.inst }]} /></dd>
              <dd className="mono" title={en ? `led ${l.years} of ${l.of} years; peak ${pctFmt(l.share, lang)}` : `el mayor en ${l.years} de ${l.of} años; tope ${pctFmt(l.share, lang)}`}>{l.years}/{l.of}</dd>
            </div>
          ))}</dl>
        </div>
      )}
      <dl className="vd-lec-figs">
        {figures.map((f) => (
          <div key={f.key}><dt>{en ? f.en : f.es}</dt><dd>{f.value.replace(' / ', en ? ' of ' : ' de ')}</dd></div>
        ))}
      </dl>
    </aside>
  )
}

function SpineDesk({ m, width, lens, setLens, lang, nav }: { m: Expediente; width: number; lens: Lens; setLens: (l: Lens) => void; lang: Lang; nav: Nav }) {
  const en = lang === 'en'
  const W = Math.max(320, width - KEY_W - GAP)
  const span = W - SHARE_W, n = m.years.length, cw = span / n
  const X = (y: number) => (y - m.start) * cw
  const XM = (y: number) => X(y) + cw / 2
  const yRib = HEAD, yTick = yRib + RIB, yLanes = yTick + TICK + LANEKEY
  const yInd = yLanes + m.lanes.length * LH, yFacts = yInd + IND
  const yS = (v: number) => yRib + RIB - (v / m.vmax) * (RIB - 8)
  const yP = (p: number) => yRib + RIB - (p / m.shareMax) * (RIB - 8)
  const words = laneWords(m.laneType, en)
  const cellMax = Math.max(1, ...m.lanes.flatMap((l) => Object.values(l.cells).map((c) => c.amount_mxn)))
  const plotRef = useRef<HTMLDivElement>(null)

  // stacked ribbon
  const base: Record<number, number> = Object.fromEntries(m.years.map((y) => [y, 0]))
  const ribbon = m.ribbon.map((s) => {
    const up: [number, number][] = [], dn: [number, number][] = []
    for (const y of m.years) {
      const b = base[y], v = s.vals[y] ?? 0
      up.push([XM(y), yS(b + v)]); dn.push([XM(y), yS(b)]); base[y] = b + v
    }
    return { ...s, d: `${smooth(up)} L${dn.reverse().map((p) => p.join(',')).join(' L')} Z` }
  })
  // share mode (institutions whose lanes hold little of the money): the year's top-5 share (light)
  // over the year's largest vendor (dark), the leader named once per chapter at its peak year.
  const shareArea = (k: 'top5_share' | 'top_share') => {
    const ys = m.shareYears
    const pts = ys.map((y) => [XM(y), yP(m.byYear[y][k] ?? 0)] as [number, number])
    return `${smooth(pts)} L${XM(ys[ys.length - 1])},${yP(0)} L${XM(ys[0])},${yP(0)} Z`
  }
  // one label per chapter at its peak year; names cut at a word (≤ 18 chars), a label that would
  // collide with the previous one slides right or is dropped (serif 12 ≈ 6.6 px a character)
  let lastRight = -Infinity
  const leaders = m.ribbonMode !== 'share' ? [] : m.chapters.flatMap((c) => {
    const ys = m.shareYears.filter((y) => y >= c.from && y <= c.to)
    const y = ys.reduce<number | null>((b, x) => (b == null || m.byYear[x].top_share! > m.byYear[b].top_share! ? x : b), null)
    const r = y != null ? m.byYear[y] : null
    if (!r || !r.top_vendor_name || r.top_share! < 0.03) return []
    const full = formatEntityName('vendor', r.top_vendor_name, 'md')
    const name = full.length <= 18 ? full : full.slice(0, 19).replace(/\s+\S*$/, '') || full.slice(0, 18)
    const label = `${name} ${pctFmt(r.top_share!, lang)}`
    const half = (label.length * 6.6) / 2
    const x = Math.max(XM(y!), half + 2, lastRight + 12 + half)
    if (x > span - half - 2) return []
    lastRight = x + half
    return [{ key: c.key, x, y: Math.max(yRib + 14, yP(r.top5_share ?? r.top_share!) - 6), label }]
  })
  // Stagger: each fact takes the first row where its label overlaps no other label and
  // no leader line crosses a label (labels measured as mono 13 ≈ 7.8 px a character).
  // The «why» marks place first (case, crossing, the switch, the sexenio turn), then the record's own
  // facts; a fact with no free row among five is left to the phone list and «La lectura» (never stacked).
  type Placed = { f: Fact; row: number; x: number; end: boolean; x0: number; x1: number }
  const factRows: Placed[] = []
  const RANK: Record<Fact['kind'], number> = { case: 0, crosses: 1, switch: 2, admin: 3, enters: 4, peak: 5, first: 6, record: 7, still: 8 }
  for (const f of [...m.facts].sort((a, b) => RANK[a.kind] - RANK[b.kind])) {
    const x = factX(f, X, cw), end = x > span * 0.62, w = factPlain(f, lang).length * 7.8 + 8
    const x0 = end ? x - w : x, x1 = end ? x : x + w
    const ok = (r: number) => factRows.every((g) =>
      (g.row !== r || g.x1 + 8 < x0 || x1 + 8 < g.x0)
      && (g.row <= r || g.x < x0 || g.x > x1)
      && (g.row >= r || x < g.x0 || x > g.x1))
    const row = [0, 1, 2, 3, 4].find(ok)
    if (row != null) factRows.push({ f, row, x, end, x0, x1 })
  }
  const FACTS = (Math.max(0, ...factRows.map((r) => r.row)) + 1) * FACT_ROW + 8, H = yFacts + FACTS
  const yHit0 = yRib, yHit1 = yInd + IND
  const hot = nav.scrub?.on ? nav.scrub.year : null
  const laneAt = (clientY: number) => {
    const top = plotRef.current?.getBoundingClientRect().top ?? 0
    const k = Math.floor((clientY - top - yLanes) / LH)
    return k >= 0 && k < m.lanes.length ? m.lanes[k] : null
  }
  const pk = nav.pick
  const cardLeft = pk ? (XM(pk.year) < span * 0.6 ? X(pk.year + 1) + 8 : X(pk.year) - 8 - CARD_W) : 0

  return (
    <div className="vd-exp-grid" style={{ gridTemplateColumns: `${KEY_W}px minmax(0, 1fr)`, columnGap: GAP }}>
      <div className="vd-exp-keys">
        <div style={{ height: HEAD }}><LensToggle lens={lens} setLens={setLens} lang={lang} /></div>
        {m.ribbonMode === 'share' ? (
          <div style={{ height: RIB }} className="vd-exp-k">
            <b>{en ? 'Concentration by year' : 'Concentración por año'}</b>
            <span>{en ? `light = the year's 5 largest · dark = the largest · top ${pctFmt(m.shareMax, lang)}` : `claro = los 5 mayores del año · oscuro = el mayor · tope ${pctFmt(m.shareMax, lang)}`}</span>
          </div>
        ) : (
          <div style={{ height: RIB }} className="vd-exp-k">
            <b>{en ? 'Money by year' : 'Dinero por año'}</b>
            {hot != null ? (
              <span className="vd-exp-read">{yearLine(m, hot, lang)}</span>
            ) : (<>
              <span>{en ? `top ${formatCompactMXN(m.vmax)}` : `tope ${formatCompactMXN(m.vmax)}`}</span>
              {m.othersCount > 0 && <span>{en ? `grey = ${words.others}` : `gris = ${words.others}`}</span>}
            </>)}
          </div>
        )}
        <div style={{ height: TICK }} />
        <div style={{ height: LANEKEY }} className="vd-exp-k"><b>{words.Many}</b></div>
        {m.lanes.map((l) => (
          <div key={l.id} style={{ height: LH }} className="vd-exp-lane">
            <i style={{ background: l.color }} aria-hidden="true" />
            <LaneChip lane={l} />
          </div>
        ))}
        <div style={{ height: IND }} className="vd-exp-k"><b>{en ? 'Mean indicator' : 'Indicador medio'}</b></div>
        <div style={{ height: FACTS }} className="vd-exp-k"><b>{en ? 'Facts' : 'Hechos'}</b></div>
      </div>

      <div className="vd-exp-plot" ref={plotRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="application" tabIndex={0} data-lens={lens}
          aria-label={en
            ? `Money by year and ${words.one}, by administration. Left and right arrows walk the years; Enter opens one; Escape closes it.`
            : `Dinero por año y ${words.one}, por sexenio. Las flechas izquierda y derecha recorren los años; Enter abre uno; Escape lo cierra.`}
          onKeyDown={scrubKeys(m, nav, lang)}
          onBlur={() => nav.setScrub((s) => (s ? { ...s, on: false } : s))}
          onPointerLeave={() => nav.setScrub((s) => (s ? { ...s, on: false } : s))}>
          {m.chapters.map((c, i) => {
            const x0 = X(c.from), w = X(c.to + 1) - x0
            // the money rides the name only when both fit before the next chapter's cut
            const wide = w > 12 + c.name.length * 9 + (formatCompactMXN(c.amount).length + 3) * 7.3
            return (
              <g key={c.key}>
                <rect className={i % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={x0} y={0} width={w} height={H} />
                <line className="vd-exp-cut" x1={x0 + 0.5} y1={2} x2={x0 + 0.5} y2={18} />
                <text className="vd-exp-ch" x={x0 + 6} y={14}>{c.name}{wide && <tspan className="vd-exp-chf"> · {formatCompactMXN(c.amount)}</tspan>}</text>
                <text className="vd-exp-chf" x={x0 + 6} y={32}>
                  {pctFmt(c.share, lang)} · {en ? 'ind.' : 'ind.'} <tspan style={{ fill: indInk(c.risk), fontWeight: 700 }}>{c.risk != null ? indFmt(c.risk) : '—'}</tspan>
                </text>
              </g>
            )
          })}
          <rect className={hot != null ? 'vd-exp-scrub is-on' : 'vd-exp-scrub'} x={0} y={yHit0} width={cw} height={yHit1 - yHit0}
            style={{ transform: `translateX(${X(nav.scrub?.year ?? m.start)}px)` }} />
          {m.ribbonMode === 'share' ? (
            <g>
              <path d={shareArea('top5_share')} fill={CATEGORICAL[1]} fillOpacity={0.22}>
                <title>{en ? "the year's 5 largest suppliers" : 'los 5 mayores proveedores del año'}</title>
              </path>
              <path d={shareArea('top_share')} fill={CATEGORICAL[1]} fillOpacity={0.85}>
                <title>{en ? "the year's largest supplier" : 'el mayor proveedor del año'}</title>
              </path>
              {leaders.map((l) => <text key={l.key} className="vd-exp-lead" x={l.x} y={l.y} textAnchor="middle">{l.label}</text>)}
            </g>
          ) : ribbon.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} fillOpacity={s.label ? 0.85 : 1}>
              <title>{s.label ?? (en ? `other ${words.many}` : `otros ${words.many}`)}</title>
            </path>
          ))}
          <line className="vd-exp-axis" x1={0} y1={yTick + 0.5} x2={span} y2={yTick + 0.5} />
          {m.years.filter((y) => (y - 2002) % 4 === 0 || y === m.end).map((y) => (
            <text key={y} className="vd-exp-yr" x={XM(y)} y={yTick + 15} textAnchor="middle">{y}</text>
          ))}
          {m.lanes.map((l, i) => {
            const yc = yLanes + i * LH + LH / 2
            const lmax = Math.max(1, ...Object.values(l.cells).map((c) => c.amount_mxn))
            const ys = Object.keys(l.cells).map(Number)
            const a = Math.min(...ys), b = Math.max(...ys)
            const lname = laneLabel(l)
            return (
              <g key={l.id}>
                <line className="vd-exp-tenure" x1={X(a)} y1={yc} x2={X(b + 1)} y2={yc} />
                {(() => {
                  const pts = m.years.map((y) => [XM(y), l.cells[y] ? 1.5 + 9 * Math.sqrt(l.cells[y].amount_mxn / lmax) : 0] as const)
                  const d = `${smooth(pts.map(([x, h]) => [x, yc - h]))} L${pts.slice().reverse().map(([x, h]) => `${x},${yc + h}`).join(' L')} Z`
                  return <path className="vd-exp-rib" d={d} fill={l.color} fillOpacity={0.85}><title>{`${lname} · ${pctFmt(l.share, lang)}`}</title></path>
                })()}
                {/* both lenses stay drawn: the ribbon thins to its line as the year glyphs grow (the lens morphs, never swaps) */}
                {m.years.filter((y) => l.cells[y]).map((y) => (
                  <g key={y} className="vd-exp-gl" style={{ transitionDelay: `${Math.min(240, (y - m.start) * 10)}ms` }}>
                    <title>{cellTitle(lname, y, l.cells[y], lang)}</title>
                    <Glyph c={l.cells[y]} year={y} x={XM(y)} y={yc} max={Math.min(LH - 4, cw - 2)} cellMax={cellMax} color={l.color} />
                  </g>
                ))}
                <text className="vd-exp-share" x={span + 8} y={yc + 4}>{pctFmt(l.share, lang)}</text>
              </g>
            )
          })}
          {m.years.map((y) => {
            const c = m.byYear[y]
            if (!c || c.avg_risk_score == null) return null
            return <text key={y} className="vd-exp-ind" x={XM(y)} y={yInd + 16} textAnchor="middle" style={{ fill: indInk(c.avg_risk_score) }}>{indFmt(c.avg_risk_score)}</text>
          })}
          {m.end >= SWITCH_YEAR && (
            <line className="vd-exp-seam" x1={X(SWITCH_YEAR) + cw * SWITCH_AT} y1={yRib} x2={X(SWITCH_YEAR) + cw * SWITCH_AT} y2={yFacts - 2} />
          )}
          {hot != null && <text className="vd-exp-yr is-hot" x={XM(hot)} y={yTick + 15} textAnchor="middle">{hot}</text>}
          {/* the year columns take the pointer: hover scrubs, click opens the year (the lane under the click leads) */}
          {m.years.map((y) => (
            <rect key={`h${y}`} className="vd-exp-hit" x={X(y)} y={yHit0} width={cw} height={yHit1 - yHit0}
              onPointerEnter={() => nav.setScrub(() => ({ year: y, on: true }))}
              onClick={(e) => nav.setPick({ year: y, lane: laneAt(e.clientY), from: clickAt(e) })}>
              <title>{yearLine(m, y, lang)}</title>
            </rect>
          ))}
          {factRows.map(({ f, row, x }) => (
            <line key={`${f.kind}${f.year}`} className="vd-exp-evl" x1={x} y1={yFacts - 2} x2={x} y2={yFacts + row * FACT_ROW + 16} />
          ))}
        </svg>
        <div className="vd-exp-facts" style={{ top: yFacts, height: FACTS }}>
          {factRows.map(({ f, row, x, end }) => (
            <span key={`${f.kind}${f.year}`} className={[end ? 'is-end' : null, factClass(f)].filter(Boolean).join(' ') || undefined}
              style={{ left: x, top: row * FACT_ROW + 2, animationDelay: `${Math.round(200 + (x / span) * 800)}ms` }}>{factText(f, lang)}</span>
          ))}
        </div>
        {pk && (
          <YearCard m={m} pick={pk} nav={nav} lang={lang}
            back={() => plotRef.current?.querySelector<SVGElement>('svg')?.focus({ preventScroll: true })}
            style={{ position: 'absolute', top: yTick + TICK, left: Math.max(0, Math.min(W - CARD_W, cardLeft)), width: CARD_W }} />
        )}
      </div>
    </div>
  )
}

// ─── phone: years as rows, lanes as columns (concept B-390) ──────────────────
const P_YY = 24, P_RIB = 80, P_NUM = 36, P_GH = 20, P_RH = 16

function SpinePhone({ m, width, lens, setLens, lang, nav }: { m: Expediente; width: number; lens: Lens; setLens: (l: Lens) => void; lang: Lang; nav: Nav }) {
  const en = lang === 'en'
  const svgRef = useRef<SVGSVGElement>(null)
  const lanes = m.lanes.slice(0, 6)
  const x0 = P_YY + P_RIB + P_NUM
  const LW = (width - x0) / Math.max(1, lanes.length)
  const cellMax = Math.max(1, ...lanes.flatMap((l) => Object.values(l.cells).map((c) => c.amount_mxn)))
  const rows: ({ kind: 'ch'; c: Expediente['chapters'][number]; y: number } | { kind: 'yr'; year: number; y: number })[] = []
  let y = 0
  for (const c of m.chapters) {
    rows.push({ kind: 'ch', c, y }); y += P_GH
    for (let yy = c.from; yy <= c.to; yy++) { rows.push({ kind: 'yr', year: yy, y }); y += P_RH }
  }
  const H = y
  const rowY = (yy: number) => rows.find((r) => r.kind === 'yr' && r.year === yy)?.y ?? 0
  const hot = nav.scrub?.on ? nav.scrub.year : null
  const laneAt = (clientX: number) => {
    const left = svgRef.current?.getBoundingClientRect().left ?? 0
    const k = Math.floor((clientX - left - x0) / LW)
    return k >= 0 && k < lanes.length ? lanes[k] : null
  }
  return (
    <div className="vd-exp-ph">
      <div className="vd-exp-ph-top">
        <span className="vd-exp-k"><b>{en ? 'Money · ind.' : 'Dinero · ind.'}</b></span>
        <LensToggle lens={lens} setLens={setLens} lang={lang} />
      </div>
      <div className="vd-exp-ph-heads" style={{ paddingLeft: x0 }}>
        {lanes.map((l) => (
          <div key={l.id} style={{ width: LW }}><span style={{ borderColor: l.color }}><LaneChip lane={l} /></span></div>
        ))}
      </div>
      <svg ref={svgRef} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="application" tabIndex={0} data-lens={lens}
        aria-label={en
          ? `Money by year and ${laneWords(m.laneType, en).one}, by administration. Up and down arrows walk the years; Enter opens one; Escape closes it.`
          : `Dinero por año y ${laneWords(m.laneType, en).one}, por sexenio. Las flechas arriba y abajo recorren los años; Enter abre uno; Escape lo cierra.`}
        onKeyDown={scrubKeys(m, nav, lang)}
        onBlur={() => nav.setScrub((s) => (s ? { ...s, on: false } : s))}>
        <rect className={hot != null ? 'vd-exp-scrub is-on' : 'vd-exp-scrub'} x={0} y={0} width={width} height={P_RH}
          style={{ transform: `translateY(${rowY(nav.scrub?.year ?? m.start)}px)` }} />
        {rows.map((r, i) => {
          if (r.kind === 'ch') {
            const k = m.chapters.indexOf(r.c)
            const h = P_GH + (r.c.to - r.c.from + 1) * P_RH
            return (
              <g key={`c${i}`}>
                <rect className={k % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={0} y={r.y} width={width} height={h} />
                <text className="vd-exp-ch" x={0} y={r.y + 14}>{r.c.name}<tspan className="vd-exp-chf"> · {formatCompactMXN(r.c.amount)} · {pctFmt(r.c.share, lang)}</tspan></text>
              </g>
            )
          }
          const c = m.byYear[r.year]
          const bw = c ? Math.max(1, P_RIB * (c.amount_mxn / m.vmax)) : 0
          return (
            <g key={`y${r.year}`}>
              <text className="vd-exp-yr" x={0} y={r.y + 12}>{String(r.year).slice(2)}</text>
              {c && <rect className="vd-exp-bar" x={P_YY} y={r.y + 3} width={bw} height={P_RH - 6} />}
              {c?.avg_risk_score != null && (
                <text className="vd-exp-ind" x={P_YY + bw + 4} y={r.y + 12} style={{ fill: indInk(c.avg_risk_score) }}>{indFmt(c.avg_risk_score)}</text>
              )}
              {lanes.map((l, li) => {
                const cell = l.cells[r.year]
                if (!cell) return null
                const cx = x0 + li * LW + LW / 2
                const lmax = Math.max(1, ...Object.values(l.cells).map((v) => v.amount_mxn))
                const w = 2 + (LW - 6) * Math.sqrt(cell.amount_mxn / lmax)
                return (
                  <g key={l.id}>
                    <rect className="vd-exp-rib" x={cx - w / 2} y={r.y + 1} width={w} height={P_RH - 2} fill={l.color} fillOpacity={0.85} />
                    <g className="vd-exp-gl" style={{ transitionDelay: `${Math.min(240, (r.year - m.start) * 10)}ms` }}>
                      <Glyph c={cell} year={r.year} x={cx} y={r.y + P_RH / 2} max={Math.min(P_RH - 3, LW - 4)} cellMax={cellMax} color={l.color} />
                    </g>
                  </g>
                )
              })}
            </g>
          )
        })}
        {/* a tap on a year row opens it (the lane under the finger leads) */}
        {rows.map((r) => r.kind === 'yr' && (
          <rect key={`h${r.year}`} className="vd-exp-hit" x={0} y={r.y - 4} width={width} height={P_RH + 8}
            onPointerEnter={() => nav.setScrub(() => ({ year: r.year, on: true }))}
            onClick={(e) => nav.setPick({ year: r.year, lane: laneAt(e.clientX), from: clickAt(e) })} />
        ))}
      </svg>
      {nav.pick && <YearCard m={m} pick={nav.pick} nav={nav} lang={lang} back={() => svgRef.current?.focus({ preventScroll: true })} />}
      {m.facts.length > 0 && (
        <ul className="vd-exp-ph-facts" aria-label={en ? 'Facts' : 'Hechos'}>
          {m.facts.map((f) => <li key={`${f.kind}${f.year}`} className={factClass(f)}><span>{f.year}</span><span>{factText(f, lang)}</span></li>)}
        </ul>
      )}
    </div>
  )
}

// ─── the orbit (concept A, small): the vendor at the centre, its buyers around it ──
const O = 180, OR = O / 2 - 6, ORC = 12
const theta = (t: number) => -Math.PI / 2 + (2 * Math.PI * (t - 2002)) / 25
const shareU = (s: number) => Math.min(1, Math.max(0, Math.log10(1 / Math.max(s, 1e-7)) / 4))
const orbitR = (s: number) => ORC + shareU(s) * (OR - ORC)

export function VendorOrbit({ data, vendorId, className, lang }: { data: VendorInstitutionsTimelineResponse | undefined; vendorId: number; className?: string; lang: Lang }) {
  const tl = useMemo(() => (data ? toTimeline(data) : undefined), [data])
  return <Orbit tl={tl} skyHref={cieloHref({ planet: vendorId })} centerId={vendorId} className={className} lang={lang} />
}

/** Concept A, small: the entity at the centre, its buyers (vendor) or suppliers (institution) around it. */
export function Orbit({ tl, skyHref, centerId, className, lang }: { tl: EntityTimeline | undefined; skyHref: string; centerId?: number; className?: string; lang: Lang }) {
  // owner 11-06: «I like this but it has zero interactivity» → hover/focus names a body, click opens the pair's contracts
  const [on, setOn] = useState<number | null>(null)
  const navigate = useNavigate()
  const en = lang === 'en'
  const bodies = useMemo(() => {
    if (!tl) return []
    const total = tl.years.reduce((s, y) => s + y.amount_mxn, 0) || 1
    const byFirst = new Map<number, number[]>()
    tl.entities.forEach((b) => byFirst.set(b.first_year, [...(byFirst.get(b.first_year) ?? []), b.id]))
    let k = 0
    return tl.entities.map((b) => {
      const sib = byFirst.get(b.first_year)!
      const t = theta(Math.max(2002, b.first_year) + (sib.indexOf(b.id) + 0.5) / sib.length)
      const share = b.amount_mxn / total
      const r = orbitR(share)
      const color = b.is_top ? laneColor(k++) : RAMP_INK[2]
      return {
        id: b.id, name: b.name, first: b.first_year, last: b.last_year, share, color, x: O / 2 + r * Math.cos(t), y: O / 2 + r * Math.sin(t),
        size: Math.min(8, Math.max(1.5, 1.5 + 1.2 * Math.log10(Math.max(b.amount_mxn, 1) / 1e6))),
        title: `${entLabel(tl.laneType, b.name, b.siglas)} · ${pctFmt(share, lang)} · ${b.first_year}–${b.last_year}`,
      }
    }).reverse() // small ones first, the large ones on top
  }, [tl, lang])
  if (!tl) return <div className={['vd-orbit', className].filter(Boolean).join(' ')} aria-hidden="true" />
  const w = laneWords(tl.laneType, en)
  // bodies are institutions on a vendor page, vendors on an institution page
  const bodyType = tl.laneType === 'institution' ? 'institution' : 'vendor'
  const pairHref = (id: number) => centerId == null
    ? `/${bodyType === 'institution' ? 'institutions' : 'vendors'}/${id}`
    : bodyType === 'institution' ? `/contracts?vendor_id=${centerId}&institution_id=${id}` : `/contracts?vendor_id=${id}&institution_id=${centerId}`
  const hot = on == null ? null : bodies.find((b) => b.id === on) ?? null
  const wedges = ADMINISTRATIONS.filter((a) => a.yearEnd >= 2002 && a.yearStart <= 2026)
  return (
    <figure className={['vd-orbit', className].filter(Boolean).join(' ')}>
      <svg viewBox={`0 0 ${O} ${O}`} role="img"
        aria-label={en ? `Its ${w.many} around it` : `Sus ${w.many} a su alrededor`}>
        {wedges.map((a, i) => {
          const t0 = theta(Math.max(2002, a.yearStart)), t1 = theta(Math.min(2027, a.yearEnd + 1))
          const c = O / 2, big = t1 - t0 > Math.PI ? 1 : 0
          const p = (r: number, t: number) => `${c + r * Math.cos(t)},${c + r * Math.sin(t)}`
          return <path key={a.key} className={i % 2 ? 'vd-orbit-w is-alt' : 'vd-orbit-w'}
            d={`M${p(OR, t0)} A${OR},${OR} 0 ${big} 1 ${p(OR, t1)} L${p(ORC, t1)} A${ORC},${ORC} 0 ${big} 0 ${p(ORC, t0)} Z`} />
        })}
        {[0.1, 0.01, 0.001].map((s) => <circle key={s} className="vd-orbit-ring" cx={O / 2} cy={O / 2} r={orbitR(s)} />)}
        {bodies.map((b) => (
          <g key={b.id} className="vd-orbit-b" data-on={on === b.id || undefined} data-dim={on != null && on !== b.id ? '' : undefined}
            role="link" tabIndex={0} aria-label={b.title}
            onMouseEnter={() => setOn(b.id)} onMouseLeave={() => setOn((v) => (v === b.id ? null : v))}
            onFocus={() => setOn(b.id)} onBlur={() => setOn((v) => (v === b.id ? null : v))}
            onClick={() => navigate(pairHref(b.id))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(pairHref(b.id)) } }}>
            <circle cx={b.x} cy={b.y} r={Math.max(b.size, 6)} fill="transparent" />
            <circle cx={b.x} cy={b.y} r={on === b.id ? b.size + 1.5 : b.size} fill={b.color} fillOpacity={0.9} />
            <title>{b.title}</title>
          </g>
        ))}
        <circle className="vd-orbit-core" cx={O / 2} cy={O / 2} r={4} />
      </svg>
      <figcaption aria-live="polite">
        {hot ? <span className="vd-orbit-hot"><EntityIdentityChip type={bodyType} id={hot.id} name={hot.name} variant="name" size="inherit" /> · {pctFmt(hot.share, lang)} · {hot.first}–{hot.last} · <Link className="ct-link" to={pairHref(hot.id)}>{centerId == null ? (en ? 'open →' : 'abrir →') : (en ? 'their contracts →' : 'sus contratos →')}</Link></span> : null}
        {hot ? ' ' : ''}{en
          ? `Its ${w.many}: angle = first year · closer = larger share · size = money.`
          : `Sus ${w.many}: ángulo = primer año · más cerca = ${tl.laneType === 'institution' ? 'más ingreso' : 'más gasto'} · tamaño = dinero.`}
        {' '}<Link className="ct-link" to={skyHref}>{en ? 'see it in the panorama →' : 'ver en el panorama →'}</Link>
      </figcaption>
    </figure>
  )
}
