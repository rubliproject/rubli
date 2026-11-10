/**
 * /patterns/:code — Individual ARIA Pattern Dossier
 *
 * Shows editorial overview + T1 vendor list + sector heat for one pattern.
 * Sections: §0 Cabecera · §1 Lede · §2 Top Vendors T1 · §3 Sector Heat · §4 Detection Signal
 */
import { cieloHref } from '@/lib/vista'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { networkApi, ariaApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { ReactNode } from 'react'
import { CrossPatternComparison } from '@/components/patterns/CrossPatternComparison'
import { SECTOR_COLORS, SECTORS, PATTERN_COLORS, CURRENT_MODEL_VERSION } from '@/lib/constants'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead, splitFinding } from '@/components/kit/PageHead'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import { RuledBar } from '@/components/contrato/RuledBar'
import { RiskGauge } from '@/components/contrato/RiskGauge'
import { ListHead, COL, NameCell, NumCell, TextCell } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import '@/components/patterns/patterns.css'
import { FootNotes } from '@/components/kit/FootNotes'

// ---------------------------------------------------------------------------
// Hardcoded editorial data per pattern
// ---------------------------------------------------------------------------
interface PatternEditorial {
  code: string
  nameEn: string
  nameEs: string
  ledeEn: string
  ledeEs: string
  signalEn: string
  signalEs: string
}

const PATTERN_EDITORIAL: PatternEditorial[] = [
  {
    code: 'P1',
    nameEn: 'Large share of its sector',
    nameEs: 'Peso en su sector',
    ledeEn:
      'Some vendors take a large slice of everything their sector has spent since 2002. That share alone is not wrongdoing: the largest pharmaceutical distributors or builders hold it by sheer size. P1 marks the vendors whose weight in the market is large enough to deserve a closer look at how they won it.',
    ledeEs:
      'Algunos proveedores se llevan una parte grande de todo lo que su sector ha gastado desde 2002. Esa parte, por sí sola, no es una irregularidad: los mayores distribuidores de medicinas o constructoras la tienen por puro tamaño. P1 marca a los proveedores cuyo peso en el mercado es lo bastante grande para mirar de cerca cómo lo ganaron.',
    signalEn:
      'ARIA reads the vendor’s share of its primary sector’s all-time value: over 0.5% scores 0.20, over 1% 0.50, over 3% 0.80; +0.15 when one buyer signs over 70% of its contracts, +0.10 when over 80% of its tenders ended with a single winner. It measures size in the market, not one institution, and it is not compared with vendors of the same size.',
    signalEs:
      'ARIA lee la parte que el proveedor se lleva de todo lo que gastó su sector principal desde 2002: más de 0.5% da 0.20, más de 1% 0.50, más de 3% 0.80; +0.15 si un comprador firma más del 70% de sus contratos, +0.10 si más del 80% de sus licitaciones tuvo un solo adjudicado. Mide tamaño en el mercado, no una institución, y no se compara con proveedores del mismo tamaño.',
  },
  {
    code: 'P2',
    nameEn: 'Low-footprint supplier (no RFC)',
    nameEs: 'Proveedor de baja huella (sin RFC)',
    ledeEn:
      'P2 is a risk indicator for low-footprint suppliers: firms that win a short burst of contracts within one to three fiscal years and then leave the registry, often without a verifiable RFC or with a legal address shared with other flagged firms. These traits are also what shell companies look like, which is why the indicator exists, but most firms that match it are not shell companies. The SAT EFOS Definitivo list is the external record that confirms a shell company.',
    ledeEs:
      'P2 es un indicador de riesgo de proveedores de baja huella: empresas que ganan una ráfaga corta de contratos en uno a tres ejercicios fiscales y luego salen del registro, a menudo sin un RFC verificable o con un domicilio fiscal compartido con otras empresas señaladas. Esos rasgos son también los de una empresa fantasma, y por eso existe el indicador, pero la mayoría de las empresas que lo cumplen no lo son. La lista EFOS Definitivo del SAT es el registro externo que confirma una empresa fantasma.',
    signalEn:
      'ARIA flags P2 when a vendor shows a burst-score above 0.7, has fewer than 2 active years in the database, and either appears on the SAT EFOS Definitivo list or has an RFC that fails checksum validation. Ghost confidence is boosted when the vendor shares a legal address with another flagged entity.',
    signalEs:
      'ARIA marca P2 cuando un proveedor tiene una puntuación de ráfaga superior a 0.7, menos de 2 años activos en la base de datos, y aparece en la lista SAT EFOS Definitivo o tiene un RFC que no pasa la validación de suma de verificación. La confianza de fantasma aumenta cuando el proveedor comparte domicilio fiscal con otra entidad marcada.',
  },
  {
    code: 'P3',
    nameEn: 'Intermediary',
    nameEs: 'Intermediario',
    ledeEn:
      'Intermediary firms insert themselves into the procurement chain without delivering substantive value—routing public contracts to subcontractors while capturing a margin. They typically have minimal physical infrastructure, no registered employees, and are incorporated in low-scrutiny states. The intermediary model is especially common in IT services, consulting, and pharmaceutical distribution, where technical complexity provides cover for inflated markups.',
    ledeEs:
      'Las empresas intermediarias se insertan en la cadena de contratación sin aportar valor sustantivo, enrutando contratos públicos hacia subcontratistas mientras capturan un margen. Por lo general, tienen infraestructura física mínima, sin empleados registrados y están constituidas en estados de baja fiscalización. El modelo de intermediario es especialmente común en servicios de TI, consultoría y distribución farmacéutica, donde la complejidad técnica encubre los sobreprecios.',
    signalEn:
      'ARIA identifies P3 vendors by cross-referencing contract volumes with SAT payroll signals and IMSS employee count data. A vendor with >50M MXN in annual contracts and zero verifiable employees scores high on the intermediary signal. Network edges to known subcontractors reinforce the flag.',
    signalEs:
      'ARIA identifica proveedores P3 cruzando volúmenes de contratos con señales de nómina del SAT y datos de empleados del IMSS. Un proveedor con más de 50M MXN en contratos anuales y cero empleados verificables obtiene una puntuación alta en la señal de intermediario. Las conexiones en red con subcontratistas conocidos refuerzan el marcado.',
  },
  {
    code: 'P4',
    nameEn: 'Co-award pattern',
    nameEs: 'Patrón de coadjudicación',
    ledeEn:
      'Bid rigging is cartel behavior where vendors who appear to compete actually coordinate. The same small group submits "competing" bids across many procedures at the same institution, taking turns winning while the others submit cover bids designed to lose. The pattern shows up in COMPRANET as repeated co-bidding partnerships — the same 3-5 vendors appearing on each other\'s losing-bid rosters across dozens of procedures, with a near-deterministic rotation of who wins.',
    ledeEs:
      'La manipulación de ofertas es un comportamiento de cártel en el que proveedores aparentemente competidores en realidad coordinan. El mismo pequeño grupo presenta ofertas "competidoras" en muchos procedimientos de la misma institución, turnándose para ganar mientras los demás presentan ofertas de cobertura diseñadas para perder. El patrón aparece en COMPRANET como asociaciones repetidas de co-licitación: los mismos 3-5 proveedores aparecen en las listas de ofertas perdedoras unos de otros en docenas de procedimientos, con una rotación casi determinista de quién gana.',
    signalEn:
      'ARIA detects P4 from co-bidding statistics. The signal fires when a vendor\'s maximum pairwise co-bid rate (the share of their procedures where the same partner also bid) exceeds a calibrated threshold, indicating a recurring competitive relationship that statistically cannot be coincidence.',
    signalEs:
      'ARIA detecta P4 a partir de estadísticas de co-licitación. La señal se activa cuando la tasa máxima de co-licitación entre pares de un proveedor (la proporción de sus procedimientos en los que el mismo socio también ofertó) supera un umbral calibrado, lo que indica una relación competitiva recurrente que estadísticamente no puede ser coincidencia.',
  },
  {
    code: 'P5',
    nameEn: 'Amount out of range',
    nameEs: 'Monto fuera de rango',
    ledeEn:
      'Amount out of range flags vendors whose contracts are much larger (or smaller) than others of their kind. It compares total contract amounts with the sector or budget-line median — not unit prices, which the published data does not carry. Two shapes matter: a vendor whose contracts run large across many awards, and occasional single contracts at multiples of the usual size. A large amount can mean more units bought, not a higher price; only unit-price evidence turns it into overpricing.',
    ledeEs:
      'Monto fuera de rango señala a proveedores cuyos contratos son mucho más grandes (o más chicos) que los de su tipo. Compara montos totales con la mediana de su sector o partida, no precios unitarios, que la base publicada no trae. Importan dos formas: un proveedor cuyos contratos son grandes en muchas adjudicaciones, y contratos sueltos de varias veces el tamaño habitual. Un monto grande puede significar más unidades compradas, no un precio más alto; solo la evidencia de precio unitario lo convierte en sobreprecio.',
    signalEn:
      'ARIA computes z-scored amount ratios per vendor against the sector-median benchmark. P5 fires when both the average and the maximum z-score exceed calibrated thresholds — the average catches vendors whose contracts run consistently large, the maximum catches the single-contract outliers a journalist can then test with unit prices.',
    signalEs:
      'ARIA calcula ratios de monto normalizados (z-score) por proveedor contra la mediana del sector. P5 se activa cuando tanto el promedio como el máximo z-score superan umbrales calibrados: el promedio detecta proveedores con contratos consistentemente grandes, el máximo detecta los contratos sueltos atípicos que un periodista puede luego contrastar con precios unitarios.',
  },
  {
    code: 'P6',
    nameEn: 'Single-buyer dependence',
    nameEs: 'Dependencia de un solo comprador',
    ledeEn:
      'Institutional capture occurs when a government body\'s procurement function is effectively controlled by a small group of preferred vendors. Captured institutions exhibit extreme vendor concentration, near-total reliance on direct awards, and resistance to competitive procedures even when legally required. Unlike isolated kickback cases, institutional capture persists across multiple administrations and is often embedded in informal staffing networks that outlast political transitions.',
    ledeEs:
      'La captura institucional ocurre cuando la función de contratación de un organismo gubernamental es efectivamente controlada por un pequeño grupo de proveedores preferidos. Las instituciones capturadas exhiben una concentración extrema de proveedores, dependencia casi total de adjudicaciones directas y resistencia a procedimientos competitivos incluso cuando son legalmente requeridos. A diferencia de los casos aislados de soborno, la captura institucional persiste a lo largo de múltiples administraciones y frecuentemente está arraigada en redes informales de personal que sobreviven a las transiciones políticas.',
    signalEn:
      'ARIA flags P6 when a single institution directs ≥70% of its total spend to ≤3 vendors over any 6-year sexenio window. The signal is strengthened when the top vendor holds a direct-award rate above 85% and the institution shows below-median competitive procedure usage for its sector peer group.',
    signalEs:
      'ARIA marca P6 cuando una sola institución dirige ≥70% de su gasto total a ≤3 proveedores en cualquier ventana de 6 años de un sexenio. La señal se fortalece cuando el proveedor principal tiene una tasa de adjudicación directa superior al 85% y la institución muestra un uso de procedimientos competitivos por debajo de la mediana para su grupo de pares sectoriales.',
  },
  {
    code: 'P7',
    nameEn: 'Linked to a documented case',
    nameEs: 'Vinculado a un caso documentado',
    ledeEn:
      'P7 marks a vendor that is linked to a documented case in RUBLI\'s case set — a case sourced to press reports, official records or an audit, and rated high-confidence. It is a pointer to that case record, not an independent detection and not a finding about the vendor: read the case and its sources before relying on it.',
    ledeEs:
      'P7 marca a un proveedor vinculado a un caso documentado de la base de casos de RUBLI — un caso con fuente de prensa, registros oficiales o auditoría, y calificado de alta confianza. Es un puntero a ese expediente, no una detección independiente ni un hallazgo sobre el proveedor: lea el caso y sus fuentes antes de apoyarse en él.',
    signalEn:
      'ARIA sets P7 when the vendor is linked to a documented (sourced, high-confidence) case in the ground-truth set. Unverified case links do not set P7. The flag is binary.',
    signalEs:
      'ARIA activa P7 cuando el proveedor está vinculado a un caso documentado (con fuente y de alta confianza) de la base de casos. Los vínculos no verificados no activan P7. La marca es binaria.',
  },
]

const META_BY_CODE = PATTERN_EDITORIAL.reduce<Record<string, PatternEditorial>>(
  (acc, m) => { acc[m.code] = m; return acc },
  {}
)

// ---------------------------------------------------------------------------
// Investigative hooks — migrated from the retired /patterns index (2026-06-07).
// P1/P2/P3/P6 copied verbatim; P4/P5/P7 REWRITTEN to match canonical ARIA
// definitions (the index page had them mislabeled as Kickback/Rotation/Dump).
// ---------------------------------------------------------------------------
const PATTERN_HOOKS: Record<string, { en: string; es: string }> = {
  P1: {
    en: 'Cross-reference with direct-award procedure codes. If the same institution–vendor pair appears across 10+ years, run a co-bidding network analysis to find who else is in the ring.',
    es: 'Cruce con códigos de adjudicación directa. Si el mismo par institución-proveedor aparece en 10+ años, ejecute análisis de co-licitación para encontrar quién más está en el anillo.',
  },
  P2: {
    en: 'Verify RFC registration date in SAT vs. first contract date. A company winning contracts before its RFC is formally registered is an automatic T1 lead.',
    es: 'Verifique la fecha de registro RFC en el SAT vs. el primer contrato. Una empresa que gana contratos antes de registrar su RFC es un nivel 1 automático de la fila de investigación.',
  },
  P3: {
    en: 'Look for cascade contracts: company A wins a large procedure, then company B — registered weeks later at the same address — wins identical procedures the following year.',
    es: 'Busque contratos en cascada: empresa A gana un procedimiento grande, luego empresa B — registrada semanas después en la misma dirección — gana procedimientos idénticos el año siguiente.',
  },
  P4: {
    en: 'Map the co-bidding graph. When the same 3–5 vendors appear on each other’s losing-bid rosters across dozens of procedures at one institution — and the winner rotates almost deterministically — that is worth testing as possible bid rotation, not a finding in itself. Filter the ARIA queue by P4 and open the Network view on the top co-bidder.',
    es: 'Mapee el grafo de co-licitación. Cuando los mismos 3–5 proveedores aparecen en las listas de ofertas perdedoras unos de otros en docenas de procedimientos de una institución — y el ganador rota de forma casi determinista — vale la pena probarlo como posible rotación de ofertas; no es un hallazgo por sí mismo. Filtre la fila ARIA por P4 y abra la vista de Red sobre el principal co-licitante.',
  },
  P5: {
    en: 'Start from the amount, then find the unit price. Two shapes matter: contracts that run large across many awards (average amount ratio well above the sector median) and single contracts at multiples of the usual size — the single-contract lede a journalist can use. To call it overpricing you need the unit price from the contract or invoice; pharma, construction supplies and IT services are where that benchmarking is feasible.',
    es: 'Empiece por el monto y luego busque el precio unitario. Importan dos formas: contratos grandes en muchas adjudicaciones (ratio de monto promedio muy por encima de la mediana sectorial) y contratos sueltos de varias veces el tamaño habitual — el gancho de un solo contrato que un periodista puede usar. Para hablar de sobreprecio hace falta el precio unitario del contrato o la factura; farmacéutica, suministros de construcción y TI son donde ese benchmarking es factible.',
  },
  P6: {
    en: 'Open the vendor dossier’s network view on the top vendor for each captured institution. Capture typically begins with a single direct award that becomes the de-facto preferred vendor for all subsequent competitive procedures.',
    es: 'Abra la vista de red del expediente del proveedor principal de cada institución capturada. La captura típicamente comienza con una adjudicación directa que se convierte en el proveedor preferido de facto para todos los procedimientos competitivos posteriores.',
  },
  P7: {
    en: 'Cross-reference the vendor against external registries: SAT EFOS (tax-fraud blacklist), SFP sanction records, and the curated ground-truth case library. A match on any of these is documented external evidence — the strongest signal in the model.',
    es: 'Cruce al proveedor con registros externos: la lista definitiva del SAT de empresas que facturan operaciones simuladas (EFOS), sanciones de la SFP y la base de casos documentados. Una coincidencia en cualquiera de ellos es evidencia externa documentada — la señal más fuerte del modelo.',
  },
}

// ---------------------------------------------------------------------------
// § · CÓMO INVESTIGAR — editorial intro, one per pattern.
// Documented in the charter (§V: "promised § Cómo investigar absent") but never
// shipped. Static bilingual copy keyed off PATTERN_EDITORIAL P1–P7: (1) what the
// pattern is in one line, (2) what a journalist checks FIRST, (3) what counts as
// corroboration. Folio voice — factual, no hype. ARIA output is a model SIGNAL,
// never proven corruption; risk language is "indicador de riesgo".
// ---------------------------------------------------------------------------
interface InvestigateGuide {
  what: { en: string; es: string }
  first: { en: string; es: string }
  corroborate: { en: string; es: string }
}

const PATTERN_INVESTIGATE: Record<string, InvestigateGuide> = {
  P1: {
    what: {
      en: 'A vendor that takes more than 0.5% of everything its sector has spent since 2002. The signal is weight in the market; on its own it mostly marks the largest vendors.',
      es: 'Un proveedor que se lleva más del 0.5% de todo lo que su sector ha gastado desde 2002. La señal es el peso en el mercado; por sí sola marca sobre todo a los proveedores más grandes.',
    },
    first: {
      en: 'Chart the vendor’s share of its sector by year and set it beside vendors of the same size. Then check the procedure type: legitimate weight survives open tenders.',
      es: 'Grafique la parte del proveedor en su sector por año y póngala junto a proveedores del mismo tamaño. Luego revise el tipo de procedimiento: el peso legítimo sobrevive a licitaciones abiertas.',
    },
    corroborate: {
      en: 'A near-total direct-award rate, the absence of any losing bidder across years, or a competitor that exits the category the moment this vendor enters all corroborate. None of these alone proves wrongdoing — they narrow where to look.',
      es: 'Una tasa de adjudicación directa casi total, la ausencia de cualquier oferente perdedor a lo largo de los años, o un competidor que abandona la categoría justo cuando entra este proveedor son corroboraciones. Ninguna por sí sola prueba un delito — acotan dónde mirar.',
    },
  },
  P2: {
    what: {
      en: 'An entity that appears, wins a burst of contracts within one to three fiscal years, and then vanishes from the registry. Shared addresses and unverifiable RFCs are common tells.',
      es: 'Una entidad que aparece, gana una ráfaga de contratos en uno a tres años fiscales y luego desaparece del registro. Domicilios compartidos y RFC inverificables son indicios frecuentes.',
    },
    first: {
      en: 'Compare the vendor’s SAT RFC registration date against its first contract date. A firm winning public money before it formally exists is the cleanest lead available.',
      es: 'Compare la fecha de registro del RFC en el SAT contra la fecha del primer contrato. Una empresa que gana dinero público antes de existir formalmente es el lead más limpio disponible.',
    },
    corroborate: {
      en: 'Appearance on the SAT EFOS Definitivo list, an RFC that fails checksum validation, or a legal address shared with another flagged entity each raise confidence. EFOS is documented external evidence; the burst shape alone is only a model signal.',
      es: 'La aparición en la lista EFOS Definitivo del SAT, un RFC que no pasa la validación de suma de verificación, o un domicilio fiscal compartido con otra entidad marcada elevan la confianza. EFOS es evidencia externa documentada; la forma de ráfaga por sí sola es solo una señal del modelo.',
    },
  },
  P3: {
    what: {
      en: 'A firm that sits in the procurement chain without delivering substantive value — routing the contract to a subcontractor while keeping a margin. Minimal infrastructure, no payroll, low-scrutiny state of incorporation.',
      es: 'Una empresa que se sitúa en la cadena de contratación sin aportar valor sustantivo — enruta el contrato a un subcontratista y conserva un margen. Infraestructura mínima, sin nómina, constituida en un estado de baja fiscalización.',
    },
    first: {
      en: 'Cross the vendor’s annual contract volume against its IMSS-registered employee count. A firm with tens of millions in contracts and no verifiable workforce cannot deliver what it was paid for.',
      es: 'Cruce el volumen anual de contratos del proveedor contra su número de empleados registrados en el IMSS. Una empresa con decenas de millones en contratos y sin fuerza laboral verificable no puede entregar lo que se le pagó.',
    },
    corroborate: {
      en: 'Network edges to known subcontractors, identical scopes resold downstream at a markup, or a cascade where a sister firm wins the same procedure the following year corroborate the intermediary read.',
      es: 'Conexiones de red con subcontratistas conocidos, alcances idénticos revendidos aguas abajo con sobreprecio, o una cascada en la que una empresa hermana gana el mismo procedimiento el año siguiente corroboran la lectura de intermediario.',
    },
  },
  P4: {
    what: {
      en: 'Vendors repeatedly awarded together in the same procedures. The signal measures co-awards, not proven coordination: split purchases (e.g. textbook publishers on one order) produce it legitimately. Bid rotation is one hypothesis to test, not the default reading.',
      es: 'Proveedores adjudicados juntos de forma repetida en los mismos procedimientos. La señal mide coadjudicaciones, no coordinación probada: las compras divididas (p. ej. editoriales de libros de texto en un mismo pedido) la producen legítimamente. La rotación de ofertas es una hipótesis a probar, no la lectura por defecto.',
    },
    first: {
      en: 'Map the co-bidding graph for the vendor’s institution. Look for the same three to five firms recurring on each other’s losing-bid rosters across dozens of procedures.',
      es: 'Mapee el grafo de co-licitación de la institución del proveedor. Busque las mismas tres a cinco empresas que se repiten en las listas de ofertas perdedoras unas de otras en docenas de procedimientos.',
    },
    corroborate: {
      en: 'A near-deterministic rotation of who wins, bid margins that cluster suspiciously tight, or losing bids that exceed the budget cap turn a statistical pattern into a documentable rigging case. The co-bid rate alone is a model signal.',
      es: 'Una rotación casi determinista de quién gana, márgenes de oferta sospechosamente ajustados, u ofertas perdedoras que exceden el techo presupuestal convierten un patrón estadístico en un caso de manipulación documentable. La tasa de co-licitación por sí sola es una señal del modelo.',
    },
  },
  P5: {
    what: {
      en: 'A vendor whose contracts are much larger (or smaller) than others of their kind. It compares total amounts, not unit prices. Two shapes matter: contracts that run large across many awards, and occasional single contracts at multiples of the usual size.',
      es: 'Un proveedor cuyos contratos son mucho más grandes (o más chicos) que los de su tipo. Compara montos totales, no precios unitarios. Importan dos formas: contratos grandes en muchas adjudicaciones y contratos sueltos de varias veces el tamaño habitual.',
    },
    first: {
      en: 'Isolate the single largest contract against the median for the same partida first, then get its unit price from the contract or invoice — the amount alone does not show a higher price.',
      es: 'Aísle primero el contrato más grande frente a la mediana de la misma partida y luego obtenga su precio unitario del contrato o la factura: el monto por sí solo no muestra un precio más alto.',
    },
    corroborate: {
      en: 'A matching catalog reference price, an identical good bought cheaper by a peer institution the same year, or a markup that tracks an intermediary in the chain corroborate overpricing. Price benchmarking is feasible in pharma, construction supplies and IT.',
      es: 'Un precio de referencia de catálogo coincidente, un bien idéntico comprado más barato por una institución par el mismo año, o un sobreprecio que sigue a un intermediario en la cadena corroboran el sobreprecio. El benchmarking de precios es factible en farmacéutica, suministros de construcción y TI.',
    },
  },
  P6: {
    what: {
      en: 'An institution whose procurement function is effectively run by a handful of preferred vendors — extreme concentration, near-total reliance on direct awards, and resistance to competition even where the law requires it.',
      es: 'Una institución cuya función de contratación es manejada en la práctica por un puñado de proveedores preferidos — concentración extrema, dependencia casi total de adjudicaciones directas y resistencia a la competencia incluso donde la ley la exige.',
    },
    first: {
      en: 'Open the network view on the institution’s top vendor and trace the relationship back to its origin. Capture typically begins with one direct award that becomes the de-facto preferred vendor for everything after.',
      es: 'Abra la vista de red sobre el proveedor principal de la institución y rastree la relación hasta su origen. La captura suele comenzar con una adjudicación directa que se convierte en el proveedor preferido de facto para todo lo que sigue.',
    },
    corroborate: {
      en: 'Persistence across an administration change, top-vendor direct-award rates above 85%, or competitive-procedure usage below the institution’s sector peers all reinforce the capture read. None alone is proof of corruption.',
      es: 'La persistencia a través de un cambio de administración, tasas de adjudicación directa del proveedor principal superiores al 85%, o un uso de procedimientos competitivos por debajo de los pares sectoriales de la institución refuerzan la lectura de captura. Ninguna por sí sola es prueba de corrupción.',
    },
  },
  P7: {
    what: {
      en: 'A vendor carrying documented external red flags — appearance on a regulatory blacklist, inclusion in a journalism-grounded corruption case, or ties to procurement officials. P7 surfaces the strongest external evidence the model can reach.',
      es: 'Un proveedor que arrastra señales externas documentadas — aparición en una lista negra regulatoria, inclusión en un caso de corrupción documentado periodísticamente, o vínculos con funcionarios de contratación. P7 expone la evidencia externa más fuerte que el modelo puede alcanzar.',
    },
    first: {
      en: 'Check the vendor against the external registries directly: SAT EFOS for tax fraud, the SFP sanction registry for procurement misconduct, and the curated ground-truth case library. A match on any is documented evidence, not a model inference.',
      es: 'Verifique al proveedor directamente contra los registros externos: EFOS del SAT por fraude fiscal, el registro de sanciones de la SFP por mala conducta en contratación, y la base de casos documentados. Una coincidencia en cualquiera es evidencia documentada, no una inferencia del modelo.',
    },
    corroborate: {
      en: 'Beyond the registry hit, look for family or political ties between the vendor’s officers and the contracting institution’s staff, and for the same RFC recurring across other flagged patterns. P7 is binary today; graded press evidence is planned for a later phase.',
      es: 'Más allá de la coincidencia en el registro, busque vínculos familiares o políticos entre los directivos del proveedor y el personal de la institución contratante, y el mismo RFC recurrente en otros patrones marcados. P7 es binario hoy; la evidencia de prensa graduada está prevista para una fase posterior.',
    },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a sector display name to a SECTOR_COLORS slug key */
function sectorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Group spotlight top_vendors by sector — top 5 by vendor count */
function buildSectorBreakdown(
  vendors: Array<{ primary_sector_name: string | null }>
): Array<{ name: string; count: number; color: string }> {
  const freq: Record<string, number> = {}
  for (const v of vendors) {
    if (v.primary_sector_name) {
      freq[v.primary_sector_name] = (freq[v.primary_sector_name] ?? 0) + 1
    }
  }
  return Object.entries(freq)
    .map(([name, count]) => ({
      name,
      count,
      color: SECTOR_COLORS[sectorSlug(name)] ?? SECTOR_COLORS.otros,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

/**
 * Resolve a sector DISPLAY name (e.g. "Salud", "Health", "Tecnología") to its
 * canonical SECTORS entry, so the coda can route a sector chip by numeric id.
 * Matches the normalized slug against the sector code, ES name and EN name.
 */
function resolveSector(displayName: string): (typeof SECTORS)[number] | undefined {
  const slug = sectorSlug(displayName)
  return SECTORS.find(
    (s) =>
      s.code === slug ||
      sectorSlug(s.name) === slug ||
      sectorSlug(s.nameEN) === slug
  )
}

/** Pattern code -> /cases?type=... mapping */
const CASE_TYPE_BY_PATTERN: Record<string, string> = {
  P1: 'monopoly',
  P2: 'ghost_company',
  P3: 'intermediary',
  P4: 'bid_rigging',
  P5: 'overpricing',
  P6: 'institutional_capture',
  P7: 'procurement_fraud',
}

/** A plain section (DESIGN.md §5): ink rule · h2 · optional lede · body. */
function Section({ id, title, aside, lede, children }: { id: string; title: string; aside?: ReactNode; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">{title}</h2>
        {aside}
      </div>
      {lede && <p className="ct-annex-lede">{lede}</p>}
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PatternDossier() {
  const { code } = useParams<{ code: string }>()
  const { i18n } = useTranslation('nav')
  const isEs = i18n.language === 'es'

  const meta = code ? META_BY_CODE[code.toUpperCase()] : undefined

  // Spotlight data (all patterns — we'll filter)
  const { data: spotlightData, isLoading: loadingSpotlight } = useQuery({
    queryKey: ['pattern-spotlight'],
    queryFn: () => networkApi.getPatternSpotlight(),
    staleTime: 5 * 60 * 1000,
  })

  // ARIA queue filtered by this pattern
  const { data: queueData, isLoading: loadingQueue } = useQuery({
    queryKey: ['aria-queue-pattern', code],
    queryFn: () => ariaApi.getQueue({ pattern: code, per_page: 20 }),
    enabled: !!code,
    staleTime: 5 * 60 * 1000,
  })

  // where the pattern concentrates: its vendors grouped by their main buyer (interconnection audit 2026-10-27)
  const { data: groupsData } = useQuery({
    queryKey: ['aria-pattern-groups', code, 'institution'],
    queryFn: () => ariaApi.getPatternGroups(code ?? '', { limit: 5, group: 'institution' }),
    enabled: !!code,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const codaInstitutions = (groupsData?.rows ?? []).filter((r) => r.institution_id != null).slice(0, 4)

  const spotlight = spotlightData?.patterns.find(
    (p) => p.code === code?.toUpperCase()
  )

  const vendors = queueData?.data ?? []

  // Sector breakdown from PatternSpotlight.top_vendors (top 5)
  const sectorBreakdown = spotlight ? buildSectorBreakdown(spotlight.top_vendors) : []
  const maxBreakdownCount = sectorBreakdown[0]?.count ?? 1

  const isLoading = loadingSpotlight || loadingQueue

  const mapCrumb = { label: isEs ? 'El Mapa' : 'The Map', to: cieloHref({ lens: 'patterns' }) }

  // Unknown pattern
  if (!meta) {
    return (
      <article className="ct ct-page ct-sheet" data-frame>
        <div className="ct-wrap">
          <DocHead trail={[mapCrumb, { label: isEs ? 'Patrón' : 'Pattern' }, { label: code ?? '—' }]} />
          <Cover
            title={isEs ? `Patrón «${code}» no encontrado.` : `Pattern "${code}" not found.`}
            lede={isEs ? 'ARIA define siete patrones, de P1 a P7.' : 'ARIA defines seven patterns, P1 to P7.'}
          >
            <Link to={cieloHref({ lens: 'patterns' })} className="ct-more ct-link">
              {isEs ? 'El Mapa · Vínculos, lente de patrones' : 'The Map · Connections, patterns lens'}
            </Link>
          </Cover>
        </div>
      </article>
    )
  }

  const name = isEs ? meta.nameEs : meta.nameEn
  const lede = isEs ? meta.ledeEs : meta.ledeEn
  const signal = isEs ? meta.signalEs : meta.signalEn

  const codeUpper = code?.toUpperCase() ?? ''
  const caseType = CASE_TYPE_BY_PATTERN[codeUpper]
  const patternColor = PATTERN_COLORS[codeUpper] ?? 'var(--color-text-muted)'
  const hook = PATTERN_HOOKS[codeUpper]
    ? (isEs ? PATTERN_HOOKS[codeUpper].es : PATTERN_HOOKS[codeUpper].en)
    : null

  // Universe totals across all 7 patterns — reuses the already-fetched
  // pattern-spotlight query (zero new API calls).
  const allPatterns = spotlightData?.patterns ?? []
  const universe = {
    vendors: allPatterns.reduce((s, p) => s + (p.vendor_count ?? 0), 0),
    t1: allPatterns.reduce((s, p) => s + (p.t1_count ?? 0), 0),
    gt: allPatterns.reduce((s, p) => s + (p.gt_case_count ?? 0), 0),
    value: allPatterns.reduce((s, p) => s + (p.total_value_mxn ?? 0), 0),
  }

  // P1→P7 sibling stepper; wrap-around so P7 → P1 and P1 ← P7.
  const siblingIndex = PATTERN_EDITORIAL.findIndex((m) => m.code === codeUpper)
  const siblingCount = PATTERN_EDITORIAL.length
  const prevMeta = siblingIndex >= 0 ? PATTERN_EDITORIAL[(siblingIndex - 1 + siblingCount) % siblingCount] : undefined
  const nextMeta = siblingIndex >= 0 ? PATTERN_EDITORIAL[(siblingIndex + 1) % siblingCount] : undefined

  const guide = PATTERN_INVESTIGATE[codeUpper]

  // Coda — exit ramps drawn from already-fetched data only.
  const codaVendors = vendors.slice(0, 4)
  const dominantSector = sectorBreakdown.length > 0 ? resolveSector(sectorBreakdown[0].name) : undefined

  const pct = (r: number | null | undefined) => (r == null ? null : Math.round(r * 100))
  const daPct = pct(spotlight?.avg_da_rate)
  const sbPct = pct(spotlight?.avg_sb_rate)
  const rateRows = [
    ...(daPct != null ? [{ name: isEs ? 'Adjudicación directa' : 'Direct award', sub: isEs ? 'tasa promedio de sus proveedores' : 'average rate across its vendors', share: daPct / 100, value: `${daPct}%` }] : []),
    ...(sbPct != null ? [{ name: isEs ? 'Un solo adjudicado' : 'Single award', sub: isEs ? 'procedimientos competitivos que ganó un solo proveedor' : 'competitive procedures won by one vendor', share: sbPct / 100, value: `${sbPct}%` }] : []),
  ]
  const sectorOf = (n: string) => {
    const s = resolveSector(n)
    return s ? (isEs ? s.name : s.nameEN) : n
  }

  return (
    <article className="ct ct-page ct-sheet pattern-page" data-frame>
      <div className="ct-wrap">
        <PageHead lang={isEs ? 'es' : 'en'}
          crumbs={[mapCrumb, { label: isEs ? 'Patrones' : 'Patterns', to: cieloHref({ lens: 'patterns', pin: codeUpper }) }, { label: `${codeUpper} · ${name}` }]}
          actions={siblingIndex >= 0 && prevMeta && nextMeta ? (
            <nav className="pd-step" aria-label={isEs ? 'Navegación entre patrones' : 'Pattern navigation'}>
              <Link to={`/patterns/${prevMeta.code}`}
                aria-label={isEs ? `Patrón anterior: ${prevMeta.code} ${prevMeta.nameEs}` : `Previous pattern: ${prevMeta.code} ${prevMeta.nameEn}`}>
                ← {prevMeta.code}
              </Link>
              <span>{siblingIndex + 1} {isEs ? 'de' : 'of'} {siblingCount}</span>
              <Link to={`/patterns/${nextMeta.code}`}
                aria-label={isEs ? `Siguiente patrón: ${nextMeta.code} ${nextMeta.nameEs}` : `Next pattern: ${nextMeta.code} ${nextMeta.nameEn}`}>
                {nextMeta.code} →
              </Link>
            </nav>
          ) : undefined}
          kicker={<><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: patternColor }} />{codeUpper} · {name}</>}
          finding={splitFinding(lede)?.[0] ?? name} />

        {/* ─── The object: the vendors that carry the pattern, at the top of the ARIA queue ─── */}
        <figure className="pd-object" data-object aria-labelledby="pd-vendors-h">
          <h2 id="pd-vendors-h" className="ct-annex-h">
            <span>{isEs ? 'Los primeros de la fila con este patrón' : 'The top of the queue with this pattern'}</span>
            <Link to={`/aria?pattern=${codeUpper}`} className="ct-link">{isEs ? `Abrir la fila ARIA filtrada por ${codeUpper}` : `Open the ARIA queue filtered by ${codeUpper}`}</Link>
          </h2>
        {isLoading ? (
          <div className="ct-hold-ledger" aria-busy="true" />
        ) : vendors.length === 0 ? (
          <p className="ct-note">{isEs ? 'Sin proveedores en la fila para este patrón.' : 'No queued vendors for this pattern.'}</p>
        ) : (
          <div className="ct-table-wrap"><table className="ct-table ct-stack">
            <ListHead lang={isEs ? 'es' : 'en'} ranked cols={[COL.vendor, { key: 'sector', es: 'Sector', en: 'Sector' }, COL.contracts, COL.amount, { key: 'ips', es: 'IPS', en: 'IPS', num: true }, COL.indicator]} />
            <tbody>
              {vendors.slice(0, 20).map((v, i) => {
                const slug = v.primary_sector_name ? sectorSlug(v.primary_sector_name) : null
                return (
                  <tr key={v.vendor_id} className="ct-row">
                    <RankCell n={i + 1} />
                    <NameCell type="vendor" id={v.vendor_id} name={v.vendor_name} />
                    <TextCell>{v.primary_sector_name
                      ? <span className="nowrap"><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: SECTOR_COLORS[resolveSector(v.primary_sector_name)?.code ?? slug ?? 'otros'] ?? SECTOR_COLORS.otros }} />{sectorOf(v.primary_sector_name)}</span>
                      : '—'}</TextCell>
                    <NumCell label={isEs ? 'contratos' : 'contracts'}>{formatNumber(v.total_contracts)}</NumCell>
                    <NumCell amt>{v.total_value_mxn > 0 ? formatCompactMXN(v.total_value_mxn) : '—'}</NumCell>
                    <NumCell label="IPS">{v.ips_final.toFixed(3)}</NumCell>
                    <td className="gauge"><RiskGauge value={v.avg_risk_score} tier={v.ips_tier} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
          <figcaption className="ct-note">
            {isEs
              ? 'Salida del modelo: los 20 proveedores con este patrón que encabezan la fila ARIA, por prioridad (IPS); la columna final da su nivel. No es un hallazgo de irregularidad; cada nombre lleva a su expediente.'
              : 'Model output: the 20 vendors with this pattern at the top of the ARIA queue, by priority (IPS); the last column gives their tier. This is not a finding of wrongdoing; each name links to its dossier.'}
          </figcaption>
        </figure>

        {/* ─── En cifras ─── */}
        {spotlight ? (
          <section className="ct-clauses" aria-labelledby="pd-cl-h">
            <h2 id="pd-cl-h">{isEs ? 'En cifras' : 'In figures'}</h2>
            <div className="ct-cl-grid">
              <Clause id="pd-cl-1" title={isEs ? 'Proveedores con el patrón' : 'Vendors with the pattern'}
                fig={formatNumber(spotlight.vendor_count)}
                count={{ value: spotlight.vendor_count, format: (n) => formatNumber(Math.round(n)) }}
                note={isEs ? 'en la fila ARIA, todos los niveles' : 'in the ARIA queue, all tiers'} />
              <Clause id="pd-cl-2" title={isEs ? 'En Nivel 1' : 'In Tier 1'}
                fig={formatNumber(spotlight.t1_count)}
                count={{ value: spotlight.t1_count, format: (n) => formatNumber(Math.round(n)) }}
                ruler={{ value: spotlight.vendor_count ? spotlight.t1_count / spotlight.vendor_count : 0, mode: 'fill', ends: ['0', isEs ? 'de los proveedores con el patrón' : 'of the vendors with the pattern', formatNumber(spotlight.vendor_count)] }} />
              <Clause id="pd-cl-3" title={isEs ? 'Casos documentados' : 'Documented cases'}
                fig={formatNumber(spotlight.gt_case_count)}
                count={{ value: spotlight.gt_case_count, format: (n) => formatNumber(Math.round(n)) }}
                note={isEs ? 'de la base de casos que coinciden con la tipología' : 'from the case set matching the typology'} />
              <Clause id="pd-cl-4" title={isEs ? 'Gasto total de sus proveedores' : 'Total spend of its vendors'}
                fig={spotlight.total_value_mxn ? formatDualCurrency(spotlight.total_value_mxn) : '—'}
                note={isEs ? 'suma de los contratos de esos proveedores' : 'sum of those vendors’ contracts'} />
            </div>
          </section>
        ) : isLoading ? <div className="pd-hold" aria-hidden="true" /> : null}

        {/* Cómo investigar — what this is, what to check first, what counts as corroboration. */}
        {guide && (
          <Section id="pd-guide" title={isEs ? 'Cómo investigar' : 'How to investigate'}>
            <dl className="pd-facts">
              <div><dt>{isEs ? 'Qué es' : 'What it is'}</dt><dd>{isEs ? guide.what.es : guide.what.en}</dd></div>
              <div><dt>{isEs ? 'Qué revisar primero' : 'What to check first'}</dt><dd>{isEs ? guide.first.es : guide.first.en}</dd></div>
              <div><dt>{isEs ? 'Qué cuenta como corroboración' : 'What counts as corroboration'}</dt><dd>{isEs ? guide.corroborate.es : guide.corroborate.en}</dd></div>
              {hook && <div><dt>{isEs ? 'Una ruta' : 'One route'}</dt><dd>{hook}</dd></div>}
            </dl>
            <p className="ct-note">
              {isEs
                ? 'La marca ARIA es un indicador de riesgo del modelo, no una corrupción probada. Estas rutas acotan dónde mirar; la evidencia documentada la aporta el reportaje.'
                : 'An ARIA flag is a model risk indicator, not proven corruption. These routes narrow where to look; documented evidence comes from the reporting.'}
            </p>
          </Section>
        )}


        {/* Firma de red — average rates, then where the highlighted vendors sit */}
        {(sectorBreakdown.length > 0 || rateRows.length > 0) && (
          <Section id="pd-network" title={isEs ? 'Firma de red' : 'Network signature'}>
            {rateRows.length > 0 && (
              <div className="ct-rb-compact">
                <h3 className="ct-annex-h">{isEs ? 'Tasas promedio de sus proveedores' : 'Average rates of its vendors'}</h3>
                <RuledBar
                  label={isEs ? 'Tasas promedio de los proveedores con este patrón' : 'Average rates of the vendors with this pattern'}
                  ticks={[0, 25, 50, 75, 100].map((k) => ({ label: `${k}%`, at: k / 100 }))}
                  rows={rateRows}
                />
              </div>
            )}
            {spotlight && (
              <dl className="pd-facts">
                <div><dt>{isEs ? 'Nivel 2' : 'Tier 2'}</dt><dd>{formatNumber(spotlight.t2_count)} {isEs ? 'proveedores' : 'vendors'}</dd></div>
                <div><dt>{isEs ? 'IPS promedio' : 'Average IPS'}</dt><dd>{spotlight.avg_ips.toFixed(3)}</dd></div>
              </dl>
            )}
            {sectorBreakdown.length > 0 && <div className="ct-rb-compact">
              <h3 className="ct-annex-h">{isEs ? `Sectores de los ${spotlight?.top_vendors.length ?? 0} proveedores destacados` : `Sectors of the ${spotlight?.top_vendors.length ?? 0} highlighted vendors`}</h3>
              <RuledBar
                label={isEs ? 'Proveedores destacados por sector' : 'Highlighted vendors by sector'}
                ticks={Array.from({ length: maxBreakdownCount + 1 }, (_, k) => k).filter((k) => k % Math.max(1, Math.ceil(maxBreakdownCount / 5)) === 0 || k === maxBreakdownCount).map((k) => ({ label: String(k), at: k / maxBreakdownCount }))}
                rows={sectorBreakdown.map(({ name: sectorName, count, color }) => {
                  const s = resolveSector(sectorName)
                  return {
                    name: <><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: color }} />{sectorOf(sectorName)}</>,
                    share: count / maxBreakdownCount,
                    value: formatNumber(count),
                    color,
                    href: s ? `/sectors/${s.id}` : undefined,
                  }
                })}
              />
            </div>}
          </Section>
        )}

        {/* Señal de detección */}
        <Section id="pd-signal" title={isEs ? 'Señal de detección' : 'Detection signal'}>
          <p>{signal}</p>
        </Section>

        {/* Casos documentados */}
        {spotlight && spotlight.gt_case_count > 0 && caseType && (
          <Section id="pd-cases" title={isEs ? 'Casos documentados' : 'Documented cases'}
            aside={<Link to={`/cases?type=${caseType}`} className="ct-more ct-link">{isEs ? 'Ver los casos' : 'View the cases'}</Link>}>
            <p>
              {isEs
                ? <>{formatNumber(spotlight.gt_case_count)} casos documentados de la base de RUBLI coinciden con la tipología <b>{name}</b>. Un caso documentado tiene fuente de prensa, registros oficiales o auditoría; no es una condena.</>
                : <>{formatNumber(spotlight.gt_case_count)} documented cases in RUBLI's case set match the <b>{name}</b> typology. A documented case is sourced to press, official records or an audit; it is not a conviction.</>}
            </p>
          </Section>
        )}

        {/* Adónde ir */}
        {(codaVendors.length > 0 || codaInstitutions.length > 0 || dominantSector) && (
          <Section id="pd-coda" title={isEs ? 'Adónde ir' : 'Where to go next'}>
            <dl>
              <div className="pd-coda">
                <dt>{isEs ? 'Investigar' : 'Investigate'}</dt>
                <dd><Link to={`/aria?pattern=${codeUpper}`} className="ct-link">{isEs ? `${codeUpper} en la fila ARIA` : `${codeUpper} in the ARIA queue`}</Link></dd>
              </div>
              {codaVendors.length > 0 && (
                <div className="pd-coda">
                  <dt>{isEs ? 'Proveedores marcados' : 'Flagged vendors'}</dt>
                  <dd>{codaVendors.map((v) => (
                    <EntityIdentityChip key={v.vendor_id} type="vendor" id={v.vendor_id} name={v.vendor_name} variant="name" fullName />
                  ))}</dd>
                </div>
              )}
              {codaInstitutions.length > 0 && (
                <div className="pd-coda">
                  <dt>{isEs ? 'Dónde se concentra' : 'Where it concentrates'}</dt>
                  <dd>{codaInstitutions.map((r) => (
                    <EntityIdentityChip key={r.institution_id} type="institution" id={r.institution_id as number} name={r.institution_name ?? r.label} variant="name" fullName />
                  ))}</dd>
                </div>
              )}
              {dominantSector && (
                <div className="pd-coda">
                  <dt>{isEs ? 'Sector dominante' : 'Dominant sector'}</dt>
                  <dd><EntityIdentityChip type="sector" id={dominantSector.id} name={isEs ? dominantSector.name : dominantSector.nameEN} variant="name" fullName sectorCode={dominantSector.code} /></dd>
                </div>
              )}
            </dl>
          </Section>
        )}

        {/* Los siete patrones */}
        {allPatterns.length > 0 && (
          <Section id="pd-seven" title={isEs ? 'Los siete patrones' : 'The seven patterns'}
            lede={isEs
              ? `Sumadas, las siete marcas dan ${formatNumber(universe.vendors)} proveedores, ${formatNumber(universe.t1)} en Nivel 1 y ${formatNumber(universe.gt)} casos documentados${universe.value > 0 ? `, con ${formatCompactMXN(universe.value)} en contratos` : ''}. Un proveedor puede coincidir con varios patrones a la vez y entonces cuenta en cada uno; esos cruces son donde suelen empezar las investigaciones.`
              : `Summed, the seven flags give ${formatNumber(universe.vendors)} vendors, ${formatNumber(universe.t1)} in Tier 1 and ${formatNumber(universe.gt)} documented cases${universe.value > 0 ? `, with ${formatCompactMXN(universe.value)} in contracts` : ''}. A vendor can match several patterns at once and then counts in each; those intersections are where investigations usually begin.`}>
            <CrossPatternComparison patterns={allPatterns} currentCode={codeUpper} isEs={isEs} />
          </Section>
        )}

        {/* ─── Declaraciones — the page's foot: the pattern's description + where to go (DESIGN.md §5.1) ─── */}
        <Section id="pd-dec" title={isEs ? 'Lectura' : 'Reading'}
          aside={<Link to={cieloHref({ lens: 'patterns', pin: codeUpper })} className="ct-more ct-link">{isEs ? 'Verlo en El Mapa' : 'See it on The Map'}</Link>}
          lede={lede}>
          <FootNotes lead={isEs ? 'Indicador de riesgo. La marca ARIA es una señal del modelo, no una corrupción probada.' : 'Risk indicator. An ARIA flag is a model signal, not proven corruption.'} lang={isEs ? 'es' : 'en'} items={[
            isEs ? `Modelo ${CURRENT_MODEL_VERSION}; fila ARIA y su IPS.` : `Model ${CURRENT_MODEL_VERSION}; the ARIA queue and its IPS.`,
          ]} />
        </Section>
      </div>
    </article>
  )
}
