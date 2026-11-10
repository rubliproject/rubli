/**
 * VendorNetworkTab — who the vendor is connected to, on «El Contrato» (DESIGN.md §7–8):
 * the ARIA standing as a record list, co-bidding partners on a ruled bar, external
 * registries. VendorCases — the documented cases that name it (EntityIdentityChip
 * type="case"), its own dossier section (docs/VENDOR_DOSSIER_SCHEME.md order).
 */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  AriaQueueItem,
  CoBiddersResponse,
  VendorDetailResponse,
  VendorExternalFlags,
  VendorGroundTruthStatus,
  VendorLinkedScandalsResponse,
} from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RuledBar } from '@/components/contrato/RuledBar'
import { ListHead, COL, NameCell, TextCell } from '@/components/kit/ListCells'
import { formatNumber } from '@/lib/utils'
import type { VendorStanding } from './buildFlags'
import { GT_EVIDENCE_ES, GT_ROLE_ES, localizeGtEnum } from './VendorEvidenceTab'

interface VendorNetworkTabProps {
  vendor: VendorDetailResponse
  aria?: AriaQueueItem | null
  /** Unused since UI v1 (cases moved to VendorCases); kept for the /print call site. */
  linkedScandals?: VendorLinkedScandalsResponse | null
  coBidders?: CoBiddersResponse | null
  externalFlags?: VendorExternalFlags | null
  /** The one GT / review standing (D13b § Change 7). */
  standing?: VendorStanding
  onOpenNetworkGraph?: () => void
}

export function VendorNetworkTab({ vendor, aria, coBidders, externalFlags, standing, onOpenNetworkGraph }: VendorNetworkTabProps) {
  const { t, i18n } = useTranslation(['vendors', 'aria'])
  const isEs = i18n.language.startsWith('es')
  const coBidList = (coBidders?.co_bidders ?? []).slice(0, 6)
  const maxCoBid = coBidList.reduce((m, cb) => Math.max(m, cb.co_bid_count ?? 0), 1)
  const ext = externalFlags && (externalFlags.sat_efos || externalFlags.sfp_sanctions?.length || externalFlags.asf_cases?.length || externalFlags.rupc)
  const status = standing?.gt === 'unverified'
    ? (isEs ? 'Pista sin verificar' : 'Unverified lead')
    : aria?.review_status ? t(`aria:status.${aria.review_status}`, { defaultValue: aria.review_status }) : null

  const paired = Boolean(aria && coBidList.length > 0)
  const extBlock = ext ? (
    <section aria-labelledby="ext-title" className={paired ? 'vd-sub' : undefined}>
      <h3 id="ext-title" className="vd-h3">{isEs ? 'Padrones externos' : 'External registers'}</h3>
      <dl className="vd-dl">
        {externalFlags?.sat_efos && (<div><dt>SAT EFOS</dt><dd>{externalFlags.sat_efos.stage}</dd></div>)}
        {externalFlags?.sfp_sanctions?.length ? (<div><dt>SFP</dt><dd>{externalFlags.sfp_sanctions.length} {isEs ? 'sanciones' : 'sanctions'}</dd></div>) : null}
        {externalFlags?.asf_cases?.length ? (<div><dt>ASF</dt><dd>{externalFlags.asf_cases.length} {isEs ? 'casos de auditoría' : 'audit cases'}</dd></div>) : null}
        {externalFlags?.rupc && (<div><dt>RUPC</dt><dd>{isEs ? 'Inscrito en el padrón de proveedores' : 'Listed in the vendor register'}</dd></div>)}
      </dl>
    </section>
  ) : null

  return (
    <div className={paired ? 'vd-two' : undefined}>
      {aria && (
        <div>
        <section aria-labelledby="aria-title">
          <h3 id="aria-title" className="vd-h3">
            {isEs ? 'Fila de investigación' : 'Investigation queue'}
            <Link to={`/aria/caso/${vendor.id}`} className="ct-link ct-sc">{isEs ? 'Abrir el caso en Focos Rojos' : 'Open the Red Flags case'}</Link>
          </h3>
          <dl className="vd-dl">
            <div><dt>{isEs ? 'Nivel' : 'Tier'}</dt><dd className="ct-mono">T{aria.ips_tier}</dd></div>
            <div><dt>{isEs ? 'Prioridad' : 'Priority'}</dt><dd><span className="ct-mono">{aria.ips_final?.toFixed(2) ?? '—'}</span> <span>{isEs ? 'indicador de prioridad (IPS) final' : 'final IPS score'}</span></dd></div>
            {status && <div><dt>{isEs ? 'Estado' : 'Status'}</dt><dd>{status}</dd></div>}
            {aria.primary_pattern && (
              <div>
                <dt>{isEs ? 'Patrón' : 'Pattern'}</dt>
                <dd>
                  {/^P[1-7]$/.test(aria.primary_pattern.trim().toUpperCase())
                    ? <EntityIdentityChip type="pattern" id={aria.primary_pattern.trim().toUpperCase()} name={`${aria.primary_pattern} · ${t(`aria:patterns.${aria.primary_pattern.trim().toUpperCase()}`)}`} variant="name" fullName />
                    : aria.primary_pattern}
                  {aria.pattern_confidence != null && <span className="ct-mono"> {(aria.pattern_confidence * 100).toFixed(0)}%</span>}
                </dd>
              </div>
            )}
          </dl>
        </section>
        {paired && extBlock}
        </div>
      )}

      {coBidList.length > 0 && (
        <section aria-labelledby="cobid-title" className="ct-rb-compact">
          <h3 id="cobid-title" className="vd-h3">
            {isEs ? 'Socios co-licitantes' : 'Co-bidding partners'}
            {onOpenNetworkGraph && (
              <button type="button" onClick={onOpenNetworkGraph} className="ct-link ct-sc">{isEs ? 'Ver la red completa' : 'View the full network'}</button>
            )}
          </h3>
          <RuledBar
            label={isEs ? 'Procedimientos compartidos' : 'Shared procedures'}
            fold={paired ? 3 : undefined}
            ticks={[{ label: '0', at: 0 }, { label: formatNumber(maxCoBid), at: 1 }]}
            rows={coBidList.map((cb) => ({
              name: <EntityIdentityChip type="vendor" id={cb.vendor_id} name={cb.vendor_name ?? `${isEs ? 'Proveedor' : 'Vendor'} ${cb.vendor_id}`} variant="name" fullName />,
              share: (cb.co_bid_count ?? 0) / maxCoBid,
              value: `${formatNumber(cb.co_bid_count ?? 0)} ${isEs ? 'proc.' : 'proc.'}`,
            }))}
          />
        </section>
      )}

      {!paired && extBlock}
    </div>
  )
}

/** Documented cases that name this vendor + linked scandals, one ledger. */
export function VendorCases({ groundTruth, linkedScandals, lang }: {
  groundTruth?: VendorGroundTruthStatus | null
  linkedScandals?: VendorLinkedScandalsResponse | null
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const gt = groundTruth?.cases ?? []
  const seen = new Set(gt.map((c) => c.scandal_slug).filter(Boolean))
  const linked = (linkedScandals?.scandals ?? linkedScandals?.cases ?? []).filter((s) => !seen.has(s.scandal_slug)).slice(0, 10)
  if (gt.length === 0 && linked.length === 0) return null
  return (
    <div className="ct-table-wrap">
      <table className="ct-table ct-stack">
        <ListHead lang={lang} cols={[COL.case, { key: 'link', es: 'Vínculo', en: 'Link' }, { key: 'role', es: 'Rol', en: 'Role' }, { key: 'evidence', es: 'Evidencia', en: 'Evidence' }]} />
        <tbody>
          {gt.map((c) => (
            <tr key={`gt-${c.case_id}`} className="ct-row">
              <td className="ct-key">{c.scandal_slug
                ? <EntityIdentityChip type="case" id={c.scandal_slug} name={c.case_name} variant="name" size="inherit" fullName flags={['gt']} />
                : <span>{c.case_name}</span>}</td>
              <TextCell>{isEs ? 'caso documentado' : 'documented case'}</TextCell>
              <TextCell>{c.role ? localizeGtEnum(c.role, isEs, GT_ROLE_ES) : '—'}</TextCell>
              <TextCell>{c.evidence_strength ? localizeGtEnum(c.evidence_strength, isEs, GT_EVIDENCE_ES) : '—'}</TextCell>
            </tr>
          ))}
          {linked.map((s, i) => (
            <tr key={s.scandal_slug ?? `l-${i}`} className="ct-row">
              <NameCell type="case" id={s.scandal_slug} name={s.scandal_title ?? s.case_name ?? s.scandal_slug} />
              <TextCell>{isEs ? 'escándalo vinculado' : 'linked scandal'}</TextCell>
              <TextCell>—</TextCell>
              <TextCell>{s.fraud_type ? s.fraud_type.replace(/_/g, ' ') : '—'}</TextCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
