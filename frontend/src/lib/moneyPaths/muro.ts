/**
 * «El muro» (money_paths_2026-10-29 direction B, src/dirB.js) and Rastro's travelling coins (direction A, dirA.js) as
 * PURE scene specs: geometry in world units, one encoding per mark, the read-out text and the drill target of every
 * piece. No three.js here (the lazy MuroScene renders a spec), so every encoding rule is pinned in muro.test.ts.
 *   wall box  = one unit of the record, never changes size. Grey block = the share in view (Gasto) · every box FULL
 *               on Captura (all of it is in view) with the COLOURED block = money to dominant suppliers (sector colour) · a hatched
 *               lid = outside the register by law · a hatched back = nothing can be in view · translucent = a ceiling ·
 *               a lip = signed more than spent · a RED top = crítico indicator (red only there).
 *   coin      = one centavo; struck = still at this step, blank = outside it; a sealed vault = lost sight at a cut.
 */
import type { CapturaPairDetail } from '@/api/captura'
import type { ContractDetail } from '@/api/types'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import type { Relevo } from '@/lib/captura/relevo'
import type { Model } from '@/lib/noSeVe/model'
import { RASTRO, stages, type RastroPack } from './rastro'
import { cv, date, dateS, money, mxnDual, n, nn, pct, tc, type Lang } from './fmt'

export type V3 = [number, number, number]
export interface Box { min: V3; max: V3 }
/** What a piece opens: a ficha (the record card), a route, or the page's own drawer (Gasto · Cajon, Captura · Diseccion). */
export type Open =
  | { kind: 'ficha'; title: string; rows: [string, string][]; href?: string; hrefLabel?: string }
  | { kind: 'nav'; href: string }
  | { kind: 'ente'; key: string }
  | { kind: 'inst'; inst: number; pair?: number }
export interface Cell {
  x: number; y: number
  /** grey block 0–1 (null/0 = empty) */
  fill?: number | null
  /** coloured block 0–1, colour = band */
  cap?: number | null
  ghost?: number | null
  lid?: boolean; dark?: boolean; lip?: boolean; crit?: boolean; hi?: boolean
  band?: string
  t: string
  stop: number
}
export interface Wall { w: number; h: number; d: number; th?: number; cells: Cell[] }
export interface Tray { x: number; z: number; struck: number; seal?: boolean; stop: number; t: string }
export interface Vault { x: number; z: number; w: number; h: number; d: number; t: string; stop: number }
export interface SheetRec { head: string; title: string; article: string | null; artNone: string; ring: string; rows: [string, string][]; stamps: [string, string, '' | 'crit' | 'none'][] }
export interface Sheet { rec: SheetRec; x: number; y: number; z: number; w: number; h: number; stand: boolean; rotY?: number; stop: number; t: string }
export interface Floor { x: number; z: number; w: number; d: number; y?: number }
export interface Label { text: string; small?: string; cls: 'ch' | 'yr' | 'vault'; p: V3; anchor: 'c' | 'l' | 'r' | 't' | 'b' }
export interface Stop { t: string; open?: Open; box: Box }
export interface Spec {
  view: { az: number; el: number; pad: number }
  walls: Wall[]; trays: Tray[]; vaults: Vault[]; sheet?: Sheet; floors: Floor[]
  labels: Label[]; stops: Stop[]
  /** camera boxes: `all` + one per rung the page holds */
  states: Record<string, Box>
  aria: string
  cap: string
  twin: { caption: string; head: string[]; rows: string[][] }
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({ min: [x0, y0, z0], max: [x1, y1, z1] })
const union = (...bs: Box[]): Box => ({ min: [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i]))) as V3, max: [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i]))) as V3 })
const pad = (b: Box, p: number): Box => ({ min: [b.min[0] - p, b.min[1] - p * 0.5, b.min[2]], max: [b.max[0] + p, b.max[1] + p * 0.5, b.max[2]] })
/** The box around wall cells of size w×h×d. */
export const cellsBox = (cells: { x: number; y: number }[], w: number, h: number, d: number): Box =>
  box(Math.min(...cells.map((c) => c.x)) - w / 2, Math.min(...cells.map((c) => c.y)) - h / 2, -d / 2, Math.max(...cells.map((c) => c.x)) + w / 2, Math.max(...cells.map((c) => c.y)) + h / 2, d / 2)
const L = (l: Lang) => (es: string, en: string) => (l === 'en' ? en : es)
export const secName = (id: number | null | undefined, l: Lang) => { const s = SECTORS.find((q) => q.id === id); return s ? (l === 'en' ? s.nameEN : s.name).toLowerCase() : L(l)('otros', 'other') }

// ═══ Gasto · columns = entities, shelves = years; fill = the share of that year’s purchases and works with a contract in view ═══
export function gastoSpec(m: Model, l: Lang, phone: boolean): Spec {
  const t = L(l), Y = m.years, ents = m.ents, W = 3, H = 3, PX = 3.5, cells: Cell[] = [], labels: Label[] = [], stops: Stop[] = []
  const big = new Set(ents.filter((q) => q.grp !== 'ley').sort((a, b) => b.exSum - a.exSum).slice(0, 5).map((q) => q.key))
  ents.forEach((e, k) => {
    const x = k * PX, name = l === 'en' ? e.label.en : e.label.es
    stops.push({ t: `${name}: ${e.grp === 'ley' ? t('fuera de CompraNet por ley', 'outside CompraNet by law') : `${pct(e.share, l)} ${t('con contrato a la vista', 'with a contract in view')} · ${money(e.visSum, l)} ${t('de', 'of')} ${money(e.exSum, l)}, ${Y[0]}–${Y[Y.length - 1]}`}`, open: { kind: 'ente', key: e.key }, box: box(x - W / 2, 0, -1.3, x + W / 2, Y.length * PX, 1.3) })
    Y.forEach((y, i) => {
      if (!(e.ex[i] > 0)) return
      const sh = e.vis[i] / e.ex[i], ley = e.grp === 'ley'
      cells.push({ x, y: i * PX + H / 2, fill: ley ? 0 : Math.min(1, sh), lid: ley, lip: sh > 1 && !ley, stop: k,
        t: `${name} · ${y}: ${money(e.ex[i], l)} ${t('en compras y obra', 'on purchases and works')} · ${ley ? t('fuera de CompraNet por ley', 'outside CompraNet by law') : `${money(e.vis[i], l)} ${t('con contrato a la vista', 'with a contract in view')} · ${pct(sh, l)}${sh > 1 ? t(' (firmó más de lo que gastó)', ' (signed more than it spent)') : ''}`}` })
    })
    if (!phone) labels.push({ text: e.short, cls: 'yr', p: [x, -1.2 - (k % 5) * 3.6, 1.5], anchor: 'c' })
    else if (big.has(e.key)) { const r = [...big].indexOf(e.key); labels.push({ text: e.short, cls: 'yr', p: [x, -2 - (r % 3) * 4.5, 1.5], anchor: 'c' }) }
  })
  Y.forEach((y, i) => { if (!phone || i % 2 === 0) labels.push({ text: String(y), cls: 'yr', p: [-PX * 0.75, i * PX + H / 2, 1.3], anchor: 'r' }) })
  // the project after the decree: one box at the top of its column; fill = the floor, translucent = the ceiling, air = what no contract covers
  const mid = m.mid, kP = ents.findIndex((e) => e.grp === 'proj'), yP = Y.length * PX + 1.2 + H / 2, bn = Math.floor(mid.dark / 1e9)
  const darkTxt = t(`más de ${n(bn, l)} mil millones`, `more than ${n(bn, l)} billion`)
  const sT = stops.length
  stops.push({ t: `${t('Tren Maya, 2022–24', 'Tren Maya, 2022–24')}: ${money(mid.ex, l)} ${t('ejercidos', 'exercised')} · ${t('piso', 'floor')} ${pct(mid.share, l)} · ${t('techo', 'ceiling')} ${pct(mid.ub, l)} · ${darkTxt} ${t('sin contrato que los cubra', 'no contract covers')}`, open: { kind: 'ente', key: m.proj.key }, box: box(kP * PX - W / 2, yP - H / 2, -1.3, kP * PX + W / 2, yP + H / 2, 1.3) })
  cells.push({ x: kP * PX, y: yP, fill: mid.share, ghost: mid.ub, hi: true, stop: sT, t: stops[sT].t })
  labels.push({ text: '2022–24', small: `${t('piso', 'floor')} ${pct(mid.share, l)} · ${t('techo', 'ceiling')} ${pct(mid.ub, l)}`, cls: 'ch', p: [kP * PX + W / 2 + 0.8, yP - 1.0, 1.3], anchor: 'l' })
  if (!phone) labels.push({ text: `${t('vacío', 'empty')}: ${t(`más de ${n(bn, l)} mil M`, `more than ${n(bn, l)} bn`)}`, cls: 'yr', p: [kP * PX + W / 2 + 0.8, yP + 1.7, 1.3], anchor: 'l' })
  const wb = cellsBox(cells, W, H, 2.6)
  const all = pad(wb, 2.5); all.min[1] = phone ? -14 : -18; all.min[0] = phone ? -10 : -7
  const r1: Box = { min: [...all.min] as V3, max: [all.max[0], Y.length * PX + 0.5, all.max[2]] }
  const r2 = box(kP * PX - 2.4, phone ? -14 : -18, -1.3, kP * PX + 20, yP + 2.2, 1.3)
  const grp = { proj: t('proyecto', 'project'), ns: t('seguridad nacional', 'national security'), civ: t('civil', 'civilian'), ley: t('fuera por ley', 'outside by law') }
  return {
    view: { az: 0.18, el: 0.3, pad: 1.1 },
    walls: [{ w: W, h: H, d: 2.6, cells }], trays: [], vaults: [], floors: [{ x: ((ents.length - 1) * PX) / 2, z: 0, w: ents.length * PX + 1, d: 5 }],
    labels, stops, states: { all, 1: r1, 2: r2 },
    aria: t('El muro: una caja por ente y año; el bloque sube hasta la parte de compras y obra con contrato a la vista; caja vacía = nada a la vista; tapa rayada = fuera de CompraNet por ley', 'The wall: one box per entity and year; the block rises to the share of purchases and works with a contract in view; empty box = nothing in view; hatched lid = outside CompraNet by law'),
    cap: t(`**una caja = un ente en un año** (Cuenta Pública ${Y[0]}–${String(Y[Y.length - 1]).slice(2)}) · el **bloque** sube hasta la parte de sus compras y obra con contrato a la vista: lleno = todo; vacío = nada · **ceja** = firmó más de lo que gastó ese año (plurianuales) · **tapa rayada** = fuera de CompraNet por ley · sin caja = sin gasto ese año · la caja del Tren Maya **2022–24**: bloque = piso, **translúcido** = techo con lo firmado hasta 2021, el aire = lo que ningún contrato cubre${phone ? ' · en el teléfono se nombran los cinco entes que más gastan; los demás, en la lista' : ''}. Las cajas son iguales: el tamaño del ente va en su cajón.`,
      `**one box = one entity in one year** (public accounts ${Y[0]}–${String(Y[Y.length - 1]).slice(2)}) · the **block** rises to the share of its purchases and works with a contract in view: full = all; empty = none · **lip** = signed more than it spent that year (multi-year) · **hatched lid** = outside CompraNet by law · no box = no spend that year · the Tren Maya **2022–24** box: block = floor, **translucent** = ceiling with signatures through 2021, the air = what no contract covers${phone ? ' · on a phone the five largest spenders are named; the rest are in the list' : ''}. Boxes are identical: the entity’s size is in its drawer.`),
    twin: {
      caption: t('El muro en lista: los entes', 'The wall as a list: the entities'),
      head: [t('Ente', 'Entity'), t('Grupo', 'Group'), `${t('Ejercido', 'Exercised')} ${Y[0]}–${Y[Y.length - 1]}`, t('Con contrato a la vista', 'With a contract in view'), t('Parte', 'Share')],
      rows: [
        ...ents.map((e) => [l === 'en' ? e.label.en : e.label.es, grp[e.grp], money(e.exSum, l), e.grp === 'ley' ? '—' : money(e.visSum, l), e.grp === 'ley' ? t('fuera de CompraNet', 'outside CompraNet') : `${e.share != null && e.share > 1 ? '> ' : ''}${pct(e.share == null ? null : Math.min(1, e.share), l)}`]),
        [t('Tren Maya · 2022–24 (después del decreto)', 'Tren Maya · 2022–24 (after the decree)'), t('piso · techo', 'floor · ceiling'), money(mid.ex, l), `${money(mid.vis, l)} · ${t('hasta', 'up to')} ${money(mid.vis + mid.carry, l)}`, `${pct(mid.share, l)}–${pct(mid.ub, l)} · ${darkTxt} ${t('sin contrato', 'no contract')}`],
      ],
    },
  }
}

// ═══ the stamped sheet (El sello): the record's own fields; hollow dashed stamps = what the register does not carry ═══
export function contractRec(c: Pick<ContractDetail, 'contract_number' | 'title' | 'amount_mxn' | 'contract_date' | 'publication_date' | 'award_date' | 'start_date' | 'end_date' | 'risk_score' | 'source_structure' | 'procedure_number'>, x: { buyer: string; vendor: string; article: string | null; proc: string; procSub?: string | null }, l: Lang): SheetRec {
  const t = L(l), lvl = getRiskLevelFromScore(c.risk_score ?? 0), crit = lvl === 'critical'
  const LV = { critical: t('crítico', 'critical'), high: t('alto', 'high'), medium: t('medio', 'medium'), low: t('bajo', 'low') }
  const no = t('no consta', 'not recorded')
  return {
    head: `${c.contract_number ?? ''} · ${c.source_structure === 'E' ? 'ComprasMX' : 'CompraNet'} · ${c.procedure_number ?? ''}`, title: tc(c.title), article: x.article, artNone: t('NO CONSTA', 'NOT RECORDED'), ring: t('FUNDAMENTO LEGAL · COMO CONSTA · ', 'LEGAL BASIS · AS RECORDED · '),
    rows: [[t('Comprador', 'Buyer'), x.buyer], [t('Proveedor', 'Supplier'), x.vendor], [t('Monto', 'Amount'), mxnDual(c.amount_mxn ?? 0, l, c.contract_date ? +c.contract_date.slice(0, 4) : undefined)], [t('Firmado', 'Signed'), date(c.contract_date, l)], [t('Publicado', 'Published'), c.publication_date ? date(c.publication_date, l) : no], [t('Fallo', 'Award'), c.award_date ? date(c.award_date, l) : no], [t('Vigencia', 'Validity'), c.start_date && c.end_date ? `${dateS(c.start_date, l)} → ${dateS(c.end_date, l)}` : '—']],
    stamps: [[x.proc, x.procSub ?? '', ''], [`${t('INDICADOR', 'INDICATOR')} ${(c.risk_score ?? 0).toFixed(2).replace(/^0/, '')}`, LV[lvl], crit ? 'crit' : ''], [t('PAGO', 'PAYMENT'), no, 'none'], [t('ENTREGA', 'DELIVERY'), no, 'none'], [t('PRECIO POR PIEZA', 'UNIT PRICE'), no, 'none'], [t('POSTORES', 'BIDDERS'), no, 'none']],
  }
}

// ═══ Captura · the five administrations as a shelf, the buyers as a wall, the pair as a block of years, the contract as a box that holds its sheet ═══
export interface CapturaIn { m: Relevo; pair: CapturaPairDetail | null; contract: ContractDetail | null; vendorName: string }
export function capturaSpec({ m, pair, contract, vendorName }: CapturaIn, l: Lang, phone: boolean): Spec {
  const t = L(l), walls: Wall[] = [], labels: Label[] = [], stops: Stop[] = [], twin: string[][] = []
  const m0 = (v: number) => (v > 0 ? money(v, l) : '—')
  const buyers = [...m.buyer.values()], postTotal = buyers.reduce((s, b) => s + (b.post_total || 0), 0)
  const named = m.series.filter((s) => s.sector != null)
  // 2 · administrations (big boxes) above the buyers (small boxes, 12 per row, most money to dominant suppliers first)
  const BW = 6, SY = 12 * 2.6 + 10, big: Cell[] = [], small: Cell[] = []
  m.chapters.forEach((c, k) => {
    const per = named.map((s) => ({ s, v: s.vals.reduce((a, v, i) => a + (2002 + i >= c.a && 2002 + i <= c.b ? v : 0), 0) })).filter((q) => q.v > 0).sort((p, q) => q.v - p.v)
    const top = per[0], span = `${c.a}${c.b > c.a ? `–${c.b}` : t(' · a sep', ' · to Sep')}`
    const tt = `${c.name} (${span}): ${money(c.total, l)} ${t('gastados', 'spent')} · ${money(c.cap, l)} ${t('a proveedores dominantes', 'to dominant suppliers')} · ${pct(c.share, l)}${top ? ` · ${t('mayor sector', 'largest sector')}: ${secName(top.s.sector, l)}` : ''}`
    stops.push({ t: tt, open: { kind: 'ficha', title: `${c.name} · ${span}`, rows: [[t('Gasto', 'Spend'), money(c.total, l)], [t('A proveedores dominantes', 'To dominant suppliers'), `${money(c.cap, l)} · ${pct(c.share, l)}`], ...per.slice(0, 4).map((q) => [secName(q.s.sector, l), money(q.v, l)] as [string, string])] }, box: box(k * (BW + 0.8), SY, -1.6, k * (BW + 0.8) + BW, SY + BW, 1.6) })
    big.push({ x: k * (BW + 0.8) + BW / 2, y: SY + BW / 2, fill: 1, cap: c.share, band: top ? top.s.color : m.colorOf(null), t: tt, stop: stops.length - 1 })
    if (!phone) labels.push({ text: c.name.split(' ')[0], small: pct(c.share, l), cls: 'ch', p: [k * (BW + 0.8) + BW / 2, SY + BW + 0.3, 1.4], anchor: 't' })
    twin.push([c.name, `${t('sexenio', 'administration')} · ${span}`, m0(c.total), m0(c.cap), pct(c.share, l)])
  })
  {
    const x = 5 * (BW + 0.8) + BW / 2, sh = postTotal > 0 ? m.postM / postTotal : 0
    const tt = `ComprasMX ${t('desde el apagón', 'since the blackout')}: ${money(postTotal, l)} ${t('gastados', 'spent')} · ${money(m.postM, l)} ${t('a proveedores dominantes', 'to dominant suppliers')} · ${pct(sh, l)}`
    stops.push({ t: tt, box: box(x - BW / 2, SY, -1.6, x + BW / 2, SY + BW, 1.6) })
    big.push({ x, y: SY + BW / 2, fill: 1, cap: sh, band: m.colorOf(null), t: tt, stop: stops.length - 1 })
    if (!phone) labels.push({ text: 'MX', small: t('desde sep 2025', 'since Sep 2025'), cls: 'ch', p: [x, SY + BW + 0.3 + 4.4, 1.4], anchor: 't' })
    else labels.push({ text: t('Fox → Sheinbaum · MX', 'Fox → Sheinbaum · MX'), small: t('una caja por sexenio · color = a proveedores dominantes', 'one box per administration · colour = to dominant suppliers'), cls: 'yr', p: [-1.2, SY + BW + 3, 1.4], anchor: 'l' })
    twin.push(['ComprasMX', `ComprasMX · ${t('desde sep 2025', 'since Sep 2025')}`, m0(postTotal), m0(m.postM), pct(sh, l)])
  }
  const sW = stops.length
  stops.push({ t: t(`${n(m.register.length, l)} compradores, de más a menos dinero a proveedores dominantes · Enter abre el IMSS`, `${n(m.register.length, l)} buyers, most money to dominant suppliers first · Enter opens the IMSS`), open: { kind: 'inst', inst: 251 }, box: box(-1.1, -1.1, -1, 12 * 2.6, 12 * 2.6, 1) })
  m.register.forEach((b, k) => {
    const cx = (k % 12) * 2.6 + 1.1, cy = (11 - Math.floor(k / 12)) * 2.6 + 1.1, nm = b.siglas || tc(b.name).slice(0, 28)
    const s2425 = b.share2425
    small.push({ x: cx, y: cy, fill: s2425 == null ? 0 : 1, cap: s2425 == null ? 0 : Math.min(1, s2425), band: m.colorOf(b.sector_id), hi: b.institution_id === 251, stop: sW,
      t: `${nm}: ${nn(b.n, l, 'proveedor dominante', 'proveedores dominantes', 'dominant supplier', 'dominant suppliers')} (${b.cur} ${t('vigentes', 'current')}) · ${money(b.cap, l)} ${t('dinero a proveedores dominantes', 'money to dominant suppliers')} · ${s2425 == null ? t('sin gasto 2024–25', 'no 2024–25 spend') : `${pct(s2425, l)} ${t('de su gasto 2024–25', 'of its 2024–25 spend')}`} · ${secName(b.sector_id, l)}` })
    if (!phone && k < 12) labels.push({ text: (b.siglas || tc(b.name)).slice(0, 9), cls: 'yr', p: [cx, cy + 1.3 + (k % 3) * 2.2, 1.4], anchor: 't' })
    twin.push([b.siglas || tc(b.name), `${t('comprador', 'buyer')} · 2024–25`, m0(b.y_total[22] + b.y_total[23]), m0(b.y_cap[22] + b.y_cap[23]), s2425 == null ? t('sin gasto 2024–25', 'no 2024–25 spend') : pct(s2425, l)])
  })
  labels.push({ text: phone ? t(`${m.register.length} compradores · color = a proveedores dominantes`, `${m.register.length} buyers · colour = to dominant suppliers`) : t(`${m.register.length} compradores, de más a menos dinero a proveedores dominantes · bloque de color = parte de su gasto 2024–25 a proveedores dominantes`, `${m.register.length} buyers, most money to dominant suppliers first · coloured block = share of its 2024–25 spend to dominant suppliers`), cls: 'yr', p: [-1.2, -1.6, 1.4], anchor: 'l' })
  walls.push({ w: 2.2, h: 2.2, d: 2, cells: small }, { w: BW, h: BW, d: 3.2, cells: big })
  const r2 = pad(union(cellsBox(small, 2.2, 2.2, 2), cellsBox(big, BW, BW, 3.2)), 2); r2.min[1] = -3.5; r2.max[1] += phone ? 7 : 4
  const states: Record<string, Box> = { 2: r2 }
  let sheet: Sheet | undefined
  const floors: Floor[] = []
  let all = r2
  if (pair) {
    // 3 · the pair: 24 year boxes (coloured block = the year's money ÷ the largest year), IMSS vs others, ComprasMX
    const pr = pair.pair, X3 = 5 * (BW + 0.8) + BW + 40, yrs = new Map(pr.yrs.map(([y, v]) => [y, v])), yMax = Math.max(...pr.yrs.map(([, v]) => v)), band = m.colorOf(m.buyer.get(pr.institution_id)?.sector_id)
    const vn = tc(vendorName), bs = m.buyer.get(pr.institution_id)?.siglas || 'IMSS', yc: Cell[] = [], bc: Cell[] = []
    const sY = stops.length
    stops.push({ t: t(`${vn} ← ${bs}, un año por caja, 2002–2025 · Enter disecciona la pareja`, `${vn} ← ${bs}, one year per box, 2002–2025 · Enter dissects the pair`), open: { kind: 'inst', inst: pr.institution_id, pair: pr.vendor_id }, box: box(X3, 0, -1, X3 + 6 * 2.6, 4 * 2.6, 1) })
    for (let y = 2002; y <= 2025; y++) {
      const v = yrs.get(y) || 0, by = pair.by_year?.find((r) => r[0] === y), gy = 3 - Math.floor((y - 2002) / 6), gx = (y - 2002) % 6
      yc.push({ x: X3 + gx * 2.6 + 1.1, y: gy * 2.6 + 1.1, fill: 1, cap: v / yMax, band, stop: sY, t: `${y}: ${money(v, l)} ${t(`del ${bs} a ${vn}`, `from the ${bs} to ${vn}`)}${by ? ` · ${nn(by[1], l, 'contrato', 'contratos', 'contract', 'contracts')}` : ''}` })
      if (gx === 0) labels.push({ text: `${y}–${String(y + 5).slice(2)}`, cls: 'yr', p: [X3 - 0.4, gy * 2.6 + 1.1, 1.2], anchor: 'r' })
      twin.push([`${vn} ← ${bs}`, `${t('pareja', 'pair')} · ${y}`, '—', m0(v), `${pct(v / yMax, l)} ${t('del año mayor', 'of the largest year')}`])
    }
    const BY = 4 * 2.6 + 2.2, lockTxt = pr.lock0 != null ? t(` · bajo candado (≥ 80% del año) en ${pr.lockn} de sus ${pr.ny} años, ${pr.lock0}–${pr.lock1}`, ` · under lock (≥ 80% of the year) in ${pr.lockn} of its ${pr.ny} years, ${pr.lock0}–${pr.lock1}`) : ''
    const three: [string, number, string, string][] = [
      [bs, pr.sh, band, `${bs}: ${pct(pr.sh, l)} ${t(`del ingreso federal de ${vn}`, `of ${vn}’s federal income`)} · ${money(pr.m, l)}${lockTxt}`],
      [t('otros', 'others'), 1 - pr.sh, m.colorOf(null), `${t('Otros compradores', 'Other buyers')}${pr.nbuyers ? ` (${pr.nbuyers - 1})` : ''}: ${pct(1 - pr.sh, l)} · ${money(pr.vt - pr.m, l)}`],
      ['MX', yMax > 0 ? pr.post / yMax : 0, band, `ComprasMX: ${nn(pr.post_n, l, 'contrato', 'contratos', 'contract', 'contracts')} ${t('desde el apagón', 'since the blackout')} · ${money(pr.post, l)}`],
    ]
    three.forEach(([nm, cap, b, tt], i) => {
      const x = X3 + 3 + i * 7
      stops.push({ t: tt, open: { kind: 'inst', inst: pr.institution_id, pair: pr.vendor_id }, box: box(x - 3, BY, -1.6, x + 3, BY + 6, 1.6) })
      bc.push({ x, y: BY + 3, fill: 1, cap, band: b, hi: i === 0, stop: stops.length - 1, t: tt })
      labels.push({ text: nm, small: i < 2 ? pct(cap, l) : nn(pr.post_n, l, 'contrato', 'contratos', 'contract', 'contracts'), cls: 'ch', p: [x, BY + 6.4, 1.4], anchor: 't' })
    })
    labels.push({ text: phone ? t('un año por caja · color = dinero del año', 'one year per box · colour = money of the year') : t(`${vn} ← ${bs}, un año por caja · bloque de color = dinero del año contra el mayor`, `${vn} ← ${bs}, one year per box · coloured block = the year’s money against the largest`), cls: 'yr', p: [X3 - 1.2, -1.6, 1.4], anchor: 'l' })
    walls.push({ w: 2.2, h: 2.2, d: 2, cells: yc }, { w: 6, h: 6, d: 3.2, cells: bc })
    const r3 = pad(union(cellsBox(yc, 2.2, 2.2, 2), cellsBox(bc, 6, 6, 3.2)), 2); r3.min[1] = -3.5; r3.min[0] -= 7; r3.max[1] += 3
    states[3] = r3
    all = union(all, r3)
    if (contract) {
      // 4 · the contract: a full box (what was signed) with a RED top only when the indicator is crítico; beside it the box after the signature
      const X4 = X3 + 24 * 2.6 + 10, crit = getRiskLevelFromScore(contract.risk_score ?? 0) === 'critical', c4: Cell[] = []
      const proc = contract.is_direct_award ? t('adjudicación directa', 'direct award') : t('licitación pública', 'public tender')
      const ct = `${contract.contract_number} · ${tc(contract.title)}: ${money(contract.amount_mxn, l)} · ${proc} · ${t('firmado', 'signed')} ${dateS(contract.contract_date, l)} · ${t('indicador', 'indicator')} ${(contract.risk_score ?? 0).toFixed(2)}`
      stops.push({ t: ct, open: { kind: 'nav', href: `/contracts/${contract.id}` }, box: box(X4 - 5, 0, -2, X4 + 5, 10.4, 2) })
      c4.push({ x: X4, y: 5, fill: 1, cap: 1, band, crit, stop: stops.length - 1, t: ct })
      const after = t('Después de la firma: en lo que RUBLI reúne no hay pago, entrega ni precio por estudio ligados a este contrato', 'After the signature: in what RUBLI gathers there is no payment, delivery or unit price tied to this contract')
      stops.push({ t: after, box: box(X4 + 7, 0, -2, X4 + 17, 10, 2) })
      c4.push({ x: X4 + 12, y: 5, fill: 0, dark: true, stop: stops.length - 1, t: after })
      walls.push({ w: 10, h: 10, d: 4, cells: c4 })
      stops.push({ t: t('La hoja: lo que el registro sí trae del contrato; los sellos punteados, lo que no', 'The sheet: what the register carries about the contract; the dashed stamps, what it does not'), open: { kind: 'nav', href: `/contracts/${contract.id}` }, box: box(X4 - 3.5, 0.6, 2, X4 + 3.5, 9.8, 2.6) })
      sheet = { rec: contractRec(contract, { buyer: bs, vendor: vn, article: null, proc: proc.toUpperCase(), procSub: contract.procedure_character }, l), x: X4, y: 0.6, z: 2.3, w: 7, h: 9.2, stand: true, stop: stops.length - 1, t: stops[stops.length - 1].t }
      labels.push({ text: t('el contrato', 'the contract'), small: `${money(contract.amount_mxn, l)}${phone ? '' : ` · ${(contract.contract_date ?? '').slice(0, 4)} · ${t('indicador', 'indicator')} ${(contract.risk_score ?? 0).toFixed(2)}`}`, cls: 'ch', p: [X4 + 5, 12, 2.1], anchor: 'r' })
      labels.push({ text: phone ? t('después: no consta', 'after: not recorded') : t('después de la firma', 'after the signature'), small: phone ? undefined : t('ni pago, ni entrega, ni precio', 'no payment, delivery or price'), cls: 'vault', p: [X4 + 7.2, 12, 2.1], anchor: 'l' })
      floors.push({ x: X4 + 6, z: 0, w: 30, d: 6 })
      const r4 = pad(box(X4 - 5, 0, -2, X4 + 17, 10, 2.6), 2); r4.min[1] = -1; r4.max[1] += 2.5; r4.min[0] -= 3; r4.max[0] += 3
      states[4] = r4
      all = union(all, r4)
      twin.push([`${contract.contract_number} · ${tc(contract.title)}`, `${t('contrato', 'contract')} · ${(contract.contract_date ?? '').slice(0, 4)}`, '—', m0(contract.amount_mxn ?? 0), `${t('indicador', 'indicator')} ${(contract.risk_score ?? 0).toFixed(2)}`])
    }
  }
  states.all = all
  return {
    view: { az: 0.12, el: 0.28, pad: 1.1 }, walls, trays: [], vaults: [], sheet, floors, labels, stops, states,
    aria: t('El muro: cinco cajas por sexenio (bloque = parte del gasto a proveedores dominantes), una caja por comprador (bloque = parte de su gasto 2024–25 a proveedores dominantes, color = sector), la pareja por año y su contrato', 'The wall: five boxes per administration (block = share of spend to dominant suppliers), one box per buyer (block = share of its 2024–25 spend to dominant suppliers, colour = sector), the pair by year and its contract'),
    cap: t('En esta página todo el dinero está a la vista: **cada caja va llena** (gris). El **bloque de color** es la única medida: **arriba**, una caja por sexenio, el bloque sube hasta la parte del gasto de los compradores que fue a sus proveedores dominantes, y su color es el sector que más cobró · **abajo**, una caja por comprador (de más a menos dinero a proveedores dominantes), el bloque = la parte de su gasto 2024–25 a proveedores dominantes, color = su sector; caja vacía = sin gasto 2024–25; borde = el IMSS · **la pareja**: una caja por año, bloque = dinero del año contra el mayor; IMSS / otros = de dónde viene su ingreso · **el contrato**: caja llena = lo firmado, **tapa roja** = indicador crítico, la hoja = sus campos; la caja de **fondo rayado** = lo que no consta después de la firma.',
      'On this page all the money is in view: **every box is full** (grey). The **coloured block** is the one measure: **top**, one box per administration, the block rises to the share of the buyers’ spend that went to their dominant suppliers, its colour the sector that took most · **below**, one box per buyer (most money to dominant suppliers first), block = share of its 2024–25 spend to dominant suppliers, colour = its sector; empty box = no 2024–25 spend; outline = the IMSS · **the pair**: one box per year, block = the year’s money against the largest; IMSS / others = where its income comes from · **the contract**: full box = what was signed, **red top** = critical indicator, the sheet = its fields; the **hatched-back** box = what is not recorded after the signature.'),
    twin: { caption: t('El muro en lista: sexenios, compradores, la pareja, el contrato', 'The wall as a list: administrations, buyers, the pair, the contract'), head: [t('Fila', 'Row'), t('Tipo · periodo', 'Kind · period'), t('Gasto', 'Spend'), t('A proveedores dominantes / dinero', 'To dominant suppliers / money'), t('Parte', 'Share')], rows: twin },
  }
}

// ═══ Rastro · six trays of 100 coins (1 coin = 1 centavo); the struck ones travel tray to tray; sealed vaults where sight is lost ═══
export const COIN = { P: 1.15, R: 0.5, H: 0.09 }
export function rastroSpec(contract: Pick<ContractDetail, 'id' | 'contract_number' | 'title' | 'amount_mxn' | 'contract_date' | 'publication_date' | 'award_date' | 'start_date' | 'end_date' | 'risk_score' | 'source_structure' | 'procedure_number' | 'procedure_type'>, l: Lang, phone: boolean, R: RastroPack = RASTRO): Spec {
  const t = L(l), ST = stages(l, R), P = COIN.P, TX = 10 * P + 4.2, trays: Tray[] = [], vaults: Vault[] = [], labels: Label[] = [], stops: Stop[] = []
  const trayBox = (k: number): Box => box(k * TX - 0.45 - P / 2, 0, -0.45 - P / 2, k * TX + 9 * P + 0.45 + P / 2, 0.4, 9 * P + 0.45 + P / 2)
  ST.forEach((st, k) => {
    const tt = `${st.t}: ${cv(st.c, l)} ¢ · ${st.d}`
    stops.push({ t: tt, open: { kind: 'ficha', title: `${st.t} · ${cv(st.c, l)} ¢`, rows: [[t('Qué es', 'What it is'), st.d], [t('En cifras', 'In figures'), st.what.join(' · ')], ...st.rows], href: st.href }, box: trayBox(k) })
    trays.push({ x: k * TX, z: 0, struck: Math.round(st.c), seal: st.seal, stop: k, t: tt })
    labels.push({ text: st.t, small: `${cv(st.c, l)} ¢${phone ? '' : ` · ${st.what[0]}`}`, cls: 'ch', p: [k * TX + 4.5 * P, 0, 10 * P + 0.6 + (k === 5 ? 1.6 : 0)], anchor: 'b' })
    if (k > 0) {
      const drop = ST[k - 1].c - st.c, gx = k * TX - 2.1
      if (st.lost) {
        stops.push({ t: `${st.cut}: −${cv(drop, l)} ¢ · ${st.why}`, box: box(gx - 1.5, 0, 10 * P + 5.8, gx + 1.5, 1.6, 10 * P + 9) })
        vaults.push({ x: gx, z: 10 * P + 7.4, w: 3, h: 1.6, d: 3.2, t: stops[stops.length - 1].t, stop: stops.length - 1 })
      }
      labels.push({ text: `−${cv(drop, l)} ¢`, small: phone ? undefined : st.cut, cls: 'vault', p: [gx, 0, 10 * P + 11.5], anchor: 'b' })
    }
  })
  const proc = t('SIN CONCURSO', 'NO TENDER')
  stops.push({ t: `${contract.contract_number} · ${money(contract.amount_mxn, l)} · ${date(contract.contract_date, l)} · ${t('los sellos punteados: lo que no consta después de la firma', 'the dashed stamps: what is not recorded after the signature')}`, open: { kind: 'nav', href: `/contracts/${contract.id}` }, box: trayBox(5) })
  const sheet: Sheet = { rec: contractRec(contract, { buyer: 'IMSS', vendor: tc(R.maypo.name).replace(/S\.a de C\.v/i, 'S.A. de C.V.'), article: t('ART. 41\nFR. III', 'ART. 41\nSEC. III'), proc, procSub: t('pérdidas o costos adicionales', 'losses or additional costs') }, l), x: 5 * TX + 4.5 * P, y: 0.35, z: 4.5 * P, w: 8, h: 10.5, stand: false, rotY: -0.05, stop: stops.length - 1, t: stops[stops.length - 1].t }
  labels.push({ text: phone ? t('1 moneda = 1 centavo', '1 coin = 1 centavo') : t('1 moneda = 1 centavo · un peso del IMSS en medicinas, 2024', '1 coin = 1 centavo · one IMSS peso on medicines, 2024'), cls: 'yr', p: [-1.5, 0, -2.2], anchor: 'l' })
  const g = (...ks: number[]) => { const b = union(...ks.map(trayBox)); b.min[0] -= phone ? 4 : 3; b.max[0] += phone ? 4 : 3; b.min[2] -= 2; b.max[2] += phone ? 16 : 14; return b }
  const all = union(g(0, 1, 2, 3, 4, 5))
  return {
    view: { az: 0.45, el: 0.5, pad: 1.1 }, walls: [], trays, vaults, sheet, floors: [], labels, stops,
    states: { all, 1: g(0), 2: g(1, 2, 3), 3: g(4), 4: (() => { const b = trayBox(5); b.min[0] -= 1; b.max[0] += 1; b.min[2] -= 1; b.max[2] += phone ? 5 : 4; return b })() },
    aria: t('Seis bandejas: los cien centavos de un peso del IMSS en medicinas, 2024; las monedas acuñadas siguen en ese paso, las lisas quedan fuera de él; las cajas selladas, lo que perdemos en cada corte', 'Six trays: the hundred centavos of one IMSS peso on medicines, 2024; struck coins stay at that step, blank ones fall outside it; the sealed vaults, what we lose at each cut'),
    cap: t('**una moneda = un centavo** del peso que el IMSS gastó en medicinas en 2024 · **acuñada** = sigue en este paso; **lisa** = fuera de este paso · cada bandeja es parte de la anterior: del tercer paso en adelante se cuentan solo las compras sin concurso · **caja sellada** = lo que perdemos de vista en ese corte; solo las cajas son pérdida de vista: las monedas lisas de «bajo la lupa» y «Maypo» siguen a la vista, fuera del filtro · **rojo** = el proveedor en el nivel más alto de la fila de investigación · **la hoja** = el contrato; sus sellos punteados, lo que no consta después de la firma. Menos de media moneda no se acuña.',
      '**one coin = one centavo** of the peso the IMSS spent on medicines in 2024 · **struck** = still at this step; **blank** = outside this step · each tray is part of the one before: from the third step on, only direct awards count · **sealed vault** = what we lose sight of at that cut; only the vaults are lost sight: the blank coins of «under the lens» and «Maypo» stay in view, outside the filter · **red** = the supplier at the top tier of the investigation queue · **the sheet** = the contract; its dashed stamps, what is not recorded after the signature. Under half a coin nothing is struck.'),
    twin: {
      caption: t('Las seis bandejas en lista', 'The six trays as a list'),
      head: [t('Paso', 'Step'), t('Qué es', 'What it is'), t('A la vista', 'In view'), t('Lo que se pierde en el corte', 'What is lost at the cut')],
      rows: ST.map((s, k) => [s.t, s.d, `${cv(s.c, l)} ¢`, k > 0 ? `−${cv(ST[k - 1].c - s.c, l)} ¢ · ${s.cut}` : '—']),
    },
  }
}

// ═══ El muro, plano (owner 2026-11-06: «broken and unusable», «what am I looking at?»): one row per entity, one cell per
// period, the cell filled to the share and the number printed. Mariana's three lines above it: qué ves · cómo se lee · qué significa.
export interface GridCell {
  /** 0–1 fill; null = no bar (no spend, or outside the register by law) */
  v: number | null
  label: string
  kind?: 'ley' | 'over' | 'none'
  t: string
}
export interface GridRow { key: string; name: string; full: string; open?: Open; hi?: boolean; cells: GridCell[] }
export interface Grid {
  caption: string
  /** the row header's name for screen readers (Ente / Comprador) */
  rowHead: string
  /** sr-only mark on the highlighted row */
  hiNote?: string
  cols: { k: string; sub?: string }[]
  rows: GridRow[]
  /** qué ves · cómo se lee · qué significa (the finding) */
  lines: [string, string, string]
  note?: string
}

/** /gasto-a-ciegas: entities × years; fill = the share of that year's purchases and works with a contract in view. */
export function gastoGrid(m: Model, l: Lang): Grid {
  const t = L(l), Y = m.years
  const rows: GridRow[] = m.ents.map((e) => {
    const full = l === 'en' ? e.label.en : e.label.es, ley = e.grp === 'ley'
    return {
      key: e.key, name: e.short, full, open: { kind: 'ente', key: e.key },
      cells: Y.map((y, i) => {
        if (!(e.ex[i] > 0)) return { v: null, label: '—', kind: 'none' as const, t: `${full} · ${y}: ${t('sin gasto ese año', 'no spending that year')}` }
        if (ley) return { v: null, label: t('ley', 'law'), kind: 'ley' as const, t: `${full} · ${y}: ${money(e.ex[i], l)} · ${t('fuera de CompraNet por ley', 'outside CompraNet by law')}` }
        const sh = e.vis[i] / e.ex[i]
        return {
          v: Math.min(1, sh), label: sh > 1 ? t('+100%', '+100%') : pct(sh, l), kind: sh > 1 ? 'over' as const : undefined,
          t: `${full} · ${y}: ${money(e.vis[i], l)} ${t('con contrato a la vista de', 'with a contract in view out of')} ${money(e.ex[i], l)} ${t('en compras y obra', 'on purchases and works')} · ${pct(sh, l)}${sh > 1 ? t(' (firmó más de lo que gastó: contratos de varios años)', ' (signed more than it spent: multi-year contracts)') : ''}`,
        }
      }),
    }
  })
  const semar = m.by.get('semar'), mid = m.mid, bn = Math.floor(mid.dark / 1e9)
  return {
    rowHead: t('Ente', 'Entity'),
    caption: t(`Entes públicos por año, ${Y[0]}–${Y[Y.length - 1]}: parte de sus compras y obra con contrato a la vista`, `Public entities by year, ${Y[0]}–${Y[Y.length - 1]}: share of their purchases and works with a contract in view`),
    cols: Y.map((y) => ({ k: String(y) })),
    rows,
    lines: [
      t(`Una fila por ente público; una casilla por año, ${Y[0]}–${Y[Y.length - 1]}.`, `One row per public entity; one cell per year, ${Y[0]}–${Y[Y.length - 1]}.`),
      t('Barra llena = todo su gasto tiene contrato a la vista. «ley»: fuera de CompraNet por ley.', 'Full bar = all its spending has a contract in view. «law»: outside CompraNet by law.'),
      t(`Los entes civiles dejan ver ${pct(m.civMedian, l)} en la mediana${semar?.share != null ? `; la Marina, ${pct(Math.min(1, semar.share), l)}` : ''}.`, `Civilian entities show ${pct(m.civMedian, l)} at the median${semar?.share != null ? `; the Navy, ${pct(Math.min(1, semar.share), l)}` : ''}.`),
    ],
    note: t(`Tren Maya después del decreto (2022–24): ${money(mid.ex, l)} ejercidos; con contrato a la vista entre ${pct(mid.share, l)} y ${pct(mid.ub, l)}; más de ${n(bn, l)} mil millones sin contrato que los cubra.`, `Tren Maya after the decree (2022–24): ${money(mid.ex, l)} exercised; between ${pct(mid.share, l)} and ${pct(mid.ub, l)} with a contract in view; more than ${n(bn, l)} billion with no contract covering it.`),
  }
}

/** /captura: the buyers with the most money to dominant suppliers × administrations; fill = the share of that term's spend. */
export function capturaGrid(m: Relevo, l: Lang, hiInst?: number | null, top = 12): Grid {
  const t = L(l), C = m.chapters
  const rows: GridRow[] = m.register.slice(0, top).map((b) => {
    const full = formatEntityName('institution', b.name, 'full'), nm = b.siglas || full
    return {
      key: String(b.institution_id), name: nm, full, open: { kind: 'inst', inst: b.institution_id }, hi: b.institution_id === hiInst,
      cells: C.map((c) => {
        let tot = 0, cap = 0
        for (let y = c.a; y <= c.b; y++) { tot += b.y_total[y - 2002] || 0; cap += b.y_cap[y - 2002] || 0 }
        if (!(tot > 0)) return { v: null, label: '—', kind: 'none' as const, t: `${nm} · ${c.name}: ${t('sin gasto en CompraNet', 'no CompraNet spending')}` }
        const sh = Math.min(1, cap / tot)
        return { v: sh, label: pct(sh, l), t: `${nm} · ${c.name}: ${money(cap, l)} ${t('de', 'of')} ${money(tot, l)} ${t('a proveedores dominantes', 'to dominant suppliers')} · ${pct(sh, l)}` }
      }),
    }
  })
  const fox = C.find((c) => c.key === 'fox'), amlo = C.find((c) => c.key === 'amlo')
  return {
    rowHead: t('Comprador', 'Buyer'), hiNote: t('la pareja que sigue esta sección', 'the pair this section follows'),
    caption: t('Compradores por sexenio: parte de su gasto que fue a proveedores dominantes', 'Buyers by administration: share of their spending that went to dominant suppliers'),
    cols: C.map((c) => ({ k: c.name.replace('Sheinbaum', 'Shein­baum'), sub: c.a === c.b ? String(c.a) : `${String(c.a).slice(2)}–${String(c.b).slice(2)}` })),
    rows,
    lines: [
      t(`Una fila por comprador; una casilla por sexenio. Primero, quien más dio.`, `One row per buyer; one cell per administration. Largest first.`),
      t('Barra llena = todo su gasto de ese sexenio fue a proveedores dominantes. «—»: sin gasto en CompraNet.', 'Full bar = all its spending that term went to dominant suppliers. «—»: no CompraNet spending.'),
      fox && amlo
        ? t(`En sus ${n(m.register.length, l)} compradores: ${pct(fox.share, l)} con Fox, ${pct(amlo.share, l)} con AMLO.`, `Across its ${n(m.register.length, l)} buyers: ${pct(fox.share, l)} under Fox, ${pct(amlo.share, l)} under AMLO.`)
        : '',
    ],
  }
}
