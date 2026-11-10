/**
 * AdminBuyersSection — § V, the agencies that spent the most in the term, in the Portada's list look
 * (kit/BoardList, owner 11-09). One line each: rank · ● top sector · agency (+ siglas, FED) · contracts · no tender ·
 * amount · share. No risk chip on an agency (a spend map, not a verdict on a ministry). CSV export kept.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { BoardList, type BoardCol } from '@/components/kit/BoardList'
import { Dot } from '@/components/portada/Tablero'
import { TableExportButton } from '@/components/TableExportButton'
import { SECTORS } from '@/lib/constants'
import { formatCompactMXN, pctOrDash } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import type { AdminInstitutionBuyer } from '@/api/types'

// ── Full-name cleaner (local — so we can show untruncated agency names without
//    the shared formatInstitutionName's naive "De/Y/S.n.c." title-casing). Only
//    all-caps sources get re-cased; mixed-case names (SICT, INSABI) pass through.
const ES_MINOR = new Set([
  'de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a', 'al', 'para', 'por', 'con',
])
function cleanInstitutionName(raw: string): string {
  if (!raw) return ''
  const stripped = raw
    .replace(/,?\s*S\.?N\.?C\.?\s*$/i, '')                        // drop trailing S.N.C.
    .replace(/,?\s*S\.?A\.?\s+DE\s+C\.?V\.?\s*$/i, '')            // drop S.A. de C.V.
    .replace(/,?\s*S\.?\s+DE\s+R\.?L\.?\s+DE\s+C\.?V\.?\s*$/i, '') // drop S. de R.L. de C.V.
    .replace(/\s+/g, ' ')
    .replace(/[\s,;]+$/, '')
    .trim()
  if (stripped !== stripped.toUpperCase()) return stripped       // already cased — leave it
  return stripped
    .split(' ')
    .map((w, i) => {
      if (!w) return w
      const lower = w.toLowerCase()
      if (i > 0 && ES_MINOR.has(lower.replace(/[.,]/g, ''))) return lower
      if (w.includes('.')) return w                              // preserve acronyms (S.N.C.)
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

interface Props {
  era: string
  isEs: boolean
  selectedDisplay: string
}

export function AdminBuyersSection({ era, isEs, selectedDisplay }: Props) {
  const lang = isEs ? 'es' : 'en'
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analysis', 'admin-institutions', era],
    queryFn: () => analysisApi.getAdminInstitutions(era, 12),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  const institutions = data?.institutions ?? []
  const institutionCount = data?.institution_count ?? 0
  const topNSharePct = data?.top_n_share_pct ?? 0

  // CSV data (full 12, deterministic column order)
  const csvData = useMemo(
    () =>
      institutions.map((inst: AdminInstitutionBuyer, i: number) => ({
        [isEs ? 'rango' : 'rank']: i + 1,
        institution_id: inst.institution_id,
        [isEs ? 'dependencia' : 'institution']: inst.institution_name,
        [isEs ? 'siglas' : 'acronym']: inst.siglas ?? '',
        [isEs ? 'federal' : 'federal']: inst.is_federal === 1 ? (isEs ? 'Sí' : 'Yes') : (isEs ? 'No' : 'No'),
        [isEs ? 'valor_mxn' : 'value_mxn']: Math.round(inst.total_mxn),
        [isEs ? 'pct_del_periodo' : 'share_pct']: inst.share_pct.toFixed(2),
        [isEs ? 'contratos' : 'contracts']: inst.contracts,
        [isEs ? 'adj_directa_pct' : 'direct_award_pct']: (inst.direct_award_pct?.toFixed(1) ?? ''),
        [isEs ? 'sector' : 'top_sector']: inst.top_sector_code ?? '',
      })),
    [institutions, isEs]
  )

  const csvColumns = isEs
    ? ['rango', 'institution_id', 'dependencia', 'siglas', 'federal', 'valor_mxn', 'pct_del_periodo', 'contratos', 'adj_directa_pct', 'sector']
    : ['rank', 'institution_id', 'institution', 'acronym', 'federal', 'value_mxn', 'share_pct', 'contracts', 'direct_award_pct', 'top_sector']

  // ── Concentration lede ─────────────────────────────────────────────────────
  const topInst = institutions[0]
  const topSiglasOrName = topInst
    ? (topInst.siglas ?? formatEntityName('institution', topInst.institution_name, 'sm'))
    : ''

  if (isLoading) return <div className="adm-board-hold" aria-busy="true" />
  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="text-sm text-text-muted py-4 text-center">
        {isEs ? 'No se pudo cargar a los compradores.' : 'Could not load the buyers.'}
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!institutions.length) {
    return (
      <div className="text-sm text-text-muted py-4 text-center">
        {isEs
          ? 'Sin compradores registrados para este periodo.'
          : 'No buyers recorded for this term.'}
      </div>
    )
  }

  const cols: BoardCol[] = [
    { label: '#', w: '32px', cls: 'bd-age bl-rk', phone: true },
    { label: isEs ? 'Dependencia' : 'Agency', w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
    { label: isEs ? 'Contratos' : 'Contracts', w: '96px', r: true, cls: 'bl-num' },
    { label: isEs ? 'Sin concurso' : 'No tender', w: '128px', r: true, cls: 'bl-num' },
    { label: isEs ? 'Monto' : 'Amount', w: '140px', r: true, cls: 'bd-amt', phone: true },
    { label: isEs ? 'Del gasto' : 'Of spend', w: '88px', r: true, cls: 'bl-num' },
  ]
  return (
    <BoardList id="adm-buy" lang={lang}
      title={isEs ? 'Quién compró' : 'Who bought'}
      when={<>{topNSharePct > 0 && <>{isEs ? 'Las' : 'The top'} <b>{institutions.length}</b> {isEs ? 'mayores gastaron el' : 'spent'} <b>{topNSharePct.toFixed(0)} %</b> {isEs ? `del periodo, encabezadas por ${topSiglasOrName}` : `of the term, led by ${topSiglasOrName}`} · </>}<b>{institutionCount.toLocaleString(isEs ? 'es-MX' : 'en-US')}</b> {isEs ? 'dependencias compradoras' : 'buying agencies'} · {selectedDisplay}</>}
      bar={<><p className="bd-tabs adm-bar-k">{isEs ? 'Por monto' : 'By amount'}</p><TableExportButton data={csvData} columns={csvColumns} filename={`rubli-${era}-compradores`} className="shrink-0 self-center" /></>}
      cols={cols}
      rows={institutions.map((inst: AdminInstitutionBuyer, i: number) => ({
        key: inst.institution_id,
        cells: [
          String(i + 1).padStart(2, '0'),
          <>
            <Dot id={SECTORS.find((x) => x.code === inst.top_sector_code)?.id} lang={lang} />
            <EntityIdentityChip type="institution" id={inst.institution_id} name={cleanInstitutionName(inst.institution_name)} variant="name" className="bd-chip" fullName />
            {inst.siglas && <span className="bd-dim"> · {inst.siglas}</span>}
            {inst.is_federal === 1 && <span className="bd-dim" title={isEs ? 'Dependencia federal' : 'Federal entity'}> · FED</span>}
          </>,
          inst.contracts.toLocaleString(isEs ? 'es-MX' : 'en-US'),
          pctOrDash(inst.direct_award_pct, 0),
          formatCompactMXN(inst.total_mxn),
          `${inst.share_pct.toFixed(1)} %`,
        ],
      }))}
      note={isEs ? '● = el sector donde más gastó · FED = dependencia federal · Sin concurso = parte de sus contratos adjudicados sin competir.' : '● = the sector it spent most in · FED = federal agency · No tender = share of its contracts awarded without competition.'} />
  )
}
