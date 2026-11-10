/**
 * VendorActivityTab — what the vendor actually did.
 *
 * Risk timeline, contracts table with filters, top institutions, sector
 * breakdown. Excludes model explanations (Evidence) and network/external
 * (Network).
 *
 * vendor-P1 (2026-05-04): § 6 Cronología replaced with EditorialTimeline
 * primitive from @/components/charts/editorial. Hand-rolled TimelineNode
 * component removed. ADMINISTRATIONS import removed.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  ContractListItem,
  VendorContractAggregate,
  VendorDetailResponse,
  VendorInstitutionListResponse,
  VendorPeerComparisonResponse,
} from '@/api/types'
import { RuledBar } from '@/components/contrato/RuledBar'
import { ListHead, COL, NameCell, NumCell, AmountCell, IndicatorCell, TextCell } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import { localizeProcedure } from '@/lib/contract-format'
import { SourceTag } from '@/components/contrato/SourceTag'
import { FoldToggle } from '@/components/contrato/Fold'
import { formatCompactMXN, formatDate, formatNumber, plural, shortenContractName } from '@/lib/utils'
import { cleanContractDescription, computeContractFlags, type ContractFlags } from '@/lib/contract-audit'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { getSectorName } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import { ContractDrill, DrillToggle, SecCite, useHot, useLayer } from '@/components/dossier/layers'

const PHONE_ROWS = 5

interface VendorActivityTabProps {
  vendor: VendorDetailResponse
  contracts?:
    | { data?: ContractListItem[]; pagination?: { total: number; page: number; per_page: number } }
    | null
  contractsLoading?: boolean
  contractsPage: number
  onContractsPageChange: (page: number) => void
  institutions?: VendorInstitutionListResponse | null
  peerComparison?: VendorPeerComparisonResponse | null
  /**
   * Population-scoped contract census (all contracts, server-computed). When
   * present, the register prints an honest "X de Y sin competencia · activo
   * AAAA–AAAA" census instead of a page-sample claim. Optional so the legacy
   * VendorProfile call site keeps compiling.
   */
  contractAggregate?: VendorContractAggregate | null
  /** Page size the contracts query was made with (the dossier asks for 20). */
  perPage?: number
  /** Set beside «Its buyers» (the dossier's risk-by-year line). */
  aside?: ReactNode
}

export function VendorActivityTab({
  vendor,
  contracts,
  contractsLoading,
  contractsPage,
  onContractsPageChange,
  institutions,
  peerComparison,
  contractAggregate,
  perPage = 50,
  aside,
}: VendorActivityTabProps) {
  const { i18n } = useTranslation(['vendors'])
  const isEs = i18n.language.startsWith('es')
  const loc = isEs ? 'es-MX' : 'en-US'

  // Per-row forensic flags (≡ repeat · ① single award · ▲ top-decile · ↻
  // amendment) computed over the CURRENT PAGE. Page-scoped by construction —
  // the census line below labels population vs page honestly.
  const audit = useMemo(() => computeContractFlags(contracts?.data ?? []), [contracts?.data])
  const pageFlagged = useMemo(
    () => (contracts?.data ?? []).filter((c) => (audit.info.get(c.id)?.count ?? 0) > 0).length,
    [contracts?.data, audit],
  )

  const totalContracts = contracts?.pagination?.total ?? vendor.total_contracts
  // Phone shows 5 of the page's rows; the rest open in place (owner 2026-10-21). Desktop shows the page.
  const [phoneOpen, setPhoneOpen] = useState(false)
  const totalPages = Math.max(1, Math.ceil(totalContracts / perPage))
  // L4 lens (?lente=n): buyers by amount ⇄ by contracts. L1/L3/L5 via components/dossier/layers.
  const [params, setParams] = useSearchParams()
  const byCount = params.get('lente') === 'n'
  const setLens = (n: boolean) => setParams((p) => { const x = new URLSearchParams(p); if (n) x.set('lente', 'n'); else x.delete('lente'); return x }, { replace: true })
  const layer = useLayer()
  const [hot, bind] = useHot()
  const lang = isEs ? 'es' : 'en'
  const metric = (i: { total_value_mxn: number; contract_count: number }) => (byCount ? i.contract_count : i.total_value_mxn)
  const institutionRows = [...(institutions?.data ?? [])].sort((a, b) => metric(b) - metric(a)).slice(0, 10)
  const maxInst = institutionRows.reduce((m, i) => Math.max(m, metric(i)), 1)
  const openBuyer = layer.sec === 'compradores' ? institutionRows.findIndex((i) => String(i.institution_id) === layer.row) : -1
  const topBuyer = [...(institutions?.data ?? [])].sort((a, b) => b.total_value_mxn - a.total_value_mxn)[0]
  const sectorLabel = vendor.primary_sector_name ? getSectorName(vendor.primary_sector_name.toLowerCase(), isEs ? 'es' : 'en') : null

  const valueMetric = peerComparison?.metrics.find((m) => m.metric === 'total_value_mxn')
  const riskMetric = peerComparison?.metrics.find((m) => m.metric === 'avg_risk_score')
  const valPct = valueMetric?.percentile ?? null
  const riskPct = riskMetric?.percentile ?? null

  const popTotal = contractAggregate?.total_contracts ?? totalContracts
  const noComp = contractAggregate?.no_competition
  const yrMin = contractAggregate?.year_min ?? vendor.first_contract_year ?? null
  const yrMax = contractAggregate?.year_max ?? vendor.last_contract_year ?? null
  const shown = contracts?.data?.length ?? 0
  const census = [
    `${popTotal.toLocaleString(loc)} ${isEs ? plural(popTotal, 'contrato', 'contratos') : plural(popTotal, 'contract', 'contracts')}`,
    noComp != null && popTotal > 0 ? `${noComp.toLocaleString(loc)} ${isEs ? 'sin licitación' : 'without competition'} (${Math.round((noComp / popTotal) * 100)}%)` : null,
    yrMin != null && yrMax != null ? `${yrMin}${yrMax !== yrMin ? `–${yrMax}` : ''}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      {/* Its buyers — ranked by amount (D13b § 3), the sector rank under the heading */}
      {(institutionRows.length > 0 || aside) && (
      <div className={aside ? 'vd-sub vd-two vd-two-wl' : 'vd-sub'}>
      {institutionRows.length > 0 && (
        <section className="ct-rb-compact" aria-labelledby="inst-title">
          <h3 id="inst-title" className="vd-h3" data-sec="compradores">
            {isEs ? 'Sus compradores' : 'Its buyers'}
            {(valPct != null || riskPct != null) && (
              <span className="vd-h3-note">
                {[
                  valPct != null ? (isEs ? `entre el ${Math.max(1, Math.round(100 - valPct))}% de mayor monto de ${sectorLabel ?? 'su sector'}` : `top ${Math.max(1, Math.round(100 - valPct))}% by amount in ${sectorLabel ?? 'its sector'}`) : null,
                  riskPct != null ? (isEs ? `percentil ${riskPct.toFixed(0)} de riesgo` : `risk percentile ${riskPct.toFixed(0)}`) : null,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
            <span className="dl-lens" role="group" aria-label={isEs ? 'Leer por' : 'Read by'}>
              <button type="button" aria-pressed={!byCount} onClick={() => setLens(false)}>{isEs ? 'monto' : 'amount'}</button>
              <button type="button" aria-pressed={byCount} onClick={() => setLens(true)}>{isEs ? 'contratos' : 'contracts'}</button>
            </span>
            {topBuyer && (
              <SecCite
                sec="compradores"
                lang={lang}
                text={isEs
                  ? `${topBuyer.institution_name} es el mayor comprador de ${formatVendorName(vendor.name, 300)}: ${formatCompactMXN(topBuyer.total_value_mxn)} en ${topBuyer.contract_count.toLocaleString(loc)} contratos (RUBLI, datos COMPRANET).`
                  : `${topBuyer.institution_name} is the largest buyer of ${formatVendorName(vendor.name, 300)}: ${formatCompactMXN(topBuyer.total_value_mxn)} across ${topBuyer.contract_count.toLocaleString(loc)} contracts (RUBLI, COMPRANET data).`}
              />
            )}
          </h3>
          <RuledBar
            label={isEs ? 'Instituciones compradoras por monto' : 'Buying institutions by amount'}
            ticks={[{ label: '0', at: 0 }, { label: byCount ? formatNumber(maxInst) : formatCompactMXN(maxInst), at: 1 }]}
            fold={aside && openBuyer < 3 ? 3 : undefined}
            rows={institutionRows.map((inst) => {
              const share = vendor.total_value_mxn > 0 ? inst.total_value_mxn / vendor.total_value_mxn : 0
              const open = layer.isOpen('compradores', inst.institution_id)
              const n = `${inst.contract_count.toLocaleString(loc)} ${isEs ? plural(inst.contract_count, 'contrato', 'contratos') : plural(inst.contract_count, 'contract', 'contracts')}`
              return {
                name: <EntityIdentityChip type="institution" id={inst.institution_id} name={inst.institution_name} variant="name" fullName />,
                sub: `${byCount ? formatCompactMXN(inst.total_value_mxn) : n} · ${share > 0 && share < 0.01 ? '<1' : Math.round(share * 100)}%`,
                share: metric(inst) / maxInst,
                hot: hot === `i:${inst.institution_id}`,
                bind: bind(`i:${inst.institution_id}`),
                value: (
                  <DrillToggle sec="compradores" row={inst.institution_id} open={open} onToggle={() => layer.toggle('compradores', inst.institution_id)} lang={lang} what={isEs ? `los contratos con ${inst.institution_name}` : `the contracts with ${inst.institution_name}`}>
                    {byCount ? n : formatCompactMXN(inst.total_value_mxn)}
                  </DrillToggle>
                ),
                after: open ? (
                  <ContractDrill sec="compradores" row={inst.institution_id} lang={lang} onClose={layer.close}
                    filter={{ vendor_id: vendor.id, institution_id: inst.institution_id }}
                    title={isEs ? `Sus contratos con ${inst.institution_name}` : `Its contracts with ${inst.institution_name}`} />
                ) : null,
              }
            })}
          />
        </section>
      )}
      {aside}
      </div>
      )}

      {/* El registro — the forensic contract ledger (flag column) */}
      <section className="vd-sub" aria-labelledby="contracts-title">
        <h3 id="contracts-title" data-sec="contratos">
          {isEs ? 'Sus contratos' : 'Its contracts'}
          <span className="vd-h3-note">{census}</span>
          <SecCite sec="contratos" lang={lang} text={`${formatVendorName(vendor.name, 300)}: ${census} (RUBLI, ${isEs ? 'datos COMPRANET' : 'COMPRANET data'}).`} />
        </h3>
        {shown > 0 && (
          <p className="vd-legend">
            {isEs
              ? `Señales en esta página (${shown} de ${popTotal.toLocaleString(loc)}, ${pageFlagged} con señal): `
              : `Flags on this page (${shown} of ${popTotal.toLocaleString(loc)}, ${pageFlagged} flagged): `}
            <b>≡</b> {isEs ? 'repetido' : 'repeated'} · <b>①</b> {isEs ? 'un solo adjudicado' : 'single award'} · <b>▲</b> {isEs ? 'decil superior' : 'top decile'} · <b>↻</b> {isEs ? 'convenio' : 'amendment'}
          </p>
        )}
        <div className="ct-table-wrap">
          <table className="ct-table ct-stack vd-ctable" aria-label={isEs ? 'Contratos del proveedor' : 'Vendor contracts'} aria-busy={contractsLoading || undefined}>
            <ListHead lang={lang} ranked cols={[COL.date, COL.contract, COL.institution, COL.procedure, COL.amount, COL.indicator, COL.flags]} />
            <tbody>
              {contractsLoading
                ? Array.from({ length: 8 }, (_, i) => <tr key={i} className="vd-hold-row" aria-hidden="true"><td colSpan={8} /></tr>)
                : (contracts?.data ?? []).map((c, i) => {
                    const flags = audit.info.get(c.id)
                    const clean = cleanContractDescription(c.title ?? '', Infinity)
                    const yr = c.contract_year ?? (c.contract_date ? Number(c.contract_date.slice(0, 4)) : null)
                    const lit = hot != null && (hot === `i:${c.institution_id}` || hot === `y:${yr}`)
                    return (
                      <tr key={c.id} className={`${!phoneOpen && shown > PHONE_ROWS + 1 && i >= PHONE_ROWS ? 'ct-row ct-phone-cut' : 'ct-row'}${lit ? ' is-hot' : ''}`} {...(c.institution_id ? bind(`i:${c.institution_id}`) : {})}>
                        <RankCell n={(contractsPage - 1) * perPage + i + 1} />
                        <NumCell label={isEs ? 'fecha' : 'date'}>{c.contract_date ? formatDate(c.contract_date) : '—'}<SourceTag struct={c.source_structure} score={c.risk_score} ver={c.risk_model_version} /></NumCell>
                        <td className="ct-key">
                          <Link to={`/contracts/${c.id}`} state={{ from: 'vendor', vendorId: vendor.id }} className="ct-link">
                            {clean.objeto ?? (c.title ? shortenContractName(c.title, Infinity) : `${isEs ? 'Contrato' : 'Contract'} #${c.id}`)}
                          </Link>
                          {clean.objeto && clean.code && (
                            <span className="vd-code">{clean.code}{clean.moreCodes > 0 ? ` +${clean.moreCodes}` : ''}</span>
                          )}
                        </td>
                        <NameCell type="institution" id={c.institution_name ? c.institution_id : null} name={c.institution_name} siglas />
                        <TextCell>{localizeProcedure(c.procedure_type, lang)}</TextCell>
                        <AmountCell value={c.amount_mxn} />
                        <IndicatorCell value={c.risk_score} />
                        <TextCell><FlagGutter flags={flags} isEs={isEs} /></TextCell>
                      </tr>
                    )
                  })}
              {!contractsLoading && shown === 0 && (
                <tr><td colSpan={8} className="ct-note">{isEs ? 'Sin contratos en el registro.' : 'No contracts on record.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {shown > PHONE_ROWS + 1 && (
          <div className="ct-phone-only">
            <FoldToggle open={phoneOpen} rest={shown - PHONE_ROWS} onToggle={() => setPhoneOpen((o) => !o)} />
          </div>
        )}
        {totalPages > 1 && (
          <nav className="vd-pager" aria-label={isEs ? 'Páginas de contratos' : 'Contract pages'}>
            <span>{isEs ? `Página ${contractsPage} de ${formatNumber(totalPages)}` : `Page ${contractsPage} of ${formatNumber(totalPages)}`}</span>
            <div>
              <button type="button" disabled={contractsPage <= 1} onClick={() => onContractsPageChange(contractsPage - 1)}>{isEs ? 'Anterior' : 'Previous'}</button>
              <button type="button" disabled={contractsPage >= totalPages} onClick={() => onContractsPageChange(contractsPage + 1)}>{isEs ? 'Siguiente' : 'Next'}</button>
            </div>
          </nav>
        )}
      </section>
    </>
  )
}

/**
 * FlagGutter — the per-contract forensic signals as a compact glyph row.
 * ≡ repeated amount/object · ① single award · ▲ within-page top-decile · ↻ amendment.
 */
function FlagGutter({ flags, isEs }: { flags?: ContractFlags; isEs: boolean }) {
  if (!flags || flags.count === 0) return <span className="sr-only">{isEs ? 'sin señal' : 'no flag'}</span>
  const items: Array<{ glyph: string; label: string }> = []
  if (flags.repeated) items.push({ glyph: '≡', label: isEs ? 'monto u objeto repetido' : 'repeated amount or object' })
  if (flags.singleBid) items.push({ glyph: '①', label: isEs ? 'procedimiento con un solo adjudicado' : 'single-award procedure' })
  if (flags.decile) items.push({ glyph: '▲', label: isEs ? 'decil superior en esta página' : 'top decile on this page' })
  if (flags.amendment) items.push({ glyph: '↻', label: isEs ? 'convenio modificatorio' : 'amendment' })
  const srLabel = items.map((i) => i.label).join(', ')
  return (
    <span className="vd-flags" title={srLabel}>
      <span className="sr-only">{srLabel}</span>
      <span aria-hidden="true">{items.map((it) => it.glyph).join(' ')}</span>
    </span>
  )
}
