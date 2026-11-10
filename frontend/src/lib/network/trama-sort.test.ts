import { describe, expect, it } from 'vitest'
import type { CommunityIndexItem } from '@/api/client'
import { sortTrama } from './trama-sort'

const c = (community_id: number, size: number, gt: number, sanc: number, value = 1): CommunityIndexItem => ({
  community_id, size, hub_vendor_id: 1, hub_vendor_name: 'x', avg_risk: 0.1, total_value_mxn: value,
  da_rate: null, sb_rate: null, dominant_sector_name: null, pattern_mix: [], labeled_count: 0,
  gt_vendor_count: gt, sanctioned_count: sanc,
})

const LIST = [
  c(0, 11923, 101, 18), // giant, highest count
  c(1, 4923, 112, 13),  // giant
  c(333, 49, 1, 0),     // one flagged firm: below the ≥ 2 floor
  c(7, 10, 3, 1),       // 40%
  c(8, 100, 10, 0),     // 10%
  c(9, 20, 2, 0),       // 10%, smaller count → after 8
]

describe('sortTrama (La Trama ledger)', () => {
  it('«más señalados»: rate among ≥ 2 flagged, tie by count; giants under the divider', () => {
    const { main, giants } = sortTrama(LIST, 'rate')
    expect(main.map((x) => x.community_id)).toEqual([7, 8, 9, 333])
    expect(giants.map((x) => x.community_id)).toEqual([1, 0])
  })

  it('raw count still sinks the giants; «tamaño» keeps them in place', () => {
    expect(sortTrama(LIST, 'documented').main.map((x) => x.community_id)).toEqual([8, 7, 9, 333])
    const size = sortTrama(LIST, 'size')
    expect(size.giants).toEqual([])
    expect(size.main[0].community_id).toBe(0)
  })
})
