import { describe, expect, it } from 'vitest'
import { montoEnLetra } from './letra'

describe('montoEnLetra', () => {
  it('writes the headline amount like a contract', () => {
    expect(montoEnLetra(9.9e12, 'es')).toBe('Nueve billones novecientos mil millones de pesos 00/100 M.N.')
    expect(montoEnLetra(9.9e12, 'en')).toBe('Nine trillion nine hundred billion pesos 00/100 M.N.')
  })
  it('handles the irregular Spanish forms', () => {
    expect(montoEnLetra(1e12, 'es')).toBe('Un billón de pesos 00/100 M.N.')
    expect(montoEnLetra(121_000, 'es')).toBe('Ciento veintiún mil pesos 00/100 M.N.')
    expect(montoEnLetra(100, 'es')).toBe('Cien pesos 00/100 M.N.')
    expect(montoEnLetra(1_045_000_000, 'es')).toBe('Mil cuarenta y cinco millones de pesos 00/100 M.N.')
  })
})
