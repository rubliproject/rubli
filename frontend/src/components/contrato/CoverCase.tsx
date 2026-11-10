/**
 * CoverCase — the dashboard cover «El Caso en Vivo» (cover proposal C, 2026-10-14):
 * one real expediente at full measure — vendor ⇄ its largest buyer ⇄ a recent
 * contract — three subgrid columns that end level, the vendor pulled 12px with the
 * seal-red rule (the logo gesture), then a row of three live critical records.
 * Geometry is reserved while data loads (no reflow). Names never truncated.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { SECTOR_COLORS } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { RiskGauge } from './RiskGauge'
import { useLang } from './nav'

/** API procedure types arrive UPPERCASE; the sheet never shouts (DESIGN.md §2). */
const sentence = (v?: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : null)

export interface CaseVendor { id: number; name: string; sectorCode?: string | null; sectorLabel?: string | null; risk?: number | null; tier?: number | null }
export interface CaseBuyer { id: number; name: string; contracts: number; valueMxn: number; firstYear?: number | null; lastYear?: number | null }
export interface CaseContract { id: number; title?: string | null; number?: string | null; procedure?: string | null; date?: string | null; amountMxn: number }
export interface QueueRecord { id: number; vendorId?: number | null; vendorName: string; sectorCode?: string | null; risk: number; amountMxn: number }

export function CoverCase({ vendor, buyer, contract, queue, queueHref, queueLabel, cite }: {
  vendor?: CaseVendor | null
  buyer?: CaseBuyer | null
  contract?: CaseContract | null
  queue: QueueRecord[]
  queueHref: string
  queueLabel: ReactNode
  /** The § Citar control for the contract column (owned by the page). */
  cite?: ReactNode
}) {
  const lang = useLang()
  const en = lang === 'en'
  const dateFmt = new Intl.DateTimeFormat(en ? 'en-US' : 'es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <>
      <div className="cv-rec" aria-label={en ? 'Example case file: vendor, its largest buyer and a recent contract' : 'Expediente de ejemplo: proveedor, su mayor comprador y un contrato reciente'}>
        <section className="cv-col is-pulled" aria-labelledby="cv-v">
          <div className="cv-h"><span>{en ? 'Flagged vendor' : 'Proveedor señalado'}</span>{vendor?.tier != null && <span className="ct-mono">N{vendor.tier}</span>}</div>
          {vendor ? (
            <>
              <h2 className="cv-nm" id="cv-v">
                {vendor.sectorCode && <span className="ct-sq" style={{ ['--c' as string]: SECTOR_COLORS[vendor.sectorCode] }} aria-hidden="true" />}
                <EntityIdentityChip type="vendor" id={vendor.id} name={vendor.name} variant="name" fullName />
              </h2>
              <div className="cv-role">{en ? 'Vendor' : 'Proveedor'}{vendor.sectorLabel ? ` · ${vendor.sectorLabel}` : ''}{vendor.tier != null ? (en ? ` · Tier ${vendor.tier} of the queue` : ` · Nivel ${vendor.tier} de la fila`) : ''}</div>
              <div className="cv-fact"><RiskGauge value={vendor.risk} /></div>
            </>
          ) : <div className="cv-hold" aria-hidden="true" />}
        </section>
        <div className="cv-ln" aria-hidden="true"><span>{en ? 'sells to' : 'vende a'}</span></div>
        <section className="cv-col" aria-labelledby="cv-i">
          <div className="cv-h"><span>{en ? 'Its largest buyer' : 'Su mayor comprador'}</span></div>
          {buyer ? (
            <>
              <h2 className="cv-nm" id="cv-i"><EntityIdentityChip type="institution" id={buyer.id} name={buyer.name} variant="name" fullName /></h2>
              <div className="cv-role">{en ? 'Institution' : 'Institución'}{buyer.firstYear && buyer.lastYear ? ` · ${buyer.firstYear}–${buyer.lastYear}` : ''}</div>
              <div className="cv-fact">
                <span className="cv-fig">{formatCompactMXN(buyer.valueMxn)}</span>
                <span className="cv-role">{en ? `in ${formatNumber(buyer.contracts)} contracts` : `en ${formatNumber(buyer.contracts)} contratos`}</span>
              </div>
            </>
          ) : <div className="cv-hold" aria-hidden="true" />}
        </section>
        <div className="cv-ln" aria-hidden="true"><span>{en ? 'signed' : 'firmó'}</span></div>
        <section className="cv-col" aria-labelledby="cv-c">
          <div className="cv-h"><span>{en ? 'A recent contract' : 'Contrato reciente'}</span>{cite}</div>
          {contract ? (
            <>
              <h2 className={contract.title && /\s/.test(contract.title) ? 'cv-nm' : 'cv-nm mono'} id="cv-c"><Link to={`/contracts/${contract.id}`}>{contract.title || contract.number || `#${contract.id}`}</Link></h2>
              <div className="cv-role">{[contract.title ? contract.number : null, sentence(contract.procedure), contract.date ? dateFmt.format(new Date(contract.date)) : null].filter(Boolean).join(' · ') || '—'}</div>
              <div className="cv-fact"><span className="cv-fig">{formatCompactMXN(contract.amountMxn)}</span></div>
            </>
          ) : <div className="cv-hold" aria-hidden="true" />}
        </section>
      </div>

      <div className="cv-q3" aria-label={en ? 'Critical alerts in the queue' : 'Alertas críticas en la fila'}>
        <div className="cv-h"><span>{en ? 'In the queue now' : 'En la fila ahora'}</span> <Link to={queueHref} className="ct-link">{queueLabel}</Link></div>
        {queue.slice(0, 3).map((q, i) => (
          <Link key={q.id} to={`/contracts/${q.id}`} className="cv-alert" style={{ ['--i' as string]: i }}>
            <b>{q.sectorCode && <span className="ct-sq" style={{ ['--c' as string]: SECTOR_COLORS[q.sectorCode] }} aria-hidden="true" />}{q.vendorName}</b>
            <RiskGauge value={q.risk} />
            <span className="mono">{formatCompactMXN(q.amountMxn)}</span>
          </Link>
        ))}
        {queue.length === 0 && [0, 1, 2].map((i) => <div key={i} className="cv-alert cv-hold-row" aria-hidden="true" />)}
      </div>
    </>
  )
}
