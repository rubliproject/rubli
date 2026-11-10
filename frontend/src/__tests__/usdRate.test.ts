/**
 * One MXN→USD table (Banxico FIX annual averages) behind every USD figure.
 * Regression: utils.ts said 17.20 for 2025, currency.ts said 19.80, the boot
 * default said 20.10 — the same peso amount showed three dollar values.
 */
import { describe, it, expect } from 'vitest'
import { formatCompactUSD, formatCompactUSDByYear } from '../lib/utils'
import { toReal2024USD } from '../lib/currency'
import { MXN_USD_RATES, LATEST_RATE_YEAR } from '../lib/exchangeRates'

// "US$545B" / "$544.8B USD" → 544.8e9
function parseUSD(s: string): number {
  const m = s.match(/([\d.]+)\s*([KMBT])?/)
  if (!m) throw new Error(`unparseable USD: ${s}`)
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2] as 'K' | 'M' | 'B' | 'T'] ?? 1
  return parseFloat(m[1]) * mult
}
const close = (a: number, b: number) => Math.abs(a - b) / b < 0.01

const TOTAL = 10.46e12 // the 10.46T MXN headline total

describe('MXN→USD single source of truth', () => {
  it('covers every data year 2002–2026', () => {
    for (let y = 2002; y <= 2026; y++) expect(MXN_USD_RATES[y], String(y)).toBeGreaterThan(0)
  })

  it('both compact helpers give the same USD for the same (amount, year)', () => {
    for (let y = 2002; y <= 2026; y++) {
      const amt = 5e12 // stays in the "B" band for every year, so rounding < 0.5 %
      const a = parseUSD(formatCompactUSD(amt, y))
      const b = parseUSD(formatCompactUSDByYear(amt, y))
      expect(close(a, b), `${y}: ${a} vs ${b}`).toBe(true)
      expect(close(b, amt / MXN_USD_RATES[y]), `${y} rate`).toBe(true)
    }
  })

  it('the no-year fallback is the latest verified year', () => {
    expect(LATEST_RATE_YEAR).toBe(2026)
    const expected = TOTAL / MXN_USD_RATES[LATEST_RATE_YEAR]
    expect(close(parseUSD(formatCompactUSD(TOTAL)), expected)).toBe(true)
    expect(close(parseUSD(formatCompactUSDByYear(TOTAL)), expected)).toBe(true)
  })

  it('real-2024 USD converts at the same 2024 rate', () => {
    expect(toReal2024USD(1e9, 2024)).toBeCloseTo(1e9 / MXN_USD_RATES[2024], 6)
  })

  it('pins Banxico FIX annual averages (SF43718)', () => {
    expect(MXN_USD_RATES[2023]).toBe(17.73)
    expect(MXN_USD_RATES[2024]).toBe(18.33)
    expect(MXN_USD_RATES[2025]).toBe(19.2)
  })
})
