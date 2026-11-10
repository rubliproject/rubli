import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { DATA_CUT_ISO } from '@/lib/constants'

/** The record's cut date as the API reports it (newest ComprasMX publication; moves with the weekly
 *  refresh). Falls back to the build-time DATA_CUT_ISO until it answers, or if it never does. */
export interface DataCut {
  data_cut: string
  /** The last weekly ComprasMX refresh; absent when it failed or never ran. */
  weekly_new_contracts?: number | null
  weekly_finished?: string
  /** How the LATEST weekly run ended: degraded = soft steps failed («actualización parcial»). */
  weekly_status?: 'ok' | 'degraded' | 'failed'
  next_update?: string
}

export const dataCutQuery = {
  queryKey: ['stats', 'data-cut'],
  queryFn: async () => (await api.get<DataCut>('/stats/data-cut')).data,
  staleTime: 60 * 60 * 1000,
  // a restart blip must not leave the shell on the build-time constant for an hour
  retry: 2,
  retryDelay: 1500,
}

export function useDataCutInfo(): DataCut | undefined {
  return useQuery(dataCutQuery).data
}

/** True only while the first answer is on its way (not after an error): callers reserve their space. */
export function useDataCutPending(): boolean {
  return useQuery(dataCutQuery).isPending
}

export function useDataCut(): string {
  return useDataCutInfo()?.data_cut ?? DATA_CUT_ISO
}
