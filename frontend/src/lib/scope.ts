/**
 * Buyer scope — docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 1.
 *
 * Every page answers about federal buyers by default; state and municipal buyers
 * are their own scope, never mixed into federal counts or per-agency figures.
 * URL: `?alcance=local|todo` (absent = federal). API: `scope=federal|local|all`.
 */
import { useSearchParams } from 'react-router-dom'

export type BuyerScope = 'federal' | 'local' | 'all'
export const BUYER_SCOPES: BuyerScope[] = ['federal', 'local', 'all']

const FROM_URL: Record<string, BuyerScope> = { local: 'local', todo: 'all' }
const TO_URL: Record<BuyerScope, string | null> = { federal: null, local: 'local', all: 'todo' }

export function scopeFromParam(v: string | null): BuyerScope {
  return (v && FROM_URL[v]) || 'federal'
}

/** [scope, setScope] in URL state (?alcance=). */
export function useBuyerScope(): [BuyerScope, (s: BuyerScope) => void] {
  const [sp, setSp] = useSearchParams()
  const scope = scopeFromParam(sp.get('alcance'))
  const set = (s: BuyerScope) => {
    const next = new URLSearchParams(sp)
    const v = TO_URL[s]
    if (v) next.set('alcance', v)
    else next.delete('alcance')
    setSp(next, { replace: true, preventScrollReset: true })
  }
  return [scope, set]
}

export const SCOPE_LABEL: Record<BuyerScope, [string, string]> = {
  federal: ['Federal', 'Federal'],
  local: ['Estatal y municipal', 'State & municipal'],
  all: ['Todo', 'All'],
}

/** «compradores federales» / «federal buyers» — the noun for a scoped agency count. */
export function scopeBuyers(scope: BuyerScope, en: boolean): string {
  return {
    federal: en ? 'federal buyers' : 'compradores federales',
    local: en ? 'state & municipal buyers' : 'compradores estatales y municipales',
    all: en ? 'buyers, every level' : 'compradores de todos los niveles',
  }[scope]
}
