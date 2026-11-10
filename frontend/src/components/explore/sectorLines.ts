// El Índice sector lines (elmapa-2026-10-05 § Z0). A line that ranks a sector
// against the others carries a `holds` check run on the live treemap rows: if the
// data no longer supports it, the row falls back to its descriptive tag. Lines
// without `holds` are sourced facts or descriptions, not rankings.
import type { TreemapSectorItem } from '@/api/types'

type Row = Pick<TreemapSectorItem, 'sector_code' | 'total_value_mxn' | 'critical_share_pct' | 'critical_risk_count'>
interface Line { es: string; en: string; holds?: (code: string, rows: Row[]) => boolean }

const topBy = (rows: Row[], key: (r: Row) => number) =>
  rows.reduce<Row | null>((best, r) => (best == null || key(r) > key(best) ? r : best), null)?.sector_code

const EDITORIAL_FINDINGS: Record<string, Line> = {
  salud: {
    es: 'Donde se concentra el riesgo crítico del país.',
    en: 'Where the country\'s critical-risk contracts concentrate.',
    holds: (c, rows) => topBy(rows, (r) => r.critical_risk_count) === c,
  },
  educacion: {
    es: 'La Estafa Maestra desvió 7.6 mil millones aquí.',
    en: 'Estafa Maestra diverted 7.6B MXN through this sector.',
  },
  energia: {
    es: 'Mayor gasto. Menor riesgo. La paradoja energética.',
    en: 'Biggest budget. Lowest risk. The energy paradox.',
    holds: (c, rows) => topBy(rows, (r) => r.total_value_mxn) === c
      && topBy(rows, (r) => -r.critical_share_pct) === c,
  },
  defensa: {
    es: 'SEDENA y SEMAR, bajo excepciones de seguridad nacional.',
    en: 'SEDENA and SEMAR, under national-security exceptions.',
  },
  tecnologia: {
    es: 'Software, telecomunicaciones y servicios de TI.',
    en: 'Software, telecom and IT services.',
  },
}

const DESCRIPTIVE_TAGS: Record<string, { es: string; en: string }> = {
  salud:           { es: 'IMSS · ISSSTE · medicamentos', en: 'IMSS · ISSSTE · medicines' },
  energia:         { es: 'PEMEX · CFE · SENER',          en: 'PEMEX · CFE · SENER' },
  infraestructura: { es: 'Obra pública · SCT · CAPUFE', en: 'Public works · SCT · CAPUFE' },
  hacienda:        { es: 'SHCP · SAT · admin. fiscal',  en: 'Treasury · SAT · fiscal admin' },
  gobernacion:     { es: 'SEGOB · seguridad · servicios', en: 'SEGOB · security · services' },
  agricultura:     { es: 'SADER · subsidios al campo',  en: 'SADER · rural subsidies' },
  ambiente:        { es: 'SEMARNAT · CONAGUA · parques', en: 'SEMARNAT · water · parks' },
  trabajo:         { es: 'STPS · justicia laboral',     en: 'STPS · labor justice' },
  otros:           { es: 'Sin clasificar · misceláneos', en: 'Unclassified · miscellaneous' },
}

/** The line under a sector's name in El Índice, or null. Ranking claims only when `rows` bear them out. */
export function sectorLine(code: string, rows: Row[], isEs: boolean): string | null {
  const f = EDITORIAL_FINDINGS[code]
  const pick = f && (!f.holds || f.holds(code, rows)) ? f : DESCRIPTIVE_TAGS[code]
  return pick ? (isEs ? pick.es : pick.en) : null
}
