/** Buyer-scope switch «Federal · Estatal y municipal · Todo» (lib/scope.ts), chip segmented control. */
import { BUYER_SCOPES, SCOPE_LABEL, type BuyerScope } from '@/lib/scope'

export function ScopeSwitch({ scope, onScope, en, note }: {
  scope: BuyerScope
  onScope: (s: BuyerScope) => void
  en: boolean
  /** One line after the chips saying what the scope applies to. */
  note?: string
}) {
  return (
    <div className="ct-scope" role="group" aria-label={en ? 'Buyer scope' : 'Alcance: qué compradores'}>
      {BUYER_SCOPES.map((s) => (
        <button key={s} type="button" className="ct-chip" aria-pressed={scope === s} onClick={() => onScope(s)}>
          {SCOPE_LABEL[s][en ? 1 : 0]}
        </button>
      ))}
      {note && <span className="ct-note !mt-0">{note}</span>}
    </div>
  )
}
