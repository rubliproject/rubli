/**
 * One query-options factory per entity detail endpoint, so every surface that
 * reads the same vendor / institution / sector shares one cache entry instead
 * of refetching it under its own key (pattern: hooks/useVendorData gateQueries).
 * Callers spread it and add their own `enabled` / `retry`.
 */
import { queryOptions } from '@tanstack/react-query'
import { ariaApi, institutionApi, sectorApi, vendorApi } from '@/api/client'
import type { BuyerScope } from '@/lib/scope'

const MIN = 60 * 1000

export const vendorDetailQuery = (id: number) =>
  queryOptions({ queryKey: ['vendor', id], queryFn: () => vendorApi.getById(id), staleTime: 5 * MIN })

/** /vendors/:id/categories — the vendor's «Conexiones» categories door (vendor dossier + ARIA case). */
export const vendorCategoriesQuery = (id: number) =>
  queryOptions({ queryKey: ['vendor', id, 'categories'], queryFn: () => vendorApi.getCategories(id), staleTime: 30 * MIN })

export const institutionDetailQuery = (id: number) =>
  queryOptions({ queryKey: ['institution', id], queryFn: () => institutionApi.getById(id), staleTime: 5 * MIN })

export const sectorDetailQuery = (id: number, scope: BuyerScope = 'federal') =>
  queryOptions({ queryKey: ['sector', id, scope], queryFn: () => sectorApi.getById(id, scope), staleTime: 5 * MIN })

/** /aria/rosettes — the Focos Rojos wall and the Portada card read the same entry. */
export const ariaRosettesQuery = (perVendor: number, set: 'tier1' | 'nuevos', tier = 2) =>
  queryOptions({ queryKey: ['aria-rosettes', set, tier, perVendor], queryFn: () => ariaApi.getRosettes(perVendor, set, tier), staleTime: 10 * MIN })
