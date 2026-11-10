/**
 * SkyLasso — Lasso → Focos Rojos (weekend E1; spec atlas-2026-10-02 §6 Phase-2 flag).
 *
 * Shift-drag a polygon over the sky at Z0/Z1. The polygon is mapped to world
 * coordinates through the engine's per-frame SkyView (no engine code touched:
 * a cancelled Shift+pointerdown never reaches d3-zoom, because a cancelled
 * pointerdown suppresses the compatibility mousedown it listens to). The drawn
 * bodies inside it go to POST /atlas/sky/selection, which returns the public
 * basis only (ranking-safe, no RFC). The panel prints count · value · risk mix,
 * and offers a CSV (no RFC column) and «Abrir en Focos Rojos» → /aria?ids= (≤ 200,
 * by value). Keyboard alternative: «select this system» at Z1.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { SkyView } from './SkyEngine'
import type { SkyBodies } from '@/lib/atlas/sky/geometry'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber, rawText } from '@/lib/utils'
import { csvCell, downloadCsv as saveCsv } from '@/lib/atlas/sky/export'

const MONO = 'var(--font-family-archival)'
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const COLA_CAP = 200
const FINDER_GAP = 192 // the finder chart is 168 px at the bottom-left; the panel sits beside it

interface SelectionRow {
  vendor_id: number; name: string; institution_id: number; institution_name: string
  value_mxn: number; n_contracts: number; first_year: number | null; last_year: number | null; risk_score: number | null
}
interface Selection { n_requested: number; n_drawn: number; n_public: number; value_mxn: number; rows: SelectionRow[] }
type Pt = { x: number; y: number }

/** Even-odd ray cast. */
function inside(px: number, py: number, poly: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

export function SkyLasso({
  hostRef, viewRef, bodies, level, star, lang, dockPx,
}: {
  hostRef: RefObject<HTMLDivElement | null>
  viewRef: MutableRefObject<SkyView | null>
  bodies: SkyBodies
  /** 0 field · 1 star system · 2 planet (the lasso is off at Z2) */
  level: number
  /** the located star's index, for the keyboard «select this system» */
  star: number | null
  lang: 'en' | 'es'
  dockPx: number
}) {
  const navigate = useNavigate()
  const [path, setPath] = useState<Pt[] | null>(null)
  const drawing = useRef<Pt[] | null>(null)
  const justEnded = useRef(0)
  const { mutate, reset, data: sel, isPending, isError } = useMutation({
    mutationFn: async (ids: number[]) => (await api.post<Selection>('/atlas/sky/selection', { ids })).data,
  })
  const enabled = level < 2

  useEffect(() => {
    const host = hostRef.current
    if (!host || !enabled) return
    const canvasOf = () => host.querySelector('canvas')
    const local = (e: PointerEvent): Pt => {
      const r = canvasOf()!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => {
      if (!e.shiftKey || e.button !== 0 || e.target !== canvasOf()) return
      e.preventDefault() // suppresses the compatibility mousedown → d3-zoom never starts a pan
      e.stopPropagation()
      host.setPointerCapture(e.pointerId)
      drawing.current = [local(e)]
      setPath([...drawing.current])
    }
    const move = (e: PointerEvent) => {
      const pts = drawing.current
      if (!pts) return
      e.stopPropagation()
      const p = local(e), q = pts[pts.length - 1]
      if (Math.hypot(p.x - q.x, p.y - q.y) < 4) return
      pts.push(p)
      setPath([...pts])
    }
    const up = (e: PointerEvent) => {
      const pts = drawing.current
      if (!pts) return
      e.stopPropagation()
      drawing.current = null
      justEnded.current = performance.now()
      const v = viewRef.current, c = canvasOf()
      if (pts.length < 3 || !v || !c) { setPath(null); return }
      const r = c.getBoundingClientRect()
      const world = pts.map((p) => ({ x: v.x0 + (p.x / r.width) * (v.x1 - v.x0), y: v.y0 + (p.y / r.height) * (v.y1 - v.y0) }))
      const ids: number[] = []
      for (let i = 0; i < bodies.n; i++) if (inside(bodies.x[i], bodies.y[i], world)) ids.push(bodies.vendorId[i])
      if (!ids.length) { setPath(null); reset(); return }
      mutate(ids.slice(0, 5000))
    }
    // a lasso release must not fall through as a click (the engine would hop)
    const click = (e: MouseEvent) => { if (performance.now() - justEnded.current < 300) e.stopPropagation() }
    host.addEventListener('pointerdown', down, true)
    host.addEventListener('pointermove', move, true)
    host.addEventListener('pointerup', up, true)
    host.addEventListener('click', click, true)
    return () => {
      host.removeEventListener('pointerdown', down, true)
      host.removeEventListener('pointermove', move, true)
      host.removeEventListener('pointerup', up, true)
      host.removeEventListener('click', click, true)
    }
  }, [hostRef, viewRef, bodies, enabled, mutate, reset])

  const active = !!path || !!sel
  useEffect(() => {
    if (!active) return
    // Esc clears the lasso first (capture + stopImmediatePropagation), not «back one hop»
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setPath(null)
      reset()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [active, reset])
  const clear = () => { setPath(null); reset() }

  const selectSystem = () => {
    if (star == null) return
    const ids: number[] = []
    for (let i = 0; i < bodies.n; i++) if (bodies.hostIdx[i] === star) ids.push(bodies.vendorId[i])
    setPath(null)
    if (ids.length) mutate(ids)
  }
  const mix = useMemo(() => {
    const m = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of sel?.rows ?? []) if (r.risk_score != null) m[getRiskLevelFromScore(r.risk_score)] += 1
    return m
  }, [sel])

  const downloadCsv = () => {
    if (!sel) return
    const head = ['vendor_id', 'name', 'institution_id', 'institution_name', 'value_mxn', 'n_contracts', 'first_year', 'last_year', 'risk_indicator']
    const lines = [head.join(','), ...sel.rows.map((r) => [r.vendor_id, r.name, r.institution_id, rawText(r, 'institution_name'), r.value_mxn, r.n_contracts, r.first_year, r.last_year, r.risk_score].map(csvCell).join(','))]
    saveCsv(`rubli-atlas-lazo-${sel.n_public}.csv`, lines.join('\n'))
  }
  const openCola = () => {
    if (!sel?.rows.length) return
    navigate(`/aria?ids=${sel.rows.slice(0, COLA_CAP).map((r) => r.vendor_id).join(',')}`)
  }

  const btn: CSSProperties = { fontFamily: MONO, fontSize: 12, minHeight: 32, padding: '0 10px', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer' }
  const panel: CSSProperties = {
    position: 'absolute', left: FINDER_GAP, bottom: 33, zIndex: 8, // 72 px keeps the engine's zoom column (+ − ⌂) clear
    maxWidth: `calc(100% - ${FINDER_GAP + (level >= 1 ? dockPx : 0) + 72}px)`,
    background: 'var(--color-background-card)', border: '1px solid var(--color-border)', padding: '6px 10px', pointerEvents: 'auto',
    fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)',
  }

  if (!enabled) return null
  return (
    <>
      {path && path.length > 1 && (
        <svg className="absolute inset-0" style={{ width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 }} aria-hidden="true">
          <polygon points={path.map((p) => `${p.x},${p.y}`).join(' ')}
            style={{ fill: 'var(--color-accent)', fillOpacity: 0.08, stroke: 'var(--color-accent)', strokeWidth: 1.25, strokeDasharray: '4 3' }} />
        </svg>
      )}
      {(sel || isPending || isError) ? (
        <div role="status" aria-live="polite" style={panel}>
          <div style={{ fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }}>{skyCopy('lassoTitle', lang)}</div>
          {isPending ? (
            <div>{skyCopy('lassoLoading', lang)}</div>
          ) : isError || !sel ? (
            <div>{skyCopy('bandError', lang)}</div>
          ) : (
            <>
              <div style={{ color: 'var(--color-text-primary)' }}>
                {skyCopy('lassoSummary', lang, { n: formatNumber(sel.n_public), v: formatCompactMXN(sel.value_mxn), w: formatNumber(sel.n_drawn - sel.n_public) })}
              </div>
              <div>
                {(['critical', 'high', 'medium', 'low'] as const).map((k) => `${skyCopy(`risk_${k}`, lang)} ${formatNumber(mix[k])}`).join(' · ')}
              </div>
              <div className="flex flex-wrap gap-2" style={{ marginTop: 6 }}>
                <button type="button" onClick={downloadCsv} disabled={!sel.rows.length} className={RING} style={btn}>{skyCopy('lassoCsv', lang)}</button>
                <button type="button" onClick={openCola} disabled={!sel.rows.length} className={RING} style={{ ...btn, color: 'var(--color-accent-text)' }}>
                  {skyCopy('lassoCola', lang, { n: formatNumber(Math.min(COLA_CAP, sel.rows.length)) })}
                </button>
                <button type="button" onClick={clear} className={RING} style={btn}>{skyCopy('lassoClear', lang)}</button>
              </div>
            </>
          )}
        </div>
      ) : level === 1 && star != null ? (
        <div style={{ ...panel, padding: 0, border: 'none', background: 'transparent' }}>
          <button type="button" onClick={selectSystem} className={RING} style={btn}>{skyCopy('lassoSystem', lang)}</button>
        </div>
      ) : null}
    </>
  )
}
