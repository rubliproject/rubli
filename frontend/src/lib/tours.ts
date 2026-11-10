/**
 * Demo walk-throughs (owner 2026-11-08: «highlight the elements and have small pop-ups that describe what we're
 * doing… that would be my demo instead of a video»). One script per demo page, read by the page's «Cómo leer esto»
 * (components/kit/PageQuestion): each `### n` scene is ONE note (≤ 15 words, one idea — readers Mariana + Kristian),
 * `[#cue]` rings that part of the page (`cues`: name → selector). Nothing auto-plays; the reader opens it.
 * ES first, EN second. Selector check: every cue must exist on its page (the demo path, at 1440).
 */
type Lang = 'es' | 'en'
interface Tour { script: Record<Lang, string>; cues: Record<string, string>; targets?: string[]; means?: Record<Lang, string> }

const H1: Record<Lang, string> = { es: 'La frase grande de arriba es la conclusión de esta página.', en: 'The large sentence on top is this page’s conclusion.' }

const TOURS = {
  /** `/` — Portada: the sky of agencies, its figures and the departures board. ③ = the strip's computed finding. */
  portada: {
    cues: { sky: '.pf-cv', figs: '.pf-figs', key: '.pf-key', board: '.bd' },
    script: {
      es: `### 1
[#sky] Cada punto es una dependencia del gobierno que compró algo desde 2002.
### 2
[#sky] Más grande, más gastó. El color dice su sector.
### 3
[#key] Un anillo rojo: la que más gasta con indicador alto en su sector.
### 4
[#figs] Las cifras de todo: contratos, críticos, sin concurso y proveedores.
### 5
[#board] Abajo, los contratos más nuevos, como un tablero de salidas.`,
      en: `### 1
[#sky] Each dot is a government agency that bought something since 2002.
### 2
[#sky] Bigger, it spent more. The colour is its sector.
### 3
[#key] A red ring: the one spending most at a high indicator in its sector.
### 4
[#figs] The whole in figures: contracts, critical, no tender, suppliers.
### 5
[#board] Below, the newest contracts, like a departures board.`,
    },
  },
  /** `/aria` (the sky view) — Focos Rojos. ③ = the page's h1 (`.pf-claim`). */
  aria: {
    cues: { sky: '.pf-cv', key: '.pf-key', figs: '.pf-figs', ask: '.pgs-qx' },
    script: {
      es: `### 1
[#sky] Cada punto es una empresa con señales de alerta. El color, su sector.
### 2
[#sky] En el centro de cada nube, la que más urge revisar.
### 3
[#key] Más grande, más dinero. Un anillo rojo: de las más urgentes.
### 4
[#ask] Cambie la pregunta: gobierno, sector, comprador o patrón.
### 5
[#figs] Cuántas son, cuánto recibieron y qué quiere decir «sin caso».`,
      en: `### 1
[#sky] Each dot is a company with warning signs. The colour, its sector.
### 2
[#sky] At the centre of each cloud, the most urgent to check.
### 3
[#key] Bigger, more money. A red ring: among the most urgent.
### 4
[#ask] Change the question: government, sector, buyer or pattern.
### 5
[#figs] How many, how much they received, and what “no case” means.`,
    },
  },
  /** `/institutions/:id` (IMSS on the demo) — Panorama tab. ③ = the head's h1. */
  institution: {
    cues: { ledger: '.ib2-ledger', tool: '.ph-toolbar', p2: '#p2', p3: '#p3', p5: '#p5', tabs: '.ct-dochead-tools' },
    script: {
      es: `### 1
[#ledger] La ficha en cifras: contratos, proveedores y cuánto se lleva el mayor.
### 2
[#tool] «Hoy» es este gobierno; «Historia», de 2002 a 2026.
### 3
[#p2] Su dinero en una columna: una placa por proveedor, el mayor arriba.
### 4
[#p3] Cada cuadrado es un periodo. Su área es el dinero.
### 5
[#p5] Sus contratos, uno por fila, con su indicador de riesgo.
### 6
[#tabs] «Calificación»: qué tan bien compra, frente a dependencias parecidas.`,
      en: `### 1
[#ledger] The record in figures: contracts, suppliers, the largest one’s share.
### 2
[#tool] “Today” is this government; “History”, 2002 to 2026.
### 3
[#p2] Its money in one column: one plate per supplier, the largest on top.
### 4
[#p3] Each square is a period. Its area is the money.
### 5
[#p5] Its contracts, one per row, with their risk indicator.
### 6
[#tabs] “Grade”: how well it buys, next to similar agencies.`,
    },
    means: H1,
  },
  /** `/vendors/:id` (Whitemed on the demo). ③ = the head's h1. */
  vendor: {
    cues: { orbit: '.vb2-orbit svg', ledger: '.vb2-ledger', v2: '#v2', v3: '#v3', v4: '#v4', v5: '#v5' },
    script: {
      es: `### 1
[#orbit] La empresa al centro; alrededor, quienes le compran. Más cerca, más dinero.
### 2
[#ledger] Cuánto cobró, en cuántos contratos, a cuántos compradores.
### 3
[#v2] ¿Quién le compra? Sus mayores compradores, del mayor al menor.
### 4
[#v3] ¿Qué vende? Sus categorías de compra, con más dinero arriba.
### 5
[#v4] Sus contratos por nivel de riesgo. Una señal, no una prueba.
### 6
[#v5] Cada contrato, uno por fila. Se abre con un clic.`,
      en: `### 1
[#orbit] The company at the centre; around it, its buyers. Closer, more money.
### 2
[#ledger] What it was paid, in how many contracts, to how many buyers.
### 3
[#v2] Who buys from it? Its largest buyers, largest first.
### 4
[#v3] What does it sell? Its purchase categories, most money on top.
### 5
[#v4] Its contracts by risk level. A signal, not proof.
### 6
[#v5] Every contract, one per row. One click opens it.`,
    },
    means: H1,
  },
  /** `/contracts/:id` (DLG on the demo). ③ = the head's h1. */
  contract: {
    cues: { stats: '.cb2-stats', risk: '.cb2-risk', reasons: '.ct-section:has(#cs-riesgo) .cb2-means', who: '.cb2-who', coins: '.ct-section:has(#cs-normal) .cb2-two', record: '.cb2-drawer' },
    script: {
      es: `### 1
[#stats] Qué se compró: monto, fecha, tipo de compra y categoría.
### 2
[#risk] El indicador de riesgo: de 0 a 1. Desde 0.40 es alto.
### 3
[#reasons] Por qué sale así: las variables que más pesan.
### 4
[#who] Quién vendió y a quién. Cada nombre abre su ficha.
### 5
[#coins] ¿Es normal? Este contrato junto a los más parecidos.
### 6
[#record] El registro completo, tal como lo publicó el gobierno.`,
      en: `### 1
[#stats] What was bought: amount, date, procedure and category.
### 2
[#risk] The risk indicator: 0 to 1. From 0.40 it is high.
### 3
[#reasons] Why it scores so: the features that weigh most.
### 4
[#who] Who sold, and to whom. Each name opens its record.
### 5
[#coins] Is it normal? This contract next to the nearest ones.
### 6
[#record] The full record, as the government published it.`,
    },
    means: H1,
  },
  /** `/cases` (Las bandas). ③ = the head's h1. */
  cases: {
    cues: { tabs: '.ct-dochead-tools', key: '.cb-key', plot: '.cb-plot', row: '.cb-line', out: '.cb-ledhead', follow: '.cl-follow' },
    script: {
      es: `### 1
[#plot] Cada fila es un caso de corrupción ya documentado.
### 2
[#row] La barra cubre los años de sus contratos.
### 3
[#key] El color dice qué tipo de fraude fue.
### 4
[#out] A la derecha, cómo terminó cada caso.
### 5
[#follow] ¿Los habría visto el modelo? La respuesta, con su advertencia.
### 6
[#tabs] «El padrón»: los mismos casos, como lista para filtrar.`,
      en: `### 1
[#plot] Each row is a corruption case already documented.
### 2
[#row] The bar spans the years of its contracts.
### 3
[#key] The colour says what kind of fraud it was.
### 4
[#out] On the right, how each case ended.
### 5
[#follow] Would the model have seen them? The answer, with its caveat.
### 6
[#tabs] “The docket”: the same cases, as a list to filter.`,
    },
    means: H1,
  },
} satisfies Record<string, Tour>

export type TourPage = keyof typeof TOURS

/** The tour's script and cues for a page whose PageQuestion keeps its own question and finding (`/`, `/aria`). */
export function tour(page: TourPage, lang: Lang) {
  const t = TOURS[page]
  return { script: t.script[lang], cues: t.cues }
}

/** For a page under kit/PageHead: `<PageQuestion bare {...headTour('vendor', lang)} />` in PageHead `actions` —
 *  ③ frames the h1, its note saying so. */
export function headTour(page: Exclude<TourPage, 'portada' | 'aria'>, lang: Lang) {
  const t = TOURS[page]
  return { ...tour(page, lang), lang, question: '', means: t.means[lang], findingAt: '.ph-finding' }
}

