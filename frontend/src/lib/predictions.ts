/**
 * «Si sigue así» callouts (docs/PREDICTIONS_RESEARCH_2026-11-06.md § Proposed tab copy; owner 11-07: bold, inside
 * the page, no dots). Habits only — never risk, ARIA or «corrupción». ES first; sentences ≤ 15 words.
 * Returns null whenever there is nothing honest to say (thin history, stale pair, persona física, loading).
 */
import type { CategoryPrediction, ContractPrediction, InstitutionPrediction, PairPrediction, VendorPrediction } from '@/api/types'

/** A sentence piece: text, or a buyer rendered as an entity chip. */
export type Seg = string | { id: number; name: string }

export interface PredictionText {
  kicker: string
  finding: string
  /** a second bold sentence naming an entity (vendor: its main buyer) */
  segs?: Seg[]
  caveat: string
}

const kicker = (es: boolean) => (es ? 'Si sigue así' : 'If nothing changes')

const cut = (es: boolean, d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]
  return es ? `Datos hasta el ${dd} ${mes} ${y}.` : `Data to ${mon} ${dd}, ${y}.`
}

export function institutionPredictionText(p: InstitutionPrediction, es: boolean): PredictionText | null {
  if (!p.available || p.point == null || p.low == null || p.high == null) return null
  const x = Math.round(p.point), lo = Math.round(p.low), hi = Math.round(p.high), y = p.target_year
  const hit = p.backtest.within_band != null ? Math.round(p.backtest.within_band * 100) : null
  return {
    kicker: kicker(es),
    finding: es ? `En ${y}, unos ${x} de cada 100 contratos serán sin concurso (entre ${lo} y ${hi}).`
      : `In ${y}, about ${x} in 100 contracts will skip a tender (${lo} to ${hi}).`,
    caveat: [
      es ? 'Tendencia de sus últimos tres años, no promesa.' : 'A three-year trend, not a promise.',
      hit != null ? (es ? `En la prueba de ${p.backtest.year} acertamos con ${hit} de cada 100 instituciones.` : `In a ${p.backtest.year} test we were right for ${hit} in 100 institutions.`) : null,
      cut(es, p.data_through),
    ].filter(Boolean).join(' '),
  }
}

/** `pf` = the contract's vendor is a persona física: nothing at all, whatever the API says. */
export function pairPredictionText(p: PairPrediction | undefined, es: boolean, pf: boolean): PredictionText | null {
  if (pf || !p || !p.available || p.rate == null || !p.streak) return null
  const k = Math.round(p.rate * 10), y = p.target_year, likely = p.rate >= 0.5
  const who = p.pair_class === 'repeat'
    ? (es ? 'Parejas que ya repitieron' : 'Pairs that already repeated')
    : (es ? 'Parejas nuevas como esta' : 'New pairs like this')
  const n = (p.rate_n ?? 0).toLocaleString(es ? 'es-MX' : 'en-US')
  const [t0, t1] = (p.test ?? '').split('→')
  return {
    kicker: kicker(es),
    finding: es
      ? `${likely ? `En ${y} lo más probable es que vuelvan a firmar.` : `En ${y} lo más probable es que no vuelvan a firmar.`} ${who} lo hacen ${k} de cada 10 veces.`
      : `${likely ? `In ${y} they will most likely sign again.` : `In ${y} they will most likely not sign again.`} ${who} do so ${k} times in 10.`,
    caveat: [
      es ? `Medido en ${n} parejas, de ${t0} a ${t1}. No es un juicio sobre esta.` : `Measured on ${n} pairs, ${t0} to ${t1}. Not a judgement on this one.`,
      cut(es, p.data_through),
    ].join(' '),
  }
}

const of10 = (r: number) => Math.round(r * 10)
const oneIn = (r: number) => Math.max(1, Math.round(1 / Math.max(r, 0.01)))
const fmt = (n: number, es: boolean) => n.toLocaleString(es ? 'es-MX' : 'en-US')

/** Companies only: `pf` or an API persona_fisica → nothing. Rates are the observed rates of the unit's test decile. */
export function vendorPredictionText(p: VendorPrediction | undefined, es: boolean, pf: boolean): PredictionText | null {
  if (pf || !p || !p.available || p.rate == null || p.rate < 0.5) return null
  const y = p.target_year, b = p.top_buyer
  let segs: Seg[] | undefined
  if (b?.name && p.dep90 && p.dep90_stays?.rate != null) {
    const k = of10(p.dep90_stays.rate)
    segs = es ? [{ id: b.id, name: b.name }, ` le paga casi todo. En ${y} también: pasó ${k} de cada 10 veces.`]
      : [{ id: b.id, name: b.name }, ` pays it almost everything. In ${y} too: it held ${k} times in 10.`]
  } else if (b?.name && p.main_buyer_stays) {
    const k = of10(p.main_buyer_stays.rate)
    segs = es ? ['Lo más probable es que vuelva a venderle a ', { id: b.id, name: b.name }, `: pasó ${k} de cada 10 veces.`]
      : ['It will most likely sell again to ', { id: b.id, name: b.name }, `: that held ${k} times in 10.`]
  }
  return {
    kicker: kicker(es),
    finding: es ? `En ${y} seguirá ganando: empresas con este historial lo hacen ${Math.round(p.rate * 100)} de cada 100 veces.`
      : `In ${y} it keeps winning contracts: firms with this record do so ${Math.round(p.rate * 100)} times in 100.`,
    segs,
    caveat: [
      es ? `Es lo que pasó de ${(p.test ?? '').replace('→', ' a ')} con ${fmt(p.n_test ?? 0, es)} empresas parecidas. No es un juicio sobre esta.`
        : `What happened ${(p.test ?? '').replace('→', ' to ')} with ${fmt(p.n_test ?? 0, es)} similar firms. Not a judgement on this one.`,
      cut(es, p.data_through),
    ].join(' '),
  }
}

/** The (firm, buyer, category) of this contract; when that triple did not sign in the last year, the pair line. */
export function contractPredictionText(c: ContractPrediction | undefined, pair: PairPrediction | undefined, es: boolean, pf: boolean): PredictionText | null {
  if (pf || c?.reason === 'persona_fisica') return null
  if (!c?.available || c.rate == null) return c ? pairPredictionText(pair, es, pf) : null
  return {
    kicker: kicker(es),
    finding: es ? `Contratos parecidos se repitieron al año siguiente ${of10(c.rate)} de cada 10 veces.`
      : `Contracts like this one were repeated the next year ${of10(c.rate)} times in 10.`,
    caveat: [
      es ? `Misma empresa, mismo comprador, misma categoría; medido de ${(c.test ?? '').replace('→', ' a ')} en ${fmt(c.n_test ?? 0, es)} casos.`
        : `Same firm, same buyer, same category; measured ${(c.test ?? '').replace('→', ' to ')} on ${fmt(c.n_test ?? 0, es)} cases.`,
      es ? 'Repetir no es delito.' : 'Repeating is not a crime.',
      cut(es, c.data_through),
    ].join(' '),
  }
}

/** Category: direct-award share ±band + suppliers a year ±25 % + the #1 churn. Subcategory (`sub`): the churn line only. */
export function categoryPredictionText(p: CategoryPrediction | undefined, es: boolean, sub: boolean): PredictionText | null {
  if (!p) return null
  if (sub) {
    const s = p.sub_top_stays
    if (s.stay == null) return null
    return {
      kicker: kicker(es),
      finding: es ? `El líder de hoy repite como líder solo 1 de cada ${oneIn(s.stay)} veces.` : `Today's leader stays the leader only 1 time in ${oneIn(s.stay)}.`,
      caveat: es ? `Prueba de ${s.test.replace('→', ' a ')} en ${s.n} subcategorías. Tendencia, no promesa.` : `Tested ${s.test.replace('→', ' to ')} on ${s.n} subcategories. A trend, not a promise.`,
    }
  }
  const churn = es ? `El que más cobra hoy repite como líder solo 1 de cada ${oneIn(p.top_stays)} veces.`
    : `Today's top supplier stays on top only 1 time in ${oneIn(p.top_stays)}.`
  const t = p.test.replace('→', es ? ' a ' : ' to ')
  if (!p.available || p.share == null || p.suppliers == null) {
    return { kicker: kicker(es), finding: churn, caveat: es ? `Prueba de ${t} en ${p.top_n} categorías. Tendencia, no promesa.` : `Tested ${t} on ${p.top_n} categories. A trend, not a promise.` }
  }
  const y = p.target_year
  return {
    kicker: kicker(es),
    finding: es
      ? `En ${y}, unos ${Math.round(p.share)} de cada 100 contratos serán sin concurso (±${p.band}). Tendrá unos ${fmt(p.suppliers, es)} proveedores (±25 %). ${churn}`
      : `In ${y}, about ${Math.round(p.share)} in 100 contracts will skip a tender (±${p.band}). About ${fmt(p.suppliers, es)} suppliers (±25 %). ${churn}`,
    caveat: [
      es ? `Prueba de ${t}: el rango acertó en ${Math.round(p.share_within_band * 100)} de cada 100 categorías; los proveedores, en ${Math.round(p.suppliers_within_25 * 100)}.`
        : `Tested ${t}: the range held for ${Math.round(p.share_within_band * 100)} in 100 categories; suppliers, ${Math.round(p.suppliers_within_25 * 100)}.`,
      cut(es, p.data_through),
    ].join(' '),
  }
}
