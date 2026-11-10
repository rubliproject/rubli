/**
 * SkyFinder — «Carta de localización / Finder chart». Spec .claude/designs/atlas-2026-10-02-spec.md
 * §3.3 (graft G2 from «Uranometría»; Tirion / Uranometria plate conventions). 168 × 168 px,
 * bottom-left. The whole sky is pre-rendered ONCE to an offscreen canvas (nebula, sector
 * discs, star dots, sector initials); per frame only the field-of-view box is redrawn —
 * a 1.25 px ochre rectangle that becomes a crosshair below 6 px. Click or drag slews
 * (400 ms). Desktop only; `m` toggles it (the page owns the key).
 * Instruments §4.3: a pointer-down inside a sector disc with no drag frames that sector
 * (hover caption «×k · {sector} · clic: encuadrar»); outside a disc, or on drag, it slews.
 *
 * Also exports the §2.6 nebula bitmap the engine draws at far zoom.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from 'react'
import { WORLD, type SkyManifest } from '@/lib/atlas/sky/geometry'
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { SkyCam, SkyView } from './SkyEngine'
import { FONT_MONO } from './SkyLabels'
import { nebulaBitmap } from './nebulaBitmap'
import { MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'

const SIZE = 168

interface Props {
  manifest: SkyManifest
  lang: 'en' | 'es'
  /** the page wires the engine's per-frame view into this */
  drawRef: MutableRefObject<((v: SkyView) => void) | null>
  sectorName: string
  onSlew: (cam: SkyCam, ms: number) => void
  onSector: (id: number) => void
  /** owner 11-06 «both lenses»: sector hues under «Sectores», one quiet ink otherwise */
  hues?: boolean
}

export function SkyFinder({ manifest, lang, drawRef, sectorName, onSlew, onSector, hues = false }: Props) {
  const down = useRef<{ x: number; y: number; drag: boolean } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const fovRef = useRef<HTMLCanvasElement>(null)
  const capRef = useRef<HTMLDivElement>(null)
  const kRef = useRef(1)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const sc = SIZE / WORLD
  const plate = useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb
    const c = document.createElement('canvas')
    c.width = c.height = SIZE * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.fillStyle = v('--color-background', 'white')
    g.fillRect(0, 0, SIZE, SIZE)
    g.globalAlpha = 0.5
    g.drawImage(nebulaBitmap(manifest, v('--color-text-primary', 'black')), 0, 0, SIZE, SIZE)
    const S = manifest.stars
    for (const s of manifest.sectors) {
      const col = !hues ? v('--color-text-muted', 'gray') : s.code === 'salud' ? SECTOR_COLORS.salud : v(`--color-sector-${s.code}`, SECTOR_COLORS[s.code] ?? SECTOR_COLORS.otros)
      g.globalAlpha = 0.45
      g.strokeStyle = col
      g.lineWidth = 0.75
      g.beginPath(); g.arc(s.x * sc, s.y * sc, s.r * sc, 0, Math.PI * 2); g.stroke()
      g.globalAlpha = 0.7
      g.fillStyle = col
      for (let i = 0; i < S.id.length; i++) if (S.sector[i] === s.id) g.fillRect(S.x[i] * sc, S.y[i] * sc, 1, 1)
      g.globalAlpha = 1
      g.fillStyle = v('--color-text-secondary', 'gray')
      g.font = `10px ${FONT_MONO}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText((lang === 'en' ? s.name_en : s.name_es).slice(0, 1).toUpperCase(), s.x * sc, s.y * sc)
    }
    return c
  }, [manifest, lang, dpr, sc, hues])

  useEffect(() => {
    const fov = fovRef.current
    if (!fov) return
    const g = fov.getContext('2d')!
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || 'peru'
    drawRef.current = (v) => {
      kRef.current = v.k
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.drawImage(plate, 0, 0, SIZE, SIZE)
      g.strokeStyle = accent
      g.lineWidth = 1.25
      const x0 = v.x0 * sc, y0 = v.y0 * sc, w = (v.x1 - v.x0) * sc, h = (v.y1 - v.y0) * sc
      if (w < 6 || h < 6) {
        const cx = x0 + w / 2, cy = y0 + h / 2
        g.beginPath()
        g.moveTo(cx - 7, cy); g.lineTo(cx - 2, cy); g.moveTo(cx + 2, cy); g.lineTo(cx + 7, cy)
        g.moveTo(cx, cy - 7); g.lineTo(cx, cy - 2); g.moveTo(cx, cy + 2); g.lineTo(cx, cy + 7)
        g.stroke()
      } else g.strokeRect(x0, y0, w, h)
      if (capRef.current) capRef.current.dataset.k = v.k < 10 ? v.k.toFixed(1) : String(Math.round(v.k))
    }
    return () => { drawRef.current = null }
  }, [plate, drawRef, dpr, sc])

  const world = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / SIZE) * WORLD, y: ((e.clientY - r.top) / SIZE) * WORLD }
  }
  const slew = (e: PointerEvent<HTMLCanvasElement>, ms: number) => onSlew({ ...world(e), k: kRef.current }, ms)
  const discAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = world(e)
    return manifest.sectors.find((g) => Math.hypot(g.x - x, g.y - y) <= g.r) ?? null
  }

  return (
    <div style={{ pointerEvents: 'auto', background: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
      <canvas
        ref={fovRef}
        width={SIZE * dpr}
        height={SIZE * dpr}
        role="img"
        aria-label={skyCopy('finder', lang)}
        title={skyCopy('finder', lang)}
        style={{ width: SIZE, height: SIZE, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); down.current = { x: e.clientX, y: e.clientY, drag: false } }}
        onPointerMove={(e) => {
          const d = down.current
          if (d && e.buttons) {
            if (!d.drag && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) d.drag = true
            if (d.drag) slew(e, 0)
            return
          }
          const g = discAt(e)
          setOver(g ? (lang === 'en' ? g.name_en : g.name_es) : null)
        }}
        onPointerUp={(e) => {
          const d = down.current
          down.current = null
          if (!d || d.drag) return
          const g = discAt(e)
          if (g) onSector(g.id)
          else slew(e, 400)
        }}
        onPointerLeave={() => setOver(null)}
      />
      <div
        ref={capRef}
        className="sky-finder-cap"
        style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)', padding: '2px 6px', borderTop: '1px solid var(--color-border)', maxWidth: SIZE }}
      >
        {over ? ` · ${skyCopy('finderFrame', lang, { sector: over })}` : sectorName ? ` · ${sectorName}` : ''}
      </div>
      <style>{`.sky-finder-cap::before { content: '×' attr(data-k); }`}</style>
    </div>
  )
}
