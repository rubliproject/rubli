/**
 * El Atlas — «El Planetario», Sessions 1 «Flyable» · 2 «Depth» · 3 «Chain + orient».
 * Spec .claude/designs/atlas-2026-10-02-spec.md §3.13 (page), §3.4 (position + trail),
 * §3.5 (stations), §3.7–§3.12 (legend, finder, search + verbs, period, URL, masthead),
 * §2 (layout contract), §4 (phone rule).
 *
 * Staging (F12): manifest + planets.bin are the only eager calls; the engine mounts once
 * both are decoded; the located star's system, the moons and «El Expediente» wait for a
 * zoom `end`. The URL (lib/atlas/sky/url-state.ts) is the one source of truth for position:
 * every hop pushes an entry that carries its own `trail`, `end` replaces it (250 ms), and
 * Back / Forward / reload re-read the same grammar. Esc and `[` go back, `]` forward.
 *
 * Flights (§3.11, S4): `vuelo=&n=` is read from the URL store and written only through
 * `writeSearch`; the chapter's star, lit sexenio and ringed planets are compiled in render.
 * First visit (desktop, no reduced motion, no position in the URL): the sky opens on the Panorama and a banner
 * OFFERS «Concentration in IMSS Medicine Purchasing» (2026-11-04: never auto-run); `rubli_atlas_visited_v1` is set
 * when the reader starts a tour or dismisses the offer. The tour's × flies home to the Panorama.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { type Crumb } from '@/components/atlas/AtlasBreadcrumb'
import { AtlasAnexos, AtlasClauses } from '@/components/atlas/AtlasSheet'
import '@/components/atlas/atlas-sheet.css'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import { ContractFloatingCard } from '@/components/atlas/ContractFloatingCard'
import { VendorFile } from '@/components/atlas/VendorFile'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import {
  SkyEngine, DOCK_PX, type ApagonMoon, type HopTarget, type MoonSet, type SkyApi, type SkyCam, type SkyLensIdx, type SkyLocation, type SkyMarks, type SkyOverlay, type SkyView,
} from '@/components/atlas/sky/SkyEngine'
import { ClusterReadout } from '@/components/atlas/sky/ClusterReadout'
import { MoonLedger } from '@/components/atlas/sky/MoonLedger'
import { StarDock } from '@/components/atlas/sky/StarDock'
import { SkyCatalog } from '@/components/atlas/sky/SkyCatalog'
import { SkyDial } from '@/components/atlas/sky/SkyDial'
import { SkyDiff } from '@/components/atlas/sky/SkyDiff'
import { SkyCompare } from '@/components/atlas/sky/SkyCompare'
import { cmpOf, cmpToken, defaultPair, diffOf, systemDiff } from '@/lib/atlas/sky/period-diff'
import { catOf, starsOfSector, withheldLabel } from '@/lib/atlas/sky/catalog'
import { SkyPennants, SkyPinsBlock, type PinItem } from '@/components/atlas/sky/SkyPins'
import { SkyCompass } from '@/components/atlas/sky/SkyCompass'
import { csvText, downloadCanvas, downloadCsv, pinsPart, plateCanvas, starPart, systemPart, type CsvPart } from '@/lib/atlas/sky/export'
import { SkyLegend } from '@/components/atlas/sky/SkyLegend'
import { SkyFinder } from '@/components/atlas/sky/SkyFinder'
import { SkyLasso } from '@/components/atlas/sky/SkyLasso'
import { SkySearch, type BandHit } from '@/components/atlas/sky/SkySearch'
import { SkyRail, RAIL_PX, type RailHist } from '@/components/atlas/sky/SkyRail'
import { periodName } from '@/lib/atlas/sky/url-state'
import { FlightPlayer } from '@/components/atlas/sky/FlightPlayer'
import { SkyArrange } from '@/components/atlas/sky/SkyArrange'
import { MapaQuestion } from '@/components/atlas/sky/MapaQuestion'
import { compileWaypoint } from '@/components/atlas/sky/compileWaypoint'
import { ATLAS_STORIES, findStory } from '@/lib/atlas-stories'
import { toClusterItem, patternLabels } from '@/components/atlas/sky/expediente-adapter'
import { PhoneAtlas } from '@/components/atlas/sky/phone/PhoneAtlas'
import { fetchSystemForVendor, useContractSignals, useSky, useSkyApagon, useSkyLayers, useSkySystem } from '@/lib/atlas/sky/useSky'
import { useVendorContracts } from '@/lib/atlas/sky/use-vendor-contracts'
import {
  MAX_PINS, PERIOD_KEYS, SKY_LENSES, liveQuery, mirrorPins, withVista, tramaOf, posToken, parseSkyQuery, popLive, seedPins, subscribeUrl, urlSearch, writeSearch, type PeriodKey, type SkyPos,
} from '@/lib/atlas/sky/url-state'
import { SKY_KEYS, skyCopy } from '@/lib/atlas/sky/copy'
import { N_YEARS, YEAR0, fracYear, hasYear, type SkySystem, type SkySystemBody } from '@/lib/atlas/sky/geometry'
import { formatEntityName } from '@/lib/entity/format'
import { RISK_COLORS, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import { VistaBlock } from '@/components/layout/VistaSwitch'

// Merge § 5: La Trama (and d3-force) load when the panel first opens.
const TramaPanel = lazy(() => import('@/components/network/TramaPanel'))

/** The first-visit flag (§3.11.7, decision D4): set when the auto-flight STARTS. */
export const ATLAS_VISITED_KEY = 'rubli_atlas_visited_v1'
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'
/** instruments §4.3: the compass's 22 px rim band, inset 8 px — claimed before labels */
const COMPASS_RIM = 30
/** instruments §3.3 (F12): the year rail under the sky host — 44 px + 8 px gap, inside the sky-height formula */
const FOOT_PX = RAIL_PX + 8

/** DESIGN.md §2 voz legal: Spectral SC 13 · .04em · gray — the small-caps label (never uppercase). */
const eyebrow: CSSProperties = {
  fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)',
}
const panel: CSSProperties = { pointerEvents: 'auto', background: 'var(--color-background)', border: '1px solid var(--color-text-primary)' }
/** §6.5 focus ring: 2px ink. */
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-1'

function useIsPhone() {
  const q = '(max-width: 767px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

function formatCut(iso: string, lang: 'en' | 'es') {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  if (lang === 'en') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const mon = d.toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${d.getUTCDate()}·${mon}·${d.getUTCFullYear()}`
}

type Notice = 'relayout' | 'patterns' | 'categories' | null
const depth = () => (window.history.state?.atlasDepth as number | undefined) ?? 0

function DesktopAtlas({ lang }: { lang: 'en' | 'es' }) {
  const navigate = useNavigate()
  const { manifest, bodies, error } = useSky(true)
  const init = useMemo(() => parseSkyQuery(window.location.search), [])
  // `lv` mismatch → the chart was recomputed: ids win, the camera is discarded, one notice.
  const lvOk = !!manifest && (!init.lv || init.lv === manifest.layout_version)
  const initialCam = manifest && init.cam && lvOk ? init.cam : null
  const apiRef = useRef<SkyApi | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const finderDraw = useRef<((v: SkyView) => void) | null>(null)
  const pinsDraw = useRef<((v: SkyView) => void) | null>(null)
  const compassDraw = useRef<((v: SkyView) => void) | null>(null)
  // weekend E1: the lasso maps screen → world through the engine's latest frame
  const viewRef = useRef<SkyView | null>(null)
  const skyHostRef = useRef<HTMLDivElement>(null)
  const camRef = useRef<SkyCam | null>(initialCam)
  const [loc, setLoc] = useState<SkyLocation | null>(null)
  const [moon, setMoon] = useState<number | null>(init.pos.m ?? null)
  const [trail, setTrail] = useState<SkyPos[]>(init.trail)
  const [period, setPeriod] = useState<PeriodKey | null>(init.period)
  const [frame, setFrame] = useState<PeriodKey | null>(init.period)
  const [blink, setBlink] = useState(false)
  const [bySize, setBySize] = useState(false)
  const [band, setBand] = useState<{ star: number; row: SkySystemBody } | null>(null)
  const [pulse, setPulse] = useState<{ star: number; year: number; at: number } | null>(null)
  const [notice, setNotice] = useState<Notice>(init.notice)
  const [finder, setFinder] = useState(true)
  const [keys, setKeys] = useState(false)
  // instruments §3.9 «Bitácora»: `h` lists every hop of this visit, newest first
  const [logOpen, setLogOpen] = useState(false)
  // instruments §5: the dock tab and the pins are page state, mirrored into every URL write
  const [tab, setTab] = useState<string | null>(init.tab)
  const [pins, setPins] = useState<SkyPos[]>(() => seedPins(init.pins))
  // instruments §3.3: the rail year (lit = paid that year), written with a 250 ms debounced replace
  const [yr, setYr] = useState<number | null>(init.yr)
  // instruments §3.7: the twin plate, pushed into the URL on open (Back closes it), closed explicitly by Esc
  const [cmp, setCmp] = useState<string | null>(init.cmp)
  const [skipped, setSkipped] = useState<number | null>(null)
  // sky-dive: the cluster lens (L4, in the URL as `lente`), the vendor's threads switch, the linked moon hover (L1)
  const [lente, setLente] = useState(init.lente)
  const [links, setLinks] = useState(false)
  /** a hop away from the overview: the stars leave the «Riesgo» chart while the camera flies (cleared on `end`) */
  const [leaving, setLeaving] = useState(false)
  const [hoverMoon, setHoverMoon] = useState<number | null>(null)
  /** a deep link to a contract: early `end`s (the field, then the flight) must not clear the moon before Z2 lands */
  const moonPending = useRef(init.pos.m != null)
  // sky-dive data layers (LAYERS.md): agency overlay, moon lens, the supplier's post-blackout «Apagón» moons
  const [overlay, setOverlay] = useState<SkyOverlay>(null)
  const [moonLens, setMoonLens] = useState<0 | 1>(0)
  const [apagonOn, setApagonOn] = useState(false)
  /** round 2: names the engine tried and dropped for lack of space (`s:3` stars, `b:12` bodies) */
  const [unlabeled, setUnlabeled] = useState<string[]>([])
  const railRef = useRef<HTMLDivElement>(null)
  const names = useRef(new Map<number, string>())
  // ── §3.11 flight: the URL is the only writer of `vuelo` / `n` ──────────
  const search = useSyncExternalStore(subscribeUrl, urlSearch, urlSearch)
  const fl = useMemo(() => parseSkyQuery(search), [search])
  const flight = fl.vuelo ? findStory(fl.vuelo) : null
  const fn = flight ? Math.min(fl.n, flight.chapters.length) : 0
  const [takenFor, setTakenFor] = useState<string | null>(null)
  const taken = !!flight && takenFor === flight.id
  const flightRef = useRef<{ id: string | null; taken: boolean }>({ id: null, taken: false })
  flightRef.current = { id: flight?.id ?? null, taken }
  const [menu, setMenu] = useState(false)
  const [exp, setExp] = useState(false)
  const [firstVisit, setFirstVisit] = useState(false)

  const S = manifest?.stars
  const starIdx = useMemo(() => new Map((S?.id ?? []).map((id, i) => [id, i])), [S])
  const canon = useMemo(() => new Map((manifest?.inst_map.raw ?? []).map((r, k) => [r, manifest!.inst_map.canon[k]])), [manifest])
  const starOf = (inst: number) => starIdx.get(canon.get(inst) ?? inst)
  const starId = S && loc?.star != null ? S.id[loc.star] : null
  const sysQ = useSkySystem(starId, manifest?.layout_version)
  const system = sysQ.data && sysQ.data.star.id === starId ? sysQ.data : null
  const bodyIdx = loc?.level === 2 ? loc.body : null
  const bodyVendor = bodies && bodyIdx != null ? bodies.vendorId[bodyIdx] : null
  const mv = useVendorContracts(bodyVendor, bodyVendor != null)
  const moonSet = useMemo<MoonSet | null>(
    () => (bodyIdx != null && mv.ready ? { body: bodyIdx, moons: mv.moons, remainder: mv.remainder, total: mv.total, smallest: mv.smallest, skipped: mv.skipped, undated: mv.undated } : null),
    [bodyIdx, mv],
  )
  const row = system && bodyVendor != null ? system.bodies.find((b) => b.vendor_id === bodyVendor) ?? null : null
  const layers = useSkyLayers(manifest, bodies)
  const apQ = useSkyApagon(bodyVendor)
  const apagonMoons = useMemo<ApagonMoon[] | null>(() => (apagonOn && apQ.data
    ? apQ.data.contracts.flatMap((c) => { const t = fracYear(c.date); return t == null ? [] : [{ t, amount: c.amount_mxn }] }) : null), [apagonOn, apQ.data])
  const sigQ = useQuery({
    queryKey: ['senales-vendor', bodyVendor],
    queryFn: async () => (await api.get<{ signals: { label: { es: string; en: string } }[] }>(`/senales/vendor/${bodyVendor}`)).data,
    enabled: bodyVendor != null, staleTime: 10 * 60 * 1000, retry: false,
  })
  const chapter = flight?.chapters[fn]
  const compiled = useMemo(
    () => (manifest && chapter ? compileWaypoint(chapter, manifest, bodies, system) : null),
    [manifest, chapter, bodies, system],
  )
  const selMoon = moonSet && moon != null ? moonSet.moons.find((m) => m.id === moon) ?? null : null
  // sky-dive: a selected contract that is a piece of a same-day lot rings its siblings (/newtabs/mismo-dia/piezas)
  const lotQ = useQuery({
    queryKey: ['mismo-dia-piezas', selMoon?.inst, bodyVendor, selMoon?.date],
    queryFn: async () => (await api.get<{ available: boolean; rows: { id: number; amount_mxn: number }[] }>('/newtabs/mismo-dia/piezas',
      { params: { institution_id: selMoon!.inst, vendor_id: bodyVendor, date: selMoon!.date.slice(0, 10) } })).data,
    enabled: !!selMoon && selMoon.inst != null && bodyVendor != null && /^\d{4}-\d{2}-\d{2}/.test(selMoon.date),
    staleTime: 10 * 60 * 1000, retry: false,
  })
  const sigC = useContractSignals(selMoon?.id ?? null)
  const lot = lotQ.data?.available && lotQ.data.rows.some((r) => r.id === selMoon?.id)
    ? { n: lotQ.data.rows.length, sum: lotQ.data.rows.reduce((a, r) => a + (r.amount_mxn || 0), 0), ids: lotQ.data.rows.map((r) => r.id) } : null
  // Z3: the buyer's canonical star and its prefetched system («Otros proveedores aquí»)
  const moonStar = selMoon?.inst != null ? starOf(selMoon.inst) ?? null : null
  const moonSysQ = useSkySystem(S && moonStar != null ? S.id[moonStar] : null, manifest?.layout_version)
  // a trail restored from the URL names its planets from their hosts' systems (same cache key, after the first `end`)
  const trailHosts = [...new Set(trail.filter((p) => p.p != null && p.s != null).map((p) => canon.get(p.s!) ?? p.s!))]
  const trailSys = useQueries({
    queries: trailHosts.map((inst) => ({
      queryKey: ['atlas-sky', 'system', manifest?.layout_version, inst],
      queryFn: async () => (await api.get<SkySystem>('/atlas/sky/system', { params: { inst } })).data,
      enabled: !!manifest && loc != null,
      staleTime: 24 * 60 * 60 * 1000,
    })),
  })
  for (const b of [...(system?.bodies ?? []), ...(moonSysQ.data?.bodies ?? []), ...trailSys.flatMap((q) => q.data?.bodies ?? [])]) {
    names.current.set(b.vendor_id, b.name)
  }
  if (band) names.current.set(band.row.vendor_id, band.row.name)

  // ── names for crumbs and trail chips ────────────────────────────────────
  const sectorName = (id: number | null | undefined) => {
    const g = manifest?.sectors.find((s) => s.id === id)
    return g ? (lang === 'en' ? g.name_en : g.name_es) : ''
  }
  const starName = (i: number) => (S ? formatEntityName('institution', S.name[i], 'full') : '')
  const vendorName = (v: number) => {
    const n = names.current.get(v)
    // F16: a withheld body arrives nameless — its public label, never a name
    return n ? formatEntityName('vendor', n, 'full') : n === '' ? withheldLabel(v, lang) : `PV ${v}`
  }
  const posLabel = (p: SkyPos) => {
    if (p.p != null) return p.m != null ? `${vendorName(p.p)} · #${p.m}` : vendorName(p.p)
    if (p.s != null) { const i = starOf(p.s); return i !== undefined ? starName(i) : `INS ${p.s}` }
    return p.g != null ? sectorName(p.g) : skyCopy('levelZ0', lang)
  }

  // ── the URL: the position of a location, replace on `end`, push per hop ──
  // yr / cmp (S2 / S3) are carried through every write untouched; only popstate sets them
  const live = useRef({ loc, moon, trail, period, band, tab, pins, yr: init.yr, cmp: init.cmp, lente: init.lente })
  live.current = { ...live.current, loc, moon, trail, period, band, tab, pins, yr, cmp, lente }
  const posOf = (l: SkyLocation | null, m: number | null): SkyPos => {
    if (!l || !manifest || !bodies) return {}
    if (l.level === 2 && l.body != null) return { s: manifest.stars.id[bodies.hostIdx[l.body]], p: bodies.vendorId[l.body], ...(m != null ? { m } : {}) }
    if (l.star != null) {
      const b = live.current.band
      return { s: manifest.stars.id[l.star], ...(b && b.star === l.star ? { p: b.row.vendor_id } : {}) }
    }
    return l.sector != null ? { g: l.sector } : {}
  }
  const query = (pos: SkyPos, tr = live.current.trail) =>
    `${window.location.pathname}${withVista(liveQuery(live.current, { cam: camRef.current, lv: manifest?.layout_version ?? null, pos, search: window.location.search, trail: tr }))}`
  const replaceUrl = () => {
    const { loc: l, moon: m } = live.current
    window.history.replaceState(window.history.state, '', query(posOf(l, m)))
  }
  const timer = useRef<number>(0)
  const onEnd = useCallback((l: SkyLocation, cam: SkyCam, user: boolean) => {
    camRef.current = cam
    setLeaving(false)
    // §3.11: a programmatic `end` never touches the flight; a reader's gesture takes the controls
    if (user && flightRef.current.id && !flightRef.current.taken) setTakenFor(flightRef.current.id)
    setLoc(l)
    live.current.loc = l
    if (l.level === 2) moonPending.current = false
    if (l.level < 2 && !moonPending.current) { setMoon(null); live.current.moon = null }
    if (l.level === 0 || (live.current.band && l.star !== live.current.band.star)) { setBand(null); live.current.band = null }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(replaceUrl, 250)
  }, [manifest, bodies]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onHop = useCallback((t: HopTarget) => {
    if (flightRef.current.id && !flightRef.current.taken) setTakenFor(flightRef.current.id)
    setLeaving(t.kind !== 'home')
    const { loc: l, moon: m, trail: tr } = live.current
    const next = [...tr, posOf(l, m)]
    setTrail(next)
    live.current.trail = next
    setMoon(t.kind === 'moon' ? t.id : null)
    live.current.moon = t.kind === 'moon' ? t.id : null
    window.history.pushState({ ...(window.history.state ?? {}), atlasDepth: depth() + 1 }, '', query(posOf(l, m), next))
  }, [manifest, bodies]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Fly to a position by ids, no trail push (deep link, Back / Forward without a camera, local retrace). */
  const flyPos = async (p: SkyPos) => {
    const api = apiRef.current
    if (!api || !bodies || !manifest) return
    if (p.p != null) {
      const i = bodies.index.get(p.p)
      if (i !== undefined) return api.fly({ kind: 'body', idx: i })
      const sys = await fetchSystemForVendor(p.p).catch(() => null)
      const host = sys ? starIdx.get(sys.star.id) : undefined
      if (sys?.focus?.drawn && bodies.index.has(sys.focus.vendor_id)) return api.fly({ kind: 'body', idx: bodies.index.get(sys.focus.vendor_id)! })
      if (host === undefined) return api.fly({ kind: 'home' })
      if (sys?.focus?.row && sys.focus.sky) showBand({ star: host, year: sys.focus.year ?? 2002, row: sys.focus.row })
      return api.fly({ kind: 'star', idx: host })
    }
    const i = p.s != null ? starOf(p.s) : undefined
    if (i !== undefined) return api.fly({ kind: 'star', idx: i })
    api.fly(p.g != null ? { kind: 'sector', id: p.g } : { kind: 'home' })
  }
  const showBand = (h: BandHit) => {
    setBand({ star: h.star, row: h.row })
    live.current.band = { star: h.star, row: h.row }
    setPulse({ star: h.star, year: h.year, at: performance.now() })
  }

  /** Back one hop: the browser's own entry when it is ours, else a local retrace of the URL trail. */
  const back = (to = live.current.trail.length - 1) => {
    const tr = live.current.trail
    if (to < 0 || to >= tr.length) return
    const steps = tr.length - to
    if (depth() >= steps) return window.history.go(-steps)
    const target = tr[to]
    setTrail(tr.slice(0, to))
    live.current.trail = tr.slice(0, to)
    setMoon(target.m ?? null)
    window.history.replaceState(window.history.state, '', query(target, tr.slice(0, to)))
    void flyPos(target)
  }

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), atlasDepth: depth() }, '')
    const onPop = () => {
      const st = parseSkyQuery(window.location.search)
      live.current = popLive(live.current, st) // pins are never re-read (§3.6)
      setTrail(st.trail)
      setPeriod(st.period)
      setTab(st.tab)
      setYr(st.yr)
      setCmp(st.cmp)
      setLente(st.lente)
      setMoon(st.pos.m ?? null)
      if (st.cam && (!st.lv || st.lv === manifest?.layout_version)) apiRef.current?.goTo(st.cam)
      else void flyPos(st.pos)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [manifest, bodies]) // eslint-disable-line react-hooks/exhaustive-deps

  // §3.9 verbs at page level: `/` Volar · `?` key map · `m` finder · Esc / `[` back · `]` forward
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el?.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
    else if (e.key === '?') { e.preventDefault(); setKeys((k) => !k) }
    else if (e.key === 'm') setFinder((f) => !f)
    else if (e.key === 'Escape' && keysOpen.current) setKeys(false)
    else if (e.key === 'Escape' && logRef.current) setLogOpen(false)
    else if (e.key === 'Escape' && flightRef.current.id && !flightRef.current.taken) setTakenFor(flightRef.current.id)
    else if (e.key === 'Escape' && tramaOf(live.current.tab)) chooseTab(null)
    // sky-dive Esc ladder: Esc climbs one level (contract → supplier → agency → sector → overview); `[` retraces one hop
    else if (e.key === 'Escape') { e.preventDefault(); up() }
    else if (e.key === '[') { e.preventDefault(); back() }
    else if (e.key === ']') window.history.forward()
    else if (e.key === '{') { e.preventDefault(); back(0) } // §3.9: retrace to the origin in one step (`[` stays back)
    else if (keysOpen.current || live.current.cmp) return // instruments §4.4: single letters are inert while the key map or the twin plate is open
    else if (e.key === 't') { e.preventDefault(); railRef.current?.focus() }
    else if (e.key === 'c') openCatalog(true)
    else if (e.key === 'b') togglePin()
    else if (e.key === 'e') setExp((x) => !x)
    else if (e.key === 'x') openCompare()
    else if (e.key === 'h') setLogOpen((o) => !o)
    else if ('jJ.'.includes(e.key)) step(1)
    else if ('kK,'.includes(e.key)) step(-1)
    else if (/^[1-9]$/.test(e.key)) goPin(Number(e.key) - 1)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const keysOpen = useRef(keys)
  keysOpen.current = keys
  const logRef = useRef(logOpen)
  logRef.current = logOpen

  // Deep link without a usable camera: ids win once the sky has decoded.
  const deepDone = useRef(false)
  useEffect(() => {
    if (deepDone.current || !manifest || !bodies || !apiRef.current) return
    deepDone.current = true
    if (init.lv && !lvOk && (init.pos.s != null || init.pos.p != null || init.cam)) setNotice('relayout')
    // two frames: the control ear mounts with the sky, the masthead block re-measures --atlas-chrome and the
    // engine resizes (s0 changes) — a flight aimed before that lands on the wrong world point (live on main)
    if (!initialCam && !init.vuelo && (init.pos.s != null || init.pos.p != null || init.pos.g != null)) {
      requestAnimationFrame(() => requestAnimationFrame(() => void flyPos(init.pos)))
    }
  })

  // §3.11.7 first visit: desktop, no reduced motion, nothing asked for in the URL
  useEffect(() => {
    if (!manifest || !bodies || init.vuelo || init.cam || init.pos.s != null || init.pos.p != null || init.pos.g != null || reducedMotion()) return
    // a shared deep link (lens, year, tab, pins…) is what the reader asked for — never hijack it with the tour
    if ([...new URLSearchParams(window.location.search).keys()].some(k => k !== 'vista')) return
    try { if (window.localStorage.getItem(ATLAS_VISITED_KEY)) return } catch { return }
    // 2026-11-04 clarity (walkthrough #1): the page opens on the Panorama of 12 sectors; the tour is offered, never auto-run
    setFirstVisit(true)
  }, [!!manifest && !!bodies]) // eslint-disable-line react-hooks/exhaustive-deps
  const markVisited = () => { try { window.localStorage.setItem(ATLAS_VISITED_KEY, '1') } catch { /* private mode */ } }
  const skipFirst = () => { markVisited(); setFirstVisit(false) }
  /** `home`: the tour's × flies back to the Panorama (a skipped tour never leaves the reader parked on IMSS) */
  const closeFlight = (home = false) => {
    setFirstVisit(false); setTakenFor(null); writeSearch({ vuelo: null, n: null })
    // two frames: the flight card unmounts and the engine re-measures first (a hop aimed before lands off-centre)
    if (home) requestAnimationFrame(() => requestAnimationFrame(() => hop({ kind: 'home' })))
  }
  const startFlight = (id: string) => { markVisited(); setMenu(false); setFirstVisit(false); setTakenFor(null); writeSearch({ vuelo: id, n: null }, true) }
  const resumeFlight = () => { setTakenFor(null); if (compiled) apiRef.current?.fly(compiled.target) }

  // pins: the session mirror follows the page state; the URL follows on the next write (§3.6)
  useEffect(() => { mirrorPins(pins) }, [pins])

  /** §3.1 dock tabs: Ficha (default) · Cuadrante (S2) · Catálogo; written with `replace` like every live param */
  const chooseTab = (t: string | null) => {
    setTab(t)
    live.current.tab = t
    replaceUrl()
  }
  const cat = catOf(tab)
  // merge § 5: La Trama takes the dock slot at any level while `tab=trama[.N]`
  const trama = tramaOf(tab)
  // ── instruments §3.4 «Qué cambió»: the pure diff of the located star, and its marks on the frozen plate ──
  const pair = diffOf(tab)
  const diffNow = useMemo(() => {
    if (!pair || !system?.star.period_v || !manifest) return null
    const host = skyHostRef.current
    // the 8 px floor is read at the star's Z1 arrival radius (camForStar: 0.42 × the free area)
    const rPx = host ? 0.42 * Math.min(host.clientWidth - DOCK_PX, host.clientHeight - 64) : 210
    return systemDiff(system, manifest.meta, pair[0], pair[1], rPx, manifest.data_cut)
  }, [pair?.[0], pair?.[1], system, manifest]) // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo<SkyMarks | null>(() => {
    if (!diffNow || diffNow.refused || !bodies || loc?.star == null || loc.level < 1) return null
    const ix = (v: number) => bodies.index.get(v)
    const ids = (rows: { vendor_id: number }[]) => rows.slice(0, 10).map((r) => ix(r.vendor_id)).filter((i): i is number => i !== undefined)
    return {
      star: loc.star, arrive: ids(diffNow.arrivals), depart: ids(diffNow.departures),
      whiskers: diffNow.stays.filter((st) => st.drawn).slice(0, 10).flatMap((st) => { const i = ix(st.vendor_id); return i === undefined ? [] : [[i, st.shareA, st.shareB] as [number, number, number]] }),
    }
  }, [diffNow, bodies, loc?.star, loc?.level])

  // ── §3.7 «Lámina doble»: same star, two sexenios; `x` opens with the diff's pair (or Parpadeo's default) ──
  const cmpSel = cmpOf(cmp)
  const cmpIdx = cmpSel ? starOf(cmpSel.star) : undefined
  const cmpSysQ = useSkySystem(cmpSel && S && cmpIdx !== undefined ? S.id[cmpIdx] : null, manifest?.layout_version)
  const hostBox = skyHostRef.current ? { w: skyHostRef.current.clientWidth, h: skyHostRef.current.clientHeight } : { w: 1168, h: 560 }
  const cmpDisc = Math.max(240, Math.min(440, Math.floor((hostBox.w - (hostBox.w >= 1300 ? 230 : 200) - 48) / 2), hostBox.h - 96))
  const cmpDiff = useMemo(
    () => (cmpSel && cmpSysQ.data?.star.period_v && manifest
      ? systemDiff(cmpSysQ.data, manifest.meta, cmpSel.A, cmpSel.B, cmpDisc / 2 - 14, manifest.data_cut) : null),
    [cmp, cmpSysQ.data, manifest, cmpDisc], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const openCompare = () => {
    const l = live.current.loc
    if (!l || l.level < 1 || l.star == null || !S) return say(skyCopy('twinNone', lang))
    const [A, B] = diffOf(live.current.tab) ?? defaultPair(live.current.period)
    const c = cmpToken(S.id[l.star], A, B)
    setCmp(c)
    live.current.cmp = c
    window.history.pushState({ ...(window.history.state ?? {}), atlasDepth: depth() + 1 }, '', query(posOf(l, live.current.moon)))
  }
  const closeCompare = () => {
    setCmp(null)
    live.current.cmp = null
    replaceUrl()
  }
  const [catFocus, setCatFocus] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef(0)
  const say = (m: string) => { setFlash(m); window.clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlash(null), 3200) }
  /** `c`: the catalog lives on the dock, which exists from Z1 on (§3.1) */
  const openCatalog = (focus: boolean) => {
    const l = live.current.loc
    if (!l || l.level < 1 || l.star == null) return say(skyCopy('catZ0', lang))
    const c = catOf(live.current.tab)
    if (c && !focus) return chooseTab(null)
    setCatFocus(focus)
    chooseTab(`cat.${c?.scope ?? 'system'}.${c?.sort ?? 'money'}`)
  }

  // ── §3.6 pins: page state, `b` toggles the focus, `1`–`9` fly ─────────────
  const setPinsLive = (next: SkyPos[]) => {
    setPins(next)
    live.current.pins = next
    replaceUrl()
  }
  const togglePin = () => {
    const pos = posOf(live.current.loc, live.current.moon)
    if (pos.s == null && pos.p == null) return say(skyCopy('pinNone', lang))
    const tok = posToken(pos), cur = live.current.pins
    const k = cur.findIndex((p) => posToken(p) === tok)
    if (k >= 0) return setPinsLive(cur.filter((_, j) => j !== k))
    if (cur.length >= MAX_PINS) return say(skyCopy('pinsFull', lang, { max: MAX_PINS }))
    setPinsLive([...cur, pos])
  }
  /** Fly to a stored position as a hop (trail push): drawn body › star › the undrawn fallback. */
  const hopPos = (p: SkyPos) => {
    const i = p.p != null ? bodies?.index.get(p.p) : undefined
    if (i !== undefined) {
      hop({ kind: 'body', idx: i })
      if (p.m != null) { setMoon(p.m); live.current.moon = p.m }
      return
    }
    const si = p.s != null ? starOf(p.s) : undefined
    if (si !== undefined) return hop({ kind: 'star', idx: si })
    void flyPos(p)
  }
  const goPin = (n: number) => { const p = live.current.pins[n]; if (p) hopPos(p) }
  const pinItems: PinItem[] = pins.map((p) => {
    const i = p.p != null ? bodies?.index.get(p.p) : undefined
    const si = i !== undefined ? bodies!.hostIdx[i] : p.s != null ? starOf(p.s) : undefined
    const at = S && si !== undefined
      ? { x: i !== undefined ? bodies!.x[i] : S.x[si], y: i !== undefined ? bodies!.y[i] : S.y[si], hx: S.x[si], hy: S.y[si] }
      : null
    return { label: posLabel(p), at }
  })
  const pinsBlock = <SkyPinsBlock pins={pinItems} lang={lang} onGo={goPin} onRemove={(n) => setPinsLive(live.current.pins.filter((_, j) => j !== n))} />

  // ── §4.1 siblings: stars of the sector by V (Z0 framed, Z1) · planets by share on the public basis (Z2) ──
  const secStars = useMemo(() => (manifest && loc?.sector != null ? starsOfSector(manifest, loc.sector) : null), [manifest, loc?.sector])
  const sib = (() => {
    if (!S || !loc) return null
    if (loc.level === 2) {
      if (!system || bodyVendor == null) return null
      const list = system.ranked.filter((v) => bodies?.index.has(v))
      return { i: list.indexOf(bodyVendor), n: list.length, scope: S.siglas[loc.star!] || starName(loc.star!), order: skyCopy('stepShare', lang),
        w: system.bodies.length - system.ranked.length, go: (k: number) => flyBody(list[k]) }
    }
    if (!secStars || (loc.level === 0 && loc.sector == null)) return null
    return { i: loc.star != null ? secStars.indexOf(loc.star) : -1, n: secStars.length, scope: sectorName(loc.sector), order: skyCopy('stepMoney', lang),
      w: 0, go: (k: number) => hop({ kind: 'star', idx: secStars[k] }) }
  })()
  const step = (d: 1 | -1) => {
    if (!sib || !sib.n) return
    const k = sib.i < 0 ? (d > 0 ? 0 : -1) : sib.i + d
    if (k >= 0 && k < sib.n) sib.go(k)
  }

  // ── §3.8 export: CSV of the rows on screen, built client-side on the public basis ──
  const visiblePart = (): CsvPart | null => {
    if (!manifest) return null
    const l = live.current.loc
    const c = catOf(live.current.tab)
    if (l && l.star != null && l.level >= 1 && c?.scope !== 'sector') return system ? systemPart(system) : null
    return secStars && l?.sector != null ? starPart(manifest, secStars) : null
  }
  const pinsCsv = (): CsvPart => pinsPart(live.current.pins.map((p) => {
    const si = p.s != null ? starOf(p.s) : undefined
    const n = p.p != null ? names.current.get(p.p) : undefined
    return { institution_id: p.s ?? null, institution_name: si !== undefined && S ? S.name[si] : '', vendor_id: p.p ?? null,
      vendor_name: p.p == null ? '' : n === '' ? null : n, contract_id: p.m ?? null }
  }))
  const exportCsv = (part: CsvPart | null, what: string) => {
    setExp(false)
    if (!manifest || !part) return say(skyCopy('exportNone', lang))
    const meta = { layout_version: manifest.layout_version, data_cut: manifest.data_cut, risk_basis: manifest.risk_basis, view_url: window.location.href }
    const l = live.current.loc
    downloadCsv(`rubli-atlas-${what}-${l?.star != null && S ? S.id[l.star] : l?.sector ?? 'campo'}-${manifest.layout_version}.csv`, csvText(meta, part))
  }
  /** §3.8 PNG (F23): the canvas snapshot + a drawn header and colophon — geometry only, no DOM label, so no name of
   *  a withheld body can reach the plate (the canvas draws institution rim names only). Desktop only in v1. */
  const exportPng = () => {
    setExp(false)
    const host = skyHostRef.current, snap = apiRef.current?.snapshot() ?? null
    if (!manifest || !host || !snap) return say(skyCopy('exportNone', lang))
    const W = host.clientWidth, H = host.clientHeight, v = viewRef.current
    const pinsXY = v ? pinItems.flatMap((p, n) => {
      if (!p.at) return []
      const x = ((p.at.x - v.x0) / (v.x1 - v.x0)) * W, y = ((p.at.y - v.y0) / (v.y1 - v.y0)) * H
      return x >= 0 && x <= W && y >= 0 && y <= H ? [{ x, y, n: n + 1 }] : []
    }) : []
    const fc = host.querySelector<HTMLCanvasElement>(`canvas[aria-label="${skyCopy('finder', lang)}"]`)
    const hr = host.getBoundingClientRect(), fr = fc?.getBoundingClientRect()
    const l = live.current.loc
    const per = live.current.period
    const refusal = diffNow?.refused ? skyCopy('diffRefuse', lang, { B: periodName(diffNow.refused.period), nota: '', note: '' }) : ''
    const plate = plateCanvas(snap, snap.width / W, {
      title: skyCopy('plateTitle', lang),
      path: `${skyCopy('youAreIn', lang)} ${crumbs.map((c) => c.label).join(' › ')}`,
      level: [levelName, per ? periodName(per) : skyCopy('allPeriods', lang), effYr ?? ''].filter((x) => x !== '').join(' · '),
      colophon: [
        `${skyCopy('basisLine', lang, { basis: basisVer, cut })} · ${skyCopy('colophonRisk', lang)}`,
        `${skyCopy('arbitrary', lang)} · ${skyCopy('pngNoLabels', lang)}`,
        [...stamps, refusal].filter(Boolean).join(' · '),
        `layout_version ${manifest.layout_version} · ${skyCopy('colCut', lang, { cut })} · ${new Date().toISOString().slice(0, 16)}Z`,
        window.location.href,
      ],
    }, { width: l && l.level >= 1 && l.star != null ? W - DOCK_PX : W, pins: pinsXY, finder: fc && fr ? { canvas: fc, x: fr.left - hr.left, y: fr.top - hr.top, w: fr.width, h: fr.height } : null })
    const id = l?.level === 2 && bodyVendor != null ? bodyVendor : l?.star != null && S ? S.id[l.star] : l?.sector ?? 'campo'
    downloadCanvas(`rubli-atlas-z${l?.level ?? 0}-${id}-${manifest.layout_version}.png`, plate)
  }
  const copyLink = () => {
    setExp(false)
    void navigator.clipboard?.writeText(window.location.href).then(() => say(skyCopy('linkCopied', lang)), () => {})
  }

  const choosePeriod = (p: PeriodKey | null) => {
    setPeriod(p)
    live.current.period = p
    replaceUrl()
  }
  const yrTimer = useRef(0)
  const chooseYear = (y: number | null) => {
    setYr(y)
    live.current.yr = y
    window.clearTimeout(yrTimer.current)
    yrTimer.current = window.setTimeout(replaceUrl, 250)
  }
  useEffect(() => () => window.clearTimeout(yrTimer.current), [])

  const hop = (t: HopTarget) => apiRef.current?.hop(t)
  /** sky-dive: one level up — contract → supplier → agency → sector → overview */
  const up = () => {
    const l = live.current.loc
    if (!l) return
    if (live.current.moon != null) { setMoon(null); live.current.moon = null; replaceUrl(); return }
    if (l.level === 2 && l.star != null) return hop({ kind: 'star', idx: l.star })
    if (l.level === 1 && l.sector != null) return hop({ kind: 'sector', id: l.sector })
    if (l.sector != null || l.level > 0) hop({ kind: 'home' })
  }
  const chooseLens = (k: SkyLensIdx) => {
    const v = k ? SKY_LENSES[k - 1] : null
    setLente(v)
    live.current.lente = v
    replaceUrl()
  }
  const lensIdx: SkyLensIdx = lente ? ((SKY_LENSES.indexOf(lente) + 1) as SkyLensIdx) : 0
  /** the arrangement row: from an agency or a supplier, an arrangement takes the reader back to the overview */
  const arrange = (k: SkyLensIdx) => {
    chooseLens(k)
    say(`${skyCopy('lensLabel', lang)}: ${skyCopy('lensNames', lang).split(' · ')[k]}`) // the reading lines above say the rest
    if (k && (loc?.level ?? 0) > 0) hop({ kind: 'home' })
  }
  /** the canvas lens: a framed sector's own stars, or (overview, no sector framed) every agency on one chart */
  const lensOn: SkyLensIdx = leaving || !loc || loc.level > 0 ? 0 : lensIdx
  const cite = () => { void navigator.clipboard?.writeText(window.location.href).then(() => say(skyCopy('citeDone', lang)), () => {}) }
  const flyBody = (v: number) => { const i = bodies?.index.get(v); if (i !== undefined) hop({ kind: 'body', idx: i }) }

  // ── «ESTÁS EN» crumbs, computed from the camera on `end` ─────────────────
  const crumbs: Crumb[] = [{ label: skyCopy('levelZ0', lang), onClick: () => hop({ kind: 'home' }) }]
  if (loc?.sector != null) crumbs.push({ label: sectorName(loc.sector), onClick: () => hop({ kind: 'sector', id: loc.sector! }) })
  if (loc?.star != null) crumbs.push({ label: starName(loc.star), onClick: () => hop({ kind: 'star', idx: loc.star! }) })
  if (loc?.level === 2 && loc.body != null) crumbs.push({ label: vendorName(bodies!.vendorId[loc.body]), onClick: () => hop({ kind: 'body', idx: loc.body! }) })
  if (selMoon) crumbs.push({ label: `#${selMoon.id}` })
  const levelName = selMoon ? skyCopy('levelZ3', lang) : loc?.level === 2 ? skyCopy('levelZ2', lang) : loc?.level === 1 ? skyCopy('levelZ1', lang) : skyCopy('levelZ0', lang)

  const cut = manifest ? formatCut(manifest.data_cut, lang) : ''
  const effFrame: PeriodKey | null = flight && compiled && !taken ? (compiled.period != null ? PERIOD_KEYS[compiled.period] : null) : frame
  const basisVer = manifest ? /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis : ''
  const fi = effFrame ? PERIOD_KEYS.indexOf(effFrame) : -1
  const periodLine = useMemo(() => {
    if (!bodies || fi < 0) return null
    let n = 0
    for (let i = 0; i < bodies.n; i++) if (bodies.period[fi][i]) n++
    return skyCopy('lit', lang, { sexenio: periodName(effFrame!), n: formatNumber(n), N: formatNumber(bodies.n) })
  }, [bodies, fi, effFrame, lang])

  // ── instruments §3.3 rail: scope histogram, the star's coverage (F1), the readout and the year's stamps ──
  const meta = bodies?.hasYears ? manifest?.meta ?? null : null
  const flightHolds = !!flight && !taken
  const effYr = flightHolds ? null : yr
  const railStar = loc && loc.star != null && loc.level >= 1 && system?.star.first_data_year != null
    ? { first: system.star.first_data_year, last: system.star.last_data_year!, gaps: system.star.gap_years ?? [] } : null
  const scopeName = S && loc?.star != null ? S.siglas[loc.star] || starName(loc.star) : ''
  const rail = useMemo((): { hist: RailHist | null; basis: string } => {
    if (!meta || !S) return { hist: null, basis: '' }
    if (loc && loc.level >= 1 && loc.star != null) {
      if (!system?.years) return { hist: null, basis: '' }
      const values = new Array<number>(N_YEARS).fill(0)
      for (const r of system.years) values[r.year - YEAR0] = r.value_mxn
      const under = loc.level === 2 && loc.body != null && bodies ? bodies.ym[loc.body] : undefined
      return { hist: { values, under }, basis: skyCopy(under != null ? 'railBasisPlanet' : 'railBasisStar', lang, { star: scopeName }) }
    }
    if (loc?.sector != null && S.ym) {
      const values = new Array<number>(N_YEARS).fill(0)
      for (let i = 0; i < S.id.length; i++) {
        if (S.sector[i] !== loc.sector) continue
        for (let k = 0; k < N_YEARS; k++) if ((S.ym[i] >>> k) & 1) values[k]++
      }
      return { hist: { values }, basis: skyCopy('railBasisSector', lang, { sector: sectorName(loc.sector) }) }
    }
    return { hist: { values: meta.year_value }, basis: skyCopy('railBasisSky', lang) }
  }, [meta, S, loc, system, bodies, lang, scopeName]) // eslint-disable-line react-hooks/exhaustive-deps
  const readout = useMemo(() => {
    if (effYr == null || !bodies?.hasYears) return ''
    const at = loc && loc.level >= 1 && loc.star != null ? loc.star : null
    let a = 0, n = 0
    for (let i = 0; i < bodies.n; i++) {
      if (at != null && bodies.hostIdx[i] !== at) continue
      if (hasYear(bodies.ym[i], effYr)) a++
      if (2000 + bodies.year[i] === effYr) n++
    }
    const loc$ = lang === 'en' ? 'en-US' : 'es-MX'
    const rest = at != null && system ? system.remainder.find((r) => r[0] === effYr)?.[2] ?? 0 : null
    return rest == null
      ? skyCopy('railReadSky', lang, { y: effYr, a: a.toLocaleString(loc$), n: n.toLocaleString(loc$) })
      : skyCopy('railRead', lang, { y: effYr, a: a.toLocaleString(loc$), n: n.toLocaleString(loc$), m: rest.toLocaleString(loc$) })
  }, [effYr, bodies, loc, system, lang])
  // the stamp column (furniture, labels avoid it): basis + the year's honesty line in one row, then coverage
  const stamps: string[] = []
  if (rail.hist || (effYr != null && meta)) {
    // CYAN 2026-11-04: the sky's own basis is the year bar's purpose line, printed right under the bar (figcaption)
    const purpose = rail.basis === skyCopy('railBasisSky', lang)
    const line = [rail.hist && !purpose ? rail.basis : '', effYr != null && meta ? skyCopy('yearStamp', lang, { Y: effYr }) : ''].filter(Boolean).join(' · ')
    if (line) stamps.push(line)
  }
  if (effYr != null && meta) {
    const loc$ = lang === 'en' ? 'en-US' : 'es-MX'
    const drop = meta.coverage_drop, inst = meta.inst_reporting
    for (const y of [skipped, effYr]) {
      if (y == null) continue
      if (meta.year_gaps.includes(y)) stamps.push(skyCopy('gap2004', lang, { y, n: meta.year_contracts[y - YEAR0] }))
      else if (meta.thin_early.includes(y)) stamps.push(skyCopy('thinEarly', lang, { n: meta.thin_early.reduce((a, t) => a + meta.year_contracts[t - YEAR0], 0) }))
      else if (y === effYr && drop.includes(y)) {
        stamps.push(skyCopy('coverageDrop', lang, {
          a: drop[0], b: drop[drop.length - 1], y0: drop[0] - 1, m: (inst[drop[0] - 1 - YEAR0] ?? 0).toLocaleString(loc$),
          n: Math.round(drop.reduce((t, d) => t + inst[d - YEAR0], 0) / drop.length).toLocaleString(loc$),
        }))
      }
    }
    if (railStar?.gaps.includes(effYr)) stamps.push(skyCopy('starGap', lang, { y: effYr }))
    else if (railStar && effYr > railStar.last) stamps.push(skyCopy('starStopped', lang, { y: railStar.last + 1 }))
    if (effYr === YEAR0 + N_YEARS - 1) stamps.push(skyCopy('partial', lang))
  }
  if (marks && pair) stamps.push(skyCopy('whisker', lang, { A: periodName(pair[0]), B: periodName(pair[1]) }))

  const ready = !!manifest && !!bodies
  const dockOpen = ready && !!loc && loc.level >= 1 && loc.star != null
  const flightCard = ready && !!flight && !taken
  const tramaOpen = ready && !!trama && !flightCard
  const nextFlight = flight ? ATLAS_STORIES[(ATLAS_STORIES.findIndex((s) => s.id === flight.id) + 1) % ATLAS_STORIES.length] : null
  // owner 11-06 «both lenses»: the host sector's hue under «Sectores»; ink under «Riesgo» (SILVER-4)
  const hostCode = S && loc?.star != null ? manifest?.sectors.find((g) => g.id === S.sector[loc.star!])?.code : undefined
  const accent = lensIdx === 0 ? SECTOR_COLORS[hostCode ?? 'otros'] ?? SECTOR_COLORS.otros : 'var(--color-text-primary)'
  const related = moonSysQ.data && bodyVendor != null
    ? moonSysQ.data.ranked.filter((v) => v !== bodyVendor).slice(0, 8)
      .map((v) => moonSysQ.data!.bodies.find((b) => b.vendor_id === v)!).filter(Boolean)
      .map((b) => ({ vendor_id: b.vendor_id, name: b.name, share: b.share }))
    : null

  const vendorFile = (r: SkySystemBody, onClose: () => void, lead?: ReactNode) => (
    <VendorFile
      lead={lead}
      key={r.vendor_id}
      item={toClusterItem(r, lang)}
      lens="sky"
      currentCode={null}
      codeLabels={patternLabels(lang)}
      lang={lang}
      accent={accent}
      variant="panel"
      onClose={onClose}
      onOpenVendor={(id) => navigate(`/vendors/${id}`)}
    />
  )

  const en = lang === 'en'
  /** Anexo 1 starts a tour and brings the sky into view (the flight card lives on the plate). */
  const startFromSheet = (id: string) => {
    startFlight(id)
    skyHostRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' })
  }
  const toolBtn = (label: string, on: boolean, onClick: () => void, extra?: { 'aria-haspopup'?: 'menu' }) => (
    <button type="button" className="at-btn" aria-expanded={on} onClick={onClick} {...extra}>{label}</button>
  )

  return (
    <article className="ct ct-page ct-sheet" style={{ '--atlas-foot': `${FOOT_PX}px` } as CSSProperties}>
      <div className="ct-wrap">
      <Cover
        className="is-op at-cover"
        title={skyCopy('h1', lang)}
        lead={
          <div className="at-head">
            {ready && (
              <>
                {/* owner 2026-10-27 «Vínculos navigation is shit»: the twelve sectors are one click away, always */}
                <div className="at-secbar" data-hues={lensIdx === 0 || undefined} role="group" aria-label={en ? 'Sectors' : 'Sectores'}>
                  {[...manifest!.sectors].sort((x, y) => y.value - x.value).map((g) => (
                    <button
                      key={g.id} type="button" aria-pressed={loc?.sector === g.id} onClick={() => hop({ kind: 'sector', id: g.id })}
                      className="at-sec" style={{ '--sc': SECTOR_COLORS[g.code] ?? SECTOR_COLORS.otros } as CSSProperties}
                    >
                      <i aria-hidden="true" />{en ? g.name_en : g.name_es}
                    </button>
                  ))}
                </div>
                <SkySearch
                  manifest={manifest!} bodies={bodies!} lang={lang} inputRef={searchRef}
                  onFlyStar={(i) => hop({ kind: 'star', idx: i })}
                  onFlyBody={(i) => hop({ kind: 'body', idx: i })}
                  onBand={(h) => { showBand(h); hop({ kind: 'star', idx: h.star }) }}
                />
              </>
            )}
            <VistaBlock className="at-vista" />
          </div>
        }
      />
      <MapaQuestion
        manifest={manifest ?? null} lang={lang} lens={lensOn} hues={lensIdx === 0} sector={loc?.framed ? loc.sector : null}
        onSector={(id) => hop({ kind: 'sector', id })}
        aside={ready ? <SkyArrange lens={lensIdx} onLens={arrange} lang={lang} layersReady={!!layers} /> : null}
      />
      <div className="at-stage">
      <nav className="at-rail" aria-label={en ? 'Where you are' : 'Ubicación actual'}>
        <ol className="at-ladder">
          {crumbs.map((c, n) => {
            const here = n === crumbs.length - 1
            return (
              <li key={n} aria-current={here ? 'location' : undefined}>
                {n > 0 && <span className="ct-sc">{(en ? ['Overview', 'Sector', 'Agency', 'Supplier', 'Contract'] : ['Panorama', 'Sector', 'Dependencia', 'Proveedor', 'Contrato'])[n]}</span>}
                {c.onClick && !here
                  ? <button type="button" onClick={c.onClick} className="at-rung">{c.label}</button>
                  : <span className="at-rung">{c.label}</span>}
                {here && ready && n > 0 && (
                  <span className="at-steprow">
                    {sib && sib.n > 0 && (
              <span role="group" aria-label={skyCopy('stepPill', lang, { i: sib.i + 1, n: sib.n, scope: sib.scope, order: sib.order })} className="at-step">
                <button type="button" onClick={() => step(-1)} disabled={sib.i <= 0} aria-label={skyCopy('stepPrev', lang)} title={skyCopy('stepPrev', lang)} className="at-btn is-mono" style={{ width: 40, padding: 0 }}>‹</button>
                <span title={[skyCopy('stepPill', lang, { i: sib.i < 0 ? '—' : sib.i + 1, n: formatNumber(sib.n), scope: sib.scope, order: sib.order }), sib.w ? skyCopy('stepWithheld', lang, { w: sib.w }) : ''].filter(Boolean).join(' · ')}>
                  {sib.i < 0 ? '—' : formatNumber(sib.i + 1)} / {formatNumber(sib.n)}
                </span>
                <button type="button" onClick={() => step(1)} disabled={sib.i >= sib.n - 1} aria-label={skyCopy('stepNext', lang)} title={skyCopy('stepNext', lang)} className="at-btn is-mono" style={{ width: 40, padding: 0 }}>›</button>
              </span>
            )}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        {ready && (
          <>
            <button type="button" onClick={() => setLogOpen((o) => !o)} className="at-btn" title={skyCopy('logBtn', lang)}>{en ? 'Log (h)' : 'Bitácora (h)'}</button>
                <div className="at-tools">
                  <button
                    type="button" aria-pressed={!!trama} onClick={() => chooseTab(trama ? null : 'trama')} className="at-btn"
                    title={en ? 'Co-awarded firms: who won parts of the same procedure' : 'Empresas que ganaron partes del mismo procedimiento'}
                  >
                    La Trama
                  </button>
                  <div style={{ position: 'relative' }}><SkyLegend manifest={manifest!} lang={lang} cut={cut} /></div>
                  <div style={{ position: 'relative' }}>
                    {toolBtn(`${skyCopy('exportBtn', lang)} ▾`, exp, () => setExp((x) => !x), { 'aria-haspopup': 'menu' })}
                    {exp && (
                      <div role="menu" aria-label={skyCopy('exportBtn', lang)} className="at-pop" style={{ width: 300 }}>
                        {(() => {
                          const [vis, pinsL, , png, link] = skyCopy('exportMenu', lang).split(' · ')
                          const item = (label: string, on: () => void, disabled = false) => (
                            <button key={label} type="button" role="menuitem" onClick={on} disabled={disabled} className={`at-item ${RING}`}>{label}</button>
                          )
                          return [
                            item(vis, () => exportCsv(visiblePart(), 'vista')),
                            item(pinsL, () => exportCsv(pinsCsv(), 'marcas'), !pins.length),
                            item(png, exportPng),
                            item(link, copyLink),
                          ]
                        })()}
                        <div className="at-foot">{skyCopy('exportBasis', lang)}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    {toolBtn(`${skyCopy('flights', lang)} ▾`, menu, () => setMenu((m) => !m))}
                    {menu && (
                      <div role="menu" aria-label={skyCopy('flightsMenu', lang)} className="at-pop" style={{ width: 360 }}>
                        {ATLAS_STORIES.map((st) => (
                          <button key={st.id} type="button" role="menuitem" onClick={() => startFlight(st.id)} className={`at-item ${RING}`}>
                            <span style={{ display: 'block', fontFamily: SERIF, fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>{en ? st.title.en : st.title.es}</span>
                            <span style={{ display: 'block', fontFamily: MONO, fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>{st.duration} · {en ? st.blurb.en : st.blurb.es}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
          <div className="at-inst">
            <button
              type="button" onClick={() => (dockOpen ? chooseTab(cat ? tab : 'cat.system.money') : say(skyCopy('catZ0', lang)))}
              aria-label={skyCopy('pins', lang, { n: pins.length, max: MAX_PINS })} title={skyCopy('pinsChip', lang)} className="at-btn is-mono"
              style={{ color: pins.length ? 'var(--color-text-primary)' : undefined }}
            >◆ {pins.length}</button>
            <button type="button" onClick={cite} className="at-btn">{skyCopy('cite', lang)}</button>
            <button type="button" onClick={openCompare} aria-label={skyCopy('twinOpen', lang)} title={skyCopy('twinOpen', lang)} className="at-btn is-mono"
              style={{ color: dockOpen ? undefined : 'var(--color-text-muted)' }}>A | B</button>
          </div>
            <div aria-live="polite" className="at-period">{readout || (periodLine ?? '')}</div>
            {!readout && !periodLine && (
              // 2026-11-04 clarity (walkthrough #14): a permanent mini-key, so the reader needn't open the Leyenda first
              <p className="at-key">
                <span><i aria-hidden="true" style={{ background: RISK_COLORS.critical }} />{en ? 'red: supplier with a critical risk indicator' : 'rojo: proveedor con indicador de riesgo crítico'}</span>
                <span><i aria-hidden="true" style={{ background: RISK_COLORS.high }} />{en ? 'orange: high indicator' : 'naranja: indicador alto'}</span>
                <span>{en ? 'bigger: more money' : 'más grande: más dinero'}</span>
              </p>
            )}
          </>
        )}
      </nav>
      <figure className="at-plate">
        {/* the plate fills the viewport once scrolled to (top bar + items row + a margin), never under 480 */}
        <div ref={skyHostRef} className="relative" style={{ height: 'max(480px, calc(100dvh - 128px - var(--atlas-foot, 0px)))' }}>
          {ready ? (
            <SkyEngine
              manifest={manifest} bodies={bodies} lang={lang} initialCam={initialCam}
              system={system} moons={moonSet} selectedMoon={moon}
              onEnd={onEnd} onHop={onHop} apiRef={apiRef}
              period={fi >= 0 ? fi : null} sizeByPeriod={bySize} pulse={pulse}
              highlight={flight ? compiled?.highlight ?? null : null} reserve={flightCard || tramaOpen}
              onFrame={(v) => { viewRef.current = v; finderDraw.current?.(v); pinsDraw.current?.(v); compassDraw.current?.(v) }}
              rimPx={COMPASS_RIM} year={effYr} stamps={stamps} marks={marks} paused={!!cmpSel && cmpIdx !== undefined}
              lens={lensOn} lensSector={loc?.framed ? loc.sector : null} hues={lensIdx === 0} links={links} onHoverMoon={setHoverMoon} onUnlabeled={setUnlabeled}
              layers={layers} overlay={loc && loc.level === 1 ? overlay : null} moonLens={moonLens} apagon={apagonMoons} siblings={lot?.ids ?? null}
              panel={loc?.framed && loc.sector != null && !flightCard && !tramaOpen ? (
                <ClusterReadout
                  manifest={manifest} bodies={bodies} sector={loc.sector} lang={lang} layers={layers} hues={lensIdx === 0}
                  unlabeled={unlabeled.filter((t) => t[0] === 's').map((t) => +t.slice(2))}
                  onFlyStar={(i) => { apiRef.current?.hover(null); hop({ kind: 'star', idx: i }) }}
                  onHoverStar={(i) => apiRef.current?.hover(i != null ? { kind: 'star', idx: i } : null)}
                />
              ) : null}
            >
              {finder && !(lensOn && !loc?.framed) && (
                <SkyFinder
                  manifest={manifest} lang={lang} drawRef={finderDraw}
                  sectorName={sectorName(loc?.sector)}
                  onSlew={(cam, ms) => apiRef.current?.goTo(cam, ms)}
                  onSector={(id) => hop({ kind: 'sector', id })} hues={lensIdx === 0}
                />
              )}
            </SkyEngine>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={eyebrow}>
              {error ? skyCopy('error', lang) : skyCopy('loading', lang)}
            </div>
          )}

          {ready && (
            <SkyCompass manifest={manifest!} pins={pinItems} drawRef={compassDraw} dockPx={DOCK_PX} active={dockOpen && !flightCard} lang={lang}
              onSector={(id) => hop({ kind: 'sector', id })} onPin={goPin} hues={lensIdx === 0} />
          )}
          {ready && pins.length > 0 && <SkyPennants pins={pinItems} drawRef={pinsDraw} viewRef={viewRef} lang={lang} onGo={goPin} />}
          {ready && bodies && !flight && (
            <SkyLasso hostRef={skyHostRef} viewRef={viewRef} bodies={bodies} level={loc?.level ?? 0} star={loc?.star ?? null} lang={lang} dockPx={DOCK_PX} />
          )}
          {firstVisit && !flight && loc?.sector == null && (
            <div role="status" className="absolute flex flex-wrap items-baseline gap-3" style={{ ...panel, left: 12, top: notice ? 44 : 8, zIndex: 7, maxWidth: 620, padding: '6px 10px', fontFamily: SERIF, fontSize: 15, color: 'var(--color-text-primary)' }}>
              <span>{skyCopy('firstVisit', lang)}</span>
              <button type="button" onClick={() => startFlight(ATLAS_STORIES[0].id)} className={RING} style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-accent-data)', background: 'transparent', border: '1px solid var(--color-accent-data)', padding: '2px 10px', cursor: 'pointer' }}>{skyCopy('startFlight', lang)} · {ATLAS_STORIES[0].duration} <span aria-hidden="true">→</span></button>
              <button type="button" onClick={skipFirst} className={RING} style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-secondary)', background: 'transparent', border: '1px solid var(--color-border)', padding: '2px 10px', cursor: 'pointer' }}>{skyCopy('skip', lang)}</button>
            </div>
          )}
          {flight && taken && (
            <div role="status" className="absolute flex flex-wrap items-baseline gap-3" style={{ ...panel, left: 12, top: notice ? 44 : 8, zIndex: 7, maxWidth: dockOpen ? `calc(100% - ${DOCK_PX + 24}px)` : 620, padding: '4px 10px', fontFamily: MONO, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>{skyCopy('paused', lang, { title: lang === 'en' ? flight.title.en : flight.title.es, i: Math.min(fn + 1, flight.chapters.length), n: flight.chapters.length })}</span>
              <button type="button" onClick={resumeFlight} className={RING} style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-accent-data)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>{skyCopy('resume', lang)}</button>
              <button type="button" aria-label={skyCopy('closeFlight', lang)} onClick={() => closeFlight()} className={RING} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
            </div>
          )}
          {flash && (
            <div role="status" className="absolute" style={{ ...panel, left: 12, top: notice ? 44 : 8, zIndex: 7, padding: '4px 10px', fontFamily: MONO, fontSize: 13, color: 'var(--color-text-secondary)' }}>{flash}</div>
          )}
          {notice && (
            <div className="absolute flex flex-wrap items-baseline gap-2" style={{ ...panel, left: 12, top: 8, zIndex: 6, maxWidth: 620, padding: '4px 8px', fontFamily: MONO, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>{skyCopy(notice === 'relayout' ? 'relayout' : notice === 'patterns' ? 'patternsNotice' : 'categoriesNotice', lang)}</span>
              {notice === 'patterns' && init.code && <EntityIdentityChip type="pattern" id={init.code} name={init.code} size="xs" />}
              {notice === 'patterns' && <Link to={init.code ? `/aria?pattern=${init.code}` : '/aria'} style={{ color: 'var(--color-accent-data)' }}>{skyCopy('openAria', lang)} ↗</Link>}
              {notice === 'categories' && <Link to="/categories" style={{ color: 'var(--color-accent-data)' }}>{skyCopy('openCategories', lang)} ↗</Link>}
              <button type="button" aria-label={skyCopy('close', lang)} onClick={() => setNotice(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
            </div>
          )}
          {flightCard && (
            <aside
              className="absolute top-0 right-0 flex flex-col"
              style={{ width: DOCK_PX, bottom: 0, zIndex: 5, borderLeft: '1px solid var(--color-border)', background: 'var(--color-background)', overflowY: 'auto' }}
              aria-label={skyCopy('flights', lang)}
            >
              <FlightPlayer
                flight={flight!} n={fn} compiled={compiled} lang={lang} lv={manifest?.layout_version} cut={cut}
                apiRef={apiRef} autoplay={!reducedMotion()} taken={taken}
                onGo={(k) => writeSearch({ n: k ? String(k) : null }, true)}
                onTake={() => setTakenFor(flight!.id)} onResume={resumeFlight} onClose={() => closeFlight()} onExit={() => closeFlight(true)}
                onNextFlight={startFlight} onFlyBody={flyBody} nextFlight={nextFlight}
              />
            </aside>
          )}
          {tramaOpen && (
            <aside
              className="absolute top-0 right-0 flex flex-col"
              style={{ width: DOCK_PX, bottom: 0, zIndex: 4, borderLeft: '1px solid var(--color-border)', background: 'var(--color-background)', overflowY: 'auto' }}
              aria-label="La Trama"
            >
              <Suspense fallback={<div className="p-4" style={eyebrow}>{skyCopy('loading', lang)}</div>}>
                <TramaPanel
                  lang={lang} comm={trama!.comm}
                  onComm={(id) => chooseTab(`trama.${id}`)} onClose={() => chooseTab(null)}
                  onFlyVendor={(v) => { if (bodies?.index.has(v)) flyBody(v); else void flyPos({ p: v }) }}
                />
              </Suspense>
            </aside>
          )}
          {dockOpen && !flightCard && !tramaOpen && (
            <aside
              className="absolute top-0 right-0 flex flex-col"
              style={{ width: DOCK_PX, bottom: 0, zIndex: 3, borderLeft: '1px solid var(--color-border)', background: 'var(--color-background)' }}
              aria-label={selMoon ? skyCopy('contractCard', lang) : loc!.level === 2 ? skyCopy('levelZ2', lang) : skyCopy('starBrief', lang)}
            >
              {loc!.level === 2 && selMoon ? (
                <ContractFloatingCard
                  moon={selMoon}
                  lang={lang}
                  starName={moonStar != null ? S!.siglas[moonStar] || starName(moonStar) : null}
                  onFlyInst={moonStar != null ? () => hop({ kind: 'star', idx: moonStar }) : null}
                  related={related}
                  lot={lot}
                  signals={sigC.data ?? null}
                  onFlyVendor={flyBody}
                  onClose={() => { setMoon(null); live.current.moon = null; replaceUrl() }}
                />
              ) : (
                <>
                  <div role="tablist" aria-label={skyCopy('tabsLabel', lang)} className="at-dock-tabs">
                    {([['brief', 0], ['dial', 1], ['diff', 2], ['cat', 3]] as const).map(([k, n]) => {
                      const on = k === 'cat' ? !!cat : k === 'dial' ? tab === 'dial' : k === 'diff' ? !!pair : !cat && !pair && tab !== 'dial'
                      const pr = pair ?? defaultPair(period)
                      return (
                        <button
                          key={k} type="button" role="tab" aria-selected={on}
                          onClick={() => chooseTab(k === 'cat' ? `cat.${cat?.scope ?? 'system'}.${cat?.sort ?? 'money'}` : k === 'dial' ? 'dial' : k === 'diff' ? `diff.${pr[0]}.${pr[1]}` : null)}
                        >
                          {skyCopy('tabs', lang).split(' · ')[n]}
                        </button>
                      )
                    })}
                  </div>
                  <div role="tabpanel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {cat ? (
                <SkyCatalog
                  manifest={manifest!} star={loc!.star!} system={system} lang={lang} scope={cat.scope} sort={cat.sort}
                  onTab={(sc, so) => chooseTab(`cat.${sc}.${so}`)}
                  onFlyBody={flyBody} onFlyStar={(i) => hop({ kind: 'star', idx: i })} focusFirst={catFocus} top={pinsBlock}
                  planet={loc!.level === 2 ? bodyVendor : null}
                  onHover={(t) => {
                    const i = t?.kind === 'body' ? bodies?.index.get(t.vendor) : t?.kind === 'star' ? t.idx : undefined
                    apiRef.current?.hover(t && i !== undefined ? { kind: t.kind, idx: i } : null)
                  }}
                />
              ) : pair && !system ? (
                <div className="p-4" style={eyebrow}>{skyCopy('loadingSystem', lang)}</div>
              ) : pair ? (
                <SkyDiff
                  manifest={manifest!} star={loc!.star!} diff={system && system.star.id === starId ? diffNow : null} lang={lang}
                  onPair={(a, b) => chooseTab(`diff.${a}.${b}`)} onFlyBody={flyBody} onFlyStar={(i) => hop({ kind: 'star', idx: i })}
                />
              ) : tab === 'dial' ? (
                <SkyDial
                  manifest={manifest!} star={loc!.star!} system={system} body={loc!.level === 2 ? row : null} lang={lang}
                  year={effYr} onYear={chooseYear} onFlyStar={(inst) => { const i = starOf(inst); if (i !== undefined) hop({ kind: 'star', idx: i }) }}
                />
              ) : loc!.level === 2 ? (
                row ? vendorFile(row, () => hop({ kind: 'star', idx: loc!.star! }), (
                  <MoonLedger
                    moons={moonSet} lang={lang} hovered={hoverMoon} links={links} onLinks={() => setLinks((x) => !x)}
                    moonLens={moonLens} onMoonLens={setMoonLens} apagonOn={apagonOn} onApagon={() => setApagonOn((x) => !x)}
                    apagon={apQ.data ? { n: apQ.data.n_contracts, value: apQ.data.value_mxn, withheld: apQ.data.withheld } : null}
                    badges={[
                      ...(sigQ.data?.signals ?? []).map((g) => (lang === 'en' ? g.label.en : g.label.es)),
                      ...(bodyIdx != null && bodies && bodies.flags2[bodyIdx] & 1 ? ['EFOS'] : []),
                      ...(bodyIdx != null && bodies && bodies.flags2[bodyIdx] & 2 ? ['SFP'] : []),
                    ]}
                    buyer={(m) => { const j = m.inst != null ? starOf(m.inst) : undefined; return j !== undefined ? S!.siglas[j] || starName(j) : formatEntityName('institution', m.institutionName, 'full') }}
                    onHover={(id) => { setHoverMoon(id); apiRef.current?.hover(id != null ? { kind: 'moon', idx: id } : null) }}
                    onOpen={(id) => { apiRef.current?.hover(null); setHoverMoon(null); hop({ kind: 'moon', id }) }}
                  />
                )) : <div className="p-4" style={eyebrow}>{skyCopy('loadingSystem', lang)}</div>
              ) : band && band.star === loc!.star ? (
                vendorFile(band.row, () => { setBand(null); live.current.band = null; replaceUrl() })
              ) : (
                <StarDock manifest={manifest!} star={loc!.star!} system={system} lang={lang} onFlyBody={flyBody} onCatalog={() => openCatalog(true)}
                  layers={layers} overlay={overlay} onOverlay={setOverlay}
                  unlabeled={bodies ? unlabeled.filter((t) => t[0] === 'b').map((t) => bodies.vendorId[+t.slice(2)]) : []}
                  onHover={(v) => { const i = v != null ? bodies?.index.get(v) : undefined; apiRef.current?.hover(i !== undefined ? { kind: 'body', idx: i } : null) }} />
              )}
                  </div>
                </>
              )}
            </aside>
          )}
          {ready && cmpSel && cmpIdx !== undefined && (
            <SkyCompare
              manifest={manifest!} star={cmpIdx} system={cmpSysQ.data ?? null} diff={cmpDiff} lang={lang} w={hostBox.w} h={hostBox.h}
              onClose={closeCompare} onFlyStar={(i) => { closeCompare(); hop({ kind: 'star', idx: i }) }}
            />
          )}

          {logOpen && (
            <div role="dialog" aria-label={skyCopy('logTitle', lang)} className="absolute" style={{ ...panel, right: 8, top: 8, width: 320, maxHeight: 'calc(100% - 60px)', overflowY: 'auto', zIndex: 9, padding: '10px 12px' }}>
              <div className="flex justify-between" style={{ ...eyebrow, marginBottom: 6 }}>
                <span>{skyCopy('logTitle', lang)}</span>
                <button type="button" aria-label={skyCopy('close', lang)} onClick={() => setLogOpen(false)} className={RING} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
              </div>
              {trail.length === 0 ? (
                <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-text-muted)' }}>{skyCopy('logEmpty', lang)}</div>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {trail.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
                    <li key={i} style={{ borderTop: '1px solid var(--color-border)', padding: '5px 0' }}>
                      <div style={{ ...eyebrow }}>{i === 0 ? `⌂ ${skyCopy('origin', lang)} · ` : ''}{skyCopy(p.m != null ? 'levelZ3' : p.p != null ? 'levelZ2' : p.s != null ? 'levelZ1' : 'levelZ0', lang)}</div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span style={{ fontFamily: SERIF, fontSize: 14, color: 'var(--color-text-primary)' }}>{posLabel(p)}</span>
                        <button type="button" onClick={() => { setLogOpen(false); back(i) }} className={RING}
                          style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-accent-data)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {skyCopy('logBack', lang)}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {keys && (
            <div role="dialog" aria-label={skyCopy('keymap', lang)} className="absolute" style={{ ...panel, left: '50%', top: 60, transform: 'translateX(-50%)', zIndex: 8, padding: '12px 16px', width: 460 }}>
              <div className="flex justify-between" style={{ ...eyebrow, marginBottom: 6 }}>
                <span>{skyCopy('keymap', lang)}</span>
                <button type="button" aria-label={skyCopy('close', lang)} onClick={() => setKeys(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', margin: 0 }}>
                {SKY_KEYS.map(([k, es, en]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-primary)' }}>{k}</dt>
                    <dd style={{ margin: 0, fontFamily: SERIF, fontSize: 14, color: 'var(--color-text-secondary)' }}>{lang === 'en' ? en : es}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {/* instruments §3.3 (F12): the rail is a page sibling under the sky host — never inside the engine wrapper */}
        <div style={{ marginTop: FOOT_PX - RAIL_PX, height: RAIL_PX }}>
          {ready && (
            <SkyRail
              lang={lang} railRef={railRef} meta={meta} year={effYr} onYear={chooseYear}
              period={flightHolds ? effFrame : period} onPeriod={choosePeriod}
              blink={blink} onBlink={setBlink} onBlinkFrame={setFrame} bySize={bySize} onBySize={setBySize}
              hist={rail.hist} star={railStar} disabled={flightHolds} onSkip={setSkipped}
            />
          )}
        </div>
        <figcaption><span style={{ color: 'var(--color-text-primary)' }}>{skyCopy('railBasisSky', lang)}</span> · {skyCopy('hint', lang)} · {en ? 'Sky computed' : 'Cielo calculado al'} {cut || '—'}{basisVer ? <> · {en ? 'Risk' : 'Riesgo'} {basisVer}</> : null}</figcaption>
      </figure>
      </div>
      <AtlasClauses manifest={manifest} bodies={bodies} lang={lang} />
      <AtlasAnexos manifest={manifest} lang={lang} cut={cut} onFlight={startFromSheet} />
      </div>
    </article>
  )
}

export default function Atlas() {
  const { i18n } = useTranslation()
  const lang = (i18n.language.startsWith('es') ? 'es' : 'en') as 'en' | 'es'
  const phone = useIsPhone()
  if (!phone) return <DesktopAtlas lang={lang} />
  return (
    <div className="ct ct-page">
      <div className="ct-wrap" style={{ paddingTop: 8 }}>
        <DocHead trail={[{ label: lang === 'en' ? 'The Map' : 'El Mapa', to: '/mapa' }, { label: skyCopy('title', lang) }]} views={<VistaBlock />} />
      </div>
      <PhoneAtlas lang={lang} />
    </div>
  )
}
