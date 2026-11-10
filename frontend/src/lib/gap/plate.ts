/**
 * «La placa» (/gap) — the four plain buckets and twenty legal doors, in plain words.
 * Mapping = backend/api/routers/gap.py PLATE_DOORS (concept NOTES.md table): procedure wins
 * over article for «Con concurso»; direct awards are bucketed by exception_article.
 * The article lives only in the tooltip / card (owner 2026-10-16: "I don't know what article is").
 */
import { CATEGORICAL, CATEGORICAL_TEXT } from '@/lib/constants'

export type BucketKey = 'concurso' | 'pequena' | 'discrecion' | 'emergencia'
export const BUCKETS: BucketKey[] = ['concurso', 'pequena', 'discrecion', 'emergencia']

/** Categorical hues (DESIGN §6.3: red/amber are severity-only). Licitación = C2 blue and
 *  adjudicación directa = C1 ink, as the procedure-type assignment; emergency = C5, as GapDoors. */
export const BUCKET_HUE: Record<BucketKey, string> = { concurso: CATEGORICAL[1], pequena: CATEGORICAL[7], discrecion: CATEGORICAL[0], emergencia: CATEGORICAL[4] }
export const BUCKET_TEXT: Record<BucketKey, string> = { concurso: CATEGORICAL_TEXT[1], pequena: CATEGORICAL_TEXT[7], discrecion: CATEGORICAL_TEXT[0], emergencia: CATEGORICAL_TEXT[4] }

export const BUCKET_COPY: Record<BucketKey, { es: string; en: string; say_es: string; say_en: string }> = {
  concurso: { es: 'Con concurso', en: 'With competition',
    say_es: 'Hubo competencia: licitación pública, invitación a tres proveedores o contrato marco.',
    say_en: 'There was competition: a public tender, an invitation to three suppliers or a framework contract.' },
  pequena: { es: 'Compra pequeña', en: 'Small purchase',
    say_es: 'Bajo el tope de monto que fija el presupuesto, la ley permite comprar sin licitar.',
    say_en: 'Below the amount ceiling set by the budget, the law allows buying without a tender.' },
  discrecion: { es: 'A discreción', en: 'At discretion',
    say_es: 'El comprador invocó una excepción: proveedor único, servicios de una persona, licitación desierta…',
    say_en: "The buyer invoked an exception: sole supplier, an individual's services, a void tender…" },
  emergencia: { es: 'Emergencia', en: 'Emergency',
    say_es: 'Se declaró una emergencia o un caso fortuito: la ley permite adjudicar de inmediato.',
    say_en: 'An emergency or force majeure was declared: the law allows an immediate award.' },
}

/** door key → plain name + the article (tooltip / card only). */
export const DOOR_COPY: Record<string, { es: string; en: string; art: string }> = {
  lp: { es: 'Licitación pública', en: 'Public tender', art: 'Sin excepción · licitación pública' },
  inv: { es: 'Invitación a tres proveedores', en: 'Invitation to three suppliers', art: 'LAASSP Art. 55 §1 / LOPSRM Art. 43 · invitación a cuando menos tres' },
  marco: { es: 'Contrato marco', en: 'Framework contract', art: 'Contrato específico derivado de un acuerdo marco' },
  '55-1': { es: 'Monto menor · bienes y servicios', en: 'Below the ceiling · goods and services', art: 'LAASSP Art. 55, párrafo primero' },
  '43': { es: 'Monto menor · obra pública', en: 'Below the ceiling · public works', art: 'LOPSRM Art. 43' },
  '54-I': { es: 'Proveedor único', en: 'Sole supplier', art: 'LAASSP Art. 54, fr. I' },
  '54-XII': { es: 'Bienes para reventa', en: 'Goods for resale', art: 'LAASSP Art. 54, fr. XII' },
  '54-XIV': { es: 'Servicios de una persona física', en: "An individual's services", art: 'LAASSP Art. 54, fr. XIV' },
  '54-VII': { es: 'Licitación desierta', en: 'Void tender', art: 'LAASSP Art. 54, fr. VII' },
  '42-VII': { es: 'Licitación o invitación desierta en obra', en: 'Void tender or invitation · works', art: 'LOPSRM Art. 42, fr. VII / VII Bis' },
  '54-III': { es: 'Licitar costaría más', en: 'A tender would cost more', art: 'LAASSP Art. 54, fr. III' },
  '55-2': { es: 'Directa autorizada por la UAF', en: 'Authorised direct award', art: 'LAASSP Art. 55, párrafo segundo' },
  '54-VIII': { es: 'Marca determinada', en: 'Specific brand', art: 'LAASSP Art. 54, fr. VIII' },
  '55-5': { es: 'Dos invitaciones desiertas', en: 'Two void invitations', art: 'LAASSP Art. 55, párrafo quinto' },
  '41': { es: 'Numeración anterior a la ley de 2025', en: 'Pre-2025 numbering', art: 'LAASSP Art. 41 (anterior) · verificar' },
  otros: { es: 'Otros fundamentos', en: 'Other legal grounds', art: 'Art. 2, 45 Bis, 54 IX–XIX, 42 varios, RLAASSP… · verificar' },
  '54-II': { es: 'Emergencia', en: 'Emergency', art: 'LAASSP Art. 54, fr. II' },
  '54-V': { es: 'Caso fortuito', en: 'Force majeure', art: 'LAASSP Art. 54, fr. V' },
  '42-II': { es: 'Emergencia en obra pública', en: 'Emergency · public works', art: 'LOPSRM Art. 42, fr. II' },
  '42-V': { es: 'Caso fortuito en obra pública', en: 'Force majeure · public works', art: 'LOPSRM Art. 42, fr. V' },
}

/** Amount source codes: 0 open data (ComprasMX) · 1 read off the award letter · 2 estimated · 3 none. */
export type Src = 0 | 1 | 2 | 3

export interface PlateAgg {
  n: number; datos_n: number; datos_v: number; ocr_n: number; ocr_v: number; est_n: number; est_v: number
  none_n: number; flag_n: number; flag_v: number
}
/** [buyer index, awards, MXN read] (+ MXN read per bucket / per door of the bucket). */
export type TopRow = [number, number, number, number[]?]
export interface PlateBucket extends PlateAgg { k: BucketKey; doors: string[]; top: TopRow[] }
export interface PlateDoor extends PlateAgg { k: string; b: BucketKey; top: TopRow[] }
export interface PlateHead {
  available: boolean; per: number; q: [number, number]; window: string; months: string[]
  meta: PlateAgg & { n_buyers: number }; top: TopRow[]; buckets: PlateBucket[]; doors: PlateDoor[]
  /** [institution id (canonical) | null, name, siglas | null] */
  buyers: [number | null, string, string | null][]
}
/** One mark ≈ `per` awards: door index · kind (0 with amount, 1 estimated, 2 none) · quantised amount · month · source · count. */
export interface PlateMarks { d: number[]; k: number[]; q: number[]; m: number[]; s: number[]; c: number[] }
export interface Plate extends PlateHead { marks: PlateMarks }
export interface PlateDoorAwards {
  available: boolean; door: string; n: number; buyers: [number | null, string, string | null][]
  /** v hundreds of MXN (null = none) · s source · m month · b buyer */
  col: { v: (number | null)[]; s: Src[]; m: number[]; b: number[] }
}
export interface PlateAward {
  i: number | null; uuid: string; procedure_number: string | null; expedient_code: string | null; title: string | null
  door: string; bucket: BucketKey; article: string | null
  institution_id: number | null; institution: string | null; siglas: string | null; date: string | null
  amount_mxn: number | null; source: Src; flag: boolean; n_contracts: number; n_persona_fisica: number
  vendor: string | null; vendor_id: number | null; vendor_note: 'pf' | 'self_buyer' | 'unnamed' | null
  /** the named vendor is a persona física (policy 10-29: named, always labelled) */
  persona_fisica?: boolean
}

export const known = (a: PlateAgg) => a.datos_v + a.ocr_v + a.est_v
export const knownN = (a: PlateAgg) => a.datos_n + a.ocr_n + a.est_n
export const COMPRASMX_DETAIL = (uuid: string) => `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/${uuid}/procedimiento`

/** quantised amount → MXN (payload `q`: round((log10 MXN − lo) × step)). */
export const deq = (q: number, [lo, step]: [number, number]) => Math.pow(10, lo + q / step)
