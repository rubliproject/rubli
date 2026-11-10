/**
 * «La Anatomía» — data layer for the institution dossier's grade decomposition
 * and category lens (dossier-grade.md § 3, § 7).
 *
 * The UI (the institution page, components/institution/b2) reads only `AnatomyView`. Two adapters
 * feed it:
 *
 *   fromV3   the live grade from 2026-10-08 (grading-v3): three peer-relative
 *            pillars out of 100 and a POINTS LEDGER (100 + Σ points == score),
 *            a real score interval, provisional flag, badges kept OUT of the
 *            grade (investigated-vendor counts, sanctions, model lens).
 *   fromV2   fallback when an institution has no v3 row: the five stored
 *            pillars (caps from `@/lib/institution-pillars`, ceiling 90), no
 *            points below pillar level.
 *
 * `loadAnatomy` tries v3 first and falls back to v2.
 */
import type { CoverageBand, CoverageInfo } from './coverage'
import { api, getOptional } from '@/api/client'
import { INSTITUTION_PILLARS, PILLAR_CEILING, type InstitutionPillarField } from '@/lib/institution-pillars'
import { institutionTypeLabel } from '@/lib/institutions/field'

// ─── API payloads ────────────────────────────────────────────────────────────

export type Signal = 'red' | 'yellow' | 'green' | null
export type LensMetric = 'da' | 'sb' | 'ye' | 'hr' | 'top1'
export type Quartiles = { p25: number; median: number; p75: number } | null

/** v2: GET /scorecards/institutions/{id}/anatomy */
export interface AnatomyApi {
  institution_id: number
  method_version: string
  grade: string
  score: number
  ceiling: number
  confidence_band: string | null
  n_contracts: number | null
  ci: { lo: number; hi: number } | null
  peer_group: {
    institution_type: string
    is_federal: boolean
    n: number
    rank: number
    median: number | null
    p25: number | null
    p75: number | null
  }
  pillars: Array<{
    key: string
    cap: number
    value: number
    peer: Quartiles
    all: Quartiles
    drivers: Array<{ key: string; value: number; signal: Signal }>
    penalties: Array<{ key: string; points: number }> | null
    category_lens: 'da' | 'ye' | 'hr' | 'top1' | null
    exposure: boolean
  }>
  dragging_pillar: string | null
}

/** v3: GET /scorecards/institutions/{id}/grade-v3 (inst/grades-v3) */
export interface GradeV3Api {
  institution_id: number
  institution_name: string | null
  method_version: string
  calibration_id: string
  grade: string
  tier_key: string
  score: number
  score_lo: number
  score_hi: number
  provisional: boolean
  p_grade: number
  red_flags: string[]
  sanction_gate: boolean
  pillars: Record<string, { score: number; rate: number }>
  peer: { key: string; n: number; level: string; family: string; size_band: string }
  badges: Record<string, number | string | null>
  n_contracts: number
  total_value_mxn: number
  ledger: Array<{ pillar: string; item: string; rate: number | null; national_median: number | null; peer_median: number | null; points: number }>
  /** Cobertura CompraNet (coverage-badge.md); null when not loaded on this DB. */
  coverage?: {
    status: string
    ratio: number | null
    band: CoverageBand | null
    is_lower_bound: boolean
    years: [number, number] | null
  } | null
  computed_at: string
  /** «Por pesos» §7: GT-case vendors it bought from (top 200 by its spend) → /aria?ids=. */
  gt_vendor_ids?: number[]
  /** §6: contracts > 10B MXN inside the graded value. */
  flagged_n?: number
  flagged_value_mxn?: number
}

/** v3 peer context: GET /scorecards/institutions/{id}/peers-v3 */
export interface PeersV3Api {
  institution_id: number
  peer_key: string
  n: number
  rank: number
  score: Quartiles
  pillars: Record<string, Quartiles>
  cut_points: Array<{ grade: string; min: number }>
  data: PeerRow[]
}

export interface PeerRow {
  institution_id: number
  name: string
  score: number
  grade: string
  provisional?: boolean
  confidence_band?: string | null
  is_self: boolean
}

export interface PeersApi {
  institution_id: number
  data: PeerRow[]
}

export interface CategoryLensRow {
  category_id: number
  name_es: string
  name_en: string
  sector_id: number | null
  contract_count: number
  total_value_mxn: number
  spend_share: number | null
  vendor_count: number
  competitive_count: number
  metrics: Record<LensMetric, number | null>
  baseline: Record<LensMetric, number | null>
}

export interface CategoryLensApi {
  institution_id: number
  total_categories: number
  total_contracts: number
  total_value_mxn: number
  data: CategoryLensRow[]
}

export interface CategoryVendorsApi {
  institution_id: number
  category_id: number
  name_es: string
  name_en: string
  contract_count: number
  total_value_mxn: number
  vendor_count: number
  data: Array<{
    rank: number
    vendor_id: number | null
    vendor_name: string | null
    contract_count: number
    total_value_mxn: number
    share: number | null
    da_pct: number | null
    hr_pct: number | null
  }>
}

export const anatomyApi = {
  async get(institutionId: number): Promise<AnatomyApi | null> {
    return getOptional<AnatomyApi>(`/scorecards/institutions/${institutionId}/anatomy`)
  },
  async gradeV3(institutionId: number): Promise<GradeV3Api | null> {
    return getOptional<GradeV3Api>(`/scorecards/institutions/${institutionId}/grade-v3`)
  },
  async peersV3(institutionId: number): Promise<PeersV3Api | null> {
    return getOptional<PeersV3Api>(`/scorecards/institutions/${institutionId}/peers-v3`)
  },
  async peers(institutionId: number): Promise<PeersApi> {
    const { data } = await api.get<PeersApi>(`/scorecards/institutions/${institutionId}/peers`)
    return data
  },
  async categoryLens(institutionId: number, limit = 12): Promise<CategoryLensApi> {
    const { data } = await api.get<CategoryLensApi>(`/institutions/${institutionId}/category-lens?limit=${limit}`)
    return data
  },
  async categoryVendors(institutionId: number, categoryId: number): Promise<CategoryVendorsApi> {
    const { data } = await api.get<CategoryVendorsApi>(`/institutions/${institutionId}/categories/${categoryId}/vendors`)
    return data
  },
}

// ─── View model ──────────────────────────────────────────────────────────────

export type PillarKey = string

export interface LedgerItem {
  key: string
  points: number
  rate: number | null
  nationalMedian: number | null
  peerMedian: number | null
}

export interface PillarView {
  key: PillarKey
  label_es: string
  label_en: string
  short_es: string
  short_en: string
  /** Bullet-track maximum, in the pillar's own units (v2 cap · v3 100). */
  scale: number
  /** Pillar value on `scale`. */
  value: number
  /** Reference median on `scale` (peer median; all-institution median if the group is too small). */
  ref: number | null
  refIsPeer: boolean
  /** Peer (or all-institution) quartiles on `scale`, for the bullet band. */
  band: Quartiles
  allMedian: number | null
  /** Points of the TOTAL this pillar can lose (v2 cap · v3 100/3). */
  maxPts: number
  /** Net points of the total lost on this pillar. */
  lossPts: number
  /** Points the reference median loses (bridge ghost). */
  refLossPts: number | null
  /** v3 points ledger rows for this pillar (sum = −lossPts); null on v2. */
  items: LedgerItem[] | null
  /** v2 stored drivers + signals; empty on v3 (the ledger replaces them). */
  drivers: Array<{ key: string; value: number; signal: Signal }>
  /** Exposure, not process (v2 External flags). */
  exposure: boolean
  /** Category metrics this pillar's lens compares. */
  lens: LensMetric[]
}

export interface Badge {
  key: string
  value: number | string
}

export interface AnatomyView {
  version: 'v2' | 'v3'
  grade: string
  tierKey: string
  score: number
  ceiling: number
  provisional: boolean
  /** v2 sample band (wide/medium/narrow/high); null on v3. */
  band: string | null
  ci: { lo: number; hi: number } | null
  nContracts: number | null
  peer: { n: number; rank: number; median: number | null; label_es: string; label_en: string }
  /** v3 ships the named peer set with the payload; v2 loads it on demand. */
  peerRows: PeerRow[] | null
  pillars: PillarView[]
  dragging: PillarKey | null
  /** Grade cut points on the 0..ceiling axis (bridge hairlines). */
  cuts: Array<{ grade: string; min: number }>
  /** Shown beside the grade, never part of it (v3). */
  badges: Badge[]
  /** Cobertura CompraNet, beside the grade (v3, federal, matched only). */
  coverage: CoverageInfo | null
  redFlags: string[]
  sanctionGate: boolean
  methodVersion: string
  /** Cross-links to the investigation surfaces (v3 only; empty on v2). */
  investigate: { gtVendorIds: number[]; flaggedN: number; flaggedValue: number; totalValue: number }
}

const round1 = (x: number) => Math.round(x * 10) / 10

// ── v2 ──

const V2_KEY_BY_FIELD: Record<InstitutionPillarField, PillarKey> = {
  pillar_openness: 'openness',
  pillar_price: 'process',
  pillar_vendors: 'tail',
  pillar_process: 'external',
  pillar_external: 'independence',
}
const V2_LENS: Record<string, LensMetric[]> = {
  openness: ['da', 'sb'], process: ['ye'], tail: ['hr'], external: [], independence: ['top1'],
}
const V2_CUTS = [
  { grade: 'A', min: 80 }, { grade: 'B+', min: 70 }, { grade: 'B', min: 60 },
  { grade: 'C+', min: 50 }, { grade: 'C', min: 40 }, { grade: 'D', min: 30 },
]

export function fromV2(raw: AnatomyApi): AnatomyView {
  const byKey = new Map(raw.pillars.map((p) => [p.key, p]))
  const pillars: PillarView[] = INSTITUTION_PILLARS.map((spec) => {
    const key = V2_KEY_BY_FIELD[spec.dbField]
    const p = byKey.get(key)
    const value = p?.value ?? 0
    const median = p?.peer?.median ?? p?.all?.median ?? null
    // Rounded once so the ledger label and the bridge ghost agree to the decimal.
    const ref = median == null ? null : round1(median)
    return {
      key,
      label_es: spec.label_es, label_en: spec.label_en, short_es: spec.short_es, short_en: spec.short_en,
      scale: spec.max,
      value,
      ref,
      refIsPeer: p?.peer != null,
      band: p?.peer ?? p?.all ?? null,
      allMedian: p?.peer && p?.all ? p.all.median : null,
      maxPts: spec.max,
      lossPts: Math.max(0, spec.max - value),
      refLossPts: ref != null ? Math.max(0, spec.max - ref) : null,
      items: null,
      drivers: p?.drivers ?? [],
      exposure: p?.exposure ?? key === 'external',
      lens: V2_LENS[key] ?? [],
    }
  })
  const typeEs = institutionTypeLabel(raw.peer_group.institution_type, 'es').toLowerCase()
  const typeEn = institutionTypeLabel(raw.peer_group.institution_type, 'en').toLowerCase()
  return {
    version: 'v2',
    grade: raw.grade,
    tierKey: '',
    score: raw.score,
    ceiling: PILLAR_CEILING,
    provisional: raw.confidence_band === 'wide',
    band: raw.confidence_band,
    ci: raw.ci,
    nContracts: raw.n_contracts,
    peer: {
      n: raw.peer_group.n,
      rank: raw.peer_group.rank,
      median: raw.peer_group.median,
      label_es: `${typeEs} · ${raw.peer_group.is_federal ? 'federal' : 'estatal y municipal'}`,
      label_en: `${raw.peer_group.is_federal ? 'federal' : 'state & municipal'} ${typeEn}`,
    },
    peerRows: null,
    pillars,
    dragging: raw.dragging_pillar,
    cuts: V2_CUTS,
    badges: [],
    coverage: null,
    redFlags: [],
    sanctionGate: false,
    methodVersion: raw.method_version,
    investigate: { gtVendorIds: [], flaggedN: 0, flaggedValue: 0, totalValue: 0 },
  }
}

// ── v3 ──

export const V3_PILLARS: Array<{ key: string; label_es: string; label_en: string; short_es: string; short_en: string; lens: LensMetric[] }> = [
  { key: 'competencia', label_es: 'Competencia', label_en: 'Competition', short_es: 'Competencia', short_en: 'Competition', lens: ['da'] },
  { key: 'proceso', label_es: 'Integridad del proceso', label_en: 'Process integrity', short_es: 'Proceso', short_en: 'Process', lens: ['ye'] },
  { key: 'concentracion', label_es: 'Concentración de proveedores', label_en: 'Supplier concentration', short_es: 'Concentración', short_en: 'Concentration', lens: ['top1'] },
]

const LEVEL_EN: Record<string, string> = { federal: 'federal', estatal: 'state', municipal: 'municipal' }
const FAMILY_LABEL: Record<string, [string, string]> = {
  salud: ['salud', 'health'], educacion: ['educación', 'education'], empresa: ['empresa del Estado', 'state enterprise'],
  autonomo: ['autónomo', 'autonomous'], municipio: ['municipio', 'municipality'], ejecutivo: ['ejecutivo', 'executive'],
}
const SIZE_LABEL: Record<string, [string, string]> = {
  grande: ['grande', 'large'], media: ['mediana', 'medium'], chica: ['chica', 'small'],
}

/** Badge keys shown beside the grade, in display order (grading-v3: never mixed in). */
const BADGE_ORDER = ['gt_vendor_count', 'aria_t1_vendor_count', 'sanctioned_vendor_count', 'model_hr_value_share', 'trend', 'art41_da_share_2023']

export function fromV3(g: GradeV3Api, peers: PeersV3Api | null): AnatomyView {
  const k = V3_PILLARS.length
  const pillars: PillarView[] = V3_PILLARS.map((spec) => {
    const value = g.pillars[spec.key]?.score ?? 0
    const q = peers?.pillars?.[spec.key] ?? null
    const ref = q ? round1(q.median) : null
    const items = g.ledger
      .filter((r) => r.pillar === spec.key)
      .map((r) => ({ key: r.item, points: r.points, rate: r.rate, nationalMedian: r.national_median, peerMedian: r.peer_median }))
      .filter((r) => !(r.key === 'bandera_roja_tope' || r.key === 'tope_sanciones'))
      .sort((a, b) => a.points - b.points)
    const lossPts = -items.reduce((s, r) => s + r.points, 0)
    return {
      ...spec,
      scale: 100,
      value,
      ref,
      refIsPeer: q != null,
      band: q,
      allMedian: null,
      maxPts: 100 / k,
      lossPts: Math.max(0, lossPts),
      refLossPts: ref != null ? (100 - ref) / k : null,
      items,
      drivers: [],
      exposure: false,
    }
  })
  const dragging = [...pillars].sort((a, b) => b.lossPts - a.lossPts)[0]?.key ?? null
  const fam = FAMILY_LABEL[g.peer.family] ?? [g.peer.family, g.peer.family]
  const size = SIZE_LABEL[g.peer.size_band]
  const pooled = g.peer.key.split('|')
  const showSize = pooled.length > 2 && size
  const badges: Badge[] = BADGE_ORDER
    .map((key) => ({ key, value: g.badges[key] }))
    .filter((b): b is Badge => b.value != null && b.value !== '' && b.value !== 'sin_datos' && !(typeof b.value === 'number' && b.value === 0))
  return {
    version: 'v3',
    grade: g.grade,
    tierKey: g.tier_key,
    score: g.score,
    ceiling: 100,
    provisional: g.provisional,
    band: null,
    ci: { lo: g.score_lo, hi: g.score_hi },
    nContracts: g.n_contracts,
    peer: {
      n: peers?.n ?? g.peer.n,
      rank: peers?.rank ?? 0,
      median: peers?.score?.median ?? null,
      label_es: [g.peer.level, fam[0], showSize ? size![0] : null].filter(Boolean).join(' · '),
      label_en: [LEVEL_EN[g.peer.level] ?? g.peer.level, fam[1], showSize ? size![1] : null].filter(Boolean).join(' · '),
    },
    peerRows: peers?.data ?? null,
    pillars,
    dragging,
    cuts: peers?.cut_points ?? [],
    badges,
    coverage: g.coverage && g.coverage.status === 'ok' && g.coverage.ratio != null && g.coverage.band
      ? { ratio: g.coverage.ratio, band: g.coverage.band, lowerBound: g.coverage.is_lower_bound, years: g.coverage.years }
      : null,
    redFlags: g.red_flags,
    sanctionGate: g.sanction_gate,
    methodVersion: g.method_version,
    investigate: {
      gtVendorIds: g.gt_vendor_ids ?? [],
      flaggedN: g.flagged_n ?? 0,
      flaggedValue: g.flagged_value_mxn ?? 0,
      totalValue: g.total_value_mxn ?? 0,
    },
  }
}

/** v3 first (grade + peer context in parallel); the stored v2 pillars when no v3 row exists. */
export async function loadAnatomy(institutionId: number): Promise<AnatomyView | null> {
  try {
    const [g, p] = await Promise.all([
      anatomyApi.gradeV3(institutionId),
      anatomyApi.peersV3(institutionId).catch(() => null),
    ])
    if (g) return fromV3(g, p)
  } catch { /* fall back to the v2 pillars */ }
  try {
    const a = await anatomyApi.get(institutionId)
    return a ? fromV2(a) : null
  } catch {
    return null
  }
}

// ─── Bridge geometry (pure) ─────────────────────────────────────────────────

export interface BridgeStep {
  key: PillarKey
  /** Fractions of the ceiling, 0..1. */
  x0: number
  w: number
  /** Gross bite before a peer credit (v3 ajuste_pares > 0); equals w otherwise. */
  grossX0: number
  /** Ledger segments inside the bite, right → left, as fractions of the ceiling. */
  segments: Array<{ key: string; x0: number; w: number; points: number }>
  /** Peer credit returned (v3), drawn over the left end of the gross bite. */
  credit: { x0: number; w: number; points: number } | null
  ghostX0: number | null
  loss: number
  refLoss: number | null
}

/** From-ceiling waterfall: each pillar's net loss is carved off the running total. */
export function bridgeSteps(v: AnatomyView): BridgeStep[] {
  let running = v.ceiling
  const f = (x: number) => x / v.ceiling
  return v.pillars.map((p) => {
    const right = running
    const losses = (p.items ?? []).filter((i) => i.points < 0)
    const credits = (p.items ?? []).filter((i) => i.points > 0)
    const gross = p.items ? -losses.reduce((s, i) => s + i.points, 0) : p.lossPts
    const credit = p.items ? credits.reduce((s, i) => s + i.points, 0) : 0
    running -= p.lossPts
    let cursor = right
    const segments = losses.map((i) => {
      const w = -i.points
      cursor -= w
      return { key: i.key, x0: f(cursor), w: f(w), points: i.points }
    })
    return {
      key: p.key,
      x0: f(running),
      w: f(p.lossPts),
      grossX0: f(right - gross),
      segments,
      credit: credit > 0 ? { x0: f(right - gross), w: f(credit), points: credit } : null,
      ghostX0: p.refLossPts != null ? f(Math.max(0, right - p.refLossPts)) : null,
      loss: p.lossPts,
      refLoss: p.refLossPts,
    }
  })
}

/** Signed distance from the reference median, in points of the total (negative = worse). */
export function peerDeltas(v: AnatomyView): Array<{ key: PillarKey; delta: number | null }> {
  return v.pillars.map((p) => ({
    key: p.key,
    delta: p.ref != null ? round1(((p.value - p.ref) * p.maxPts) / p.scale) : null,
  }))
}

/** Sample-size pips (v2): wide 1 · medium 2 · narrow 3 · high 4. */
export function bandPips(band: string | null): number {
  return band === 'high' ? 4 : band === 'narrow' ? 3 : band === 'medium' ? 2 : band === 'wide' ? 1 : 0
}

// ─── Category lens (pure) ───────────────────────────────────────────────────

/** The model lens: a badge in v3, offered as a category lens but never graded. */
export const MODEL_LENS = { key: 'modelo', lens: ['hr'] as LensMetric[] }

export function lensOptions(v: AnatomyView | null): Array<{ key: PillarKey; label_es: string; label_en: string; lens: LensMetric[]; badge: boolean }> {
  const base = (v?.pillars ?? V3_PILLARS.map((p) => ({ ...p, lens: p.lens })) as Array<Pick<PillarView, 'key' | 'short_es' | 'short_en' | 'lens'>>)
    .filter((p) => p.lens.length > 0)
    .map((p) => ({ key: p.key, label_es: p.short_es, label_en: p.short_en, lens: p.lens, badge: false }))
  if (v?.version === 'v2') return base
  return [...base, { key: MODEL_LENS.key, label_es: 'Lente del modelo', label_en: 'Model lens', lens: MODEL_LENS.lens, badge: true }]
}

/**
 * Contribution of a category to the excess on a lens: spend share × the
 * percentage points by which the institution exceeds the national baseline for
 * that category (summed over the lens metrics). A metric without a national
 * baseline (top-vendor share) ranks by its absolute value.
 */
export function lensContribution(row: CategoryLensRow, metrics: LensMetric[]): number {
  const share = row.spend_share ?? 0
  let excess = 0
  for (const m of metrics) {
    const v = row.metrics[m]
    if (v == null) continue
    const b = row.baseline[m]
    excess += b == null ? v : Math.max(0, v - b)
  }
  return share * excess
}

export function sortLens(rows: CategoryLensRow[], metrics: LensMetric[], by: 'aporte' | 'gasto'): CategoryLensRow[] {
  const out = [...rows]
  if (by === 'gasto') return out.sort((a, b) => b.total_value_mxn - a.total_value_mxn)
  return out.sort((a, b) => lensContribution(b, metrics) - lensContribution(a, metrics) || b.total_value_mxn - a.total_value_mxn)
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export const METRIC_LABELS: Record<LensMetric, [es: string, en: string]> = {
  da: ['Adjudicación directa', 'Direct award'],
  sb: ['Un solo adjudicado (competitivos)', 'Single award (competitive)'],
  ye: ['Cierre de año', 'Year-end'],
  hr: ['Alto riesgo (modelo)', 'High risk (model)'],
  top1: ['Mayor proveedor', 'Top vendor'],
}

type Kind = 'rate' | 'count' | 'score' | 'pctile' | 'hhi' | 'mxn' | 'text'
const DRIVER_LABELS: Record<string, [es: string, en: string, kind: Kind]> = {
  // v2 stored drivers
  competitive_rate: ['Procedimientos competitivos (por número)', 'Competitive procedures (by count)', 'rate'],
  competitive_rate_value: ['Procedimientos competitivos (por monto)', 'Competitive procedures (by value)', 'rate'],
  single_bid_pct: ['Un solo adjudicado', 'Single award', 'rate'],
  splitting_rate: ['Fraccionamiento', 'Contract splitting', 'rate'],
  year_end_rate: ['Contratos de cierre de año', 'Year-end contracts', 'rate'],
  short_ad_rate: ['Convocatoria corta', 'Short advertisement', 'rate'],
  p90_risk_score: ['Indicador de riesgo, percentil 90', 'Risk indicator, 90th percentile', 'score'],
  avg_risk_score: ['Indicador de riesgo promedio', 'Average risk indicator', 'score'],
  gt_vendor_count: ['Proveedores en casos documentados', 'Vendors in documented cases', 'count'],
  aria_t1_vendors: ['Proveedores ARIA nivel 1', 'ARIA tier-1 vendors', 'count'],
  aria_t2_vendors: ['Proveedores ARIA nivel 2', 'ARIA tier-2 vendors', 'count'],
  efos_vendors: ['Proveedores en lista EFOS (SAT)', 'Vendors on the SAT EFOS list', 'count'],
  hhi_peer_percentile: ['Dispersión del gasto frente a pares (percentil)', 'Spend dispersion vs peers (percentile)', 'pctile'],
  hhi: ['Concentración del gasto (HHI)', 'Spend concentration (HHI)', 'hhi'],
  vendor_count: ['Proveedores distintos', 'Distinct vendors', 'count'],
  // v3 ledger items
  nc_count: ['Contratos no competitivos (por número)', 'Non-competitive contracts (by count)', 'rate'],
  nc_value: ['Contratos no competitivos (por monto)', 'Non-competitive contracts (by value)', 'rate'],
  short: ['Convocatoria corta en licitaciones', 'Short advertisement in tenders', 'rate'],
  ye: ['Contratos de cierre de año', 'Year-end contracts', 'rate'],
  split: ['Fraccionamiento (mismo día, mismo proveedor)', 'Splitting (same day, same vendor)', 'rate'],
  top1: ['Participación del mayor proveedor', 'Top supplier share', 'rate'],
  ajuste_pares: ['Ajuste frente a pares', 'Peer adjustment', 'rate'],
  // v3 badges
  aria_t1_vendor_count: ['Proveedores ARIA nivel 1', 'ARIA tier-1 vendors', 'count'],
  sanctioned_vendor_count: ['Proveedores sancionados', 'Sanctioned vendors', 'count'],
  model_hr_value_share: ['Monto en contratos de alto riesgo (modelo)', 'Value in high-risk contracts (model)', 'rate'],
  trend: ['Tendencia 2018–2025', 'Trend 2018–2025', 'text'],
  art41_da_share_2023: ['Adjudicación directa por excepción Art. 41 (2023+)', 'Art. 41 exception direct awards (2023+)', 'rate'],
}

export function driverLabel(key: string, lang: 'en' | 'es'): string {
  const e = DRIVER_LABELS[key]
  return e ? (lang === 'es' ? e[0] : e[1]) : key
}

const TREND_WORDS: Record<string, [string, string]> = {
  mejora: ['mejora', 'improving'], empeora: ['empeora', 'worsening'], estable: ['estable', 'stable'],
}

export function formatDriver(key: string, value: number | string, lang: 'en' | 'es'): string {
  if (typeof value === 'string') return TREND_WORDS[value]?.[lang === 'es' ? 0 : 1] ?? value.replace(/_/g, ' ')
  const kind = DRIVER_LABELS[key]?.[2] ?? 'count'
  const locale = lang === 'es' ? 'es-MX' : 'en-US'
  switch (kind) {
    case 'rate': return `${(value * 100).toFixed(1)}%`
    case 'score': return `${Math.round(value * 100)}`
    case 'pctile': return `${Math.min(99, Math.round(value * 100))}`
    case 'hhi': return value.toLocaleString(locale, { maximumFractionDigits: 3 })
    default: return Math.round(value).toLocaleString(locale)
  }
}

export function signalWord(s: Signal, lang: 'en' | 'es'): string | null {
  if (s === 'red') return lang === 'es' ? 'rojo' : 'red'
  if (s === 'yellow') return lang === 'es' ? 'ámbar' : 'amber'
  if (s === 'green') return lang === 'es' ? 'en rango' : 'in range'
  return null
}

export function formatPoints(p: number): string {
  const r = round1(p)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}`
}

const ITEM_SHORT: Record<string, [es: string, en: string]> = {
  nc_count: ['no competitivos (n.º)', 'non-competitive (count)'],
  nc_value: ['no competitivos ($)', 'non-competitive ($)'],
  short: ['convocatoria corta', 'short advert'],
  ye: ['cierre de año', 'year-end'],
  split: ['fraccionamiento', 'splitting'],
  hhi: ['HHI', 'HHI'],
  top1: ['mayor proveedor', 'top supplier'],
  ajuste_pares: ['ajuste frente a sus pares', 'adjustment against its peers'],
}

/** Terse ledger-item label for the bridge's label column. */
export function itemShort(key: string, lang: 'en' | 'es'): string {
  return ITEM_SHORT[key]?.[lang === 'es' ? 0 : 1] ?? key
}
