/**
 * La Trama's ledger order (merge § 5, owner pass 2026-10-08).
 *
 * The default «más señalados» reads the RATE of flagged firms (documented case +
 * SFP sanction) per member, among communities with at least 2 such firms; ties go
 * to the larger count. A raw count crowned the market-plumbing giants (C-0, 11,923
 * firms; C-1, 4,923): above GIANT firms a community is too big to read as a group,
 * so — in every order but «tamaño» — the giants sink under a divider.
 */
import type { CommunityIndexItem } from '@/api/client'

export type TramaSort = 'rate' | 'documented' | 'risk' | 'size' | 'value'

export const GIANT = 1000
const MIN_FLAGGED = 2

/** documented + sanctioned (a firm with both counts twice — the index does not dedupe them) */
export const flagged = (c: CommunityIndexItem) => c.gt_vendor_count + c.sanctioned_count
export const flaggedRate = (c: CommunityIndexItem) => (c.size > 0 ? flagged(c) / c.size : 0)

export function sortTrama(list: CommunityIndexItem[], key: TramaSort): { main: CommunityIndexItem[]; giants: CommunityIndexItem[] } {
  const by: Record<Exclude<TramaSort, 'rate'>, (c: CommunityIndexItem) => number> = {
    documented: flagged,
    risk: (c) => c.avg_risk,
    size: (c) => c.size,
    value: (c) => c.total_value_mxn,
  }
  const cmp = key === 'rate'
    ? (a: CommunityIndexItem, b: CommunityIndexItem) => {
        const ea = flagged(a) >= MIN_FLAGGED ? 1 : 0, eb = flagged(b) >= MIN_FLAGGED ? 1 : 0
        return eb - ea || (ea ? flaggedRate(b) - flaggedRate(a) : 0) || flagged(b) - flagged(a) || b.total_value_mxn - a.total_value_mxn
      }
    : (a: CommunityIndexItem, b: CommunityIndexItem) => by[key](b) - by[key](a) || b.total_value_mxn - a.total_value_mxn
  const sorted = [...list].sort(cmp)
  if (key === 'size') return { main: sorted, giants: [] }
  return { main: sorted.filter((c) => c.size <= GIANT), giants: sorted.filter((c) => c.size > GIANT) }
}
