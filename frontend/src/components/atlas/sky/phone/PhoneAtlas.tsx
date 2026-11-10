/**
 * «El Atlas» on a phone (< 768 px) — spec .claude/designs/atlas-2026-10-02-spec.md §4:
 * no free-pan field ever mounts, and planets.bin is never fetched (manifest + per-star
 * system payloads only).
 *
 *  - «Descenso»: 12 sector rows (a 40 px disc thumbnail drawn once from the manifest) that
 *    open onto their stars ranked by V, with a halo glyph.
 *  - A star: one fixed 358 px disc (PhoneDisc) or «Lista» (the drawn bodies by share as hop
 *    buttons, the remainder band per year), and a bottom sheet PEEK 116 px / HALF 50 dvh /
 *    FULL 92 dvh: the star brief, or for a planet its moon disc and «El Expediente», or for a
 *    moon the contract card. «Volar a esta institución» crossfades 200 ms to that star.
 *  - Trail: a horizontal chip scroller. Position lives in the URL (same grammar as desktop),
 *    every hop pushes an entry, so the system back gesture retraces and a shared URL opens
 *    at the same level.
 *  - Legend in a ≡ sheet; no finder; search = full-width field + full-screen results sheet.
 *  - Flights: no autoplay, «Iniciar vuelo», swipe advances (FlightPlayer `phone`).
 *  - Instruments I-S1 (spec atlas-instruments-2026-10-03 §3.5–§3.8, §4.1): the Lista is the
 *    catalog (scope chips Sistema · Sector, two sorts, public labels), PEEK carries ◀ ▶ siblings
 *    and ◆ pin (44 px), pins ride the trail scroller, CSV + «Compartir enlace».
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { vendorApi } from '@/api/client'
import { VendorFile } from '@/components/atlas/VendorFile'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ContractFloatingCard } from '@/components/atlas/ContractFloatingCard'
import { StarDock } from '@/components/atlas/sky/StarDock'
import { MoonLedger } from '@/components/atlas/sky/MoonLedger'
import { SkyDial } from '@/components/atlas/sky/SkyDial'
import { SkyLegend } from '@/components/atlas/sky/SkyLegend'
import { SkyPeriod } from '@/components/atlas/sky/SkyPeriod'
import { FlightPlayer } from '@/components/atlas/sky/FlightPlayer'
import { MapaQuestion } from '@/components/atlas/sky/MapaQuestion'
import { SkyArrange } from '@/components/atlas/sky/SkyArrange'
import { PhoneRiesgo } from './PhoneRiesgo'
import { compileWaypoint } from '@/components/atlas/sky/compileWaypoint'
import { toClusterItem, patternLabels } from '@/components/atlas/sky/expediente-adapter'
import { DISC_PX, MoonDisc, SectorThumb, SystemDisc } from './PhoneDisc'
import { ATLAS_STORIES, findStory } from '@/lib/atlas-stories'
import { fetchSystemForVendor, useContractSignals, useSky, useSkyApagon, useSkyLayers, useSkySystem } from '@/lib/atlas/sky/useSky'
import { SkyCatalog } from '@/components/atlas/sky/SkyCatalog'
import { SkyDiff } from '@/components/atlas/sky/SkyDiff'
import { cmpOf, defaultPair, diffMarks, diffOf, systemDiff } from '@/lib/atlas/sky/period-diff'
import { catOf, starsOfSector, withheldLabel } from '@/lib/atlas/sky/catalog'
import { csvText, downloadCsv, starPart, systemPart } from '@/lib/atlas/sky/export'
import { useVendorContracts } from '@/lib/atlas/sky/use-vendor-contracts'
import {
  MAX_PINS, PERIOD_KEYS, historyDepth, tramaOf, mirrorPins, navigateQuery, parseSkyQuery, posToken, seedPins, skyQuery, subscribeUrl, urlSearch, writeSearch, periodName, type SkyPos,
} from '@/lib/atlas/sky/url-state'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { N_YEARS, YEAR0, fracYear, type SkyManifest, type SkySystem, type SkySystemBody } from '@/lib/atlas/sky/geometry'
import type { ApagonMoon, SkyOverlay } from '@/components/atlas/sky/SkyEngine'
import { formatEntityName } from '@/lib/entity/format'
import { getRiskLevelFromScore, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'

import { DUR, EASE, css, cssEase, ms } from '@/lib/motion'
import { useModal } from '@/hooks/useModal'

// Merge § 5: La Trama's sheet (and d3-force) load when it first opens.
const TramaPanel = lazy(() => import('@/components/network/TramaPanel'))
const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const eyebrow: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const mono: CSSProperties = { fontFamily: MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-secondary)' }
const rowBtn: CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)',
  padding: '10px 0', minHeight: 44, cursor: 'pointer',
}
const chipBtn: CSSProperties = {
  fontFamily: SERIF, fontSize: 14, whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', background: 'var(--color-background-card)',
  border: '1px solid var(--color-border)', padding: '0 10px', minHeight: 36, cursor: 'pointer',
}
const PEEK = 116 // owner 11-07: +20 so the peek carries «Ver su expediente →»
const OVERLAYS: SkyOverlay[] = [null, 'captura', 'pareja', 'mismo_dia', 'senal']
type Snap = 'peek' | 'half' | 'full'
const onResize = (f: () => void) => { window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }
const winW = () => window.innerWidth
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The app shell's fixed mobile bottom nav: the sheet docks on top of it, never over it. */
function useNavOffset() {
  const [h, setH] = useState(0)
  useEffect(() => {
    const read = () => setH(document.querySelector<HTMLElement>('nav.fixed.bottom-0')?.getBoundingClientRect().height ?? 0)
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  return h
}

function Sheet({ snap, onSnap, peek, children, label, lang, bottom }: { snap: Snap; onSnap: (s: Snap) => void; peek: ReactNode; children: ReactNode; label: string; lang: 'en' | 'es'; bottom: number }) {
  const drag = useRef<number | null>(null)
  const next: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'peek' }
  return (
    <section
      aria-label={label}
      style={{
        position: 'fixed', left: 0, right: 0, bottom, zIndex: 45, display: 'flex', flexDirection: 'column',
        height: snap === 'peek' ? PEEK : snap === 'half' ? '50dvh' : `calc(92dvh - ${bottom}px)`, transition: css('height', DUR.fast),
        background: 'var(--color-background-card)', borderTop: '1px solid var(--color-border)', boxShadow: '0 -6px 18px rgba(0,0,0,0.08)', overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-label={skyCopy('sheetHandle', lang)}
        onClick={() => onSnap(next[snap])}
        onPointerDown={(e) => { drag.current = e.clientY }}
        onPointerUp={(e) => {
          const y0 = drag.current
          drag.current = null
          if (y0 == null || Math.abs(e.clientY - y0) < 24) return
          e.preventDefault()
          onSnap(e.clientY < y0 ? (snap === 'peek' ? 'half' : 'full') : snap === 'full' ? 'half' : 'peek')
        }}
        className={RING}
        style={{ display: 'grid', placeItems: 'center', height: 24, flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', touchAction: 'none' }}
      >
        <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
      </button>
      <div style={{ padding: '0 16px', flex: '0 0 auto' }}>{peek}</div>
      <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, display: snap === 'peek' ? 'none' : 'block' }}>{children}</div>
    </section>
  )
}

export function PhoneAtlas({ lang: L }: { lang: 'en' | 'es' }) {
  const navigate = useNavigate()
  const { manifest, error } = useSky(false) // §4 / F12: manifest only — never the bin
  const layers = useSkyLayers(manifest, null) // sky-dive: the agency's own layer lines in the sheet (no bin, so no body bits)
  const search = useSyncExternalStore(subscribeUrl, urlSearch, urlSearch)
  const st = useMemo(() => parseSkyQuery(search), [search])
  // Names seen so far, so trail chips for earlier hops stay named after their
  // system query is gone. Grown during render on the edge where a new name shows up.
  const [names, setNames] = useState<ReadonlyMap<number, string>>(() => new Map())
  // instruments §3.6: pins are page state (a session mirror seeds a reload); popstate never re-reads them
  const [pins, setPins] = useState<SkyPos[]>(() => seedPins(st.pins))
  useEffect(() => { mirrorPins(pins) }, [pins])

  const S = manifest?.stars
  const starIdx = useMemo(() => new Map((S?.id ?? []).map((id, i) => [id, i])), [S])
  const canon = useMemo(() => new Map((manifest?.inst_map.raw ?? []).map((r, k) => [r, manifest!.inst_map.canon[k]])), [manifest])
  const starOf = (inst: number) => starIdx.get(canon.get(inst) ?? inst)

  const flight = st.vuelo ? findStory(st.vuelo) : null
  const fn = flight ? Math.min(st.n, flight.chapters.length) : 0
  const ch = flight?.chapters[fn]
  const flightStar = ch?.at.star != null ? starOf(ch.at.star) : undefined
  // sky-dive L5: a shared supplier / contract link without `star` resolves its host from the vendor's system (cached as below)
  const hostQ = useQuery({
    queryKey: ['atlas-sky', 'vendor-row', st.pos.p ?? null],
    queryFn: () => fetchSystemForVendor(st.pos.p!),
    enabled: !flight && st.pos.p != null && st.pos.s == null,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const star = flight ? flightStar : st.pos.s != null ? starOf(st.pos.s) : hostQ.data ? starOf(hostQ.data.star.id) : undefined
  const sysQ = useSkySystem(S && star !== undefined ? S.id[star] : null, manifest?.layout_version)
  const system: SkySystem | null = sysQ.data && S && star !== undefined && sysQ.data.star.id === S.id[star] ? sysQ.data : null
  // Pure and cheap (a chapter's few ids against one system) — derived in render.
  const compiled = manifest && ch ? compileWaypoint(ch, manifest, null, system) : null

  const planet = flight ? null : st.pos.p ?? null
  const bandRow = useQuery({
    queryKey: ['atlas-sky', 'vendor-row', planet],
    queryFn: () => fetchSystemForVendor(planet!),
    enabled: planet != null && !!system && !system.bodies.some((b) => b.vendor_id === planet),
    staleTime: 24 * 60 * 60 * 1000,
  })
  const row: SkySystemBody | null = planet == null ? null : system?.bodies.find((b) => b.vendor_id === planet) ?? bandRow.data?.focus?.row ?? null
  const unseen: [number, string][] = []
  for (const b of system?.bodies ?? []) if (names.get(b.vendor_id) !== b.name) unseen.push([b.vendor_id, b.name])
  if (row && names.get(row.vendor_id) !== row.name) unseen.push([row.vendor_id, row.name])
  if (unseen.length) setNames((prev) => new Map([...prev, ...unseen]))
  const mv = useVendorContracts(planet, planet != null)
  const moon = planet != null ? mv.moons.find((m) => m.id === st.pos.m) ?? null : null
  const moonStar = moon?.inst != null ? starOf(moon.inst) : undefined
  const moonSys = useSkySystem(S && moonStar !== undefined ? S.id[moonStar] : null, manifest?.layout_version)
  // sky-dive round 2: the desktop's layer switch, moon lens and «Apagón» moons, as one chip row in the sheet
  const [overlay, setOverlay] = useState<SkyOverlay>(null)
  const [moonLens, setMoonLens] = useState<0 | 1>(0)
  const [apagonOn, setApagonOn] = useState(false)
  const apQ = useSkyApagon(planet)
  const apagonMoons = useMemo<ApagonMoon[] | null>(() => (apagonOn && apQ.data
    ? apQ.data.contracts.flatMap((c) => { const t = fracYear(c.date); return t == null ? [] : [{ t, amount: c.amount_mxn }] }) : null), [apagonOn, apQ.data])
  const sigC = useContractSignals(moon?.id ?? null)

  // The sheet re-seats on every hop (planet/star change); a drag sets it in between.
  const snapKey = `${planet}|${star}`
  const [snapState, setSnapState] = useState<{ key: string; snap: Snap } | null>(null)
  const snap: Snap = snapState?.key === snapKey ? snapState.snap : planet != null ? 'half' : 'peek'
  const setSnap = (s: Snap) => setSnapState({ key: snapKey, snap: s })
  const [mode, setMode] = useState<'disc' | 'list'>('disc')
  // instruments §3.7 phone: the A | B toggle on the disc (same positions; B carries the §3.4 marks)
  const [side, setSide] = useState<'A' | 'B'>('B')
  const [open, setOpen] = useState<number | null>(st.pos.g ?? null)
  const [more, setMore] = useState<Record<number, number>>({})
  const [finding, setFinding] = useState(false)
  const navH = useNavOffset()
  // the trail scroller keeps the current chip in view
  const trailRef = useRef<HTMLElement>(null)
  useEffect(() => { const el = trailRef.current; if (el) el.scrollLeft = el.scrollWidth }, [search])

  // ── URL: a hop pushes (with the trail), Back retraces ─────────────────────
  const lv = manifest?.layout_version ?? null
  // §5 writers: tab / yr / cmp ride from the entry, pins from the page state
  const extra = { tab: st.tab, yr: st.yr, cmp: st.cmp, pins }
  const trama = tramaOf(st.tab)
  const pinsTok = pins.length ? pins.map(posToken).join('~') : null
  const hop = (pos: SkyPos) =>
    navigateQuery(skyQuery({ cam: null, lv, pos, trail: [...st.trail, st.pos], period: st.period, vuelo: null, ...extra }), true)
  const retrace = (i: number) => {
    const steps = st.trail.length - i
    if (steps <= 0) return
    if (historyDepth() >= steps) return window.history.go(-steps)
    navigateQuery(skyQuery({ cam: null, lv, pos: st.trail[i], trail: st.trail.slice(0, i), period: st.period, vuelo: null, ...extra }), false)
  }
  const back = () => (st.trail.length ? retrace(st.trail.length - 1) : hop({}))
  const vw = useSyncExternalStore(onResize, winW, () => 390)
  // «Riesgo» on phone: the chart (PhoneRiesgo); «Sectores» glides it back to the constellation, then the list
  const riesgo = st.lente === 'riesgo'
  const [leaving, setLeaving] = useState(false)
  // back/forward into or out of «Riesgo» cancels a glide back in flight (else the chart would bounce the URL)
  useEffect(() => { setLeaving(false) }, [st.lente])
  // La Trama's sheet is modal: focus in, Tab trapped, Esc closes, focus back to ⧉
  const tramaRef = useRef<HTMLDivElement>(null)
  useModal(tramaRef, () => writeSearch({ tab: null, pins: pinsTok }), !!trama && !!manifest)

  if (!manifest || !S) {
    // PERF launch § 6 (CLS): hold a screen while the manifest loads, as the route skeleton does,
    // so the site footer is never pulled into view and pushed back out.
    return <div className="px-4 py-6" style={{ ...eyebrow, minHeight: '100svh' }}>{error ? skyCopy('error', L) : skyCopy('loading', L)}</div>
  }
  const cut = manifest.data_cut
  const sectorName = (id: number) => { const g = manifest.sectors.find((s) => s.id === id); return g ? (L === 'en' ? g.name_en : g.name_es) : '' }
  const starName = (i: number) => formatEntityName('institution', S.name[i], 'full')
  // F16: a withheld body arrives nameless — its public label, never a name
  const vendorName = (v: number) => { const n = names.get(v); return n ? formatEntityName('vendor', n, 'full') : n === '' ? withheldLabel(v, L) : `PV ${v}` }
  const posLabel = (p: SkyPos) => {
    if (p.p != null) return p.m != null ? `${vendorName(p.p)} · #${p.m}` : vendorName(p.p)
    if (p.s != null) { const i = starOf(p.s); return i !== undefined ? starName(i) : `INS ${p.s}` }
    return skyCopy('descent', L)
  }
  const period = flight && compiled ? compiled.period : st.period ? PERIOD_KEYS.indexOf(st.period) : null
  // §3.6 pins: page state, written with `replace`
  const writePins = (next: SkyPos[]) => { setPins(next); writeSearch({ pins: next.length ? next.map(posToken).join('~') : null }) }
  const here = st.pos.s != null || st.pos.p != null ? st.pos : null
  const pinK = here ? pins.findIndex((p) => posToken(p) === posToken(here)) : -1
  const togglePin = () => {
    if (!here) return
    if (pinK >= 0) writePins(pins.filter((_, j) => j !== pinK))
    else if (pins.length < MAX_PINS) writePins([...pins, here])
  }
  const share = () => {
    const url = window.location.href
    if (navigator.share) void navigator.share({ url, title: skyCopy('title', L) }).catch(() => {})
    else void navigator.clipboard?.writeText(url)
  }
  /** sky-dive round 2: the cluster list carries the canvas' encodings as words. 2026-11-04 clarity: the one risk
   *  figure is the share of the money (as the Ficha says; the per-contract average stays in the Ficha, labelled), the
   *  grade says whose grade it is — «0.30 medio» beside «71% alto o crítico» read as a contradiction */
  const starLayerLine = (i: number) => {
    const g = layers!.stars.grade[i]
    const fmt1 = (x: number) => x.toLocaleString(L === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 1 })
    const parts: ReactNode[] = []
    parts.push(<span>{fmt1(S.h[i] * 100)}% {L === 'en' ? 'of its money at high or critical' : 'de su dinero en alto o crítico'}</span>)
    if (layers!.stars.post[i] > 0) parts.push(<span><span aria-hidden="true">◯ </span>{skyCopy('roKeyRing', L)}</span>)
    if (g != null) parts.push(<span>{L === 'en' ? 'grade' : 'calificación'} {g.toLocaleString(L === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10 {skyCopy(g >= 6 ? 'gradePass' : 'gradeFail', L)}</span>)
    return parts.length ? <span style={{ ...mono, display: 'block' }}>{parts.map((x, k) => <span key={k}>{k > 0 && ' · '}{x}</span>)}</span> : null
  }
  const riskWord = (s: number | null) => (s == null ? '' : `${skyCopy('riskIndicator', L)}: ${skyCopy(`risk_${getRiskLevelFromScore(s)}`, L)}`)

  // ── merge § 5: La Trama as a full-width sheet over the sky (portal: above the bottom nav) ──
  const tramaSheet = trama && createPortal(
    <div ref={tramaRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="La Trama" className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--color-background-card)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Suspense fallback={<div className="p-4" style={eyebrow}>{skyCopy('loading', L)}</div>}>
        <TramaPanel
          phone lang={L} comm={trama.comm}
          onComm={(id) => writeSearch({ tab: `trama.${id}`, pins: pinsTok })}
          onClose={() => writeSearch({ tab: null, pins: pinsTok })}
          onFlyVendor={async (v) => {
            const sys = await fetchSystemForVendor(v).catch(() => null)
            if (!sys) return
            navigateQuery(skyQuery({ cam: null, lv, pos: { s: sys.star.id, p: v }, trail: [...st.trail, st.pos], period: st.period, vuelo: null, ...extra, tab: null }), true)
          }}
        />
      </Suspense>
    </div>,
    document.body,
  )

  // ── header: kicker, search, ≡ legend · period row · trail scroller ───────
  const header = (
    <header className="sticky top-[var(--bar-h)] z-20" style={{ background: 'var(--color-background)', borderBottom: '1px solid var(--color-border)', padding: '8px 0 6px' }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ ...eyebrow, color: 'var(--color-accent-text)', fontWeight: 600 }}>{skyCopy('title', L)} · {skyCopy(moon ? 'levelZ3' : planet != null ? 'levelZ2' : star !== undefined ? 'levelZ1' : 'levelZ0', L)}</span>
        <span className="flex items-center gap-2">
          <button type="button" aria-pressed={!!trama} onClick={() => writeSearch({ tab: trama ? null : 'trama', pins: pinsTok })} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 36 }}>⧉ La Trama</button>
          <button type="button" onClick={() => setFinding(true)} aria-label={skyCopy('searchPh', L)} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 36, minWidth: 44 }}>⌕</button>
          <SkyLegend manifest={manifest} lang={L} cut={cut} sheet />
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <SkyPeriod
          lang={L} period={flight && compiled ? (compiled.period != null ? PERIOD_KEYS[compiled.period] : null) : st.period} compact
          onPeriod={(k) => writeSearch({ period: k, pins: pinsTok })}
          blink={false} onBlink={() => {}} onBlinkFrame={() => {}} bySize={false} onBySize={() => {}}
        />
      </div>
      {(st.trail.length > 0 || st.pos.s != null || pins.length > 0) && !flight && (
        <nav ref={trailRef} aria-label={skyCopy('trail', L)} className="flex items-center gap-2" style={{ marginTop: 6, overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 2 }}>
          <span style={{ ...eyebrow, flex: '0 0 auto' }}>{skyCopy('trail', L)}</span>
          {st.trail.map((p, i) => (
            <button key={i} type="button" onClick={() => retrace(i)} className={RING} style={{ ...chipBtn, flex: '0 0 auto' }}>{posLabel(p)}</button>
          ))}
          <span aria-current="location" style={{ ...chipBtn, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-primary)', borderColor: 'var(--color-accent)' }}>{posLabel(st.pos)}</span>
          {pins.length > 0 && <span style={{ ...eyebrow, flex: '0 0 auto' }}>{skyCopy('pins', L, { n: pins.length, max: MAX_PINS })}</span>}
          {pins.map((p, n) => (
            <button key={`pin${n}`} type="button" onClick={() => hop(p)} className={RING} style={{ ...chipBtn, flex: '0 0 auto', minHeight: 44 }}>▾{n + 1} {posLabel(p)}</button>
          ))}
        </nav>
      )}
      {tramaSheet}
    </header>
  )

  // ── search: full-width field + full-screen results sheet ─────────────────
  const finder = finding && <SearchSheet manifest={manifest} lang={L} onClose={() => setFinding(false)} onStar={(i) => { setFinding(false); hop({ s: S.id[i] }) }} onVendor={async (v) => {
    const sys = await fetchSystemForVendor(v).catch(() => null)
    // a drawn or band supplier opens at its host; an off-chart one (or a failed lookup) stays in the sheet
    // with the note, its dossier chip and «Volar a su principal comprador» — as on desktop (§3.9, S5 A7)
    if (sys && sys.focus?.sky !== false) { setFinding(false); hop({ s: sys.star.id, p: v }); return null }
    const i = sys ? S.id.indexOf(sys.star.id) : -1
    return { star: i >= 0 ? i : null }
  }} />

  const fi = flight ? ATLAS_STORIES.findIndex((x) => x.id === flight.id) : -1
  const phoneFlight = flight && (
    <FlightPlayer
      phone flight={flight} n={fn} compiled={compiled} lang={L} lv={manifest.layout_version} cut={cut}
      apiRef={null} autoplay={false} taken={false}
      onGo={(k) => writeSearch({ n: k ? String(k) : null }, true)}
      onTake={() => {}} onResume={() => {}} onClose={() => writeSearch({ vuelo: null, n: null })}
      onNextFlight={(id) => writeSearch({ vuelo: id, n: null })}
      onFlyBody={(v) => { if (star !== undefined) navigateQuery(skyQuery({ cam: null, lv, pos: { s: S.id[star], p: v }, trail: [], period: st.period, vuelo: null, ...extra }), true) }}
      nextFlight={ATLAS_STORIES[(fi + 1) % ATLAS_STORIES.length]}
    />
  )

  // ── Descenso ─────────────────────────────────────────────────────────────
  if (star === undefined) {
    const sectors = [...manifest.sectors].sort((a, b) => b.value - a.value)
    return (
      <div className="px-4" lang={L} style={{ paddingBottom: 32 }}>
        {header}
        {phoneFlight && <div style={{ margin: '12px -16px 0' }}>{phoneFlight}</div>}
        <h1 style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 500, fontSize: 24, lineHeight: 1.15, margin: '14px 0 6px' }}>{skyCopy('h1', L)}</h1>
        {/* CYAN 2026-11-04: the arrangement row on phone too — «Riesgo» is the chart, not the list; the chart comes first,
            its reading lines right under it */}
        <div style={{ margin: '0 0 8px' }}>
          <SkyArrange lens={riesgo && !leaving ? 1 : 0} lang={L} layersReady={false} phone onLens={(k) => {
            if (k === 1) { setLeaving(false); writeSearch({ lente: 'riesgo', pins: pinsTok }) } else if (riesgo) setLeaving(true)
          }} />
        </div>
        {riesgo ? (
          <PhoneRiesgo
            manifest={manifest} lang={L} width={Math.max(280, vw - 32)} back={leaving}
            onBackDone={() => { setLeaving(false); writeSearch({ lente: null, pins: pinsTok }) }}
            onStar={(i) => hop({ s: S.id[i] })}
          />
        ) : null}
        <MapaQuestion manifest={manifest} lang={L} phone lens={riesgo ? 1 : 0} />
        {!riesgo && <>
        {/* the phone's own reading sentence stays in view (the kit folds «qué ve · cómo se lee» on phone) */}
        <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.5, margin: '0 0 12px', color: 'var(--color-text-secondary)' }}>{skyCopy('descentLede', L)}</p>
        <ul data-pq-target="sectores" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sectors.map((g) => {
            const stars = S.id.map((_, i) => i).filter((i) => S.sector[i] === g.id).sort((a, b) => S.v[b] - S.v[a])
            const shown = stars.slice(0, more[g.id] ?? 20)
            const isOpen = open === g.id
            return (
              <li key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)} className={`flex items-center gap-3 ${RING}`} style={{ ...rowBtn, borderBottom: 'none', display: 'flex' }}>
                  <SectorThumb manifest={manifest} sector={g.id} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: SERIF, fontSize: 17, color: 'var(--color-text-primary)' }}>
                      {L === 'en' ? g.name_en : g.name_es}
                    </span>
                    <span style={mono}>{formatDualCurrency(g.value)} · {skyCopy('starsN', L, { n: formatNumber(g.n_stars) })}</span>
                  </span>
                  <span aria-hidden="true" style={{ ...mono, fontSize: 14 }}>{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                  <ol style={{ listStyle: 'none', margin: '0 0 8px', padding: '0 0 0 52px' }}>
                    {shown.map((i) => {
                      const halo = S.h[i] > 0 && S.h[i] >= g.h_p90
                      return (
                        <li key={i}>
                          <button type="button" onClick={() => hop({ s: S.id[i] })} className={RING} style={rowBtn}>
                            <span style={{ display: 'block', fontFamily: SERIF, fontSize: 15, color: 'var(--color-text-primary)' }}>
                              {halo && <span role="img" aria-label={skyCopy('haloGlyph', L)} title={skyCopy('haloGlyph', L)} style={{ color: 'var(--color-risk-critical)' }}>◉ </span>}
                              {starName(i)}
                            </span>
                            <span style={mono}>{formatCompactMXN(S.v[i])} · {formatNumber(S.nv[i])} {L === 'en' ? 'suppliers' : 'proveedores'}</span>
                            {layers && starLayerLine(i)}
                          </button>
                        </li>
                      )
                    })}
                    {stars.length > shown.length && (
                      <li>
                        <button type="button" onClick={() => setMore((m) => ({ ...m, [g.id]: shown.length + 40 }))} className={RING} style={{ ...rowBtn, ...mono, color: 'var(--color-accent)' }}>
                          {skyCopy('moreStars', L, { n: formatNumber(Math.min(40, stars.length - shown.length)) })}
                        </button>
                      </li>
                    )}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
        </>}
        {!flight && (
          <section aria-label={skyCopy('flights', L)} style={{ marginTop: 20 }}>
            <div style={eyebrow}>{skyCopy('flightsMenu', L)}</div>
            {ATLAS_STORIES.map((f) => (
              /* owner 2026-10-29: one compact row per tour — title, the chapter chain on one ellipsed line, «Iniciar ▸» at the end */
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, borderLeft: `3px solid ${f.accent}`, padding: '4px 0 4px 8px', margin: '4px 0', background: 'var(--color-background-card)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.35 }}>{L === 'en' ? f.title.en : f.title.es}</div>
                  <div style={{ ...mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.duration} · {L === 'en' ? f.blurb.en : f.blurb.es}</div>
                </div>
                <button type="button" onClick={() => writeSearch({ vuelo: f.id, n: null }, true)} aria-label={`${skyCopy('startFlight', L)} · ${L === 'en' ? f.title.en : f.title.es}`} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44, color: 'var(--color-accent-text)' }}>
                  {L === 'en' ? 'Start ▸' : 'Iniciar ▸'}
                </button>
              </div>
            ))}
          </section>
        )}
        {finder}
      </div>
    )
  }

  // ── a star: fixed disc or Lista, and the sheet ───────────────────────────
  const focusIds = flight ? compiled?.focus.map((f) => f.vendor_id) ?? [] : planet != null ? [planet] : []
  // §4.1 siblings: planets by share on the public basis at a planet, else the sector's stars by V
  const sibList: SkyPos[] = row && system ? system.ranked.map((v) => ({ s: S.id[star], p: v })) : starsOfSector(manifest, S.sector[star]).map((i) => ({ s: S.id[i] }))
  const sibI = sibList.findIndex((p) => (row ? p.p === row.vendor_id : p.s === S.id[star]))
  const pc = catOf(st.tab) ?? { scope: 'system' as const, sort: 'money' as const }
  const listCsv = () => {
    const part = pc.scope === 'sector' ? starPart(manifest, starsOfSector(manifest, S.sector[star])) : system ? systemPart(system) : null
    if (!part) return
    const meta = { layout_version: manifest.layout_version, data_cut: manifest.data_cut, risk_basis: manifest.risk_basis, view_url: window.location.href }
    downloadCsv(`rubli-atlas-lista-${S.id[star]}-${manifest.layout_version}.csv`, csvText(meta, part))
  }
  const sq: CSSProperties = { ...chipBtn, fontFamily: MONO, fontSize: 14, minHeight: 44, minWidth: 44, padding: 0 }
  // instruments §3.1 / §3.3 (F22): sheet tabs Ficha · Cuadrante; with the Cuadrante open a «‹ 2019 ›» stepper sits in
  // the tab row (sticky, never under the HALF sheet). `yr` and `tab` are written with replace, pins riding along.
  const dialTab = st.tab === 'dial'
  // instruments §3.4 / §3.7: the diff pair from the tab (or a shared twin-plate link); computed in render (≤ 80 bodies)
  const cmpSel = cmpOf(st.cmp)
  const pair = diffOf(st.tab) ?? (cmpSel && cmpSel.star === S.id[star] ? [cmpSel.A, cmpSel.B] as const : null)
  const phDiff = pair && system?.star.period_v ? systemDiff(system, manifest.meta, pair[0], pair[1], DISC_PX / 2 - 14, manifest.data_cut) : null
  const sidePeriod = pair ? (side === 'A' ? pair[0] : pair[1]) : null
  const years = !!manifest.meta
  const LASTY = YEAR0 + N_YEARS - 1
  const setYr = (y: number | null) => writeSearch({ yr: y == null ? null : String(y), pins: pinsTok })
  const tabRow = (
    <div className="flex items-center" style={{ position: 'sticky', top: 0, zIndex: 1, gap: 4, padding: '4px 16px', background: 'var(--color-background-card)', borderBottom: '1px solid var(--color-border)' }}>
      <div role="tablist" aria-label={skyCopy('tabsLabel', L)} className="flex">
        {(['brief', 'dial', 'diff'] as const).map((k, n) => {
          const on = k === 'dial' ? dialTab : k === 'diff' ? !!diffOf(st.tab) : !dialTab && !diffOf(st.tab)
          const dp = diffOf(st.tab) ?? defaultPair(st.period)
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => writeSearch({ tab: k === 'dial' ? 'dial' : k === 'diff' ? `diff.${dp[0]}.${dp[1]}` : null, pins: pinsTok })} className={RING}
              style={{ ...chipBtn, ...eyebrow, minHeight: 44, marginLeft: -1, color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)', borderBottom: on ? '2px solid var(--color-accent)' : undefined }}>
              {skyCopy('tabs', L).split(' · ')[n]}
            </button>
          )
        })}
      </div>
      {dialTab && years && (
        <div role="group" aria-label={skyCopy('railLabel', L)} className="flex items-center" style={{ marginLeft: 'auto' }}>
          <button type="button" aria-label={skyCopy('yrPrev', L)} onClick={() => setYr(Math.max(YEAR0, (st.yr ?? LASTY + 1) - 1))} className={RING} style={sq}>‹</button>
          <button type="button" aria-label={st.yr != null ? skyCopy('railClear', L) : skyCopy('railLabel', L)} disabled={st.yr == null} onClick={() => setYr(null)} className={RING}
            style={{ ...sq, minWidth: 52, marginLeft: -1, color: st.yr != null ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{st.yr ?? '—'}</button>
          <button type="button" aria-label={skyCopy('yrNext', L)} onClick={() => setYr(Math.min(LASTY, (st.yr ?? 2001) + 1))} className={RING} style={{ ...sq, marginLeft: -1 }}>›</button>
        </div>
      )}
    </div>
  )
  // sky-dive round 2: the layer switch (a star) or the moon lens + «Apagón» (a supplier) — one chip row that scrolls sideways
  const chip = (on: boolean): CSSProperties => ({ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44, marginLeft: -1, flex: '0 0 auto',
    color: on ? 'var(--color-background)' : 'var(--color-text-secondary)', background: on ? 'var(--color-text-primary)' : 'var(--color-background-card)' })
  const nAp = apQ.data && !apQ.data.withheld ? apQ.data.n_contracts : 0
  const lensRow = layers && !dialTab && !diffOf(st.tab) && (
    <div style={{ borderBottom: '1px solid var(--color-border)', padding: '6px 0' }}>
      <div className="flex items-center" style={{ overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
        {row ? (
          <>
            <span style={{ ...eyebrow, flex: '0 0 auto', marginRight: 8 }}>{skyCopy('moonLensLabel', L)}</span>
            <span role="group" aria-label={skyCopy('moonLensLabel', L)} className="flex" style={{ flex: '0 0 auto' }}>
              {skyCopy('moonLensNames', L).split(' · ').map((n, k) => (
                <button key={n} type="button" aria-pressed={moonLens === k} onClick={() => setMoonLens(k as 0 | 1)} className={RING} style={chip(moonLens === k)}>{n}</button>
              ))}
            </span>
            {nAp > 0 && (
              <button type="button" aria-pressed={apagonOn} onClick={() => setApagonOn((x) => !x)} className={RING} style={{ ...chip(apagonOn), marginLeft: 8 }}>
                {skyCopy('apagonBtn', L, { n: formatNumber(nAp) })}
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ ...eyebrow, flex: '0 0 auto', marginRight: 8 }}>{skyCopy('overlayLabel', L)}</span>
            <span role="group" aria-label={skyCopy('overlayLabel', L)} className="flex" style={{ flex: '0 0 auto' }}>
              {skyCopy('overlayNames', L).split(' · ').map((n, k) => (
                <button key={n} type="button" aria-pressed={overlay === OVERLAYS[k]} onClick={() => setOverlay(OVERLAYS[k])} className={RING} style={chip(overlay === OVERLAYS[k])}>{n}</button>
              ))}
            </span>
          </>
        )}
      </div>
      {(row ? moonLens === 1 || apagonOn : overlay != null) && (
        <p style={{ ...mono, margin: '4px 16px 0', color: 'var(--color-text-muted)' }}>
          {row
            ? [moonLens === 1 ? skyCopy('moonLensHint', L) : '', apagonOn && apQ.data ? skyCopy('apagonHint', L, { n: formatNumber(nAp), v: formatCompactMXN(apQ.data.value_mxn) }) : ''].filter(Boolean).join(' · ')
            : skyCopy('overlayHints', L)}
        </p>
      )}
    </div>
  )
  // the mini-histogram under the disc: the star's money per year (system.years), hatched where there is no record
  const yrRows = system?.years ? new Map(system.years.map((r) => [r.year, r.value_mxn])) : null
  const yrMax = yrRows ? Math.max(1, ...yrRows.values()) : 1
  const peekTools = !flight && (
    <div className="flex items-start" style={{ flex: '0 0 auto', gap: 4 }}>
      <button type="button" onClick={() => sibI > 0 && hop(sibList[sibI - 1])} disabled={sibI <= 0} aria-label={skyCopy('stepPrev', L)} className={RING} style={sq}>◀</button>
      <button type="button" onClick={() => sibI < sibList.length - 1 && hop(sibList[sibI + 1])} disabled={sibI >= sibList.length - 1} aria-label={skyCopy('stepNext', L)} className={RING} style={sq}>▶</button>
      <button type="button" onClick={togglePin} aria-pressed={pinK >= 0} aria-label={skyCopy('pinsChip', L)} className={RING} style={{ ...sq, color: pinK >= 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>◆</button>
    </div>
  )
  const stepLine = sibList.length > 0 && sibI >= 0 ? ` · ${sibI + 1} / ${formatNumber(sibList.length)}` : ''
  const sheetPeek = (
    <div className="flex items-start gap-2">
      {row ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.2 }}>{row.name ? formatEntityName('vendor', row.name, 'full') : withheldLabel(row.vendor_id, L)}</div>
          <div style={mono}>{formatDualCurrency(row.value_mxn)} · {riskWord(row.risk_here)}{row.tier >= 1 && row.tier <= 3 ? ` · ${L === 'en' ? 'in Red Flags, tier' : 'en Focos Rojos, nivel'} ${row.tier}` : ''}{stepLine}</div>
          {/* owner 11-07: the way into the supplier's own page, in the peek */}
          <Link to={`/vendors/${row.vendor_id}`} className={RING} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: 'var(--color-accent-text)' }}>{skyCopy('openPage', L)}</Link>
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.2 }}>{starName(star)}</div>
          <div style={mono}>{formatDualCurrency(S.v[star])} · {formatNumber(S.nv[star])} {L === 'en' ? 'suppliers' : 'proveedores'}{stepLine}</div>
          <Link to={`/institutions/${S.id[star]}`} className={RING} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: 'var(--color-accent-text)' }}>{skyCopy('openPage', L)}</Link>
        </div>
      )}
      {peekTools}
    </div>
  )
  return (
    <div className="px-4" lang={L} style={{ paddingBottom: PEEK + navH + 24 }}>
      <style>{'@keyframes atlasFade{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion: reduce){.atlas-fade{animation:none!important}}'}</style>
      {header}
      <div className="flex items-center justify-between gap-2" style={{ margin: '10px 0 6px' }}>
        <button type="button" onClick={flight ? () => writeSearch({ vuelo: null, n: null }) : back} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44 }}>‹ {skyCopy('back', L)}</button>
        <div role="group" className="flex">
          {(['disc', 'list'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={RING}
              style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44, marginLeft: -1, color: mode === m ? 'var(--color-background)' : 'var(--color-text-secondary)', background: mode === m ? 'var(--color-text-primary)' : 'var(--color-background-card)' }}>
              {skyCopy(m === 'disc' ? 'viewDisc' : 'viewList', L)}
            </button>
          ))}
        </div>
      </div>
      <h1 style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 500, fontSize: 22, lineHeight: 1.15, margin: '4px 0' }}>{starName(star)}</h1>
      <div style={{ ...mono, marginBottom: 8 }}>{sectorName(S.sector[star])} · {skyCopy('levelZ1', L)}</div>
      <div key={S.id[star]} className="atlas-fade" style={{ animation: `atlasFade ${ms(DUR.fast)}ms ${cssEase(EASE.standard)}` }}>
        {!system ? (
          <div style={{ ...eyebrow, padding: '40px 0', textAlign: 'center' }}>{skyCopy('loadingSystem', L)}</div>
        ) : mode === 'disc' ? (
          <>
            {pair && (
              <div role="group" aria-label={skyCopy('twinTitle', L)} className="flex justify-center" style={{ marginBottom: 6 }}>
                {(['A', 'B'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)} className={RING}
                    style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44, marginLeft: -1, color: side === k ? 'var(--color-background)' : 'var(--color-text-secondary)', background: side === k ? 'var(--color-text-primary)' : 'var(--color-background-card)' }}>
                    {k} · {periodName(k === 'A' ? pair[0] : pair[1])}
                  </button>
                ))}
              </div>
            )}
            <SystemDisc system={system} period={sidePeriod ? PERIOD_KEYS.indexOf(sidePeriod) : period} focus={focusIds} label={starName(star)} yr={st.yr}
              marks={side === 'B' ? diffMarks(phDiff) : null} hatched={!!phDiff?.refused && phDiff.refused.period === sidePeriod}
              layers={layers} overlay={row ? null : overlay}
              onPick={(v) => (flight ? undefined : hop({ s: S.id[star], p: v }))} />
            {pair && <div style={{ ...mono, textAlign: 'center', marginTop: 4 }}>{skyCopy('twinStamp', L)}{side === 'B' && phDiff && !phDiff.refused ? ` · ${skyCopy('diffMarks', L)}` : ''}</div>}
            {yrRows && (
              <div aria-label={skyCopy('railBasisStar', L, { star: S.siglas[star] || starName(star) })} role="img" className="flex items-end" style={{ width: 358, maxWidth: '100%', height: 22, margin: '6px auto 0', gap: 1 }}>
                {Array.from({ length: N_YEARS }, (_, k) => {
                  const y = YEAR0 + k, v = yrRows.get(y) ?? 0
                  const none = !v || (manifest.meta?.year_gaps ?? []).includes(y)
                  return <span key={y} style={{ flex: 1, height: none ? 22 : Math.max(1, (v / yrMax) * 22), opacity: none ? 1 : st.yr === y ? 1 : 0.55,
                    background: none ? 'repeating-linear-gradient(135deg, var(--color-border) 0 1px, transparent 1px 4px)' : st.yr === y ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
                })}
              </div>
            )}
            {/* 2026-11-04 clarity: how to read the ring, not two «arbitrario» stamps (they live in the Leyenda) */}
            <div style={{ ...mono, textAlign: 'center', marginTop: 4 }}>{skyCopy('tapHint', L)} · {skyCopy('ringRead', L)}</div>
          </>
        ) : (
          <SkyCatalog
            phone manifest={manifest} star={star} system={system} lang={L} scope={pc.scope} sort={pc.sort} planet={row?.vendor_id ?? null}
            onTab={(sc, so) => writeSearch({ tab: `cat.${sc}.${so}`, pins: pinsTok })}
            onFlyBody={(v) => hop({ s: S.id[star], p: v })} onFlyStar={(i) => hop({ s: S.id[i] })}
            top={(
              <div className="flex flex-wrap gap-2" style={{ padding: '4px 0' }}>
                <button type="button" onClick={listCsv} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44 }}>{skyCopy('lassoCsv', L)}</button>
                <button type="button" onClick={share} className={RING} style={{ ...chipBtn, fontFamily: MONO, fontSize: 12, minHeight: 44 }}>{skyCopy('shareLink', L)}</button>
              </div>
            )}
          />
        )}
      </div>
      {flight ? (
        <div style={{ margin: '12px -16px 0' }}>{phoneFlight}</div>
      ) : (
        <Sheet lang={L} bottom={navH} snap={snap} onSnap={setSnap} peek={sheetPeek} label={row ? skyCopy('levelZ2', L) : skyCopy('starBrief', L)}>
          {tabRow}
          {lensRow}
          {diffOf(st.tab) ? (
            <SkyDiff phone manifest={manifest} star={star} diff={system ? phDiff : null} lang={L}
              onPair={(a, b) => writeSearch({ tab: `diff.${a}.${b}`, pins: pinsTok })}
              onFlyBody={(v) => hop({ s: S.id[star], p: v })} onFlyStar={(i) => hop({ s: S.id[i] })} />
          ) : dialTab ? (
            <SkyDial manifest={manifest} star={star} system={system} body={row} lang={L} year={st.yr} onYear={setYr}
              onFlyStar={(inst) => hop({ s: inst })} w={Math.min(358, vw - 32)} />
          ) : row ? (
            <div>
              <div style={{ padding: '8px 0' }}>
                <MoonDisc moons={mv.moons} selected={st.pos.m ?? null} yr={st.yr} label={skyCopy('levelZ2', L)} lens={moonLens} apagon={apagonMoons} onPick={(m) => hop({ s: S.id[star], p: row.vendor_id, m })} />
                {mv.skipped > 0 && <div style={mono}>{skyCopy('moonOmitted', L, { n: formatNumber(mv.skipped) })}</div>}
                {mv.undated > 0 && <div style={mono}>{skyCopy('moonUndated', L, { n: formatNumber(mv.undated) })}</div>}
              </div>
              {moon ? (
                <ContractFloatingCard
                  moon={moon} lang={L}
                  starName={moonStar !== undefined ? S.siglas[moonStar] || starName(moonStar) : null}
                  onFlyInst={moonStar !== undefined ? () => hop({ s: S.id[moonStar] }) : null}
                  related={moonSys.data ? moonSys.data.ranked.filter((v) => v !== row.vendor_id).slice(0, 8)
                    .map((v) => moonSys.data!.bodies.find((b) => b.vendor_id === v)!).filter(Boolean)
                    .map((b) => ({ vendor_id: b.vendor_id, name: b.name, share: b.share })) : null}
                  onFlyVendor={(v) => moonStar !== undefined && hop({ s: S.id[moonStar], p: v })}
                  signals={sigC.data ?? null}
                  onClose={() => hop({ s: S.id[star], p: row.vendor_id })}
                />
              ) : (
                <VendorFile
                  lead={<MoonLedger moons={mv.ready ? { body: -1, moons: mv.moons, remainder: mv.remainder, total: mv.total, smallest: mv.smallest, skipped: mv.skipped, undated: mv.undated } : null}
                    lang={L} hovered={st.pos.m ?? null} onHover={() => {}} onOpen={(m) => hop({ s: S.id[star], p: row.vendor_id, m })}
                    buyer={(m) => { const j = m.inst != null ? starOf(m.inst) : undefined; return j !== undefined ? S.siglas[j] || starName(j) : formatEntityName('institution', m.institutionName, 'full') }} />}
                  key={row.vendor_id} item={toClusterItem(row, L)} lens="sky" currentCode={null} codeLabels={patternLabels(L)} lang={L}
                  accent={riesgo ? 'var(--color-text-primary)' : SECTOR_COLORS[manifest.sectors.find((g) => g.id === S.sector[star])?.code ?? 'otros'] ?? SECTOR_COLORS.otros}
                  variant="panel" onClose={() => hop({ s: S.id[star] })} onOpenVendor={(id) => navigate(`/vendors/${id}`)}
                />
              )}
            </div>
          ) : (
            <StarDock manifest={manifest} star={star} system={system} lang={L} layers={layers} onFlyBody={(v) => hop({ s: S.id[star], p: v })} onCatalog={() => { setMode('list'); setSnap('peek') }} />
          )}
        </Sheet>
      )}
      {finder}
    </div>
  )
}

function SearchSheet({ manifest, lang: L, onClose, onStar, onVendor }: {
  manifest: SkyManifest; lang: 'en' | 'es'; onClose: () => void; onStar: (i: number) => void
  /** null = handled (flew); else the off-chart supplier's main-buyer star index, if any */
  onVendor: (v: number) => Promise<{ star: number | null } | null>
}) {
  const [q, setQ] = useState('')
  const [off, setOff] = useState<{ id: number; name: string; star: number | null } | null>(null)
  const [dq, setDq] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useModal(root, onClose)
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 250); return () => window.clearTimeout(t) }, [q])
  const S = manifest.stars
  const stars = useMemo(() => {
    if (dq.length < 2) return []
    const f = fold(dq)
    const out: number[] = []
    for (let i = 0; i < S.id.length && out.length < 8; i++) if (fold(`${S.name[i]} ${S.siglas[i]}`).includes(f)) out.push(i)
    return out
  }, [dq, S])
  const vendors = useQuery({ queryKey: ['atlas-phone-search', dq], queryFn: () => vendorApi.search(dq, 8), enabled: dq.length >= 3, placeholderData: keepPreviousData, staleTime: 60_000 })
  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={skyCopy('searchPh', L)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--color-background)', overflowY: 'auto', padding: '12px 16px 24px' }}>
      <div className="flex items-center gap-2">
        <input
          value={q} onChange={(e) => { setQ(e.target.value); setOff(null) }} placeholder={skyCopy('searchPh', L)} aria-label={skyCopy('searchPh', L)}
          className={RING}
          style={{ flex: 1, minWidth: 0, minHeight: 44, fontFamily: SERIF, fontSize: 17, padding: '0 12px', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <button type="button" onClick={onClose} aria-label={skyCopy('searchClose', L)} className={RING} style={{ ...chipBtn, minHeight: 44, minWidth: 44, fontFamily: MONO }}>×</button>
      </div>
      {off ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <div style={{ fontFamily: SERIF, fontSize: 17 }}>{formatEntityName('vendor', off.name, 'full')} <span style={mono}>PV {off.id}</span></div>
          <div style={mono}>{skyCopy('notOnChart', L)}</div>
          {off.star != null && (
            <button type="button" onClick={() => onStar(off.star!)} className={RING} style={{ ...rowBtn, fontFamily: MONO, fontSize: 12, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {skyCopy('flyBuyer', L)} › {formatEntityName('institution', S.name[off.star], 'full')}
            </button>
          )}
          <span style={eyebrow}>{skyCopy('dossierVendor', L)}</span>
          <EntityIdentityChip type="vendor" id={off.id} name={off.name} size="sm" fullName />
        </div>
      ) : (
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {stars.map((i) => (
          <li key={`s${i}`}>
            <button type="button" onClick={() => onStar(i)} className={RING} style={rowBtn}>
              <span style={{ display: 'block', fontFamily: SERIF, fontSize: 16 }}>{formatEntityName('institution', S.name[i], 'full')}</span>
              <span style={mono}>{formatCompactMXN(S.v[i])}</span>
            </button>
          </li>
        ))}
        {(vendors.data?.data ?? []).map((v) => (
          <li key={`v${v.id}`}>
            <button type="button" onClick={() => { void onVendor(v.id).then((r) => { if (r) setOff({ id: v.id, name: v.name, star: r.star }) }) }} className={RING} style={rowBtn}>
              <span style={{ display: 'block', fontFamily: SERIF, fontSize: 16 }}>{formatEntityName('vendor', v.name, 'full')}</span>
              <span style={mono}>PV {v.id}</span>
            </button>
          </li>
        ))}
        {dq.length >= 3 && !vendors.isPending && !stars.length && !(vendors.data?.data ?? []).length && (
          <li style={{ ...mono, padding: '12px 0' }}>{skyCopy('noHits', L)}</li>
        )}
      </ul>
      )}
    </div>
  )
}
