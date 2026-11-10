/**
 * «Lo que lee el modelo» — the vendor dossier's computed readings (pure; tested in modelReads.test.ts).
 * - `pickSignals`: the few model terms that matter (top raising ones + the main lowering one), in plain words.
 * - `buildScales`: one «típico de su sector» vs «esta empresa» scale per measure, with the multiple in words.
 * - `peakReading`: the risk-by-year line's one reading sentence.
 * Never «precio»: the model has no unit prices («monto por contrato»).
 */
import { featurePlain } from '@/lib/model/featureLabels'
import { ADMINISTRATIONS } from '@/lib/administrations'
import { EU_DIRECT_AWARD_LIMIT, MODEL_HR_BASELINE } from '@/lib/constants'
import { ratePct } from '@/components/dossier/command/pct'

type Lang = 'es' | 'en'
export interface Term { feature: string; z_score: number; coefficient: number; contribution: number }
export type Weight = 'strong' | 'mid' | 'light'
export interface Signal { feature: string; es: string; en: string; contribution: number; weight: Weight; share: number }

/** A term under this push is noise on the face (it stays in «Para especialistas»). */
export const MIN_PUSH = 0.05

export function pickSignals(terms: Term[] | null | undefined, maxUp = 4): { up: Signal[]; down: Signal | null } {
  const ts = (terms ?? []).filter((t) => Number.isFinite(t.contribution))
  const total = ts.reduce((s, t) => s + Math.abs(t.contribution), 0)
  const sig = (t: Term): Signal => {
    const share = total > 0 ? Math.abs(t.contribution) / total : 0
    return {
      feature: t.feature, es: featurePlain(t.feature, t.z_score, 'es'), en: featurePlain(t.feature, t.z_score, 'en'),
      contribution: t.contribution, share, weight: share >= 0.3 ? 'strong' : share >= 0.1 ? 'mid' : 'light',
    }
  }
  const up = ts.filter((t) => t.contribution >= MIN_PUSH).sort((a, b) => b.contribution - a.contribution).slice(0, maxUp).map(sig)
  const lo = ts.filter((t) => t.contribution <= -MIN_PUSH).sort((a, b) => a.contribution - b.contribution)[0]
  return { up, down: lo ? sig(lo) : null }
}

/** A signal's share of the whole push, as text: «45 %» / «45%»; under 1 % reads «<1 %». */
export function sharePct(share: number, lang: Lang): string {
  const n = Math.round(share * 100)
  const v = n < 1 ? '<1' : String(n)
  return lang === 'es' ? `${v} %` : `${v}%`
}

export type SignalClaimKey = 'raises' | 'alone' | 'lowers' | 'level'
export interface SignalClaim { key: SignalClaimKey; es: string; en: string }
const LEVEL_WORDS = { critical: { es: 'crítico', en: 'critical' }, high: { es: 'alto', en: 'high' }, medium: { es: 'medio', en: 'medium' }, low: { es: 'bajo', en: 'low' } } as const
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase())

/** «La lectura» of the diagram: each sentence renders only when its condition holds (tested one by one).
 *  raises — a term raises it (≥ MIN_PUSH) · alone — that term is more than half of the whole push
 *  lowers — a term lowers it (≤ −MIN_PUSH) · level — there is an indicator. */
export function signalClaims(terms: Term[] | null | undefined, score: number | null | undefined, level: keyof typeof LEVEL_WORDS | null): SignalClaim[] {
  const { up, down } = pickSignals(terms)
  const out: SignalClaim[] = []
  const top = up[0]
  if (top) {
    out.push({ key: 'raises', es: `Lo que más sube su indicador: ${lower(top.es)} (${sharePct(top.share, 'es')} del peso total).`, en: `What raises its indicator most: ${lower(top.en)} (${sharePct(top.share, 'en')} of the push).` })
    if (top.share > 0.5) out.push({ key: 'alone', es: 'Esa señal pesa más que todas las demás juntas.', en: 'That one signal outweighs all the others together.' })
  }
  if (down) out.push({ key: 'lowers', es: `Lo que más lo baja: ${lower(down.es)} (${sharePct(down.share, 'es')}).`, en: `What lowers it most: ${lower(down.en)} (${sharePct(down.share, 'en')}).` })
  if (score != null && Number.isFinite(score) && level) {
    out.push({ key: 'level', es: `Resultado: ${score.toFixed(2)}, nivel ${LEVEL_WORDS[level].es}.`, en: `Result: ${score.toFixed(2)}, ${LEVEL_WORDS[level].en} level.` })
  }
  return out
}

/** «Why is it high», ONE sentence for the vendor page and the contract page (AUDIT_JOURNALIST 11-07 P1: the two pages
 *  explained the same supplier in different words). The model's top raising terms, in the shared FEATURE_PLAIN words;
 *  null when nothing raises it. */
export function whyLine(terms: Term[] | null | undefined, lang: Lang): string | null {
  const [a, b] = pickSignals(terms, 2).up
  if (!a) return null
  const w = (x: Signal) => lower(lang === 'es' ? x.es : x.en)
  return lang === 'es'
    ? `Lo que más pesa en su indicador: ${w(a)}${b ? `; después, ${w(b)}` : ''}.`
    : `What weighs most in its indicator: ${w(a)}${b ? `; then, ${w(b)}` : ''}.`
}

export const WEIGHT_WORDS: Record<Weight, { up: { es: string; en: string }; down: { es: string; en: string } }> = {
  strong: { up: { es: 'sube mucho', en: 'raises a lot' }, down: { es: 'baja mucho', en: 'lowers a lot' } },
  mid: { up: { es: 'sube', en: 'raises' }, down: { es: 'baja', en: 'lowers' } },
  light: { up: { es: 'sube poco', en: 'raises a little' }, down: { es: 'baja poco', en: 'lowers a little' } },
}

// ── scales ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Metric { metric: string; value: number | null; peer_median: number | null }
export interface VendorRates { direct_award_pct?: number | null; high_risk_pct?: number | null; year_end_pct?: number | null; year_end_sector_avg?: number | null }
export interface Scale {
  key: 'direct_award' | 'single_bid' | 'risk' | 'amount' | 'high_risk' | 'year_end'
  es: string; en: string
  kind: 'pct' | 'score' | 'mxn'
  value: number | null            // null = sin dato (the track is hatched)
  typical: number | null
  /** What «typical» is: the sector median, or the mean over every contract (high/critical). */
  typicalIs: 'sector' | 'all'
  ratio: number | null
  /** A second, fixed reference (the EU direct-award line). */
  ref?: { at: number; es: string; en: string }
  emptyEs?: string; emptyEn?: string
}

const ratio = (v: number | null, m: number | null) => (v != null && m != null && m > 0 ? v / m : null)

export function buildScales(metrics: Metric[] | null | undefined, rates: VendorRates): Scale[] {
  const of = (k: string) => (metrics ?? []).find((m) => m.metric === k)
  const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, v)))
  const da = of('direct_award_pct'), sb = of('single_bid_competitive_pct'), rk = of('avg_risk_score'), pp = of('price_per_contract')
  const out: Scale[] = []
  const daV = pct(da?.value) ?? ratePct(rates.direct_award_pct), daM = pct(da?.peer_median)
  if (daV != null) out.push({ key: 'direct_award', es: 'Contratos sin licitación', en: 'Contracts without a tender', kind: 'pct', value: daV, typical: daM, typicalIs: 'sector', ratio: ratio(daV, daM),
    ref: { at: EU_DIRECT_AWARD_LIMIT * 100, es: `línea UE ${EU_DIRECT_AWARD_LIMIT * 100} %`, en: `EU line ${EU_DIRECT_AWARD_LIMIT * 100}%` } })
  if (sb) {
    const v = pct(sb.value), m = pct(sb.peer_median)
    out.push({ key: 'single_bid', es: 'Licitaciones que ganó sin competidor', en: 'Tenders it won with no rival', kind: 'pct', value: v, typical: m, typicalIs: 'sector', ratio: ratio(v, m),
      emptyEs: 'no participó en licitaciones', emptyEn: 'it took part in no tenders' })
  }
  if (pp?.value != null) out.push({ key: 'amount', es: 'Monto por contrato', en: 'Amount per contract', kind: 'mxn', value: pp.value, typical: pp.peer_median, typicalIs: 'sector', ratio: ratio(pp.value, pp.peer_median) })
  if (rk?.value != null) out.push({ key: 'risk', es: 'Indicador de riesgo promedio', en: 'Average risk indicator', kind: 'score', value: rk.value, typical: rk.peer_median, typicalIs: 'sector', ratio: ratio(rk.value, rk.peer_median) })
  const hr = ratePct(rates.high_risk_pct)
  if (hr != null) out.push({ key: 'high_risk', es: 'Contratos en riesgo alto o crítico', en: 'Contracts at high or critical risk', kind: 'pct', value: hr, typical: MODEL_HR_BASELINE * 100, typicalIs: 'all', ratio: ratio(hr, MODEL_HR_BASELINE * 100) })
  const ye = ratePct(rates.year_end_pct), yeM = ratePct(rates.year_end_sector_avg)
  if (ye != null && yeM != null) out.push({ key: 'year_end', es: 'Contratos firmados a fin de año', en: 'Contracts signed at year-end', kind: 'pct', value: ye, typical: yeM, typicalIs: 'sector', ratio: ratio(ye, yeM) })
  return out
}

const dec = (n: number) => n.toFixed(1)

/** The multiple in words: «6.9 veces lo habitual» · «la mitad de lo habitual» · «como lo habitual». */
export function multipleWords(s: Scale, lang: Lang): string {
  const es = lang === 'es'
  if (s.value == null) return es ? (s.emptyEs ?? 'sin dato') : (s.emptyEn ?? 'no data')
  if (s.typical === 0) return s.value > 0 ? (es ? 'lo habitual es cero' : 'the usual is zero') : (es ? 'como lo habitual' : 'as usual')
  const r = s.ratio
  if (r == null) return ''
  if (r >= 1.15) return es ? `${dec(r)} veces lo habitual` : `${dec(r)} times the usual`
  if (r <= 0.87) {
    if (r < 0.05) return es ? 'casi nada frente a lo habitual' : 'next to nothing against the usual'
    return es ? `${Math.round((1 - r) * 100)} % menos que lo habitual` : `${Math.round((1 - r) * 100)}% below the usual`
  }
  return es ? 'como lo habitual' : 'about the usual'
}

/** The scale the block's foco rings: the largest multiple above the usual (≥ 1.5×), if any. */
export function strongestScale(scales: Scale[]): Scale | null {
  const over = scales.filter((s) => s.ratio != null && s.ratio >= 1.5)
  return over.length ? over.reduce((a, b) => ((b.ratio ?? 0) > (a.ratio ?? 0) ? b : a)) : null
}

// ── risk by year ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Structure A (2002–2010): weakest records, drawn «estimado». */
export const WEAK_DATA_LAST_YEAR = 2010

export function sexenioOf(year: number) { return ADMINISTRATIONS.find((a) => year >= a.yearStart && year <= a.yearEnd) ?? null }

export function peakReading(points: Array<{ year: number; avg: number }>, lang: Lang): string | null {
  if (points.length < 2) return null
  const peak = points.reduce((m, p) => (p.avg > m.avg ? p : m), points[0])
  const last = points[points.length - 1]
  const adm = sexenioOf(peak.year)
  const es = lang === 'es'
  const when = adm ? (es ? `, en el sexenio de ${adm.long}` : `, under ${adm.long}`) : ''
  // three short sentences (≤ 15 words each): peak · weak-data note · where it ended
  const weak = peak.year <= WEAK_DATA_LAST_YEAR ? (es ? ' Son registros de 2002–2010: dato débil.' : ' These are 2002–2010 records: weak data.') : ''
  const tail = peak.year === last.year
    ? (es ? ' Es su último año con contratos.' : ' It is its latest year with contracts.')
    : (es ? ` En ${last.year} quedó en ${last.avg.toFixed(2)}.` : ` In ${last.year} it stood at ${last.avg.toFixed(2)}.`)
  return es
    ? `Su indicador más alto fue ${peak.avg.toFixed(2)} en ${peak.year}${when}.${weak}${tail}`
    : `Its highest indicator was ${peak.avg.toFixed(2)} in ${peak.year}${when}.${weak}${tail}`
}
