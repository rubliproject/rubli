/**
 * The dossier objects (owner pick 2026-10-29, _explore/dossier_objects_2026-10-29 README «Final picks» + «Round 3d»):
 * «La columna» (after Brancusi) on the vendor dossier and «Homenaje al cuadrado» (after Albers) on the
 * institution dossier. Pure: the expediente model in, a sculpture spec (pieces + DOM labels + picks), the
 * computed claims and the 2D twin's rows out. Every physical property maps to one value; nothing else is drawn.
 * The three.js side (components/kit/motion/Sculpture) only renders the spec.
 */
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { DA_RECORDED_FROM, type Chapter, type Expediente, type Lane } from './expediente'

type Lang = 'es' | 'en'
type V3 = [number, number, number]

/** A data tone: `mix` = a share 0–1 drawn from paper (12% ink) to ink (82%); `token` = a CSS colour token;
 *  `hatch` = NO data (before 2011 CompraNet left the procedure blank): paper with ink hatching, never a ramp tone. */
export type Tone = { mix: number } | { token: string } | { hatch: true }
export interface Piece {
  shape: 'oct' | 'box' | 'oct-dash'
  /** Centre (world units; y up, the floor at 0). */
  at: V3
  /** Full extents x · y · z. */
  size: V3
  tone?: Tone
  /** Ink edge opacity (form only, never data). */
  edge: number
  /** Index into `picks` (keyboard order). */
  pick?: number
}
/** `off`: world units along the SCREEN's right axis from `at` (a column's labels clear its silhouette at any turn). */
export interface SpecLabel { text: string; small?: string; at: V3; off?: number; anchor: 'l' | 'r' | 't'; kind: 'yr' | 'ch'; row?: number }
export interface SpecPick { key: string; read: string }
export interface SculptureSpec {
  pieces: Piece[]
  labels: SpecLabel[]
  picks: SpecPick[]
  view: { az: number; el: number; still: boolean; auto: boolean }
  /** Room for the DOM labels, px each side. */
  margin: { x: number; y: number }
  /** Projected height / width of the object at the hero view (sizes a box that fits it), when known. */
  aspect?: number
}
export interface ObjClaim { key: string; es: string; en: string }

const pct = (x: number) => `${Math.round(x * 100)}%`
const ink = { token: '--color-text-primary' }
const crit = { token: '--color-risk-critical' }
const unrecorded = { hatch: true } as const

/** A supplier/buyer name for a read-out line (a missing name = RFC-shaped or absent; the RFC never). */
export function laneName(l: Pick<Lane, 'type' | 'name' | 'siglas'>, lang: Lang): string {
  if (l.siglas) return l.siglas
  if (!l.name) return l.type === 'vendor' ? (lang === 'en' ? 'Name not published' : 'Nombre no publicado') : '—'
  return formatEntityName(l.type, l.name, 'md')
}

// ═══ La columna ══════════════════════════════════════════════════════════════
export interface Module { year: number; amount: number; n: number; da: number | null; w: number; inCase: boolean; chapter: Chapter | null; opens: boolean }

/** One module per calendar year of the record (base = first year); width = money / the widest year (no floor);
 *  `da` = share without a tender (null before 2011, when CompraNet left it blank); `opens` = an administration starts. */
export function columnModules(m: Expediente, span?: { from: number; to: number } | null): Module[] {
  // the base is the first year with a contract (the expediente's axis opens on its sexenio: no invented empty years)
  const first = m.years.find((y) => (m.byYear[y]?.n_contracts ?? 0) > 0) ?? m.start
  return m.years.filter((y) => y >= first).map((year) => {
    const c = m.byYear[year]
    const chapter = m.chapters.find((k) => year >= k.from && year <= k.to) ?? null
    return {
      year, amount: c?.amount_mxn ?? 0, n: c?.n_contracts ?? 0,
      da: c && c.n_contracts && year >= DA_RECORDED_FROM ? c.n_direct_award / c.n_contracts : null,
      w: c ? c.amount_mxn / m.vmax : 0,
      inCase: !!span && !!c && year >= span.from && year <= span.to,
      chapter, opens: !!chapter && chapter.from === year,
    }
  })
}

const MH = 1.35, MAXW = 4.6, LOFF = MAXW / 2 + 0.25

export function columnSpec(mods: Module[], lang: Lang, phone: boolean): SculptureSpec {
  const en = lang === 'en'
  const pieces: Piece[] = [], labels: SpecLabel[] = [], picks: SpecPick[] = []
  const last = mods[mods.length - 1]?.year
  const sparse = mods.filter((d) => d.n > 0).length < 8 // a short record labels every year
  mods.forEach((d, i) => {
    const y0 = i * MH + MH / 2
    const pick = picks.push({ key: String(d.year), read: moduleRead(d, lang) }) - 1
    if (!d.n) {
      pieces.push({ shape: 'oct-dash', at: [0, y0, 0], size: [1.2, MH, 1.2], edge: 1, pick })
      labels.push({ text: `${d.year} · ${en ? 'no contracts' : 'sin contratos'}`, at: [0, y0, 0], off: LOFF, anchor: 'l', kind: 'yr' })
    } else {
      // 0.06 = a hairline so the thinnest year stays a target; 2002 (166 MDP of 10,054) is 0.08 wide anyway
      const w = Math.max(0.06, MAXW * d.w)
      pieces.push({ shape: 'oct', at: [0, y0, 0], size: [w, MH, w], tone: d.inCase ? crit : d.da == null ? unrecorded : { mix: d.da }, edge: 0.45, pick })
      // the thin years carry their money (the width cannot be read there); every 4th year and the last carry the year
      if (d.w * MAXW < 0.5) labels.push({ text: `${d.year} · ${formatCompactMXN(d.amount)}`, at: [0, y0, 0], off: LOFF, anchor: 'l', kind: 'yr' })
      else if (sparse || d.year % 4 === 2 || d.year === last) labels.push({ text: String(d.year), at: [0, y0, 0], off: LOFF, anchor: 'l', kind: 'yr' })
    }
    if (d.opens && d.chapter) {
      if (i > 0) pieces.push({ shape: 'box', at: [0, i * MH, 0], size: [MAXW * 0.3, 0.07, MAXW * 0.3], tone: ink, edge: 0 })
      labels.push({ text: d.chapter.name, small: String(d.year), at: [0, y0, 0], off: -LOFF, anchor: 'r', kind: 'ch' })
    }
  })
  return { pieces, labels, picks, view: { az: 0.55, el: 0.22, still: false, auto: true }, margin: { x: phone ? 118 : 136, y: 10 } }
}

export function moduleRead(d: Module, lang: Lang): string {
  const en = lang === 'en'
  if (!d.n) return `${d.year}: ${en ? 'no contracts' : 'sin contratos'}`
  const da = d.da != null ? ` · ${pct(d.da)} ${en ? 'without a tender' : 'sin licitación'}` : ''
  return `${d.year}: ${formatCompactMXN(d.amount)} · ${formatNumber(d.n)} ${en ? 'contracts' : 'contratos'}${da}${d.inCase ? (en ? ' · documented case' : ' · caso documentado') : ''}`
}

/** «La columna»'s claims — each only when it holds. */
export function columnClaims(mods: Module[]): ObjClaim[] {
  const out: ObjClaim[] = []
  const live = mods.filter((d) => d.n > 0)
  if (live.length >= 2) {
    const peak = live.reduce((b, d) => (d.amount > b.amount ? d : b))
    out.push({ key: 'peak', es: `Un módulo por año; el más ancho es ${peak.year}.`, en: `One module per year; the widest is ${peak.year}.` })
  }
  const rec = live.filter((d) => d.da != null)
  const dark = rec.filter((d) => (d.da as number) >= 0.75)
  if (rec.length >= 3 && dark.length * 2 >= rec.length) out.push({
    key: 'dark',
    es: `Desde ${rec[0].year}, en ${dark.length} de ${rec.length} años, tres de cada cuatro contratos o más fueron sin licitación: la columna se oscurece.`,
    en: `Since ${rec[0].year}, in ${dark.length} of ${rec.length} years, three in four contracts or more went without a tender: the column darkens.`,
  })
  // a count, never the year list (a 19-year list was a wall of text); the twin / year card name the years
  const yrs = mods.filter((d) => d.year >= (live[0]?.year ?? Infinity))
  const gaps = yrs.filter((d) => !d.n).length
  if (gaps) out.push(gaps === 1
    ? { key: 'gap', es: `Sin contratos en 1 de ${yrs.length} años (el módulo punteado).`, en: `No contracts in 1 of ${yrs.length} years (the dotted module).` }
    : { key: 'gap', es: `Sin contratos en ${gaps} de ${yrs.length} años (los módulos punteados).`, en: `No contracts in ${gaps} of ${yrs.length} years (the dotted modules).` })
  const cs = mods.filter((d) => d.inCase)
  if (cs.length) {
    const span = cs.length > 1 ? `${cs[0].year}–${cs[cs.length - 1].year}` : String(cs[0].year)
    out.push({ key: 'case', es: `En rojo, los años del caso documentado (${span}).`, en: `In red, the years of the documented case (${span}).` })
  }
  return out
}

// ═══ Homenaje al cuadrado ════════════════════════════════════════════════════
export interface InnerSq { lane: Lane; amount: number; share: number; da: number | null; side: number }
export interface Slab { chapter: Chapter; side: number; inner: InnerSq[] }

/** One square per administration: side = √(money / the largest term's) so AREA is the money; inside, the term's
 *  three largest among the record's lanes (its 8 largest suppliers), area = their money, same scale. */
export function albersSlabs(m: Expediente): Slab[] {
  const chaps = m.chapters.filter((c) => c.amount > 0)
  const maxA = Math.max(1, ...chaps.map((c) => c.amount))
  return chaps.map((c) => {
    const rows = m.lanes.map((lane) => {
      let a = 0, n = 0, da = 0
      for (let y = c.from; y <= c.to; y++) { const q = lane.cells[y]; if (q) { a += q.amount_mxn; n += q.n_contracts; da += q.n_direct_award } }
      return { lane, amount: a, share: a / c.amount, da: n && c.da != null ? da / n : null, side: Math.sqrt(a / maxA) }
    }).filter((r) => r.amount > 0).sort((p, q) => q.amount - p.amount).slice(0, 3)
    return { chapter: c, side: Math.sqrt(c.amount / maxA), inner: rows }
  })
}

const SIDE = 7, H = 0.32, NEST = 0.3

export function albersSpec(slabs: Slab[], lang: Lang, phone: boolean): SculptureSpec {
  const pieces: Piece[] = [], labels: SpecLabel[] = [], picks: SpecPick[] = []
  const gap = phone ? 0.9 : 2.2
  const total = slabs.reduce((t, s) => t + SIDE * s.side + gap, -gap)
  let x = -total / 2
  slabs.forEach((s, k) => {
    const side = SIDE * s.side, c = s.chapter, cx = x + side / 2
    const pick = picks.push({ key: c.key, read: slabRead(s, lang) }) - 1
    pieces.push({ shape: 'box', at: [cx, H / 2, 0], size: [side, H, side], tone: c.da == null ? unrecorded : { mix: c.da }, edge: 0.35, pick })
    // never resized to fit: area = money on the slabs' scale. Each sits a step higher, nudged toward the front edge
    // as far as its own size allows, so it always stays over the slab (Albers' downward nesting, honest sizes)
    s.inner.forEach((r, j) => {
      const sd = SIDE * r.side
      const off = Math.min(NEST * (j + 1), side - sd)
      const ip = picks.push({ key: `${c.key}:${r.lane.id}`, read: innerRead(r, c, lang) }) - 1
      pieces.push({ shape: 'box', at: [cx, H + (j + 0.5) * H * 0.6, side / 2 - sd / 2 - off], size: [sd, H * 0.6, sd], tone: r.da == null ? unrecorded : { mix: r.da }, edge: 0.3, pick: ip })
    })
    // labels hang from the slab's near edge (never on its top); on a phone they alternate two rows
    labels.push({ text: c.name, small: phone ? undefined : `${c.from}–${c.to}`, at: [cx, 0, side / 2 + 0.2], anchor: 't', kind: 'ch', row: phone ? k % 2 : 0 })
    x += side + gap
  })
  const el = phone ? 1.2 : 1.1
  const deep = Math.max(...slabs.map((q) => SIDE * q.side)) * Math.sin(el) + H * 2.2 * Math.cos(el)
  return { pieces, labels, picks, aspect: deep / Math.max(1, total), // frontal (az 0, as Albers hung them): every near edge is level, so the names hang clear below it; a phone looks more from above
  view: { az: 0, el, still: true, auto: false }, margin: { x: 8, y: phone ? 40 : 26 } }
}

export function slabRead(s: Slab, lang: Lang): string {
  const en = lang === 'en', c = s.chapter
  const da = c.da != null ? ` · ${pct(c.da)} ${en ? 'without a tender' : 'sin licitación'}` : ''
  return `${c.name} (${c.from}–${c.to}): ${formatCompactMXN(c.amount)} · ${pct(c.share)} ${en ? 'of the record' : 'del expediente'}${da}`
}
export function innerRead(r: InnerSq, c: Chapter, lang: Lang): string {
  const en = lang === 'en'
  const da = r.da != null ? ` · ${pct(r.da)} ${en ? 'without a tender' : 'sin licitación'}` : ''
  return `${laneName(r.lane, lang)} · ${c.name}: ${formatCompactMXN(r.amount)} · ${pct(r.share)} ${en ? 'of the term' : 'del sexenio'}${da}`
}

/** «Homenaje al cuadrado»'s claims — each only when it holds. */
export function albersClaims(slabs: Slab[]): ObjClaim[] {
  const out: ObjClaim[] = []
  if (slabs.length >= 2) {
    const big = slabs.reduce((b, s) => (s.chapter.amount > b.chapter.amount ? s : b)).chapter
    out.push({ key: 'largest', es: `El cuadrado mayor es ${big.name}: ${pct(big.share)} del dinero del expediente.`, en: `The largest square is ${big.name}: ${pct(big.share)} of the record's money.` })
  }
  const rec = slabs.filter((s) => s.chapter.da != null)
  const dark = rec.filter((s) => (s.chapter.da as number) >= 0.5)
  if (rec.length && dark.length) out.push({
    key: 'dark',
    es: `En ${dark.length} de ${rec.length} sexenios con el procedimiento registrado, la mayoría de los contratos fue sin licitación.`,
    en: `In ${dark.length} of ${rec.length} administrations with the procedure on record, most contracts went without a tender.`,
  })
  // the heaviest single supplier inside one term (from 25% of the term's money)
  const top = slabs.flatMap((s) => s.inner.slice(0, 1).map((r) => ({ r, c: s.chapter }))).sort((a, b) => b.r.share - a.r.share)[0]
  if (top && top.r.share >= 0.25) out.push({
    key: 'heavy',
    es: `El cuadrado interior más grande: ${laneName(top.r.lane, 'es')}, ${pct(top.r.share)} del dinero de ${top.c.name}.`,
    en: `The largest inner square: ${laneName(top.r.lane, 'en')}, ${pct(top.r.share)} of the money under ${top.c.name}.`,
  })
  return out
}
