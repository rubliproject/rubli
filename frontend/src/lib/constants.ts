/**
 * Yang Wen-li Constants
 * Centralized configuration values
 * Build: 2026-05-04-v2
 */

// Sector Colors - matches CLAUDE.md spec exactly
export const SECTOR_COLORS: Record<string, string> = {
  salud: '#dc2626',
  educacion: '#3b82f6',
  infraestructura: '#ea580c',
  energia: '#eab308',
  defensa: '#1e3a5f',
  tecnologia: '#8b5cf6',
  hacienda: '#16a34a',
  gobernacion: '#be123c',
  agricultura: '#22c55e',
  ambiente: '#10b981',
  trabajo: '#f97316',
  otros: '#64748b',
} as const

/** El Mapa (Cifras + Vínculos skies, CYAN 2026-11-04): Salud is drawn rose, not crítico red, because on a map of
 *  risk dots red belongs to risk alone (DESIGN.md §6.2). Same red family, lighter and bluer: ΔE 42 from crítico
 *  #dc2626, 26 from Gobernación, 3.4:1 on white. Everywhere else Salud keeps #dc2626 (owner, DESIGN §6). */
export const MAPA_SALUD = '#e0607e'
export const MAPA_SECTOR_COLORS: Record<string, string> = { ...SECTOR_COLORS, salud: MAPA_SALUD }

// Darker variants of SECTOR_COLORS for use as TEXT FILL on light backgrounds.
// Each color shifted 2-3 steps darker on the Tailwind ladder so contrast on
// `--color-background` (#faf9f6 warm-white) reaches WCAG AA (≥4.5:1).
// USE FOR: <text> elements, <span> labels, anything reading as foreground type.
// DO NOT USE FOR: chart fills, large color swatches, decorative borders —
// those should keep using the vivid SECTOR_COLORS palette.
export const SECTOR_TEXT_COLORS: Record<string, string> = {
  salud:           '#991b1b',  // red-800 (was red-600 — passes AA)
  educacion:       '#1e40af',  // blue-800 (was blue-500 — passes AA)
  infraestructura: '#9a3412',  // orange-800 (was orange-600 — passes AA)
  energia:         '#854d0e',  // yellow-800 (was yellow-500 — 1.7:1 → 5.1:1)
  defensa:         '#1e3a5f',  // navy — already dark, keep
  tecnologia:      '#5b21b6',  // violet-800 (was violet-500 — passes AA)
  hacienda:        '#166534',  // green-800 (was green-600 — 2.9:1 → 5.5:1)
  gobernacion:     '#9f1239',  // rose-800 (was rose-700 — passes AA)
  agricultura:     '#166534',  // green-800 (was green-500 — 1.9:1 → 5.5:1)
  ambiente:        '#065f46',  // emerald-800 (was emerald-500 — 2.2:1 → 5.4:1)
  trabajo:         '#9a3412',  // orange-800 (was orange-500 — 2.5:1 → 5.1:1)
  otros:           '#475569',  // slate-600 (was slate-500 — passes AA)
} as const

/** Pick the AA-safe text color for a sector code (falls back to slate-600). */
export function getSectorTextColor(code: string): string {
  return SECTOR_TEXT_COLORS[code] ?? '#475569'
}

// English sector name translations for UI consistency
export const SECTOR_NAMES_EN: Record<string, string> = {
  salud: 'Health',
  educacion: 'Education',
  infraestructura: 'Infrastructure',
  energia: 'Energy',
  defensa: 'Defense',
  tecnologia: 'Technology',
  hacienda: 'Treasury',
  gobernacion: 'Governance',
  agricultura: 'Agriculture',
  ambiente: 'Environment',
  trabajo: 'Labor',
  otros: 'Other',
} as const

// Spanish sector name translations (proper case, with diacritics).
// Backend codes are normalised to lowercase ascii (`salud`, `educacion`,
// `gobernacion`) so `getSectorNameES` is what callers should use to render
// the user-facing label — never just `code.toUpperCase()` which drops accents
// and reads as a backend identifier.
export const SECTOR_NAMES_ES: Record<string, string> = {
  salud: 'Salud',
  educacion: 'Educación',
  infraestructura: 'Infraestructura',
  energia: 'Energía',
  defensa: 'Defensa',
  tecnologia: 'Tecnología',
  hacienda: 'Hacienda',
  gobernacion: 'Gobernación',
  agricultura: 'Agricultura',
  ambiente: 'Ambiente',
  trabajo: 'Trabajo',
  otros: 'Otros',
} as const

// Helper function to translate sector code to English name
export function getSectorNameEN(sectorCode: string): string {
  return SECTOR_NAMES_EN[sectorCode] || sectorCode
}

// Spanish counterpart — used by ARIA queue, vendor profiles, and any chip
// that previously called getSectorNameEN unconditionally.
export function getSectorNameES(sectorCode: string): string {
  return SECTOR_NAMES_ES[sectorCode] || sectorCode
}

/** Lang-aware sector label — pass the i18n language to pick ES or EN. */
export function getSectorName(sectorCode: string, lang: 'en' | 'es'): string {
  return lang === 'es' ? getSectorNameES(sectorCode) : getSectorNameEN(sectorCode)
}

// Sector metadata with professional colors
export const SECTORS = [
  { id: 1, code: 'salud', name: 'Salud', nameEN: 'Health', color: '#dc2626' },
  { id: 2, code: 'educacion', name: 'Educación', nameEN: 'Education', color: '#3b82f6' },
  { id: 3, code: 'infraestructura', name: 'Infraestructura', nameEN: 'Infrastructure', color: '#ea580c' },
  { id: 4, code: 'energia', name: 'Energía', nameEN: 'Energy', color: '#eab308' },
  { id: 5, code: 'defensa', name: 'Defensa', nameEN: 'Defense', color: '#1e3a5f' },
  { id: 6, code: 'tecnologia', name: 'Tecnología', nameEN: 'Technology', color: '#8b5cf6' },
  { id: 7, code: 'hacienda', name: 'Hacienda', nameEN: 'Treasury', color: '#16a34a' },
  { id: 8, code: 'gobernacion', name: 'Gobernación', nameEN: 'Governance', color: '#be123c' },
  { id: 9, code: 'agricultura', name: 'Agricultura', nameEN: 'Agriculture', color: '#22c55e' },
  { id: 10, code: 'ambiente', name: 'Ambiente', nameEN: 'Environment', color: '#10b981' },
  { id: 11, code: 'trabajo', name: 'Trabajo', nameEN: 'Labor', color: '#f97316' },
  { id: 12, code: 'otros', name: 'Otros', nameEN: 'Other', color: '#64748b' },
] as const

// Per-pattern accent colors — P1–P7 investigation typologies.
// Must match the PATTERN_COLORS in Patterns.tsx. Source of truth lives here.
// DESIGN §6.3: patterns draw from the categorical set C2…C8 by index.
// Red/amber are reserved for risk severity, so no pattern is red any more.
export const PATTERN_COLORS: Record<string, string> = {
  P1: '#2563eb',   // C2 blue — concentrated monopoly
  P2: '#0f9f8a',   // C3 teal — ghost companies
  P3: '#6d28d9',   // C4 violet — intermediaries
  P4: '#be185d',   // C5 magenta — kickbacks / bid rigging
  P5: '#0e8fb5',   // C6 cyan — bid rotation / overpricing
  P6: '#9a4a0a',   // C7 brown — institutional capture
  P7: '#64748b',   // C8 slate — budget dump
} as const

// DESIGN §6.3 — the ONE categorical set (marks) and its AA text twins.
// Series, legends, chips: pick by index; C1 ink is always the first series.
// Owner sampler pick 2026-10-28 «ajustados» (sampler c1…c8 = app C2…C8, C1; DESIGN.md §6.3).
export const CATEGORICAL = ['#000000', '#2563eb', '#0f9f8a', '#6d28d9', '#be185d', '#0e8fb5', '#9a4a0a', '#64748b'] as const
export const CATEGORICAL_TEXT = ['#000000', '#1d4ed8', '#115e59', '#5b21b6', '#9d174d', '#155e75', '#78350f', '#475569'] as const
// DESIGN §6.4 — sequential ramps, light → dark.
export const RAMP_INK = ['#ececec', '#bfbfbf', '#8c8c8c', '#444444', '#000000'] as const
/** Text on a dark canvas mark (labels painted inside filled bands). */
export const INK_ON_DARK = '#ffffff'
export const RAMP_RED = ['#fde8e8', '#f5b5b5', '#e57373', '#dc2626', '#991b1b'] as const
// DESIGN §6.4 — amount (money) intensity where red would read as risk: teal → blue → violet, lightness monotonic.
export const RAMP_AMOUNT = ['#ccebe6', '#6cc3bb', '#2a9bb8', '#3b5fd9', '#3b1a8f'] as const

// Case (scandal) fraud-type accent colors — the left-border / tag accent on the
// Case Library register. Keyed by `fraud_type` (FraudType union). Hoisted out of
// CaseLibrary.tsx (2026-06-10) so the Case Library and Case Dossier resolve the
// same accent from one source. CaseDossier currently derives its fraud accent
// from the sector palette / crimson fallback (it has no copy of this exact table)
// — when it is swept it can adopt CASE_FRAUD_TYPE_COLORS without a shape change.
// Apply via style={{ color / borderLeft / background }} at the use site — never
// as a className (hex-in-className is silently stripped).
export const CASE_FRAUD_TYPE_COLORS: Record<string, string> = {
  // DESIGN.md §6.3: the categorical set by index, most frequent types first
  // (live 2026-10-14), so the top six on /cases never share a hue; C8 = otros.
  overpricing: CATEGORICAL[0],
  bribery: CATEGORICAL[1],
  procurement_fraud: CATEGORICAL[2],
  invoice_fraud: CATEGORICAL[3],
  infrastructure_overrun: CATEGORICAL[4],
  ghost_company: CATEGORICAL[5],
  conflict_of_interest: CATEGORICAL[6],
  bid_rigging: CATEGORICAL[1],
  embezzlement: CATEGORICAL[2],
  monopoly: CATEGORICAL[3],
  emergency_fraud: CATEGORICAL[4],
  tender_rigging: CATEGORICAL[5],
  state_capture: CATEGORICAL[6],
  cartel_infiltration: CATEGORICAL[0],
  other: CATEGORICAL[7],
}

/** Resolve the Case Library fraud-type accent (falls back to the `other` slate). */
export function getCaseFraudColor(fraudType: string): string {
  return CASE_FRAUD_TYPE_COLORS[fraudType] ?? CASE_FRAUD_TYPE_COLORS.other
}

// Case legal-status styling — status dot, English fallback label, and AA-safe
// text color for the Case Library status line. Keyed by `legal_status`
// (LegalStatus union, plus an `unresolved` default). `dot` / `text` may be a hex
// OR a `var(--color-text-muted)` token for the neutral states (no green). The
// English `label` is a defaultValue only — the runtime label routes through
// i18n `legalStatuses.*`. Hoisted from CaseLibrary.tsx (2026-06-10); shaped so
// CaseDossier's legal-status callout could adopt it later.
export const CASE_LEGAL_STATUS_STYLE: Record<
  string,
  { dot: string; label: string; text: string }
> = {
  impunity: { dot: '#ef4444', label: 'IMPUNITY', text: '#fca5a5' },
  investigation: { dot: '#f59e0b', label: 'UNDER INVESTIGATION', text: '#fcd34d' },
  prosecuted: { dot: '#3b82f6', label: 'PROSECUTED', text: '#93c5fd' },
  convicted: { dot: '#22d3ee', label: 'CONVICTED', text: '#67e8f9' },
  acquitted: { dot: 'var(--color-text-muted)', label: 'ACQUITTED', text: 'var(--color-text-muted)' },
  dismissed: { dot: 'var(--color-text-muted)', label: 'DISMISSED', text: 'var(--color-text-muted)' },
  unresolved: { dot: 'var(--color-text-muted)', label: 'UNRESOLVED', text: 'var(--color-text-muted)' },
  ongoing: { dot: '#f59e0b', label: 'ONGOING', text: '#fcd34d' },
  settled: { dot: 'var(--color-text-muted)', label: 'SETTLED', text: 'var(--color-text-muted)' },
} as const

// Risk colors — Phase 1 canonical palette (no green for "low")
// Rationale: green overclaims safety on a corruption platform — use neutral zinc
// for the noise floor. Critical=red-500, high=amber-500, medium=amber-800, low=zinc-500.
export const RISK_COLORS = {
  // UI 1.0 (DESIGN.md §6): crítico #dc2626 · alto #d97706, matching the @theme tokens
  critical: '#dc2626',
  high: '#d97706',
  medium: '#a16207',
  low: '#71717a',
} as const

// AA-safe risk colours for TEXT / NUMERALS on the warm #faf9f6 page. RISK_COLORS
// are tuned for FILLS/bars/dots and fail WCAG AA as small coloured text
// (critical #ef4444 = 3.57:1, high #f59e0b = 2.04:1). Use these for any
// risk-coloured number/label; keep RISK_COLORS for fills, strokes, dots, bars.
/** Risk ink for type on the elevated plate paper (#f3f1ec): RISK_TEXT_COLORS
 *  high (#b45309, 4.45) and medium (#a16207, 4.36) clear 4.5:1 on white only.
 *  These amber-800 twins read 6.3 / 6.1 on the plate paper (PARALLAX D10). */
export const RISK_INK_ON_PLATE = {
  high: '#92400e',
  medium: '#854d0e',
} as const

export const RISK_TEXT_COLORS = {
  critical: '#b91c1c',  // red-700  (~5.9:1)
  high: '#b45309',      // amber-700 (passes AA)
  medium: '#854d0e',    // amber-900 twin (weekend F4): #a16207 read 4.36:1 on plate paper; this reads 6.5 page / 6.1 plate. Fill stays RISK_COLORS.medium.
  low: '#444444',       // = --color-text-muted (9.7 page / 8.2 plate, sampler 2026-10-28); zinc #71717a read 4.40 on plate (joker 08 #4)
} as const

/**
 * Text-safe twin of a mark colour (weekend D2). Sector and risk hexes are tuned
 * for fills and read 1.9–3.8:1 as type (energía #eab308 = 1.92); type set in one
 * of them takes the documented AA twin. Anything else passes through.
 */
const inkByMark = (): Record<string, string> => Object.fromEntries([
  // categorical first, so a sector hex that equals one (otros = slate) keeps its sector twin
  ...CATEGORICAL.map((hex, i) => [hex.toLowerCase(), CATEGORICAL_TEXT[i]]),
  ...Object.entries(SECTOR_COLORS).map(([code, hex]) => [hex.toLowerCase(), SECTOR_TEXT_COLORS[code] ?? hex]),
  [MAPA_SALUD, '#a3213f'], // El Mapa's rose Salud as type (≈ 7:1)
  ...(['critical', 'high', 'medium', 'low'] as const).map((k) => [RISK_COLORS[k].toLowerCase(), RISK_TEXT_COLORS[k]]),
  ...(['critical', 'high', 'medium', 'low'] as const).map((k) => [`var(--color-risk-${k})`, RISK_TEXT_COLORS[k]]),
  ['var(--color-accent)', 'var(--color-accent-text)'],
  ['#a06820', 'var(--color-accent-text)'],
])
let INK_BY_MARK = inkByMark()

/**
 * Night edition of the TS palettes (DESIGN.md §6.7). Charts paint these hexes inline (SVG fill,
 * canvas fillStyle, three.js, `${hex}33` alphas), so CSS tokens alone never reach them: the
 * day ink #000000 drew black on black. lib/theme.ts calls setPaletteEdition before any page module
 * evaluates, so every read — and every module-level copy — gets the edition's values. Values are
 * the index.css [data-theme=night] tokens; sector fills keep their hue (≥3:1 on #000 and #121212)
 * except Defensa navy → a light navy and Gobernación → rose-600; text twins ≥4.5:1 on both.
 */
const NIGHT = {
  CATEGORICAL: ['#ffffff', '#4d82f0', '#1aa892', '#8b6cf0', '#e0558f', '#1599b8', '#d97706', '#94a3b8'],
  CATEGORICAL_TEXT: ['#ffffff', '#7aa2ff', '#2dd4bf', '#a78bfa', '#f472b6', '#22d3ee', '#e0a46a', '#94a3b8'],
  RAMP_INK: ['#121212', '#3a3a3a', '#5c5c5c', '#b3b3b3', '#ffffff'],
  RAMP_RED: ['#3a1a1a', '#6b2222', '#b33a3a', '#f05252', '#fca5a5'],
  RAMP_AMOUNT: ['#12322e', '#1d6a62', '#2a9bb8', '#6f8ff0', '#c4b5fd'],
  SECTOR_COLORS: { defensa: '#8fb0e8', gobernacion: '#e11d48' } as Record<string, string>,
  SECTOR_TEXT_COLORS: {
    salud: '#f87171', educacion: '#60a5fa', infraestructura: '#fb923c', energia: '#eab308', defensa: '#8fb0e8',
    tecnologia: '#a78bfa', hacienda: '#4ade80', gobernacion: '#fb7185', agricultura: '#4ade80', ambiente: '#34d399',
    trabajo: '#fb923c', otros: '#94a3b8',
  } as Record<string, string>,
  RISK_COLORS: { critical: '#f05252', high: '#f5a524', medium: '#d4a72c', low: '#8b8680' },
  RISK_TEXT_COLORS: { critical: '#f05252', high: '#f2b35a', medium: '#d4a72c', low: '#b3b3b3' },
  RISK_INK_ON_PLATE: { high: '#f2b35a', medium: '#d4a72c' },
}
type Mutable = Record<string, string>
const DAY = {
  CATEGORICAL: [...CATEGORICAL], CATEGORICAL_TEXT: [...CATEGORICAL_TEXT], RAMP_INK: [...RAMP_INK], RAMP_RED: [...RAMP_RED],
  RAMP_AMOUNT: [...RAMP_AMOUNT], SECTOR_COLORS: { ...SECTOR_COLORS }, SECTOR_TEXT_COLORS: { ...SECTOR_TEXT_COLORS },
  RISK_COLORS: { ...RISK_COLORS } as Mutable, RISK_TEXT_COLORS: { ...RISK_TEXT_COLORS } as Mutable,
  RISK_INK_ON_PLATE: { ...RISK_INK_ON_PLATE } as Mutable,
  PATTERN_COLORS: { ...PATTERN_COLORS }, CASE_FRAUD_TYPE_COLORS: { ...CASE_FRAUD_TYPE_COLORS },
}
const fill = (arr: readonly string[], vals: readonly string[]) => (arr as string[]).splice(0, vals.length, ...vals)

/** Re-value the shared TS palettes in place for an edition (lib/theme.ts owns when). */
export function setPaletteEdition(e: 'day' | 'night') {
  const n = e === 'night'
  const cat = n ? NIGHT.CATEGORICAL : DAY.CATEGORICAL
  fill(CATEGORICAL, cat)
  fill(CATEGORICAL_TEXT, n ? NIGHT.CATEGORICAL_TEXT : DAY.CATEGORICAL_TEXT)
  fill(RAMP_INK, n ? NIGHT.RAMP_INK : DAY.RAMP_INK)
  fill(RAMP_RED, n ? NIGHT.RAMP_RED : DAY.RAMP_RED)
  fill(RAMP_AMOUNT, n ? NIGHT.RAMP_AMOUNT : DAY.RAMP_AMOUNT)
  Object.assign(SECTOR_COLORS, DAY.SECTOR_COLORS, n ? NIGHT.SECTOR_COLORS : {})
  Object.assign(SECTOR_TEXT_COLORS, n ? NIGHT.SECTOR_TEXT_COLORS : DAY.SECTOR_TEXT_COLORS)
  for (const s of SECTORS) (s as { color: string }).color = SECTOR_COLORS[s.code]
  Object.assign(RISK_COLORS, n ? NIGHT.RISK_COLORS : DAY.RISK_COLORS)
  Object.assign(RISK_TEXT_COLORS, n ? NIGHT.RISK_TEXT_COLORS : DAY.RISK_TEXT_COLORS)
  Object.assign(RISK_INK_ON_PLATE, n ? NIGHT.RISK_INK_ON_PLATE : DAY.RISK_INK_ON_PLATE)
  // tables built from the categorical set follow it by slot
  const slot = (hex: string) => { const i = DAY.CATEGORICAL.indexOf(hex as never); return i < 0 ? hex : cat[i] }
  for (const [k, v] of Object.entries(DAY.PATTERN_COLORS)) (PATTERN_COLORS as Mutable)[k] = slot(v)
  for (const [k, v] of Object.entries(DAY.CASE_FRAUD_TYPE_COLORS)) CASE_FRAUD_TYPE_COLORS[k] = slot(v)
  INK_BY_MARK = inkByMark()
}
/** `onPlate`: type on the elevated plate paper (#f3f1ec) takes the RISK_INK_ON_PLATE twins for high/medium (weekend D4). */
export const textInk = (color: string, onPlate = false): string => {
  const c = color.toLowerCase()
  if (onPlate) {
    if (c === RISK_COLORS.high.toLowerCase() || c === 'var(--color-risk-high)') return RISK_INK_ON_PLATE.high
    if (c === RISK_COLORS.medium.toLowerCase() || c === 'var(--color-risk-medium)') return RISK_INK_ON_PLATE.medium
  }
  return INK_BY_MARK[c] ?? color
}

// Procurement-integrity reference lines — the SINGLE source. Never retype these
// per section (the 25%/30% same-metric contradiction on /vendors/:id came from
// doing exactly that). See docs/WEBSITE_STANDARDS.md anti-pattern A7.
//
// The direct-award line comes from the European Commission's Single Market
// Scoreboard: a direct-award share at or above 10% is rated unsatisfactory. Its
// single-BIDDER line (20%) is NOT drawn: CompraNet records winners, not bidders,
// so RUBLI's single-award rate is a different metric (D20, chair-plan C7). The "OECD 25-30%
// ceiling" these constants used to carry could not be traced to any published
// OECD instrument (QC pass, Sep 2026) — the OECD's 2023 framework lists
// indicators without stating thresholds.
// Last contract year in the data (ComprasMX 2026 rows are scored and in the atlas). Chart/filter upper
// bounds read this; copy about the CompraNet freeze (28-sep-2025) does not.
export const DATA_LAST_YEAR = 2026

// The US DOJ/FTC Horizontal Merger Guidelines call a market with an HHI at or
// above 2,500 highly concentrated. /captura and /network both drew this line;
// it lives here so they cannot drift apart.
export const HHI_CONCENTRATED = 2500

export const EU_DIRECT_AWARD_LIMIT = 0.10

/**
 * Single-award share of COMPETITIVE procedures, from two all-contract shares
 * (sb / total ÷ (1 − da / total)). Sector stats divide single_bid by every
 * contract; the label and the EU line are defined on competitive procedures (D20).
 */
export function singleAwardOfCompetitive(sbPctOfAll: number, daPctOfAll: number): number
export function singleAwardOfCompetitive(sbPctOfAll: number | null | undefined, daPctOfAll: number | null | undefined): number | null
export function singleAwardOfCompetitive(sbPctOfAll: number | null | undefined, daPctOfAll: number | null | undefined): number | null {
  // unknown before 2011 (no procedure type, DQ1 § 2) stays unknown
  if (sbPctOfAll == null || daPctOfAll == null) return null
  const comp = 100 - daPctOfAll
  return comp > 0 ? Math.min(100, (sbPctOfAll / comp) * 100) : 0
}
// v0.9.2 high+critical share of scored contracts: /executive/summary risk.high_risk_rate = 9.9
// (prod 2026-10-28, after the display squash — levels unchanged, docs/SCORING.md § Display score).
export const MODEL_HR_BASELINE = 0.099

/** CompraNet's bulk feed froze on 2025-09-28; ComprasMX open data (93% federal agencies, 7% states and
 *  municipalities spending federal money) carries the record on to DATA_CUT_ISO, so the last year is partial. */
export const PARTIAL_YEAR_NOTE = { en: '2026 partial (to the cut-off)', es: '2026 parcial (al corte)' } as const
/** Last year with data and the cut date — a data filter never promises years past it. */
export const DATA_CUT_YEAR = 2026
/** INEGI INPC deflators, base 2024 = 1 (annual means; 2026 = Jan–Sep) — the same table as backend
 *  executive.py INPC_DEFLATORS / precompute_stats.py / precompute_sexenio_actual.py. A year missing here
 *  is printed as nominal pesos, never invented. */
/** The site's money is in pesos of the year each contract was signed (as CompraNet publishes it); only the
 *  sexenio comparisons deflate to 2024 pesos (INPC_2024). Printed beside multi-year totals and charts (owner 11-06). */
export const NOMINAL_NOTE = {
  es: 'Pesos de cada año, sin ajustar por inflación.',
  en: 'Pesos of each year, not adjusted for inflation.',
} as const
export const INPC_2024: Readonly<Record<number, number>> = {
  2002: 0.382, 2003: 0.404, 2004: 0.420, 2005: 0.442, 2006: 0.456, 2007: 0.475, 2008: 0.493, 2009: 0.525,
  2010: 0.544, 2011: 0.567, 2012: 0.586, 2013: 0.607, 2014: 0.632, 2015: 0.658, 2016: 0.671, 2017: 0.694,
  2018: 0.741, 2019: 0.777, 2020: 0.799, 2021: 0.824, 2022: 0.885, 2023: 0.955, 2024: 1.0, 2025: 1.038, 2026: 1.072,
}
/** The day the source changes: CompraNet ends, ComprasMX begins. A seam, not a gap. */
export const SOURCE_SWITCH_ISO = '2025-09-28'
/** Institution grades v3 are a frozen calibration whose windows end 2025-09-27 (compute_institution_grades_v3). */
export const GRADES_LAST_YEAR = 2025
/** Public dataset release 2026.11 on Zenodo, published 2026-10-27 (the record says CC BY 4.0; RUBLI's licence from
 *  2026-10-28 is CC BY-NC 4.0, owner decision — the next release carries it). 2026.10 = 10.5281/zenodo.23209798. */
export const DATASET_VERSION = '2026.11'
export const DATASET_DOI = '10.5281/zenodo.23694198'
/** The site's cut-off: build-time fallback for useDataCut() (/stats/data-cut); bump with each weekly refresh. */
export const DATA_CUT_ISO = '2026-11-01'
/** What release 2026.11 holds (its MANIFEST.json on Zenodo, read 2026-10-28): frozen with the release,
 *  unlike the live register the API counts. Update together with DATASET_VERSION / DATASET_DOI. */
export const DATASET_RELEASE = {
  contracts: 3_177_987, cutIso: '2026-10-17', tables: 113, csvTables: 33, dbBytes: 5_380_792_320, liteBytes: 418_004_992, csvZipBytes: 69_719_879,
} as const
/** Longform stories + newsroom are off for the Nov 2026 launch (owner 2026-10-26): routes redirect to /,
 *  nav/sitemap drop them. Flip to true to republish; the content stays in story-content.ts. */
export const STORIES_LIVE = false
/** «El apagón» (/gap + the dossiers' «Después del apagón» sections) retired 2026-10-27 (owner): the ComprasMX
 *  contracts are in the scored corpus, so the post-CompraNet slice only repeated them. Flip to republish. */
export const GAP_LIVE = false
/** La Galería films are off until launch (owner 2026-10-29: «they're not finished whatsoever»): /gallery,
 *  /gallery/:slug and /registro redirect to /, nav/sitemap/⌘K drop them. Flip to true to republish; the film code stays. */
export const FILMS_LIVE = false
/** «A destiempo» (/antes-del-fallo, incl. «El mismo día» at /mismo-dia) is off for launch (owner 2026-11-04):
 *  routes redirect to /, nav/sitemap drop it. Flip to true to republish; the page code stays. */
export const FALLO_LIVE = false
/** «El rastreo de un peso» (/rastro, /rastro/registro) is off for launch (owner 2026-11-04): routes redirect to
 *  /gasto-a-ciegas, nav/sitemap/the money-path ladder drop it. Flip to true to republish; the page code stays. */
export const RASTRO_LIVE = false
/** First full year COMPRANET codes procedure type (direct award vs tender); before it the share reads ~0. */
export const PROCEDURE_TYPE_FIRST_YEAR = 2011

// Active risk model version (fallback — Dashboard fetches live from /analysis/model/metadata)
export const CURRENT_MODEL_VERSION = 'v0.9.2'
// v0.9.2 forward-chained vendor-year AUC (train on earlier years, test on the next, 2019–2025; as-of
// features) with its 95% CI and the size-controlled AUC — _v10/RESULT_2.md + rematch_result.json.
// A different metric from v0.9.1's 0.852 gold hold-out: never print the two as comparable.
export const MODEL_AUC = '0.827'
export const MODEL_AUC_CI = '0.763–0.883'
export const MODEL_AUC_SIZE = '0.741'
export const MODEL_AUC_LABEL = { es: 'AUC encadenado hacia adelante', en: 'Forward-chained AUC' } as const
// v0.9.2 fits 17 as-of features; the live metadata counts the ones with a non-zero weight (FACTCHECK_V092 #16).
export const MODEL_FEATURES = 17

// Ground-truth case count fallback. The live count is served by
// `/api/v1/executive/summary` → `ground_truth.cases` and grows on every
// retraining cycle. Surfaces that aren't already loading the executive
// summary fall back to this snapshot so we don't ship a hardcoded "1,363"
// (Day 1 audit Fix B caught the homepage hero; this constant covers the
// remaining 4 surfaces — CaseDetail, Intersection, ModelTransparency,
// and the watchlist `caseDesc` JSON which uses {{count}} interpolation).
// Update on every retraining unless we wire `useGroundTruthCount()` (v1.1).
export const GROUND_TRUTH_CASE_COUNT_FALLBACK = 1417

// Ground-truth vendor count fallback (vendors linked to ≥1 GT case).
// Same fallback contract as GROUND_TRUTH_CASE_COUNT_FALLBACK — updates
// on each retraining and is referenced by methodology/intersection
// editorial copy. Live source: `/api/v1/executive/summary` →
// `ground_truth.vendors`.
export const GROUND_TRUTH_VENDOR_COUNT_FALLBACK = 1554

// Platform version (owner, 2026-10-13). The model version is shown separately.
export const PLATFORM_VERSION = '1.0'

// Build identifier — bump to force Vite content hash change and bust CDN/browser cache
export const BUILD_ID = '2026-11-10-rc7'

// Risk thresholds (calibrated under v0.6.5; preserved unchanged through v0.9.2
// retraining — medium was raised from 0.15→0.25 to make medium actionable)
// Rationale: at 0.15 threshold, 76.7% of contracts were "medium" — near-zero lift.
// At 0.25, medium is 26.8% of contracts (investigable) and low is 59.4% (noise floor).
// Structural FP vendors (pharma OEMs) capped at medium via DB risk_level override.
// v0.9.2 (Oct 22 2026): forward-chained AUC 0.827 [0.763, 0.883], size-controlled 0.741 (MODEL_AUC above).
// v0.9.1's gold hold-out 0.852 was inflated by look-ahead features (_v10/RESULT_2.md).
// SINGLE SOURCE OF TRUTH — all other files import from here
export const RISK_THRESHOLDS = {
  critical: 0.60, // Strongest similarity to known corruption patterns
  high: 0.40,     // Strong similarity to known corruption patterns
  medium: 0.25,   // Moderate similarity — actionable (was 0.15, changed v6.4)
  low: 0,         // Low similarity to known corruption patterns (noise floor)
} as const

/**
 * Canonical risk level classifier — v6.0 recalibrated thresholds.
 * ALL components must use this function (or import it via utils.ts).
 */
export function getRiskLevelFromScore(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= RISK_THRESHOLDS.critical) return 'critical'
  if (score >= RISK_THRESHOLDS.high) return 'high'
  if (score >= RISK_THRESHOLDS.medium) return 'medium'
  return 'low'
}

/**
 * Not yet scored: ComprasMX rows (source_structure 'E') load with risk_score
 * NULL and risk_model_version 'pending_score' until a model passes the gates
 * (owner, 2026-10-22). Render them as NO_RISK_LABEL — never 0, blank or «bajo».
 */
export const PENDING_SCORE_VERSION = 'pending_score'
export const NO_RISK_LABEL = { es: 'sin indicador de riesgo aún', en: 'no risk indicator yet' } as const

export function isUnscored(score: number | null | undefined, modelVersion?: string | null): boolean {
  return score == null || modelVersion === PENDING_SCORE_VERSION
}

/**
 * «Historial insuficiente» (house fix F3, _explore/investigation_desk_2026-10-28/06_biases.md § H1).
 * The indicator looks only at a vendor's contracts in earlier years; with fewer than
 * MIN_PRIOR_CONTRACTS of them it can barely rise (0.29% read high against ~12% of the rest).
 * The API sends `thin_history`; a LOW reading with it prints this label instead of «bajo».
 * The thresholds and the score are unchanged.
 */
export const MIN_PRIOR_CONTRACTS = 3
export const THIN_HISTORY_LABEL = { es: 'Historial insuficiente', en: 'Insufficient history' } as const
export const THIN_HISTORY_NOTE = {
  es: `El proveedor tenía menos de ${MIN_PRIOR_CONTRACTS} contratos previos: con tan poco historial el indicador casi no puede subir, así que un valor bajo no significa riesgo bajo.`,
  en: `The vendor had fewer than ${MIN_PRIOR_CONTRACTS} prior contracts: with so little history the indicator can barely rise, so a low value does not mean low risk.`,
} as const
/** The vendor-level reading (an average over its contracts). */
export const THIN_HISTORY_NOTE_VENDOR = {
  es: `La mayoría de sus contratos se calificó cuando tenía menos de ${MIN_PRIOR_CONTRACTS} contratos previos: con tan poco historial el indicador casi no puede subir, así que un promedio bajo no significa riesgo bajo.`,
  en: `Most of its contracts were scored when it had fewer than ${MIN_PRIOR_CONTRACTS} prior contracts: with so little history the indicator can barely rise, so a low average does not mean low risk.`,
} as const
/** A low reading from a vendor with too little history (higher levels still print as they are). */
export function isThinHistoryLow(score: number | null | undefined, thinHistory: boolean | null | undefined): boolean {
  return !!thinHistory && score != null && getRiskLevelFromScore(score) === 'low'
}

/** getRiskLevelFromScore for values that may be unscored: adds 'none'. */
export function getRiskLevelOrNone(score: number | null | undefined, modelVersion?: string | null): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  return score == null || modelVersion === PENDING_SCORE_VERSION ? 'none' : getRiskLevelFromScore(score)
}

/**
 * High-risk SHARE (% of contracts at high+critical, 0–100) → tier. A different
 * quantity from a score, so a different ladder: ≥ 20 critical · ≥ 12 high ·
 * ≥ 5 medium · else low — set against the v0.8.5 HR baseline of 11% (v0.9.1: 9.9%)
 * (MODEL_HR_BASELINE): "high" starts just above the baseline, "critical" near
 * twice it. The one ladder for aggregate HR% (category seal + stat strip,
 * sector hero); do not inline `hrPct >= 20` copies.
 */
export function getHighRiskShareLevel(pct: number): 'critical' | 'high' | 'medium' | 'low' {
  if (pct >= 20) return 'critical'
  if (pct >= 12) return 'high'
  if (pct >= 5) return 'medium'
  return 'low'
}

/**
 * Canonical risk → color ramp. SINGLE SOURCE OF TRUTH for "color a risk value".
 *
 * Charts MUST use this instead of inline `if (score < x) return green` ladders.
 * The 2026-05-29 chart audit found charts routing risk tiers through the SECTOR
 * palette (sector-hacienda / sector-agricultura), painting "low risk" GREEN —
 * a Bible §3.10 absolute-rule violation (a procurement-only model cannot certify
 * integrity). This helper guarantees low → neutral zinc, never green.
 *
 * @param score 0–1 risk score
 * @returns a RISK_COLORS hex (apply via style={{ color/fill }}, NOT className)
 */
export function riskRamp(score: number): string {
  return RISK_COLORS[getRiskLevelFromScore(score)]
}

/**
 * Risk ramp keyed off a percentage (0–100). Convenience for charts whose data
 * is already in percentage terms AND genuinely represents a risk score. Do NOT
 * use for a non-risk rate (e.g. direct-award %) — that would imply low rate = safe.
 */
export function riskRampFromPct(pct: number): string {
  return riskRamp(pct / 100)
}

// Data validation thresholds (CLAUDE.md spec)
export const MAX_CONTRACT_VALUE = 100_000_000_000  // 100B MXN - reject above this
export const FLAG_THRESHOLD = 10_000_000_000       // 10B MXN - flag for review

// Risk thresholds (v3.3 - preserved for reference/comparison)
export const RISK_THRESHOLDS_V3 = {
  critical: 0.50,
  high: 0.35,
  medium: 0.20,
  low: 0,
} as const





