/**
 * Each page says what it is, what you get and one action, before anything else (owner 11-07/08 after two
 * outside readers, Mariana and Kristian: «where do I start?»). Static lines: nothing plays at the reader.
 * Keyed by route pattern (numeric ids folded to :id). Copy: docs/PRELUDE_PLAN_2026-11-08.md.
 */
type Three = readonly [what: string, get: string, act: string]
export const PRELUDE: Record<string, { es: Three; en: Three }> = {
  '/institutions/:id': {
    es: ['Todo lo que compró esta institución.', 'A quién le compra, cuánto y con qué riesgo.', 'Abre en el gobierno actual; «Historia» muestra 2002 a hoy.'],
    en: ['Everything this agency bought.', 'Who it buys from, how much, and with what risk.', 'It opens on the current government; «History» shows 2002 to today.'],
  },
  '/vendors/:id': {
    es: ['Todo lo que esta empresa le vendió al gobierno.', 'A quién, cuánto, cómo y con qué señales de riesgo.', 'Mira su historia por sexenio.'],
    en: ['Everything this company sold to the government.', 'To whom, how much, how, and with what risk signals.', 'Look at its history by administration.'],
  },
  '/contracts/:id': {
    es: ['Un contrato: quién, cuánto y cómo se adjudicó.', 'Por qué su indicador de riesgo es el que es.', 'Sigue al proveedor o a la institución.'],
    en: ['One contract: who, how much, and how it was awarded.', 'Why its risk indicator is what it is.', 'Follow the supplier or the agency.'],
  },
  '/categories': {
    es: ['Qué compra el gobierno: medicinas, obra, servicios.', 'Dónde se gasta más y con menos competencia.', 'Abre una categoría.'],
    en: ['What the government buys: medicines, works, services.', 'Where most is spent, with the least competition.', 'Open a category.'],
  },
  '/categories/:id': {
    es: ['Todo lo que el gobierno compró de esta categoría.', 'Quién la vende y cómo se adjudica.', 'Abre una minicategoría o un proveedor.'],
    en: ['Everything the government bought in this category.', 'Who sells it and how it is awarded.', 'Open a subcategory or a supplier.'],
  },
  '/cases': {
    es: ['Escándalos documentados por la prensa y la justicia.', 'Qué mostraban sus contratos antes.', 'Abre un caso.'],
    en: ['Scandals documented by the press and the courts.', 'What their contracts showed beforehand.', 'Open a case.'],
  },
  '/contracts': {
    es: ['Todos los contratos, uno por uno.', 'La fuente de cada cifra del sitio.', 'Filtra por año, sector o monto.'],
    en: ['Every contract, one by one.', 'The source of every figure on the site.', 'Filter by year, sector or amount.'],
  },
  '/administrations': {
    es: ['Lo que compró cada gobierno, de Fox a Sheinbaum.', 'Los sexenios comparados con las mismas reglas.', 'Elige un sexenio.'],
    en: ['What each government bought, from Fox to Sheinbaum.', 'Administrations compared by the same rules.', 'Pick an administration.'],
  },
}

export function preludeFor(pathname: string): { es: Three; en: Three } | undefined {
  return PRELUDE[pathname.replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/$/, '') || '/']
}
