import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'
import { MAX_CONTRACT_VALUE, FLAG_THRESHOLD } from './constants'
import { getExchangeRate } from './exchangeRates'


/**
 * Get the Intl locale string matching the current i18n language.
 * Falls back to 'es-MX' for Spanish, 'en-US' for English.
 */
export function getLocale(): string {
  const lang = i18n.language
  if (lang === 'en') return 'en-US'
  return 'es-MX'
}

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Mexican Pesos (locale-aware)
 */
export function formatMXN(amount: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format large amounts in compact form, locale-aware.
 *
 * English (default): "1.5B MXN" / "9.9T MXN" — billion = 10⁹, trillion = 10¹².
 *
 * Mexican Spanish — uses MDP (millones de pesos) as the canonical unit because
 *   "billion" = "mil millones" (10⁹) which doesn't translate cleanly. The
 *   Mexican procurement convention is to express most public amounts in MDP.
 *   - >= 10¹²:  "X.X billones MXN"     (billón in Spanish = 10¹² = English trillion)
 *   - >= 10⁹:   "X,XXX MDP"            (e.g., 1.5B MXN → "1,500 MDP")
 *   - >= 10⁶:   "X.X MDP"
 *   - else:     formatMXN
 */
/** One unit down an amount COLUMN (register boards, RED 11-06): ES «x MDP», EN «x M MXN», with decimals for small rows
 *  («0.51 MDP», «<0.01 MDP») — never «1.9 MDP» beside «512.1 mil MXN» beside «$754». */
export function formatColumnMXN(amount: number): string {
  const isEs = (i18n.language || 'en').startsWith('es')
  const m = amount / 1_000_000
  const n = m < 0.01 ? '<0.01' : m < 1 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : new Intl.NumberFormat(isEs ? 'es-MX' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(m))
  return isEs ? `${n} MDP` : `${n}M MXN`
}

export function formatCompactMXN(amount: number, unit?: 'mdp'): string {
  const lang = i18n.language || 'en'
  const isEs = lang.startsWith('es')

  // One unit down a column (a ranked list of big buyers): MDP in Spanish, B MXN in English, never «billones» / T beside them.
  if (unit === 'mdp') {
    return isEs
      ? `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(amount / 1_000_000))} MDP`
      : `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(amount / 1_000_000_000)}B MXN`
  }

  if (isEs) {
    if (amount >= 1_000_000_000_000) {
      return `${(amount / 1_000_000_000_000).toFixed(1)} billones MXN`
    }
    // each step starts where the one below would round up to 1000.0 (999.96 M → «1,000 MDP», never «1000.0 MDP»)
    if (amount >= 999_950_000) {
      // Express in MDP with thousand separators — "1,500 MDP" reads clearly
      const mdp = amount / 1_000_000
      return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(mdp))} MDP`
    }
    if (amount >= 999_950) {
      return `${(amount / 1_000_000).toFixed(1)} MDP`
    }
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)} mil MXN`
    return formatMXN(amount)
  }

  // English — MXN only; USD via <USDTooltip> hover popover at call sites
  if (amount >= 999_950_000_000) return `${(amount / 1_000_000_000_000).toFixed(1)}T MXN`
  if (amount >= 999_950_000) return `${(amount / 1_000_000_000).toFixed(1)}B MXN`
  if (amount >= 999_950) return `${(amount / 1_000_000).toFixed(1)}M MXN`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K MXN`
  return formatMXN(amount)
}

/**
 * Format an MXN amount as a compact USD figure using the current MXN/USD rate.
 * For inflation-adjusted historical-year conversions, use toReal2024USD instead.
 *
 * Examples (2026 YTD rate 17.50):
 *   9_900_000_000_000 → "US$566B"
 *   1_200_000_000_000 → "US$69B"
 *   100_000_000       → "US$6M"
 */
export function formatCompactUSD(amountMXN: number, year?: number, rate?: number): string {
  // `year` converts at that year's Banxico FIX mean; undated = latest year. `rate` overrides (1 = already USD).
  const usd = amountMXN / (rate ?? getExchangeRate(year))

  if (usd >= 1e12) return `US$${(usd / 1e12).toFixed(1)}T`
  if (usd >= 1e9)  return `US$${(usd / 1e9).toFixed(0)}B`
  if (usd >= 1e6)  return `US$${(usd / 1e6).toFixed(0)}M`
  if (usd >= 1e3)  return `US$${(usd / 1e3).toFixed(0)}K`
  return `US$${Math.round(usd)}`
}

/**
 * Format an MXN amount with an inline USD companion for impact, locale-aware.
 *
 * EN: "9.9T MXN · ≈US$566B"  — inline USD provides instant scale for foreign readers
 * ES: "9.9 billones MXN"     — Mexican audience reads MXN natively, no USD clutter
 *
 * Breaks the legacy "never inline both units" rule on purpose: the dashboard
 * headline numbers need impact, and hover-only USD doesn't carry on first read.
 */
export function formatDualCurrency(amountMXN: number, year?: number, usdTotal?: number | null): string {
  const mxn = formatCompactMXN(amountMXN)
  const lang = i18n.language || 'en'
  if (lang.startsWith('es')) return mxn

  // a multi-year total passes the API's own per-year-FIX USD sum (`usdTotal`, e.g. headline.total_value_usd):
  // one undated rate on 2002–2026 pesos gave three USD totals for one number (AUDIT_DATA 11-07 A6)
  const usd = usdTotal != null && usdTotal > 0 ? formatCompactUSD(usdTotal, undefined, 1) : formatCompactUSD(amountMXN, year)
  return `${mxn} · ≈${usd}`
}

/**
 * Localize an amount string from English (B/T/M MXN) to Mexican Spanish at
 * runtime. Used to intercept hardcoded English stats in legacy story content
 * without rewriting story-content.ts.
 *
 * Examples (when isEs=true):
 *   "133.2B MXN"     → "133,200 MDP"
 *   "$2.5B MXN"      → "$2,500 MDP"
 *   "1.25T MXN"      → "1.25 billones MXN"
 *   "$2.76T MXN"     → "$2.76 billones MXN"
 *   "526.8B MXN"     → "526,800 MDP"
 *   "979 contracts"  → "979 contracts" (passed through, no MXN suffix)
 *
 * Mexican media convention: "billón" = 10¹² (= English trillion), MDP =
 * "millones de pesos" used heavily in procurement journalism.
 */
export function localizeAmount(input: string, lang?: 'en' | 'es'): string {
  const isEs = (lang ?? i18n.language ?? 'en').startsWith('es')
  if (!isEs) return input

  function convertOne(numStr: string, suffix: string, dollarPrefix: string): string | null {
    const n = parseFloat(numStr.replace(',', '.'))
    if (Number.isNaN(n)) return null
    const s = suffix.toUpperCase()
    if (s === 'T') return `${dollarPrefix}${n.toFixed(n < 10 ? 2 : 1)} billones MXN`
    if (s === 'B') {
      const mdp = n * 1000
      const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(mdp))
      return `${dollarPrefix}${fmt} MDP`
    }
    if (s === 'M') return `${dollarPrefix}${n.toFixed(1)} MDP`
    return null
  }

  const trimmed = input.trim()

  // Range format: "79-158B MXN" → "79,000-158,000 MDP"
  const rangeRe = /^(\$\s*)?([0-9]+(?:[.,][0-9]+)?)-([0-9]+(?:[.,][0-9]+)?)\s*(B|T|M)\s*MXN\s*$/i
  const rm = trimmed.match(rangeRe)
  if (rm) {
    const lo = convertOne(rm[2], rm[4], rm[1] ? '$' : '')
    const hiRaw = convertOne(rm[3], rm[4], '')
    if (lo && hiRaw) {
      // strip trailing " MDP" from lo to join with dash: "79,000-158,000 MDP"
      const loVal = lo.replace(/\s*MDP$/, '').replace(/\s*billones MXN$/, '')
      return `${loVal}-${hiRaw}`
    }
  }

  // Single value: original path
  const re = /^(\$\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(B|T|M)\s*MXN\s*$/i
  const m = trimmed.match(re)
  if (!m) return input
  return convertOne(m[2], m[3], m[1] ? '$' : '') ?? input
}

/**
 * Format a number with thousands separators (locale-aware)
 */
// PERF launch § 7: Intl formatters are costly to build and these run thousands of
// times per dossier render — one instance per locale, built on first use.
const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

export function formatNumber(num: number): string {
  const locale = getLocale()
  let f = numberFormats.get(locale)
  if (!f) numberFormats.set(locale, (f = new Intl.NumberFormat(locale)))
  return f.format(num)
}

/**
 * Format a percentage
 */
/** The count's noun: `plural(1, 'contract', 'contracts')` → 'contract'. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format a date for display (locale-aware)
 */
export function formatDate(date: string | Date): string {
  const locale = getLocale()
  let f = dateFormats.get(locale)
  if (!f) dateFormats.set(locale, (f = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })))
  // 'YYYY-MM-DD' is a calendar date: `new Date()` reads it as UTC midnight, a day early west of UTC.
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  return f.format(m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(date))
}

import { getRiskLevelFromScore } from './constants'

/**
 * Get risk level from score (v4.0 thresholds — risk similarity indicators)
 * Delegates to the canonical function in constants.ts
 */
export function getRiskLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  return getRiskLevelFromScore(score)
}

/**
 * Get risk color class from score
 */
export function getRiskColorClass(score: number): string {
  const level = getRiskLevel(score)
  return `risk-${level}`
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Format a risk score consistently as percentage (0.27 -> "27.0")
 * This is the STANDARD way to display risk scores across the app
 */
export function formatRiskScore(score: number | undefined | null): string {
  if (score === undefined || score === null) return '-'
  return (score * 100).toFixed(1)
}

/**
 * Format a risk score with percentage sign (0.27 -> "27.0%")
 */
export function formatRiskScorePercent(score: number | undefined | null): string {
  if (score === undefined || score === null) return '-'
  return `${(score * 100).toFixed(1)}%`
}

/**
 * Safe percentage formatter - handles both 0-1 and 0-100 scales
 * @param value - The value to format
 * @param isDecimal - If true, value is 0-1 scale; if false, value is 0-100 scale
 */
export function formatPercentSafe(
  value: number | undefined | null,
  isDecimal: boolean = true,
  decimals: number = 1
): string {
  if (value === undefined || value === null) return '-'
  const percentage = isDecimal ? value * 100 : value
  return `${percentage.toFixed(decimals)}%`
}

/**
 * Validate contract amount and return status
 */
export function validateAmount(amount: number): {
  isValid: boolean
  isFlagged: boolean
  status: 'valid' | 'flagged' | 'rejected'
  message?: string
} {
  if (amount > MAX_CONTRACT_VALUE) {
    return {
      isValid: false,
      isFlagged: false,
      status: 'rejected',
      message: `Amount exceeds ${formatCompactMXN(MAX_CONTRACT_VALUE)} threshold - likely data error`,
    }
  }
  if (amount > FLAG_THRESHOLD) {
    return {
      isValid: true,
      isFlagged: true,
      status: 'flagged',
      message: `Amount exceeds ${formatCompactMXN(FLAG_THRESHOLD)} - flagged for review`,
    }
  }
  return { isValid: true, isFlagged: false, status: 'valid' }
}

/**
 * Format compact MXN with validation warning
 */
export function formatCompactMXNSafe(amount: number): { formatted: string; warning?: string } {
  const validation = validateAmount(amount)
  return {
    formatted: formatCompactMXN(amount),
    warning: validation.message,
  }
}

/**
 * Normalize a value to 0-1 scale given min/max bounds
 */
export function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

/**
 * Title case converter for ALL CAPS database text.
 * Handles Mexican corporate suffixes, acronyms, state prefixes, and Spanish particles.
 */
export function toTitleCase(text: string): string {
  if (!text) return ''
  // Already genuine mixed case (has BOTH a lowercase AND an uppercase ASCII
  // letter) — leave it alone. We test ASCII case only on purpose: COMPRANET
  // stores many names ASCII-UPPERCASE with their accented vowels left lowercase
  // (SQLite UPPER() is ASCII-only), e.g. "ANNA HIDA CHáVEZ ALEMáN". The old
  // `text !== text.toUpperCase()` guard treated that lone lowercase "á" as
  // mixed-case and returned the mangled string unchanged; the ASCII-only test
  // correctly recognises it as effectively all-caps and title-cases it.
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) return text

  // A lone ASCII all-caps token of ≤8 characters is a sigla, not a shouty word:
  // SPF, INAI, AGN, CIJ, FND, AFAC, SIAP, IMSS, PEMEX, CFE. Title-casing those
  // printed non-words ("Spf", "Inai", "Afac") on every surface that renders an
  // institution_name, because this normaliser runs in the axios interceptor
  // before formatInstitutionName's own sigla guard can ever see the capitals.
  // Multi-word ALL-CAPS names (real names shouted by COMPRANET) are unaffected.
  if (text.length <= 8 && /^[A-Z][A-Z0-9]*$/.test(text)) return text

  // Handle state prefix pattern: "NL-Something" → keep prefix uppercase. On the raw text, before the suffix
  // placeholders: recursing on placeholder text lower-cased them past the restore («HI-TEC MEDICAL, ▯sacv▯»).
  const stateMatch = text.match(/^([A-Za-z]{2,4})-(.+)$/)
  if (stateMatch) {
    return stateMatch[1].toUpperCase() + '-' + toTitleCase(stateMatch[2].toUpperCase())
  }

  let lower = text.toLowerCase()

  // Preserve period-separated corporate suffixes BEFORE word-level processing
  lower = lower
    .replace(/\bs\.\s*a\.\s*de\s+c\.\s*v\./g, '\uE000SACV\uE000')
    .replace(/\bs\.\s*de\s+r\.\s*l\.\s*de\s+c\.\s*v\./g, '\uE000SRLCV\uE000')
    .replace(/\bs\.\s*de\s+r\.\s*l\./g, '\uE000SRL\uE000')
    .replace(/\bs\.\s*a\.\s*p\.\s*i\./g, '\uE000SAPI\uE000')
    .replace(/\bs\.\s*a\.\s*b\./g, '\uE000SAB\uE000')
    .replace(/\bs\.\s*a\./g, '\uE000SA\uE000')
    .replace(/\bs\.\s*c\./g, '\uE000SC\uE000')
    .replace(/\bs\.\s*n\.\s*c\./g, '\uE000SNC\uE000')
    .replace(/\ba\.\s*c\./g, '\uE000AC\uE000') // asociaci\u00F3n civil: \u00ABA.C.\u00BB, never \u00ABA.c.\u00BB

  // Spanish particles that stay lowercase (except at start)
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'en', 'con', 'al', 'para', 'por', 'a'])
  // Corporate/legal tokens that stay UPPERCASE (space-separated)
  const upperTokens = new Set(['sa', 'cv', 'sc', 'srl', 'sab', 'sapi', 'sofom', 'enr', 'ac', 'ab', 'rl', 'ia', 'ii', 'iii', 'iv'])
  // Known acronyms to preserve
  const acronyms = new Set(['imss', 'issste', 'pemex', 'cfe', 'sat', 'shcp', 'sep', 'ssa', 'sedena', 'semar', 'conagua', 'sct', 'cdi', 'inegi', 'unam', 'ipn', 'lp', 'inc'])


  // Split on whitespace to process space-separated tokens (avoids \b issues with accented chars)
  const result = lower.split(/(\s+)/).map((token, i, arr) => {
    // Preserve whitespace tokens as-is
    if (/^\s+$/.test(token)) return token
    // Find the position of this token relative to start (for first-word check)
    const isFirst = arr.slice(0, i).every(t => /^\s*$/.test(t))
    // Strip trailing punctuation for matching, reattach after
    const match = token.match(/^([,;:/(]*)([\s\S]*?)([\uE000,;:/).]*)$/)
    if (!match) return token
    const [, prefix, core, suffix] = match
    // Placeholder tokens from corporate patterns
    if (core.startsWith('\uE000')) return prefix + core + suffix
    // Check if the ASCII-only version matches our word lists
    const ascii = core.replace(/[^a-z]/g, '')
    if (upperTokens.has(ascii) && ascii === core) return prefix + core.toUpperCase() + suffix
    if (acronyms.has(ascii) && ascii === core) return prefix + core.toUpperCase() + suffix
    if (!isFirst && particles.has(core)) return prefix + core + suffix
    // Default: capitalize first letter
    return prefix + core.charAt(0).toUpperCase() + core.slice(1) + suffix
  }).join('')

  // Restore corporate suffix placeholders
  return result
    .replace(/\uE000SACV\uE000/g, 'S.A. de C.V.')
    .replace(/\uE000SRLCV\uE000/g, 'S. de R.L. de C.V.')
    .replace(/\uE000SRL\uE000/g, 'S. de R.L.')
    .replace(/\uE000SAPI\uE000/g, 'S.A.P.I.')
    .replace(/\uE000SAB\uE000/g, 'S.A.B.')
    .replace(/\uE000SA\uE000/g, 'S.A.')
    .replace(/\uE000SC\uE000/g, 'S.C.')
    .replace(/\uE000SNC\uE000/g, 'S.N.C.')
    .replace(/\uE000AC\uE000/g, 'A.C.')
}

/**
 * Format a MXN amount as compact USD using year-specific exchange rate.
 * Use when a contract's historical year matters (e.g. converting 2002 pesos
 * at the 2002 rate rather than today's). For "today's-rate" scale companions
 * on headline numbers, use formatCompactUSD() instead.
 */
export function formatCompactUSDByYear(amountMXN: number, year?: number): string {
  const usd = amountMXN / getExchangeRate(year)
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T USD`
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B USD`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M USD`
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K USD`
  return `$${usd.toFixed(0)} USD`
}

/**
 * Approximate chi-squared survival function (1 - CDF) for computing p-values.
 * Uses the regularized incomplete gamma function via series expansion.
 * @param x - The chi-squared statistic (e.g., Mahalanobis D²)
 * @param k - Degrees of freedom (default 12 for 12 z-score features)
 * @returns p-value (probability of observing a value >= x)
 */
export function chiSquaredPValue(x: number, k: number = 12): number {
  if (x <= 0) return 1
  // P(X >= x) = 1 - gammainc(k/2, x/2) where gammainc is the regularized lower incomplete gamma
  // Use series expansion of the regularized lower incomplete gamma function
  const a = k / 2
  const z = x / 2

  // For large x, p-value is very small
  if (z > a + 40) return 0

  // Series expansion: P(a, z) = e^(-z) * z^a * sum(z^n / gamma(a+n+1))
  let sum = 0
  let term = 1 / a
  sum = term
  for (let n = 1; n < 200; n++) {
    term *= z / (a + n)
    sum += term
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break
  }

  // log(P) = -z + a*log(z) + log(sum) - lgamma(a)
  const logP = -z + a * Math.log(z) + Math.log(sum) - lnGamma(a)
  const P = Math.exp(logP)

  return Math.max(0, Math.min(1, 1 - P))
}

/** Log-gamma function (Lanczos approximation) */
function lnGamma(z: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/**
 * Get anomaly label and color from Mahalanobis distance.
 * @returns { label, colorClass } or null if no data
 */
export function getAnomalyInfo(mahalanobisDistance: number | undefined | null): {
  label: string
  dotClass: string
  badgeClass: string
} | null {
  if (mahalanobisDistance == null) return null
  const pValue = chiSquaredPValue(mahalanobisDistance)
  if (pValue < 0.01) {
    return {
      label: 'Anomalous',
      dotClass: 'bg-risk-critical',
      badgeClass: 'bg-risk-critical/20 text-risk-critical border border-risk-critical/30',
    }
  }
  if (pValue < 0.05) {
    return {
      label: 'Unusual',
      dotClass: 'bg-risk-high',
      badgeClass: 'bg-risk-high/20 text-risk-high border border-risk-high/30',
    }
  }
  return null
}

const CONTRACT_STRIP_PREFIXES = [
  'CONTRATO DE SERVICIOS DE ',
  'CONTRATO DE PRESTACIÓN DE SERVICIOS DE ',
  'ADJUDICACIÓN DIRECTA PARA LA ',
  'ADJUDICACIÓN DIRECTA PARA ',
  'LICITACIÓN PÚBLICA NACIONAL PARA ',
  'LICITACIÓN PÚBLICA INTERNACIONAL PARA ',
  'SERVICIO DE ',
  'ADQUISICIÓN DE ',
  'PROYECTO INTEGRAL DE ',
  'ELABORACIÓN DEL PROYECTO EJECUTIVO, SUMINISTRO DE MATERIALES, ',
  'ELABORACIÓN DE PROYECTO EJECUTIVO, SUMINISTRO DE MATERIALES, ',
  'TRABAJOS DE CONSTRUCCIÓN Y OBRAS COMPLEMENTARIAS DEL ',
]

const INSTITUTION_ABBREVS: Record<string, string> = {
  'INSTITUTO MEXICANO DEL SEGURO SOCIAL': 'IMSS',
  'PETRÓLEOS MEXICANOS': 'PEMEX',
  'COMISIÓN FEDERAL DE ELECTRICIDAD': 'CFE',
  'SECRETARÍA DE SALUD': 'SS',
  'SECRETARÍA DE EDUCACIÓN PÚBLICA': 'SEP',
  'SECRETARÍA DE HACIENDA Y CRÉDITO PÚBLICO': 'SHCP',
  'SECRETARÍA DE INFRAESTRUCTURA, COMUNICACIONES Y TRANSPORTES': 'SICT',
  'COMISIÓN NACIONAL DEL AGUA': 'CONAGUA',
  'INSTITUTO DE SEGURIDAD Y SERVICIOS SOCIALES DE LOS TRABAJADORES DEL ESTADO': 'ISSSTE',
  'BANCO NACIONAL DE OBRAS Y SERVICIOS PÚBLICOS': 'BANOBRAS',
}

/**
 * ~4.6% of pre-2010 COMPRANET contract titles (source_structure A/B) have every
 * accented vowel collapsed into a single garbage byte at original ingestion —
 * "ý" never legitimately appears in Spanish, so stripping it is safe wherever
 * contract text is displayed. Not recoverable: distinct source characters
 * (ó/á/é/ª) all map to the same byte, so there's no correct letter to restore.
 */
export function stripEncodingArtifacts(s: string): string {
  return s.replace(/[ýÝ]/g, '')
}

export function shortenContractName(name: string, maxChars = 80): string {
  if (!name) return ''
  let s = stripEncodingArtifacts(name)
  const upper = s.toUpperCase()
  for (const prefix of CONTRACT_STRIP_PREFIXES) {
    if (upper.startsWith(prefix)) { s = s.slice(prefix.length); break }
  }
  for (const [full, abbrev] of Object.entries(INSTITUTION_ABBREVS)) {
    const at = s.toUpperCase().indexOf(full)
    if (at >= 0) s = s.slice(0, at) + abbrev + s.slice(at + full.length)
  }
  // ALL-CAPS → Spanish sentence case (siglas, codes, accents kept); a mixed-case
  // title keeps its own casing — only a prefix strip can leave it lower-first.
  s = isShouty(s) ? formatContractTitle(s) : s.charAt(0).toUpperCase() + s.slice(1)
  return s.length > maxChars ? s.slice(0, maxChars) + '…' : s
}

// ── Contract titles: ALL-CAPS → Spanish sentence case (display only) ────────
// Survey 2026-10-31 (docs/NAME_PRESENTATION_2026-10-31.md): titles are ALL-CAPS
// in 25% of structure A, 78% B, 81% C, ~100% D and ComprasMX.

/** No ASCII lowercase letter = shouty. ASCII on purpose: SQLite UPPER() leaves
 *  accented vowels lowercase ("ADQUISICIóN"), which is still an all-caps title. */
const isShouty = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s)

// Siglas that stay upper even though they hold vowels (consonant-only tokens
// such as SHCP, HGZ, DVFN are kept by rule, not by list).
const TITLE_SIGLAS = new Set((
  'IMSS ISSSTE CFE PEMEX SAT SEP SEDENA SEMAR CONAGUA SICT INEGI UNAM IPN CONAFE INIFAP INBAL INSABI ' +
  'UMAE UMF OOAD RPBI PVC UPS CDMX COVID IVA TIC TICS CCTV GPS LED USB DIF CAPUFE ASA SAGARPA SADER ' +
  'SEGALMEX DICONSA LICONSA FONATUR BANOBRAS NAFIN CONACYT CONAHCYT SSA ISSFAM SEGOB SRE SFP STPS ' +
  'SEMARNAT SEDATU SECTUR SENER CENACE CENAGAS CONAPESCA CONALEP CECYT CBTIS CETIS IEPS ISR RFC CURP ' +
  'CCT LPN LPI LAN AA SIAP INAI INE IFT CRE CNH SAE TV ISO NOM IA IMSS-BIENESTAR UNOPS OPS OMS PNUD ' +
  'BIRMEX AICM ASUR GACM SENEAM IMP INAH CONADE CONAVI INFONAVIT FOVISSSTE ICA SEDESOL SEDESA PAE ASIPONA ' +
  // state abbreviations that are not Spanish words (SON, VER, SIN, COL stay lower)
  'AGS BCS CHIS CHIH COAH DGO GTO GRO HGO JAL MICH NAY OAX PUE QRO QROO SLP TAB TAMPS TLAX YUC ZAC'
).split(' '))
// Consonant-only tokens that are units/abbreviations, not siglas.
const TITLE_UNITS = new Set('KM ML MG CM MM MTS MT KG GR GRS LTS LT PZ PZS PZA PZAS HRS HR KW KVA KV MW MP GB TB MB SR SRA DR DRA LIC ING PROF GRAL MPIO EDO NUM NO'.split(' '))
// ADQUISICION→adquisición is a rule (every -CION/-SION takes the accent); the
// rest is a small dictionary of unambiguous words. Stems take O/A/OS/AS.
const ACCENT_STEMS: Record<string, string> = {
  MEDIC: 'médic', TECNIC: 'técnic', QUIMIC: 'químic', ELECTRIC: 'eléctric', ELECTRONIC: 'electrónic',
  INFORMATIC: 'informátic', HIDRAULIC: 'hidráulic', FARMACEUTIC: 'farmacéutic', TERAPEUTIC: 'terapéutic',
  PUBLIC: 'públic', BASIC: 'básic', PSICOTROPIC: 'psicotrópic', RADIOLOGIC: 'radiológic', HIGIENIC: 'higiénic',
  QUIRURGIC: 'quirúrgic', ORTOPEDIC: 'ortopédic', OPTIC: 'óptic', LOGISTIC: 'logístic', DIAGNOSTIC: 'diagnóstic',
  METALIC: 'metálic', PLASTIC: 'plástic', AERE: 'aére', LACTE: 'lácte', PERIODIC: 'periódic', ECONOMIC: 'económic',
  ACADEMIC: 'académic', CLINIC: 'clínic', ENERGETIC: 'energétic', MECANIC: 'mecánic', AUTOMATIC: 'automátic',
  TELEFONIC: 'telefónic', BIOLOGIC: 'biológic', ESPECIFIC: 'específic', CIENTIFIC: 'científic', UNIC: 'únic',
  ULTIM: 'últim', GEOGRAFIC: 'geográfic', FOTOGRAFIC: 'fotográfic', VEHICUL: 'vehícul', ARTICUL: 'artícul',
  CATALOG: 'catálog', KILOMETR: 'kilómetr', DEPOSIT: 'depósit', SOLID: 'sólid', LIQUID: 'líquid', ACID: 'ácid',
  NUMER: 'númer', OXIGEN: 'oxígen', ELECTROMECANIC: 'electromecánic', HISTORIC: 'históric', TURISTIC: 'turístic',
}
const ACCENT_WORDS: Record<string, string> = {
  ENERGIA: 'energía', LAVANDERIA: 'lavandería', PAPELERIA: 'papelería', FERRETERIA: 'ferretería', TUBERIA: 'tubería',
  CONSULTORIA: 'consultoría', INGENIERIA: 'ingeniería', CAFETERIA: 'cafetería', MENSAJERIA: 'mensajería',
  PAQUETERIA: 'paquetería', TELEFONIA: 'telefonía', CIRUGIA: 'cirugía', RADIOLOGIA: 'radiología', TECNOLOGIA: 'tecnología',
  TECNOLOGIAS: 'tecnologías', METODOLOGIA: 'metodología', AUDITORIA: 'auditoría', CARPINTERIA: 'carpintería',
  HERRERIA: 'herrería', JARDINERIA: 'jardinería', TOPOGRAFIA: 'topografía', FOTOGRAFIA: 'fotografía', DOSIMETRIA: 'dosimetría',
  BATERIA: 'batería', BATERIAS: 'baterías', ANALISIS: 'análisis', DIALISIS: 'diálisis', HEMODIALISIS: 'hemodiálisis',
  AREA: 'área', AREAS: 'áreas', ASI: 'así', TRAVES: 'través', AVALUO: 'avalúo', AVALUOS: 'avalúos', UTILES: 'útiles',
  LINEA: 'línea', LINEAS: 'líneas', VIA: 'vía', VIAS: 'vías', DIA: 'día', DIAS: 'días', MAIZ: 'maíz', AZUCAR: 'azúcar',
  JABON: 'jabón', CAFE: 'café', ATUN: 'atún', AMPULA: 'ámpula', AMPULAS: 'ámpulas', REGION: 'región', UNION: 'unión',
  CAMION: 'camión', CAMARA: 'cámara', CAMARAS: 'cámaras', GUIA: 'guía', GUIAS: 'guías', POLIZA: 'póliza', POLIZAS: 'pólizas',
  CARTON: 'cartón', ALGODON: 'algodón', PROTESIS: 'prótesis', BASCULA: 'báscula', BASCULAS: 'básculas',
  VALVULA: 'válvula', VALVULAS: 'válvulas', CAPSULA: 'cápsula', CAPSULAS: 'cápsulas', MOVIL: 'móvil', MOVILES: 'móviles',
  TRANSITO: 'tránsito', MAXIMO: 'máximo', MINIMO: 'mínimo', PROPOSITO: 'propósito', OPTIMO: 'óptimo', INDOLE: 'índole',
  ACCION: 'acción', ACCIONES: 'acciones', TERMINO: 'término', TERMINOS: 'términos', REGIMEN: 'régimen', ORGANO: 'órgano',
}
// Proper nouns a reader expects capitalised (states, large cities).
const TITLE_PLACES: Record<string, string> = Object.fromEntries((
  'México Oaxaca Puebla Sonora Jalisco Chiapas Tabasco Veracruz Campeche Hidalgo Morelos Guanajuato Zacatecas ' +
  'Durango Sinaloa Nayarit Colima Coahuila Chihuahua Tamaulipas Tlaxcala Aguascalientes Guerrero Yucatán Michoacán ' +
  'Querétaro Potosí Monterrey Guadalajara Mérida Cancún Acapulco Tijuana Toluca Morelia Culiacán Hermosillo Pachuca ' +
  'Villahermosa Chetumal Mexicali Saltillo Torreón Tepic Xalapa Cuernavaca Zapopan Juárez Quintana Roo ' +
  'León Tizayuca Coatzacoalcos Belisario Domínguez'
).split(' ').map((p) => [p.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(), p]))
const TITLE_PHRASES: Array<[RegExp, string]> = [
  'Nuevo León', 'Baja California Sur', 'Baja California', 'San Luis Potosí', 'Ciudad de México', 'Estado de México',
].map((p) => [new RegExp(`(?<![\\p{L}])${p}(?![\\p{L}])`, 'giu'), p])
const ROMAN = /^(?=[IVX]{2,}$)X{0,3}(IX|IV|V?I{0,3})$/
const ORDINAL = /^\d+(RA|DA|DO|ER|RO|TO|VO|NA|NO|MO|A|O)$/

function caseTitleWord(w: string): string {
  if (!/\p{L}/u.test(w)) return w
  const key = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const lower = w.toLowerCase()
  if (TITLE_SIGLAS.has(key) || ROMAN.test(w)) return w
  // single consonant (class "B", "S/N"), consonant-only sigla (SHCP, HGZ) — not a unit
  if (/^[A-Z]$/.test(w)) return /^[AEOUY]$/.test(w) ? lower : w
  if (/^[B-DF-HJ-NP-TV-Z]{2,6}$/.test(w) && !TITLE_UNITS.has(w)) return w
  if (/\./.test(w) && /^([A-Z]{1,2}\.)+[A-Z]{0,2}$/.test(w)) return w // S.A, C.V, U.S.A
  if (TITLE_PLACES[key]) return TITLE_PLACES[key]
  if (w !== key) return lower // already carries its accent
  if (ACCENT_WORDS[key]) return ACCENT_WORDS[key]
  if (/^[A-Z]{3,}[CS]ION$/.test(key)) return lower.slice(0, -3) + 'ión'
  const stem = key.match(/^(.+?)(OS|AS|O|A)$/)
  if (stem && ACCENT_STEMS[stem[1]]) return ACCENT_STEMS[stem[1]] + stem[2].toLowerCase()
  return lower
}

/**
 * Display casing for a contract title/description. ALL-CAPS text becomes
 * Spanish sentence case: siglas (IMSS, SHCP), roman numerals, procedure codes
 * (LA-012M7B997-E12-2024) and place names keep their capitals, and accents are
 * restored only where unambiguous (-CIÓN/-SIÓN + a small dictionary). Mixed-case
 * text is returned untouched. Never write the result back to data.
 */
export function formatContractTitle(raw: string | null | undefined): string {
  if (!raw) return ''
  if (!isShouty(raw)) return raw
  const out = raw.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok
    const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
    if (!m) return tok
    const [, pre, core, post] = m
    if (!core) return tok
    if (ORDINAL.test(core)) return pre + core.toLowerCase() + post
    // a short sigla spelled out in parentheses: «(SIMEF)»
    if (pre.endsWith('(') && post.startsWith(')') && /^\p{Lu}{2,8}$/u.test(core)) return tok
    if (/^M[23]$/.test(core)) return pre + core.toLowerCase() + post // m2 / m3
    // procedure / CCT codes: a digit and a letter in one token (COVID-19, 15DPR1477Q)
    if (/\d/.test(core) && /\p{L}/u.test(core)) return tok
    return pre + core.split(/([-/])/).map((w) => (w === '-' || w === '/' ? w : caseTitleWord(w))).join('') + post
  }).join('')
  const phrased = TITLE_PHRASES.reduce((s, [re, p]) => s.replace(re, p), out)
  return phrased.replace(/\p{L}/u, (c) => c.toUpperCase())
}

/** Source text of a field the API normaliser recased (kept as `<k>_raw`), else the field
 *  itself. CSV / exports use this so a download carries COMPRANET's original text. */
export function rawText(row: object, k: string): string {
  const r = row as Record<string, unknown>
  const v = r[`${k}_raw`] ?? r[k]
  return v == null ? '' : String(v)
}

// ── Institution names: «JAL-Secretaría de Salud» → «Secretaría de Salud · Jalisco» ──
// COMPRANET prefixes 2,218 of 4,415 state/municipal buyers with a state code.
// Only these codes count — «Pemex-Refinación» and «XE-IPN Canal 11» are federal.
export const STATE_PREFIXES: Record<string, string> = {
  AGS: 'Aguascalientes', BC: 'Baja California', BCS: 'Baja California Sur', CAMP: 'Campeche', CHIS: 'Chiapas',
  CHIH: 'Chihuahua', COAH: 'Coahuila', COL: 'Colima', CDMX: 'Ciudad de México', DGO: 'Durango', GTO: 'Guanajuato',
  GRO: 'Guerrero', HGO: 'Hidalgo', JAL: 'Jalisco', MEX: 'Estado de México', MICH: 'Michoacán', MOR: 'Morelos',
  NAY: 'Nayarit', NL: 'Nuevo León', OAX: 'Oaxaca', PUE: 'Puebla', QRO: 'Querétaro', QROO: 'Quintana Roo',
  SIN: 'Sinaloa', SLP: 'San Luis Potosí', SON: 'Sonora', TAB: 'Tabasco', TAMP: 'Tamaulipas', TAMPS: 'Tamaulipas',
  TLAX: 'Tlaxcala', VER: 'Veracruz', YUC: 'Yucatán', ZAC: 'Zacatecas',
}
const STATE_STATES = new Set(Object.values(STATE_PREFIXES))

/** Split a presented institution name into its own name and its state qualifier.
 *  Accepts the raw «JAL-…» form and the presented «… · Jalisco» form. */
export function splitInstitutionState(name: string): { name: string; state: string | null } {
  const pre = name.match(/^([A-Za-z]{2,5})\s*-\s*(\S.*)$/)
  if (pre && STATE_PREFIXES[pre[1].toUpperCase()]) return { name: pre[2], state: STATE_PREFIXES[pre[1].toUpperCase()] }
  const at = name.lastIndexOf(' · ')
  if (at > 0 && STATE_STATES.has(name.slice(at + 3))) return { name: name.slice(0, at), state: name.slice(at + 3) }
  return { name, state: null }
}

/** Display form of an institution name: cased, state prefix moved to a trailing
 *  «· Estado» qualifier. Federal names only get the casing. Idempotent. */
export function presentInstitutionName(raw: string | null | undefined): string {
  if (!raw) return ''
  const { name, state } = splitInstitutionState(raw.replace(/\s+/g, ' ').trim())
  const cased = toTitleCase(name)
  const body = cased.charAt(0).toUpperCase() + cased.slice(1)
  return state ? `${body} · ${state}` : body
}

/**
 * Clamp a page number to valid range
 */
export function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(page, Math.max(1, totalPages)))
}

/**
 * Calculate pagination range (start, end, clamped to total)
 */
export function getPaginationRange(
  page: number,
  perPage: number,
  total: number
): { start: number; end: number } {
  const clampedPage = clampPage(page, Math.ceil(total / perPage))
  const start = Math.min((clampedPage - 1) * perPage + 1, total)
  const end = Math.min(clampedPage * perPage, total)
  return { start: total > 0 ? start : 0, end }
}

/** Shallow copy of `obj` without `keys` (destructure-to-discard without unused bindings). */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const out = { ...obj }
  for (const k of keys) delete out[k]
  return out
}

/** Only http(s) URLs from data may become an href — a `javascript:` or `data:` URL
 *  in a source field would run on click (joker review 02 #14 / 07 #6). */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined
}

/** "12%" or «—» when the share is unknown (procedure type before 2011, DQ1 § 2) — never "—%". */
export function pctOrDash(v: number | null | undefined, digits = 0): string {
  return v == null ? '—' : `${v.toFixed(digits)}%`
}
