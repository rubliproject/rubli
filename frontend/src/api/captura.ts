/** /captura v2 — companies that live off one federal buyer (backend/api/routers/captura_v2.py). */
import { api } from './client'
import type { BuyerScope } from '@/lib/scope'

export interface CapturaBuyer {
  institution_id: number
  name: string
  siglas: string | null
  sector_id: number
  total: number
  cap: number
  cap_share: number
  n: number
  da: number | null
  m11: number
  post: number
  post_n: number
  post_total: number
  post_total_n: number
  y_total: number[]
  y_cap: number[]
  y_n: number[]
  pf_n: number
  pf_m: number
  pub_n: number
  pub_m: number
  fp_n: number
  n_doc: number
  n_lead: number
  median_years: number
  /** buyer_level (lib/scope.ts): federal | estatal | municipal */
  level?: string | null
}

/** One captive pair (company ≥ 80% of its federal income from one buyer). */
export interface CapturaPair {
  vendor_id: number
  institution_id: number
  name: string
  m: number
  sh: number
  y0: number
  y1: number
  ny: number
  lock0: number | null
  lock1: number | null
  lockrun: number
  da: number | null
  flag: number
  post: number
  post_n: number
  gt: 'doc' | 'lead' | null
  risk: number | null
}

export interface CapturaPairFull extends CapturaPair {
  vt: number
  n: number
  lockn: number
  m11: number
  tier: number | null
  p6: number
  efos: number
  sfp: number
  nbuyers: number | null
  yrs: [number, number][]
}

export interface CapturaTotals {
  vendors_examined: number
  buyers_examined: number
  pairs_examined: number
  pairs: number
  buyers: number
  money: number
  m11: number
  da_money: number
  post_pairs: number
  post_money: number
  pf_pairs: number
  pf_money: number
  doc: number
  lead: number
  flagged: number
  share_mean: number
  years_median: number
  lockrun_median: number
}

export interface CapturaMeta {
  def: { share: number; min_mxn: number; min_years: number; lock: number; y0: number; y1: number; da_from: number; horizon: string }
  post_to: string | null
  totals: CapturaTotals
  pair_fields: (keyof CapturaPair)[]
  updated_at: string
  /** Buyer scope of buyers, pairs and totals; *_examined stay all-buyer. */
  scope?: BuyerScope
}

export interface CapturaContract { id: number; year: number; amount_mxn: number; is_direct_award: number; title: string | null }

/** GET /captura/pair: + [year, contracts, money, direct awards] and the procedure mix (CompraNet rows). */
export interface CapturaPairDetail {
  pair: CapturaPairFull
  contracts: CapturaContract[]
  /** [year, n, mxn, n direct awards — null before 2011 (procedure not recorded, DQ1 § 2)] */
  by_year?: [number, number, number, number | null][]
  proc?: { type: string; n: number; m: number }[]
}

/** One buyer-year ≥ 100 MDP and its largest supplier (captura_majority). kind: co = company (named) ·
 *  pf = persona física (named, labelled; owner policy 2026-10-29) · pub = another public body (not capture). */
export interface MajorityRow {
  institution_id: number
  inst: string | null
  siglas: string | null
  sector_id: number
  year: number
  total: number
  top_m: number
  share: number
  n_vendors: number
  vendor_id: number | null
  vendor: string | null
  kind: 'co' | 'pf' | 'pub'
  /** the same (vendor, buyer) is a captive pair: mutual dependency */
  cap: number
  gt: 'doc' | 'lead' | null
  risk: number | null
  tier: number | null
}
export interface MajoritySexenio { name: string; a: number; b: number; buyer_years: number; half: number; buyers: number; buyers_half: number; money_half: number; spend_half: number }
export interface CapturaMajority {
  meta: { floor: number; half: number; horizon: string; y0: number; y1: number }
  sex: MajoritySexenio[]
  years: { year: number; buyer_years: number; half: number; money_half: number }[]
  /** [institution_id, year, share, kind, cap] — one per buyer-year with a majority holder */
  dots: [number, number, number, MajorityRow['kind'], number][]
  inst: Record<string, [string | null, string | null, number]>
  ledger: MajorityRow[]
}
export interface CasoEvidence { tier: number | null; slug: string | null }
export interface CapturaDoor {
  pair?: { vendor_id: number; institution_id: number; sh: number; m: number; y0: number; y1: number; siglas: string | null; buyer: string | null } | null
  buyer?: { institution_id: number; siglas: string | null; n: number; cap: number; cap_share: number } | null
}

export const capturaApi = {
  async plates(scope: BuyerScope = 'federal'): Promise<{ meta: CapturaMeta; buyers: CapturaBuyer[]; pairs: CapturaPair[] }> {
    const { data } = await api.get<{ meta: CapturaMeta; buyers: CapturaBuyer[]; pairs: unknown[][] }>('/captura/plates', { params: { scope }, timeout: 60000 })
    const F = data.meta.pair_fields
    const pairs = data.pairs.map((t) => Object.fromEntries(F.map((k, i) => [k, t[i]])) as unknown as CapturaPair)
    return { meta: data.meta, buyers: data.buyers, pairs }
  },
  async pair(vendorId: number, institutionId: number): Promise<CapturaPairDetail> {
    const { data } = await api.get('/captura/pair', { params: { vendor_id: vendorId, institution_id: institutionId } })
    return data
  },
  async buyer(institutionId: number): Promise<{ buyer: CapturaBuyer; pairs: CapturaPairFull[] }> {
    const { data } = await api.get(`/captura/buyer/${institutionId}`, { timeout: 60000 })
    return data
  },
  async majority(): Promise<CapturaMajority> {
    const { data } = await api.get('/captura/majority', { timeout: 60000 })
    return data
  },
  async majorityOf(institutionId: number): Promise<{ institution_id: number; half: number; years: MajorityRow[] }> {
    const { data } = await api.get(`/captura/majority/${institutionId}`)
    return data
  },
  /** «Casos»: ARIA tier of every current pair + the documented case's page, keyed `vendor-institution`. */
  async casos(): Promise<Map<string, CasoEvidence>> {
    const { data } = await api.get<{ pairs: [number, number, number | null, string | null][] }>('/captura/casos')
    return new Map(data.pairs.map(([v, i, tier, slug]) => [`${v}-${i}`, { tier, slug }]))
  },
  async door(p: { vendor_id: number } | { institution_id: number }): Promise<CapturaDoor> {
    const { data } = await api.get('/captura/door', { params: p })
    return data
  },
}
