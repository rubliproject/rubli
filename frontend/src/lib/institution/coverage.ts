/**
 * «Cobertura CompraNet» — how much of an institution's purchasing the grade can see.
 * Beside the grade, never in it (proposals/coverage-badge.md). Low coverage is a
 * visibility fact, never a verdict: copy says what the grade cannot see, not that
 * anything is wrong.
 *
 * ratio = CompraNet contract value 2018–2024 ÷ SHCP Cuenta Pública «Pagado» in
 * operating expenses + direct physical investment. Ramo rows include their órganos
 * desconcentrados, so a secretariat's ratio is a lower bound.
 */
export type CoverageBand = 'alta' | 'parcial' | 'baja'

export interface CoverageInfo {
  ratio: number
  band: CoverageBand
  /** Secretariat vs its whole ramo budget (includes desconcentrados): true value is ≥ ratio. */
  lowerBound: boolean
  years?: [number, number] | null
}

type Lang = string
const en = (lang: Lang) => lang === 'en'

export function coveragePct(c: CoverageInfo): number {
  return Math.round(c.ratio * 100)
}

/** «31%», «al menos 31%», «≥100%». */
export function coverageValue(c: CoverageInfo, lang: Lang): string {
  if (c.ratio >= 1) return '≥100%'
  const pct = `${coveragePct(c)}%`
  if (c.lowerBound) return en(lang) ? `at least ${pct}` : `al menos ${pct}`
  return pct
}

export function coverageBandLabel(band: CoverageBand, lang: Lang): string {
  const es = { alta: 'alta', parcial: 'parcial', baja: 'baja' }[band]
  const eng = { alta: 'high', parcial: 'partial', baja: 'low' }[band]
  return en(lang) ? eng : es
}

/**
 * The badge's band word. A ratio ≥ 100% is not «alta»: contracts above the
 * paid budget slice mean consolidated buying, trusts or multi-year contracts
 * («Por pesos» spec §6; CAPUFE 922%, SAT 315%).
 */
export function coverageBandText(c: CoverageInfo, lang: Lang): string {
  if (c.ratio >= 1) return en(lang) ? 'consolidated purchases or trusts' : 'compras consolidadas o fideicomisos'
  return coverageBandLabel(c.band, lang)
}

/** The one-sentence reading. Never a verdict. */
export function coverageLine(c: CoverageInfo, lang: Lang): string {
  const years = c.years ? `${c.years[0]}–${c.years[1]}` : '2018–2024'
  const pct = coveragePct(c)
  if (c.ratio >= 1) {
    return en(lang)
      ? `Its CompraNet contracts exceed what it paid out for purchasing and works (${years}), usually a sign of consolidated buying for other agencies or multi-year contracts.`
      : `Sus contratos en CompraNet superan lo que pagó en compras y obra (${years}); suele indicar compras consolidadas para otras instituciones o contratos plurianuales.`
  }
  if (c.band === 'alta') {
    return en(lang)
      ? `CompraNet records about ${pct}% of what it paid out for purchasing and works (${years}): the grade sees most of what it buys.`
      : `CompraNet registra cerca de ${pct}% de lo que pagó en compras y obra (${years}): la calificación ve la mayor parte de lo que compra.`
  }
  if (c.band === 'parcial') {
    return en(lang)
      ? `CompraNet records about ${pct}% of what it paid out for purchasing and works (${years}): the grade sees only part of this institution's buying.`
      : `CompraNet registra cerca de ${pct}% de lo que pagó en compras y obra (${years}): la calificación ve sólo una parte de las compras de esta institución.`
  }
  return en(lang)
    ? `CompraNet records under a fifth of what it paid out for purchasing and works (${years}): the grade sees only a small part of this institution's buying. That is not a finding; it may buy under its own regime or outside CompraNet.`
    : `CompraNet registra menos de una quinta parte de lo que pagó en compras y obra (${years}): la calificación ve sólo una parte pequeña de las compras de esta institución. No es un hallazgo; puede comprar con un régimen propio o fuera de CompraNet.`
}

export function coverageLowerBoundNote(lang: Lang): string {
  return en(lang)
    ? 'The ramo budget also covers its órganos desconcentrados, which buy under their own units: true coverage is this or higher.'
    : 'El presupuesto del ramo incluye órganos desconcentrados que compran con unidad propia: la cobertura real es esta o mayor.'
}

export function coverageCaveat(lang: Lang): string {
  return en(lang)
    ? 'Compares contracts signed with spending paid (SHCP, Cuenta Pública). Multi-year contracts, consolidated purchases and inter-agency agreements move the figure. Not part of the grade.'
    : 'Compara contratos firmados con gasto pagado (SHCP, Cuenta Pública). Contratos plurianuales, compras consolidadas y convenios entre dependencias mueven la cifra. No forma parte de la calificación.'
}

/** One line for compact surfaces (El Tamiz drawer). */
export function coverageShort(c: CoverageInfo, lang: Lang): string {
  const head = en(lang) ? 'CompraNet coverage' : 'Cobertura CompraNet'
  const tail = c.ratio >= 1
    ? (en(lang) ? 'consolidated or multi-year buying' : 'compras consolidadas o plurianuales')
    : c.band === 'alta'
      ? (en(lang) ? 'the grade sees most of its buying' : 'la calificación ve la mayor parte de sus compras')
      : c.band === 'parcial'
        ? (en(lang) ? 'the grade sees only part of its buying' : 'la calificación ve sólo una parte de sus compras')
        : (en(lang) ? 'the grade sees only a small part of its buying' : 'la calificación ve sólo una parte pequeña de sus compras')
  if (c.ratio >= 1) return `${head}: ≥100% · ${coverageBandText(c, lang)}`
  return `${head}: ${coverageValue(c, lang)} (${coverageBandLabel(c.band, lang)}) · ${tail}`
}
