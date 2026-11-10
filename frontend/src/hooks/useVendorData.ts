/**
 * useVendorData — consolidated data hook for the Vendor dossier.
 *
 * Replaces ~18 individual useQuery calls previously inlined at the top of
 * VendorProfile. Groups them by eagerness so the tab-scoped queries only fire
 * when their tab is active.
 *
 * Eager (on mount):
 *   - vendor, riskProfile, contracts (page 1), institutions, coBidders,
 *     externalFlags, qqw, lifecycle, footprint, groundTruthStatus,
 *     linkedScandals, aria (scorecard only with `withScorecard`)
 *
 * Tab-deferred:
 *   - waterfall, peerComparison, histogram, rollingTimeline     → Evidence tab
 *
 * User-gated:
 *   - aiSummary                                                  → explicit load
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { ariaApi, networkApi, scorecardApi, vendorApi } from '@/api/client'
import { vendorDetailQuery } from '@/api/entityQueries'
import type {
  ContractHistogramResponse,
  VendorQQWResponse,
  VendorWaterfallContribution,
} from '@/api/types'
import type { VendorScorecardData } from '@/components/ui/ScorecardWidgets'

const MIN = 60 * 1000
const HOUR = 60 * MIN

export type VendorTabKey = 'overview' | 'evidence' | 'activity' | 'network' | 'aria'

interface UseVendorDataOptions {
  /** Active tab — no longer used for gating; kept for API compat. */
  activeTab?: VendorTabKey
  /** Page for the contracts list (1-based). */
  contractsPage?: number
  /** Gate for the AI summary query. */
  loadAiSummary?: boolean
  /** Page size for contracts. */
  contractsPerPage?: number
  /** Fetch the vendor scorecard (only the legacy print profile renders it). */
  withScorecard?: boolean
}

const notFoundRetry = (count: number, err: unknown) => {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status !== 404 && count < 2
}

// The queries the dossier skeleton waits on (VendorDossier), shared with the
// landing prefetch so the keys cannot drift.
export const gateQueries = (id: number) => ({
  vendor: vendorDetailQuery(id),
  externalFlags: { queryKey: ['vendor-external-flags', id], queryFn: () => vendorApi.getExternalFlags(id), staleTime: 10 * MIN },
  groundTruthStatus: { queryKey: ['vendor', id, 'ground-truth-status'], queryFn: () => vendorApi.getGroundTruthStatus(id), staleTime: 30 * MIN },
  aria: { queryKey: ['vendor', id, 'aria-detail'], queryFn: () => ariaApi.getVendorDetail(id), staleTime: 10 * MIN },
  waterfall: { queryKey: ['vendor', id, 'risk-waterfall'], queryFn: () => vendorApi.getRiskWaterfallDetail(id), staleTime: 10 * MIN },
})

/** Start the skeleton-gating requests before the dossier chunk has rendered. */
export function prefetchVendorDossier(queryClient: QueryClient, id: number) {
  const g = gateQueries(id)
  void queryClient.prefetchQuery(g.vendor)
  void queryClient.prefetchQuery(g.externalFlags)
  void queryClient.prefetchQuery(g.groundTruthStatus)
  void queryClient.prefetchQuery(g.aria)
  void queryClient.prefetchQuery(g.waterfall)
}

export function useVendorData(
  vendorIdRaw: string | number | undefined,
  opts: UseVendorDataOptions
) {
  const {
    contractsPage = 1,
    loadAiSummary = false,
    contractsPerPage = 50,
    withScorecard = false,
  } = opts

  const vendorId =
    vendorIdRaw == null || vendorIdRaw === ''
      ? undefined
      : typeof vendorIdRaw === 'number'
        ? vendorIdRaw
        : Number(vendorIdRaw)
  const enabled = vendorId != null && Number.isFinite(vendorId)
  const gate = gateQueries(vendorId!)

  // ───────────────────────────── Eager queries ────────────────────────────
  const vendor = useQuery({
    ...gate.vendor,
    enabled,
    retry: notFoundRetry,
  })
  // Secondary queries start alongside the vendor row instead of after it (a
  // serial 0.2–1.4 s hop before 15 requests could begin, and the dossier
  // skeleton waits on four of them). Once the row 404s they stop; 4xx is never
  // retried, so a bad id costs one round of 404s.
  const secondaryEnabled = enabled && !vendor.isError

  const riskProfile = useQuery({
    queryKey: ['vendor', vendorId, 'risk-profile'],
    queryFn: () => vendorApi.getRiskProfile(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 5 * MIN,
  })

  const contracts = useQuery({
    queryKey: ['vendor', vendorId, 'contracts', contractsPage, contractsPerPage],
    placeholderData: (prev, prevQ) => (prevQ?.queryKey[1] === vendorId ? prev : undefined), // page flips only, never another vendor's rows
    queryFn: () =>
      vendorApi.getContracts(vendorId!, {
        per_page: contractsPerPage,
        page: contractsPage,
      }),
    enabled: secondaryEnabled,
    staleTime: 2 * MIN,
  })

  // Population-scoped contract census (total / no-competition / single award /
  // active-year range / repeat structure) computed server-side over ALL of the
  // vendor's contracts — not the 50-row page. Lets the Activity register print
  // an honest "X de Y sin competencia" census instead of a page-sample claim.
  const contractAggregate = useQuery({
    queryKey: ['vendor', vendorId, 'contract-aggregate'],
    queryFn: () => vendorApi.getContractAggregate(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 10 * MIN,
    retry: false,
  })

  const institutions = useQuery({
    queryKey: ['vendor', vendorId, 'institutions'],
    queryFn: () => vendorApi.getInstitutions(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 5 * MIN,
  })

  const coBidders = useQuery({
    queryKey: ['vendor', vendorId, 'co-bidders'],
    queryFn: () => networkApi.getCoBidders(vendorId!, 5, 10),
    enabled: secondaryEnabled,
    staleTime: 10 * MIN,
    retry: false,
  })

  // No placeholder for the flag queries: the global keepPreviousData would show the
  // PREVIOUS vendor's EFOS / case / ARIA flags on the next vendor's hero — a false
  // accusation on screen (joker evaluation 2026-10-19 #1).
  const externalFlags = useQuery({ ...gate.externalFlags, enabled: secondaryEnabled, placeholderData: undefined })

  const qqw = useQuery<VendorQQWResponse>({
    queryKey: ['vendor-qqw', vendorId],
    queryFn: () => vendorApi.getQQW(vendorId!),
    enabled: secondaryEnabled,
    staleTime: HOUR,
  })

  const lifecycle = useQuery({
    queryKey: ['vendor', vendorId, 'risk-timeline'],
    queryFn: () => vendorApi.getRiskTimeline(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 10 * MIN,
  })

  const footprint = useQuery({
    queryKey: ['vendor', vendorId, 'footprint'],
    queryFn: () => vendorApi.getFootprint(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 10 * MIN,
  })

  const groundTruthStatus = useQuery({ ...gate.groundTruthStatus, enabled: secondaryEnabled, placeholderData: undefined })

  const linkedScandals = useQuery({
    queryKey: ['vendor', vendorId, 'linked-scandals'],
    queryFn: () => vendorApi.getLinkedScandals(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 30 * MIN,
  })

  const aria = useQuery({ ...gate.aria, enabled: secondaryEnabled, retry: false, placeholderData: undefined })

  const scorecard = useQuery<VendorScorecardData | null>({
    queryKey: ['vendor', vendorId, 'scorecard'],
    queryFn: () => scorecardApi.getVendor(vendorId!) as Promise<VendorScorecardData | null>,
    enabled: secondaryEnabled && withScorecard,
    staleTime: HOUR,
    retry: false,
  })

  // ─────────────────────────── Tab-deferred queries ───────────────────────
  // One request, two views of the same cache entry: the contributions and the
  // number of contracts whose stored z-features they average (the basis line).
  const waterfallQuery = { ...gate.waterfall, enabled: secondaryEnabled, placeholderData: undefined }
  const waterfall = useQuery({ ...waterfallQuery, select: (d: { items: VendorWaterfallContribution[] }) => d.items })
  const waterfallBasis = useQuery({
    ...waterfallQuery,
    select: (d: { total_contracts: number; source: 'z_features' | 'v52' | null }) => ({ n: d.total_contracts, source: d.source }),
  })

  const peerComparison = useQuery({
    queryKey: ['vendor', vendorId, 'peer-comparison'],
    queryFn: () => vendorApi.getPeerComparison(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 10 * MIN,
  })

  const histogram = useQuery<ContractHistogramResponse>({
    queryKey: ['vendor', vendorId, 'contract-histogram'],
    queryFn: () => vendorApi.getContractHistogram(vendorId!),
    enabled: secondaryEnabled,
    staleTime: 30 * MIN,
    retry: false,
  })

  const rollingTimeline = useQuery({
    queryKey: ['vendor', vendorId, 'rolling-timeline'],
    queryFn: () => vendorApi.getRollingTimeline(vendorId!),
    enabled: secondaryEnabled,
    staleTime: HOUR,
    retry: false,
  })

  // ───────────────────────────── User-gated ───────────────────────────────
  const aiSummary = useQuery({
    queryKey: ['vendor', vendorId, 'ai-summary'],
    queryFn: () => vendorApi.getAiSummary(vendorId!),
    enabled: vendor.isSuccess && loadAiSummary,
    staleTime: 30 * MIN,
  })

  // Derived signals that every consumer needs.
  const hasCoBiddingRisk =
    coBidders.data?.co_bidders?.some(
      (cb) =>
        cb.relationship_strength === 'very_strong' ||
        cb.relationship_strength === 'strong'
    ) || (coBidders.data?.suspicious_patterns?.length ?? 0) > 0

  const isLoading =
    vendor.isLoading || riskProfile.isLoading || contracts.isLoading

  return {
    // core identity + risk
    vendor,
    riskProfile,
    scorecard,
    // activity
    contracts,
    contractAggregate,
    institutions,
    lifecycle,
    footprint,
    // evidence (deferred)
    waterfall,
    peerComparison,
    histogram,
    rollingTimeline,
    waterfallBasis,
    // network
    coBidders,
    // external signals
    externalFlags,
    qqw,
    groundTruthStatus,
    linkedScandals,
    // investigation
    aria,
    // ai
    aiSummary,
    // derived
    hasCoBiddingRisk,
    isLoading,
  }
}

export type VendorData = ReturnType<typeof useVendorData>
