// Context + hook live apart from the provider component (react-refresh/only-export-components).
import { createContext, useContext } from 'react'

interface ExpandableContextValue {
  expandedIds: Set<string | number>
  toggle: (id: string | number) => void
  isExpanded: (id: string | number) => boolean
}

export const ExpandableContext = createContext<ExpandableContextValue | null>(null)

export function useExpandable() {
  const ctx = useContext(ExpandableContext)
  if (!ctx) {
    throw new Error('useExpandable must be used within an ExpandableProvider')
  }
  return ctx
}
