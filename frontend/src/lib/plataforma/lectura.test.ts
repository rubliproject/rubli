import { describe, expect, it } from 'vitest'
import { datosLectura, methodologyLectura, oneInSentence, pressLectura, privacyLectura } from './lectura'

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

describe('oneInSentence', () => {
  it('says «diez» at a ~10% rate', () => expect(oneInSentence('es', 9.9)).toBe('Uno de cada diez contratos sale alto o crítico.'))
  it('uses the number otherwise', () => expect(oneInSentence('en', 5)).toBe('One contract in 20 comes out high or critical.'))
  it('is silent without a usable rate', () => {
    expect(oneInSentence('es', null)).toBeNull()
    expect(oneInSentence('es', 0)).toBeNull()
    expect(oneInSentence('es', 140)).toBeNull()
  })
})

describe('methodologyLectura', () => {
  it('states the pairs and the size caveat when size sits within 5 points', () => {
    const c = methodologyLectura('es', { highRate: 10, auc: 0.827, moneyOnly: 0.79 })
    expect(c).toContain('Entre un proveedor con caso y uno sin caso, acierta 83 de cada 100.')
    expect(c).toContain('Ordenar solo por tamaño acierta casi igual: 79 de cada 100.')
  })
  it('drops «casi igual» when the model is clearly ahead', () => {
    expect(methodologyLectura('es', { auc: 0.9, moneyOnly: 0.7 }).some((s) => s.includes('casi igual'))).toBe(false)
  })
  it('drops the computed claims without figures, keeps the plain ones', () => {
    const c = methodologyLectura('en', {})
    expect(c).toHaveLength(2)
  })
})

describe('datosLectura', () => {
  it('counts the contracts added since the release', () => {
    expect(datosLectura('es', { total: 3_200_000, release: 3_177_987, version: '2026.11' }))
      .toContain('Hoy el sitio tiene 22,013 contratos más que la versión 2026.11.')
  })
  it('falls back to the release size when the live count is missing', () => {
    expect(datosLectura('es', { total: null, release: 3_177_987, version: '2026.11' })).toContain('La versión 2026.11 tiene 3,177,987 contratos.')
  })
  it('is silent when the live count is missing or not larger', () => {
    expect(datosLectura('es', { total: null, release: 10, version: 'x' }).some((s) => s.includes('más que'))).toBe(false)
    expect(datosLectura('es', { total: 10, release: 10, version: 'x' }).some((s) => s.includes('más que'))).toBe(false)
  })
})

describe('plain Spanish', () => {
  it('keeps every statement at 15 words or fewer, never «precio» or «probabilidad» as a claim', () => {
    const all = [
      ...methodologyLectura('es', { highRate: 9.9, auc: 0.827, moneyOnly: 0.79 }),
      ...datosLectura('es', { total: 3_300_000, release: 3_177_987, version: '2026.11' }),
      ...pressLectura('es', { highRate: 9.9 }),
      ...privacyLectura('es'),
    ]
    for (const s of all) {
      for (const sentence of s.split(/(?<=\.)\s/)) expect(words(sentence)).toBeLessThanOrEqual(15)
      expect(s.toLowerCase()).not.toMatch(/precio/)
    }
  })
})
