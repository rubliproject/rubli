/**
 * PriorityAlert — one alert block that collapses multiple severity flags by
 * priority order.
 *
 * Replaces the old pattern where VendorProfile stacked 5 separate alert
 * components (Critical Alert Banner → EFOS/SFP Banner → ARIA Red Flags →
 * GT known-bad banner → SanctionsAlertBanner) that each rendered variants of
 * "this vendor is suspicious" using the same underlying facts.
 *
 * Caller passes a list of <Flag> objects already sorted by priority (highest
 * first). The component renders the first flag as a prominent headline card
 * and the rest as secondary pills below.
 */
import { AlertTriangle, ShieldAlert, Flag as FlagIcon, Info } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RISK_TEXT_COLORS, RISK_INK_ON_PLATE } from '@/lib/constants'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info'

export interface PriorityFlag {
  /** Stable key for react reconciliation. */
  key: string
  severity: AlertSeverity
  /** Bold one-line headline shown in the primary block or pill. */
  headline: string
  /** Optional explanatory sentence shown below the headline in primary block. */
  detail?: ReactNode
  /** Optional internal route — makes the flag clickable. */
  linkTo?: string
}

const SEVERITY_STYLE: Record<
  AlertSeverity,
  // `ink` = the headline's AA reading colour on the tinted ground (PARALLAX
  // D13 § Change 6: text-risk-* as 13–14px type measured 2.0–3.6:1); the
  // icon, dot and border keep the vivid risk colour.
  { bg: string; border: string; ink: string; iconColor: string; Icon: typeof AlertTriangle }
> = {
  critical: {
    bg: '',
    border: 'border-risk-critical',
    ink: RISK_TEXT_COLORS.critical,
    iconColor: 'var(--color-risk-critical)',
    Icon: ShieldAlert,
  },
  high: {
    bg: '',
    border: 'border-risk-high',
    ink: RISK_INK_ON_PLATE.high,
    iconColor: 'var(--color-risk-high)',
    Icon: AlertTriangle,
  },
  medium: {
    bg: '',
    border: 'border-risk-medium',
    ink: RISK_INK_ON_PLATE.medium,
    iconColor: 'var(--color-risk-medium)',
    Icon: FlagIcon,
  },
  info: {
    bg: '',
    border: 'border-text-primary',
    ink: 'var(--color-text-secondary)',
    iconColor: 'var(--color-text-secondary)',
    Icon: Info,
  },
}

interface PriorityAlertProps {
  /** Flags in priority order — highest first. If empty, nothing renders. */
  flags: PriorityFlag[]
  className?: string
  /** Weekend F3: a slow flag query still in flight — holds one muted pill of
   *  the same geometry at the end of the row so its flag lands without a shift. */
  pendingLabel?: string | null
}

export function PriorityAlert({ flags, className, pendingLabel }: PriorityAlertProps) {
  if (!flags.length) return null
  const [primary, ...rest] = flags
  const s = SEVERITY_STYLE[primary.severity]
  const PrimaryIcon = s.Icon

  // One line (owner 2026-10-21, phone): the headline, then the other flags inline after it.
  const headline = (
    <span className="text-sm font-semibold leading-snug" style={{ color: s.ink }}>
      {primary.headline}
    </span>
  )

  return (
    <div className={`border-l-[3px] pl-3 py-1 ${s.border} ${className ?? ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <PrimaryIcon className="h-4 w-4 flex-shrink-0 self-center" style={{ color: s.iconColor }} aria-hidden="true" />
        {primary.linkTo ? (
          <Link
            to={primary.linkTo}
            className="min-w-0 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          >
            {headline}
          </Link>
        ) : (
          <span className="min-w-0">{headline}</span>
        )}
        {rest.map((f) => (
          <SecondaryPill key={f.key} flag={f} />
        ))}
        {pendingLabel && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted" aria-live="polite">
            {pendingLabel}
          </span>
        )}
      </div>
      {primary.detail && (
        <div className="text-xs text-text-secondary mt-1 leading-[1.5]">
          {primary.detail}
        </div>
      )}
    </div>
  )
}

function SecondaryPill({ flag }: { flag: PriorityFlag }) {
  const s = SEVERITY_STYLE[flag.severity]
  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${s.bg}`}
      style={{ color: s.ink }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: s.iconColor }}
        aria-hidden="true"
      />
      {flag.headline}
    </span>
  )
  return flag.linkTo ? (
    <Link to={flag.linkTo} className="rounded-sm hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1">
      {pill}
    </Link>
  ) : (
    pill
  )
}
