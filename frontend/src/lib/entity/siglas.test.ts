import { describe, expect, it } from 'vitest'
import { initialsOf } from './siglas'

describe('initialsOf (no published siglas)', () => {
  it('takes the significant words, drops particles and the legal suffix', () => {
    expect(initialsOf('INSTITUTO POTOSINO DE INVESTIGACION CIENTIFICA Y TECNOLOGICA, A.C.')).toBe('IPICT')
    expect(initialsOf('Administración del Sistema Portuario Nacional Topolobampo, S.A. de C.V.')).toBe('ASPNT')
  })
  it('gives up when it would be one letter or too long', () => {
    expect(initialsOf('Banobras')).toBeNull()
    expect(initialsOf('b c d f g h i j k')).toBeNull()
  })
})
