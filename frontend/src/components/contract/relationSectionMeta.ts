// Split out of RelationSection.tsx so that file exports only components (react-refresh/only-export-components).
import type { ContractContextResponse } from '@/api/types'
import { formatCompactMXN } from '@/lib/utils'
import type { RelationSectionMeta } from './RelationSection'

export function getRelationSectionMeta(context: ContractContextResponse | undefined): RelationSectionMeta {
  const pair = context?.pair
  const hasRelationship = !!pair && pair.total_contracts > 1 && !!pair.vendor_id && !!pair.institution_id
  const hasFallback = context?.sector_p99_mxn != null && context?.size_vs_p99 != null
  // A pair chart is context, not proof (contract § G7).
  const eyebrow = { es: 'La relación', en: 'The relationship' }
  if (hasRelationship) {
    const nYears = pair!.first_year != null && pair!.last_year != null
      ? pair!.last_year - pair!.first_year + 1
      : null
    const total = formatCompactMXN(pair!.total_amount_mxn ?? 0)
    return {
      mode: 'relationship',
      eyebrow,
      title: nYears != null
        ? { es: `${total} en ${nYears} años`, en: `${total} across ${nYears} years` }
        : { es: 'La relación en el tiempo', en: 'The relationship in time' },
      meta: {
        es: `${pair!.total_contracts.toLocaleString('es-MX')} contratos · ${pair!.first_year ?? '—'}–${pair!.last_year ?? '—'}`,
        en: `${pair!.total_contracts.toLocaleString('en-US')} contracts · ${pair!.first_year ?? '—'}–${pair!.last_year ?? '—'}`,
      },
    }
  }
  if (hasFallback) {
    return {
      mode: 'fallback',
      eyebrow,
      title: { es: 'El tamaño en contexto', en: 'Size in context' },
      meta: null,
    }
  }
  return { mode: 'none', eyebrow, title: { es: '', en: '' }, meta: null }
}
