/** Money-path formats, language-pinned (the concept's mp.js): prose money in words, centavos, dates, counts.
 *  Tables, labels and read-outs use `money()` (lib/captura/lectura: ES = MDP / billones, never «B MXN»). */
export type Lang = 'es' | 'en'
export { money, moneyDual } from '@/lib/captura/lectura'
import { formatCompactUSD } from '@/lib/utils'

const LOC = (l: Lang) => (l === 'en' ? 'en-US' : 'es-MX')
export const n = (x: number, l: Lang, d = 0) => Number(x).toLocaleString(LOC(l), { maximumFractionDigits: d, minimumFractionDigits: d })
/** «81,892 millones de pesos» / «1.5 mil millones de pesos» — money inside a sentence. */
export function mxn(x: number, l: Lang): string {
  const a = Math.abs(x), en = l === 'en'
  if (a >= 1e12) return en ? `${n(x / 1e12, l, 2)} trillion pesos` : `${n(x / 1e12, l, 2)} billones de pesos`
  if (a >= 1e9) { const d = a >= 1e11 ? 0 : 1; return en ? `${n(x / 1e9, l, d)} billion pesos` : `${n(x / 1e9, l, d)} mil millones de pesos` }
  if (a >= 1e6) { const d = a >= 1e8 ? 0 : 1; return en ? `${n(x / 1e6, l, d)} million pesos` : `${n(x / 1e6, l, d)} millones de pesos` }
  return en ? `${n(x, l)} pesos` : `${n(x, l)} pesos`
}
/** `mxn` + its USD companion in the English edition («81.9 million pesos (≈US$4M)»); ES unchanged (CLAUDE.md rule 10). */
export const mxnDual = (x: number, l: Lang, year?: number) => (l === 'en' ? `${mxn(x, l)} (≈${formatCompactUSD(x, year)})` : mxn(x, l))
/** A share as «47%» / «47%». */
export const pct = (v: number | null | undefined, l: Lang, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${n(v * 100, l, d)}%`)
/** Centavos of a peso: two decimals under 1, one under 10, none above; 0 prints «0». */
export function cv(c: number, l: Lang, d?: number): string {
  if (!c) return '0'
  const k = d ?? (c < 1 ? 2 : c < 10 ? 1 : 0)
  return n(c, l, k)
}
/** «1 contrato» / «648 contratos». */
export const nn = (x: number, l: Lang, es1: string, esN: string, en1: string, enN: string) => `${n(x, l)} ${x === 1 ? (l === 'en' ? en1 : es1) : l === 'en' ? enN : esN}`

const MON = { es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] }
export const monthOf = (s: string, l: Lang) => MON[l][+s.slice(5, 7) - 1]
export function date(s: string | null | undefined, l: Lang): string {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return l === 'en' ? `${MON.en[+m - 1]} ${+d}, ${y}` : `${+d} de ${MON.es[+m - 1]} de ${y}`
}
export function dateS(s: string | null | undefined, l: Lang): string {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return l === 'en' ? `${MON.en[+m - 1].slice(0, 3)} ${+d}, ${y}` : `${+d} ${MON.es[+m - 1].slice(0, 3)} ${y}`
}
/** CompraNet UPPERCASE titles → sentence-ish title case («Compra Consolidada Complementaria…»). */
export const tc = (s: string | null | undefined) => String(s ?? '').toLowerCase()
  .replace(/(^|[\s(,./-])([a-záéíóúñ&])/g, (_m, a: string, b: string) => a + b.toUpperCase())
  .replace(/\b(De|Del|La|Y|E|Para|El|Los|Las|En)\b/g, (m) => m.toLowerCase())
