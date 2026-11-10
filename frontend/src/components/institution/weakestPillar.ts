// Split out of PillarBoleta.tsx so that file exports only components (react-refresh/only-export-components).
import { INSTITUTION_PILLARS, pillarLabel } from '@/lib/institution-pillars'
import type { PillarBoletaItem, WeakestPillar } from './PillarBoleta'

/** Weakest pillar = argmin(value / max) over the canonical 5-pillar map. */
export function getWeakestPillar(item: PillarBoletaItem, lang: string): WeakestPillar {
  let worst: WeakestPillar | null = null
  for (const p of INSTITUTION_PILLARS) {
    const value = (item[p.dbField] as number) ?? 0
    const max = p.max > 0 ? p.max : 1
    const frac = value / max
    if (!worst || frac < worst.frac) {
      worst = { pillar: p, value, frac, label: pillarLabel(p, lang) }
    }
  }
  return worst as WeakestPillar
}
