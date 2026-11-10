/**
 * GET /categories/{id}/cover — the category dossier's first viewport «El caudal»
 * (backend/api/routers/categories.py § get_category_cover). Kept out of client.ts
 * so the cover can ship without touching the shared client.
 */
import { api } from './client'

export interface CoverRank {
  rank: number
  of: number
  value: number
  above: { id: number; name_es: string; name_en: string } | null
  below: { id: number; name_es: string; name_en: string } | null
  all: number[]
}
export interface CoverYear { y: number; n: number; v: number; hr_n: number; flagged: number; da_v: number | null; da_n: number | null }
export interface CoverSupplier {
  id: number
  name: string | null
  n: number
  v: number
  da_v: number
  da_n: number
  flagged: number
  y0: number | null
  y1: number | null
  risk: number | null
  primary_sector_id: number | null
  buyers: { id: number; name: string | null; siglas: string | null; n: number; v: number }[]
  /** [year, contracts, money, direct-award money] */
  years: [number, number, number, number][]
}
export interface CoverPostSupplier { id: number | null; name: string; n: number; v: number; da_v: number; known_here: boolean }
export interface CategoryCoverData {
  category: { id: number; name_es: string; name_en: string; sector_id: number | null; sector_code: string | null }
  totals: { n: number; v: number; da_v: number; da_n: number; hr_n: number; comp_n: number; sb_n: number; flagged: number; vendors: number; buyers: number; y0: number | null; y1: number | null }
  years: CoverYear[]
  suppliers: CoverSupplier[]
  post: { n: number; v: number; da_v: number; da_n: number; no_amount: number; flagged: number; k: number; suppliers: CoverPostSupplier[]; pf: { n: number; v: number } }
  ranks: Record<'money' | 'contracts' | 'da_money' | 'da_count' | 'top3' | 'hr' | 'post', CoverRank | null>
}

export const categoryCoverApi = {
  get: async (categoryId: number): Promise<CategoryCoverData> => {
    // cold category = one 5–10 s scan server-side, then cached per process; 60 s → the cover shows its error line
    const { data } = await api.get(`/categories/${categoryId}/cover`, { timeout: 60_000 })
    return data as CategoryCoverData
  },
}
