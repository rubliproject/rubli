import { describe, expect, it } from 'vitest'
import { doorOf } from './doors'

describe('doorOf', () => {
  it('maps the live exception_article strings to doors', () => {
    expect(doorOf('Art. 54 fr. I')).toMatchObject({ code: '54·I', tone: 'discretionary' })
    expect(doorOf('Art. 54 fr. II').tone).toBe('emergency')
    expect(doorOf('Art. 55 párrafo primero')).toMatchObject({ code: '55 §1', tone: 'routine' })
    expect(doorOf('Art. 43').code).toBe('43 (obra)')
    expect(doorOf('Art. 42 fr. VII Bis').code).toBe('42·VII Bis')
    expect(doorOf('Art. 41 fr. X')).toMatchObject({ code: '41·X†', tone: 'unverified' })
    expect(doorOf('Art. 34 párrafo tercero RLAASSP').tone).toBe('unverified')
    expect(doorOf(null).tone).toBe('none')
  })
})
