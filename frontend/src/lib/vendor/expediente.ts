/**
 * «El expediente por sexenios» — the model behind the vendor dossier's signature block
 * (owner decision 2026-10-27: concept B + C's procedure glyphs + A's orbit as an accent;
 * _explore/dossier_concepts_2026-10-27/README.md). Pure: payload in, drawing model out.
 */
import type {
  InstitutionVendorsTimelineResponse, TimelineYear, VendorInstitutionsTimelineResponse, VendorTimelineCell,
} from '@/api/types'
import { ADMINISTRATIONS, ADMIN_DISPLAY_ACCENTED } from '@/lib/administrations'
import { CATEGORICAL, RAMP_INK } from '@/lib/constants'

/** Lanes 1–5 take five «ajustados» hues (DESIGN.md §6.3, never red/amber), the rest slate; the ribbon's
 *  rest is rule grey. Cyan C6 is left out: beside teal C3 it reads as one hue (ΔE 9.3 < 15, rubli-dataviz
 *  §2). Order blue · brown · teal · violet · magenta keeps the deutan-twin pairs (blue×violet,
 *  teal×magenta) apart; adjacent pairs pass `dataviz validate_palette.js` (worst ΔE 15.9 deutan). */
const LANE_HUES = [CATEGORICAL[1], CATEGORICAL[6], CATEGORICAL[2], CATEGORICAL[3], CATEGORICAL[4]] as const
export const laneColor = (i: number): string => LANE_HUES[i] ?? CATEGORICAL[7]
export const OTHERS_COLOR = RAMP_INK[1]
/** Lanes that keep their own colour in the ribbon; the rest of the money is grey. */
export const RIBBON_LANES = LANE_HUES.length

/** What the lanes are: a vendor dossier's buyers, or an institution dossier's suppliers. */
export type LaneType = 'institution' | 'vendor'

/** Both payloads on one shape: `entities` = the lanes' kind (buyers or suppliers). */
export interface EntityTimeline {
  laneType: LaneType
  n_entities: number
  entities: Array<VendorTimelineCell & { id: number; name: string | null; siglas: string | null; first_year: number; last_year: number; is_top: boolean }>
  years: TimelineYear[]
  cells: Array<VendorTimelineCell & { id: number | null; year: number }>
}

export function toTimeline(d: VendorInstitutionsTimelineResponse | InstitutionVendorsTimelineResponse | EntityTimeline): EntityTimeline {
  if ('laneType' in d) return d
  if ('vendors' in d) return {
    laneType: 'vendor', n_entities: d.n_vendors, years: d.years,
    entities: d.vendors.map(({ vendor_id, ...v }) => ({ ...v, id: vendor_id, siglas: null })),
    cells: d.cells.map(({ vendor_id, ...c }) => ({ ...c, id: vendor_id })),
  }
  return {
    laneType: 'institution', n_entities: d.n_institutions, years: d.years,
    entities: d.institutions.map(({ institution_id, ...i }) => ({ ...i, id: institution_id })),
    cells: d.cells.map(({ institution_id, ...c }) => ({ ...c, id: institution_id })),
  }
}

export interface Lane {
  type: LaneType
  id: number
  name: string | null
  siglas: string | null
  color: string
  share: number
  amount: number
  first: number
  last: number
  cells: Record<number, VendorTimelineCell>
}

export interface Chapter { key: string; name: string; from: number; to: number; amount: number; share: number; risk: number | null; n: number; da: number | null }
/** 'crosses' / 'case' come from the ARIA case layer (lib/aria/caseLayer.ts), never from buildExpediente.
 *  'admin' (the sexenio change where the money per year moved most) and 'switch' (CompraNet → ComprasMX)
 *  are the spine's «why» annotations at its turning points. */
export interface Fact {
  year: number
  kind: 'first' | 'enters' | 'peak' | 'record' | 'still' | 'crosses' | 'case' | 'admin' | 'switch'
  lane?: Lane; amount?: number; n?: number
  /** 'admin': the chapter's money per year over the previous chapter's, and the chapter's name. */
  ratio?: number; name?: string
}

/** CompraNet's federal feed froze on 28 Sep 2025; ComprasMX carries the record after it (day 271 of 365). */
export const SWITCH_YEAR = 2025
export const SWITCH_AT = 271 / 365

/** CompraNet's coverage before 2007 is too thin to read a change of sexenio against (CLAUDE.md, Structure A). */
const TURN_FROM = 2007

/** The sexenio change where the money per year moved most, when it at least doubled or halved.
 *  Both chapters need two years or more, and the later one must end before the CompraNet → ComprasMX
 *  switch (2025): after it the record changes source, and a drop would read the switch, not the vendor. */
export function adminTurn(chapters: Chapter[]): Fact | null {
  let best: Fact | null = null, score = 0
  for (let i = 1; i < chapters.length; i++) {
    const a = chapters[i - 1], b = chapters[i]
    const na = a.to - a.from + 1, nb = b.to - b.from + 1
    // a chapter that reaches the switch mixes two records (CompraNet froze, ComprasMX is partial): no turn there
    // and Fox's chapter (2002–06) holds the thinnest CompraNet years: a rise out of it reads the coverage
    if (na < 2 || nb < 2 || a.amount <= 0 || b.amount <= 0 || b.to >= SWITCH_YEAR || a.from < TURN_FROM) continue
    const ratio = (b.amount / nb) / (a.amount / na)
    const s = Math.abs(Math.log(ratio))
    if ((ratio >= 2 || ratio <= 0.5) && s > score) { score = s; best = { year: b.from, kind: 'admin', ratio, name: b.name } }
  }
  return best
}

export interface Expediente {
  laneType: LaneType
  src: EntityTimeline
  years: number[]
  start: number
  end: number
  total: number
  totalN: number
  byYear: Record<number, TimelineYear>
  lanes: Lane[]
  /** Per year: the money of the ribbon lanes (in lane order) then the rest. */
  ribbon: { color: string; label: string | null; vals: Record<number, number> }[]
  othersCount: number
  chapters: Chapter[]
  facts: Fact[]
  vmax: number
  /** 'stack': the ribbon stacks the money by lane. 'share': the lanes hold too little of the money
   *  for a stack to read (IMSS: top six ≈ 10%), so it draws the year's concentration instead. */
  ribbonMode: 'stack' | 'share'
  /** The years the share ribbon reads (with a top-5 share and ≥ 1% of the busiest year's contracts). */
  shareYears: number[]
  /** The ribbon's ceiling in share mode (the largest top-5 share, rounded up to 5%). */
  shareMax: number
}

/** Below this share of the money, the stacked ribbon is mostly grey: draw the concentration. */
export const STACK_MIN_SHARE = 0.35

/** CompraNet's direct-award flag is empty before 2011 (Structure A: < 0.1% of 2002–09 rows, 11% in
 *  2010, 72% in 2011): no procedure reading before it — a 0 there is a missing field, not a tender. */
export const DA_RECORDED_FROM = 2011

export const isTendered = (c: VendorTimelineCell) => c.n_contracts > 0 && c.n_direct_award / c.n_contracts < 0.5

export function buildExpediente(raw: VendorInstitutionsTimelineResponse | InstitutionVendorsTimelineResponse | EntityTimeline): Expediente | null {
  const d = toTimeline(raw)
  if (!d.years.length) return null
  const byYear: Record<number, TimelineYear> = {}
  for (const y of d.years) byYear[y.year] = y
  const minY = d.years[0].year
  const end = d.years[d.years.length - 1].year
  // the axis opens on the first year of the term the vendor started in (data from 2002)
  const adminStart = ADMINISTRATIONS.find((a) => minY >= a.yearStart && minY <= a.yearEnd)?.yearStart ?? minY
  const start = Math.max(2002, Math.min(adminStart, minY))
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const total = d.years.reduce((s, y) => s + y.amount_mxn, 0)
  const totalN = d.years.reduce((s, y) => s + y.n_contracts, 0)

  // a lane per large buyer: the top 3 always, the rest only from 0.5% of the money (a 0% lane is noise)
  const lanes: Lane[] = d.entities.filter((i, k) => i.is_top && (k < 3 || i.amount_mxn >= 0.005 * total)).map((i, k) => ({
    type: d.laneType, id: i.id, name: i.name, siglas: i.siglas, color: laneColor(k),
    share: total > 0 ? i.amount_mxn / total : 0, amount: i.amount_mxn,
    first: i.first_year, last: i.last_year, cells: {},
  }))
  const laneOf = new Map(lanes.map((l) => [l.id, l]))
  for (const c of d.cells) if (c.id != null) {
    const l = laneOf.get(c.id)
    if (l) l.cells[c.year] = c
  }

  const ribbon = lanes.slice(0, RIBBON_LANES).map((l) => ({
    color: l.color, label: l.siglas ?? l.name,
    vals: Object.fromEntries(Object.entries(l.cells).map(([y, c]) => [y, c.amount_mxn])) as Record<number, number>,
  }))
  const rest: Record<number, number> = {}
  for (const y of years) rest[y] = Math.max(0, (byYear[y]?.amount_mxn ?? 0) - ribbon.reduce((s, r) => s + (r.vals[y] ?? 0), 0))
  ribbon.push({ color: OTHERS_COLOR, label: null, vals: rest })

  const chapters: Chapter[] = ADMINISTRATIONS
    .filter((a) => a.yearEnd >= start && a.yearStart <= end)
    .map((a) => {
      const from = Math.max(a.yearStart, start), to = Math.min(a.yearEnd, end)
      let amount = 0, n = 0, rs = 0, rn = 0, da = 0
      const daKnown = from >= DA_RECORDED_FROM   // a chapter half before 2011 has no procedure rate
      for (let y = from; y <= to; y++) {
        const c = byYear[y]
        if (!c) continue
        amount += c.amount_mxn; n += c.n_contracts; da += c.n_direct_award
        if (c.avg_risk_score != null) { rs += c.avg_risk_score * c.n_contracts; rn += c.n_contracts }
      }
      return { key: a.key, name: ADMIN_DISPLAY_ACCENTED[a.key], from, to, amount, n, share: total > 0 ? amount / total : 0, risk: rn ? rs / rn : null, da: n && daKnown ? da / n : null }
    })

  // Hechos — computed only: first contract, a large buyer arriving later, the money peak,
  // the contract-count record (when it is another year), still signing in the current year.
  const facts: Fact[] = []
  const firstLane = lanes.filter((l) => l.cells[minY]).sort((a, b) => b.cells[minY].amount_mxn - a.cells[minY].amount_mxn)[0]
  // an institution's first year is the data's (2002 for most): no fact there
  if (d.laneType === 'institution') facts.push({ year: minY, kind: 'first', lane: firstLane })
  const enters = lanes.slice(1).filter((l) => l.first >= minY + 3 && l.share >= 0.05).sort((a, b) => b.amount - a.amount)[0]
  if (enters) facts.push({ year: enters.first, kind: 'enters', lane: enters, amount: enters.amount })
  const peak = d.years.reduce((b, y) => (y.amount_mxn > b.amount_mxn ? y : b))
  if (peak.year !== minY) facts.push({ year: peak.year, kind: 'peak', amount: peak.amount_mxn })
  const record = d.years.reduce((b, y) => (y.n_contracts > b.n_contracts ? y : b))
  if (record.year !== peak.year && record.year !== minY) facts.push({ year: record.year, kind: 'record', n: record.n_contracts })
  const now = new Date().getFullYear()
  if (end >= now - 1 && end !== peak.year && end !== record.year) facts.push({ year: end, kind: 'still', n: byYear[end].n_contracts })
  const turn = adminTurn(chapters)
  if (turn) facts.push(turn)
  if (end >= SWITCH_YEAR) facts.push({ year: SWITCH_YEAR, kind: 'switch' })
  facts.sort((a, b) => a.year - b.year)

  const stacked = ribbon.slice(0, -1).reduce((s, r) => s + Object.values(r.vals).reduce((a, v) => a + v, 0), 0)
  // a year with a sliver of the contracts (2004: 7 in the whole record) is no reading of concentration
  const maxN = Math.max(0, ...d.years.map((y) => y.n_contracts))
  const shareYears = d.years.filter((y) => y.top5_share != null && y.n_contracts >= 0.01 * maxN).map((y) => y.year)
  const ribbonMode = total > 0 && stacked / total < STACK_MIN_SHARE && shareYears.length >= 2 ? 'share' : 'stack'

  return {
    laneType: d.laneType, src: d, ribbonMode,
    shareYears,
    shareMax: Math.min(1, Math.max(0.05, Math.ceil(Math.max(0, ...shareYears.map((y) => byYear[y].top5_share ?? 0)) * 20) / 20)),
    years, start, end, total, totalN, byYear, lanes, ribbon,
    othersCount: Math.max(0, d.n_entities - Math.min(lanes.length, RIBBON_LANES)),
    chapters, facts,
    vmax: Math.max(1, ...years.map((y) => byYear[y]?.amount_mxn ?? 0)),
  }
}

/** `.92` — the «La cifra» register of the yearly indicator. Scores are squashed below 0.95 (v0.9.2),
 *  so there is no saturated 1.00 to print (DESIGN.md §0.6); a stray ≥ 1 reads as the cap, `.95`. */
export function indFmt(r: number): string {
  return Math.min(0.95, Math.round(r * 100) / 100).toFixed(2).replace(/^0/, '')
}

/** Smooth path through points (horizontal-tangent cubic, as in the concept). */
export function smooth(pts: [number, number][]): string {
  return pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`
    const q = pts[i - 1], dx = (p[0] - q[0]) / 2
    return `C${q[0] + dx},${q[1]} ${p[0] - dx},${p[1]} ${p[0]},${p[1]}`
  }).join('')
}
