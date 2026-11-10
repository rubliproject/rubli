/**
 * Perceptually-uniform color scales for editorial heatmaps.
 * Locked to bible §2 color vocabulary.
 */

export type HeatmapScale = 'risk' | 'sequential-amber' | 'diverging-cream-red'

function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Map a value to a heatmap fill.
 * Risk scale: cream → amber → red (low → critical).
 * Sequential amber: cream → amber gold.
 * Diverging: cream at midpoint, red high, blue low.
 */
export function scaleToColor(
  v: number,
  min: number,
  max: number,
  scale: HeatmapScale = 'risk',
): string {
  const t = max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)))
  switch (scale) {
    case 'risk': {
      // DESIGN §6.4 ramp-red: paper → red-3 → red-5
      if (t < 0.5) return lerpHex('#ececec', '#e57373', t * 2)
      return lerpHex('#e57373', '#991b1b', (t - 0.5) * 2)
    }
    case 'sequential-amber':
      return lerpHex('#ececec', '#000000', t) // DESIGN §6.4 ramp-ink
    case 'diverging-cream-red':
      // DESIGN §6.4 diverge: C2 blue ↔ paper ↔ red-3
      if (t < 0.5) return lerpHex('#2563eb', '#ececec', t * 2)
      return lerpHex('#ececec', '#e57373', (t - 0.5) * 2)
  }
}
