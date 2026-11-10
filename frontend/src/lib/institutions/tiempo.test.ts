import { describe, expect, it } from 'vitest'
import type { FieldInst } from './field'
import { biggestAt, decodeTiempo, deltaAt, moversAt, stopStats, TOTAL_STOP, windowScore, type SexenioPayload } from './tiempo'

const inst = (id: number, score: number, grade: string, mxn: number) =>
  ({ id, total_score: score, grade, total_amount_mxn: mxn } as unknown as FieldInst)

const insts = [inst(10, 70, 'B', 900), inst(20, 30, 'D', 100), inst(30, 50, 'C', 50)]
const payload: SexenioPayload = {
  method: 'v3', computed_at: 'x', calibration_id: 'c', cut_points: [76, 60, 44, 28], min_contracts: 10,
  sexenios: ['fox', 'calderon', 'pena_nieto', 'amlo', 'sheinbaum'].map((key) => ({ key, start: '', end: '', coverage: 'full' })),
  columns: ['institution_id', 'sexenio', 'n_contracts', 'total_mxn', 'score', 'score_lo', 'score_hi', 'grade', 'provisional', 'pillar_competencia', 'pillar_proceso', 'pillar_concentracion'],
  rows: [
    [10, 0, 50, 400, 80, 0, 0, 'A', false, 0, 0, 0],
    [10, 2, 50, 500, 40, 0, 0, 'D', false, 0, 0, 0],
    [20, 2, 40, 300, 20, 0, 0, 'F', false, 0, 0, 0],
    [30, 2, 5, 9, null, null, null, null, null, null, null, null], // below the floor: ungraded
    [99, 2, 50, 1, 50, 0, 0, 'C', false, 0, 0, 0],                  // not in the field: dropped
  ],
}

describe('tiempo', () => {
  const t = decodeTiempo(payload, insts)

  it('windowScore = the league row the dossier prints; null when ungraded', () => {
    expect(windowScore(payload, 10, 'pena_nieto')).toBe(40)
    expect(windowScore(payload, 30, 'pena_nieto')).toBeNull()
    expect(windowScore(payload, 10, 'sheinbaum')).toBeNull()
  })

  it('aligns rows to field dots; ungraded = NaN', () => {
    expect(t.score[0][0]).toBeCloseTo(80)
    expect(Number.isNaN(t.score[1][0])).toBe(true)
    expect(Number.isNaN(t.score[2][2])).toBe(true)
    expect(t.mxn[2][2]).toBe(9)
  })

  it('stop stats count only graded dots; reprobadas (< 60) by count and pesos', () => {
    const s = stopStats(t, insts, 2, [0, 1, 2])
    expect(s).toMatchObject({ active: 2, def: 2, val: 800, defVal: 800 })
    expect(s.median).toBeCloseTo(30)
    const all = stopStats(t, insts, TOTAL_STOP, [0, 1, 2])
    expect(all).toMatchObject({ active: 3, def: 2, val: 1050, defVal: 150, median: 50 })
  })

  it('delta skips ungraded windows back to the last grade', () => {
    expect(deltaAt(t, 2, 0)).toBeCloseTo(-40)
    expect(Number.isNaN(deltaAt(t, 2, 1))).toBe(true)
    expect(Number.isNaN(deltaAt(t, TOTAL_STOP, 0))).toBe(true)
  })

  it('biggest and movers', () => {
    expect(biggestAt(t, insts, 2, 5)).toEqual([0, 1])
    expect(moversAt(t, insts, 2, 5, 0)).toEqual([0])
    expect(moversAt(t, insts, 2, 5, 1000)).toEqual([])
  })
})
