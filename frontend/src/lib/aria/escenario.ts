/**
 * Focos Rojos «¿Quién muestra más señales de riesgo y nadie lo ha investigado?»
 * (/aria?ver=concept; owner brief 2026-11-03 + owner review) — the pure half. The reader builds a scenario
 * (sexenio × sector × buyer × pattern); the answer is the fila's vendors without a case in those three registers,
 * ranked by ARIA's prioridad de investigación (money = context: star size, a column). One payload
 * (GET /aria/mapa/escenario, columnar) is decoded once; every scenario, ranking and the sky manifest (El Mapa's
 * constellations, one star per vendor) is computed here.
 */
import type { AriaEscenarioResponse, AriaMapaAspect, AriaMapaVendor } from '@/api/types'
import { ADMINISTRATIONS, type AdministrationKey } from '@/lib/administrations'
import type { SkyManifest, SkySector } from '@/lib/atlas/sky/geometry'
import { starPx } from '@/lib/atlas/sky/geometry'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import { PATTERN_SOFT, aspectText, softPattern, spanYears, type Lang, tr } from './mapa'
import { PATTERNS_OFF_IN_PROD } from './patterns'

/** The backend's sexenio keys (api.administrations) → the frontend's. */
const SEX_KEY: Record<string, AdministrationKey> = { fox: 'fox', calderon: 'calderon', pena_nieto: 'epn', amlo: 'amlo', sheinbaum: 'sheinbaum' }
export const SEXENIOS = ADMINISTRATIONS.map((a) => ({ key: a.key, short: a.key === 'epn' ? 'Peña Nieto' : a.key === 'calderon' ? 'Calderón' : a.short, long: a.long, years: `${Math.max(2002, a.yearStart)}–${Math.min(2026, a.yearEnd)}` }))
export const SEX_KEYS = SEXENIOS.map((s) => s.key)
export const isSexKey = (s: string | null | undefined): s is AdministrationKey => !!s && (SEX_KEYS as string[]).includes(s)

/** A fila vendor with its money per sexenio (index = SEXENIOS order). Same shape as the mapa rows, so
 *  aspectText / stamps / spanYears (lib/aria/mapa) read it unchanged. */
export interface EscVendor extends AriaMapaVendor {
  /** RUBLI holds a case on it that cites the press, a legal act or an audit (even below the «documented» bar) */
  pub?: boolean
  sx: number[]
  /** its money per sexenio in each sector it sells in (SEXENIOS order), the main sector first */
  ss: Array<{ sector: number; sx: number[] }>
}

/** `caso` = also show the vendors that already have a public case (default off: the ones nobody has investigated). */
export interface Scenario { sx: AdministrationKey | null; sector: number | null; inst: number | null; pat: string | null; caso?: boolean }
export const EMPTY: Scenario = { sx: null, sector: null, inst: null, pat: null }

/** ips = prioridad de investigación (the fila's own order), the default: «quién muestra más señales». */
/** The priority as the page prints it (2 decimals: a third would claim a precision the score does not have). */
export const ipsShown = (v: Pick<EscVendor, 'ips_final'>) => Math.round(v.ips_final * 100) / 100
export type SortKey = 'ips' | 'risk' | 'money' | 'contracts'

/** A public record already exists: SAT 69-B definitive, an SFP sanction, a RUBLI documented case, or a RUBLI case
 *  that cites the press, a legal act or an audit — such a vendor is never «nadie lo ha investigado». */
export const hasCase = (v: Pick<EscVendor, 'in_ground_truth' | 'is_efos_definitivo' | 'is_sfp_sanctioned' | 'pub'>) =>
  v.in_ground_truth || v.is_efos_definitivo || v.is_sfp_sanctioned || !!v.pub

/** Columns → rows, once. Sexenio money re-indexed to SEXENIOS order. */
export function decodeEscenario(e: AriaEscenarioResponse): EscVendor[] {
  const c = e.cols
  const order = e.sexenios.map((k) => SEX_KEYS.indexOf(SEX_KEY[k]))
  const out: EscVendor[] = []
  for (let i = 0; i < e.n; i++) {
    const sx = new Array<number>(SEX_KEYS.length).fill(0)
    e.sexenios.forEach((_, j) => { if (order[j] >= 0) sx[order[j]] = c.sx[i][j] })
    out.push({
      rank: i + 1, vendor_id: c.id[i], vendor_name: c.name[i], persona_fisica: c.pf[i] === 1,
      // a pattern the published database cannot compute (P5) is not shown: the concept reads as production will
      ips_final: c.ips[i], ips_tier: c.tier[i], avg_risk_score: c.risk[i], primary_pattern: c.pat[i] && (PATTERNS_OFF_IN_PROD as readonly string[]).includes(c.pat[i]!) ? null : c.pat[i], pattern_confidences: null,
      primary_sector_id: c.sec[i], total_value_mxn: c.value[i], total_contracts: c.n[i],
      top_institution: c.inst_name[i], top_institution_id: c.inst[i], top_institution_ratio: c.ratio[i],
      direct_award_rate: c.da[i], single_bid_rate: c.sb[i], years_active: null,
      first_contract_year: c.y0[i], last_contract_year: c.y1[i],
      is_disappeared: c.gone[i] === 1, is_efos_definitivo: c.efos[i] === 1, is_sfp_sanctioned: c.sfp[i] === 1, in_ground_truth: c.gt[i] === 1, pub: c.pub?.[i] === 1,
      aspects: c.asp[i].map(([k, v, pct]) => ({ k, v, pct })), sx,
      ss: (c.ss?.[i] ?? []).map(([sector, m]) => { const t = new Array<number>(SEX_KEYS.length).fill(0); e.sexenios.forEach((_, j) => { if (order[j] >= 0) t[order[j]] = m[j] }); return { sector, sx: t } }),
    })
  }
  return out
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
/** The money a vendor received in the scenario's period — its sexenio slice or all of it — and, when the reader
 *  filters a sector, only what it received IN that sector (a vendor sells in several; owner 2026-11-03). */
export function moneyIn(v: EscVendor, sx: AdministrationKey | null, sector: number | null = null): number {
  if (sector != null) {
    const s = v.ss.find((t) => t.sector === sector)
    return s ? (sx ? s.sx[SEX_KEYS.indexOf(sx)] : sum(s.sx)) : 0
  }
  return sx ? v.sx[SEX_KEYS.indexOf(sx)] : v.total_value_mxn
}
/** Its split across sectors over the period, largest first (the card's small bar). */
export const sectorSplit = (v: EscVendor, sx: AdministrationKey | null) =>
  v.ss.map((t) => ({ sector: t.sector, money: sx ? t.sx[SEX_KEYS.indexOf(sx)] : sum(t.sx) })).filter((t) => t.money > 0).sort((a, b) => b.money - a.money)

/** The vendors the scenario keeps (money > 0 in its period; with a sector, money > 0 IN that sector — every vendor
 *  that sells there, not only those whose main sector it is). `withSector` false = the sky's set: one dot per vendor
 *  in its main sector, the focused sector is the camera's focus (other constellations dim), so every sector stays drawn. */
export function inScenario(vs: EscVendor[], sc: Scenario, withSector = true): EscVendor[] {
  const sec = withSector ? sc.sector : null
  return vs.filter((v) =>
    moneyIn(v, sc.sx, sec) > 0
    // «en Salud» = it sells there for real: its main sector, or ≥ ¼ of its money in the period (reviewer 2026-11-04:
    // a car-rental firm with 1 % of its money in Salud answered «¿quién en Salud?»)
    && (sec == null || v.primary_sector_id === sec || moneyIn(v, sc.sx, sec) >= 0.25 * moneyIn(v, sc.sx))
    && (sc.caso || !hasCase(v))
    && (sc.inst == null || v.top_institution_id === sc.inst)
    && (sc.pat == null || v.primary_pattern === sc.pat))
}

/** The answer: ranked by the signals (prioridad de investigación, IPS), or by what the reader sorts on; ties by the
 *  indicator, then the money. Every crítico prints «≥ 0.60», so the risk sort treats the band as one value and the
 *  money decides inside it, never a hidden decimal. */
export function rankScenario(vs: EscVendor[], sc: Scenario, sort: SortKey = 'ips'): EscVendor[] {
  const m = (v: EscVendor) => moneyIn(v, sc.sx, sc.sector)
  const risk = (v: EscVendor) => (v.avg_risk_score == null ? -1 : getRiskLevelFromScore(v.avg_risk_score) === 'critical' ? 0.6 : v.avg_risk_score)
  // the priority is shown to 2 decimals: rows equal at that precision ARE tied (same Nº), the indicator then the money order them
  const key: Record<SortKey, (v: EscVendor) => number> = { ips: ipsShown, risk, money: m, contracts: (v) => v.total_contracts }
  const f = key[sort]
  const out = inScenario(vs, sc).slice().sort((a, b) => f(b) - f(a) || (sort === 'risk' ? m(b) - m(a) : risk(b) - risk(a)) || m(b) - m(a) || b.ips_final - a.ips_final || a.vendor_id - b.vendor_id)
  const r = out.map((v) => ({ ...v }))
  r.forEach((v, i) => { v.rank = sort === 'ips' && i > 0 && ipsShown(r[i - 1]) === ipsShown(v) ? r[i - 1].rank : i + 1 })
  return r
}

/** The buyers present in the scenario (before its own buyer filter), by their vendors' money, for the question's select. */
export function buyersIn(vs: EscVendor[], sc: Scenario): Array<{ id: number; name: string; money: number; n: number }> {
  const m = new Map<number, { id: number; name: string; money: number; n: number }>()
  for (const v of inScenario(vs, { ...sc, inst: null })) {
    if (v.top_institution_id == null || !v.top_institution) continue
    const d = m.get(v.top_institution_id) ?? { id: v.top_institution_id, name: v.top_institution, money: 0, n: 0 }
    d.money += moneyIn(v, sc.sx, sc.sector); d.n += 1
    m.set(v.top_institution_id, d)
  }
  return [...m.values()].sort((a, b) => b.money - a.money)
}

/** Patterns present in the scenario (before its own pattern filter), in PATTERN_SOFT order, with counts. */
export function patternsIn(vs: EscVendor[], sc: Scenario): Array<{ code: string; n: number }> {
  const n = new Map<string, number>()
  for (const v of inScenario(vs, { ...sc, pat: null })) if (v.primary_pattern) n.set(v.primary_pattern, (n.get(v.primary_pattern) ?? 0) + 1)
  return Object.keys(PATTERN_SOFT).filter((c) => n.has(c)).map((c) => ({ code: c, n: n.get(c)! }))
}

/** One candidate reason for a row: its kind, the raw value the listed rows are ranked on (higher = stands out more),
 *  whether it is a concrete, checkable fact (share of one buyer, single award, direct awards, arrival, exit, a record)
 *  rather than a percentile of the model's inputs, and its phrase. */
interface Cand { k: string; raw: number; concrete: boolean; text: string }

function candidates(v: EscVendor, lang: Lang): Cand[] {
  const out: Cand[] = []
  const add = (k: AriaMapaAspect['k'], raw: number, val: number, concrete: boolean, pct = 0) =>
    out.push({ k, raw, concrete, text: aspectText({ k, v: val, pct }, v, lang) })
  // bars: a real standout, not the norm (≈ 75 % of federal contracts are direct awards; a 50 % buyer share is common)
  const ratio = v.top_institution_ratio
  if (v.top_institution && ratio != null && ratio >= 0.6) add('ratio', ratio, ratio, true)
  if (v.direct_award_rate != null && v.direct_award_rate >= 0.9) add('da', v.direct_award_rate, v.direct_award_rate, true)
  if (v.single_bid_rate != null && v.single_bid_rate >= 0.4) add('sb', v.single_bid_rate, v.single_bid_rate, true)
  const span = spanYears(v)
  // a late arrival with its money in few years: ranked on money per year on the record
  if (v.first_contract_year && v.first_contract_year >= 2015 && span != null && span <= 6) add('new', v.total_value_mxn / span, v.first_contract_year, true)
  if (v.is_disappeared && v.last_contract_year) add('gone', 1, v.last_contract_year, true)
  if (v.is_efos_definitivo) add('efos', 1, 1, true)
  if (v.is_sfp_sanctioned) add('sfp', 1, 1, true)
  if (v.in_ground_truth) add('gt', 1, 1, true)
  // the model's own inputs vs its sector (backend aspects): P1 is sector weight, so conc would only restate it
  for (const x of v.aspects) {
    if (x.k === 'vol' || (x.k === 'conc' && v.primary_pattern !== 'P1')) add(x.k, x.pct, x.v, false, x.pct)
    else if (x.k === 'pr') add('pr', x.v, x.v, false, x.pct)
  }
  return out
}

/** Flags score on rarity in the listed rows; values on their percentile among them (a row without the kind ranks lowest). */
const FLAGS = new Set(['gone', 'efos', 'sfp', 'gt'])

/**
 * «Por qué destaca» for the LISTED rows (in rank order), ≤ 2 short phrases each: its pattern in plain words, then the
 * one thing where it stands out most against the OTHER listed vendors — not its sector: the fila is already the
 * tail, so sector percentiles saturate and would repeat on every row. Each candidate is ranked among the listed rows;
 * concrete, checkable facts win close calls over percentile phrases. No aspect kind takes more than a third of any
 * prefix of the list (so the top rows read different, and the lede, the first 25 and the unfolded 100 agree), unless
 * it is the row's only signal. Never «X MDP por contrato», never the indicator (its own column), never a non-reason:
 * with nothing distinctive a row is [] and the UI prints «—».
 */
export function whyList(rows: EscVendor[], lang: Lang): string[][] {
  const n = rows.length
  const cands = rows.map((v) => candidates(v, lang))
  const byKind = new Map<string, number[]>()
  for (const cs of cands) for (const c of cs) { const a = byKind.get(c.k) ?? []; a.push(c.raw); byKind.set(c.k, a) }
  const score = (c: Cand) => {
    const vals = byKind.get(c.k)!
    const base = FLAGS.has(c.k) ? 1 - vals.length / n : (n - vals.length + vals.filter((x) => x < c.raw).length) / n
    return Math.round((base + (c.concrete ? 0.15 : 0)) * 1e6)  // rounded: a float hair never breaks a tie
  }
  const used = new Map<string, number>()
  return rows.map((v, i) => {
    const cap = Math.max(1, Math.ceil((i + 1) / 3))
    const ranked = cands[i].map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s)
    const pick = (ranked.find((r) => (used.get(r.c.k) ?? 0) < cap) ?? ranked[0])?.c
    if (pick) used.set(pick.k, (used.get(pick.k) ?? 0) + 1)
    // lower case: it reads after «Por qué:» and beside the other reasons, all lower case
    const soft = softPattern(v.primary_pattern, lang)?.replace(/^./, (ch) => ch.toLowerCase())
    return [...(soft ? [soft] : []), ...(pick ? [pick.text] : [])]
  })
}

/** Per-sector totals of a scenario set: vendors and money (the claim and the sky's key). */
export function totals(vs: EscVendor[], sx: AdministrationKey | null, sector: number | null = null) {
  let money = 0, crit = 0
  const bySector = new Map<number, { n: number; money: number }>()
  for (const v of vs) {
    const m = moneyIn(v, sx, sector)
    money += m
    if (v.avg_risk_score != null && getRiskLevelFromScore(v.avg_risk_score) === 'critical') crit += 1
    const s = bySector.get(v.primary_sector_id ?? 12) ?? { n: 0, money: 0 }
    s.n += 1; s.money += m
    bySector.set(v.primary_sector_id ?? 12, s)
  }
  return { n: vs.length, money, crit, bySector }
}

/* ── the sky: El Mapa's twelve constellations, one star per vendor ── */

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
/** A stable 0–1 from an id (so a vendor keeps its place between renders): the spiral breathes like a constellation, not a lattice. */
const jitter = (id: number) => ((id * 2654435761) >>> 0) / 4294967296
/** World units per screen px at the reference pack (the pack rescales every constellation anyway). */
const U = 6

/**
 * Vendors as stars on El Mapa's sky. One dot per vendor, in the sector where it sells most (never duplicated).
 * Each sector is a constellation; inside it the vendors sit on a sunflower spiral by PRIORITY (the highest at the
 * centre, so the page's answer surfaces), spaced by their own mark areas so the marks rarely overlap at the
 * reference zoom. Size = money (context); with a sector in focus, that constellation's stars are sized by their
 * money IN the sector. `h` = the priority of the ringed (the sector's top `ringTop` by priority at a critical
 * indicator with no case), so the sky's landmark names go to them, not to the money winners. Position = rank in its sector, never a value; size = money (El Mapa's log
 * scale, `starPx`); colour = sector; red ring = the sector's top `ringTop` by signals at a critical indicator, no case. Sector centres come from El Mapa's own manifest
 * when it is loaded, else a fixed ring in El Mapa's draw order, so the two skies rhyme.
 */
export const RING_TOP = 12
export function vendorSky(vs: EscVendor[], sx: AdministrationKey | null, base?: SkyManifest | null, ringTop = RING_TOP, focus: number | null = null): SkyManifest {
  const centre = new Map<number, { x: number; y: number }>()
  const ORDER = [1, 4, 3, 7, 8, 2, 6, 11, 9, 12, 10, 5]
  ORDER.forEach((id, i) => {
    const b = base?.sectors.find((s) => s.id === id)
    const a = (i / ORDER.length) * Math.PI * 2 - Math.PI / 2
    centre.set(id, b ? { x: b.x, y: b.y } : { x: 5000 + 3600 * Math.cos(a), y: 5000 + 3600 * Math.sin(a) })
  })
  const n = vs.length
  const id: number[] = [], name: string[] = [], siglas: string[] = [], sector: number[] = [], x: number[] = [], y: number[] = []
  const r: number[] = [], v: number[] = [], h: number[] = [], nv: number[] = []
  const zero = () => new Array<number>(n).fill(0)
  const ext = new Map<number, number>()
  for (const sec of SECTORS) {
    const inSec = sec.id === focus ? sec.id : null
    const mine = vs.filter((t) => (t.primary_sector_id ?? 12) === sec.id).sort((a, b) => b.ips_final - a.ips_final || moneyIn(b, sx, inSec) - moneyIn(a, sx, inSec))
    // the ring: the sector's top `ringTop` by signals (IPS) among its críticos without a public case
    const ringed = new Set(mine.filter((t) => !hasCase(t) && t.avg_risk_score != null && getRiskLevelFromScore(t.avg_risk_score) === 'critical')
      .sort((a, b) => b.ips_final - a.ips_final).slice(0, ringTop).map((t) => t.vendor_id))
    const c = centre.get(sec.id)!
    let area = 0, far = 0
    mine.forEach((t, i) => {
      const m = moneyIn(t, sx, inSec)
      const rp = starPx(m)
      // each mark claims its own disc (×2.4 pad); the spiral radius grows with the area claimed so far
      area += Math.PI * rp * rp * 2.4
      const j = jitter(t.vendor_id)
      const rad = i === 0 ? 0 : Math.sqrt(area / Math.PI) * U * (0.9 + 0.2 * j)
      const th = i * GOLDEN + (j - 0.5) * 0.5
      far = Math.max(far, rad + rp * U)
      id.push(t.vendor_id); name.push(t.vendor_name); siglas.push(formatVendorName(t.vendor_name, 24)); sector.push(sec.id)
      x.push(c.x + rad * Math.cos(th)); y.push(c.y + rad * Math.sin(th)); r.push(rp * U); v.push(m)
      h.push(ringed.has(t.vendor_id) ? t.ips_final : 0); nv.push(t.total_contracts)
    })
    ext.set(sec.id, Math.max(far, 40 * U))
  }
  const sectors: SkySector[] = SECTORS.map((s) => {
    const c = centre.get(s.id)!
    const mine = sector.reduce((a, t, i) => (t === s.id ? a + v[i] : a), 0)
    // h_p90 = the smallest positive h in the sector: Firmamento rings `h ≥ p90`, so exactly the ringed ring
    const hs = h.filter((x, i) => x > 0 && sector[i] === s.id)
    return { id: s.id, code: s.code, name_es: s.name, name_en: s.nameEN, x: c.x, y: c.y, r: ext.get(s.id)!, value: mine, n_stars: sector.filter((t) => t === s.id).length, h_med: 0, h_p90: hs.length ? Math.min(...hs) : 1 }
  })
  return {
    layout_version: 'escenario', computed_at: '', data_cut: base?.data_cut ?? '', risk_basis: 'avg_risk_score', layout_mode: 'phyllotaxis', world: 10_000,
    basis: { n_stars: n, n_sky: n, n_drawn: n, per_star_max: 0, n_vendors_tied: 0, n_ties: 0, dropped_ties: 0, overflow_to_band: 0, public_t1: 0, public_t2: 0, public_t3: 0, documented_drawn: 0, residual_overlaps: 0, total_value_mxn: v.reduce((a, b) => a + b, 0), drawn_value_mxn: 0, remainder_share: 0, backbone_kept_pct: 0, primary_value_mxn: 0 },
    anomalies: {}, sectors,
    stars: { id, name, siglas, sector, x, y, r, v, h, nv, drawn: zero(), np: zero(), rem: zero(), linked: zero() },
    inst_map: { raw: [], canon: [] },
  }
}

/* ── words ── */

/** The sexenio in words: «con Fox (2002–2006)» / «under Fox (2002–2006)». */
export function sexenioLabel(key: AdministrationKey | null, lang: Lang): string {
  if (!key) return tr(['en todo el periodo', 'over the whole period'], lang)
  const s = SEXENIOS.find((a) => a.key === key)!
  return `${tr(['con', 'under'], lang)} ${s.short} (${s.years})`
}

/** The question the reader built, as one sentence (the page's h1 lede and the document title). */
export function questionText(sc: Scenario, lang: Lang, names: { sector: (id: number) => string; inst: (id: number) => string }): string {
  const parts = [
    sexenioLabel(sc.sx, lang),
    sc.sector != null ? `${tr(['en', 'in'], lang)} ${names.sector(sc.sector)}` : null,
    sc.inst != null ? `${tr(['vendiendo sobre todo a', 'selling mostly to'], lang)} ${names.inst(sc.inst)}` : null,
    sc.pat ? `${tr(['con el patrón', 'with the pattern'], lang)} «${tr(PATTERN_SOFT[sc.pat] ?? [sc.pat, sc.pat], lang)}»` : null,
  ].filter(Boolean)
  const who = sc.caso ? tr(['¿Quién muestra más señales de riesgo', 'Who shows the most risk signals'], lang) : tr(['¿Quién muestra más señales de riesgo sin caso público', 'Who shows the most risk signals with no public case'], lang)
  return `${who}${parts.length ? ' ' + parts.join(', ') : ''}?`
}
