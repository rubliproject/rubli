import { CATEGORICAL } from '@/lib/constants'
/**
 * Comparison color pair — single source of truth for the "A vs B"
 * visualizations on InstitutionCompare and VendorCompare.
 *
 * Was a duplicated cyan/violet hex pair (#06b6d4 + #a78bfa) hardcoded in
 * both pages — dark SaaS palette that fights the cream broadsheet base.
 *
 * The pair below uses the editorial gold accent (warm amber) for slot A
 * and the OECD reference cyan for slot B. Both are already platform
 * tokens and read clearly on cream.
 */

export const COMPARE_COLORS = {
  /** Slot A — C1 ink (DESIGN §6.3). */
  a: 'var(--color-cat-ink)',
  /** Slot B — C2 blue (DESIGN §6.3). */
  b: 'var(--color-cat-blue)',
} as const

/** Resolved hex values for charts that need a literal color string at
 *  build time (e.g. recharts <Cell/>). Use the var refs above wherever
 *  CSS will resolve the variable. */
export const COMPARE_HEX = {
  a: CATEGORICAL[0], // ink; white in the night edition (lib/theme.ts runs before this module evaluates)
  b: '#2563eb',
} as const
