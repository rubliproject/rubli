/**
 * «A destiempo» (/antes-del-fallo + /mismo-dia) and «El arranque» (/arranque) — the findings, computed from the
 * row-level payloads. Port of the reviewed concepts `_explore/analisis_trio_concepts_2026-10-28/` (README rounds 1–3,
 * REVIEW_3/4 = SHIP): every number the pages print is computed here; nothing is typed.
 * Payloads: GET /analysis/antes-del-fallo (ComprasMX 2025–26), GET /newtabs/mismo-dia, GET /newtabs/arranque
 * (CompraNet; the endpoint drops public bodies and ships no id for personas físicas / unnamed vendors).
 */
import type { FalloInst, FalloResp } from '@/components/fallo/falloData'

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Deterministic jitter in [0, 1) — the same dot sits in the same place on every render. */
export function hash(i: number): number {
  let h = ((i + 1) * 2654435761) % 4294967296
  h ^= h >>> 13
  h = (h * 1274126177) % 4294967296
  return (h >>> 0) / 4294967296
}

/** Categorical slots (DESIGN.md §6.3 tokens; dataviz-validated order) and the two reserved inks. */
export const CAT = ['var(--color-cat-blue)', 'var(--color-cat-teal)', 'var(--color-cat-brown)', 'var(--color-cat-violet)'] as const
export const OTHER = 'var(--color-cat-slate)'
export const SEAL = 'var(--color-accent)'

// ═══════════════════ A · Empezó antes del fallo ═══════════════════
export interface FRow { i: number; ini: number; ape: number | null; pub: number | null; amt: number; vid: number | null; v: string; pf: boolean; code: string; cid: number | null; fallo: string; lp: boolean; jan1: boolean; t: string; proc: string }
export interface FalloRowDef { k: string; label: string; iid: number | null; n: number; pop: number; v: number; color: string; rows: FRow[] }

export const isPreApe = (r: FRow) => r.ape != null && r.ini < r.ape

export function falloModel(d: FalloResp) {
  const ix = Object.fromEntries(d.cols.map((c, i) => [c, i]))
  const R: FRow[] = d.rows.map((a) => ({
    i: a[ix.i] as number, ini: a[ix.ini] as number, ape: a[ix.ape] as number | null, pub: a[ix.pub] as number | null, amt: a[ix.amt] as number,
    vid: a[ix.vid] as number | null, v: (a[ix.v] as string) || '', pf: !!a[ix.pf], code: a[ix.code] as string, cid: a[ix.cid] as number | null, fallo: a[ix.fallo] as string,
    lp: !!a[ix.lp], jan1: !!a[ix.jan1], t: (a[ix.t] as string) || '', proc: a[ix.proc] as string,
  }))
  const I = d.inst, m = d.meta, n = R.length, v = sum(R.map((r) => r.amt))
  const preApe = R.filter(isPreApe), prePub = R.filter((r) => r.pub != null && r.ini < r.pub)
  const lead = I[0]
  const iss = I.find((x) => x.k === 'ISSSTE')
  const issR = R.filter((r) => I[r.i].k === 'ISSSTE'), issJan = issR.filter((r) => r.jan1)
  const issJanFallos = [...new Set(issJan.map((r) => r.fallo))]
  const within7 = R.filter((r) => r.ini >= -7).length
  const medDays = -(median(R.map((r) => r.ini)) ?? 0)
  const tally = <K extends string>(rows: FRow[], key: (r: FRow) => K, w: (r: FRow) => number = () => 1) =>
    Object.entries(rows.reduce<Record<string, number>>((a, r) => ((a[key(r)] = (a[key(r)] ?? 0) + w(r)), a), {})).sort((a, b) => b[1] - a[1])
  const leadDates = tally(R.filter((r) => r.i === 0), (r) => r.fallo).slice(0, 3)
  const issTop = tally(issR.filter((r) => r.v), (r) => r.v, (r) => r.amt).slice(0, 4)
  const procs = new Set(R.map((r) => r.proc)).size
  const rate = (x: FalloInst) => x.early_proc / Math.max(1, x.pop_proc)
  const F = {
    n, v, pop: m.pop_n, procs, pop_proc: m.pop_proc, proc_rate: procs / m.pop_proc,
    lead_k: lead.k, lead_n: lead.n, lead_pop: lead.pop, lead_rate: lead.n / lead.pop, lead_proc: lead.early_proc, lead_pop_proc: lead.pop_proc,
    lead_proc_rate: rate(lead), lead_share: lead.n / n,
    rest_proc_rate: (procs - lead.early_proc) / Math.max(1, m.pop_proc - lead.pop_proc),
    /** the lead's tender rate is the highest of every institution with ≥ 100 tenders */
    lead_tops: I.filter((x) => x !== lead && x.pop_proc >= 100).every((x) => rate(x) < rate(lead)),
    iss_v: iss?.v ?? 0, iss_n: iss?.n ?? 0, iss_share: (iss?.v ?? 0) / v, iss_jan: issJan.length, iss_jan_v: sum(issJan.map((r) => r.amt)),
    iss_jan_fallo: issJanFallos.length === 1 ? issJanFallos[0] : null, iss_jan_days: issJan.length ? -issJan[0].ini : 0,
    pre_ape: preApe.length, pre_ape_v: sum(preApe.map((r) => r.amt)), pre_pub: prePub.length,
    within7, medDays, leadDates, issTop, linked: R.filter((r) => r.vid).length,
  }
  const top = I.slice(0, 7), rest = I.slice(7)
  const rowDefs: FalloRowDef[] = top.map((x, j) => ({ k: x.k, label: x.sig || x.name, iid: x.iid, n: x.n, pop: x.pop, v: x.v, color: j < 4 ? CAT[j] : OTHER, rows: R.filter((r) => r.i === j) }))
  if (rest.length) rowDefs.push({ k: 'otras', label: '', iid: null, n: sum(rest.map((x) => x.n)), pop: sum(rest.map((x) => x.pop)), v: sum(rest.map((x) => x.v)), color: OTHER, rows: R.filter((r) => r.i >= 7) })
  return { R, F, rowDefs, meta: m, restCount: rest.length }
}
export type FalloModel = ReturnType<typeof falloModel>

// ═══════════════════ C · El mismo día ═══════════════════
export interface Lot {
  institution_id: number; institution_name: string; siglas: string | null; vendor_id: number | null; vendor_name: string | null; is_pf: boolean; persona_fisica?: boolean; is_soe?: boolean
  contract_date: string; year: number; cls: string; n: number; sum_mxn: number; max_mxn: number; low_cap_mxn: number; high_cap_mxn: number; contract_ids: number[]
}
export interface MdMeta {
  n: number; contracts: number; vendors: number; institutions: number; years: number[]; by_year: Record<string, number>
  placebo_lots_by_m: Record<string, number>; n_pf_lots: number; apf_buyers?: number; lead_above_cap?: number[]; built_at?: string
}
export interface MismoResp { available: boolean; meta: MdMeta; total: number; rows: Lot[] }
export interface VendorAgg { key: string; vid: number | null; v: string | null; pf: boolean; soe: boolean; lots: number; pieces: number; s: number; near: number; yrs: number[]; rows: Lot[] }
export interface MismoRowDef { k: string; label: string; ids: number[]; iid: number | null; color: string; rows: Lot[] }

export const ratio = (r: Lot) => r.max_mxn / r.low_cap_mxn
export const nearCap = (r: Lot) => ratio(r) >= 0.98
/** The case Focos Rojos already follows (ARIA queue, /aria/caso/2873) and the buyer it is read against. */
export const MAYPO = { vid: 2873, iid: 251 } as const

/** Lots → one row per vendor. A persona física is its own row, named and flagged (owner 2026-10-29, transparency). */
export function byVendor(rows: Lot[]): VendorAgg[] {
  const m = new Map<string, VendorAgg>()
  rows.forEach((r, i) => {
    const key = r.vendor_id == null ? `nn${i}` : String(r.vendor_id)
    let a = m.get(key)
    if (!a) m.set(key, (a = { key, vid: r.vendor_id, v: r.vendor_name, pf: r.is_pf, soe: !!r.is_soe, lots: 0, pieces: 0, s: 0, near: 0, yrs: [], rows: [] }))
    a.lots++; a.pieces += r.n; a.s += r.sum_mxn; a.near += nearCap(r) ? 1 : 0; a.rows.push(r)
    if (!a.yrs.includes(r.year)) a.yrs.push(r.year)
  })
  return [...m.values()].map((a) => ({ ...a, yrs: a.yrs.sort((x, y) => x - y) })).sort((a, b) => b.lots - a.lots)
}

/** The four buyers with most lots get a row each (short labels: the ruler's gutter is 196 px); the rest share one. */
const GROUPS: ReadonlyArray<{ k: string; ids: number[]; iid: number; label: string }> = [
  { k: 'diconsa', ids: [1327, 3785], iid: 3785, label: 'Diconsa · Alim. Bienestar' }, { k: 'imss', ids: [251], iid: 251, label: 'IMSS' },
  { k: 'incmnsz', ids: [260], iid: 260, label: 'INCMNSZ' }, { k: 'conaliteg', ids: [1665], iid: 1665, label: 'CONALITEG' },
]

export function mismoModel(d: MismoResp) {
  const R = d.rows, meta = d.meta, n = R.length
  const nearR = R.filter(nearCap)
  const n95 = R.filter((r) => ratio(r) >= 0.95).length, n90 = R.filter((r) => ratio(r) >= 0.9).length
  const rowDefs: MismoRowDef[] = GROUPS.map((g, j) => ({ ...g, color: CAT[j], rows: R.filter((r) => g.ids.includes(r.institution_id)) }))
  const rest = R.filter((r) => !GROUPS.some((g) => g.ids.includes(r.institution_id)))
  rowDefs.push({ k: 'otros', label: '', ids: [], iid: null, color: OTHER, rows: rest })
  // the lead = the largest named lot of the last two PEF years (current cases); meta.lead_above_cap is computed on the same lot
  const lastY = Math.max(...meta.years), curFrom = lastY - 1
  const lead = R.filter((r) => r.year >= curFrom && !r.is_pf && r.vendor_name).reduce<Lot | null>((a, r) => (!a || r.sum_mxn > a.sum_mxn ? r : a), null)
  // the vendor with most lots anywhere, and the buyer it shares them with most
  const topV = byVendor(R.filter((r) => r.vendor_id != null && r.vendor_name))[0] ?? null
  const topVBuyer = topV ? Object.entries(topV.rows.reduce<Record<string, number>>((a, r) => ((a[r.siglas || r.institution_name] = (a[r.siglas || r.institution_name] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0][0] : null
  const maypo = byVendor(R.filter((r) => r.vendor_id === MAYPO.vid && r.institution_id === MAYPO.iid))[0] ?? null
  const maypoOther = R.filter((r) => r.vendor_id === MAYPO.vid && r.institution_id !== MAYPO.iid).length
  const cur = R.filter((r) => r.year >= 2024)
  const byY = meta.years.map((y) => {
    const ry = R.filter((r) => r.year === y)
    return { y, n: ry.length, near: ry.filter(nearCap).length, hi: ry.length ? Math.max(...ry.map((r) => r.high_cap_mxn)) : 0 }
  })
  const yr = (y: number) => byY.find((b) => b.y === y)
  const hi23 = yr(2023)?.hi ?? 0, hi24 = yr(2024)?.hi ?? 0
  const F = {
    n, near: nearR.length, curFrom, lastY, n95, n90, med_ratio: median(R.map(ratio)) ?? 0,
    lead, lead_gap: lead ? lead.low_cap_mxn - lead.max_mxn : 0, lead_above: meta.lead_above_cap ?? [],
    topV, topVBuyer, maypo, maypoOther,
    cur_n: cur.length, cur_near: cur.filter(nearCap).length, cur_v: new Set(cur.filter((r) => !r.is_pf && r.vendor_id != null).map((r) => r.vendor_id)).size,
    diconsa_n: rowDefs[0].rows.length, imss_n: rowDefs[1].rows.length,
    y_first: byY[0], y2024: yr(2024), y2025: yr(2025), hi23, hi24, cap_jump: hi23 ? hi24 / hi23 - 1 : 0, byY,
  }
  return { R, F, rowDefs, meta, restBuyers: new Set(rest.map((r) => r.institution_id)).size }
}
export type MismoModel = ReturnType<typeof mismoModel>

// ═══════════════════ B · El arranque ═══════════════════
export type Bucket = 'before' | 'lt180' | 'lt365' | 'lt5y' | 'ge5y' | null
export interface ArrRow {
  vendor_id: number | null; vendor_name: string | null; first_date: string; first_year: number; first_contract_id: number
  y1_mxn: number; y1_n: number; y1_da_share: number; days_to_threshold: number; incorp_bucket: Bucket; censored: boolean | number; flag_10b: boolean | number
}
export interface ArrMeta {
  n: number; n_persona_fisica: number; n_dropped_prior_name: number; n_public_dropped: number; incorp_dated: number; incorp_lt365: number
  incorp_median_days: number | null; universe_first_ge_min: number; money_y1_mxn: number; n_censored: number; by_first_year: Record<string, number>
}
export interface ArrResp { available: boolean; meta: ArrMeta; rows: ArrRow[] }
export interface Cohort { y: number; n: number; m: number; da: number; young: number; crit: number; rows: ArrRow[] }

export const YEARS = Array.from({ length: 15 }, (_, i) => 2011 + i)
export const young = (r: ArrRow) => r.incorp_bucket === 'lt180' || r.incorp_bucket === 'lt365'
/** Special-purpose companies the APP law requires to be created for one contract (designer verdict 2026-11-04): born days
 *  before signing by construction, so they never count as «recién creadas». Matched by name; they won by tender anyway. */
export const SPV = /^APP\b|PROP[OÓ]SITO ESPEC[IÍ]FICO|^CONSORCIO CARRETERO\b|^CONSERVACI[OÓ]N .+ - /i
export const isSpv = (r: ArrRow) => SPV.test(r.vendor_name ?? '')
/** From 2019 the firm's age is known for ~93% of the firms (37% before), so the finding starts there. */
export const CRIT_FROM = 2019
/** The finding (red): from 2019, under a year old at the first contract, ≥ 90% of the first-year money by direct award, not an SPV. */
export const critical = (r: ArrRow) => r.first_year >= CRIT_FROM && young(r) && r.y1_da_share >= 0.9 && !isSpv(r)

export function arranqueModel(d: ArrResp) {
  const R = d.rows, meta = d.meta, n = R.length
  const co: Cohort[] = YEARS.map((y) => {
    const rows = R.filter((r) => r.first_year === y), m = sum(rows.map((r) => r.y1_mxn))
    return { y, n: rows.length, m, da: m ? sum(rows.map((r) => r.y1_mxn * r.y1_da_share)) / m : 0, young: rows.filter(young).length, crit: rows.filter(critical).length, rows }
  })
  const crit = R.filter(critical).sort((a, b) => b.y1_mxn - a.y1_mxn)
  const F = {
    n, crit, crit_m: sum(crit.map((r) => r.y1_mxn)), crit_lt180: crit.filter((r) => r.incorp_bucket === 'lt180').length,
    spv: R.filter((r) => young(r) && isSpv(r)),
    dated: R.filter((r) => r.incorp_bucket).length, lt365: R.filter(young).length,
    med_years: meta.incorp_median_days != null ? meta.incorp_median_days / 365.25 : null,
  }
  return { R, F, co, meta }
}
export type ArranqueModel = ReturnType<typeof arranqueModel>
