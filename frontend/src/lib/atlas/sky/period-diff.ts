/**
 * «Qué cambió» — the sexenio diff of one star, as a pure function. Spec
 * .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.4, §2.5, F1, F3, F6, F19.
 *
 * Order of checks: (1) coverage refusal — the star has no money in A or B, or has no records for at least
 * half of a period's data years (gap years, before its first or after its last year): no marks, no counts,
 * never «departures» of a star that stopped reporting; (2) the declared successor line; (3) the sector's
 * decline daggers; (4) Sheinbaum: «sexenio en curso» and the period lengths. Arrivals and departures are
 * marks; share-swing whiskers only for suppliers present in both periods, drawn only when ≥ 8 px at the
 * Z1 scale. Counts are among the drawn bodies only; institution-wide supplier counts come from period_nv.
 */
import { ADMINISTRATIONS } from '@/lib/administrations'
import { DATA_LAST_YEAR } from '@/lib/constants'
import { R_CORE, shareU, type SkyManifest, type SkySystem, type SkyYearMeta } from './geometry'
import { PERIOD_KEYS, type PeriodKey } from './url-state'

export const WHISKER_MIN_PX = 8
const YEAR_MAX = DATA_LAST_YEAR

export interface DiffStar {
  id: number; siglas: string; sector_id: number
  period_v?: number[] | null; period_nv?: number[] | null
  first_data_year?: number | null; last_data_year?: number | null; gap_years?: number[]
}
export interface DiffBody { vendor_id: number; name: string; public: boolean; period_v?: number[] | null }
export interface DiffRow { vendor_id: number; name: string; public: boolean; a: number; b: number }
export interface DiffStay extends DiffRow { shareA: number; shareB: number; dpp: number; decades: number; px: number; drawn: boolean }
export interface DiffNote { star: number; kind: 'stop' | 'decline'; successor: number | null; year: number | null }

export interface PeriodDiff {
  A: PeriodKey; B: PeriodKey
  moneyA: number; moneyB: number
  nvA: number | null; nvB: number | null
  /** the refusal: the period (and its missing years) the star has no records for; `coverage` = inside the 2019–22 drop */
  refused: { period: PeriodKey; years: number[]; coverage: boolean } | null
  nDrawn: number
  arrivals: DiffRow[]; departures: DiffRow[]; stays: DiffStay[]
  /** top 5 up and top 5 down by Δ share among stays */
  up: DiffStay[]; down: DiffStay[]
  /** declared successor of this star when the handover falls by the end of B */
  successor: { to: number; year: number } | null
  /** the sector's dagger rows for (A, B), this star first */
  daggers: DiffNote[]
  /** «sexenio en curso» + the two period lengths in years, when either side is Sheinbaum */
  current: { lenA: number; lenB: number } | null
}

const span = (p: PeriodKey) => {
  const a = ADMINISTRATIONS[PERIOD_KEYS.indexOf(p)]
  return [a.yearStart, Math.min(a.yearEnd, YEAR_MAX)] as const
}

/** Years of period p this star has no records for (its gap years, before its first, after its last). */
export function missingYears(star: DiffStar, p: PeriodKey, globalGaps: number[] = []): number[] {
  const [y0, y1] = span(p)
  const gaps = new Set(star.gap_years ?? [])
  const out: number[] = []
  for (let y = y0; y <= y1; y++) {
    if (globalGaps.includes(y)) continue
    if (gaps.has(y) || (star.first_data_year != null && y < star.first_data_year) || (star.last_data_year != null && y > star.last_data_year)) out.push(y)
  }
  return out
}

/** Years the period spans in the data: 6 for a closed sexenio, the partial fraction for the one in progress. */
export function periodLength(p: PeriodKey, dataCut: string): number {
  if (p !== 'sheinbaum') return 6
  const cut = Date.parse(`${dataCut}T00:00:00Z`), y0 = Date.UTC(2025, 0, 1)
  return Number.isNaN(cut) ? 0 : Math.round(((cut - y0) / (365.25 * 864e5)) * 100) / 100
}

/** Whisker length in screen px between two shares on a system of radius rPx (the §2.3 orbit formula). */
export const whiskerPx = (sa: number, sb: number, rPx: number) => rPx * (1 - R_CORE) * Math.abs(shareU(sa) - shareU(sb))

export function periodDiff(o: {
  star: DiffStar; bodies: DiffBody[]; A: PeriodKey; B: PeriodKey
  meta: Pick<SkyYearMeta, 'breaks' | 'successors' | 'coverage_drop' | 'year_gaps'> | null
  /** the star's radius in screen px at its Z1 arrival (the 8 px floor is read at this scale) */
  rPx: number
  dataCut: string
}): PeriodDiff {
  const { star, A, B, meta } = o
  const ia = PERIOD_KEYS.indexOf(A), ib = PERIOD_KEYS.indexOf(B)
  const pv = star.period_v ?? [], pnv = star.period_nv ?? null
  const moneyA = pv[ia] ?? 0, moneyB = pv[ib] ?? 0
  const out: PeriodDiff = {
    A, B, moneyA, moneyB, nvA: pnv ? pnv[ia] : null, nvB: pnv ? pnv[ib] : null, refused: null, nDrawn: o.bodies.length,
    arrivals: [], departures: [], stays: [], up: [], down: [], successor: null, daggers: [], current: null,
  }

  // (1) F1: a star that stopped (or had not yet started) reporting is refused, never read as departures
  const gg = meta?.year_gaps ?? []
  for (const p of [B, A]) {
    const miss = missingYears(star, p, gg)
    const [y0, y1] = span(p)
    let n = 0
    for (let y = y0; y <= y1; y++) if (!gg.includes(y)) n++
    // ponytail: «at least half the period's data years missing» is the refusal threshold; per-year diffs if it proves coarse
    if ((p === B ? moneyB : moneyA) <= 0 || miss.length * 2 >= n) {
      out.refused = { period: p, years: miss, coverage: miss.some((y) => (meta?.coverage_drop ?? []).includes(y)) }
      break
    }
  }

  // (2) declared successor: the handover falls by the end of B
  const succ = meta?.successors.find(([from]) => from === star.id)
  if (succ && succ[2] <= span(B)[1]) out.successor = { to: succ[1], year: succ[2] }

  // (3) F6: the sector's daggers for the ordered pair, this star first
  const rows = meta?.breaks[String(star.sector_id)]?.[`${A}>${B}`] ?? []
  out.daggers = rows.map(([id, kind, s]) => ({ star: id, kind, successor: s, year: s != null ? meta?.successors.find(([f]) => f === id)?.[2] ?? null : null }))
    .sort((x, y) => Number(y.star === star.id) - Number(x.star === star.id))

  // (4) the term in progress
  if (A === 'sheinbaum' || B === 'sheinbaum') out.current = { lenA: periodLength(A, o.dataCut), lenB: periodLength(B, o.dataCut) }

  if (out.refused) return out

  for (const b of o.bodies) {
    const a = b.period_v?.[ia] ?? 0, bb = b.period_v?.[ib] ?? 0
    const row: DiffRow = { vendor_id: b.vendor_id, name: b.name, public: b.public, a, b: bb }
    if (a > 0 && bb > 0) {
      const shareA = a / moneyA, shareB = bb / moneyB
      const px = whiskerPx(shareA, shareB, o.rPx)
      out.stays.push({ ...row, shareA, shareB, dpp: (shareB - shareA) * 100, decades: Math.log10(shareB / shareA), px, drawn: px >= WHISKER_MIN_PX })
    } else if (bb > 0) out.arrivals.push(row)
    else if (a > 0) out.departures.push(row)
  }
  out.arrivals.sort((x, y) => y.b - x.b)
  out.departures.sort((x, y) => y.a - x.a)
  out.stays.sort((x, y) => Math.abs(y.dpp) - Math.abs(x.dpp))
  out.up = out.stays.filter((s) => s.dpp > 0).slice(0, 5)
  out.down = out.stays.filter((s) => s.dpp < 0).slice(0, 5)
  return out
}

/** The diff of a fetched system: drawn bodies, public = ranking-safe with a name (F16). */
export function systemDiff(sys: SkySystem, meta: SkyManifest['meta'] | null | undefined, A: PeriodKey, B: PeriodKey, rPx: number, dataCut: string): PeriodDiff {
  const ranked = new Set(sys.ranked)
  return periodDiff({
    star: sys.star, A, B, meta: meta ?? null, rPx, dataCut,
    bodies: sys.bodies.map((b) => ({ vendor_id: b.vendor_id, name: b.name, public: ranked.has(b.vendor_id) && !!b.name, period_v: b.period_v })),
  })
}

/** The plate's marks by vendor id (≤ 30 paths): top-10 arrivals, top-10 departures, top-10 drawable whiskers. */
export function diffMarks(d: PeriodDiff | null): { arrive: number[]; depart: number[]; whiskers: [number, number, number][] } | null {
  if (!d || d.refused) return null
  return {
    arrive: d.arrivals.slice(0, 10).map((r) => r.vendor_id), depart: d.departures.slice(0, 10).map((r) => r.vendor_id),
    whiskers: d.stays.filter((s) => s.drawn).slice(0, 10).map((s) => [s.vendor_id, s.shareA, s.shareB]),
  }
}

/** `cmp=s251-pena_nieto~s251-amlo` (same star at launch, §5) → its parts; a written token from them. */
export function cmpOf(cmp: string | null): { star: number; A: PeriodKey; B: PeriodKey } | null {
  const m = cmp ? /^s(\d{1,10})-([a-z_]+)~s(\d{1,10})-([a-z_]+)$/.exec(cmp) : null
  const ok = (p: string) => (PERIOD_KEYS as readonly string[]).includes(p)
  return m && m[1] === m[3] && ok(m[2]) && ok(m[4]) ? { star: Number(m[1]), A: m[2] as PeriodKey, B: m[4] as PeriodKey } : null
}
export const cmpToken = (star: number, A: PeriodKey, B: PeriodKey) => `s${star}-${A}~s${star}-${B}`

/** The default pair (Parpadeo's): the selected period and its predecessor; else Peña Nieto → AMLO. */
export function defaultPair(period: PeriodKey | null): [PeriodKey, PeriodKey] {
  const i = period ? PERIOD_KEYS.indexOf(period) : 3
  return i > 0 ? [PERIOD_KEYS[i - 1], PERIOD_KEYS[i]] : [PERIOD_KEYS[0], PERIOD_KEYS[1]]
}

/** `tab=diff.{A}.{B}` → the ordered pair. */
export function diffOf(tab: string | null): [PeriodKey, PeriodKey] | null {
  const m = tab ? /^diff\.([a-z_]+)\.([a-z_]+)$/.exec(tab) : null
  if (!m || !(PERIOD_KEYS as readonly string[]).includes(m[1]) || !(PERIOD_KEYS as readonly string[]).includes(m[2])) return null
  return [m[1] as PeriodKey, m[2] as PeriodKey]
}

/** 2019, 2020, 2021, 2022 → «2019–2022»; non-contiguous years are listed. */
export function yearsLabel(ys: number[]): string {
  if (!ys.length) return ''
  const contiguous = ys.every((y, i) => i === 0 || y === ys[i - 1] + 1)
  return contiguous ? (ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`) : ys.join(', ')
}
