/**
 * The Portada's two computed readings (pure, tested in portadaReading.test.ts):
 * - `topBuyer`: the institution that spent the most in El Mapa's sky, and its share of the sky's money
 *   (the «qué significa» line of the page question, docs/PAGE_QUESTIONS.md).
 * - `riskDrivers`: a contract's strongest reasons in plain words, from GET /contracts/:id/risk-explain
 *   (the «¿Cómo se mide el riesgo?» explainer). Only features that push the indicator UP because the
 *   contract sits clearly ABOVE its sector-year baseline (coefficient > 0 and z ≥ 1) are named, so every phrase
 *   describes the direction it says. Never «precio»: the model does not know unit prices.
 */
import type { RiskFeatureContribution } from '@/api/types'

export interface SkyStars { id: number[]; name: string[]; siglas?: (string | null)[]; v: number[] }

export function topBuyer(stars: SkyStars | null | undefined): { id: number; name: string; siglas: string | null; share: number } | null {
  if (!stars?.v?.length) return null
  let top = 0
  let sum = 0
  for (let i = 0; i < stars.v.length; i++) {
    const v = stars.v[i] > 0 ? stars.v[i] : 0
    sum += v
    if (v > (stars.v[top] ?? 0)) top = i
  }
  if (!(sum > 0)) return null
  return { id: stars.id[top], name: stars.name[top], siglas: stars.siglas?.[top] ?? null, share: stars.v[top] / sum }
}

/** The reasons the explainer may name, read in the «above its baseline» direction. Only the cross-section features
 *  (v0.9.2 `contract_features_v10`: z against the same sector in years [Y−2, Y], leave-one-out) are listed; RT-4
 *  breadth and the HHI terms are raw units and the partida terms use another baseline (review 2026-11-03). */
const NAMED = ['price_ratio', 'price_volatility', 'vendor_concentration', 'direct_award', 'single_bid', 'same_day_count']
/** z the scorer clips at (_v10/build_v10.py CLIP): a clipped z can't be inverted into a share. */
const Z_CLIP = 5

export interface Driver { feature: string; z: number; contribution: number; raw: number | null }

/** A contract's strongest upward reasons that sit clearly OUTSIDE the usual (z ≥ 1 SD; Variant A critic finding 1:
 *  a reason inside the usual range contradicts its own words), strongest first. */
export function riskDrivers(features: RiskFeatureContribution[] | null | undefined, n = 3): Driver[] {
  return (features ?? [])
    .filter((f) => NAMED.includes(f.feature) && f.coefficient > 0 && f.z_score >= 1 && f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n)
    .map((f) => ({ feature: f.feature, z: f.z_score, contribution: f.contribution, raw: typeof f.raw === 'number' ? f.raw : null }))
}

/** One reason as ONE short sentence (`pre` + bold `b` + `post`, ≤ 15 words) and, where the data has both numbers,
 *  the comparison that draws it (owner 2026-11-05 «simplify… this is lazy»). Numbers are derived, never invented:
 *  - price_ratio raw = amount ÷ the sector's [Y−2, Y] median → «N veces»; lo normal = amount ÷ raw (that median).
 *  - vendor_concentration raw = the vendor's prior share of the sector's money → «N de cada 100 pesos» (≥ 5 only).
 *  - binary terms: z = (1 − p)/√(p(1 − p)) ⇒ the sector's rate p = 1/(1 + z²) → «N de cada 100».
 *  - same_day_count raw = contracts with the same buyer that day.
 *  `cmp`: «times» = this contract vs lo normal in money (+ `n` unit dots from 3× to 50× — the sentence then prints the same whole number — one dot = one normal contract);
 *  «per100» = n of 100 (dots). No number → words only, no picture. Never «precio»: the model has no unit prices. */
export type Cmp =
  | { kind: 'times'; self: number; typical: number; n: number | null }
  | { kind: 'per100'; n: number; label: string }
export interface Reason { pre: string; b?: string; post: string; cmp?: Cmp }

/** `sector` = the sector's display name in the reader's language («Salud» / «Health»); null → «su sector». */
export function reasonOf(d: Driver, amount: number | null, en: boolean, sector: string | null = null): Reason {
  const L = (es: string, e: string) => (en ? e : es)
  const num = (x: number, dp = 0) => x.toLocaleString(en ? 'en-US' : 'es-MX', { maximumFractionDigits: dp })
  const inS = sector ? L(`en ${sector}`, `in ${sector}`) : L('en su sector', 'in its sector')
  const ofS = sector ? L(`de ${sector}`, `in ${sector}`) : L('de su sector', 'in its sector')
  const InS = sector ? L(`En ${sector}`, `In ${sector}`) : L('En su sector', 'In its sector')
  const rate = d.z < Z_CLIP - 0.01 ? Math.round(100 / (1 + d.z * d.z)) : 0
  const r = d.raw
  switch (d.feature) {
    case 'price_ratio':
      if (r != null && r >= 1.5) {
        return {
          // past 100× the exact multiple reads as noise (SILVER) → «más de 100 veces»; the amounts below stay exact
          pre: L('Su monto es ', 'Its amount is '),
          b: r > 100 ? L('más de 100 veces', 'over 100 times') : L(`${num(r, r < 3 ? 1 : 0)} veces`, `${num(r, r < 3 ? 1 : 0)} times`),
          post: L(` lo normal ${inS}.`, ` the norm ${inS}.`),
          cmp: amount != null && amount > 0 ? { kind: 'times', self: amount, typical: amount / r, n: r >= 3 && r <= 50 ? Math.round(r) : null } : undefined,
        }
      }
      return { pre: L(`Su monto es mucho mayor que lo normal ${inS}.`, `Its amount is far above the norm ${inS}.`), post: '' }
    case 'vendor_concentration': {
      const p100 = r != null ? Math.round(r * 100) : 0
      // a share under 5 of 100 is still far above usual (z ≥ 1) but READS small to a newcomer → words
      if (p100 >= 5 && p100 <= 100) { // > 100 of 100 is a bad value → words
        return {
          pre: L('Hasta el año pasado, la empresa cobró ', 'Up to last year, the company took '),
          b: L(`${p100} de cada 100 pesos`, `${p100} of every 100 pesos`), post: L(` ${ofS}.`, ` ${inS}.`),
          cmp: { kind: 'per100', n: p100, label: L(`${p100} de 100 pesos`, `${p100} of 100 pesos`) },
        }
      }
      return { pre: L(`La empresa ya tenía mucho más gasto ${ofS} que lo normal.`, `The company already held far more spending ${inS} than usual.`), post: '' }
    }
    case 'price_volatility':
      return { pre: L(`Sus montos varían mucho más que los de otras empresas ${ofS}.`, `Its amounts swing far more than other companies' ${inS}.`), post: '' }
    case 'direct_award':
      return rate >= 1
        ? { pre: L(`Se dio sin concurso. ${InS}, ${rate < 30 ? 'solo ' : ''}`, `Awarded without a tender. ${InS}, ${rate < 30 ? 'only ' : ''}`), b: L(`${rate} de cada 100`, `${rate} of every 100`), post: L(' se dan así.', ' are.'),
            cmp: { kind: 'per100', n: rate, label: L(`${rate} de 100 sin concurso`, `${rate} of 100 without a tender`) } }
        : { pre: L(`Se dio sin concurso, algo raro ${inS}.`, `Awarded without a tender, rare ${inS}.`), post: '' }
    case 'single_bid':
      return rate >= 1
        ? { pre: L(`Un solo proveedor ganó el concurso. ${InS} pasa en `, `One vendor won the tender. ${InS} that happens in `), b: L(`${rate} de cada 100`, `${rate} of every 100`), post: '.',
            cmp: { kind: 'per100', n: rate, label: L(`${rate} de 100 con un solo adjudicado`, `${rate} of 100 with a single award`) } }
        : { pre: L(`Un solo proveedor ganó el concurso, algo raro ${inS}.`, `One vendor won the tender, rare ${inS}.`), post: '' }
    default: // same_day_count
      return r != null && r >= 2
        ? { pre: L('La empresa firmó ', 'The company signed '), b: L(`${num(r)} contratos`, `${num(r)} contracts`), post: L(' con la misma institución ese día.', ' with the same buyer that day.') }
        : { pre: L('La empresa firmó varios contratos con la misma institución el mismo día.', 'The company signed several contracts with the same buyer that day.'), post: '' }
  }
}
