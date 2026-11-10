/**
 * routeMeta.ts — per-route <title>, description, og:* and canonical (launch S1).
 *
 * Built from the registries: every TOC and OFF_NAV entry (names from
 * `nav:toc.*`), every published story (headline + subheadline), and the legal
 * pages. One honest sentence per page; risk copy is «indicador de riesgo».
 *
 * LIMIT: the site is an SPA. Social scrapers (X, Facebook, Slack, WhatsApp)
 * do not run JS and only ever read the static block in index.html; this map
 * reaches browsers (tab title, bookmarks) and JS-executing crawlers (Google).
 */
import { useLayoutEffect } from 'react'
import { DATA_LAST_YEAR } from '@/lib/constants'
import esNav from '@/i18n/locales/es/nav.json'
import enNav from '@/i18n/locales/en/nav.json'
import esCommon from '@/i18n/locales/es/common.json'
import enCommon from '@/i18n/locales/en/common.json'
import { TOC, OFF_NAV, entryFor } from '@/lib/nav/toc'
import { STORY_HEADLINES } from '@/lib/story-index'

export type MetaLang = 'es' | 'en'
export interface RouteMeta { title: string; description: string }
type Bilingual = Record<MetaLang, RouteMeta>

export const SITE_ORIGIN = 'https://rubli.xyz'
/** Crawlable but kept out of results (launch audit 2026-10-28 S4): a robots.txt Disallow hides the noindex
 *  from Google, and the bare URL still gets indexed from press links. nginx.conf $robots_tag sends the
 *  X-Robots-Tag; gen-head-shells marks the shell, gen-sitemap leaves these out. Keep the three in step. */
export const NOINDEX_PREFIXES = ['/aria', '/vendors/'] as const
const SUFFIX = ' · RUBLI'
export const MAX_TITLE = 60
export const MAX_DESCRIPTION = 160

/** Must equal the static block in index.html (a test holds them together). */
export const DEFAULT_META: Bilingual = {
  es: {
    title: 'RUBLI · Contratación pública federal de México',
    description: 'Indicadores de riesgo para 3.18 millones de contratos federales de México (2002–2026): adjudicaciones directas, proveedores e instituciones.',
  },
  en: {
    title: 'RUBLI · Mexican federal procurement',
    description: 'Risk indicators for Mexican federal contracts, 2002–2026: vendors, institutions, sectors and documented cases, with the method in plain view.',
  },
}

/** One sentence per registry key (`nav:toc.<key>`) plus the legal pages. */
const PAGE_DESCRIPTIONS: Record<string, Record<MetaLang, string>> = {
  map: {
    es: `El mapa de la contratación federal de México: doce sectores, sus instituciones y proveedores, con indicadores de riesgo de 2002 a ${DATA_LAST_YEAR}.`,
    en: `A map of Mexican federal procurement: twelve sectors, their institutions and vendors, with risk indicators from 2002 to ${DATA_LAST_YEAR}.`,
  },
  administrations: {
    es: 'Cómo contrató cada administración federal, de Fox a Sheinbaum: adjudicación directa, concentración e indicadores de riesgo por sexenio.',
    en: 'How each federal administration bought, from Fox to Sheinbaum: direct awards, concentration and risk indicators per term.',
  },
  gap: {
    es: 'Los procedimientos publicados después de que el flujo federal de CompraNet se congeló en septiembre de 2025, reconstruidos desde el portal.',
    en: "The procedures published after CompraNet's federal feed froze in September 2025, rebuilt from the successor portal.",
  },
  fallo: {
    es: 'Concursos federales que empezaron antes del fallo (ComprasMX 2025–2026) y contratos directos del mismo día justo bajo el tope del PEF (CompraNet 2019–2025).',
    en: 'Out of time: federal tenders that started before the award (ComprasMX 2025–2026), and same-day no-bid contracts just under the PEF cap (CompraNet 2019–2025).',
  },
  arranque: {
    es: 'Empresas que recibieron 100 MDP o más en los 365 días posteriores a su primer contrato federal registrado en CompraNet o ComprasMX (2011 al corte).',
    en: 'Firms that received 100M MXN or more in the 365 days after their first federal contract on record in CompraNet or ComprasMX (2011 to the cut-off).',
  },
  mismoDia: {
    es: 'Adjudicaciones directas del mismo día, cada una bajo el tope del PEF, que juntas lo rebasan (2019–2025). Indicios, no conclusiones.',
    en: 'Same-day direct awards, each under the federal budget cap, that together exceed it (2019–2025). Leads, not conclusions.',
  },
  rastro: {
    es: 'Siga el dinero de una institución federal: de cada peso, cuánto va a una categoría, a un proveedor y a un contrato citable.',
    en: "Follow a federal institution's money: of each peso, how much goes to a category, to a vendor and to a citable contract.",
  },
  capture: {
    es: 'Empresas que dependen de un solo comprador federal y compradores que dan la mitad de su gasto a una sola empresa, 2002–2025.',
    en: 'Companies that live off one federal buyer, and buyers that hand half their spending to a single supplier, 2002–2025.',
  },
  noSeVe: {
    es: 'El gasto federal que el público no puede ver: pagado sin contrato público. Cuenta Pública contra el registro. Mide visibilidad, no corrupción.',
    en: 'Federal spending the public cannot see: paid with no public contract. Public accounts against the register. Visibility, not corruption.',
  },
  cases: {
    es: 'Casos documentados de irregularidades en la contratación federal, con su fuente, los proveedores vinculados y el estado de cada expediente.',
    en: 'Documented procurement irregularity cases, with their source, the linked vendors and the status of each file.',
  },
  categories: {
    es: 'Qué compra el gobierno federal, a quién y a qué precio: categorías de gasto con indicadores de riesgo por categoría.',
    en: 'What the federal government buys, from whom and at what price: spending categories with risk indicators for each.',
  },
  sectors: {
    es: 'Los doce sectores del gasto federal (salud, energía, infraestructura y más) comparados por valor, competencia e indicadores de riesgo.',
    en: 'The twelve sectors of federal spending (health, energy, infrastructure and more) compared by value, competition and risk indicators.',
  },
  institutions: {
    es: 'Instituciones federales ordenadas por cuánto contratan, cómo lo hacen y qué indicadores de riesgo muestran sus contratos.',
    en: 'Federal institutions ranked by how much they contract, how they do it and what risk indicators their contracts show.',
  },
  watchlist: {
    es: 'Proveedores priorizados para investigación por el indicador de riesgo y por patrones documentados. Una pista, no una acusación.',
    en: 'Vendors prioritised for investigation by the risk indicator and by documented patterns. A lead, not an accusation.',
  },
  archive: {
    es: `Busque y filtre los contratos federales de México de 2002 a ${DATA_LAST_YEAR}, cada uno con su indicador de riesgo y su fuente.`,
    en: `Search and filter Mexican federal contracts from 2002 to ${DATA_LAST_YEAR}, each with its risk indicator and its source.`,
  },
  methodology: {
    es: 'Cómo se calcula el indicador de riesgo de RUBLI: sus variables, sus límites y de dónde vienen los datos.',
    en: "How RUBLI's risk indicator is computed: its features, its limits and where the data comes from.",
  },
  press: {
    es: 'Materiales para periodistas: comunicado, guía para usar los datos de RUBLI y cómo citar la plataforma.',
    en: 'Materials for journalists: the press release, a guide to using the RUBLI data and how to cite the platform.',
  },
  data: {
    es: 'Los datos de RUBLI: el conjunto abierto con DOI, las descargas en CSV y Excel, la API pública, el horizonte de los datos y sus reglas de validación.',
    en: "RUBLI's data: the open dataset with its DOI, CSV and Excel downloads, the public API, the data horizon and its validation rules.",
  },
  dashboard: {
    es: 'La portada de RUBLI: la tesis, las cifras principales de la contratación federal 2002–2026 y un índice de todo el sitio.',
    en: "RUBLI's front page: the thesis, the headline figures of federal procurement 2002–2026 and an index of the whole site.",
  },
  newsroom: {
    es: 'Investigaciones de datos de RUBLI sobre la contratación federal de México, cada cifra con su fuente.',
    en: "RUBLI's data investigations into Mexican federal procurement, every figure with its source.",
  },
  gallery: {
    es: 'Películas breves que explican hallazgos de RUBLI en los datos de la contratación federal de México.',
    en: 'Short films that explain RUBLI findings in the data of Mexican federal procurement.',
  },
  privacy: {
    es: 'Aviso de privacidad de RUBLI: qué datos se recaban, para qué se usan y cómo ejercer sus derechos ARCO.',
    en: 'RUBLI privacy notice: what data is collected, what it is used for and how to exercise your rights.',
  },
  terms: {
    es: 'Términos de uso de RUBLI: alcance de los indicadores de riesgo, uso de los datos públicos y responsabilidades.',
    en: 'RUBLI terms of use: the scope of the risk indicators, the use of the public data and responsibilities.',
  },
}

/** Cut at a word boundary so the result (with an ellipsis) fits `max`. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.·—–-]+$/, '') + '…'
}

const titled = (name: string): string => clip(name, MAX_TITLE - SUFFIX.length) + SUFFIX

function page(names: Record<MetaLang, string>, key: string): Bilingual | null {
  const d = PAGE_DESCRIPTIONS[key]
  if (!d) return null
  return {
    es: { title: titled(names.es), description: d.es },
    en: { title: titled(names.en), description: d.en },
  }
}

function build(): Record<string, Bilingual> {
  const map: Record<string, Bilingual> = {}
  const tocNames = (key: string) => ({
    es: (esNav.toc as Record<string, string>)[key],
    en: (enNav.toc as Record<string, string>)[key],
  })
  for (const e of [...TOC, ...OFF_NAV]) {
    const m = page(tocNames(e.key), e.key)
    if (m) map[e.href] = m
  }
  for (const key of ['privacy', 'terms'] as const) {
    const m = page({ es: esCommon.legal[key], en: enCommon.legal[key] }, key)
    if (m) map[`/${key}`] = m
  }
  for (const s of STORY_HEADLINES) {
    map[`/stories/${s.slug}`] = {
      es: { title: titled(s.headline_es ?? s.headline), description: clip(s.subheadline_es ?? s.subheadline, MAX_DESCRIPTION) },
      en: { title: titled(s.headline), description: clip(s.subheadline, MAX_DESCRIPTION) },
    }
  }
  return map
}

export const ROUTE_META: Readonly<Record<string, Bilingual>> = build()

const normalize = (pathname: string): string =>
  pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

/**
 * Meta for a route. Exact registry hit first; a dossier under a TOC page takes
 * the parent's description and, once loaded, the entity's name as its title;
 * anything else gets the site defaults.
 */
export function metaFor(pathname: string, lang: MetaLang, entityName?: string | null): RouteMeta {
  const path = normalize(pathname)
  const exact = ROUTE_META[path]
  if (exact) return exact[lang]
  const parent = entryFor(path) ?? OFF_NAV.find((o) => path.startsWith(o.href + '/'))
  const base = (parent && ROUTE_META[parent.href]?.[lang]) || DEFAULT_META[lang]
  return entityName ? { title: titled(entityName), description: base.description } : base
}

/**
 * Mark the page noindex while it is mounted. The SPA answers 200 for every path, so a missing
 * record (unknown route, unknown dossier id) is a soft 404: render this in that state only, never
 * for a slow or failing request. Sets the one static robots tag from index.html, never a second
 * (launch audit 2026-10-28 S3).
 */
export function NoIndex(): null {
  useLayoutEffect(() => {
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) return
    const prev = robots.content
    robots.content = 'noindex'
    return () => { robots.content = prev }
  }, [])
  return null
}

function setMeta(selector: string, attr: 'content' | 'href', value: string) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

/**
 * Apply `metaFor` to the document on route / language / entity change.
 * Pages that own their title (useDocumentTitle: vendor, contract, archive)
 * still win: their layout effects run after this one in the same commit.
 */
export function useRouteMeta(pathname: string, lang: string, entityName?: string | null) {
  const L: MetaLang = lang.startsWith('es') ? 'es' : 'en'
  useLayoutEffect(() => {
    const m = metaFor(pathname, L, entityName)
    const url = SITE_ORIGIN + normalize(pathname)
    document.title = m.title
    setMeta('meta[name="description"]', 'content', m.description)
    setMeta('meta[property="og:title"]', 'content', m.title)
    setMeta('meta[property="og:description"]', 'content', m.description)
    setMeta('meta[name="twitter:title"]', 'content', m.title)
    setMeta('meta[name="twitter:description"]', 'content', m.description)
    setMeta('meta[property="og:url"]', 'content', url)
    setMeta('link[rel="canonical"]', 'href', url)
  }, [pathname, L, entityName])
}
