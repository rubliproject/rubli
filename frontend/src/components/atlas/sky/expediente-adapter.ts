/**
 * «El Expediente» adapter — spec .claude/designs/atlas-2026-10-02-spec.md §3.5 (b).
 * VendorFile.tsx keeps its frozen contract (it is also the /dashboard drawer): the sky
 * builds a full AtlasClusterVendorItem from the system-endpoint row instead of widening
 * its props. is_gt = documented only (label_sets, server-side), tier = public basis.
 */
import { PATTERN_LABELS } from '@/lib/aria/patterns'
import type { AtlasClusterVendorItem } from '@/api/client'
import type { SkySystemBody } from '@/lib/atlas/sky/geometry'
import { getRiskLevelFromScore } from '@/lib/constants'

export function toClusterItem(row: SkySystemBody, lang: 'en' | 'es'): AtlasClusterVendorItem {
  const score = row.risk_score ?? 0
  return {
    vendor_id: row.vendor_id,
    name: row.name,
    size_category: row.size_category,
    risk_score: row.risk_score ?? null,
    risk_level: getRiskLevelFromScore(score),
    tier: row.tier,
    total_contracts: row.total_contracts,
    total_amount_mxn: row.total_amount_mxn,
    primary_sector_code: row.primary_sector_code ?? 'otros',
    primary_sector_name: (lang === 'en' ? row.primary_sector_name_en : row.primary_sector_name_es) ?? '',
    is_gt: row.is_gt,
    pattern_confidences: row.pattern_confidences,
  }
}

/** Public ARIA pattern names — the canon in lib/aria/patterns (signals, not offences). */
export const patternLabels = (lang: 'en' | 'es'): Record<string, string> =>
  Object.fromEntries(Object.entries(PATTERN_LABELS).map(([k, v]) => [k, v[lang]]))
