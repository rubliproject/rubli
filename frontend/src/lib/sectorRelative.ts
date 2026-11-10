/**
 * Sector-relative reading of the risk indicator (docs/BIAS_AUDIT_SECTOR_2026-11-09.md § 8 rec. 1–2).
 * The absolute score is not comparable across sectors (one global model; salud carries most labelled vendors),
 * so we say where a record sits within its own sector, and a sector's high+critical share is not a prevalence.
 */
type Lang = 'es' | 'en'

/** `sector_pct` = PERCENT_RANK within its sector (0 = lowest, 1 = highest); null → render nothing. */
export function sectorRankText(pct: number | null | undefined, lang: Lang): string | null {
  if (pct == null || !Number.isFinite(pct)) return null
  if (pct < 0.5) return lang === 'es' ? 'en la mitad baja de su sector' : 'in the lower half of its sector'
  const top = Math.max(1, Math.ceil((1 - pct) * 100 - 1e-9))
  return lang === 'es' ? `top ${top} % de su sector` : `top ${top}% of its sector`
}

/** One line under any sector-level high+critical share. */
export function prevalenceCaveat(sectorCode: string | null | undefined, lang: Lang): string {
  if (lang === 'en') {
    return sectorCode === 'salud'
      ? 'A risk indicator, not a prevalence; in health, many of the signals come from vendors already documented.'
      : 'A risk indicator, not a prevalence.'
  }
  return sectorCode === 'salud'
    ? 'Indicador de riesgo, no prevalencia; en salud, buena parte de las señales son de proveedores ya documentados.'
    : 'Indicador de riesgo, no prevalencia.'
}
