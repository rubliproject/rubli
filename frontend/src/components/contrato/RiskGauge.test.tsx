import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import i18n from 'i18next'
import { RiskGauge } from './RiskGauge'
import { getRiskLevelOrNone, isThinHistoryLow, isUnscored } from '@/lib/constants'

describe('unscored risk (ComprasMX, model_version pending_score)', () => {
  it('level helper keeps scored levels and returns none for NULL / pending', () => {
    expect(getRiskLevelOrNone(0.61)).toBe('critical')
    expect(getRiskLevelOrNone(0)).toBe('low')
    expect(getRiskLevelOrNone(null)).toBe('none')
    expect(getRiskLevelOrNone(undefined)).toBe('none')
    expect(getRiskLevelOrNone(0.3, 'pending_score')).toBe('none')
    expect(isUnscored(0.3, 'v0.9.1')).toBe(false)
  })

  it('gauge prints «sin indicador de riesgo aún» — never 0, never bajo', async () => {
    await i18n.changeLanguage('es')
    const { container } = render(<RiskGauge value={null} />)
    expect(container.textContent).toBe('sin indicador de riesgo aún')
    expect(container.textContent).not.toMatch(/0\.00|Bajo/)
    const pending = render(<RiskGauge value={0} modelVersion="pending_score" />)
    expect(pending.container.textContent).toBe('sin indicador de riesgo aún')
  })

  it('gauge prints «no risk indicator yet» in English and still scores real values', async () => {
    await i18n.changeLanguage('en')
    expect(render(<RiskGauge value={undefined} />).container.textContent).toBe('no risk indicator yet')
    expect(render(<RiskGauge value={0.12} />).container.textContent).toContain('0.12Low')
    await i18n.changeLanguage('es')
  })
})

describe('«Historial insuficiente» (house fix F3)', () => {
  it('replaces only a LOW reading, and only with thin history', async () => {
    expect(isThinHistoryLow(0.09, true)).toBe(true)
    expect(isThinHistoryLow(0.09, false)).toBe(false)
    expect(isThinHistoryLow(0.09, null)).toBe(false)
    expect(isThinHistoryLow(0.3, true)).toBe(false)   // medium stays medium
    expect(isThinHistoryLow(0.7, true)).toBe(false)   // a high reading without history still counts
    expect(isThinHistoryLow(null, true)).toBe(false)
    await i18n.changeLanguage('es')
    const { container } = render(<RiskGauge value={0.09} thinHistory />)
    expect(container.textContent).toContain('Historial insuficiente')
    expect(container.textContent).not.toMatch(/Bajo/)
    expect(container.querySelector('.is-thin .ct-lvl')?.getAttribute('title')).toMatch(/menos de 3 contratos previos/)
    expect(render(<RiskGauge value={0.09} thinHistory vendor />).container.querySelector('.ct-lvl')?.getAttribute('title')).toMatch(/La mayoría de sus contratos/)
    expect(render(<RiskGauge value={0.65} thinHistory />).container.textContent).toContain('Crítico')
    await i18n.changeLanguage('en')
    expect(render(<RiskGauge value={0.09} thinHistory />).container.textContent).toContain('Insufficient history')
    await i18n.changeLanguage('es')
  })
})
