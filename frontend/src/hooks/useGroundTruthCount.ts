import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import { GROUND_TRUTH_CASE_COUNT_FALLBACK, GROUND_TRUTH_VENDOR_COUNT_FALLBACK } from '@/lib/constants'

/**
 * Returns live ground-truth counts from the executive summary API,
 * falling back to compiled constants when the request is still loading
 * or fails. This prevents stale hardcoded values from accumulating
 * across files after each retraining event.
 */
export function useGroundTruthCount() {
  const { data } = useQuery({
    queryKey: ['executive-summary-gt-count'],
    queryFn: () => analysisApi.getExecutiveSummary(),
    staleTime: 10 * 60 * 1000,
  })
  return {
    cases: data?.ground_truth?.cases ?? GROUND_TRUTH_CASE_COUNT_FALLBACK,
    vendors: data?.ground_truth?.vendors ?? GROUND_TRUTH_VENDOR_COUNT_FALLBACK,
  }
}

/**
 * Weekend F8: case counts as display strings, never a typed fallback.
 * `atTraining` = labelled cases on record when the active model was trained
 * (/analysis/model/metadata gt_cases_at_training); `today` = the live case set.
 * A missing figure reads «cifra no disponible» / "figure unavailable" (an em dash while loading).
 */
export function useCaseCountLabels(lang: 'en' | 'es') {
  const meta = useQuery({
    queryKey: ['model', 'metadata'],
    queryFn: () => analysisApi.getModelMetadata(),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
  const exec = useQuery({
    queryKey: ['executive-summary-gt-count'],
    queryFn: () => analysisApi.getExecutiveSummary(),
    staleTime: 10 * 60 * 1000,
  })
  const fmt = (n: number | null | undefined, loading: boolean) =>
    typeof n === 'number' ? n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')
      : loading ? '—' : lang === 'es' ? 'cifra no disponible' : 'figure unavailable'
  return {
    atTraining: fmt(meta.data?.gt_cases_at_training, meta.isLoading),
    today: fmt(exec.data?.ground_truth?.cases, exec.isLoading),
  }
}
