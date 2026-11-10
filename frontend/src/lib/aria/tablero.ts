/**
 * «El tablero» — the ARIA case as an evidence board (concept _explore/dossier_objects_2026-10-29, caso-board).
 * A pin = one fact of the case; a thread ties it to the supplier. ONE global thread scale for every group:
 * the thread's thickness = the fact's own share (0–1) of its whole —
 *   buyers     share of the supplier's income
 *   patterns   the pattern's confidence (0–1)
 *   model      the variable's |β·z| over the sum of every |β·z|
 *   contracts  the contract's amount over the supplier's total
 * The documented case is not a quantity: fixed thread, red. Pure (vitest tablero.test.ts).
 */
type Lang = 'es' | 'en'

export type PinGroup = 'buyers' | 'case' | 'pattern' | 'model' | 'contracts'

export interface Pin {
  key: string
  group: PinGroup
  label: string
  sub: string
  /** the fact's share of its whole, 0–1 (null = not a quantity: the case) */
  w: number | null
  red: boolean
  /** subtracts from the indicator (model only) */
  neg: boolean
  href: string | null
  /** the longer reading for the aria-live line and the tooltip */
  read: string
  /** the label's text is English data (the GT case name) */
  enOnly?: boolean
}

export interface BoardInput {
  lanes: Array<{ id: number; name: string | null; siglas: string | null; share: number }>
  gtCase: { name: string; type: string; typeLabel: string; from: number | null; to: number | null; slug: string | null } | null
  patterns: Record<string, number> | null | undefined
  patternName: (p: string) => string
  drivers: Array<{ feature: string; contribution: number; label: string }>
  contracts: Array<{ id: number; title: string; amount: number; date: string | null }>
  vendorTotal: number
  fmtMoney: (n: number) => string
  fmtDate: (s: string) => string
  instName: (s: string | null) => string
}

const pct = (x: number) => (x > 0 && x < 0.01 ? '< 1%' : `${Math.round(x * 100)}%`)

export const THREAD_MIN = 0.06, THREAD_SPAN = 0.22, THREAD_CASE = 0.18
/** One function for every thread (world units): 0.06 + 0.22 × share (the widest stays under the 0.36 pin head). */
export const threadRadius = (w: number | null) => (w == null ? THREAD_CASE : THREAD_MIN + THREAD_SPAN * Math.min(1, Math.max(0, w)))

/** Per-group caps: desk 4 · 1 · 3 · 4 · 3; phone 2 · 1 · 1 · 2 · 1 (the rest goes to the list under the board). */
export const CAPS = { desk: { buyers: 4, case: 1, pattern: 3, model: 4, contracts: 3 }, phone: { buyers: 2, case: 1, pattern: 1, model: 2, contracts: 1 } } as const

export function boardPins(d: BoardInput, lang: Lang): Pin[] {
  const es = lang === 'es'
  const out: Pin[] = []
  for (const l of [...d.lanes].sort((a, b) => b.share - a.share).filter((l) => l.share >= 0.01)) {
    const nm = l.siglas || d.instName(l.name)
    out.push({ key: `b${l.id}`, group: 'buyers', label: nm, sub: `${pct(l.share)} ${es ? 'del ingreso' : 'of income'}`, w: l.share, red: false, neg: false, href: `/institutions/${l.id}`, read: `${d.instName(l.name)} · ${pct(l.share)} ${es ? 'del ingreso del proveedor' : "of the supplier's income"}` })
  }
  if (d.gtCase) {
    const g = d.gtCase
    const yrs = g.from ? `${g.from}${g.to && g.to !== g.from ? `–${g.to}` : ''}` : ''
    out.push({ key: 'case', group: 'case', label: g.name, sub: [g.typeLabel, yrs].filter(Boolean).join(' · '), w: null, red: true, neg: false, href: g.slug ? `/cases/${g.slug}` : null, read: `${es ? 'Caso documentado' : 'Documented case'}: ${g.name}${yrs ? ` · ${yrs}` : ''}`, enOnly: true })
  }
  for (const [p, c] of Object.entries(d.patterns ?? {}).filter(([, c]) => c >= 0.3).sort((a, b) => b[1] - a[1])) {
    out.push({ key: `p${p}`, group: 'pattern', label: `${p} · ${d.patternName(p)}`, sub: `${es ? 'confianza' : 'confidence'} ${c.toFixed(2)}`, w: c, red: false, neg: false, href: `/aria?pattern=${p}&tier=all`, read: `${es ? 'Patrón' : 'Pattern'} ${p} ${d.patternName(p)} · ${es ? 'confianza' : 'confidence'} ${c.toFixed(2)}` })
  }
  const sumAbs = d.drivers.reduce((s, x) => s + Math.abs(x.contribution), 0)
  for (const x of [...d.drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))) {
    if (!sumAbs) continue
    const w = Math.abs(x.contribution) / sumAbs
    if (w < 0.01) continue // under 1% of what the model reads: noise, not a fact
    out.push({ key: `m${x.feature}`, group: 'model', label: x.label, sub: `β·z ${x.contribution > 0 ? '+' : '−'}${Math.abs(x.contribution).toFixed(2)} · ${pct(w)}`, w, red: false, neg: x.contribution < 0, href: null, read: `${x.label} · β·z ${x.contribution.toFixed(2)} · ${pct(w)} ${es ? 'de lo que lee el modelo' : 'of what the model reads'}${x.contribution < 0 ? (es ? ' · resta' : ' · subtracts') : ''}` })
  }
  for (const c of d.contracts) {
    if (!(d.vendorTotal > 0) || !(c.amount > 0)) continue
    const w = c.amount / d.vendorTotal
    const t = c.title.length > 34 ? `${c.title.slice(0, 33).trimEnd()}…` : c.title
    out.push({ key: `c${c.id}`, group: 'contracts', label: t || `#${c.id}`, sub: [c.date ? d.fmtDate(c.date) : null, d.fmtMoney(c.amount)].filter(Boolean).join(' · '), w, red: false, neg: false, href: `/contracts/${c.id}`, read: `${c.title || `#${c.id}`} · ${d.fmtMoney(c.amount)} · ${pct(w)} ${es ? 'del total del proveedor' : "of the supplier's total"}` })
  }
  return out
}

/** Split into what the board shows and what the list under it carries (caps per group, data order kept). */
export function capPins(pins: Pin[], phone: boolean): { shown: Pin[]; rest: Pin[] } {
  const cap = phone ? CAPS.phone : CAPS.desk
  const seen: Record<string, number> = {}
  const shown: Pin[] = [], rest: Pin[] = []
  for (const p of pins) {
    seen[p.group] = (seen[p.group] ?? 0) + 1
    ;(seen[p.group] <= cap[p.group] ? shown : rest).push(p)
  }
  return { shown, rest }
}

export const GROUP_ORDER: PinGroup[] = ['buyers', 'case', 'pattern', 'model', 'contracts']
export const groupLabel = (g: PinGroup, lang: Lang) => ({
  buyers: lang === 'es' ? 'Compradores' : 'Buyers',
  case: lang === 'es' ? 'Caso documentado' : 'Documented case',
  pattern: lang === 'es' ? 'Patrón' : 'Pattern',
  model: lang === 'es' ? 'Modelo' : 'Model',
  contracts: lang === 'es' ? 'Contratos' : 'Contracts',
}[g])

/** The § claim, within ONE group (threads compare only inside their own column: each is a share of its own
 *  whole). Buyers first, else what the model reads, else the contracts; the red case is named when tied. */
export function boardClaim(pins: Pin[], lang: Lang): string | null {
  const es = lang === 'es'
  const hasCase = pins.some((p) => p.group === 'case')
  const tail = hasCase ? (es ? '; el caso documentado está atado en rojo' : '; the documented case is tied in red') : ''
  const top = (g: PinGroup) => pins.filter((p) => p.group === g && p.w != null).reduce<Pin | null>((a, b) => (!a || (b.w ?? 0) > (a.w ?? 0) ? b : a), null)
  const b = top('buyers'), m = top('model'), c = top('contracts')
  if (b) return es
    ? `El hilo más grueso de los compradores va a ${b.label}: ${pct(b.w ?? 0)} del ingreso del proveedor${tail}.`
    : `The thickest buyer thread goes to ${b.label}: ${pct(b.w ?? 0)} of the supplier's income${tail}.`
  if (m) return es
    ? `De lo que lee el modelo, el hilo más grueso es «${m.label}»: ${pct(m.w ?? 0)} del total${tail}.`
    : `Of what the model reads, the thickest thread is “${m.label}”: ${pct(m.w ?? 0)} of the total${tail}.`
  if (c) return es
    ? `Su contrato mayor en el tablero pesa ${pct(c.w ?? 0)} de todo su dinero${tail}.`
    : `Its largest contract on the board weighs ${pct(c.w ?? 0)} of all its money${tail}.`
  return null
}

/** World layout (x, z on the board plane; the pin head is 0.72 units wide). `side` = where a pin's label sits.
 *  Desk = columns; each label sits AWAY from the supplier's pin, so a column's own threads (which arrive from the
 *  centre's side) never cross its labels, and no label covers a pin head. Phone = one pin per row on a concave
 *  curve x = x0 + k·√depth: every thread then passes LEFT of the pins above it, clear of their heads and of their
 *  labels (which sit right). The supplier's label sits above its pin, where no thread goes. */
/** `kicker` (phone): the group's name printed inside the first pin's label, so it can never collide with it. */
export interface Placed { pin: Pin; x: number; z: number; side: 'l' | 'r'; kicker?: PinGroup }
export interface Layout { w: number; h: number; centre: { x: number; z: number }; placed: Placed[]; heads: Array<{ group: PinGroup; x: number; z: number; side: 'l' | 'r' }> }

/** Room a pin label needs beside its pin (units): ≤ 128 px at ≈ 13 px per unit on the desk board. */
export const LABEL_U = 10

export function layoutBoard(shown: Pin[], phone: boolean): Layout {
  const groups = GROUP_ORDER.filter((g) => shown.some((p) => p.group === g))
  const placed: Placed[] = [], heads: Layout['heads'] = []
  if (!phone) {
    // the documented case is not a column: it hangs straight under the supplier, below every other pin, where
    // no other thread can reach (they all end higher, in their columns); its label sits beside its own thread
    const cols = groups.filter((g) => g !== 'case')
    const pitch = 12, n = cols.length
    // the supplier's pin sits between two columns (never above one, or its threads would run through that column's pins)
    const cx = n % 2 ? -pitch / 2 : 0
    const W = Math.max(36, (n - 1) * pitch + 2 * (LABEL_U + 1.5))
    const deepest = Math.max(0, ...cols.map((g) => shown.filter((p) => p.group === g).length - 1))
    const lowest = -31 / 2 + 10.6 + deepest * 5.0
    const casePin = shown.find((p) => p.group === 'case')
    // its label (kicker + up to 3 name lines + sub ≈ 6 units tall) clears the deepest column label by ≥ 1 unit
    const caseTop = lowest + 15.5 + 7.5
    const H = casePin ? Math.max(31, caseTop + 4.5) : 31
    if (casePin) placed.push({ pin: casePin, x: cx, z: -H / 2 + caseTop, side: 'l', kicker: 'case' })
    cols.forEach((g, gi) => {
      const x = (gi - (n - 1) / 2) * pitch
      const side = x < cx ? 'l' : 'r'
      heads.push({ group: g, x, z: -H / 2 + 6.0, side })
      shown.filter((p) => p.group === g).forEach((pin, k) => placed.push({ pin, x, z: -H / 2 + 10.6 + k * 5.0, side }))
    })
    return { w: W, h: H, centre: { x: cx, z: -H / 2 + 3.4 }, placed, heads }
  }
  const W = 24, ROW = 4.0, HEAD = 1.4, cx = -W / 2 + 1.6, cz = 3.4
  let z = cz + 3.4
  const rows: Array<{ pin: Pin; z: number; head: boolean }> = []
  for (const g of groups) {
    shown.filter((p) => p.group === g).forEach((pin, k) => { if (k === 0) z += HEAD; rows.push({ pin, z, head: k === 0 }); z += ROW })
  }
  const H = z + 0.6
  for (const r of rows) {
    const x = cx + 1.8 * Math.sqrt(r.z - cz)
    placed.push({ pin: r.pin, x, z: r.z - H / 2, side: 'r', kicker: r.head ? r.pin.group : undefined })
  }
  return { w: W, h: H, centre: { x: cx, z: cz - H / 2 }, placed, heads }
}
