import { useCallback, useState, type ReactNode } from 'react'
import { Ctx, DossierOriginCtx, type DossierOrigin, type SiblingList, type WayfindingKind } from './wayfinding'

export function WayfindingProvider({ children }: { children: ReactNode }) {
  const [list, setListState] = useState<SiblingList | null>(null)
  const [lastViewed, setLV] = useState<Partial<Record<WayfindingKind, string>>>({})

  const setList = useCallback((l: SiblingList) => setListState(l), [])
  const setLastViewed = useCallback(
    (kind: WayfindingKind, id: string) =>
      setLV((prev) => (prev[kind] === id ? prev : { ...prev, [kind]: id })),
    [],
  )

  return (
    <Ctx.Provider value={{ list, setList, lastViewed, setLastViewed }}>
      {children}
    </Ctx.Provider>
  )
}

export function DossierOriginProvider({
  value,
  children,
}: {
  value: DossierOrigin | null
  children: ReactNode
}) {
  return <DossierOriginCtx.Provider value={value}>{children}</DossierOriginCtx.Provider>
}
