/**
 * AdminVendorsDeepList — § IV, the term's top-100 beneficiaries, in the Portada's list look (kit/BoardList, owner 11-09).
 * Sortable by value / risk / contracts, CSV export, the first 12 shown with «ver los 100». Every vendor is an
 * EntityIdentityChip.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { BoardList, type BoardCol } from '@/components/kit/BoardList'
import { LEVEL } from '@/components/portada/Tablero'
import { TableExportButton } from '@/components/TableExportButton'
import { getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, pctOrDash } from '@/lib/utils'
import type { AdminVendorDeep } from '@/api/types'

// ── Sort key type ─────────────────────────────────────────────────────────────
type SortKey = 'value' | 'risk' | 'contracts'

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  era: string
  isEs: boolean
  selectedDisplay: string
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AdminVendorsDeepList({ era, isEs, selectedDisplay }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const lang = isEs ? 'es' : 'en'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analysis', 'admin-vendors-deep', era],
    queryFn: () => analysisApi.getAdminVendorsDeep(era, 100),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  const vendors = data?.vendors ?? []
  const vendorCount = data?.vendor_count ?? 0
  const termTotalMxn = data?.term_total_mxn ?? 0

  const sorted = useMemo((): AdminVendorDeep[] => {
    const copy = [...vendors]
    if (sortKey === 'value') {
      copy.sort((a, b) => b.total_mxn - a.total_mxn)
    } else if (sortKey === 'risk') {
      copy.sort((a, b) => {
        const riskDiff = b.high_risk_pct - a.high_risk_pct
        if (riskDiff !== 0) return riskDiff
        return (b.avg_risk ?? 0) - (a.avg_risk ?? 0)
      })
    } else {
      copy.sort((a, b) => b.contracts - a.contracts)
    }
    return copy
  }, [vendors, sortKey])

  // ── CSV data (full sorted set, deterministic column order) ─────────────────
  const csvData = useMemo(
    () =>
      sorted.map((v, i) => ({
        [isEs ? 'rango' : 'rank']: i + 1,
        vendor_id: v.vendor_id,
        [isEs ? 'proveedor' : 'vendor']: v.vendor_name,
        [isEs ? 'valor_mxn' : 'value_mxn']: Math.round(v.total_mxn),
        [isEs ? 'pct_del_periodo' : 'share_pct']: v.share_pct.toFixed(2),
        [isEs ? 'contratos' : 'contracts']: v.contracts,
        [isEs ? 'riesgo_prom' : 'avg_risk']: (v.avg_risk ?? 0).toFixed(3),
        [isEs ? 'alto_riesgo_pct' : 'high_risk_pct']: v.high_risk_pct.toFixed(1),
        [isEs ? 'adj_directa_pct' : 'direct_award_pct']: (v.direct_award_pct?.toFixed(1) ?? ''),
      })),
    [sorted, isEs]
  )

  const csvColumns = isEs
    ? ['rango', 'vendor_id', 'proveedor', 'valor_mxn', 'pct_del_periodo', 'contratos', 'riesgo_prom', 'alto_riesgo_pct', 'adj_directa_pct']
    : ['rank', 'vendor_id', 'vendor', 'value_mxn', 'share_pct', 'contracts', 'avg_risk', 'high_risk_pct', 'direct_award_pct']

  // ── Sort tab config ─────────────────────────────────────────────────────────
  const sortTabs: { key: SortKey; es: string; en: string }[] = [
    { key: 'value', es: 'valor', en: 'Value' },
    { key: 'risk', es: 'riesgo', en: 'Risk' },
    { key: 'contracts', es: 'contratos', en: 'Contracts' },
  ]

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="adm-board-hold" aria-busy="true" />
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="text-sm text-text-muted py-6 text-center">
        {isEs ? 'No se pudo cargar el padrón completo.' : 'Could not load the full ledger.'}
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!vendors.length) {
    return (
      <div className="text-sm text-text-muted py-6 text-center">
        {isEs
          ? 'Sin proveedores registrados para este periodo.'
          : 'No vendors recorded for this term.'}
      </div>
    )
  }

  const cols: BoardCol[] = [
    { label: '#', w: '32px', cls: 'bd-age bl-rk', phone: true },
    { label: isEs ? 'Proveedor' : 'Supplier', w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
    { label: <>{isEs ? 'Contratos' : 'Contracts'}{sortKey === 'contracts' ? ' ↓' : ''}</>, w: '96px', r: true, cls: 'bl-num' },
    { label: <>{isEs ? 'Alto riesgo' : 'High risk'}{sortKey === 'risk' ? ' ↓' : ''}</>, w: '96px', r: true, cls: 'bl-num' },
    { label: isEs ? 'Sin concurso' : 'No tender', w: '128px', r: true, cls: 'bl-num' },
    { label: <>{isEs ? 'Monto' : 'Amount'}{sortKey === 'value' ? ' ↓' : ''}</>, w: '140px', r: true, cls: 'bd-amt', phone: true },
    { label: isEs ? 'Del total' : 'Of total', w: '80px', r: true, cls: 'bl-num' },
    { label: isEs ? 'Indicador' : 'Indicator', w: '120px', cls: 'bd-risk' },
  ]
  const bar = (
    <>
      <div className="bd-tabs" role="group" aria-label={isEs ? 'Ordenar por' : 'Sort by'}>
        {sortTabs.map((tab) => (
          <button key={tab.key} type="button" aria-pressed={sortKey === tab.key} onClick={() => setSortKey(tab.key)}>{isEs ? tab.es : tab.en}</button>
        ))}
      </div>
      <TableExportButton data={csvData} columns={csvColumns} filename={`rubli-${era}-beneficiarios-top100`} className="shrink-0 self-center" />
    </>
  )
  return (
    <BoardList id="adm-v100" lang={lang} fold={12}
      title={isEs ? 'Quién ganó' : 'Who won'}
      when={<><b>{vendors.length}</b> {isEs ? 'de' : 'of'} <b>{vendorCount.toLocaleString(isEs ? 'es-MX' : 'en-US')}</b> {isEs ? 'proveedores activos' : 'active suppliers'} · {selectedDisplay}</>}
      bar={bar} cols={cols}
      rows={sorted.map((v, i) => {
        const lv = v.avg_risk != null ? getRiskLevelFromScore(v.avg_risk) : null
        return {
          key: v.vendor_id,
          cells: [
            String(i + 1).padStart(3, '0'),
            <EntityIdentityChip key="v" type="vendor" id={v.vendor_id} name={v.vendor_name} variant="name" className="bd-chip" fullName />,
            v.contracts.toLocaleString(isEs ? 'es-MX' : 'en-US'),
            `${v.high_risk_pct.toFixed(0)} %`,
            pctOrDash(v.direct_award_pct, 0),
            formatCompactMXN(v.total_mxn),
            `${v.share_pct.toFixed(1)} %`,
            lv ? <span className={`bd-st is-${lv}`}><span className="sr-only">{isEs ? 'Indicador de riesgo promedio: ' : 'Average risk indicator: '}</span>{isEs ? LEVEL[lv].es : LEVEL[lv].en}</span> : '—',
          ],
        }
      })}
      note={isEs
        ? `Del total = parte del gasto del sexenio (${formatCompactMXN(termTotalMxn)}, atípicos excluidos). Alto riesgo = contratos con indicador de 0.40 o más; indicador = el promedio de sus contratos: una señal, no una prueba.`
        : `Of total = share of the term's spend (${formatCompactMXN(termTotalMxn)}, outliers excluded). High risk = contracts with an indicator of 0.40 or more; indicator = the average of its contracts: a signal, not proof.`} />
  )
}
