/**
 * The /captura dissection's address: ?sector= (a ribbon band → its buyers; 0 = the pooled «otros»),
 * ?inst= (a buyer → its captives, its share by year, its majority holder by year), &pair= (a captive
 * company of that buyer). Pushed to history, so a dissection is shareable and Back walks it up.
 */
import { createContext, useCallback, useContext } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface Sel { sector?: number | null; inst?: number | null; pair?: number | null }

const KEYS = ['sector', 'inst', 'pair'] as const
const int = (v: string | null) => (v != null && /^\d+$/.test(v) ? Number(v) : null)

export function useDissectionState() {
  const [params, setParams] = useSearchParams()
  const sel: Sel = { sector: int(params.get('sector')), inst: int(params.get('inst')), pair: int(params.get('pair')) }
  const open = useCallback((next: Sel | null) => setParams((p) => {
    const n = new URLSearchParams(p)
    KEYS.forEach((k) => n.delete(k))
    if (next) KEYS.forEach((k) => { if (next[k] != null) n.set(k, String(next[k])) })
    return n
  }), [setParams])
  return { sel, open }
}

export const DissectContext = createContext<(next: Sel | null) => void>(() => {})
export const useDissect = () => useContext(DissectContext)
