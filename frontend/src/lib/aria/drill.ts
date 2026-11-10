/**
 * Focos Rojos' descent (BACKLOG_FOCOS_ROJOS_VIZ, owner 2026-11-05: «click into a sector, then a vendor, then its
 * contracts, with a breadcrumb and a way back»). The level lives in the URL: ?sector= · ?v= · ?nivel=contratos.
 *   0 the sky · 1 a sector's constellation · 2 a vendor (its card) · 3 the vendor's contracts (El Archivo's rows)
 */
export type Level = 0 | 1 | 2 | 3

export const drillLevel = (o: { sector: number | null; vendor: boolean; nivel: string | null }): Level =>
  o.vendor ? (o.nivel === 'contratos' ? 3 : 2) : o.sector != null ? 1 : 0

/** The URL patch that climbs back up to `to` (a crumb, Esc). */
export function climb(to: Level): Record<string, null> {
  const p: Record<string, null> = {}
  if (to < 3) p.nivel = null
  if (to < 2) p.v = null
  if (to < 1) p.sector = null
  return p
}
