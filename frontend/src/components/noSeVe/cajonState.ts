/**
 * The /no-se-ve drawer's address, on the /captura dissection's model (components/captura/dissect.ts):
 * ?ente= (an entity, or the project «tren-maya») and &anio= (one of its years). Pushed to history, so a
 * layer is shareable and Back walks it up. Keys are strings here, which is why it is not dissect.ts itself.
 */
import { createContext, useCallback, useContext } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface Sel { ente?: string | null; anio?: number | null }

const KEY = /^[a-z0-9-]{2,40}$/

export function useCajonState() {
  const [params, setParams] = useSearchParams()
  const e = params.get('ente'), a = params.get('anio')
  const sel: Sel = { ente: e && KEY.test(e) ? e : null, anio: a && /^\d{4}$/.test(a) ? Number(a) : null }
  const open = useCallback((next: Sel | null) => setParams((p) => {
    const n = new URLSearchParams(p)
    n.delete('ente'); n.delete('anio')
    if (next?.ente) { n.set('ente', next.ente); if (next.anio != null) n.set('anio', String(next.anio)) }
    return n
  }), [setParams])
  return { sel, open }
}

export const CajonContext = createContext<(next: Sel | null) => void>(() => {})
export const useCajon = () => useContext(CajonContext)
