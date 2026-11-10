import { useMemo } from 'react'
import { cieloHref } from '@/lib/vista'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { ariaApi } from '@/api/client'
import { getStoriesByLensTag, UNDER_EDITORIAL_REVIEW, type AriaPattern, type SectorCode } from '@/lib/story-content'
import { SECTOR_NAMES_EN, SECTOR_NAMES_ES, CATEGORICAL, CATEGORICAL_TEXT, getCaseFraudColor } from '@/lib/constants'
import { PlanaLeadBlock } from '@/components/journalists/PlanaLeadBlock'
import { PlanaDesk } from '@/components/journalists/PlanaDesk'
import { PlanaColofon } from '@/components/journalists/PlanaColofon'
import type { PlanaStory } from '@/components/journalists/plana-parts'
import { noOrphan, tidy } from '@/lib/typography'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import '@/components/journalists/journalists.css'

// ---------------------------------------------------------------------------
// INVESTIGATIONS — hardcoded editorial metadata (the front page's story set)
// ---------------------------------------------------------------------------

type FraudType = 'ghost_company' | 'procurement_fraud' | 'embezzlement' | 'monopoly' | 'overpricing'
type StatusKind = 'procesado' | 'auditado' | 'reporteado' | 'solo_datos'
type Era = 'pena' | 'amlo' | 'cross' | 'sheinbaum'

interface Investigation {
  slug: string
  headline: string
  headline_es?: string
  sub: string
  sub_es?: string
  type: FraudType
  status: StatusKind
  amount: number
  era: Era
  contracts: number
  brief: string
  brief_es?: string
  yearSpan?: string
}

// Lead = the direct-award story (no model in it); off-lead = a cross-era story.
const LEAD_SLUG = 'marea-de-adjudicaciones'
const OFFLEAD_SLUG = 'captura-institucional'

const ALL_INVESTIGATIONS: Investigation[] = [
  {
    slug: 'el-sexenio-del-riesgo',
    headline: 'The Ledger of Five Administrations',
    headline_es: 'El libro mayor de cinco sexenios',
    sub: 'EPN 6.34% · AMLO 7.84% · Sheinbaum 11.40% · v0.9.1',
    sub_es: 'EPN 6.34% · AMLO 7.84% · Sheinbaum 11.40% · v0.9.1',
    type: 'procurement_fraud',
    status: 'reporteado',
    amount: 2758,
    era: 'cross',
    contracts: 1048160,
    yearSpan: '2002–2025',
    brief: "The risk indicator reads higher under every administration than the one before, and the order holds with the contracts the model learned from set aside: Peña Nieto 6.34%, López Obrador 7.84%, Sheinbaum 11.40% (nine months). The register grew richer term by term too, so the climb is a reading, not a verdict. What changed under López Obrador was how money was awarded: more direct awards by value, fewer single-award procedures.",
    brief_es: 'El indicador de riesgo es más alto en cada sexenio que en el anterior, y el orden se sostiene sin los contratos de los que aprendió el modelo: Peña Nieto 6.34%, López Obrador 7.84%, Sheinbaum 11.40% (nueve meses). El registro también se volvió más rico, así que la subida es una lectura, no un veredicto. Lo que cambió con López Obrador fue cómo se adjudicó el dinero: más adjudicación directa por valor y menos procedimientos con un solo adjudicado.',
  },
  {
    slug: 'el-vacio',
    headline: 'Mexico Stopped Publishing Its Contracts as Data. We Rebuilt 98,290 Procedures From the Portal.',
    headline_es: 'México dejó de publicar sus contratos como datos. Reconstruimos 98,290 procedimientos desde el portal.',
    sub: 'ComprasMX gap · 78.3% direct award',
    sub_es: 'Hueco ComprasMX · 78.3% adjudicación directa',
    type: 'procurement_fraud',
    status: 'solo_datos',
    amount: 356.0,
    era: 'sheinbaum',
    contracts: 98290,
    yearSpan: '2025–2026',
    brief: 'CompraNet froze in September 2025, and its successor portal no longer publishes the winner and the price as data. By reverse-engineering it, RUBLI rebuilt 98,290 procedures published after the freeze — 78.3% direct awards, two in five with no amount of any kind.',
    brief_es: 'CompraNet se congeló en septiembre de 2025, y su portal sucesor ya no publica el ganador ni el precio como datos. Con ingeniería inversa, RUBLI reconstruyó 98,290 procedimientos publicados tras el congelamiento — 78.3% adjudicación directa, dos de cada cinco sin monto de ningún tipo.',
  },
  {
    slug: 'captura-institucional',
    headline: 'The Suppliers Who Cannot Leave',
    headline_es: 'Los proveedores que no pueden irse',
    sub: 'IMSS · CFE · PEMEX',
    sub_es: 'IMSS · CFE · PEMEX',
    type: 'monopoly',
    status: 'auditado',
    amount: 1077,
    era: 'cross',
    // The buyer groups carry vendor counts and value, not a contract total —
    // 0 is the card's "not applicable", and the renderer drops the line.
    contracts: 0,
    yearSpan: '2002–2025',
    brief: '8,586 companies send four fifths or more of everything they sell to a single government buyer; the average is 95%. At IMSS 2,068 of them hold 313.4 billion pesos between them — while no supplier comes close to dominating the institute in return.',
    brief_es: '8,586 empresas le venden cuatro quintas partes o más de todo lo suyo a un solo comprador de gobierno; el promedio es 95%. En el IMSS, 2,068 de ellas acumulan 313.4 mil millones de pesos — mientras ningún proveedor se acerca a dominar al instituto a cambio.',
  },
  {
    slug: 'el-cartel-de-los-vales',
    headline: 'Five Firms, a Closed Market, and a Winner That Keeps Changing',
    headline_es: 'Cinco empresas, un mercado cerrado y un ganador que no deja de cambiar',
    sub: 'Toka · Edenred · Efectivale · Si Vale · Sodexo',
    sub_es: 'Toka · Edenred · Efectivale · Si Vale · Sodexo',
    type: 'monopoly',
    status: 'auditado',
    amount: 142.6,
    era: 'cross',
    contracts: 10786,
    yearSpan: '2001–2025',
    brief: 'Five issuers hold 142.6 billion pesos of federal card contracts. 96.4% skipped an open contest; the lead changed hands three times.',
    brief_es: 'Cinco emisoras concentran 142.6 mil millones en contratos federales de tarjetas. El 96.4% no pasó por concurso abierto; el liderazgo cambió tres veces.',
  },
  {
    slug: 'el-monopolio-invisible',
    headline: 'Concentration in IMSS Medicine Purchasing',
    headline_es: 'Concentración en las compras de medicamentos del IMSS',
    sub: 'Grupo Fármacos · IMSS',
    type: 'monopoly',
    status: 'reporteado',
    amount: 133.2,
    era: 'cross',
    contracts: 6303,
    yearSpan: '2002–2025',
    brief: 'Four pharmaceutical distributors collected 326 billion pesos from IMSS over 23 years with no meaningful competition. Their combined risk indicator averages 0.96.',
    brief_es: 'A cuatro distribuidoras farmacéuticas se les contrataron 326 mil millones de pesos en el IMSS en 23 años, casi sin licitación. Su indicador de riesgo combinado promedia 0.96.',
  },
  {
    slug: 'el-ano-de-la-emergencia',
    headline: 'The Ratchet: Four Years Without a Way Back',
    headline_es: 'El trinquete: cuatro años sin camino de regreso',
    sub: '2021–24 floor 79.1% · above every pre-2020 year',
    sub_es: 'Piso 2021–24 de 79.1% · por encima de todo año pre-2020',
    type: 'procurement_fraud',
    status: 'reporteado',
    amount: 4.5,
    era: 'amlo',
    contracts: 158319,
    yearSpan: '2020–2021',
    brief: "Mexico's COVID emergency decree let health authorities buy without a public tender — and the direct-award rate barely moved, because it was already 77.8%. Every full year from 2020 to 2024 was more direct than any year before the pandemic; the partial 2025 record is the first to fall below.",
    brief_es: 'El decreto de emergencia COVID permitió a las autoridades de salud comprar sin licitación pública — y la tasa de adjudicación directa apenas se movió, porque ya estaba en 77.8%. Cada año completo de 2020 a 2024 fue más directo que cualquier año anterior a la pandemia; el registro parcial de 2025 es el primero que queda por debajo.',
  },
  {
    slug: 'la-ilusion-competitiva',
    headline: 'Now You See Competition',
    headline_es: 'Ahora usted ve competencia',
    sub: 'Single-award "competitive" procedures',
    sub_es: 'Procedimientos «competitivos» con un solo adjudicado',
    type: 'procurement_fraud',
    status: 'reporteado',
    amount: 0,
    era: 'cross',
    contracts: 361599,
    yearSpan: '2011–2024',
    brief: 'For 14 straight years, over 45% of Mexico\'s "competitive" procurement ended with exactly one winner — 362,000 contracts, peaking at 65.65% in 2014. CompraNet records winners, not bidders, so the count says how many firms won, not how many competed.',
    brief_es: 'Durante 14 años seguidos, más del 45% de la contratación "competitiva" de México terminó con exactamente un ganador — 362,000 contratos, con un pico de 65.65% en 2014. CompraNet registra ganadores, no licitantes: la cifra dice cuántas empresas ganaron, no cuántas compitieron.',
  },
  {
    slug: 'marea-de-adjudicaciones',
    // Matches the story's own h1 (SD-09). The card and the page must not greet
    // a reader with two different titles for the same investigation.
    headline: 'The 82 Percent Rule',
    headline_es: 'La regla del 82 por ciento',
    sub: 'Every completed term worse',
    type: 'procurement_fraud',
    status: 'reporteado',
    amount: 0,
    era: 'cross',
    // Direct awards 2011–2024, as the renderer reads it.
    contracts: 1931317,
    yearSpan: '2011–2024',
    brief: '82.18% of 2023 federal contracts were awarded without a contest — the highest of the 14 full years COMPRANET codes procedure type. Each completed administration since 2011 has run higher than the last.',
    brief_es: 'El 82.18% de los contratos federales de 2023 se adjudicó sin concurso — la lectura más alta de los 14 años completos que CompraNet codifica el tipo de procedimiento. Cada administración completa ha corrido más alto que la anterior.',
  },
  {
    slug: 'el-ejercito-fantasma',
    // Matches the story's own h1 (SD-06). The card and the page must not greet
    // a reader with two different titles for the same investigation.
    headline: 'The Man Who Won 370 Million Pesos and Disappeared',
    headline_es: 'El hombre que ganó 370 millones de pesos y desapareció',
    sub: 'P2 ghost-company pattern',
    type: 'ghost_company',
    status: 'solo_datos',
    // Billions of pesos, as the renderer reads it — the P2 cohort's lifetime
    // federal contracting, 19.6B (Oct 13 2026 ARIA run).
    amount: 19.6,
    era: 'cross',
    contracts: 0,
    yearSpan: '2002–2025',
    brief: "RUBLI's ghost-company pattern flags 3,024 vendors across 23 years (October 2026 run). They appear, win contracts, then vanish from the tax registry — 203 of them, 6.7%, carry SAT's definitive Article 69-B listing.",
    brief_es: 'El patrón de empresa fantasma de RUBLI marca a 3,024 proveedores en 23 años (corrida de octubre de 2026). Aparecen, ganan contratos y desaparecen del registro fiscal — 203 de ellos, el 6.7%, llevan el listado definitivo del SAT bajo el Artículo 69-B.',
  },
  {
    slug: 'el-gran-precio',
    headline: 'The Contracts No One Is Watching Are the Biggest Ones',
    headline_es: 'Los contratos que nadie vigila son los más grandes',
    sub: '40 mega-contracts above 10B',
    type: 'overpricing',
    status: 'reporteado',
    amount: 0,
    era: 'cross',
    contracts: 3000000,
    yearSpan: '2002–2025',
    brief: "Across 3 million contracts, risk rises in near-lockstep with size: the 40 contracts above 10 billion pesos — 819 billion in all — are every one high-risk, and oversight runs thinnest exactly there.",
    brief_es: 'En 3 millones de contratos, el riesgo sube casi en paralelo con el tamaño: los 40 contratos por encima de 10 mil millones — 819 mil millones en total — son todos de alto riesgo, y la fiscalización es más débil justo ahí.',
  },
  {
    slug: 'la-industria-del-intermediario',
    // Matches the story's own h1 (SD-05). The card and the page must not
    // greet a reader with two different titles for the same investigation.
    headline: 'Follow the Middleman',
    headline_es: 'Sigan al intermediario',
    sub: 'P3 pass-through vendors',
    type: 'procurement_fraud',
    status: 'solo_datos',
    // Billions of pesos, as the renderer reads it — the P3 cohort's lifetime
    // federal contracting, 448.8B (Oct 13 2026 ARIA run).
    amount: 449,
    era: 'cross',
    contracts: 0,
    yearSpan: '2002–2025',
    brief: '2,537 vendors match the pass-through pattern and hold 448.8 billion pesos between them. But more than a third of the money at the top of that list has already been reviewed and ruled out — and 2,306 of the 2,537 have never been opened at all.',
    brief_es: '2,537 proveedores coinciden con el patrón de paso y acumulan 448.8 mil millones de pesos. Pero más de una tercera parte del dinero de la cima de esa lista ya fue revisado y descartado — y 2,306 de los 2,537 no se han abierto nunca.',
  },
  {
    slug: 'el-umbral-de-los-300k',
    headline: 'The Prices That End in Zeros',
    headline_es: 'Los precios que terminan en ceros',
    sub: 'Contracts written on round numbers',
    type: 'overpricing',
    status: 'solo_datos',
    amount: 0,
    era: 'cross',
    // Contracts in the 200K-400K band written on an exact multiple of 10,000.
    contracts: 22263,
    yearSpan: '2002–2025',
    brief: '22,263 contracts between 200,000 and 400,000 pesos are written on an exact multiple of ten thousand — up to 29 times the count a thousand pesos to either side. 81.5% of them were awarded without a contest, against 70.8% of the band.',
    brief_es: '22,263 contratos de 200 mil a 400 mil pesos están escritos sobre un múltiplo exacto de diez mil — hasta 29 veces el conteo a mil pesos de cualquier lado. El 81.5% se adjudicó sin licitación, contra el 70.8% de la banda.',
  },
  {
    slug: 'volatilidad-el-precio-del-riesgo',
    headline: "The Smoking Gun Is a Number",
    headline_es: 'La pistola humeante es un número',
    sub: 'Strongest predictor · v0.9.1',
    type: 'overpricing',
    status: 'solo_datos',
    amount: 0,
    era: 'cross',
    contracts: 3051294,
    yearSpan: '2002–2025',
    brief: "Price volatility is the single strongest predictor in RUBLI's risk model (coefficient +0.729), ahead of 26 other features. It captures the forensic fingerprint of negotiated — not competed — prices.",
    brief_es: 'La volatilidad de precios es el predictor más fuerte del modelo de RUBLI (coeficiente +0.729), por encima de otros 26 factores. Captura la huella forense de precios negociados, no competidos.',
  },
  {
    slug: 'el-modelo-bienestar',
    headline: 'Buying at the pace of urgency: twelve «Bienestar» entities and how they buy',
    headline_es: 'Comprar a la medida de la urgencia: doce entidades del aparato «Bienestar» y cómo compran',
    sub: 'Diconsa · Segalmex · INSABI · IMSS-Bienestar · grade v3',
    sub_es: 'Diconsa · Segalmex · INSABI · IMSS-Bienestar · calificación v3',
    type: 'procurement_fraud',
    status: 'auditado',
    amount: 578.4,
    era: 'cross',
    contracts: 396547,
    yearSpan: '2001–2025',
    brief: "Twelve «Bienestar» entities bought 578 billion pesos, most of it by direct award (63% of pesos and 91% of contracts in 2019–2025); all of it went through entities that fail (under 6 out of 10), against 56% across the federal government. None passes: the best scores 5.4. Segalmex, one of the best-documented fraud cases of the period, scores 5.4 and fails: the grade measures buying behaviour, not theft.",
    brief_es: 'Doce entidades «Bienestar» compraron 578 mil millones de pesos, la mayoría por adjudicación directa (63% de los pesos y 91% de los contratos en 2019–2025); todo pasó por entidades reprobadas (menos de 6 de 10), contra 56% del gobierno federal. Ninguna aprueba: la mejor saca 5.4. Segalmex, uno de los casos de fraude mejor documentados del periodo, saca 5.4 y reprueba: la calificación mide el comportamiento de compra, no el robo.',
  },
  {
    slug: 'el-relevo-de-2018',
    headline: 'The 2018 handover',
    headline_es: 'El relevo de 2018',
    sub: 'Treasury shutdown · vendor sweep · 2019 medicines',
    sub_es: 'Cierre de Hacienda · barrido de proveedores · medicinas de 2019',
    type: 'procurement_fraud',
    status: 'reporteado',
    amount: 31.0,
    era: 'cross',
    contracts: 2649150,
    yearSpan: '2013–2025',
    brief: 'From 23 August to 30 November 2018 the federal government contracted 44% of a normal autumn, after a Treasury circular; 222 of 284 institutions bought far below their own pace. In López Obrador’s first year 49 of every 100 vendors with more than a million pesos stopped selling, against 35–40 in comparable years.',
    brief_es: 'Del 23 de agosto al 30 de noviembre de 2018 el gobierno federal contrató 44% de un otoño normal, tras una circular de Hacienda; 222 de 284 instituciones compraron muy por debajo de su propio ritmo. En el primer año de López Obrador, 49 de cada 100 proveedores con más de un millón de pesos dejaron de vender, contra 35–40 en años comparables.',
  },
]

const INVESTIGATIONS = ALL_INVESTIGATIONS.filter((i) => !UNDER_EDITORIAL_REVIEW.has(i.slug))

const TYPE_LABEL: Record<FraudType, { en: string; es: string }> = {
  ghost_company: { en: 'Ghost companies', es: 'Empresas fantasma' },
  procurement_fraud: { en: 'Procurement', es: 'Contratación' },
  embezzlement: { en: 'Embezzlement', es: 'Desvío de recursos' },
  monopoly: { en: 'Market capture', es: 'Captura de mercado' },
  overpricing: { en: 'Overpricing', es: 'Sobreprecio' },
}

// Distance-to-consequence ladder — drives the agate rubric's ink weight + order.
const STATUS_RANK: Record<StatusKind, PlanaStory['statusRank']> = {
  procesado: 'consequence',
  auditado: 'consequence',
  reporteado: 'reported',
  solo_datos: 'lead',
}
const RANK_ORDER: Record<PlanaStory['statusRank'], number> = { consequence: 0, reported: 1, lead: 2 }

// i18n fallbacks (keys live in journalists.json; these guard against a missing key).
const STATUS_FALLBACK: Record<StatusKind, { en: string; es: string }> = {
  procesado: { en: 'Prosecuted', es: 'Procesado' },
  auditado: { en: 'Under audit', es: 'Bajo auditoría' },
  reporteado: { en: 'Reported', es: 'Reportado' },
  solo_datos: { en: 'Data lead', es: 'Pista de datos' },
}
const ERA_FALLBACK: Record<Era, { en: string; es: string }> = {
  pena: { en: 'EPN · 2012–2018', es: 'EPN · 2012–2018' },
  amlo: { en: 'AMLO · 2018–2024', es: 'AMLO · 2018–2024' },
  cross: { en: 'Cross-era', es: 'Varios sexenios' },
  sheinbaum: { en: 'Sheinbaum · 2024–', es: 'Sheinbaum · 2024–' },
}
const STATUS_ORDER: StatusKind[] = ['procesado', 'auditado', 'reporteado', 'solo_datos']

// The fraud type's categorical mark (same keys and hues as /cases, DESIGN.md §6.3) and its text twin.
const typeInk = (type: FraudType) => {
  const color = getCaseFraudColor(type)
  const i = (CATEGORICAL as readonly string[]).indexOf(color)
  return { color, ink: i >= 0 ? CATEGORICAL_TEXT[i] : CATEGORICAL_TEXT[7] }
}

// ---------------------------------------------------------------------------
// Main page — «Sala de Redacción»: the newsroom prints its own front page,
// on «El Contrato» (DocHead → Cover with the rubric → En portada → El sumario →
// Para seguir → Fe de plana; Firmas live in the shell).
// ---------------------------------------------------------------------------

export default function Journalists() {
  const { t, i18n } = useTranslation('journalists')
  const [searchParams, setSearchParams] = useSearchParams()
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const isEs = lang === 'es'

  // Cross-surface lens filter (from the Atlas)
  const lensPattern = searchParams.get('pattern') as AriaPattern | null
  const lensSector = searchParams.get('sector') as SectorCode | null
  const lensFilterActive = !!(lensPattern || lensSector)
  const lensFilteredSlugs = useMemo(() => {
    if (!lensFilterActive) return null
    return new Set(
      getStoriesByLensTag({ pattern: lensPattern ?? undefined, sector: lensSector ?? undefined }).map((s) => s.slug),
    )
  }, [lensPattern, lensSector, lensFilterActive])

  // Status counts drive the thesis, the rubric and the colophon (all computed, none hardcoded).
  const counts = useMemo(() => {
    const c: Record<StatusKind, number> = { procesado: 0, auditado: 0, reporteado: 0, solo_datos: 0 }
    for (const inv of INVESTIGATIONS) c[inv.status]++
    return c
  }, [])
  const total = INVESTIGATIONS.length

  // The wire: tier-1 count + link only — no vendor names (tier 1 is a model output, not an investigation).
  const { data: t1 } = useQuery({
    queryKey: ['aria', 'journalists-ticker'],
    queryFn: () => ariaApi.getQueue({ tier: 1, per_page: 1 }),
    staleTime: 5 * 60 * 1000,
  })
  const t1Total = t1?.pagination?.total ?? null

  const fmt = (n: number) => n.toLocaleString(isEs ? 'es-MX' : 'en-US')

  // Map one investigation to the localized shape the front-page parts render.
  const toPlana = (inv: Investigation, withContracts: boolean): PlanaStory => ({
    slug: inv.slug,
    headline: noOrphan(tidy(isEs ? inv.headline_es ?? inv.headline : inv.headline, isEs ? 'es' : 'en'), 20),
    brief: isEs ? inv.brief_es ?? inv.brief : inv.brief,
    ...typeInk(inv.type),
    typeLabel: isEs ? TYPE_LABEL[inv.type].es : TYPE_LABEL[inv.type].en,
    statusLabel: t(`status.${inv.status}`, { defaultValue: isEs ? STATUS_FALLBACK[inv.status].es : STATUS_FALLBACK[inv.status].en }),
    statusRank: STATUS_RANK[inv.status],
    eraLabel: t(`eraLabel.${inv.era}`, { defaultValue: isEs ? ERA_FALLBACK[inv.era].es : ERA_FALLBACK[inv.era].en }),
    contractsLabel:
      withContracts && inv.contracts > 0
        ? `${fmt(inv.contracts)} ${isEs ? 'contratos' : 'contracts'}`
        : null,
  })

  // Partition (lens-filtered subset when a lens is active).
  const shownInvs = useMemo(
    () => (lensFilteredSlugs ? INVESTIGATIONS.filter((i) => lensFilteredSlugs.has(i.slug)) : INVESTIGATIONS),
    [lensFilteredSlugs],
  )
  const leadInv = shownInvs.find((i) => i.slug === LEAD_SLUG) ?? shownInvs[0] ?? null
  const offLeadInv = shownInvs.find((i) => i.slug === OFFLEAD_SLUG && i.slug !== leadInv?.slug) ?? null
  const restInvs = shownInvs
    .filter((i) => i.slug !== leadInv?.slug && i.slug !== offLeadInv?.slug)
    .sort((a, b) => RANK_ORDER[STATUS_RANK[a.status]] - RANK_ORDER[STATUS_RANK[b.status]])

  const leadPlana = leadInv ? toPlana(leadInv, true) : null
  const offLeadPlana = offLeadInv ? toPlana(offLeadInv, true) : null
  const restPlana = restInvs.map((i) => toPlana(i, false))
  const allShownPlana = shownInvs.map((i) => toPlana(i, false))

  const clearLens = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('pattern')
    next.delete('sector')
    setSearchParams(next, { replace: true })
  }

  const statusWord = (s: StatusKind) => t(`status.${s}`, { defaultValue: isEs ? STATUS_FALLBACK[s].es : STATUS_FALLBACK[s].en })
  const nInv = (n: number) => `${n} ${isEs ? (n === 1 ? 'investigación' : 'investigaciones') : n === 1 ? 'investigation' : 'investigations'}`

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <DocHead trail={[{ label: isEs ? 'Sala de Redacción' : 'The Newsroom' }]} />

        <Cover className="is-op" title={isEs ? 'Sala de Redacción' : 'The Newsroom'} />

        {/* ── Lens filter (from the Atlas) ── */}
        {lensFilterActive && (
          <div className="jx-lens">
            <span className="ct-note ct-mono !mt-0">{isEs ? 'Desde el Atlas' : 'From the Atlas'}</span>
            <button type="button" className="jx-chip" onClick={clearLens} aria-label={isEs ? 'Quitar el filtro del Atlas' : 'Clear the Atlas filter'}>
              {lensPattern && <>{isEs ? 'Patrón' : 'Pattern'} {lensPattern}</>}
              {lensPattern && lensSector && ' · '}
              {lensSector && <>{isEs ? 'Sector' : 'Sector'} {(isEs ? SECTOR_NAMES_ES[lensSector] : SECTOR_NAMES_EN[lensSector]) ?? lensSector}</>}
              <span aria-hidden="true"><X className="h-3.5 w-3.5" /></span>
            </button>
          </div>
        )}

        {/* ── The object: the front page — the lead, the off-lead, then the list ── */}
        <section className="jx-front" aria-label={isEs ? 'La primera plana' : 'The front page'}>
          {shownInvs.length === 0 ? (
            <p>
              {isEs ? 'Ninguna investigación coincide con este filtro. ' : 'No investigations match this filter. '}
              <button type="button" className="ct-link" onClick={clearLens}>{isEs ? 'Quitar el filtro' : 'Clear the filter'}</button>
            </p>
          ) : lensFilterActive ? (
            // Filtered mode — the front page collapses to one flat list (avoids half-empty tiers)
            <PlanaDesk stories={allShownPlana} lang={lang} />
          ) : (
            <>
              {leadPlana && <PlanaLeadBlock lead={leadPlana} offLead={offLeadPlana} lang={lang} />}
              {restPlana.length > 0 && <div className="jx-front-desk"><PlanaDesk stories={restPlana} lang={lang} /></div>}
            </>
          )}
        </section>

        {/* ── En cifras: the rubric at this cut — distance to consequence ── */}
        <section className="ct-clauses" aria-labelledby="jx-cl-h">
          <h2 id="jx-cl-h">{isEs ? 'En cifras' : 'In figures'}</h2>
          <div className="ct-cl-grid">
            {STATUS_ORDER.map((st) => (
              <Clause
                key={st}
                id={`jx-cl-${st}`}
                title={statusWord(st)}
                fig={String(counts[st])}
                ruler={{ value: total ? counts[st] / total : 0, mode: 'fill', color: CATEGORICAL[0], ends: ['0', '', String(total)] }}
                note={isEs ? `de ${nInv(total)}` : `of ${nInv(total)}`}
              />
            ))}
          </div>
        </section>

        {/* ── Para seguir: the wire (ARIA tier 1) and the map ── */}
        <section className="ct-section" aria-labelledby="jx-follow-h">
          <div className="ct-annex-row">
            <h2 id="jx-follow-h" className="ct-h2">{isEs ? 'Para seguir' : 'Keep going'}</h2>
          </div>
          <div className="ct-section-body jx-follow">
            <div>
              <h3>{isEs ? 'El cable · ARIA nivel 1' : 'The wire · ARIA tier 1'}</h3>
              <p>
                <span className="ct-mono">{t1Total != null ? fmt(t1Total) : '—'}</span>{' '}
                {isEs
                  ? 'proveedores con las puntuaciones más altas del indicador de riesgo. Es una salida del modelo, no una investigación.'
                  : 'vendors with the highest risk-indicator scores. It is model output, not an investigation.'}
              </p>
              <Link to="/aria" className="ct-more ct-link">{isEs ? 'Abrir la fila de investigación' : 'Open the investigation queue'}</Link>
            </div>
            <div>
              <h3>{isEs ? 'El Mapa · Vínculos' : 'The Map · Connections'}</h3>
              <p>
                {isEs
                  ? 'Un mapa vivo de cúmulos de proveedores por escala e indicador de riesgo, para seguir a una empresa hasta sus compradores.'
                  : 'A live map of vendor clusters by scale and risk indicator, to follow a company to its buyers.'}
              </p>
              <Link to={cieloHref()} className="ct-more ct-link">{isEs ? 'Explorar el mapa' : 'Explore the map'}</Link>
            </div>
          </div>
        </section>

        {/* ── Declaraciones: the thesis + the rubric's method and limits ── */}
        <PlanaColofon lang={lang} total={total} procesadoCount={counts.procesado} lede={counts.procesado === 0
            ? (isEs
              ? `${total} investigaciones sobre el dinero federal; ninguna ha llegado a proceso. Cada una lleva su rúbrica de avance, de la pista de datos al proceso: mide la distancia entre el dato y la consecuencia, no la gravedad del hallazgo.`
              : `${total} investigations into federal money; none has reached prosecution. Each carries its progress rubric, from data lead to prosecution: it measures the distance between data and consequence, not the gravity of the finding.`)
            : (isEs
              ? `${total} investigaciones sobre el dinero federal; ${counts.procesado} en proceso, ${counts.auditado} bajo auditoría. La rúbrica mide la distancia entre el dato y la consecuencia, no la gravedad del hallazgo.`
              : `${total} investigations into federal money; ${counts.procesado} prosecuted, ${counts.auditado} under audit. The rubric measures the distance between data and consequence, not the gravity of the finding.`)} />
      </div>
    </article>
  )
}
