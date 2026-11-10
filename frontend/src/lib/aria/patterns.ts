/**
 * The ONE set of ARIA pattern names (FLAG_METHODOLOGY_REVIEW_2026-10-28 § 3 A2). Mirrors
 * backend/api/public_labels.py PATTERN_LABELS and i18n aria.json `patterns`; every surface
 * imports from here. Signals, not offences: no «fantasma», «cártel» or «captura».
 * P1 reads the vendor's share of its sector's all-time value, so it is «Peso en su sector».
 */
export const PATTERN_LABELS: Record<string, { en: string; es: string }> = {
  P1: { en: 'Large share of its sector', es: 'Peso en su sector' },
  P2: { en: 'Low-footprint supplier (no RFC)', es: 'Proveedor de baja huella (sin RFC)' },
  P3: { en: 'Intermediary', es: 'Intermediario' },
  P4: { en: 'Co-award pattern', es: 'Patrón de coadjudicación' },
  P5: { en: 'Amount out of range', es: 'Monto fuera de rango' },
  P6: { en: 'Single-buyer dependence', es: 'Dependencia de un solo comprador' },
  P7: { en: 'Linked to a documented case', es: 'Vinculado a un caso documentado' },
}

/** Patterns that never fire in production. Empty since 93753452 (2026-11-02): P5 runs on the deploy DB (prod /aria/stats P5 = 3,993, read 2026-11-05). */
export const PATTERNS_OFF_IN_PROD: readonly string[] = []

export const patternName = (code: string, lang: 'en' | 'es'): string => PATTERN_LABELS[code]?.[lang] ?? code

/** One plain sentence per pattern — what the code computes (review § 1.3), shown on hover/focus. */
export const PATTERN_DEFS: Record<string, { en: string; es: string }> = {
  P1: {
    es: 'Qué parte de todo lo que gastó su sector desde 2002 se lleva: 0.50 = más del 1%, 0.80 = más del 3%. Mide tamaño en el mercado, no una institución.',
    en: 'What share of everything its sector spent since 2002 it takes: 0.50 = over 1%, 0.80 = over 3%. It measures market size, not one institution.',
  },
  P2: {
    es: 'Pocos contratos, casi todos directos, en poco tiempo y sin RFC en el registro (o EFOS definitivo). Depende de la calidad de la fuente.',
    en: 'Few contracts, mostly direct, over a short span, with no RFC on file (or a definitive EFOS). It depends on source quality.',
  },
  P3: {
    es: 'Mucho dinero concentrado en uno o dos años y luego desaparece.',
    en: 'Large sums packed into one or two years, then gone.',
  },
  P4: {
    es: 'Gana repetidamente en los mismos procedimientos que otro proveedor. Coadjudicación, no colusión probada.',
    en: 'Repeatedly awarded in the same procedures as another vendor. Co-award, not proven collusion.',
  },
  P5: {
    es: 'El contrato es mucho más grande (o más chico) que los de su tipo; compara montos, no precios unitarios.',
    en: 'The contract is much larger (or smaller) than others of its kind; it compares amounts, not unit prices.',
  },
  P6: {
    es: 'Más del 80% de sus contratos (en número) vienen de una sola institución, con más de 10 contratos.',
    en: 'Over 80% of its contracts (by count) come from one institution, with more than 10 contracts.',
  },
  P7: {
    es: 'No es un patrón: marca un vínculo a un caso con fuente oficial o de prensa, o un EFOS definitivo.',
    en: 'Not a pattern: it marks a link to a case with an official or press source, or a definitive EFOS.',
  },
}
