import { useReducer, type ReactNode } from 'react'
import { DispatchCtx, EXPLORE_DEFAULT_STATE, StateCtx, exploreReducer, readPersistedPin, type ExploreState } from './ExploreState'

export function ExploreProvider({ children }: { children: ReactNode }) {
  // Lazy init seeds the pinnedPath from localStorage so a refresh
  // keeps the pin without an extra hydration effect.
  const [state, dispatch] = useReducer(
    exploreReducer,
    EXPLORE_DEFAULT_STATE,
    (init): ExploreState => ({ ...init, pinnedPath: readPersistedPin() }),
  )
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}
