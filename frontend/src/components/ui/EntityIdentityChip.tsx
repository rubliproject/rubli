/**
 * EntityIdentityChip — the unifying primitive that renders ANY entity in the
 * platform with one consistent grammar.
 *
 * Per docs/SITE_SKELETON.md: the platform has 9 entity types (vendor,
 * institution, sector, category, case, pattern, network, investigation,
 * story). Before this primitive, each of 28+ surfaces invented its own
 * vendor/institution/category cell — different name casing, different
 * risk encoding, different navigation target. The 6-agent audit found
 * 5 distinct vendor name renderings + 6 risk visual treatments across
 * the same set of pages.
 *
 * This component is the single funnel:
 *   <EntityIdentityChip type="vendor" id={29277} name={v.name}
 *     riskScore={v.avg_risk_score} ariaTier={v.tier}
 *     flags={['gt', 'efos']} />
 *
 * Renders: type icon · formatted name · right-aligned context badge.
 * Click → navigates to the canonical dossier route /{type}/:id.
 *
 * `variant="name"` — the one sanctioned rule-1 exception (PARALLAX D7b § Change 7):
 * a bare Link with the formatted full name, the canonical href and the
 * wayfinding state, no icon/dot/badge/padding/hover tint, inheriting the
 * caller's font. Used where the name column IS the figure's typography — the
 * /sectors Confound Plate and Audited Register (Garamond names). Everything
 * else renders the chip (the default), so `to={`/sectors/…`}` literals stay
 * grep-enforceable at 0.
 */
import { cieloHref } from '@/lib/vista'
import type { CSSProperties, FocusEventHandler, MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Building2, Landmark, Layers, Tag, FileWarning,
  Fingerprint, Network as NetworkIcon, Briefcase, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEntityName, type EntityType } from '@/lib/entity/format'
import { InstitutionNameText } from '@/components/ui/InstitutionNameText'
import { getRiskLevelFromScore, RISK_INK_ON_PLATE, RISK_TEXT_COLORS } from '@/lib/constants'
import { useDossierOrigin, type WayfindingLinkState } from '@/lib/nav/wayfinding'

const ICON_FOR_TYPE = {
  vendor: Building2,
  institution: Landmark,
  sector: Layers,
  category: Tag,
  case: FileWarning,
  pattern: Fingerprint,
  network: NetworkIcon,
  investigation: Briefcase,
  story: FileText,
} as const

/**
 * Canonical route for an entity dossier. Vendors resolve to the single
 * /vendors/:id dossier. (The /thread/:id narrative format was retired
 * 2026-06-07 and folded into that dossier; /thread now redirects there.)
 */
function dossierHref(type: EntityType, id: string | number): string {
  const idStr = String(id)
  switch (type) {
    case 'vendor':
      return `/vendors/${idStr}`
    case 'institution':
      return `/institutions/${idStr}`
    case 'sector':
      return `/sectors/${idStr}`
    case 'category':
      return `/categories/${idStr}`
    case 'case':
      return `/cases/${idStr}`
    case 'pattern':
      return `/patterns/${idStr}`
    case 'network':
      // merge § 5: a community opens La Trama inside El Mapa's Vínculos view
      return cieloHref({ tab: `trama.${idStr}` })
    case 'investigation':
      return `/investigation/${idStr}`
    case 'story':
      return `/stories/${idStr}`
  }
}

// The name's risk ink is the AA reading colour (PARALLAX D13 § Change 6):
// text-risk-critical (#ef4444) as 12px type measured 3.57:1. The dot keeps
// the vivid RISK_DOT_BG fill. High and medium take the amber-800 plate twins
// (weekend D3): RISK_TEXT_COLORS high/medium read 4.45/4.36 on the plate paper
// (#f3f1ec) the chip often sits on; RISK_INK_ON_PLATE reads 6.3/6.1 there and
// more on the page ground.
const RISK_NAME_INK: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: RISK_TEXT_COLORS.critical,
  high: RISK_INK_ON_PLATE.high,
  medium: RISK_INK_ON_PLATE.medium,
  low: 'var(--color-text-muted)',
}

const RISK_DOT_BG: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'bg-risk-critical',
  high: 'bg-risk-high',
  medium: 'bg-risk-medium',
  low: 'bg-text-muted',
}

/**
 * Screen-reader label for the risk dot (PARALLAX D1 § Change 7). The dot used
 * to carry an `aria-label` on a role-less <span> — which assistive tech is
 * free to ignore — and the label was English-only.
 */
const RISK_LEVEL_LABEL: Record<'critical' | 'high' | 'medium' | 'low', { en: string; es: string }> = {
  critical: { en: 'critical', es: 'crítico' },
  high:     { en: 'high',     es: 'alto' },
  medium:   { en: 'medium',   es: 'medio' },
  low:      { en: 'low',      es: 'bajo' },
}

const TIER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4',
}

const TIER_BG: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-risk-critical/10 border-risk-critical/30',
  2: 'bg-risk-high/10 border-risk-high/30',
  3: 'bg-risk-medium/10 border-risk-medium/30',
  4: 'bg-text-muted/10 text-text-muted border-border',
}

/**
 * Badge TYPE ink (D6b C8). The fill and the border keep the vivid mark colour;
 * the 12px label takes the AA-safe reading ink, because --color-risk-critical
 * (#ef4444) on the badge's 10%-tinted ground measured 3.33:1 on GT and 3.76:1
 * on T1 -- the platform's lowest type contrast. RISK_TEXT_COLORS is the same
 * ink /captura's seals and risk words already use.
 */
const BADGE_INK: Record<1 | 2 | 3, string> = {
  1: RISK_TEXT_COLORS.critical,
  2: RISK_INK_ON_PLATE.high,
  3: RISK_INK_ON_PLATE.medium,
}

/** Optional status flags shown as badges. EFOS/SFP/GT/Ghost/FP. */
type FlagKind = 'gt' | 'efos' | 'sfp' | 'ghost' | 'fp_structural'

const FLAG_LABEL: Record<FlagKind, string> = {
  gt: 'GT', efos: 'EFOS', sfp: 'SFP', ghost: 'Fantasma', fp_structural: 'Estructural',
}
const FLAG_LABEL_EN: Partial<Record<FlagKind, string>> = { ghost: 'Ghost', fp_structural: 'Structural' }

const FLAG_TONE: Record<FlagKind, string> = {
  gt: 'bg-risk-critical/15',
  efos: 'bg-risk-critical/15',
  sfp: 'bg-risk-high/15',
  ghost: 'bg-risk-high/15',
  fp_structural: 'bg-text-muted/15 text-text-muted',
}

/** Flag badge type ink — see BADGE_INK. `fp_structural` keeps its muted class. */
const FLAG_INK: Partial<Record<FlagKind, string>> = {
  gt: RISK_TEXT_COLORS.critical,
  efos: RISK_TEXT_COLORS.critical,
  sfp: RISK_INK_ON_PLATE.high,
  ghost: RISK_INK_ON_PLATE.high,
}

export interface EntityIdentityChipProps {
  type: EntityType
  id: string | number
  name: string | null | undefined

  /** Sizes: xs=20px height (compact lists), sm=24px (table rows), md=32px (cards);
   *  inherit = the surrounding font (size, weight, family), no chip height or padding — for a name in a table cell
   *  or a list line, so a linked name and an unlinked fallback beside it read at ONE size (owner 2026-10-29). */
  size?: 'xs' | 'sm' | 'md' | 'inherit'

  /** Optional risk score (0-1). If provided, renders a risk dot. */
  riskScore?: number | null

  /** Optional ARIA tier (1-4). If provided, renders a tier badge. */
  ariaTier?: 1 | 2 | 3 | 4 | null

  /** Optional status flags. Max 2 rendered (highest priority first). */
  flags?: FlagKind[]

  /** Sector code for vendor/institution/category — sets a left-edge color dot. */
  sectorCode?: string | null

  /** @deprecated Narrative (/thread/:id) retired 2026-06-07; vendors now have a single /vendors/:id dossier. Accepted for back-compat but ignored. */
  narrative?: boolean

  /** Hide the type icon (when context already implies the type, e.g. inside a vendor list). */
  hideIcon?: boolean

  /**
   * Editorial-dossier opt-in: render the full (untruncated) entity name and
   * allow it to wrap to two lines instead of single-line ellipsis. Use in
   * narrative surfaces (institutional-capture list, co-bidding partners)
   * where legibility of full Mexican entity names beats compact density.
   */
  fullName?: boolean
  /**
   * With `fullName`: sit inline at the name's own width (`inline-flex max-w-full`)
   * instead of taking the row (`flex w-full`). Long names still wrap at the track.
   * Use beside other inline marks (a «persona física» tag, a table cell's second line).
   */
  inline?: boolean

  className?: string

  /** 'chip' (default) or 'name' — see the file header. */
  variant?: 'chip' | 'name'
  /** Vendor is a persona física: the name shows, always followed by « · persona física» (owner policy 2026-10-29). */
  personaFisica?: boolean
  /** name variant only: the link's accessible name (e.g. the row's full reading). */
  ariaLabel?: string
  /** name variant only: the caller's inline type (the chip ignores it). */
  style?: CSSProperties
  onFocus?: FocusEventHandler<HTMLAnchorElement>
  onBlur?: FocusEventHandler<HTMLAnchorElement>
  onMouseEnter?: MouseEventHandler<HTMLAnchorElement>
  onMouseLeave?: MouseEventHandler<HTMLAnchorElement>
  /** name variant only: content other than the name (a "view dossier ↗" line,
   *  a phone row's figure) — the link stays the canonical dossier link. */
  children?: ReactNode
  /** Extra router state merged into the link's (e.g. `{ from: '/aria' }` so the
   *  vendor dossier draws its spine back to the queue). */
  extraState?: Record<string, unknown>
  /** Query string carried to the dossier (no «?»), e.g. `vista=hoy` or `sector=9&sx=amlo`, so the page opens in the
   *  scope of the link (AUDIT_JOURNALIST 11-07). Empty / undefined = the canonical href. */
  search?: string
}

export function EntityIdentityChip({
  type,
  id,
  name,
  size = 'sm',
  riskScore,
  ariaTier,
  flags,
  sectorCode,
  hideIcon = false,
  fullName = false,
  inline = false,
  className,
  variant = 'chip',
  personaFisica,
  ariaLabel,
  extraState,
  search,
  style,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  children,
}: EntityIdentityChipProps) {
  const { i18n } = useTranslation()
  const isEs = i18n.language?.startsWith('es')
  const Icon = ICON_FOR_TYPE[type]
  // a vendor with no public name = an RFC-shaped or missing name (personas físicas are named, policy 10-29): never a blank
  const pfLabel = type === 'vendor' && !name ? (isEs ? 'Nombre no publicado' : 'Name not published') : null
  const inherit = size === 'inherit'
  const displayName = pfLabel ?? formatEntityName(type, name, fullName ? 'full' : inherit ? 'sm' : size)
  const canon = dossierHref(type, id)
  const href = search ? `${canon}?${search}` : canon
  const pfTag = personaFisica && type === 'vendor' && name
    ? <span className="whitespace-nowrap font-normal text-text-muted">{isEs ? ' · persona física' : ' · individual (persona física)'}</span>
    : null

  // El Hilo (P2): when this chip lives inside a dossier, stamp that dossier's
  // identity onto the link state so the destination can offer "← Volver a X".
  // Self-links (a chip pointing at its own host dossier) carry no origin.
  const origin = useDossierOrigin()
  const wfState: WayfindingLinkState | undefined =
    origin && origin.route !== canon ? { wfOrigin: origin } : undefined
  const linkState = extraState ? { ...wfState, ...extraState } : wfState

  if (variant === 'name') {
    const fullDisplay = pfLabel ?? formatEntityName(type, name, 'full')
    // WCAG 2.5.3 Label in Name: an override label must contain the visible text (an «IMSS» link
    // read as «Instituto Mexicano…» breaks voice control), so prefix it when it does not.
    const vis = children == null ? fullDisplay : typeof children === 'string' ? children : null
    const label = ariaLabel && vis && !ariaLabel.toLowerCase().includes(vis.toLowerCase()) ? `${vis} · ${ariaLabel}` : ariaLabel
    return (
      <Link
        to={href}
        state={linkState}
        title={fullDisplay}
        aria-label={label}
        className={cn('rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60', className)}
        style={style}
        onFocus={onFocus}
        onBlur={onBlur}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children ?? (type === 'institution' ? <InstitutionNameText name={fullDisplay} /> : fullDisplay)}
        {pfTag}
      </Link>
    )
  }

  // fullName mode lets the chip grow vertically (2-line wrap) rather than
  // forcing a fixed single-line height that triggers ellipsis.
  const heightCls = inherit ? '[font:inherit]' : fullName
    ? (size === 'xs' ? 'min-h-5 text-[13px]' : size === 'sm' ? 'min-h-6 text-xs' : 'min-h-8 text-sm')
    : size === 'xs' ? 'h-5 text-[13px]' : size === 'sm' ? 'h-6 text-xs' : 'h-8 text-sm'
  const iconSize = inherit ? 'h-[1em] w-[1em]' : size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const dotSize = size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2'
  // PARALLAX D1 § Change 7: xs was 13px against sm's 12px — the smaller size
  // rendered the LARGER badge. Inversion fixed.
  const tierSize = size === 'xs' ? 'text-[12px] px-1 py-px' : 'text-[12px] px-1 py-0.5'

  const riskLevel = typeof riskScore === 'number' ? getRiskLevelFromScore(riskScore) : null
  const riskDotLabel = riskLevel
    ? `${isEs ? 'Riesgo' : 'Risk'}: ${isEs ? RISK_LEVEL_LABEL[riskLevel].es : RISK_LEVEL_LABEL[riskLevel].en}`
    : ''
  const flagsToShow = (flags ?? []).slice(0, 2)

  return (
    <Link
      to={href}
      state={linkState}
      className={cn(
        fullName && !inline ? 'flex w-full items-center' : fullName ? 'inline-flex max-w-full items-center' : 'inline-flex items-center',
        // DESIGN.md §8 «Tablas» (owner phone review 2026-10-29: min-h-11 made every row 44px of air):
        // the chip stays at text height; below md its tap target grows 6px each way through a
        // pseudo-element (≥ 32px, WCAG 2.5.8), so it never pushes the row apart.
        "gap-1.5 rounded-sm transition-colors max-md:relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5 max-md:after:content-['']",
        !inherit && 'px-1.5',
        'hover:bg-background-elevated/60 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1',
        heightCls,
        className,
      )}
      // PARALLAX D1 § Change 7: the tooltip showed the raw COMPRANET name
      // (all-caps, trailing legal suffixes); it now matches what is rendered.
      title={displayName || (name ?? '')}
    >
      {sectorCode && (
        <span
          className={cn('rounded-full flex-shrink-0', dotSize)}
          style={{ backgroundColor: `var(--color-sector-${sectorCode}, var(--color-text-muted))` }}
          aria-hidden="true"
        />
      )}
      {!hideIcon && <Icon className={cn(iconSize, 'flex-shrink-0 text-text-muted')} aria-hidden="true" />}
      <span
        className={cn(
          'font-medium',
          fullName ? 'break-words leading-snug min-w-0' : 'truncate',
          !riskLevel && 'text-text-primary',
        )}
        style={riskLevel ? { color: RISK_NAME_INK[riskLevel] } : undefined}
      >
        {type === 'institution' ? <InstitutionNameText name={displayName} /> : displayName}
      </span>
      {pfTag}
      {ariaTier && (
        <span
          className={cn('flex-shrink-0 rounded-sm border font-mono font-bold tracking-wider uppercase', tierSize, TIER_BG[ariaTier])}
          style={ariaTier === 4 ? undefined : { color: BADGE_INK[ariaTier] }}
        >
          {TIER_LABEL[ariaTier]}
        </span>
      )}
      {riskLevel && !ariaTier && (
        <span
          className={cn('flex-shrink-0 rounded-full', dotSize, RISK_DOT_BG[riskLevel])}
          role="img"
          aria-label={riskDotLabel}
          title={riskScore != null ? `${isEs ? 'Indicador de riesgo' : 'Risk indicator'} ${Math.floor(riskScore * 100)}/100` : riskDotLabel}
        />
      )}
      {flagsToShow.map((flag) => (
        <span
          key={flag}
          className={cn('flex-shrink-0 rounded-sm font-mono font-bold uppercase', tierSize, FLAG_TONE[flag])}
          style={FLAG_INK[flag] ? { color: FLAG_INK[flag] } : undefined}
        >
          {isEs ? FLAG_LABEL[flag] : FLAG_LABEL_EN[flag] ?? FLAG_LABEL[flag]}
        </span>
      ))}
    </Link>
  )
}
