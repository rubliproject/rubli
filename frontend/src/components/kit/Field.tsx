/**
 * Field — the banded dot field, promoted from /categories «El Anaquel» into
 * the kit (KIT_AUDIT.md § 2 + § Grammar). Data-agnostic: it knows rows,
 * bands and axes, never what a category or a vendor is.
 *
 *   one dot = one row (entity) · x = the active axis on a printed scale
 *   y = bands: the top `maxRows` (by sortValue) get rows, the rest fold onto
 *   one faint rail — the denominator never leaves the plate
 *   deterministic quantized dodge beeswarm (lib/field/layout.ts)
 *   lit subset carries the finding (fill in the legend colour, or a ring)
 *   hollow = thin sample · sorts are LAYOUTS of the same dots (DotField tween,
 *   500 ms cubic-out, interruptible, crossfade beyond 240 px) · labels never
 *   slide · hover quadtree → card · click → `onPick` (the caller docks a
 *   <FieldCard>) · reduced motion = final state · sr-only table twin ·
 *   container geometry with the phone fallback (< 640 px).
 *
 * Row order is identity: keep `rows` in the same order across sorts so the
 * same dot tweens (object constancy).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { DotField, type Inks } from '@/components/charts/DotField'
import { layoutField, scoreToX, type BandSpec, type Geometry } from '@/lib/field/layout'
import { DUR } from '@/lib/motion'
import { formatNumber } from '@/lib/utils'
import './kit.css'

export interface FieldRow {
  id: string
  /** Plain-text name (sr table, aria). */
  label: string
  bandId: string
  /** Raw measure per axis key (MXN, counts, 0–1…); null sits at the domain floor. */
  x: Record<string, number | null>
  /** Radius multiplier (1 = the field's dot). */
  size?: number
  hollow?: boolean
  /** Which lit set the row belongs to (a `litLegend` key). */
  lit?: string | null
  /** Base fill for unlit rows (colour or `--token`); default = muted ink. */
  fill?: string | null
  meta?: Record<string, unknown>
}

export interface FieldTick { at: number; label: string; tone?: 'crit'; /** false = hidden on phones */ phone?: boolean }
export interface FieldRule { at: number; tone?: 'crit'; alpha?: number; /** risk wash from this rule to the plot's right edge */ wash?: 'risk' }

export interface FieldAxis {
  key: string
  label: { es: string; en: string }
  scale: 'log10' | 'linear'
  /** In raw units (log10 axes: e.g. [1e7, 1e12]). */
  domain: [number, number]
  ticks: FieldTick[]
  /** Hairlines under the dots, raw units. */
  rules?: FieldRule[]
  /** One-line axis statement for the key («eje: …»). */
  note?: ReactNode
  /** Head over the right readout column. */
  readoutHead?: ReactNode
}

export interface FieldBand {
  id: string
  /** Chip / label; a function gets `mobile` (phone typography). */
  label: ReactNode | ((mobile: boolean) => ReactNode)
  /** Plain-text name for the sr-only table. */
  name: string
  sortValue: number
  /** Right readout (the band aggregate). */
  aggregate?: ReactNode
  /** Defaults to the count of lit rows in the band. */
  litCount?: number
  /** Defaults to the count of rows in the band. */
  n?: number
}

export interface FieldLegendItem { key?: string; label: ReactNode; color?: string; /** 'none' = text only, no swatch */ mark?: 'fill' | 'ring' | 'hollow' | 'none' }

export interface FieldProps {
  rows: FieldRow[]
  bands: FieldBand[]
  axes: FieldAxis[]
  sortKey: string
  /** When given, the field prints its own sort chips. */
  onSortKey?: (key: string) => void
  /** Lit sets: `color` fills the dot, `mark: 'ring'` draws an accent halo and keeps the base fill. */
  litLegend: Array<{ key: string; label: ReactNode; color: string; mark?: 'fill' | 'ring' }>
  /** The active lit set (shown pressed when `onLitKey` makes the legend a toggle). */
  litKey?: string | null
  onLitKey?: (key: string | null) => void
  /** More key entries after the lit sets (tiers, «the rest», hollow). */
  legend?: FieldLegendItem[]
  /** The one computed sentence. */
  finding: string
  hover: (row: FieldRow) => ReactNode
  onPick: (row: FieldRow | null) => void
  picked: string | null
  maxRows?: number
  lang: 'en' | 'es'
  /** Rail label (rows outside the shown bands). */
  railLabel?: ReactNode | ((mobile: boolean) => ReactNode)
  railAggregate?: ReactNode
  /** Plain-text rail name for the sr-only table. */
  railName?: string
  /** Fade every band but this one (an outside register hover). */
  focusBand?: string | null
  /** «x of N {unit} lit» in the readout. */
  unit?: { es: string; en: string }
  table?: { caption: string; band: string; n: string; lit: string; agg: string }
  /** Under the plate (coverage note). */
  footer?: ReactNode
  /** Cap a column's half-height (dot rows); taller piles overlap at their true x. */
  maxColK?: number
  /** Mark hover → the caller (L1: light the twin ledger row). */
  onHoverRow?: (row: FieldRow | null) => void
  /** Ledger hover → ink this row's dot (L1, the other direction). */
  hotId?: string | null
  /** First paint: dots spread from one line into the layout (DotField `enter`). */
  enter?: boolean
  /** false = drop the «x of N lit» line under each aggregate (the caller's band label carries its finding). */
  litLine?: boolean
  /** Phone band-label height (px); 34 fits a two-line label. */
  phoneLabelH?: number
  /** One full-width line right above the plot (e.g. a colour key). */
  keyRow?: ReactNode
  /** Rows still in flight: draw the axis, rules and band names (the final shape, no dots) instead of nothing. */
  loading?: boolean
}

const RAIL = '__rail'
const toColor = (c: string) => (c.startsWith('--') ? `var(${c})` : c)

export function Field({
  rows, bands, axes, sortKey, onSortKey, litLegend, litKey = null, onLitKey, legend = [], finding, hover: hoverCard,
  onPick, picked, maxRows = 12, lang, railLabel, railAggregate, railName, focusBand = null, unit, table, footer, maxColK, enter = false,
  onHoverRow, hotId = null, litLine = true, phoneLabelH = 18, keyRow, loading = false,
}: FieldProps) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const reduced = !!useReducedMotion()
  const axis = axes.find((a) => a.key === sortKey) ?? axes[0]

  // ── Model: bands in order + the rail ─────────────────────────────────────
  const shown = useMemo(
    () => bands.map((b, i) => ({ b, i })).sort((p, q) => q.b.sortValue - p.b.sortValue || p.i - q.i).slice(0, maxRows).map((p) => p.b),
    [bands, maxRows],
  )
  const specs: (BandSpec & { band: FieldBand | null })[] = useMemo(() => {
    const at = new Map(shown.map((b, i) => [b.id, i]))
    const members: number[][] = shown.map(() => [])
    const rest: number[] = []
    rows.forEach((r, k) => {
      const i = at.get(r.bandId)
      if (i == null) rest.push(k)
      else members[i].push(k)
    })
    const out: (BandSpec & { band: FieldBand | null })[] = shown.map((b, i) => ({ key: b.id, members: members[i], band: b }))
    if (rest.length) out.push({ key: RAIL, members: rest, rail: true, band: null })
    return out
  }, [rows, shown])

  const litStyle = useMemo(() => new Map(litLegend.map((l) => [l.key, l])), [litLegend])
  const isLit = (r: FieldRow) => r.lit != null && litStyle.has(r.lit)
  const fills = useMemo(
    () => rows.map((r) => {
      const l = r.lit != null ? litStyle.get(r.lit) : undefined
      return l && l.mark !== 'ring' ? l.color : r.fill ?? null
    }),
    [rows, litStyle],
  )
  const ringed = useMemo(() => rows.map((r) => r.lit != null && litStyle.get(r.lit)?.mark === 'ring'), [rows, litStyle])
  const anyRing = ringed.some(Boolean)
  const hollow = useMemo(() => rows.map((r) => !!r.hollow), [rows])

  const unitOf = useMemo(() => {
    const [a, b] = axis.domain
    if (axis.scale === 'log10') {
      const la = Math.log10(a)
      const lb = Math.log10(b)
      return (v: number) => (Math.log10(Math.max(a, v)) - la) / (lb - la)
    }
    return (v: number) => (v - a) / (b - a)
  }, [axis])
  const scores = useMemo(
    () => Float32Array.from(rows, (r) => {
      const v = r.x[axis.key]
      return v == null ? 0 : Math.min(1, Math.max(0, unitOf(v)))
    }),
    [rows, axis, unitOf],
  )

  // ── Geometry (container-based) ───────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // measured before first paint: an observer-only width left the field 0 px tall for a frame,
  // then it grew and shoved everything below it (CLS 0.29 on /categories)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mobile = width > 0 && width < 640
  const nBands = specs.length
  const geom: Geometry = useMemo(() => {
    const ax = { xMin: 0, xMax: 1 }
    if (mobile) {
      return { width, plotX0: 10, plotW: width - 20, ...ax, r: 1.9, gap: 0.5, labelH: phoneLabelH, axisH: 22, railH: 12, railLabelH: 18, minRowH: 16, maxH: Math.max(1000, nBands * 44), maxStack: 5, maxColK: maxColK ?? 5 }
    }
    // Fluid measure: the label and readout tracks and the dots scale with the field.
    const labelW = Math.round(Math.min(360, Math.max(170, width * 0.18)))
    const readW = Math.round(Math.max(250, width * 0.14))
    const r = Math.min(3.4, Math.max(2.5, width / 520))
    return { width, plotX0: labelW, plotW: Math.max(200, width - labelW - readW), ...ax, r, gap: 0.6, labelH: 0, axisH: 24, railH: 14, minRowH: nBands > 16 ? 30 : 40, maxH: Math.max(720, nBands * (nBands > 16 ? 36 : 46)), maxStack: 6, maxColK: maxColK ?? 6 }
  }, [width, mobile, nBands, maxColK, phoneLabelH])
  const layout = useMemo(() => {
    if (!(width > 0 && (rows.length || loading))) return null
    const out = layoutField(scores, specs, geom)
    rows.forEach((r, k) => { if (r.size != null && r.size !== 1) out.r[k] *= r.size })
    return out
  }, [scores, specs, geom, width, rows, loading])
  const xOf = useCallback((v: number) => scoreToX(Math.min(1, Math.max(0, unitOf(v))), geom), [unitOf, geom])

  const backdrop = useCallback((ctx: CanvasRenderingContext2D, h: number, inks: Inks) => {
    const top = geom.axisH - 4
    for (const rule of axis.rules ?? []) {
      const x = xOf(rule.at)
      if (rule.wash === 'risk') {
        ctx.globalAlpha = 0.05
        ctx.fillStyle = inks.crit
        ctx.fillRect(x, top, geom.plotX0 + geom.plotW - x, h - top)
      }
    }
    for (const rule of axis.rules ?? []) {
      const gx = Math.round(xOf(rule.at)) + 0.5
      ctx.globalAlpha = rule.alpha ?? 0.6
      ctx.strokeStyle = rule.tone === 'crit' ? inks.crit : inks.border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(gx, top)
      ctx.lineTo(gx, h)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }, [axis, xOf, geom])

  const ms = DUR.slow * 1000
  const compact = nBands > 16
  // Phone: a big row-count jump repaints at once (the tween janked at 4× CPU).
  const prevBands = useRef(nBands)
  const bigJump = Math.abs(nBands - prevBands.current) > 20
  useEffect(() => { prevBands.current = nBands }, [nBands])

  // ── Interaction ──────────────────────────────────────────────────────────
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [bandHover, setBandHover] = useState<string | null>(null)
  const pickedIdx = useMemo(() => (picked == null ? null : rows.findIndex((r) => r.id === picked)), [rows, picked])
  const hotIdx = useMemo(() => (hotId == null ? -1 : rows.findIndex((r) => r.id === hotId)), [rows, hotId])
  // Closing the quick card hands focus back to the field it was opened from.
  const wasPicked = useRef(picked)
  useEffect(() => {
    if (wasPicked.current != null && picked == null) requestAnimationFrame(() => wrapRef.current?.focus())
    wasPicked.current = picked
  }, [picked])
  const focusSet = useMemo(() => {
    if (focusBand != null) return new Set(rows.flatMap((r, i) => (r.bandId === focusBand ? [i] : [])))
    if (bandHover) return new Set(specs.find((s) => s.key === bandHover)?.members ?? [])
    return null
  }, [focusBand, bandHover, rows, specs])
  const layoutKey = `${axis.key}|${shown.map((b) => b.id).join(',')}`
  // the labels fade only on a regroup (a lens or sort change), never on mount or a resize: a fill-mode «both» fade
  // that restarted left the band names and totals near-invisible in full-page captures (Portada review 2026-11-02)
  // (derived in render, so the regrouped labels mount already fading — no one-frame flash)
  const [prevKey, setPrevKey] = useState(layoutKey)
  const [fadeFor, setFadeFor] = useState<string | null>(null)
  if (prevKey !== layoutKey) { setPrevKey(layoutKey); setFadeFor(layoutKey) }
  useEffect(() => {
    if (fadeFor == null) return
    const t = window.setTimeout(() => setFadeFor(null), ms)
    return () => window.clearTimeout(t)
  }, [fadeFor, ms])
  const labelFade = reduced || fadeFor !== layoutKey ? undefined : `fadeIn ${Math.round(ms * 0.5)}ms ease-out both`
  const u = unit ?? { es: 'puntos', en: 'dots' }
  const litCountOf = (members: number[]) => members.reduce((s, k) => s + (isLit(rows[k]) ? 1 : 0), 0)
  const render = (x: ReactNode | ((m: boolean) => ReactNode)) => (typeof x === 'function' ? x(mobile) : x)

  const swatch = (color: string | undefined, mark: Exclude<FieldLegendItem['mark'], 'none'> = 'fill') => (
    <span
      aria-hidden="true"
      className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${color ? '' : mark === 'fill' ? 'bg-text-muted' : 'border-text-muted'} ${mark === 'fill' ? '' : 'border'}`}
      style={color ? (mark === 'fill' ? { background: toColor(color) } : { borderColor: toColor(color) }) : undefined}
    />
  )

  return (
    <div className="flex flex-col">
      {onSortKey && (
        <div className="kf-ctl">
          <span className="kf-ctl-l">{L('Ordenar', 'Sort')}</span>
          <div className="kf-chips" role="group" aria-label={L('Ordenar por', 'Sort by')}>
            {axes.map((a) => (
              <button key={a.key} type="button" className="ct-chip" onClick={() => onSortKey(a.key)} aria-pressed={a.key === axis.key}>
                {en ? a.label.en : a.label.es}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* the finding beside its key (DESIGN.md §4: a sentence gets a sibling, never a cap) */}
      <div className="kf-head">
        {/* keyed: a new finding fades in with the marks' tween instead of swapping in one frame */}
        <p key={finding} className="kf-lede max-sm:order-1" style={{ animation: 'ct-fade var(--dur-state) var(--ease-out)' }}>{finding}</p>
        <p className="sr-only" aria-live="polite">{finding}</p>
        <p className="kf-key max-sm:order-1">
          {litLegend.map((l) => (
            <span key={l.key}>
              {swatch(l.color, l.mark === 'ring' ? 'ring' : 'fill')}
              {onLitKey ? (
                <button type="button" aria-pressed={litKey === l.key} onClick={() => onLitKey(litKey === l.key ? null : l.key)}>{l.label}</button>
              ) : l.label}
            </span>
          ))}
          {legend.map((l, i) => (
            <span key={l.key ?? i}>{l.mark !== 'none' && swatch(l.color, l.mark)}{l.label}</span>
          ))}
          {axis.note && <span>{axis.note}</span>}
        </p>
      </div>

      {keyRow}
      <div ref={wrapRef} tabIndex={-1} className="relative mt-2 focus-visible:outline-none">
        {layout && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: geom.axisH }}>
            {axis.ticks.filter((t) => !(mobile && t.phone === false)).map((t) => (
              <span
                key={`${axis.key}-${t.at}`}
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-mono text-text-muted"
                style={{ left: xOf(t.at), color: t.tone === 'crit' ? 'var(--color-risk-critical)' : undefined }}
              >
                {t.label}
              </span>
            ))}
            {!mobile && axis.readoutHead && (
              <span className="absolute right-0 top-0 font-mono text-[12px] text-text-muted">{axis.readoutHead}</span>
            )}
          </div>
        )}
        {layout && (
          <DotField
            n={rows.length}
            layout={layout}
            fills={fills}
            hollow={hollow}
            ringed={anyRing ? ringed : undefined}
            ring={anyRing}
            backdrop={backdrop}
            duration={mobile && bigJump ? 0 : ms}
            crossfadeBeyond={240}
            ease="out"
            enter={enter}
            reduced={reduced}
            hoverIdx={hover?.i ?? (hotIdx >= 0 ? hotIdx : pickedIdx != null && pickedIdx >= 0 ? pickedIdx : null)}
            focusSet={focusSet}
            hitRadius={10}
            onHover={(i, x, y) => { setHover(i == null ? null : { i, x, y }); onHoverRow?.(i == null ? null : rows[i]) }}
            onPick={(i) => onPick(i == null ? null : rows[i])}
            ariaLabel={finding}
          />
        )}
        {layout && layout.bands.map((lb) => {
          const s = specs.find((q) => q.key === lb.key)
          if (!s) return null
          const band = s.band
          const n = band?.n ?? s.members.length
          const litN = band?.litCount ?? litCountOf(s.members)
          const labelEl = band ? render(band.label) : render(railLabel)
          if (mobile) {
            return (
              <div key={`${layoutKey}|${lb.key}`} className="absolute inset-x-0 top-0 flex items-baseline justify-between gap-2 text-[12px]" style={{ transform: `translateY(${lb.y0}px)`, animation: labelFade, height: geom.labelH }}>
                {/* paper under the words: the axis rules run behind a label, never through it (owner phone review 2026-10-29) */}
                <span className="min-w-0 truncate bg-background pr-1">{labelEl}</span>
                {!lb.rail && band?.aggregate != null && <span className="whitespace-nowrap bg-background pl-1 font-mono text-[12px] tabular-nums text-text-secondary">{band.aggregate}</span>}
              </div>
            )
          }
          const readW = geom.width - geom.plotX0 - geom.plotW - 10
          return (
            <div key={`${layoutKey}|${lb.key}`} className="pointer-events-none absolute inset-x-0 top-0" style={{ transform: `translateY(${lb.rail ? lb.y0 : lb.mid - 14}px)`, animation: labelFade }}>
              <div className="flex items-start justify-between">
                <div
                  style={{ width: geom.plotX0 - 12 }}
                  className="pointer-events-auto"
                  onMouseEnter={band ? () => setBandHover(lb.key) : undefined}
                  onMouseLeave={band ? () => setBandHover(null) : undefined}
                >
                  {labelEl}
                </div>
                {!lb.rail && (
                  <div className="text-right leading-tight" style={{ width: readW }}>
                    <span className="whitespace-nowrap font-mono tabular-nums">
                      {band?.aggregate != null && <span className="text-[13px] font-semibold text-text-primary">{band.aggregate}</span>}
                      {!compact && litLine && (
                        <span className="block text-[12px] text-text-muted">
                          {L(`${formatNumber(litN)} de ${formatNumber(n)} ${u.es} marcados`, `${formatNumber(litN)} of ${formatNumber(n)} ${u.en} lit`)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {lb.rail && railAggregate != null && (
                  <div className="text-right font-mono text-[12px] leading-tight text-text-muted" style={{ width: readW }}>{railAggregate}</div>
                )}
              </div>
            </div>
          )
        })}
        {hover && picked == null && (
          <div
            role="presentation"
            className="pointer-events-none absolute z-20 max-w-[300px] border border-text-primary bg-background px-3 py-2 text-[13px]"
            style={{ left: Math.min(hover.x + 12, Math.max(0, width - 310)), top: hover.y + 12 }}
          >
            {hoverCard(rows[hover.i])}
          </div>
        )}
      </div>

      {footer}

      {/* sr-only on a <table> does not clip (tables ignore width) — the wrapper does */}
      <div className="sr-only">
        <table>
          <caption>{table?.caption ?? L('Filas visibles del campo', 'Visible rows of the field')}</caption>
          <thead>
            <tr>
              <th scope="col">{table?.band ?? L('Fila', 'Row')}</th>
              <th scope="col">{table?.n ?? L('Puntos', 'Dots')}</th>
              <th scope="col">{table?.lit ?? L('Marcados', 'Lit')}</th>
              <th scope="col">{table?.agg ?? axis.readoutHead}</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((s) => (
              <tr key={s.key}>
                <th scope="row">{s.band ? s.band.name : railName ?? L('Resto', 'The rest')}</th>
                <td>{s.band?.n ?? s.members.length}</td>
                <td>{s.band?.litCount ?? litCountOf(s.members)}</td>
                <td>{s.band ? s.band.aggregate : railAggregate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * FieldCard — the docked «Ficha rápida» a Field pick opens (right on desktop,
 * bottom sheet on phone). Esc closes; the close button takes focus on open and
 * focus returns to the opener on close. With `anchor`, the desktop card opens beside that element (flips left/up at
 * the viewport edges) so it lands where the reader is, whole, without scrolling.
 */
export function FieldCard({ title, onClose, lang, children, focusKey, anchor }: {
  title: ReactNode
  onClose: () => void
  lang: 'en' | 'es'
  children: ReactNode
  /** Changes when a new row is pinned (re-focuses the close button). */
  focusKey: string | number | null
  /** Element the card opens beside (≥ 640 px); omitted = docked top-right. */
  anchor?: HTMLElement | null
}) {
  const ref = useRef<HTMLButtonElement>(null)
  // Remember the opener on mount; hand focus back to it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [])
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => { ref.current?.focus() }, [focusKey])
  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return }
    const place = () => {
      const el = box.current
      if (!el || window.innerWidth < 640) { setPos(null); return }
      const a = anchor.getBoundingClientRect()
      const w = el.offsetWidth, h = el.offsetHeight, gap = 12, edge = 16, bar = 56
      const left = a.right + gap + w <= window.innerWidth - edge ? a.right + gap : Math.max(edge, a.left - gap - w)
      const top = Math.max(bar, Math.min(a.top, window.innerHeight - h - edge))
      setPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchor, focusKey])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const id = `kf-card-${String(focusKey ?? '')}`
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
      style={pos ? { left: pos.left, top: pos.top, right: 'auto' } : undefined}
      className={`kf-card fixed inset-x-0 bottom-[calc(56px+var(--sab,0px))] z-40 overflow-y-auto border-t border-text-primary bg-background p-4 sm:inset-x-auto sm:bottom-auto sm:w-[340px] sm:border ${anchor ? 'max-h-[calc(100dvh-72px-var(--sab,0px))] sm:max-h-[calc(100dvh-72px)] sm:right-4 sm:top-14' : 'max-h-[60vh] sm:right-4 sm:top-24'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p id={id} className="kf-ctl-l">{title}</p>
        <button ref={ref} type="button" onClick={onClose} aria-label={lang === 'en' ? 'Close' : 'Cerrar'} className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {/* keyed: a new pick crossfades the card's body instead of swapping in one frame */}
      <div key={String(focusKey ?? '')} style={{ animation: 'ct-fade 120ms var(--ease-out)' }}>{children}</div>
    </div>
  )
}

export default Field
