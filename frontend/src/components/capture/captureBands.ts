// Split out of captureAxis.tsx so that file exports only components (react-refresh/only-export-components).
import { RISK_COLORS } from '@/lib/constants'

export type ShareBand = 'low' | 'mid' | 'captured'

/** Band classification against the live thresholds. No green anywhere. */
export function shareBand(share: number, floor: number, ceil: number): ShareBand {
  if (share >= ceil) return 'captured'
  if (share >= floor) return 'mid'
  return 'low'
}

export const BAND_COLOR: Record<ShareBand, string> = {
  low: RISK_COLORS.low, // zinc — low is muted, never green (Bible §3.10)
  mid: RISK_COLORS.medium, // the 25–50% anteroom
  captured: 'var(--color-risk-critical)',
}
