/**
 * CategoryCover — the category dossier's first viewport, concept A «El caudal»
 * (owner pick 2026-10-20; `_ui_v4/concepts/catcover/A.html`, verdict engine in
 * lib/category/verdict.ts). One object: the category's money year by year,
 * 2002–2026, as 24 columns stacked by WHO won it (the six largest lifetime
 * suppliers in C1–C6, everyone else in the rest tone), the seal-red blackout
 * seam, and ComprasMX's post-blackout column on the same scale. Under it, the
 * «directa» rail (direct award per year; hatched where Structure A has no flag).
 * Beside it, a compact text column (lens · 3-sentence lede · one-line ledger).
 *
 *   L0 columns rise grey → the six bands colour in → the seam drops → the post column lands (≤ 1.2 s, once per session)
 *   L1 hover a band / ledger row / the leader in the lede = that supplier lit everywhere, one tip
 *   L2 click = the supplier's detail replaces the text column in place (Esc / Volver)
 *   L3 detail links: /vendors/:id and /contracts?category_id&vendor_id
 *   L4 lens dinero ⇄ contratos (columns re-stack, 600 ms) · «directa» rail on/off
 *   L5 URL ?prov=<vendor id>&lente=contratos
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { categoryCoverApi, type CategoryCoverData, type CoverRank, type CoverSupplier } from '@/api/categoryCover'
import { categoryVerdict, p100 } from '@/lib/category/verdict'
import { PatternDefs, patUrl } from '@/components/kit/patterns/Patterns'
import { CATEGORICAL, CATEGORICAL_TEXT, RAMP_INK, RISK_TEXT_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatCompactUSD, formatDualCurrency, formatNumber } from '@/lib/utils'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { PageQuestion } from '@/components/kit/PageQuestion'
import './catcover.css'

type Lens = 'v' | 'n'
const REST = RAMP_INK[1]
const SLATE = CATEGORICAL[7]
const ERAS: [string, number, number][] = [['Fox', 2002, 2006], ['Calderón', 2007, 2012], ['Peña Nieto', 2013, 2018], ['AMLO', 2019, 2024], ['Sh.', 2025, 2025]]
const LEVEL_WORD = { critical: ['crítico', 'critical'], high: ['alto', 'high'], medium: ['medio', 'medium'], low: ['bajo', 'low'] } as const
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const sh = (a: number, b: number) => (b ? a / b : 0)
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const BEAT_KEY = 'rubli.catcover.beat'

interface Seg { key: string; k: string; x: number; y: number; h: number }
interface Col { i: number; year: number | 'post'; total: number; segs: Seg[]; rail: number | null }

/** One lens's geometry: every column always carries the same segment keys, so lenses tween. */
function layout(d: CategoryCoverData, lens: Lens, W: number, plotH: number, top: number, phone: boolean) {
  const sup = d.suppliers
  const years = d.years
  const n = years.length
  const gapPost = phone ? 14 : 22
  const cw = (W - gapPost) / (n + 1)
  const bw = Math.max(2, cw - (phone ? 1.5 : 3))
  const xOf = (i: number) => (i < n ? i * cw : n * cw + gapPost)
  const ix = lens === 'v' ? 2 : 1
  const raw = years.map((y) => {
    const parts = sup.map((s) => { const r = s.years.find((a) => a[0] === y.y); return r ? r[ix] : 0 })
    const total = lens === 'v' ? y.v : y.n
    const da = lens === 'v' ? y.da_v : y.da_n
    return { year: y.y as number | 'post', total, parts, pf: 0, rail: da == null ? null : sh(da, total) }
  })
  const pparts = sup.map((s) => d.post.suppliers.filter((p) => p.id === s.id).reduce((a, p) => a + (lens === 'v' ? p.v : p.n), 0))
  const ptotal = lens === 'v' ? d.post.v : d.post.n
  raw.push({ year: 'post', total: ptotal, parts: pparts, pf: lens === 'v' ? d.post.pf.v : d.post.pf.n, rail: ptotal ? sh(lens === 'v' ? d.post.da_v : d.post.da_n, ptotal) : null })
  const MX = Math.max(1, ...raw.map((c) => c.total))
  const yS = (v: number) => (v / MX) * plotH
  const cols: Col[] = raw.map((c, i) => {
    let yb = top + plotH
    const segs: Seg[] = []
    const add = (val: number, k: string) => { const h = yS(Math.max(0, val)); yb -= h; segs.push({ key: `${i}:${k}`, k, x: xOf(i), y: yb, h }) }
    add(c.total - c.parts.reduce((a, b) => a + b, 0) - c.pf, 'rest')
    add(c.pf, 'pf')
    for (let k = sup.length - 1; k >= 0; k--) add(c.parts[k], `v${sup[k].id}`)
    return { i, year: c.year, total: c.total, segs, rail: c.rail }
  })
  return { cols, MX, cw, bw, xOf, n, gapPost, yS }
}

export function CategoryCover({ categoryId, title, sectorChip, lang }: {
  categoryId: number
  title: string
  sectorChip?: ReactNode
  lang: 'en' | 'es'
}) {
  const en = lang === 'en'
  const L = useCallback((es: string, e: string) => (en ? e : es), [en])
  const loc = en ? 'en-US' : 'es-MX'
  const q = useQuery({ queryKey: ['cat-cover', categoryId], queryFn: () => categoryCoverApi.get(categoryId), staleTime: 30 * 60 * 1000, retry: false })
  const d = q.data
  const [params, setParams] = useSearchParams()
  const lens: Lens = params.get('lente') === 'contratos' ? 'n' : 'v'
  const provParam = params.get('prov')
  const [rail, setRail] = useState(true)
  const [hot, setHot] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)

  // geometry: object width from its box; plot height from the text column so the bottoms meet
  const objRef = useRef<HTMLDivElement>(null)
  const txtRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ W: 0, textH: 0, phone: false })
  useLayoutEffect(() => {
    const o = objRef.current, t = txtRef.current
    if (!o || !t) return
    const read = () => setBox({ W: Math.floor(o.getBoundingClientRect().width), textH: Math.round(t.getBoundingClientRect().height), phone: window.innerWidth <= 760 })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(o); ro.observe(t)
    return () => ro.disconnect()
  }, [d])

  // L4 lens tween: t = 0 money, 1 contracts
  const [tw, setTw] = useState(lens === 'n' ? 1 : 0)
  const twRef = useRef(tw)
  useEffect(() => {
    const to = lens === 'n' ? 1 : 0
    const from = twRef.current
    if (from === to) return
    if (reduced()) { twRef.current = to; setTw(to); return }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600)
      const v = from + (to - from) * easeIO(p)
      twRef.current = v; setTw(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [lens])

  // L0 beat: once per session; reduced motion and repeat visits get the final state
  const [beat, setBeat] = useState<'wait' | 'run' | 'static'>('wait')
  const ready = !!d && box.W > 0
  useEffect(() => {
    if (!ready || beat !== 'wait') return
    let seen = false
    try { seen = sessionStorage.getItem(BEAT_KEY) === '1'; sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private mode: play it */ }
    if (seen || reduced()) { setBeat('static'); return }
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setBeat('run')))
    return () => cancelAnimationFrame(r)
  }, [ready, beat])

  const V = useMemo(() => (d ? categoryVerdict(d, en) : null), [d, en])
  const sup = d?.suppliers ?? []
  const supIdx = useMemo(() => new Map(sup.map((s, i) => [`v${s.id}`, i])), [sup])
  const hueOf = (k: string) => (k === 'rest' ? REST : k === 'pf' ? SLATE : CATEGORICAL[supIdx.get(k) ?? 7])
  const nameOf = (s: { name: string | null }) => formatEntityName('vendor', s.name, 'full')
  const picked = provParam ? sup.find((s) => String(s.id) === provParam) ?? null : null
  const active = picked ? `v${picked.id}` : hot

  const setQ = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v == null) next.delete(k); else next.set(k, v)
    setParams(next, { replace: true })
  }
  const open = (k: string) => { if (supIdx.has(k)) { setQ('prov', k.slice(1)); setTip(null) } }
  const close = useCallback(() => {
    const next = new URLSearchParams(params); next.delete('prov'); setParams(next, { replace: true })
  }, [params, setParams])
  useEffect(() => {
    if (!picked) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked, close])
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (picked) backRef.current?.focus({ preventScroll: true }) }, [picked])

  // headline count-up (700 ms, into the span) once the beat starts
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (beat === 'wait') return
    if (beat === 'static') { setCount(1); return }
    let raf = 0
    const t0 = performance.now() + 450
    const step = (now: number) => { const p = Math.max(0, Math.min(1, (now - t0) / 700)); setCount(1 - Math.pow(1 - p, 3)); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [beat])

  const phone = box.phone
  const TOP = phone ? 30 : 34
  const AX = 18
  const ERA = phone ? 0 : 18
  const RG = 8
  const RAIL = 22
  const NOTE = 18
  const BOTTOM = AX + ERA + RG + RAIL + NOTE
  const plotH = phone ? 220 : Math.max(260, Math.min(560, box.textH - BOTTOM))
  const H = TOP + plotH + BOTTOM
  const A = useMemo(() => (d && box.W ? layout(d, 'v', box.W, plotH, TOP, phone) : null), [d, box.W, plotH, TOP, phone])
  const B = useMemo(() => (d && box.W ? layout(d, 'n', box.W, plotH, TOP, phone) : null), [d, box.W, plotH, TOP, phone])
  const fmtLens = (v: number, ln: Lens) => (ln === 'v' ? formatCompactMXN(v) : `${formatNumber(Math.round(v))} ${L('contratos', 'contracts')}`)

  // ── text
  const T = d?.totals
  const R = d?.ranks
  const ord = (r: CoverRank | null | undefined) => (r ? (en ? `${r.rank}${['th', 'st', 'nd', 'rd'][(r.rank % 100 >> 3 ^ 1) && r.rank % 10] || 'th'} of ${r.of}` : `${r.rank}.º de ${r.of}`) : '—')
  const pc1 = (x: number) => (100 * x).toLocaleString(loc, { maximumFractionDigits: 1 })
  const six = sh(sup.reduce((a, s) => a + s.v, 0), T?.v ?? 0)
  const lede = d && T && V && sup[0] ? (en ? (
    <>
      <b>{formatDualCurrency(T.v)}</b> across <b>{formatNumber(T.n)}</b> federal contracts, {T.y0}–{T.y1}: <b>{ord(R?.money)}</b> categories by money.{' '}
      The six largest suppliers took <b>{p100(six)}</b> in every 100 pesos.{' '}
      By contracts, <b>{p100(V.daCount)}</b> in every 100 were direct awards; in tenders, <b>{p100(V.singleAward)}</b> in every 100 ended with a single supplier awarded.
    </>
  ) : (
    <>
      <b>{formatCompactMXN(T.v)}</b> en <b>{formatNumber(T.n)}</b> contratos federales, {T.y0}–{T.y1}: el <b>{ord(R?.money)}</b> categorías por dinero.{' '}
      Los seis mayores proveedores se llevaron <b>{p100(six)}</b> de cada 100 pesos.{' '}
      Por contratos, <b>{p100(V.daCount)}</b> de cada 100 fueron adjudicación directa; en los concursos, <b>{p100(V.singleAward)}</b> de cada 100 terminaron con un solo proveedor adjudicado.
    </>
  )) : null

  // a top supplier whose own activity sits in another sector (classifier issue, surfaced not hidden)
  const misfit = useMemo(() => {
    const cs = d?.category.sector_id
    if (!d || cs == null || cs === 12) return null
    const off = d.suppliers.filter((s) => s.primary_sector_id != null && s.primary_sector_id !== cs)
    if (!off.length) return null
    const cnt = new Map<number, number>()
    off.forEach((s) => cnt.set(s.primary_sector_id!, (cnt.get(s.primary_sector_id!) ?? 0) + 1))
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const sec = SECTORS.find((x) => x.id === top)
    return { k: off.length, name: sec ? (en ? sec.nameEN : sec.name) : '—' }
  }, [d, en])

  // ── tips
  const segTip = (s: Seg, c: Col): ReactNode => {
    const isPost = c.year === 'post'
    const when = isPost ? L('desde el 28 sep 2025', 'since 28 Sep 2025') : String(c.year)
    if (s.k === 'rest') return <><b>{L('Los demás proveedores', 'All other suppliers')}</b> · {when}</>
    if (s.k === 'pf') return <><b>{L('Personas físicas', 'Natural persons')}</b> · {when} · {formatCompactMXN(d!.post.pf.v)} · {formatNumber(d!.post.pf.n)} {L('contratos, contados juntos', 'contracts, counted together')}</>
    const v = sup[supIdx.get(s.k)!]
    const yr = isPost ? null : v.years.find((a) => a[0] === c.year)
    const pv = d!.post.suppliers.filter((p) => p.id === v.id)
    const money = isPost ? pv.reduce((a, p) => a + p.v, 0) : yr ? yr[2] : 0
    const cnt = isPost ? pv.reduce((a, p) => a + p.n, 0) : yr ? yr[1] : 0
    const lvl = v.risk != null ? getRiskLevelFromScore(v.risk) : null
    return (
      <>
        <b>{nameOf(v)}</b> · {when}: {formatCompactMXN(money)} · {formatNumber(cnt)} {L('contratos', 'contracts')} · {p100(sh(lens === 'v' ? money : cnt, c.total))} {lens === 'v' ? L('de cada 100 pesos', 'in every 100 pesos') : L('de cada 100 contratos', 'in every 100 contracts')}
        <br />{lvl ? <>{L('indicador de riesgo', 'risk indicator')} <b style={{ color: RISK_TEXT_COLORS[lvl] }}>{v.risk!.toFixed(2)}</b> {LEVEL_WORD[lvl][en ? 1 : 0]}</> : L('sin indicador', 'no indicator')}
      </>
    )
  }
  const yearTip = (c: Col): ReactNode => {
    if (c.year === 'post') {
      const p = d!.post
      return <><b>{L('Desde el 28 sep 2025', 'Since 28 Sep 2025')}</b> · ComprasMX · {formatNumber(p.n)} {L('contratos', 'contracts')} · {formatCompactMXN(p.v)}<br />{L('directa por dinero', 'direct by money')} {p100(sh(p.da_v, p.v))} {L('de 100', 'in 100')} · {L('por contratos', 'by contracts')} {p100(sh(p.da_n, p.n))} {L('de 100', 'in 100')}</>
    }
    const y = d!.years.find((a) => a.y === c.year)!
    return (
      <>
        <b>{y.y}</b> · {formatCompactMXN(y.v)} · {formatNumber(y.n)} {L('contratos', 'contracts')}
        <br />{y.da_v == null ? L('sin dato de procedimiento (CompraNet, estructura A)', 'no procedure data (CompraNet, structure A)') : <>{L('directa', 'direct')} {p100(sh(y.da_v, y.v))} {L('de 100 por dinero', 'in 100 by money')} · {p100(sh(y.da_n ?? 0, y.n))} {L('por contratos', 'by contracts')}</>} · {L('indicador ≥ 0.40', 'indicator ≥ 0.40')} {pc1(sh(y.hr_n, y.n))}%
      </>
    )
  }
  const placeTip = (e: React.PointerEvent, body: ReactNode) => {
    const o = objRef.current?.getBoundingClientRect()
    if (!o) return
    const x = e.clientX - o.left, y = e.clientY - o.top
    setTip({ x: Math.max(0, Math.min(x + 14, o.width - 380)), y: Math.max(0, y - 64), body })
  }

  // ── figures (seven, each with its rank among the categories)
  const hrRank = R?.hr?.rank ?? 99
  const hrColor = hrRank <= 6 ? RISK_TEXT_COLORS.critical : hrRank <= 12 ? RISK_TEXT_COLORS.high : undefined
  const figs: [string, ReactNode, string][] = d && T && V ? [
    [L(`Monto, ${T.y0}–${T.y1}`, `Amount, ${T.y0}–${T.y1}`), formatCompactMXN(T.v), `${ord(R?.money)} ${L(`por dinero · ≈${formatCompactUSD(T.v)}`, `by money · ≈${formatCompactUSD(T.v)}`)}`],
    [L('Contratos', 'Contracts'), formatNumber(T.n), `${ord(R?.contracts)} · ${formatNumber(T.vendors)} ${L('proveedores', 'suppliers')}`],
    [L('Directa, por dinero', 'Direct award, by money'), <>{p100(V.daMoney)}<small>{L('de 100', 'in 100')}</small></>, `${ord(R?.da_money)} ${L('más directa', 'most direct')}`],
    [L('Directa, por contratos', 'Direct award, by contracts'), <>{p100(V.daCount)}<small>{L('de 100', 'in 100')}</small></>, `${ord(R?.da_count)} ${L('más directa', 'most direct')}`],
    [L('Los tres mayores', 'Top three suppliers'), <>{p100(V.top3)}<small>{L('de 100', 'in 100')}</small></>, `${ord(R?.top3)} ${L('más concentrada', 'most concentrated')}`],
    [L('Indicador ≥ 0.40', 'Indicator ≥ 0.40'), <span style={{ color: hrColor }}>{pc1(V.highRisk)}<small>%</small></span>, `${ord(R?.hr)} · ${L('alto o crítico', 'high or critical')}`],
    [L('Desde el 28 sep 2025', 'Since 28 Sep 2025'), d.post.v ? formatCompactMXN(d.post.v) : '—', d.post.v ? `${ord(R?.post)} · ${formatNumber(d.post.n)} ${L('contratos', 'contracts')}` : L('sin contratos en ComprasMX', 'no ComprasMX contracts')],
  ] : []

  // ── geometry for this frame (lens tween)
  const lerp = (a: number, b: number) => a + (b - a) * tw
  const cur = A && B ? A.cols.map((c, ci) => ({ c, b: B.cols[ci] })) : []
  const baseY = TOP + plotH
  const MXt = A && B ? lerp(A.MX, B.MX) : 1
  const ln: Lens = tw < 0.5 ? 'v' : 'n'
  const peakI = A && B && A.n > 0 ? (ln === 'v' ? A : B).cols.slice(0, -1).reduce((best, c) => (c.total > best.total ? c : best)).i : -1
  const rampOf = (s: number) => RAMP_INK[Math.min(4, Math.floor(s * 5))]
  const xs = A ? A.xOf(A.n) - A.gapPost / 2 : 0
  const svgCls = ['cc-svg', beat === 'run' ? 'is-in' : beat === 'static' ? 'is-in is-static' : '', active ? 'has-hot' : '', picked ? 'has-pick' : '', rail ? '' : 'no-rail'].filter(Boolean).join(' ')

  const share = (s: CoverSupplier) => (lens === 'v' ? sh(s.v, T?.v ?? 0) : sh(s.n, T?.n ?? 0))
  const restShare = T ? 1 - sup.reduce((a, s) => a + share(s), 0) : 0
  const postRows = d ? d.post.suppliers.slice(0, 2) : []

  // ── L2 detail
  const detail = picked && d && T ? (() => {
    const s = picked
    const k = supIdx.get(`v${s.id}`)!
    const lvl = s.risk != null ? getRiskLevelFromScore(s.risk) : null
    const best = [...s.years].sort((a, b) => b[2] - a[2])[0]
    const pv = d.post.suppliers.filter((p) => p.id === s.id).reduce((a, p) => a + p.v, 0)
    const rows: [string, ReactNode][] = [
      [L('De cada 100 pesos de la categoría', 'Of every 100 pesos in the category'), <b>{p100(sh(s.v, T.v))}</b>],
      [L('Sin concurso, por dinero', 'No tender, by money'), <><b>{p100(sh(s.da_v, s.v))}</b> {L('de sus 100 pesos', 'of its 100 pesos')}</>],
      [L('Sin concurso, por contratos', 'No tender, by contracts'), <><b>{p100(sh(s.da_n, s.n))}</b> {L('de sus 100 contratos', 'of its 100 contracts')}</>],
      [L('Mejor año', 'Best year'), best ? <><b>{best[0]}</b> · {formatCompactMXN(best[2])}</> : '—'],
      [L('Desde el 28 sep 2025', 'Since 28 Sep 2025'), pv ? <><b>{p100(sh(pv, d.post.v))}</b> {L('de 100 en ComprasMX', 'in 100 at ComprasMX')} · {formatCompactMXN(pv)}</> : L('no aparece en ComprasMX', 'not in ComprasMX')],
    ]
    return (
      <div className="cc-detail" role="region" aria-label={L('Detalle del proveedor', 'Supplier detail')} style={{ ['--hue' as string]: CATEGORICAL[k] }}>
        <div className="cc-d-top">
          <span className="cc-sc" style={{ color: CATEGORICAL_TEXT[k] }}>{L('Proveedor', 'Supplier')} · {en ? `${k + 1}${['st', 'nd', 'rd'][k] ?? 'th'} of the six` : `${k + 1}.º de los seis`}</span>
          <button ref={backRef} type="button" className="cc-back" onClick={close}>{L('Volver', 'Back')}<kbd>Esc</kbd></button>
        </div>
        <div className="cc-d-name"><EntityIdentityChip type="vendor" id={s.id} name={s.name} size="md" fullName hideIcon /></div>
        <p className="cc-d-meta">
          {s.y0}–{s.y1} · {formatNumber(s.n)} {L('contratos aquí', 'contracts here')} · {formatCompactMXN(s.v)} · {lvl ? <>{L('indicador de riesgo CompraNet', 'CompraNet risk indicator')} <b style={{ color: RISK_TEXT_COLORS[lvl] }}>{s.risk!.toFixed(2)}</b> {LEVEL_WORD[lvl][en ? 1 : 0]}</> : L('sin indicador', 'no indicator')}
        </p>
        <dl className="cc-d-list">{rows.map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
        {s.buyers.length > 0 && (
          <div className="cc-d-buy">
            <span className="cc-sc">{L('Quién le compra aquí', 'Who buys from it here')}</span>
            {s.buyers.map((b) => (
              <div key={b.id} className="cc-d-brow">
                <EntityIdentityChip type="institution" id={b.id} name={b.name} size="sm" fullName hideIcon />
                <span><b>{p100(sh(b.v, s.v))}</b> {L('de 100', 'in 100')}</span>
              </div>
            ))}
          </div>
        )}
        <div className="cc-d-go">
          <Link to={`/vendors/${s.id}`} className="ct-link">{L('Abrir expediente', 'Open dossier')}</Link>
          <Link to={`/contracts?category_id=${categoryId}&vendor_id=${s.id}`} className="ct-link">{L('Sus contratos en esta categoría', 'Its contracts in this category')}</Link>
        </div>
      </div>
    )
  })() : null

  return (
    <section className="cc" aria-labelledby="cc-h1" aria-busy={q.isLoading}>
      <PageQuestion lang={lang}
        question={L('¿Quién le vende esto al gobierno?', 'Who sells this to the government?')}
        means={d && T && sup[0]
          ? (en ? <>The largest seller is <b><EntityIdentityChip type="vendor" id={sup[0].id} name={sup[0].name} variant="name" size="inherit" /></b>: it takes <b>{p100(sh(sup[0].v, T.v))}</b> of every 100 pesos spent on this.</>
            : <>Quien más vende es <b><EntityIdentityChip type="vendor" id={sup[0].id} name={sup[0].name} variant="name" size="inherit" /></b>: se lleva <b>{p100(sh(sup[0].v, T.v))}</b> de cada 100 pesos que se gastan en esto.</>)
          : q.isError ? L('La categoría no cargó.', 'The category did not load.') : null}
        targets={['.cc-svg', '.cc-svg']}
        cues={{ cols: '.cc-svg', ledg: '.cc-ledg', rail: '.cc-rail' }}
        script={en
          ? '### 1\n[#cols] Each column is a year. Its height is the money spent on this.\n### 2\n[#ledg] Each colour is one of the six that sell most; grey is everyone else. [#rail] Below, how many pesos in a hundred went without a tender.'
          : '### 1\n[#cols] Cada columna es un año. Su altura es el dinero que se gastó en esto.\n### 2\n[#ledg] Cada color es uno de los seis que más venden; el gris, todos los demás. [#rail] Abajo, cuántos pesos de cada cien se dieron sin competir.'}
      />
      <div className="cc-head">
        <div>
          <h1 id="cc-h1">{title}</h1>
          <p className="cc-kick">{V ? V.kicker : ' '}{sectorChip}</p>
        </div>
        <p className="cc-claim">
          {V ? (en
            ? <>Of every 100 pesos, <span className="cc-n">{Math.round(count * Number(p100(V.daMoney).replace('<', '')))}</span> were awarded without a tender and <span className="cc-n">{Math.round(count * Number(p100(V.top3).replace('<', '')))}</span> went to three suppliers.</>
            : <>De cada 100 pesos, <span className="cc-n">{Math.round(count * Number(p100(V.daMoney).replace('<', '')))}</span> se adjudicaron sin concurso y <span className="cc-n">{Math.round(count * Number(p100(V.top3).replace('<', '')))}</span> fueron a tres proveedores.</>)
            : q.isError ? L('La portada de la categoría no cargó. Recargue la página.', 'The category cover did not load. Reload the page.')
            : q.isLoading ? L('Cargando la portada de la categoría…', 'Loading the category cover…') : ' '}
        </p>
      </div>

      <div className="cc-block">
        <div ref={objRef} className="cc-obj" data-object onPointerLeave={() => { setHot(null); setTip(null) }}>
          {A && B && d && (
            <svg className={svgCls} width={box.W} height={H} viewBox={`0 0 ${box.W} ${H}`} role="img"
              aria-label={L(`Dinero por año y por proveedor, ${d.totals.y0}–${d.totals.y1} en CompraNet y desde el 28 sep 2025 en ComprasMX`, `Money per year and per supplier, ${d.totals.y0}–${d.totals.y1} on CompraNet and since 28 Sep 2025 on ComprasMX`)}>
              <defs>
                <pattern id="cc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={RAMP_INK[0]} /><rect width="2.5" height="6" fill={SLATE} /></pattern>
              </defs>
              <PatternDefs uid="cc" kinds={['sin-dato']} />
              {/* scale: two gridlines, labels inside the plot over a paper halo */}
              {[0.5, 1].map((f) => {
                const y = baseY - f * plotH
                return (
                  <g key={f} className="cc-grid">
                    <line x1={0} x2={box.W} y1={y} y2={y} />
                    <text x={0} y={y - 4}>{fmtLens(f * MXt, ln)}</text>
                  </g>
                )
              })}
              <line className="cc-base" x1={0} x2={box.W} y1={baseY} y2={baseY} />
              {/* year hit zones beneath the segments */}
              {A.cols.map((c) => (
                <rect key={`z${c.i}`} className="cc-zone" x={A.xOf(c.i) - 1.5} y={TOP} width={A.cw} height={plotH + AX}
                  onPointerMove={(e) => { setHot(null); placeTip(e, yearTip(c)) }} />
              ))}
              {cur.map(({ c, b }) => {
                const isPost = c.year === 'post'
                const delay = isPost ? 0 : c.i * 14
                return (
                  <g key={`c${c.i}`} className={isPost ? 'cc-post' : 'cc-col'} style={{ transformOrigin: `${A.xOf(c.i)}px ${baseY}px`, transitionDelay: `${delay}ms` }}>
                    {c.segs.map((s, si) => {
                      const y = lerp(s.y, b.segs[si].y), h = lerp(s.h, b.segs[si].h)
                      if (h < 0.25) return null
                      const supK = supIdx.get(s.k)
                      return (
                        <rect key={s.key} className={`cc-seg${supK != null ? ' is-sup' : ''}${active === s.k ? ' is-on' : ''}`} x={s.x} y={y} width={A.bw} height={h}
                          fill={s.k === 'pf' ? 'url(#cc-hatch)' : undefined}
                          style={{ ['--hue' as string]: hueOf(s.k), transitionDelay: supK != null ? `${380 + supK * 60}ms` : undefined }}
                          onPointerMove={(e) => { if (hot !== s.k) setHot(s.k); placeTip(e, segTip(s, c)) }}
                          onClick={() => open(s.k)} />
                      )
                    })}
                  </g>
                )
              })}
              {/* the peak year and the post column, named on the object */}
              {peakI >= 0 && (() => {
                const c = (ln === 'v' ? A : B).cols[peakI], x = A.xOf(peakI) + A.bw / 2
                const near = peakI > A.n - 4
                return <text className="cc-peak" x={near ? A.xOf(peakI) + A.bw : x} y={baseY - (c.total / MXt) * plotH - 6} textAnchor={near ? 'end' : 'middle'}>{fmtLens(c.total, ln).replace(` ${L('contratos', 'contracts')}`, '')}</text>
              })()}
              {/* blackout seam */}
              <line className="cc-seam" x1={xs} x2={xs} y1={6} y2={baseY + AX + ERA + RG + RAIL} style={{ transformOrigin: `${xs}px 6px` }} />
              <text className="cc-seamt" x={xs - 6} y={16} textAnchor="end">{L('CompraNet → ComprasMX', 'CompraNet → ComprasMX')}{phone ? '' : (lang === 'en' ? ' · 28 Sep 2025' : ' · 28 sep 2025')}</text>
              {/* years + eras */}
              {A.cols.slice(0, -1).map((c) => {
                const y = c.year as number
                const big = y % 5 === 0 || y === 2002
                if (phone && !big) return null
                return <text key={`y${y}`} className={`cc-yl${big ? ' is-b' : ''}`} x={A.xOf(c.i) + A.bw / 2} y={baseY + 13} textAnchor="middle">{big ? y : String(y % 100).padStart(2, '0')}</text>
              })}
              <text className="cc-yl is-b" x={A.xOf(A.n) + A.bw / 2} y={baseY + 13} textAnchor="middle">{L('desp.', 'after')}</text>
              {!phone && ERAS.map(([nm, a, z]) => {
                const ia = d.years.findIndex((y) => y.y === a), iz = d.years.findIndex((y) => y.y === z)
                if (ia < 0 || iz < 0) return null
                const x0 = A.xOf(ia), x1 = A.xOf(iz) + A.bw, y = baseY + AX + 2
                return <g key={nm} className="cc-era"><line x1={x0} x2={x1} y1={y} y2={y} /><text x={(x0 + x1) / 2} y={y + 12} textAnchor="middle">{nm}</text></g>
              })}
              {/* «directa» rail: direct award per year in the active lens; hatched = no procedure flag */}
              <g className="cc-rail">
                {cur.map(({ c, b }) => {
                  const r = ln === 'v' ? c.rail : b.rail
                  const y = baseY + AX + ERA + RG
                  const f = r == null ? patUrl('cc', 'sin-dato') : rampOf(r)
                  return (
                    <g key={`r${c.i}`} className="cc-cell" style={{ transitionDelay: `${900 + c.i * 8}ms` }}>
                      <rect x={A.xOf(c.i)} y={y} width={A.bw} height={RAIL} fill={f} />
                      {!phone && <text className={`cc-cv${r != null && r >= 0.6 ? ' is-w' : ''}`} x={A.xOf(c.i) + A.bw / 2} y={y + 15} textAnchor="middle">{r == null ? '·' : p100(r)}</text>}
                    </g>
                  )
                })}
              </g>
              <text className="cc-note" x={0} y={H - 4}>
                {rail
                  ? (ln === 'v' ? L('Directa: de cada 100 pesos del año, sin concurso', 'Direct: of every 100 pesos that year, no tender') : L('Directa: de cada 100 contratos del año, sin concurso', 'Direct: of every 100 contracts that year, no tender'))
                  : L('Rail «directa» oculto', '«Direct» rail hidden')}
                {!phone && rail ? L(' · rayado = sin dato de procedimiento', ' · hatched = no procedure data') : ''}
              </text>
            </svg>
          )}
          {!d && <div className="cc-hold" aria-hidden="true" />}
          {tip && <div className="pf-tip cc-tip" style={{ transform: `translate(${tip.x}px, ${tip.y}px)` }}>{tip.body}</div>}
        </div>

        <div className="cc-txt" style={{ ['--cc-top' as string]: `${TOP}px` }}>
          <div ref={txtRef} className="cc-txt-in">
            <div className="cc-lens" role="group" aria-label={L('Lente', 'Lens')}>
              <span className="cc-sc">{L('Medir por', 'Measure by')}</span>
              <button type="button" aria-pressed={lens === 'v'} onClick={() => setQ('lente', null)}>{L('Dinero', 'Money')}</button>
              <button type="button" aria-pressed={lens === 'n'} onClick={() => setQ('lente', 'contratos')}>{L('Contratos', 'Contracts')}</button>
              <button type="button" aria-pressed={rail} onClick={() => setRail((r) => !r)}>{L('Directa', 'Direct')}</button>
            </div>
            <p className="cc-lede">{lede ?? ' '}</p>
            <div className="cc-ledg" onPointerLeave={() => setHot(null)}>
              <div className="cc-lh"><span>{L('Los seis mayores', 'The six largest')} · {T?.y0}–{T?.y1}</span><span>{lens === 'v' ? L('de cada 100 pesos', 'of every 100 pesos') : L('de cada 100 contratos', 'of every 100 contracts')}</span></div>
              {sup.map((s, i) => (
                <button key={s.id} type="button" className={`cc-row${active === `v${s.id}` ? ' is-on' : ''}`}
                  onPointerEnter={() => setHot(`v${s.id}`)} onFocus={() => setHot(`v${s.id}`)} onBlur={() => setHot(null)} onClick={() => open(`v${s.id}`)}>
                  <span className="cc-sw" style={{ background: CATEGORICAL[i] }} />
                  <span className="cc-nm">{nameOf(s)}{s.flagged ? <span className="cc-dag"> †</span> : null}</span>
                  <span className="cc-amt">{lens === 'v' ? formatCompactMXN(s.v) : formatNumber(s.n)}</span>
                  <span className="cc-v">{p100(share(s))}</span>
                  <span className="sr-only"> · {L('ver detalle', 'see detail')}</span>
                </button>
              ))}
              {T && (
                <div className="cc-row is-static">
                  <span className="cc-sw" style={{ background: REST }} />
                  <span className="cc-nm">{L('Los demás', 'Everyone else')} <small>{formatNumber(Math.max(0, T.vendors - sup.length))} {L('proveedores', 'suppliers')}</small></span>
                  <span className="cc-amt">{lens === 'v' ? formatCompactMXN(Math.max(0, T.v - sup.reduce((a, s) => a + s.v, 0))) : formatNumber(Math.max(0, T.n - sup.reduce((a, s) => a + s.n, 0)))}</span>
                  <span className="cc-v">{p100(Math.max(0, restShare))}</span>
                </div>
              )}
              {d && (
                <div className="cc-lh is-post"><span>{L('Desde el 28 sep 2025', 'Since 28 Sep 2025')} · ComprasMX</span><span>{d.post.n ? `${formatNumber(d.post.n)} ${L('contratos', 'contracts')} · ${formatCompactMXN(d.post.v)}` : '—'}</span></div>
              )}
              {d && postRows.map((p) => {
                const k = p.id != null && supIdx.has(`v${p.id}`) ? `v${p.id}` : null
                return (
                  <div key={`${p.id}-${p.name}`} className={`cc-row is-static${k && active === k ? ' is-on' : ''}`} onPointerEnter={() => k && setHot(k)}>
                    <span className="cc-sw" style={{ background: k ? hueOf(k) : REST }} />
                    <span className="cc-nm">{formatEntityName('vendor', p.name, 'full')}</span>
                    <span className="cc-amt">{p.known_here ? L('ya vendía aquí', 'sold here before') : L('nuevo aquí', 'new here')}</span>
                    <span className="cc-v">{p100(lens === 'v' ? sh(p.v, d.post.v) : sh(p.n, d.post.n))}</span>
                  </div>
                )
              })}
              {d && !d.post.n && <p className="cc-mnote">{L('ComprasMX no registra contratos de esta categoría desde el 28 sep 2025.', 'ComprasMX records no contracts in this category since 28 Sep 2025.')}</p>}
            </div>
            {misfit && (
              <p className="cc-mnote">{en
                ? `${misfit.k} of the six largest have their main activity in another sector (${misfit.name}); the category classifier may have misfiled them.`
                : `${misfit.k} de los seis mayores tienen su actividad principal en otro sector (${misfit.name}); el clasificador de categorías pudo haberlos mal asignado.`}</p>
            )}
          </div>
          {detail}
        </div>
      </div>

      <div className="cc-figs" role="list" aria-label={L('En cifras', 'In figures')}>
        {(figs.length ? figs : Array.from({ length: 7 }, () => [' ', ' ', ' '] as [string, ReactNode, string])).map(([l, f, r], i) => (
          <div key={i} className="cc-fig" role="listitem"><span className="cc-fl">{l}</span><span className="cc-ff">{f}</span><span className="cc-fr">{r}</span></div>
        ))}
      </div>
      <p className="cc-foot">
        {L(
          `CompraNet ${T?.y0 ?? 2002}–${T?.y1 ?? 2025}; contratos de más de 100,000 MDP excluidos${T?.flagged ? `, † = ${T.flagged} de más de 10,000 MDP en revisión` : ''}. «Un solo proveedor adjudicado» = concurso con un único adjudicatario, no un solo postor. El indicador de riesgo (modelo v0.9.2) describe un patrón de compra, no una probabilidad de corrupción. Desde el 28 sep 2025: datos abiertos de ComprasMX cargados al registro, contratos iniciados desde esa fecha (sin repetir los de CompraNet); personas físicas agrupadas, sin nombre. Categorías clasificadas con el modelo automático; las señales agregadas son indicadores de riesgo estadísticos, no determinaciones legales.`,
          `CompraNet ${T?.y0 ?? 2002}–${T?.y1 ?? 2025}; contracts above 100B MXN excluded${T?.flagged ? `, † = ${T.flagged} above 10B MXN under review` : ''}. "Single supplier awarded" = a tender with one awardee, not one bidder. The risk indicator (model v0.9.2) describes a buying pattern, not a probability of corruption. Since 28 Sep 2025: ComprasMX open data loaded into the register, contracts started from that date (CompraNet duplicates removed); natural persons pooled, unnamed. Categories classified by the auto-model; aggregate signals are statistical risk indicators, not legal determinations.`,
        )}
        {' '}<Link to="/methodology" className="ct-link">{L('Ver la metodología completa', 'See the full methodology')}</Link>
      </p>
    </section>
  )
}
