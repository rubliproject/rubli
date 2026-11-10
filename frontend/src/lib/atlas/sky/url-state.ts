/**
 * «El Atlas» URL codec — spec .claude/designs/atlas-2026-10-02-spec.md §3.10
 * (graft G4b from «La Bitácora de Vuelo»: URL grammar with a layout version).
 *
 *   /atlas?cam=x,y,k&lv={layout_version}&star=&planet=&moon=&trail=s1205.p48~s1413&period=amlo&vuelo=
 *
 * The URL is the one source of truth for position: every history entry carries
 * its own trail, so Back, Forward and reload all re-read the same grammar.
 * Strict regex parse; an unknown or malformed token is dropped; no free text.
 *
 * Legacy shim (pre-sky links): scope=proveedor&vendor=N → planet=N ·
 * scope=cohorte&code=Px / lens=patterns&pin=Px → field + «los patrones viven en /aria» ·
 * lens=sectors&pin=N → sector disc N · lens=categories&pin= → field + chip to /categories ·
 * story= → vuelo= · S2's at=s:N / at=v:N → star / planet.
 *
 * Instruments (spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §5, F11):
 *   &tab=brief|dial|diff.{A}.{B}|cat.(system|sector|kin).(money|share)|trama[.N] (merge § 5) · &yr=2000–2025 (reserved, S2)
 *   &cmp=s{id}-{period}~s{id}-{period} (same star; reserved, S3) · &pins=s251~s311.p48 (≤ 12, s/p/m only)
 * Pins are page state: every writer mirrors them, popstate never re-reads them (liveQuery / popLive).
 */
import { ADMIN_DISPLAY_ACCENTED, ADMIN_ORDER } from '@/lib/administrations'
export interface SkyCam { x: number; y: number; k: number }

/** One position: sector disc, star (canonical institution id), planet (vendor id), moon (contract id). */
export interface SkyPos { g?: number; s?: number; p?: number; m?: number }

/** Backend ADMINISTRATION_KEYS verbatim (backend/api/administrations.py) — the URL never says «epn». */
export const PERIOD_KEYS = ['fox', 'calderon', 'pena_nieto', 'amlo', 'sheinbaum'] as const
export type PeriodKey = (typeof PERIOD_KEYS)[number]

export interface SkyUrlState {
  cam: SkyCam | null
  lv: string | null
  pos: SkyPos
  trail: SkyPos[]
  period: PeriodKey | null
  vuelo: string | null
  /** flight chapter (0-based; = chapters.length is the end card) — only with `vuelo` */
  n: number
  /** a legacy link landed on the field: patterns live in /aria, categories in /categories */
  notice: 'patterns' | 'categories' | null
  code: string | null
  /** §5: the dock tab, the year (S2), the twin plate (S3), the pins */
  tab: string | null
  yr: number | null
  cmp: string | null
  pins: SkyPos[]
  /** sky-dive L4: the framed sector's lens — stars re-laid by risk or by first year (money = the chart itself) */
  lente: SkyLens | null
}

const CAM_RE = /^(-?\d{1,5}(?:\.\d{1,3})?),(-?\d{1,5}(?:\.\d{1,3})?),(\d{1,5}(?:\.\d{1,6})?)$/
const LV_RE = /^\d{8}T\d{6}Z$/
const ID_RE = /^\d{1,10}$/
const PART_RE = /^([gspm])(\d{1,10})$/
const SLUG_RE = /^[a-z0-9_-]{1,64}$/
const PATTERN_RE = /^P[1-7]$/
const MAX_TRAIL = 24
export const MAX_PINS = 12
const PER = PERIOD_KEYS.join('|')
const TAB_RE = new RegExp(String.raw`^(brief|dial|diff\.(${PER})\.(${PER})|cat\.(system|sector|kin)\.(money|share)|trama(\.\d{1,6})?)$`)
const YR_RE = /^20(0\d|1\d|2[0-5])$/
const CMP_RE = new RegExp(String.raw`^s(\d{1,10})-(${PER})~s(\d{1,10})-(${PER})$`)

export const SKY_LENSES = ['riesgo', 'tiempo', 'captura', 'senales', 'apagon', 'calificacion'] as const
export type SkyLens = (typeof SKY_LENSES)[number]

const id = (v: string | null): number | undefined => (v && ID_RE.test(v) ? Number(v) : undefined)

/** `s1205.p48.m77` · `p48` · `g3` · `h` (the field). */
export function posToken(p: SkyPos): string {
  if (p.s == null && p.p == null) return p.g != null ? `g${p.g}` : 'h'
  return [p.s != null ? `s${p.s}` : '', p.p != null ? `p${p.p}` : '', p.p != null && p.m != null ? `m${p.m}` : '']
    .filter(Boolean).join('.')
}

export function parseToken(t: string): SkyPos | null {
  if (t === 'h') return {}
  const p: SkyPos = {}
  let last = 0
  for (const part of t.split('.')) {
    const m = PART_RE.exec(part)
    if (!m) return null
    const k = m[1] as 'g' | 's' | 'p' | 'm'
    const order = { g: 9, s: 1, p: 2, m: 3 }[k]
    if (order <= last || (k === 'g' && t.includes('.'))) return null
    last = order
    p[k] = Number(m[2])
  }
  return p.m != null && p.p == null ? null : p
}

export function parseSkyQuery(search: string): SkyUrlState {
  const q = new URLSearchParams(search)
  const c = CAM_RE.exec(q.get('cam') ?? '')
  const lv = q.get('lv')
  const st: SkyUrlState = {
    cam: c ? { x: Number(c[1]), y: Number(c[2]), k: Number(c[3]) } : null,
    lv: lv && LV_RE.test(lv) ? lv : null,
    pos: {},
    trail: [],
    period: null,
    vuelo: null,
    n: 0,
    notice: null,
    code: null,
    tab: null,
    yr: null,
    cmp: null,
    pins: parsePins(q.get('pins')),
    lente: null,
  }
  const lente = q.get('lente')
  if (lente && (SKY_LENSES as readonly string[]).includes(lente)) st.lente = lente as SkyLens
  const tab = q.get('tab'), yr = q.get('yr') ?? q.get('year'), cmp = q.get('cmp') // `year` = the pre-sky Observatory's param
  if (tab && TAB_RE.test(tab)) st.tab = tab
  if (yr && YR_RE.test(yr)) st.yr = Number(yr)
  // same star at launch; two-star and two-planet forms are reserved and parse to null
  const cm = cmp ? CMP_RE.exec(cmp) : null
  if (cm && cm[1] === cm[3]) st.cmp = cmp
  const s = id(q.get('star')), p = id(q.get('planet')), m = id(q.get('moon'))
  if (s != null) st.pos.s = s
  if (p != null) { st.pos.p = p; if (m != null) st.pos.m = m }
  for (const t of (q.get('trail') ?? '').split('~').slice(0, MAX_TRAIL)) {
    const pos = parseToken(t)
    if (pos) st.trail.push(pos)
  }
  const per = q.get('period')
  if (per && (PERIOD_KEYS as readonly string[]).includes(per)) st.period = per as PeriodKey
  const vuelo = q.get('vuelo') ?? q.get('story')
  if (vuelo && SLUG_RE.test(vuelo)) {
    st.vuelo = vuelo
    const n = q.get('n')
    if (n && /^\d{1,2}$/.test(n)) st.n = Number(n)
  }

  // ── legacy shim ────────────────────────────────────────────────────────
  const scope = q.get('scope'), lens = q.get('lens'), pin = q.get('pin')
  if (scope === 'proveedor' && st.pos.p == null) {
    const v = id(q.get('vendor'))
    if (v != null) st.pos = { p: v }
  } else if ((scope === 'cohorte' && PATTERN_RE.test(q.get('code') ?? '')) || (lens === 'patterns' && PATTERN_RE.test(pin ?? ''))) {
    st.notice = 'patterns'
    st.code = scope === 'cohorte' ? q.get('code') : pin
  } else if (lens === 'sectors' && id(pin) != null && Number(pin) >= 1 && Number(pin) <= 12) {
    st.pos = { g: Number(pin) }
  } else if (lens === 'categories') {
    st.notice = 'categories'
  }
  const at = /^([sv]):(\d{1,10})$/.exec(q.get('at') ?? '')
  if (at && st.pos.s == null && st.pos.p == null) st.pos = at[1] === 's' ? { s: Number(at[2]) } : { p: Number(at[2]) }
  return st
}

/** `pins=`: posToken of kind s / p / m only (no `h`, no `g*`), the 13th and later dropped. */
export function parsePins(v: string | null | undefined): SkyPos[] {
  const out: SkyPos[] = []
  for (const t of (v ?? '').split('~')) {
    const p = t ? parseToken(t) : null
    if (p && (p.s != null || p.p != null) && out.length < MAX_PINS) out.push(p)
  }
  return out
}

export interface SkyExtra { tab?: string | null; yr?: number | null; cmp?: string | null; pins?: SkyPos[]; lente?: SkyLens | null }

/** The whole query, rebuilt from state — legacy and unknown params never survive a write. */
export function skyQuery(st: { cam: SkyCam | null; lv: string | null; pos: SkyPos; trail: SkyPos[]; period: PeriodKey | null; vuelo: string | null; n?: number } & SkyExtra): string {
  const q = new URLSearchParams()
  if (st.cam) q.set('cam', `${st.cam.x.toFixed(1)},${st.cam.y.toFixed(1)},${+st.cam.k.toPrecision(5)}`)
  if (st.lv) q.set('lv', st.lv)
  if (st.pos.s != null) q.set('star', String(st.pos.s))
  if (st.pos.p != null) q.set('planet', String(st.pos.p))
  if (st.pos.p != null && st.pos.m != null) q.set('moon', String(st.pos.m))
  if (st.trail.length) q.set('trail', st.trail.slice(-MAX_TRAIL).map(posToken).join('~'))
  if (st.period) q.set('period', st.period)
  if (st.vuelo) { q.set('vuelo', st.vuelo); if (st.n) q.set('n', String(st.n)) }
  if (st.tab) q.set('tab', st.tab)
  if (st.yr != null) q.set('yr', String(st.yr))
  if (st.cmp) q.set('cmp', st.cmp)
  if (st.pins?.length) q.set('pins', st.pins.slice(0, MAX_PINS).map(posToken).join('~'))
  if (st.lente) q.set('lente', st.lente)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** The page's live state that every URL write carries (F11). */
export interface SkyLive extends Required<SkyExtra> { trail: SkyPos[]; period: PeriodKey | null }

/** The pure builder behind every desktop writer (`end` replace, hops, Back, period): a pan keeps tab / yr / cmp / pins. */
export function liveQuery(live: SkyLive, at: { cam: SkyCam | null; lv: string | null; pos: SkyPos; search: string; trail?: SkyPos[] }): string {
  const cur = parseSkyQuery(at.search)
  return skyQuery({ ...live, cam: at.cam, lv: at.lv, pos: at.pos, trail: at.trail ?? live.trail, vuelo: cur.vuelo, n: cur.n })
}

/** popstate: trail / period / tab / yr / cmp come from the entry; pins never do (page state wins). */
export function popLive<T extends SkyLive>(live: T, st: SkyUrlState): T {
  return { ...live, trail: st.trail, period: st.period, tab: st.tab, yr: st.yr, cmp: st.cmp, lente: st.lente }
}

// ── pins: a sessionStorage mirror seeds a reload (after Back the URL may hold fewer pins) ──
export const PINS_KEY = 'rubli_atlas_pins_v1'
export function seedPins(fromUrl: SkyPos[]): SkyPos[] {
  try {
    const s = window.sessionStorage.getItem(PINS_KEY)
    if (s) return parsePins(s)
  } catch { /* storage blocked: the URL seeds */ }
  return fromUrl
}
export function mirrorPins(pins: SkyPos[]) {
  try { window.sessionStorage.setItem(PINS_KEY, pins.map(posToken).join('~')) } catch { /* ignore */ }
}

// ── the URL as a store: the one writer of flight position (§3.11, graft G5) ──
// Reads go through useSyncExternalStore; writes go through `writeSearch`, which
// notifies subscribers. Back / Forward notify through `popstate`.
const URL_EVENT = 'atlas:url'
export function subscribeUrl(cb: () => void) {
  window.addEventListener('popstate', cb)
  window.addEventListener(URL_EVENT, cb)
  return () => { window.removeEventListener('popstate', cb); window.removeEventListener(URL_EVENT, cb) }
}
export const urlSearch = () => window.location.search
const depthOf = () => (window.history.state?.atlasDepth as number | undefined) ?? 0
/**
 * The sky lives on `/` behind `vista=cielo` (merge spec § 3): every sky URL write keeps
 * the current `vista`, or the next reload would land in Lista. `skyQuery` stays pure.
 */
export function withVista(qs: string): string {
  const vista = new URLSearchParams(window.location.search).get('vista')
  const q = new URLSearchParams(qs)
  if (!vista || q.get('vista') === vista) return qs
  q.delete('vista')
  return `?${new URLSearchParams([['vista', vista], ...q])}`
}
/** Write a whole query (from skyQuery), push (a hop: depth + 1) or replace, and notify. */
export function navigateQuery(qs: string, push: boolean) {
  const url = `${window.location.pathname}${withVista(qs)}`
  if (push) window.history.pushState({ ...(window.history.state ?? {}), atlasDepth: depthOf() + 1 }, '', url)
  else window.history.replaceState(window.history.state, '', url)
  window.dispatchEvent(new Event(URL_EVENT))
}
/** Hops of ours behind this entry (Back retraces them; a shared link has none). */
export const historyDepth = depthOf
/** Rewrite some params of the current URL (null deletes), push or replace, and notify. */
export function writeSearch(set: Record<string, string | null>, push = false) {
  const q = new URLSearchParams(window.location.search)
  for (const [k, v] of Object.entries(set)) { if (v == null) q.delete(k); else q.set(k, v) }
  const s = q.toString()
  navigateQuery(s ? `?${s}` : '', push)
}

/** Merge § 5: `tab=trama` (the ledger) or `tab=trama.N` (community N) → { comm }; anything else → null. */
export function tramaOf(tab: string | null | undefined): { comm: number | null } | null {
  const m = /^trama(?:\.(\d{1,6}))?$/.exec(tab ?? '')
  return m ? { comm: m[1] ? Number(m[1]) : null } : null
}

/** Display name for a URL period key (pena_nieto → «Peña Nieto»). */
export const periodName = (p: PeriodKey) => ADMIN_DISPLAY_ACCENTED[ADMIN_ORDER[PERIOD_KEYS.indexOf(p)]]
