/**
 * The contract dossier's two objects (concept _explore/dossier_objects_2026-10-29, picks «El sello» + «Las monedas»):
 * pure mappers and the computed claims, each shown only when true (vitest objects.test.ts).
 *
 *  El sello   — each stamp = one field of the record, verbatim; the round one is the legal basis (exception
 *               article), hollow when the record is empty («sin dato»), red only for crítico or a flagged amount.
 *  Las monedas — one coin = one fixed unit of the recorded amount (the unit is picked once for the four stacks);
 *               under half a coin nothing is struck; a stack = this contract and its three nearest
 *               (same sector and year, nearest in log-amount and date).
 */
import { getRiskLevelFromScore } from '@/lib/constants'
import { recordedValue } from '@/lib/contract-format'

type Lang = 'es' | 'en'

export interface NearInput { id: number; amount_mxn?: number | null; contract_date?: string | null }

const DAY = 86_400_000
const dayOf = (s?: string | null) => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null
}

/** Distance = |ln(a / a0)| + 0.5 · |days apart| / 365 (an amount ×e weighs as much as two years apart). */
export function nearDistance(r: NearInput, self: NearInput): number {
  const a = Math.max(1, Number(r.amount_mxn ?? 0)), a0 = Math.max(1, Number(self.amount_mxn ?? 0))
  const d = dayOf(r.contract_date), d0 = dayOf(self.contract_date)
  return Math.abs(Math.log(a / a0)) + 0.5 * (d != null && d0 != null ? Math.abs(d - d0) / 365 : 1)
}

/** The n nearest rows to `self` (self excluded, positive amounts only), nearest first. */
export function pickNearest<T extends NearInput>(rows: T[], self: NearInput, n = 3): T[] {
  return rows
    .filter((r) => r.id !== self.id && Number(r.amount_mxn ?? 0) > 0)
    .map((r) => ({ r, d: nearDistance(r, self) }))
    .sort((x, y) => x.d - y.d || x.r.id - y.r.id)
    .slice(0, n)
    .map((x) => x.r)
}

/** The two archive queries around the amount: the 50 just below (largest first) and the 50 just above
 *  (smallest first), so the pool always holds the real neighbours, however dense the sector-year. */
export function nearQueries(amount: number): Array<{ min_amount?: number; max_amount?: number; sort_order: 'asc' | 'desc' }> {
  const cap = 100_000_000_000 // > 100B MXN is rejected upstream (data-validation)
  return [
    { max_amount: Math.min(cap, amount), sort_order: 'desc' },
    { min_amount: amount, max_amount: cap, sort_order: 'asc' },
  ]
}

/** 1-2-5 ladder from 1,000 MXN to 10,000 MDP (a small contract still gets a readable stack). */
export const COIN_LADDER = [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9, 2e9, 5e9, 1e10]

/** «500 MDP» / «5 mil MXN» (ES) · «500M MXN» / «5K MXN» (EN). */
export function unitWord(unit: number, lang: Lang): string {
  const big = unit >= 1e6, n = big ? unit / 1e6 : unit / 1e3
  const t = n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')
  return lang === 'es' ? `${t} ${big ? 'MDP' : 'mil MXN'}` : `${t}${big ? 'M' : 'K'} MXN`
}

/** The smallest unit on the ladder that keeps the tallest stack at or under `maxCoins` coins. */
export function coinUnit(maxAmount: number, maxCoins = 80): number {
  return COIN_LADDER.find((u) => maxAmount / u <= maxCoins) ?? COIN_LADDER[COIN_LADDER.length - 1]
}

/** Rounded to the nearest coin: under half a coin nothing is struck (0). */
export const coinCount = (amount: number, unit: number) => Math.max(0, Math.round(amount / unit))

/** The stack if the flagged amount's decimal slipped one place (×0.1); null unless flagged suspect_decimal. */
export const ghostCount = (amount: number, unit: number, flag?: string | null) =>
  flag === 'suspect_decimal' ? coinCount(amount / 10, unit) : null

export interface CoinStack {
  id: number
  self: boolean
  amount: number
  coins: number
  ghost: number | null
  critical: boolean
  date: string | null
  vendorId: number | null
  vendorName: string | null
  individual: boolean
  institutionName: string | null
}

export interface CoinRowInput extends NearInput {
  risk_score?: number | null
  amount_flag?: string | null
  vendor_id?: number | null
  vendor_name?: string | null
  vendor_is_individual?: boolean | null
  institution_name?: string | null
}

export function coinStacks(self: CoinRowInput, near: CoinRowInput[], maxCoins = 80): { unit: number; stacks: CoinStack[] } {
  const rows = [self, ...near]
  const unit = coinUnit(Math.max(...rows.map((r) => Number(r.amount_mxn ?? 0))), maxCoins)
  return {
    unit,
    stacks: rows.map((r, k) => {
      const amount = Number(r.amount_mxn ?? 0)
      return {
        id: r.id, self: k === 0, amount, coins: coinCount(amount, unit),
        ghost: k === 0 ? ghostCount(amount, unit, r.amount_flag) : null,
        critical: r.risk_score != null && getRiskLevelFromScore(Number(r.risk_score)) === 'critical',
        date: r.contract_date ?? null, vendorId: r.vendor_id ?? null, vendorName: r.vendor_name ?? null,
        individual: !!r.vendor_is_individual, institutionName: r.institution_name ?? null,
      }
    }),
  }
}

/** The § claim over the stacks (amounts compared, not rounded coins); null when there is nothing to compare.
 *  A flagged decimal leads the sentence and says what the stack would be if the decimal slipped. */
export function coinsClaim(stacks: CoinStack[], lang: Lang): string | null {
  const [self, ...others] = stacks
  if (!self || !others.length) return null
  const es = lang === 'es'
  const sum = others.reduce((s, o) => s + o.amount, 0)
  const top = Math.max(...others.map((o) => o.amount))
  const n = others.length
  const nW = es ? (n === 1 ? 'su parecido' : `sus ${n === 2 ? 'dos' : 'tres'} parecidos`) : (n === 1 ? 'its nearest' : `its ${n === 2 ? 'two' : 'three'} nearest`)
  let core: string
  if (self.amount > sum && n > 1) core = es ? `su pila es más alta que las de ${nW} juntos` : `its stack is taller than ${nW} put together`
  else if (self.amount > top) core = es ? `su pila es la más alta junto a ${nW}` : `its stack is the tallest beside ${nW}`
  else if (others.every((o) => self.amount < o.amount)) core = es ? `su pila es la más baja junto a ${nW}` : `its stack is the shortest beside ${nW}`
  else core = es ? `su pila queda entre las de ${nW}` : `its stack sits among ${nW}`
  if (self.ghost == null) return `${core.charAt(0).toUpperCase()}${core.slice(1)}.`
  const slipped = self.amount / 10
  const tail = slipped > top
    ? (es ? 'aún más alta que cualquiera de ellos' : 'still taller than any of them')
    : (es ? 'por debajo de la más alta de ellos' : 'below the tallest of them')
  return es
    ? `Con el monto registrado —marcado como posible error decimal— ${core}; si el decimal corrió, serían ${self.ghost} ${self.ghost === 1 ? 'moneda' : 'monedas'}, ${tail}.`
    : `With the recorded amount (flagged as a possible decimal error) ${core}; if the decimal slipped it would be ${self.ghost} ${self.ghost === 1 ? 'coin' : 'coins'}, ${tail}.`
}

/** A short supplier name for the coin labels (two words at most, legal suffix dropped); the full name goes in the tooltip. */
export function shortVendor(name: string | null | undefined, words = 2): string {
  const clean = (name ?? '').replace(/,?\s+(S\.?\s?A\.?\s?P?\.?\s?I?\.?\s?(DE\s+)?C\.?\s?V\.?|S\.?\s?DE\s+R\.?\s?L\.?(\s+DE\s+C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?)\s*$/i, '').trim()
  return clean.split(/\s+/).filter(Boolean).slice(0, words).join(' ')
}

// ── El sello ─────────────────────────────────────────────────────────────────

/** The «caso fortuito» field names the emergency (DESASTRE NATURAL, EPIDEMIA …); «OTRO» / «0» = none invoked
 *  (AUDIT_DATA 11-07 A8: Art. 41 fr. I — patents / single supplier — was printed under an act-of-God label). */
export const fortuitoInvoked = (v: string | null | undefined): string | null => {
  const f = recordedValue(v)
  return f && !['OTRO', '0', 'NO'].includes(f.trim().toUpperCase()) ? f : null
}

export interface Stamp {
  key: 'basis' | 'proc' | 'fortuito' | 'term' | 'award' | 'risk' | 'flag'
  kind: 'ring' | 'box'
  title: string
  /** the plate's text lines, verbatim where the record holds them */
  lines: string[]
  /** hollow + muted = the record is empty */
  none: boolean
  red: boolean
}

export interface StampInput {
  exception_article?: string | null
  caso_fortuito?: string | null
  procedure_label: string
  is_direct_award?: boolean | null
  start_date?: string | null
  end_date?: string | null
  award_date?: string | null
  risk_score?: number | null
  scored: boolean
  amount_flag?: string | null
}

/** Ring centre: the article in lines of ≤ `width` characters, at most 3 (longer text ends in «…»; the full text is the aria-label). */
export function ringLines(text: string, width = 9): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    const last = out[out.length - 1]
    if (last != null && (last + ' ' + w).length <= width) out[out.length - 1] = last + ' ' + w
    else out.push(w)
  }
  if (out.length > 3) return [...out.slice(0, 2), `${out[2].slice(0, width - 1)}…`]
  return out.map((l) => (l.length > width + 3 ? `${l.slice(0, width + 2)}…` : l))
}

/** Whole years and months between two calendar dates, in words. */
export function termWords(start: string, end: string, lang: Lang): string | null {
  const a = dayOf(start), b = dayOf(end)
  if (a == null || b == null || b < a) return null
  const days = b - a + 1
  if (days < 45) return lang === 'es' ? `${days} ${days === 1 ? 'día' : 'días'}` : `${days} ${days === 1 ? 'day' : 'days'}`
  const months = Math.round(days / 30.44)
  const y = Math.floor(months / 12), m = months % 12
  const es = lang === 'es'
  const yy = y ? `${y} ${es ? (y === 1 ? 'año' : 'años') : (y === 1 ? 'year' : 'years')}` : ''
  const mm = m ? `${m} ${es ? (m === 1 ? 'mes' : 'meses') : (m === 1 ? 'month' : 'months')}` : ''
  return [yy, mm].filter(Boolean).join(es ? ' y ' : ' and ')
}

export function stampsOf(c: StampInput, lang: Lang, date: (s: string) => string): Stamp[] {
  const es = lang === 'es'
  const noData = es ? 'sin dato' : 'no data'
  const art = recordedValue(c.exception_article)
  const raw = recordedValue(c.caso_fortuito)
  const fort = fortuitoInvoked(raw)
  const start = recordedValue(c.start_date), end = recordedValue(c.end_date)
  const award = recordedValue(c.award_date)
  const level = c.scored && c.risk_score != null ? getRiskLevelFromScore(Number(c.risk_score)) : null
  const LEVEL = { critical: es ? 'crítico' : 'critical', high: es ? 'alto' : 'high', medium: es ? 'medio' : 'medium', low: es ? 'bajo' : 'low' }
  const out: Stamp[] = [
    { key: 'basis', kind: 'ring', title: es ? 'FUNDAMENTO LEGAL · COMO CONSTA ·' : 'LEGAL BASIS · AS RECORDED ·', lines: art ? [art] : [es ? 'SIN DATO' : 'NO DATA'], none: !art, red: false },
    { key: 'proc', kind: 'box', title: es ? 'PROCEDIMIENTO' : 'PROCEDURE', lines: [c.procedure_label], none: c.procedure_label === '—', red: false },
    { key: 'fortuito', kind: 'box', title: es ? 'CASO FORTUITO' : 'CASO FORTUITO (ACT OF GOD)', lines: [fort ?? (raw ? (es ? `no se invoca (registro: ${raw})` : `not invoked (record: ${raw})`) : noData)], none: !fort, red: false },
    {
      key: 'term', kind: 'box', title: es ? 'VIGENCIA' : 'TERM',
      lines: start && end ? [`${date(start)} → ${date(end)}`, termWords(start, end, lang) ?? ''].filter(Boolean) : [start ? `${date(start)} → ${noData}` : noData],
      none: !(start && end), red: false,
    },
  ]
  if (award) out.push({ key: 'award', kind: 'box', title: es ? 'FALLO' : 'AWARD', lines: [date(award)], none: false, red: false })
  out.push({
    key: 'risk', kind: 'box', title: `${es ? 'INDICADOR DE RIESGO' : 'RISK INDICATOR'} ${level ? Number(c.risk_score).toFixed(2) : ''}`.trim(),
    lines: [level ? `${LEVEL[level]}${level === 'critical' ? ' · ≥ 0.60' : ''}` : (es ? 'sin puntuar' : 'unscored')],
    none: !level, red: level === 'critical',
  })
  if (c.amount_flag === 'suspect_decimal' || c.amount_flag === 'review') {
    out.push({
      key: 'flag', kind: 'box', title: es ? 'MONTO MARCADO' : 'AMOUNT FLAGGED',
      lines: [c.amount_flag === 'suspect_decimal' ? (es ? 'posible error decimal' : 'possible decimal error') : (es ? 'más de 10 mil MDP, en revisión' : 'over 10B MXN, under review')],
      none: false, red: true,
    })
  }
  return out
}

/** The § claim of the sheet, computed from what the record holds. */
export function selloClaim(c: StampInput, lang: Lang): string {
  const es = lang === 'es'
  const art = recordedValue(c.exception_article)
  const fort = fortuitoInvoked(c.caso_fortuito)
  const head = art
    ? (es ? `Sellado con fundamento ${art}` : `Stamped with legal basis ${art}`)
    : (es ? 'El registro no trae el fundamento legal' : 'The record carries no legal basis')
  const tail = fort
    ? (es ? `; caso fortuito: ${fort}` : `; force majeure («caso fortuito»): ${fort}`)
    : c.is_direct_award && !art
      ? (es ? ', aunque se adjudicó sin licitación' : ', although it was awarded without a tender')
      : ''
  return `${head}${tail}.`
}
