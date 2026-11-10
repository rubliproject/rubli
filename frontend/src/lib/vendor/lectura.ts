/**
 * «La lectura» — the analysis layer of the vendor expediente (owner 2026-10-27, concept C's rail).
 * Every claim is COMPUTED from the buyer × year cells and renders only when its condition holds;
 * nothing here is written per vendor. Pure: payload + model in, claim tokens out.
 */
import { DA_RECORDED_FROM, isTendered, type Expediente, type LaneType } from './expediente'

export type Inst = { id: number; name: string | null; siglas: string | null; type?: LaneType }
/** A claim is a run of tokens: plain text, a bold figure, or an entity (rendered as a chip; type defaults to institution). */
export type Token = string | { b: string } | { inst: Inst; bold?: boolean }
export interface Claim { key: 'loyal' | 'newcomers' | 'switch' | 'direct' | 'concentration' | 'era' | 'crossed' | 'pattern'; es: Token[]; en: Token[] }
export interface Figure { key: string; es: string; en: string; value: string }

const CRIT = 0.6
const pct = (x: number) => `${Math.round(x * 100)}%`
const fmt = (n: number, lang: 'es' | 'en') => n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')

/** `counts`: contracts per buyer from the vendor's own record (`vendors/:id` top_institutions); the timeline's
 *  cells also hold ComprasMX rows, so a printed count prefers the record's (IMSS × Maypo: 13,369, not 13,373). */
export function buildLectura(m: Expediente, counts?: Record<number, number>): { claims: Claim[]; figures: Figure[] } {
  const d = m.src
  const claims: Claim[] = []
  const active = d.years.map((y) => y.year)
  const top = m.lanes[0]
  const topInst: Inst | null = top ? { id: top.id, name: top.name, siglas: top.siglas } : null

  // 1 · loyalty: the top buyer bought in every year the vendor sold (≥ 5 years).
  if (top && topInst && active.length >= 5 && active.every((y) => top.cells[y])) {
    const n = counts?.[top.id] ?? Object.values(top.cells).reduce((s, c) => s + c.n_contracts, 0)
    claims.push({
      key: 'loyal',
      es: ['Nunca ha dejado de venderle a ', { inst: topInst, bold: true }, ': ', { b: `${active.length} de ${active.length} años` }, `, ${fmt(n, 'es')} contratos.`],
      en: ['It has sold to ', { inst: topInst, bold: true }, ' every year: ', { b: `${active.length} of ${active.length} years` }, `, ${fmt(n, 'en')} contracts.`],
    })
  }

  // 2 · newcomers: the largest buyer whose first year falls in each later sexenio (≥ 3 qualify).
  const total = m.total || 1
  const firstChapter = m.chapters.find((c) => active[0] >= c.from && active[0] <= c.to)
  const arrivals = m.chapters.filter((c) => c !== firstChapter).flatMap((c) => {
    const b = d.entities
      .filter((i) => i.first_year >= c.from && i.first_year <= c.to && i.amount_mxn / total >= 0.002)
      .sort((a, z) => z.amount_mxn - a.amount_mxn)[0]
    return b ? [{ c, inst: { id: b.id, name: b.name, siglas: b.siglas } }] : []
  })
  if (arrivals.length >= 3) {
    const list = (lang: 'es' | 'en'): Token[] => arrivals.flatMap((a, i) => [
      i === 0 ? '' : i === arrivals.length - 1 ? (lang === 'es' ? ' y ' : ' and ') : ', ',
      { inst: a.inst }, lang === 'es' ? ` con ${a.c.name}` : ` under ${a.c.name}`,
    ])
    const of = m.chapters.length - (firstChapter ? 1 : 0)
    claims.push({
      key: 'newcomers',
      es: ['Llega un comprador nuevo con cada gobierno (', { b: `${arrivals.length} de ${of} sexenios` }, '): ', ...list('es'), '.'],
      en: ['A new buyer arrives with each government (', { b: `${arrivals.length} of ${of} administrations` }, '): ', ...list('en'), '.'],
    })
  }

  // 3 · the procedure switch: the top buyer tendered until year Y, then awarded directly ≥ 3 years running to the end
  //     (from 2011 on: before it CompraNet left the procedure blank); or it never tendered in ≥ 5 recorded years.
  if (top && topInst) {
    const ys = Object.keys(top.cells).map(Number).filter((y) => y >= DA_RECORDED_FROM).sort((a, z) => a - z)
    let f = ys.length
    while (f > 0 && !isTendered(top.cells[ys[f - 1]])) f--
    const after = ys.length - f
    if (f > 0 && after >= 3) {
      const until = ys[f - 1]
      claims.push({
        key: 'switch',
        es: ['Hasta ', { b: String(until) }, ', ', { inst: topInst }, ' le compraba sobre todo por licitación; desde entonces, por adjudicación directa (', { b: `${after} años` }, ' seguidos).'],
        en: ['Until ', { b: String(until) }, ', ', { inst: topInst }, ' bought from it mostly by tender; since then, by direct award (', { b: `${after} years` }, ' running).'],
      })
    } else if (f === 0 && after >= 5) {
      claims.push({
        key: 'direct',
        es: [`Desde ${ys[0]}, el primer año con el procedimiento en el registro, `, { inst: topInst }, ' le compra sobre todo por adjudicación directa: ', { b: `${after} de ${after} años` }, '.'],
        en: [`Since ${ys[0]}, the first year with the procedure on record, `, { inst: topInst }, ' has bought from it mostly by direct award: ', { b: `${after} of ${after} years` }, '.'],
      })
    }
  }

  // 5 · the era: one administration brought ≥ 40% of its money (and it sold under ≥ 2).
  const sold = m.chapters.filter((c) => c.amount > 0)
  const era = sold.reduce<(typeof sold)[number] | null>((b, c) => (!b || c.amount > b.amount ? c : b), null)
  const eraClaim: Claim | null = era && sold.length >= 2 && era.share >= 0.4 ? {
    key: 'era',
    es: [{ b: pct(era.share) }, ` de su dinero llegó con ${era.name} (${era.from}–${era.to}).`],
    en: [{ b: pct(era.share) }, ` of its money came under ${era.name} (${era.from}–${era.to}).`],
  } : null

  // 4 · concentration: the top buyer's share of income and the years read critical.
  const scored = d.years.filter((y) => y.avg_risk_score != null)
  const crit = scored.filter((y) => (y.avg_risk_score as number) >= CRIT).length
  const share = top ? top.share : 0
  const showShare = !!topInst && share >= 0.25
  const showCrit = scored.length >= 3 && crit / scored.length >= 0.5
  if (showShare || showCrit) {
    const es: Token[] = [], en: Token[] = []
    if (showShare && topInst) {
      es.push({ b: pct(share) }, ' de su ingreso viene de ', { inst: topInst })
      en.push({ b: pct(share) }, ' of its income comes from ', { inst: topInst })
    }
    if (showCrit) {
      es.push(showShare ? '; ' : '', { b: `${crit} de ${scored.length} años` }, ' con indicador medio crítico (≥ 0.60)')
      en.push(showShare ? '; ' : '', { b: `${crit} of ${scored.length} years` }, ' with a critical mean indicator (≥ 0.60)')
    }
    es.push('.'); en.push('.')
    claims.push({ key: 'concentration', es, en })
  }

  if (eraClaim) claims.push(eraClaim)

  const cells = d.cells.filter((c) => c.n_contracts > 0 && c.year >= DA_RECORDED_FROM)
  const tendered = cells.filter(isTendered).length
  const big = d.entities.filter((i) => i.amount_mxn / total >= 0.01).length
  const figures: Figure[] = [
    { key: 'big', es: 'Compradores con ≥ 1% del ingreso', en: 'Buyers with ≥ 1% of income', value: String(big) },
    { key: 'crit', es: 'Años con indicador ≥ 0.60', en: 'Years with indicator ≥ 0.60', value: `${crit} / ${scored.length}` },
    { key: 'tend', es: 'Celdas con mayoría licitada', en: 'Cells mostly tendered', value: `${tendered} / ${cells.length}` },
    { key: 'span', es: 'Primer contrato · último', en: 'First contract · last', value: `${active[0]} · ${active[active.length - 1]}` },
  ]
  return { claims, figures }
}
