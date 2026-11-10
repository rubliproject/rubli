/**
 * RiskExplainer — "Why This Score?" explainer cards for each risk factor
 *
 * Based on Section 15.1 of RUBLI_TECHNICAL_SPEC.md.
 * Literature basis: XAI (Explainable AI) research + OECD AI principles.
 * The Romania study (Fazekas et al.) found simple explanations increased
 * journalist and policymaker adoption of algorithmic risk tools.
 *
 * Components:
 *   RiskFactorBadge   — inline badge with hover/click explainer card
 *   RiskFactorTable   — tabular display of all 16 factors (for Glossary/Methodology pages)
 *   RiskFactorCard    — standalone card for a single factor
 *
 * Every string is bilingual, Spanish first (CLAUDE.md rule 6).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BookOpen, TrendingUp, TrendingDown, Minus, FlaskConical } from 'lucide-react'

type Bi = { es: string; en: string }

/** Spanish unless the UI is in English. */
function useLang(): 'es' | 'en' {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'es'
}

// ---------------------------------------------------------------------------
// FACTOR_EXPLANATIONS — evidence base for 16 risk factors; coefficients synced to v0.9.2 (2026-10-23,
// docs/FACTCHECK_V092_COEFS_2026-10-23.md). Five are not in v0.9.2 and show 0 / neutral.
// ---------------------------------------------------------------------------

export interface FactorExplanation {
  title: Bi
  coefficient: number
  direction: 'positive' | 'negative' | 'neutral'
  mechanism: Bi
  theory: Bi
  citation: Bi
  rubli_note: Bi
}

const FACTOR_EXPLANATIONS: Record<string, FactorExplanation> = {
  vendor_concentration: {
    title: { es: 'Concentración de mercado', en: 'Market Concentration' },
    coefficient: 0.173,
    direction: 'positive',
    mechanism: {
      es: 'Cuando un proveedor capta una parte desproporcionada de los contratos de una institución, sugiere un monopolio legítimo o un acceso exclusivo obtenido mediante corrupción. En casos documentados, redes de empresas fantasma captaron más del 90% del gasto de una institución.',
      en: "When one vendor captures a disproportionate share of an institution's contracts, it suggests either a legitimate monopoly or exclusive access through corruption. Ghost company networks captured >90% of institutional spending in documented cases.",
    },
    theory: {
      es: 'Teoría principal-agente (Klitgaard 1988): el poder monopólico es la condición habilitante principal de la corrupción en compras: elimina la competencia de precios y reduce la posibilidad de comparar contra precios de mercado.',
      en: 'Principal-Agent Theory (Klitgaard 1988): Monopoly power is the primary enabling condition for procurement corruption — it eliminates price competition and reduces the ability to compare against market rates.',
    },
    citation: { es: 'Fazekas y Kocsis (2020), British Journal of Political Science', en: 'Fazekas & Kocsis (2020), British Journal of Political Science' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.173 (moderado; lugar 7 de 16 variables no nulas por magnitud). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.173 (moderate; rank 7 of 16 non-zero features by magnitude). A higher value raises the score.',
    },
  },
  price_volatility: {
    title: { es: 'Montos muy dispares entre sus contratos', en: 'Uneven contract sizes' },
    coefficient: 0.811,
    direction: 'positive',
    mechanism: {
      es: 'Los proveedores cuyos montos varían muchísimo frente a contratos parecidos de su sector no se comportan como un mercado normal: unas veces ganan contratos mucho más grandes y otras mucho más chicos que lo usual. RUBLI ve montos, no precios unitarios: es una señal sobre el tamaño de los contratos, no un sobreprecio comprobado.',
      en: 'Vendors whose contract amounts vary wildly against similar contracts in their sector do not behave like a normal market: some contracts are far larger and others far smaller than usual. RUBLI sees amounts, not unit prices: this is a signal about contract size, not proven overpricing.',
    },
    theory: {
      es: 'Teoría de búsqueda de rentas (Tullock 1967): las rentas se extraen inflando precios por encima del nivel competitivo. Porter y Zona (1993): la manipulación de precios se detecta en la distribución de ofertas: las empresas coludidas muestran varianzas inusuales.',
      en: 'Rent-Seeking Theory (Tullock 1967): Rents are extracted through price inflation above competitive levels. Porter & Zona (1993): Price manipulation is detectable in bid distributions — colluding firms show unusual variance patterns.',
    },
    citation: { es: 'Porter y Zona (1993): la manipulación de precios se detecta en la distribución de ofertas', en: 'Porter & Zona (1993): Price manipulation detectable in bid distributions' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.811 (grande; lugar 1 de 16 variables no nulas por magnitud; también encabezaba v0.9.1). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.811 (large; rank 1 of 16 non-zero features by magnitude; it also led v0.9.1). A higher value raises the score.',
    },
  },
  institution_diversity: {
    title: { es: 'Concentración por institución (HHI)', en: 'Institution Concentration (HHI)' },
    coefficient: 0.771,
    direction: 'positive',
    mechanism: {
      es: 'Índice de Herfindahl de qué tan concentrado está el negocio de un proveedor entre las instituciones que le compran: alto cuando una sola institución concentra la mayor parte. Los proveedores capturados suelen estar en el extremo alto.',
      en: "Herfindahl index of how concentrated a vendor's business is across buying institutions: high when one institution accounts for most of it. Captured vendors typically sit at the high end.",
    },
    theory: {
      es: 'Teoría de la competencia (Coviello y Mariniello 2014): la competencia y la transparencia reducen la concentración de adjudicaciones. Un proveedor con muchos compradores está más expuesto a rendir cuentas y no puede corromperlos a todos a la vez.',
      en: 'Competition Theory (Coviello & Mariniello 2014): Competition and transparency reduce award concentration. Vendors serving many buyers have more accountability exposure and less ability to corrupt all of them simultaneously.',
    },
    citation: { es: 'Coviello y Mariniello (2014): la competencia y la transparencia reducen la concentración de adjudicaciones', en: 'Coviello & Mariniello (2014): Competition and transparency reduce award concentration' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.771 (grande; lugar 2 de 16 variables no nulas) sobre la versión a la fecha de este índice (inst_hhi_prior: instituciones atendidas en los años previos al contrato; 1.0 si el proveedor no tiene historial). A igual amplitud, un proveedor concentrado en pocos compradores tiene un indicador más alto. v0.9.1 usaba una versión de todo el periodo (+0.0004, despreciable); en v0.8.5 era -0.388.',
      en: 'v0.9.2 coefficient +0.771 (large; rank 2 of 16 non-zero features) on the as-of version of this index (inst_hhi_prior: institutions served in years before the contract; 1.0 when the vendor has no history). At equal breadth, a vendor concentrated on few buyers scores higher. v0.9.1 used an all-time version (+0.0004, negligible); in v0.8.5 it was -0.388.',
    },
  },
  win_rate: {
    title: { es: 'Tasa de victorias', en: 'Win Rate' },
    coefficient: 0.012,
    direction: 'positive',
    mechanism: {
      es: 'Una tasa de victorias muy por encima de la base del sector puede ser sospechosa o legítima según el contexto. En la base ampliada de casos de México, las tasas altas no distinguen bien: algunos proveedores legítimos dominantes en su mercado ganan mucho.',
      en: "A vendor's win rate far above the sector baseline could be suspicious or legitimate depending on context. In Mexico's expanded ground truth, high win rates are not a strong discriminator — some legitimate market-dominant vendors have high win rates.",
    },
    theory: {
      es: 'Teoría de los cárteles de licitación (Conley y Decarolis 2016): los cárteles se detectan analizando patrones de victorias. Pero el análisis de México muestra que una tasa alta puede reflejar tanto corrupción como dominio legítimo del mercado.',
      en: 'Bid-Ring Theory (Conley & Decarolis 2016): Bid rings are detectable via win pattern analysis. However, Mexico-specific analysis shows high win rates can reflect both corruption and legitimate market dominance.',
    },
    citation: { es: 'Conley y Decarolis (2016): los cárteles de licitación se detectan por sus patrones de victorias', en: 'Conley & Decarolis (2016): Bid rings detectable via win pattern analysis' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.012 (despreciable; lugar 15 de 16 variables no nulas por magnitud).',
      en: 'v0.9.2 coefficient +0.012 (negligible; rank 15 of 16 non-zero features by magnitude).',
    },
  },
  sector_spread: {
    title: { es: 'Dispersión sectorial', en: 'Sector Spread' },
    coefficient: -0.187,
    direction: 'negative',
    mechanism: {
      es: 'Los proveedores que operan en muchos sectores tienen una exposición diversificada. Sin embargo, el análisis de casos de RUBLI muestra que algunas redes de corrupción operan a propósito en varios sectores para no ser detectadas. En v0.9.2 la presencia multisectorial tiene peso negativo una vez que la amplitud se mide directamente.',
      en: "Vendors operating across many sectors have diversified risk exposure. However, RUBLI's case analysis shows some corruption networks intentionally operate across sectors to avoid detection. In v0.9.2 cross-sector presence carries a negative weight once breadth is measured directly.",
    },
    theory: {
      es: 'Base ampliada de casos: algunos casos mayores de corrupción (el ecosistema LICONSA, redes en el IMSS) abarcan varios sectores. La dispersión sectorial por sí sola no basta para distinguir corrupción.',
      en: 'Extended ground truth: Some major corruption cases (LICONSA ecosystem, IMSS networks) span multiple sectors. Sector spread alone is insufficient for distinguishing corruption.',
    },
    citation: { es: 'Análisis de casos documentados de RUBLI', en: 'RUBLI ground truth analysis' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 -0.187 (moderado; lugar 6 de 16 variables no nulas por magnitud). Un valor más alto baja el indicador.',
      en: 'v0.9.2 coefficient -0.187 (moderate; rank 6 of 16 non-zero features by magnitude). A higher value lowers the score.',
    },
  },
  industry_mismatch: {
    title: { es: 'Giro no coincidente', en: 'Industry Mismatch' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Cuando el giro principal de un proveedor no coincide con el sector del contrato, sugiere una empresa fachada (sin capacidad operativa real en el ramo) o un favoritismo que se impone a los requisitos técnicos.',
      en: "When a vendor's primary industry doesn't match the contract sector, it suggests either a shell company (with no real operational capacity in the field) or favoritism overriding technical qualification requirements.",
    },
    theory: {
      es: 'Teoría de las empresas fachada (Fazekas y Kocsis 2020): las empresas fantasma se crean con giros genéricos o no coincidentes para cobrar por trabajos que en realidad hace la red corrupta.',
      en: 'Shell Company Theory (Fazekas & Kocsis 2020): Ghost companies are created with generic or mismatched industry classifications to collect payments for work actually performed by the corrupt network.',
    },
    citation: { es: 'Fazekas y Kocsis (2020), British Journal of Political Science', en: 'Fazekas & Kocsis (2020), British Journal of Political Science' },
    rubli_note: {
      es: 'No está en v0.9.2: la enmienda 2 del prerregistro la retiró porque la cobertura de giro verificado es mayor en los proveedores de casos (22.6% frente a 13.7%), así que en parte codificaría «ya investigado». v0.9.1: +0.032.',
      en: 'Not in v0.9.2: dropped by pre-registration amendment 2 because verified-industry coverage is higher for case vendors (22.6% vs 13.7%), so it would partly encode «already investigated». v0.9.1: +0.032.',
    },
  },
  same_day_count: {
    title: { es: 'Adjudicaciones el mismo día', en: 'Same-Day Award Count' },
    coefficient: 0.094,
    direction: 'positive',
    mechanism: {
      es: 'Varios contratos al mismo proveedor el mismo día sugieren el fraccionamiento artificial de un contrato mayor en piezas pequeñas, cada una bajo el umbral que obliga a licitar. Así se elude la ley de adquisiciones.',
      en: 'Multiple contracts awarded to the same vendor on the same day suggests artificial splitting of a larger contract into smaller pieces, each below the threshold requiring competitive bidding. This circumvents procurement law.',
    },
    theory: {
      es: 'Teoría del juego con umbrales (ISO 37001 antisoborno): fraccionar contratos para evitar los umbrales de licitación es una técnica de fraude documentada. La LAASSP fija los umbrales a partir de los cuales la licitación pública es obligatoria.',
      en: 'Threshold Gaming Theory (ISO 37001 Anti-Bribery): Splitting contracts to avoid competitive bidding thresholds is a documented fraud technique. The LAASSP defines specific thresholds above which public tender is mandatory.',
    },
    citation: { es: 'ISO 37001, sistemas de gestión antisoborno', en: 'ISO 37001 Anti-Bribery Management Systems' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.094 (pequeño; lugar 9 de 16 variables no nulas por magnitud). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.094 (small; rank 9 of 16 non-zero features by magnitude). A higher value raises the score.',
    },
  },
  direct_award: {
    title: { es: 'Adjudicación directa (sin competencia)', en: 'Direct Award (Non-Competitive)' },
    coefficient: 0.049,
    direction: 'positive',
    mechanism: {
      es: 'Los contratos adjudicados sin licitación quitan el control del mercado sobre precio y calidad del proveedor y maximizan la discrecionalidad del funcionario. Son legales bajo ciertas condiciones, pero la ausencia de competencia facilita la corrupción.',
      en: 'Contracts awarded without competitive bidding remove the market check on price and vendor quality, and maximize official discretion. Legal under certain conditions, but the absence of competition enables corruption.',
    },
    theory: {
      es: 'Teoría principal-agente: la discrecionalidad es la segunda condición habilitante (después del monopolio). La adjudicación directa la maximiza: el funcionario puede elegir a cualquier proveedor sin justificarlo mediante competencia de precios.',
      en: 'Principal-Agent Theory: Discretion is the second enabling condition (after monopoly). Direct awards maximize official discretion — the awarding official can choose any vendor without justifying the choice through price competition.',
    },
    citation: { es: 'OCDE (2016): Prevenir la corrupción en la contratación pública', en: 'OECD (2016): Preventing Corruption in Public Procurement' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.049 (pequeño; lugar 13 de 16 variables no nulas por magnitud). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.049 (small; rank 13 of 16 non-zero features by magnitude). A higher value raises the score.',
    },
  },
  ad_period_days: {
    title: { es: 'Periodo de convocatoria', en: 'Advertisement Period' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Días entre la publicación de la convocatoria y la adjudicación. Contra lo que se esperaría, en México los proveedores de casos conocidos suelen operar con procedimientos de duración normal, no apresurados: la corrupción ocurre al elegir al proveedor, no al manipular los plazos.',
      en: 'Days between posting a procurement opportunity and awarding the contract. Counterintuitively, known-corrupt vendors in Mexico tend to operate through normal-length procedures rather than rushed ones — the corruption happens through vendor selection, not timeline manipulation.',
    },
    theory: {
      es: 'Teoría de la transparencia (Directiva UE 2014/24): los periodos de convocatoria cortos reducen la participación. Pero los datos de México muestran que los proveedores de casos conocidos suelen cumplir los plazos mientras manipulan la selección.',
      en: 'Transparency Theory (EU Directive 2014/24): Short advertisement periods reduce bidder participation. However, Mexico-specific data shows known-bad vendors often comply with timeline requirements while manipulating vendor selection.',
    },
    citation: { es: 'Directiva UE 2014/24, plazos mínimos', en: 'EU Directive 2014/24 minimum timelines' },
    rubli_note: {
      es: 'No está en v0.9.2: la enmienda 1 del prerregistro la retiró porque las fechas de apertura solo existen en los registros de ComprasMX, así que marcaría la fuente de datos y no el riesgo. v0.9.1: +0.053.',
      en: 'Not in v0.9.2: dropped by pre-registration amendment 1 because opening dates exist only in ComprasMX records, so it would mark the data source rather than risk. v0.9.1: +0.053.',
    },
  },
  network_member_count: {
    title: { es: 'Pertenencia a una red', en: 'Network Membership' },
    coefficient: 0.111,
    direction: 'positive',
    mechanism: {
      es: 'Los proveedores que pertenecen a un grupo de entidades relacionadas (domicilios o representantes legales compartidos, o patrones constantes de licitación conjunta) pueden formar parte de redes de empresas fachada o de cárteles de licitación.',
      en: 'Vendors belonging to a group of related entities (sharing addresses, legal representatives, or consistent co-bidding patterns) may be part of shell company networks or bid-rigging cartels.',
    },
    theory: {
      es: 'Teoría de redes de la corrupción (Wachs et al. 2021): el fraude en compras suele involucrar redes coordinadas de empresas. Estar conectado con otros proveedores es una señal de riesgo.',
      en: 'Network Theory of Corruption (Wachs et al. 2021): Procurement fraud often involves coordinated networks of companies. Network membership — being connected to other vendors — is a risk signal.',
    },
    citation: { es: 'Fazekas, Skuhrovec y Wachs (2020): análisis de redes en grafos de contratación', en: 'Fazekas, Skuhrovec & Wachs (2020): Network analysis of procurement graphs' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.111 (pequeño; lugar 8 de 16 variables no nulas por magnitud), contando solo miembros activos antes del año del contrato. Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.111 (small; rank 8 of 16 non-zero features by magnitude), counting only members active before the contract year. A higher value raises the score.',
    },
  },
  year_end: {
    title: { es: 'Adjudicación de fin de año', en: 'Year-End Award' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Los contratos de diciembre responden a la presión por ejercer el presupuesto: las dependencias se apresuran a gastar lo que queda antes de que cierre el año. Eso reduce el tiempo de revisión y presiona para adjudicar rápido a proveedores conocidos.',
      en: 'Contracts awarded in December are driven by budget-flushing pressure — agencies rush to spend remaining budget before year-end. This reduces time for due diligence and creates pressure to award quickly to familiar vendors.',
    },
    theory: {
      es: 'Teoría del ciclo presupuestal (IMCO, México): la presión de fin de año reduce la supervisión. Los funcionarios arriesgan su carrera si devuelven presupuesto sin ejercer, lo que incentiva aprobar contratos rápido y sin revisión completa.',
      en: 'Budget Cycle Theory (IMCO Mexico): Year-end budget pressure reduces oversight. Officials face career risk if they return unspent budget, creating incentive to approve contracts rapidly without full scrutiny.',
    },
    citation: { es: 'IMCO (México): el gasto apresurado de diciembre', en: 'IMCO (Mexico): Budget rushing in December' },
    rubli_note: {
      es: 'Regularizado exactamente a cero en v0.9.2 (la única de 17 variables; v0.9.1: +0.005); no contribuye al indicador.',
      en: 'Regularized to exactly zero in v0.9.2 (the only one of 17 features; v0.9.1: +0.005); it does not contribute to the score.',
    },
  },
  institution_risk: {
    title: { es: 'Tipo de institución', en: 'Institution Risk Type' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Algunos tipos de institución tienen históricamente tasas de irregularidad más altas. Las dependencias federales con grandes presupuestos de compra y compras técnicas complejas (insumos de salud, sistemas de TI) tienden a tasas más altas que las dependencias especializadas.',
      en: 'Some government institution types have historically higher irregularity rates. Federal agencies with large procurement budgets and complex technical procurement (health supplies, IT systems) tend to have higher corruption rates than specialized agencies.',
    },
    theory: {
      es: 'Economía institucional: cada tipo de entidad pública tiene mecanismos de rendición de cuentas, niveles de supervisión y oportunidades de corrupción distintos según su volumen de compras y su complejidad técnica.',
      en: 'Institutional Economics: Different types of government entities have different accountability mechanisms, oversight levels, and corruption opportunities based on their procurement volumes and technical complexity.',
    },
    citation: { es: 'Metodología CRI del FMI', en: 'IMF CRI Methodology' },
    rubli_note: {
      es: 'No está en v0.9.2: se retiró en la reconstrucción a la fecha. En v0.9.1 estaba regularizada exactamente a cero.',
      en: 'Not in v0.9.2: dropped in the as-of rebuild. In v0.9.1 it was regularized to exactly zero.',
    },
  },
  single_bid: {
    title: { es: 'Un solo adjudicado', en: 'Single award' },
    coefficient: 0.072,
    direction: 'positive',
    mechanism: {
      es: 'Un procedimiento competitivo que ganó un solo proveedor (CompraNet registra ganadores, no postores). En teoría sugiere que se disuadió a los competidores con especificaciones a modo, plazos cortos o conocimiento previo del ganador.',
      en: 'A competitive procedure won by a single vendor (CompraNet records winners, not bidders). In theory, this suggests competitors were deterred — possibly through tailored specifications, short timelines, or advance knowledge of the winner.',
    },
    theory: {
      es: 'Teoría de la competencia (Charron et al. 2017): la tasa de oferta única es una de las alertas más validadas del mundo. Las tasas más altas se correlacionan de forma consistente con los índices de percepción de corrupción en 28 países de la UE.',
      en: 'Competition Theory (Charron et al. 2017): Single-bidder rates are among the most universally validated red flags globally. Higher rates consistently correlate with corruption perception indices across 28 EU countries.',
    },
    citation: { es: 'Charron et al. (2017), Journal of Politics', en: 'Charron et al. (2017), Journal of Politics' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.072 (pequeño; lugar 11 de 16 variables no nulas por magnitud). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.072 (small; rank 11 of 16 non-zero features by magnitude). A higher value raises the score.',
    },
  },
  price_ratio: {
    title: { es: 'Monto frente a contratos parecidos', en: 'Amount vs similar contracts' },
    coefficient: 0.456,
    direction: 'positive',
    mechanism: {
      es: 'Monto del contrato frente a la mediana del sector. Un monto muy alto frente a contratos parecidos puede merecer una revisión, pero no es un sobreprecio: RUBLI no ve precios unitarios. Buena parte de esta señal la recogen los montos muy dispares, una señal más fina.',
      en: "Contract amount compared to the sector median. A very high amount next to similar contracts may deserve a look, but it is not overpricing: RUBLI does not see unit prices. Much of this signal is picked up by the finer uneven-contract-sizes feature.",
    },
    theory: {
      es: 'Banco Mundial INT (2019): entre las señales de fraude están los precios muy por encima del mercado. Aquí solo se mide el monto: el método IQR identifica montos estadísticamente atípicos.',
      en: 'World Bank INT (2019): warning signs of fraud include prices significantly above market rates. Here only the amount is measured: the IQR method identifies statistical outliers in contract amounts.',
    },
    citation: { es: 'Banco Mundial INT (2019): señales de alerta de fraude', en: 'World Bank INT (2019): Warning Signs of Fraud' },
    rubli_note: {
      es: 'Coeficiente v0.9.2 +0.456 (grande; lugar 4 de 16 variables no nulas por magnitud). Un valor más alto sube el indicador.',
      en: 'v0.9.2 coefficient +0.456 (large; rank 4 of 16 non-zero features by magnitude). A higher value raises the score.',
    },
  },
  co_bid_rate: {
    title: { es: 'Tasa de licitación conjunta', en: 'Co-Bid Rate' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Con qué frecuencia un proveedor aparece en procedimientos junto a los mismos socios. Tasas altas con victorias alternadas sugieren rotación de ofertas: una colusión en la que los proveedores se turnan para ganar.',
      en: 'How often a vendor appears in bidding procedures together with the same partner vendors. High co-bid rates with alternating wins suggest bid rotation — a form of collusion where vendors take turns winning.',
    },
    theory: {
      es: 'Teoría de los cárteles de licitación (Porter y Zona 1993): la licitación conjunta como indicador de colusión. Los proveedores que aparecen juntos de forma constante y alternan victorias probablemente se coordinan en vez de competir.',
      en: 'Bid-Ring Theory (Porter & Zona 1993): Co-bidding as a collusion indicator. Vendors that consistently appear together and alternate wins are likely coordinating rather than genuinely competing.',
    },
    citation: { es: 'Porter y Zona (1993): la licitación conjunta como indicador de colusión', en: 'Porter & Zona (1993): Co-bidding as collusion indicator' },
    rubli_note: {
      es: 'No está en v0.9.2: falta su tabla fuente, así que la reconstrucción a la fecha la retiró. En v0.9.1 estaba regularizada exactamente a cero.',
      en: 'Not in v0.9.2: its source table is missing, so the as-of rebuild dropped it. In v0.9.1 it was regularized to exactly zero.',
    },
  },
  price_hyp_confidence: {
    title: { es: 'Confianza de monto atípico', en: 'Amount-outlier confidence' },
    coefficient: 0.0,
    direction: 'neutral',
    mechanism: {
      es: 'Confianza estadística de que un monto es atípico según el método IQR de Tukey. Los valores más allá de 1.5 veces el rango intercuartílico se marcan: mide qué tan lejos de lo normal está el monto.',
      en: "Statistical confidence that a contract amount is an outlier using Tukey's IQR method. Values beyond 1.5× the interquartile range are flagged — this measures how far beyond normal the amount is.",
    },
    theory: {
      es: 'Detección estadística de atípicos (Tukey 1977): el método IQR identifica valores extremos sin suponer una distribución normal. Los valores por encima de Q3 + 1.5×IQR son estadísticamente inusuales.',
      en: 'Statistical Outlier Detection (Tukey 1977): The IQR method provides a non-parametric way to identify extreme values without assuming a normal distribution. Values beyond Q3 + 1.5×IQR are statistically unusual.',
    },
    citation: { es: 'Método IQR de Tukey para detectar atípicos', en: 'Tukey IQR method for outlier detection' },
    rubli_note: {
      es: 'No está en v0.9.2: falta su columna fuente, así que la reconstrucción a la fecha la retiró. En v0.9.1 estaba regularizada exactamente a cero.',
      en: 'Not in v0.9.2: its source column is missing, so the as-of rebuild dropped it. In v0.9.1 it was regularized to exactly zero.',
    },
  },
}

// ---------------------------------------------------------------------------
// Direction indicator
// ---------------------------------------------------------------------------

function DirectionIcon({ direction, size = 12 }: { direction: FactorExplanation['direction'], size?: number }) {
  if (direction === 'positive') return <TrendingUp size={size} className="text-risk-critical shrink-0" />
  if (direction === 'negative') return <TrendingDown size={size} className="text-risk-low shrink-0" />
  return <Minus size={size} className="text-text-muted shrink-0" />
}

// ---------------------------------------------------------------------------
// RiskFactorBadge — inline badge with hover tooltip explainer
// ---------------------------------------------------------------------------

interface RiskFactorBadgeProps {
  /** The factor key, e.g. 'vendor_concentration' */
  factor: string
  /** Optional z-score value to display */
  zScore?: number
  /** Show the full explainer panel instead of a compact tooltip */
  showExplainer?: boolean
  className?: string
}

export function RiskFactorBadge({ factor, zScore, showExplainer = false, className }: RiskFactorBadgeProps) {
  const lang = useLang()
  const explanation = FACTOR_EXPLANATIONS[factor]
  if (!explanation) return null

  const coeff = explanation.coefficient
  const isPositive = coeff > 0.001
  const isNegative = coeff < -0.001
  const coeffStr = isPositive ? `+${coeff.toFixed(3)}` : coeff.toFixed(3)

  const trigger = (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 text-xs font-mono rounded px-1.5 py-0.5 border cursor-help transition-colors',
        isPositive && 'bg-risk-critical/10 border-risk-critical/30 text-risk-critical hover:bg-risk-critical/20',
        isNegative && 'bg-risk-low/10 border-risk-low/30 text-risk-low hover:bg-risk-low/20',
        !isPositive && !isNegative && 'bg-background-elevated/30 border-border text-text-muted hover:bg-background-elevated/50',
        className
      )}
      aria-label={`${explanation.title[lang]}: ${lang === 'en' ? 'coefficient' : 'coeficiente'} ${coeffStr}`}
    >
      <DirectionIcon direction={explanation.direction} size={11} />
      <span>{coeffStr}</span>
      {zScore !== undefined && (
        <span className="text-text-muted font-normal ml-0.5">z={zScore > 0 ? '+' : ''}{zScore.toFixed(1)}</span>
      )}
    </button>
  )

  if (!showExplainer) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-3 space-y-1.5">
          <p className="font-semibold text-xs">{explanation.title[lang]}</p>
          <p className="text-xs text-text-secondary leading-relaxed">{explanation.mechanism[lang]}</p>
          <p className="text-xs text-text-secondary">{explanation.citation[lang]}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return <RiskFactorCard factor={factor} trigger={trigger} />
}

// ---------------------------------------------------------------------------
// RiskFactorCard — full explainer card (popover on click)
// ---------------------------------------------------------------------------

interface RiskFactorCardProps {
  factor: string
  /** Optional custom trigger element */
  trigger?: React.ReactNode
  className?: string
}

export function RiskFactorCard({ factor, trigger, className }: RiskFactorCardProps) {
  const [open, setOpen] = useState(false)
  const lang = useLang()
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const explanation = FACTOR_EXPLANATIONS[factor]
  if (!explanation) return null

  const coeff = explanation.coefficient
  const coeffStr = coeff > 0.001 ? `+${coeff.toFixed(3)}` : coeff.toFixed(3)
  const isPositive = coeff > 0.001
  const isNegative = coeff < -0.001

  return (
    <div className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="cursor-pointer"
      >
        {trigger ?? (
          <button type="button" className="text-xs underline decoration-dotted text-text-secondary hover:text-text-primary">
            {explanation.title[lang]}
          </button>
        )}
      </div>

      {/* Explainer panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className={cn(
            'absolute left-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-background-elevated shadow-lg p-4 space-y-3',
          )}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold text-sm text-text-primary">{explanation.title[lang]}</h4>
                <span className={cn(
                  'text-xs font-mono font-bold',
                  isPositive && 'text-risk-critical',
                  isNegative && 'text-risk-low',
                  !isPositive && !isNegative && 'text-text-muted',
                )}>
                  {L('coeficiente', 'coefficient')} {coeffStr}
                </span>
              </div>
              <DirectionIcon direction={explanation.direction} size={16} />
            </div>

            {/* Mechanism */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{L('Qué detecta', 'What It Detects')}</p>
              <p className="text-xs text-text-secondary leading-relaxed">{explanation.mechanism[lang]}</p>
            </div>

            {/* Theory */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{L('Teoría', 'Theory')}</p>
              <p className="text-xs text-text-secondary leading-relaxed">{explanation.theory[lang]}</p>
            </div>

            {/* RUBLI note */}
            <div className="rounded bg-accent/5 border border-accent/20 px-3 py-2">
              <p className="text-xs font-semibold text-accent mb-1">{L('En RUBLI', 'In RUBLI')}</p>
              <p className="text-xs text-text-secondary leading-relaxed">{explanation.rubli_note[lang]}</p>
            </div>

            {/* Citation */}
            <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
              <BookOpen size={11} className="text-text-muted mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-text-secondary">{explanation.citation[lang]}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RiskFactorTable — tabular summary of all 16 factors (Glossary / Methodology)
// ---------------------------------------------------------------------------

interface RiskFactorTableProps {
  /** Show only these factors (default: all 16) */
  factors?: string[]
  className?: string
}

export function RiskFactorTable({ factors, className }: RiskFactorTableProps) {
  const lang = useLang()
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const keys = factors ?? Object.keys(FACTOR_EXPLANATIONS)
  // Sort by absolute coefficient descending
  const sorted = [...keys].sort((a, b) => {
    const ca = Math.abs(FACTOR_EXPLANATIONS[a]?.coefficient ?? 0)
    const cb = Math.abs(FACTOR_EXPLANATIONS[b]?.coefficient ?? 0)
    return cb - ca
  })

  return (
    <div className={cn('ct-table-wrap', className)}>
      <table className="ct-table" aria-label={L('Coeficientes de los factores de riesgo', 'Risk factor coefficients')}>
        <thead>
          <tr>
            <th scope="col">{L('Factor', 'Factor')}</th>
            <th scope="col" className="num">{L('Coeficiente', 'Coefficient')}</th>
            <th scope="col">{L('Solidez de la evidencia', 'Evidence Strength')}</th>
            <th scope="col" className="hidden md:table-cell">{L('Fuente principal', 'Key Source')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((key) => {
            const ex = FACTOR_EXPLANATIONS[key]
            if (!ex) return null
            const coeff = ex.coefficient
            const isPositive = coeff > 0.001
            const isNegative = coeff < -0.001
            const coeffStr = isPositive ? `+${coeff.toFixed(3)}` : coeff.toFixed(3)

            return (
              <tr key={key}>
                <td>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-left font-medium text-text-primary hover:text-accent transition-colors underline decoration-dotted underline-offset-2"
                      >
                        {ex.title[lang]}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs p-3 space-y-1.5">
                      <p className="font-semibold text-xs">{ex.title[lang]}</p>
                      <p className="text-xs text-text-secondary leading-relaxed">{ex.mechanism[lang]}</p>
                      <p className="text-xs text-accent">{ex.rubli_note[lang]}</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="block text-text-muted font-mono text-[12px] mt-0.5">{key}</span>
                </td>
                <td className="num">
                  <span className={cn(
                    'font-bold',
                    isPositive && 'text-risk-critical',
                    isNegative && 'text-risk-low',
                    !isPositive && !isNegative && 'text-text-muted',
                  )}>
                    {coeffStr}
                  </span>
                </td>
                <td className="ls-txt">
                  {getEvidenceStrength(key)?.[lang] ?? '—'}
                </td>
                <td className="ls-txt hidden md:table-cell">{ex.citation[lang]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
        <span className="flex items-center gap-1"><TrendingUp size={11} className="text-risk-critical" /> {L('Sube el riesgo', 'Increases risk')}</span>
        <span className="flex items-center gap-1"><TrendingDown size={11} className="text-risk-low" /> {L('Baja el riesgo (protector)', 'Decreases risk (protective)')}</span>
        <span className="flex items-center gap-1"><Minus size={11} /> {L('Despreciable / regularizado a cero', 'Negligible / regularized to zero')}</span>
        <span className="flex items-center gap-1"><FlaskConical size={11} /> {L('Coeficientes del modelo ElasticNet v0.9.2 en las unidades de cada variable, como los sirve la API (C=0.0037, l1_ratio=0.919, T=0.530 incluido)', 'v0.9.2 ElasticNet coefficients in each feature’s own units, as the API serves them (C=0.0037, l1_ratio=0.919, T=0.530 folded in)')}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEvidenceStrength(factor: string): Bi | undefined {
  const map: Record<string, Bi> = {
    vendor_concentration: { es: 'Sólida (varios países)', en: 'Strong (multiple countries)' },
    price_volatility: { es: 'Sólida (el mayor peso de v0.9.2)', en: 'Strong (largest v0.9.2 weight)' },
    institution_diversity: { es: 'Positiva en el índice de concentración a la fecha: ver nota', en: 'Positive on the as-of concentration index — see note' },
    win_rate: { es: 'Sólida: tasas anormales = captura de mercado', en: 'Strong — abnormal rates = market capture' },
    sector_spread: { es: 'Negativa: factor protector', en: 'Negative — protective factor' },
    industry_mismatch: { es: 'Moderada', en: 'Moderate' },
    same_day_count: { es: 'Moderada: fraccionamiento bajo umbral', en: 'Moderate — threshold splitting' },
    direct_award: { es: 'Moderada: depende del contexto', en: 'Moderate — context-dependent' },
    ad_period_days: { es: 'Negativa en los datos de México', en: 'Negative in Mexico data' },
    network_member_count: { es: 'Moderada', en: 'Moderate' },
    year_end: { es: 'Débil: el intervalo de confianza cruza cero', en: 'Weak — CI crosses zero' },
    institution_risk: { es: 'Débil', en: 'Weak' },
    single_bid: { es: 'Sólida en el mundo, débil en México', en: 'Strong globally, weak in Mexico' },
    price_ratio: { es: 'Grande, pero se solapa con los montos muy dispares', en: 'Large, but overlaps uneven contract sizes' },
    co_bid_rate: { es: 'Sin señal en los datos de entrenamiento', en: 'No signal in training data' },
    price_hyp_confidence: { es: 'Casi nula', en: 'Near-zero' },
  }
  return map[factor]
}
