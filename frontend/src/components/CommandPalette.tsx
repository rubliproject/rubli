/**
 * Command Palette — Section 4.4 upgrade
 * Centered modal (Cmd+K) with federated search + quick navigation actions.
 * Section 5 addition: saved searches (localStorage, max 8).
 */

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, BarChart3, BookOpen, Building2, FileText, Film, Filter,
  TrendingUp, Users, Bookmark, X as XIcon,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { searchApi } from '@/api/client'
import { useDebouncedValue } from '@/hooks/useDebouncedSearch'
import { useSavedSearches } from '@/hooks/useSavedSearches'
import { FILMS_LIVE, RISK_COLORS, RISK_THRESHOLDS } from '@/lib/constants'
import { TOC, OFF_NAV, numeralOf } from '@/lib/nav/toc'
import { getLocale } from '@/lib/utils'
import { VendorBadge } from '@/components/ui/VendorBadge'
import { formatVendorName } from '@/lib/vendor/formatName'
import { institutionTypeLabel } from '@/lib/institutions/field'

// Mexican RFC pattern: 3-4 uppercase letters + 6 digits (YYMMDD) + 3 alphanumeric
const RFC_PATTERN = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i

function isRfcQuery(q: string): boolean {
  return RFC_PATTERN.test(q.trim())
}

// ---------------------------------------------------------------------------
// Quick-action definitions
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string
  label: string
  description?: string
  icon: React.ElementType
  href: string
  /** Numeral, both locales' names and aliases — what the go-to filter matches. */
  terms?: string
}

// Go-to group (face § 5 ⌘K): generated from the table of contents, searchable by
// numeral («viii»), by the Spanish and English names, and by a few aliases.
// The index links (OFF_NAV) follow, unnumbered.
const OFF_NAV_ALIASES: Record<string, string> = {
  dashboard: 'panel dashboard tablero portada front page',
  newsroom: 'newsroom sala de redacción redaccion',
  gallery: 'sala screening room galería galeria gallery films películas peliculas videos',
}
// Findings and pages by what they are about (AUDIT_JOURNALIST 11-07: «Tren Maya» found the vendor and an ASF case, not
// the page that answers it). Keyed by TOC key; only names the page itself reports.
const FINDING_ALIASES: Record<string, string> = {
  noSeVe: 'tren maya cuenta pública cuenta publica gasto opaco opacidad sedena semar interoceánico interoceanico blind spending',
  capture: 'captura capture monopolio un solo proveedor comprador cautivo',
  arranque: 'arranque empresas nuevas recién creadas recien creadas new companies start',
  gap: 'apagón apagon blackout comprasmx compranet 2025 hueco',
  administrations: 'sexenios presidentes fox calderón calderon peña nieto amlo sheinbaum gobiernos terms administrations',
  watchlist: 'focos rojos red flags aria lista proveedores riesgo',
  methodology: 'metodología metodologia indicador de riesgo modelo cómo se calcula how it works',
  data: 'datos descargar csv sqlite zenodo doi api download data',
}
const EXTRA_GOTO = [
  // the film behind La Galería's first card
  ...(FILMS_LIVE ? [{ id: 'intro', href: '/gallery/el-registro', aliases: 'intro película pelicula film' }] : []),
  // the top bar shield's target
  { id: 'high-risk', href: '/contracts?risk_level_min=high', aliases: 'riesgo alto crítico critico high risk critical' },
] as const

const RESEARCH_ACTION_CONFIG = [
  { id: 'critical-contracts', icon: AlertTriangle, href: '/contracts?risk_level=critical' },
  { id: 'single-bid-contracts', icon: Filter,      href: '/contracts?is_single_bid=true' },
  { id: 'compare-sectors',    icon: BarChart3,     href: '/sectors' },
  // Focos Rojos is the vendor list ranked by risk; IMSS (institution 251) dossier lists its vendors
  { id: 'top-risk-vendors',   icon: TrendingUp,    href: '/aria' },
  { id: 'imss-vendors',       icon: Users,         href: '/institutions/251' },
] as const

const SAVED_SEARCHES_KEY = 'rubli_saved_searches'

// ---------------------------------------------------------------------------
// Risk level pill
// ---------------------------------------------------------------------------

function RiskPill({ level }: { level: string }) {
  const { t } = useTranslation('common')
  const color = RISK_COLORS[level as keyof typeof RISK_COLORS] ?? RISK_COLORS.low
  return (
    <span
      className="ml-auto text-[12px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {t(level, level)}
    </span>
  )
}

// Derive risk level from numeric score (same thresholds as constants.ts)
function riskLevelFromScore(score: number | null | undefined): string | null {
  if (score == null) return null
  if (score >= RISK_THRESHOLDS.critical) return 'critical'
  if (score >= RISK_THRESHOLDS.high) return 'high'
  if (score >= RISK_THRESHOLDS.medium) return 'medium'
  return 'low'
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('common')
  const { t: tn } = useTranslation('nav')
  const [query, setQuery] = useState('')

  const QUICK_ACTIONS = useMemo((): QuickAction[] => {
    const es = i18n.getFixedT('es', 'nav')
    const en = i18n.getFixedT('en', 'nav')
    const pages = TOC.map((e) => {
      const n = numeralOf(e)
      return {
        id: e.key,
        label: tn(`toc.${e.key}`),
        icon: () => <span className="w-6 shrink-0 text-right font-mono text-[11px] text-text-muted">{n}</span>,
        href: e.href,
        terms: `${n} ${es(`toc.${e.key}`)} ${en(`toc.${e.key}`)} ${FINDING_ALIASES[e.key] ?? ''}`,
      }
    })
    const index = OFF_NAV.map((o) => ({
      id: o.key,
      label: tn(`toc.${o.key}`),
      icon: () => <span className="w-6 shrink-0" />,
      href: o.href,
      terms: `${es(`toc.${o.key}`)} ${en(`toc.${o.key}`)} ${OFF_NAV_ALIASES[o.key] ?? ''}`,
    }))
    const extras = EXTRA_GOTO.map((x) => ({
      id: x.id,
      label: x.id === 'intro' ? `${tn('toc.gallery')} · Intro` : t('cmdPalette.highRisk'),
      icon: x.id === 'intro' ? Film : AlertTriangle,
      href: x.href,
      terms: x.aliases,
    }))
    return [...pages, ...index, ...extras]
  }, [t, tn, i18n])

  const RESEARCH_ACTIONS = useMemo((): QuickAction[] => RESEARCH_ACTION_CONFIG.map((cfg) => ({
    ...cfg,
    label: t(`cmdPalette.action.${cfg.id}.label`, cfg.id),
    description: t(`cmdPalette.action.${cfg.id}.desc`, ''),
  })), [t])

  const SUGGESTED_SEARCHES = useMemo(() => [
    { label: t('cmdPalette.suggested.rfcSearch', 'RFC: search by tax ID'), query: '' },
    { label: 'PEMEX', query: 'PEMEX' },
    { label: 'Segalmex', query: 'Segalmex' },
    { label: 'IMSS', query: 'IMSS' },
    { label: t('cmdPalette.suggested.singleBid', 'single award'), query: '', href: '/contracts?is_single_bid=true' },
    { label: 'CFE', query: 'CFE' },
  ], [t])
  const debouncedQuery = useDebouncedValue(query, 250)
  const { items: savedSearches, save: saveSearch, remove: removeSavedSearch } = useSavedSearches(SAVED_SEARCHES_KEY)

  // Reset query when palette closes. `open` is owned by Header (Cmd+K toggles it
  // there), so adjust during render on the prop edge instead of in an effect.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  // Federated search — only fires when query >= 2 chars.
  const { data: results, isFetching } = useQuery({
    queryKey: ['cmd-search', debouncedQuery],
    queryFn: () => searchApi.federated(debouncedQuery, 5),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      navigate(href)
    },
    [navigate, onOpenChange]
  )

  const applyQuery = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const handleSaveSearch = useCallback(() => {
    if (!query.trim()) return
    saveSearch(query.trim(), query.trim())
  }, [query, saveSearch])

  // Filter quick actions by query (client-side)
  const filteredActions =
    query.length > 0
      ? QUICK_ACTIONS.filter(
          (a) =>
            a.label.toLowerCase().includes(query.toLowerCase()) ||
            a.terms?.toLowerCase().includes(query.toLowerCase())
        )
      : QUICK_ACTIONS

  const hasResults =
    results &&
    (results.vendors.length > 0 ||
      results.institutions.length > 0 ||
      results.contracts.length > 0 ||
      results.cases.length > 0)

  // RFC shortcut → that vendor's dossier (search matches company RFCs only, by design)
  const rfcQ = debouncedQuery.trim().toUpperCase()
  const rfcHit = isRfcQuery(rfcQ) && results
    ? results.vendors.find((v) => v.rfc?.toUpperCase() === rfcQ) ?? (results.vendors.length === 1 ? results.vendors[0] : undefined)
    : undefined

  const isIdle = query.length === 0
  const hasSavedSearches = savedSearches.length > 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* ── Saved search chips (shown when there are saved searches) ── */}
      {hasSavedSearches && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 pb-1 border-b border-border/30">
          <Bookmark className="h-3 w-3 text-text-muted shrink-0" aria-hidden="true" />
          {savedSearches.map((s, i) => (
            <span
              key={`${s.value}-${i}`}
              className="flex items-center gap-1 text-[13px] bg-accent/10 text-accent border border-accent/20 rounded-full px-2 py-0.5 max-w-[120px]"
            >
              <button
                type="button"
                className="truncate hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                onClick={() => applyQuery(s.value)}
                aria-label={t('cmdPalette.applySavedSearch', { label: s.label })}
                title={s.label}
              >
                {s.label}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeSavedSearch(i)
                }}
                className="shrink-0 opacity-60 hover:opacity-100 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                aria-label={t('cmdPalette.removeSavedSearch', { label: s.label })}
              >
                <XIcon className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <CommandInput
        autoFocus
        placeholder={t('cmdPalette.inputPlaceholder')}
        value={query}
        onValueChange={setQuery}
      />

      {/* ── Save current search button ── */}
      {query.trim().length > 0 && (
        <div className="flex items-center justify-end px-3 py-1 border-b border-border/30">
          <button
            type="button"
            onClick={handleSaveSearch}
            className="flex items-center gap-1 text-[12px] text-text-muted hover:text-accent transition-colors"
            aria-label={t('cmdPalette.saveCurrentSearch', { query })}
          >
            <Bookmark className="h-3 w-3" aria-hidden="true" />
            {t('cmdPalette.saveSearch')}
          </button>
        </div>
      )}

      <CommandList>
        {/* ── Loading indicator ── */}
        {isFetching && debouncedQuery.length >= 2 && (
          <div className="flex items-center justify-center py-3 text-xs text-text-muted gap-1.5">
            <span className="animate-pulse">{t('cmdPalette.searchingEllipsis')}</span>
          </div>
        )}

        {/* ── No results ── */}
        {!isFetching && debouncedQuery.length >= 2 && !hasResults && filteredActions.length === 0 && (
          <CommandEmpty>{t('cmdPalette.noResultsFor', { query })}</CommandEmpty>
        )}

        {/* ── Idle state: suggested searches + research actions ── */}
        {isIdle && (
          <>
            <CommandGroup heading={t('cmdPalette.suggestedSearches')}>
              {SUGGESTED_SEARCHES.map((s) => (
                <CommandItem
                  key={s.label}
                  value={`suggest-${s.label}`}
                  onSelect={() => (s.href ? go(s.href) : applyQuery(s.query))}
                  className="gap-2 text-text-muted"
                >
                  {!s.href && (
                    <span className="text-xs font-mono bg-background-elevated px-1.5 py-0.5 rounded border border-border/30 shrink-0">
                      {s.query || 'RFC'}
                    </span>
                  )}
                  <span className="text-sm">{s.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading={t('cmdPalette.researchActions')}>
              {RESEARCH_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <CommandItem
                    key={action.id}
                    value={`research-${action.id}-${action.label}`}
                    onSelect={() => go(action.href)}
                    className="gap-2"
                  >
                    <Icon className="h-3.5 w-3.5 text-text-muted shrink-0" />
                    <span>{action.label}</span>
                    {action.description && (
                      <span className="text-xs text-text-muted ml-1">{action.description}</span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>

            <CommandSeparator />
          </>
        )}

        {/* ── RFC shortcut — shown when query looks like a Mexican RFC ── */}
        {rfcHit && (
          <CommandGroup heading={t('cmdPalette.rfcSearch')}>
            <CommandItem
              value={`rfc-direct-${rfcQ}`}
              onSelect={() => go(`/vendors/${rfcHit.id}`)}
              className="gap-2"
            >
              <Users className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden="true" />
              <span className="text-accent font-medium">{t('cmdPalette.searchByRfc')}</span>
              <span className="font-mono text-xs text-text-primary shrink-0">{rfcQ}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* ── Entity results (ranked by risk level via backend ORDER BY) ── */}
        {hasResults && (
          <>
            {(results?.vendors.length ?? 0) > 0 && (
              <CommandGroup heading={t('cmdPalette.groupVendors')}>
                {(results?.vendors ?? []).map((v) => {
                  const riskLevel = riskLevelFromScore(v.risk_score)
                  return (
                    <CommandItem
                      key={`v-${v.id}`}
                      value={`vendor-${v.id}-${v.name}`}
                      onSelect={() => go(`/vendors/${v.id}`)}
                      className="gap-2"
                    >
                      <Users className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
                      <span className="truncate">{formatVendorName(v.name)}</span>
                      {v.rfc && <span className="text-xs font-mono text-text-muted ml-1 shrink-0">{v.rfc}</span>}
                      <VendorBadge isEfos={v.is_efos} isSfp={v.is_sfp_sanctioned} />
                      {riskLevel && riskLevel !== 'low' && <RiskPill level={riskLevel} />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {(results?.institutions.length ?? 0) > 0 && (
              <CommandGroup heading={t('cmdPalette.groupInstitutions')}>
                {(results?.institutions ?? []).map((inst) => (
                  <CommandItem
                    key={`i-${inst.id}`}
                    value={`institution-${inst.id}-${inst.name}`}
                    onSelect={() => go(`/institutions/${inst.id}`)}
                    className="gap-2"
                  >
                    <Building2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{inst.name}</span>
                    {inst.institution_type && (
                      <span className="text-xs text-text-muted ml-1 shrink-0">{institutionTypeLabel(inst.institution_type, i18n.language)}</span>
                    )}
                    {inst.total_contracts != null && (
                      <span className="ml-auto text-xs font-mono text-text-muted shrink-0">
                        {inst.total_contracts.toLocaleString(getLocale())} {i18n.language === 'en' ? 'contracts' : 'contratos'}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.contracts.length ?? 0) > 0 && (
              <CommandGroup heading={t('cmdPalette.groupContracts')}>
                {(results?.contracts ?? []).map((c) => (
                  <CommandItem
                    key={`c-${c.id}`}
                    value={`contract-${c.id}-${c.title}`}
                    onSelect={() => go(`/contracts/${c.id}`)}
                    className="gap-2"
                  >
                    <FileText className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
                    <span className="truncate flex-1">{c.title}</span>
                    {c.year && <span className="text-xs text-text-muted shrink-0">{c.year}</span>}
                    {c.risk_level && <RiskPill level={c.risk_level} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.cases.length ?? 0) > 0 && (
              <CommandGroup heading={t('cmdPalette.groupCases')}>
                {(results?.cases ?? []).map((cs) => (
                  <CommandItem
                    key={`cs-${cs.slug}`}
                    value={`case-${cs.slug}-${cs.title}`}
                    onSelect={() => go(`/cases/${cs.slug}`)}
                    className="gap-2"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
                    <span className="truncate flex-1">{cs.title}</span>
                    {cs.sector && <span className="text-xs text-text-muted shrink-0">{cs.sector}</span>}
                    {cs.year && <span className="text-xs text-text-muted shrink-0">{cs.year}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
          </>
        )}

        {/* ── Quick navigation actions ── */}
        {filteredActions.length > 0 && (
          <CommandGroup heading={debouncedQuery.length >= 2 && hasResults ? t('cmdPalette.groupPages') : t('cmdPalette.groupGoTo')}>
            {filteredActions.map((action) => {
              const Icon = action.icon
              return (
                <CommandItem
                  key={action.id}
                  value={`nav-${action.id}-${action.label} ${action.terms ?? ''}`}
                  onSelect={() => go(action.href)}
                  className="gap-2"
                >
                  <Icon className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span>{action.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer hint — hidden on mobile to avoid overflow */}
      <div className="hidden md:flex border-t border-border/40 px-3 py-2 items-center gap-3 text-[12px] text-text-muted">
        <span><kbd className="px-1 py-0.5 rounded bg-background-elevated border border-border/40 font-mono">↑↓</kbd> {t('cmdPalette.hintNavigate')}</span>
        <span><kbd className="px-1 py-0.5 rounded bg-background-elevated border border-border/40 font-mono">↵</kbd> {t('cmdPalette.hintSelect')}</span>
        <span><kbd className="px-1 py-0.5 rounded bg-background-elevated border border-border/40 font-mono">Esc</kbd> {t('cmdPalette.hintClose')}</span>
        <span className="ml-auto">{t('cmdPalette.rfcTip')}</span>
      </div>
    </CommandDialog>
  )
}
