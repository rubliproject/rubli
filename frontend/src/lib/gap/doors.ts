/**
 * The legal doors of a post-blackout award — what each `exception_article`
 * string from ComprasMX means, in plain words (gap-relevo spec § doors).
 *
 * Source: LAASSP (DOF 2025-04-16) Art. 54 (exception catalogue) / Art. 55
 * (amount threshold); LOPSRM Art. 42 / 43 for public works. Meanings are
 * recon-gap.md § 4 verbatim. The Apr-2025 law renumbered old Art. 41 → 54 and
 * 42 → 55, so "Art. 41 …" rows, and articles that are not exceptions at all,
 * are shown `unverified` and uncoloured.
 */
import { RISK_COLORS } from '@/lib/constants'

export type DoorTone = 'routine' | 'discretionary' | 'emergency' | 'social' | 'unverified' | 'none'
type Bi = { en: string; es: string }

export interface Door {
  code: string
  tone: DoorTone
  short: Bi
  meaning: Bi
  read?: Bi
}

const D = (code: string, tone: DoorTone, short: Bi, meaning: Bi, read?: Bi): Door => ({ code, tone, short, meaning, read })

// LAASSP Art. 54 — keyed by fraction
const ART54: Record<string, Omit<Door, 'code'>> = {
  I: { tone: 'discretionary', short: { en: 'sole supplier', es: 'proveedor único' },
    meaning: { en: 'Sole supplier: no substitute, only one bidder in the market, or patent/exclusive rights/art', es: 'Proveedor único: sin sustituto, un solo oferente, o patente/derechos exclusivos' },
    read: { en: 'The expected door for patented drugs; the indicator is concentration and magnitude, not the article itself.', es: 'La puerta esperada para medicamentos de patente; el indicador es la concentración y la magnitud, no el artículo.' } },
  II: { tone: 'emergency', short: { en: 'emergency', es: 'emergencia' },
    meaning: { en: 'Emergency: social order, economy, public services, health, safety or environment at risk from force majeure', es: 'Emergencia: peligra el orden social, la economía, servicios públicos, salud, seguridad o ambiente por caso fortuito/fuerza mayor' },
    read: { en: 'The highest-discretion door. Repeated use by one buyer, month after month, is the indicator.', es: 'La puerta de mayor discrecionalidad. El uso repetido por un comprador, mes tras mes, es el indicador.' } },
  III: { tone: 'discretionary', short: { en: 'tender too costly', es: 'licitar costaría más' },
    meaning: { en: 'Tendering would cause significant, quantified extra losses or costs', es: 'Licitar provocaría pérdidas o costos adicionales importantes, cuantificados' } },
  IV: { tone: 'discretionary', short: { en: 'security', es: 'seguridad' },
    meaning: { en: 'Exclusively military/navy, or tender would endanger national/public security', es: 'Fines militares o riesgo a la seguridad nacional' } },
  V: { tone: 'emergency', short: { en: 'force majeure', es: 'caso fortuito' },
    meaning: { en: 'Force majeure makes a tender too slow for the contingency; limited to the strictly necessary. "Lack of planning is not force majeure"', es: 'Por caso fortuito no hay tiempo para licitar; sólo lo estrictamente necesario. La falta de planeación no es fuerza mayor' },
    read: { en: 'Emergency-lite: the law itself says lack of planning does not qualify.', es: 'Emergencia menor: la propia ley dice que la falta de planeación no califica.' } },
  VI: { tone: 'routine', short: { en: 'runner-up', es: 'segundo lugar' },
    meaning: { en: 'Tendered contract rescinded → award to the runner-up within 10% price', es: 'Contrato licitado rescindido → al segundo lugar (≤10% de diferencia)' } },
  VII: { tone: 'discretionary', short: { en: 'void tender', es: 'licitación desierta' },
    meaning: { en: 'A public tender was declared void → direct award keeping the same requirements', es: 'Licitación declarada desierta → adjudicación directa con los mismos requisitos' },
    read: { en: 'Worth checking who failed the tender, and who then got the award.', es: 'Conviene revisar quién no ganó la licitación y quién recibió después la adjudicación.' } },
  VIII: { tone: 'discretionary', short: { en: 'brand', es: 'marca' },
    meaning: { en: 'Justified need for a specific brand', es: 'Razones justificadas para una marca determinada' } },
  IX: { tone: 'routine', short: { en: 'perishables', es: 'perecederos' },
    meaning: { en: 'Perishables, grains, basic foodstuffs, livestock; used/rebuilt goods at appraised price', es: 'Perecederos, granos, alimentos básicos, semovientes; bienes usados con avalúo' } },
  X: { tone: 'discretionary', short: { en: 'consulting', es: 'consultoría' },
    meaning: { en: 'Consulting/studies/research — must use invitation-to-three; direct only if the information is legally reserved', es: 'Consultorías/estudios: invitación a tres; directa sólo con información reservada' } },
  XI: { tone: 'social', short: { en: 'social door', es: 'puerta social' },
    meaning: { en: 'Contracts with campesinos, marginalised urban groups, INAES-certified cooperatives, women/vulnerable-inclusion bodies', es: 'Campesinos, grupos urbanos marginados, cooperativas certificadas por el INAES' } },
  XII: { tone: 'routine', short: { en: 'resale goods', es: 'bienes para reventa' },
    meaning: { en: 'Goods the entity buys to RESELL or feed its own production process (its statutory business)', es: 'Bienes que la entidad compra para comercializar o para sus propios procesos productivos' } },
  XIII: { tone: 'routine', short: { en: 'liquidation sale', es: 'bienes en liquidación' },
    meaning: { en: 'Goods from non-habitual sellers in liquidation/judicial intervention', es: 'Bienes de personas en liquidación o intervención judicial' } },
  XIV: { tone: 'discretionary', short: { en: "individual's services", es: 'servicios de persona física' },
    meaning: { en: 'Services rendered by an individual (persona física) personally, with at most one specialist', es: 'Servicios de una persona física prestados por ella misma (máx. un especialista)' } },
  XV: { tone: 'discretionary', short: { en: 'open maintenance', es: 'mantenimiento abierto' },
    meaning: { en: "Maintenance whose scope/quantities can't be specified in advance", es: 'Mantenimiento cuyo alcance no puede precisarse' } },
  XVI: { tone: 'routine', short: { en: 'prototype', es: 'prototipo' },
    meaning: { en: 'Design + fabrication of a prototype', es: 'Prototipo' } },
  XVII: { tone: 'routine', short: { en: 'research kit', es: 'equipo de investigación' },
    meaning: { en: 'Specialised equipment/chemicals for authorised research projects', es: 'Equipos y sustancias para proyectos de investigación autorizados' } },
  XVIII: { tone: 'routine', short: { en: 'nuclear', es: 'nuclear' },
    meaning: { en: 'Nuclear-installation operations', es: 'Instalaciones nucleares' } },
  XIX: { tone: 'discretionary', short: { en: 'from manufacturer', es: 'del fabricante' },
    meaning: { en: 'Buying from the manufacturer when it offers better market terms', es: 'Compra a fabricantes con mejores condiciones' } },
}

const ART55: Record<string, Door> = {
  primero: D('55 §1', 'routine', { en: 'below threshold', es: 'monto menor' },
    { en: "Below the PEF amount ceiling → no tender needed (as long as purchases aren't split to stay under it)", es: 'Monto menor al tope del PEF: sin licitación, siempre que no se fraccione' },
    { en: 'Routine and low-value. The indicator to watch is splitting a purchase to stay under the ceiling.', es: 'Rutina y de bajo monto. El indicador a vigilar es fraccionar una compra para quedar bajo el tope.' }),
  segundo: D('55 §2', 'discretionary', { en: 'authorised step-down', es: 'directa autorizada' },
    { en: 'Amount is in the invitation-to-three band but direct award authorised by the head of Administración y Finanzas', es: 'Monto de invitación a tres, pero adjudicación directa autorizada por la persona titular de la UAF' }),
  quinto: D('55 §5', 'routine', { en: 'two void invitations', es: 'dos invitaciones desiertas' },
    { en: 'Two invitations-to-three went empty → direct award', es: 'Dos invitaciones a tres declaradas desiertas → adjudicación directa' }),
}

// LOPSRM Art. 42 (public works) — same shape as the LAASSP 54 catalogue
const ART42: Record<string, Door> = {
  I: D('42·I', 'discretionary', { en: 'sole supplier (works)', es: 'proveedor único (obra)' }, ART54.I.meaning),
  II: D('42·II', 'emergency', { en: 'emergency (works)', es: 'emergencia (obra)' }, ART54.II.meaning, ART54.II.read),
  V: D('42·V', 'emergency', { en: 'force majeure (works)', es: 'caso fortuito (obra)' }, ART54.V.meaning, ART54.V.read),
  VII: D('42·VII', 'discretionary', { en: 'void tender (works)', es: 'licitación desierta (obra)' }, ART54.VII.meaning, ART54.VII.read),
  'VII Bis': D('42·VII Bis', 'discretionary', { en: 'void invitation (works)', es: 'invitación desierta (obra)' },
    { en: 'An invitation-to-three for public works was declared void → direct award', es: 'Invitación a tres de obra pública declarada desierta → adjudicación directa' }),
}
const WORKS_CATALOGUE: Bi = { en: 'Public-works exception catalogue (LOPSRM Art. 42), same shape as the LAASSP Art. 54 doors', es: 'Catálogo de excepciones de obra pública (LOPSRM Art. 42), con la misma forma que el Art. 54 de la LAASSP' }

const TENDER: Door = D('—', 'none', { en: 'tender', es: 'licitación' },
  { en: 'No exception cited: a tender, an invitation or a framework contract', es: 'Sin excepción citada: licitación, invitación o contrato marco' })

const cache = new Map<string, Door>()

export function doorOf(article: string | null | undefined): Door {
  if (!article) return TENDER
  const hit = cache.get(article)
  if (hit) return hit
  let d: Door
  let m: RegExpMatchArray | null
  if ((m = article.match(/^Art\. 54 fr\. ([IVX]+)$/)) && ART54[m[1]]) {
    d = { code: `54·${m[1]}`, ...ART54[m[1]] }
  } else if ((m = article.match(/^Art\. 55 p.rrafo (primero|segundo|quinto)/)) && ART55[m[1]]) {
    d = ART55[m[1]]
  } else if (article === 'Art. 43') {
    d = D('43 (obra)', 'routine', { en: 'works threshold', es: 'umbral de obra' },
      { en: 'Public-works equivalent of Art. 55: below the PEF ceiling for obra pública', es: 'Umbral de monto menor para obra pública (LOPSRM)' })
  } else if ((m = article.match(/^Art\. 42 fr\. ([IVX]+(?: Bis)?)$/))) {
    d = ART42[m[1]] ?? D(`42·${m[1]}`, 'discretionary', { en: 'works exception', es: 'excepción de obra' }, WORKS_CATALOGUE)
  } else if ((m = article.match(/^Art\. 41 fr\. ([IVX]+)$/))) {
    d = D(`41·${m[1]}†`, 'unverified', { en: 'old numbering†', es: 'numeración anterior†' },
      { en: 'Old LAASSP numbering (pre-Apr-2025 catalogue) — transitional procedure or a ComprasMX leftover; verify', es: 'Numeración anterior a la ley de 2025 — procedimiento de transición o resto del catálogo de ComprasMX; verificar' })
  } else {
    // Art. 2, 1 Bis, 45 Bis, 44, 42 párrafo …, 34 RLAASSP: no exception fraction cited
    const code = article.replace(/^Art\. /, '').replace(/ p.rrafo /, ' §').replace(/[.,]+$/, '')
    d = D(`${code}†`, 'unverified', { en: 'no exception cited†', es: 'sin fundamento de excepción†' },
      { en: 'Not an exception article (scope or regulation clause) — verify', es: 'No es un artículo de excepción (alcance o reglamento) — verificar' })
  }
  cache.set(article, d)
  return d
}

/** Left-tick colour. Routine/social/unverified/none stay uncoloured (Bible §3.10). */
export function doorColor(tone: DoorTone): string | undefined {
  if (tone === 'emergency') return RISK_COLORS.critical
  if (tone === 'discretionary') return RISK_COLORS.high
  if (tone === 'routine' || tone === 'social') return 'var(--color-text-muted)'
  return undefined
}
