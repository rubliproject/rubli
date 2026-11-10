/**
 * Motion kit — pure data mappers (no three, no DOM). Each primitive takes one of these shapes;
 * the mappers turn RUBLI's API payloads into them. Everything here has a vitest.
 * Honest-encoding rules (.claude/skills/rubli-motion-viz): a particle is a stated unit of money,
 * a node's screen AREA is its money (radius = sqrt), heights are linear, depth never carries a value.
 */
import type { ContractDetail } from '@/api/types'
import { ADMINISTRATIONS, ADMIN_DISPLAY_ACCENTED } from '@/lib/administrations'
import { CATEGORICAL, RAMP_INK } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import type { EntityTimeline, Expediente, Lane } from '@/lib/vendor/expediente'

/** Siglas when the record has them, else the cased full name (never truncated: DESIGN.md §9). */
const laneLabel = (l: Pick<Lane, 'type' | 'id' | 'name' | 'siglas'>) => l.siglas ?? (l.name ? formatEntityName(l.type, l.name, 'full') : String(l.id))

// ── (a) ParticleFlow: money as particles, source lanes → one sink, by year ───────────────────────
export interface FlowSource { id: number | null; label: string; color: string; amount: number }
export interface FlowEdge { source: number; year: number; amount: number }
export interface FlowData {
  sources: FlowSource[]
  sink: { label: string }
  years: number[]
  edges: FlowEdge[]
  total: number
}

export function flowFromExpediente(m: Expediente, sinkLabel: string): FlowData {
  const sources: FlowSource[] = m.lanes.map((l) => ({ id: l.id, label: laneLabel(l), color: l.color, amount: l.amount }))
  const edges: FlowEdge[] = []
  m.lanes.forEach((l, i) => {
    for (const y of m.years) { const c = l.cells[y]; if (c && c.amount_mxn > 0) edges.push({ source: i, year: y, amount: c.amount_mxn }) }
  })
  const rest = m.ribbon[m.ribbon.length - 1]
  const restTotal = Object.values(rest.vals).reduce((s, v) => s + v, 0)
  if (restTotal > 0) {
    const k = sources.push({ id: null, label: `+${m.othersCount}`, color: RAMP_INK[1], amount: restTotal }) - 1
    for (const y of m.years) { const v = rest.vals[y] ?? 0; if (v > 0) edges.push({ source: k, year: y, amount: v }) }
  }
  // the total is the edges' sum (what the particles carry), not m.total: a lane's record can exceed the
  // year rows it sits in (the rest clamps at 0), and the «arrived» readout must close on the particles
  return { sources, sink: { label: sinkLabel }, years: m.years, edges, total: edges.reduce((s, e) => s + e.amount, 0) }
}

/** One particle = `quantum` MXN. Counts round so the stated unit is exact; a tiny edge keeps ≥ 1 particle
 *  only if it holds at least half a quantum (a 0.1-quantum edge drawn as 1 particle would overstate it 10×). */
export function particleBudget(edges: FlowEdge[], cap: number): { quantum: number; counts: number[] } {
  const total = edges.reduce((s, e) => s + e.amount, 0)
  if (total <= 0 || cap <= 0) return { quantum: 0, counts: edges.map(() => 0) }
  const quantum = niceQuantum(total / cap)
  return { quantum, counts: edges.map((e) => Math.round(e.amount / quantum)) }
}

/** 1 · 2 · 5 × 10ⁿ MXN, never below 1 M — a legend can say «1 punto = 5 MDP». */
export function niceQuantum(raw: number): number {
  const floor = 1e6
  if (raw <= floor) return floor
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

// ── (b) TimeTerrain: columns × lanes × value, orthographic ───────────────────────────────────────
export interface TerrainLane { id: number | string; label: string; color: string }
export interface TerrainBand { label: string; from: number; to: number }
export interface TerrainData {
  cols: string[]
  lanes: TerrainLane[]
  /** cells[lane][col], MXN. */
  cells: number[][]
  bands: TerrainBand[]
  vmax: number
}

export function terrainFromExpediente(m: Expediente): TerrainData {
  const cols = m.years.map(String)
  const lanes: TerrainLane[] = m.lanes.map((l) => ({ id: l.id, label: laneLabel(l), color: l.color }))
  const cells = m.lanes.map((l) => m.years.map((y) => l.cells[y]?.amount_mxn ?? 0))
  const rest = m.ribbon[m.ribbon.length - 1]
  if (Object.values(rest.vals).some((v) => v > 0)) {
    lanes.push({ id: 'otros', label: `+${m.othersCount}`, color: RAMP_INK[1] })
    cells.push(m.years.map((y) => rest.vals[y] ?? 0))
  }
  const bands = m.chapters.map((c) => ({ label: c.name, from: m.years.indexOf(c.from), to: m.years.indexOf(c.to) }))
  return { cols, lanes, cells, bands, vmax: Math.max(1, ...cells.flat()) }
}

export interface SexenioRow { id: number; label: string; color?: string; administrations: Record<string, { value: number }> }

/** Categories (or sectors) × sexenio: one column per term, in order, from `/categories/sexenio`-shaped rows. */
export function terrainFromSexenios(rows: SexenioRow[], top = 8): TerrainData {
  const terms = ADMINISTRATIONS.filter((a) => a.yearStart >= 2000).map((a) => ADMIN_DISPLAY_ACCENTED[a.key])
  const picked = [...rows].sort((a, b) => sum(b) - sum(a)).slice(0, top)
  const lanes = picked.map((r, i) => ({ id: r.id, label: r.label, color: r.color ?? CATEGORICAL[(i % 7) + 1] }))
  const cells = picked.map((r) => terms.map((t) => r.administrations[t]?.value ?? 0))
  return { cols: terms, lanes, cells, bands: terms.map((t, i) => ({ label: t, from: i, to: i })), vmax: Math.max(1, ...cells.flat()) }
  function sum(r: SexenioRow) { return Object.values(r.administrations).reduce((s, a) => s + a.value, 0) }
}

// ── (c) Constellation: an entity and its counterparts ────────────────────────────────────────────
export interface GraphNode { id: string; entityId: number | null; label: string; color: string; value: number; year: number; isCenter?: boolean }
export interface GraphLink { source: number; target: number; value: number }
export interface GraphData { nodes: GraphNode[]; links: GraphLink[]; total: number }

export function graphFromTimeline(tl: EntityTimeline, center: { label: string }, max = 80): GraphData {
  const total = tl.years.reduce((s, y) => s + y.amount_mxn, 0) || 1
  const nodes: GraphNode[] = [{ id: 'c', entityId: null, label: center.label, color: RAMP_INK[4], value: total, year: tl.years[0]?.year ?? 2002, isCenter: true }]
  const links: GraphLink[] = []
  let k = 0
  for (const e of [...tl.entities].sort((a, b) => b.amount_mxn - a.amount_mxn).slice(0, max)) {
    const color = e.is_top ? [CATEGORICAL[1], CATEGORICAL[6], CATEGORICAL[2], CATEGORICAL[3], CATEGORICAL[4]][k++] ?? CATEGORICAL[7] : RAMP_INK[2]
    links.push({ source: 0, target: nodes.length, value: e.amount_mxn })
    nodes.push({ id: `${tl.laneType}-${e.id}`, entityId: e.id, label: laneLabel({ type: tl.laneType, id: e.id, name: e.name, siglas: e.siglas }), color, value: e.amount_mxn, year: e.first_year })
  }
  return { nodes, links, total }
}

/** Screen radius in px from money: area ∝ value (sqrt), clamped so the smallest stays visible. */
export function radiusFor(value: number, vmax: number, rMin = 2.5, rMax = 22): number {
  if (vmax <= 0 || value <= 0) return rMin
  return rMin + (rMax - rMin) * Math.sqrt(value / vmax)
}

/** Tiny 3D force layout (repulsion + springs to the centre + gravity), deterministic from the index.
 *  For ≤ 300 nodes; above that use @cosmos.gl/graph (see the skill). Returns xyz triples in [-1, 1]. */
export function layoutGraph(g: GraphData, iterations = 240): Float32Array {
  const n = g.nodes.length, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3)
  for (let i = 1; i < n; i++) {
    // golden-angle spiral on a sphere: no two nodes start on top of each other
    const t = (i - 0.5) / (n - 1), phi = Math.acos(1 - 2 * t), th = i * 2.399963
    pos[i * 3] = 0.6 * Math.sin(phi) * Math.cos(th); pos[i * 3 + 1] = 0.6 * Math.sin(phi) * Math.sin(th); pos[i * 3 + 2] = 0.6 * Math.cos(phi)
  }
  const vmax = Math.max(...g.nodes.map((d) => d.value))
  for (let it = 0; it < iterations; it++) {
    const damp = 0.85, alpha = 1 - it / iterations
    for (let i = 1; i < n; i++) {
      let fx = 0, fy = 0, fz = 0
      for (let j = 1; j < n; j++) if (j !== i) {
        const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]
        const d2 = dx * dx + dy * dy + dz * dz + 1e-3, f = 0.004 / d2
        fx += dx * f; fy += dy * f; fz += dz * f
      }
      // spring to the centre: more money = shorter (closer to the entity), like the dossier orbit
      const want = 0.35 + 0.6 * (1 - Math.sqrt(g.nodes[i].value / vmax))
      const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1e-3, k = 0.08 * (want - r) / r
      fx += pos[i * 3] * k; fy += pos[i * 3 + 1] * k; fz += pos[i * 3 + 2] * k
      vel[i * 3] = (vel[i * 3] + fx * alpha) * damp; vel[i * 3 + 1] = (vel[i * 3 + 1] + fy * alpha) * damp; vel[i * 3 + 2] = (vel[i * 3 + 2] + fz * alpha) * damp
    }
    for (let i = 3; i < n * 3; i++) pos[i] = Math.max(-1, Math.min(1, pos[i] + vel[i]))
  }
  return pos
}

// ── (d) Unfold: one record into its parts ────────────────────────────────────────────────────────
export interface UnfoldPart { key: string; label: string; value: string; tone?: 'critical' | 'muted'; href?: string }
export interface UnfoldData { head: string; sub: string; parts: UnfoldPart[] }

export function unfoldContract(c: ContractDetail, lang: 'es' | 'en', fmtMXN: (v: number) => string): UnfoldData {
  const en = lang === 'en'
  const parts: UnfoldPart[] = []
  const put = (key: string, label: string, value: string | null | undefined, extra: Partial<UnfoldPart> = {}) => { if (value) parts.push({ key, label, value, ...extra }) }
  put('amount', en ? 'Amount' : 'Monto', fmtMXN(c.amount_mxn))
  if (c.currency && c.currency !== 'MXN' && c.amount_original) put('original', en ? 'Signed in' : 'Firmado en', `${c.currency} ${Math.round(c.amount_original).toLocaleString(en ? 'en-US' : 'es-MX')}`, { tone: 'muted' })
  put('vendor', en ? 'Supplier' : 'Proveedor', c.vendor_name, { href: c.vendor_id ? `/vendors/${c.vendor_id}` : undefined })
  put('institution', en ? 'Buyer' : 'Comprador', c.institution_name, { href: c.institution_id ? `/institutions/${c.institution_id}` : undefined })
  put('procedure', en ? 'Procedure' : 'Procedimiento', c.procedure_type, { tone: c.is_direct_award ? 'critical' : undefined })
  put('character', en ? 'Character' : 'Carácter', [c.procedure_character, c.participation_form].filter(Boolean).join(' · '), { tone: 'muted' })
  if (c.start_date && c.end_date) {
    const days = Math.round((Date.parse(c.end_date) - Date.parse(c.start_date)) / 86_400_000)
    put('term', en ? 'Term' : 'Plazo', `${c.start_date} → ${c.end_date} (${days} ${en ? 'days' : 'días'})`)
  }
  put('sector', 'Sector', c.sector_name, { tone: 'muted' })
  for (const f of c.risk_factors ?? []) {
    const [name, , val] = f.split(':')
    put(`rf-${name}`, en ? 'Signal' : 'Señal', factorLabel(name, lang) + (val ? ` ${val}` : ''), { tone: 'critical' })
  }
  return {
    head: c.title || c.description || c.contract_number || String(c.id),
    sub: `${c.procedure_number ?? ''} · ${c.contract_date ?? c.contract_year ?? ''}`.replace(/^ · | · $/g, ''),
    parts,
  }
}

const FACTORS: Record<string, [string, string]> = {
  direct_award: ['adjudicación directa', 'direct award'],
  price_anomaly: ['monto anómalo', 'amount anomaly'],
  'short_ad_<5d': ['convocatoria < 5 días', 'notice < 5 days'],
  price_hyp: ['monto atípico', 'amount outlier'],
  single_bid: ['procedimiento con un solo adjudicado', 'single award'],
  year_end: ['cierre de año', 'year end'],
}
export function factorLabel(key: string, lang: 'es' | 'en'): string {
  const hit = FACTORS[key] ?? FACTORS[key.split(':')[0]]
  return hit ? hit[lang === 'en' ? 1 : 0] : key.replace(/_/g, ' ')
}
