/**
 * useCompetitionData — the live cuts behind «Ahora ve usted la competencia»
 * (SD-08).
 *
 * ## The denominator, which is the whole story
 *
 * A single award is only meaningful against a *competitive* procedure: a direct
 * award draws one vendor by construction, so counting it would be counting the
 * definition. `.claude/rules/data-validation.md` says exactly that — single award
 * is a competitive procedure that ended with one winner — and the register's
 * `is_single_bid` flag is set that way.
 *
 * Two endpoints report a "single-award rate" and they do **not** divide by the
 * same thing:
 *
 *   /analysis/year-over-year   single_bid / (contracts - direct awards)   ← def.
 *   /sectors/{id}/trends       single_bid / (contracts - direct awards)   ← def.
 *   /sectors  single_bid_pct   single_bid / contracts
 *   /analysis/single-bid-rate  single_bid / contracts   (its docstring claims
 *                                                        otherwise — it is the
 *                                                        docstring that is wrong)
 *
 * For Infraestructura that is 88.99% against 61.12% — the same numerator over
 * two different worlds. Printing one beside the other, as the story used to,
 * invites the reader to compare them. So every figure here states the rate over
 * **competitive procedures**, and derives it from counts rather than trusting a
 * percentage field: `/sectors` carries `single_bid_count` and
 * `direct_award_count`, so the competitive denominator is a subtraction, not a
 * reconstruction from a rounded percent.
 *
 * ## The window starts in 2011
 *
 * Before 2010 the register does not code procedure type: `direct_award_pct` is
 * 0.00 for every year from 2002 to 2009 (COMPRANET Structure A). Every contract
 * therefore looks competitive, so the "rate" for those years is single-award procedures over
 * *all* contracts, and it cannot be compared with anything after. 2010 is a
 * seam: since the 2026-09-30 contract_year migration it holds 35,992 Structure A
 * rows and only 5,377 coded B rows (direct award 11.08%), so 2011 is the first
 * year with a comparable rate. This is what F2 draws, and it is why the story's
 * old thesis — that the CompraNet mandate *raised* the single-award rate — does
 * not survive: measured against all contracts, the same series falls from 37.4%
 * (2009) to 17.9% (2011). The jump is the denominator changing, not the market.
 *
 * ## What the endpoints actually say (probed 2026-09-19)
 *
 *   - Peak year is **2014 at 65.65%**, not 2011 at 64.4% (2011 is the first
 *     year above 60).
 *   - The run above 45% is **2011-2024, fourteen years**, floor 45.89% in 2022.
 *   - Single-award contracts 2011-2024 total **~362,000**, not "800,000+". The
 *     whole register, 2002-2025, holds 505,219 — the story's own ch3 said
 *     504,903 while ch1 and ch5 said 800,000.
 *   - 2025 is a partial year: the federal feed froze at 2025-09-28.
 */
import { useQueries, useQuery } from '@tanstack/react-query'
import { analysisApi, sectorApi, vendorApi } from '@/api/client'
import type { SectorStatistics, VendorDetailResponse, YearOverYearChange } from '@/api/types'

const HOUR = 60 * 60 * 1000

/** The first year the register codes procedure type. */
export const WINDOW_FROM = 2011
/** The last complete year — the federal feed froze at 2025-09-28. */
export const LAST_FULL_YEAR = 2024
/** The floor of the run the story's kicker claims. */
export const BAND_FLOOR = 45
/**
 * The same window counted the other way, for F5's caption.
 *
 * `/analysis/monthly-breakdown/{year}` reports `SUM(is_single_bid)` per month;
 * summing 2011-2024's months gives this. The figures reconstruct their counts
 * from `year-over-year`'s percentages instead, because that keeps F5's bars and
 * F1's line on one source and so incapable of disagreeing — and the two answers
 * differ by 15 contracts in 362,000, which is the two-decimal rounding. Re-run
 * 2026-09-30 on the contract_year-migrated register (SUM(is_single_bid) by
 * contract_year, amount <= 100B). Refresh it when the register moves past
 * 2025-09-28.
 */
export const MONTHLY_CROSSCHECK_2011_2024 = 361614

/**
 * A year holding fewer contracts than this is a register artefact, not a year:
 * the table carries rows dated 2000 (1 contract), 2001 (19) and 2004 (7), and a
 * rate over a denominator of seven says nothing. SD-07 hit the same rows.
 */
export const MIN_YEAR_CONTRACTS = 1000

// ── queries ───────────────────────────────────────────────────────────────

/** F1, F2 and F5 — one request, three figures. */
export function useYearSeries(enabled = true) {
  return useQuery({
    queryKey: ['analysis', 'year-over-year'],
    queryFn: () => analysisApi.getYearOverYear(),
    staleTime: HOUR,
    enabled,
  })
}

/** F3 — the 12 sectors with both counts, so the denominator is a subtraction. */
export function useSectorStats(enabled = true) {
  return useQuery({
    queryKey: ['sectors', 'all'],
    queryFn: () => sectorApi.getAll(),
    staleTime: HOUR,
    enabled,
  })
}

/**
 * F4 — the vendors that won the most competitions unopposed.
 *
 * There is no "rank vendors by single-award count" endpoint, and `sort_by`
 * offers only `single_bid_pct`, a *rate*, whose top is a vendor with three
 * contracts and one bid. So the pool is the 300 vendors holding the most
 * contracts, and the ranking is done here over `single_bid_count`.
 *
 * That is not a heuristic — it is exhaustive down to a stated depth. A vendor's
 * single-award wins can never exceed its contract count, so any vendor outside a
 * pool cut at N contracts has fewer than N wins. The pool's cut is 853, so
 * every vendor with 853 wins or more is inside it, and `POOL_PAGES` is sized to
 * keep it that way. `provableDepth` below reports where the guarantee stops.
 */
export const POOL_PAGES = [1, 2, 3] as const
export const POOL_PER_PAGE = 100
/** Detail pulls for the top of the ranking — the list route omits the counts. */
export const DETAIL_DEPTH = 8

export function useWinnerPool(enabled = true) {
  return useQuery({
    queryKey: ['vendors', 'sb-pool', POOL_PER_PAGE * POOL_PAGES.length],
    queryFn: async () => {
      const pages = await Promise.all(
        POOL_PAGES.map((page) =>
          vendorApi.getAll({
            sort_by: 'total_contracts',
            sort_order: 'desc',
            per_page: POOL_PER_PAGE,
            page,
          }),
        ),
      )
      return pages.flatMap((p) => p.data)
    },
    staleTime: HOUR,
    enabled,
  })
}

/**
 * Exact counts for the head of the ranking.
 *
 * The list route returns `single_bid_pct` but not `single_bid_count`, and a
 * product of two rounded percents is off by a contract or two — which is fine
 * for ordering and not fine for printing. The detail route carries both counts,
 * so the ranking is decided from the list and every printed number comes from
 * the detail.
 */
export function useWinnerDetails(ids: number[], enabled = true) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['vendor', id],
      queryFn: () => vendorApi.getById(id),
      staleTime: HOUR,
      enabled,
    })),
  })
}

// ── derived readings ──────────────────────────────────────────────────────

export interface YearReading {
  year: number
  contracts: number
  /** Contracts that were not direct awards — the denominator that counts. */
  competitive: number
  /** Competitive procedures that ended with exactly one winner. */
  singleBid: number
  /** `singleBid / competitive`, percent. The definition. */
  rate: number
  /** `singleBid / contracts`, percent. The other denominator, for F2. */
  shareOfAll: number
  directAwardPct: number
  /** Procedure type is not coded before 2010 — `rate` is not comparable. */
  uncoded: boolean
  /** 2025 stops at the register's horizon, 2025-09-28. */
  partial: boolean
}

/**
 * The series, as counts.
 *
 * `year-over-year` reports percentages, so the counts are reconstructed:
 * competitive = contracts x (1 - direct-award share), single-award procedures = that x the
 * rate. Both percentages carry two decimals, so each year lands within a
 * handful of contracts of the register's own SUM — the build probe put the
 * 2011-2024 total 15 contracts (0.004%) below the sum of the monthly
 * breakdowns, which count the same rows directly.
 */
export function readYears(rows: YearOverYearChange[]): YearReading[] {
  return rows
    .filter((r) => r.contracts >= MIN_YEAR_CONTRACTS)
    .map((r) => {
      // null = no procedure type (before 2011, DQ1 § 2) → an uncoded year with zero counts
      const da = r.direct_award_pct ?? 0
      const competitive = r.direct_award_pct == null ? 0 : Math.round((r.contracts * (100 - da)) / 100)
      const singleBid = Math.round((competitive * (r.single_bid_pct ?? 0)) / 100)
      return {
        year: r.year,
        contracts: r.contracts,
        competitive,
        singleBid,
        rate: r.single_bid_pct ?? 0,
        shareOfAll: r.contracts > 0 ? (singleBid / r.contracts) * 100 : 0,
        directAwardPct: da,
        uncoded: r.direct_award_pct == null || r.direct_award_pct < 0.5,
        partial: r.year > LAST_FULL_YEAR,
      }
    })
    .sort((a, b) => a.year - b.year)
}

/** The comparable window: 2011 onwards, where procedure type is coded all year. */
export const inWindow = (r: YearReading) => r.year >= WINDOW_FROM

/** The highest rate in the window, partial years excluded. */
export function readPeak(years: YearReading[]): YearReading | undefined {
  const full = years.filter((r) => inWindow(r) && !r.partial)
  return full.length ? full.reduce((a, b) => (b.rate > a.rate ? b : a)) : undefined
}

export interface Run {
  from: number
  to: number
  length: number
  /** The lowest rate inside the run, and the year that set it. */
  floor: YearReading
}

/** The longest unbroken stretch at or above `threshold`, partial years aside. */
export function readRun(years: YearReading[], threshold = BAND_FLOOR): Run | undefined {
  const full = years.filter((r) => inWindow(r) && !r.partial)
  let best: YearReading[] = []
  let cur: YearReading[] = []
  for (const r of full) {
    if (r.rate >= threshold) cur.push(r)
    else {
      if (cur.length > best.length) best = cur
      cur = []
    }
  }
  if (cur.length > best.length) best = cur
  if (!best.length) return undefined
  return {
    from: best[0].year,
    to: best[best.length - 1].year,
    length: best.length,
    floor: best.reduce((a, b) => (b.rate < a.rate ? b : a)),
  }
}

/** Single-award contracts summed across an inclusive year range. */
export function sumSingleBid(years: YearReading[], from: number, to: number): number {
  return years.filter((r) => r.year >= from && r.year <= to).reduce((s, r) => s + r.singleBid, 0)
}

export interface SectorReading {
  sectorId: number
  name: string
  color: string
  singleBid: number
  competitive: number
  contracts: number
  /** Percent of contracts in competitive procedures — what the figure ranks on. */
  rate: number
  /** Percent of all contracts — the other published number, printed as such. */
  shareOfAll: number
}

export function readSectors(rows: SectorStatistics[]): SectorReading[] {
  return rows
    .map((s) => {
      const competitive = s.total_contracts - s.direct_award_count
      return {
        sectorId: s.sector_id,
        name: s.sector_name,
        color: s.color,
        singleBid: s.single_bid_count,
        competitive,
        contracts: s.total_contracts,
        rate: competitive > 0 ? (s.single_bid_count / competitive) * 100 : 0,
        shareOfAll: s.total_contracts > 0 ? (s.single_bid_count / s.total_contracts) * 100 : 0,
      }
    })
    .sort((a, b) => b.rate - a.rate)
}

export interface WinnerReading {
  id: number
  name: string
  singleBid: number
  competitive: number
  contracts: number
  rate: number
  directAwardPct: number
  value: number
  firstYear?: number
  lastYear?: number
}

export function readWinner(v: VendorDetailResponse): WinnerReading {
  const competitive = v.total_contracts - v.direct_award_count
  return {
    id: v.id,
    name: v.name,
    singleBid: v.single_bid_count,
    competitive,
    contracts: v.total_contracts,
    rate: competitive > 0 ? (v.single_bid_count / competitive) * 100 : 0,
    directAwardPct: v.direct_award_pct ?? 0,  // vendor list rows are 2011+ by construction (story filters)
    value: v.total_value_mxn,
    firstYear: v.first_contract_year,
    lastYear: v.last_contract_year,
  }
}

/**
 * The two registry entities Day 3 treats as one firm — EFECTIVALE S DE RL DE CV
 * (45016, 2010-2025) and EFECTIVALE,S.A. DE C.V. (64, 2002-2010). The story
 * printed their merged 2,210 wins against entity 64 alone, whose own figure is
 * 1,055. The merge is kept; the attribution is not.
 */
export const EFECTIVALE_PRIMARY = 45016
export const EFECTIVALE_LEGACY = 64

/**
 * How deep the ranking is exhaustive.
 *
 * Everyone outside the pool holds fewer contracts than the pool's smallest
 * member, so they hold fewer wins than that too. Rows above the cut are
 * therefore the complete top of the register; rows below it are the top of the
 * pool, which is not the same claim and is not made.
 */
export function provableDepth(ranked: WinnerReading[], poolCut: number): number {
  const i = ranked.findIndex((w) => w.singleBid < poolCut)
  return i < 0 ? ranked.length : i
}
