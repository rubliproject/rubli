/**
 * Our own grouping of the 72 spending categories by WHAT is bought (owner 11-05: «why sector? come up with categories of
 * our own», «no gray in the middle»). Sector says which ministry; a family says what kind of thing.
 * Eight families: the dataviz rule caps a categorical set at 8 hues (a 9th never gets a generated colour). The old grey
 * «Servicios» blob is split into «Mantenimiento y limpieza» and «Servicios y asesoría».
 * Colours: --color-fam-* tokens (index.css), their own validated palette — not the sector palette, no grey, no risk red.
 */
export type FamilyKey = 'salud' | 'obra' | 'mantenimiento' | 'servicios' | 'energia' | 'equipo' | 'comida' | 'personas'

export const FAMILIES: { key: FamilyKey; es: string; en: string; color: string }[] = [
  { key: 'salud', es: 'Salud', en: 'Health', color: 'var(--color-fam-salud)' },
  { key: 'obra', es: 'Obra', en: 'Building works', color: 'var(--color-fam-obra)' },
  { key: 'mantenimiento', es: 'Mantenimiento y limpieza', en: 'Upkeep and cleaning', color: 'var(--color-fam-mantenimiento)' },
  { key: 'servicios', es: 'Servicios y asesoría', en: 'Services and advice', color: 'var(--color-fam-servicios)' },
  { key: 'energia', es: 'Energía', en: 'Energy', color: 'var(--color-fam-energia)' },
  { key: 'equipo', es: 'Equipo y tecnología', en: 'Equipment and tech', color: 'var(--color-fam-equipo)' },
  { key: 'comida', es: 'Comida y suministros', en: 'Food and supplies', color: 'var(--color-fam-comida)' },
  { key: 'personas', es: 'Personas y viajes', en: 'People and travel', color: 'var(--color-fam-personas)' },
]

const MEMBERS: Record<FamilyKey, number[]> = {
  salud: [20, 21, 22, 23, 24, 25],
  obra: [26, 27, 28, 29, 52, 79, 80],
  mantenimiento: [30, 44, 63, 64, 88],
  servicios: [43, 49, 50, 51, 53, 60, 65, 66, 67, 68, 69, 70, 72, 73, 74, 89, 91],
  energia: [37, 38, 39, 40],
  equipo: [31, 32, 33, 34, 41, 46, 47, 48, 56, 61, 62, 81, 84, 86, 87, 92],
  comida: [45, 57, 58, 59, 75, 76, 85, 90, 93],
  personas: [42, 54, 55, 71, 77, 78, 82, 83],
}

const BY_ID = new Map<number, FamilyKey>(Object.entries(MEMBERS).flatMap(([k, ids]) => ids.map((id) => [id, k as FamilyKey])))

/** A category's family; anything new or unmapped reads as «Servicios y asesoría» until it is placed. */
export const familyOf = (categoryId: number): FamilyKey => BY_ID.get(categoryId) ?? 'servicios'
export const familyMeta = (k: FamilyKey) => FAMILIES.find((f) => f.key === k)!
/** For the test: every mapped id, once. */
export const MAPPED_IDS = Object.values(MEMBERS).flat()
