/**
 * useExecutiveSummary — one shared source for the platform's headline figures.
 *
 * Chrome-consistency sweep (2026-06-03): pages were each fetching or hardcoding
 * the "3.05M contracts / 11% high-risk / 9.9T validated" numbers, so they drifted
 * (e.g. a footer hardcoded 3,051,294 while the live count was 3,058,286). This hook
 * is the single source: it queries /executive/summary once (shared react-query
 * cache key) and exposes the canonical derived figures with v0.9.1 fallbacks so
 * the UI is correct before the request resolves and if it errors.
 *
 * NOTE on units: `high_risk_rate` from /executive/summary is ALREADY a percentage
 * (e.g. 10.9), not a 0..1 fraction — consumers display it directly.
 */
import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import type { ExecutiveSummaryResponse } from '@/api/types'

// Canonical fallbacks — prod /executive/summary on 2026-10-28 (v0.9.2, CompraNet + ComprasMX).
// Used until the live request resolves and if it errors. Refresh on each data load or retraining.
const FALLBACK = {
  totalContracts: 3_178_884,
  highRiskRatePct: 9.9,
  totalValueMXN: 10.45e12,
} as const

// Shared cache key — every consumer dedupes onto this one request (App.tsx starts it at boot).
export const executiveSummaryQuery = {
  queryKey: ['executive', 'summary'],
  queryFn: () => analysisApi.getExecutiveSummary(),
  staleTime: 30 * 60 * 1000,
  retry: false,
}

export function useExecutiveSummary() {
  const query = useQuery<ExecutiveSummaryResponse>(executiveSummaryQuery)
  const d = query.data
  return {
    query,
    /** All federal contracts analyzed (live or fallback). */
    totalContracts: d?.headline?.total_contracts ?? FALLBACK.totalContracts,
    /** High-risk+ rate as a PERCENTAGE (e.g. 10.9), display directly. */
    highRiskRatePct: d?.risk?.high_risk_rate ?? FALLBACK.highRiskRatePct,
    /** Validated total contract value in MXN. */
    totalValueMXN: d?.headline?.total_value ?? FALLBACK.totalValueMXN,
    /** Whether the live figures have loaded (false → showing fallbacks). */
    isLive: query.isSuccess,
  }
}
