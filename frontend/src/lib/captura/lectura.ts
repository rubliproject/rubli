/**
 * /captura «La lectura» — the rail beside «El relevo». Every claim is computed from the plates
 * (lib/captura/relevo.ts) and renders only when its condition holds; each has a true/false vitest.
 * A token can name a buyer: the page renders it as a button that opens that buyer's dissection.
 */
import { getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactUSD } from '@/lib/utils'
import { CFE, IMSS, PEP, Y1, type Relevo } from './relevo'

export type Lang = 'es' | 'en'
export type Token = string | { b: string } | { inst: number; label: string }
export interface Claim { key: 'vigentes' | 'siguen' | 'sexenios' | 'energia' | 'salud' | 'imss' | 'cohortes' | 'modelo'; fig: string; color?: string; es: Token[]; en: Token[]; src: { es: string; en: string } }

const SALUD = 1
const ENERGIA = 4
export const pct = (x: number, lang: Lang = 'es') => `${(x * 100).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 0 })}%`
export const num = (n: number, lang: Lang = 'es') => Math.round(n).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')
/** Money in a sentence, language-pinned (formatCompactMXN reads the global language). ES: MDP / billones. */
export function money(v: number, lang: Lang): string {
  if (lang === 'es') {
    if (v >= 1e12) return `${(v / 1e12).toLocaleString('es-MX', { maximumFractionDigits: 2 })} billones MXN`
    if (v >= 1e9) return `${num(v / 1e6, 'es')} MDP`
    return `${(v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MDP`
  }
  if (v >= 1e12) return `${(v / 1e12).toLocaleString('en-US', { maximumFractionDigits: 2 })}T MXN`
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })}B MXN`
  return `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M MXN`
}
/** `money` + its USD companion in the English edition («1.2B MXN · ≈US$70M»), like formatDualCurrency; ES = MDP only.
 *  For headline figures and the lead amount of a sentence (CLAUDE.md rule 10); table cells keep `money`. */
export const moneyDual = (v: number, lang: Lang, year?: number) => (lang === 'en' ? `${money(v, 'en')} · ≈${formatCompactUSD(v, year)}` : money(v, 'es'))
/** The last year a buyer published in CompraNet, when it stopped before the horizon (else null). */
export function lastYear(r: Relevo, id: number): number | null {
  const y = r.leaves(id)
  return y == null ? null : y - 1
}

export function buildCapturaLectura(r: Relevo): Claim[] {
  const out: Claim[] = []
  const epn = r.chapters.find((c) => c.key === 'epn'), amlo = r.chapters.find((c) => c.key === 'amlo')

  // 0 · how many are current, and how many still sign after the blackout (moved out of the head, 10-28 review)
  if (r.cur.length > 0) {
    out.push({
      key: 'vigentes', fig: num(r.cur.length), /* trace: captura/plates · y1 ≥ 2024 */ src: { es: 'Fuente: CompraNet y ComprasMX, 2024–25.', en: 'Source: CompraNet and ComprasMX, 2024–25.' },
      es: [{ b: 'proveedores dominantes vigentes' }, ` (contrato en 2024–25); cobraron ${moneyDual(r.curM, 'es')} desde 2002.`],
      en: [{ b: 'current dominant suppliers' }, ` (a contract in 2024–25); ${moneyDual(r.curM, 'en')} billed since 2002.`],
    })
  }
  if (r.post > 0) {
    out.push({
      key: 'siguen', fig: num(r.post), /* trace: captura/plates · post_n > 0 (ComprasMX) */ src: { es: 'Fuente: ComprasMX, tras el cierre de CompraNet.', en: 'Source: ComprasMX, after CompraNet closed.' },
      es: [{ b: 'siguen firmando' }, ` en ComprasMX tras el apagón: ${moneyDual(r.postM, 'es')}.`],
      en: [{ b: 'still sign' }, ` in ComprasMX after the blackout: ${moneyDual(r.postM, 'en')}.`],
    })
  }

  // 1 · the sexenios: share of the buyers' spend that went to their dominant suppliers — from Peña Nieto on only:
  // 2002–2010 (Structure A) barely identifies suppliers, so no comparison crosses 2010 (verdict 2026-11-04)
  if (epn && amlo && epn.total > 0 && amlo.total > 0) {
    out.push({
      key: 'sexenios', fig: pct(epn.share), /* trace: captura/plates · Σ y_cap ÷ Σ y_total */ src: { es: 'Fuente: CompraNet, gasto sumado por sexenio.', en: 'Source: CompraNet, spend added up by term.' },
      es: ['del gasto de estos compradores fue a sus proveedores dominantes con ', { b: 'Peña Nieto' }, `; ${pct(amlo.share)} con AMLO. Antes de 2010 el dato es de baja calidad y no se compara.`],
      en: ["of these buyers' spend went to their dominant suppliers under ", { b: 'Peña Nieto' }, `; ${pct(amlo.share, 'en')} under AMLO. Before 2010 the data is weak and is not compared.`],
    })
  }

  // 2 · energy: almost no dominant pair is current, because Pemex Exploración and the CFE left CompraNet
  const e = r.bySector.get(ENERGIA), pep = lastYear(r, PEP), cfe = lastYear(r, CFE)
  if (e && e.nAll >= 50 && e.nCur / e.nAll < 0.1 && pep != null && cfe != null) {
    out.push({
      key: 'energia', fig: `${num(e.nAll)} → ${num(e.nCur)}`, color: e.color, /* trace: captura/plates · y_total = 0 después */ src: { es: 'Fuente: CompraNet, último año publicado.', en: 'Source: CompraNet, last year published.' },
      es: ['proveedores dominantes de ', { b: 'energía' }, ', de siempre a vigentes: ', { inst: PEP, label: 'Pemex Exploración' }, ` publicó en CompraNet hasta ${pep} y la `, { inst: CFE, label: 'CFE' }, ` hasta ${cfe}. Salieron del registro, no dejaron de comprar.`],
      en: ['dominant suppliers in ', { b: 'energy' }, ', ever vs current: ', { inst: PEP, label: 'Pemex Exploración' }, ` published in CompraNet until ${pep} and the `, { inst: CFE, label: 'CFE' }, ` until ${cfe}. They left the register; they did not stop buying.`],
    })
  }

  // 3 · health holds the most current dominant suppliers
  const s = r.bySector.get(SALUD)
  const most = [...r.bySector.values()].reduce((m, x) => (x.nCur > m.nCur ? x : m), { nCur: -1 } as { nCur: number })
  if (s && s.nCur > 0 && most === s && r.cur.length > 0) {
    out.push({
      key: 'salud', fig: `${num(s.nAll)} → ${num(s.nCur)}`, color: s.color, /* trace: captura/plates · y1 ≥ 2024 */ src: { es: 'Fuente: CompraNet, 2024–25, por sector.', en: 'Source: CompraNet, 2024–25, by sector.' },
      es: ['proveedores dominantes de ', { b: 'salud' }, `: el sector con más vigentes, ${pct(s.nCur / r.cur.length)} del total, ${moneyDual(s.mCur, 'es')}.`],
      en: ['dominant suppliers in ', { b: 'health' }, `: the sector with the most current ones, ${pct(s.nCur / r.cur.length, 'en')} of all, ${moneyDual(s.mCur, 'en')}.`],
    })
  }

  // 4 · the IMSS year when (nearly) half its spend went to dominant suppliers
  const bp = r.buyerPeak(IMSS), imss = r.buyer.get(IMSS)
  if (bp && imss && bp.share >= 0.4) {
    const k = Y1 - 2002, t = imss.y_total[k] ?? 0
    const last = t > 0 ? (imss.y_cap[k] ?? 0) / t : null
    out.push({
      key: 'imss', fig: pct(bp.share), /* trace: captura/buyer/${IMSS} · y_cap ÷ y_total */ src: { es: 'Fuente: CompraNet, gasto anual del IMSS.', en: 'Source: CompraNet, IMSS yearly spend.' },
      es: ['del gasto del ', { inst: IMSS, label: 'IMSS' }, ` en ${bp.y} fue a sus proveedores dominantes (${money(bp.cap, 'es')} de ${money(bp.total, 'es')})${last != null ? `; en ${Y1}, ${pct(last)}` : ''}.`],
      en: ['of the ', { inst: IMSS, label: 'IMSS' }, `'s spend in ${bp.y} went to its dominant suppliers (${money(bp.cap, 'en')} of ${money(bp.total, 'en')})${last != null ? `; in ${Y1}, ${pct(last, 'en')}` : ''}.`],
    })
  }

  // 5 · B «Las cohortes», its honest part: survival by the sexenio a pair began in
  const fox = r.cohorts[0], am = r.cohorts[3]
  if (fox && am && fox.born >= 50 && am.born >= 50 && fox.alive / fox.born < am.alive / am.born) {
    out.push({
      key: 'cohortes', fig: pct(fox.alive / fox.born), color: fox.color, /* trace: captura/plates · y0 por sexenio ∧ y1 ≥ 2024 */ src: { es: 'Fuente: CompraNet, parejas por sexenio de inicio; 2002–2010 es dato de baja calidad.', en: 'Source: CompraNet, pairs by starting term; 2002–2010 is weak data.' },
      es: [`de las ${num(fox.born)} que empezaron con `, { b: 'Fox' }, ` siguen vigentes (${num(fox.alive)}); de las ${num(am.born)} de AMLO, ${num(am.alive)} (${pct(am.alive / am.born)}). Las más jóvenes han tenido menos tiempo para terminar.`],
      en: [`of the ${num(fox.born, 'en')} that began under `, { b: 'Fox' }, ` are still current (${num(fox.alive, 'en')}); of AMLO's ${num(am.born, 'en')}, ${num(am.alive, 'en')} (${pct(am.alive / am.born, 'en')}). Younger ones have had less time to end.`],
    })
  }

  // 6 · the model does not see capture (rt4_log works against it — CLAUDE.md)
  if (r.riskMean != null && ['low', 'medium'].includes(getRiskLevelFromScore(r.riskMean))) {
    out.push({
      key: 'modelo', fig: r.riskMean.toFixed(2), /* trace: captura/plates · risk (vendor_stats) */ src: { es: 'Fuente: indicador de riesgo de RUBLI.', en: 'Source: RUBLI’s risk indicator.' },
      es: [`indicador de riesgo medio de los proveedores dominantes; sólo ${num(r.riskCrit)} de ${num(r.riskN)} en crítico. `, { b: 'El modelo no mide esto' }, ': por eso existe esta página.'],
      en: [`mean risk indicator of the dominant suppliers; only ${num(r.riskCrit, 'en')} of ${num(r.riskN, 'en')} are critical. `, { b: 'The model does not measure this' }, ': that is why this page exists.'],
    })
  }
  return out
}
