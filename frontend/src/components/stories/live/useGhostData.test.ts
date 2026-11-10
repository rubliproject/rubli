import { describe, it, expect } from 'vitest'
import { isPersona } from './useGhostData'

// The legal-entity regex used literal backspace bytes where `\b` was meant,
// so it never matched and every name was treated as a persona física.
describe('isPersona', () => {
  it('treats names with a legal-entity marker as companies', () => {
    expect(isPersona(-1, 'CONSTRUCTORA DEL NORTE SA DE CV')).toBe(false)
    expect(isPersona(-1, 'Grupo Ejemplo S.A. de C.V.')).toBe(false)
  })
  it('masks names with no legal-entity marker', () => {
    expect(isPersona(-1, 'JUAN PEREZ LOPEZ')).toBe(true)
    expect(isPersona(-1, null)).toBe(true)
  })
  it('does not match a marker inside a word', () => {
    expect(isPersona(-1, 'ROSA SALAZAR AGUILAR')).toBe(true)
  })
})
