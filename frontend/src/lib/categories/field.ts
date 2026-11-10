/**
 * «El Anaquel» — pure model for the /categories field (Tamiz family, after
 * .claude/designs/institutions-tamiz-2026-10-07-spec.md § 2).
 *
 * One dot = one institution buying in one category (institution × category
 * pair with ≥ 100 contracts, plus each category's largest pair). ~2,900 dots:
 * enough to show where money piles and where risk burns, few enough for one
 * canvas. Each sort key is a LAYOUT: x = that measure, bands = the top
 * categories under it (+ one rail for the rest), and a "lit" set that carries
 * the layout's finding.
 * Every number the page prints is computed here from the live payload.
 */
import { RISK_THRESHOLDS, EU_DIRECT_AWARD_LIMIT, getRiskLevelFromScore } from '@/lib/constants'
import type { BandSpec } from '@/lib/field/layout'

export type FieldSort = 'spend' | 'risk' | 'contracts' | 'direct_award'

/** Below this a pair's indicator rests on a thin sample → hollow dot (the page's CONTRACT_FLOOR). */
export const THIN_BELOW = 200
export const DA_LINE = Math.round(EU_DIRECT_AWARD_LIMIT * 100)
export const REST_KEY = '__rest'

export interface CategoryFieldPayload {
  computed_at: string | null
  min_contracts: number
  columns: string[]
  rows: unknown[][]
  totals: { pairs: number; contracts: number; value_mxn: number } | null
}

export interface CategoryRef {
  category_id: number
  sector_code: string
}

export interface Pair {
  category_id: number
  sector_code: string
  institution_id: number
  institution_name: string
  siglas: string | null
  contracts: number
  value: number
  risk: number | null
  da: number | null
  high_risk: number
}

export function decodeField(p: CategoryFieldPayload, cats: CategoryRef[]): Pair[] {
  const ix = Object.fromEntries(p.columns.map((c, i) => [c, i]))
  const sectorOf = new Map(cats.map((c) => [c.category_id, c.sector_code]))
  return p.rows.map((r) => {
    const category_id = r[ix.category_id] as number
    return {
      category_id,
      sector_code: sectorOf.get(category_id) ?? 'otros',
      institution_id: r[ix.institution_id] as number,
      institution_name: r[ix.institution_name] as string,
      siglas: (r[ix.siglas] as string | null) ?? null,
      contracts: (r[ix.contract_count] as number) ?? 0,
      value: (r[ix.total_value_mxn] as number) ?? 0,
      risk: (r[ix.avg_risk_score] as number | null) ?? null,
      da: (r[ix.direct_award_pct] as number | null) ?? null,
      high_risk: (r[ix.high_risk_count] as number) ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Measures — one per sort key: the x position, the axis, the band aggregate
// ---------------------------------------------------------------------------

export interface Measure {
  /** Position on the axis (log10 for money and counts). */
  x: (p: Pair) => number
  domain: [number, number]
  /** Tick positions in axis units. */
  ticks: number[]
  /** Band aggregate (what the bands are ranked by and the readout prints). */
  agg: (ps: Pair[]) => number
}

const sum = (ps: Pair[], f: (p: Pair) => number) => ps.reduce((s, p) => s + f(p), 0)
/** Contract-weighted mean, so a 100-contract pair does not weigh like IMSS. */
const wmean = (ps: Pair[], f: (p: Pair) => number | null) => {
  let w = 0
  let s = 0
  for (const p of ps) {
    const v = f(p)
    if (v == null) continue
    w += p.contracts
    s += v * p.contracts
  }
  return w ? s / w : 0
}

export const MEASURES: Record<FieldSort, Measure> = {
  spend: {
    // From 10M: the ~45 smaller pairs (1.5%) sit on the left edge instead of a decade of white.
    x: (p) => Math.log10(Math.max(1e7, p.value)),
    domain: [7, 12],
    ticks: [7, 8, 9, 10, 11, 12],
    agg: (ps) => sum(ps, (p) => p.value),
  },
  risk: {
    x: (p) => (p.risk ?? 0) * 100,
    domain: [0, 100],
    ticks: [0, RISK_THRESHOLDS.medium * 100, RISK_THRESHOLDS.high * 100, RISK_THRESHOLDS.critical * 100, 100],
    agg: (ps) => wmean(ps, (p) => p.risk) * 100,
  },
  contracts: {
    x: (p) => Math.log10(Math.max(10, p.contracts)),
    domain: [2, 5.5],
    ticks: [2, 3, 4, 5],
    agg: (ps) => sum(ps, (p) => p.contracts),
  },
  direct_award: {
    x: (p) => p.da ?? 0,
    domain: [0, 100],
    ticks: [DA_LINE, 25, 50, 75, 100],
    agg: (ps) => wmean(ps, (p) => p.da),
  },
}

// ---------------------------------------------------------------------------
// Lit sets — the dots that carry each layout's finding
// ---------------------------------------------------------------------------

/** Smallest set of `members` (by `f`, largest first) whose total reaches half of theirs. */
export function halfOf(pairs: Pair[], members: number[], f: (p: Pair) => number): number[] {
  const sorted = [...members].sort((a, b) => f(pairs[b]) - f(pairs[a]) || a - b)
  const total = sorted.reduce((s, k) => s + f(pairs[k]), 0)
  const out: number[] = []
  let cum = 0
  for (const k of sorted) {
    if (total > 0 && cum >= total / 2) break
    out.push(k)
    cum += f(pairs[k])
  }
  return out
}

export const isHighRisk = (p: Pair) => p.risk != null && p.risk >= RISK_THRESHOLDS.high
export const isOverDaLine = (p: Pair) => (p.da ?? 0) > DA_LINE

/** Lit dot indices for `sort` among `members` (the population in focus). */
export function litSet(pairs: Pair[], members: number[], sort: FieldSort): number[] {
  switch (sort) {
    case 'spend': return halfOf(pairs, members, (p) => p.value)
    case 'contracts': return halfOf(pairs, members, (p) => p.contracts)
    case 'risk': return members.filter((k) => isHighRisk(pairs[k]))
    case 'direct_award': return members.filter((k) => isOverDaLine(pairs[k]))
  }
}

/** Risk layout colours by level; the other layouts light their set in one ink. */
export function litLevel(p: Pair): 'critical' | 'high' {
  return getRiskLevelFromScore(p.risk ?? 0) === 'critical' ? 'critical' : 'high'
}

// ---------------------------------------------------------------------------
// Bands — the top categories under the current sort + one rail for the rest
// ---------------------------------------------------------------------------

/** Category bands drawn at full size; the rest fold onto one rail. */
export const TOP_BANDS = 12
/** Rate layouts (risk, direct award) only rank categories with this many dots — a 3-dot mean never tops the plate. */
export const MIN_RATE_DOTS = 8

export interface FieldRow {
  key: string
  members: number[]
  agg: number
  rail: boolean
  /** Distinct categories in the row (1 for a band, N for the rail). */
  cats: number
  /** Rate layouts: under MIN_RATE_DOTS dots — shown, but ranked after the rest. */
  thin: boolean
}

/**
 * Rows read as CATEGORIES (what was bought). By default the TOP_BANDS
 * categories ranked by the sort's aggregate, then one rail holding every
 * other dot, so the denominator never leaves the plate. With `all`, or
 * within a `sector`, EVERY category in focus gets a row (Otros alone has 38);
 * in the rate layouts (risk, direct award) categories under MIN_RATE_DOTS
 * still get a row but rank after the rest, flagged `thin` — a 3-dot mean
 * never tops the plate. Re-ranked per layout, so rows enter, leave and swap.
 */
export function buildRows(pairs: Pair[], sort: FieldSort, sector: string | null, all = false): FieldRow[] {
  const m = MEASURES[sort]
  const by = new Map<number, number[]>()
  pairs.forEach((p, k) => {
    if (sector && p.sector_code !== sector) return
    const list = by.get(p.category_id)
    if (list) list.push(k)
    else by.set(p.category_id, [k])
  })
  const rate = sort === 'risk' || sort === 'direct_award'
  const every = all || sector != null
  const top: FieldRow[] = [...by]
    .map(([id, members]) => ({
      key: String(id), members, rail: false, cats: 1,
      thin: rate && members.length < MIN_RATE_DOTS,
      agg: m.agg(members.map((k) => pairs[k])),
    }))
    .filter((r) => every || !r.thin)
    .sort((a, b) => Number(a.thin) - Number(b.thin) || b.agg - a.agg || b.members.length - a.members.length)
    .slice(0, every ? undefined : TOP_BANDS)
  const shown = new Set(top.map((r) => Number(r.key)))
  const rest = pairs.flatMap((p, k) => (shown.has(p.category_id) ? [] : [k]))
  if (rest.length) {
    top.push({
      key: REST_KEY, members: rest, rail: true, thin: false,
      cats: new Set(rest.map((k) => pairs[k].category_id)).size,
      agg: m.agg(rest.map((k) => pairs[k])),
    })
  }
  return top
}

export const toSpecs = (rows: FieldRow[]): BandSpec[] => rows.map((r) => ({ key: r.key, members: r.members, rail: r.rail }))

// ---------------------------------------------------------------------------
// Findings — the numbers behind each layout's sentence
// ---------------------------------------------------------------------------

export interface Finding {
  n: number
  lit: number
  litValue: number
  value: number
  litContracts: number
  contracts: number
  thin: number
  /** The pair that heads the lit set (largest by the layout's measure). */
  top: number | null
}

export function findingOf(pairs: Pair[], members: number[], sort: FieldSort): Finding {
  const lit = litSet(pairs, members, sort)
  const litS = new Set(lit)
  let value = 0, litValue = 0, contracts = 0, litContracts = 0, thin = 0
  for (const k of members) {
    const p = pairs[k]
    value += p.value
    contracts += p.contracts
    if (p.contracts < THIN_BELOW) thin++
    if (litS.has(k)) {
      litValue += p.value
      litContracts += p.contracts
    }
  }
  const x = MEASURES[sort].x
  const top = lit.length ? lit.reduce((a, b) => (x(pairs[b]) > x(pairs[a]) ? b : a)) : null
  return { n: members.length, lit: lit.length, litValue, value, litContracts, contracts, thin, top }
}
