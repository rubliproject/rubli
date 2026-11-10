import { CATEGORICAL, RISK_COLORS } from '@/lib/constants'

// DESIGN.md §6 (palette v2): story-content.ts still carries v1 hexes for lead
// stats (sector greens, ambers, tailwind blues). Figures and copy there are
// frozen, so the colour is mapped here at render: severity red stays red, every
// other hue lands on its categorical family. Non-hex values (CSS vars) pass.
const TO_CAT: Record<string, string> = {
  '#a06820': CATEGORICAL[6], '#f59e0b': CATEGORICAL[6], '#b45309': CATEGORICAL[6], '#a16207': CATEGORICAL[6],
  '#ea580c': CATEGORICAL[6], '#f97316': CATEGORICAL[6], '#eab308': CATEGORICAL[6], '#d4922a': CATEGORICAL[6],
  '#3b82f6': CATEGORICAL[1], '#1e3a5f': CATEGORICAL[1],
  '#8b5cf6': CATEGORICAL[3],
  '#22c55e': CATEGORICAL[2], '#16a34a': CATEGORICAL[2], '#10b981': CATEGORICAL[2],
  '#be123c': CATEGORICAL[4],
  '#64748b': CATEGORICAL[7],
}

export function storyInk(color: string): string {
  const c = color.toLowerCase()
  if (c === RISK_COLORS.critical.toLowerCase()) return RISK_COLORS.critical
  return TO_CAT[c] ?? color
}
