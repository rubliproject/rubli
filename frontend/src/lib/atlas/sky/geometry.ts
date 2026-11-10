/**
 * «El Atlas» sky geometry — spec .claude/designs/atlas-2026-10-02-spec.md §2.2–§2.3
 * (Kepler Orrery: one shared radial share scale). The server ships formula
 * inputs only (planets.bin); every drawn position is computed here, so the
 * position on screen provably is the legend formula.
 */
import { DATA_LAST_YEAR, getRiskLevelFromScore } from '@/lib/constants'

export const WORLD = 10_000

export interface SkySector {
  id: number; code: string; name_es: string; name_en: string
  x: number; y: number; r: number; value: number; n_stars: number; h_med: number; h_p90: number
}

export interface SkyManifest {
  layout_version: string
  computed_at: string
  data_cut: string
  risk_basis: string
  layout_mode: string
  world: number
  basis: {
    n_stars: number; n_sky: number; n_drawn: number; per_star_max: number; n_vendors_tied: number
    n_ties: number; dropped_ties: number; overflow_to_band: number; public_t1: number; public_t2: number
    public_t3: number; documented_drawn: number; residual_overlaps: number
    total_value_mxn: number; drawn_value_mxn: number; remainder_share: number; backbone_kept_pct: number
    /** S5 A1: Σ each vendor's money at its top buyer — the remainder's denominator */
    primary_value_mxn: number
  }
  anomalies: Record<string, number>
  sectors: SkySector[]
  /** Columnar, sorted by V desc — index = host_idx in planets.bin. */
  stars: {
    id: number[]; name: string[]; siglas: string[]; sector: number[]; x: number[]; y: number[]
    r: number[]; v: number[]; h: number[]; nv: number[]; drawn: number[]
    /** S5 A1: vendors whose top buyer is this star (drawn + band); rem = band money ÷ their money here */
    np: number[]; rem: number[]; linked: number[]
    /** instruments §2.6 (after the years backfill): N_YEARS-bit mask, bit y − 2000 = money at the star in y */
    ym?: number[]
    /** Buyer scope per star (backend stars.lvl): 0 federal · 1 estatal · 2 municipal · 3 otro. Absent before the scope column. */
    lvl?: number[]
  }
  inst_map: { raw: number[]; canon: number[] }
  /** instruments §2.2 meta rows — absent before the years backfill (the rail then hides its histogram) */
  meta?: SkyYearMeta
}

/** Sky-wide year rows, 2000–DATA_LAST_YEAR (index y − 2000), on the sky basis. */
export interface SkyYearMeta {
  year_value: number[]; year_contracts: number[]; inst_reporting: number[]
  /** global «sin datos» years (2004) · leading thin years (2000–01) · sky-wide coverage drop (2019–22) */
  year_gaps: number[]; thin_early: number[]; coverage_drop: number[]
  /** sector id → "{A}>{B}" period-key pair → [star id, 'stop' | 'decline', successor id | null] */
  breaks: Record<string, Record<string, [number, 'stop' | 'decline', number | null][]>>
  /** declared [predecessor, successor, from year] */
  successors: [number, number, number][]
}

export const YEAR0 = 2000
export const N_YEARS = DATA_LAST_YEAR - YEAR0 + 1
/** bit y − 2000 of the year mask */
export const hasYear = (mask: number, y: number) => ((mask >>> (y - YEAR0)) & 1) === 1

export type RiskClass = 0 | 1 | 2 | 3 // low · medium · high · critical
const RISK_CLASS: Record<ReturnType<typeof getRiskLevelFromScore>, RiskClass> = { low: 0, medium: 1, high: 2, critical: 3 }
export const riskClass = (score: number | null | undefined): RiskClass => (score == null ? 0 : RISK_CLASS[getRiskLevelFromScore(score)])

export interface SkyBodies {
  n: number
  vendorId: Uint32Array
  hostIdx: Uint16Array
  share: Float32Array
  year: Uint8Array      // + 2000
  y1: Uint8Array        // + 2000
  flags: Uint8Array
  /** bit0 SAT EFOS definitivo · bit1 SFP sanction · bit2 verified corporate group (§3.6) */
  flags2: Uint8Array
  risk: Uint8Array      // RiskClass via getRiskLevelFromScore
  /** instruments §2.6: N_YEARS-bit year mask at the host (SKY3); all zero under the SKY2 shim — check `hasYears` */
  ym: Uint32Array
  hasYears: boolean
  /** §3.8 period_q per sexenio (fox, calderon, pena_nieto, amlo, sheinbaum): 0 = no money at the host, else 1 + size scale */
  period: Uint8Array[]
  solid: Uint8Array     // dependence ≥ 0.5
  x: Float32Array       // world
  y: Float32Array
  rp: Float32Array      // screen px at Z1 (§2.3 planet size)
  orb: Float32Array     // orbit radius in world units after the de-overlap (tenure arcs ride on it)
  index: Map<number, number> // vendor_id → body index
}

/** GET /atlas/sky/system — one star system (spec §2.9 row 3). */
export interface SkySystemBody {
  vendor_id: number; name: string; share: number; value_mxn: number; first_year: number; last_year: number
  dep: number; risk_here: number | null; n_contracts_here: number; da_here: number; sb_here: number
  flags: number; flags2: number; n_also: number; also: [number, number, number][]; siblings: number[]
  total_contracts: number; total_amount_mxn: number; risk_score: number | null; tier: number; is_gt: boolean
  size_category: string | null; primary_sector_code: string | null
  primary_sector_name_es: string | null; primary_sector_name_en: string | null
  pattern_confidences: Record<string, number> | null
  /** money at this star per sexenio (instruments §2.2); null before the years backfill */
  period_v?: number[] | null
}

/** One star-year on the sky basis (instruments §2.1). hhi null = thin (< 3 vendors or < 1% of the star's money). */
export interface SkyStarYear {
  year: number; value_mxn: number; n_contracts: number; n_vendors: number; hhi: number | null
  top_share: number; top_vendor_id: number; top_name: string | null; thin: boolean
}
export interface SkySystem {
  layout_version: string
  star: { id: number; name: string; siglas: string; sector_id: number; value_mxn: number; n_vendors: number
    h: number; n_drawn: number; drawn_share: number
    /** instruments §2.6 — absent before the years backfill */
    first_data_year?: number | null; last_data_year?: number | null; gap_years?: number[]
    period_v?: number[] | null; period_nv?: number[] | null }
  /** ≤ 26 star-year rows (instruments §2.6); absent before the years backfill */
  years?: SkyStarYear[]
  bodies: SkySystemBody[]
  /** body vendor ids in share order, through ranking_safe() — top-5 + «otros» */
  ranked: number[]
  /** capture belts: share ≥ 50% surviving capture_pair_excluded() */
  capture: number[]
  ghosts: { vendor_id: number; name: string; host_id: number; share: number; first_year: number; last_year: number }[]
  n_ghosts: number
  /** [vendor, partner, shared procedures, red (potential collusion, ranking-safe pair)] */
  cobid: [number, number, number, number][]
  /** [year, value_mxn, n vendors] not drawn */
  remainder: [number, number, number][]
  /** `?vendor=` only. A vendor with no body also carries sky-set membership, its band year and an Expediente row (§3.9). */
  focus: { vendor_id: number; drawn: boolean; sky?: boolean; year?: number | null; row?: SkySystemBody } | null
}

/** Ghost / membership position at star h: the same §2.3 formula at that star's share, mid-year (no slot). */
export function orbitXY(m: SkyManifest, h: number, share: number, firstYear: number): [number, number] {
  const R = m.stars.r[h]
  const r = orbitR(Math.max(share, 1e-7), R)
  const th = theta(firstYear + 0.5)
  return [m.stars.x[h] + r * Math.cos(th), m.stars.y[h] + r * Math.sin(th)]
}

/** §2.5 moon system: R_m = 4 world units; ℓ = R_m·(0.25 + 0.75·clamp((log10 amount − 4)/6, 0, 1)). */
export const MOON_R = 4
export const moonL = (amount: number) => MOON_R * (0.25 + 0.75 * clamp((Math.log10(Math.max(amount, 1)) - 4) / 6, 0, 1))
/** Engraved amount rings (10 K / 1 M / 100 M / 10 B). */
export const AMOUNT_RINGS = [1e4, 1e6, 1e8, 1e10]
/** Fractional year of an ISO date (same clock as θ). */
export function fracYear(iso: string | undefined, fallbackYear?: number): number | null {
  if (iso) {
    const d = Date.parse(iso)
    if (!Number.isNaN(d)) {
      const t = new Date(d)
      const y = t.getUTCFullYear()
      return y + (d - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1))
    }
  }
  return fallbackYear ? fallbackYear + 0.5 : null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** u = clamp(−log10 s / 5, 0, 1): 100% → 0 · 10% → .2 · 1% → .4 · 0.1% → .6 · 0.01% → .8 · ≤ 0.001% → 1 */
export const shareU = (s: number) => clamp(-Math.log10(s) / 5, 0, 1)
export const R_CORE = 0.12
/** Orbit radius in world units for share s around a system of radius R. */
export const orbitR = (s: number, R: number) => R * R_CORE + shareU(s) * (R - R * R_CORE)
/** The clock face: 2001.0 at 12 o'clock round to the end of DATA_LAST_YEAR (2026 = ComprasMX, partial). */
export const RING_YEARS = DATA_LAST_YEAR + 1 - 2001
/** θ(t) = −π/2 + 2π·(t − 2001)/RING_YEARS, clockwise from 12 o'clock (y grows down). */
export const theta = (t: number) => -Math.PI / 2 + (2 * Math.PI * (t - 2001)) / RING_YEARS
/** r★ = clamp(2 + 2.25·log10(V/1e7), 2, 11) screen px. */
export const starPx = (V: number) => clamp(2 + 2.25 * Math.log10(Math.max(V, 1) / 1e7), 2, 11)
/** r_p = 3.5 + 1.25·clamp(log10(v/1e7), 0, 4) screen px — size_q carries the clamp·63.75 (period_q: 1 + clamp·63.5). */
export const planetPx = (sizeQ: number) => 3.5 + 1.25 * (sizeQ / 63.75)
/** Share rings engraved at 10 / 1 / 0.1 / 0.01% and the clipped rim (≤ 0.001%). */
export const SHARE_RINGS = [0.1, 0.01, 0.001, 0.0001]

/**
 * Reference zoom for the within-year de-overlap: the Z1 arrival ρ for a 700 px
 * free height (ρ = 0.42·700/R_sys). Fixed, so positions never depend on the
 * viewport. Offset ≤ 1 body diameter, in/out by slot parity — arbitrary, stamped.
 */
const DEOVERLAP_PX = 0.42 * 700

export function decodeBodies(buf: ArrayBuffer, m: SkyManifest): SkyBodies {
  const head = new DataView(buf)
  const magic = String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3))
  if (magic !== 'SKY1' && magic !== 'SKY2' && magic !== 'SKY3') throw new Error('planets.bin: bad magic')
  const n = head.getUint32(4, true)
  let off = 8
  const take = <T>(Ctor: { new (b: ArrayBuffer, o: number, l: number): T; BYTES_PER_ELEMENT: number }): T => {
    const a = new Ctor(buf, off, n)
    off += n * Ctor.BYTES_PER_ELEMENT
    return a
  }
  const vendorId = take(Uint32Array)
  const hostIdx = take(Uint16Array)
  const shareQ = take(Uint16Array)
  const riskQ = take(Uint16Array)
  const year = take(Uint8Array)
  const slot = take(Uint8Array)
  const nSlots = take(Uint8Array)
  const y1 = take(Uint8Array)
  const sizeQ = take(Uint8Array)
  const flags = take(Uint8Array)
  const flags2 = take(Uint8Array)
  // SKY1 (pre-S3 tables) carries no period_q: every period reads empty until the precompute reruns.
  const period = Array.from({ length: 5 }, () => (magic !== 'SKY1' ? take(Uint8Array) : new Uint8Array(n)))
  // SKY3 appends the N_YEARS-bit year mask as 4 u8 columns (byte 0 first); SKY2 (pre-backfill) shims to empty masks.
  const hasYears = magic === 'SKY3'
  const ym = new Uint32Array(n)
  if (hasYears) {
    const b = Array.from({ length: 4 }, () => take(Uint8Array))
    for (let i = 0; i < n; i++) ym[i] = (b[0][i] | (b[1][i] << 8) | (b[2][i] << 16) | (b[3][i] << 24)) >>> 0
  }

  const share = new Float32Array(n)
  const risk = new Uint8Array(n)
  const solid = new Uint8Array(n)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const rp = new Float32Array(n)
  const orb = new Float32Array(n)
  const index = new Map<number, number>()
  const S = m.stars
  for (let i = 0; i < n; i++) {
    const s = 10 ** (-shareQ[i] / 10000)
    share[i] = s
    risk[i] = riskQ[i] === 65535 ? 0 : RISK_CLASS[getRiskLevelFromScore(riskQ[i] / 10000)]
    solid[i] = flags[i] & 1
    rp[i] = planetPx(sizeQ[i])
    const h = hostIdx[i]
    const R = S.r[h]
    let r = orbitR(s, R)
    const ns = nSlots[i]
    const th = theta(2000 + year[i] + (slot[i] + 0.5) / ns)
    // §2.3 de-overlap (F4): more bodies than the wedge arc holds → radial offset.
    const rho = DEOVERLAP_PX / R
    const diam = (2 * rp[i]) / rho
    const capacity = ((r * 2 * Math.PI) / 25) / diam
    if (ns > capacity) r = clamp(r + (slot[i] % 2 ? 0.5 : -0.5) * diam, R * R_CORE, R)
    orb[i] = r
    x[i] = S.x[h] + r * Math.cos(th)
    y[i] = S.y[h] + r * Math.sin(th)
    index.set(vendorId[i], i)
  }
  return { n, vendorId, hostIdx, share, year, y1, flags, flags2, risk, ym, hasYears, period, solid, x, y, rp, orb, index }
}
