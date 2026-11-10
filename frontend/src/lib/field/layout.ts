/**
 * Dot-field layout — the shared geometry behind the Tamiz-family canvases
 * (/institutions «El Tamiz», /categories «El Anaquel»).
 *
 * A deterministic quantized dodge beeswarm in row bands: dot i is always
 * entity i, so a new layout tweens the same dots (NYT Upshot object
 * constancy). `specs` partition the population; a `rail` band squeezes its
 * members onto one faint line (the zoomed-out remainder).
 */

export interface BandSpec {
  key: string
  members: number[]
  rail?: boolean
  depth?: number
}

export interface Band {
  key: string
  y0: number
  h: number
  mid: number
  rail: boolean
  depth: number
}

export interface Geometry {
  width: number
  plotX0: number
  plotW: number
  /** Axis domain. */
  xMin: number
  xMax: number
  r: number
  gap: number
  labelH: number
  axisH: number
  railH: number
  /** Phone: a line above the rail's dots for its label, so the label never sits on them. Default 0. */
  railLabelH?: number
  minRowH: number
  maxH: number
  /**
   * Optional cap on a column's dots above/below the midline. A full column
   * spills into the nearest column with room (a packed beeswarm), so a value
   * shared by hundreds of dots (0% or 100% direct award) widens instead of
   * towering. A dot moves at most MAX_SPILL columns. Omitted = unlimited
   * (El Tamiz's original behaviour).
   */
  maxStack?: number
  /**
   * Optional cap on a column's half-height, in dot rows. A taller column is
   * squeezed into a pile (dots overlap, x stays true), so one value shared by
   * thousands of entities darkens instead of towering. Omitted = no cap.
   */
  maxColK?: number
}

export interface Layout {
  x: Float32Array
  y: Float32Array
  r: Float32Array
  a: Float32Array
  bands: Band[]
  height: number
  dotR: number
}

export const scoreToX = (score: number, g: Pick<Geometry, 'plotX0' | 'plotW' | 'xMin' | 'xMax'>) => {
  const t = (Math.min(g.xMax, Math.max(g.xMin, score)) - g.xMin) / (g.xMax - g.xMin)
  return g.plotX0 + t * g.plotW
}

/** Furthest a capped column may push a dot sideways, in columns (≈ 3 dot widths). */
const MAX_SPILL = 3

function place(scores: ArrayLike<number>, specs: BandSpec[], n: number, g: Geometry, r: number): Layout {
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const rr = new Float32Array(n)
  const a = new Float32Array(n)
  const d = 2 * r + g.gap
  // Pass 1: column-bin each band by x, stack each column alternately above/below
  // the midline, in score order — O(n), deterministic.
  const binned = specs.map((s) => {
    if (s.rail) return null
    const sorted = [...s.members].sort((p, q) => scores[p] - scores[q] || p - q)
    const cols = new Map<number, number>()
    const off = new Map<number, number>()
    const colOf = new Map<number, number>()
    let maxK = 0
    const cap = g.maxStack != null ? 2 * g.maxStack + 1 : Infinity
    const lastCol = Math.floor(g.plotW / d)
    for (const m of sorted) {
      let px = scoreToX(scores[m], g)
      let c = Math.floor((px - g.plotX0) / d)
      if ((cols.get(c) ?? 0) >= cap) {
        // Nearest in-plot column with room: c−1, c+1, c−2, … at most MAX_SPILL
        // columns away, so no dot drifts visibly off its value; past that the
        // column grows after all (and the shrink loop below takes over).
        for (let step = 1; step <= MAX_SPILL; step++) {
          const cand = [c - step, c + step].find((q) => q >= 0 && q <= lastCol && (cols.get(q) ?? 0) < cap)
          if (cand != null) {
            px += (cand - c) * d
            c = cand
            break
          }
        }
      }
      const k = cols.get(c) ?? 0
      cols.set(c, k + 1)
      const o = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2)
      off.set(m, o)
      colOf.set(m, c)
      maxK = Math.max(maxK, Math.abs(o))
      x[m] = px
    }
    if (g.maxColK != null && maxK > g.maxColK) {
      const cap = g.maxColK
      const colMax = new Map<number, number>()
      for (const m of sorted) colMax.set(colOf.get(m)!, Math.max(colMax.get(colOf.get(m)!) ?? 0, Math.abs(off.get(m)!)))
      for (const m of sorted) {
        const cm = colMax.get(colOf.get(m)!)!
        if (cm > cap) off.set(m, (off.get(m)! * cap) / cm)
      }
      maxK = cap
    }
    return { sorted, off, maxK }
  })
  // With a pile cap (maxColK) every dot band shares one body height, so rows
  // line up instead of each frame tracking its own population; uncapped
  // callers keep per-band heights (one huge pile would stretch every row).
  const bodyOf = (k: number) => Math.max(g.minRowH, 2 * k * d + 2 * r + 8)
  const shared = g.maxColK != null ? bodyOf(Math.max(0, ...binned.map((b) => b?.maxK ?? 0))) : null
  // Pass 2: stack the bands.
  const bands: Band[] = []
  let cursor = g.axisH
  specs.forEach((s, i) => {
    const bin = binned[i]
    if (!bin) {
      const lh = g.railLabelH ?? 0
      const mid = cursor + lh + g.railH / 2
      for (const m of s.members) {
        x[m] = scoreToX(scores[m], g)
        y[m] = mid
        rr[m] = Math.max(1, r * 0.5)
        a[m] = 0.35
      }
      bands.push({ key: s.key, y0: cursor, h: lh + g.railH, mid, rail: true, depth: s.depth ?? 0 })
      cursor += lh + g.railH
      return
    }
    const body = shared ?? bodyOf(bin.maxK)
    const h = g.labelH + body
    const mid = cursor + g.labelH + body / 2
    for (const m of bin.sorted) {
      y[m] = mid + (bin.off.get(m) ?? 0) * d
      rr[m] = r
      a[m] = 1
    }
    bands.push({ key: s.key, y0: cursor, h, mid, rail: false, depth: s.depth ?? 0 })
    cursor += h
  })
  return { x, y, r: rr, a, bands, height: Math.ceil(cursor + 4), dotR: r }
}

/** Lay out every dot; `specs` must partition the population. Shrinks r to fit maxH. */
export function layoutField(scores: ArrayLike<number>, specs: BandSpec[], g: Geometry): Layout {
  const n = scores.length
  let r = g.r
  let out = place(scores, specs, n, g, r)
  while (out.height > g.maxH && r > 1.2) {
    r = Math.max(1.2, r * 0.85)
    out = place(scores, specs, n, g, r)
  }
  return out
}

