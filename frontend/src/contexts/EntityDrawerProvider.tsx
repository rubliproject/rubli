import { useState } from 'react'
import { EntityDrawerContext, INITIAL_STATE, type EntityDrawerState } from './EntityDrawerContext'

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EntityDrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EntityDrawerState>(INITIAL_STATE)

  function open(entityId: number, entityType: 'vendor' | 'institution') {
    setState({ entityId, entityType })
  }

  function close() {
    setState(INITIAL_STATE)
  }

  return (
    <EntityDrawerContext.Provider value={{ open, close, state }}>
      {children}
    </EntityDrawerContext.Provider>
  )
}
