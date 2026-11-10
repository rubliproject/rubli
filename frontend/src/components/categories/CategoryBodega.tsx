/**
 * /categories «El piso → La bodega» (TEAL-4, owner 11-05: «combine La Bodega with El Piso»; PLUM concepts A + B,
 * `_explore/categorias_plum_2026-11-05/`). ONE object, two states of the same camera:
 *   El piso   — top-down boxes, AREA = money. Readable in one look.
 *   La bodega — the camera tilts and the boxes rise into crates, HEIGHT = share bought «sin concurso».
 * Same plan layout in both (the piso IS the bodega seen from above), so nothing jumps: every vertex is a lerp between
 * the top-down and the isometric projection. A one-time rise on first view; reduced motion = no animation, just the toggle;
 * phone = piso only. Colour = purchase family (lib/categories/families, --color-fam-*), never sector.
 * Opening a box shows its subcategories right under the object (board rows: money · contracts · share alto o crítico).
 * «Lo que más se compra» ranks the top concepts across all categories (GET /categories/subcategories/top).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { categoriesApi } from '@/api/client'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { FAMILIES, familyMeta, familyOf, type FamilyKey } from '@/lib/categories/families'
import { catFilterSearch, catPanoramaApi, subHref, withSearch, type CatFilter } from '@/lib/categories/panorama'
import { Token } from '@/components/aria/AskBar'
import { SEXENIOS } from '@/lib/aria/escenario'
import { ADMIN_COLORS, type AdministrationKey } from '@/lib/administrations'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { LEVEL } from '@/components/portada/Tablero'
import type { Lines } from '@/components/kit/PageHead'
import '@/components/kit/kit.css'
import '@/components/aria/concept.css'

type Lang = 'es' | 'en'
export interface BodegaItem { category_id: number; name_es: string; name_en: string; total_value: number; total_contracts: number; direct_award_pct: number | null }

/** one unit inside the object (SILVER-8 1): MDP from 1 MDP up, never «billones» beside «MDP» */
const objM = (v: number) => (v >= 999_950 ? formatCompactMXN(v, 'mdp') : formatCompactMXN(v))
/** SILVER-8 2–3, until RED reclassifies like CAT42: the misfiled offshore-oil works (47,418 MDP of contracts the word «sonda» pulled
 *  into Material de curación) stay out of the drill; the catch-all gets a plain name. Keyed by subcategory id. */
const HIDE_CODES = new Set(['oil_offshore_misfiled'])
/** keyed by the stable `code` (ids differ between the local and prod taxonomies); renamed only while the raw «sin tipo» label is live */
const plainName = (x: { code?: string; name_es: string; name_en: string }) =>
  x.code === 'other_medical_supplies' && /sin tipo/i.test(x.name_es) ? { name_es: 'Otro material de curación (sin detalle)', name_en: 'Other medical supplies (no detail)' } : null
export const cleanSubs = <T extends { code?: string; total_value: number; name_es: string; name_en: string }>(xs: T[]): T[] =>
  xs.filter((x) => x.total_value > 0 && !HIDE_CODES.has(x.code ?? '')).map((x) => { const n = plainName(x); return n ? { ...x, ...n } : x })

const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6)
const HMAX = 60 // plan units of height at 100 % sin concurso
const SEEN_KEY = 'rubli_bodega_rise_v1'
const RISE_MS = 1600
const DRILL_MS = 650 // drill = a spatial zoom; ease-in-out, reduced motion = instant

type It = { name_es: string; name_en: string; total_value: number; total_contracts: number; direct_award_pct: number | null }
/** key = `c{id}` for a category, `s{id}` for a subcategory, so the tween can follow a box across levels. */
export interface Box { key: string; id: number; fam: FamilyKey; x: number; y: number; w: number; h: number; z: number; it: It }
export type Rect = { x: number; y: number; w: number; h: number }
export type Drawn = Box & { o: number; live: boolean }

function pack(groups: [FamilyKey, { key: string; id: number; it: It }[]][], GW: number, GH: number): Box[] {
  type N = { name: string; value?: number; leaf?: { key: string; id: number; it: It }; fam?: FamilyKey; children?: N[] }
  const root = hierarchy<N>({ name: 'root', children: groups.map(([fam, ls]) => ({ name: fam, fam, children: ls.filter((l) => l.it.total_value > 0).map((l) => ({ name: l.key, value: l.it.total_value, leaf: l, fam })) })) })
    .sum((d) => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  treemap<N>().tile(treemapSquarify).size([GW, GH]).paddingOuter(0).paddingTop(0).paddingInner(2).round(false)(root)
  return root.leaves().filter((l) => l.data.leaf).map((l) => {
    const n = l as unknown as { x0: number; y0: number; x1: number; y1: number }
    const { key, id, it } = l.data.leaf!
    return { key, id, it, fam: l.data.fam!, x: n.x0, y: n.y0, w: Math.max(0, n.x1 - n.x0), h: Math.max(0, n.y1 - n.y0), z: 4 + HMAX * Math.max(0, Math.min(100, it.direct_award_pct ?? 0)) / 100 }
  })
}

/** Lay the categories on the plan: families first (squarified), categories inside each. Pure, for the test. */
export function layout(items: BodegaItem[], GW: number, GH: number): Box[] {
  const fams = new Map<FamilyKey, { key: string; id: number; it: It }[]>()
  items.forEach((c) => { const f = familyOf(c.category_id); fams.set(f, [...(fams.get(f) ?? []), { key: `c${c.category_id}`, id: c.category_id, it: c }]) })
  return pack([...fams], GW, GH)
}

/** One opened category: its subcategories fill the whole plan (owner 11-05: «that sector comes into focus»). */
export function layoutSubs(subs: (It & { subcategory_id: number })[], fam: FamilyKey, GW: number, GH: number): Box[] {
  return pack([[fam, subs.map((x) => ({ key: `s${x.subcategory_id}`, id: x.subcategory_id, it: x }))]], GW, GH)
}

export const bbox = (bs: Rect[]): Rect | null => {
  if (!bs.length) return null
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y))
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }
}

/**
 * The drill tween, one zoom: the anchor A (the box or family being opened, in the outer layout) maps onto the whole plan.
 * dir 1 (in): boxes that leave are pushed out by that zoom (blown away), boxes that arrive grow out of A.
 * dir -1 (out): the reverse. dir 0: crossfade in place. Boxes on both sides glide to their new place. k is eased 0..1.
 */
export function frame(prev: Box[], next: Box[], A: Rect | null, dir: -1 | 0 | 1, k: number, GW: number, GH: number): Drawn[] {
  const zin = (r: Rect): Rect => ({ x: ((r.x - A!.x) * GW) / A!.w, y: ((r.y - A!.y) * GH) / A!.h, w: (r.w * GW) / A!.w, h: (r.h * GH) / A!.h })
  const zout = (r: Rect): Rect => ({ x: A!.x + (r.x * A!.w) / GW, y: A!.y + (r.y * A!.h) / GH, w: (r.w * A!.w) / GW, h: (r.h * A!.h) / GH })
  const ok = A && A.w > 0 && A.h > 0 && dir !== 0
  const exit = (r: Box): Box => (ok ? { ...r, ...(dir === 1 ? zin(r) : zout(r)) } : r)
  const enter = (r: Box): Box => (ok ? { ...r, ...(dir === 1 ? zout(r) : zin(r)) } : r)
  const lerp = (a: Box, b: Box) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k, z: a.z + (b.z - a.z) * k })
  const nk = new Set(next.map((b) => b.key))
  const pk = new Map(prev.map((b) => [b.key, b]))
  return [
    ...prev.filter((p) => !nk.has(p.key)).map((p) => ({ ...p, ...lerp(p, exit(p)), o: 1 - k, live: false })),
    ...next.map((n) => { const p = pk.get(n.key); return { ...n, ...lerp(p ?? enter(n), n), o: p ? 1 : k, live: true } }),
  ]
}

/** The camera: t = 0 top-down (El piso), t = 1 isometric (La bodega); every point lerps between the two. */
export function camera(GW: number, GH: number, width: number, t: number) {
  const s0 = width / GW
  const s1 = width / ((GW + GH) * COS)
  const H0 = GH * s0
  const H1 = ((GW + GH) * SIN + HMAX) * s1
  const P = (x: number, y: number, z = 0): [number, number] => {
    const tx = x * s0, ty = y * s0
    const ix = ((x - y) * COS + GH * COS) * s1, iy = ((x + y) * SIN - z + HMAX) * s1
    return [tx + (ix - tx) * t, ty + (iy - ty) * t]
  }
  return { P, height: H0 + (H1 - H0) * t, s0, s1 }
}

const face = (c: string, pct: number, to = 'var(--color-background)') => `color-mix(in srgb, ${c} ${pct}%, ${to})`
const pts = (ps: [number, number][]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
/** A name in at most two lines of `max` characters; [] when it doesn't fit — never «…» (owner rule; the box's
 *  title / tooltip carries the name, AUDIT 11-07 #5). */
export function wrap(s: string, max: number): string[] {
  const w = s.split(' ')
  let a = '', i = 0
  while (i < w.length && `${a} ${w[i]}`.trim().length <= max) a = `${a} ${w[i++]}`.trim()
  const b = w.slice(i).join(' ')
  if (!a || b.length > max) return []
  return b ? [a, b] : [a]
}
type Lvl = { fam: FamilyKey | null; cat: number | null }
const depth = (l: Lvl) => (l.cat != null ? 2 : l.fam ? 1 : 0)
/** Where the zoom pivots in a layout: the opened category's box, or the opened family's block. */
const anchorOf = (bs: Box[], l: Lvl): Rect | null => (l.cat != null ? bs.find((b) => b.key === `c${l.cat}`) ?? null : l.fam ? bbox(bs.filter((b) => b.fam === l.fam)) : null)

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Fold the cube rows into per-category items for one sexenio and/or buyer sector (null = all). Pure, for the test. */
export function filterItems(base: BodegaItem[], rows: [number, number, string, number, number, number, number][], sx: string | null, sector: number | null): BodegaItem[] {
  // row = [cat, sector, sexenio, contracts, value, direct, known]; «sin concurso» = direct / known (procedure coded, ≥ 2011),
  // the same rule as category_stats, so a box keeps its height with or without a filter (SILVER 11-05)
  const acc = new Map<number, { n: number; v: number; d: number; k: number }>()
  for (const [cat, sec, x, n, v, d, k] of rows) {
    if ((sx && x !== sx) || (sector != null && sec !== sector)) continue
    const a = acc.get(cat) ?? { n: 0, v: 0, d: 0, k: 0 }
    a.n += n; a.v += v; a.d += d; a.k += k
    acc.set(cat, a)
  }
  return base.map((c) => {
    const a = acc.get(c.category_id)
    return { ...c, total_value: a?.v ?? 0, total_contracts: a?.n ?? 0, direct_award_pct: a && a.k ? (100 * a.d) / a.k : null }
  })
}

type SubRow = Awaited<ReturnType<typeof categoriesApi.getSubcategories>>['data'][number]
/** A category's subcategories, cut by the page filter (AUDIT_JOURNALIST 11-07 P0): the precomputed rows (ids, vendors,
 *  example titles) with their money re-read from the filtered panorama, matched by the stable `code`. Unfiltered =
 *  the precomputed rows as they are. */
function useCatSubs(catId: number | null, f: CatFilter) {
  const fq = catFilterSearch(f)
  const base = useQuery({ queryKey: ['categories', 'subcategories', catId], queryFn: () => categoriesApi.getSubcategories(catId!), staleTime: 600_000, enabled: catId != null })
  const pan = useQuery({ queryKey: ['category-b2', catId, null, 'all', fq], queryFn: () => catPanoramaApi.get(catId!, { filter: f }), staleTime: 600_000, enabled: catId != null && !!fq })
  const data = useMemo<SubRow[]>(() => {
    const rows = base.data?.data ?? []
    if (!fq) return rows
    if (!pan.data) return []
    const by = new Map(pan.data.subs.filter((x) => x.code).map((x) => [x.code as string, x]))
    return rows.map((r) => {
      const x = by.get(r.code ?? '')
      return { ...r, total_value: x?.amount_mxn ?? 0, total_contracts: x?.contracts ?? 0, direct_award_pct: x?.da_pct ?? 0, high_risk_pct: x?.hr_pct ?? null, avg_risk: x?.avg_risk ?? 0 }
    })
  }, [base.data, pan.data, fq])
  return { data, isLoading: base.isLoading || (!!fq && pan.isLoading), isError: base.isError || pan.isError }
}

/** The page head slots this view fills (CategoriesIndex wraps them in the shared PageHead with its crumbs + tabs). */
export interface HeadSlots { finding: ReactNode; question?: ReactNode; lines?: Lines; toolbar?: ReactNode }

export default function CategoryBodega({ items: allItems, lang, head }: { items: BodegaItem[]; lang: Lang; head: (s: HeadSlots) => ReactNode }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  // the ARIA question, for categories (owner 11-05): in which government · in which buyer sector — state in the URL
  const [params, setParams] = useSearchParams()
  const sx = SEXENIOS.some((s) => s.key === params.get('sx')) ? (params.get('sx') as AdministrationKey) : null
  const secRaw = Number(params.get('sector'))
  const sector = SECTORS.some((s) => s.id === secRaw) ? secRaw : null
  const filtered = sx != null || sector != null
  const fq = catFilterSearch({ sx, sector })
  const cube = useQuery({ queryKey: ['categories', 'cube'], queryFn: () => categoriesApi.getCategoryCube(), staleTime: 3_600_000 })
  // one source (SILVER 2): the cube folds every row when unfiltered too; the summary is only the fallback while it loads or is missing
  const items = useMemo(() => (cube.data?.rows?.length ? filterItems(allItems, cube.data.rows, sx, sector) : allItems), [allItems, cube.data, sx, sector])
  const setQ = (k: 'sx' | 'sector', v: string | number | null) => setParams((p) => { const n = new URLSearchParams(p); if (v == null) n.delete(k); else n.set(k, String(v)); return n }, { replace: true })
  const [askOpen, setAskOpen] = useState<'sx' | 'sector' | null>(null)
  const sxMeta = sx ? SEXENIOS.find((s) => s.key === sx)! : null
  const secMeta = sector != null ? SECTORS.find((s) => s.id === sector)! : null
  const where = [sxMeta ? L(`con ${sxMeta.short}`, `under ${sxMeta.short}`) : null, secMeta ? L(`en ${secMeta.name.toLowerCase()}`, `in ${secMeta.nameEN.toLowerCase()}`) : null].filter(Boolean).join(' ')
  const live = items.filter((c) => c.total_value > 0).length
  const [ref, width] = useWidth<HTMLDivElement>()
  const phone = width > 0 && width < 600
  const GW = phone ? 400 : 1100, GH = phone ? 640 : 500
  const byId = useMemo(() => new Map(items.map((c) => [c.category_id, c])), [items])
  const [t, setT] = useState(0)
  const [target, setTarget] = useState<0 | 1>(0)
  // the drill (owner 11-05): all → one family (the rest blown away) → one category (its subcategories as boxes) → one subcategory
  const [lvl, setLvl] = useState<Lvl>({ fam: null, cat: null })
  const [subId, setSubId] = useState<number | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const anim = useRef<number | null>(null)
  const drillAnim = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const refocus = useRef<string | null>(null)
  const subsQ = useCatSubs(lvl.cat, { sx, sector })
  const subs = useMemo(() => cleanSubs(subsQ.data), [subsQ.data])
  const subsDead = lvl.cat != null && !subsQ.isLoading && !subs.length
  const view = useMemo<Box[] | null>(() => {
    if (lvl.cat != null) return subs.length ? layoutSubs(subs, familyOf(lvl.cat), GW, GH) : null
    return layout(lvl.fam ? items.filter((c) => familyOf(c.category_id) === lvl.fam) : items, GW, GH)
  }, [lvl, subs, items, GW, GH])
  const [shown, setShown] = useState<{ boxes: Box[]; lvl: Lvl }>({ boxes: [], lvl })
  const [from, setFrom] = useState<{ boxes: Box[]; A: Rect | null; dir: -1 | 0 | 1 } | null>(null)
  const [k, setK] = useState(1)
  useEffect(() => {
    if (!view) return // subcategories still loading: hold the current level
    const old = shown
    const same = old.lvl.fam === lvl.fam && old.lvl.cat === lvl.cat
    if (drillAnim.current) cancelAnimationFrame(drillAnim.current)
    setShown({ boxes: view, lvl })
    if (same || !old.boxes.length || reduced()) { setFrom(null); setK(1); return } // resize, filter, first paint: no tween
    // ponytail: an interrupted drill restarts from the last target, not the mid-flight frame; fine at 650 ms
    const d = Math.sign(depth(lvl) - depth(old.lvl)) as -1 | 0 | 1
    const A = d === 1 ? anchorOf(old.boxes, lvl) : d === -1 ? anchorOf(view, old.lvl) : null
    setFrom({ boxes: old.boxes, A, dir: A ? d : 0 })
    setK(0)
    let start = 0
    const step = (now: number) => {
      if (!start) start = now
      const u = Math.min(1, (now - start) / DRILL_MS)
      setK(u)
      if (u < 1) drillAnim.current = requestAnimationFrame(step)
      else setFrom(null)
    }
    drillAnim.current = requestAnimationFrame(step)
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (drillAnim.current) cancelAnimationFrame(drillAnim.current) }, [])
  // closing a box puts focus back on that box (SILVER item 8)
  useEffect(() => {
    let key = refocus.current
    if (!key) return
    if (key === '*') key = [...shown.boxes].sort((a, b) => b.it.total_value - a.it.total_value)[0]?.key ?? null
    if (!key) return
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-key="${key}"]`)
    if (el) { el.focus({ preventScroll: true }); refocus.current = null }
  }, [shown])
  const drawn = useMemo<Drawn[]>(() => (from ? frame(from.boxes, shown.boxes, from.A, from.dir, ease(k), GW, GH) : shown.boxes.map((b) => ({ ...b, o: 1, live: true }))), [from, shown, k, GW, GH])
  // owner 11-05: once zoomed in every box shares one family hue → shade by money rank (darker = more), −1 … 1
  const shade = useMemo(() => {
    if (depth(shown.lvl) === 0) return new Map<string, number>()
    const r = [...shown.boxes].sort((a, b) => b.it.total_value - a.it.total_value)
    return new Map(r.map((b, i) => [b.key, r.length > 1 ? 1 - (2 * i) / (r.length - 1) : 0]))
  }, [shown])
  const goTo = (l: Lvl) => { setSubId(null); setHoverKey(null); setLvl(l) }
  const up = () => {
    if (lvl.cat != null) { refocus.current = `c${lvl.cat}`; goTo({ fam: lvl.fam, cat: null }) }
    else if (lvl.fam) { refocus.current = [...shown.boxes].sort((a, b) => b.it.total_value - a.it.total_value)[0]?.key ?? null; goTo({ fam: null, cat: null }) }
  }

  const go = (to: 0 | 1, delay = 0) => {
    setTarget(to)
    if (anim.current) cancelAnimationFrame(anim.current)
    if (reduced()) { setT(to); return }
    let start = 0
    const from = t
    const step = (now: number) => {
      if (!start) start = now + delay
      const u = Math.max(0, Math.min(1, (now - start) / RISE_MS))
      setT(from + (to - from) * ease(u))
      if (u < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }
  // one-time rise on first view — when the object is actually on screen (not behind the intro, not below the fold);
  // not on the phone, not with reduced motion. Later visits open as the bodega.
  useEffect(() => {
    const el = ref.current
    if (!width || phone || reduced() || !el) return
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* private mode */ }
    if (seen) { setT(1); setTarget(1); return }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || document.visibilityState !== 'visible') return
      io.disconnect()
      try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
      go(1, 700)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); if (anim.current) cancelAnimationFrame(anim.current) }
  }, [width > 0, phone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phone) { setT(0); setTarget(0) } }, [phone])

  const cam = camera(GW, GH, width || 1, t)
  const total = items.reduce((a, c) => a + c.total_value, 0)
  const name = (c: { name_es: string; name_en: string }) => (lang === 'es' ? c.name_es : c.name_en || c.name_es)
  const famName = (k: FamilyKey) => { const f = familyMeta(k); return lang === 'es' ? f.es : f.en }
  const famTotals = useMemo(() => {
    const m = new Map<FamilyKey, number>()
    items.forEach((c) => m.set(familyOf(c.category_id), (m.get(familyOf(c.category_id)) ?? 0) + c.total_value))
    return FAMILIES.filter((f) => m.has(f.key)).map((f) => ({ ...f, v: m.get(f.key)! })).sort((a, b) => b.v - a.v)
  }, [items])
  const half = useMemo(() => {
    const v = items.map((c) => c.total_value).sort((a, b) => b - a)
    let acc = 0
    return v.findIndex((x) => (acc += x) >= total / 2) + 1
  }, [items, total])
  const tallest = useMemo(() => [...items].filter((c) => c.total_value > total * 0.01).sort((a, b) => (b.direct_award_pct ?? 0) - (a.direct_award_pct ?? 0))[0], [items, total])
  const sel = lvl.cat == null ? null : byId.get(lvl.cat) ?? null
  const order = [...drawn].sort((a, b) => Number(a.live) - Number(b.live) || (a.x + a.y) - (b.x + b.y)) // leaving first, then far first
  /** open a category straight away (search, «Lo que más se compra») */
  const open = (id: number) => goTo({ fam: familyOf(id), cat: id })
  const onBox = (b: Box) => {
    if (b.key[0] === 's') setSubId(subId === b.id ? null : b.id)
    else if (!lvl.fam) goTo({ fam: b.fam, cat: null })
    else { refocus.current = '*'; goTo({ fam: b.fam, cat: b.id }) } // the clicked box leaves: focus the first new one (review 1)
  }
  // owner 11-05: «I can't see all of their names» — every box shows its full name on hover/focus, and the search opens one
  const onSearch = (v: string) => {
    setQuery(v)
    const hit = items.find((c) => name(c).toLowerCase() === v.trim().toLowerCase())
    if (hit) open(hit.category_id)
  }
  const hov = hoverKey == null || from ? null : drawn.find((b) => b.live && b.key === hoverKey) ?? null
  const onKey = (e: KeyboardEvent, b: Box) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBox(b) } }
  const sub = subId == null ? null : subs.find((x) => x.subcategory_id === subId) ?? null
  const crumbs: { label: string; to: Lvl }[] = [{ label: L('Todas las categorías', 'All categories'), to: { fam: null, cat: null } }]
  if (lvl.fam) crumbs.push({ label: famName(lvl.fam), to: { fam: lvl.fam, cat: null } })
  if (sel) crumbs.push({ label: name(sel), to: lvl })

  const Where = where ? `${where[0].toUpperCase()}${where.slice(1)}, ` : ''
  const finding = live === 0
    ? L('No hay contratos para esta pregunta.', 'No contracts for this question.')
    : where
      ? L(`${Where}la mitad del dinero va a solo ${half} de ${live} tipos.`, `${Where}half the money goes to just ${half} of ${live} kinds.`)
      : L(`La mitad del dinero va a solo ${half} de ${live} tipos.`, `Half the money goes to just ${half} of ${live} kinds.`)
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || askOpen || (e.target as HTMLElement).tagName === 'INPUT') return
    if (subId != null) { e.preventDefault(); svgRef.current?.querySelector<SVGGElement>(`[data-key="s${subId}"]`)?.focus({ preventScroll: true }); setSubId(null) }
    else if (depth(lvl) > 0) { e.preventDefault(); up() }
  }

  return (
    <div className="cb-w" onKeyDown={onEsc}>
      {head({
        finding,
        question: <>
          <span>{L('¿En qué gastó el gobierno', 'What did the government spend on')}</span>
          <Token label={sxMeta ? L(`con ${sxMeta.short}`, `under ${sxMeta.short}`) : L('en cualquier año', 'in any year')} set={!!sxMeta} open={askOpen === 'sx'} lang={lang}
            onToggle={() => setAskOpen((o) => (o === 'sx' ? null : 'sx'))} onClose={() => setAskOpen(null)} onClear={() => { setAskOpen(null); setQ('sx', null) }}>
            <div className="ask-sx" role="group" aria-label={L('Elija un gobierno', 'Pick a government')}>
              <button type="button" className="ask-opt ask-sxb" aria-pressed={!sx} onClick={() => { setAskOpen(null); setQ('sx', null) }}><b>{L('Cualquier año', 'Any year')}</b><span>2002–2026</span></button>
              {SEXENIOS.map((s) => (
                <button key={s.key} type="button" className="ask-opt ask-sxb" aria-pressed={sx === s.key} style={{ ['--band' as string]: ADMIN_COLORS[s.key] }} onClick={() => { setAskOpen(null); setQ('sx', s.key) }}><b>{s.short}</b><span>{s.years}</span></button>
              ))}
            </div>
          </Token>
          <Token label={secMeta ? L(`en ${secMeta.name.toLowerCase()}`, `in ${secMeta.nameEN.toLowerCase()}`) : L('en cualquier sector', 'in any sector')} set={!!secMeta} open={askOpen === 'sector'} lang={lang}
            onToggle={() => setAskOpen((o) => (o === 'sector' ? null : 'sector'))} onClose={() => setAskOpen(null)} onClear={() => { setAskOpen(null); setQ('sector', null) }}>
            <div className="ask-chips" role="group" aria-label={L('Elija un sector', 'Pick a sector')}>
              <button type="button" className="ask-opt ask-chip" aria-pressed={sector == null} onClick={() => { setAskOpen(null); setQ('sector', null) }}>{L('Todos', 'All')}</button>
              {SECTORS.map((s) => (
                <button key={s.id} type="button" className="ask-opt ask-chip" aria-pressed={sector === s.id} onClick={() => { setAskOpen(null); setQ('sector', s.id) }}><i aria-hidden="true" style={{ background: s.color }} />{lang === 'es' ? s.name : s.nameEN}</button>
              ))}
            </div>
            <span className="ask-gloss cb-gloss">{L('El sector es el de quien compró. Por ejemplo, Salud es el IMSS, el ISSSTE y la Secretaría de Salud.', 'The sector is the buyer’s. For example, Health is IMSS, ISSSTE and the Health Ministry.')}</span>
          </Token>
          <span>?</span>{filtered && cube.isLoading && <span className="cc-num"> {L('Cargando…', 'Loading…')}</span>}</>,
        lines: {
          see: L('Cada caja es un tipo de compra del gobierno. Primero desde arriba, luego de lado.', 'Each box is one kind of government purchase. First from above, then from the side.'),
          read: L('El piso de la caja es el dinero. Su altura: cuántos contratos fueron sin concurso. El color junta lo parecido.', 'A box’s floor is the money. Its height: how many contracts had no tender. Colour groups alike things.'),
          means: tallest
            ? L(`La caja más alta: ${name(tallest)}. ${Math.round(tallest.direct_award_pct ?? 0)} de cada 100 contratos, sin concurso.`, `The tallest box: ${name(tallest)}. ${Math.round(tallest.direct_award_pct ?? 0)} of every 100 contracts, no tender.`)
            : L('Sin cajas con suficiente dinero para comparar.', 'No boxes with enough money to compare.'),
        },
        toolbar: <>
          <div className="cb-bar">
            <label className="cb-find">
          <span className="sr-only">{L('Busca un tipo de compra', 'Find a kind of purchase')}</span>
          <input type="search" list="cb-names" value={query} onChange={(e) => onSearch(e.target.value)}
            placeholder={L('Busca un tipo de compra, p. ej. boletos de avión', 'Find a kind of purchase, e.g. airline tickets')} />
          <datalist id="cb-names">{[...items].sort((a, b) => name(a).localeCompare(name(b))).map((c) => <option key={c.category_id} value={name(c)} />)}</datalist>
        </label>
        {!phone && (
          <div className="cb-cam" role="group" aria-label={L('Cámara', 'Camera')}>
            <button type="button" aria-pressed={target === 0} onClick={() => go(0)}>{L('Ver desde arriba', 'View from above')}</button>
            <button type="button" aria-pressed={target === 1} onClick={() => go(1)}>{L('Ver de lado', 'View from the side')}</button>
          </div>
        )}
          </div>
          <ul className="cc-key" aria-label={L('Colores: el grupo de compra', 'Colours: the purchase group')}>
        {famTotals.map((f) => <li key={f.key}><button type="button" className="cb-fam" aria-pressed={lvl.fam === f.key} onClick={() => goTo(lvl.fam === f.key && lvl.cat == null ? { fam: null, cat: null } : { fam: f.key, cat: null })}><i style={{ background: face(f.color, 70) }} />{L(f.es, f.en)} <span className="cc-num">{total > 0 && f.v / total < 0.01 ? '<1' : Math.round((100 * f.v) / Math.max(1, total))} %</span></button></li>)}
      </ul>
        </>,
      })}
    <section className="cb" id="cat-panel-bodega" role="tabpanel" aria-labelledby="cat-tab-bodega">

      {depth(lvl) > 0 && (
        <nav className="cb-crumbs" aria-label={L('Dónde estás', 'Where you are')}>
          <ol>{crumbs.map((c, i) => <li key={i}>{i < crumbs.length - 1
            ? <button type="button" onClick={() => { refocus.current = lvl.cat != null ? `c${lvl.cat}` : [...shown.boxes].sort((a, b) => b.it.total_value - a.it.total_value)[0]?.key ?? null; goTo(c.to) }}>{i === 0 ? '← ' : ''}{c.label}</button>
            : <span aria-current="location">{c.label}</span>}</li>)}</ol>
          {lvl.cat != null && subsQ.isLoading && <span className="cc-num">{L('Abriendo…', 'Opening…')}</span>}
          {subsDead && <span className="cc-num" role="alert">{subsQ.isError ? L('Esta caja no se abrió. Inténtalo en un momento.', 'This box did not open. Try again in a moment.') : L('Esta caja no tiene minicategorías con dinero.', 'This box has no mini-categories with money.')}</span>}
          {/* owner 11-05: two ways on — keep digging in the boxes, or see the whole category */}
          {sel && <EntityIdentityChip type="category" id={sel.category_id} name={name(sel)} variant="name" className="cb-whole" search={fq} ariaLabel={L(`Ver toda la categoría ${name(sel)}`, `See the whole ${name(sel)} category`)}>{L('Ver la categoría completa →', 'See the whole category →')}</EntityIdentityChip>}
        </nav>
      )}
      <div ref={ref} className="cb-stage">
        {width > 0 && (
          <svg ref={svgRef} className="cb-svg" viewBox={`0 0 ${width} ${Math.ceil(cam.height)}`} width={width} height={Math.ceil(cam.height)} role="group" aria-label={shown.lvl.cat != null ? L(`${shown.boxes.length} cajas, una por minicategoría`, `${shown.boxes.length} boxes, one per mini-category`) : L(`${shown.boxes.length} cajas, una por tipo de compra`, `${shown.boxes.length} boxes, one per kind of purchase`)}>
            {order.map((b) => {
              const c = b.it
              const col = familyMeta(b.fam).color
              const z = b.z * t
              const g = 1 // gap between crates in plan units
              const x = b.x + g, y = b.y + g, w = Math.max(0.5, b.w - 2 * g), h = Math.max(0.5, b.h - 2 * g)
              const A = cam.P(x, y, z), B = cam.P(x + w, y, z), C = cam.P(x + w, y + h, z), D = cam.P(x, y + h, z)
              const B0 = cam.P(x + w, y, 0), C0 = cam.P(x + w, y + h, 0), D0 = cam.P(x, y + h, 0)
              const picked = b.key[0] === 's' && subId === b.id
              // phone: a box under 44 px can't be tapped reliably → out of the tab order; «Ver en lista» covers it (SILVER 6)
              const tiny = phone && Math.min(b.w, b.h) * cam.s0 < 44
              const reach = b.live && !tiny
              const label = `${name(c)}: ${objM(c.total_value)}, ${Math.round(c.direct_award_pct ?? 0)} ${L('de cada 100 contratos sin concurso', 'of every 100 contracts with no tender')}`
              return (
                <g key={b.key} data-key={b.key} className="cb-box" data-picked={picked || undefined} role="button" tabIndex={reach ? 0 : -1} aria-hidden={reach ? undefined : true} aria-label={label} aria-pressed={b.key[0] === 's' ? picked : undefined}
                  style={b.o < 1 ? { opacity: b.o, pointerEvents: 'none' } : undefined}
                  onClick={() => onBox(b)} onKeyDown={(e) => onKey(e, b)}
                  onMouseEnter={() => setHoverKey(b.key)} onMouseLeave={() => setHoverKey((h) => (h === b.key ? null : h))}
                  onFocus={() => setHoverKey(b.key)} onBlur={() => setHoverKey((h) => (h === b.key ? null : h))}>
                  <title>{label}</title>
                  {t > 0.02 && <>
                    <polygon points={pts([D, C, C0, D0])} style={{ fill: face(col, 78, 'var(--color-text-primary)') }} />
                    <polygon points={pts([C, B, B0, C0])} style={{ fill: face(col, 80) }} />
                  </>}
                  <polygon className="cb-top" points={pts([A, B, C, D])} style={{ fill: face(col, 42 + 14 * (1 - t) + 16 * (shade.get(b.key) ?? 0)) }} />
                </g>
              )
            })}
            {(() => {
              // audit 11-07: labels never collide and never print «…» — biggest boxes label first; a label that would
              // overlap a placed one, or that does not fit its box in two whole lines, is dropped (the hover card names it)
              const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
              return [...drawn].filter((b) => b.live).sort((a, b) => b.w * b.h - a.w * a.h).map((b) => {
                const c = b.it
                const area = b.w * b.h * cam.s0 * cam.s0
                const faceW = (b.w * cam.s0) * (1 - t) + (Math.min(b.w, b.h) * 1.6 * cam.s1) * t
                if (area < (phone ? 2600 : 5200) || faceW < 70) return null
                const [cx, cy] = cam.P(b.x + b.w / 2, b.y + b.h / 2, b.z * t)
                const lines = wrap(name(c), Math.max(4, Math.floor(faceW / 7.2)))
                if (!lines.length || lines.some((ln) => ln.endsWith('…'))) return null
                const y0 = cy - 2 - (lines.length - 1) * 8
                const halfW = (Math.max(...lines.map((ln) => ln.length)) * 7.2) / 2 + 4
                const box = { x0: cx - halfW, x1: cx + halfW, y0: y0 - 13, y1: y0 + 18 + (lines.length - 1) * 15 }
                if (placed.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) return null
                placed.push(box)
                return (
                  <g key={`l${b.key}`} className="cb-lab" aria-hidden="true" style={b.o < 1 ? { opacity: b.o * b.o } : undefined}>
                    <text x={cx} y={y0} textAnchor="middle">{lines.map((ln, i) => <tspan key={i} x={cx} dy={i ? 15 : 0}>{ln}</tspan>)}</text>
                    <text x={cx} y={y0 + 14 + (lines.length - 1) * 15} textAnchor="middle" className="cb-val">{objM(c.total_value)}</text>
                  </g>
                )
              })
            })()}
          </svg>
        )}
        {hov && width > 0 && (() => {
          const c = hov.it
          const [cx, cy] = cam.P(hov.x + hov.w / 2, hov.y + hov.h / 2, hov.z * t)
          const left = Math.max(8, Math.min(width - 248, cx - 120))
          return (
            <div className="cb-tip" style={{ left, top: Math.max(0, cy - 86) }} aria-hidden="true">
              <b>{name(c)}</b>
              <span>{famName(hov.fam)}</span>
              <span className="cc-num">{objM(c.total_value)} · {formatNumber(c.total_contracts)} {L('contratos', 'contracts')}</span>
              <span className="cc-num">{Math.round(c.direct_award_pct ?? 0)} {L('de cada 100 contratos sin concurso', 'of every 100 contracts with no tender')}</span>
            </div>
          )
        })()}
      </div>
      <p className="cc-note">{lvl.cat != null && !subsDead
        ? L('Toca una caja para ver sus números. Esc o la flecha para volver.', 'Tap a box to see its numbers. Esc or the arrow to go back.')
        : lvl.fam
          ? L('Toca una caja para abrirla: verás qué se compró dentro.', 'Tap a box to open it: you will see what was bought inside.')
          : L('Toca una caja: su grupo se acerca y los demás se apartan.', 'Tap a box: its group comes closer, the rest move away.')}</p>

      {phone && <button type="button" className="cb-list" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('vista', 'hoja'); return n })}>{L(`Ver las ${live} en lista`, `See all ${live} as a list`)} →</button>}
      {sub && sel && <SubCard key={sub.subcategory_id} sub={sub} categoryId={sel.category_id} lang={lang} fq={fq} onClose={() => { svgRef.current?.querySelector<SVGGElement>(`[data-key="s${sub.subcategory_id}"]`)?.focus({ preventScroll: true }); setSubId(null) }} />}
      {sel && <Opened key={sel.category_id} cat={sel} filter={{ sx, sector }} where={where} lang={lang} family={famName(familyOf(sel.category_id))} onClose={up} />}

      <TopBuys lang={lang} onOpen={open} filtered={filtered} />
    </section>
    </div>
  )
}

/** «indicador de riesgo» share as a «%» column (one-line rows, AUDIT 11-07 #5): % of contracts high or critical; ≥ 25 is marked. */
function RiskShare({ v, lang }: { v: number | null | undefined; lang: Lang }) {
  if (v == null) return <span className="bd-dim">—</span>
  const n = Math.round(v)
  return <span className={n >= 25 ? 'cb-hot' : undefined}>{n} %<span className="sr-only">{lang === 'es' ? ' de los contratos, alto o crítico' : ' of contracts, high or critical'}</span></span>
}

/** An opened box: its subcategories right under the object, as the Portada board. */
function Opened({ cat, lang, family, onClose, filter, where }: { cat: BodegaItem; lang: Lang; family: string; onClose: () => void; filter: CatFilter; where: string }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const q = useCatSubs(cat.category_id, filter)
  const fq = catFilterSearch(filter)
  const name = lang === 'es' ? cat.name_es : cat.name_en || cat.name_es
  const subs = useMemo(() => cleanSubs(q.data).sort((a, b) => b.total_value - a.total_value), [q.data])
  const share = (v: number) => { const p = Math.round((100 * v) / cat.total_value); return p < 1 ? '<1' : String(p) }
  const named = subs.filter((x) => !x.is_catch_all)
  const riskiest = [...named].filter((x) => x.total_contracts >= 50 && x.high_risk_pct != null).sort((a, b) => (b.high_risk_pct ?? 0) - (a.high_risk_pct ?? 0))[0]
  const subName = (x: (typeof subs)[number]) => (lang === 'es' ? x.name_es : x.name_en || x.name_es)
  return (
    <section className="bd cb-open" aria-labelledby="cb-open-h">
      <div className="bd-head">
        <h3 id="cb-open-h" className="bd-h">{name}</h3>
        <p className="bd-when">{family} · <b>{formatDualCurrency(cat.total_value)}</b> · <b>{formatNumber(cat.total_contracts)}</b> {L('contratos', 'contracts')} · <b>{Math.round(cat.direct_award_pct ?? 0)}</b> {L('de cada 100 sin concurso', 'of every 100 with no tender')} · <EntityIdentityChip type="category" id={cat.category_id} name={name} variant="name" className="bd-chip" search={fq} ariaLabel={L(`Expediente de ${name}`, `File of ${name}`)}>{L('ver expediente', 'open file')}</EntityIdentityChip></p>
        {riskiest && <p className="bd-desc"><b>{L(`Más riesgo: ${subName(riskiest)}. ${Math.round(riskiest.high_risk_pct!)} de cada 100 contratos, alto o crítico.`, `Most risk: ${subName(riskiest)}. ${Math.round(riskiest.high_risk_pct!)} of every 100 contracts, high or critical.`)}</b></p>}
      </div>
      <div className="bd-bar">
        <p className="bd-tabs cb-open-k">{L('¿En qué se gastó?', 'What was it spent on?')} <span className="bd-n">{subs.length}</span></p>
        <button type="button" className="bd-stop" onClick={onClose}>✕ {L('Cerrar', 'Close')}</button>
      </div>
      {q.isLoading && <div className="cc-hold" aria-busy="true" />}
      {q.isError && <p className="bd-note" role="alert">{L('Esta caja no cargó. Ábrela de nuevo en un momento.', 'This box did not load. Open it again in a moment.')}</p>}
      {subs.length > 0 && (
        <ol className="bd-list cb-bl" role="list">
          <li className="bd-row bd-cols" aria-hidden="true">
            <span>#</span><span>{L('Qué', 'What')}</span><span className="r">{L('Contratos', 'Contracts')}</span><span className="r">{L('Monto', 'Amount')}</span>
            <span className="r">{L('De cada 100 pesos', 'Per 100 pesos')}</span><span className="r">{L('Indicador · % alto o crítico', 'Indicator · % high or critical')}</span>
          </li>
          {subs.map((x, i) => (
            <li key={x.subcategory_id} className="bd-row">
              <span className="bd-age cb-rk">{i + 1}</span>
              <span className="bd-c cb-nm"><span className="bd-buyer">{subName(x)}{x.is_catch_all && <span className="bd-dim">{L(' · sin más detalle', ' · no more detail')}</span>}</span></span>
              <span className="r cb-ct">{formatNumber(x.total_contracts)}<span className="cb-ctl"> {L('contratos', 'contracts')}</span></span>
              <span className="r bd-amt">{objM(x.total_value)}</span>
              <span className="r cb-sh">{share(x.total_value)}</span>
              <span className="r cb-hr">{x.avg_risk != null && (() => { const lv = getRiskLevelFromScore(x.avg_risk); return <span className={`bd-st is-${lv}`}><span className="sr-only">{L('Indicador de riesgo promedio: ', 'Average risk indicator: ')}</span>{L(LEVEL[lv].es, LEVEL[lv].en)}</span> })()}<RiskShare v={x.high_risk_pct} lang={lang} /></span>
            </li>
          ))}
        </ol>
      )}
      <p className="bd-note">{L('«Alto o crítico»: contratos con indicador de riesgo de 0.40 o más. Es una señal, no una prueba.', '«High or critical»: contracts with a risk indicator of 0.40 or more. A signal, not proof.')}{where && <> {L(`Cifras de esta caja: ${where}.`, `Figures in this box: ${where}.`)}</>}</p>
    </section>
  )
}

type Sub = Awaited<ReturnType<typeof categoriesApi.getSubcategories>>['data'][number]
/** One subcategory, opened from its box: finding first, then its numbers and who sold it. */
function SubCard({ sub, categoryId, lang, onClose, fq }: { sub: Sub; categoryId: number; lang: Lang; onClose: () => void; fq: string }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const nm = lang === 'es' ? sub.name_es : sub.name_en || sub.name_es
  const top = (sub.vendors ?? []).slice(0, 3)
  const lead = top[0]
  const pctOf = (v: number) => (sub.total_value > 0 ? `${((100 * v) / sub.total_value).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })} %` : '—')
  const leadShare = lead && sub.total_value > 0 ? pctOf(lead.vendor_value) : null
  return (
    <section className="bd cb-sub" aria-labelledby="cb-sub-h">
      <div className="bd-head">
        <h3 id="cb-sub-h" className="bd-h">{nm}</h3>
        {leadShare != null && <p className="bd-desc"><b>{L(`La mayor empresa se llevó ${leadShare} del total.`, `The largest supplier took ${leadShare} of the total.`)}</b></p>}
        <p className="bd-when"><b>{formatDualCurrency(sub.total_value)}</b> · <b>{formatNumber(sub.total_contracts)}</b> {L('contratos', 'contracts')} · <b>{Math.round(sub.direct_award_pct ?? 0)}</b> {L('de cada 100 contratos sin concurso', 'of every 100 contracts with no tender')}{sub.high_risk_pct != null && <> · <b>{Math.round(sub.high_risk_pct)}</b> {L('de 100 contratos con indicador alto o crítico', 'per 100 contracts with a high or critical indicator')}</>}{sub.year_min && sub.year_max ? <> · {sub.year_min}–{sub.year_max}</> : null}</p>
      </div>
      <div className="bd-bar">
        <p className="bd-tabs cb-open-k">{L('Quién vendió más', 'Top suppliers')} <span className="bd-n">{top.length}</span></p>
        {sub.code && <Link className="bd-link cb-subpage" to={withSearch(subHref(categoryId, sub.code), fq)}>{L('Ver la minicategoría completa →', 'See the whole mini-category →')}</Link>}
        <button type="button" className="bd-stop" onClick={onClose}>✕ {L('Cerrar', 'Close')}</button>
      </div>
      {top.length > 0 && (
        // RED 11-07 live bug: one line per supplier (name · amount · %), names formatted, no shared board grid
        <ol className="cb-vrows" role="list">
          {top.map((v) => (
            <li key={v.vendor_id}>
              <span className="cb-vn"><EntityIdentityChip type="vendor" id={v.vendor_id} name={formatEntityName('vendor', v.vendor_name, 'full')} variant="name" size="inherit" fullName />{v.persona_fisica && <span className="bd-dim">{L(' · persona física', ' · individual')}</span>}</span>
              <span className="cc-num">{objM(v.vendor_value)}</span>
              <span className="cc-num">{pctOf(v.vendor_value)}</span>
            </li>
          ))}
        </ol>
      )}
      {fq && top.length > 0 && <p className="bd-note">{L('Estos proveedores son de todo el periodo y todos los sectores. Con el filtro: la minicategoría completa.', 'These suppliers cover every year and sector. With the filter: the whole mini-category.')}</p>}
    </section>
  )
}

/** «Lo que más se compra»: the top named concepts across all categories, each with its risk share. */
function TopBuys({ lang, onOpen, filtered }: { lang: Lang; onOpen: (categoryId: number) => void; filtered?: boolean }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const q = useQuery({ queryKey: ['categories', 'subcategories-top', 15], queryFn: () => categoriesApi.getTopSubcategories(15), staleTime: 600_000 })
  const rows = (q.data?.data ?? []).filter((r) => !HIDE_CODES.has((r as { code?: string }).code ?? '') && !/mal clasificad/i.test(r.name_es))
  const hot = [...rows].filter((r) => r.high_risk_pct != null).sort((a, b) => (b.high_risk_pct ?? 0) - (a.high_risk_pct ?? 0))[0]
  return (
    <section className="bd cb-top-buys" aria-labelledby="cb-top-h">
      <div className="bd-head">
        <h3 id="cb-top-h" className="bd-h">{L('Lo que más se compra', 'What is bought the most')}</h3>
        <p className="bd-desc">{L('Las cosas concretas con más dinero, de todas las cajas. Sin los «otros».', 'The concrete things with the most money, across all boxes. Without the «other» buckets.')}{filtered && <> {L('Todo el periodo, sin el filtro.', 'Whole period, without the filter.')}</>}{hot && <> <b>{L(`Con más riesgo: ${hot.name_es}. ${Math.round(hot.high_risk_pct!)} de cada 100 contratos con indicador alto o crítico.`, `Riskiest: ${hot.name_en || hot.name_es}. ${Math.round(hot.high_risk_pct!)} of every 100 contracts with a high or critical indicator.`)}</b></>}</p>
      </div>
      {q.isLoading && <div className="cc-hold" aria-busy="true" />}
      {q.isError && <p className="bd-note" role="alert">{L('Esta lista no cargó.', 'This list did not load.')}</p>}
      {rows.length > 0 && (
        <ol className="bd-list cb-bl cb-tl" role="list">
          <li className="bd-row bd-cols" aria-hidden="true">
            <span>#</span><span>{L('Qué', 'What')}</span><span>{L('En la caja', 'In the box')}</span><span className="r">{L('Contratos', 'Contracts')}</span><span className="r">{L('Monto', 'Amount')}</span><span className="r">{L('% alto o crítico', '% high or critical')}</span>
          </li>
          {rows.map((r, i) => (
            <li key={r.subcategory_id} className="bd-row">
              <span className="bd-age cb-rk">{i + 1}</span>
              <span className="bd-c cb-nm"><span className="bd-buyer">{lang === 'es' ? r.name_es : r.name_en || r.name_es}</span></span>
              <span className="bd-c cb-cat"><button type="button" className="cb-catbtn" onClick={() => onOpen(r.category_id)}>{lang === 'es' ? r.category_es : r.category_en || r.category_es}</button></span>
              <span className="r cb-ct">{formatNumber(r.total_contracts)}<span className="cb-ctl"> {L('contratos', 'contracts')}</span></span>
              <span className="r bd-amt">{objM(r.total_value)}</span>
              <span className="r cb-hr"><RiskShare v={r.high_risk_pct} lang={lang} /></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
