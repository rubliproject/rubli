/**
 * Entity name formatters — canonical per-type display logic.
 *
 * Per docs/SITE_SKELETON.md, every entity surface in RUBLI must format
 * names through the SAME function for its type. This kills the
 * "GRUPO FARMACOS ESPECIALIZADOS" vs "Grupo Fármacos Especializados"
 * vs "Grupo Fármacos…" inconsistency the audit found across 28 surfaces.
 */
import { formatVendorName } from '@/lib/vendor/formatName'
import { presentInstitutionName, splitInstitutionState } from '@/lib/utils'

export type EntityType =
  | 'vendor'
  | 'institution'
  | 'sector'
  | 'category'
  | 'case'
  | 'pattern'
  | 'network'
  | 'investigation'
  | 'story'

/**
 * Canonical truncation lengths (chars) per entity type per chip size.
 * xs = 16-char chip · sm = 24-char chip · md = 40-char chip · full = no truncation (list rows, panels)
 */
const TRUNCATE: Record<EntityType, { xs: number; sm: number; md: number; full: number }> = {
  vendor:        { xs: 16, sm: 24, md: 40,  full: 300 },
  institution:   { xs: 18, sm: 28, md: 48,  full: 300 },
  sector:        { xs: 12, sm: 18, md: 28,  full: 300 },
  category:      { xs: 18, sm: 28, md: 48,  full: 300 },
  case:          { xs: 18, sm: 28, md: 40,  full: 300 },
  pattern:       { xs: 12, sm: 16, md: 24,  full: 300 },
  network:       { xs: 16, sm: 24, md: 36,  full: 300 },
  investigation: { xs: 18, sm: 28, md: 40,  full: 300 },
  story:         { xs: 20, sm: 32, md: 48,  full: 300 },
}

/** Case an institution name for display. */
function formatInstitutionName(raw: string, max: number): string {
  if (!raw) return ''
  // toTitleCase owns the whole casing problem in one place: Spanish particles,
  // period-separated corporate suffixes, state prefixes and the ≤8-character
  // sigla guard. The local copy this replaced capitalised every space-separated
  // token, so "SECRETARÍA DE SALUD DEL ESTADO DE MÉXICO" printed "Secretaría De
  // Salud Del Estado De México"; and its `\b`-terminated suffix regex could
  // never match "S.A. DE C.V." (no word character follows the final period), so
  // that suffix fell through to the same naive pass as "S.a. De C.v.".
  // State/municipal buyers: «JAL-Secretaría de Salud» → «Secretaría de Salud · Jalisco»
  // (presentInstitutionName). The state survives truncation — twenty states
  // each have a «Secretaría de Salud».
  const cased = presentInstitutionName(raw)
  if (cased.length <= max) return cased
  const { name, state } = splitInstitutionState(cased)
  const tail = state ? ` · ${state}` : ''
  const budget = Math.max(max - tail.length, 12)
  if (name.length <= budget) return name + tail
  // Truncate at word boundary
  const cut = name.slice(0, budget - 1).replace(/\s+\S*$/, '')
  return cut + '…' + tail
}

function passthrough(raw: string, max: number): string {
  if (!raw) return ''
  if (raw.length <= max) return raw
  return raw.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

/**
 * Format an entity name for display at a given chip size.
 * One funnel for ALL entity name rendering across the platform.
 */
export function formatEntityName(
  type: EntityType,
  rawName: string | null | undefined,
  _size: 'xs' | 'sm' | 'md' | 'full' = 'sm', // kept for callers; no longer truncates
): string {
  if (!rawName) return ''
  // owner 11-07: never cut a name with «…» — every size prints it whole (the table stays for reference)
  const max = TRUNCATE[type].full * 100
  switch (type) {
    case 'vendor':
      return formatVendorName(rawName, max)
    case 'institution':
      return formatInstitutionName(rawName, max)
    default:
      return passthrough(rawName, max)
  }
}
