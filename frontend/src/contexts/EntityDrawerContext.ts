/**
 * EntityDrawerContext — global state for the Universal Entity Profile Drawer.
 * Any page can call open(id, type) to slide open the drawer.
 */

import { createContext, useContext } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityDrawerState {
  entityId: number | null
  entityType: 'vendor' | 'institution' | null
}

interface EntityDrawerContextValue {
  open: (id: number, type: 'vendor' | 'institution') => void
  close: () => void
  state: EntityDrawerState
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const INITIAL_STATE: EntityDrawerState = { entityId: null, entityType: null }

export const EntityDrawerContext = createContext<EntityDrawerContextValue>({
  open: () => {},
  close: () => {},
  state: INITIAL_STATE,
})

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEntityDrawer() {
  return useContext(EntityDrawerContext)
}
