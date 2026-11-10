import { aporte, aporteSentence, corroboration, formatAriaDate, inferMaha } from './disposition'

describe('aria disposition helpers (spec G4–G6)', () => {
  const row = { risk_score_norm: 1, ensemble_norm: 0.9975, external_flags_score: 1, financial_scale_norm: 0.3708 }

  it('aporte slots sum to the IPS', () => {
    const total = aporte(row).reduce((a, s) => a + s.contrib, 0)
    expect(total).toBeCloseTo(0.87367, 3)
  })

  it('names the component that sets the rank, never the money scale', () => {
    expect(aporteSentence(aporte(row), true)).toBe('Los otros tres componentes al tope. La escala del dinero suma 0.07 (no pasa de 0.07).')
    expect(aporteSentence(aporte({ ...row, ensemble_norm: 0.5 }), true)).toBe('Indicador de riesgo y registros externos al tope; lo separa el modelo anterior (0.50). La escala del dinero suma 0.07 (no pasa de 0.07).')
    expect(aporteSentence(aporte({ ...row, external_flags_score: 0 }), true)).toBe('Indicador de riesgo y modelo anterior al tope; lo separan los registros externos (0.00). La escala del dinero suma 0.07 (no pasa de 0.07).')
    expect(aporteSentence(aporte({ ...row, external_flags_score: 0 }), false)).toBe('Risk indicator and earlier model at their ceiling; external records set it apart (0.00). The money scale adds 0.07 (never more than 0.07).')
  })

  it('R names Mahalanobis when it beats the risk indicator (it drives tier 3)', () => {
    const r = aporte({ risk_score_norm: 0.31, mahalanobis_norm: 0.88 })[0]
    expect(r.src).toBe('maha')
    expect(r.es).toBe('contrato más inusual')
    expect(r.value).toBe(0.88)
    expect(aporte({ risk_score_norm: 0.9, mahalanobis_norm: 0.2 })[0].src).toBe('risk')
  })

  it('infers Mahalanobis from ips_raw when the list row lacks it', () => {
    // vendor 4202 shape: risk 0.76, A 0.68, X 0, $ 0.32, raw 0.60 -> R must be 1.00 (Mahalanobis)
    const m = inferMaha({ ips_raw: 0.6, risk_score_norm: 0.76, ensemble_norm: 0.68, external_flags_score: 0, financial_scale_norm: 0.32 })
    expect(m.inferred).toBe(true)
    expect(m.value).toBeCloseTo(1, 2)
    expect(inferMaha({ ips_raw: 0.87367, ...row })).toEqual({ value: null, inferred: false })
    expect(inferMaha({ mahalanobis_norm: 0.4 }).value).toBe(0.4)
  })

  it('S tick follows a SANCTION web verdict as well as the SFP registry', () => {
    expect(corroboration({ web_evidence_verdict: 'SANCTION' })).toEqual({ e: false, s: true, w: false })
    expect(corroboration({ web_evidence_verdict: 'JOURNALISM' }).w).toBe(true)
  })

  it('formats ISO and RFC dates, drops junk', () => {
    expect(formatAriaDate('2021-01-25T08:00:00', false)).toBe('25 Jan 2021')
    expect(formatAriaDate('Mon, 25 Jan 2021 08:00:00 GMT', false)).toBe('25 Jan 2021')
    expect(formatAriaDate('not a date', true)).toBeNull()
  })
})
