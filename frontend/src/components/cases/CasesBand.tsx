/**
 * CasesBand — «La banda del tiempo» (/cases, Visualización). Concept A of
 * _ui_v4/concepts/cases, built on INTERACTION_SCORE §3.5.
 *
 *   rows = the public cases · bar = contract years, one cell per year, shade =
 *   documented loss (hatched = no amount) · tick = discovery year · colour =
 *   fraud type · lens: Calendario · Por sexenio · Por sector · Año 0
 *
 *   L0 rows draw in discovery order (bar → silence → tick), once per session
 *   L1 hover a row ⇄ its sexenio bands ⇄ its ledger cell; legend ⇄ rows
 *   L2 click a row → dock (quick card) · L3 the row opens into its vendors'
 *   contract marks along the span → a mark opens /contracts/:id
 *   L4 lens morph (same marks move, 600 ms) · L5 ?caso= &lente= · Esc = one level up
 *
 * Every figure comes from /cases (list) and /cases/:slug + /vendors/:id/contracts
 * (only the selected case). Geometry is in px from one ResizeObserver; CSS
 * transitions retarget, so every move is interruptible.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useQueryState, parseAsString, parseAsStringEnum } from 'nuqs'
import { useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { caseLibraryApi, vendorApi } from '@/api/client'
import type { ScandalListItem, ContractListItem } from '@/api/types'
import { ADMIN_COLORS, ADMIN_DISPLAY_ACCENTED } from '@/lib/administrations'
import { CASE_FRAUD_TYPE_COLORS, CATEGORICAL, RISK_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { exampleCase, caseSeen } from '@/lib/cases/casesRead'
import { dispositionLabel, fraudLabel, type Lang } from './casesVocab'
import '@/components/kit/kit.css'

type Lente = 'calendario' | 'sexenio' | 'sector' | 'ano0'
const LENTES: Lente[] = ['calendario', 'sexenio', 'sector', 'ano0']
const LENS_LABEL: Record<Lente, { es: string; en: string }> = {
  calendario: { es: 'Calendario', en: 'Calendar' },
  sexenio: { es: 'Por sexenio', en: 'By term' },
  sector: { es: 'Por sector', en: 'By sector' },
  ano0: { es: 'Año 0', en: 'Year 0' },
}

const Y_MIN = 2002
const Y_MAX = 2026
const SEXENIOS = [
  { key: 'fox', a: 2000.92, b: 2006.92 },
  { key: 'calderon', a: 2006.92, b: 2012.92 },
  { key: 'epn', a: 2012.92, b: 2018.92 },
  { key: 'amlo', a: 2018.92, b: 2024.75 },
  { key: 'sheinbaum', a: 2024.75, b: 2030 },
] as const
type SexKey = (typeof SEXENIOS)[number]['key']
const SEX_NAME_ES: Record<string, string> = { ...ADMIN_DISPLAY_ACCENTED, multiple: 'Varios sexenios' }
const SEX_NAME_EN: Record<string, string> = { ...ADMIN_DISPLAY_ACCENTED, multiple: 'Several terms' }

const TOP = 56
const ROW_H = 48
const ROW_HN = 116
/** CATEGORICAL slot → its theme token, so the night edition re-values the marks (index.css §6.7). */
const CAT_VAR = ['ink', 'blue', 'teal', 'violet', 'magenta', 'cyan', 'brown', 'slate'].map((n) => `var(--color-cat-${n})`)
const catVar = (hex: string) => CAT_VAR[(CATEGORICAL as readonly string[]).indexOf(hex)] ?? hex
const HEAD_H = 28
const LANE_H = 32
const MAX_LANES = 3
const BEAT_KEY = 'rubli_beat_cases'

/** The one conviction among the files is a 2023 US conviction for drug trafficking, not procurement. */
const CONVICTION_NOTE: Record<string, { es: string; en: string }> = {
  'ssp-police-equipment-calderon': { es: 'por narcotráfico, en EE. UU.', en: 'for drug trafficking, in the US' },
}

/** Short row labels (the full name sits in the dock); a case without an entry falls back to its full name. */
const SHORT: Record<string, { es: string; en: string }> = {
  'ssp-police-equipment-calderon': { es: 'SSP · García Luna', en: 'SSP · García Luna' },
  'fertinal-pemex-acquisition': { es: 'Fertinal · PEMEX', en: 'Fertinal · PEMEX' },
  'cisen-pegasus-surveillance': { es: 'Pegasus · CISEN', en: 'Pegasus · CISEN' },
  'insabi-medicine-collapse': { es: 'Abasto INSABI', en: 'INSABI medicines' },
  'linea-12-metro-collapse': { es: 'Línea 12 del Metro', en: 'Metro Line 12' },
  'oceanografia-pemex-fraud': { es: 'Oceanografía', en: 'Oceanografía' },
  'pemex-emilio-lozoya': { es: 'Lozoya · PEMEX', en: 'Lozoya · PEMEX' },
  'odebrecht-pemex-bribery': { es: 'Odebrecht', en: 'Odebrecht' },
  'grupo-higa-casa-blanca': { es: 'Casa Blanca · Higa', en: 'Casa Blanca · Higa' },
  'tren-maya-fonatur': { es: 'Tren Maya', en: 'Tren Maya' },
  'segalmex-food-distribution': { es: 'Segalmex', en: 'Segalmex' },
  'estafa-maestra': { es: 'La Estafa Maestra', en: 'The Master Scam' },
  'enciclomedia-sep': { es: 'Enciclomedia', en: 'Enciclomedia' },
}

/** The short row label of a case (its full name when it has none). */
export const caseShort = (c: ScandalListItem, lang: Lang) => SHORT[c.slug]?.[lang] ?? (lang === 'es' && c.name_es ? c.name_es : c.name_en)

interface Row {
  c: ScandalListItem
  slug: string
  y0: number
  y1: number
  dy: number
  lag: number
  sex: string
  sector: number
}

type Item = { kind: 'head'; key: string; label: string; color: string; n: number } | { kind: 'row'; r: Row }

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const yearFrac = (d?: string) => {
  const t = d ? Date.parse(d) : NaN
  if (Number.isNaN(t)) return null
  const dt = new Date(t)
  return dt.getUTCFullYear() + dt.getUTCMonth() / 12
}

/** Outcome cap, ink only (shape carries how far the case went). */
function Glyph({ status }: { status: string }) {
  const r = 6
  const k = { stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' }
  return (
    <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" className="cb-gl">
      {status === 'convicted' && <rect x={-r} y={-r} width={2 * r} height={2 * r} fill="currentColor" />}
      {status === 'prosecuted' && <><circle r={r} {...k} /><path d={`M0 ${-r}A${r} ${r} 0 0 1 0 ${r}Z`} fill="currentColor" /></>}
      {(status === 'acquitted' || status === 'dismissed') && <path d="M-5-5L5 5M5-5L-5 5" {...k} strokeWidth={2} />}
      {status === 'settled' && <path d={`M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`} {...k} />}
      {!['convicted', 'prosecuted', 'acquitted', 'dismissed', 'settled'].includes(status) && <circle r={r} {...k} />}
    </svg>
  )
}

/** `head` renders the page head (CaseLibrary's kit PageHead) with the band's finding as its h1. */
export function CasesBand({ cases, lang, head }: { cases: ScandalListItem[]; lang: Lang; head: (finding: ReactNode) => ReactNode }) {
  const es = lang === 'es'
  const L = (a: string, b: string) => (es ? a : b)
  const reduced = !!useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const [ready, setReady] = useState(false)
  const [beat, setBeat] = useState(false)
  const [hot, setHot] = useState<{ id?: number; f?: string; sx?: string } | null>(null)
  const [drill, setDrill] = useState(true)
  const [guide, setGuide] = useState(true)
  const [lenteQ, setLenteQ] = useQueryState('lente', parseAsStringEnum<Lente>(LENTES))
  const [caso, setCaso] = useQueryState('caso', parseAsString)
  const lente: Lente = lenteQ ?? 'calendario'

  // ── data ────────────────────────────────────────────────────────────────
  const rows: Row[] = useMemo(
    () =>
      cases
        .filter((c) => c.contract_year_start && c.discovery_year)
        .map((c) => {
          const y0 = c.contract_year_start as number
          const y1 = Math.max(y0, c.contract_year_end ?? y0)
          const dy = c.discovery_year as number
          return { c, slug: c.slug, y0, y1, dy, lag: dy - y0, sex: c.administration, sector: c.sector_id ?? c.sector_ids?.[0] ?? 12 }
        }),
    [cases],
  )
  const byStart = useMemo(() => [...rows].sort((a, b) => a.y0 - b.y0 || a.dy - b.dy), [rows])
  const discRank = useMemo(() => new Map([...rows].sort((a, b) => a.dy - b.dy || a.y0 - b.y0).map((r, i) => [r.slug, i])), [rows])
  const med = rows.length ? median(rows.map((r) => r.lag)) : 0
  const halfLate = rows.filter((r) => r.lag >= med).length
  const maxAmt = Math.max(1, ...rows.map((r) => r.c.amount_mxn_low ?? 0))
  const withAmt = rows.filter((r) => r.c.amount_mxn_low).length
  const loss = rows.reduce((a, r) => a + (r.c.amount_mxn_low ?? 0), 0)
  const convicted = rows.filter((r) => r.c.legal_status === 'convicted')

  // fraud colours: the cases-page hue first, next unused categorical slot on a clash
  const fraudColor = useMemo(() => {
    const out = new Map<string, string>()
    const used = new Set<string>()
    const types = [...new Set(rows.map((r) => r.c.fraud_type))].sort((a, b) => rows.filter((r) => r.c.fraud_type === b).length - rows.filter((r) => r.c.fraud_type === a).length)
    for (const t of types) {
      let col = CASE_FRAUD_TYPE_COLORS[t] ?? CASE_FRAUD_TYPE_COLORS.other
      if (used.has(col)) col = CATEGORICAL.slice(1).find((x) => !used.has(x)) ?? CASE_FRAUD_TYPE_COLORS.other
      used.add(col)
      out.set(t, catVar(col))
    }
    return out
  }, [rows])
  // «Cómo leer esto»: one worked example narrated over its own row (never a second graphic).
  const exSlug = useMemo(() => exampleCase(rows.map((r) => r.c))?.slug ?? null, [rows])
  const legend = useMemo(() => [...fraudColor.keys()].map((f) => ({ f, n: rows.filter((r) => r.c.fraud_type === f).length })), [fraudColor, rows])

  // ── selection: detail + the vendors' contracts (selected case only) ───────
  const sel = rows.find((r) => r.slug === caso) ?? null
  const { data: detail } = useQuery({
    queryKey: ['cases', 'detail', sel?.slug],
    queryFn: () => caseLibraryApi.getBySlug(sel!.slug),
    enabled: !!sel,
    staleTime: 10 * 60 * 1000,
  })
  const lanesV = useMemo(
    () => (detail?.linked_vendors ?? []).filter((v) => v.vendor_id != null && v.contract_count > 0).sort((a, b) => b.contract_count - a.contract_count).slice(0, MAX_LANES),
    [detail],
  )
  const contractQs = useQueries({
    queries: lanesV.map((v) => ({
      queryKey: ['cases', 'vendor-contracts', v.vendor_id],
      queryFn: () => vendorApi.getContracts(v.vendor_id as number, { per_page: 100, sort_by: 'amount_mxn', sort_order: 'desc' }),
      enabled: !!sel && drill,
      staleTime: 10 * 60 * 1000,
    })),
  })
  const drillOn = !!sel && drill

  // ── geometry ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [rows.length > 0])
  useEffect(() => {
    if (W > 0 && !ready) {
      const id = requestAnimationFrame(() => setReady(true))
      return () => cancelAnimationFrame(id)
    }
  }, [W, ready])
  // L0 beat: once per session, skipped by any input.
  useEffect(() => {
    if (reduced || !rows.length) return
    try {
      if (sessionStorage.getItem(BEAT_KEY)) return
      sessionStorage.setItem(BEAT_KEY, '1')
    } catch { /* private mode: play it */ }
    setBeat(true)
    const stop = () => setBeat(false)
    const t = window.setTimeout(stop, 1700)
    window.addEventListener('pointerdown', stop, { once: true })
    window.addEventListener('keydown', stop, { once: true })
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', stop); window.removeEventListener('keydown', stop) }
  }, [reduced, rows.length])

  const narrow = W > 0 && W < 640
  // label + outcome columns take the width their text needs (measured below), the plot takes the rest
  const [fit, setFit] = useState({ lx: 240, rw: 240 })
  const rwCap = Math.round(W * 0.24)
  const LX = narrow ? 0 : Math.min(fit.lx, Math.round(W * 0.3))
  const RW = narrow ? 0 : Math.min(fit.rw, rwCap)
  const GAP = narrow ? 0 : 24
  const PW = Math.max(120, W - LX - RW - GAP)
  const rowH = narrow ? ROW_HN : ROW_H
  const cy = narrow ? 96 : ROW_H / 2
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || narrow || W === 0) return
    const measure = () => {
      const w = (sel: string) => Math.max(0, ...[...el.querySelectorAll<HTMLElement>(sel)].map((n) => n.offsetWidth))
      const lx = Math.ceil(w('.cb-nm > *')) + 20
      const rw = Math.ceil(w('.cb-led-t > *')) + 36
      setFit((f) => (f.lx === lx && f.rw === rw ? f : { lx, rw }))
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
  }, [narrow, W, lang, rows, rwCap])

  const maxExt = Math.max(1, ...rows.map((r) => Math.max(r.y1 + 1 - r.y0, r.dy + 0.5 - r.y0)))
  const sc = PW / (maxExt + 2.4)
  const xCal = (yr: number) => ((yr - Y_MIN) / (Y_MAX - Y_MIN)) * PW
  const xOf = (r: Row, yr: number) => (lente === 'ano0' ? (yr - r.y0) * sc : xCal(yr))

  // items in display order
  const items: Item[] = useMemo(() => {
    if (lente === 'ano0') return [...rows].sort((a, b) => b.lag - a.lag || a.y0 - b.y0).map((r) => ({ kind: 'row' as const, r }))
    if (lente === 'calendario') return byStart.map((r) => ({ kind: 'row' as const, r }))
    const keyOf = (r: Row) => (lente === 'sexenio' ? r.sex : String(r.sector))
    const groups = new Map<string, Row[]>()
    for (const r of byStart) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r])
    const out: Item[] = []
    for (const [k, rs] of groups) {
      const sec = SECTORS.find((s) => String(s.id) === k)
      out.push({
        kind: 'head',
        key: `${lente}:${k}`,
        label: lente === 'sexenio' ? (es ? SEX_NAME_ES[k] : SEX_NAME_EN[k]) ?? k : sec ? (es ? sec.name : sec.nameEN) : k,
        color: lente === 'sexenio' ? ADMIN_COLORS[k as SexKey] ?? 'var(--color-text-muted)' : sec?.color ?? 'var(--color-text-muted)',
        n: rs.length,
      })
      rs.forEach((r) => out.push({ kind: 'row', r }))
    }
    return out
  }, [lente, rows, byStart, es])

  const laneN = Math.max(1, lanesV.length)
  const extra = drillOn ? laneN * LANE_H + 40 : 0
  const pos = useMemo(() => {
    const m = new Map<string, { y: number; h: number }>()
    let y = TOP
    for (const it of items) {
      if (it.kind === 'head') { m.set(it.key, { y, h: HEAD_H }); y += HEAD_H; continue }
      const h = rowH + (it.r.slug === sel?.slug ? extra : 0)
      m.set(it.r.slug, { y, h })
      y += h
    }
    return { m, total: y + 4 }
  }, [items, rowH, sel?.slug, extra])

  // ── interaction ─────────────────────────────────────────────────────────
  const pick = useCallback((slug: string) => { setCaso(slug); setDrill(true) }, [setCaso])
  const close = useCallback(() => { setCaso(null); setDrill(true) }, [setCaso])
  const lastFocus = useRef<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sel) return
      if (drill) setDrill(false)
      else { close(); if (lastFocus.current) rootRef.current?.querySelector<HTMLElement>(`[data-slug="${lastFocus.current}"]`)?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, drill, close])
  useEffect(() => { if (sel) lastFocus.current = sel.slug }, [sel])

  const sexOverlap = (r: Row) => SEXENIOS.filter((s) => r.y0 + 0 < s.b && r.y1 + 1 > s.a).map((s) => s.key as string)
  const isDim = (r: Row) => {
    if (hot?.id != null) return hot.id !== r.c.id
    if (hot?.f) return hot.f !== r.c.fraud_type
    if (hot?.sx) return !sexOverlap(r).includes(hot.sx)
    return false
  }
  const hotRow = hot?.id != null ? rows.find((r) => r.c.id === hot.id) : null
  const exRow = exSlug ? rows.find((r) => r.slug === exSlug) ?? null : null
  const caseName = (c: ScandalListItem) => (es && c.name_es ? c.name_es : c.name_en)
  const shortName = (c: ScandalListItem) => caseShort(c, lang)
  const lagTxt = (n: number) => `+${n} ${n === 1 ? L('año', 'yr') : L('años', 'yrs')}`
  const amtTxt = (c: ScandalListItem) => (c.amount_mxn_low ? formatCompactMXN(c.amount_mxn_low) : L('monto no publicado', 'amount not published'))
  const statusTxt = (r: Row) => {
    const note = CONVICTION_NOTE[r.slug]
    return note ? `${dispositionLabel(r.c.legal_status, lang)} · ${note[lang]}` : dispositionLabel(r.c.legal_status, lang)
  }

  if (!rows.length) return null

  const convNote = convicted.length === 1 ? CONVICTION_NOTE[convicted[0].slug]?.[lang]?.replace(/\.$/, '') : null
  const thesis1 = es
    ? `${rows.length} expedientes, ${formatCompactMXN(loss)} documentados en ${withAmt}.`
    : `${rows.length} case files, ${formatCompactMXN(loss)} documented in ${withAmt}.`
  const thesis2 = es
    ? (convicted.length === 1 ? `Una condena${convNote ? `: ${convNote}` : ''}.` : `${convicted.length} condenas.`)
    : (convicted.length === 1 ? `One conviction${convNote ? `: ${convNote}` : ''}.` : `${convicted.length} convictions.`)
  const lede = es
    ? `${halfLate} de ${rows.length} salieron a la luz ${med} años o más después del primer contrato.`
    : `${halfLate} of ${rows.length} came to light ${med} or more years after the first contract.`

  const xt = (r: Row) => ({ a: xOf(r, r.y0), b: xOf(r, r.y1 + 1), d: xOf(r, r.dy + 0.5) })
  const dim = ready ? '' : ' is-still'

  return (<>
    {head(<><span>{thesis1}</span> <span>{thesis2}</span></>)}
    <section className={`cb${narrow ? ' cb--n' : ''}${beat ? ' cb--beat' : ''}${dim}`} aria-label={L('La banda del tiempo de los expedientes', 'The case files time band')} data-lens={lente}>
      <div className="cb-bar">
        <p className="cb-lede">{lede}</p>
        {/* the house view switch (same control as /aria, /arranque, /categories) */}
        <div className="ct-viewswitch cb-lens" role="group" aria-label={L('Lente', 'Lens')}>
          {LENTES.map((l) => (
            <button key={l} type="button" className="ct-view" aria-pressed={lente === l} onClick={() => setLenteQ(l === 'calendario' ? null : l)}>
              <span className="ct-view-t"><b>{LENS_LABEL[l][lang]}</b></span>
            </button>
          ))}
        </div>
      </div>
      <div className="cb-key">
        {legend.map(({ f, n }) => (
          <button
            key={f}
            type="button"
            className="cb-keyi"
            aria-pressed={hot?.f === f}
            onPointerEnter={() => setHot({ f })}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot({ f })}
            onBlur={() => setHot(null)}
          >
            <i aria-hidden="true" style={{ background: fraudColor.get(f) }} />
            <span>{fraudLabel(f, lang)} <b>{n}</b></span>
          </button>
        ))}
        <span className="cb-read" aria-live="polite">
          {hotRow
            ? `${caseName(hotRow.c)} · ${hotRow.y0}–${hotRow.y1} · ${L('a la luz en', 'came to light in')} ${hotRow.dy} (${lagTxt(hotRow.lag)})`
            : L('Clic en un expediente: ficha y contratos', 'Click a case file: card and contracts')}
        </span>
      </div>

      {exRow && (
        <div className="cb-guide">
          {guide ? (
            <p>
              <b>{L('Cómo leer esto', 'How to read this')}</b>{L(`, con ${shortName(exRow.c)}: `, `, with ${shortName(exRow.c)}: `)}
              <span><i aria-hidden="true">1</i>{L(`la barra marca los años con contratos, ${exRow.y0}–${exRow.y1}`, `the bar marks the years with contracts, ${exRow.y0}–${exRow.y1}`)}{exRow.c.amount_mxn_low ? L('; más oscura, más pérdida', '; darker, more loss') : L(' (rayada: sin monto publicado)', ' (hatched: no amount published)')}. </span>
              <span><i aria-hidden="true">2</i>{L('La línea punteada marca los años en silencio. ', 'The dashed line marks the silent years. ')}</span>
              <span><i aria-hidden="true">3</i>{L(`La marca es ${exRow.dy}, cuando se supo. `, `The tick is ${exRow.dy}, when it came out. `)}</span>
              {!narrow && <span><i aria-hidden="true">4</i>{L('A la derecha, cómo terminó. ', 'On the right, how it ended. ')}</span>}
              <button type="button" className="ct-link" aria-expanded onClick={() => setGuide(false)}>{L('Ocultar', 'Hide')}</button>
            </p>
          ) : (
            <button type="button" className="ct-chip" aria-expanded={false} onClick={() => setGuide(true)}>{L('Cómo leer esto', 'How to read this')}</button>
          )}
        </div>
      )}

      <div ref={rootRef} className="cb-plot" style={{ height: pos.total }} data-hot={hot ? '' : undefined} onPointerLeave={() => setHot(null)}>
        {W > 0 && (
          <>
            {/* axis layers: calendar (years + sexenio bands) ⇄ year 0 (years since the first contract) */}
            <div className="cb-ax cb-ax-cal" style={{ left: LX, width: PW, opacity: lente === 'ano0' ? 0 : 1 }} aria-hidden="true">
              {Array.from({ length: (Y_MAX - Y_MIN) / (narrow ? 4 : 2) + 1 }, (_, i) => Y_MIN + i * (narrow ? 4 : 2)).map((y) => (
                <span key={y} className="cb-yr" style={{ transform: `translateX(${xCal(y)}px)` }}>{y}</span>
              ))}
              {SEXENIOS.map((s) => {
                const xa = Math.max(0, xCal(Math.max(Y_MIN, s.a)))
                const xb = Math.min(PW, xCal(Math.min(Y_MAX, s.b)))
                if (xb <= xa) return null
                const lit = hot?.sx === s.key || (hotRow != null && sexOverlap(hotRow).includes(s.key))
                return (
                  <div
                    key={s.key}
                    className={`cb-sx${lit ? ' is-lit' : ''}${hot && !lit ? ' is-off' : ''}`}
                    style={{ left: xa, width: xb - xa, ['--c' as string]: ADMIN_COLORS[s.key] }}
                    onPointerEnter={() => setHot({ sx: s.key })}
                  >
                    <span>{es ? SEX_NAME_ES[s.key] : SEX_NAME_EN[s.key]}</span>
                  </div>
                )
              })}
              {SEXENIOS.map((s) => {
                const xa = xCal(Math.max(Y_MIN, s.a))
                return xa > 1 && xa < PW ? <i key={s.key} className="cb-vl" style={{ left: xa, top: 0, height: pos.total }} /> : null
              })}
            </div>
            <div className="cb-ax cb-ax-0" style={{ left: LX, width: PW, opacity: lente === 'ano0' ? 1 : 0 }} aria-hidden="true">
              {Array.from({ length: Math.floor(maxExt) + 1 }, (_, k) => (
                <span key={k} className="cb-vl cb-vl-k" data-k={k} style={{ left: k * sc, height: pos.total }}>
                  {k % 2 === 0 && <em>{k ? `+${k}` : L('primer contrato', 'first contract')}</em>}
                </span>
              ))}
              <i className="cb-med" style={{ left: (med + 0.5) * sc, height: pos.total }}>
                <b>{L('mediana', 'median')} · {med} {L('años', 'years')}</b>
              </i>
            </div>
            <span className="cb-ledhead" style={{ left: LX + PW + GAP }}>{L('desenlace', 'outcome')}</span>

            {items.map((it) => {
              if (it.kind === 'head') {
                const p = pos.m.get(it.key)!
                return (
                  <div key={it.key} className="cb-gh" style={{ transform: `translateY(${p.y}px)`, height: p.h, ['--c' as string]: it.color }}>
                    <i aria-hidden="true" />
                    <b>{it.label}</b>
                    <span>{it.n}</span>
                  </div>
                )
              }
              const r = it.r
              const p = pos.m.get(r.slug)!
              const { a, b, d } = xt(r)
              const col = fraudColor.get(r.c.fraud_type) ?? CASE_FRAUD_TYPE_COLORS.other
              const hasAmt = !!r.c.amount_mxn_low
              const shade = hasAmt ? 0.72 + 0.28 * Math.sqrt((r.c.amount_mxn_low as number) / maxAmt) : 0.55
              const yw = lente === 'ano0' ? sc : PW / (Y_MAX - Y_MIN)
              const isSel = sel?.slug === r.slug
              const isOpen = isSel && drillOn
              const off = Math.max(b, d)
              const lgLeft = off + 10 + 72 > PW
              const rank = discRank.get(r.slug) ?? 0
              return (
                <div
                  key={r.slug}
                  className={`cb-row${isSel ? ' is-sel' : ''}${isDim(r) && !isSel ? ' is-dim' : ''}${hot?.id === r.c.id ? ' is-hot' : ''}`}
                  style={{ transform: `translateY(${p.y}px)`, height: p.h, ['--cy' as string]: `${cy}px`, ['--i' as string]: rank, ['--col' as string]: col }}
                >
                  <div
                    className="cb-line"
                    role="button"
                    tabIndex={0}
                    data-slug={r.slug}
                    aria-expanded={isOpen}
                    style={{ height: rowH }}
                    onPointerEnter={() => setHot({ id: r.c.id })}
                    onFocus={() => setHot({ id: r.c.id })}
                    onBlur={() => setHot(null)}
                    onClick={() => (isSel ? setDrill((v) => !v) : pick(r.slug))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isSel ? setDrill((v) => !v) : pick(r.slug) } }}
                  >
                    <div className="cb-nm" style={{ width: narrow ? '100%' : LX - 16 }}>
                      <b>{shortName(r.c)}</b>
                      <small>{fraudLabel(r.c.fraud_type, lang)} · {r.y0}–{r.y1}</small>
                      {/* WCAG 2.5.3: name = the visible text; the full name + discovery year read off-screen */}
                      <span className="sr-only">, {caseName(r.c)}, {L('a la luz en', 'came to light in')} {r.dy}</span>
                      {narrow && (
                        <small className="cb-nm-o"><Glyph status={r.c.legal_status} />{statusTxt(r)} · {amtTxt(r.c)}</small>
                      )}
                    </div>
                    <div className="cb-pl" style={{ left: LX, width: PW }}>
                      <div className={`cb-b${hasAmt ? '' : ' is-none'}`} style={{ left: a, width: Math.max(3, b - a), ['--yw' as string]: `${yw}px` }}>
                        <i style={hasAmt ? { background: col, opacity: shade } : undefined} />
                      </div>
                      {d > b && <i className="cb-sil" style={{ left: b, width: d - b }} />}
                      <i className="cb-tk" style={{ left: d }} />
                      <span className="cb-lg" style={lgLeft ? { left: a - 10, transform: 'translateX(-100%)' } : { left: off + 10 }}>{lagTxt(r.lag)}</span>
                      {guide && r.slug === exSlug && (
                        <>
                          <i className="cb-ann" aria-hidden="true" style={{ left: (a + b) / 2 }}>1</i>
                          {d - b > 66 && <i className="cb-ann" aria-hidden="true" style={{ left: (b + d) / 2 }}>2</i>}
                          <i className="cb-ann cb-ann--tk" aria-hidden="true" style={{ left: d }}>3</i>
                        </>
                      )}
                    </div>
                    {!narrow && (
                      <div className="cb-led" style={{ left: LX + PW + GAP, width: RW }}>
                        {guide && r.slug === exSlug && <i className="cb-ann cb-ann--led" aria-hidden="true">4</i>}
                        <Glyph status={r.c.legal_status} />
                        {/* line 1 the outcome, line 2 the documented amount (or that none is published) */}
                        <span className="cb-led-t" style={{ ['--rw' as string]: `${rwCap - 26}px` }}>
                          <span>{statusTxt(r)}</span>
                          {hasAmt ? <b>{amtTxt(r.c)}</b> : <small>{amtTxt(r.c)}</small>}
                        </span>
                      </div>
                    )}
                  </div>

                  {isSel && (
                    <div className="cb-lanes" style={{ top: rowH, height: extra }} data-open={isOpen ? '' : undefined} aria-hidden={!isOpen}>
                      {isOpen && (
                        <>
                          {lanesV.length === 0 && (
                            <p className="cb-none" style={{ left: LX }}>
                              {detail
                                ? L('Sin contratos vinculados por proveedor en CompraNet.', 'No vendor-linked contracts in CompraNet.')
                                : L('Cargando contratos…', 'Loading contracts…')}
                            </p>
                          )}
                          {lanesV.map((v, i) => {
                            const q = contractQs[i]
                            const all: ContractListItem[] = q?.data?.data ?? []
                            const inSpan = all
                              .map((k) => ({ k, yr: k.contract_year != null ? yearFrac(k.contract_date) ?? k.contract_year : null }))
                              .filter((x): x is { k: ContractListItem; yr: number } => x.yr != null && x.yr >= r.y0 && x.yr < r.y1 + 1)
                            return (
                              <div key={v.vendor_id} className="cb-lane" style={{ top: i * LANE_H, height: LANE_H }}>
                                <div className="cb-ln" style={{ width: narrow ? '100%' : LX - 20 }}>
                                  <EntityIdentityChip type="vendor" id={v.vendor_id as number} name={v.vendor_name} variant="name" fullName className="text-text-primary hover:underline underline-offset-2" />
                                </div>
                                <div className="cb-pl" style={{ left: LX, width: PW }}>
                                  <i className="cb-lr" style={{ left: a, width: Math.max(2, b - a) }} />
                                  {inSpan.map(({ k, yr }) => {
                                    const lvl = k.risk_score != null ? getRiskLevelFromScore(k.risk_score) : 'low'
                                    const s = 7 + Math.min(7, Math.max(0, Math.log10(Math.max(1, k.amount_mxn)) - 5) * 1.6)
                                    return (
                                      <Link
                                        key={k.id}
                                        to={`/contracts/${k.id}`}
                                        className="cb-mk"
                                        style={{ left: xOf(r, yr) - s / 2, width: s, height: s, background: lvl === 'critical' || lvl === 'high' ? RISK_COLORS[lvl] : col }}
                                        aria-label={`${L('Contrato', 'Contract')} ${k.contract_number ?? k.id} · ${formatCompactMXN(k.amount_mxn)} · ${k.contract_date?.slice(0, 10) ?? ''}`}
                                        title={`${formatCompactMXN(k.amount_mxn)} · ${k.contract_date?.slice(0, 10) ?? ''}`}
                                      />
                                    )
                                  })}
                                  {q?.isLoading && <span className="cb-wait" style={{ left: a + 8 }}>{L('cargando…', 'loading…')}</span>}
                                  {q && !q.isLoading && (
                                    <span className="cb-wait" style={{ left: Math.max(b, d) + 10 }}>
                                      {inSpan.length} {L(`de ${formatNumber(v.contract_count)} contratos`, `of ${formatNumber(v.contract_count)} contracts`)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          <p className="cb-note" style={{ left: LX, top: laneN * LANE_H + 4, width: W - LX }}>
                            {L(
                              'Cada marca es un contrato del periodo, entre los 100 mayores de la empresa. Rojo: indicador crítico. Ámbar: alto. Clic para abrirlo.',
                              "Each mark is a contract inside the span, from the company's 100 largest. Red: critical indicator. Amber: high. Click to open it.",
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* L2 dock: the case quick card (overlays, never pushes) */}
        <aside className="cb-dockw" data-open={sel ? '' : undefined} aria-hidden={!sel} aria-label={L('Ficha del expediente', 'Case file card')}>
          <Dock sel={sel} detail={detail} lang={lang} col={sel ? fraudColor.get(sel.c.fraud_type) : undefined} drill={drillOn} onDrill={() => setDrill((v) => !v)} onClose={close} />
        </aside>
      </div>
    </section>
  </>)
}

function Dock({ sel, detail, lang, col, drill, onDrill, onClose }: {
  sel: Row | null
  detail?: import('@/api/types').ScandalDetail
  lang: Lang
  col?: string
  drill: boolean
  onDrill: () => void
  onClose: () => void
}) {
  const es = lang === 'es'
  const L = (a: string, b: string) => (es ? a : b)
  // keep the last card mounted while the dock slides out
  const last = useRef<Row | null>(null)
  if (sel) last.current = sel
  const r = sel ?? last.current
  if (!r) return <div className="cb-dock" />
  const c = r.c
  const note = es ? detail?.legal_status_note_es ?? detail?.legal_status_note : detail?.legal_status_note
  const conv = CONVICTION_NOTE[r.slug]
  const vendors = detail?.linked_vendors ?? []
  const named = vendors.filter((v) => v.vendor_id != null)
  const unnamed = vendors.filter((v) => v.vendor_id == null)
  const seen = detail ? caseSeen(detail.linked_vendors) : null
  return (
    <div className="cb-dock">
      <button type="button" className="cb-x" onClick={onClose} aria-label={L('Cerrar ficha', 'Close card')}><X aria-hidden="true" /></button>
      <p className="cb-dk"><i aria-hidden="true" style={{ background: col }} />{fraudLabel(c.fraud_type, lang)}</p>
      <h3 className="cb-dt">
        <EntityIdentityChip type="case" id={r.slug} name={es && c.name_es ? c.name_es : c.name_en} variant="name" fullName className="text-text-primary hover:underline underline-offset-2" />
      </h3>
      <dl className="cb-dl">
        <dt>{L('Contratos', 'Contracts')}</dt><dd>{r.y0}–{r.y1}</dd>
        <dt>{L('A la luz', 'Came to light')}</dt><dd>{r.dy} · {`+${r.lag} ${r.lag === 1 ? L('año', 'yr') : L('años', 'yrs')}`}</dd>
        <dt>{L('Monto documentado', 'Documented amount')}</dt><dd>{c.amount_mxn_low ? formatCompactMXN(c.amount_mxn_low) : L('sin monto documentado', 'no documented amount')}</dd>
        <dt>{L('Desenlace', 'Outcome')}</dt><dd><Glyph status={c.legal_status} /> {dispositionLabel(c.legal_status, lang)}{conv ? ` · ${conv[lang]}` : ''}</dd>
      </dl>
      {conv && (
        <p className="cb-fact">{L('La única condena de los expedientes es de 2023 en EE. UU., por narcotráfico; no es por compras públicas.', 'The only conviction among the files is a 2023 US one, for drug trafficking; it is not for public procurement.')}</p>
      )}
      {note && <p className="cb-note2">{note}</p>}
      {seen && (
        <p className="cb-seen">
          <b>{L('¿Lo habría visto el modelo?', 'Would the model have seen it?')}</b>{' '}
          {seen.n === 1
            ? (seen.seen ? L('Su empresa con contratos promedia un indicador alto o crítico.', 'Its company with contracts averages a high or critical indicator.') : L('Su empresa con contratos no llega a alto.', 'Its company with contracts does not reach high.'))
            : L(`${seen.seen} de sus ${seen.n} empresas con contratos promedian alto o crítico.`, `${seen.seen} of its ${seen.n} companies with contracts average high or critical.`)}
        </p>
      )}
      {detail && (
        <div className="cb-vs">
          <h4>{L('Proveedores vinculados', 'Linked vendors')}</h4>
          <ul>
            {named.slice(0, 8).map((v) => (
              <li key={v.vendor_id}>
                <EntityIdentityChip type="vendor" id={v.vendor_id as number} name={v.vendor_name} variant="name" fullName className="text-text-primary hover:underline underline-offset-2" />
                {v.contract_count > 0 && <small>{formatNumber(v.contract_count)} {L('contratos', 'contracts')}</small>}
              </li>
            ))}
            {unnamed.slice(0, Math.max(0, 8 - named.length)).map((v) => (
              <li key={v.vendor_name}><span>{formatEntityName('vendor', v.vendor_name, 'full')}</span><small>{L('sin ficha en CompraNet', 'no CompraNet record')}</small></li>
            ))}
          </ul>
          {vendors.length > 8 && <small className="cb-more">{L(`y ${vendors.length - 8} más`, `and ${vendors.length - 8} more`)}</small>}
        </div>
      )}
      {detail && detail.sources.length > 0 && (
        <div className="cb-vs">
          <h4>{L('Fuentes', 'Sources')}</h4>
          <ul>
            {detail.sources.slice(0, 3).map((s) => (
              <li key={`${s.outlet}${s.date}${s.title}`}>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="ct-link">{s.outlet}</a> : <span>{s.outlet}</span>}
                <small>{s.date ?? ''}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="cb-act">
        <button type="button" className="ct-chip" onClick={onDrill} aria-pressed={drill}>{drill ? L('Cerrar contratos', 'Hide contracts') : L('Ver contratos en la banda', 'Show contracts on the band')}</button>
        <Link to={`/cases/${r.slug}`} className="ct-link">{L('Abrir el expediente →', 'Open the case file →')}</Link>
      </div>
    </div>
  )
}
