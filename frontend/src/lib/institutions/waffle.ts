/**
 * The money waffle («Por pesos» spec §3; ui.md revised: waffle, not dot area).
 *
 * 1 cell = 10,000 MDP (pesos) or 3,000 contracts. Cells are grouped by a
 * caller-given group (level, or federal family) and laid out grade A→F.
 * A buyer worth ≥ OUTLINE_MIN cells gets its own outlined block (IMSS = one
 * ~182-cell block); everyone else pools per (group, grade), split into active
 * and historical (hatched) runs — never removed.
 *
 * Allocation is largest-remainder over every block at once, so the grid total
 * is exactly round(Σ value / unit) and each block holds floor or floor+1 of
 * its exact share. Cell ids are stable (`i<id>#k` for a buyer's own block,
 * `<group>|<grade>|a|h#k` for pools), so a re-flow (new width, new grouping)
 * moves the same cells. Pure: no DOM, no React.
 *
 * Why not dot area ∝ spend: under honest √ scaling the median municipal dot
 * is 0.34 px; a floor inflates small buyers up to ~63× (data-impact.md §4).
 */
import { isDeficient, type FieldModel } from './field'
import type { Layout } from '@/lib/field/layout'

export type WaffleUnit = 'pesos' | 'contratos'
export const UNIT_SIZE: Record<WaffleUnit, number> = { pesos: 1e10, contratos: 3000 }
export const OUTLINE_MIN = 50
const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F']

export interface WaffleGroup {
  key: string
  members: number[]
}

export interface WaffleBlock {
  key: string
  group: string
  grade: string
  /** Institution index when the block is one buyer's own; null for a pool. */
  inst: number | null
  historical: boolean
  members: number[]
  value: number
  cells: number
}

export interface WaffleCell {
  id: string
  block: string
  group: string
  grade: string
  inst: number | null
  historical: boolean
  deficient: boolean
  x: number
  y: number
  /** Row inside its group (for the fade-in stagger). */
  row: number
}

export interface WaffleGroupBox {
  key: string
  y0: number
  /** y of the first cell row. */
  top: number
  rows: number
  cells: number
  value: number
  members: number[]
}

export interface WaffleLayout {
  cells: WaffleCell[]
  blocks: WaffleBlock[]
  groups: WaffleGroupBox[]
  size: number
  gap: number
  cols: number
  width: number
  height: number
  /** Morph target per institution index: its own block's centroid, else its pool's (else its group's). */
  target: Map<number, { x: number; y: number }>
  /** Block centroids by block key (labels, hit-testing). */
  centroid: Map<string, { x: number; y: number }>
}

const weight = (m: FieldModel, k: number, unit: WaffleUnit) =>
  unit === 'pesos' ? m.insts[k].total_amount_mxn : m.insts[k].total_contracts

/** Blocks with exact cell counts (largest remainder across all blocks). */
/** Waffle grade: the letter, except a C/D/F band that rounds to 6.0 (score 59.5-59.9) passes with the numbers and sits with B (same rule as isDeficient / lib/tiers). */
const wGrade = (m: FieldModel, k: number) => {
  const i = m.insts[k]
  return m.method === 'v3' && !i.fail && GRADE_ORDER.indexOf(i.grade) >= 2 ? 'B' : i.grade
}

export function allocate(
  m: FieldModel, groups: WaffleGroup[], unit: WaffleUnit, exclude?: Set<number>,
): WaffleBlock[] {
  const u = UNIT_SIZE[unit]
  const blocks: WaffleBlock[] = []
  for (const g of groups) {
    for (const grade of GRADE_ORDER) {
      const members = g.members.filter((k) => !exclude?.has(k) && wGrade(m, k) === grade)
      const big = members.filter((k) => weight(m, k, unit) / u >= OUTLINE_MIN)
        .sort((a, b) => weight(m, b, unit) - weight(m, a, unit))
      for (const k of big) {
        blocks.push({ key: `i${m.insts[k].id}`, group: g.key, grade, inst: k, historical: !!m.insts[k].historical,
          members: [k], value: weight(m, k, unit), cells: 0 })
      }
      const rest = members.filter((k) => !big.includes(k))
      for (const hist of [false, true]) {
        const pool = rest.filter((k) => !!m.insts[k].historical === hist)
        if (!pool.length) continue
        blocks.push({ key: `${g.key}|${grade}|${hist ? 'h' : 'a'}`, group: g.key, grade, inst: null, historical: hist,
          members: pool, value: pool.reduce((a, k) => a + weight(m, k, unit), 0), cells: 0 })
      }
    }
  }
  const total = Math.round(blocks.reduce((a, b) => a + b.value, 0) / u)
  const exact = blocks.map((b) => b.value / u)
  blocks.forEach((b, i) => { b.cells = Math.floor(exact[i]) })
  let left = total - blocks.reduce((a, b) => a + b.cells, 0)
  const order = blocks.map((_, i) => i)
    .sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])) || (blocks[a].key < blocks[b].key ? -1 : 1))
  for (const i of order) {
    if (left <= 0) break
    blocks[i].cells++
    left--
  }
  return blocks
}

/** Grid layout for a width: each group gets a label row, then its cells flow grade A→F. */
export function layoutWaffle(
  m: FieldModel, groups: WaffleGroup[], unit: WaffleUnit,
  opts: { width: number; size: number; gap: number; labelH: number; groupGap: number; exclude?: Set<number> },
): WaffleLayout {
  const { width, size, gap, labelH, groupGap } = opts
  const step = size + gap
  const cols = Math.max(1, Math.floor((width + gap) / step))
  const blocks = allocate(m, groups, unit, opts.exclude)
  const cells: WaffleCell[] = []
  const boxes: WaffleGroupBox[] = []
  const sums = new Map<string, { x: number; y: number; n: number }>()
  let y = 0
  for (const g of groups) {
    const gb = blocks.filter((b) => b.group === g.key)
    const top = y + labelH
    let j = 0
    for (const b of gb) {
      const def = GRADE_ORDER.indexOf(b.grade) >= (m.method === 'v3' ? 2 : 3) // v3: C, D, F fail (< 60)
      for (let k = 0; k < b.cells; k++, j++) {
        const col = j % cols
        const row = Math.floor(j / cols)
        const cx = col * step
        const cy = top + row * step
        cells.push({ id: `${b.key}#${k}`, block: b.key, group: g.key, grade: b.grade, inst: b.inst, historical: b.historical,
          deficient: def, x: cx, y: cy, row })
        const s = sums.get(b.key) ?? { x: 0, y: 0, n: 0 }
        s.x += cx + size / 2; s.y += cy + size / 2; s.n++
        sums.set(b.key, s)
      }
    }
    const rows = Math.ceil(j / cols)
    boxes.push({ key: g.key, y0: y, top, rows, cells: j, value: gb.reduce((a, b) => a + b.value, 0), members: g.members })
    y = top + rows * step + groupGap
  }
  const centroid = new Map<string, { x: number; y: number }>()
  for (const [k, s] of sums) centroid.set(k, { x: s.x / s.n, y: s.y / s.n })
  const blockOf = new Map<number, string>()
  for (const b of blocks) for (const k of b.members) blockOf.set(k, b.key)
  const target = new Map<number, { x: number; y: number }>()
  for (const box of boxes) {
    const gcells = cells.filter((c) => c.group === box.key)
    const gc = gcells.length
      ? { x: gcells.reduce((a, c) => a + c.x, 0) / gcells.length + size / 2, y: gcells.reduce((a, c) => a + c.y, 0) / gcells.length + size / 2 }
      : { x: width / 2, y: box.y0 + labelH / 2 }
    for (const k of box.members) {
      const bk = blockOf.get(k)
      // Excluded buyers (the «Sin IMSS» switch) leave to the right edge; a pool with 0 cells falls back to its group.
      target.set(k, (bk ? centroid.get(bk) : undefined) ?? (opts.exclude?.has(k) ? { x: width + 40, y: box.top } : gc))
    }
  }
  return { cells, blocks, groups: boxes, size, gap, cols, width, height: Math.max(0, y - groupGap) + 4, target, centroid }
}

/**
 * The dot-field `Layout` that hands the dots over to the waffle: every dot
 * glides to its block centroid and fades (a = 0). DotField tweens to it like
 * any other layout, from wherever the dots are, so a mid-flight lens flip
 * reverses cleanly.
 */
export function morphLayout(w: WaffleLayout, n: number, r: number): Layout {
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const rr = new Float32Array(n).fill(r)
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = w.target.get(i)
    x[i] = t?.x ?? w.width / 2
    y[i] = t?.y ?? w.height / 2
  }
  return { x, y, r: rr, a, bands: [], height: w.height, dotR: r }
}

/** D/F share of a set's weight, from the values themselves (not from rounded cells). */
export function dfShare(m: FieldModel, members: number[], unit: WaffleUnit, exclude?: Set<number>): number {
  let v = 0
  let d = 0
  for (const k of members) {
    if (exclude?.has(k)) continue
    const w = weight(m, k, unit)
    v += w
    if (isDeficient(m.insts[k])) d += w
  }
  return v ? d / v : 0
}
