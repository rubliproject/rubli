/**
 * Static data for /administrations and its extracted helpers.
 *
 * Extracted from pages/Administrations.tsx (2026-05-11) so dossier-panel
 * and grade-card components can be split out of the page module without
 * circular imports.
 */
import { ADMINISTRATIONS as CANONICAL_TERMS, ADMIN_COLORS, type AdministrationKey } from '@/lib/administrations'
import type { DossierEntry, AdminMeta } from './types'
import { RISK_COLORS, DATA_LAST_YEAR } from '@/lib/constants'

/** First and last calendar years in the contract data (the last year is partial, still running). */
export const DATA_FIRST_YEAR = 2002
export { DATA_LAST_YEAR }

// Term years come from the canonical table (lib/administrations.ts, the same
// outgoing-president convention as backend/api/administrations.py): a year
// belongs to the president in office for most of it. `end` is inclusive.
export const TERM_KEY: Record<AdminMeta['name'], AdministrationKey> = {
  Fox: 'fox', Calderon: 'calderon', 'Pena Nieto': 'epn', AMLO: 'amlo', Sheinbaum: 'sheinbaum',
}
const term = (name: AdminMeta['name']) => {
  const t = CANONICAL_TERMS.find((a) => a.key === TERM_KEY[name])
  if (!t) throw new Error(`no canonical term for ${name}`)
  return { start: t.yearStart, end: t.yearEnd, dataStart: Math.max(t.yearStart, DATA_FIRST_YEAR) }
}

/** The 5 modern federal administrations covered by RUBLI's data window.
 *  `color` = the term's DESIGN.md §6.3 categorical hue (ADMIN_COLORS), never a party colour. */
export const ADMINISTRATIONS: readonly AdminMeta[] = [
  { name: 'Fox',        fullName: 'Vicente Fox Quesada',        ...term('Fox'),        color: ADMIN_COLORS.fox, party: 'PAN',    wikiArticle: 'Vicente_Fox_Quesada' },
  { name: 'Calderon',   fullName: 'Felipe Calderón Hinojosa',   ...term('Calderon'),   color: ADMIN_COLORS.calderon, party: 'PAN',    wikiArticle: 'Felipe_Calderón_Hinojosa' },
  { name: 'Pena Nieto', fullName: 'Enrique Peña Nieto',         ...term('Pena Nieto'), color: ADMIN_COLORS.epn, party: 'PRI',    wikiArticle: 'Enrique_Peña_Nieto' },
  { name: 'AMLO',       fullName: 'Andrés Manuel López Obrador', ...term('AMLO'),      color: ADMIN_COLORS.amlo, party: 'MORENA', wikiArticle: 'Andrés_Manuel_López_Obrador' },
  { name: 'Sheinbaum',  fullName: 'Claudia Sheinbaum Pardo',    ...term('Sheinbaum'),  color: ADMIN_COLORS.sheinbaum, party: 'MORENA', wikiArticle: 'Claudia_Sheinbaum' },
]

/** "1 contract" / "12,345 contracts" (ES "1 contrato" / "12,345 contratos"). */
export function contractCount(n: number, isEs: boolean): string {
  const num = n.toLocaleString(isEs ? 'es-MX' : 'en-US')
  if (isEs) return `${num} ${n === 1 ? 'contrato' : 'contratos'}`
  return `${num} ${n === 1 ? 'contract' : 'contracts'}`
}

/** Compact count for tight columns: 217,139 -> "217K" (ES "217 mil"). */
export function compactCount(n: number, isEs: boolean): string {
  if (n < 1000) return String(n)
  const k = n >= 100_000 ? Math.round(n / 1000) : Math.round(n / 100) / 10
  return isEs ? `${k.toLocaleString('es-MX')} mil` : `${k}K`
}

/**
 * Printed range of a term's data years: "2019–2024", short "2019–24"; a term
 * still running past the data horizon prints open-ended ("2025–").
 */
export function termRange(meta: AdminMeta, short = false): string {
  if (meta.end > DATA_LAST_YEAR) return `${meta.dataStart}–`
  return `${meta.dataStart}–${short ? String(meta.end).slice(2) : meta.end}`
}

/**
 * Display names with correct diacritics, keyed on the ASCII `name`
 * identifier. Single source of truth — the page, the matrix, and the
 * summary card all import this (2026-06-07; matrix previously rendered
 * raw ASCII "Calderon" / "Pena Nieto").
 */
export const ADMIN_DISPLAY_NAMES: Record<string, string> = {
  Fox: 'Fox',
  Calderon: 'Calderón',
  'Pena Nieto': 'Peña Nieto',
  AMLO: 'AMLO',
  Sheinbaum: 'Sheinbaum',
}

/** Severity → hex color for scandal badges. */
export const SEVERITY_COLORS = {
  critical: RISK_COLORS.critical,
  high:     RISK_COLORS.high,
  medium:   RISK_COLORS.medium,
}

export const DOSSIER_DATA: Record<string, DossierEntry> = {
  Fox: {
    contextKey: 'fox',
    topSectorKeys: ['energia', 'infraestructura', 'salud', 'defensa', 'educacion'],
  },
  Calderon: {
    contextKey: 'calderon',
    topSectorKeys: ['defensa', 'infraestructura', 'energia', 'salud', 'gobernacion'],
  },
  'Pena Nieto': {
    contextKey: 'pena_nieto',
    topSectorKeys: ['salud', 'infraestructura', 'educacion', 'energia', 'hacienda'],
  },
  AMLO: {
    contextKey: 'amlo',
    topSectorKeys: ['infraestructura', 'salud', 'energia', 'defensa', 'gobernacion'],
  },
  Sheinbaum: {
    contextKey: 'sheinbaum',
    topSectorKeys: ['infraestructura', 'salud', 'energia', 'educacion', 'gobernacion'],
  },
}
