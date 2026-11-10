import { splitInstitutionState } from '@/lib/utils'

/**
 * An already-formatted institution name with its state qualifier set quieter:
 * «Secretaría de Salud» full ink, « · Jalisco» muted (presentInstitutionName).
 * Federal names render unchanged.
 */
export function InstitutionNameText({ name }: { name: string }) {
  const { name: own, state } = splitInstitutionState(name)
  if (!state) return <>{name}</>
  return (
    <>
      {own}
      <span className="font-normal text-text-muted"> · {state}</span>
    </>
  )
}
