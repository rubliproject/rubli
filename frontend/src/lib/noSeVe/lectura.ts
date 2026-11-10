/**
 * «Gasto a ciegas» — «La lectura» of each chapter. Every claim is computed from the model (./model.ts) and
 * renders only when its condition holds; each has a true/false vitest (lectura.test.ts). A token can name an
 * entity: the page renders it as a button that opens that entity's drawer (?ente=).
 * Visibility, never corruption: no claim says money «disappeared»; a trust contribution «no deja contrato».
 */
import { CATEGORICAL } from '@/lib/constants'
import { money, moneyDual, num, type Lang } from '@/lib/captura/lectura'
import { idx, type Ent, type Model } from './model'

export { money, moneyDual, num, type Lang }
export type Token = string | { b: string } | { ente: string; label: string }
export type ClaimKey = 'firmado' | 'gastado' | 'seis' | 'tsa' | 'fideicomisos' | 'sedena' | 'ciit' | 'imss' | 'mediana' | 'marina' | 'ley' | 'visibles'
export interface Bi { es: string; en: string }
/** fig and src print in the reader's language: EN money through the same helper (B MXN), never MDP / billones. */
export interface Claim { key: ClaimKey; ch: 1 | 2 | 3; fig: Bi; color?: string; critical?: boolean; es: Token[]; en: Token[]; src: Bi }
const bi = (f: (l: Lang) => string): Bi => ({ es: f('es'), en: f('en') })
const both = (s: string): Bi => ({ es: s, en: s })

/** Group colours (DESIGN.md §6.3 by index): national security C2 · civilian C3 · out by law C8. Red is the project's alone. */
export const GROUP_COLOR = { proj: 'var(--color-accent)', ns: CATEGORICAL[1], civ: CATEGORICAL[2], ley: CATEGORICAL[7] } as const

/** A share as a percent: one decimal under 10% (4.8%, 1.5%), none above. */
export function pct(x: number, lang: Lang = 'es'): string {
  const d = x < 0.1 ? 1 : 0
  return `${(x * 100).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
}
/** Contracts over exercised when it passes 100%: «×3.2». */
export const times = (x: number, lang: Lang = 'es') => `×${x.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
export const share = (x: number, lang: Lang = 'es') => (x >= 1 ? times(x, lang) : pct(x, lang))

const E = (e: Ent | undefined, en: boolean, label?: string): Token => (e ? { ente: e.key, label: label ?? e.short } : en ? 'it' : 'él')

export function buildLectura(m: Model): Claim[] {
  const out: Claim[] = []
  const P = m.proj, y0 = m.years[0], y1 = m.years[m.years.length - 1], k24 = idx(m, 2024)
  const L = (l: Lang) => (v: number) => money(v, l)
  const es = L('es'), en = L('en')

  // ── I · first signed, then spent ──
  if (m.pre.ratio > 1 && m.mid.share < 0.25) {
    out.push({
      key: 'firmado', ch: 1, fig: bi((l) => times(m.pre.ratio, l)), src: { es: 'contratos que nombran al tren ÷ Cuenta Pública, cartera 2021W3N0001', en: 'contracts naming the train ÷ Public Accounts, cartera 2021W3N0001' },
      es: [`los contratos que nombran al tren firmados en 2020–21 (${es(m.pre.vis)}) frente a lo que el proyecto ejerció esos años (${es(m.pre.ex)}): `, { b: 'primero se firmó' }, '.'],
      en: [`the contracts naming the train signed in 2020–21 (${en(m.pre.vis)}) against what the project exercised those years (${en(m.pre.ex)}): `, { b: 'first it was signed' }, '.'],
    })
  }
  if (m.mid.share < 0.25 && m.mid.ex > 0 && m.mid.dark > 0) {
    out.push({
      key: 'gastado', ch: 1, fig: bi((l) => pct(m.mid.share, l)), critical: true, color: GROUP_COLOR.proj, src: { es: 'Cuenta Pública cap. 2·3·5·6 · registro, 2022–2024', en: 'Public Accounts ch. 2·3·5·6 · register, 2022–2024' },
      es: [`del gasto 2022–24 (${es(m.mid.ex)}) tiene contrato firmado esos años: ${es(m.mid.vis)}. `, ...(m.mid.carry > 0 ? [`Con lo que quedaba de lo firmado hasta 2021 (${es(m.mid.carry)}), no pasaría de ${pct(m.mid.ub)}: `] : []), { b: `${es(m.mid.dark)} quedan sin contrato que los cubra` }, '.'],
      en: [`of the 2022–24 spend (${en(m.mid.ex)}) has a contract signed those years: ${en(m.mid.vis)}. `, ...(m.mid.carry > 0 ? [`With what was left of those signed through 2021 (${en(m.mid.carry)}), it would not pass ${pct(m.mid.ub, 'en')}: `] : []), { b: `${en(m.mid.dark)} is left with no contract covering it` }, '.'],
    })
  }
  if (P.share != null && P.share < 1) {
    out.push({
      key: 'seis', ch: 1, fig: bi((l) => pct(P.share as number, l)), src: both(`cartera 2021W3N0001 · ${y0}–${y1}`),
      es: [`en seis años, aun contando las firmas de 2020–21: ${es(P.visSum)} de ${es(P.exSum)}. Es la comparación justa, porque un contrato plurianual se registra el año en que se firma.`],
      en: [`over six years, even counting the 2020–21 signatures: ${en(P.visSum)} of ${en(P.exSum)}. It is the fair comparison, because a multi-year contract is recorded the year it is signed.`],
    })
  }
  const tsa = m.by.get('tren-maya-sa')
  if (tsa && k24 >= 0 && tsa.ex[k24] > 0 && tsa.vis[k24] / tsa.ex[k24] < 0.1) {
    const tr = tsa.tr[k24]
    out.push({
      key: 'tsa', ch: 1, fig: bi((l) => pct(tsa.vis[k24] / tsa.ex[k24], l)), src: { es: `Cuenta Pública 2024 UR ${tsa.cp} · instituciones ${tsa.ids.join(', ')}`, en: `Public Accounts 2024 UR ${tsa.cp} · institutions ${tsa.ids.join(', ')}` },
      es: [E(tsa, false), ` en 2024: ${es(tsa.ex[k24])} en compras y obra, ${num(tsa.n[k24])} contratos por ${es(tsa.vis[k24])}${tr > 0 ? `; además, ${es(tr)} a un fideicomiso` : ''}.`],
      en: [E(tsa, true), ` in 2024: ${en(tsa.ex[k24])} on purchases and works, ${num(tsa.n[k24], 'en')} contracts for ${en(tsa.vis[k24])}${tr > 0 ? `; and ${en(tr)} into a trust` : ''}.`],
    })
  }

  // ── II · where it went ──
  if (m.trusts24.length >= 3) {
    const top = m.trusts24.slice(0, 3).map((t) => m.by.get(t.key)!)
    const rest = m.trusts24.slice(3).map((t) => m.by.get(t.key)!)
    const list = (en_: boolean): Token[] => top.flatMap((e, i) => [i === 0 ? '' : i === 2 ? (en_ ? ' and ' : ' y ') : ', ', E(e, en_), ` (${money(e.tr[k24], en_ ? 'en' : 'es')})`])
    const restT = (en_: boolean): Token[] => (rest.length ? ['; ', ...rest.flatMap((e, i) => [i === 0 ? '' : ', ', E(e, en_)]), `, ${money(m.trusts24Rest, en_ ? 'en' : 'es')} ${en_ ? 'more' : 'más'}`] : [])
    out.push({
      key: 'fideicomisos', ch: 2, fig: bi((l) => money(m.trusts24Top3, l)), color: GROUP_COLOR.ns, src: { es: 'Cuenta Pública 2024 · partida 46101 «Aportaciones a fideicomisos públicos»', en: 'Public Accounts 2024 · partida 46101 «contributions to public trusts»' },
      es: ['pasaron a fideicomisos públicos en 2024 ', ...list(false), ...restT(false), `. Una aportación a un fideicomiso queda en la Cuenta Pública, pero `, { b: 'no deja contrato' }, ' en el registro.'],
      en: ['went into public trusts in 2024: ', ...list(true), ...restT(true), `. A trust contribution stays in the public accounts but `, { b: 'leaves no contract' }, ' in the register.'],
    })
  }
  const sed = m.by.get('sedena')
  if (sed && sed.trSum > sed.exSum && sed.exSum > 0) {
    out.push({
      key: 'sedena', ch: 2, fig: bi((l) => money(sed.trSum, l)), color: GROUP_COLOR.ns, src: { es: `Cuenta Pública ${y0}–${y1} · ramo 07 · partida 46101 vs cap. 2·3·5·6`, en: `Public Accounts ${y0}–${y1} · ramo 07 · partida 46101 vs ch. 2·3·5·6` },
      es: ['puso la ', E(sed, false), ` en fideicomisos en ${y0}–${y1}: más que todo lo que ejerció en compras y obra (${es(sed.exSum)}).`],
      en: ['is what ', E(sed, true), ` put into trusts in ${y0}–${y1}: more than everything it exercised on purchases and works (${en(sed.exSum)}).`],
    })
  }
  const ciit = m.by.get('ciit'), fit = m.by.get('fit')
  if (ciit && k24 >= 0 && ciit.tot[k24] > 0 && ciit.tr[k24] / ciit.tot[k24] >= 0.9) {
    const fitTxt = (l: Lang) => (fit && fit.ex[k24] > 0
      ? (l === 'es' ? `; el ferrocarril que sí construye, ` : `; the railway that does the building, `) : '')
    const fitTail = (l: Lang) => (fit && fit.ex[k24] > 0
      ? (l === 'es' ? `, ejerció ${es(fit.ex[k24])} con ${pct(fit.vis[k24] / fit.ex[k24])} en contratos.` : `, exercised ${en(fit.ex[k24])} with ${pct(fit.vis[k24] / fit.ex[k24], 'en')} in contracts.`) : '.')
    out.push({
      key: 'ciit', ch: 2, fig: bi((l) => pct(ciit.tr[k24] / ciit.tot[k24], l)), color: GROUP_COLOR.ns, src: { es: 'Cuenta Pública 2024 · UR AYH y J3L · partida 46101', en: 'Public Accounts 2024 · UR AYH and J3L · partida 46101' },
      es: ['del presupuesto 2024 del ', E(ciit, false), ` fue a un fideicomiso${fitTxt('es')}`, ...(fit && fit.ex[k24] > 0 ? [E(fit, false)] : []), fitTail('es')],
      en: ['of the ', E(ciit, true), `'s 2024 budget went into a trust${fitTxt('en')}`, ...(fit && fit.ex[k24] > 0 ? [E(fit, true)] : []), fitTail('en')],
    })
  }
  const imss = m.by.get('imss')
  if (imss && k24 >= 0 && imss.ex[k24] > 0 && imss.tr[k24] === 0 && imss.vis[k24] / imss.ex[k24] > 0.4) {
    out.push({
      key: 'imss', ch: 2, fig: bi((l) => share(imss.vis[k24] / imss.ex[k24], l)), color: GROUP_COLOR.civ, src: { es: 'Cuenta Pública 2024 UR 50-GYR · institución 251', en: 'Public Accounts 2024 UR 50-GYR · institution 251' },
      es: ['de las compras y obra 2024 del ', E(imss, false), ' tiene contrato, y no aportó nada a fideicomisos: así se ve lo normal.'],
      en: ['of the ', E(imss, true), "'s 2024 purchases and works has a contract, and it put nothing into trusts: this is what normal looks like."],
    })
  }

  // ── III · who is seen and who is not ──
  const civ = m.ents.filter((e) => e.grp === 'civ' && e.share != null)
  if (civ.length >= 3) {
    out.push({
      key: 'mediana', ch: 3, fig: bi((l) => pct(m.civMedian, l)), color: GROUP_COLOR.civ, src: { es: `mediana de ${civ.length} entes civiles · ${y0}–${y1}`, en: `median of ${civ.length} civilian entities · ${y0}–${y1}` },
      es: [`es la mediana de los civiles (${civ.map((e) => e.short).join(', ')}) en ${y0}–${y1}: lo que se ve sin decreto. Un año suelto engaña; seis años, no tanto.`],
      en: [`is the civilian median (${civ.map((e) => e.short).join(', ')}) in ${y0}–${y1}: what is visible without a decree. One year misleads; six, less so.`],
    })
  }
  const semar = m.by.get('semar')
  if (semar && sed && semar.share != null && sed.share != null && semar.share < 0.25 && sed.share > semar.share) {
    out.push({
      key: 'marina', ch: 3, fig: bi((l) => pct(semar.share as number, l)), color: GROUP_COLOR.ns, src: { es: 'Cuenta Pública ramos 07 y 13, UR numéricas', en: 'Public Accounts ramos 07 and 13, numeric URs' },
      es: ['de las compras y obra de la ', E(semar, false), ` tiene contrato a la vista (${es(semar.visSum)} de ${es(semar.exSum)}); la `, E(sed, false), `, ${pct(sed.share)}.`],
      en: ['of the ', E(semar, true), `'s purchases and works has a contract in view (${en(semar.visSum)} of ${en(semar.exSum)}); `, E(sed, true), `, ${pct(sed.share, 'en')}.`],
    })
  }
  const ley = m.ents.filter((e) => e.grp === 'ley')
  const leyEx = ley.reduce((s, e) => s + e.exSum, 0)
  if (ley.length && leyEx > 0 && ley.every((e) => e.visSum === 0)) {
    const names = (en_: boolean): Token[] => ley.flatMap((e, i) => [i === 0 ? '' : en_ ? ' and ' : ' y ', E(e, en_)])
    out.push({
      key: 'ley', ch: 3, fig: bi((l) => money(leyEx, l)), color: GROUP_COLOR.ley, src: { es: `Cuenta Pública ramos 52 y 53 · registro ${y0}–${y1}`, en: `Public Accounts ramos 52 and 53 · register ${y0}–${y1}` },
      es: ['ejercieron ', ...names(false), ` en compras y obra en seis años, con cero contratos en CompraNet: contratan bajo su propio régimen desde la reforma energética y publican en sus portales. `, { b: 'Es otra puerta' }, ', no el decreto.'],
      en: ['is what ', ...names(true), ` exercised on purchases and works in six years, with zero contracts in CompraNet: they buy under their own regime since the energy reform and publish on their own portals. `, { b: 'A different door' }, ', not the decree.'],
    })
  }
  const over = m.ents.filter((e) => e.grp === 'ns' && e.share != null && e.share >= 1)
  if (over.length) {
    const list = (en_: boolean): Token[] => over.flatMap((e, i) => [i === 0 ? '' : ', ', E(e, en_), ` ${share(e.share as number, en_ ? 'en' : 'es')}`])
    const dark = m.mid.share < 0.25 && semar?.share != null && semar.share < 0.25 && m.trusts24.length > 0
    out.push({
      key: 'visibles', ch: 3, fig: bi((l) => num(over.length, l)), color: GROUP_COLOR.ns, src: { es: 'contratos ÷ ejercido > 100% = firmas plurianuales', en: 'contracts ÷ exercised > 100% = multi-year signatures' },
      es: [`entes de seguridad nacional se ven completos o de más: `, ...list(false), dark ? '. No todo quedó a oscuras: lo oscuro es el tren, la Marina y lo que entró a fideicomisos.' : '.'],
      en: [`national-security entities are fully visible or more: `, ...list(true), dark ? '. Not everything went dark: what is dark is the train, the Navy and what went into trusts.' : '.'],
    })
  }
  return out
}
