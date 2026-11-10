/**
 * The «Contrato» shell's two navigation tiers (DESIGN.md §5): five groups in
 * the top bar, the active group's pages in the items row. Page names come from
 * the registry i18n (`nav:toc.<key>`) so the bar and the pages say the same name.
 */
import { useTranslation } from 'react-i18next'
import { FALLO_LIVE, FILMS_LIVE, GAP_LIVE, RASTRO_LIVE, STORIES_LIVE } from '@/lib/constants'

export type Lang = 'es' | 'en'

export function useLang(): Lang {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'es'
}

export interface NavGroup {
  id: 'descubrir' | 'investigar' | 'explorar' | 'analisis' | 'plataforma'
  label: { es: string; en: string }
  /** Each page: route + `nav:toc.<key>`. The first page is the group tab's target. */
  items: ReadonlyArray<{ href: string; key: string }>
  /** Route prefixes outside `items` that still belong to the group (dossiers, stories). */
  also: readonly string[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'descubrir', label: { es: 'Descubrir', en: 'Discover' },
    items: [{ href: '/', key: 'dashboard' }, { href: '/mapa', key: 'map' }, ...(STORIES_LIVE ? [{ href: '/journalists', key: 'newsroom' }] : []), ...(FILMS_LIVE ? [{ href: '/gallery', key: 'gallery' }] : [])],
    also: ['/atlas', '/mapa', '/stories', '/observatorio', '/observatory'],
  },
  {
    id: 'investigar', label: { es: 'Investigar', en: 'Investigate' },
    items: [{ href: '/aria', key: 'watchlist' }, { href: '/cases', key: 'cases' }, { href: '/contracts', key: 'archive' }, ...(FALLO_LIVE ? [{ href: '/antes-del-fallo', key: 'fallo' }] : []), { href: '/arranque', key: 'arranque' }],
    also: ['/vendors', '/investigation', '/thread', '/print'],
  },
  {
    id: 'explorar', label: { es: 'Explorar', en: 'Explore' },
    items: [{ href: '/categories', key: 'categories' }, { href: '/institutions', key: 'institutions' }],
    also: ['/network', '/explore', '/sectors'],
  },
  {
    id: 'analisis', label: { es: 'Análisis', en: 'Analysis' },
    // Sexenios first (owner 11-07): it is the analysis page, and the group tab's target
    items: [{ href: '/administrations', key: 'administrations' }, { href: '/captura', key: 'capture' }, { href: '/gasto-a-ciegas', key: 'noSeVe' }, ...(GAP_LIVE ? [{ href: '/gap', key: 'gap' }] : []), ...(RASTRO_LIVE ? [{ href: '/rastro', key: 'rastro' }] : [])],
    also: [],
  },
  {
    id: 'plataforma', label: { es: 'Plataforma', en: 'Platform' },
    items: [{ href: '/methodology', key: 'methodology' }, { href: '/datos', key: 'data' }, { href: '/press', key: 'press' }],
    also: ['/model', '/privacy', '/terms', '/settings'],
  },
]

/** One line per page for the K7 drop-downs: what the reader finds there. */
export const PAGE_BLURB: Record<string, { es: string; en: string }> = {
  dashboard: { es: 'Las cifras del gasto y la entrada a todo lo demás', en: 'The headline figures and the way in' },
  // 3,178,884 contracts — /api/v1/executive/summary headline.total_contracts, prod 2026-10-28
  map: { es: 'Cifras y vínculos de 3.18 millones de contratos', en: 'Figures and links across 3.18M contracts' },
  newsroom: { es: 'Historias publicadas, con sus fuentes', en: 'Published stories, with their sources' },
  gallery: { es: 'Películas cortas sobre los hallazgos de RUBLI', en: 'Short films on our findings' },
  watchlist: { es: 'Proveedores con más señales a la vez', en: 'Vendors with the most signals at once' },
  cases: { es: 'Expedientes documentados, con fuentes', en: 'Documented cases, with sources' },
  archive: { es: 'Busque cualquier contrato desde 2002', en: 'Search any contract since 2002' },
  fallo: { es: 'Contratos firmados antes del fallo o el mismo día: dos límites que marca la ley', en: 'Before the award, and on the same day: two lines the law draws' },
  arranque: { es: 'Empresas con 100 MDP o más en su primer año en CompraNet', en: 'Firms with 100M MXN or more in their first CompraNet year' },
  mismoDia: { es: 'Contratos bajo el tope, el mismo día, que juntos lo rebasan', en: 'Same-day contracts under the cap that together exceed it' },
  rastro: { es: 'Siga un peso de una institución hasta su contrato', en: 'Follow an institution’s peso down to its contract' },
  sectors: { es: 'Los 12 sectores del gasto federal', en: 'The 12 sectors of federal spending' },
  categories: { es: '72 categorías: qué se compra y a quién', en: '72 categories: what is bought, from whom' },
  institutions: { es: 'Una calificación para cada comprador', en: 'A grade for every buyer' },
  capture: { es: 'Proveedores que dependen de un solo comprador', en: 'Vendors living off a single buyer' },
  noSeVe: { es: 'El gasto federal que el público no puede ver', en: 'Federal spending the public cannot see' },
  administrations: { es: 'Cómo compró cada gobierno, 2002–2026', en: 'How each government bought, 2002–2026' },
  sexenioActual: { es: 'Lo que compra el gobierno actual, contra AMLO y Peña Nieto', en: 'What the current government buys, against AMLO and Peña Nieto' },
  gap: { es: 'Lo adjudicado después de CompraNet', en: 'What was awarded after CompraNet' },
  methodology: { es: 'Cómo se calcula el indicador de riesgo', en: 'How the risk indicator is built' },
  data: { es: 'Descargue el conjunto de datos completo', en: 'Download the full dataset' },
  press: { es: 'Materiales para periodistas', en: 'Materials for journalists' },
}

const under = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'))

/** Longest-prefix match over every group's pages and extra prefixes; Descubrir off the map. */
export function groupFor(pathname: string): NavGroup {
  const path = pathname.replace(/\/+$/, '') || '/'
  let best: { g: NavGroup; len: number } | null = null
  for (const g of NAV_GROUPS) {
    for (const href of [...g.items.map((i) => i.href), ...g.also]) {
      if (under(path, href) && (!best || href.length > best.len)) best = { g, len: href.length }
    }
  }
  return best?.g ?? NAV_GROUPS[0]
}
