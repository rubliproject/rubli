/**
 * Shared 5-tier transparency system.
 *
 * Single source of truth for the Excelente / Satisfactorio / Regular /
 * Deficiente / Critico tiers used by InstitutionLeague, the institution
 * dossier and ReportCard.
 *
 * Backend still emits the 10-letter grade ladder (S/A/B+/B/C+/C/D/D-/F/F-);
 * `gradeToTierKey` collapses it for UI use. Labels are not stored here —
 * each consumer pulls them from i18n via `t('tiers.<key>')`.
 *
 * Pillar names and caps live in `lib/institution-pillars.ts` (the only
 * authoritative mapping — never re-declare them here or page-locally).
 */

export type TierKey =
  | 'Excelente'
  | 'Satisfactorio'
  | 'Regular'
  | 'Deficiente'
  | 'Critico'

export interface TierStyle {
  key: TierKey
  /** Mark colour — strokes, bands, borders, dots, tints. Not for text. */
  color: string
  /**
   * Text ink — the AA twin of `color` (PARALLAX D9 § Change 5). Measured
   * >= 4.5:1 on --color-background, --color-background-elevated and on the
   * tier's own `bg` tint over either paper. Use for any type in tier colour.
   */
  ink: string
  /** Background fill (rgba with low alpha). */
  bg: string
  /** Border color (rgba). */
  border: string
}

// Audit fix 2026-05-07 — Bible §3.10: a procurement-only model cannot
// certify integrity. Excelente was green (#16a34a) and Satisfactorio
// was teal (#0d9488); both read as "this institution is good" — exactly
// what the rule forbids on a corruption platform.
//
// Steel & Ember 2026-06-09 — the two top tiers were both flat slate gray
// which, alongside the gold brand accent and three amber data colors,
// made the page read gray+yellow on repeat. Moved them onto a deliberate
// STEEL BLUE: a cool, measured "no immediate red flag" tone that is
// emphatically not green (no integrity certification — §3.10 intact) and
// turns the ladder into a real cool→hot ramp (steel → steel → amber →
// orange → red). The warm escalation for Regular/Deficiente/Critico is
// unchanged.
export const TIER_STYLES: Record<TierKey, TierStyle> = {
  Excelente: {
    key: 'Excelente',
    color: '#3d5a80',  // steel blue (deep) — measured, not a certification
    // PARALLAX D9b § Change 8: the ink darkens toward L* 29 so Excelente and
    // Satisfactorio read as two inks in type (ΔE76 2.1 → 15.7).
    ink: '#2c4566',  // L* 28.8 · 9.28 page / 8.65 elevated / 8.02 tint
    bg: 'rgba(61,90,128,0.10)',
    border: 'rgba(61,90,128,0.32)',
  },
  Satisfactorio: {
    key: 'Satisfactorio',
    color: '#5e7fa8',  // steel blue (light) — one step up the cool ramp
    ink: '#466994',  // L* 43.6 · 5.38 page / 5.02 elevated / 4.81 tint (4.52 tint on elevated)
    bg: 'rgba(94,127,168,0.10)',
    border: 'rgba(94,127,168,0.32)',
  },
  Regular: {
    key: 'Regular',
    color: '#d97706',
    ink: '#9a4a0c',  // 5.94 / 5.54 / 4.91
    bg: 'rgba(217,119,6,0.12)',
    border: 'rgba(217,119,6,0.30)',
  },
  Deficiente: {
    key: 'Deficiente',
    color: '#ea580c',
    ink: '#a83c0e',  // 6.01 / 5.61 / 4.90
    bg: 'rgba(234,88,12,0.12)',
    border: 'rgba(234,88,12,0.30)',
  },
  Critico: {
    key: 'Critico',
    color: '#dc2626',
    ink: '#b91c1c',  // = RISK_TEXT_COLORS.critical — 6.15 / 5.73 / 4.80
    bg: 'rgba(220,38,38,0.12)',
    border: 'rgba(220,38,38,0.30)',
  },
}

// Night edition (DESIGN.md §6.7): lib/theme.ts sets data-theme before this module evaluates.
// The deep steel (#3d5a80, 2.97:1 on black) and the day inks (2.9–3.3:1) turn to light twins.
if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'night') {
  Object.assign(TIER_STYLES.Excelente, { color: '#6f8fbf', ink: '#9fb8e0', bg: 'rgba(111,143,191,0.14)', border: 'rgba(111,143,191,0.40)' })
  Object.assign(TIER_STYLES.Satisfactorio, { color: '#a3bde0', ink: '#c3d4ee', bg: 'rgba(163,189,224,0.12)', border: 'rgba(163,189,224,0.36)' })
  TIER_STYLES.Regular.ink = '#f2b35a'
  TIER_STYLES.Deficiente.ink = '#fb923c'
  TIER_STYLES.Critico.ink = '#f05252'
}

export const TIER_NAMES: readonly TierKey[] = [
  'Excelente',
  'Satisfactorio',
  'Regular',
  'Deficiente',
  'Critico',
] as const

/** Backend grades that collapse to each tier (for filter passthrough). */
export const TIER_GRADE_MAP: Record<TierKey, string[]> = {
  Excelente: ['S', 'A'],
  Satisfactorio: ['B+', 'B'],
  Regular: ['C+', 'C'],
  Deficiente: ['D', 'D-'],
  Critico: ['F', 'F-'],
}

/** Map any backend grade (S..F-) to the 5-tier key. */
export function gradeToTierKey(grade: string): TierKey {
  switch (grade) {
    case 'S':
    case 'A':
      return 'Excelente'
    case 'B+':
    case 'B':
      return 'Satisfactorio'
    case 'C+':
    case 'C':
      return 'Regular'
    case 'D':
    case 'D-':
      return 'Deficiente'
    case 'F':
    case 'F-':
    default:
      return 'Critico'
  }
}

// ── Mexican school scale (owner decision 2026-10-20, OWNER_LOG #11/#11b) ──────
// Institution grades read as the v3 score (0–100) ÷ 10, one decimal, plus a
// binary word: reprobada below 6.0, aprobada from 6.0. No A–F letter in any
// visible string. Colours stay on the graded bins (76 / 60 / 44 / 28 → 7.6 /
// 6.0 / 4.4 / 2.8) via TIER_STYLES + gradeToTierKey.
type GradeLang = 'es' | 'en'
/** Cut points on the 0–10 axis, ascending: tier floors for Critico … Excelente. */
export const GRADE_CUTS_10 = [2.8, 4.4, 6, 7.6] as const
export const PASS_MARK_10 = 6

/** «3.2» — score 0–100 → 0–10, one decimal. «—» when ungraded. */
export function gradeOutOf10(score: number | null | undefined): string {
  return score == null || Number.isNaN(score) ? '—' : (Math.round(score) / 10).toFixed(1)
}

/** Binary verdict on the displayed number (rounded first, so «6.0» is never «reprobada»). */
export function gradeWord(score: number | null | undefined, lang: GradeLang): string {
  const pass = score != null && !Number.isNaN(score) && Math.round(score) >= PASS_MARK_10 * 10
  return lang === 'es' ? (pass ? 'aprobada' : 'reprobada') : (pass ? 'passed' : 'failed')
}

/** «3.2 · reprobada». */
export function formatGrade(score: number | null | undefined, lang: GradeLang): string {
  return score == null || Number.isNaN(score) ? '—' : `${gradeOutOf10(score)} · ${gradeWord(score, lang)}`
}

/** «3.2 de 10» / «3.2 out of 10». */
export function gradeOfTen(score: number | null | undefined, lang: GradeLang): string {
  return score == null || Number.isNaN(score) ? '—' : `${gradeOutOf10(score)} ${lang === 'es' ? 'de 10' : 'out of 10'}`
}

/** Letter-only data (no score in the payload): the band the letter stands for. */
export function gradeBandFromLetter(letter: string | null | undefined, lang: GradeLang): string {
  if (!letter) return '—'
  const es = lang === 'es'
  const pass = es ? 'aprobada' : 'passed'
  const fail = es ? 'reprobada' : 'failed'
  switch (gradeToTierKey(letter)) {
    case 'Excelente': return `${es ? '7.6 o más' : '7.6 or more'} · ${pass}`
    case 'Satisfactorio': return `6.0–7.5 · ${pass}`
    case 'Regular': return `4.4–5.9 · ${fail}`
    case 'Deficiente': return `2.8–4.3 · ${fail}`
    default: return `${es ? 'menos de 2.8' : 'under 2.8'} · ${fail}`
  }
}

/** Letter → pass/fail word only (letter-only compact spots). */
export function gradeWordFromLetter(letter: string | null | undefined, lang: GradeLang): string {
  const t = letter ? gradeToTierKey(letter) : 'Critico'
  return gradeWord(t === 'Excelente' || t === 'Satisfactorio' ? 100 : 0, lang)
}

/** «3.2 de 10 · reprobada» — the full sentence form. */
export function formatGradeOfTen(score: number | null | undefined, lang: GradeLang): string {
  return score == null || Number.isNaN(score) ? '—' : `${gradeOfTen(score, lang)} · ${gradeWord(score, lang)}`
}

// ── Data-quality grades: plain words, never letters (owner 2026-10-20) ────────
// Backend letters are cut from the 0–100 quality score: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F below.
// A and B → alta, C → media, D and F (and anything lower) → baja.
export type DataQualityBand = 'high' | 'medium' | 'low'
export function dataQualityBand(grade: string | null | undefined): DataQualityBand {
  const g = (grade ?? '').trim().charAt(0).toUpperCase()
  return g === 'A' || g === 'B' || g === 'S' ? 'high' : g === 'C' ? 'medium' : 'low'
}
/** «alta» / «high». */
export function dataQualityLevel(grade: string | null | undefined, lang: GradeLang): string {
  const b = dataQualityBand(grade)
  return lang === 'es' ? { high: 'alta', medium: 'media', low: 'baja' }[b] : b
}
/** «calidad alta» / «high data quality». */
export function dataQualityWord(grade: string | null | undefined, lang: GradeLang): string {
  const l = dataQualityLevel(grade, lang)
  return lang === 'es' ? `calidad ${l}` : `${l} data quality`
}
/** The quality score → band, same cuts as the letters (alta ≥ 75, media ≥ 60). */
export const dataQualityLetterOf = (score: number): string => (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F')
