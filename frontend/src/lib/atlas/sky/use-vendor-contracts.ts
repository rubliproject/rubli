/**
 * Z2 «El Planeta» moons — spec .claude/designs/atlas-2026-10-02-spec.md §2.5 (F6).
 * The vendor's 100 largest contracts (max_amount enforces the 100 B rule in code)
 * plus the per-year remainder from /contract-aggregate — the same query key
 * «El Expediente» uses, so the aggregate is fetched once.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { contractApi, vendorApi } from '@/api/client'
import { fracYear, riskClass, type RiskClass } from './geometry'

export interface Moon {
  id: number
  t: number               // fractional year (θ clock)
  amount: number
  risk: RiskClass
  da: boolean
  sb: boolean
  /** raw institution id from the contract; the engine maps it to canonical */
  inst: number | null
  institutionName: string
  /** > 10 B or suspect decimal → hollow dashed «por revisar» */
  review: boolean
  /** why it is «por revisar»: a likely decimal error, else the > 10 B flag */
  suspect: boolean
  riskScore: number | null
  procedure: string | null
  date: string
  title: string
}

export function useVendorContracts(vendorId: number | null, enabled: boolean) {
  const list = useQuery({
    queryKey: ['atlas-moons', vendorId],
    queryFn: () => contractApi.getAll({
      vendor_id: vendorId!, sort_by: 'amount_mxn', sort_order: 'desc', per_page: 100, max_amount: 100_000_000_000,
    }),
    enabled: enabled && vendorId != null,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const agg = useQuery({
    queryKey: ['vendor-file-agg', vendorId],
    queryFn: () => vendorApi.getContractAggregate(vendorId!),
    enabled: enabled && vendorId != null,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  return useMemo(() => {
    const moons: Moon[] = []
    let skipped = 0
    let undated = 0
    for (const c of list.data?.data ?? []) {
      const t = fracYear(c.contract_date, c.contract_year)
      if (!(c.amount_mxn > 0)) { skipped++; continue }
      if (t == null) { undated++; continue }
      moons.push({
        id: c.id, t, amount: c.amount_mxn, risk: riskClass(c.risk_score), da: !!c.is_direct_award, sb: !!c.is_single_bid,
        inst: c.institution_id ?? null, institutionName: c.institution_name ?? '',
        review: c.amount_mxn > 1e10 || c.amount_flag === 'suspect_decimal',
        suspect: c.amount_flag === 'suspect_decimal', riskScore: c.risk_score ?? null, procedure: c.procedure_type ?? null,
        date: c.contract_date ?? String(c.contract_year ?? ''), title: c.title ?? '',
      })
    }
    // remainder by year = aggregate count minus drawn moons (not to scale)
    const drawnByYear = new Map<number, number>()
    for (const m of moons) drawnByYear.set(Math.floor(m.t), (drawnByYear.get(Math.floor(m.t)) ?? 0) + 1)
    const remainder = (agg.data?.by_year ?? [])
      .map((b) => [b.year, b.count - (drawnByYear.get(b.year) ?? 0)] as [number, number])
      .filter(([, n]) => n > 0)
    const smallest = moons.length ? Math.min(...moons.map((m) => m.amount)) : 0
    return { moons, remainder, total: agg.data?.total_contracts ?? null, smallest, skipped, undated, ready: list.isSuccess }
  }, [list.data, list.isSuccess, agg.data])
}
