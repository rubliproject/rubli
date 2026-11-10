/**
 * filmData — the real series the film scenes draw. Every number here is on the platform:
 * YEARS from /api/v1/analysis/year-over-year (2026-10-03), the rest from the published
 * Newsroom stories. Scenes must not invent data points; if a value is not here or in the
 * narration, it is not drawn.
 */

/** One row per year of the federal record. 2004 is a hole in the source files (7 contracts). */
export const YEARS: { y: number; contracts: number; valueB: number; da: number | null; sb: number | null; hr: number }[] = [
  { y: 2002, contracts: 35988, valueB: 111.7, da: null, sb: null, hr: 7.65 },
  { y: 2003, contracts: 54269, valueB: 274.4, da: null, sb: null, hr: 9.61 },
  { y: 2004, contracts: 7, valueB: 0, da: null, sb: null, hr: 0 },
  { y: 2005, contracts: 56740, valueB: 287.1, da: null, sb: null, hr: 6.8 },
  { y: 2006, contracts: 59310, valueB: 261.0, da: null, sb: null, hr: 6.13 },
  { y: 2007, contracts: 53768, valueB: 440.8, da: null, sb: null, hr: 6.19 },
  { y: 2008, contracts: 53427, valueB: 415.5, da: null, sb: null, hr: 5.5 },
  { y: 2009, contracts: 45410, valueB: 468.8, da: null, sb: null, hr: 5.38 },
  { y: 2010, contracts: 41372, valueB: 393.2, da: null, sb: null, hr: 10.64 },
  // procedure type is coded for the whole year from 2011 — da (direct award %) and sb (single award %) start here
  { y: 2011, contracts: 122378, valueB: 281.1, da: 71.52, sb: 62.69, hr: 9.58 },
  { y: 2012, contracts: 165095, valueB: 409.1, da: 67.5, sb: 61.13, hr: 8.72 },
  { y: 2013, contracts: 175976, valueB: 419.0, da: 68.4, sb: 62.74, hr: 8.72 },
  { y: 2014, contracts: 193059, valueB: 577.1, da: 67.68, sb: 65.65, hr: 10.21 },
  { y: 2015, contracts: 216910, valueB: 537.8, da: 73.04, sb: 61.71, hr: 11.09 },
  { y: 2016, contracts: 227396, valueB: 466.5, da: 74.8, sb: 62.46, hr: 11.67 },
  { y: 2017, contracts: 225107, valueB: 617.9, da: 77.11, sb: 59.53, hr: 13.03 },
  { y: 2018, contracts: 190177, valueB: 445.0, da: 76.21, sb: 58.46, hr: 11.76 },
  { y: 2019, contracts: 193001, valueB: 352.3, da: 77.8, sb: 46.51, hr: 13.26 },
  { y: 2020, contracts: 158319, valueB: 509.1, da: 78.09, sb: 47.99, hr: 11.76 },
  { y: 2021, contracts: 200950, valueB: 496.6, da: 80.0, sb: 46.47, hr: 12.97 },
  { y: 2022, contracts: 186289, valueB: 573.6, da: 79.12, sb: 45.89, hr: 13.78 },
  { y: 2023, contracts: 168024, valueB: 407.2, da: 82.26, sb: 49.92, hr: 11.59 },
  { y: 2024, contracts: 141577, valueB: 411.1, da: 79.22, sb: 48.0, hr: 11.47 },
  // 2025 is partial: the feed froze on 28 September
  { y: 2025, contracts: 92574, valueB: 718.2, da: 68.24, sb: 40.3, hr: 11.19 },
]

/** The five administrations in the record. `hr` = share of the term's contracts scored high-risk (a risk indicator, not a verdict). */
export const TERMS = [
  { name: 'FOX', from: 2002, to: 2006, contracts: 206307, hr: 7.5, da: null as number | null, party: 'PAN' },
  { name: 'CALDERÓN', from: 2006, to: 2012, contracts: 481450, hr: 8.15, da: 69.21, party: 'PAN' },
  { name: 'PEÑA NIETO', from: 2012, to: 2018, contracts: 1228625, hr: 11.18, da: 73.1, party: 'PRI', valueT: 3.06 },
  { name: 'LÓPEZ OBRADOR', from: 2018, to: 2024, contracts: 1050552, hr: 12.53, da: 79.41, party: 'MORENA', valueT: 2.76 },
  { name: 'SHEINBAUM', from: 2024, to: 2025.75, contracts: 92631, hr: 11.18, da: 68.26, party: 'MORENA', partial: true },
] as const

/** Sector contracting, Peña Nieto (2013–18) → López Obrador (2019–24), billions of pesos. */
export const SECTOR_SHIFT = [
  { name: 'Infraestructura', en: 'Infrastructure', before: 1024.4, after: 559.7, pct: -45 },
  { name: 'Energía', en: 'Energy', before: 444.4, after: 67.9, pct: -85 },
  { name: 'Defensa', en: 'Defense', before: 56.4, after: 170.8, pct: 203 },
  { name: 'Salud', en: 'Health', before: 823.7, after: 1194.7, pct: 45 },
  { name: 'Gobernación', en: 'Interior', before: 85.1, after: 139.4, pct: 64 },
]

/** The army's share of all federal contracted value, % (years the story reports). */
export const SEDENA_SHARE = [{ y: 2018, v: 2.23 }, { y: 2021, v: 3.62 }, { y: 2022, v: 2.18 }, { y: 2024, v: 5.43 }]

/** The four pharmaceutical distributors: annual federal contracting 2003–2025, billions of pesos. */
export const BIG4_YEARS = Array.from({ length: 23 }, (_, i) => 2003 + i)
export const BIG4 = [
  { key: 'gf', name: 'Grupo Fármacos', totalB: 133.2, imssShare: 60.1, values: [0, 0, 0, 0, 1.07, 2.81, 2.01, 1.22, 4.93, 13.5, 14.94, 13.23, 13.31, 12.93, 19.94, 15.64, 17.64, 0, 0, 0, 0, 0, 0] },
  { key: 'maypo', name: 'Maypo', totalB: 86.2, imssShare: 50.5, values: [0.36, 0, 0.43, 1.04, 2.08, 1.62, 1.73, 1.42, 3.65, 5.85, 6.3, 4.69, 6.46, 4.57, 9.77, 10.05, 7.98, 4.17, 4.5, 3.87, 2.37, 2.86, 0.31] },
  { key: 'pisa', name: 'PISA', totalB: 55.4, imssShare: 72.2, values: [1.18, 0, 2.41, 0.56, 1.39, 0.73, 2.97, 0.29, 0.57, 1.25, 0.71, 0.94, 2.6, 0.96, 1.23, 0.47, 3.5, 6.42, 2.56, 3.77, 0.13, 0.67, 19.46] },
  { key: 'dimesa', name: 'Dimesa', totalB: 51.4, imssShare: 68.5, values: [0.01, 0, 0.02, 0, 0, 0, 0, 0.13, 0.86, 3.38, 4.56, 4.26, 5.66, 6.53, 7.4, 7.96, 7.51, 0.18, 0.24, 0.3, 0.24, 1.05, 1.09] },
] as const

/** Tenders in which each pair of the four appears together (5,285 in all). */
export const BIG4_SHARED: [string, string, number][] = [
  ['maypo', 'pisa', 1436], ['gf', 'maypo', 1258], ['gf', 'dimesa', 810], ['maypo', 'dimesa', 478], ['gf', 'pisa', 257], ['pisa', 'dimesa', 46],
]

/** The largest no-bid awards whose winner the scans name (El Apagón), millions of pesos. */
export const SCAN_ROSTER = [
  { name: 'PFIZER', mdp: 3146, note: 'BIRMEX · ART. 54 FR. XII' },
  { name: 'SERPROSEP', mdp: 2909, note: 'IMSS-BIENESTAR · ART. 54 FR. II' },
  { name: 'INSTRUMENTOS Y EQUIPOS FALCON', mdp: 2449, note: 'ISSSTE · ART. 54 FR. VII' },
]
