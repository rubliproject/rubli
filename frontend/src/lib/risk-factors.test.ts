import { describe, it, expect } from 'vitest'
import { parseFactorLabel } from './risk-factors'

// archive § G2: Spanish pages printed «Price Anomaly», «Year-End Timing»…
const CODES = [
  'price_anomaly', 'year_end', 'inst_risk:state_enterprise_energy', 'co_bid_high:71%:2p',
  'restricted_procedure', 'price_hyp:extreme_overpricing:0.9', 'price_hyp:statistical_outlier',
  'industry_mismatch:x->s3', 'network_5', 'split_2', 'short_ad_<5d', 'interaction:non_open+year_end',
]

describe('parseFactorLabel', () => {
  it('defaults to English (backward compatible)', () => {
    expect(parseFactorLabel('price_anomaly').label).toBe('Amount Anomaly')
    expect(parseFactorLabel('co_bid_high:71%:2p').label).toBe('Co-Bidding (High)')
  })

  it('returns Spanish labels with no English words left', () => {
    expect(parseFactorLabel('price_anomaly', 'es').label).toBe('Anomalía de monto')
    expect(parseFactorLabel('year_end', 'es').label).toBe('Fin de año')
    expect(parseFactorLabel('inst_risk:x', 'es').label).toBe('Riesgo institucional')
    expect(parseFactorLabel('co_bid_high:71%:2p', 'es').label).toBe('Coparticipación (alta)')
    expect(parseFactorLabel('network_5', 'es').label).toBe('Red de proveedores (5 miembros)')
    for (const code of CODES) {
      expect(parseFactorLabel(code, 'es').label).not.toMatch(
        /Anomaly|Risk|Timing|Pattern|Procedure|Mismatch|Overpricing|Outlier|Interaction|Split|Short Ad/,
      )
    }
  })

  it('keeps the category independent of language', () => {
    for (const code of CODES) {
      expect(parseFactorLabel(code, 'es').category).toBe(parseFactorLabel(code).category)
    }
  })
})
