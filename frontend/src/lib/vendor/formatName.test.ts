import { describe, expect, it } from 'vitest'
import { formatVendorName } from './formatName'

describe('formatVendorName', () => {
  it('keeps initials joined by & uppercase', () => {
    expect(formatVendorName('FERROCLIN U&Q SA DE CV', 60)).toBe('Ferroclin U&Q')
    expect(formatVendorName('S&C ELECTRIC MEXICANA S. DE R.L. DE C.V.', 60)).toBe('S&C Electric Mexicana')
    expect(formatVendorName('CIA. PROCTER & GAMBLE MEXICO', 60)).toContain('Procter & Gamble')
  })
})
