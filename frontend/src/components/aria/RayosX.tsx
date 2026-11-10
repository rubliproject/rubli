/**
 * RayosX — Focos Rojos «Rayos X» (owner 2026-10-21: «make it look alive, bigger,
 * more stats, in the center, the rest in black behind»). A centred modal over a
 * near-black scrim that grows out of the clicked wall card and shrinks back into
 * it; ←/→ walk the wall without closing. Inside: the large rosette draws its
 * years in, figures count up, signal bars and the years strip grow (once per vendor).
 * Data: the wall row + /aria/queue/{id} + /vendors/{id}/{institutions,contracts,risk-timeline}.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ariaApi, vendorApi } from '@/api/client'
import type { AriaQueueItem } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { rankNo } from '@/components/kit/ListRow'
import { IpsLedger, PatternList } from '@/components/aria/IpsLedger'
import { patternName } from '@/lib/aria/patterns'
import { VERDICT_LABEL } from '@/components/aria/disposition'
import { DATA_LAST_YEAR, RAMP_INK, RISK_COLORS, RISK_TEXT_COLORS, getRiskLevelFromScore, getSectorNameEN, getSectorNameES, riskRamp } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { CountUp } from '@/components/newtabs/ntShared'
import { trapTab } from '@/hooks/useModal'
import { useMediaQuery } from '@/hooks/useIsMobile'
import './rayosx.css'

export type Tuple = [number, number, number | null, 0 | 1]
export type RxVendor = AriaQueueItem & { last_contract_year?: number | null; post_blackout_mxn?: number | null }

const Y0 = 2002
const YEARS = DATA_LAST_YEAR - Y0 + 1  // through the cut year (ComprasMX after Sep 2025)
const LOG_LO = 4 // 10 mil
const LOG_HI = 10 // 10,000 MDP
const EASE = [0.23, 1, 0.32, 1] as const
const ease3 = (t: number) => 1 - Math.pow(1 - t, 3)

const rosettePx = (size: number) => Math.round(size * (window.devicePixelRatio || 1))

/** Paints one rosette; `p` (0–1) sweeps the years in clockwise. */
function paintRosette(cv: HTMLCanvasElement, size: number, list: Tuple[], p: number, labels = false) {
  // rounded: a fractional DPR (2.625 on many phones) never equals the integer canvas.width, which reallocated the bitmap every frame
  const px = rosettePx(size)
  if (cv.width !== px || cv.height !== px) { cv.width = px; cv.height = px; cv.style.width = cv.style.height = `${size}px` }
  const c = cv.getContext('2d')
  if (!c) return
  c.setTransform(px / size, 0, 0, px / size, 0, 0)
  c.clearRect(0, 0, size, size)
  const m = size / 2, r0 = size * 0.07, r1 = size / 2 - (labels ? 14 : 3)
  const rad = (a: number) => r0 + (r1 - r0) * Math.min(1, Math.max(0, (Math.log10(Math.max(a, 10 ** LOG_LO)) - LOG_LO) / (LOG_HI - LOG_LO)))
  c.strokeStyle = RAMP_INK[1]
  c.lineWidth = 1
  for (const e of [6, 8]) { c.beginPath(); c.arc(m, m, rad(10 ** e), 0, Math.PI * 2); c.stroke() }
  c.beginPath(); c.moveTo(m, m - r1 - 2); c.lineTo(m, m - r0); c.stroke() // 2002 spoke
  if (labels) {
    c.fillStyle = RAMP_INK[3]
    c.font = '12px "IBM Plex Mono", monospace'
    c.textAlign = 'center'
    c.fillText('2002', m, 11)
    c.textAlign = 'left'
    c.fillText('1 MDP', m + 3, m - rad(1e6) - 3)
    c.fillText('100 MDP', m + 3, m - rad(1e8) - 3)
    if (p < 1) { // the sweep hand
      const a = -Math.PI / 2 + p * Math.PI * 2
      c.strokeStyle = RAMP_INK[2]
      c.beginPath(); c.moveTo(m, m); c.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); c.stroke()
    }
  }
  const cut = Y0 + p * YEARS
  const dot = labels ? 3.2 : 1.9
  for (const [y, a, s, da] of list) {
    if (y > cut) continue
    // a small deterministic jitter so same-year contracts fan out
    const ang = -Math.PI / 2 + ((y - Y0 + 0.5) / YEARS) * Math.PI * 2 + (((a % 97) / 97) - 0.5) * 0.2
    const rr = rad(a)
    const col = riskRamp(s ?? 0)
    c.beginPath(); c.arc(m + Math.cos(ang) * rr, m + Math.sin(ang) * rr, dot, 0, Math.PI * 2)
    if (da) { c.fillStyle = col; c.fill() } else { c.strokeStyle = col; c.lineWidth = 1; c.stroke() }
  }
}

/** The sweep runs 0 → 1 over `ms` after `delay` each time `beat` changes, painting the canvas
 *  straight from rAF (no React state per frame); 1 at once under reduced motion or without a beat. */
export function Rosette({ list, size, labels, beat, ms = 800, delay = 0 }: { list: Tuple[]; size: number; labels?: boolean; beat?: number; ms?: number; delay?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const still = !!useReducedMotion()
  const p = useRef(beat != null && !still ? 0 : 1)
  const args = useRef({ list, size, labels })
  args.current = { list, size, labels }
  // Off-screen canvases (most of a 169-card wall on a phone) neither paint nor tick until they scroll in;
  // the sweep stays clocked from mount, so a card reached later shows the same frame it would have.
  const vis = useRef(false)
  const kick = useRef(() => {})
  const paint = () => { const a = args.current; if (vis.current && ref.current) paintRosette(ref.current, a.size, a.list, p.current, a.labels) }
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { vis.current = true; kick.current(); return }
    const io = new IntersectionObserver(([e]) => { vis.current = e.isIntersecting; if (vis.current) kick.current() })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(paint, [list, size, labels])
  useEffect(() => {
    if (beat == null || still) { p.current = 1; kick.current = paint; paint(); return }
    p.current = 0
    let raf = 0
    const t0 = performance.now() + delay
    const step = (now: number) => {
      raf = 0
      if (!vis.current) return
      const q = Math.min(1, Math.max(0, (now - t0) / ms))
      p.current = ease3(q)
      paint()
      if (q < 1) raf = requestAnimationFrame(step)
    }
    kick.current = () => { if (!raf) raf = requestAnimationFrame(step) }
    kick.current()
    return () => cancelAnimationFrame(raf)
  }, [beat, ms, delay, still]) // eslint-disable-line react-hooks/exhaustive-deps
  // sized up front: an unpainted canvas would lay out at the 300×150 default
  const px = rosettePx(size)
  return <canvas ref={ref} width={px} height={px} style={{ width: size, height: size }} aria-hidden="true" />
}

const cardRect = (id: number) => document.querySelector<HTMLElement>(`[data-vid="${id}"]`)?.getBoundingClientRect() ?? null
const pct = (x: number | null | undefined) => (x == null ? '—' : x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`)
// Stable formatters for the count-ups (a new fn per render would restart the tween).
const f2 = (n: number) => n.toFixed(2)
const fN = (n: number) => formatNumber(Math.round(n))
const fPct = (n: number) => pct(n)
const NUM = (to: number, fmt: (n: number) => string, cls?: string) => <b className={cls}><CountUp to={to} fmt={fmt} className="" ms={650} delay={120} /></b>

// One definition per query so the modal and the neighbour prefetch share keys.
const rxQueries = (id: number) => [
  { queryKey: ['aria-lead-detail', id], queryFn: () => ariaApi.getVendorDetail(id), staleTime: 300_000 },
  { queryKey: ['rx-inst', id], queryFn: () => vendorApi.getInstitutions(id, 4), staleTime: 300_000 },
  { queryKey: ['rx-big', id], queryFn: () => vendorApi.getContracts(id, { sort_by: 'amount_mxn', sort_order: 'desc', per_page: 5 }), staleTime: 300_000 },
  { queryKey: ['rx-tl', id], queryFn: () => vendorApi.getRiskTimeline(id), staleTime: 300_000 },
] as const

export function RayosX({ vendor, list, index, total, lang, onPrev, onNext, onClose, neighbors, prevName, nextName }: {
  vendor: RxVendor
  list: Tuple[]
  index: number
  total: number
  lang: 'en' | 'es'
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onClose: () => void
  neighbors?: (number | undefined)[]
  /** the neighbours' names, so «siguiente» says where it goes (owner 2026-11-02: make ←/→ discoverable) */
  prevName?: string | null
  nextName?: string | null
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const id = vendor.vendor_id
  const panel = useRef<HTMLDivElement>(null)
  const [dir, setDir] = useState(0)
  const [copied, setCopied] = useState(false)
  const copyT = useRef(0)
  useEffect(() => () => window.clearTimeout(copyT.current), [])
  const phone = useMediaQuery('(max-width: 639.98px)')
  const short = useMediaQuery('(max-height: 959.98px)')

  // Geometry of the grow-from-card: the panel is centred, so the offset is card centre − viewport centre.
  const from = useMemo(() => {
    const r = cardRect(id)
    if (!r) return { x: 0, y: 24, scale: 0.96 }
    const w = phone ? window.innerWidth : Math.min(1120, window.innerWidth - 48)
    return { x: r.left + r.width / 2 - window.innerWidth / 2, y: r.top + r.height / 2 - window.innerHeight / 2, scale: Math.max(0.08, r.width / w) }
  }, [id, phone])

  const go = (d: -1 | 1) => {
    const f = d < 0 ? onPrev : onNext
    if (f) { setDir(d); f() }
  }
  const keys = useRef({ go, onClose })
  keys.current = { go, onClose }

  // Body scroll lock, Esc / ←→, focus trap; focus lands on the panel and returns to the card on close.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); keys.current.onClose(); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); keys.current.go(-1); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); keys.current.go(1); return }
      if (e.key === 'Tab' && panel.current) trapTab(e, panel.current)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [])

  const [dq, iq, bq, tq] = rxQueries(id)
  const detail = useQuery(dq)
  const inst = useQuery(iq)
  const big = useQuery(bq)
  const tl = useQuery(tq)

  // ←/→ should land on warm data: fetch the neighbours while this one is open.
  const qc = useQueryClient()
  const [prevId, nextId] = neighbors ?? []
  useEffect(() => {
    for (const n of [prevId, nextId]) {
      if (n == null) continue
      const [a, b, c, d] = rxQueries(n)
      void qc.prefetchQuery(a); void qc.prefetchQuery(b); void qc.prefetchQuery(c); void qc.prefetchQuery(d)
    }
  }, [qc, prevId, nextId])

  const v: RxVendor = { ...vendor, ...(detail.data ?? {}) }
  const risk = v.avg_risk_score ?? null
  const lvl = risk != null ? getRiskLevelFromScore(risk) : null
  const LVL = { critical: L('crítico', 'critical'), high: L('alto', 'high'), medium: L('medio', 'medium'), low: L('bajo', 'low') }
  const name = formatVendorName(v.vendor_name, 200)

  const years = useMemo(() => {
    const by = new Map((tl.data?.timeline ?? []).map((t) => [t.year, t]))
    return Array.from({ length: YEARS }, (_, i) => by.get(Y0 + i) ?? null)
  }, [tl.data])
  const ymax = Math.max(1, ...years.map((t) => t?.total_value ?? 0))
  const span = years.map((t, i) => (t?.contract_count ? Y0 + i : null)).filter((y): y is number => y != null)

  const cite = async () => {
    const s = en
      ? `${name}: risk indicator ${risk?.toFixed(2) ?? '—'}${lvl ? ` (${LVL[lvl]})` : ''}, ARIA priority ${v.ips_final.toFixed(2)} (tier ${v.ips_tier}); ${formatNumber(v.total_contracts)} contracts worth ${formatCompactMXN(v.total_value_mxn)}. An indicator is not proof.`
      : `${name}: indicador de riesgo ${risk?.toFixed(2) ?? '—'}${lvl ? ` (${LVL[lvl]})` : ''}, prioridad ARIA ${v.ips_final.toFixed(2)} (nivel ${v.ips_tier}); ${formatNumber(v.total_contracts)} contratos por ${formatCompactMXN(v.total_value_mxn)}. Un indicador no es prueba.`
    try { await navigator.clipboard.writeText(`${s} RUBLI · ${L('Focos Rojos', 'Red Flags')}. ${window.location.origin}/vendors/${id}`) } catch { /* clipboard blocked */ }
    setCopied(true)
    window.clearTimeout(copyT.current)
    copyT.current = window.setTimeout(() => setCopied(false), 2000)
  }

  const exitTo = () => {
    const r = cardRect(id)
    if (!r) return { opacity: 0, scale: 0.96, transition: { duration: 0.18 } }
    const w = panel.current?.offsetWidth ?? 1
    return {
      opacity: 0, x: r.left + r.width / 2 - window.innerWidth / 2, y: r.top + r.height / 2 - window.innerHeight / 2, scale: Math.max(0.08, r.width / w),
      transition: { duration: 0.24, ease: [0.4, 0, 1, 1] as const, opacity: { duration: 0.2, delay: 0.06 } },
    }
  }

  const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } } }

  return createPortal(
    <div className="rx-root">
      <motion.div className="rx-scrim" onClick={onClose} aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.28 }} />
      <motion.div
        ref={panel}
        className="rx-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-h"
        tabIndex={-1}
        initial={{ ...from, opacity: 0 }}
        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        exit={exitTo()}
        transition={{ duration: 0.42, ease: EASE, opacity: { duration: 0.16 } }}
      >
        <div className="rx-bar">
          <span className="rx-kick">{L('Rayos X', 'X-ray')}</span>
          <span className="rx-pos">{index + 1} {L('de', 'of')} {formatNumber(total)}{nextName ? <span className="rx-next"> · {L('sigue', 'next')}: {nextName}</span> : null}</span>
          <span className="rx-keys" aria-hidden="true">← → {L('recorre', 'walk')} · Esc {L('cierra', 'close')}</span>
          <span className="rx-nav">
            <button type="button" className="ct-btn rx-step" onClick={() => go(-1)} disabled={!onPrev} title={prevName ?? undefined} aria-keyshortcuts="ArrowLeft"
              aria-label={prevName ? L(`Anterior: ${prevName} (←)`, `Previous: ${prevName} (←)`) : L('Anterior (←)', 'Previous (←)')}>
              <ChevronLeft size={18} aria-hidden="true" /><span>{L('Anterior', 'Previous')}</span>
            </button>
            <button type="button" className="ct-btn rx-step" onClick={() => go(1)} disabled={!onNext} title={nextName ?? undefined} aria-keyshortcuts="ArrowRight"
              aria-label={nextName ? L(`Siguiente: ${nextName} (→)`, `Next: ${nextName} (→)`) : L('Siguiente (→)', 'Next (→)')}>
              <span>{L('Siguiente', 'Next')}</span><ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="ct-btn" onClick={onClose} aria-keyshortcuts="Escape" aria-label={L('Cerrar (Esc)', 'Close (Esc)')}><X size={18} aria-hidden="true" /></button>
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={id}
            className="rx-body"
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 32 }),
              show: { opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE, staggerChildren: 0.05, delayChildren: 0.06 } },
              leave: (d: number) => ({ opacity: 0, x: d * -32, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }),
            }}
            initial="enter"
            animate="show"
            exit="leave"
          >
            <motion.header className="rx-head" variants={item}>
              <h2 id="rx-h" className="rx-name">
                <EntityIdentityChip type="vendor" id={id} name={v.vendor_name} variant="name" fullName hideIcon className="text-text-primary hover:underline underline-offset-2" />
              </h2>
              <p className="rx-sub">
                {v.primary_sector_name && <>{(en ? getSectorNameEN : getSectorNameES)(v.primary_sector_name)} · </>}
                {span.length ? `${span[0]}–${span[span.length - 1]}` : v.years_active ? `${v.years_active} ${L('años', 'years')}` : ''}
                {v.primary_pattern && <> · {v.primary_pattern} {patternName(v.primary_pattern, lang)}</>}
              </p>
            </motion.header>

            <div className="rx-grid">
              <motion.figure className="rx-ros" variants={item}>
                <Rosette list={list} size={phone ? 280 : short ? 290 : 340} labels beat={id} ms={900} delay={180} />
                <figcaption>
                  {L(`Sus ${list.length} contratos más grandes · ángulo = año · radio = monto · ● adjudicación directa · color = indicador`,
                    `Its ${list.length} largest contracts · angle = year · radius = amount · ● direct award · colour = indicator`)}
                </figcaption>
              </motion.figure>

              <div className="rx-main">
                <motion.dl className="rx-figs" variants={item}>
                  <div className="rx-cifra">
                    <dt>{L('Indicador de riesgo', 'Risk indicator')}</dt>
                    <dd>
                      <b style={{ color: lvl && lvl !== 'low' ? RISK_TEXT_COLORS[lvl] : undefined }}>{risk != null ? <CountUp to={risk} fmt={f2} className="" ms={650} delay={120} /> : '—'}</b>
                      {lvl && <span className={lvl === 'low' ? 'text-text-muted' : undefined} style={{ color: lvl !== 'low' ? RISK_TEXT_COLORS[lvl] : undefined }}>{LVL[lvl]}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>{L('Prioridad ARIA', 'ARIA priority')}</dt>
                    <dd>{NUM(v.ips_final, f2)}<span>{L('nivel', 'tier')} {v.ips_tier}</span></dd>
                  </div>
                  <div>
                    <dt>{L('Contratos', 'Contracts')}</dt>
                    <dd>{NUM(v.total_contracts, fN)}</dd>
                  </div>
                  <div>
                    <dt>{L('Monto 2002–2026', 'Amount 2002–2026')}</dt>
                    <dd>{NUM(v.total_value_mxn, formatDualCurrency, 'is-money')}</dd>
                  </div>
                  <div>
                    <dt>{L('Adjudicación directa', 'Direct award')}</dt>
                    <dd>{v.direct_award_rate != null ? NUM(v.direct_award_rate, fPct) : <b>—</b>}</dd>
                  </div>
                  <div>
                    <dt>{L('Un solo adjudicado', 'Single award')}</dt>
                    <dd>{v.single_bid_rate != null ? NUM(v.single_bid_rate, fPct) : <b>—</b>}</dd>
                  </div>
                </motion.dl>

                <motion.section className="rx-sig" variants={item} aria-label={L('Qué lo marcó', 'What flagged it')}>
                  <IpsLedger item={v} lang={lang} sentence={false} />
                  <PatternList confidences={v.pattern_confidences} lang={lang} />
                </motion.section>

                <motion.section className="rx-years" variants={item} aria-label={L('Años activos', 'Years active')}>
                  <h3 className="rx-h3">{L('Monto por año · color = indicador medio', 'Amount by year · colour = mean indicator')}</h3>
                  <div className="rx-strip">
                    {years.map((t, i) => (
                      <span key={i} title={t ? `${Y0 + i}: ${formatCompactMXN(t.total_value)} · ${formatNumber(t.contract_count)} ${L('contratos', 'contracts')}` : `${Y0 + i}`}>
                        {t && t.total_value > 0 && (
                          <motion.i
                            style={{ height: `${Math.max(6, Math.sqrt(t.total_value / ymax) * 100)}%`, background: t.avg_risk_score != null && getRiskLevelFromScore(t.avg_risk_score) !== 'low' ? riskRamp(t.avg_risk_score) : RISK_COLORS.low }}
                            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.4, ease: EASE, delay: 0.25 + i * 0.015 }}
                          />
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="rx-axis"><span>{Y0}</span><span>{Y0 + Math.floor(YEARS / 2)}</span><span>{DATA_LAST_YEAR}</span></div>
                </motion.section>
              </div>
            </div>

            <div className="rx-lists">
              <motion.section variants={item} aria-label={L('Compradores principales', 'Top buyers')}>
                <h3 className="rx-h3">{L('Quién le compra', 'Who buys from it')}</h3>
                <ol className="rx-ol">
                  {(inst.data?.data ?? []).map((r, i) => (
                    <li key={r.institution_id}>
                      <span className="rx-no">{rankNo(i + 1)}</span>
                      <EntityIdentityChip type="institution" id={r.institution_id} name={r.institution_name} variant="name" size="inherit" fullName hideIcon />
                      <span className="rx-n">{formatCompactMXN(r.total_value_mxn)} · {pct(v.total_value_mxn ? r.total_value_mxn / v.total_value_mxn : null)}</span>
                    </li>
                  ))}
                  {inst.isLoading && <li className="rx-wait">{L('Cargando…', 'Loading…')}</li>}
                </ol>
              </motion.section>
              <motion.section variants={item} aria-label={L('Contratos más grandes', 'Largest contracts')}>
                <h3 className="rx-h3">{L('Sus contratos más grandes', 'Its largest contracts')}</h3>
                <ol className="rx-ol">
                  {(big.data?.data ?? []).map((c, i) => (
                    <li key={c.id}>
                      <span className="rx-no">{rankNo(i + 1)}</span>
                      <Link to={`/contracts/${c.id}`} className="rx-ct" title={c.title ?? undefined}>{c.title || c.contract_number || `#${c.id}`}</Link>
                      <span className="rx-n">
                        {formatCompactMXN(c.amount_mxn)} · {c.contract_year ?? '—'}{c.is_direct_award ? <span title={L('adjudicación directa', 'direct award')}> · ●</span> : null}
                        {c.risk_score != null && <> · <span style={{ color: getRiskLevelFromScore(c.risk_score) !== 'low' ? RISK_TEXT_COLORS[getRiskLevelFromScore(c.risk_score)] : undefined }}>{c.risk_score.toFixed(2)}</span></>}
                      </span>
                    </li>
                  ))}
                  {big.isLoading && <li className="rx-wait">{L('Cargando…', 'Loading…')}</li>}
                </ol>
              </motion.section>
            </div>

            <motion.footer className="rx-foot" variants={item}>
              <p className="rx-case">
                {v.gt_case_name
                  ? <><b>{L('Caso documentado', 'Documented case')}:</b> {v.gt_case_name}</>
                  : v.in_ground_truth ? <b>{L('En un caso documentado', 'In a documented case')}</b>
                    : <>{L('Sin caso público', 'No public case')}</>}
                {v.is_efos_definitivo && <> · {L('EFOS definitivo (SAT)', 'SAT EFOS definitive')}</>}
                {v.is_sfp_sanctioned && <> · {L('sancionado por la SFP', 'SFP-sanctioned')}</>}
                {v.web_evidence_verdict && v.web_evidence_verdict !== 'NEGATIVE' && <> · {L('prensa', 'press')}: {VERDICT_LABEL[v.web_evidence_verdict]?.[lang]}</>}
                {v.post_blackout_mxn ? <> · {L('desde el 28 sep 2025', 'since 28 Sep 2025')}: {formatCompactMXN(v.post_blackout_mxn)}</> : null}
                {' · '}{L('un indicador no es prueba', 'an indicator is not proof')}
              </p>
              <div className="rx-acts">
                <Link to={`/aria/caso/${id}`} className="ct-btn is-ink">{L('Abrir el caso', 'Open the case')}</Link>
                <Link to={`/aria?vista=lista&vendor=${id}&open=${id}`} className="ct-btn">{L('Ver en la lista', 'See in the list')}</Link>
                <button type="button" className="ct-btn" onClick={() => void cite()}>{L('Citar', 'Cite')}</button>
                <span className="rx-copied" role="status">{copied ? L('Copiado: la frase y el enlace', 'Copied: the sentence and the link') : ''}</span>
              </div>
            </motion.footer>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body,
  )
}

export default RayosX
