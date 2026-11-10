import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronLeft, ChevronRight, X, MessageSquarePlus } from 'lucide-react'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { caseLibraryApi, ariaApi } from '@/api/client'
import { CURRENT_MODEL_VERSION } from '@/lib/constants'
import { RubliLogoMark } from '@/components/ui/RubliLogoMark'
import { formatNumber } from '@/lib/utils'
import { TOC, TOC_SECTIONS, OFF_NAV, DATA_QUALITY_QUERY, entryFor, numeralOf, type TocEntry } from '@/lib/nav/toc'
import { useAuth } from '@/contexts/AuthContext'
// ReportIssueDialog is lazy — only loads when user clicks the issue button
const ReportIssueDialog = lazy(() =>
  import('@/components/ReportIssueDialog').then((m) => ({ default: m.ReportIssueDialog }))
)

export interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

// The sidebar is the table of contents («EL ÍNDICE», face spec § 4): one row per
// registry entry, numbered by its position in lib/nav/toc.ts. No icons in the
// list (the icon field stays in the registry, unrendered, as the rollback).

function NavSection({
  title,
  collapsed,
  drawer,
  children,
}: {
  title: string
  collapsed: boolean
  drawer: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      {!collapsed && (
        <div className={cn(drawer ? 'mb-1.5' : 'mb-1', 'mt-1 px-2.5 flex items-center gap-2')}>
          <span className="text-[11px] font-medium tracking-[0.22em] uppercase text-text-on-dark-muted select-none font-mono">
            {title}
          </span>
          <span className="flex-1 h-px bg-border" aria-hidden="true" />
        </div>
      )}
      {collapsed && <div className="mb-1 mx-auto w-4 h-px bg-border" aria-hidden="true" />}
      <div className={collapsed ? '' : 'space-y-px'}>{children}</div>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation()
  const { t, i18n } = useTranslation('nav')
  const { t: tc } = useTranslation('common')
  useAuth()

  // Close mobile sidebar on any navigation
  useEffect(() => {
    if (mobileOpen) onMobileClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // On mobile: use mobileOpen for collapse decision (always show full sidebar when open)
  const isCollapsed = collapsed && !mobileOpen

  // Case Library count (1h cache)
  const { data: caseStats } = useQuery({
    queryKey: ['case-library-count'],
    queryFn: () => caseLibraryApi.getStats(),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
  })
  const caseCount = caseStats?.total_cases ?? 0

  // ARIA T1 count — shares cache key with AriaQueue page so both show the same live count
  const { data: ariaStats } = useQuery({
    queryKey: ['aria-stats'],
    queryFn: () => ariaApi.getStats(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
  })
  // One source per ARIA figure (spec F15): tier_counts, not latest_run.
  const ariaT1Count = ariaStats?.tier_counts?.['1'] ?? 0

  // Footer count — the Header's query (same key + queryFn), so react-query dedupes.
  const { data: dataQuality } = useQuery(DATA_QUALITY_QUERY)
  const analyzed = dataQuality?.analyzed_contracts

  const [reportOpen, setReportOpen] = useState(false)

  // ── PARALLAX D1 § Change 2: the mobile drawer is a real dialog ──────────
  // Before: opening it left focus on the hamburger, Tab walked straight into
  // the page behind the backdrop, and Escape did nothing. Now: focus moves to
  // the active row (else the close button), Tab wraps inside the aside, Escape
  // closes, and focus returns to whatever opened it (header hamburger or «Índice»).
  const asideRef = useRef<HTMLElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    const opener = document.activeElement as HTMLElement | null
    const current = asideRef.current?.querySelector<HTMLElement>('nav [aria-current="page"]')
    ;(current ?? closeBtnRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onMobileClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = asideRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const list = Array.from(nodes ?? []).filter((n) => n.offsetParent !== null)
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      const outside = !asideRef.current?.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [mobileOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const countFor = (e: TocEntry): number =>
    e.count === 'aria-t1' ? ariaT1Count : e.count === 'cases' ? caseCount : 0
  const countPhrase = (e: TocEntry, n: number): string =>
    e.count === 'aria-t1' ? tc('count.t1', { n: formatNumber(n) }) : tc('count.cases', { n: formatNumber(n) })
  const activeEntry = entryFor(location.pathname)

  return (
    <>
    <aside
      ref={asideRef}
      // Dialog semantics only while the mobile drawer is open; on desktop the
      // aside stays a plain complementary landmark (PARALLAX D1 § Change 2).
      role={mobileOpen ? 'dialog' : undefined}
      aria-modal={mobileOpen ? true : undefined}
      aria-label={mobileOpen ? t('mainNavigation') : undefined}
      className={cn(
        // Mobile: auto-height drawer. Sidebar sizes to its actual content
        // instead of stretching to 100vh. Below the natural bottom, the
        // dimmed page backdrop shows through — the pattern every good
        // mobile drawer uses (Gmail, YouTube, Stripe). This eliminates
        // the "half-empty dark zone" that user flagged three times.
        // If content ever exceeds viewport, overflow-y-auto kicks in.
        // Desktop: full viewport height with flex-col anchoring footer.
        'fixed left-0 top-0 flex flex-col border-r border-border bg-sidebar z-50',
        'max-h-[100dvh] overflow-y-auto overscroll-contain md:h-screen md:overflow-y-visible',
        'max-md:pb-[var(--sab)]',
        'transition-all duration-200',
        // Mobile: overlay -- hidden off-screen, revealed when open
        'w-64 -translate-x-full',
        mobileOpen && 'translate-x-0',
        // Desktop: always visible, width controlled by collapsed state
        'md:translate-x-0',
        collapsed ? 'md:w-14' : 'md:w-56',
      )}
    >
      {/* iOS status-bar band: sticky so drawer content never scrolls under the clock */}
      {mobileOpen && <div aria-hidden="true" className="sticky top-0 z-10 h-[var(--sat)] shrink-0 bg-sidebar" />}
      {/* Logo — «El Expediente Abierto» mark. Links to El Mapa (/), the homepage,
          since El Mapa no longer holds its own nav row (2026-06-14). */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <NavLink
          to="/"
          aria-label={t('explore')}
          onClick={() => { if (mobileOpen) onMobileClose?.() }}
          className="flex items-center gap-3 min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
        <div className="relative flex-shrink-0">
          <RubliLogoMark size={34} className="text-text-primary" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-text-on-dark-primary text-lg tracking-[-0.01em] leading-none" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 600 }}>RUBLI</span>
              <span className="text-text-on-dark-muted font-mono text-[13px] leading-none tracking-[0.05em]">{CURRENT_MODEL_VERSION}</span>
            </div>
          </div>
        )}
        </NavLink>
        {/* Mobile close button */}
        {mobileOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 md:hidden text-text-on-dark-secondary hover:text-text-on-dark-primary hover:bg-sidebar-hover ml-auto"
            onClick={onMobileClose}
            aria-label={t('closeMenu')}
            ref={closeBtnRef}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Main navigation.
          On mobile, ScrollArea does NOT flex-grow — nav, intel strip, and
          footer pack at natural heights, and the drawer's auto-height
          shrinks to fit. On desktop, flex-1 expands into viewport height
          so the footer anchors at the bottom of a tall window. */}
      {/* desktop expanded packs tighter (face § 4 S2: the rows fit 1440×900); spine and drawer unchanged */}
      <ScrollArea className={cn(isCollapsed || mobileOpen ? 'py-3' : 'py-2', 'md:flex-1', mobileOpen && 'shrink-0')}>
        <nav className={cn('px-2', isCollapsed ? 'space-y-1.5' : mobileOpen ? 'space-y-3' : 'space-y-2')} aria-label={t('mainNavigation')}>
          {TOC_SECTIONS.map((section) => (
            <NavSection key={section} title={t(`sections.${section}`)} collapsed={isCollapsed} drawer={!!mobileOpen}>
              {TOC.filter((e) => e.section === section).map((entry) => {
                const n = countFor(entry)
                return (
                  <TocRow
                    key={entry.href}
                    numeral={numeralOf(entry)}
                    name={t(`toc.${entry.key}`)}
                    href={entry.href}
                    count={n}
                    countLabel={n > 0 ? countPhrase(entry, n) : undefined}
                    collapsed={isCollapsed}
                    drawer={!!mobileOpen}
                    isActive={entry === activeEntry}
                  />
                )
              })}
            </NavSection>
          ))}
        </nav>
      </ScrollArea>

      {/* Editorial intel strip removed — duplicated the "Risk Queue 320"
          nav item directly above it AND broke when the mobile drawer
          opened with collapsed=true (the !isCollapsed gate evaluated false
          there because isCollapsed = collapsed && !mobileOpen). The nav
          item already shows the live count + links to /aria. Marketing-
          style promo card belongs on a landing surface, not the sidebar. */}

      {/* Footer count — the edition's figure, from the shared data-quality
          query. Absent while loading: never «—», never a typed fallback. */}
      {/* Index links (regroup 2026-10-05): the pages outside the numbered contents. */}
      {!isCollapsed && (
        <nav aria-label={t('toc.indexLinks')} className="px-3 pt-2 border-t border-border flex flex-wrap items-center gap-x-2">
          {OFF_NAV.map((o, i) => (
            <Fragment key={o.href}>
              {i > 0 && <span className="text-text-disabled text-[12px]" aria-hidden="true">·</span>}
              <NavLink
                to={o.href}
                className={cn(
                  'text-[12px] text-text-muted hover:text-text-secondary transition-colors rounded-sm',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent aria-[current=page]:text-text-primary',
                  mobileOpen && 'inline-flex min-h-11 items-center',
                )}
              >
                {t(`toc.${o.key}`)}
              </NavLink>
            </Fragment>
          ))}
        </nav>
      )}

      {!isCollapsed && typeof analyzed === 'number' && (
        <div className="px-3 py-2">
          <p className="text-[12px] font-serif tabular-nums text-text-on-dark-muted">
            {tc('footer.count', { n: formatNumber(analyzed) })}
          </p>
        </div>
      )}

      {/* Legal footer links — only visible in expanded mode */}
      {!isCollapsed && (
        <div className="px-3 pb-1 flex items-center gap-3">
          {/* PARALLAX D1 § Change 2: <Link>, not <a href> — the raw anchors
              forced a full page reload out of the SPA. */}
          <Link
            to="/privacy"
            className="text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {tc('legal.privacy')}
          </Link>
          <span className="text-text-disabled text-[12px]" aria-hidden="true">·</span>
          <Link
            to="/terms"
            className="text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {tc('legal.terms')}
          </Link>
        </div>
      )}

      {/* Report an issue button */}
      <div className="px-2 pb-1">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setReportOpen(true)}
                className="w-full flex justify-center items-center rounded-sm py-1.5 text-text-on-dark-muted hover:text-text-on-dark-primary hover:bg-sidebar-hover transition-colors"
                aria-label={t('reportIssue')}
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p className="text-xs">{t('reportIssue')}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => setReportOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm font-medium text-text-on-dark-muted hover:text-text-on-dark-primary hover:bg-sidebar-hover transition-colors"
          >
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{t('reportIssue')}</span>
          </button>
        )}
      </div>

      {/* Bottom bar -- language toggle + collapse button */}
      <div className="border-t border-border p-2">
        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'justify-end')}>
          <div className={cn('flex items-center gap-0.5', isCollapsed && 'flex-col')}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => i18n.changeLanguage(i18n.language.startsWith('es') ? 'en' : 'es')}
                    className="h-7 w-7 flex items-center justify-center rounded-sm text-text-on-dark-muted hover:text-text-on-dark-primary hover:bg-sidebar-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    aria-label={i18n.language.startsWith('es') ? 'Switch to English' : 'Cambiar a Español'}
                  >
                    <span className="text-[12px] font-bold font-mono">
                      {i18n.language.startsWith('es') ? 'EN' : 'ES'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p className="text-xs">{i18n.language.startsWith('es') ? 'Switch to English' : 'Cambiar a Español'}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <LanguageToggle />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className={cn(
                'h-7 w-7 text-text-on-dark-muted hover:text-text-on-dark-primary hover:bg-sidebar-hover hidden md:flex',
                collapsed && 'mx-auto'
              )}
              aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
      {reportOpen && (
        <Suspense fallback={null}>
          <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} />
        </Suspense>
      )}
    </aside>
    </>
  )
}

/** One table-of-contents row: numeral | name (wraps, never truncates) | count. */
function TocRow({
  numeral,
  name,
  href,
  count,
  countLabel,
  collapsed,
  drawer,
  isActive,
}: {
  numeral: string
  name: string
  href: string
  count: number
  countLabel?: string
  collapsed: boolean
  drawer: boolean
  isActive: boolean
}) {
  const label = `${numeral} · ${name}${countLabel ? ` · ${countLabel}` : ''}`
  if (collapsed) {
    // The numeral spine: centred numerals, an ochre dot when the row has a count.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to={href}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex h-7 items-center justify-center rounded-sm font-mono text-[11px] tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
              isActive ? 'text-accent-text font-medium bg-sidebar-hover' : 'text-text-muted hover:text-text-primary hover:bg-sidebar-hover',
            )}
          >
            {numeral}
            {count > 0 && <span className="ml-1 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />}
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="bg-text-primary border-text-primary text-bg-base">
          <p className="text-xs font-serif">{label}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <NavLink
      to={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative grid grid-cols-[24px_minmax(0,1fr)_auto] items-baseline gap-2 rounded-sm px-2 transition-colors',
        // Desktop rows are 28 px so all 14 rows + the footer fit 1440×900 without a scroll;
        // the phone drawer keeps 44 px touch targets. Names still wrap, never truncate.
        drawer ? 'min-h-11 py-1.5' : 'min-h-7 py-1',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        isActive ? 'bg-sidebar-hover' : 'hover:bg-sidebar-hover',
      )}
    >
      {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-text-primary" aria-hidden="true" />}
      <span
        className={cn('text-right font-mono text-[11px] tabular-nums', isActive ? 'text-accent-text font-medium' : 'text-text-muted')}
        aria-hidden="true"
      >
        {numeral}
      </span>
      <span
        className={cn(
          'text-[16px] leading-[1.2]',
          isActive ? 'text-text-primary font-semibold' : 'text-text-secondary font-medium group-hover:text-text-primary',
        )}
        style={{ fontFamily: 'var(--font-family-editorial)' }}
      >
        <span className="sr-only">{numeral} · </span>
        {name}
      </span>
      {count > 0 ? (
        <span className="font-mono text-[11px] tabular-nums text-text-muted">
          <span aria-hidden="true">{formatNumber(count)}</span>
          {countLabel && <span className="sr-only">{countLabel}</span>}
        </span>
      ) : <span />}
    </NavLink>
  )
}
