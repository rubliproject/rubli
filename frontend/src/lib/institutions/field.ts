/**
 * El Tamiz — pure model for the /institutions field (spec institutions-tamiz
 * §2; v3 switch: tamiz-v3, grading-v3 §9.1).
 *
 * The endpoint serves either the owner-approved v3 grade (score 0–100, A–F,
 * three pillars, provisional band) or, on a DB without the v3 tables, the v2
 * scorecards (score out of 90, five pillars). `decodeField` normalises both
 * into one FieldModel, so steps, canvas and register run one code path.
 *
 * Every dot also carries an ALTERNATE score:
 *   v3 → the historical v2 grade (official until 2026-10-08), so step 4 can
 *        show what the new method changed;
 *   v2 → the X-ray counterfactual (External Flags swapped for the mean).
 *
 * Every number the page prints is computed here from the live payload —
 * never hardcoded. Layout is a deterministic quantized dodge: dot i is always
 * institution i, so steps tween the same dots (NYT Upshot object constancy).
 */
import type { CoverageBand, CoverageInfo } from '@/lib/institution/coverage'
import { INSTITUTION_PILLARS, PILLAR_CEILING } from '@/lib/institution-pillars'
import { TIER_GRADE_MAP } from '@/lib/tiers'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** Step-4 ring threshold on v3: ≥5 investigated vendors reads as a highlight, ≥1 rang half the field. */
export const RING_MIN_GT_V3 = 5

export type Level = 'federal' | 'state' | 'municipal'
export type Method = 'v2' | 'v3'

export interface FieldInst {
  id: number
  name: string
  siglas: string | null
  total_score: number
  grade: string
  /** «Reprobada»: v3 rounded score < 60 (owner rule 2026-10-20); v2 fallback: grade D/F. */
  fail: boolean
  /** v3 provisional, or v2 confidence_band 'wide' (≤ 30 contracts). */
  provisional: boolean
  score_lo: number | null
  score_hi: number | null
  level: Level
  /** Findings group: v3 `level|family`, v2 fed-dec/fed-other/state/muni. */
  group: string
  /** v3 family, v2 institution_type. */
  kind: string | null
  size_band: string | null
  sector_id: number | null
  total_contracts: number
  total_amount_mxn: number
  /** v3 gt_vendor_count; v2 gt_exposed as 0/1. Beside the grade, never in it (v3). */
  gt: number
  /** Ring in step 4: v3 = bought from ≥ RING_MIN_GT_V3 investigated vendors (owner, 2026-10-08); v2 = any exposure. */
  ringed: boolean
  /** Pillar scores keyed by the model's pillar keys. */
  pillars: Record<string, number>
  /** The pillar that cost the most points, and how many. */
  loss: { key: string; lost: number }
  /** Alternate score (v3: historical v2 · v2: X-ray) on the same 0–100 axis. */
  alt_score: number | null
  alt_grade: string | null
  /** Cobertura CompraNet (v3 /field, federal + matched only); beside the grade. */
  coverage: CoverageInfo | null
  /** No contract since 2022 (PEMEX, CFE, the old SCT…): hatched in the money view, never removed. */
  historical: boolean | null
  last_year: number | null
  /** Share of posterior draws inside the assigned grade band (v3). */
  p_grade: number | null
  /** Contracts > 10B MXN inside the graded value (FLAG: included, in review). */
  flagged_n: number
  flagged_value_mxn: number
  /**
   * v3 trend of the non-competitive COUNT share of contracts, 2018–2025 (not
   * pesos: IMSS reads «estable» by count while its value share rose). null = too
   * few years (sin_datos). Slope in share per year (0.024 = +2.4 pp/yr).
   */
  trend: Trend | null
  trend_slope: number | null
}
export type Trend = 'mejora' | 'estable' | 'empeora'

/** GET /scorecards/institutions/hallazgos («Por pesos» spec §5). */
export interface InstitutionHallazgos {
  computed_at: string
  top_df: null | {
    institution_id: number
    name: string
    grade: string
    score: number
    trend: string | null
    value_mxn: number
    years: { year: number; value_mxn: number; da_share_value: number | null; da_share_count: number }[]
  }
  sexenios: {
    key: 'epn' | 'amlo' | 'y2025'
    years: [number, number]
    partial: boolean
    federal_value_mxn: number
    df_share: number | null
    df_share_ex_top: number | null
    top_share: number | null
    da_share_value: number | null
  }[]
  visibility: {
    left_compranet: {
      n: number
      value_mxn: number
      grades: Record<string, number>
      max_last_year: number | null
      top: { institution_id: number; name: string; grade: string; value_mxn: number; last_year: number }[]
    }
    a_partial: { institution_id: number; name: string; grade: string; value_mxn: number; coverage_pct: number; lower_bound: boolean }[]
    federal_by_band: Record<string, { n: number; value_mxn: number }>
  }
}

export interface FieldPayload {
  method?: Method
  computed_at: string
  calibration_id?: string
  scale?: [number, number]
  cut_points?: number[]
  columns: string[]
  rows: unknown[][]
}

export interface PillarDef {
  key: string
  max: number
  label_es: string
  label_en: string
}

export interface FieldModel {
  method: Method
  insts: FieldInst[]
  xMin: number
  xMax: number
  /** Hairlines + letter bands for the main view and for the alternate view. */
  lines: number[]
  letters: [number, number, string][]
  altLines: number[]
  altLetters: [number, number, string][]
  /** score < this = reprobada (v3: 60, the pass mark; v2: 40). */
  deficientBelow: number
  altDeficientBelow: number
  pillars: PillarDef[]
  calibrationId: string | null
}

/** Deficient = tiers Deficiente + Crítico: v2 D, D-, F, F- · v3 D, F. */
const DEFICIENT_GRADES = new Set([...TIER_GRADE_MAP.Deficiente, ...TIER_GRADE_MAP.Critico])
export const isDeficient = (i: FieldInst) => i.fail
export const isAltDeficient = (i: FieldInst, m: FieldModel) =>
  i.alt_grade != null ? DEFICIENT_GRADES.has(i.alt_grade) : i.alt_score != null && i.alt_score < m.altDeficientBelow

/** v2 ladder on its own nominal scale: hairlines and letters (D < 40 = deficient). */
const V2_LINES = [20, 30, 40, 50, 60, 70, 80]
const V2_LETTERS: [number, number, string][] = [
  [20, 30, 'D-'], [30, 40, 'D'], [40, 50, 'C'], [50, 60, 'C+'], [60, 70, 'B'], [70, 80, 'B+'], [80, 90, 'A'],
]
export const V3_PILLARS: PillarDef[] = [
  { key: 'competencia', max: 100, label_es: 'Competencia', label_en: 'Competition' },
  { key: 'proceso', max: 100, label_es: 'Proceso', label_en: 'Process' },
  { key: 'concentracion', max: 100, label_es: 'Concentración', label_en: 'Concentration' },
]
const V2_PILLARS: PillarDef[] = INSTITUTION_PILLARS.map((p) => ({
  key: p.dbField, max: p.max, label_es: p.short_es, label_en: p.short_en,
}))

export const pillarName = (m: FieldModel, key: string, lang: string) => {
  const p = m.pillars.find((q) => q.key === key)
  return p ? (lang === 'en' ? p.label_en : p.label_es) : key
}

function cell(columns: string[]) {
  const ix = Object.fromEntries(columns.map((c, i) => [c, i]))
  return (r: unknown[], c: string) => (c in ix ? r[ix[c]] : undefined)
}

function decodeCoverage(pct: unknown, band: unknown, lb: unknown): CoverageInfo | null {
  if (typeof pct !== 'number' || (band !== 'alta' && band !== 'parcial' && band !== 'baja')) return null
  return { ratio: pct / 100, band: band as CoverageBand, lowerBound: lb === true }
}

function decodeV3(p: FieldPayload): FieldModel {
  const v = cell(p.columns)
  const cuts = (p.cut_points ?? [76, 60, 44, 28]).slice().sort((a, b) => b - a) // A, B, C, D floors
  const [a, b, c, d] = cuts
  const insts: FieldInst[] = p.rows.map((r) => {
    const pillars = Object.fromEntries(V3_PILLARS.map((q) => [q.key, (v(r, `pillar_${q.key}`) as number) ?? 0]))
    const lossKey = (v(r, 'top_loss_pillar') as string | null)
      ?? V3_PILLARS.reduce((w, q) => (pillars[q.key] < pillars[w.key] ? q : w)).key
    const lossPts = v(r, 'top_loss_points') as number | null
    return {
      id: v(r, 'id') as number,
      name: v(r, 'name') as string,
      siglas: (v(r, 'siglas') as string | null) ?? null,
      total_score: v(r, 'score') as number,
      grade: v(r, 'grade') as string,
      fail: Math.round(v(r, 'score') as number) < 60,
      provisional: !!v(r, 'provisional'),
      score_lo: (v(r, 'score_lo') as number | null) ?? null,
      score_hi: (v(r, 'score_hi') as number | null) ?? null,
      level: v(r, 'level') as Level,
      group: v(r, 'group') as string,
      kind: (v(r, 'family') as string | null) ?? null,
      size_band: (v(r, 'size_band') as string | null) ?? null,
      sector_id: (v(r, 'sector_id') as number | null) ?? null,
      total_contracts: (v(r, 'n_contracts') as number) ?? 0,
      total_amount_mxn: (v(r, 'total_value_mxn') as number) ?? 0,
      gt: (v(r, 'gt_vendor_count') as number) ?? 0,
      ringed: ((v(r, 'gt_vendor_count') as number) ?? 0) >= RING_MIN_GT_V3,
      pillars,
      loss: { key: lossKey, lost: lossPts != null ? -lossPts : (100 - pillars[lossKey]) / 3 },
      alt_score: (v(r, 'v2_score') as number | null) ?? null,
      alt_grade: (v(r, 'v2_grade') as string | null) ?? null,
      coverage: decodeCoverage(v(r, 'coverage_pct'), v(r, 'coverage_band'), v(r, 'coverage_lb')),
      historical: (v(r, 'is_historical') as boolean | null) ?? null,
      last_year: (v(r, 'last_year') as number | null) ?? null,
      p_grade: (v(r, 'p_grade') as number | null) ?? null,
      flagged_n: (v(r, 'flagged_n') as number | null) ?? 0,
      flagged_value_mxn: (v(r, 'flagged_value_mxn') as number | null) ?? 0,
      trend: (v(r, 'trend') as Trend | null) ?? null,
      trend_slope: (v(r, 'trend_slope') as number | null) ?? null,
    }
  })
  const [xMin, xMax] = p.scale ?? [0, 100]
  return {
    method: 'v3', insts, xMin, xMax,
    lines: [d, c, b, a],
    letters: [[xMin, d, 'F'], [d, c, 'D'], [c, b, 'C'], [b, a, 'B'], [a, xMax, 'A']],
    altLines: V2_LINES,
    altLetters: V2_LETTERS,
    deficientBelow: 60,
    altDeficientBelow: 40,
    pillars: V3_PILLARS,
    calibrationId: p.calibration_id ?? null,
  }
}

function decodeV2(p: FieldPayload): FieldModel {
  const v = cell(p.columns)
  const raw = p.rows.map((r) => Object.fromEntries(V2_PILLARS.map((q) => [q.key, (v(r, q.key) as number) ?? 0])))
  // X-ray: External Flags (pillar_process) replaced by the population mean.
  const mean = raw.length ? raw.reduce((s, q) => s + q.pillar_process, 0) / raw.length : 0
  const insts: FieldInst[] = p.rows.map((r, k) => {
    const pillars = raw[k]
    let loss = { key: V2_PILLARS[0].key, lost: -1 }
    for (const q of V2_PILLARS) {
      const lost = q.max - pillars[q.key]
      if (lost > loss.lost) loss = { key: q.key, lost }
    }
    const score = v(r, 'total_score') as number
    return {
      id: v(r, 'id') as number,
      name: v(r, 'name') as string,
      siglas: (v(r, 'siglas') as string | null) ?? null,
      total_score: score,
      grade: v(r, 'grade') as string,
      fail: DEFICIENT_GRADES.has(v(r, 'grade') as string),
      provisional: v(r, 'confidence_band') === 'wide',
      score_lo: null,
      score_hi: null,
      level: v(r, 'level') as Level,
      group: v(r, 'group') as string,
      kind: (v(r, 'institution_type') as string | null) ?? null,
      size_band: null,
      sector_id: (v(r, 'sector_id') as number | null) ?? null,
      total_contracts: (v(r, 'total_contracts') as number) ?? 0,
      total_amount_mxn: (v(r, 'total_amount_mxn') as number) ?? 0,
      gt: v(r, 'gt_exposed') ? 1 : 0,
      ringed: !!v(r, 'gt_exposed'),
      pillars,
      loss,
      alt_score: score - pillars.pillar_process + mean,
      alt_grade: null,
      coverage: null,
      historical: null,
      last_year: null,
      p_grade: null,
      flagged_n: 0,
      flagged_value_mxn: 0,
      trend: null,
      trend_slope: null,
    }
  })
  return {
    method: 'v2', insts, xMin: 15, xMax: PILLAR_CEILING,
    lines: V2_LINES, letters: V2_LETTERS, altLines: V2_LINES, altLetters: V2_LETTERS,
    deficientBelow: 40, altDeficientBelow: 40, pillars: V2_PILLARS, calibrationId: null,
  }
}

export function decodeField(p: FieldPayload): FieldModel {
  return p.method === 'v3' ? decodeV3(p) : decodeV2(p)
}

/** Mean External Flags under v2 (for X-ray copy). */
export function xrayMean(m: FieldModel): number {
  if (m.method !== 'v2' || !m.insts.length) return 0
  return m.insts.reduce((a, i) => a + (i.pillars.pillar_process ?? 0), 0) / m.insts.length
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/** Wilson score interval for k/n (z = 1.645 → 90%). Returns [lo, hi] in 0..1. */
export function wilson(k: number, n: number, z = 1.645): [number, number] {
  if (n === 0) return [0, 0]
  const p = k / n
  const den = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, mid - half), Math.min(1, mid + half)]
}

export interface Rate {
  n: number
  def: number
  pct: number
  /** Deficient under the alternate score (v3: v2 grade · v2: X-ray). */
  defCf: number
  pctCf: number
  /** The same D/F share weighted by pesos and by contracts («Por pesos» spec §3). */
  val: number
  defVal: number
  pctVal: number
  cnt: number
  defCnt: number
  pctN: number
}

export function rateOf(m: FieldModel, members: number[]): Rate {
  let def = 0
  let defCf = 0
  let val = 0
  let defVal = 0
  let cnt = 0
  let defCnt = 0
  for (const k of members) {
    const i = m.insts[k]
    const d = isDeficient(i)
    if (d) def++
    if (isAltDeficient(i, m)) defCf++
    val += i.total_amount_mxn
    cnt += i.total_contracts
    if (d) { defVal += i.total_amount_mxn; defCnt += i.total_contracts }
  }
  const n = members.length
  return {
    n, def, pct: n ? def / n : 0, defCf, pctCf: n ? defCf / n : 0,
    val, defVal, pctVal: val ? defVal / val : 0, cnt, defCnt, pctN: cnt ? defCnt / cnt : 0,
  }
}

// ---------------------------------------------------------------------------
// Money («Por pesos» spec, key numbers) — computed, never hardcoded
// ---------------------------------------------------------------------------

export interface MoneyFacts {
  total: Rate
  byLevel: Record<Level, Rate>
  federal: Rate
  /** The largest D/F federal buyer by pesos (IMSS today), picked by the data. */
  top: number | null
  /** Federal D/F share of pesos with the top buyer removed (always printed beside `federal.pctVal`). */
  federalPctValExTop: number
  topShareOfFederal: number
  topShareOfFederalDf: number
  /** Federal family with the most D/F pesos (salud today) and its rate. */
  topFamily: { key: string; rate: Rate } | null
  /** Pillar costing the federal D/F buyers the most, by count of buyers. */
  federalDriver: { key: string; share: number } | null
  /** Municipal share of all D/F dots vs of all D/F pesos. */
  municipalDfDotShare: number
  municipalDfValShare: number
  /** The ayuntamientos (municipal · municipio) together, and that as a fraction of the top buyer. */
  municipios: Rate
  municipiosOverTop: number
  top50ShareOfFederal: number
  historicalShareOfFederal: number
}

export function moneyFacts(m: FieldModel): MoneyFacts {
  const idx = m.insts.map((_, i) => i)
  const of = (pred: (i: FieldInst) => boolean) => idx.filter((k) => pred(m.insts[k]))
  const fedIdx = of((i) => i.level === 'federal')
  const federal = rateOf(m, fedIdx)
  const total = rateOf(m, idx)
  const byLevel = {
    federal,
    state: rateOf(m, of((i) => i.level === 'state')),
    municipal: rateOf(m, of((i) => i.level === 'municipal')),
  }
  const fedDf = fedIdx.filter((k) => isDeficient(m.insts[k]))
  const top = fedDf.length ? fedDf.reduce((a, b) => (m.insts[b].total_amount_mxn > m.insts[a].total_amount_mxn ? b : a)) : null
  const topVal = top != null ? m.insts[top].total_amount_mxn : 0
  const fams = new Map<string, number[]>()
  for (const k of fedIdx) {
    const key = m.insts[k].group
    fams.set(key, [...(fams.get(key) ?? []), k])
  }
  let topFamily: MoneyFacts['topFamily'] = null
  for (const [key, members] of fams) {
    const rate = rateOf(m, members)
    if (!topFamily || rate.defVal > topFamily.rate.defVal) topFamily = { key, rate }
  }
  const muniIdx = of((i) => i.group === 'municipal|municipio')
  const municipios = rateOf(m, muniIdx)
  const fedByVal = [...fedIdx].sort((a, b) => m.insts[b].total_amount_mxn - m.insts[a].total_amount_mxn)
  const top50 = fedByVal.slice(0, 50).reduce((a, k) => a + m.insts[k].total_amount_mxn, 0)
  const hist = fedIdx.reduce((a, k) => a + (m.insts[k].historical ? m.insts[k].total_amount_mxn : 0), 0)
  return {
    total,
    byLevel,
    federal,
    top,
    federalPctValExTop: federal.val - topVal > 0 ? (federal.defVal - topVal) / (federal.val - topVal) : 0,
    topShareOfFederal: federal.val ? topVal / federal.val : 0,
    topShareOfFederalDf: federal.defVal ? topVal / federal.defVal : 0,
    topFamily,
    federalDriver: lossDriver(m, fedIdx),
    municipalDfDotShare: total.def ? byLevel.municipal.def / total.def : 0,
    municipalDfValShare: total.defVal ? byLevel.municipal.defVal / total.defVal : 0,
    municipios,
    municipiosOverTop: topVal ? municipios.val / topVal : 0,
    top50ShareOfFederal: federal.val ? top50 / federal.val : 0,
    historicalShareOfFederal: federal.val ? hist / federal.val : 0,
  }
}

// ---------------------------------------------------------------------------
// Steps («Por pesos» spec §3) — URL slugs + the legacy ?step=1..4 map
// ---------------------------------------------------------------------------

export const STEPS = ['instituciones', 'dinero', 'federal', 'grandes', 'locales'] as const
export type Step = typeof STEPS[number]
export type Lens = 'instituciones' | 'pesos' | 'contratos'
export const STEP_LENS: Record<Step, Lens> = {
  instituciones: 'instituciones', dinero: 'pesos', federal: 'pesos', grandes: 'pesos', locales: 'instituciones',
}

/** `?paso=` wins; old `?step=1..4` (round 1) maps 1 → instituciones, 2 → dinero, 3 → federal; 4 (v2↔v3) moved to Hallazgos. */
export function resolveStep(paso: string | null, legacy: string | null): { step: Step; toHallazgos: boolean } {
  if (paso && (STEPS as readonly string[]).includes(paso)) return { step: paso as Step, toHallazgos: false }
  const map: Record<string, Step> = { '1': 'instituciones', '2': 'dinero', '3': 'federal' }
  if (legacy === '4') return { step: 'instituciones', toHallazgos: true }
  return { step: (legacy && map[legacy]) || 'instituciones', toHallazgos: false }
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type Dim = 'all' | 'level' | 'grp' | 'type' | 'sector' | 'size' | 'weakest'
export const FREE_DIMS: Dim[] = ['grp', 'level', 'type', 'sector', 'size', 'weakest']
export const OTHER_KEY = '__other'
export const MIN_GROUP_N = 15

export const SIZE_BANDS = ['<100', '100–1k', '1k–10k', '>10k'] as const
export function sizeBand(contracts: number): string {
  if (contracts < 100) return SIZE_BANDS[0]
  if (contracts < 1000) return SIZE_BANDS[1]
  if (contracts < 10000) return SIZE_BANDS[2]
  return SIZE_BANDS[3]
}

export function keyOf(i: FieldInst, dim: Dim): string {
  switch (dim) {
    case 'all': return 'all'
    case 'level': return i.level
    case 'grp': return i.group
    case 'type': return i.kind ?? 'other'
    case 'sector': return String(i.sector_id ?? 12)
    case 'size': return i.size_band ?? sizeBand(i.total_contracts)
    case 'weakest': return i.loss.key
  }
}

export interface Row extends Rate {
  key: string
  members: number[]
  lo: number
  hi: number
}

/**
 * Group `members` by `dim`, merge groups under MIN_GROUP_N into one «Otros»
 * row (a 1-member group never tops the sort), sort worst-first by %
 * deficient (ties: larger n). With `cf` the alternate view drives the sort.
 */
export function buildRows(m: FieldModel, members: number[], dim: Dim, cf = false): Row[] {
  const by = new Map<string, number[]>()
  for (const k of members) {
    const key = keyOf(m.insts[k], dim)
    const list = by.get(key)
    if (list) list.push(k)
    else by.set(key, [k])
  }
  const kept: [string, number[]][] = []
  const small: number[] = []
  for (const [k, list] of by) {
    if (dim !== 'all' && list.length < MIN_GROUP_N && by.size > 1) small.push(...list)
    else kept.push([k, list])
  }
  if (small.length) kept.push([OTHER_KEY, small])
  const rows = kept.map(([key, list]) => {
    const r = rateOf(m, list)
    const [lo, hi] = wilson(cf ? r.defCf : r.def, r.n)
    return { key, members: list, ...r, lo, hi }
  })
  const pick = (r: Row) => (cf ? r.pctCf : r.pct)
  return rows.sort((a, b) => pick(b) - pick(a) || b.n - a.n)
}

/** Members of `key` under `dim` for the whole population — same merge as buildRows. */
export function membersOf(m: FieldModel, dim: Dim, key: string): number[] {
  return buildRows(m, m.insts.map((_, i) => i), dim).find((r) => r.key === key)?.members ?? []
}

/** Sub-dimension a zoomed row breaks down by. v3 groups already are level|family. */
export function zoomDim(m: FieldModel, dim: Dim): Dim {
  if (dim === 'type') return 'size'
  if (m.method === 'v3' && dim === 'grp') return 'size'
  return 'type'
}

// ---------------------------------------------------------------------------
// Findings (hero + step copy) — the data picks the hero group
// ---------------------------------------------------------------------------

export const HERO_MIN_N = 30

export interface HeroFinding {
  group: Row | null
  overall: Rate
  /** Pillar that most often costs the hero group's deficient members the most. */
  driver: { key: string; share: number } | null
}

export function heroFinding(m: FieldModel): HeroFinding {
  const all = m.insts.map((_, i) => i)
  const overall = rateOf(m, all)
  const group = buildRows(m, all, 'grp').find((r) => r.key !== OTHER_KEY && r.n >= HERO_MIN_N) ?? null
  return { group, overall, driver: group ? lossDriver(m, group.members) : null }
}

/** Among deficient members, the most frequent costliest pillar and its share. */
export function lossDriver(m: FieldModel, members: number[]): { key: string; share: number } | null {
  const count = new Map<string, number>()
  let n = 0
  for (const k of members) {
    const i = m.insts[k]
    if (!isDeficient(i)) continue
    n++
    count.set(i.loss.key, (count.get(i.loss.key) ?? 0) + 1)
  }
  if (!n) return null
  const [key, c] = [...count].sort((a, b) => b[1] - a[1])[0]
  return { key, share: c / n }
}

/** Deficient share among ringed institutions (see `ringed`) vs the rest, current and alternate. */
export function gtShift(m: FieldModel) {
  const acc = { gt: [0, 0, 0], rest: [0, 0, 0] } // n, def, defAlt
  for (const i of m.insts) {
    const a = i.ringed ? acc.gt : acc.rest
    a[0]++
    if (isDeficient(i)) a[1]++
    if (isAltDeficient(i, m)) a[2]++
  }
  const r = (a: number[]) => ({ n: a[0], pct: a[0] ? a[1] / a[0] : 0, pctAlt: a[0] ? a[2] / a[0] : 0 })
  return { gt: r(acc.gt), rest: r(acc.rest) }
}

/** How the alternate→current switch moved deficiency: left / entered the deficient band. */
export function deficientFlows(m: FieldModel) {
  let left = 0
  let entered = 0
  for (const i of m.insts) {
    const now = isDeficient(i)
    const before = isAltDeficient(i, m)
    if (before && !now) left++
    if (!before && now) entered++
  }
  return { left, entered }
}

// ---------------------------------------------------------------------------
// Layout — shared with every Tamiz-family field (lib/field/layout.ts)
// ---------------------------------------------------------------------------

export { layoutField, scoreToX, type Band, type BandSpec, type Geometry, type Layout } from '@/lib/field/layout'

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, [es: string, en: string]> = {
  municipal: ['Municipal', 'Municipal'],
  state_agency: ['Organismo estatal', 'State agency'],
  educational: ['Educativa', 'Educational'],
  other: ['Otro', 'Other'],
  federal_secretariat: ['Secretaría federal', 'Federal secretariat'],
  health_institution: ['Institución de salud', 'Health institution'],
  federal_agency: ['Organismo federal', 'Federal agency'],
  state_enterprise_infra: ['Empresa estatal · infraestructura', 'State enterprise · infrastructure'],
  social_program: ['Programa social', 'Social program'],
  judicial: ['Judicial', 'Judicial'],
  state_government: ['Gobierno estatal', 'State government'],
  research_education: ['Investigación y educación', 'Research & education'],
  state_enterprise_energy: ['Empresa productiva · energía', 'State enterprise · energy'],
  state_enterprise_finance: ['Empresa estatal · finanzas', 'State enterprise · finance'],
  autonomous_constitutional: ['Autónomo constitucional', 'Autonomous constitutional'],
  social_security: ['Seguridad social', 'Social security'],
  regulatory_agency: ['Organismo regulador', 'Regulatory agency'],
  legislative: ['Legislativo', 'Legislative'],
  military: ['Militar', 'Military'],
  // v3 families (grading-v3 §3.2)
  ejecutivo: ['Ejecutivo', 'Executive'],
  municipio: ['Ayuntamiento', 'Municipality'],
  educacion: ['Educación', 'Education'],
  empresa: ['Empresa pública', 'State enterprise'],
  salud: ['Salud', 'Health'],
  autonomo: ['Autónomo', 'Autonomous'],
}

export function institutionTypeLabel(type: string, lang: string): string {
  const entry = TYPE_LABELS[type]
  if (entry) return lang === 'en' ? entry[1] : entry[0]
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const GROUP_LABELS: Record<string, [es: string, en: string]> = {
  all: ['Todas las instituciones', 'All institutions'],
  federal: ['Federal', 'Federal'],
  state: ['Estatal', 'State'],
  estatal: ['Estatal', 'State'],
  municipal: ['Municipal', 'Municipal'],
  'fed-dec': ['Federal descentralizado', 'Federal decentralized'],
  'fed-other': ['Federal · otros', 'Federal · other'],
  muni: ['Municipal', 'Municipal'],
  chica: ['Chicas', 'Small'],
  media: ['Medianas', 'Mid-size'],
  grande: ['Grandes', 'Large'],
  [OTHER_KEY]: ['Otros (grupos con n < 15)', 'Other (groups with n < 15)'],
}

/** Row label for any dim/key; `sectorName` resolves sector ids, `model` resolves pillars. */
export function rowLabel(dim: Dim, key: string, lang: string, sectorName: (id: number) => string, model?: FieldModel): string {
  const pick = (e: [string, string]) => (lang === 'en' ? e[1] : e[0])
  if (dim === 'grp' && key.includes('|')) {
    const [lv, fam] = key.split('|')
    return `${pick(GROUP_LABELS[lv] ?? [lv, lv])} · ${institutionTypeLabel(fam, lang).toLowerCase()}`
  }
  if (GROUP_LABELS[key] && (dim !== 'type' || key === OTHER_KEY)) return pick(GROUP_LABELS[key])
  if (dim === 'type') return institutionTypeLabel(key, lang)
  if (dim === 'sector') return sectorName(Number(key))
  if (dim === 'size') return lang === 'en' ? `${key} contracts` : `${key} contratos`
  if (dim === 'weakest') return model ? pillarName(model, key, lang) : key
  return key
}

/** «Gasto federal por calificación» as board rows (owner 11-07 bar purge): each tier's federal buyers, pesos and share
 *  of all federal pesos, in the tier order given; `top` = the tier holding the most pesos (null with no federal money). */
export function tierLedger<K extends string>(
  insts: { level?: string | null; grade: string; total_amount_mxn: number }[], order: readonly K[], tierOf: (grade: string) => K,
) {
  const fed = insts.filter((i) => i.level === 'federal')
  const tot = fed.reduce((a, i) => a + i.total_amount_mxn, 0)
  if (!tot) return null
  const rows = order.map((k) => {
    const members = fed.filter((i) => tierOf(i.grade) === k)
    const mxn = members.reduce((a, i) => a + i.total_amount_mxn, 0)
    return { k, n: members.length, mxn, share: mxn / tot }
  })
  const top = rows.reduce((a, r) => (r.mxn > a.mxn ? r : a), rows[0])
  return { rows, top, tot }
}
