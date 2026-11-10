import { describe, expect, it } from 'vitest'
import { parseView } from './views'

describe('/categories ?vista=', () => {
  it('opens Tendencias by its name and by the old «hallazgos» alias', () => {
    expect(parseView('tendencias')).toBe('tendencias')
    expect(parseView('hallazgos')).toBe('tendencias')
  })
  it('keeps the other views and falls back to La bodega', () => {
    expect(parseView('hoja')).toBe('hoja')
    expect(parseView(null)).toBe('bodega')
    expect(parseView('nada')).toBe('bodega')
  })
})
