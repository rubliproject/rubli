/**
 * «El Relevo» v3 — palette and figures. Every figure is from RELEVO_v3.md § 1
 * (RUBLI_NORMALIZED.db, amount_mxn <= 1e11, record to 2025-09-28). Names are the
 * CompraNet strings exactly as published (uppercase, unaccented, legal suffix kept).
 * Hex lives here, outside lint:tokens' scan roots, as the film's palette authority.
 */

// TEMPLATE § 1.1 PALETTE_PAPER · accent = salud (CLAUDE.md sector 1)
export const C = {
  bg: '#f6f1e7',
  paperDeep: '#ece4d3',
  paperHi: '#fffdf8',
  ink: '#1e1b16',
  dim: '#70685c',
  rule: 'rgba(30,27,22,0.16)',
  shade: 'rgba(60,45,25,0.16)',
  light: 'rgba(255,214,150,0.22)',
  scrim: 'rgba(246,241,231,0.95)',
  salud: '#dc2626',
  saludSoft: 'rgba(220,38,38,0.85)',
  saludWash: 'rgba(220,38,38,0.10)',
  gfLight: 'rgba(220,38,38,0.38)',
  coin: '#c9a24a',
  coinDeep: '#a8822e',
  alert: '#dc2626',
} as const

export const SERIF = '"Playfair Display", Georgia, serif'
export const MONO = '"JetBrains Mono", Consolas, monospace'

export type Lang = 'en' | 'es'
export type Co = 'gf' | 'maypo' | 'pisa' | 'dimesa'

/** CompraNet name split into the name proper (Playfair) and the legal suffix (mono, dim). */
export const NAMES: Record<Co, { name: string; suffix: string; short: string; total: number }> = {
  gf: { name: 'GRUPO FARMACOS ESPECIALIZADOS,', suffix: 'S.A. DE C.V.', short: 'Grupo Fármacos Especializados', total: 133.2 },
  maypo: { name: 'FARMACEUTICOS MAYPO', suffix: 'S.A DE C.V', short: 'Farmacéuticos Maypo', total: 86.2 },
  pisa: { name: 'LABORATORIOS PISA,', suffix: 'S.A. DE C.V.', short: 'Laboratorios PISA', total: 55.4 },
  dimesa: {
    name: 'DISTRIBUIDORA INTERNACIONAL DE MEDICAMENTOS Y EQUIPO MEDICO,',
    suffix: 'S.A. DE C.V.',
    short: 'Dimesa',
    total: 51.4,
  },
}
export const ORDER: Co[] = ['gf', 'maypo', 'pisa', 'dimesa']

/** One strong colour per company, used on every plate, bar, line and disc (owner, Oct 14: "more colors").
 * GF keeps salud red (the subject and the alarm); fills only — text on them is paper or ink. */
export const CO_COLOR: Record<Co, string> = { gf: '#dc2626', maypo: '#1d4ed8', pisa: '#b45309', dimesa: '#0f766e' }
export const CO_WASH: Record<Co, string> = { gf: 'rgba(220,38,38,0.13)', maypo: 'rgba(29,78,216,0.13)', pisa: 'rgba(180,83,9,0.15)', dimesa: 'rgba(15,118,110,0.14)' }
/** IMSS gets its own colour: the seal, its waffle, its donut slice. */
export const IMSS_COLOR = '#6d28d9'
export const IMSS_WASH = 'rgba(109,40,217,0.12)'
/** Each company's IMSS contracts as % of everything IMSS contracted 2002–2025 (RELEVO § 1.1: total × IMSS share ÷ 1,818.4 B). Sums to 10.9. */
export const IMSS_PCT: Record<Co, number> = { gf: 4.4, maypo: 2.39, pisa: 2.2, dimesa: 1.94 }

/**
 * The close (factcheck/relevo_concentration.py, read-only): IMSS medicine contracts (category 1, 20),
 * per year — [year, top-4 vendor share %, GF %, Maypo %, PISA %, Dimesa %]. 2004 has no medicine rows
 * (Structure A gap) and is left out; 2002–2010 are the thinnest records.
 */
export const CONC: [number, number, number, number, number, number][] = [
  [2002, 25.2, 0, 1.78, 10.03, 0],
  [2003, 58.1, 0, 0.81, 3.5, 0.04],
  [2005, 26.2, 0, 3.01, 6.96, 0.05],
  [2006, 40.9, 0, 4.68, 2.46, 0.01],
  [2007, 31.9, 7.42, 4.35, 8.43, 0.0],
  [2008, 50.5, 9.15, 3.63, 2.54, 0],
  [2009, 24.1, 7.03, 5.28, 3.79, 0],
  [2010, 41.3, 13.44, 3.48, 2.73, 6.4],
  [2011, 44.6, 25.87, 7.08, 0.63, 5.61],
  [2012, 60.4, 34.95, 11.84, 0, 5.68],
  [2013, 56.5, 32.07, 10.31, 0, 6.44],
  [2014, 58.6, 23.19, 9.21, 0, 13.16],
  [2015, 52.5, 22.43, 10.06, 0, 13.18],
  [2016, 58.0, 27.02, 9.98, 0.0, 14.92],
  [2017, 59.9, 26.03, 11.2, 0, 13.56],
  [2018, 64.0, 28.33, 14.65, 0.0, 15.75],
  [2019, 50.7, 23.99, 11.16, 2.47, 12.23],
  [2020, 17.2, 0, 2.98, 5.09, 0],
  [2021, 21.5, 0, 4.9, 0.91, 0],
  [2022, 14.2, 0, 4.3, 3.91, 0],
  [2023, 16.6, 0, 5.4, 0.09, 0.01],
  [2024, 17.4, 0, 4.73, 0.33, 0.06],
  [2025, 17.7, 0, 0.05, 6.74, 0.0],
]

/** Yearly contracted amounts, B MXN, 2003..2019 (index 0 = 2003). Missing years = 0. */
const Y0 = 2003
const yr = (m: Record<number, number>) => Array.from({ length: 17 }, (_, i) => m[Y0 + i] ?? 0)
export const SERIES: Record<Co, number[]> = {
  gf: yr({ 2007: 1.07, 2008: 2.81, 2009: 2.01, 2010: 1.22, 2011: 4.93, 2012: 13.5, 2013: 14.94, 2014: 13.23, 2015: 13.31, 2016: 12.93, 2017: 19.94, 2018: 15.64, 2019: 17.64 }),
  maypo: yr({ 2003: 0.36, 2005: 0.43, 2006: 1.04, 2007: 2.08, 2008: 1.62, 2009: 1.73, 2010: 1.42, 2011: 3.65, 2012: 5.85, 2013: 6.3, 2014: 4.69, 2015: 6.46, 2016: 4.57, 2017: 9.77, 2018: 10.05, 2019: 7.98 }),
  pisa: yr({ 2003: 1.18, 2005: 2.41, 2006: 0.56, 2007: 1.39, 2008: 0.73, 2009: 2.97, 2010: 0.29, 2011: 0.57, 2012: 1.25, 2013: 0.71, 2014: 0.94, 2015: 2.6, 2016: 0.96, 2017: 1.23, 2018: 0.47, 2019: 3.5 }),
  dimesa: yr({ 2003: 0.01, 2005: 0.02, 2010: 0.13, 2011: 0.86, 2012: 3.38, 2013: 4.56, 2014: 4.26, 2015: 5.66, 2016: 6.53, 2017: 7.4, 2018: 7.96, 2019: 7.51 }),
}
export const SERIES_Y0 = Y0

/** GF yearly, B MXN, 2007..2020 (2020 = $582,920, two contracts in April). RELEVO § 1.2. */
export const GF_YEARS: [number, number][] = [
  [2007, 1.07], [2008, 2.81], [2009, 2.01], [2010, 1.22], [2011, 4.93], [2012, 13.5], [2013, 14.94],
  [2014, 13.23], [2015, 13.31], [2016, 12.93], [2017, 19.94], [2018, 15.64], [2019, 17.64], [2020, 0.00058292],
]
/** PISA yearly, B MXN, 2002..2025 (2004: no contracts on record; 2025 = Jan–Sep). RELEVO § 1.2. */
export const PISA_YEARS: [number, number][] = [
  [2002, 0.6], [2003, 1.18], [2004, 0], [2005, 2.41], [2006, 0.56], [2007, 1.39], [2008, 0.73], [2009, 2.97],
  [2010, 0.29], [2011, 0.57], [2012, 1.25], [2013, 0.71], [2014, 0.94], [2015, 2.6], [2016, 0.96], [2017, 1.23],
  [2018, 0.47], [2019, 3.5], [2020, 6.42], [2021, 2.56], [2022, 3.77], [2023, 0.13], [2024, 0.67], [2025, 19.46],
]
/** PISA 2025 by buyer, B MXN: IMSS 13.76 · IMSS-Bienestar 3.91 · ISSSTE 1.29 · the rest. RELEVO § 1.2. */
export const PISA_BUYERS = [
  { key: 'imss', label: { en: 'IMSS', es: 'IMSS' }, v: 13.76 },
  { key: 'bien', label: { en: 'IMSS-Bienestar', es: 'IMSS-Bienestar' }, v: 3.91 },
  { key: 'issste', label: { en: 'ISSSTE', es: 'ISSSTE' }, v: 1.29 },
  { key: 'rest', label: { en: 'others', es: 'otras' }, v: 0.5 },
] as const
/** 2019 → 2020, B MXN (RELEVO § 1.2): Dimesa −97.6%, Maypo −48%. */
export const DROPS = [
  { co: 'dimesa' as const, y19: 7.51, y20: 0.18, label: '−97%' },
  { co: 'maypo' as const, y19: 7.98, y20: 4.17, label: '−48%' },
]
export const GF_PEAK = 19.94
export const PISA_2025 = 19.46

/** On-screen strings that differ by language (narration lives in script.json / vo.json). */
export const T = {
  contracts2017: { en: 'FEDERAL CONTRACTS · 2017', es: 'CONTRATOS FEDERALES · 2017' },
  peak: { en: '19.9 B MXN', es: '19,900 MDP' },
  peakScope: { en: '1 company · 1 year', es: '1 empresa · 1 año' },
  four: { en: '326 B MXN', es: '326 mil millones' },
  fourScope: { en: 'the four · 2002–Sep 2025', es: 'las cuatro · 2002–sep 2025' },
  billions: { en: 'B MXN', es: 'mil millones' },
  imssRibbon: { en: 'IMSS · all contracts, 2002–2025', es: 'IMSS · todo lo contratado, 2002–2025' },
  oneInTen: { en: '1 / 10', es: '1 / 10' },
  oneInTenScope: { en: '10.9% of the amount IMSS contracted · 2002–2025', es: '10.9% del monto contratado por el IMSS · 2002–2025' },
  peakLine: { en: 'peak', es: 'máximo' },
  memo: { en: 'PRESIDENCY · ORDER', es: 'PRESIDENCIA · OFICIO' },
  memoRef: 'PRESIDENCIA-009/03/20/19',
  illegal: { en: 'ILLEGAL', es: 'ILEGAL' },
  sfp: { en: 'SFP · RESOLUTION', es: 'SFP · RESOLUCIÓN' },
  barred: { en: 'DISQUALIFIED', es: 'INHABILITADA' },
  sfpDate: { en: '15 · JUL · 2019', es: '15 · JUL · 2019' },
  twoYears: { en: '2 years', es: '2 años' },
  sfpSource: { en: 'SFP · resolution of 15 Jul 2019', es: 'SFP · resolución del 15 jul 2019' },
  cliffL: { en: '17.6 B MXN', es: '17,600 MDP' },
  cliffR: { en: '$582,920 · 2 contracts', es: '$582,920 · 2 contratos' },
  lastLeaf: { en: 'APR 2020', es: 'ABR 2020' },
  lastLeafSub: { en: 'last contract', es: 'último contrato' },
  noneSince: { en: 'no contracts since Apr 2020', es: 'sin contratos desde abr 2020' },
  books: [
    { en: 'HACIENDA · 2019', es: 'HACIENDA · 2019' },
    { en: 'UNOPS · 2020–2022', es: 'UNOPS · 2020–2022' },
    { en: 'BIRMEX · 2023–', es: 'BIRMEX · 2023–' },
  ],
  pisaHero: { en: '19.5 B MXN', es: '19,500 MDP' },
  pisaScope: { en: 'Jan–Sep 2025', es: 'ene–sep 2025' },
  gf2017: { en: 'Grupo Fármacos · 2017', es: 'Grupo Fármacos · 2017' },
  imss71: { en: '71% IMSS', es: '71% IMSS' },
  title: { en: 'The Relay', es: 'El Relevo' },
  source: {
    en: 'Source: CompraNet (federal contracts, 2002–Sep 2025) · SFP · press cited',
    es: 'Fuente: CompraNet (contratos federales, 2002–sep 2025) · SFP · prensa citada',
  },
} as const
