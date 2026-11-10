/**
 * SkyEngine — «El Atlas» Z0 «El Campo» · Z1 «El Sistema» · Z2 «El Planeta» · Z3 «La Luna».
 * Spec .claude/designs/atlas-2026-10-02-spec.md §2 (layout contract), §3.1, §3.6 and §2.5.
 *
 * Canvas + d3-zoom + DOM labels (skill atlas-engine-rewrite). World = 10 000-unit
 * square, uniform s₀ = min(w, h)/W, ρ = k·s₀ px per unit. Mark radii are screen px;
 * only distances scale. The zoom handler writes refs and schedules one draw per
 * frame; React hears about the camera on `end` only (onEnd → location + cam).
 *
 * Precedents: Kepler Orrery (shared radial share scale §2.3), Jul & Furnas critical
 * zones (halos §2.2), Nomic Atlas LOD labels (§3.2), ICIJ / Linkurious expand-in-place
 * (ghost, co-bid and group threads drawn on focus, §3.6).
 */
import {
  useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode,
} from 'react'
import { select } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { quadtree, type Quadtree } from 'd3-quadtree'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { skySystemQuery, type SkyBand } from '@/lib/atlas/sky/useSky'
import { supplierTipName } from '@/lib/atlas/sky/catalog'
import { DATA_LAST_YEAR, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'
import { nebulaBitmap } from './nebulaBitmap'
import { ADMINISTRATIONS, ADMIN_DISPLAY_ACCENTED } from '@/lib/administrations'
import {
  WORLD, R_CORE, MOON_R, AMOUNT_RINGS, orbitR, orbitXY, moonL, starPx, theta, hasYear, RING_YEARS,
  type SkyBodies, type SkyManifest, type SkySystem,
} from '@/lib/atlas/sky/geometry'
import type { Moon } from '@/lib/atlas/sky/use-vendor-contracts'
import type { SkyLayers } from '@/lib/atlas/sky/useSky'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { mapaRiesgo, RISKY_SHARE } from '@/lib/pageQuestion'
import { chooseLabels, placeLabels, writeLabels, FONT_MONO, FONT_SERIF, type LabelSlot, type Mark } from './SkyLabels'
import { SkyLabelPool } from './SkyLabelPool'

export interface SkyCam { x: number; y: number; k: number }
/** Computed on `end` from the camera (§3.4 «ESTÁS EN»): star / body are indices. */
export interface SkyLocation {
  level: 0 | 1 | 2; sector: number | null; star: number | null; body: number | null
  /** sky-dive: Z0 with one sector disc filling the view (radius ≥ 30% of the short side) — the cluster level */
  framed?: boolean
}
/** sky-dive L4: 0 money (the chart) · 1 risk · 2 first year · 3 captura · 4 señales · 5 apagón · 6 grade —
 *  the framed sector's stars re-laid in place (x = the lens, y = money) */
export type SkyLensIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6
/** sky-dive: the agency-level overlay (one at a time) — LAYERS.md (b) */
export type SkyOverlay = 'captura' | 'pareja' | 'mismo_dia' | 'senal' | null
/** sky-dive: a supplier's post-blackout ComprasMX contracts, drawn as unscored moons past the 2025 seam */
export interface ApagonMoon { t: number; amount: number }
export type HopTarget =
  | { kind: 'home' }
  | { kind: 'sector'; id: number }
  | { kind: 'star'; idx: number }
  | { kind: 'body'; idx: number }
  | { kind: 'moon'; id: number }
type ExtHover = { kind: 'star' | 'body' | 'moon'; idx: number } | null
export interface SkyApi {
  /** A hop: tells the page (trail push) then flies. */
  hop: (t: HopTarget) => void
  /** Fly with no trail push (URL restore, Back / Forward, finder slews). */
  fly: (t: HopTarget) => void
  /** Retrace: jump/fly to a stored camera (no trail push). */
  goTo: (cam: SkyCam, ms?: number) => void
  /** instruments F14: ring a body or star from outside (the catalog cursor) without moving the camera */
  hover: (t: ExtHover) => void
  /** instruments §3.8 (F23): the canvas as drawn now, at DPR — geometry only, no DOM label; null before the first frame */
  snapshot: () => HTMLCanvasElement | null
}
/** instruments §3.4 «Qué cambió»: marks drawn on the frozen positions of one star's bodies (never moving a body).
 *  Body indices; a whisker runs along the body's own ray from orbitR(shareA) to orbitR(shareB), drawn when ≥ 8 px. */
export interface SkyMarks { star: number; arrive: number[]; depart: number[]; whiskers: [number, number, number][] }
/** The visible world rectangle, written every frame (finder chart, §3.3). */
export interface SkyView { x0: number; y0: number; x1: number; y1: number; k: number }
export interface MoonSet {
  body: number
  moons: Moon[]
  remainder: [number, number][]
  total: number | null
  smallest: number
  /** S5 A3: contracts not drawn as moons — amount ≤ 0, and no usable date */
  skipped: number
  undated: number
}

interface Props {
  manifest: SkyManifest
  bodies: SkyBodies | null
  lang: 'en' | 'es'
  initialCam: SkyCam | null
  /** the located star's system payload (null until fetched after `end`) */
  system: SkySystem | null
  moons: MoonSet | null
  selectedMoon: number | null
  /** `user` is false for a programmatic move (a flight or a hop): §3.11 — a programmatic `end` never takes a flight's controls */
  onEnd: (loc: SkyLocation, cam: SkyCam, user: boolean) => void
  onHop: (t: HopTarget, before: SkyCam) => void
  apiRef: MutableRefObject<SkyApi | null>
  /** §3.8: selected sexenio index (fox … sheinbaum) and «tamaño = dinero en el periodo» */
  period: number | null
  sizeByPeriod: boolean
  /** §2.4 / §3.9: a band member's year segment to pulse at its host star */
  pulse: { star: number; year: number; at: number } | null
  onFrame?: (v: SkyView) => void
  /** §3.11: a flight's highlight set (body indices), derived in render by compileWaypoint; copied into a ref */
  highlight?: number[] | null
  /** §3.11: a flight card holds the right 380 px at every zoom — the camera centres in the free area */
  reserve?: boolean
  /** extra canvas furniture (finder, period bar) rendered inside the wrapper */
  children?: ReactNode
  /** instruments §4.3: the compass rim band (px from the free canvas edge), claimed before labels from Z1 */
  rimPx?: number
  /** instruments §3.3 (F17): the rail year: lit = paid that year (wins over `period`); the hand at Z1 / Z2.
   *  A draw-pass addition: positions, zoom and flight interpolation are untouched. Needs SKY3 masks. */
  year?: number | null
  /** instruments §2.5: the year stamps (honesty line, coverage) in the furniture column, under the frozen ones */
  stamps?: string[]
  /** instruments §3.4: the diff's marks (≤ 30 paths, built by the page on `end`) */
  marks?: SkyMarks | null
  /** instruments §3.7 (F14): no frame is requested while the twin plate covers the sky; the camera is untouched */
  paused?: boolean
  /** sky-dive L4: the framed sector's lens (stars glide to the lens layout over 600 ms; 0 = the chart) */
  lens?: SkyLensIdx
  lensSector?: number | null
  /** owner 11-06 «both lenses»: «Sectores» draws sector hues (discs + dust); off = the quiet ink + one red (Riesgo) */
  hues?: boolean
  /** sky-dive: at Z2 the planet's threads (other buyers, co-bids, group) draw on hover, or always with this on */
  links?: boolean
  /** sky-dive L1: the hovered moon (contract id), for the dock's ledger */
  onHoverMoon?: (id: number | null) => void
  /** sky-dive round 2: names tried and dropped for lack of space (`s:3`, `b:12`), for the dock's «+N sin etiqueta» */
  onUnlabeled?: (targets: string[]) => void
  /** sky-dive L2: the cluster readout, top-right over the canvas (labels avoid it) */
  panel?: ReactNode
  /** sky-dive data layers (LAYERS.md): per-star arrays + per-body bits; null until fetched */
  layers?: SkyLayers | null
  overlay?: SkyOverlay
  /** sky-dive: moon distance = amount (0) or the contract's risk indicator (1, no rings) */
  moonLens?: 0 | 1
  apagon?: ApagonMoon[] | null
  /** sky-dive: contract ids of the selected contract's same-day lot, ringed on the clock */
  siblings?: number[] | null
}

const SCALE_EXTENT: [number, number] = [0.8, 12_800]
/** Z1 «El Sistema» begins at ρ = 0.6 px per world unit; Z2 «El Planeta» at ρ = 20. */
const Z1_RHO = 0.6
const Z2_RHO = 20
const ENGRAVE_MIN_PX = 48
/** sky-dive L4: the lens box inside the sector disc (× R): x ±LENS_U, y LENS_V0 → LENS_V1, axis at LENS_AXIS */
const LENS_U = 0.7, LENS_V0 = -0.6, LENS_V1 = 0.5, LENS_AXIS = 0.6, LENS_MS = 1400, LENS_UNGRADED = 0.12
/** 2026-11-04 «Riesgo» on the overview: every agency on one chart — the same lens box, drawn over the whole sky */
const LENS_ALL = { id: -1, x: 5000, y: 5050, r: 6400 }
/** log10 of the money axis' floor (100 000 MXN) */
const LENS_FLOOR = 5
/** a framed sector: its disc radius ≥ 30% of the free short side */
const FRAMED = 0.3
const LABEL_FOCUS_PX = 120
/** the compass band (SkyCompass: inset 8 + a tag up to ~104 px wide, «Gobernación +1») that canvas captions keep out of */
const RIM_PX = 112
/** The dock overlays the canvas's right 380 px from Z1 on; flights centre on the free area. */
export const DOCK_PX = 380
const FOOT_PX = 64

/** The compass's rim band as four strips of the free canvas (instruments §4.3). */
const rimBand = (w: number, h: number, b: number): [number, number, number, number][] =>
  [[0, 0, w, b], [0, h - b, w, b], [0, 0, b, h], [w - b, 0, b, h]]

const easeCubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

interface Colors { bg: string; ink: string; muted: string; accent: string; border: string; risk: string[]; sector: Record<number, string>; hue: Record<number, string> }

function readColors(m: SkyManifest): Colors {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
  const sector: Record<number, string> = {}
  // CYAN-2 11-05 (owner «too many colours»): every sector is one quiet ink; red is the only accent and means risk.
  // Key RISKY (-1) = an agency on the overview «Riesgo» chart with half or more of its money at high/critical risk
  const quiet = v('--color-text-muted', 'gray')
  for (const s of m.sectors) sector[s.id] = quiet
  sector[RISKY] = v('--color-risk-critical', 'red')
  // owner 11-06 «both lenses»: the «Sectores» lens takes the sector hues back (El Mapa's Salud is rose, MAPA_SALUD)
  const hue: Record<number, string> = { ...sector }
  for (const s of m.sectors) hue[s.id] = s.code === 'salud' ? SECTOR_COLORS.salud : v(`--color-sector-${s.code}`, SECTOR_COLORS[s.code] ?? SECTOR_COLORS.otros)
  return {
    bg: v('--color-background', 'white'), ink: v('--color-text-primary', 'black'),
    muted: v('--color-text-muted', 'gray'), accent: v('--color-accent', 'peru'), border: v('--color-border', 'silver'),
    // CYAN-2: one accent at every zoom — high and critical are the same red, low and medium quiet
    risk: [v('--color-risk-low', 'gray'), quiet, v('--color-risk-critical', 'red'), v('--color-risk-critical', 'red')],
    sector, hue,
  }
}

/** the star-batch key of the red «half or more at risk» agencies on the overview «Riesgo» chart */
const RISKY = -1

// 'band' (weekend E2): idx = the arrival year of a «resto» segment on the located star's rim
type Hover = { kind: 'star' | 'body' | 'ghost' | 'moon' | 'band'; idx: number } | null

export function SkyEngine({
  manifest, bodies, lang, initialCam, system, moons, selectedMoon, onEnd, onHop, apiRef, period, sizeByPeriod, pulse, onFrame, children,
  highlight = null, reserve: reserveDock = false, rimPx = 0, year = null, stamps, marks = null, paused = false,
  lens = 0, lensSector = null, hues = false, links = false, onHoverMoon, onUnlabeled, panel,
  layers = null, overlay = null, moonLens = 0, apagon = null, siblings = null,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const furnRef = useRef<HTMLDivElement>(null)
  const zoomBtnRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** furniture rects [x, y, w, h], re-measured with the labels (≤ 10 Hz), read by the canvas text reservation */
  const furnRectsRef = useRef<[number, number, number, number][]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([])
  const slotsRef = useRef<LabelSlot[]>([])
  const tRef = useRef<ZoomTransform>(zoomIdentity)
  const sizeRef = useRef({ w: 0, h: 0, s0: 0, ox: 0, oy: 0 })
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const rafRef = useRef(0)
  const lastLabelRef = useRef(0)
  const dustCacheRef = useRef<{ c: HTMLCanvasElement; X0: number; Y0: number; rho: number } | null>(null)
  const gestureRef = useRef(false)
  const hoverRef = useRef<Hover>(null)
  /** the camera a running flight is aimed at — a resize mid-flight re-aims it (I-S1 resize fix) */
  const flightCamRef = useRef<SkyCam | null>(null)
  const extHoverRef = useRef<ExtHover>(null)
  const locRef = useRef<SkyLocation>({ level: 0, sector: null, star: null, body: null })
  const drawRef = useRef<() => void>(() => {})
  const labelsRef = useRef<() => void>(() => {})
  const cb = useRef({ onEnd, onHop, onFrame, onHoverMoon, onUnlabeled })
  cb.current = { onEnd, onHop, onFrame, onHoverMoon, onUnlabeled }
  const droppedKey = useRef('')
  // the year mask needs SKY3; under the SKY2 shim `year` is ignored (the rail hides its years)
  const yr = year != null && bodies?.hasYears ? year : null
  const perRef = useRef({ period, sizeByPeriod, pulse, highlight, reserve: reserveDock, year: yr, links, lens, lensSector, hues, overlay, moonLens, apagon, siblings })
  perRef.current = { period, sizeByPeriod, pulse, highlight, reserve: reserveDock, year: yr, links, lens, lensSector, hues, overlay, moonLens, apagon, siblings }
  const bodiesRef = useRef(bodies)
  bodiesRef.current = bodies
  const marksRef = useRef(marks)
  marksRef.current = marks
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [band, setBand] = useState<0 | 1 | 2>(0)
  /** the canvas width × the world scale, for the overview «Riesgo» chart's width (a resize re-lays it) */
  const [fit, setFit] = useState({ w: 0, s0: 0 })

  const S = manifest.stars
  const nStars = S.id.length
  const colors = useMemo(() => readColors(manifest), [manifest])
  const sectorById = useMemo(() => new Map(manifest.sectors.map((s) => [s.id, s])), [manifest])
  const starIdx = useMemo(() => new Map(S.id.map((id, i) => [id, i])), [S])
  const canonInst = useMemo(() => new Map(manifest.inst_map.raw.map((r, k) => [r, manifest.inst_map.canon[k]])), [manifest])
  /** Z0 star-disc alpha per sector ∝ 1/√(stars in sector) so dense sectors (Infrastructure, 1,789) stop reading as a blob. */
  const sectorAlpha = useMemo(() => {
    const out: Record<number, number> = {}
    for (const g of manifest.sectors) out[g.id] = Math.min(0.55, Math.max(0.2, 0.55 * Math.sqrt(250 / Math.max(g.n_stars, 1))))
    return out
  }, [manifest])
  const starOrder = useMemo(
    () => Int32Array.from(Array.from({ length: nStars }, (_, i) => i).sort((a, b) => S.v[b] - S.v[a])),
    [S, nStars],
  )
  const starTree = useMemo<Quadtree<number>>(
    () => quadtree<number>().x((i) => S.x[i]).y((i) => S.y[i]).addAll(Array.from({ length: nStars }, (_, i) => i)),
    [S, nStars],
  )
  const bodyTree = useMemo<Quadtree<number> | null>(
    () => (bodies ? quadtree<number>().x((i) => bodies.x[i]).y((i) => bodies.y[i]).addAll(Array.from({ length: bodies.n }, (_, i) => i)) : null),
    [bodies],
  )
  const starMinYear = useMemo(() => {
    const out = new Uint8Array(nStars).fill(255)
    if (bodies) for (let i = 0; i < bodies.n; i++) out[bodies.hostIdx[i]] = Math.min(out[bodies.hostIdx[i]], bodies.year[i])
    return out
  }, [bodies, nStars])
  const starNames = useMemo(() => S.name.map((n) => formatEntityName('institution', n, 'full')), [S])
  /** §2.6 density nebula: Σ tie money per star (remainder included), splatted + blurred once. */
  const nebula = useMemo(() => nebulaBitmap(manifest, colors.ink), [manifest, colors])

  // ── sky-dive data layers per star: its own risk level (avg indicator), «sigue firmando», drawn suppliers with señales ──
  const starLayer = useMemo(() => {
    if (!layers) return null
    const level = new Int8Array(nStars).fill(-1)
    const sigue = new Uint8Array(nStars)
    for (let i = 0; i < nStars; i++) {
      const a = layers.stars.avg[i]
      if (a != null) level[i] = a >= 0.6 ? 3 : a >= 0.4 ? 2 : a >= 0.25 ? 1 : 0 // getRiskLevelFromScore thresholds
      sigue[i] = layers.stars.post[i] > 0 ? 1 : 0
    }
    const senal = new Uint16Array(nStars)
    if (bodies) for (let k = 0; k < bodies.n; k++) if (layers.bodyBits[k] & layers.bits.senal) senal[bodies.hostIdx[k]]++
    return { level, sigue, senal }
  }, [layers, nStars, bodies])
  const layerRef = useRef({ layers, starLayer })
  layerRef.current = { layers, starLayer }

  // ── sky-dive L4: the lens layout. Only the framed sector's stars move: x by the share of their money in
  // high/critical contracts (risk) or by their first paid year (time), y by money (log, largest on top); sizes never change ──
  const lensTarget = useMemo(() => {
    const X = Float64Array.from(S.x), Y = Float64Array.from(S.y)
    // no framed sector: the overview arrangement (every agency, one chart)
    const all = lensSector == null
    const g = all ? LENS_ALL : sectorById.get(lensSector)
    if (!lens || !g || (lens >= 3 && !layers)) return { X, Y, moved: false, max: 0, lo: 0, hi: 0, u: 0 }
    // the x half-width (world): a disc's own box, or the overview chart across the canvas at the home zoom, with
    // 140 px each side for the money ticks (left) and the names of the 100% column (right)
    const { w: cw, s0 } = fit
    const u = all && s0 > 0 ? Math.max(LENS_U * g.r, (cw / 2 - 140) / s0) : LENS_U * g.r
    const inBox = (i: number) => all || S.sector[i] === g.id
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < nStars; i++) if (inBox(i) && S.v[i] > 0) { const l = Math.log10(S.v[i]); lo = Math.min(lo, l); hi = Math.max(hi, l) }
    // the money axis starts at 100 000 MXN: the few agencies below it sit on the floor (its tick says «≤»)
    lo = Math.min(Math.max(lo, LENS_FLOOR), hi)
    // count lenses: x = log(1 + n) over the sector's largest n; grade: x = grade / 10, ungraded in a column left of 0
    const count = (i: number) => lens === 3 ? layers!.stars.cap[i] : lens === 4 ? (starLayer?.senal[i] ?? 0) : layers!.stars.post[i]
    let max = 0
    if (lens >= 3 && lens <= 5) for (let i = 0; i < nStars; i++) if (inBox(i)) max = Math.max(max, count(i))
    for (let i = 0; i < nStars; i++) {
      if (!inBox(i)) continue
      let f = 0
      if (lens === 1) f = S.h[i]
      else if (lens === 2) { if (S.ym?.[i]) { let k = 2; while (k < DATA_LAST_YEAR - 2000 && !((S.ym[i] >>> k) & 1)) k++; f = (k - 2) / (DATA_LAST_YEAR - 2002) } }
      else if (lens === 6) { const gr = layers!.stars.grade[i]; f = gr == null ? -LENS_UNGRADED : gr / 10 }
      else f = max ? Math.log1p(count(i)) / Math.log1p(max) : 0
      const m = hi > lo && S.v[i] > 0 ? Math.max(0, (Math.log10(S.v[i]) - lo) / (hi - lo)) : 0
      X[i] = g.x + (2 * Math.min(1, Math.max(-LENS_UNGRADED, f)) - 1) * u
      Y[i] = g.y + (LENS_V1 - m * (LENS_V1 - LENS_V0)) * g.r
    }
    return { X, Y, moved: true, max, lo, hi, u }
  }, [lens, lensSector, S, nStars, sectorById, layers, starLayer, fit])
  const lensTgtRef = useRef(lensTarget)
  lensTgtRef.current = lensTarget
  /** the last lens drawn (kept through the glide back, so the axes fade out with the stars) */
  const lastLensRef = useRef<{ k: SkyLensIdx; max: number; lo: number; hi: number; u: number; sector: number | null }>({ k: 1, max: 0, lo: 0, hi: 0, u: 0, sector: null })
  /** the overview «Riesgo»: the names on the chart (top-right corner first), the reference share, the 0% column */
  const riesgo = useMemo(() => mapaRiesgo(S, null, 4), [S])
  const riesgoOrder = useMemo(() => Int32Array.from(riesgo?.order ?? []), [riesgo])
  const riesgoSector = useMemo(() => (lensSector != null ? mapaRiesgo(S, lensSector, 0) : null), [S, lensSector])
  /** the star positions drawn this frame (the chart, or a lens / a glide between the two) */
  const lensRef = useRef({ X: Float64Array.from(S.x), Y: Float64Array.from(S.y), fx: null as Float64Array | null, fy: null as Float64Array | null, tx: lensTarget.X, ty: lensTarget.Y, t0: 0, moved: false, on: false, all: false })

  // ── the located system's payload, resolved against the bin once ─────────
  const sys = useMemo(() => {
    if (!system || !bodies) return null
    const host = starIdx.get(system.star.id)
    if (host === undefined) return null
    const names = new Map<number, string>()
    const rows = new Map<number, SkySystem['bodies'][number]>()
    for (const b of system.bodies) { names.set(b.vendor_id, formatEntityName('vendor', b.name, 'full')); rows.set(b.vendor_id, b) }
    const ghosts = system.ghosts.map((g) => {
      const [x, y] = orbitXY(manifest, host, g.share, g.first_year)
      names.set(g.vendor_id, formatEntityName('vendor', g.name, 'full'))
      return { ...g, x, y, body: bodies.index.get(g.vendor_id) ?? -1 }
    }).filter((g) => g.body >= 0)
    const ghostTree = quadtree<number>().x((k) => ghosts[k].x).y((k) => ghosts[k].y).addAll(ghosts.map((_, k) => k))
    const capture = new Set(system.capture)
    const remMax = Math.max(1, ...system.remainder.map((r) => r[1]))
    return { host, names, rows, ghosts, ghostTree, capture, remMax }
  }, [system, bodies, starIdx, manifest])
  const sysRef = useRef(sys)
  sysRef.current = sys
  const moonsRef = useRef(moons)
  moonsRef.current = moons
  const selRef = useRef(selectedMoon)
  selRef.current = selectedMoon

  // ── projection ──────────────────────────────────────────────────────────
  const proj = () => {
    const { s0, ox, oy } = sizeRef.current
    const t = tRef.current
    return { rho: s0 * t.k, X0: ox * t.k + t.x, Y0: oy * t.k + t.y }
  }
  /** Screen x of the view centre: the free area left of the dock from Z1 on (deterministic in k). */
  const centreX = (k: number, res = perRef.current.reserve) => {
    const { w, s0 } = sizeRef.current
    return (w - (res || s0 * k >= Z1_RHO ? DOCK_PX : 0)) / 2
  }
  const camOf = (t: ZoomTransform, res = perRef.current.reserve): SkyCam => {
    const { h, s0, ox, oy } = sizeRef.current
    return { x: ((centreX(t.k, res) - t.x) / t.k - ox) / s0, y: ((h / 2 - t.y) / t.k - oy) / s0, k: t.k }
  }
  const transformFor = (cam: SkyCam): ZoomTransform => {
    const { h, s0, ox, oy } = sizeRef.current
    return zoomIdentity.translate(centreX(cam.k), h / 2).scale(cam.k).translate(-(cam.x * s0 + ox), -(cam.y * s0 + oy))
  }

  // ── location («ESTÁS EN»), computed on `end` ────────────────────────────
  const locate = (): SkyLocation => {
    const cam = camOf(tRef.current)
    const rho = sizeRef.current.s0 * cam.k
    const b = bodiesRef.current
    let star: number | null = null, body: number | null = null
    if (rho >= Z2_RHO && b && bodyTree) {
      const f = bodyTree.find(cam.x, cam.y, MOON_R * 1.5)
      if (f !== undefined) { body = f; star = b.hostIdx[f] }
    }
    if (star == null && rho >= Z1_RHO) {
      const f = starTree.find(cam.x, cam.y, 160)
      if (f !== undefined && Math.hypot(S.x[f] - cam.x, S.y[f] - cam.y) <= S.r[f] * 1.15) star = f
    }
    let sector: number | null = star != null ? S.sector[star] : null
    if (sector == null) {
      for (const g of manifest.sectors) if (Math.hypot(g.x - cam.x, g.y - cam.y) <= g.r) { sector = g.id; break }
    }
    const level = body != null ? 2 : star != null ? 1 : 0
    const g = sector != null ? sectorById.get(sector) : undefined
    const { w, h } = sizeRef.current
    const framed = level === 0 && !!g && g.r * rho >= FRAMED * Math.min(w, h - FOOT_PX)
    return { level, sector, star, body, framed }
  }

  // ── labels ──────────────────────────────────────────────────────────────
  /** sky-dive (owner: «careful with the names being covered by the dots»): from the cluster level down, every
   *  drawn dot / ring / moon / tether is a mark no label may touch (the overview keeps its labels as they were) */
  const lastMarksRef = useRef<Mark[]>([])
  const labelMarks = (): Mark[] => {
    const { w, h } = sizeRef.current
    const { rho, X0, Y0 } = proj()
    const loc = locRef.current
    const out: Mark[] = []
    const z1 = rho >= Z1_RHO, z2 = rho >= Z2_RHO
    // the overview «Riesgo» chart: its names stay clear of the dots too
    if (!z1 && !loc.framed && !(lensRef.current.all && lensRef.current.moved)) return out
    const on = (x: number, y: number) => x > -24 && x < w + 24 && y > -24 && y < h + 24
    const Lr = lensRef.current, XA = Lr.on && !z1 ? Lr.X : S.x, YA = Lr.on && !z1 ? Lr.Y : S.y
    const sl = layerRef.current.starLayer
    const overview = !z1 && !loc.framed
    if (overview && riesgo) {
      // the overview «Riesgo» chart: every name must land, so they only avoid the named dots (shrunk to 60%) and the
      // dashed «en conjunto» line, sampled every 8 px
      for (const i of riesgo.order) out.push([XA[i] * rho + X0, YA[i] * rho + Y0, starPx(S.v[i]) * 0.6 + 2, `s:${i}`])
      // CYAN 2026-11-04: the names also try to keep off the other big dots (≥ 3 px); a name that can't falls back to
      // its own row beside its dot (SkyLabels' last resort), so all of them still land
      const named = new Set(riesgo.order)
      for (let i = 0; i < nStars; i++) { const r = starPx(S.v[i]) * 0.6; if (r >= 3 && !named.has(i)) out.push([XA[i] * rho + X0, YA[i] * rho + Y0, r + 1, `o:${i}`]) }
      const lu = lastLensRef.current.u, ax0 = (LENS_ALL.x - lu) * rho + X0, xa = ax0 + riesgo.avg * 2 * lu * rho
      for (let y = (LENS_ALL.y + LENS_V0 * LENS_ALL.r) * rho + Y0; y < (LENS_ALL.y + LENS_AXIS * LENS_ALL.r) * rho + Y0; y += 8) out.push([xa, y, 2, ''])
      return out
    }
    for (let i = 0; i < nStars; i++) {
      const x = XA[i] * rho + X0, y = YA[i] * rho + Y0
      if (on(x, y)) out.push([x, y, starPx(S.v[i]) + (sl?.sigue[i] ? 4 : 1), `s:${i}`])
    }
    // the grade lens' pass rule at 6 / 10 is a mark (sampled)
    const lg = perRef.current.lensSector != null ? sectorById.get(perRef.current.lensSector) : undefined
    if (!z1 && lg && perRef.current.lens === 6) {
      const x6 = (lg.x + (2 * 0.6 - 1) * LENS_U * lg.r) * rho + X0
      for (let y = (lg.y + (LENS_V0 - 0.02) * lg.r) * rho + Y0; y < (lg.y + LENS_AXIS * lg.r) * rho + Y0; y += 8) out.push([x6, y, 2, ''])
    }
    const b = bodiesRef.current, ly = layerRef.current.layers
    if (z1 && b) {
      for (let i = 0; i < b.n; i++) {
        const x = b.x[i] * rho + X0, y = b.y[i] * rho + Y0
        if (!on(x, y)) continue
        const ring = ly && ly.bodyBits[i] & ly.bits.sigue ? 8 : (b.flags2[i] & 4) ? 6 : (b.flags[i] & 2) ? 4 : 2
        out.push([x, y, b.rp[i] + ring, `b:${i}`])
      }
      // the captura tether is a mark too (sampled every 8 px)
      const s = sysRef.current
      if (perRef.current.overlay === 'captura' && ly && s && !z2) {
        const hx = S.x[s.host] * rho + X0, hy = S.y[s.host] * rho + Y0
        for (let i = 0; i < b.n; i++) {
          if (b.hostIdx[i] !== s.host || !(ly.bodyBits[i] & ly.bits.captura)) continue
          const x = b.x[i] * rho + X0, y = b.y[i] * rho + Y0, n = Math.ceil(Math.hypot(x - hx, y - hy) / 8)
          for (let k = 1; k < n; k++) out.push([x + ((hx - x) * k) / n, y + ((hy - y) * k) / n, 2, ''])
        }
      }
    }
    const ms = moonsRef.current
    if (z2 && b && ms && loc.body === ms.body) {
      for (const m of ms.moons) { const [mx, my] = moonXY(m, b, ms.body); out.push([mx * rho + X0, my * rho + Y0, 5, '']) }
      for (const a of perRef.current.apagon ?? []) {
        const phi = theta(a.t), l = perRef.current.moonLens ? MOON_R * 1.06 : moonL(a.amount)
        out.push([(b.x[ms.body] + l * Math.cos(phi)) * rho + X0, (b.y[ms.body] + l * Math.sin(phi)) * rho + Y0, 5, ''])
      }
    }
    return out
  }
  const refreshLabels = () => {
    const { w, h } = sizeRef.current
    const { rho, X0, Y0 } = proj()
    const loc = locRef.current
    const s = sysRef.current
    const dropped: string[] = []
    const slots = chooseLabels({
      w: w - (perRef.current.reserve || rho >= Z1_RHO ? DOCK_PX : 0), h: h - 26, rho, X0, Y0, level: rho >= Z2_RHO && loc.body != null ? 2 : rho >= Z1_RHO ? 1 : 0, lang, manifest,
      starOrder, starNames, sectorColor: perRef.current.hues ? colors.hue : colors.sector, bodies: bodiesRef.current,
      system: s && loc.star === s.host ? system : null, bodyNames: s?.names ?? new Map(), focusBody: loc.body,
      // S5 A4: the finder, the stamp rows and the zoom buttons as they are actually laid out
      reserved: [...(furnRectsRef.current = furniture()), ...(rimPx && rho >= Z1_RHO ? rimBand(w - DOCK_PX, h, rimPx) : [])],
      framed: rho < Z1_RHO && loc.framed ? loc.sector : null,
      marks: (lastMarksRef.current = labelMarks()), dropped,
      ...(lensRef.current.on && rho < Z1_RHO ? { starX: lensRef.current.X, starY: lensRef.current.Y } : {}),
      // the overview «Riesgo» chart names its top-right corner (the most money at high or critical risk), with the share
      ...(perRef.current.lens === 1 && perRef.current.lensSector == null && rho < Z1_RHO ? { riskOrder: riesgoOrder } : {}),
    })
    slotsRef.current = slots
    writeLabels(slots, labelRefs.current)
    const key = dropped.join()
    if (key !== droppedKey.current) { droppedKey.current = key; cb.current.onUnlabeled?.(dropped) }
    lastLabelRef.current = performance.now()
  }
  labelsRef.current = refreshLabels
  /** Canvas furniture rects in canvas px (+4 px air), measured from the DOM so a label is never placed under it. */
  const furniture = (): [number, number, number, number][] => {
    const wrap = wrapRef.current
    const { h } = sizeRef.current
    if (!wrap) return [[0, h - 236, 190, 236], [190, h - 90, 560, 90]]
    const o = wrap.getBoundingClientRect()
    const els = [...(furnRef.current?.children ?? []), zoomBtnRef.current, panelRef.current].filter((el): el is Element => !!el)
    return els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
      .map((r) => [r.left - o.left - 4, r.top - o.top - 4, r.width + 8, r.height + 8])
  }

  // ── draw helpers ────────────────────────────────────────────────────────
  const drawDust = (ctx: CanvasRenderingContext2D, b: SkyBodies, rho: number, X0: number, Y0: number, w: number, h: number, fade = 1) => {
    // sky-dive L4: a body's dust rides its host star's lens offset
    const L = lensRef.current, lx = L.on ? L.X : null, ly = L.on ? L.Y : null
    // owner 11-06 «both lenses»: «Sectores» batches the dust by its host's sector hue; otherwise by risk class
    const paths = new Map<number, Path2D>()
    const dim = new Path2D()
    const { period: per, year: yr, hues: hue } = perRef.current
    const pq = per != null && yr == null ? b.period[per] : null
    const sel = pq != null || yr != null
    for (let i = 0; i < b.n; i++) {
      const hi = b.hostIdx[i]
      const sx = (lx ? b.x[i] + lx[hi] - S.x[hi] : b.x[i]) * rho + X0, sy = (ly ? b.y[i] + ly[hi] - S.y[hi] : b.y[i]) * rho + Y0
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue
      // with a sexenio (or the rail year, which wins) selected the lit dust is 2 px so the selection reads at Z0
      if (yr != null ? !hasYear(b.ym[i], yr) : pq && !pq[i]) dim.rect(sx, sy, 1, 1)
      else {
        const key = hue ? S.sector[hi] : b.risk[i]
        let p = paths.get(key)
        if (!p) paths.set(key, (p = new Path2D()))
        p.rect(sx, sy, sel ? 2 : 1, sel ? 2 : 1)
      }
    }
    // CYAN-2: one accent — high and critical suppliers are red (high lighter), low and medium stay quiet
    for (const [c, p] of paths) {
      ctx.globalAlpha = (hue ? 0.6 : [0.25, 0.25, 0.55, 0.9][c]) * fade
      ctx.fillStyle = hue ? colors.hue[c] : colors.risk[c]
      ctx.fill(p)
    }
    // §3.8: bodies with no money in the selected sexenio dim to 8% (positions never move)
    ctx.globalAlpha = 0.08 * fade
    ctx.fillStyle = colors.ink
    ctx.fill(dim)
    ctx.globalAlpha = 1
  }

  /** Rim names placed this frame — a colliding name is dropped (the arrow stays). */
  const rimNames: [number, number, number, number][] = []
  /** S2 carry-over: the stamp rows + finder (bottom-left) and the zoom buttons are reserved; arrows stop above them. */
  const reserve = (w: number, h: number) => {
    const f = furnRectsRef.current
    if (f.length) for (const [x, y, fw, fh] of f) rimNames.push([x, y, x + fw, y + fh])
    else rimNames.push([0, h - 240, 200, h], [200, h - 92, 760, h], [w - 60, h - FOOT_PX - 110, w, h])
  }
  /** S5 A4: canvas caption text (current font / align / baseline) drawn only where no furniture or rim name sits */
  const capText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, rim = false) => {
    const tw = ctx.measureText(text).width
    const x0 = ctx.textAlign === 'right' ? x - tw : ctx.textAlign === 'center' ? x - tw / 2 : x
    const y0 = ctx.textBaseline === 'bottom' ? y - 12 : ctx.textBaseline === 'middle' ? y - 6 : y
    if (rimNames.some(([a, b, c, d]) => x0 < c && x0 + tw > a && y0 < d && y0 + 12 > b)) return
    // CYAN 2026-11-04 (overlapping labels): a long caption (`rim`) never runs under the compass tags, which ride a
    // ~112 px band inside the free canvas's rim at an agency or a supplier (SkyCompass) — it is left out instead
    if (!rim) { ctx.fillText(text, x, y); return }
    const { w: cw, h: ch, s0 } = sizeRef.current
    const fw = cw - (perRef.current.reserve || s0 * tRef.current.k >= Z1_RHO ? DOCK_PX : 0)
    if (x0 < RIM_PX || x0 + tw > fw - RIM_PX || y0 < RIM_PX / 2.5 || y0 + 12 > ch - FOOT_PX - RIM_PX / 2.5) return
    ctx.fillText(text, x, y)
  }
  /** Line a → b in screen px; if b is off-screen (or under the dock), stop at the rim with an arrow and a name (§2.3 / §2.5). */
  const edgeLine = (ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, name: string | null) => {
    const { h, s0 } = sizeRef.current
    const w = sizeRef.current.w - (perRef.current.reserve || s0 * tRef.current.k >= Z1_RHO ? DOCK_PX : 0)
    const pad = 14
    const inside = bx >= pad && bx <= w - pad && by >= pad && by <= h - FOOT_PX - 40
    let ex = bx, ey = by
    if (!inside) {
      const dx = bx - ax, dy = by - ay
      let t = 1
      if (dx > 0) t = Math.min(t, (w - pad - ax) / dx)
      if (dx < 0) t = Math.min(t, (pad - ax) / dx)
      if (dy > 0) t = Math.min(t, (h - FOOT_PX - 40 - ay) / dy)
      if (dy < 0) t = Math.min(t, (pad - ay) / dy)
      t = Math.max(0, t)
      ex = ax + dx * t
      ey = ay + dy * t
    }
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    if (!inside) {
      const a = Math.atan2(ey - ay, ex - ax)
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - 7 * Math.cos(a - 0.4), ey - 7 * Math.sin(a - 0.4))
      ctx.lineTo(ex - 7 * Math.cos(a + 0.4), ey - 7 * Math.sin(a + 0.4))
      ctx.closePath()
      ctx.fill()
      if (name) {
        ctx.save()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        ctx.font = `12px ${FONT_MONO}`
        const tw = ctx.measureText(name).width
        const right = ex > w / 2, below = ey > h / 2
        const tx = ex + (right ? -10 : 10), ty = ey + (below ? -6 : 6)
        const x0 = right ? tx - tw : tx, y0 = below ? ty - 12 : ty
        if (!rimNames.some(([a, b, c, d]) => x0 < c && x0 + tw > a && y0 < d && y0 + 14 > b)) {
          rimNames.push([x0, y0, x0 + tw, y0 + 14])
          ctx.fillStyle = colors.bg
          ctx.globalAlpha = 0.85
          ctx.fillRect(x0 - 2, y0 - 1, tw + 4, 16)
          ctx.globalAlpha = 1
          ctx.fillStyle = colors.ink
          ctx.textAlign = right ? 'right' : 'left'
          ctx.textBaseline = below ? 'bottom' : 'top'
          ctx.fillText(name, tx, ty)
        }
        ctx.restore()
      }
    }
  }

  const moonXY = (m: Moon, b: SkyBodies, bi: number) => {
    // sky-dive moon lens: distance = amount (the engraved rings) or = the contract's indicator (centre 0 → rim 1, no rings)
    const phi = theta(m.t), l = perRef.current.moonLens ? MOON_R * (0.15 + 0.85 * Math.min(1, Math.max(0, m.riskScore ?? 0))) : moonL(m.amount)
    return [b.x[bi] + l * Math.cos(phi), b.y[bi] + l * Math.sin(phi)] as [number, number]
  }

  // ── draw ────────────────────────────────────────────────────────────────
  const draw = () => {
    rafRef.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const { w, h } = sizeRef.current
    if (!ctx || w === 0) return
    const { rho, X0, Y0 } = proj()
    const k = tRef.current.k
    const z1 = rho >= Z1_RHO
    const z2 = rho >= Z2_RHO
    const wx0 = -X0 / rho, wx1 = (w - X0) / rho, wy0 = -Y0 / rho, wy1 = (h - Y0) / rho
    const inView = (x: number, y: number, r: number) => x + r > wx0 && x - r < wx1 && y + r > wy0 && y - r < wy1
    const sx = (x: number) => x * rho + X0
    const sy = (y: number) => y * rho + Y0
    const loc = locRef.current
    const s = sysRef.current && loc.star === sysRef.current.host ? sysRef.current : null
    const hov = hoverRef.current
    // sky-dive L4: glide the lens (600 ms); from Z1 on the chart's own positions rule (engraving, orbits)
    const L = lensRef.current
    let lensE = 1
    if (L.fx && L.fy) {
      const a = Math.min(1, (performance.now() - L.t0) / LENS_MS)
      lensE = easeCubicInOut(a)
      for (let i = 0; i < nStars; i++) { L.X[i] = L.fx[i] + (L.tx[i] - L.fx[i]) * lensE; L.Y[i] = L.fy[i] + (L.ty[i] - L.fy[i]) * lensE }
      if (a >= 1) { L.fx = L.fy = null; L.on = L.moved }
    }
    const lensOn = L.on && !z1
    /** 0 = the constellation, 1 = the overview «Riesgo» chart (eases with the glide) */
    const gE = L.all && !z1 ? (L.fx ? (L.moved ? lensE : 1 - lensE) : L.moved ? 1 : 0) : 0
    const LX: ArrayLike<number> = lensOn ? L.X : S.x, LY: ArrayLike<number> = lensOn ? L.Y : S.y
    ctx.setLineDash([])
    rimNames.length = 0
    reserve(w - (z1 || perRef.current.reserve ? DOCK_PX : 0), h)
    // S2 carry-over + S5 A4: the Z2 caption band is placed before any thread or rim name is drawn, so those
    // names yield to it (a colliding name is dropped, its arrow stays); first spot clear of furniture and
    // names wins — under the disc, beside the finder above the stamps, above the finder, top-left
    let cap: { caps: string[]; x: number; y: number; w: number; h: number } | null = null
    {
      const bb = bodiesRef.current, ms0 = moonsRef.current, bi = loc.body
      if (bb && z2 && bi != null && ms0 && ms0.body === bi) {
        const cx = sx(bb.x[bi]), cy = sy(bb.y[bi])
        const capY = cy + MOON_R * rho + 8
        const loc$ = lang === 'en' ? 'en-US' : 'es-MX'
        const caps = [
          ms0.total != null ? skyCopy('moonCap', lang, { n: ms0.moons.length, N: ms0.total.toLocaleString(loc$) }) : '',
          skyCopy('moonRemainder', lang, { amt: formatCompactMXN(ms0.smallest) }),
          ms0.skipped > 0 ? skyCopy('moonOmitted', lang, { n: ms0.skipped.toLocaleString(loc$) }) : '',
          ms0.undated > 0 ? skyCopy('moonUndated', lang, { n: ms0.undated.toLocaleString(loc$) }) : '',
        ].filter(Boolean)
        ctx.font = `12px ${FONT_MONO}`
        const capW = Math.max(...caps.map((c) => ctx.measureText(c).width)) + 8
        const capH = 16 * caps.length + 4
        const furn = furnRectsRef.current
        const clear = (x: number, y: number) => x - capW / 2 >= 0 && y - 2 >= 0 && y - 2 + capH <= h &&
          !rimNames.some(([a, b2, c, d]) => x - capW / 2 < c && x + capW / 2 > a && y - 2 < d && y - 2 + capH > b2)
        const spots: [number, number][] = [[cx, capY]]
        if (furn.length >= 2) spots.push([furn[0][0] + furn[0][2] + 4 + capW / 2, furn[1][1] - capH - 2])
        if (furn.length >= 1) spots.push([furn[0][0] + 4 + capW / 2, furn[0][1] - capH - 2])
        spots.push([8 + capW / 2, 10])
        const [x, y] = spots.find(([sx_, sy_]) => clear(sx_, sy_)) ?? spots[Math.min(2, spots.length - 1)]
        cap = { caps, x, y, w: capW, h: capH }
        rimNames.push([x - capW / 2, y - 2, x + capW / 2, y - 2 + capH])
      }
    }
    const { period: per, sizeByPeriod: bySize, pulse: pul, year: yr } = perRef.current

    ctx.globalAlpha = 1
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, w, h)
    // §2.6 nebula at far zoom, cross-fading out over k 1.6 → 2.4
    if (k < 2.4) {
      ctx.globalAlpha = 0.22 * Math.min(1, (2.4 - k) / 0.8) * (1 - gE)
      ctx.drawImage(nebula, X0, Y0, WORLD * rho, WORLD * rho)
      ctx.globalAlpha = 1
    }

    // owner 11-06 «both lenses»: sector hues under «Sectores», one quiet ink otherwise
    const secCol = perRef.current.hues ? colors.hue : colors.sector
    for (const g of manifest.sectors) {
      if (!inView(g.x, g.y, g.r)) continue
      ctx.beginPath()
      ctx.arc(sx(g.x), sy(g.y), g.r * rho, 0, Math.PI * 2)
      ctx.globalAlpha = 0.035 * (1 - gE)
      ctx.fillStyle = secCol[g.id]
      ctx.fill()
      ctx.globalAlpha = 0.3 * (1 - gE)
      ctx.strokeStyle = secCol[g.id]
      ctx.lineWidth = 0.75
      ctx.stroke()
    }
    ctx.globalAlpha = 1


    // Z1 engraving: sexenio spokes, seam notch
    let focus = -1, focusD = Infinity
    const engraved = new Uint8Array(nStars)
    if (z1) {
      const spokes = new Path2D(), seam = new Path2D()
      for (let i = 0; i < nStars; i++) {
        const R = S.r[i]
        if (R * rho < ENGRAVE_MIN_PX || !inView(S.x[i], S.y[i], R)) continue
        engraved[i] = 1
        const cx = sx(S.x[i]), cy = sy(S.y[i])
        for (const a of ADMINISTRATIONS) {
          if (a.yearStart <= 2002 || a.yearStart > DATA_LAST_YEAR) continue
          const th = theta(a.yearStart)
          spokes.moveTo(cx + Math.cos(th) * R * R_CORE * rho, cy + Math.sin(th) * R * R_CORE * rho)
          spokes.lineTo(cx + Math.cos(th) * R * rho, cy + Math.sin(th) * R * rho)
        }
        seam.moveTo(cx, cy - R * rho)
        seam.lineTo(cx, cy - R * rho * 1.07)
        const d = Math.hypot(cx - centreX(k), cy - h / 2)
        if (R * rho >= LABEL_FOCUS_PX && d < focusD) { focus = i; focusD = d }
      }
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 0.5
      ctx.globalAlpha = 0.22
      ctx.stroke(spokes)
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1
      ctx.stroke(seam)
      ctx.globalAlpha = 1
      // §3.8: the selected sexenio's wedge, tinted 6% ochre on every engraved system
      if (per != null) {
        const a = ADMINISTRATIONS[per]
        const t0 = Math.max(a.yearStart, 2001), t1 = Math.min(a.yearEnd + 1, DATA_LAST_YEAR + 1)
        const wedge = new Path2D()
        for (let i = 0; i < nStars; i++) {
          if (!engraved[i]) continue
          const R = S.r[i] * rho, cx = sx(S.x[i]), cy = sy(S.y[i])
          wedge.moveTo(cx + R * Math.cos(theta(t0)), cy + R * Math.sin(theta(t0)))
          wedge.arc(cx, cy, R, theta(t0), theta(t1))
          wedge.arc(cx, cy, R * R_CORE, theta(t1), theta(t0), true)
          wedge.closePath()
        }
        ctx.globalAlpha = 0.06
        ctx.fillStyle = colors.accent
        ctx.fill(wedge)
        ctx.globalAlpha = 1
      }
      // instruments §3.3 «La Manecilla»: 1 px ochre hand, core → rim at θ(yr + 0.5); the year at the focused rim
      if (yr != null && !z2) {
        const hand = new Path2D(), th = theta(yr + 0.5)
        for (let i = 0; i < nStars; i++) {
          if (!engraved[i]) continue
          const R = S.r[i] * rho, cx = sx(S.x[i]), cy = sy(S.y[i])
          hand.moveTo(cx + Math.cos(th) * R * R_CORE, cy + Math.sin(th) * R * R_CORE)
          hand.lineTo(cx + Math.cos(th) * R * 1.04, cy + Math.sin(th) * R * 1.04)
        }
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.95
        ctx.stroke(hand)
        ctx.globalAlpha = 1
      }
    }
    // §2.4 / §3.9: a searched band member pulses its year segment on the host's rim (≈ 2.4 s)
    if (pul) {
      const age = performance.now() - pul.at
      if (age < 2400) {
        const i = pul.star, R = S.r[i] * rho
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = Math.max(3, 0.06 * R)
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(age / 240))
        ctx.beginPath()
        ctx.arc(sx(S.x[i]), sy(S.y[i]), 1.07 * R, theta(pul.year), theta(pul.year + 1))
        ctx.stroke()
        ctx.globalAlpha = 1
        requestAnimationFrame(() => requestDraw())
      }
    }

    // §2.4 remainder track on the located star's rim: 1.04–1.10·R_sys, per-year opacity
    if (s && !z2) {
      const i = s.host, R = S.r[i], cx = sx(S.x[i]), cy = sy(S.y[i])
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = Math.max(2, 0.06 * R * rho)
      for (const [yr, val] of system!.remainder) {
        ctx.globalAlpha = 0.08 + 0.5 * (val / s.remMax)
        ctx.beginPath()
        ctx.arc(cx, cy, 1.07 * R * rho, theta(yr), theta(yr + 1) - 0.004)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.font = `12px ${FONT_MONO}`
      ctx.fillStyle = colors.muted
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(skyCopy('remainder', lang), cx, cy + 1.13 * R * rho)
    }

    const b = bodies
    // tenure arcs (hairline on r, θ(first) → θ(last + 1)) + capture belts
    if (b && z1) {
      const arcs = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
      for (let i = 0; i < b.n; i++) {
        const hidx = b.hostIdx[i]
        if (!engraved[hidx]) continue
        const r = b.orb[i] * rho, cx = sx(S.x[hidx]), cy = sy(S.y[hidx])
        const a0 = theta(2000 + b.year[i]), a1 = theta(2000 + b.y1[i] + 1)
        arcs[b.risk[i]].moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0))
        arcs[b.risk[i]].arc(cx, cy, r, a0, a1)
      }
      ctx.lineWidth = 0.75
      for (let c = 0; c < 4; c++) {
        ctx.globalAlpha = c === 0 ? 0.3 : 0.45
        ctx.strokeStyle = colors.risk[c]
        ctx.stroke(arcs[c])
      }
      if (s && s.capture.size) {
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = 3
        ctx.font = `12px ${FONT_MONO}`
        ctx.fillStyle = colors.accent
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        for (const v of s.capture) {
          const i = b.index.get(v)
          if (i === undefined) continue
          const r = b.orb[i] * rho, cx = sx(S.x[s.host]), cy = sy(S.y[s.host])
          const a0 = theta(2000 + b.year[i]), a1 = theta(2000 + b.y1[i] + 1)
          ctx.globalAlpha = 0.35
          ctx.beginPath()
          ctx.arc(cx, cy, r, a0, a1)
          ctx.stroke()
          ctx.globalAlpha = 1
          const am = (a0 + a1) / 2
          ctx.fillText(skyCopy('capture', lang), cx + (r + 8) * Math.cos(am), cy + (r + 8) * Math.sin(am))
        }
      }
      ctx.globalAlpha = 1
    }

    // stars, batched by sector colour; Z0 alpha ∝ 1/√(stars in sector)
    const starPaths = new Map<number, Path2D>()
    const starsOff = new Path2D()   // instruments F17: a star with no money in the rail year is a hairline ring
    // sky-dive layers: as a sector disc fills the view (cluster level and deeper) its stars cross-fade from the
    // sector hue to their OWN risk level (avg indicator); the overview (every disc < 30% of the short side) is unchanged
    const SL = layerRef.current.starLayer
    const minSide = Math.min(w, h - FOOT_PX)
    const fade = new Map<number, number>()
    if (SL) for (const g of manifest.sectors) fade.set(g.id, z1 ? 1 : Math.min(1, Math.max(0, (g.r * rho / minSide - FRAMED) / 0.12)))
    const lvPaths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
    const sigue = new Path2D()
    const lvAlpha = new Map<number, number>()
    for (let i = 0; i < nStars; i++) {
      // on the overview «Riesgo» chart height already says money: the discs shrink to 60% so 3,755 of them stay legible
      const r = starPx(S.v[i]) * (1 - 0.4 * gE)
      if (!inView(LX[i], LY[i], r / rho)) continue
      if (yr != null && S.ym && !hasYear(S.ym[i], yr)) {
        starsOff.moveTo(sx(LX[i]) + r, sy(LY[i]))
        starsOff.arc(sx(LX[i]), sy(LY[i]), r, 0, Math.PI * 2)
        continue
      }
      const cx = sx(LX[i]), cy = sy(LY[i])
      // «Sectores» keeps the framed sector's stars in its hue (no risk red there, owner 11-06)
      const t = SL && !perRef.current.hues && SL.level[i] >= 0 ? fade.get(S.sector[i]) ?? 0 : 0
      if (t > 0) {
        lvPaths[SL!.level[i]].moveTo(cx + r, cy)
        lvPaths[SL!.level[i]].arc(cx, cy, r, 0, Math.PI * 2)
        lvAlpha.set(S.sector[i], t)
        // «sigue firmando»: signed in ComprasMX after the blackout — a 1 px ink ring, never a colour
        if (SL!.sigue[i]) { sigue.moveTo(cx + r + 3, cy); sigue.arc(cx, cy, r + 3, 0, Math.PI * 2) }
        if (t >= 1) continue
      }
      const key = gE > 0 && S.h[i] >= RISKY_SHARE ? RISKY : S.sector[i]
      let p = starPaths.get(key)
      if (!p) starPaths.set(key, (p = new Path2D()))
      p.moveTo(cx + r, cy)
      p.arc(cx, cy, r, 0, Math.PI * 2)
    }
    for (const [g, p] of starPaths) {
      // a selected sexenio quiets the Z0 star discs so the lit dust carries the view; on the overview «Riesgo»
      // chart the discs carry everything, so they firm up to 0.8 with a surface ring where they overlap
      const a0 = z1 ? 0.9 : (sectorAlpha[g] ?? 0.55) * (per != null || yr != null ? 0.45 : 1)
      ctx.globalAlpha = (a0 + ((g === RISKY ? 0.85 : 0.45) - a0) * gE) * (1 - (lvAlpha.get(g) ?? 0))
      ctx.fillStyle = secCol[g]
      ctx.fill(p)
      if (gE > 0) {
        ctx.globalAlpha = gE
        ctx.strokeStyle = colors.bg
        ctx.lineWidth = 1
        ctx.stroke(p)
      }
    }
    if (lvAlpha.size) {
      // one alpha for the level fill: the most-framed sector's (sectors frame one at a time)
      const t = Math.max(...lvAlpha.values())
      for (let c = 0; c < 4; c++) {
        ctx.globalAlpha = t * (c === 0 ? 0.75 : 0.95) * (per != null || yr != null ? 0.6 : 1)
        ctx.fillStyle = colors.risk[c]
        ctx.fill(lvPaths[c])
      }
      ctx.globalAlpha = 0.45 * t
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1
      ctx.stroke(sigue)
    }
    if (yr != null) {
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 0.75
      ctx.stroke(starsOff)
    }
    ctx.globalAlpha = 1
    // sky-dive L4: the lens axes (the framed disc, or the whole sky for the overview «Riesgo») — fade in with the
    // glide, out with the glide back (the last lens is kept, so the way back has its axes too)
    if (!z1 && (L.moved || L.fx)) {
      const tg = lensTgtRef.current
      if (perRef.current.lens && tg.moved) lastLensRef.current = { k: perRef.current.lens, max: tg.max, lo: tg.lo, hi: tg.hi, u: tg.u, sector: perRef.current.lensSector }
      const { k: lk, max: lmax, lo, hi, u: lu, sector: ls } = lastLensRef.current
      const lg = ls == null ? LENS_ALL : sectorById.get(ls)
      if (lg) {
      const alpha = L.moved ? lensE : 1 - lensE
      const ay = sy(lg.y + LENS_AXIS * lg.r), ax0 = sx(lg.x - lu), ax1 = sx(lg.x + lu)
      const yTop = sy(lg.y + LENS_V0 * lg.r), yBot = sy(lg.y + LENS_V1 * lg.r)
      const loc$ = lang === 'en' ? 'en-US' : 'es-MX'
      // the money axis: hairlines at 1 MDP · 100 MDP · 10 000 MDP · 1 billón (the ones inside the range), labels left
      ctx.globalAlpha = alpha * 0.14
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1
      ctx.beginPath()
      const yTicks: [number, string][] = []
      const tickName = skyCopy('lensTicks', lang).split(' · ')
      for (const [n, e] of [LENS_FLOOR, 6, 8, 10, 12].entries()) {
        if (hi <= lo || e < lo || e > hi || (e === LENS_FLOOR && lo !== LENS_FLOOR)) continue
        const y = yBot + ((e - lo) / (hi - lo)) * (yTop - yBot)
        yTicks.push([y, tickName[n]])
        ctx.moveTo(ax0, y); ctx.lineTo(ax1, y)
      }
      ctx.stroke()
      ctx.globalAlpha = alpha
      ctx.font = `12px ${FONT_MONO}`
      ctx.fillStyle = colors.muted
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const [y, t] of yTicks) ctx.fillText(t, ax0 - 6, y)
      ctx.strokeStyle = ctx.fillStyle = colors.ink
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay)
      const ticks: [number, string][] = lk === 1
        ? [0, 0.25, 0.5, 0.75, 1].map((f) => [f, `${f * 100}%`])
        : lk === 2 ? [2002, 2008, 2014, 2020, DATA_LAST_YEAR].map((y) => [(y - 2002) / (DATA_LAST_YEAR - 2002), String(y)])
        : lk === 6 ? [[-LENS_UNGRADED, '—'], ...[0, 2, 4, 6, 8, 10].map((g) => [g / 10, String(g)] as [number, string])]
        // count lenses: log(1 + n) ticks at 0, ~√max and max
        : [0, 0.5, 1].map((f) => [f, Math.round(Math.expm1(f * Math.log1p(lmax))).toLocaleString(loc$)])
      for (const [f] of ticks) { const x = ax0 + f * (ax1 - ax0); ctx.moveTo(x, ay); ctx.lineTo(x, ay + 5) }
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = colors.muted
      for (const [f, t] of ticks) ctx.fillText(t, ax0 + f * (ax1 - ax0), ay + 8)
      ctx.fillStyle = colors.ink
      ctx.fillText(skyCopy((['', 'lensAxisRisk', 'lensAxisTime', 'lensAxisCaptura', 'lensAxisSenales', 'lensAxisApagon', 'lensAxisGrade'] as const)[lk] || 'lensAxisRisk', lang), (ax0 + ax1) / 2, ay + 26)
      if (lk === 6) {
        // the pass line at 6 / 10 (ink, not red: a grade is not a risk indicator)
        const x6 = ax0 + 0.6 * (ax1 - ax0)
        ctx.globalAlpha *= 0.5
        ctx.beginPath(); ctx.moveTo(x6, ay); ctx.lineTo(x6, sy(lg.y + (LENS_V0 - 0.02) * lg.r)); ctx.stroke()
        ctx.globalAlpha = alpha
      }
      if (lk === 1) {
        // «Riesgo»: the money-weighted share of everything on the chart (dashed), and the corner that answers the
        // page question, in words
        const r = ls == null ? riesgo : ls === perRef.current.lensSector ? riesgoSector : null
        if (r) {
          const xa = ax0 + r.avg * (ax1 - ax0)
          ctx.globalAlpha = alpha * 0.6
          ctx.setLineDash([3, 3])
          ctx.beginPath(); ctx.moveTo(xa, ay); ctx.lineTo(xa, yTop - 4); ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = alpha
          ctx.fillStyle = colors.muted
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText(skyCopy('lensAvg', lang, { x: Math.round(r.avg * 100) }), xa + 4, ay - 4)
        }
        ctx.fillStyle = colors.ink
        ctx.font = `italic 14px ${FONT_SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(skyCopy('lensCorner', lang), ax1, yTop - 44)
        ctx.font = `12px ${FONT_MONO}`
      }
      ctx.fillStyle = colors.ink
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(skyCopy('lensAxisMoney', lang), ax0, yTop - 44)
      ctx.globalAlpha = 1
      }
    }
    if (L.fx) requestDraw()

    // focus for threads: hovered body, the body behind a hovered ghost, else the located planet
    let fb = -1
    if (hov?.kind === 'body') fb = hov.idx
    else if (hov?.kind === 'ghost' && s) fb = s.ghosts[hov.idx].body
    // sky-dive: at Z2 the planet's threads wait for a hover on it, or the dock's «Vínculos» switch (Z3: the moon's thread stands alone)
    else if (z2 && loc.body != null && selRef.current == null && perRef.current.links) fb = loc.body

    if (b && z1) {
      // ── threads (under the bodies) ─────────────────────────────────────
      if (fb >= 0) {
        const fx = sx(b.x[fb]), fy = sy(b.y[fb])
        const row = s?.rows.get(b.vendorId[fb])
        if (hov?.kind === 'ghost' && s) {
          const g = s.ghosts[hov.idx]
          ctx.strokeStyle = ctx.fillStyle = colors.accent
          ctx.lineWidth = 0.75
          edgeLine(ctx, sx(g.x), sy(g.y), fx, fy, starNames[b.hostIdx[fb]])
        }
        if (row) {
          // memberships at other stars (ghost threads), ≤ 12 then a count
          ctx.strokeStyle = ctx.fillStyle = colors.accent
          ctx.lineWidth = 0.75
          ctx.globalAlpha = 0.8
          for (const [inst, val, fy0] of row.also) {
            const j = starIdx.get(inst)
            if (j === undefined) continue
            const [gx, gy] = orbitXY(manifest, j, val / S.v[j], fy0 ?? 2002)
            edgeLine(ctx, fx, fy, sx(gx), sy(gy), starNames[j])
            ctx.beginPath()
            ctx.arc(sx(gx), sy(gy), b.rp[fb], 0, Math.PI * 2)
            ctx.stroke()
          }
          if (row.n_also > row.also.length) {
            ctx.font = `12px ${FONT_MONO}`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(`+${row.n_also - row.also.length}`, fx + b.rp[fb] + 4, fy + b.rp[fb] + 2)
          }
          // co-bid threads: dashed zinc, red dashed for a ranking-safe potential-collusion pair
          ctx.setLineDash([4, 3])
          ctx.lineWidth = 1
          let k2 = 0
          for (const [a, p, , red] of system!.cobid) {
            if (a !== b.vendorId[fb]) continue
            ctx.strokeStyle = ctx.fillStyle = red ? colors.risk[3] : colors.muted
            ctx.globalAlpha = 0.85
            const pi = b.index.get(p)
            if (pi !== undefined) {
              edgeLine(ctx, fx, fy, sx(b.x[pi]), sy(b.y[pi]), null)
            } else {
              // no body: an open circle at the viewport rim, «fuera de la carta»
              const ang = ((p * 2654435761) % 360) * (Math.PI / 180)
              const fw = w - DOCK_PX, R0 = Math.min(fw, h - FOOT_PX) / 2 - 24
              const ex = Math.min(fw - 16, Math.max(16, fw / 2 + R0 * Math.cos(ang))), ey = Math.min(h - FOOT_PX, Math.max(16, h / 2 + R0 * Math.sin(ang)))
              ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey); ctx.stroke()
              ctx.setLineDash([])
              ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.stroke()
              if (k2++ === 0) {
                ctx.font = `12px ${FONT_MONO}`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillText(skyCopy('offChart', lang), ex, ey + 6)
              }
              ctx.setLineDash([4, 3])
            }
          }
          ctx.setLineDash([])
          // verified corporate group: solid ink hairline to drawn siblings
          ctx.strokeStyle = ctx.fillStyle = colors.ink
          ctx.lineWidth = 0.75
          ctx.globalAlpha = 0.7
          for (const sib of row.siblings) {
            const si = b.index.get(sib)
            if (si !== undefined) edgeLine(ctx, fx, fy, sx(b.x[si]), sy(b.y[si]), null)
          }
          ctx.globalAlpha = 1
        }
      }

      // ── ghosts of the located system: 35% alpha, real body's hue/fill/size ─
      if (s && !z2) {
        for (let g = 0; g < s.ghosts.length; g++) {
          const gh = s.ghosts[g], i = gh.body
          if (!inView(gh.x, gh.y, 10 / rho)) continue
          ctx.globalAlpha = hov?.kind === 'ghost' && hov.idx === g ? 0.9 : 0.35
          ctx.fillStyle = ctx.strokeStyle = colors.risk[b.risk[i]]
          ctx.lineWidth = 1.25
          ctx.beginPath()
          ctx.arc(sx(gh.x), sy(gh.y), b.rp[i], 0, Math.PI * 2)
          if (b.solid[i]) ctx.fill()
          else ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // ── bodies: measured orbits; at Z2 every other body dims ────────────
      const fills = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
      const rings = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
      const doc = new Path2D(), twin = new Path2D(), efos = new Path2D(), sfp = new Path2D()
      const off = new Path2D(), arrive = new Path2D()
      // sky-dive layers at Z1: ink notch = ARIA tier 1 · ink ring = «sigue firmando» here (default);
      // the agency overlay (one at a time, located system only): captura tether · pareja ring · mismo-día tick · señal dot
      const LY_ = layerRef.current.layers, ov = perRef.current.overlay
      const notch = new Path2D(), sigueB = new Path2D(), ovPath = new Path2D(), ovDots = new Path2D()
      const pq = per != null ? b.period[per] : null
      for (let i = 0; i < b.n; i++) {
        // «tamaño = dinero en el periodo»: the same §2.3 size formula on the sexenio's money; none → not drawn
        const rp = pq && bySize && yr == null ? (pq[i] ? 3.5 + 1.25 * ((pq[i] - 1) / 63.5) : 0) : b.rp[i]
        if (!rp || !inView(b.x[i], b.y[i], (rp + 6) / rho)) continue
        if (z2 && i === loc.body) continue
        const cx = sx(b.x[i]), cy = sy(b.y[i])
        // instruments F17: the rail year: a body not paid that year is a faint hairline, same place, same size
        if (yr != null && !hasYear(b.ym[i], yr)) { off.moveTo(cx + rp, cy); off.arc(cx, cy, rp, 0, Math.PI * 2); continue }
        // arrivals that year: a static 1.5 px ring tick (no flash)
        if (yr != null && 2000 + b.year[i] === yr) { arrive.moveTo(cx + rp + 4, cy); arrive.arc(cx, cy, rp + 4, 0, Math.PI * 2) }
        const p = b.solid[i] ? fills[b.risk[i]] : rings[b.risk[i]]
        p.moveTo(cx + rp, cy)
        p.arc(cx, cy, rp, 0, Math.PI * 2)
        // §3.6 glyphs: documented ochre ring · verified group twin ring · EFOS hollow diamond · SFP cross
        if (b.flags[i] & 2) { doc.moveTo(cx + rp + 2.5, cy); doc.arc(cx, cy, rp + 2.5, 0, Math.PI * 2) }
        const g2 = b.flags2[i]
        if (g2 & 4) { twin.moveTo(cx + rp + 5, cy); twin.arc(cx, cy, rp + 5, 0, Math.PI * 2) }
        if (g2 & 1) {
          const d = rp + 4
          efos.moveTo(cx, cy - d); efos.lineTo(cx + d, cy); efos.lineTo(cx, cy + d); efos.lineTo(cx - d, cy); efos.closePath()
        }
        if (g2 & 2) {
          const ox = cx + rp + 4, oy = cy - rp - 4
          sfp.moveTo(ox - 3, oy); sfp.lineTo(ox + 3, oy); sfp.moveTo(ox, oy - 3); sfp.lineTo(ox, oy + 3)
        }
        if (((b.flags[i] >> 2) & 3) === 1) { notch.moveTo(cx - rp - 1, cy - rp - 1); notch.lineTo(cx - rp - 5, cy - rp - 5) }
        const bb = LY_ ? LY_.bodyBits[i] : 0
        if (bb & (LY_?.bits.sigue ?? 0)) { sigueB.moveTo(cx + rp + 7, cy); sigueB.arc(cx, cy, rp + 7, 0, Math.PI * 2) }
        if (ov && LY_ && s && b.hostIdx[i] === s.host && (bb & LY_.bits[ov])) {
          if (ov === 'captura') { ovPath.moveTo(cx, cy); ovPath.lineTo(sx(S.x[s.host]), sy(S.y[s.host])) }
          else if (ov === 'pareja') { ovPath.moveTo(cx + rp + 4, cy); ovPath.arc(cx, cy, rp + 4, 0, Math.PI * 2) }
          else if (ov === 'mismo_dia') { ovPath.moveTo(cx, cy + rp + 2); ovPath.lineTo(cx, cy + rp + 8) }
          else { ovDots.moveTo(cx + 2, cy - rp - 5); ovDots.arc(cx, cy - rp - 5, 2, 0, Math.PI * 2) }
        }
      }
      const dim = z2 ? 0.25 : 1
      ctx.lineWidth = 1.25
      for (let c = 0; c < 4; c++) {
        ctx.globalAlpha = (c === 0 ? 0.7 : 0.9) * dim
        ctx.fillStyle = ctx.strokeStyle = colors.risk[c]
        ctx.fill(fills[c])
        ctx.stroke(rings[c])
      }
      ctx.globalAlpha = dim
      ctx.lineWidth = 1
      ctx.strokeStyle = colors.accent
      ctx.stroke(doc)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 0.75
      ctx.stroke(twin)
      ctx.stroke(efos)
      ctx.lineWidth = 1.25
      ctx.stroke(sfp)
      ctx.lineWidth = 1.5
      ctx.stroke(notch)
      ctx.globalAlpha = 0.4 * dim
      ctx.lineWidth = 1
      ctx.stroke(sigueB)
      if (ov && !z2) {
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = ctx.fillStyle = colors.ink
        ctx.lineWidth = 1
        if (ov === 'pareja') ctx.setLineDash([2, 2])
        ctx.stroke(ovPath)
        ctx.setLineDash([])
        ctx.fill(ovDots)
      }
      ctx.globalAlpha = dim
      if (yr != null) {
        ctx.globalAlpha = 0.18 * dim
        ctx.strokeStyle = colors.muted
        ctx.lineWidth = 0.75
        ctx.stroke(off)
        ctx.globalAlpha = 0.85 * dim
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 1.5
        ctx.stroke(arrive)
      }
      ctx.globalAlpha = 1
      if (fb >= 0 && !z2) {
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sx(b.x[fb]), sy(b.y[fb]), b.rp[fb] + 3.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      // §3.11 flight highlight: a 1.5 px ochre ring outside the glyph rings
      const hl = perRef.current.highlight
      if (hl?.length && !z2) {
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (const i of hl) {
          const r = b.rp[i] + 8
          ctx.moveTo(sx(b.x[i]) + r, sy(b.y[i]))
          ctx.arc(sx(b.x[i]), sy(b.y[i]), r, 0, Math.PI * 2)
        }
        ctx.stroke()
      }
      // instruments §3.4 «Qué cambió»: arrival «+» ticks, departure rings, whiskers on the frozen positions
      const mk = marksRef.current
      if (mk && !z2 && engraved[mk.star]) {
        const hx = sx(S.x[mk.star]), hy = sy(S.y[mk.star]), R = S.r[mk.star]
        const plus = new Path2D(), gone = new Path2D(), wh = new Path2D()
        for (const i of mk.arrive) {
          const x = sx(b.x[i]) + b.rp[i] + 5, y = sy(b.y[i]) - b.rp[i] - 5
          plus.moveTo(x - 4, y); plus.lineTo(x + 4, y); plus.moveTo(x, y - 4); plus.lineTo(x, y + 4)
        }
        for (const i of mk.depart) { const r = b.rp[i] + 4; gone.moveTo(sx(b.x[i]) + r, sy(b.y[i])); gone.arc(sx(b.x[i]), sy(b.y[i]), r, 0, Math.PI * 2) }
        for (const [i, sa, sb] of mk.whiskers) {
          const r0 = orbitR(sa, R) * rho, r1 = orbitR(sb, R) * rho
          if (Math.abs(r1 - r0) < 8) continue // F3: the 8 px floor at the zoom on screen
          const a = Math.atan2(sy(b.y[i]) - hy, sx(b.x[i]) - hx), c = Math.cos(a), sn = Math.sin(a)
          wh.moveTo(hx + c * r0, hy + sn * r0); wh.lineTo(hx + c * r1, hy + sn * r1)
          wh.moveTo(hx + c * r1 - sn * 3, hy + sn * r1 + c * 3); wh.lineTo(hx + c * r1 + sn * 3, hy + sn * r1 - c * 3)
        }
        ctx.globalAlpha = 1
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = 1.5
        ctx.stroke(plus)
        ctx.stroke(wh)
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 1.25
        ctx.setLineDash([2, 2])
        ctx.stroke(gone)
        ctx.setLineDash([])
      }
    } else if (b && gE < 1) {
      // the overview «Riesgo» chart is about the agencies: their suppliers' dust fades out as the dots line up
      const cache = dustCacheRef.current
      if (gestureRef.current && cache) {
        const r = rho / cache.rho
        ctx.globalAlpha = 1 - gE
        ctx.drawImage(cache.c, X0 - (w + cache.X0) * r, Y0 - (h + cache.Y0) * r, cache.c.width * r, cache.c.height * r)
        ctx.globalAlpha = 1
      } else drawDust(ctx, b, rho, X0, Y0, w, h, 1 - gE)
    }

    // ── Z2 «El Planeta»: moons on the contract track around the focused body ─
    const ms = moonsRef.current
    if (b && z2 && loc.body != null) {
      const bi = loc.body, cx = sx(b.x[bi]), cy = sy(b.y[bi])
      const host = S.id[b.hostIdx[bi]]
      // engraved amount rings (10 K / 1 M / 100 M / 10 B) — not under the risk moon lens (no ruler look)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 0.5
      ctx.font = `12px ${FONT_MONO}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      for (const a of perRef.current.moonLens ? [] : AMOUNT_RINGS) {
        const r = moonL(a) * rho
        ctx.globalAlpha = 0.22
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = colors.muted
        ctx.fillText(formatCompactMXN(a), cx - 4, cy - r - 1)
      }
      // the same sexenio clock: spokes + seam
      ctx.globalAlpha = 0.22
      ctx.beginPath()
      for (const a of ADMINISTRATIONS) {
        if (a.yearStart <= 2002 || a.yearStart > DATA_LAST_YEAR) continue
        const th = theta(a.yearStart)
        ctx.moveTo(cx + Math.cos(th) * 0.2 * MOON_R * rho, cy + Math.sin(th) * 0.2 * MOON_R * rho)
        ctx.lineTo(cx + Math.cos(th) * MOON_R * rho, cy + Math.sin(th) * MOON_R * rho)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      // the planet itself
      ctx.fillStyle = ctx.strokeStyle = colors.risk[b.risk[bi]]
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(cx, cy, b.rp[bi], 0, Math.PI * 2)
      if (b.solid[bi]) ctx.fill()
      else ctx.stroke()
      if (ms && ms.body === bi) {
        // inner remainder track at 0.15·R_m, per-year segments, «no a escala»
        const remMax = Math.max(1, ...ms.remainder.map((r) => r[1]))
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 4
        for (const [yr, n] of ms.remainder) {
          ctx.globalAlpha = 0.08 + 0.5 * (n / remMax)
          ctx.beginPath(); ctx.arc(cx, cy, 0.15 * MOON_R * rho, theta(yr), theta(yr + 1) - 0.01); ctx.stroke()
        }
        ctx.globalAlpha = 1
        // moons: hue by risk · solid DA / ring competitive / ochre tick single award · 0.45 for other buyers
        const sel = selRef.current
        let selXY: [number, number] | null = null, selMoon: Moon | null = null
        for (const m of ms.moons) {
          const [mx, my] = moonXY(m, b, bi)
          const px = sx(mx), py = sy(my)
          const own = m.inst != null && (canonInst.get(m.inst) ?? m.inst) === host
          // instruments §3.3: with the rail year, moons dated in it stay lit (planet=&yr= is the deep link)
          ctx.globalAlpha = (own ? 1 : 0.45) * (yr != null && Math.floor(m.t) !== yr ? 0.15 : 1)
          ctx.fillStyle = ctx.strokeStyle = colors.risk[m.risk]
          ctx.lineWidth = 1.25
          ctx.beginPath()
          if (m.review) {
            ctx.setLineDash([2, 2]); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
          } else {
            ctx.arc(px, py, 2.5, 0, Math.PI * 2)
            if (m.da) ctx.fill()
            else ctx.stroke()
          }
          if (m.sb) {
            const phi = theta(m.t)
            ctx.strokeStyle = colors.accent
            ctx.beginPath(); ctx.moveTo(px + 3 * Math.cos(phi), py + 3 * Math.sin(phi)); ctx.lineTo(px + 6.5 * Math.cos(phi), py + 6.5 * Math.sin(phi)); ctx.stroke()
          }
          if (m.id === sel) { selXY = [px, py]; selMoon = m }
          // sky-dive L1: the dock ledger's cursor (or the pointer) rings its moon
          const eh = extHoverRef.current
          if ((eh?.kind === 'moon' && eh.idx === m.id) || (hov?.kind === 'moon' && ms.moons[hov.idx] === m)) {
            ctx.globalAlpha = 1
            ctx.strokeStyle = colors.ink
            ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
        if (yr != null) {
          const th = theta(yr + 0.5)
          ctx.strokeStyle = colors.accent
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(th) * 0.2 * MOON_R * rho, cy + Math.sin(th) * 0.2 * MOON_R * rho)
          ctx.lineTo(cx + Math.cos(th) * 1.04 * MOON_R * rho, cy + Math.sin(th) * 1.04 * MOON_R * rho)
          ctx.stroke()
        }
        // sky-dive «Apagón»: the supplier's ComprasMX contracts after the blackout — hollow gray squares past the
        // 2025 seam (the 2001 wedge holds no data), unscored, so under the risk lens they ride the outer edge
        const ap = perRef.current.apagon
        if (ap?.length) {
          ctx.globalAlpha = 0.9
          ctx.strokeStyle = colors.muted
          ctx.lineWidth = 1.25
          ctx.beginPath()
          for (const a of ap) {
            const phi = theta(a.t), l = perRef.current.moonLens ? MOON_R * 1.06 : moonL(a.amount)
            const px = sx(b.x[bi] + l * Math.cos(phi)), py = sy(b.y[bi] + l * Math.sin(phi))
            ctx.rect(px - 2.5, py - 2.5, 5, 5)
          }
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        // sky-dive: the selected contract's same-day lot — its sibling pieces ringed (dashed ink)
        const sib = perRef.current.siblings
        if (sib?.length) {
          ctx.strokeStyle = colors.ink
          ctx.lineWidth = 1
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          for (const m of ms.moons) {
            if (!sib.includes(m.id) || m.id === sel) continue
            const [mx, my] = moonXY(m, b, bi)
            ctx.moveTo(sx(mx) + 6, sy(my)); ctx.arc(sx(mx), sy(my), 6, 0, Math.PI * 2)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
        // Z3: selected moon ring + 1 px ochre thread to its canonical buyer star
        if (selXY && selMoon) {
          ctx.strokeStyle = colors.ink
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(selXY[0], selXY[1], 5, 0, Math.PI * 2); ctx.stroke()
          const j = selMoon.inst != null ? starIdx.get(canonInst.get(selMoon.inst) ?? selMoon.inst) : undefined
          if (j !== undefined) {
            ctx.strokeStyle = ctx.fillStyle = colors.accent
            ctx.lineWidth = 1
            edgeLine(ctx, selXY[0], selXY[1], sx(S.x[j]), sy(S.y[j]), starNames[j])
          }
        }
        if (cap) {
          ctx.globalAlpha = 0.92
          ctx.fillStyle = colors.bg
          ctx.fillRect(cap.x - cap.w / 2, cap.y - 2, cap.w, cap.h)
          ctx.globalAlpha = 1
          ctx.font = `12px ${FONT_MONO}`
          ctx.fillStyle = colors.muted
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          cap.caps.forEach((c, n) => ctx.fillText(c, cap.x, cap.y + 16 * n))
        }
      }
    }

    // focused-system captions (canvas text, Plex Mono 10 px, upright)
    if (focus >= 0 && !z2) {
      const i = focus, R = S.r[i]
      const cx = sx(S.x[i]), cy = sy(S.y[i])
      ctx.font = `12px ${FONT_MONO}`
      ctx.fillStyle = colors.muted
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'center'
      ctx.fillStyle = colors.ink
      capText(ctx, skyCopy('seam', lang), cx, cy - R * rho * 1.32, true) // above the sexenio names (Sheinbaum sits at 12 o'clock)
      ctx.fillStyle = colors.muted
      ctx.textBaseline = 'middle'
      for (const a of ADMINISTRATIONS) {
        const t0 = Math.max(a.yearStart, 2002), t1 = Math.min(a.yearEnd + 1, DATA_LAST_YEAR + 1)
        if (t1 <= t0) continue
        const th = theta((t0 + t1) / 2)
        capText(ctx, ADMIN_DISPLAY_ACCENTED[a.key], cx + Math.cos(th) * R * rho * 1.2, cy + Math.sin(th) * R * rho * 1.2)
      }
      if (yr != null) {
        const th = theta(yr + 0.5)
        ctx.font = `12px ${FONT_MONO}`
        ctx.fillStyle = colors.accent
        ctx.textAlign = Math.cos(th) >= 0 ? 'left' : 'right'
        ctx.textBaseline = 'middle'
        capText(ctx, String(yr), cx + Math.cos(th) * (R * rho * 1.04 + 4), cy + Math.sin(th) * (R * rho * 1.04 + 4))
        ctx.font = `12px ${FONT_MONO}`
        ctx.fillStyle = colors.muted
      }
      if (starMinYear[i] === 2) {
        const th = theta(2002.5)
        ctx.textAlign = 'left'
        capText(ctx, skyCopy('censor', lang), cx + Math.cos(th) * R * rho * 1.06 + 4, cy + Math.sin(th) * R * rho * 1.06, true)
      }
    }

    // F14: the catalog's cursor rings its body or star (1.5 px ink, outside the glyph)
    const eh = extHoverRef.current, eb = bodiesRef.current
    if (eh && eh.kind !== 'moon' && (eh.kind === 'star' || eb)) {
      const isB = eh.kind === 'body'
      const r = (isB ? eb!.rp[eh.idx] : starPx(S.v[eh.idx])) + 6
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx(isB ? eb!.x[eh.idx] : LX[eh.idx]), sy(isB ? eb!.y[eh.idx] : LY[eh.idx]), r, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (performance.now() - lastLabelRef.current > 100) refreshLabels()
    placeLabels(slotsRef.current, labelRefs.current, rho, X0, Y0, lensOn ? L.X : undefined, lensOn ? L.Y : undefined)
    cb.current.onFrame?.({ x0: wx0, y0: wy0, x1: wx1, y1: wy1, k })
  }
  drawRef.current = draw
  const requestDraw = () => {
    if (!rafRef.current && !pausedRef.current) rafRef.current = requestAnimationFrame(() => drawRef.current())
  }

  // ── DPR resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    let first = true
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width)), h = Math.max(1, Math.floor(rect.height))
      const dpr = window.devicePixelRatio || 1
      // a resize keeps the world point under the view centre: the transform is screen-space, and s0 / ox / oy
      // change with the host (the masthead re-measures --atlas-chrome after the sky mounts) — I-S1, declared
      const keep = !first && zoomRef.current && sizeRef.current.s0 ? camOf(tRef.current) : null
      const s0 = Math.min(w, h - FOOT_PX) / WORLD
      sizeRef.current = { w, h, s0, ox: (w - WORLD * s0) / 2, oy: (h - FOOT_PX - WORLD * s0) / 2 }
      setFit((f) => (f.w === w && f.s0 === s0 ? f : { w, s0 }))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      const z = zoomRef.current
      if (z) {
        const { ox, oy } = sizeRef.current
        const m = 0.2 * WORLD * s0
        z.translateExtent([[ox - m, oy - m], [ox + WORLD * s0 + m, oy + WORLD * s0 + m]])
        z.extent([[0, 0], [w, h]])
        if (first && initialCam) select(canvas).call(z.transform, transformFor(initialCam))
        // a flight in progress is re-aimed at its own target camera (the old target transform now points elsewhere)
        else if (keep && flightCamRef.current) flyTo(transformFor(flightCamRef.current), 400)
        else if (keep) select(canvas).call(z.transform, transformFor(keep))
      }
      first = false
      labelsRef.current()
      requestDraw()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── d3-zoom: `zoom` writes refs only; `end` is the one path to React ──────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .filter((e: Event & { button?: number; ctrlKey?: boolean }) => (!e.ctrlKey || e.type === 'wheel') && !e.button)
      .on('start', (e) => {
        const bs = bodiesRef.current
        if (!e.sourceEvent || !bs) return
        const { w, h } = sizeRef.current
        const { rho, X0, Y0 } = proj()
        if (rho >= Z1_RHO) return
        const c = document.createElement('canvas')
        c.width = 3 * w
        c.height = 3 * h
        drawDust(c.getContext('2d')!, bs, rho, X0 + w, Y0 + h, 3 * w, 3 * h)
        dustCacheRef.current = { c, X0, Y0, rho }
        gestureRef.current = true
      })
      .on('zoom', (e) => {
        tRef.current = e.transform
        requestDraw()
      })
      .on('end', (e) => {
        gestureRef.current = false
        dustCacheRef.current = null
        const loc = locate()
        locRef.current = loc
        setBand(loc.level === 2 ? 2 : proj().rho >= Z1_RHO ? 1 : 0)
        labelsRef.current()
        requestDraw()
        cb.current.onEnd(loc, camOf(tRef.current), e.sourceEvent != null)
      })
    zoomRef.current = z
    const { w, h, s0, ox, oy } = sizeRef.current
    const m = 0.2 * WORLD * s0
    z.translateExtent([[ox - m, oy - m], [ox + WORLD * s0 + m, oy + WORLD * s0 + m]]).extent([[0, 0], [w, h]])
    const sel = select(canvas)
    sel.call(z).on('dblclick.zoom', null)
    if (initialCam && w > 0) sel.call(z.transform, transformFor(initialCam))
    return () => { sel.on('.zoom', null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // round 2: the cluster readout and the bottom-left stamps are furniture the labels avoid — re-choose them
  // when either changes size (a stamp that grew after the labels were chosen sat under IMSS's name at 1440)
  useEffect(() => {
    const ro = new ResizeObserver(() => { labelsRef.current(); requestDraw() })
    for (const el of [panelRef.current, furnRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [!!panel]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { labelsRef.current(); requestDraw() }, [bodies, sys, moons, selectedMoon, lang, period, sizeByPeriod, pulse, highlight, links, !!panel, starLayer, overlay, moonLens, apagon, siblings])
  // instruments §3.3: a year change invalidates the gesture dust cache (3w × 3h, lit for the old year)
  useEffect(() => { dustCacheRef.current = null; requestDraw() }, [yr]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dustCacheRef.current = null; labelsRef.current(); requestDraw() }, [hues]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { requestDraw() }, [marks, paused])
  // sky-dive: the label/mark overlap check (frontend/_ui_v4/build/sky-dive/overlap.mjs) reads the marks the labels avoided
  useEffect(() => {
    const el = wrapRef.current
    if (el) Object.assign(el, { __skyMarks: () => lastMarksRef.current })
  }, [])
  // sky-dive L4: a lens change glides from where the stars are drawn now (reduced motion: one step)
  useEffect(() => {
    const L = lensRef.current
    if (L.tx === lensTarget.X) return
    L.fx = Float64Array.from(L.X); L.fy = Float64Array.from(L.Y)
    L.tx = lensTarget.X; L.ty = lensTarget.Y; L.moved = lensTarget.moved; L.on = true
    // the overview arrangement fades the clouds, dust and halos; a glide back keeps the flag until it lands
    if (lensTarget.moved) L.all = lensSector == null
    L.t0 = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? -LENS_MS : performance.now()
    dustCacheRef.current = null
    requestDraw()
  }, [lensTarget]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }, [])

  // ── flights (van Wijk: d3-zoom's default interpolateZoom) ────────────────
  const flyTo = (target: ZoomTransform, maxMs = 1400) => {
    const canvas = canvasRef.current, z = zoomRef.current
    if (!canvas || !z) return
    const sel = select(canvas)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      canvas.style.transition = 'none'
      canvas.style.opacity = '0.3'
      sel.call(z.transform, target)
      requestAnimationFrame(() => { canvas.style.transition = 'opacity 150ms'; canvas.style.opacity = '1' })
      return
    }
    const t0 = tRef.current
    const zoomSteps = Math.abs(Math.log2(target.k / t0.k))
    const dist = Math.min(1500, Math.hypot(target.x - t0.x * (target.k / t0.k), target.y - t0.y * (target.k / t0.k)) / 4)
    const ms = Math.min(maxMs, Math.max(Math.min(450, maxMs), 450 + 110 * zoomSteps + 0.25 * dist))
    const aim = (flightCamRef.current = camOf(target))
    sel.transition().duration(ms).ease(easeCubicInOut).call(z.transform, target)
      .on('end interrupt', () => { if (flightCamRef.current === aim) flightCamRef.current = null })
  }
  const freeMin = () => {
    const { w, h } = sizeRef.current
    return Math.min(w - DOCK_PX, h - FOOT_PX)
  }
  const camForStar = (i: number): SkyCam => ({ x: S.x[i], y: S.y[i], k: (0.42 * freeMin()) / S.r[i] / sizeRef.current.s0 })
  const camForBody = (i: number): SkyCam => ({ x: bodies!.x[i], y: bodies!.y[i], k: (0.3 * freeMin()) / MOON_R / sizeRef.current.s0 })
  const camForSector = (id: number): SkyCam | null => {
    const g = sectorById.get(id)
    if (!g) return null
    const { w, h } = sizeRef.current
    return { x: g.x, y: g.y, k: (0.45 * Math.min(w - (perRef.current.reserve ? DOCK_PX : 0), h - FOOT_PX)) / g.r / sizeRef.current.s0 }
  }
  /** Z3 keeps the Z2 frame: the planet re-centred exactly (planet + R_m + dock clearance all fit). */
  const camForMoon = (): SkyCam | null => (moonsRef.current ? camForBody(moonsRef.current.body) : null)
  const fly = (t: HopTarget) => {
    let cam: SkyCam | null = null
    if (t.kind === 'home') {
      if (!perRef.current.reserve) return flyTo(zoomIdentity)
      // the field, fitted into the free area left of the flight card
      const { w, s0 } = sizeRef.current
      return flyTo(transformFor({ ...camOf(zoomIdentity, false), k: Math.min(1, (w - DOCK_PX - 24) / (WORLD * s0)) }))
    }
    if (t.kind === 'sector') cam = camForSector(t.id)
    else if (t.kind === 'star') cam = camForStar(t.idx)
    else if (t.kind === 'body' && bodies) cam = camForBody(t.idx)
    else if (t.kind === 'moon') cam = camForMoon()
    if (cam) flyTo(transformFor(cam), t.kind === 'moon' ? 300 : 1400)
  }
  const hop = (t: HopTarget) => {
    cb.current.onHop(t, camOf(tRef.current))
    fly(t)
  }
  apiRef.current = {
    hop, fly, goTo: (cam, ms) => flyTo(transformFor(cam), ms),
    hover: (t) => { extHoverRef.current = t; requestDraw() },
    // §3.8 PNG: one synchronous frame without the catalog cursor, copied at DPR. Canvas names are institution rim
    // names only (vendor names are DOM labels, never in the image), so no withheld name can reach the plate.
    snapshot: () => {
      const c = canvasRef.current
      if (!c || !c.width) return null
      const eh = extHoverRef.current
      extHoverRef.current = null
      cancelAnimationFrame(rafRef.current)
      drawRef.current()
      const out = document.createElement('canvas')
      out.width = c.width
      out.height = c.height
      out.getContext('2d')?.drawImage(c, 0, 0)
      extHoverRef.current = eh
      requestDraw()
      return out
    },
  }

  const zoomBy = (f: number) => {
    const canvas = canvasRef.current, z = zoomRef.current
    if (canvas && z) select(canvas).transition().duration(220).call(z.scaleBy, f)
  }
  const panBy = (dx: number, dy: number) => {
    const canvas = canvasRef.current, z = zoomRef.current
    if (canvas && z) select(canvas).transition().duration(200).call(z.translateBy, dx / tRef.current.k, dy / tRef.current.k)
  }

  // ── pointer: invert → world; moons › bodies › ghosts › stars ─────────────
  const hit = (e: PointerEvent | MouseEvent): Hover => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const { rho, X0, Y0 } = proj()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    const wx = (px - X0) / rho, wy = (py - Y0) / rho
    const loc = locRef.current
    const ms = moonsRef.current, bs = bodiesRef.current
    if (rho >= Z2_RHO && ms && bs && loc.body === ms.body) {
      let best = -1, bd = 8
      ms.moons.forEach((m, n) => {
        const [mx, my] = moonXY(m, bs, ms.body)
        const d = Math.hypot(mx * rho + X0 - px, my * rho + Y0 - py)
        if (d < bd) { bd = d; best = n }
      })
      if (best >= 0) return { kind: 'moon', idx: best }
    }
    if (rho >= Z1_RHO && bodyTree) {
      const b = bodyTree.find(wx, wy, 10 / rho)
      if (b !== undefined) return { kind: 'body', idx: b }
      const s = sysRef.current
      if (s && loc.star === s.host && rho < Z2_RHO) {
        const g = s.ghostTree.find(wx, wy, 10 / rho)
        if (g !== undefined) return { kind: 'ghost', idx: g }
      }
    }
    // weekend E2: the «resto» rim track (drawn at 1.07·R_sys) → its arrival year
    {
      const s = sysRef.current
      if (s && system && loc.star === s.host && rho < Z2_RHO) {
        const i = s.host, R = S.r[i]
        const dx = wx - S.x[i], dy = wy - S.y[i], d = Math.hypot(dx, dy)
        if (d >= 1.03 * R && d <= 1.11 * R) {
          let t = 2001 + (RING_YEARS * (Math.atan2(dy, dx) + Math.PI / 2)) / (2 * Math.PI)
          if (t < 2001) t += RING_YEARS
          const yr = Math.floor(t)
          if (system.remainder.some((r) => r[0] === yr)) return { kind: 'band', idx: yr }
        }
      }
    }
    const L = lensRef.current
    if (L.on && rho < Z1_RHO) {
      // sky-dive L4: the lens moved the framed sector's stars off the tree — scan the drawn positions
      let best = -1, bd = 12 / rho
      for (let i = 0; i < nStars; i++) { const d = Math.hypot(L.X[i] - wx, L.Y[i] - wy); if (d < bd) { bd = d; best = i } }
      return best >= 0 ? { kind: 'star', idx: best } : null
    }
    const st = starTree.find(wx, wy, 12 / rho)
    return st !== undefined ? { kind: 'star', idx: st } : null
  }
  const fmtPct = (v: number) => (v * 100).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: v < 0.001 ? 4 : 2 })
  const tipText = (r: NonNullable<Hover>): string => {
    const s = sysRef.current
    if (r.kind === 'band') {
      const seg = system?.remainder.find((x) => x[0] === r.idx)
      return seg ? skyCopy('bandYear', lang, { y: seg[0], n: seg[2].toLocaleString(lang === 'en' ? 'en-US' : 'es-MX'), v: formatCompactMXN(seg[1]) }) : ''
    }
    if (r.kind === 'star') {
      const i = r.idx
      return `${starNames[i]} · ${formatCompactMXN(S.v[i])} · ${fmtPct(S.h[i])}% ${lang === 'en' ? 'of its money at high or critical risk' : 'de su dinero en riesgo alto o crítico'}`
    }
    if (r.kind === 'moon') {
      const m = moonsRef.current!.moons[r.idx]
      const kind = m.da ? skyCopy('directAward', lang) : skyCopy('competitive', lang)
      const buyer = formatEntityName('institution', m.institutionName, 'full')
      return [m.date, formatCompactMXN(m.amount), buyer, kind, m.sb ? skyCopy('singleBid', lang) : '', m.review ? skyCopy('review', lang) : '']
        .filter(Boolean).join(' · ')
    }
    if (r.kind === 'ghost' && s) {
      const g = s.ghosts[r.idx]
      return `${supplierTipName(system, g.vendor_id, lang)} · ${skyCopy('ghostTip', lang, { inst: starNames[bodies!.hostIdx[g.body]] })}`
    }
    const b = bodies!, i = r.idx
    const v = b.vendorId[i], host = b.hostIdx[i]
    // owner 11-07 P0: a dot's name comes from ITS host's system (the located one, else the cached / fetched one)
    const own = s && s.host === host ? system : hostSystem(host)
    const row = own?.bodies.find((x) => x.vendor_id === v)
    const parts = [
      supplierTipName(own, v, lang),
      skyCopy('shareOf', lang, { p: fmtPct(b.share[i]), inst: S.siglas[host] || starNames[host] }),
      `${2000 + b.year[i]}–${2000 + b.y1[i]}`,
    ]
    if (row) {
      parts.push(skyCopy('dependence', lang, { p: fmtPct(row.dep) }))
      if (row.n_also) parts.push(skyCopy('alsoOrbits', lang, { n: row.n_also }))
    }
    if (b.flags[i] & 2) parts.push(skyCopy('documented', lang))
    if (b.flags2[i] & 1) parts.push(skyCopy('efos', lang))
    if (b.flags2[i] & 2) parts.push(skyCopy('sfp', lang))
    if (b.flags2[i] & 4) parts.push(skyCopy('group', lang))
    return parts.filter(Boolean).join(' · ')
  }
  const hostSystem = (host: number) => queryClient.getQueryData<SkySystem>(skySystemQuery(S.id[host], manifest.layout_version).queryKey)
  const onPointerMove = (e: PointerEvent) => {
    const tip = tipRef.current
    const r = hit(e)
    const prev = hoverRef.current
    if (prev?.kind !== r?.kind || prev?.idx !== r?.idx) {
      hoverRef.current = r
      requestDraw()
      const mid = (h: Hover) => (h?.kind === 'moon' ? moonsRef.current?.moons[h.idx]?.id ?? null : null)
      if (mid(prev) !== mid(r)) cb.current.onHoverMoon?.(mid(r))
    }
    if (!tip) return
    if (!r || (r.kind === 'moon' && moonsRef.current?.moons[r.idx].id === selRef.current)) { tip.hidden = true; return }
    const rect = canvasRef.current!.getBoundingClientRect()
    tip.hidden = false
    tip.textContent = tipText(r)
    // weekend E2: a hovered band segment fetches its named members lazily (cached per layout)
    if (r.kind === 'band' && system && (prev?.kind !== 'band' || prev.idx !== r.idx)) {
      const inst = system.star.id, year = r.idx
      queryClient.fetchQuery({
        queryKey: ['atlas-sky', 'band', system.layout_version, inst, year],
        queryFn: async () => (await api.get<SkyBand>('/atlas/sky/band', { params: { inst, year } })).data,
        staleTime: 86_400_000,
      }).then((band) => {
        const h = hoverRef.current
        if (!tipRef.current || h?.kind !== 'band' || h.idx !== year || !band.members.length) return
        const top = band.members.slice(0, 3).map((m) => formatEntityName('vendor', m.name, 'full')).join(' · ')
        tipRef.current.textContent = `${tipText(h)} — ${top}${band.n_vendors > 3 ? ' …' : ''}`
      }).catch(() => {})
    }
    // a dot of a star that is not the located one: fetch its host's system once (cached per layout), then rename the tip
    if (r.kind === 'body' && (prev?.kind !== 'body' || prev.idx !== r.idx)) {
      const host = bodies!.hostIdx[r.idx], idx = r.idx
      if (sysRef.current?.host !== host && !hostSystem(host)) {
        queryClient.fetchQuery(skySystemQuery(S.id[host], manifest.layout_version)).then(() => {
          const h = hoverRef.current
          if (tipRef.current && h?.kind === 'body' && h.idx === idx) tipRef.current.textContent = tipText(h)
        }).catch(() => {})
      }
    }
    tip.style.transform = `translate3d(${Math.min(e.clientX - rect.left + 14, rect.width - 330)}px, ${e.clientY - rect.top + 14}px, 0)`
  }
  const onClick = (e: MouseEvent) => {
    const r = hit(e)
    if (!r) {
      // sky-dive: a click on a sector disc's open field dives to that cluster (Z0 only, unless already framed on it)
      const { rho, X0, Y0 } = proj()
      if (rho >= Z1_RHO || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const wx = (e.clientX - rect.left - X0) / rho, wy = (e.clientY - rect.top - Y0) / rho
      const g = manifest.sectors.find((sg) => Math.hypot(sg.x - wx, sg.y - wy) <= sg.r)
      if (g && !(locRef.current.framed && locRef.current.sector === g.id)) hop({ kind: 'sector', id: g.id })
      return
    }
    if (r.kind === 'star') hop({ kind: 'star', idx: r.idx })
    else if (r.kind === 'body') hop({ kind: 'body', idx: r.idx })
    else if (r.kind === 'ghost') hop({ kind: 'body', idx: sysRef.current!.ghosts[r.idx].body })
    else if (r.kind === 'moon') {
      if (tipRef.current) tipRef.current.hidden = true
      hop({ kind: 'moon', id: moonsRef.current!.moons[r.idx].id })
    }
  }
  /** Labels are buttons (Tab cycles them); keyboard Enter / Space lands here — mouse clicks fall through to the canvas. */
  const onLabel = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t
    const m = t ? /^([sbg]):(\d+)$/.exec(t) : null
    if (!m) return
    const n = Number(m[2])
    hop(m[1] === 's' ? { kind: 'star', idx: n } : m[1] === 'b' ? { kind: 'body', idx: n } : { kind: 'sector', id: n })
  }
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, () => void> = {
      '+': () => zoomBy(1.6), '=': () => zoomBy(1.6), '-': () => zoomBy(1 / 1.6), _: () => zoomBy(1 / 1.6),
      '0': () => hop({ kind: 'home' }), ArrowUp: () => panBy(0, 80), ArrowDown: () => panBy(0, -80),
      ArrowLeft: () => panBy(80, 0), ArrowRight: () => panBy(-80, 0),
    }
    const f = map[e.key]
    if (f) { e.preventDefault(); f() }
  }

  const stamp: CSSProperties = {
    fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)',
    color: 'var(--color-text-muted)', background: 'var(--color-background)', padding: '2px 6px',
  }
  const btn: CSSProperties = {
    width: 32, height: 32, fontFamily: FONT_MONO, fontSize: 15, color: 'var(--color-text-primary)',
    background: 'var(--color-background)', border: '1px solid var(--color-border)',
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden outline-none focus-visible:ring-1"
      tabIndex={0}
      role="application"
      aria-label={skyCopy('canvasLabel', lang)}
      onKeyDown={onKey}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ touchAction: 'none', cursor: 'grab' }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (tipRef.current) tipRef.current.hidden = true
          if (hoverRef.current) { if (hoverRef.current.kind === 'moon') cb.current.onHoverMoon?.(null); hoverRef.current = null; requestDraw() }
        }}
        onClick={onClick}
      />
      <div className="absolute inset-0 pointer-events-none" onClick={onLabel}>
        <SkyLabelPool refs={labelRefs} />
        <div
          ref={tipRef}
          aria-hidden="true"
          hidden
          className="absolute left-0 top-0"
          style={{
            fontFamily: FONT_SERIF, fontSize: 13, maxWidth: 320, padding: '4px 8px', color: 'var(--color-text-primary)',
            background: 'var(--color-background)', border: '1px solid var(--color-border)', zIndex: 2,
          }}
        />
      </div>
      {/* bottom-left: the finder chart, then the arbitrary-position stamps beside it (§2.7, §3.3) */}
      <div ref={furnRef} className="absolute left-3 flex items-end gap-2 pointer-events-none" style={{ bottom: 37, maxWidth: `calc(100% - ${band >= 1 || reserveDock ? DOCK_PX + 70 : 70}px)` }}>
        {children}
        <div className="flex flex-col items-start gap-1">
          {stamps?.map((t) => <span key={t} style={{ ...stamp, textTransform: 'none', letterSpacing: '0.04em', maxWidth: 440, color: 'var(--color-text-secondary)' }}>{t}</span>)}
          {/* 2026-11-04 clarity (walkthrough #5): one quiet legend line, not a caps stamp — at an agency it says how to
              read the sexenio clock; «orden dentro del año: arbitrario» lives in the Leyenda */}
          <span style={{ ...stamp, fontFamily: FONT_SERIF, fontWeight: 400, fontSize: 13, letterSpacing: 0, maxWidth: 440 }}>{skyCopy(band >= 1 ? 'ringRead' : lens ? (lensSector != null ? 'lensStamp' : 'lensStampAll') : 'arbitrary', lang)}</span>
        </div>
      </div>
      {panel && <div ref={panelRef} className="absolute" style={{ top: 8, right: 12, width: 320, maxHeight: 'calc(100% - 170px)', overflowY: 'auto', zIndex: 3 }}>{panel}</div>}
      <div ref={zoomBtnRef} className="absolute bottom-12 flex flex-col gap-1" style={{ right: band >= 1 || reserveDock ? DOCK_PX + 12 : 12 }}>
        <button type="button" style={btn} onClick={() => zoomBy(1.6)} aria-label={skyCopy('zoomIn', lang)}>+</button>
        <button type="button" style={btn} onClick={() => zoomBy(1 / 1.6)} aria-label={skyCopy('zoomOut', lang)}>−</button>
        <button type="button" style={btn} onClick={() => hop({ kind: 'home' })} aria-label={skyCopy('home', lang)}>⌂</button>
      </div>
    </div>
  )
}
