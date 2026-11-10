import { afterAll, describe, expect, it } from 'vitest'
import { CASE_FRAUD_TYPE_COLORS, CATEGORICAL, RISK_TEXT_COLORS, SECTOR_COLORS, SECTORS, setPaletteEdition, textInk } from './constants'

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
const onBlack = (hex: string) => (lum(hex) + 0.05) / 0.05

describe('setPaletteEdition', () => {
  afterAll(() => setPaletteEdition('day'))

  it('night: every categorical, sector fill ≥ 3:1 and risk text ≥ 4.5:1 on black; day restores', () => {
    setPaletteEdition('night')
    for (const c of CATEGORICAL) expect(onBlack(c)).toBeGreaterThanOrEqual(3)
    for (const c of Object.values(SECTOR_COLORS)) expect(onBlack(c)).toBeGreaterThanOrEqual(3)
    for (const c of Object.values(RISK_TEXT_COLORS)) expect(onBlack(c)).toBeGreaterThanOrEqual(4.5)
    expect(SECTORS.find((s) => s.code === 'defensa')!.color).toBe(SECTOR_COLORS.defensa)
    expect(CASE_FRAUD_TYPE_COLORS.overpricing).toBe(CATEGORICAL[0]) // Sobreprecio follows the ink slot
    expect(onBlack(textInk(SECTOR_COLORS.salud))).toBeGreaterThanOrEqual(4.5)
    setPaletteEdition('day')
    expect(CATEGORICAL[0]).toBe('#000000')
    expect(SECTOR_COLORS.defensa).toBe('#1e3a5f')
  })
})
