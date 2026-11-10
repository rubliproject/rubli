/**
 * «El Tamiz en el tiempo» — pure model for the /institutions field over the
 * five sexenios (owner decision 2026-10-16, concept A).
 *
 * GET /scorecards/institutions/sexenios serves the frozen v3 grade of every
 * institution per presidential term, computed only from that term's contracts
 * (table institution_grades_v3_sexenio). `decodeTiempo` aligns it to the field
 * population (dot i = FieldInst i), so the same dots travel. Stop 0–4 = the
 * windows, stop 5 = the 2002–2025 grade. NaN score = no grade in that window
 * (fewer than `min_contracts` contracts).
 *
 * Honesty: before 2011 COMPRANET carries no direct-award flag, so the
 * competition pillar cannot be measured for Fox and early Calderón — those
 * grades read high. `coverage` carries it (weak · mixed · full · partial).
 */
import type { FieldInst } from './field'
import { ADMIN_COLORS, ADMIN_DISPLAY_ACCENTED, type AdministrationKey } from '@/lib/administrations'

/** Backend window key → administration key (palette + display name). */
const WIN_ADMIN: Record<string, AdministrationKey> = { fox: 'fox', calderon: 'calderon', pena_nieto: 'epn', amlo: 'amlo', sheinbaum: 'sheinbaum' }
export const winColor = (key: string) => ADMIN_COLORS[WIN_ADMIN[key] ?? 'fox']
export const winName = (key: string) => ADMIN_DISPLAY_ACCENTED[WIN_ADMIN[key] ?? 'fox']

export interface SexenioWindow { key: string; start: string; end: string; coverage: string }

export interface SexenioPayload {
  method: string
  computed_at: string
  calibration_id: string
  cut_points: number[]
  min_contracts: number
  sexenios: SexenioWindow[]
  columns: string[]
  rows: unknown[][]
}

export interface Tiempo {
  wins: SexenioWindow[]
  /** Per window, per dot: score (NaN = ungraded), grade, pesos, contracts. */
  score: Float32Array[]
  grade: (string | null)[][]
  mxn: Float64Array[]
  n: Int32Array[]
}

/** One institution's score in one window (`key` = 'sheinbaum' …); null = ungraded there. The dossier reads the
 *  same row the league prints (AUDIT_DATA 11-07 A7: league 4.3 vs dossier «no grade for this government yet»). */
export function windowScore(p: SexenioPayload, institutionId: number, key: string): number | null {
  const ix = Object.fromEntries(p.columns.map((c, i) => [c, i]))
  const w = p.sexenios.findIndex((s) => s.key === key)
  const r = w < 0 ? undefined : p.rows.find((x) => x[ix.institution_id] === institutionId && x[ix.sexenio] === w)
  const s = r ? (r[ix.score] as number | null) : null
  return s == null || Number.isNaN(s) ? null : s
}

/** Stop index of the 2002–2025 grade (after the five windows). */
export const TOTAL_STOP = 5

export function decodeTiempo(p: SexenioPayload, insts: FieldInst[]): Tiempo {
  const ix = Object.fromEntries(p.columns.map((c, i) => [c, i]))
  const W = p.sexenios.length
  const N = insts.length
  const byId = new Map(insts.map((d, k) => [d.id, k]))
  const score = Array.from({ length: W }, () => new Float32Array(N).fill(NaN))
  const grade = Array.from({ length: W }, () => new Array<string | null>(N).fill(null))
  const mxn = Array.from({ length: W }, () => new Float64Array(N))
  const n = Array.from({ length: W }, () => new Int32Array(N))
  for (const r of p.rows) {
    const k = byId.get(r[ix.institution_id] as number)
    const w = r[ix.sexenio] as number
    if (k == null || w == null || w < 0 || w >= W) continue
    const s = r[ix.score] as number | null
    if (s != null) score[w][k] = s
    grade[w][k] = (r[ix.grade] as string | null) ?? null
    mxn[w][k] = (r[ix.total_mxn] as number) ?? 0
    n[w][k] = (r[ix.n_contracts] as number) ?? 0
  }
  return { wins: p.sexenios, score, grade, mxn, n }
}

export const scoreAt = (t: Tiempo, insts: FieldInst[], s: number, k: number) =>
  s >= TOTAL_STOP ? insts[k].total_score : t.score[s][k]
export const gradeAt = (t: Tiempo, insts: FieldInst[], s: number, k: number) =>
  s >= TOTAL_STOP ? insts[k].grade : t.grade[s][k]
export const mxnAt = (t: Tiempo, insts: FieldInst[], s: number, k: number) =>
  s >= TOTAL_STOP ? insts[k].total_amount_mxn : t.mxn[s][k]
export const activeAt = (t: Tiempo, insts: FieldInst[], s: number, k: number) => !Number.isNaN(scoreAt(t, insts, s, k))


export interface StopStats {
  /** Graded in this stop. */
  active: number
  /** Of those, reprobadas (rounded score < 60). */
  def: number
  /** Pesos of the graded, and of the D/F ones. */
  val: number
  defVal: number
  median: number
}

export function stopStats(t: Tiempo, insts: FieldInst[], s: number, members: number[]): StopStats {
  const xs: number[] = []
  let def = 0
  let val = 0
  let defVal = 0
  for (const k of members) {
    const sc = scoreAt(t, insts, s, k)
    if (Number.isNaN(sc)) continue
    xs.push(sc)
    const v = mxnAt(t, insts, s, k)
    val += v
    if (Math.round(sc) < 60) { def++; defVal += v }
  }
  xs.sort((a, b) => a - b)
  const m = xs.length
  const median = m ? (m % 2 ? xs[(m - 1) / 2] : (xs[m / 2 - 1] + xs[m / 2]) / 2) : NaN
  return { active: m, def, val, defVal, median }
}

/** Score change into window `s` against the previous graded window (NaN when either is missing). */
export function deltaAt(t: Tiempo, s: number, k: number): number {
  if (s <= 0 || s >= TOTAL_STOP) return NaN
  const now = t.score[s][k]
  if (Number.isNaN(now)) return NaN
  for (let w = s - 1; w >= 0; w--) {
    const before = t.score[w][k]
    if (!Number.isNaN(before)) return now - before
  }
  return NaN
}

/** The `limit` biggest buyers (by pesos) graded in stop `s`. */
export function biggestAt(t: Tiempo, insts: FieldInst[], s: number, limit: number): number[] {
  const out: number[] = []
  for (let k = 0; k < insts.length; k++) if (activeAt(t, insts, s, k)) out.push(k)
  return out.sort((a, b) => mxnAt(t, insts, s, b) - mxnAt(t, insts, s, a)).slice(0, limit)
}

/** Largest |Δ| movers into window `s` among buyers with at least `minMxn` pesos in it. */
export function moversAt(t: Tiempo, insts: FieldInst[], s: number, limit: number, minMxn: number): number[] {
  const out: number[] = []
  for (let k = 0; k < insts.length; k++) {
    if (!Number.isNaN(deltaAt(t, s, k)) && t.mxn[s][k] >= minMxn) out.push(k)
  }
  return out.sort((a, b) => Math.abs(deltaAt(t, s, b)) - Math.abs(deltaAt(t, s, a))).slice(0, limit)
}
