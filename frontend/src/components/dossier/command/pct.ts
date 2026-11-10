// Split out of primitives.tsx so that file exports only components (react-refresh/only-export-components).

/**
 * Canonicalize a rate to a 0–100 percentage, defending against the corrupted
 * vendor_stats / institution rows that store some values as a 0–1 fraction and
 * some as a 0–100 percentage. (See VendorEvidenceTab.normalizeRate / MEMORY.md.)
 * Use for vendor + institution rates.
 */
export function ratePct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const frac = v > 1 ? v / 100 : v
  return Math.max(0, Math.min(100, frac * 100))
}

/**
 * Clamp a rate already on the 0–100 scale (category + sector aggregates are
 * reliably percentages — clamp, never divide).
 */
export function clampPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, v))
}
