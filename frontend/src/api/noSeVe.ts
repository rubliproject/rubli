/** «Gasto a ciegas» — budget exercised vs contracts visible (backend/api/routers/no_se_ve.py). Amounts in MXN. */
import { api } from './client'

export type NsvGroup = 'proj' | 'ns' | 'civ' | 'ley'

export interface NsvYear {
  year: number
  ur_codes: string | null
  /** null = no Cuenta Pública for that year (register-only rows: 2019, 2026). */
  exercised_cap2356: number | null
  exercised_cap1: number | null
  exercised_cap4: number | null
  exercised_cap6: number | null
  exercised_total: number | null
  trusts_46101: number | null
  contracts_visible_mxn: number
  contracts_n: number
  contracts_da_mxn: number
  pct_visible: number | null
}

export interface NsvEntity {
  entity_key: string
  sort: number
  grp: NsvGroup
  label_es: string
  label_en: string
  short: string
  cp_code: string
  institution_ids: number[]
  project_key: string | null
  years: NsvYear[]
  /** A project's spend on purchases + works by UR and year (the ribbon's bands). */
  by_ur?: { year: number; ramo: number; ur: string; exercised_cap2356: number }[]
  /** The board's sector dot: the sector of its first register institution (Los patrones, MAGENTA; needs backend deploy). */
  sector_id?: number | null
}

export interface NsvContract {
  id: number
  rank: number
  amount_mxn: number
  is_direct_award: boolean
  procedure: string | null
  title: string | null
  risk_score: number | null
  vendor_id: number | null
  /** null = an RFC-shaped name or no vendor (a persona física is named; see persona_fisica). */
  vendor: string | null
  /** the vendor is a persona física: the name shows, always labelled (policy 10-29) */
  persona_fisica?: boolean
  institution_id: number | null
  institution: string | null
  siglas: string | null
  aria_tier: number | null
  /** The board row's columns (Los patrones, MAGENTA; absent until the backend deploy). */
  vendor_is_individual?: boolean
  contract_date?: string | null
  sector_id?: number | null
  category_id?: number | null
  category_es?: string | null
  category_en?: string | null
}

export interface NsvPage { meta: { cp_years: number[]; sources: { cp: string; register: string } }; entities: NsvEntity[] }
export type NsvDrawer = NsvEntity & { top: Record<string, NsvContract[]>; institutions: { id: number; name: string; siglas: string | null }[] }

export const noSeVeApi = {
  async page(): Promise<NsvPage> {
    const { data } = await api.get<NsvPage>('/no-se-ve', { timeout: 60000 })
    return data
  },
  async entity(key: string): Promise<NsvDrawer> {
    const { data } = await api.get<NsvDrawer>(`/no-se-ve/${encodeURIComponent(key)}`, { timeout: 60000 })
    return data
  },
}
