import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, Database, Shield, Menu, LogOut, LogIn, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { analysisApi, categoriesApi } from '@/api/client'
import { institutionDetailQuery } from '@/api/entityQueries'
import { useAuth } from '@/contexts/AuthContext'
import { dataQualityLevel, dataQualityWord } from '@/lib/tiers'
import { getStoryHeadline } from '@/lib/story-index'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatEntityName } from '@/lib/entity/format'
import { cleanContractDescription } from '@/lib/contract-audit'
import { DATA_QUALITY_QUERY, OFF_NAV, entryFor, numeralOf } from '@/lib/nav/toc'
import { useRouteMeta } from '@/lib/seo/routeMeta'
import { VistaSwitch } from '@/components/layout/VistaSwitch'

const CommandPalette = lazy(() =>
  import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette }))
)

// Route path → nav i18n key mapping
const ROUTE_I18N_KEYS: Record<string, string> = {
  '/': 'dashboard',
  '/mapa': 'explore',
  '/dashboard': 'dashboard',
  '/explore': 'explore',
  '/money-flow': 'captureHeatmap',
  '/administrations': 'administrations',
  // /price-analysis was an orphan route cut on 2026-05-07 (Issue #017
  // quick-cut). The route now redirects to /sectors via App.tsx, so the
  // breadcrumb map entry was dead and is removed in this Day-1 closeout.
  '/contracts': 'contracts',
  '/vendors': 'vendorsCrumb', // weekend F2: the parent read the raw segment «Vendors» on ES
  '/workspace': 'workspace',
  '/investigation': 'investigation',
  '/sectors': 'sectors',
  '/model': 'model',
  '/methodology': 'methodology',
  '/settings': 'settings',
  '/cases': 'caseLibrary',
  '/journalists': 'journalists',
  '/newsroom': 'newsroom',
  '/stories': 'newsroom', // there is no nav:stories key — the bar read «STORIES» in ES
  '/aria': 'ariaQueueShort', // PARALLAX D14 § 8: short form for 390
  '/report-card': 'reportCard',
  '/year-in-review': 'yearInReview',
  '/thread': 'journalists',
  '/intersection': 'intersection',
  '/institutions': 'institutions',
  '/relationships': 'capture',
  '/captura': 'capture',
  '/gasto-a-ciegas': 'noSeVe',
  '/categories': 'categories',
  '/patterns': 'patterns',
  '/spatial': 'explore',
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('nav')
  const { t: tc } = useTranslation('common')
  const { user, logout } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [paletteEverOpened, setPaletteEverOpened] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const userTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // Fetch anomaly count for notifications — non-blocking, cached aggressively
  const { data: anomalies } = useQuery({
    queryKey: ['analysis', 'anomalies', 'high'],
    queryFn: () => analysisApi.getAnomalies('high'),
    staleTime: 30 * 60 * 1000,  // 30 min — alerts don't change often
    gcTime: 60 * 60 * 1000,
    retry: 0,  // Don't retry — header shouldn't cause extra API pressure
    refetchOnWindowFocus: false,
    refetchOnMount: false,  // Don't refetch on every page navigation
  })

  // Fetch data quality score for indicator — non-blocking, cached aggressively
  // Shared with the sidebar footer and the edition line (same key + queryFn).
  const { data: dataQuality } = useQuery(DATA_QUALITY_QUERY)

  // Case breadcrumb — subscribe to the dossier's own query (same key, no
  // fetch of our own: enabled:false) so the crumb reads the localized case
  // name instead of the title-cased slug. Falls back to slugToTitle below.
  const caseSlugMatch = location.pathname.match(/^\/cases\/([^/]+)$/)
  const { data: caseForBreadcrumb } = useQuery<{ name_en?: string; name_es?: string }>({
    queryKey: ['case-dossier', caseSlugMatch?.[1]],
    queryFn: () => Promise.reject(new Error('header never fetches cases')),
    enabled: false,
  })

  // Vendor breadcrumb — same cache-subscribe trick on VendorDossier's detail
  // query (['vendor', id] via useVendorData). The crumb reads the vendor's
  // actual name ("Grupo Farmacos Especializados") instead of the static
  // English "Vendor Profile" label. Falls back to ENTITY_TYPE_LABELS below.
  const vendorIdMatch = location.pathname.match(/^\/vendors\/(\d+)$/)
  const { data: vendorForBreadcrumb } = useQuery<{ name?: string }>({
    queryKey: ['vendor', vendorIdMatch ? Number(vendorIdMatch[1]) : -1],
    queryFn: () => Promise.reject(new Error('header never fetches vendors')),
    enabled: false,
  })

  // Institution breadcrumb — same trick on InstitutionDossier's detail query
  // (weekend F2: the crumb read the static «Expediente institucional»).
  const institutionIdMatch = location.pathname.match(/^\/institutions\/(\d+)$/)
  const { data: institutionForBreadcrumb } = useQuery<{ name?: string }>({
    queryKey: institutionDetailQuery(institutionIdMatch ? Number(institutionIdMatch[1]) : -1).queryKey,
    queryFn: () => Promise.reject(new Error('header never fetches institutions')),
    enabled: false,
  })

  // Contract breadcrumb — subscribe to ContractDossier's detail query
  // (['contract-dossier', id, 'detail']) so the crumb reads a cleaned contract
  // object ("Medicamentos") instead of the bare internal "#id". Falls back to
  // ENTITY_TYPE_LABELS / #id below when the cache is cold.
  const contractIdMatch = location.pathname.match(/^\/contracts\/(\d+)$/)
  const { data: contractForBreadcrumb } = useQuery<{ title?: string; description?: string }>({
    queryKey: ['contract-dossier', contractIdMatch ? Number(contractIdMatch[1]) : -1, 'detail'],
    queryFn: () => Promise.reject(new Error('header never fetches contracts')),
    enabled: false,
  })

  // Category breadcrumb — resolve numeric ID to actual category name
  const isCategoryPage = /^\/categories\/\d+/.test(location.pathname)
  const breadcrumbCategoryId = isCategoryPage ? parseInt(location.pathname.split('/')[2]) : NaN
  const { data: categorySummaryForBreadcrumb } = useQuery({
    queryKey: ['categories', 'summary'],
    queryFn: () => categoriesApi.getSummary(),
    staleTime: 5 * 60 * 1000,
    enabled: isCategoryPage,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const alertCount = anomalies?.total || 0
  const qualityScore = dataQuality?.overall_score
  // 2026-05-12 (Audit F023): header DQ chip used letter grades A/B/C/D/F.
  // CLAUDE.md canonical wording is the 5-tier ladder (Excelente /
  // Satisfactorio / Regular / Deficiente / Crítico) — same one /sectors
  // PHI uses. Renders "DQ · Satisfactorio" instead of "DQ · B" so the
  // platform stops mixing two grading vocabularies on the same screen.
  const isEs = i18n.language?.startsWith('es')
  const qualityTier: { letter: string; label: string } | null = qualityScore != null
    ? qualityScore >= 90
      ? { letter: 'A', label: isEs ? 'Excelente' : 'Excellent' }
      : qualityScore >= 75
        ? { letter: 'B', label: isEs ? 'Satisfactorio' : 'Satisfactory' }
        : qualityScore >= 60
          ? { letter: 'C', label: isEs ? 'Regular' : 'Moderate' }
          : qualityScore >= 40
            ? { letter: 'D', label: isEs ? 'Deficiente' : 'Poor' }
            : { letter: 'F', label: isEs ? 'Crítico' : 'Critical' }
    : null
  const qualityLabel = qualityTier ? dataQualityWord(qualityTier.letter, isEs ? 'es' : 'en') : null
  const qualityLevel = qualityTier ? dataQualityLevel(qualityTier.letter, isEs ? 'es' : 'en') : null

  // Global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteEverOpened(true)
        setSearchOpen((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  const currentPath = location.pathname
  // Registry names win (face spec § 5): the bar, the sidebar and the page say
  // the same name («Instituciones», «Sala de Redacción», «El Apagón»).
  const tocEntry = entryFor(currentPath)
  const offNav = OFF_NAV.find((o) => o.href === currentPath)
  const tocName = tocEntry ? t(`toc.${tocEntry.key}`) : offNav ? t(`toc.${offNav.key}`) : null
  const i18nKey = ROUTE_I18N_KEYS[currentPath]
  const categoryBreadcrumbName: string | null = (() => {
    if (!isCategoryPage || !categorySummaryForBreadcrumb?.data || isNaN(breadcrumbCategoryId)) return null
    const cat = (categorySummaryForBreadcrumb.data as Array<{ category_id: number; name_es?: string; name_en?: string }>)
      .find(c => c.category_id === breadcrumbCategoryId)
    if (!cat) return null
    return isEs ? (cat.name_es || cat.name_en || null) : (cat.name_en || cat.name_es || null)
  })()
  const caseBreadcrumbName: string | null = caseSlugMatch && caseForBreadcrumb
    ? (isEs
        ? (caseForBreadcrumb.name_es || caseForBreadcrumb.name_en || null)
        : (caseForBreadcrumb.name_en || caseForBreadcrumb.name_es || null))
    : null
  const vendorBreadcrumbName: string | null = vendorIdMatch && vendorForBreadcrumb?.name
    ? formatVendorName(vendorForBreadcrumb.name, 300)
    : null
  const institutionBreadcrumbName: string | null = institutionIdMatch && institutionForBreadcrumb?.name
    ? formatEntityName('institution', institutionForBreadcrumb.name, 'full')
    : null
  // Contract breadcrumb — cleaned object text, truncated; falls through to the
  // localized "Expediente del contrato" / #id when the cache is cold.
  const contractBreadcrumbName: string | null = (() => {
    if (!contractIdMatch) return null
    const raw = (contractForBreadcrumb?.title || contractForBreadcrumb?.description || '').trim()
    if (!raw) return null
    const obj = cleanContractDescription(raw).objeto || raw
    return obj || null
  })()
  const legalTitle = currentPath === '/privacy' ? tc('legal.privacy') : currentPath === '/terms' ? tc('legal.terms') : null
  const title = vendorBreadcrumbName ?? institutionBreadcrumbName ?? contractBreadcrumbName ?? caseBreadcrumbName ?? categoryBreadcrumbName ?? (tocEntry?.href === currentPath || offNav ? tocName : null) ?? legalTitle ?? (i18nKey ? t(i18nKey) : getBreadcrumbTitle(currentPath, isEs))
  // Launch S1: <title>, description, og:* and canonical per route. Dossiers
  // reuse the crumb's cache-subscribed names (0 new calls); vendor/contract
  // pages set their own title via useDocumentTitle, which runs after this.
  useRouteMeta(currentPath, i18n.language ?? 'es', institutionBreadcrumbName ?? caseBreadcrumbName)
  // Parent breadcrumb segment — now a real Link, not an inert span (F4).
  // parentRoute was already computed here and discarded; we keep it so
  // "SECTORES / Salud" lets you click SECTORES back to /sectors.
  // Weekend F2: on phones a dossier crumb reads «TYPE» over the name, cut at a
  // whole word (never mid-word); desktop shows the whole name on up to two lines.
  const dossierType = (() => {
    const parts = currentPath.split('/').filter(Boolean)
    const label = parts.length === 2 ? ENTITY_TYPE_SHORT[parts[0]] : undefined
    return label ? (isEs ? label.es : label.en) : null
  })()
  const phoneTitle = dossierType ? shortenWords(title, 40) : title
  const parent = (() => {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length <= 1) return null
    const parentRoute = '/' + parts.slice(0, -1).join('/')
    const parentEntry = entryFor(parentRoute)
    const parentKey = ROUTE_I18N_KEYS[parentRoute]
    const parentOff = OFF_NAV.find((x) => x.href === parentRoute)
    const label = parentEntry?.href === parentRoute
      ? t(`toc.${parentEntry.key}`)
      : parentOff ? t(`toc.${parentOff.key}`)
      : parentKey ? t(parentKey) : getParentPath(currentPath, tc('header.home'))
    return { label, route: parentRoute }
  })()

  // Running head (face spec § 5): shown once the page masthead scrolls out, or
  // on any route without one. `{numeral} · {NAME}`, then the entity on dossiers.
  const onSubPage = !!tocEntry && tocEntry.href !== currentPath
  const runningEntity = onSubPage ? title : null
  // ponytail: a character budget stands in for measuring one Garamond 14 line at 390.
  const phoneEntity = runningEntity && runningEntity.length <= 34 ? runningEntity : null

  return (
    <header className="sticky top-0 z-30 flex h-[calc(2.75rem+var(--sat))] pt-[var(--sat)] items-center justify-between border-b border-border bg-background/85 px-4 md:px-5 backdrop-blur-xl">
      {/* Left — Hamburger (mobile) + Editorial dateline + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0 text-sm">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 flex-shrink-0 md:hidden -ml-2"
          onClick={onMenuClick}
          aria-label={tc('header.openMenu')}
        >
          <Menu className="h-4 w-4 text-text-muted" aria-hidden="true" />
        </Button>
        {/* El Mapa: on phones the view switch takes the running head's place (merge spec § 2). */}
        <div className={`grid min-w-0${currentPath === '/mapa' ? ' max-sm:hidden' : ''}`}>
        {/* The crumb — at rest, while the page masthead is in view. */}
        <div className="rh-crumb [grid-area:1/1] flex items-center gap-1.5 min-w-0">
          {currentPath !== '/' && parent && (
            <>
              <Link
                to={parent.route}
                className="text-text-muted hover:text-text-primary hidden sm:inline whitespace-nowrap flex-shrink-0 text-[12px] font-sc transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                {parent.label}
              </Link>
              <span className="text-text-muted/60 hidden sm:inline">/</span>
            </>
          )}
          {/* Weekend D1: on phones the crumb title may take two short lines inside
              the 44px bar instead of ellipsing («Expediente sectorial» was cut
              131 -> 74px at 390 ES). */}
          <span className="flex min-w-0 flex-col">
            {dossierType && (
              <span className="sm:hidden whitespace-nowrap font-mono text-[10px] uppercase leading-[1.1] tracking-[0.08em] text-text-muted">{dossierType}</span>
            )}
            <span className="font-semibold text-text-primary tracking-tight line-clamp-2 leading-[1.15] max-sm:text-[13px] max-sm:leading-[1.1]" title={title}>
              <span className="max-sm:hidden">{title}</span>
              <span className="sm:hidden">{phoneTitle}</span>
            </span>
          </span>
        </div>
        {/* The running head — once the masthead has scrolled away. */}
        <div className="rh-head [grid-area:1/1] flex min-w-0 flex-col justify-center sm:flex-row sm:items-baseline sm:gap-2">
          {tocEntry ? (
            <Link
              to={tocEntry.href}
              className="whitespace-nowrap font-sc text-[10px] sm:text-[12px] leading-[1.2] text-text-primary hover:text-accent-text transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <span className="text-accent-text">{numeralOf(tocEntry)}</span> · {tocName}
            </Link>
          ) : (
            <span className="font-semibold text-text-primary tracking-tight line-clamp-2 leading-[1.15] max-sm:text-[13px]" title={title}>{title}</span>
          )}
          {runningEntity && (
            <>
              <span className="hidden sm:inline text-text-muted/60" aria-hidden="true">/</span>
              <span className="hidden sm:block min-w-0 line-clamp-2 leading-[1.15] font-semibold text-text-primary tracking-tight" title={runningEntity}>{runningEntity}</span>
              {phoneEntity && (
                <span className="sm:hidden whitespace-nowrap text-[14px] leading-[1.15] text-text-primary" style={{ fontFamily: 'var(--font-family-editorial)' }}>{phoneEntity}</span>
              )}
            </>
          )}
        </div>
        </div>
        {currentPath === '/mapa' && <VistaSwitch className="-ml-1 sm:ml-0 sm:pl-2 sm:border-l sm:border-border/60" />}
      </div>

      {/* Right — Status indicators + actions.
          PARALLAX D1 § Change 3: flex-shrink-0 so a long breadcrumb title
          truncates on the left instead of squeezing this cluster into a wrap. */}
      <div className="flex flex-shrink-0 items-center gap-1">
        {/* Search trigger — opens centered CommandPalette modal */}
        {/* Desktop: pill-shaped fake input with hint text */}
        <button
          onClick={() => { setPaletteEverOpened(true); setSearchOpen(true); }}
          className="hidden lg:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border/50 bg-background-elevated/50 text-text-muted hover:border-border hover:bg-background-elevated transition-colors text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          aria-label={`${tc('search')} (Ctrl+K)`}
        >
          <Search className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left truncate">{tc('header.searchPlaceholder')}</span>
          <kbd className="flex-shrink-0 text-[12px] font-mono font-medium px-1.5 py-0.5 rounded bg-background border border-border/60 text-text-muted leading-none tracking-tight">⌘K</kbd>
        </button>
        {/* Mobile: icon-only button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-9 md:w-9 lg:hidden"
              onClick={() => { setPaletteEverOpened(true); setSearchOpen(true); }}
              aria-label={`${tc('search')} (Ctrl+K)`}
            >
              <Search className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{tc('search')} <kbd className="ml-1 text-xs px-1 py-0.5 rounded bg-background-elevated border border-border text-text-muted">Ctrl+K</kbd></p>
          </TooltipContent>
        </Tooltip>

        {paletteEverOpened && (
          <Suspense fallback={null}>
            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
          </Suspense>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-border/40 mx-1 hidden sm:block" />

        {/* Alerts indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-9 md:w-9 relative"
            >
              <Link to="/contracts?risk_level_min=high" aria-label={tc('header.alertsLabel', { count: alertCount })}>
                <Shield className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{alertCount > 0 ? tc('header.alertsLabel', { count: alertCount }) : tc('header.noAlerts')}</p>
          </TooltipContent>
        </Tooltip>

        {/* Data quality grade — tier label, not letter (Audit F023). */}
        {qualityLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings?tab=quality"
                className="hidden sm:flex items-center gap-1.5 h-6 px-2 rounded-sm text-[12px] font-mono tracking-[0.1em] text-text-secondary bg-background-elevated border border-border hover:border-border-hover hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <Database className="h-3 w-3 text-text-muted" aria-hidden="true" />
                <span className="text-text-muted">DQ</span>
                <span className="text-accent-text font-bold uppercase tracking-wide">{qualityLabel}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{tc('header.dataQuality', { grade: qualityLevel, score: qualityScore?.toFixed(1) })}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-border/40 mx-1 hidden sm:block" />

        {/* User menu.
            PARALLAX D1 § Change 3: Escape closes the popup and hands focus back
            to the trigger. Before, a keyboard user could only escape by tabbing
            through the menu or clicking elsewhere. */}
        <div
          className="relative"
          ref={userMenuRef}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || !userMenuOpen) return
            e.stopPropagation()
            setUserMenuOpen(false)
            userTriggerRef.current?.focus()
          }}
        >
          {user ? (
            <>
              <button
                ref={userTriggerRef}
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-1.5 h-7 px-2 rounded-sm text-[12px] font-sc text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                aria-label={tc('header.userMenu')}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-glow text-accent text-[13px] font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[80px] truncate">{user.name.split(' ')[0]}</span>
              </button>
              {userMenuOpen && (
                <div role="menu" aria-label={tc('header.userMenu')} className="absolute right-0 top-full mt-1 w-44 rounded-sm border border-border bg-background-card shadow-xl z-50 py-1">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold text-text-primary truncate">{user.name}</p>
                    <p className="text-[12px] text-text-muted truncate font-mono">{user.email}</p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => { setUserMenuOpen(false); navigate('/workspace') }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
                  >
                    <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                    {tc('header.myInvestigations')}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setUserMenuOpen(false); logout() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-risk-critical hover:bg-background-elevated transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    {tc('header.signOut')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link
              to="/login"
              aria-label={tc('header.signIn')}
              className="flex items-center justify-center gap-1.5 h-9 px-3 max-sm:h-11 max-sm:w-11 max-sm:px-0 rounded-sm whitespace-nowrap text-[12px] font-sc text-text-muted hover:text-text-primary hover:bg-background-elevated border border-border hover:border-border-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {/* Weekend F2: icon-only below sm — the 138px ES label left the crumb 74px at 390. */}
              <LogIn className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="max-sm:hidden">{tc('header.signIn')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

// Map of parent route → entity type label for numeric-ID child routes.
// Static fallback only — vendor/case/category crumbs resolve the real entity
// name from the dossier's own react-query cache first (see Header body).
const ENTITY_TYPE_LABELS: Record<string, { en: string; es: string }> = {
  vendors: { en: 'Vendor dossier', es: 'Expediente del proveedor' },
  contracts: { en: 'Contract dossier', es: 'Expediente del contrato' },
  institutions: { en: 'Institution dossier', es: 'Expediente institucional' },
  sectors: { en: 'Sector dossier', es: 'Expediente sectorial' },
  categories: { en: 'Category', es: 'Categoría' },
  cases: { en: 'Case dossier', es: 'Expediente del caso' },
  investigation: { en: 'Investigation', es: 'Investigación' },
}

/** Singular type label above a phone dossier crumb (weekend F2). */
const ENTITY_TYPE_SHORT: Record<string, { en: string; es: string }> = {
  vendors: { en: 'Vendor', es: 'Proveedor' },
  contracts: { en: 'Contract', es: 'Contrato' },
  institutions: { en: 'Institution', es: 'Institución' },
  sectors: { en: 'Sector', es: 'Sector' },
  categories: { en: 'Category', es: 'Categoría' },
  cases: { en: 'Case', es: 'Caso' },
}

/** Whole words up to `max` chars, then «…» — never cuts inside a word. */
function shortenWords(text: string, max: number): string {
  if (text.length <= max) return text
  const words = text.split(' ')
  let out = words[0]
  for (const w of words.slice(1)) {
    if ((out + ' ' + w).length > max - 1) break
    out += ' ' + w
  }
  return out.replace(/[\s,.;:–—-]+$/, '') + '…'
}

/**
 * Convert a kebab-case URL slug into Title Case ("el-ejercito-fantasma" →
 * "El Ejercito Fantasma"). Lowercase short connector words. Used as a
 * fallback when no canonical title is available.
 */
function slugToTitle(slug: string): string {
  const SHORT_CONNECTORS = new Set(['de', 'la', 'el', 'del', 'y', 'a', 'en', 'con', 'por', 'of', 'the', 'and', 'in', 'on', 'for'])
  return slug
    .split('-')
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && SHORT_CONNECTORS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function getBreadcrumbTitle(path: string, isEs = false): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return 'Dashboard'

  const lastPart = parts[parts.length - 1]

  // /stories/:slug → resolve to canonical story headline (from story-content
  // metadata) so the breadcrumb reads "El Ejército Fantasma" not the slug.
  if (parts.length === 2 && parts[0] === 'stories') {
    const story = getStoryHeadline(lastPart)
    if (story) {
      return isEs ? (story.headline_es || story.headline) : story.headline
    }
    return slugToTitle(lastPart)
  }

  if (/^\d+$/.test(lastPart)) {
    const parentSegment = parts.length >= 2 ? parts[parts.length - 2] : ''
    const entityLabel = ENTITY_TYPE_LABELS[parentSegment]
    if (entityLabel) return isEs ? entityLabel.es : entityLabel.en
    const parentRoute = parts.slice(0, -1).join('/')
    const parentKey = ROUTE_I18N_KEYS[`/${parentRoute}`]
    if (parentKey) return `#${lastPart}`
  }

  // Generic slug → title fallback for any other kebab-case URL segment.
  // Eliminates the "El-ejercito-fantasma" pattern across the platform.
  if (lastPart.includes('-')) {
    return slugToTitle(lastPart)
  }

  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1)
}

function getParentPath(path: string, homeLabel: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return homeLabel
  return parts
    .slice(0, -1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' / ')
}
