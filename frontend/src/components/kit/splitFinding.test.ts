import { describe, expect, it } from 'vitest'
import { splitFinding } from './PageHead'

describe('splitFinding', () => {
  it('splits the first sentence from the rest', () => {
    expect(splitFinding('Se desviaron 7,670 MDP. La ASF lo documentó.')).toEqual(['Se desviaron 7,670 MDP.', 'La ASF lo documentó.'])
  })
  it('keeps a one-sentence lede whole', () => expect(splitFinding('Una sola frase.')).toEqual(['Una sola frase.', null]))
  it('does not split on abbreviations', () => {
    expect(splitFinding('Grupo Fármacos S.A. De C.V. cobró 2,000 MDP. Después cerró.')).toEqual(['Grupo Fármacos S.A. De C.V. cobró 2,000 MDP.', 'Después cerró.'])
    expect(splitFinding('El Sr. García firmó todo. Nadie revisó.')?.[0]).toBe('El Sr. García firmó todo.')
  })
  it('returns null when there is no short first sentence', () => {
    expect(splitFinding('')).toBeNull()
    expect(splitFinding(null)).toBeNull()
    expect(splitFinding(`${'a'.repeat(230)}. Fin.`)).toBeNull()
  })
})
