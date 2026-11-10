import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import type { AdminScandal } from '@/api/types'
import { PERIOD_API_KEY } from '@/lib/administrations'
import { TERM_KEY } from './data'
import type { AdminMeta } from './types'

const EMPTY: AdminScandal[] = []

/** Scandals filed under one term: tier A/B ground-truth cases with a published
 *  /cases page, by the case's start year (GET /analysis/admin-scandals). */
export function useAdminScandals(adminName: AdminMeta['name']): AdminScandal[] {
  const { data } = useQuery({
    queryKey: ['admin-scandals'],
    queryFn: () => analysisApi.getAdminScandals(),
    staleTime: 60 * 60 * 1000,
  })
  return data?.administrations[PERIOD_API_KEY[TERM_KEY[adminName]]] ?? EMPTY
}
