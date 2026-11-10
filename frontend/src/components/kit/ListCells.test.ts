import { describe, expect, it } from 'vitest'
import { yearValues } from './ListCells'

describe('yearValues', () => {
  it('lays a sparse series on the shared span, missing years at 0', () => {
    expect(yearValues([{ year: 2021, amount_mxn: 5 }, { year: 2023, amount_mxn: 2 }], 2020, 2023)).toEqual([0, 5, 0, 2])
    expect(yearValues(undefined, 2020, 2021)).toEqual([0, 0])
    expect(yearValues([], 0, -1)).toEqual([])
  })
})
