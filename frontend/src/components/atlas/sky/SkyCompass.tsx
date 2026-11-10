/**
 * SkyCompass — off-screen bearings. Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §4.3
 * (graft from «La Rosa de los Vientos»). At Z1 / Z2 with k ≥ 1.6, ≤ 20 DOM tags ride a 22 px rim band
 * inset 8 px from the free canvas: each sector disc that is wholly off-screen (arrow + its code in
 * the sector's text-twin ink) and each off-screen pin (▾ + digit). Direction only, never a distance —
 * positions are arbitrary. Click or Enter flies. Tags are written per frame from the engine's view
 * (a dozen multiply-adds each); colliding tags fold into the first one's «+n».
 */
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { MAPA_SECTOR_COLORS as SECTOR_COLORS, textInk } from '@/lib/constants'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import type { SkyView } from './SkyEngine'
import type { PinItem } from './SkyPins'

const INSET = 8
const BAND = 22
const MIN_K = 1.6
const GAP = 4
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

interface Props {
  manifest: SkyManifest
  pins: PinItem[]
  drawRef: MutableRefObject<((v: SkyView) => void) | null>
  /** the dock's width: the free canvas ends there */
  dockPx: number
  /** Z1 / Z2 only (the dock exists) */
  active: boolean
  lang: 'en' | 'es'
  onSector: (id: number) => void
  onPin: (n: number) => void
  /** owner 11-06 «both lenses»: sector-hued tags under «Sectores», quiet ink otherwise */
  hues?: boolean
}

export function SkyCompass({ manifest, pins, drawRef, dockPx, active, lang, onSector, onPin, hues = false }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLButtonElement | null)[]>([])
  const live = useRef({ pins, active, dockPx })
  useLayoutEffect(() => { live.current = { pins, active, dockPx } })
  const G = manifest.sectors
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const size = { w: box.clientWidth, h: box.clientHeight }
    const ro = new ResizeObserver(() => { size.w = box.clientWidth; size.h = box.clientHeight })
    ro.observe(box)
    const widths: number[] = []
    drawRef.current = (v) => {
      const { pins: P, active: on, dockPx: dock } = live.current
      const rho = size.w / (v.x1 - v.x0)
      const W = size.w - dock, H = size.h
      const cx = W / 2, cy = H / 2
      const lo = INSET + BAND / 2
      const placed: [number, number, HTMLButtonElement, number][] = []
      const place = (k: number, tx: number, ty: number, r: number) => {
        const el = els.current[k]
        if (!el) return
        const sx = (tx - v.x0) * rho, sy = (ty - v.y0) * rho, rr = r * rho
        const off = sx + rr < 0 || sx - rr > W || sy + rr < 0 || sy - rr > H
        if (!on || v.k < MIN_K || !off) { el.style.display = 'none'; return }
        const dx = sx - cx, dy = sy - cy
        const t = Math.min(dx ? Math.abs((dx > 0 ? W - lo - cx : cx - lo) / dx) : Infinity, dy ? Math.abs((dy > 0 ? H - lo - cy : cy - lo) / dy) : Infinity)
        // the tag's centre stays a half-tag inside the free canvas (never under the dock); its real width, since the
        // tags carry whole sector names now (CYAN 2026-11-04: «TRABA», «HACIE» read as other words)
        el.style.display = 'flex'
        const hw = (widths[k] ||= el.offsetWidth) / 2 // measured once (no layout per frame)
        const x = Math.min(W - INSET - hw, Math.max(INSET + hw, cx + dx * t)), y = cy + dy * t
        const near = placed.find(([px, py, , pw]) => Math.abs(px - x) < pw + hw + GAP && Math.abs(py - y) < BAND + GAP)
        if (near) {
          el.style.display = 'none'
          const more = near[2].querySelector<HTMLElement>('[data-more]')
          if (more) {
            more.dataset.n = String(Number(more.dataset.n ?? 0) + 1)
            more.textContent = ` +${more.dataset.n}`
          }
          return
        }
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
        const arrow = el.querySelector<HTMLElement>('[data-arrow]')
        if (arrow) arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
        const more = el.querySelector<HTMLElement>('[data-more]')
        if (more) { more.textContent = ''; more.dataset.n = '0' }
        placed.push([x, y, el, hw])
      }
      G.forEach((g, k) => place(k, g.x, g.y, g.r))
      P.forEach((p, n) => {
        if (p.at) place(G.length + n, p.at.x, p.at.y, 0)
        else { const el = els.current[G.length + n]; if (el) el.style.display = 'none' }
      })
    }
    return () => { ro.disconnect(); drawRef.current = null }
  }, [drawRef, G, lang]) // the tag widths are re-measured per language

  const tag = { position: 'absolute', left: 0, top: 0, display: 'none', alignItems: 'center', gap: 3, height: BAND, padding: '0 5px', pointerEvents: 'auto',
    fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', background: 'var(--color-background)', border: '1px solid var(--color-border)', cursor: 'pointer' } as const
  return (
    <div ref={boxRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2, overflow: 'hidden' }} aria-label={skyCopy('compass', lang)} role="group">
      {G.map((g, k) => {
        const name = lang === 'en' ? g.name_en : g.name_es
        return (
          <button key={g.id} ref={(el) => { els.current[k] = el }} type="button" onClick={() => onSector(g.id)} className={RING}
            aria-label={skyCopy('compassSector', lang, { name })} title={skyCopy('compassSector', lang, { name })}
            style={{ ...tag, color: hues ? textInk(SECTOR_COLORS[g.code] ?? SECTOR_COLORS.otros) : 'var(--color-text-muted)' }}>
            <span data-arrow aria-hidden="true" style={{ display: 'inline-block' }}>➜</span>
            <span>{name.replace(/^Medio /, '')}</span><span data-more />
          </button>
        )
      })}
      {pins.map((p, n) => (
        <button key={`p${n}`} ref={(el) => { els.current[G.length + n] = el }} type="button" onClick={() => onPin(n)} className={RING}
          aria-label={skyCopy('pinGo', lang, { n: n + 1, name: p.label })} title={p.label} style={{ ...tag, color: 'var(--color-text-primary)' }}>
          <span data-arrow aria-hidden="true" style={{ display: 'inline-block' }}>➜</span>
          <span>▾{n + 1}</span><span data-more />
        </button>
      ))}
    </div>
  )
}
