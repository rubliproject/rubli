/** A peso amount as a Clause figure: the number to count up, how to print it, and its unit
 *  (Mexican convention in Spanish: billones ≥ 10¹², MDP below; DESIGN.md / CLAUDE.md currency). */
import type { ClauseCount } from '@/components/contrato/Clause'

export function moneyFigure(mxn: number, en: boolean): { count: ClauseCount; unit: string } {
  const loc = en ? 'en-US' : 'es-MX'
  const fmt = (d: number) => (n: number) => n.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d })
  if (mxn >= 1e12) return { count: { value: mxn / 1e12, format: fmt(1) }, unit: en ? 'trillion MXN' : 'billones MXN' }
  if (en && mxn >= 1e9) return { count: { value: mxn / 1e9, format: fmt(1) }, unit: 'billion MXN' }
  return { count: { value: mxn / 1e6, format: fmt(0) }, unit: en ? 'million MXN' : 'MDP' }
}
