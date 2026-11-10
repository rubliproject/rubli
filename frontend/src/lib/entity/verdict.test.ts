import { describe, expect, it } from 'vitest'
import { getVerdictForVendor } from './verdict'

const base = { avg_risk_score: 0.09, total_value_mxn: 1e6, total_contracts: 4, direct_award_pct: 100 }

describe('vendor verdict · «Historial insuficiente» (house fix F3)', () => {
  it('a low average from a vendor without history is not «indicador bajo»', () => {
    expect(getVerdictForVendor({ ...base, thin_history: true }).label_es).toBe('Historial insuficiente · sin caso documentado')
    expect(getVerdictForVendor({ ...base, thin_history: false }).label_es).toBe('Sin caso documentado · indicador bajo')
  })
  it('an elevated reading still reads elevated, history or not', () => {
    expect(getVerdictForVendor({ ...base, avg_risk_score: 0.5, thin_history: true }).label_es).toBe('Indicador elevado · sin caso documentado')
  })
})
