/**
 * TamizTiempo — /institutions «El Tamiz en el tiempo» (owner decision
 * 2026-10-16, concept A + B simplified as the click layer).
 *
 * One dot = one institution, rows = its level of government (federal · estatal · municipal), x = its v3 grade measured with
 * only that sexenio's contracts (GET /scorecards/institutions/sexenios). Each
 * dot keeps its row; ▶ plays Fox → Sheinbaum → 2002–2025 and every dot travels
 * on x, drawing a trail coloured by the term it entered (DotField `underlay`).
 * Depth: L0 dots fall into their rows once per session (600 ms) and then hold
 * still — ▶ is the reader's to press (owner 2026-10-28: «it just starts moving
 * so much») · L1 hover dot ⇄
 * trail ⇄ register row · L2 click docks the plain-words card (InstCard), and
 * «Comparar» docks a second · L3 card → dossier / its riskiest category ·
 * L4 scrubber (drag, ← →) and «por calificación ⇄ por dinero» · L5 URL
 * ?sexenio=&lente=&inst=&vs=.
 *
 * Honesty: before 2011 there is no direct-award flag, so Fox and early Calderón
 * cannot measure competition — their dots fade and the plate says why;
 * Sheinbaum's window is partial (to 2025-09-27).
 */
import { startTransition, useCallback, type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { scorecardApi } from '@/api/client'
import { DotField, type Inks } from '@/components/charts/DotField'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { TIER_STYLES, gradeToTierKey, gradeOutOf10, gradeWord } from '@/lib/tiers'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { DATA_CUT_YEAR } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { useIsMobile } from '@/hooks/useIsMobile'
import { layoutField, scoreToX, type BandSpec, type FieldModel, type Geometry, type Layout } from '@/lib/institutions/field'
import {
  activeAt, biggestAt, decodeTiempo, deltaAt, gradeAt, moversAt, mxnAt, scoreAt, stopStats, winColor, winName, TOTAL_STOP,
} from '@/lib/institutions/tiempo'
import { InstCard } from './InstCard'

const ENTER_KEY = 'rubli_tiempo_played_v1'
const STOPS = [0, 1, 2, 3, 4, TOTAL_STOP]
const HOLD_MS = 1500
const PLAY_MS = 950
const STEP_MS = 620
// rows = level of government (owner 2026-10-28: «rows by level of government, federal state municipal»)
const LEVEL_ORDER = ['federal', 'state', 'municipal']
const LEVEL_LABEL: Record<string, [string, string]> = { federal: ['Federal', 'Federal'], state: ['Estatal', 'State'], municipal: ['Municipal', 'Municipal'] }
const RAIL = '__rail'

type Lens = 'calif' | 'dinero'

/** Shared with InstitutionLeague, which starts it beside the field query and mounts this plate once it
 *  lands, so the first paint is the final one (launch re-audit S3: CLS 0.15 / 0.19 on /institutions). */
export const sexeniosQuery = { queryKey: ['institution-sexenios'], queryFn: () => scorecardApi.getInstitutionSexenios(), staleTime: 3_600_000 }

export function TamizTiempo({ model, lang }: { model: FieldModel; lang: string }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const insts = model.insts
  const N = insts.length
  const reduced = !!useReducedMotion()
  const [sp, setSp] = useSearchParams()
  const q = useQuery(sexeniosQuery)
  const t = useMemo(() => (q.data ? decodeTiempo(q.data, insts) : null), [q.data, insts])
  const keys = useMemo(() => t?.wins.map((w) => w.key) ?? [], [t])

  // ── URL state (L5) ──────────────────────────────────────────────────────────
  const patch = useCallback((u: Record<string, string | null>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(u)) { if (v == null) next.delete(k); else next.set(k, v) }
    setSp(next, { replace: true, preventScrollReset: true })
  }, [sp, setSp])
  const urlStop = (() => {
    const s = sp.get('sexenio')
    const i = s ? keys.indexOf(s) : -1
    return i >= 0 ? i : TOTAL_STOP
  })()
  const lens: Lens = sp.get('lente') === 'dinero' ? 'dinero' : 'calif'
  const idxById = useMemo(() => new Map(insts.map((d, k) => [d.id, k])), [insts])
  const pinned = idxById.get(Number(sp.get('inst'))) ?? null
  const vs = pinned != null ? idxById.get(Number(sp.get('vs'))) ?? null : null
  const [picking, setPicking] = useState(false)

  // ── Play (L4) ───────────────────────────────────────────────────────────────
  // First paint = the URL's term (2002–2025 by default), still. The only motion
  // nobody asked for is the once-per-session entrance; the play waits for ▶.
  const [firstVisit] = useState(() => {
    if (sp.get('sexenio') || sp.get('inst')) return false
    try { return sessionStorage.getItem(ENTER_KEY) == null } catch { return false }
  })
  // The URL owns the term; a running play owns it only while it runs. (A local copy synced in an
  // effect painted 2002–2025 first and then flew every dot to a linked ?sexenio= on open.)
  const [playing, setPlaying] = useState(false)
  const [playStop, setPlayStop] = useState(0)
  const stop = playing ? playStop : urlStop
  // One commit for both: the router applies URL changes in a transition, so an urgent
  // setPlaying(false) alone painted the stale term for ~300 ms (dots flew away and back).
  const goStop = useCallback((s: number) => {
    startTransition(() => {
      setPlaying(false)
      patch({ sexenio: s >= TOTAL_STOP ? null : keys[s] })
    })
  }, [keys, patch])
  useEffect(() => {
    if (!t || !firstVisit) return
    try { sessionStorage.setItem(ENTER_KEY, '1') } catch { /* storage unavailable */ }
  }, [t, firstVisit])
  useEffect(() => {
    if (!playing) return
    if (playStop >= TOTAL_STOP) { goStop(TOTAL_STOP); return }
    const id = window.setTimeout(() => setPlayStop((s) => s + 1), HOLD_MS)
    return () => window.clearTimeout(id)
  }, [playing, playStop, goStop])
  const togglePlay = () => {
    if (playing) { goStop(playStop); return }
    setPlayStop(stop >= TOTAL_STOP ? 0 : stop)
    setPlaying(true)
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // measure before the first paint: a 0 width painted a 280 px field, then re-laid it (CLS)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mobile = useIsMobile(639)
  const stacked = useIsMobile(1099)
  const comparing = pinned != null && (picking || vs != null)
  const dockW = stacked ? 0 : comparing ? 620 : 340
  const fieldW = Math.max(280, width - (dockW ? dockW + 24 : 0))
  // A new width (scrollbar arriving on load, a resize, the dock widening for «Comparar») re-lays the
  // field: snap it, never tween 2,000 dots for a geometry change the reader did not make.
  const lastW = useRef(fieldW)
  const resized = lastW.current !== fieldW
  useEffect(() => { lastW.current = fieldW }, [fieldW])
  // maxColK: every type row shares one short height (owner 2026-10-26: ragged bands read as sloppy);
  // tall piles squeeze in place (x stays true) instead of stretching their row.
  const geom: Geometry = useMemo(() => {
    const ax = { xMin: model.xMin, xMax: model.xMax }
    if (mobile) return { width: fieldW, plotX0: 8, plotW: fieldW - 16, ...ax, r: 2, gap: 0.4, labelH: 18, axisH: 4, railH: 14, minRowH: 16, maxH: 470, maxStack: 5, maxColK: 5 }
    const labelW = 176
    return { width: fieldW, plotX0: labelW, plotW: Math.max(200, fieldW - labelW - 8), ...ax, r: 3.1, gap: 0.6, labelH: 0, axisH: 4, railH: 20, minRowH: 50, maxH: 760, maxStack: 10, maxColK: 10 }  // 3 level rows (not 5 types): taller piles keep the field level with the dock
  }, [fieldW, mobile, model.xMin, model.xMax])

  const families = useMemo(() => {
    const by = new Map<string, number[]>()
    insts.forEach((d, k) => { const f = d.level ?? 'federal'; by.set(f, [...(by.get(f) ?? []), k]) })
    return [...by].sort((a, b) => LEVEL_ORDER.indexOf(a[0]) - LEVEL_ORDER.indexOf(b[0])).map(([key, members]) => ({ key, members }))
  }, [insts])
  const overall = useMemo(() => Float32Array.from(insts, (d) => d.total_score), [insts])
  const specs: BandSpec[] = useMemo(() => [...families.map((f) => ({ key: f.key, members: f.members })), { key: RAIL, members: [], rail: true }], [families])
  const base = useMemo(() => (width > 0 ? layoutField(overall, specs, geom) : null), [overall, specs, geom, width])
  const railBand = base?.bands.find((b) => b.key === RAIL)

  // Pesos → radius (money lens): windows share one scale so play compares terms; 2002–25 has its own.
  const vMax = useMemo(() => {
    if (!t) return { win: 1, total: 1 }
    let win = 1
    for (const arr of t.mxn) for (const v of arr) if (v > win) win = v
    return { win, total: Math.max(1, ...insts.map((d) => d.total_amount_mxn)) }
  }, [t, insts])
  const rMax = mobile ? 13 : 24

  const coverageAlpha = (s: number) => {
    if (!t || s >= TOTAL_STOP) return 1
    const c = t.wins[s].coverage
    return c === 'weak' ? 0.42 : c === 'mixed' ? 0.72 : 1
  }
  const layout: Layout | null = useMemo(() => {
    if (!base || !t || !railBand) return null
    const x = new Float32Array(N), y = new Float32Array(N), r = new Float32Array(N), a = new Float32Array(N)
    const fade = coverageAlpha(stop)
    for (let k = 0; k < N; k++) {
      const sc = scoreAt(t, insts, stop, k)
      if (Number.isNaN(sc)) {
        x[k] = scoreToX(insts[k].total_score, geom); y[k] = railBand.mid; r[k] = Math.max(1, base.dotR * 0.5); a[k] = 0.3
        continue
      }
      x[k] = scoreToX(sc, geom)
      y[k] = base.y[k]
      r[k] = lens === 'dinero'
        ? Math.max(1.2, rMax * Math.sqrt(mxnAt(t, insts, stop, k) / (stop >= TOTAL_STOP ? vMax.total : vMax.win)))
        : base.r[k]
      a[k] = fade
    }
    return { ...base, x, y, r, a }
  }, [base, t, railBand, stop, lens, geom, insts, N, vMax, rMax]) // eslint-disable-line react-hooks/exhaustive-deps

  const fills = useMemo(() => insts.map((_, k) => {
    const g = t ? gradeAt(t, insts, stop, k) : null
    return g ? TIER_STYLES[gradeToTierKey(g)].color : null
  }), [t, insts, stop])
  const hollow = useMemo(() => (layout && lens === 'dinero' ? Array.from(layout.r, (r) => r > 4.5) : insts.map(() => false)), [layout, lens, insts])

  // ── Hover (L1) ──────────────────────────────────────────────────────────────
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [rowHover, setRowHover] = useState<number | null>(null)
  const hot = hover?.i ?? rowHover
  const focusSet = useMemo(() => (pinned != null ? new Set([pinned, ...(vs != null ? [vs] : [])]) : null), [pinned, vs])

  // Per-window x for the trails (NaN = ungraded), in the current geometry.
  const wx = useMemo(() => (t ? t.score.map((arr) => Float32Array.from(arr, (s) => (Number.isNaN(s) ? NaN : scoreToX(s, geom)))) : []), [t, geom])
  const winInks = useMemo(() => keys.map(winColor), [keys])
  const underlay = useCallback((ctx: CanvasRenderingContext2D, S: { x: Float32Array; y: Float32Array; a: Float32Array }, inks: Inks) => {
    if (!t || !wx.length || stop === 0) return
    const last = Math.min(stop, TOTAL_STOP - 1)
    const trail = (k: number, w: number) => {
      // Segment that ENDS at window w for dot k: from its previous graded window.
      const end = w === stop ? S.x[k] : wx[w][k]
      if (Number.isNaN(end) || (w === stop && !activeAt(t, insts, stop, k))) return null
      for (let p = Math.min(w, TOTAL_STOP) - 1; p >= 0; p--) if (!Number.isNaN(wx[p][k])) return [wx[p][k], end]
      return null
    }
    const draw = (members: Iterable<number>, lw: number, alpha: number) => {
      ctx.lineWidth = lw
      for (let w = 1; w <= last; w++) {
        ctx.strokeStyle = winInks[w]
        ctx.globalAlpha = alpha
        ctx.beginPath()
        for (const k of members) {
          if (stop < TOTAL_STOP && !activeAt(t, insts, stop, k)) continue
          const seg = trail(k, w)
          if (!seg) continue
          ctx.moveTo(seg[0], S.y[k]); ctx.lineTo(seg[1], S.y[k])
        }
        ctx.stroke()
      }
      if (stop === TOTAL_STOP) {
        // The last leg: from the last graded term to the 2002–2025 grade.
        ctx.strokeStyle = inks.muted
        ctx.globalAlpha = alpha * 0.8
        ctx.beginPath()
        for (const k of members) {
          for (let p = TOTAL_STOP - 1; p >= 0; p--) {
            if (Number.isNaN(wx[p][k])) continue
            ctx.moveTo(wx[p][k], S.y[k]); ctx.lineTo(S.x[k], S.y[k])
            break
          }
        }
        ctx.stroke()
      }
    }
    const dimAll = focusSet != null
    draw(Array.from({ length: N }, (_, k) => k), 1, dimAll ? 0.08 : 0.26)
    const hi = [...(focusSet ?? []), ...(hot != null ? [hot] : [])]
    if (hi.length) {
      draw(hi, 2.5, 1)
      for (const k of hi) {
        for (let w = 0; w <= last; w++) {
          const x = w === stop ? NaN : wx[w][k]
          if (Number.isNaN(x)) continue
          ctx.globalAlpha = 1
          ctx.fillStyle = winInks[w]
          ctx.beginPath(); ctx.arc(x, S.y[k], 3.2, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
  }, [t, wx, stop, insts, N, winInks, focusSet, hot])

  const backdrop = useCallback((ctx: CanvasRenderingContext2D, h: number, inks: Inks) => {
    if (!base) return
    const g = { plotX0: geom.plotX0, plotW: geom.plotW, xMin: geom.xMin, xMax: geom.xMax }
    base.bands.forEach((b, i) => {
      if (b.rail || i % 2) return
      ctx.globalAlpha = 0.035; ctx.fillStyle = inks.muted
      ctx.fillRect(0, b.y0, geom.plotX0 + geom.plotW, b.h)
    })
    const xDef = scoreToX(model.deficientBelow, g)
    ctx.globalAlpha = 0.05; ctx.fillStyle = inks.crit
    ctx.fillRect(geom.plotX0, 0, xDef - geom.plotX0, h)
    for (const s of model.lines) {
      const gx = Math.round(scoreToX(s, g)) + 0.5
      ctx.globalAlpha = s === model.deficientBelow ? 0.9 : 0.55
      ctx.strokeStyle = s === model.deficientBelow ? inks.crit : inks.border
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke()
    }
  }, [base, geom, model.deficientBelow, model.lines])

  // ── Picking (L2) ────────────────────────────────────────────────────────────
  // Where the reader clicked (viewport px): the card docks out of that point (shared-element feel).
  const pickFrom = useRef<{ x: number; y: number } | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const pick = (k: number | null, from?: { x: number; y: number }) => startTransition(() => {
    setPlaying(false)
    if (k == null) { if (!comparing) patch({ inst: null, vs: null, sexenio: stop >= TOTAL_STOP ? null : keys[stop] }); return }
    const pr = plotRef.current?.getBoundingClientRect()
    pickFrom.current = from ?? (pr && layout ? { x: pr.left + layout.x[k], y: pr.top + layout.y[k] } : null)
    if (comparing && pinned != null) { if (k !== pinned) { setPicking(false); patch({ vs: String(insts[k].id), sexenio: stop >= TOTAL_STOP ? null : keys[stop] }) } return }
    patch({ inst: String(insts[k].id), vs: null, sexenio: stop >= TOTAL_STOP ? null : keys[stop] })
  })
  const centre = (e: MouseEvent<HTMLElement>) => { const b = e.currentTarget.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }
  useEffect(() => { if (pinned == null) setPicking(false) }, [pinned])
  // The card docks out of the clicked dot: origin at the dot (clamped to the card), 16 px of travel
  // from its side, 240 ms --ease-out (DESIGN §7: popovers scale from their trigger). Only after a
  // reader's pick — a pasted ?inst= link paints the card still and never scrolls the page on open.
  const dockRef = useRef<HTMLElement>(null)
  const dockedKey = `${pinned ?? ''}:${vs ?? ''}`
  const closedId = useRef<number | null>(null)  // focus goes back to that row's «→» (or the list head) on close
  useLayoutEffect(() => {
    if (closedId.current != null) {
      const dock = dockRef.current
      // the second card closed → the first; the only card closed → its row's «→» or the list head
      const back = pinned != null ? dock?.querySelector<HTMLElement>('.tm-card')
        : dock?.querySelector<HTMLElement>(`.tm-open[data-id="${closedId.current}"]`) ?? dock?.querySelector<HTMLElement>('#tm-reg-h')
      back?.focus({ preventScroll: true })
    }
    closedId.current = null
    const from = pickFrom.current
    pickFrom.current = null
    if (!from || pinned == null) return
    const cards = dockRef.current?.querySelectorAll<HTMLElement>('.tm-card')
    const card = cards?.[vs != null ? 1 : 0]
    if (!card) return
    if (stacked) card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
    const r = card.getBoundingClientRect()
    const ox = Math.max(0, Math.min(r.width, from.x - r.left))
    const oy = Math.max(0, Math.min(r.height, from.y - r.top))
    const dx = from.x - (r.left + ox), dy = from.y - (r.top + oy)
    const d = Math.hypot(dx, dy) || 1
    card.focus({ preventScroll: true })  // the register that held the clicked «→» just unmounted
    card.style.transformOrigin = `${ox}px ${oy}px`
    card.animate(reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translate(${(dx / d) * 16}px, ${(dy / d) * 16}px) scale(.96)` }, { opacity: 1, transform: 'none' }],
    { duration: reduced ? 120 : 240, easing: 'cubic-bezier(.23,1,.32,1)' })
  }, [dockedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keys: ← → walk the terms, Esc closes the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (e.key === 'Escape') {
        if (comparing) { if (vs != null) closedId.current = insts[vs].id; setPicking(false); patch({ vs: null }) } else if (pinned != null) { closedId.current = insts[pinned].id; patch({ inst: null }) }
        return
      }
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return
      if (!el?.closest('.tm')) return
      e.preventDefault()
      goStop(Math.max(0, Math.min(TOTAL_STOP, stop + (e.key === 'ArrowLeft' ? -1 : 1))))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comparing, pinned, patch, goStop, stop])

  // Scrubber drag (L4): pointer down + move snap to the nearest stop.
  const scrubRef = useRef<HTMLOListElement>(null)
  const dragging = useRef(false)
  const stopFromX = (clientX: number) => {
    const el = scrubRef.current
    if (!el) return stop
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(TOTAL_STOP, Math.floor(((clientX - r.left) / r.width) * STOPS.length)))
  }

  // ── Copy (computed) ───────────────────────────────────────────────────────
  const all = useMemo(() => insts.map((_, k) => k), [insts])
  const stats = useMemo(() => (t ? stopStats(t, insts, stop, all) : null), [t, insts, stop, all])
  const rowStats = useMemo(() => (t ? families.map((f) => stopStats(t, insts, stop, f.members)) : []), [t, families, insts, stop])
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const stopName = (s: number) => (s >= TOTAL_STOP ? L('2002–2025', '2002–2025') : winName(keys[s] ?? 'fox'))
  const span = (s: number) => {
    if (!t || s >= TOTAL_STOP) return L('ene 2002 – sep 2025', 'Jan 2002 – Sep 2025')
    const w = t.wins[s]
    return `${w.start.slice(0, 7)} – ${w.end.slice(0, 7)}`
  }
  const headline = !stats ? L('Cada institución, sexenio por sexenio.', 'Every institution, term by term.')
    : lens === 'dinero'
      ? stop >= TOTAL_STOP
        ? L(`De 2002 a ${DATA_CUT_YEAR}, ${pct(stats.defVal, stats.val)}% de los pesos pasó por instituciones reprobadas (calificación 2002–2025, menos de 6 de 10): ${formatCompactMXN(stats.defVal)}.`,
          `From 2002 to ${DATA_CUT_YEAR}, ${pct(stats.defVal, stats.val)}% of the pesos went through failing institutions (graded on 2002–2025, under 6 out of 10): ${formatCompactMXN(stats.defVal)}.`)
        : L(`Con ${stopName(stop)}, ${pct(stats.defVal, stats.val)}% de los pesos pasó por instituciones reprobadas (menos de 6 de 10): ${formatCompactMXN(stats.defVal)}.`,
          `Under ${stopName(stop)}, ${pct(stats.defVal, stats.val)}% of the pesos went through failing institutions (under 6 out of 10): ${formatCompactMXN(stats.defVal)}.`)
      : stop >= TOTAL_STOP
        ? L(`De 2002 a 2025, ${formatNumber(stats.def)} de ${formatNumber(stats.active)} instituciones reprueban (menos de 6 de 10; ${pct(stats.def, stats.active)}%).`,
          `From 2002 to 2025, ${formatNumber(stats.def)} of ${formatNumber(stats.active)} institutions fail (under 6 out of 10; ${pct(stats.def, stats.active)}%).`)
        : L(`Con ${stopName(stop)}, ${formatNumber(stats.def)} de ${formatNumber(stats.active)} instituciones calificadas reprueban (menos de 6 de 10; ${pct(stats.def, stats.active)}%).`,
          `Under ${stopName(stop)}, ${formatNumber(stats.def)} of ${formatNumber(stats.active)} graded institutions fail (under 6 out of 10; ${pct(stats.def, stats.active)}%).`)
  const caveat = !t ? null : stop >= TOTAL_STOP ? null
    : t.wins[stop].coverage === 'weak' ? L('Antes de 2011 no hay marca de adjudicación directa: la competencia no se mide y la calificación sale alta. Puntos atenuados.', 'Before 2011 there is no direct-award flag: competition is not measured and the grade reads high. Dots faded.')
      : t.wins[stop].coverage === 'mixed' ? L('Sin marca de adjudicación directa hasta 2010: la competencia sólo se mide en 2011–2012. Puntos atenuados.', 'No direct-award flag until 2010: competition is measured only in 2011–2012. Dots faded.')
        : t.wins[stop].coverage === 'partial' ? L('Ventana parcial: octubre de 2024 al 27 de septiembre de 2025.', 'Partial window: October 2024 to 27 September 2025.')
          : null

  // Movers labelled on the plate: the 3 largest |Δ| among federal buyers with siglas and ≥ 1,000 MDP in the term.
  const movers = useMemo(() => (t && stop > 0 && stop < TOTAL_STOP ? moversAt(t, insts, stop, 12, 1e9).filter((k) => insts[k].siglas && insts[k].level === 'federal').slice(0, mobile ? 0 : 3) : []), [t, insts, stop, mobile])
  const register = useMemo(() => (t ? biggestAt(t, insts, stop, stacked ? 6 : 7) : []), [t, insts, stop, stacked])
  const hoverInst = hover ? insts[hover.i] : null

  const seals = (k: number) => STOPS.map((s) => {
    const gl = t ? gradeAt(t, insts, s, k) : null
    return <i key={s} className={s === stop ? 'is-on' : undefined} style={{ color: gl ? TIER_STYLES[gradeToTierKey(gl)].ink : undefined }} title={stopName(s)}>{gl ? gradeOutOf10(scoreAt(t!, insts, s, k)) : '·'}</i>
  })

  if (q.isError) return <p role="alert" className="ct-note">{L('Las calificaciones por sexenio no cargaron. Recargue la página.', 'The per-term grades did not load. Reload the page.')}</p>

  return (
    <div className="tm" ref={wrapRef} style={{
      ['--tier-def' as string]: TIER_STYLES.Deficiente.color, ['--tier-def-ink' as string]: TIER_STYLES.Deficiente.ink, ['--tier-ok' as string]: TIER_STYLES.Satisfactorio.color,
    }}>
      <header className="tm-head">
        <h2 className="tm-h1" aria-live={playing ? 'off' : 'polite'}>{headline}</h2>
        <div className="tm-sub">
          <p className="tm-lede">
            <span><b>{stopName(stop)}</b> {span(stop)}</span>
            {stats && <>
              <span>{formatNumber(stats.active)} {L('calificadas', 'graded')}</span>
              <span><b className="tm-def">{formatNumber(stats.def)}</b> {L('reprobadas', 'failing')}</span>
              <span>{pct(stats.defVal, stats.val)}% {L('de los pesos en reprobadas', 'of pesos in failing institutions')}</span>
            </>}
            <span className="tm-x-note">{L('x = calificación de 0 a 10 con sólo los contratos de ese periodo', 'x = grade out of 10 from that period’s contracts only')}</span>
          </p>
          <div className="tm-lens" role="group" aria-label={L('Lente', 'Lens')}>
            {(['calif', 'dinero'] as Lens[]).map((l) => (
              <button key={l} type="button" aria-pressed={lens === l} onClick={() => patch({ lente: l === 'dinero' ? 'dinero' : null })}>
                {l === 'calif' ? L('Por calificación', 'By grade') : L('Por dinero', 'By money')}
              </button>
            ))}
          </div>
        </div>
        {caveat && <p className="tm-caveat"><i aria-hidden="true" />{caveat}</p>}
      </header>

      <div className={`tm-body${stacked ? ' is-stacked' : ''}`}>
        <div className="tm-field" style={{ width: stacked ? '100%' : fieldW }}>
          <div className="tm-axis" aria-hidden="true" style={{ height: mobile ? 22 : 34 }}>
            {[model.xMin, ...model.lines, model.xMax].map((v) => (
              <span key={v} className={`tm-tick${v === model.deficientBelow ? ' is-def' : ''}`} style={{ left: scoreToX(v, geom), transform: v === model.xMax ? 'translateX(-100%)' : v === model.xMin ? 'none' : undefined }}>{gradeOutOf10(v)}</span>
            ))}
            <span className="tm-letter" style={{ left: scoreToX(60, geom) }}>{L('6 = aprobada', '6 = pass')}</span>
          </div>
          <div className="tm-plot" ref={plotRef}>
            {layout && t ? (
              <DotField
                n={N}
                layout={layout}
                fills={fills}
                hollow={hollow}
                backdrop={backdrop}
                underlay={underlay}
                duration={resized ? 0 : playing ? PLAY_MS : STEP_MS}
                ease={playing ? 'inOut' : 'out'}
                reduced={reduced}
                hoverIdx={hot}
                focusSet={focusSet}
                hitRadius={8}
                onHover={(i, x, y) => setHover(i == null ? null : { i, x, y })}
                onPick={pick}
                ariaLabel={L(`${formatNumber(N)} instituciones por nivel de gobierno; eje horizontal: calificación de 0 a 10 en ${stopName(stop)}; 6 es aprobada.`, `${formatNumber(N)} institutions by level of government; horizontal axis: grade 0 to 10 under ${stopName(stop)}; 6 is a pass.`)}
                enter={firstVisit && !reduced}
                crossfadeBeyond={60}
              />
            ) : <div className="tm-skel" aria-busy="true" />}
            {base && t && base.bands.map((b, i) => {
              if (b.rail) {
                const off = N - (stats?.active ?? 0)
                return <span key={b.key} className="tm-band is-rail" style={{ top: b.y0, height: b.h }}>{L(`sin calificar · ${formatNumber(off)}`, `no grade · ${formatNumber(off)}`)}</span>
              }
              const f = families[i]
              const rs = rowStats[i]
              return (
                <span key={b.key} className="tm-band" style={{ top: b.y0, height: mobile ? undefined : b.h }}>
                  <b>{L(...(LEVEL_LABEL[f.key] ?? [f.key, f.key]))}</b>
                  <span className="ct-mono"><b className="tm-def">{formatNumber(rs.def)}</b> {L('reprobadas', 'failing')} · {L('de', 'of')} {formatNumber(rs.active)}</span>
                  {!mobile && b.h >= 66 && <span className="ct-mono">{L('mediana', 'median')} {Number.isNaN(rs.median) ? '—' : gradeOutOf10(rs.median)}</span>}
                </span>
              )
            })}
            {layout && !playing && movers.filter((k, i) => movers.slice(0, i).every((j) => Math.abs(layout.y[j] - layout.y[k]) > 16 || Math.abs(layout.x[j] - layout.x[k]) > 180)).map((k) => {
              const d = deltaAt(t!, stop, k)
              return (
                <span key={`${stop}-${k}`} className="tm-mover" style={{ left: layout.x[k], top: layout.y[k] }}>
                  {insts[k].siglas} <b>{d > 0 ? '+' : '−'}{gradeOutOf10(Math.abs(d))}</b>
                </span>
              )
            })}
            {hoverInst && t && hover && (
              <div className="tm-tip" style={{ left: Math.min(hover.x + 14, fieldW - 260), top: hover.y + 14 }} role="tooltip">
                <b>{formatEntityName('institution', hoverInst.name, 'full')}</b>
                <span className="tm-tip-seals">{seals(hover.i)}</span>
                <span className="ct-mono">{formatCompactMXN(mxnAt(t, insts, stop, hover.i))} · {stopName(stop)}</span>
              </div>
            )}
          </div>

          <div className="tm-scrub">
            <button type="button" className="tm-play" onClick={togglePlay} aria-label={playing ? L('Pausa', 'Pause') : L('Reproducir los sexenios', 'Play the terms')}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <ol ref={scrubRef} className="tm-stops"
              onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); goStop(stopFromX(e.clientX)) }}
              onPointerMove={(e) => { if (dragging.current) { const s = stopFromX(e.clientX); if (s !== stop) goStop(s) } }}
              onPointerUp={() => { dragging.current = false }}>
              {STOPS.map((s) => {
                const c = s >= TOTAL_STOP ? undefined : winColor(keys[s] ?? 'fox')
                const weak = t && s < TOTAL_STOP && (t.wins[s].coverage === 'weak' || t.wins[s].coverage === 'mixed')
                return (
                  <li key={s}>
                    <button type="button" aria-pressed={stop === s} className={`tm-stop${weak ? ' is-weak' : ''}${s < stop ? ' is-past' : ''}`}
                      style={{ ['--w' as string]: c }} onClick={() => goStop(s)}>
                      <b>{stopName(s)}</b>
                      {!mobile && <small>{s >= TOTAL_STOP ? L('calificación', 'grade') : span(s).replace(/-\d\d/g, '')}{weak ? ` · ${L('sin competencia medida', 'competition unmeasured')}` : ''}</small>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <aside ref={dockRef} className="tm-dock" style={stacked ? undefined : { width: dockW }} aria-label={L('Detalle', 'Detail')}>
          {pinned != null && t ? (
            <div className={`tm-cards${comparing ? ' is-two' : ''}`}>
              <InstCard key={insts[pinned].id} inst={insts[pinned]} k={pinned} t={t} stop={stop} lang={lang}
                onClose={() => { closedId.current = insts[pinned].id; patch({ inst: vs != null ? String(insts[vs].id) : null, vs: null }) }}
                onCompare={() => setPicking(true)} comparing={comparing} />
              {vs != null ? (
                <InstCard key={insts[vs].id} inst={insts[vs]} k={vs} t={t} stop={stop} lang={lang} onClose={() => { closedId.current = insts[vs].id; patch({ vs: null }) }} />
              ) : picking ? (
                <div className="tm-card is-pick">
                  <p className="tm-card-k">{L('Elija la segunda: un punto del campo o una fila de la lista.', 'Pick the second: a dot in the field or a row in the list.')}</p>
                  <ol className="tm-reg is-pick">{register.filter((k) => k !== pinned).slice(0, 6).map((k) => (
                    <li key={k}><button type="button" className="tm-pickrow" onClick={(e) => pick(k, centre(e))} onMouseEnter={() => setRowHover(k)} onMouseLeave={() => setRowHover(null)}>{formatEntityName('institution', insts[k].name, 'full')}</button></li>
                  ))}</ol>
                  <button type="button" className="tm-act" onClick={() => setPicking(false)}>{L('Cancelar', 'Cancel')}</button>
                </div>
              ) : null}
            </div>
          ) : (
            <section aria-labelledby="tm-reg-h">
              <h2 id="tm-reg-h" className="tm-reg-h" tabIndex={-1}>{L('Los que más pesos movieron', 'The biggest buyers')} · {stopName(stop)}</h2>
              <ol className="tm-reg">
                {register.map((k, i) => {
                  const g = t ? gradeAt(t, insts, stop, k) : null
                  const d = t ? deltaAt(t, stop, k) : NaN
                  return (
                    <li key={k} className={hot === k ? 'is-hot' : undefined}
                      onMouseEnter={() => setRowHover(k)} onMouseLeave={() => setRowHover(null)}>
                      <span className="tm-rank ct-mono">{i + 1}</span>
                      <div className="tm-reg-main">
                        <EntityIdentityChip type="institution" id={insts[k].id} name={insts[k].name} variant="name" fullName className="tm-reg-name" />
                        <span className="tm-reg-line ct-mono">
                          <b style={{ color: g ? TIER_STYLES[gradeToTierKey(g)].ink : undefined }}>{t && g ? `${gradeOutOf10(scoreAt(t, insts, stop, k))} · ${gradeWord(scoreAt(t, insts, stop, k), lang === 'en' ? 'en' : 'es')}` : '—'}</b>
                          {' '}· {t ? formatCompactMXN(mxnAt(t, insts, stop, k)) : ''}
                          {!Number.isNaN(d) && <> · {d > 0 ? '+' : '−'}{gradeOutOf10(Math.abs(d))}</>}
                          <span className="tm-mini">{seals(k)}</span>
                        </span>
                      </div>
                      <button type="button" className="tm-open" data-id={insts[k].id} onClick={(e) => pick(k, centre(e))} aria-label={L(`Ver en palabras: ${insts[k].name}`, `Plain words: ${insts[k].name}`)}>→</button>
                    </li>
                  )
                })}
              </ol>
              <p className="tm-hint">{mobile
                ? L('Toque un punto o una fila para leerla en palabras.', 'Tap a dot or a row to read it in plain words.')
                : L('Pase el cursor sobre un renglón o un punto para ver su rastro; haga clic para leerlo en palabras.', 'Hover a row or a dot to see its trail; click to read it in plain words.')}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
