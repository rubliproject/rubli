/**
 * RecordChain — the pulled record (DESIGN.md §7–8): the flagged vendor pulled
 * out of line in seal red, a red link line carrying the facts, the institution.
 * Names render through EntityIdentityChip (name variant), never a bare link.
 */
import type { ReactNode } from 'react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { SECTOR_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { RiskGauge } from './RiskGauge'

export interface ChainEntity {
  id: number
  name: string
  /** Mono line under the name («Proveedor · Salud»). */
  role: ReactNode
  sectorCode?: string | null
}

export function RecordChain({ title, vendor, risk, tier, facts, institution, more, pending }: {
  title: string
  vendor: ChainEntity
  risk?: number | null
  tier?: number | null
  /** The link line between the two records (mono facts). */
  facts?: ReactNode
  institution?: ChainEntity | null
  more?: ReactNode
  /** The institution is still loading: hold the link line + institution row (no reflow below). */
  pending?: boolean
}) {
  const sq = (code?: string | null) => (
    <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: code ? SECTOR_COLORS[code] : undefined }} />
  )
  return (
    <section aria-label={title}>
      <div className="ct-rec is-pulled">
        <EntityIdentityChip type="vendor" id={vendor.id} name={vendor.name} variant="name" className="ct-ent">
          {sq(vendor.sectorCode)}
          <EntityName type="vendor" name={vendor.name} />
          <span className="ct-role">{vendor.role}</span>
        </EntityIdentityChip>
        {risk != null && <div style={{ marginTop: 8 }}><RiskGauge value={risk} tier={tier} /></div>}
      </div>
      {pending && !institution && <div className="ct-inst-hold" aria-hidden="true" />}
      {facts && <div className="ct-chainlink">{facts}</div>}
      {institution && (
        <div className="ct-rec">
          <EntityIdentityChip type="institution" id={institution.id} name={institution.name} variant="name" className="ct-ent">
            {sq(institution.sectorCode)}
            <EntityName type="institution" name={institution.name} />
            <span className="ct-role">{institution.role}</span>
          </EntityIdentityChip>
        </div>
      )}
      {more}
    </section>
  )
}

function EntityName({ type, name }: { type: 'vendor' | 'institution'; name: string }) {
  return <>{formatEntityName(type, name, 'full')}</>
}
