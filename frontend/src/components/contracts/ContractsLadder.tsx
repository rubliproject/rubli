/**
 * ContractsLadder — /contracts «La escalera de montos» (owner pick A2, 2026-10-15).
 * A log ladder of amounts (10 mil → 100,000 MDP) over 2002–DATA_LAST_YEAR: each rung is a strip of
 * year × quarter-decade cells shaded by the active lens (Todos = blue count, Riesgo crítico =
 * red share, Adjudicación directa = amber share; 2002–2010 hatched «sin dato»). The filter's
 * 3,000 largest contracts are dots (red = crítico, hollow = > 10,000 MDP under review).
 * Hover = the dot's or cell's line · click a dot = «La ficha» docks out of the dot (archive
 * README 2026-10-28, direction A): the field dims to the dot and its 3 nearest (hairlines); when
 * the card would cover more than half the field it docks at the edge with a leader line ·
 * click a cell / rung row = the rung zooms to full height with a sample of its contracts.
 * URL: ?lente= · ?peldano= · ?c=. Canvas owns the marks, HTML owns the controls.
 * Data: GET /contracts/field (histogram + columns), honouring the list's URL filters.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { contractApi } from '@/api/client'
import type { ContractsFieldParams, ContractsFieldResponse } from '@/api/types'
import { CATEGORICAL, CATEGORICAL_TEXT, DATA_LAST_YEAR, NO_RISK_LABEL, PROCEDURE_TYPE_FIRST_YEAR, RAMP_INK, RISK_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { ContractCard, type CardWalk } from '@/components/contracts/ContractCard'
import type { Lines } from '@/components/kit/PageHead'
import '@/components/kit/kit.css'

type Lens = 'todos' | 'critico' | 'ad'
type Lang = 'es' | 'en'
interface Cell { n: number; k: number; a: number; v: number; s: number }
interface Prep {
  H: Map<number, Cell>; maxN: number; floor: number; none: number
  rungs: { n: number; v: number }[]; bins: number[]; binN: (b: number) => { n: number; v: number }
  yearN: number[]; noDa: number[]; total: number; value: number
}
interface Marks { n: number; id: number[]; amt: number[]; x: Float64Array; lg: Float64Array; j: Float64Array; risk: (number | null)[]; da: (number | null)[]; flag: number[]; sector: (number | null)[]; date: (string | null)[] }

const Y0 = 2002, Y1 = DATA_LAST_YEAR, NY = Y1 - Y0 + 1, B0 = 16, B1 = 44
const RUNG_ES = ['10 mil', '100 mil', '1 MDP', '10 MDP', '100 MDP', '1,000 MDP', '10,000 MDP', '100,000 MDP']
const RUNG_EN = ['10K MXN', '100K MXN', '1M MXN', '10M MXN', '100M MXN', '1B MXN', '10B MXN', '100B MXN']
const BLUE = CATEGORICAL_TEXT[1], AMBER = RISK_COLORS.high, RED = RISK_COLORS.critical, INK = CATEGORICAL[0], GRAY = RAMP_INK[3], RULE = RAMP_INK[1], PAPER = 'white'
const LENS_HUE: Record<Lens, string> = { todos: BLUE, critico: RED, ad: AMBER }
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pctTxt = (a: number, b: number) => { const v = b ? (100 * a) / b : 0; return `${v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)}%` }
const BEAT_BIN = 12.5, BEAT_DOTS = B1 - B0, DOT0 = BEAT_DOTS * BEAT_BIN + 300

function prep(f: ContractsFieldResponse): Prep {
  const H = new Map<number, Cell>()
  let floor = 0, none = 0, maxN = 1
  const rungs = Array.from({ length: 7 }, () => ({ n: 0, v: 0 }))
  const bins = new Array<number>(B1).fill(0), binV = new Array<number>(B1).fill(0)
  const yearN = new Array<number>(NY).fill(0), yearA = new Array<number>(NY).fill(0)
  for (const [y, b0, n, k, a, v, sc = n] of f.hist) {
    if (b0 < 0) { none += n; continue }
    if (b0 < B0) { floor += n; continue }
    const b = Math.min(b0, B1 - 1)
    bins[b] += n; binV[b] += v
    const r = rungs[Math.floor(b / 4) - 4]; r.n += n; r.v += v
    if (y < Y0 || y > Y1) continue
    const key = y * 100 + b, c = H.get(key) ?? { n: 0, k: 0, a: 0, v: 0, s: 0 }
    c.n += n; c.k += k; c.a += a; c.v += v; c.s += sc; H.set(key, c)
    yearN[y - Y0] += n; yearA[y - Y0] += a
  }
  for (const c of H.values()) if (c.n > maxN) maxN = c.n
  // procedure type is coded from 2011 (DQ1 § 2); a later year with < 1% direct awards is also absence, not a finding
  const noDa = yearN.map((n, i) => (n > 0 && (Y0 + i < PROCEDURE_TYPE_FIRST_YEAR || yearA[i] / n < 0.01) ? Y0 + i : -1)).filter((y) => y > 0)
  return { H, maxN, floor, none, rungs, bins, binN: (b) => ({ n: bins[b], v: binV[b] }), yearN, noDa, total: f.total, value: f.value }
}

function toMarks(f: ContractsFieldResponse): Marks {
  const n = f.n, x = new Float64Array(n), lg = new Float64Array(n), j = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const d = f.col.date[i], id = f.col.id[i]
    if (d && d.length >= 7) {
      const Y = +d.slice(0, 4), M = +d.slice(5, 7) || 1, D = +d.slice(8, 10) || 1
      x[i] = Y + (M - 1 + (D - 1) / 31) / 12
    } else x[i] = NaN
    lg[i] = Math.log10(f.col.amount[i])
    j[i] = (((id * 31) % 7) - 3) * 0.6
  }
  return { n, id: f.col.id, amt: f.col.amount, x, lg, j, risk: f.col.risk, da: f.col.da, flag: f.col.flag, sector: f.col.sector, date: f.col.date }
}

const sectorOf = (id: number | null | undefined) => SECTORS.find((s) => s.id === id)
const isCrit = (r: number | null) => r != null && getRiskLevelFromScore(r) === 'critical'

// ───────────────────────────────────────────────────────────────────────────────
/** The page head slots the ladder fills (Contracts wraps them in the shared kit PageHead with its crumbs + tabs). */
export interface HeadSlots { finding: ReactNode; question?: ReactNode; lines?: Lines; toolbar?: ReactNode }

export function ContractsLadder({ lang, onList, head }: { lang: Lang; onList: () => void; head: (s: HeadSlots) => ReactNode }) {
  const en = lang === 'en'
  const L = useCallback((es: string, e: string) => (en ? e : es), [en])
  const [sp, setSp] = useSearchParams()
  const setQ = useCallback((k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v == null) n.delete(k); else n.set(k, v); return n }, { replace: true }), [setSp])

  const num = (k: string) => { const v = Number(sp.get(k)); return Number.isFinite(v) && v > 0 ? v : undefined }
  const rl = sp.get('risk_level')
  const params: ContractsFieldParams = {
    sector_id: num('sector_id'), year: num('year'), institution_id: num('institution_id'), vendor_id: num('vendor_id'),
    is_direct_award: sp.get('is_direct_award') === 'true' ? true : undefined,
    risk_level: rl === 'low' || rl === 'medium' || rl === 'high' || rl === 'critical' ? rl : undefined,
    search: (sp.get('search') || '').length >= 3 ? sp.get('search')! : undefined,
  }
  const lens: Lens = sp.get('lente') === 'critico' ? 'critico' : sp.get('lente') === 'ad' ? 'ad' : 'todos'
  const pv = Number(sp.get('peldano'))
  const peldano = Number.isInteger(pv) && pv >= 4 && pv <= 10 ? pv : null
  const dockId = num('c') ?? null

  // a filter change keeps the old ladder up, dimmed, until the new one lands
  const q = useQuery({ queryKey: ['contracts-field', params], queryFn: () => contractApi.getField(params), staleTime: 30 * 60 * 1000, placeholderData: keepPreviousData })
  const zq = useQuery({
    queryKey: ['contracts-field', params, peldano],
    queryFn: () => contractApi.getField({ ...params, min_amount: 10 ** peldano!, max_amount: 10 ** (peldano! + 1) }),
    enabled: peldano != null, staleTime: 30 * 60 * 1000,
  })
  const P = useMemo(() => (q.data ? prep(q.data) : null), [q.data])
  const mainMarks = useMemo(() => (q.data ? toMarks(q.data) : null), [q.data])
  const zoomMarks = useMemo(() => (zq.data ? toMarks(zq.data) : null), [zq.data])
  const M = peldano != null && zoomMarks ? zoomMarks : mainMarks

  // Esc closes the dock, then the zoom; ←/→ walk the dock through the marks (largest first)
  const dockIdx = M && dockId != null ? M.id.indexOf(dockId) : -1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') { if (dockId != null) setQ('c', null); else if (peldano != null) setQ('peldano', null) }
      if (dockId != null && M && dockIdx >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const k = dockIdx + (e.key === 'ArrowRight' ? 1 : -1)
        if (k >= 0 && k < M.n) { e.preventDefault(); setQ('c', String(M.id[k])) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dockId, peldano, M, dockIdx, setQ])

  const sec = sectorOf(params.sector_id)
  const scope = [sec ? (en ? sec.nameEN : sec.name) : '', params.year ? String(params.year) : ''].filter(Boolean).join(' · ')
  const listOnly = ['institution_id', 'vendor_id', 'search', 'is_direct_award', 'risk_level', 'risk_level_min', 'risk_factor', 'category_id', 'min_amount', 'max_amount', 'is_single_bid'].filter((k) => sp.has(k))
  const clearListOnly = () => setSp((p) => { const n = new URLSearchParams(p); listOnly.forEach((k) => n.delete(k)); return n }, { replace: true })

  // DESIGN.md §3.1: the finding (the share of the biggest contracts) is the h1; the count it rests on folds behind «más»
  let thesis = '', rest = ''
  // the headline names the filter, so it waits for that filter's numbers (the dimmed placeholder is the old scope's)
  if (P && !q.isPlaceholderData && !q.isError) {
    const bigN = P.rungs[5].n + P.rungs[6].n, bigV = P.rungs[5].v + P.rungs[6].v
    const pre = scope ? `${scope}: ` : ''
    const count = `${formatNumber(P.total - P.none)} ${L('contratos con monto válido', 'contracts with a valid amount')}`
    if (bigN) {
      thesis = `${pre}${L(`los ${formatNumber(bigN)} contratos de más de 1,000 MDP se llevan el ${pctTxt(bigV, P.value)} del dinero.`, `the ${formatNumber(bigN)} contracts above 1 billion pesos take ${pctTxt(bigV, P.value)} of the money.`)}`
      rest = `${L('De', 'Out of')} ${count}.`
    } else {
      thesis = `${pre}${count}.`
      rest = L('Ninguno supera los 1,000 MDP.', 'None is above 1 billion pesos.')
    }
    thesis = thesis.charAt(0).toUpperCase() + thesis.slice(1)
  }
  const rungLab = (e: number) => (en ? RUNG_EN : RUNG_ES)[e - 4]
  const sel = 'cl-sel'
  const legend = <>
    <span><i className="is-fill" style={{ borderRadius: '50%' }} />{L(`los ${formatNumber(q.data?.n ?? 3000)} mayores`, `the ${formatNumber(q.data?.n ?? 3000)} largest`)}</span>
    <span><i style={{ background: RED, borderRadius: '50%' }} />{L('crítico', 'critical')}</span>
    <span><i className="is-hollow" style={{ borderRadius: '50%' }} />{L('> 10,000 MDP, en revisión', '> 10B MXN, under review')}</span>
  </>

  // kit/PageHead (owner 11-06): h1 = the finding (the share of the biggest contracts) · the question · Mariana's three
  // lines (the old tour's two scenes + the count the finding rests on) · the lens / sector / year bar as the toolbar
  return (<>
    {head({
      finding: thesis || L('La escalera de montos', 'The amount ladder'),
      question: L('¿Qué contratos hay?', 'What contracts are there?'),
      lines: {
        see: L('Cada contrato cae en una celda: su año, abajo, y su monto, a la izquierda.', 'Each contract falls in a cell: its year below, its amount on the left.'),
        read: L('Más azul, más contratos. Arriba, los más grandes, uno por uno; rojo es señal de alerta. A la derecha, cuántos hay en cada escalón.', 'Bluer, more contracts. At the top, the largest, one by one; red is a warning sign. On the right, how many on each step.'),
        means: rest || (q.isError ? L('Los contratos no cargaron.', 'The contracts did not load.') : null),
      },
      toolbar: (
      <div className="cl-bar">
        <div className="gd-lens" role="group" aria-label={L('Encender', 'Light')}>
          {(['todos', 'critico', 'ad'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={lens === v} onClick={() => setQ('lente', v === 'todos' ? null : v)}>
              <i className="cl-sw" style={{ background: LENS_HUE[v] }} aria-hidden="true" />
              {v === 'todos' ? L('Todos', 'All') : v === 'critico'
                ? <><span className="cl-long">{L('Riesgo crítico', 'Critical risk')}</span><span className="cl-short">{L('Crítico', 'Critical')}</span></>
                : <><span className="cl-long">{L('Adjudicación directa', 'Direct award')}</span><span className="cl-short">{L('Adj. directa', 'Direct award')}</span></>}
            </button>
          ))}
        </div>
        <select className={sel} aria-label={L('Sector', 'Sector')} value={params.sector_id ?? ''} onChange={(e) => setQ('sector_id', e.target.value || null)}>
          <option value="">{L('Todos los sectores', 'All sectors')}</option>
          {SECTORS.map((s) => <option key={s.id} value={s.id}>{en ? s.nameEN : s.name}</option>)}
        </select>
        <select className={sel} aria-label={L('Año', 'Year')} value={params.year ?? ''} onChange={(e) => setQ('year', e.target.value || null)}>
          <option value="">{`${Y0}–${Y1}`}</option>
          {Array.from({ length: NY }, (_, i) => Y1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {listOnly.length > 0 && (
          <span className="cl-crumb">
            <button type="button" onClick={onList}>{L(`+${listOnly.length} filtros de la lista`, `+${listOnly.length} list filters`)}</button>
            <button type="button" onClick={clearListOnly} aria-label={L('Quitar filtros de la lista', 'Clear list filters')}><X aria-hidden="true" /></button>
          </span>
        )}
        {peldano != null && (
          <span className="cl-crumb">
            <button type="button" onClick={() => setQ('peldano', null)}>{L('Todos los montos', 'All amounts')}</button>
            <span aria-hidden="true">›</span>
            <b>{rungLab(peldano)} – {rungLab(peldano + 1)}</b>
          </span>
        )}
        <span className="gd-key kf-mono cl-key">{legend}</span>
      </div>
      ),
    })}
    <section className="cl" aria-label={L('La escalera de montos', 'The amount ladder')}>
      {P && M && !q.isError ? (
        <Plot P={P} M={M} lens={lens} peldano={peldano} year={params.year} zoomLoading={(peldano != null && !zoomMarks) || q.isPlaceholderData} dockId={dockId} lang={lang}
          onPick={(id) => setQ('c', String(id))} onZoom={(e) => setQ('peldano', e == null ? null : String(e))} onClose={() => setQ('c', null)}
          walk={{
            label: dockIdx >= 0 ? `${formatNumber(dockIdx + 1)} ${L('de', 'of')} ${formatNumber(M.n)} · ${L('por monto', 'by amount')}` : L('fuera de los puntos', 'not among the dots'),
            canPrev: dockIdx > 0, canNext: dockIdx >= 0 && dockIdx < M.n - 1,
            onPrev: () => { if (dockIdx > 0) setQ('c', String(M.id[dockIdx - 1])) },
            onNext: () => { if (dockIdx >= 0 && dockIdx < M.n - 1) setQ('c', String(M.id[dockIdx + 1])) },
          }} />
      ) : q.isError ? (
        <p role="alert" className="ct-note cl-plot cl-msg">{L('No se pudo cargar esta vista. Pruebe la vista de lista.', 'The ladder failed to load. Try the List view.')} <button type="button" className="ct-link" onClick={() => q.refetch()}>{L('Reintentar', 'Retry')}</button></p>
      ) : (
        <div className="cl-plot cl-skel" aria-busy="true"><span className="kf-mono">{scope ? L(`Contando los contratos de ${scope} por año y monto…`, `Counting the ${scope} contracts by year and amount…`) : L('Contando los contratos por año y monto…', 'Counting the contracts by year and amount…')}</span></div>
      )}

      <span className="gd-key kf-mono cl-key-m">{legend}</span>
      <p className="ct-note cl-foot">
        {lens === 'critico'
          // Amount explains R² 0.013 of logit(score); vendor breadth + history explain 0.38 —
          // _explore/investigation_desk_2026-10-28/06_biases.md § Hallazgo 6.
          ? L('El monto casi no mueve el indicador de riesgo: lo que más pesa es el historial del proveedor, a cuántas instituciones ya les vendía. Los contratos grandes se encienden más porque suelen ir a proveedores veteranos. Es una señal para revisar, no una prueba. ', 'Amount barely moves the risk indicator: what weighs most is the vendor’s history, how many institutions it already sold to. Big contracts light up more because they tend to go to veteran vendors. It is a signal to review, not proof. ')
          : lens === 'ad'
            ? L('Celda = parte de los contratos adjudicados sin licitación. CompraNet no registró el procedimiento de 2002 a 2010: esas columnas van rayadas, sin dato. ', 'Cell = share of contracts awarded without a tender. CompraNet did not record the procedure from 2002 to 2010: those columns are hatched, no data. ')
            : L('Fondo = contratos por año y tramo de monto, escala logarítmica. Clic en una celda para abrir su peldaño; clic en un punto para leer el contrato. ', 'Shade = contracts per year and amount band, log scale. Click a cell to open its rung; click a dot to read the contract. ')}
        <Link to="/methodology" className="ct-link">{L('Metodología', 'Methodology')}</Link>
      </p>
    </section>
  </>)
}

// ───────────────────────────────────────────────────────────────────────────────
interface PlotProps { P: Prep; M: Marks; lens: Lens; peldano: number | null; year?: number; zoomLoading: boolean; dockId: number | null; lang: Lang; onPick: (id: number) => void; onZoom: (e: number | null) => void; onClose: () => void; walk: CardWalk }
type Hot = { kind: 'dot'; i: number } | { kind: 'cell'; yr: number; b: number } | null
const CARD_W = 680, CARD_H_EST = 560  // the dock's width; its typical height decides beside-the-dot vs. edge

function Plot({ P, M, lens, peldano, year, zoomLoading, dockId, lang, onPick, onZoom, onClose, walk }: PlotProps) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const boxRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [hot, setHot] = useState<Hot>(null)
  // the card's three nearest, tagged with the id they belong to (a walk never shows the last card's lines)
  const [near, setNear] = useState<{ id: number; ids: number[] } | null>(null)
  const nearSet = useMemo(() => new Set(near && near.id === dockId ? near.ids : []), [near, dockId])
  const [cardH, setCardH] = useState(0)
  const [kb, setKb] = useState<{ id: number | null; on: boolean }>({ id: null, on: false })  // the canvas's keyboard ring
  const fromDot = useRef(false)
  const [hotRung, setHotRung] = useState<number | null>(null)
  const [fonts, setFonts] = useState(0)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    document.fonts?.ready.then(() => setFonts(1))
    return () => ro.disconnect()
  }, [])

  const phone = box.w > 0 && box.w < 640
  const G = useMemo(() => {
    const { w, h } = box
    if (!w || !h) return null
    const LX = phone ? 92 : 120, RX = phone ? w - 4 : w - 200, top = 28, bot = h - (phone ? 8 : 44)
    const cw = (RX - LX) / NY
    return { w, h, LX, RX, top, bot, cw, x: (yr: number) => LX + ((yr - Y0) / NY) * (RX - LX) }
  }, [box, phone])
  const target: [number, number] = peldano != null ? [peldano, peldano + 1] : [4, 11]

  // animation state lives in a ref; React state only changes on hover / data / props
  const st = useRef({ lens, prev: lens, lensT0: -1e9, d: [4, 11] as [number, number], from: [4, 11] as [number, number], to: [4, 11] as [number, number], domT0: -1e9, beatT0: 0, beat: false, raf: 0 })
  useEffect(() => {
    let seen = false
    try { seen = sessionStorage.getItem('cl-beat') === '1'; sessionStorage.setItem('cl-beat', '1') } catch { /* private mode */ }
    st.current.beat = !seen && !reduced()
    st.current.beatT0 = performance.now()
  }, [])
  const hatch = useRef<CanvasPattern | null>(null)

  const draw = useCallback((now: number) => {
    const cv = cvRef.current, g = G
    if (!cv || !g) return false
    const ctx = cv.getContext('2d')
    if (!ctx) return false
    const s = st.current, dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(g.w * dpr)) { cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, g.w, g.h)
    if (!hatch.current) {
      const pc = document.createElement('canvas'); pc.width = 6; pc.height = 6
      const p = pc.getContext('2d')
      if (p) { p.strokeStyle = GRAY; p.globalAlpha = 0.45; p.lineWidth = 1; p.beginPath(); p.moveTo(0, 6); p.lineTo(6, 0); p.stroke() }
      hatch.current = ctx.createPattern(pc, 'repeat')
    }
    const el = s.beat ? now - s.beatT0 : 1e9
    const td = clamp01((now - s.domT0) / 600), ed = easeInOut(td)
    s.d = [s.from[0] + (s.to[0] - s.from[0]) * ed, s.from[1] + (s.to[1] - s.from[1]) * ed]
    const tl = clamp01((now - s.lensT0) / 300)
    const span = s.d[1] - s.d[0], yOf = (lg: number) => g.bot - ((lg - s.d[0]) / span) * (g.bot - g.top)
    const hc = hot?.kind === 'cell' ? hot : null, hd = hot?.kind === 'dot' ? hot.i : -1
    const dim = hot ? 0.35 : 1

    ctx.save(); ctx.beginPath(); ctx.rect(g.LX, g.top, g.RX - g.LX, g.bot - g.top); ctx.clip()
    const cellA = (c: Cell, l: Lens) => (l === 'todos' ? 0.75 * (Math.log10(c.n + 1) / Math.log10(P.maxN + 1)) : l === 'critico' ? 0.9 * (c.k / c.n) : 0.75 * (c.a / c.n))
    for (let b = B0; b < B1; b++) {
      const y0 = yOf((b + 1) / 4), y1 = yOf(b / 4)
      if (y1 < g.top || y0 > g.bot) continue
      const a = clamp01((el - (b - B0) * BEAT_BIN) / 260)
      if (!a) continue
      for (let yr = Y0; yr <= Y1; yr++) {
        const c = P.H.get(yr * 100 + b)
        if (!c || !c.n) continue
        const X = g.x(yr) + 0.5, W = g.cw - 1, Y = y0 + 0.5, Hh = Math.max(0.5, y1 - y0 - 1)
        const isHot = hc && hc.yr === yr && hc.b === b
        const k = a * (isHot ? 1 : dim)
        for (const [l, w] of [[s.prev, 1 - tl], [s.lens, tl]] as [Lens, number][]) {
          if (w <= 0) continue
          if (l === 'ad' && P.noDa.includes(yr)) { ctx.globalAlpha = k * w; ctx.fillStyle = hatch.current ?? RULE; ctx.fillRect(X, Y, W, Hh); continue }
          ctx.globalAlpha = k * w * cellA(c, l); ctx.fillStyle = LENS_HUE[l]; ctx.fillRect(X, Y, W, Hh)
        }
        if (isHot) { ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(X, Y, W, Hh) }
      }
    }
    ctx.globalAlpha = 1
    // rung rules: ink at 1,000 MDP; quarter rules when zoomed
    for (let e = 4; e <= 11; e += span < 2 ? 0.25 : 1) {
      const y = Math.round(yOf(e)) + 0.5
      if (y < g.top - 1 || y > g.bot + 1) continue
      ctx.strokeStyle = e === 9 ? INK : RULE; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(g.LX, y); ctx.lineTo(g.RX, y); ctx.stroke()
    }
    // years thin in the source: say so in the hole (years outside a year filter are not holes)
    ctx.font = '400 12px "IBM Plex Mono", monospace'; ctx.fillStyle = GRAY
    for (let i = 0; i < NY; i++) {
      const n = P.yearN[i]
      if (n >= 1000 || g.cw < 14 || (year && Y0 + i !== year)) continue
      ctx.save(); ctx.translate(g.x(Y0 + i) + g.cw / 2 + 4, g.bot - 12); ctx.rotate(-Math.PI / 2)
      ctx.fillText(`${Y0 + i}: ${formatNumber(n)} ${L('contratos en la fuente', 'contracts in the source')}`, 0, 0); ctx.restore()
    }
    // the largest contracts drop in, biggest first
    const stag = Math.min(3, 300 / Math.max(1, M.n))
    let dotsBusy = false
    // a picked dot dims the field to itself and its three nearest, joined by hairlines
    const pi = dockId != null ? M.id.indexOf(dockId) : -1
    const at = (i: number) => [g.x(M.x[i]), yOf(M.lg[i]) + M.j[i]] as const
    if (pi >= 0 && !Number.isNaN(M.x[pi])) {
      const [px, py] = at(pi)
      ctx.globalAlpha = 0.7; ctx.strokeStyle = INK; ctx.lineWidth = 1
      for (let i = 0; i < M.n; i++) if (nearSet.has(M.id[i]) && !Number.isNaN(M.x[i])) { const [nx, ny] = at(i); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke() }
      ctx.globalAlpha = 1
    }
    for (let i = 0; i < M.n; i++) {
      if (Number.isNaN(M.x[i]) || M.x[i] < Y0 || M.x[i] >= Y1 + 1) continue
      const t = clamp01((el - DOT0 - i * stag) / 400)
      if (t < 1) dotsBusy = true
      if (!t) continue
      const crit = isCrit(M.risk[i])
      const lit = s.lens === 'todos' ? true : s.lens === 'critico' ? crit : M.da[i] === 1
      const X = g.x(M.x[i]), Y = yOf(M.lg[i]) + M.j[i] - (1 - easeOut(t)) * 60
      const kept = i === pi || i === hd || nearSet.has(M.id[i])
      ctx.globalAlpha = t * (dockId != null ? (kept ? 1 : 0.22) : hd >= 0 && hd !== i ? 0.25 : lit ? 0.9 : 0.16)
      const col = s.lens === 'todos' && crit ? RED : INK
      const r = i === hd ? 5 : span < 2 ? 2 : 2.4
      ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2)
      if (M.flag[i]) { ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke() } else { ctx.fillStyle = col; ctx.fill() }
      const ring = i === pi ? 8 : nearSet.has(M.id[i]) && dockId != null ? 5.5 : dockId == null && kb.on && M.id[i] === (kb.id ?? M.id[0]) ? 8 : 0
      if (ring) { ctx.globalAlpha = 1; ctx.lineWidth = i === pi || ring === 8 ? 2 : 1; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(X, Y, ring, 0, Math.PI * 2); ctx.stroke() }
    }
    ctx.restore(); ctx.globalAlpha = 1
    // AD lens: name the hatched block
    if (s.lens === 'ad' && P.noDa.length && span > 2) {
      const x0 = g.x(P.noDa[0]), x1 = g.x(P.noDa[P.noDa.length - 1] + 1), txt = `${L('sin dato de procedimiento', 'no procedure data')} ${P.noDa[0]}–${P.noDa[P.noDa.length - 1]}`
      ctx.font = '400 13px "IBM Plex Mono", monospace'
      const w = ctx.measureText(txt).width
      if (w + 16 < x1 - x0) { const cx = (x0 + x1) / 2, cy = yOf(6.5); ctx.globalAlpha = tl; ctx.fillStyle = PAPER; ctx.fillRect(cx - w / 2 - 8, cy - 12, w + 16, 22); ctx.fillStyle = INK; ctx.fillText(txt, cx - w / 2, cy + 4); ctx.globalAlpha = 1 }
    }
    // left labels (canvas, so they ride the zoom) + years
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let e = 4; e <= 11; e += span < 2 ? 0.25 : 1) {
      const y = yOf(e)
      if (y < g.top - 6 || y > g.bot + 6) continue
      const whole = Number.isInteger(e)
      ctx.font = whole && !phone ? '600 15px Spectral, Georgia, serif' : '400 12px "IBM Plex Mono", monospace'
      ctx.fillStyle = whole ? INK : GRAY
      ctx.fillText(whole ? (en ? RUNG_EN : RUNG_ES)[e - 4] : formatCompactMXN(10 ** e), g.LX - 10, y)
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '400 12px "IBM Plex Mono", monospace'; ctx.fillStyle = GRAY
    for (let yr = Y0; yr <= Y1; yr += phone ? 4 : 2) ctx.fillText(String(yr), g.x(yr + 0.5), g.top - 10)
    ctx.textAlign = 'start'
    return el < DOT0 + 900 || dotsBusy || td < 1 || tl < 1
  }, [G, P, M, hot, dockId, nearSet, kb, phone, en, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const loop = useCallback(() => {
    const s = st.current
    if (s.raf) cancelAnimationFrame(s.raf)
    const f = (now: number) => {
      const busy = draw(now)
      s.raf = busy ? requestAnimationFrame(f) : 0
      if (!busy) (window as unknown as { __clSettled?: boolean }).__clSettled = true
    }
    s.raf = requestAnimationFrame(f)
  }, [draw])
  useEffect(() => { loop() }, [loop, fonts])
  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])
  useEffect(() => {
    const s = st.current
    if (lens === s.lens) return
    s.prev = s.lens; s.lens = lens; s.lensT0 = reduced() ? -1e9 : performance.now(); loop()
  }, [lens, loop])
  useEffect(() => {
    const s = st.current
    if (s.to[0] === target[0] && s.to[1] === target[1]) return
    s.from = [...s.d] as [number, number]; s.to = target; s.domT0 = reduced() ? -1e9 : performance.now(); loop()
  }, [target[0], target[1], loop]) // eslint-disable-line react-hooks/exhaustive-deps

  // screenshot hook: a mid-size critical dot
  useEffect(() => {
    (window as unknown as { __clPoint?: () => [number, number] | null }).__clPoint = () => {
      const g = G, cv = cvRef.current
      if (!g || !cv) return null
      let i = -1
      for (let k = 0; k < M.n; k++) if (isCrit(M.risk[k]) && M.amt[k] < 3e10 && M.x[k] >= 2015) { i = k; break }
      if (i < 0) return null
      const r = cv.getBoundingClientRect(), s = st.current, span = s.d[1] - s.d[0]
      return [r.left + g.x(M.x[i]), r.top + g.bot - ((M.lg[i] - s.d[0]) / span) * (g.bot - g.top) + M.j[i]]
    }
  }, [G, M])

  const hit = (px: number, py: number): Hot => {
    const g = G
    if (!g || px < g.LX || px > g.RX || py < g.top || py > g.bot) return null
    const s = st.current, span = s.d[1] - s.d[0], yOf = (lg: number) => g.bot - ((lg - s.d[0]) / span) * (g.bot - g.top)
    let best = -1, bd = 64
    for (let i = 0; i < M.n; i++) {
      if (Number.isNaN(M.x[i])) continue
      const dx = g.x(M.x[i]) - px, dy = yOf(M.lg[i]) + M.j[i] - py, d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = i }
    }
    if (best >= 0) return { kind: 'dot', i: best }
    const yr = Y0 + Math.floor((px - g.LX) / g.cw), lg = s.d[0] + ((g.bot - py) / (g.bot - g.top)) * span, b = Math.floor(lg * 4)
    return P.H.get(yr * 100 + b) ? { kind: 'cell', yr, b } : null
  }
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
    const h = hit(px, py)
    const same = (h?.kind === 'dot' && hot?.kind === 'dot' && h.i === hot.i) || (h?.kind === 'cell' && hot?.kind === 'cell' && h.yr === hot.yr && h.b === hot.b) || (!h && !hot)
    if (!same) setHot(h)
    const g = G
    if (g) { const s = st.current, lg = s.d[0] + ((g.bot - py) / (g.bot - g.top)) * (s.d[1] - s.d[0]); setHotRung(py >= g.top && py <= g.bot ? (s.d[1] - s.d[0] < 2 ? Math.floor(lg * 4) : Math.floor(lg)) : null) }
    const t = tipRef.current
    if (t && g) { const left = Math.min(px + 16, g.w - (t.offsetWidth || 320) - 4); t.style.left = `${Math.max(0, left)}px`; t.style.top = `${Math.max(0, py - (t.offsetHeight || 60) - 12)}px` }
  }
  const onClick = () => {
    if (hot?.kind === 'dot') { fromDot.current = true; onPick(M.id[hot.i]); setHot(null) }
    else if (dockId != null) onClose()
    else if (hot?.kind === 'cell' && peldano == null) onZoom(Math.min(10, Math.max(4, Math.floor(hot.b / 4))))
  }

  // ── The dock: beside the dot, or at the far edge with a leader when it would cover > ½ the field ──
  const pi = dockId != null ? M.id.indexOf(dockId) : -1
  const dock = useMemo(() => {
    const g = G
    if (!g || dockId == null || phone) return null
    const s = st.current, span = s.d[1] - s.d[0]
    const dot = pi >= 0 && !Number.isNaN(M.x[pi]) ? [g.x(M.x[pi]), g.bot - ((M.lg[pi] - s.d[0]) / span) * (g.bot - g.top) + M.j[pi]] as const : null
    const w = Math.min(CARD_W, g.w - 32), h = Math.max(cardH, CARD_H_EST)
    const fit = (top: number) => Math.max(0, Math.min(top, Math.max(0, g.h - h)))
    if (dot) {
      const left = Math.max(0, Math.min(g.w - w, dot[0] < g.w / 2 ? dot[0] + 16 : dot[0] - 16 - w)), top = fit(dot[1] - 40)
      const ox = Math.max(0, Math.min(left + w, g.RX) - Math.max(left, g.LX)), oy = Math.max(0, Math.min(top + h, g.bot) - Math.max(top, g.top))
      if ((ox * oy) / ((g.RX - g.LX) * (g.bot - g.top)) <= 0.5) return { left, top, w, dot, leader: false }
    }
    const right = !dot || dot[0] < (g.LX + g.RX) / 2
    return { left: right ? g.w - w : 0, top: 0, w, dot, leader: !!dot }
  }, [G, dockId, pi, M, phone, cardH])
  // the card's height: pushes what follows (never covers it) and keeps the dock inside the field
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) { setCardH(0); return }
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [dockId != null && (phone || !!dock)])  // eslint-disable-line react-hooks/exhaustive-deps
  // Open: focus moves into the card; a dot click docks it out of the dot (origin at the dot, 16 px of
  // travel, 240 ms --ease-out; reduced motion = fade). A walk (keys, ← →, a neighbour) is instant.
  // Close: focus returns to the field, ringed on the dot it came from.
  const was = useRef<number | null>(null)
  useLayoutEffect(() => {
    const prev = was.current
    was.current = dockId
    const card = cardRef.current
    if (dockId == null) { if (prev != null) { setKb({ id: prev, on: true }); cvRef.current?.focus({ preventScroll: true }) } return }
    if (!card) return
    if (prev == null || !card.contains(document.activeElement) || (document.activeElement as HTMLButtonElement | null)?.disabled) card.focus({ preventScroll: true })
    if (phone && prev == null) card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' })
    const animate = fromDot.current
    fromDot.current = false
    if (!animate) return
    const rm = reduced()
    if (phone) { card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rm ? 120 : 240, easing: 'cubic-bezier(.23,1,.32,1)' }); return }
    const d = dock?.dot
    if (!dock || !d) return
    const ox = Math.max(0, Math.min(dock.w, d[0] - dock.left)), oy = Math.max(0, Math.min(card.offsetHeight, d[1] - dock.top))
    const dx = d[0] - (dock.left + ox), dy = d[1] - (dock.top + oy), n = Math.hypot(dx, dy) || 1
    card.style.transformOrigin = `${ox}px ${oy}px`
    card.animate(rm
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translate(${(dx / n) * 16}px, ${(dy / n) * 16}px) scale(.96)` }, { opacity: 1, transform: 'none' }],
    { duration: rm ? 120 : 240, easing: 'cubic-bezier(.23,1,.32,1)' })
  }, [dockId]) // eslint-disable-line react-hooks/exhaustive-deps
  const onCanvasKey = (e: RKeyboardEvent<HTMLCanvasElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    const id = kb.id != null && M.id.includes(kb.id) ? kb.id : M.id[0]
    if (id != null) onPick(id)  // keyboard = instant, no dock motion
  }

  const proc = (i: number) => (M.da[i] == null ? L('procedimiento no registrado', 'procedure not recorded') : M.da[i] ? L('adjudicación directa', 'direct award') : L('licitación o invitación', 'tender or invitation'))
  let tip: ReactNode = null
  if (hot?.kind === 'dot') {
    const i = hot.i, s = sectorOf(M.sector[i]), r = M.risk[i]
    tip = <>
      <b>{formatCompactMXN(M.amt[i])}{M.flag[i] ? ` · ${L('monto en revisión (> 10,000 MDP)', 'amount under review (> 10B MXN)')}` : ''}</b>
      {M.date[i] ?? '—'} · {s ? (en ? s.nameEN : s.name) : '—'} · {proc(i)}<br />
      {r != null ? `${L('indicador', 'indicator')} ${r.toFixed(2)}` : L(NO_RISK_LABEL.es, NO_RISK_LABEL.en)}{r != null && <> · <span style={{ color: RISK_COLORS[getRiskLevelFromScore(r)] }}>{L({ critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' }[getRiskLevelFromScore(r)], getRiskLevelFromScore(r))}</span></>}
      <br /><i>{L('clic: leer el contrato', 'click: read the contract')}</i>
    </>
  } else if (hot?.kind === 'cell') {
    const c = P.H.get(hot.yr * 100 + hot.b)!
    tip = <>
      <b>{hot.yr} · {formatCompactMXN(10 ** (hot.b / 4))} – {formatCompactMXN(10 ** ((hot.b + 1) / 4))}</b>
      {formatNumber(c.n)} {L('contratos', 'contracts')} · {formatCompactMXN(c.v)}<br />
      {pctTxt(c.k, c.s)} {L('crítico', 'critical')}{c.n > c.s ? ` (${formatNumber(c.n - c.s)} ${L('sin indicador', 'unscored')})` : ''} · {P.noDa.includes(hot.yr) ? L('procedimiento sin dato', 'procedure: no data') : `${pctTxt(c.a, c.n)} ${L('adj. directa', 'direct award')}`}
      {peldano == null && <><br /><i>{L('clic: abrir el peldaño', 'click: open the rung')}</i></>}
    </>
  }

  // right column: 7 rungs, or the 4 quarter bands of the zoomed rung (DOM, so rows are buttons)
  const g = G
  const ty = (lg: number) => (g ? g.bot - ((lg - target[0]) / (target[1] - target[0])) * (g.bot - g.top) : 0)
  const rows = peldano == null
    ? P.rungs.map((r, k) => ({ key: k + 4, lo: k + 4, hi: k + 5, n: r.n, v: r.v, zoom: k + 4 }))
    : [0, 1, 2, 3].map((q) => { const b = peldano * 4 + q, c = P.binN(b); return { key: b, lo: b / 4, hi: (b + 1) / 4, n: c.n, v: c.v, zoom: null as number | null } })

  return (
    <div className="cl-wrap" style={dock && g && dock.top + cardH + 8 > g.h ? { minHeight: dock.top + cardH + 8 } : undefined}>
      <div ref={boxRef} className={`cl-plot${zoomLoading ? ' is-busy' : ''}`} aria-busy={zoomLoading || undefined}>
        <canvas ref={cvRef} role="application" tabIndex={0} onPointerMove={onMove} onPointerLeave={() => { setHot(null); setHotRung(null) }} onClick={onClick} onKeyDown={onCanvasKey}
          onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setKb((k) => ({ ...k, on: true })) }} onBlur={() => setKb((k) => ({ ...k, on: false }))}
          aria-label={L(`Escalera de montos: ${formatNumber(P.total)} contratos por año y monto; ${formatNumber(M.n)} puntos. Enter abre la ficha del contrato marcado; con la ficha abierta, ← → recorren por monto y Esc la cierra.`, `Amount ladder: ${formatNumber(P.total)} contracts by year and amount; ${formatNumber(M.n)} dots. Enter opens the ringed contract's card; with the card open, ← → walk by amount and Esc closes it.`)}
          style={{ cursor: hot ? 'pointer' : 'default' }} />
        {!phone && g && rows.map((r) => {
          const on = hotRung === (peldano == null ? r.lo : r.key)
          const body = <><b>{formatNumber(r.n)}</b> {L('contratos', 'contracts')}<br />{pctTxt(r.v, P.value)} {L('del dinero', 'of the money')}</>
          const style = { left: g.RX + 16, top: (ty(r.lo) + ty(r.hi)) / 2 }
          return r.zoom != null
            ? <button key={r.key} type="button" className={`cl-row${on ? ' is-on' : ''}`} style={style} onClick={() => onZoom(r.zoom)}><span className="sr-only">{L(`Abrir el peldaño ${RUNG_ES[r.lo - 4]} – ${RUNG_ES[r.hi - 4]}`, `Open the ${RUNG_EN[r.lo - 4]} – ${RUNG_EN[r.hi - 4]} rung`)}: </span>{body}</button>
            : <div key={r.key} className={`cl-row${on ? ' is-on' : ''}`} style={style}>{body}</div>
        })}
        {!phone && g && peldano == null && (
          <div className="cl-row cl-floor" style={{ left: g.RX + 16, top: g.bot + 6 }}><b>{formatNumber(P.floor)}</b> {L('bajo 10 mil', 'under 10K')}<br /><b>{formatNumber(P.none)}</b> {L('sin monto válido', 'no valid amount')}</div>
        )}
        <div ref={tipRef} className="gd-tip kf-mono cl-tip" hidden={!tip} aria-hidden="true">{tip}</div>
        {dock?.leader && dock.dot && (() => {
          const ex = dock.left > dock.dot[0] ? dock.left : dock.left + dock.w, ey = Math.max(dock.top + 16, Math.min(dock.top + Math.max(cardH, 64) - 16, dock.dot[1]))
          return <svg className="cf-leader" aria-hidden="true"><line x1={dock.dot[0]} y1={dock.dot[1]} x2={ex} y2={ey} stroke={INK} strokeWidth="1" /><circle cx={ex} cy={ey} r="2.5" fill={INK} /></svg>
        })()}
        {dockId != null && dock && (
          <ContractCard ref={cardRef} id={dockId} lang={lang} onClose={onClose} walk={walk} className="cf-dock" style={{ left: dock.left, top: dock.top, width: dock.w }}
            onNearest={(ids) => setNear({ id: dockId, ids })} onPickNear={onPick} />
        )}
      </div>
      {dockId != null && phone && (
        <ContractCard ref={cardRef} id={dockId} lang={lang} onClose={onClose} walk={walk} className="cf-flow"
          onNearest={(ids) => setNear({ id: dockId, ids })} onPickNear={onPick} />
      )}
      {phone && (
        <ol className="cl-rows-m kf-mono">
          {[...rows].reverse().map((r) => (
            <li key={r.key}>
              {r.zoom != null ? <button type="button" onClick={() => onZoom(r.zoom)}>{(en ? RUNG_EN : RUNG_ES)[r.lo - 4]} +</button> : <span>{formatCompactMXN(10 ** r.lo)} +</span>}
              <span><b>{formatNumber(r.n)}</b> {L('contratos', 'contracts')}</span><span>{pctTxt(r.v, P.value)} {L('del dinero', 'of the money')}</span>
            </li>
          ))}
          {peldano == null && <li><span>{L('bajo 10 mil', 'under 10K')}</span><span><b>{formatNumber(P.floor)}</b></span><span>{formatNumber(P.none)} {L('sin monto', 'no amount')}</span></li>}
        </ol>
      )}
    </div>
  )
}
