import type { CommunityIndexItem } from '@/api/client'

/** The ONE canonical signal-density formula — risk-weighted pesos per member.
 *  Printed everywhere it sorts (rail pill tooltip, this plate's dek, Fe de
 *  método clause vi). Never duplicated. */
export function signalDensity(c: Pick<CommunityIndexItem, 'avg_risk' | 'total_value_mxn' | 'size'>): number {
  return (c.avg_risk * c.total_value_mxn) / Math.max(c.size, 1)
}
