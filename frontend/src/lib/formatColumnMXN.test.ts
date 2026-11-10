import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import { formatColumnMXN } from './utils'

describe('formatColumnMXN (one unit per column)', () => {
  it('ES: always MDP, decimals for small rows', async () => {
    await i18n.changeLanguage('es')
    expect(formatColumnMXN(1_900_000)).toBe('1.9 MDP')
    expect(formatColumnMXN(512_100)).toBe('0.51 MDP')
    expect(formatColumnMXN(754)).toBe('<0.01 MDP')
    expect(formatColumnMXN(43_584_000_000)).toBe('43,584 MDP')
  })
})
