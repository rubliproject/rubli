/**
 * Flight stat registry — spec .claude/designs/atlas-2026-10-02-spec.md §3.11.2
 * (NYT camera-follows-narrative: the camera moves, the number is live).
 *
 * No typed figures. Every chapter number is one of these keys, read through a hook
 * that is already shipped (the Story Days live hooks, or the sky's own system hook),
 * on the same query key, so a reader who arrives from /stories reuses the cache.
 * A key that cannot be resolved returns `value: null` and the card prints
 * «Cifra no disponible · fuente: {source}». There is never a fallback number.
 *
 * Withheld-vendor rule: every per-vendor key reads the host system's `ranked`
 * list (ranking_safe on the server); a vendor that is not in it yields no figure.
 */
import { useQuery } from '@tanstack/react-query'
import { caseLibraryApi } from '@/api/client'
import { useYearOverYear, useVendorYearContracts } from '@/components/stories/live/useEmergencyData'
import { usePatternGroups } from '@/components/stories/live/useCaptureData'
import { LAST_FULL_YEAR, MIN_YEAR_CONTRACTS, WINDOW_FROM } from '@/components/stories/live/useCompetitionData'
import { useSkySystem } from '@/lib/atlas/sky/useSky'
import type { SkySystem } from '@/lib/atlas/sky/geometry'
import type { YearOverYearChange } from '@/api/types'
import { formatDualCurrency, formatNumber } from '@/lib/utils'

export type StatKey =
  | 'year.da_rate' | 'star.value' | 'star.share_of' | 'body.value_here'
  | 'vendor.year_value' | 'case.amount' | 'pattern.vendors'

export interface StatParams {
  year?: number; other?: number; inst?: number; vendor?: number; vendors?: number[]; slug?: string; code?: string
}
export interface StatRef { key: StatKey; params: StatParams }
export interface FlightStat {
  state: 'loading' | 'ok' | 'missing'
  value: string | null
  vars: Record<string, string>
  source: string
}

/** The registry: key → the shipped hook it reads and the endpoint the card cites. */
export const FLIGHT_STATS: Record<StatKey, { hook: string; source: (p: StatParams) => string }> = {
  'year.da_rate': { hook: 'useYearOverYear · components/stories/live/useEmergencyData.ts', source: () => '/analysis/year-over-year' },
  'star.value': { hook: 'useSkySystem · lib/atlas/sky/useSky.ts', source: (p) => `/atlas/sky/system?inst=${p.inst}` },
  'star.share_of': { hook: 'useSkySystem · lib/atlas/sky/useSky.ts', source: (p) => `/atlas/sky/system?inst=${p.inst}` },
  'body.value_here': { hook: 'useSkySystem · lib/atlas/sky/useSky.ts', source: (p) => `/atlas/sky/system?inst=${p.inst}` },
  'vendor.year_value': { hook: 'useVendorYearContracts · components/stories/live/useEmergencyData.ts', source: (p) => `/vendors/${p.vendor}/contracts?year=${p.year}` },
  'case.amount': { hook: "useQuery ['case-detail', slug] · as components/stories/live/CaptureFigures.tsx", source: (p) => `/cases/${p.slug}` },
  'pattern.vendors': { hook: 'usePatternGroups · components/stories/live/useCaptureData.ts', source: (p) => `/aria/patterns/${p.code}/institutions` },
}

const MAX_CONTRACT = 100_000_000_000 // .claude/rules/data-validation.md: > 100 B is a data error

export const pct = (v: number, lang: 'en' | 'es') =>
  `${v.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

type Out = { value: string; vars?: Record<string, string> } | null

export function daRate(rows: YearOverYearChange[] | undefined, p: StatParams, lang: 'en' | 'es'): Out {
  const at = (y?: number) => rows?.find((r) => r.year === y && r.contracts >= MIN_YEAR_CONTRACTS)
  const r = at(p.year)
  if (!rows || !r) return null
  const vars: Record<string, string> = {}
  const o = at(p.other)
  if (r.direct_award_pct == null) return null  // no procedure type before 2011 (DQ1 § 2)
  if (o && o.direct_award_pct != null) vars.other = pct(o.direct_award_pct, lang)
  const full = rows.filter((x): x is YearOverYearChange & { direct_award_pct: number } =>
    x.year >= WINDOW_FROM && x.year <= LAST_FULL_YEAR && x.contracts >= MIN_YEAR_CONTRACTS && x.direct_award_pct != null)
  if (full.length) {
    const peak = full.reduce((m, x) => (x.direct_award_pct > m.direct_award_pct ? x : m), full[0])
    vars.peak = pct(peak.direct_award_pct, lang)
    vars.peakYear = String(peak.year)
  }
  return { value: pct(r.direct_award_pct, lang), vars }
}

/** Only ranking-safe bodies of the host count (the system's `ranked` list). */
export function safeBodies(sys: SkySystem | undefined, ids: number[]) {
  if (!sys) return null
  const ok = new Set(sys.ranked)
  return sys.bodies.filter((b) => ids.includes(b.vendor_id) && ok.has(b.vendor_id))
}

export function useFlightStat(ref: StatRef | undefined, lang: 'en' | 'es', lv: string | undefined): FlightStat | null {
  const key = ref?.key
  const p = ref?.params ?? {}
  const sysKey = key === 'star.value' || key === 'star.share_of' || key === 'body.value_here'
  const yoy = useYearOverYear(key === 'year.da_rate')
  const sys = useSkySystem(sysKey ? p.inst ?? null : null, lv)
  const vy = useVendorYearContracts(p.vendor ?? 0, p.year ?? 0, key === 'vendor.year_value')
  const cs = useQuery({
    queryKey: ['case-detail', p.slug],
    queryFn: () => caseLibraryApi.getBySlug(p.slug!),
    staleTime: 60 * 60 * 1000,
    enabled: key === 'case.amount' && !!p.slug,
  })
  // same key as useTwoPatternCohorts → shares /stories' cache
  const pg = usePatternGroups(p.code ?? 'P3', { group: 'institution', limit: 1, vendors: 0, enabled: key === 'pattern.vendors' })
  if (!ref || !key) return null

  const q = key === 'year.da_rate' ? yoy : sysKey ? sys : key === 'vendor.year_value' ? vy : key === 'case.amount' ? cs : pg
  const source = FLIGHT_STATS[key].source(p)
  if (q.isPending && q.fetchStatus !== 'idle') return { state: 'loading', value: null, vars: {}, source }

  let out: Out = null
  if (key === 'year.da_rate') out = daRate(yoy.data, p, lang)
  else if (key === 'star.value' && sys.data) out = { value: formatDualCurrency(sys.data.star.value_mxn) }
  else if (key === 'star.share_of') {
    const b = safeBodies(sys.data, p.vendors ?? [])
    if (b && b.length) out = { value: pct(100 * b.reduce((s, x) => s + x.share, 0), lang), vars: { n: formatNumber(b.length) } }
  } else if (key === 'body.value_here') {
    const b = safeBodies(sys.data, p.vendor != null ? [p.vendor] : [])
    if (b && b.length) out = { value: formatDualCurrency(b[0].value_mxn) }
  } else if (key === 'vendor.year_value' && vy.data?.complete) {
    out = { value: formatDualCurrency(vy.data.rows.reduce((s, r) => s + (r.amount_mxn && r.amount_mxn <= MAX_CONTRACT ? r.amount_mxn : 0), 0)) }
  } else if (key === 'case.amount' && cs.data?.amount_mxn_low) out = { value: formatDualCurrency(cs.data.amount_mxn_low) }
  else if (key === 'pattern.vendors' && pg.data?.cohort) out = { value: formatNumber(pg.data.cohort.total_vendors) }

  return out ? { state: 'ok', value: out.value, vars: out.vars ?? {}, source } : { state: 'missing', value: null, vars: {}, source }
}
