import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RiskGauge, RiskGaugeScale } from '@/components/contrato/RiskGauge'
import { bucketStatus, corroboration, DISPOSITION_META, ipsMills } from '@/components/aria/disposition'
import type { AriaQueueItem } from '@/api/types'
import { cn, formatCompactMXN } from '@/lib/utils'
import { PATTERN_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'

/**
 * RegisterRow — one vendor, one ledger row of the § EL REGISTRO Anexo
 * (DESIGN.md §8 Table): № + provenance · vendor (full name, never truncated) ·
 * risk indicator on the needle gauge · IPS mills (single ink: a priority
 * ordering, W9) · signals (pattern square + E S W ticks) · value · disposition.
 * The first cell's 3px rail carries the disposition; the open row is the pulled
 * record (12px out, seal-red rule). Row click expands EL DESGLOSE in place;
 * navigation out lives only in the EntityIdentityChip and the expand's exit.
 */

export const REGISTER_COLS = 7

interface RegisterRowProps {
  item: AriaQueueItem
  isEs: boolean
  rank: number
  expanded: boolean
  onToggle: () => void
}

/** Fixed-slot corroboration tick — presence/absence read down the column. */
function Tick({ on, color, code, title }: { on: boolean; color: string; code: string; title: string }) {
  return (
    <span
      role="img"
      aria-label={`${code}: ${on ? title : '—'}`}
      title={on ? title : undefined}
      className="aria-tick"
      style={on ? { background: color, borderColor: color } : undefined}
    />
  )
}

export function RegisterHead({ isEs }: { isEs: boolean }) {
  return (
    <thead>
      <tr>
        <th scope="col" title={isEs ? 'Origen: caso documentado · vínculo sin verificar · señalado por el modelo' : 'Rank · GT documented case / LEAD unverified link / DISC model discovery'}>Nº</th>
        <th scope="col">{isEs ? 'Proveedor' : 'Vendor'}</th>
        <th scope="col">
          {isEs ? 'Indicador de riesgo' : 'Risk indicator'}
          <RiskGaugeScale />
        </th>
        <th scope="col" className="r" title={isEs ? 'Indicador de prioridad, en milésimas; ordena la fila' : 'Priority indicator, in mills; orders the queue'}>
          {isEs ? 'IPS ↓' : 'IPS ↓'}
        </th>
        <th scope="col" title={isEs ? 'Patrón principal · registros: E = lista EFOS del SAT · S = sanción de la SFP · P = prensa' : 'Primary pattern · E SAT EFOS definitive · S sanction · W press'}>
          {isEs ? 'Señales · E S W' : 'Signals · E S W'}
        </th>
        <th scope="col" className="r">{isEs ? 'Valor' : 'Value'}</th>
        <th scope="col" title={isEs ? 'Estado del análisis; también el color del riel' : 'Analyst disposition; also the rail colour'}>{isEs ? 'Disposición' : 'Disposition'}</th>
      </tr>
    </thead>
  )
}

export function RegisterRow({ item, isEs, rank, expanded, onToggle }: RegisterRowProps) {
  const bucket = bucketStatus(item.review_status)
  const dispo = DISPOSITION_META[bucket]
  const ticks = corroboration(item)
  const dismissed = bucket === 'descartada'
  // One standing per row, from the two public labels (PARALLAX D14 § 2).
  const isLead = !item.in_ground_truth && !!item.gt_lead
  const isDisc = !item.in_ground_truth && !isLead && (item.ips_tier ?? 4) <= 2

  const provenanceTitle = item.in_ground_truth
    ? isEs ? 'Anclado a caso documentado (GT)' : 'Anchored to documented case (GT)'
    : isLead
      ? isEs ? 'Vinculado a un registro de caso · sin verificar' : 'Linked to a case record · unverified'
      : isDisc
        ? isEs ? 'Descubrimiento del modelo · sin vínculo a un caso' : 'Model discovery · no case link'
        : undefined
  const displayName = formatEntityName('vendor', item.vendor_name ?? '', 'full')
  const desgloseId = `aria-desglose-${item.vendor_id}`
  const no = String(rank).padStart(3, '0')
  const pattern = item.primary_pattern

  // The row is a plain <tr>; the keyboard / AT control is the № cell's
  // <button aria-expanded aria-controls>. Row click is a mouse convenience.
  return (
    <tr
      id={`aria-row-${item.vendor_id}`}
      onClick={onToggle}
      className={cn('aria-tr', expanded && 'is-pulled')}
      style={{ ['--rail' as string]: dispo.railColor }}
    >
      <td className="ct-rank">
        <button
          type="button"
          id={`aria-toggle-${item.vendor_id}`}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          aria-expanded={expanded}
          aria-controls={desgloseId}
          aria-label={
            isEs
              ? `${no} · ${displayName}${provenanceTitle ? ` · ${provenanceTitle}` : ''}: ${expanded ? 'cerrar' : 'abrir'} desglose`
              : `${no} · ${displayName}${provenanceTitle ? ` · ${provenanceTitle}` : ''}: ${expanded ? 'close' : 'open'} breakdown`
          }
          className="aria-rank"
        >
          <b>{no}</b>
          <small
            data-provenance
            title={provenanceTitle}
            style={{ color: item.in_ground_truth ? 'var(--color-accent-text)' : isDisc ? 'var(--color-accent-data)' : 'var(--color-text-muted)' }}
          >
            {item.in_ground_truth ? 'gt' : isLead ? 'lead' : isDisc ? 'disc' : '—'}
          </small>
        </button>
      </td>

      <td className="ct-key" onClick={(e) => e.stopPropagation()}>
        <EntityIdentityChip
          type="vendor"
          id={item.vendor_id}
          name={item.vendor_name}
          size="md"
          hideIcon
          className={cn('aria-name', dismissed && '[&_span]:text-text-muted')}
          fullName
          extraState={{ from: '/aria' }}
        />
      </td>

      <td className="gauge"><RiskGauge value={item.avg_risk_score} thinHistory={item.thin_history} vendor /></td>

      <td className="r num" data-l="IPS" title={isEs ? `IPS ${item.ips_final?.toFixed(3) ?? '—'} · indicador de prioridad` : `IPS ${item.ips_final?.toFixed(3) ?? '—'} · priority indicator`}>
        {ipsMills(item.ips_final)}
      </td>

      <td>
        <span className="aria-sig">
          <span className="inline-flex w-[40px] items-center" title={pattern ?? undefined}>
            {pattern && <><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[pattern] }} /><span onClick={(e) => e.stopPropagation()}><EntityIdentityChip type="pattern" id={pattern} name={pattern} variant="name" ariaLabel={isEs ? `Patrón ${pattern}` : `Pattern ${pattern}`} /></span></>}
          </span>
          <span className="aria-ticks">
            <Tick on={ticks.e} color="var(--color-risk-critical)" code="E" title={isEs ? 'SAT EFOS definitivo' : 'SAT EFOS definitive'} />
            <Tick on={ticks.s} color="var(--color-risk-high)" code="S" title={isEs ? 'Sanción: registro SFP o fuente oficial' : 'Sanction: SFP registry or official source'} />
            <Tick on={ticks.w} color="var(--color-text-primary)" code={isEs ? "P" : "W"} title={isEs ? 'Menciones en prensa' : 'Press mentions'} />
          </span>
        </span>
      </td>

      <td className="r num ct-amt">{item.total_value_mxn ? formatCompactMXN(item.total_value_mxn) : '—'}</td>

      <td onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={desgloseId}
          className="aria-dispo-cell"
          style={{ color: dispo.color }}
          aria-label={
            isEs
              ? `Disposición de ${displayName || 'proveedor'}: ${dispo.es}. ${expanded ? 'Cerrar' : 'Abrir'} desglose.`
              : `Disposition of ${displayName || 'vendor'}: ${dispo.en}. ${expanded ? 'Close' : 'Open'} breakdown.`
          }
        >
          {isEs ? dispo.es : dispo.en}
        </button>
      </td>
    </tr>
  )
}
