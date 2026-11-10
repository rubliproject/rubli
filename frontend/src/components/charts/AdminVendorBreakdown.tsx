import { motion, useReducedMotion } from 'framer-motion'
import { formatCompactMXN } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from 'react-i18next'
import { DotBar } from '@/components/ui/DotBar'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatVendorName } from '@/lib/vendor/formatName'
import { contractCount } from '@/components/administrations/data'
import { rowReveal } from '@/lib/motion'
import type { ColorToken } from '@/components/charts/editorial'

interface AdminVendorEntry {
  name: string
  total_mxn: number
  contracts: number
  risk_pct: number  // 0-100
  /** Optional vendor id — when present, name renders as <EntityIdentityChip>. */
  vendor_id?: number | string | null
}

interface Props {
  vendors: AdminVendorEntry[]
  /**
   * Era accent. Prefer a `ColorToken` ('sector-educacion', 'oecd', …) so the
   * DotBar resolves through the design-token system; raw hex strings remain
   * accepted as a legacy fallback for callers still passing palette literals.
   */
  eraColor: ColorToken | string
  loading?: boolean
}

export function AdminVendorBreakdown({ vendors, eraColor, loading }: Props) {
  const { t, i18n } = useTranslation('administrations')
  const isEs = i18n.language?.startsWith('es') ?? false
  const reduce = useReducedMotion()

  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    )
  }

  if (!vendors?.length) {
    return (
      <div className="text-sm text-text-muted py-4 text-center">
        {t('vendorSection.noData')}
      </div>
    )
  }

  const maxTotal = vendors[0]?.total_mxn ?? 1
  const displayList = vendors.slice(0, 10)

  // Resolve eraColor: ColorToken → CSS var; raw hex / var() string passes through.
  const eraColorResolved = /^[a-z][a-z0-9-]*$/i.test(eraColor) && !eraColor.startsWith('#') && !eraColor.startsWith('var(')
    ? `var(--color-${eraColor})`
    : eraColor

  return (
    // Dense ledger: one ≤32px line per vendor — rank · name · facts · bar · value.
    // Phone: facts + bar + value wrap under the name.
    <motion.ol
      className="divide-y divide-border/30"
      initial={reduce ? false : 'initial'}
      whileInView="animate"
      viewport={{ once: true, amount: 0.35 }}
    >
      {displayList.map((v, i) => {
        const pct = Math.min(100, (v.total_mxn / maxTotal) * 100)
        const formattedName = formatVendorName(v.name, 60)
        const riskScore = v.risk_pct > 1 ? v.risk_pct / 100 : v.risk_pct
        return (
          <motion.li
            key={v.vendor_id ?? i}
            variants={reduce ? undefined : rowReveal}
            custom={i}
            className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-0.5 py-1 min-h-[30px] hover:bg-background-elevated/30 transition-colors"
          >
            <span className="w-4 shrink-0 text-right text-[12px] font-mono tabular-nums text-text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-0">
              {v.vendor_id != null ? (
                <EntityIdentityChip
                  type="vendor"
                  id={v.vendor_id}
                  name={v.name}
                  size="xs"
                  riskScore={riskScore}
                  className="min-w-0"
                />
              ) : (
                <span className="text-xs font-medium text-text-primary break-words block">
                  {formattedName}
                </span>
              )}
            </div>
            <span className="ml-7 sm:ml-0 shrink-0 text-[12px] font-mono tabular-nums text-text-muted whitespace-nowrap">
              {contractCount(v.contracts, isEs)} <span aria-hidden="true">&middot;</span> {v.risk_pct.toFixed(0)}% {t('vendorSection.riskScore')}
            </span>
            <DotBar
              value={pct}
              max={100}
              color={eraColorResolved}
              emptyColor="var(--color-background-elevated)"
              emptyStroke="var(--color-border)"
              dots={16}
              dotR={2.5}
              dotGap={6}
              className="shrink-0 hidden sm:block"
            />
            <span className="font-mono tabular-nums text-[12px] text-text-primary shrink-0 w-[76px] text-right ml-auto sm:ml-0">
              {formatCompactMXN(v.total_mxn)}
            </span>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
