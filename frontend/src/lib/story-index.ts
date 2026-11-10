/**
 * Story headlines for the app shell (breadcrumb, route <title>/description).
 * PERF launch § 7: the shell used to import lib/story-content.ts (~420 KB of
 * chapters) on every page just for these strings. Kept in step with
 * STORIES by story-index.test.ts — regenerate from STORIES when a story ships.
 */

export interface StoryHeadline {
  slug: string
  headline: string
  headline_es?: string
  subheadline: string
  subheadline_es?: string
}

export const STORY_HEADLINES: StoryHeadline[] = [
  {
    slug: "el-vacio",
    headline: "Mexico Stopped Publishing Its Contracts as Data. We Rebuilt 98,290 Procedures From the Portal.",
    headline_es: "México dejó de publicar sus contratos como datos. Reconstruimos 98,290 procedimientos desde el portal.",
    subheadline: "In 2025 Mexico abolished CompraNet, and its federal bulk file stops at September 28. The successor portal still lists what the government buys, but the winner and the price now sit inside scanned award documents rather than data fields. RUBLI rebuilt the 98,290 procedures published after the freeze. 78.3 percent were direct awards. For 52,537 a price could be read off the scans; two in five carry no amount of any kind.",
    subheadline_es: "En 2025 México abolió CompraNet, y su archivo masivo federal se detiene el 28 de septiembre. El portal sucesor todavía lista lo que compra el gobierno, pero el ganador y el precio ahora están dentro de documentos de adjudicación escaneados, no en campos de datos. RUBLI reconstruyó los 98,290 procedimientos publicados tras el congelamiento. El 78.3 por ciento fueron adjudicaciones directas. En 52,537 pudo leerse un precio de los escaneos; dos de cada cinco no llevan monto de ningún tipo."
  },
  {
    slug: "el-ejercito-fantasma",
    headline: "The Man Who Won 370 Million Pesos and Disappeared",
    headline_es: "El hombre que ganó 370 millones de pesos y desapareció",
    subheadline: "One vendor in the record is a sole trader (persona física) — one person, not a company — holding two federal contracts worth roughly 370 million pesos, with no record before and none after. RUBLI's algorithm flagged that vendor on its ghost-company pattern in May 2026. After the October 2026 run on the retrained risk model, RUBLI's public queue lists 3,024 vendors under the pattern across 23 years; it leaves out private individuals and vendors cleared on review, and that vendor is not among them. Mexico's tax authority has officially confirmed 203 of the 3,024. The other 2,821 are still contracting with the government.",
    subheadline_es: "Un proveedor del registro es una persona física — un individuo, no una empresa — con dos contratos federales por unos 370 millones de pesos, sin registro antes ni después. El algoritmo de RUBLI lo marcó con el patrón de empresa fantasma en mayo de 2026. Tras la corrida de octubre de 2026 sobre el modelo de riesgo reentrenado, la fila pública de RUBLI lista a 3,024 proveedores con el patrón a lo largo de 23 años; deja fuera a personas físicas y a proveedores descartados en revisión, y ese proveedor no está entre ellos. La autoridad fiscal mexicana ha confirmado oficialmente a 203 de los 3,024. Los otros 2,821 siguen contratando con el gobierno."
  },
  {
    slug: "el-gran-precio",
    headline: "The Contracts No One Is Watching Are the Biggest Ones",
    headline_es: "Los contratos que nadie vigila son los más grandes",
    subheadline: "Mexico audits its smallest contracts hardest and its largest least — the exact inverse of where the corruption risk sits. RUBLI's risk model scores risk that climbs almost step by step with value — partly by construction, since one of its inputs, price_ratio, compares each contract's amount with its sector median: 0.26 at the bottom, 0.97 at the top. All 40 contracts above 10 billion pesos, worth 819 billion combined, are high-risk. Just 33 vendors hold them. The mega-contract universe is a directory of recurring names, audited least where the money is largest.",
    subheadline_es: "México audita con más fuerza sus contratos más chicos y con menos sus más grandes — exactamente al revés de donde está el riesgo de corrupción. El modelo de RUBLI asigna un riesgo que sube casi escalón por escalón con el valor — en parte por construcción, porque una de sus variables, price_ratio, compara el monto de cada contrato con la mediana de su sector: 0.26 abajo, 0.97 arriba. Los 40 contratos por encima de 10 mil millones de pesos, con valor combinado de 819 mil millones, son todos de alto riesgo. Apenas 33 proveedores los controlan. El universo de mega-contratos es un directorio de nombres recurrentes, auditado menos donde el dinero es mayor."
  },
  {
    slug: "el-monopolio-invisible",
    headline: "Concentration in IMSS Medicine Purchasing",
    headline_es: "Concentración en las compras de medicamentos del IMSS",
    subheadline: "Grupo Fármacos Especializados collected 133.2 billion pesos from Mexico's federal government. It is one of four pharmaceutical distributors that took 326.2 billion pesos between 2002 and 2025, funneled it through a single customer, and the lead among them changed as the procurement rules changed three times. Four named suppliers. One concentrated market.",
    subheadline_es: "Grupo Fármacos Especializados recibió 133,200 millones de pesos del gobierno federal mexicano. Es una de cuatro distribuidoras farmacéuticas que se llevaron 326,200 millones de pesos entre 2002 y 2025, los canalizaron por un solo cliente y el liderazgo entre ellas cambió mientras las reglas de contratación cambiaban tres veces. Cuatro proveedoras con nombre. Un mercado concentrado."
  },
  {
    slug: "la-ilusion-competitiva",
    headline: "Now You See Competition",
    headline_es: "Ahora usted ve competencia",
    subheadline: "A competitive tender promises a room full of bidders. For fourteen straight years, more than 45% of the contracts in Mexico's \"competitive\" federal procedures came from a procedure with exactly one winner. CompraNet records winners, not bidders, so this is not the EU's single-bidder indicator and is not measured against its line. Here is how it works — and why every step is legal.",
    subheadline_es: "Una licitación competitiva promete una sala llena de oferentes. Durante catorce años seguidos, más del 45% de los contratos de procedimientos \"competitivos\" federales de México vinieron de un procedimiento con exactamente un ganador. CompraNet registra ganadores, no oferentes, así que esta no es la tasa de un solo oferente de la UE ni se mide contra su línea. Así funciona — y por qué cada paso es legal."
  },
  {
    slug: "captura-institucional",
    headline: "The Suppliers Who Cannot Leave",
    headline_es: "Los proveedores que no pueden irse",
    subheadline: "RUBLI's queue flags 8,586 companies that send four fifths or more of everything they sell to a single government buyer. The average is ninety-five percent. At IMSS, Mexico's social-security institute, 2,068 of them are anchored to one address, holding 313.4 billion pesos of lifetime federal contracts between them — and no single supplier comes close to dominating the institute in return. The dependence runs one way. Beneath it, 2,537 intermediaries that win contracts and subcontract the work carry another 448.8 billion. None of it is illegal. That is the problem.",
    subheadline_es: "La fila de RUBLI marca a 8,586 empresas que le venden cuatro quintas partes o más de todo lo suyo a un solo comprador de gobierno. El promedio es noventa y cinco por ciento. En el IMSS hay 2,068 ancladas a una sola dirección, con 313.4 mil millones de pesos en contratos federales de por vida entre todas — y ningún proveedor se acerca a dominar al instituto a cambio. La dependencia corre en un solo sentido. Debajo, 2,537 intermediarios que ganan contratos y subcontratan el trabajo cargan otros 448.8 mil millones. Nada de esto es ilegal. Ese es el problema."
  },
  {
    slug: "marea-de-adjudicaciones",
    headline: "The 82 Percent Rule",
    headline_es: "La regla del 82 por ciento",
    subheadline: "In 2023 Mexico's federal government awarded 82 percent of its contracts without a contest — its highest reading on record. In 2024 it awarded 79. The rate has not fallen below 60 percent in the fourteen full years COMPRANET has coded procedure type, across three administrations and three parties, and the pandemic barely moved it. Mexican procurement law makes open bidding the default and direct award the exception. Non-competition is not the exception here. It is the rule, four to one.",
    subheadline_es: "En 2023 el gobierno federal mexicano adjudicó el 82 por ciento de sus contratos sin concurso — su lectura más alta registrada. En 2024 adjudicó 79. La tasa no baja del 60 por ciento en los catorce años completos que CompraNet lleva codificando el tipo de procedimiento, a lo largo de tres administraciones y tres partidos, y la pandemia apenas la movió. La ley mexicana de adquisiciones hace de la licitación abierta la regla y de la adjudicación directa la excepción. Aquí la no-competencia no es la excepción. Es la regla, con razón de cuatro a uno."
  },
  {
    slug: "el-sexenio-del-riesgo",
    headline: "The Ledger of Five Administrations",
    headline_es: "El libro mayor de cinco sexenios",
    subheadline: "Mexico's procurement risk indicator reads higher under every administration than the one before, and under the model RUBLI retrained in October 2026 the order holds even with the contracts the model learned from set aside: 6.34 percent for Peña Nieto, 7.84 for López Obrador, 11.40 for Sheinbaum's first nine months. The register also grew richer term by term, and the model reads some of that, so the climb is a reading, not a verdict. What did change under López Obrador is where the money went — defence up 203 percent, infrastructure down 45 — and how it was awarded: more direct awards by value, but fewer single-award procedures.",
    subheadline_es: "El indicador de riesgo de la contratación pública mexicana es más alto en cada sexenio que en el anterior, y con el modelo que RUBLI reentrenó en octubre de 2026 el orden se sostiene aun sin los contratos de los que aprendió el modelo: 6.34 por ciento con Peña Nieto, 7.84 con López Obrador, 11.40 en los primeros nueve meses de Sheinbaum. El registro también se volvió más rico sexenio tras sexenio, y el modelo lee parte de esa riqueza, así que la subida es una lectura, no un veredicto. Lo que sí cambió con López Obrador es a dónde fue el dinero —defensa subió 203 por ciento, infraestructura cayó 45— y cómo se adjudicó: más adjudicación directa por valor, pero menos procedimientos con un solo adjudicado."
  },
  {
    slug: "la-industria-del-intermediario",
    headline: "Follow the Middleman",
    headline_es: "Sigan al intermediario",
    subheadline: "RUBLI's P3 algorithm flags 2,537 vendors as matching the pass-through signature: a burst of very large contracts inside a window of at most three years, and then nothing. Together they hold 448.8 billion pesos, three quarters of it in infrastructure, energy and health. But the pattern's biggest names are not its best leads. More than a third of the money at the top of the list has already been reviewed and ruled out, because a megaproject contractor produces the same burst as a shell. The unambiguous cases sit further down — and 2,306 of the 2,537 have never been opened at all.",
    subheadline_es: "El algoritmo P3 de RUBLI marca a 2,537 proveedores por coincidir con la firma de paso: una ráfaga de contratos muy grandes dentro de una ventana de a lo más tres años, y después nada. Juntos acumulan 448.8 mil millones de pesos, tres cuartas partes en infraestructura, energía y salud. Pero los nombres mayores del patrón no son sus mejores pistas. Más de una tercera parte del dinero de la cima de la lista ya fue revisado y descartado, porque un contratista de megaproyecto produce la misma ráfaga que una fachada. Los casos inequívocos están más abajo — y 2,306 de los 2,537 no se han abierto nunca."
  },
  {
    slug: "el-umbral-de-los-300k",
    headline: "The Prices That End in Zeros",
    headline_es: "Los precios que terminan en ceros",
    subheadline: "22,263 federal contracts between 200,000 and 400,000 pesos are written on an exact multiple of ten thousand — a figure a market almost never produces on its own. Every one of those twenty values stands three to twenty-nine times above the thousand-peso carpet around it, and four in five of the contracts on them were handed to a vendor without a contest, against seven in ten across the band. The habit peaked in 2014 and has roughly halved since. Art. 17 of the procurement law bans sizing a purchase to dodge a procedure; in twenty-three years of record it has produced no systemic enforcement case anyone can point to.",
    subheadline_es: "22,263 contratos federales de 200 mil a 400 mil pesos están escritos sobre un múltiplo exacto de diez mil — una cifra que un mercado casi nunca produce por sí solo. Cada uno de esos veinte valores se levanta entre tres y veintinueve veces sobre la alfombra de mil pesos que lo rodea, y cuatro de cada cinco de esos contratos se entregaron sin competencia, contra siete de cada diez en la banda entera. El hábito llegó a su máximo en 2014 y desde entonces casi se dividió a la mitad. El Art. 17 de la ley de adquisiciones prohíbe dimensionar una compra para evadir un procedimiento; en veintitrés años de registro no ha producido un solo caso sistémico de fiscalización que alguien pueda señalar."
  },
  {
    slug: "volatilidad-el-precio-del-riesgo",
    headline: "The Smoking Gun Is a Number",
    headline_es: "La pistola humeante es un número",
    subheadline: "A pharmaceutical distributor billed the IMSS nine times its own price inside one acquisition category in four months. Then an algorithm, handed twenty-seven candidate signals, chose to watch exactly that.",
    subheadline_es: "Un distribuidor farmacéutico le facturó al IMSS nueve veces su propio precio dentro de una misma categoría de adquisición en cuatro meses. Después un algoritmo, con veintisiete señales candidatas, eligió vigilar precisamente eso."
  },
  {
    slug: "el-ano-de-la-emergencia",
    headline: "The Ratchet: Four Years Without a Way Back",
    headline_es: "El trinquete: cuatro años sin camino de regreso",
    subheadline: "A March 2020 emergency decree let federal health authorities buy what the epidemic required without a public tender. The direct-award rate barely moved — it was already 77.8%. Every full year from 2020 to 2024 was more direct than any year before it; the partial 2025 record, at 68.2%, is the first to fall back below.",
    subheadline_es: "Un decreto de emergencia de marzo de 2020 permitió a las autoridades federales de salud comprar lo que exigía la epidemia sin licitación pública. La tasa de adjudicación directa apenas se movió: ya estaba en 77.8%. Cada año completo de 2020 a 2024 fue más directo que cualquier año anterior; el registro parcial de 2025, con 68.2%, es el primero que vuelve a quedar por debajo."
  },
  {
    slug: "el-relevo-de-2018",
    headline: "The 2018 handover",
    headline_es: "El relevo de 2018",
    subheadline: "What happened to federal buying when Peña Nieto handed over to López Obrador: a shutdown ordered by the Treasury, an autumn at half pace, a vendor sweep and the 2019 medicines.",
    subheadline_es: "Qué pasó con la compra federal cuando Peña Nieto entregó a López Obrador: un cierre ordenado por Hacienda, un otoño a la mitad, un barrido de proveedores y las medicinas de 2019."
  },
  {
    slug: "el-modelo-bienestar",
    headline: "Buying at the pace of urgency: twelve «Bienestar» entities and how they buy",
    headline_es: "Comprar a la medida de la urgencia: doce entidades del aparato «Bienestar» y cómo compran",
    subheadline: "The entities that distribute food, provide health care to the uninsured and lend in the countryside buy in much the same way: almost all their contracts by direct award, in thousands of small purchases. None of the twelve passes: the best scores 5.4 out of 10. The grade measures how they buy, not whether anyone stole, which is why Segalmex, one of the best-documented fraud cases of the period, scores 5.4 and fails.",
    subheadline_es: "Las entidades que reparten comida, atienden la salud de quien no tiene seguro y prestan dinero en el campo compran de una manera muy parecida: casi todos sus contratos por adjudicación directa, en miles de compras pequeñas. Ninguna de las doce aprueba: la mejor saca 5.4 de 10. La calificación mide cómo compran, no si alguien robó, y por eso Segalmex, uno de los casos de fraude mejor documentados del periodo, saca 5.4 y reprueba."
  }
]

export function getStoryHeadline(slug: string): StoryHeadline | undefined {
  return STORY_HEADLINES.find((s) => s.slug === slug)
}
