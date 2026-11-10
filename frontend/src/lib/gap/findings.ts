/**
 * Act III findings — curated from the recovered file, numbers re-measured on
 * the 2026-10-02 snapshot (gap-relevo spec § G3). Editorial selection frozen in
 * code: each card prints its `asOf` and opens the exact register rows, so the
 * reader can check. Chips render only where an id is known; otherwise the name
 * prints through formatVendorName.
 */
type Bi = { en: string; es: string }

export interface FindingEntity {
  type: 'institution' | 'vendor'
  id?: number
  name: string
  note?: string
}

export interface Finding {
  key: string
  tone: 'discretionary' | 'emergency' | 'critical' | 'medium'
  kicker: Bi
  headline: Bi
  stats: { value: string; label: Bi }[]
  /** before → after pairs (Cleveland pair as mono values, no chart) */
  pairs?: { name: string; id: number; before: number; after: number }[]
  entities: FindingEntity[]
  body: Bi
  query: { en: string; es: string }
  /** register URL params the «Open the rows» link applies */
  filter: Record<string, string>
  rows: number
}

export const FINDINGS_AS_OF = '2026-10-02'

export const FINDINGS: Finding[] = [
  {
    key: 'patent',
    tone: 'discretionary',
    kicker: { en: 'Finding 01 · The patent door', es: 'Hallazgo 01 · La puerta de las patentes' },
    headline: { en: 'One clause carries 196.2B of the 356.0B pesos read.', es: 'Una cláusula carga 196,200 de los 356,000 MDP leídos.' },
    stats: [
      { value: '196.2B', label: { en: 'MXN read under 54·I', es: 'MXN leídos bajo 54·I' } },
      { value: '6,038', label: { en: 'awards', es: 'adjudicaciones' } },
      { value: '55%', label: { en: 'of all money read', es: 'de todo el dinero leído' } },
    ],
    entities: [
      { type: 'institution', id: 2066, name: 'BIRMEX', note: '158.8B · 82' },
      { type: 'vendor', name: 'GLAXOSMITHKLINE MEXICO SA DE CV', note: '32.8B' },
      { type: 'vendor', id: 92615, name: 'PFIZER SA DE CV' },
      { type: 'vendor', id: 120605, name: 'TAKEDA MEXICO SA DE CV' },
      { type: 'vendor', id: 101593, name: 'ABBVIE FARMACEUTICOS SA DE CV' },
    ],
    body: {
      en: "Art. 54 fr. I — sole supplier or patent — is the expected door for patented medicines, and it carries 55% of every peso RUBLI could read. BIRMEX's consolidated purchases alone account for 158.8B across 82 awards. The risk indicator here is concentration and magnitude, not the clause itself: the largest single award, 32.8B, is flagged for review.",
      es: 'El Art. 54 fr. I — proveedor único o patente — es la puerta esperada para medicamentos de patente, y carga el 55% de cada peso que RUBLI pudo leer. Sólo las compras consolidadas de BIRMEX suman 158,800 MDP en 82 adjudicaciones. El indicador de riesgo aquí es la concentración y la magnitud, no la cláusula: la mayor adjudicación, de 32,800 MDP, está marcada para revisión.',
    },
    query: { en: 'OCR sum by exception article', es: 'suma OCR por artículo de excepción' },
    filter: { art: 'Art. 54 fr. I', inst: '2066' },
    rows: 82,
  },
  {
    key: 'emergency',
    tone: 'emergency',
    kicker: { en: 'Finding 02 · The emergency clause', es: 'Hallazgo 02 · La cláusula de emergencia' },
    headline: { en: 'IMSS-Bienestar has bought on the emergency clause every month for a year.', es: 'IMSS-Bienestar compra por la cláusula de emergencia cada mes desde hace un año.' },
    stats: [
      { value: '1,015', label: { en: 'of 2,108 procedures (48%)', es: 'de 2,108 procedimientos (48%)' } },
      { value: '28.9B', label: { en: 'MXN best available', es: 'MXN mejor disponible' } },
      { value: '165', label: { en: 'in July 2026, the peak', es: 'en julio de 2026, el pico' } },
    ],
    pairs: [{ name: 'IMSS-BIENESTAR', id: 3780, before: 75.0, after: 91.2 }],
    entities: [
      { type: 'vendor', id: 269157, name: 'SERPROSEP SA DE CV', note: '3.2B · 7' },
      { type: 'vendor', name: 'VAYAM MEDICAL', note: '5.2B · 8' },
    ],
    body: {
      en: '1,015 of its procedures cite Art. 54 fr. II — the emergency door — in every month from October 2025 to September 2026. Its no-bid share rose from 75.0% before the blackout to 91.2% after. ComprasMX\'s "emergency" field reads 0 on these rows, as on every row in the file — a field to verify, not a finding.',
      es: '1,015 de sus procedimientos citan el Art. 54 fr. II — la puerta de emergencia — en todos los meses de octubre de 2025 a septiembre de 2026. Su proporción sin concurso pasó de 75.0% antes del apagón a 91.2% después. El campo «emergencia» de ComprasMX vale 0 en estas filas, como en todas las del expediente: un campo a verificar, no un hallazgo.',
    },
    query: { en: 'Art. 54 fr. II by buyer and month', es: 'Art. 54 fr. II por comprador y mes' },
    filter: { art: 'Art. 54 fr. II', inst: '3780' },
    rows: 1015,
  },
  {
    key: 'contest',
    tone: 'critical',
    kicker: { en: 'Finding 03 · Less contest after the blackout', es: 'Hallazgo 03 · Menos concurso después del apagón' },
    headline: { en: 'The no-bid share rose at the biggest social buyers.', es: 'La adjudicación directa subió en los grandes compradores sociales.' },
    stats: [],
    pairs: [
      { name: 'ISSSTE', id: 228, before: 62.3, after: 85.1 },
      { name: 'SEDENA', id: 384, before: 27.6, after: 50.4 },
      { name: 'IMSS-BIENESTAR', id: 3780, before: 75.0, after: 91.2 },
      { name: 'IMSS', id: 251, before: 67.8, after: 64.0 },
    ],
    entities: [],
    body: {
      en: 'Same institution ids on both sides: before = their scored CompraNet history, after = the letters we read. The social-security buyers moved most; IMSS, the largest, went slightly the other way.',
      es: 'Los mismos identificadores de institución en ambos lados: antes = su historial calificado de CompraNet, después = los oficios que leímos. Los compradores de seguridad social se movieron más; el IMSS, el mayor, fue ligeramente en sentido contrario.',
    },
    query: { en: 'institution_stats.direct_award_pct vs gap direct-award share', es: 'institution_stats.direct_award_pct contra la adjudicación directa posterior al apagón' },
    filter: { inst: '228', art: 'any-da' },
    rows: 4315,
  },
  {
    key: 'young',
    tone: 'medium',
    kicker: { en: 'Finding 04 · Companies formed yesterday', es: 'Hallazgo 04 · Empresas recién constituidas' },
    headline: { en: '354 awards went to companies under three years old.', es: '354 adjudicaciones fueron a empresas de menos de tres años.' },
    stats: [
      { value: '354', label: { en: 'awards', es: 'adjudicaciones' } },
      { value: '190', label: { en: 'company RFCs', es: 'RFC de empresa' } },
      { value: '6 / 13', label: { en: 'repeat winners sell to CINVESTAV', es: 'ganadoras repetidas venden a CINVESTAV' } },
    ],
    entities: [
      { type: 'institution', id: 1202, name: 'CINVESTAV' },
      { type: 'institution', id: 174, name: 'ECOSUR' },
      { type: 'institution', id: 1509, name: 'CIATEJ' },
      { type: 'vendor', name: 'UNIPARTS MEXICO SA DE CV', note: 'RFC 2025-11 · 13' },
    ],
    body: {
      en: 'Incorporation date read from the RFC. UNIPARTS MÉXICO, incorporated November 2025, won 13 awards at seven research institutes. Of the 13 young companies with five or more awards, six sell to CINVESTAV. New company + repeat awards is a risk indicator, not proof of wrongdoing; none is on SAT\'s EFOS list.',
      es: 'Fecha de constitución leída del RFC. UNIPARTS MÉXICO, constituida en noviembre de 2025, ganó 13 adjudicaciones en siete institutos de investigación. De las 13 empresas jóvenes con cinco o más adjudicaciones, seis venden al CINVESTAV. Empresa nueva + adjudicaciones repetidas es un indicador de riesgo, no prueba de irregularidad; ninguna está en la lista EFOS del SAT.',
    },
    query: { en: 'young vendors (RFC date ≥ 2023) by awards and buyer', es: 'proveedores jóvenes (fecha del RFC ≥ 2023) por adjudicaciones y comprador' },
    filter: { flag: 'young' },
    rows: 354,
  },
]
