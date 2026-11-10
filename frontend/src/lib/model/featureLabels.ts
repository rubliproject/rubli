/**
 * One bilingual label per risk-model feature — the only map the UI reads (institution waterfall,
 * contract ficha, sector coefficient ladder, Atlas vendor file). Sentence case; prose callers
 * lower-case the first letter. Wording follows the API's feature vocabulary (backend
 * contract_service FACTOR_LABELS) and docs/RISK_METHODOLOGY_v6.md's interpretations.
 */
export const FEATURE_LABELS: Record<string, { es: string; en: string }> = {
  price_volatility: { es: 'Montos muy dispares entre sus contratos', en: 'Uneven contract sizes' },
  // vs the sector median, not the nearest contracts (AUDIT_JOURNALIST 11-07: the contract page's «parecidos» coins
  // showed it equal to its peers while the reason said «frente a contratos parecidos»)
  price_ratio: { es: 'Monto frente a la mediana de su sector', en: 'Amount vs its sector median' },
  vendor_concentration: { es: 'Concentración del proveedor', en: 'Vendor concentration' },
  institution_diversity: { es: 'Diversidad de compradores', en: 'Buyer diversity' },
  network_member_count: { es: 'Pertenencia a una red', en: 'Network membership' },
  same_day_count: { es: 'Contratos el mismo día', en: 'Same-day contracts' },
  ad_period_days: { es: 'Periodo de convocatoria', en: 'Advertisement period' },
  single_bid: { es: 'Un solo adjudicado', en: 'Single award' },
  direct_award: { es: 'Adjudicación directa', en: 'Direct award' },
  win_rate: { es: 'Tasa de victorias', en: 'Win rate' },
  sector_spread: { es: 'Dispersión sectorial', en: 'Sector spread' },
  co_bid_rate: { es: 'Tasa de co-licitación', en: 'Co-bid rate' },
  price_hyp_confidence: { es: 'Confianza de monto atípico', en: 'Amount-outlier confidence' },
  year_end: { es: 'Cierre de año', en: 'Year-end timing' },
  industry_mismatch: { es: 'Fuera de su giro', en: 'Industry mismatch' },
  institution_risk: { es: 'Riesgo institucional', en: 'Institution risk' },
  cobid_herfindahl: { es: 'Concentración de co-adjudicados (HHI)', en: 'Co-awardee concentration (HHI)' },
  recency_z: { es: 'Actividad reciente', en: 'Recency' },
  amount_residual_z: { es: 'Monto frente a lo esperado', en: 'Amount vs. expected' },
  pub_delay_z: { es: 'Retraso de publicación', en: 'Publication delay' },
  amendment_flag: { es: 'Modificaciones', en: 'Amendments' },
  rt4_log: { es: 'Instituciones atendidas antes (amplitud)', en: 'Institutions served before (breadth)' },
  rt4_cap: { es: 'Instituciones atendidas antes (amplitud)', en: 'Institutions served before (breadth)' },
  inst_hhi_prior: { es: 'Concentración de compradores previa (HHI)', en: 'Buyer concentration before (HHI)' },
  has_partida: { es: 'Con partida presupuestal', en: 'Has budget line' },
  partida_price_residual_z_loo: { es: 'Monto frente a su partida', en: 'Amount vs. budget line' },
  partida_single_bid_z_loo: { es: 'Un solo adjudicado frente a su partida', en: 'Single award vs. budget line' },
  partida_direct_award_z_loo: { es: 'Adjudicación directa frente a su partida', en: 'Direct award vs. budget line' },
  contract_count_z: { es: 'Número de contratos', en: 'Contract count' },
  value_concentration: { es: 'Concentración del valor', en: 'Value concentration' },
  seasonal_clustering: { es: 'Agrupamiento estacional', en: 'Seasonal clustering' },
}

/** The feature's label, or undefined for a key the model doesn't have (callers keep their own fallback).
 *  Takes the column spellings the API also sends: «z_price_volatility», «partida_price_residual_z» (no _loo). */
export const modelFeatureLabel = (key: string, lang: 'es' | 'en'): string | undefined => {
  const k = key.replace(/^z_/, '')
  return (FEATURE_LABELS[k] ?? FEATURE_LABELS[`${k}_loo`])?.[lang]
}

/** Plain words for a VENDOR-level reading of each feature, by which side of its baseline the vendor sits on
 *  (`hi` = z > 0, `lo` = z < 0). Whether that side raises or lowers the indicator comes from the coefficient, so a
 *  phrase never claims a direction (the diagram draws it). Sentence case. Never «precio»: the model has no unit prices. */
export const FEATURE_PLAIN: Record<string, { hi: { es: string; en: string }; lo: { es: string; en: string } }> = {
  rt4_log: { hi: { es: 'Vende a más dependencias que lo habitual', en: 'Sells to more agencies than usual' }, lo: { es: 'Vende a menos dependencias que lo habitual', en: 'Sells to fewer agencies than usual' } },
  price_volatility: { hi: { es: 'Sus montos cambian más que lo habitual', en: 'Its amounts vary more than usual' }, lo: { es: 'Sus montos cambian menos que lo habitual', en: 'Its amounts vary less than usual' } },
  price_ratio: { hi: { es: 'Contratos más grandes que la mediana de su sector', en: 'Contracts larger than its sector median' }, lo: { es: 'Contratos más chicos que la mediana de su sector', en: 'Contracts smaller than its sector median' } },
  vendor_concentration: { hi: { es: 'Se lleva más gasto de su sector que lo habitual', en: "Takes more of its sector's spending than usual" }, lo: { es: 'Se lleva menos gasto de su sector que lo habitual', en: "Takes less of its sector's spending than usual" } },
  inst_hhi_prior: { hi: { es: 'Antes vendía a menos compradores que lo habitual', en: 'Before, it sold to fewer buyers than usual' }, lo: { es: 'Antes vendía a más compradores que lo habitual', en: 'Before, it sold to more buyers than usual' } },
  sector_spread: { hi: { es: 'Vende en más sectores que lo habitual', en: 'Sells in more sectors than usual' }, lo: { es: 'Vende en menos sectores que lo habitual', en: 'Sells in fewer sectors than usual' } },
  same_day_count: { hi: { es: 'Firma más contratos el mismo día que lo habitual', en: 'Signs more same-day contracts than usual' }, lo: { es: 'Firma menos contratos el mismo día que lo habitual', en: 'Signs fewer same-day contracts than usual' } },
  win_rate: { hi: { es: 'Gana más seguido que lo habitual', en: 'Wins more often than usual' }, lo: { es: 'Gana menos seguido que lo habitual', en: 'Wins less often than usual' } },
  recency_z: { hi: { es: 'Su actividad es más reciente que lo habitual', en: 'Its activity is more recent than usual' }, lo: { es: 'Su actividad es menos reciente que lo habitual', en: 'Its activity is less recent than usual' } },
  single_bid: { hi: { es: 'Licitaciones con un solo adjudicado', en: 'Single-award tenders' }, lo: { es: 'Licitaciones con varios adjudicados', en: 'Tenders with several awardees' } },
  direct_award: { hi: { es: 'Más contratos sin licitación', en: 'More contracts without a tender' }, lo: { es: 'Menos contratos sin licitación', en: 'Fewer contracts without a tender' } },
  cobid_herfindahl: { hi: { es: 'Gana procedimientos junto a las mismas empresas', en: 'Shares won procedures with the same firms' }, lo: { es: 'Gana procedimientos junto a empresas más variadas', en: 'Shares won procedures with more varied firms' } },
  network_member_count: { hi: { es: 'Su red de empresas es mayor que lo habitual', en: 'Its network of firms is larger than usual' }, lo: { es: 'Su red de empresas es menor que lo habitual', en: 'Its network of firms is smaller than usual' } },
  partida_price_residual_z_loo: { hi: { es: 'Montos altos para su partida', en: 'High amounts for its budget line' }, lo: { es: 'Montos bajos para su partida', en: 'Low amounts for its budget line' } },
  partida_single_bid_z_loo: { hi: { es: 'Más licitaciones de un solo adjudicado que su partida', en: 'More single-award tenders than its budget line' }, lo: { es: 'Menos licitaciones de un solo adjudicado que su partida', en: 'Fewer single-award tenders than its budget line' } },
  partida_direct_award_z_loo: { hi: { es: 'Más contratos sin licitación que su partida', en: 'More no-tender contracts than its budget line' }, lo: { es: 'Menos contratos sin licitación que su partida', en: 'Fewer no-tender contracts than its budget line' } },
  year_end: { hi: { es: 'Muchos contratos a fin de año', en: 'Many contracts at year-end' }, lo: { es: 'Pocos contratos a fin de año', en: 'Few contracts at year-end' } },
  ad_period_days: { hi: { es: 'Convocatorias largas', en: 'Long tender periods' }, lo: { es: 'Convocatorias cortas', en: 'Short tender periods' } },
  institution_diversity: { hi: { es: 'Compradores variados', en: 'Varied buyers' }, lo: { es: 'Pocos compradores', en: 'Few buyers' } },
  co_bid_rate: { hi: { es: 'Licita más seguido junto a las mismas empresas', en: 'Bids alongside the same firms more often' }, lo: { es: 'Licita menos seguido junto a las mismas empresas', en: 'Bids alongside the same firms less often' } },
  industry_mismatch: { hi: { es: 'Vende fuera de su giro', en: 'Sells outside its line of business' }, lo: { es: 'Vende dentro de su giro', en: 'Sells within its line of business' } },
  amount_residual_z: { hi: { es: 'Montos mayores a lo esperado', en: 'Amounts above what was expected' }, lo: { es: 'Montos menores a lo esperado', en: 'Amounts below what was expected' } },
  pub_delay_z: { hi: { es: 'Publica tarde sus contratos', en: 'Publishes its contracts late' }, lo: { es: 'Publica a tiempo sus contratos', en: 'Publishes its contracts on time' } },
  contract_count_z: { hi: { es: 'Muchos contratos', en: 'Many contracts' }, lo: { es: 'Pocos contratos', en: 'Few contracts' } },
}

/** The plain phrase for a feature at a z (falls back to the feature label, then the key). */
export const featurePlain = (key: string, z: number, lang: 'es' | 'en'): string => {
  const k = key.replace(/^z_/, '')
  const p = FEATURE_PLAIN[k] ?? FEATURE_PLAIN[`${k}_loo`] ?? (k === 'rt4_cap' ? FEATURE_PLAIN.rt4_log : undefined)
  return p ? p[z >= 0 ? 'hi' : 'lo'][lang] : modelFeatureLabel(key, lang) ?? key
}
