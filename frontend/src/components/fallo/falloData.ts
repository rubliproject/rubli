/**
 * «Empezó antes del fallo» — payload of GET /analysis/antes-del-fallo, typed rows,
 * bands, groups and the bilingual formats shared by the plate, the dock and the Lista.
 * Days are whole Mexico City calendar days relative to the fallo (0; negative = before).
 */
import { api } from '@/api/client'
import { RAMP_AMOUNT, SECTORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

export type Lang = 'es' | 'en'

export interface FalloInst { k: string; sig: string | null; name: string; n: number; v: number; pop: number; iid: number | null; sid: number; pop_proc: number; early_proc: number }
export interface FalloMeta {
  pop_n: number; pop_v: number; n: number; v: number; pop_proc: number; early_proc: number; unnamed_n: number; pf_n?: number; lp_n: number; prepub_n: number; prepub_v: number
  fort_n: number; jan1_n: number; nofirma_n: number; flag_n: number; signed_before_fallo: number
  med: { pub: number | null; ape: number | null; fir: number | null; ini: number | null }
  recon: { n: number; v: number; top: [string, number] | null }
  ad_lag: { sig: string; name: string; v: string; vid: number | null; pf?: boolean; iid: number | null; amt: number; lag: number; code: string; flag: boolean }[]
}
export interface FalloResp { available: boolean; meta: FalloMeta; inst: FalloInst[]; dist: [number, number][]; cols: string[]; rows: unknown[][] }

export interface Row {
  j: number; code: string; proc: string; i: number; v: string; vid: number | null; pf?: boolean; t: string; lp: boolean
  amt: number; flag: boolean; fort: boolean; pub: number | null; ape: number | null; ini: number
  fir: number | null; fin: number | null; fallo: string; jan1: boolean; cid: number | null
  /** group (column) and day band */
  g: number; b: number
}
export interface Group { g: number; key: string; sig: string; name: string; n: number; v: number; pop: number; iid: number | null; color: string; sectorCode: string; other: boolean; count: number }

export const fetchFallo = () => api.get<FalloResp>('/analysis/antes-del-fallo', { timeout: 180_000 }).then((r) => r.data)

/** Day bands: «1 día antes» … «31 días o más». */
export const BANDS: ReadonlyArray<{ a: number; z: number; es: string; en: string; short: string }> = [
  { a: 1, z: 1, es: '1 día antes', en: '1 day early', short: '1 d' },
  { a: 2, z: 3, es: '2 a 3 días', en: '2 to 3 days', short: '2–3 d' },
  { a: 4, z: 7, es: '4 a 7 días', en: '4 to 7 days', short: '4–7 d' },
  { a: 8, z: 14, es: '8 a 14 días', en: '8 to 14 days', short: '8–14 d' },
  { a: 15, z: 30, es: '15 a 30 días', en: '15 to 30 days', short: '15–30 d' },
  { a: 31, z: Infinity, es: '31 días o más', en: '31 days or more', short: '31+ d' },
]
export const bandOf = (ini: number) => BANDS.findIndex((b) => -ini >= b.a && -ini <= b.z)

/** Amount tone (MDP), sequential and never red: red is reserved for the flag itself. */
export const TONE_STEPS: ReadonlyArray<[number, string]> = [[0, '< 0.3'], [0.3, '0.3–3'], [3, '3–30'], [30, '30–300'], [300, '≥ 300']]
export const toneOf = (mdp: number) => RAMP_AMOUNT[mdp >= 300 ? 4 : mdp >= 30 ? 3 : mdp >= 3 ? 2 : mdp >= 0.3 ? 1 : 0]
/** Ink or paper text on a tone. */
export const inkOn = (mdp: number) => (mdp >= 30 ? 'paper' : 'ink')

export const NTOP = 7

export function shape(d: FalloResp, lang: Lang): { rows: Row[]; groups: Group[] } {
  const idx = Object.fromEntries(d.cols.map((c, i) => [c, i]))
  const rows: Row[] = d.rows.map((a, j) => {
    const o = { j } as Record<string, unknown>
    for (const c of d.cols) o[c] = a[idx[c]]
    const r = o as unknown as Row
    r.g = Math.min(r.i, NTOP)
    r.b = bandOf(r.ini)
    return r
  })
  const sec = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[11]
  const groups: Group[] = d.inst.slice(0, NTOP).map((x, g) => ({
    g, key: x.sig ?? x.k, sig: x.sig ?? x.k, name: formatEntityName('institution', x.name, 'full'), n: x.n, v: x.v, pop: x.pop,
    iid: x.iid, color: sec(x.sid).color, sectorCode: sec(x.sid).code, other: false, count: 1,
  }))
  const rest = d.inst.slice(NTOP)
  if (rest.length) {
    groups.push({
      g: NTOP, key: 'otras', sig: lang === 'en' ? 'Others' : 'Otras',
      name: lang === 'en' ? `${rest.length} other institutions` : `Otras ${rest.length} instituciones`,
      n: rest.reduce((s, x) => s + x.n, 0), v: rest.reduce((s, x) => s + x.v, 0), pop: rest.reduce((s, x) => s + x.pop, 0),
      iid: null, color: SECTORS[11].color, sectorCode: 'otros', other: true, count: rest.length,
    })
  }
  return { rows, groups }
}

// ── formats ───────────────────────────────────────────────────────────────────
export const mdp = (v: number) => formatCompactMXN(v * 1e6)
export const nf = (n: number) => formatNumber(Math.round(n))
const MES = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
export const dateAt = (r: Row, off: number | null) => (off == null ? null : new Date(Date.parse(r.fallo + 'T12:00:00Z') + off * 864e5))
export const fdate = (dt: Date | null, lang: Lang) => (dt ? `${dt.getUTCDate()} ${MES[lang][dt.getUTCMonth()]} ${dt.getUTCFullYear()}` : '—')
export const isoAt = (r: Row, off: number | null) => dateAt(r, off)?.toISOString().slice(0, 10) ?? ''
export const days = (n: number, lang: Lang) => (n === 1 ? (lang === 'en' ? '1 day' : '1 día') : `${nf(n)} ${lang === 'en' ? 'days' : 'días'}`)
export const offTxt = (o: number | null, lang: Lang) => (o == null ? '' : o === 0 ? (lang === 'en' ? 'day 0' : 'día 0') : `${o > 0 ? '+' : '−'}${nf(Math.abs(o))} d`)
export const prepub = (r: Row) => r.pub != null && r.ini < r.pub
export const vendorName = (r: Row) => (r.v ? formatEntityName('vendor', r.v, 'full') : '—')
export const DATES: ReadonlyArray<[keyof Row | 'fallo0', string, string]> = [
  ['pub', 'Publicación', 'Publication'], ['ape', 'Apertura', 'Bid opening'], ['fallo0', 'Fallo', 'Award'], ['fir', 'Firma', 'Signature'], ['ini', 'Inicio', 'Start'],
]
export const offOf = (r: Row, k: keyof Row | 'fallo0'): number | null => (k === 'fallo0' ? 0 : (r[k as keyof Row] as number | null))
