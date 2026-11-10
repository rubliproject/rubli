/**
 * One short display name for an institution (owner 2026-11-03: «some don't even fit … it's horrible»).
 * Never invents: (1) its siglas from the data, (2) its short_name from the data (institutions.short_name,
 * branch data/institution-acronyms), (3) the small vetted map of published acronyms (`NAME_TO_SIGLAS_FALLBACK`,
 * superseded by the data), (4) else the cased name compacted by fixed rules — legal boilerplate
 * dropped, a repeated «del Estado de X» collapsed, standard abbreviations (Sría., Inst., Com. Nal., Univ.,
 * Hosp., Gob., Coord., Fid., Edo.) — for the caller to clamp
 * to one line with an ellipsis. `full` (the cased, untruncated name) goes in the title and the label.
 */
import { inferSiglasFromName } from '@/lib/entity/siglas'
import { presentInstitutionName, splitInstitutionState } from '@/lib/utils'

const END = String.raw`(?=\s*$)`
const LEGAL = new RegExp(String.raw`,?\s*(?:S\.\s?A\.(?:\s*de\s*C\.\s?V\.)?|A\.\s?C\.|S\.\s?C\.|S\.\s?N\.\s?C\.|I\.\s?B\.\s?D\.)` + END, 'i')
const ORGANO = /(?<!\p{L})(?:Organismo Público Descentralizado|Órgano(?: Administrativo)? Desconcentrado)(?:\s+del?)?\s*/giu
// only when the name is long: «Secretaría de Salud» stays whole
const ABBR: Array<[RegExp, string]> = [
  [/(?<!\p{L})Comisión Nacional(?!\p{L})/gu, 'Com. Nal.'],
  [/(?<!\p{L})Secretaría(?!\p{L})/gu, 'Sría.'],
  [/(?<!\p{L})Instituto(?!\p{L})/gu, 'Inst.'],
  [/(?<!\p{L})Universidad(?!\p{L})/gu, 'Univ.'],
  [/(?<!\p{L})Hospital(?!\p{L})/gu, 'Hosp.'],
  [/(?<!\p{L})Gobierno(?!\p{L})/gu, 'Gob.'],
  [/(?<!\p{L})Coordinación(?!\p{L})/gu, 'Coord.'],
  [/(?<!\p{L})Fideicomiso(?!\p{L})/gu, 'Fid.'],
  [/(?<!\p{L})del Estado de(?!\p{L})/gu, 'del Edo. de'],
]
const LONG = 28

/** The compaction rules alone (exported for the test). */
export function compactInstitutionName(cased: string): string {
  const { name, state } = splitInstitutionState(cased)
  let n = name.replace(ORGANO, '').replace(LEGAL, '').replace(/\s+/g, ' ').trim()
  // «… del Estado de Tabasco del Estado de Tabasco» → once
  n = n.replace(/(\bdel? Estado de [\p{L} ]+?)(?:\s+\1)+(?!\p{L})/giu, '$1')
  n = n.charAt(0).toUpperCase() + n.slice(1)
  if (n.length > LONG) for (const [re, to] of ABBR) n = n.replace(re, to)
  // the «· Estado» tail only when the name does not already say the state
  return state && !n.toLowerCase().includes(state.toLowerCase()) ? `${n} · ${state}` : n
}

export function institutionShortName(
  name: string | null | undefined, siglas?: string | null, shortName?: string | null,
): { short: string; full: string; isSiglas: boolean } {
  const full = presentInstitutionName(name)
  if (siglas?.trim()) return { short: siglas.trim(), full, isSiglas: true }
  if (shortName?.trim()) return { short: shortName.trim(), full, isSiglas: false }
  const sig = name ? inferSiglasFromName(name) : null
  if (sig) return { short: sig, full, isSiglas: true }
  return { short: compactInstitutionName(full), full, isSiglas: false }
}
