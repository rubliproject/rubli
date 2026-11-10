/**
 * DotField — the canvas engine of the Tamiz-family fields (/institutions
 * «El Tamiz», /categories «El Anaquel»).
 *
 * One <canvas> paints every dot; the page owns every glyph in DOM ("HTML
 * owns glyphs, canvas owns geometry"). A new `layout` tweens every dot from
 * its CURRENT interpolated position (interruptible — uipro "Cancellable State
 * Transitions"), so a click mid-move never snaps. Reduced motion paints the
 * final state at once. Hit-testing is a d3-quadtree over target positions.
 *
 * The caller supplies what differs per page: per-dot `fills` (null = muted
 * ink, painted underneath), `hollow` rings, optional `ringed` halos, and a
 * `backdrop` painter for washes and reference hairlines.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { quadtree, type Quadtree } from 'd3-quadtree'
import type { Layout } from '@/lib/field/layout'

export type Ease = 'out' | 'inOut'
const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Theme inks resolved from CSS tokens at paint time (light/dark safe). */
export interface Inks {
  muted: string
  border: string
  crit: string
  accent: string
}

export interface DotFieldProps {
  n: number
  layout: Layout
  /** Per-dot fill (a colour, or a `--css-token` name); null = muted ink, painted first so coloured dots sit on top. */
  fills: (string | null)[]
  /** Per-dot hollow ring (thin sample / provisional). */
  hollow: boolean[]
  /** Accent halo on `ringed` dots while `ring` is on. */
  ringed?: boolean[]
  ring?: boolean
  /** Washes + hairlines under the dots. Keep it stable (useCallback) — it re-paints on change. */
  backdrop?: (ctx: CanvasRenderingContext2D, h: number, inks: Inks) => void
  /**
   * Optional painter between the backdrop and the dots that receives the dots'
   * CURRENT interpolated positions (trails that follow a tween). Keep it stable.
   */
  underlay?: (ctx: CanvasRenderingContext2D, cur: { x: Float32Array; y: Float32Array; a: Float32Array }, inks: Inks) => void
  duration: number
  ease: Ease
  reduced: boolean
  hoverIdx: number | null
  /** Highlight: dots outside it fade (never vanish — the denominator stays). */
  focusSet: Set<number> | null
  hitRadius: number
  onHover: (idx: number | null, x: number, y: number) => void
  onPick: (idx: number | null) => void
  ariaLabel: string
  /**
   * First paint only: dots enter from one line (the first band's midline, at
   * their true x) into the layout, ENTER_MS cubic-out. The canvas is sized to
   * the final height up front (no CLS) and hit-testing uses target positions,
   * so the field is interactive during the entrance.
   */
  enter?: boolean
  /**
   * Dots that travel farther than this (px, vertical) crossfade instead of
   * flying: they fade out where they are, then fade in at their target — so
   * a row entering from a distant rail is never blank mid-move and no dot
   * streaks across other rows. Omitted = every dot flies (El Tamiz).
   */
  crossfadeBeyond?: number
}

export const ENTER_MS = 600
/** Crossfading dots switch rows at this fraction of the tween. */
const XFADE_AT = 0.3

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

export function DotField({
  n, layout, fills, hollow, ringed, ring = false, backdrop, underlay, duration, ease, reduced, hoverIdx, focusSet, hitRadius, onHover, onPick, ariaLabel, enter = false, crossfadeBeyond,
}: DotFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Current interpolated state (x, y, r, alpha) + ring alpha.
  const cur = useRef({ x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n), ring: 0, init: false })
  const raf = useRef(0)
  const [height, setHeight] = useState(layout.height)
  const drawRef = useRef<() => void>(() => {})

  const tree: Quadtree<number> = useMemo(
    () => quadtree<number>().x((i) => layout.x[i]).y((i) => layout.y[i]).addAll(Array.from({ length: n }, (_, i) => i)),
    [layout, n],
  )

  // Paint (reads refs only — safe inside rAF).
  drawRef.current = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.clientWidth
    const h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const inks: Inks = {
      muted: cssVar(c, '--color-text-muted', 'gray'),
      border: cssVar(c, '--color-border', 'lightgray'),
      crit: cssVar(c, '--color-risk-critical', 'red'),
      accent: cssVar(c, '--color-accent', 'darkgoldenrod'),
    }
    backdrop?.(ctx, h, inks)
    const S = cur.current
    if (underlay) { underlay(ctx, S, inks); ctx.globalAlpha = 1 }
    const tokens = new Map<string, string>()
    const ink = (f: string) => {
      if (!f.startsWith('--')) return f
      let v = tokens.get(f)
      if (v == null) { v = cssVar(c, f, inks.accent); tokens.set(f, v) }
      return v
    }
    // Muted dots first, coloured on top.
    for (const pass of [0, 1]) {
      for (let i = 0; i < n; i++) {
        const f = fills[i]
        if ((pass === 0) !== (f == null)) continue
        const dim = focusSet && !focusSet.has(i) ? 0.22 : 1
        ctx.globalAlpha = S.a[i] * dim
        const col = f == null ? inks.muted : ink(f)
        ctx.beginPath()
        ctx.arc(S.x[i], S.y[i], S.r[i], 0, Math.PI * 2)
        if (hollow[i]) {
          ctx.strokeStyle = col
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          ctx.fillStyle = col
          ctx.fill()
        }
      }
    }
    if (ringed && S.ring > 0.01) {
      ctx.strokeStyle = inks.accent
      ctx.lineWidth = 1
      for (let i = 0; i < n; i++) {
        if (!ringed[i] || S.a[i] < 0.5) continue
        ctx.globalAlpha = S.ring * 0.85 * (focusSet && !focusSet.has(i) ? 0.3 : 1)
        ctx.beginPath()
        ctx.arc(S.x[i], S.y[i], S.r[i] + 1.6, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (hoverIdx != null && hoverIdx < n) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = inks.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(S.x[hoverIdx], S.y[hoverIdx], S.r[hoverIdx] + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // Tween to every new layout / ring state from wherever the dots are now.
  useEffect(() => {
    // A new dot count re-allocates the state (and paints the layout as-is).
    if (cur.current.x.length !== n) {
      cur.current = { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n), ring: 0, init: false }
    }
    const S = cur.current
    const ringTo = ring ? 1 : 0
    cancelAnimationFrame(raf.current)
    const entering = !S.init && enter && !reduced
    if (entering) {
      // Collapse onto one line at the axis; the tween below spreads it out.
      const line = layout.bands[0]?.mid ?? layout.height / 2
      S.x.set(layout.x); S.y.fill(line); S.r.set(layout.r); S.a.set(layout.a)
      S.ring = ringTo
      S.init = true
      setHeight(layout.height)
    } else if (!S.init || reduced || duration <= 0) {
      S.x.set(layout.x); S.y.set(layout.y); S.r.set(layout.r); S.a.set(layout.a)
      S.ring = ringTo
      S.init = true
      setHeight(layout.height)
      requestAnimationFrame(() => drawRef.current())
      return
    }
    const from = { x: S.x.slice(), y: S.y.slice(), r: S.r.slice(), a: S.a.slice(), ring: S.ring }
    const far = new Uint8Array(n)
    if (crossfadeBeyond != null) for (let i = 0; i < n; i++) far[i] = Math.abs(layout.y[i] - from.y[i]) > crossfadeBeyond ? 1 : 0
    const fn = entering || ease === 'out' ? easeOut : easeInOut
    const dur = entering ? ENTER_MS : duration
    const t0 = performance.now()
    // Keep room for dots still travelling out of the old, taller field.
    setHeight((h) => Math.max(h, layout.height))
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const e = fn(t)
      for (let i = 0; i < n; i++) {
        if (far[i]) {
          // A quick fade out at the old spot, then a longer fade in at the new one.
          const out = t < XFADE_AT
          S.x[i] = out ? from.x[i] : layout.x[i]
          S.y[i] = out ? from.y[i] : layout.y[i]
          S.r[i] = out ? from.r[i] : layout.r[i]
          S.a[i] = out ? from.a[i] * (1 - t / XFADE_AT) : layout.a[i] * ((t - XFADE_AT) / (1 - XFADE_AT))
          continue
        }
        S.x[i] = from.x[i] + (layout.x[i] - from.x[i]) * e
        S.y[i] = from.y[i] + (layout.y[i] - from.y[i]) * e
        S.r[i] = from.r[i] + (layout.r[i] - from.r[i]) * e
        S.a[i] = from.a[i] + (layout.a[i] - from.a[i]) * e
      }
      // Ring fades linearly over its own 200ms.
      S.ring = from.ring + (ringTo - from.ring) * Math.min(1, (now - t0) / 200)
      drawRef.current()
      if (t < 1) raf.current = requestAnimationFrame(step)
      else setHeight(layout.height)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [layout, ring, reduced, duration, ease, n, enter, crossfadeBeyond])

  // Repaint on hover/focus/colour/size changes outside a tween.
  useEffect(() => { drawRef.current() }, [hoverIdx, focusSet, height, fills, hollow, backdrop, underlay])
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ro = new ResizeObserver(() => drawRef.current())
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  const hit = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const radius = e.pointerType === 'touch' ? Math.max(24, hitRadius) : hitRadius
    const i = tree.find(x, y, radius)
    return { i: i ?? null, x, y }
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className="block w-full touch-manipulation"
      style={{ height, cursor: hoverIdx != null ? 'pointer' : 'default' }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return
        const h = hit(e)
        onHover(h.i, h.x, h.y)
      }}
      onPointerLeave={() => onHover(null, 0, 0)}
      onClick={(e) => onPick(hit(e as unknown as React.PointerEvent<HTMLCanvasElement>).i)}
    />
  )
}
