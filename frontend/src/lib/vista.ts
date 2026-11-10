/**
 * El Mapa's two views on `/` — Lista (the ledger) and Cielo (the sky).
 * Spec _polish/merge/SPEC.md § 3.
 *
 * `vista=vinculos` selects the sky (`vista=cielo`, the first spelling, stays an alias) and is
 * the default; `vista=cifras` (or a bare ledger link `?s=…`) is the ledger. In the UI the views read «Cifras | Vínculos»
 * (owner, 2026-10-08); the code keeps lista / cielo as internal names. Both engine
 * grammars stay as they are — this file only translates one into the other on a
 * switch, and stashes the view being left so returning restores it.
 *
 * Pure apart from the storage helpers at the bottom. No value import from
 * `@/lib/atlas/**`, `@/components/atlas/**` or d3 (spec § 4): this module rides
 * the shell's Header, and the sky's code must stay in its own chunk.
 */
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { SECTORS } from '@/lib/constants'

export type Vista = 'lista' | 'cielo'

/** The sky chunk. Prefetched on hover / focus of «Cielo»; App's lazy() reuses the request. */
export const loadCielo = () => import('@/pages/Atlas')
export const loadLista = () => import('@/pages/SpatialMap')

/** The ledger's own params: an old `/mapa?s=…` link without `vista` still opens Cifras. */
const LISTA_KEYS = ['s', 'i', 'v', 'c']

/** Vínculos (the sky) is El Mapa's default (owner, 2026-10-26: the centerpiece); Cifras is `vista=cifras`. */
export function vistaOf(search: string): Vista {
  const q = new URLSearchParams(search)
  const v = q.get('vista')
  if (v === 'vinculos' || v === 'cielo') return 'cielo'
  if (v === 'cifras' || v === 'lista') return 'lista'
  return LISTA_KEYS.some((k) => q.has(k)) ? 'lista' : 'cielo'
}

/** The URL value of the ledger view. */
export const LISTA_PARAM = 'cifras'


/** The URL value of the sky view. */
export const CIELO_PARAM = 'vinculos'

/** `/mapa?vista=vinculos&…` — the sky's address for inbound links and redirects (params kept). */
export function cieloHref(params: string | Record<string, string | number | null | undefined> = ''): string {
  const src = typeof params === 'string'
    ? new URLSearchParams(params)
    : new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v == null ? [] : [[k, String(v)]])))
  const q = new URLSearchParams([['vista', CIELO_PARAM]])
  for (const [k, v] of src) if (k !== 'vista') q.append(k, v)
  return `/mapa?${q}`
}

/** The manifest fields the Cielo → Lista translation reads (the sky's query cache). */
export type ManifestLite = Pick<SkyManifest, 'inst_map'> & { stars: Pick<SkyManifest['stars'], 'id' | 'sector'> }

/** Lista's persisted pin path (rubli_explore_pin_v1), reduced to its ids. */
export interface ListaPin { i?: number; v?: number }

/** Must equal url-state.ts PINS_KEY (vista.test holds them together). */
export const ATLAS_PINS_KEY = 'rubli_atlas_pins_v1'
const MAX_PINS = 12

const ID = /^\d{1,10}$/
const num = (v: string | null) => (v && ID.test(v) ? Number(v) : undefined)
const sectorById = (id: number | undefined) => SECTORS.find((s) => s.id === id)
const sectorByCode = (code: string | null) => SECTORS.find((s) => s.code === code)

/** Lista `s i v c` → Cielo `star planet moon` (a sector alone → the legacy shim's sector disc). */
export function listaToCielo(search: string): URLSearchParams {
  const q = new URLSearchParams(search)
  const out = new URLSearchParams()
  const i = num(q.get('i')), v = num(q.get('v')), c = num(q.get('c'))
  if (i != null) out.set('star', String(i))
  if (v != null && i != null) {
    out.set('planet', String(v))
    if (c != null) out.set('moon', String(c))
  }
  if (i == null) {
    const s = sectorByCode(q.get('s'))
    if (s) { out.set('lens', 'sectors'); out.set('pin', String(s.id)) }
  }
  return out
}

/** Cielo `star planet moon` → Lista `s i v c`; the star's sector comes from the manifest. */
export function cieloToLista(search: string, manifest: ManifestLite | null | undefined): URLSearchParams {
  const q = new URLSearchParams(search)
  const out = new URLSearchParams()
  const star = num(q.get('star'))
  if (star != null) {
    if (!manifest) return out
    const k = manifest.inst_map.raw.indexOf(star)
    const canon = k >= 0 ? manifest.inst_map.canon[k] : star
    const idx = manifest.stars.id.indexOf(canon)
    const s = idx >= 0 ? sectorById(manifest.stars.sector[idx]) : undefined
    if (!s) return out
    out.set('s', s.code)
    out.set('i', String(star))
    const p = num(q.get('planet')), m = num(q.get('moon'))
    if (p != null) {
      out.set('v', String(p))
      if (m != null) out.set('c', String(m))
    }
    return out
  }
  // A sector disc never writes its own param: it rides the trail's last token (or the legacy shim).
  const last = (q.get('trail') ?? '').split('~').pop() ?? ''
  const g = /^g(\d{1,2})$/.exec(last)?.[1] ?? (q.get('lens') === 'sectors' ? q.get('pin') : null)
  const s = sectorById(num(g))
  if (s) out.set('s', s.code)
  return out
}

/** What a view is looking at — two searches with the same key show the same thing. */
export function selectionKey(vista: Vista, search: string): string {
  const q = new URLSearchParams(search)
  const keys = vista === 'cielo' ? ['star', 'planet', 'moon'] : ['s', 'i', 'v', 'c']
  const sel = keys.map((k) => q.get(k) ?? '').join('|')
  return vista === 'cielo' && !q.get('star') ? `${sel}|${q.get('lens') === 'sectors' ? q.get('pin') ?? '' : ''}` : sel
}

export interface Stash { lista?: string; cielo?: string }

export interface SwitchCtx {
  manifest?: ManifestLite | null
  listaPin?: ListaPin | null
  /** The sky's session pin mirror (wins over the URL when it seeds a mount). */
  sessionPins?: string | null
}

export interface SwitchResult {
  /** The new query, `?vista=vinculos&…` or the Lista query (no `vista`). */
  search: string
  stash: Stash
  /** Pins to mirror into ATLAS_PINS_KEY so the sky's seed carries the Lista pin; null = leave it. */
  pins: string | null
}

const strip = (search: string) => {
  const q = new URLSearchParams(search)
  q.delete('vista')
  return q.toString()
}

const pinToken = (p: ListaPin | null | undefined) =>
  p?.i != null ? (p.v != null ? `s${p.i}.p${p.v}` : `s${p.i}`) : null

/**
 * Switch from the view in `current` to `to`. The view being left is stashed whole;
 * the stashed target is restored whole when it shows the same selection as the
 * translation, otherwise it lends its period / year / pins (Cielo) or lens (Lista)
 * to the translated position.
 */
export function switchVista(to: Vista, current: string, stash: Stash, ctx: SwitchCtx = {}): SwitchResult {
  const from = vistaOf(current)
  const here = strip(current)
  const next: Stash = { ...stash, [from]: here }
  if (from === to) return { search: current, stash: next, pins: null }

  const translated = to === 'cielo' ? listaToCielo(here) : cieloToLista(here, ctx.manifest)
  const prev = stash[to]
  const restore = prev != null && selectionKey(to, prev) === selectionKey(to, translated.toString())
  const out = restore ? new URLSearchParams(prev) : translated
  if (!restore && prev) {
    const p = new URLSearchParams(prev)
    for (const k of to === 'cielo' ? ['period', 'yr', 'pins'] : ['lens']) {
      const v = p.get(k)
      if (v) out.set(k, v)
    }
  }

  if (to === 'lista') {
    return { search: `?${new URLSearchParams([['vista', LISTA_PARAM], ...out])}`, stash: next, pins: null }
  }

  let pins: string | null = null
  const tail = pinToken(ctx.listaPin)
  if (tail) {
    const base = (ctx.sessionPins ?? out.get('pins') ?? '').split('~').filter(Boolean)
    const merged = base.includes(tail) ? base : [...base, tail].slice(0, MAX_PINS)
    pins = merged.join('~')
    out.set('pins', pins)
  }
  return { search: cieloHref(out.toString()).slice('/mapa'.length), stash: next, pins }
}

// ── storage (sessionStorage; never throws) ──────────────────────────────────
const STASH_KEY = 'rubli_vista_last_v1'

export function readStash(): Stash {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STASH_KEY) ?? '{}')
    return v && typeof v === 'object' ? {
      lista: typeof v.lista === 'string' ? v.lista : undefined,
      cielo: typeof v.cielo === 'string' ? v.cielo : undefined,
    } : {}
  } catch { return {} }
}

export function writeStash(s: Stash) {
  try { window.sessionStorage.setItem(STASH_KEY, JSON.stringify(s)) } catch { /* storage blocked */ }
}

export function readSessionPins(): string | null {
  try { return window.sessionStorage.getItem(ATLAS_PINS_KEY) } catch { return null }
}

export function writeSessionPins(p: string) {
  try { window.sessionStorage.setItem(ATLAS_PINS_KEY, p) } catch { /* storage blocked */ }
}

/** Lista's pin (rubli_explore_pin_v1: a Focus[] path) reduced to its institution / vendor ids. */
export function readListaPin(): ListaPin | null {
  try {
    const path = JSON.parse(window.localStorage.getItem('rubli_explore_pin_v1') ?? 'null')
    if (!Array.isArray(path)) return null
    const pin: ListaPin = {}
    for (const f of path) {
      if (f?.kind === 'institution' && typeof f.institutionId === 'number') pin.i = f.institutionId
      if (f?.kind === 'vendor' && typeof f.vendorId === 'number') pin.v = f.vendorId
    }
    return pin.i != null ? pin : null
  } catch { return null }
}
