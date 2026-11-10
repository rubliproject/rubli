import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  formatCompactMXN,
  formatCompactUSD,
  formatNumber,
  getPaginationRange,
  clampPage,
  omit,
} from '@/lib/utils'
import { contractApi, exportApi } from '@/api/client'
import { RiskFeedbackButton } from '@/components/RiskFeedbackButton'
import { AddToDossierButton } from '@/components/AddToDossierButton'
import { TableExportButton } from '@/components/TableExportButton'
import { SECTORS, RISK_COLORS, RISK_TEXT_COLORS, DATA_CUT_YEAR, NO_RISK_LABEL, isUnscored } from '@/lib/constants'
import { COMPRASMX_STRUCTURE } from '@/components/contrato/SourceTag'
import { useDebouncedSearch, useDebouncedValue } from '@/hooks/useDebouncedSearch'
import { useSavedSearches } from '@/hooks/useSavedSearches'
import type { ContractFilterParams, ContractListItem } from '@/api/types'
import { RISK_FACTORS } from '@/api/types'
import {
  ChevronRight,
  Search,
  Download,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Flame,
  Crown,
  Scissors,
  Users,
  X,
  GitCompareArrows,
  SlidersHorizontal,
} from 'lucide-react'
import { useToast } from '@/components/ui/toastContext'
import { ContractCompareModal } from '@/components/ContractCompareModal'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ExpandableProvider } from '@/components/ExpandableRow'
import { useExpandable } from '@/components/expandableContext'
import { SenaladosBand } from '@/components/contracts/SenaladosBand'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import { FootNotes } from '@/components/kit/FootNotes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PageHead } from '@/components/kit/PageHead'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { Clause } from '@/components/contrato/Clause'
import { ContractsLadder, type HeadSlots } from '@/components/contracts/ContractsLadder'
import { ContractCard } from '@/components/contracts/ContractCard'
import '@/components/contracts/contracts.css'

// =============================================================================
// Configuration
// =============================================================================

type ContractSortField =
  | 'amount_mxn'
  | 'contract_date'
  | 'risk_score'
  | 'vendor_name'
  | 'institution_name'
  | 'sector_id'
  | 'risk_level'
  | 'mahalanobis_distance'

interface ContractPreset {
  id: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  sort: ContractSortField
  order: 'asc' | 'desc'
  filters: Partial<Record<string, string>>
  descriptionKey: string
}

// Preset definitions — labels/descriptions resolved via t() inside the component (Fix 3)
const CONTRACT_PRESET_DEFS: ContractPreset[] = [
  {
    id: 'suspicious-monopolies',
    labelKey: 'presets.suspiciousMonopolies.label',
    icon: Crown,
    sort: 'amount_mxn',
    order: 'desc',
    filters: { risk_level: 'critical', is_single_bid: 'true' },
    descriptionKey: 'presets.suspiciousMonopolies.description',
  },
  {
    id: 'december-rush',
    labelKey: 'presets.decemberRush.label',
    icon: Flame,
    sort: 'amount_mxn',
    order: 'desc',
    filters: { risk_level_min: 'high', risk_factor: 'year_end' },
    descriptionKey: 'presets.decemberRush.description',
  },
  {
    id: 'price-manipulation',
    labelKey: 'presets.priceOutliers.label',
    icon: TrendingUp,
    sort: 'risk_score',
    order: 'desc',
    filters: { risk_factor: 'price_hyp', risk_level_min: 'high' },
    descriptionKey: 'presets.priceOutliers.description',
  },
  {
    id: 'industry-mismatch',
    labelKey: 'presets.ghostCompanies.label',
    icon: AlertTriangle,
    sort: 'amount_mxn',
    order: 'desc',
    filters: { risk_factor: 'industry_mismatch', is_direct_award: 'true' },
    descriptionKey: 'presets.ghostCompanies.description',
  },
  {
    id: 'network-clusters',
    labelKey: 'presets.networkClusters.label',
    icon: Users,
    sort: 'risk_score',
    order: 'desc',
    filters: { risk_factor: 'network', risk_level: 'critical' },
    descriptionKey: 'presets.networkClusters.description',
  },
  {
    id: 'split-contracts',
    labelKey: 'presets.splitContracts.label',
    icon: Scissors,
    sort: 'contract_date',
    order: 'desc',
    filters: { risk_factor: 'split' },
    descriptionKey: 'presets.splitContracts.description',
  },
]

/** A debounced input mirrored to one URL param (PARALLAX D12b judge 1 — the
 *  search fix, generalised). The URL wins on navigation (Back/Forward, preset,
 *  saved filter); the input writes to the URL only after a user edit. Adding
 *  the param pushes a history entry (Back undoes it); editing it replaces. */
function useUrlParamInput(
  key: string,
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  delay = 500,
) {
  const urlValue = searchParams.get(key) || ''
  const [input, setInput] = useState(urlValue)
  const [seenUrl, setSeenUrl] = useState(urlValue)
  const [typed, setTyped] = useState(false)
  // URL → input, adjusted during render (no effect): any URL change — ours
  // or a navigation — resets the input and ends the edit.
  if (urlValue !== seenUrl) {
    setSeenUrl(urlValue)
    setTyped(false)
    setInput(urlValue)
  }
  const debounced = useDebouncedValue(input, delay)
  useEffect(() => {
    if (!typed || debounced !== input || debounced === urlValue) return
    const next = new URLSearchParams(searchParams)
    if (debounced) {
      next.set(key, debounced)
      next.set('page', '1')
    } else {
      next.delete(key)
    }
    setSearchParams(next, { replace: urlValue !== '' })
  }, [typed, debounced, input, urlValue, key, searchParams, setSearchParams])
  const edit = useCallback((v: string) => { setTyped(true); setInput(v) }, [])
  return [input, edit, setInput] as const
}

// =============================================================================
// Main Component
// =============================================================================

export function Contracts() {
  const { t, i18n } = useTranslation('contracts')
  const { t: ts } = useTranslation('sectors')
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const [searchParams, setSearchParams] = useSearchParams()
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const {
    inputValue: searchInput,
    setInputValue: setSearchInput,
    debouncedValue: debouncedSearch,
    isPending: isSearchPending,
  } = useDebouncedSearch(searchParams.get('search') || '', { delay: 300, minLength: 2 })

  // Fix 1: Amount range local state + 500ms debounce
  const [minAmountInput, editMinAmount, setMinAmountInput] = useUrlParamInput('min_amount', searchParams, setSearchParams)
  const [maxAmountInput, editMaxAmount, setMaxAmountInput] = useUrlParamInput('max_amount', searchParams, setSearchParams)

  const sortBy = (searchParams.get('sort_by') as ContractSortField) || 'contract_date'
  const sortOrder = (searchParams.get('sort_order') as 'asc' | 'desc') || 'desc'

  // Phones default to 20 cards a page (contract § X1): 50 cards ran the 390
  // page past 7,000px. An explicit ?per_page= still wins on any width.
  const isPhone = useIsMobile()
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Desktop: shortcuts + narrowing open under «Filtros» (open on arrival when one of them is set)
  const [moreOpen, setMoreOpen] = useState(() => ['risk_factor', 'sector_id', 'year', 'min_amount', 'max_amount'].some((k) => searchParams.has(k)))
  const defaultPerPage = isPhone ? 20 : 50
  // Fix 6: filters always reads per_page from URL (no hardcoded fallback at query level)
  const filters: ContractFilterParams = useMemo(() => ({
    page: Number(searchParams.get('page')) || 1,
    per_page: Number(searchParams.get('per_page')) || defaultPerPage,
    sector_id: searchParams.get('sector_id') ? Number(searchParams.get('sector_id')) : undefined,
    year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
    vendor_id: searchParams.get('vendor_id') ? Number(searchParams.get('vendor_id')) : undefined,
    institution_id: searchParams.get('institution_id') ? Number(searchParams.get('institution_id')) : undefined,
    category_id: searchParams.get('category_id') ? Number(searchParams.get('category_id')) : undefined,
    risk_level: searchParams.get('risk_level') as ContractFilterParams['risk_level'],
    risk_level_min: (searchParams.get('risk_level_min') || undefined) as ContractFilterParams['risk_level_min'],
    risk_factor: searchParams.get('risk_factor') || undefined,
    is_direct_award: searchParams.get('is_direct_award') === 'true' ? true : undefined,
    is_single_bid: searchParams.get('is_single_bid') === 'true' ? true : undefined,
    min_amount: searchParams.get('min_amount') ? Number(searchParams.get('min_amount')) : undefined,
    max_amount: searchParams.get('max_amount') ? Number(searchParams.get('max_amount')) : undefined,
    search: searchParams.get('search') || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  }), [searchParams, sortBy, sortOrder, defaultPerPage])

  // Search ↔ URL (PARALLAX D12b § Change 6). The URL is the source of truth:
  // a URL change (Back/Forward, preset, saved filter, deep link) sets the
  // input; the debounced input writes to the URL only when the INPUT changed —
  // never re-writing an old term onto a restored URL.
  const urlSearch = searchParams.get('search') || ''
  const lastSearchRef = useRef(urlSearch)
  // true only between a keystroke and its URL write — a debounce that settles
  // after a URL-driven reset (Back/Forward, preset) must never write.
  const userTypedRef = useRef(false)
  useEffect(() => {
    if (urlSearch === lastSearchRef.current) return
    lastSearchRef.current = urlSearch
    userTypedRef.current = false
    setSearchInput(urlSearch)
  }, [urlSearch, setSearchInput])
  useEffect(() => {
    if (!userTypedRef.current) return
    if (debouncedSearch !== searchInput) return // still debouncing
    if (debouncedSearch === lastSearchRef.current) return
    lastSearchRef.current = debouncedSearch
    const newParams = new URLSearchParams(searchParams)
    if (debouncedSearch) {
      newParams.set('search', debouncedSearch)
      newParams.set('page', '1')
    } else {
      newParams.delete('search')
    }
    // Same semantics as useUrlParamInput: adding the term pushes (Back undoes
    // it), refining or clearing it replaces.
    setSearchParams(newParams, { replace: urlSearch !== '' })
  }, [debouncedSearch, searchInput, urlSearch, searchParams, setSearchParams])


  const toast = useToast()

  // Compare selection
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set())
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const compareButtonRef = useRef<HTMLButtonElement>(null)
  const MAX_COMPARE = 4

  const toggleCompare = useCallback((id: number) => {
    setCompareIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_COMPARE) {
        next.add(id)
      } else {
        toast.error(t('toast.tooManyTitle'), t('toast.tooManyBody', { max: MAX_COMPARE }))
      }
      return next
    })
  }, [toast, t])

  const clearCompare = useCallback(() => {
    setCompareIds(new Set())
    setIsCompareOpen(false)
  }, [])

  // Compare picks are fetched by id, so picks from other pages are present.
  const compareIdList = useMemo(() => [...compareIds], [compareIds])
  const { data: compareRows, isLoading: compareLoading } = useQuery({
    queryKey: ['contracts-compare', compareIdList],
    queryFn: () => contractApi.compare(compareIdList),
    enabled: isCompareOpen && compareIdList.length >= 2,
    staleTime: 10 * 60 * 1000,
  })

  // «Visualización | Lista» (owner 2026-10-15): the ladder is the default view; the ledger is «Lista».
  // The ladder (/contracts/field) can't apply these; a link carrying one opens the list, which
  // applies them and shows them as tags (CLICKPATH_AUDIT_2026-10-30 #4). «Visualización» still wins when chosen.
  const ladderBlind = ['risk_level_min', 'risk_factor', 'category_id', 'min_amount', 'max_amount', 'is_single_bid'].some((k) => searchParams.has(k))
  const vistaQ = searchParams.get('vista')
  const vista: 'visual' | 'lista' = vistaQ === 'lista' || (ladderBlind && vistaQ !== 'visual') ? 'lista' : 'visual'
  const setVista = (v: 'visual' | 'lista') => {
    const next = new URLSearchParams(searchParams)
    if (v === 'lista') next.set('vista', 'lista'); else if (ladderBlind) next.set('vista', 'visual'); else next.delete('vista')
    for (const k of ['lente', 'peldano', 'c']) next.delete(k)
    setSearchParams(next)
  }

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['contracts', filters],
    placeholderData: keepPreviousData,
    queryFn: () => contractApi.getAll(filters),
    staleTime: 2 * 60 * 1000,
    enabled: vista === 'lista',
  })

  // Rows without a valid amount (hist bin −1) — same cube as the ladder, so the note matches its «sin monto válido»
  const { data: fieldAll } = useQuery({
    queryKey: ['contracts-field', {}],
    queryFn: () => contractApi.getField({}),
    staleTime: 30 * 60 * 1000,
    enabled: vista === 'lista',
  })
  const noAmountN = fieldAll ? fieldAll.hist.reduce((t, h) => (h[1] < 0 ? t + h[2] : t), 0) : 0

  // Archive-wide totals (unfiltered, amount > 0) — never a typed constant.
  const { data: archiveStats } = useQuery({
    queryKey: ['contracts-statistics'],
    queryFn: () => contractApi.getStatistics(),
    staleTime: 24 * 60 * 60 * 1000,
  })


  // --- Handlers ---

  const updateFilter = useCallback((key: string, value: string | number | boolean | undefined) => {
    if (key === 'search') { userTypedRef.current = true; setSearchInput(String(value || '')); return }
    const newParams = new URLSearchParams(searchParams)
    if (value === undefined || value === '') {
      newParams.delete(key)
    } else {
      newParams.set(key, String(value))
    }
    if (key !== 'page') newParams.set('page', '1')
    setSearchParams(newParams)
    setActivePreset(null)
  }, [searchParams, setSearchParams, setSearchInput])

  const handleSort = useCallback((field: ContractSortField) => {
    const newParams = new URLSearchParams(searchParams)
    if (sortBy === field) {
      newParams.set('sort_order', sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      newParams.set('sort_by', field)
      newParams.set('sort_order', 'desc')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
    setActivePreset(null)
  }, [searchParams, setSearchParams, sortBy, sortOrder])

  const applyPreset = useCallback((presetId: string) => {
    const preset = CONTRACT_PRESET_DEFS.find((p) => p.id === presetId)
    if (!preset) return
    const newParams = new URLSearchParams()
    newParams.set('sort_by', preset.sort)
    newParams.set('sort_order', preset.order)
    for (const [k, v] of Object.entries(preset.filters)) {
      if (v !== undefined) newParams.set(k, v)
    }
    newParams.set('page', '1')
    setSearchInput('')
    setMinAmountInput('')
    setMaxAmountInput('')
    setSearchParams(newParams)
    setActivePreset(presetId)
  }, [setSearchParams, setSearchInput, setMinAmountInput, setMaxAmountInput])

  const clearAllFilters = useCallback(() => {
    setSearchInput('')
    setMinAmountInput('')
    setMaxAmountInput('')
    setSearchParams({})
    setActivePreset(null)
  }, [setSearchParams, setSearchInput, setMinAmountInput, setMaxAmountInput])

  const [isExporting, setIsExporting] = useState(false)
  // The export endpoint uses `limit` (max 100,000) and ignores pagination params.
  // Strip per_page/page/sort_by/sort_order before calling it to avoid confusion.
  const EXPORT_MAX_ROWS = 10_000 // backend default for /export/contracts/csv
  const handleExport = async () => {
    setIsExporting(true)
    const total = data?.pagination.total ?? 0
    // Warn the user before exporting if the filtered set exceeds the export cap
    if (total > EXPORT_MAX_ROWS) {
      toast.warning(
        t('error.exportCapped'),
        t('toast.exportCappedBody', { total: formatNumber(total), max: formatNumber(EXPORT_MAX_ROWS) })
      )
    }
    try {
      // Build export params: omit pagination fields (page, per_page, sort_by, sort_order)
      // The export endpoint does not accept per_page — it uses its own `limit` param.
      const exportFilters = omit(filters, ['page', 'per_page', 'sort_by', 'sort_order'])
      const blob = await exportApi.exportContracts(exportFilters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contracts_export_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      const exported = Math.min(total, EXPORT_MAX_ROWS)
      if (total > EXPORT_MAX_ROWS) {
        toast.success(
          t('error.exportComplete'),
          t('toast.exportCompleteCapped', { exported: formatNumber(exported), total: formatNumber(total), max: formatNumber(EXPORT_MAX_ROWS) })
        )
      } else {
        toast.success(t('error.exportComplete'), t('toast.exportCompleteBody', { exported: formatNumber(exported) }))
      }
    } catch {
      toast.error(t('error.exportFailed'), t('toast.exportFailedBody'))
    } finally {
      setIsExporting(false)
    }
  }

  // Excel export — same current-filter semantics as the CSV path, via the
  // existing /export/contracts/excel endpoint (the Records Room "take it with
  // you" affordance, now offered in both formats).
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const handleExportExcel = async () => {
    setIsExportingExcel(true)
    const total = data?.pagination.total ?? 0
    if (total > EXPORT_MAX_ROWS) {
      toast.warning(
        t('error.exportCapped'),
        t('toast.exportCappedBody', { total: formatNumber(total), max: formatNumber(EXPORT_MAX_ROWS) })
      )
    }
    try {
      const exportFilters = omit(filters, ['page', 'per_page', 'sort_by', 'sort_order'])
      const blob = await exportApi.downloadExcel(exportFilters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contracts_export_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('error.exportComplete'), t('toast.exportCompleteXlsx', { exported: formatNumber(Math.min(total, EXPORT_MAX_ROWS)) }))
    } catch (err) {
      // 501 = the server build lacks openpyxl (Excel optional dep). Degrade
      // honestly to CSV rather than a generic failure; self-heals once the
      // backend image carries openpyxl.
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 501) {
        toast.error(t('toast.excelUnavailable'), t('toast.excelUnavailableBody'))
      } else {
        toast.error(t('error.exportFailed'), t('toast.exportFailedBody'))
      }
    } finally {
      setIsExportingExcel(false)
    }
  }

  // Saved contract filters (localStorage)
  const CONTRACT_FILTERS_KEY = 'rubli_contract_filters'
  const { items: savedFilters, save: saveFilter, remove: removeSavedFilter } = useSavedSearches(CONTRACT_FILTERS_KEY)
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false)
  const savedFiltersRef = useRef<HTMLDivElement>(null)
  const [filterSavedAnim, setFilterSavedAnim] = useState(false)

  const handleApplySavedFilter = useCallback((params: string) => {
    setSavedFiltersOpen(false)
    setSearchInput('')
    setMinAmountInput('')
    setMaxAmountInput('')
    setSearchParams(new URLSearchParams(params))
    setActivePreset(null)
  }, [setSearchParams, setSearchInput, setMinAmountInput, setMaxAmountInput])

  const [linkCopied, setLinkCopied] = useState(false)
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      toast.success(t('error.linkCopied'), t('toast.linkCopiedBody'))
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      toast.error(t('error.copyFailed'), t('toast.copyFailedBody'))
    }
  }

  // --- Computed ---

  const showSearchLoading = isSearchPending || (isFetching && searchInput !== debouncedSearch)
  const hasActiveFilters = !!(
    filters.search ||
    filters.sector_id ||
    filters.year ||
    filters.risk_level ||
    filters.risk_level_min ||
    filters.risk_factor ||
    filters.is_direct_award ||
    filters.is_single_bid ||
    filters.min_amount ||
    filters.max_amount
  )

  const pageExportData = useMemo(() => {
    if (!data?.data?.length) return []
    return data.data.map((c) => ({
      id: c.id,
      title: c.title ?? '',
      vendor_name: c.vendor_name ?? '',
      amount_mxn: c.amount_mxn,
      risk_level: c.risk_level ?? (isUnscored(c.risk_score, c.risk_model_version) ? NO_RISK_LABEL[lang === 'es' ? 'es' : 'en'] : ''),
      risk_score: c.risk_score != null ? Number(c.risk_score.toFixed(4)) : '',
      source: c.source_structure === COMPRASMX_STRUCTURE ? 'ComprasMX' : 'CompraNet',
      year: c.contract_year ?? '',
      procedure_type: c.procedure_type ?? '',
      sector_name: c.sector_name ?? '',
    }))
  }, [data])

  const activeFilterTags = useMemo(() => {
    const tags: { key: string; label: string }[] = []
    if (filters.search) tags.push({ key: 'search', label: `"${filters.search}"` })
    if (filters.sector_id) {
      const sec = SECTORS.find((s) => s.id === filters.sector_id)
      tags.push({ key: 'sector_id', label: sec ? ts(sec.code) : `Sector ${filters.sector_id}` })
    }
    if (filters.year) tags.push({ key: 'year', label: t('filterTags.year', { year: filters.year }) })
    if (filters.risk_level) tags.push({ key: 'risk_level', label: t('filterTags.risk', { level: t(`riskLevels.${filters.risk_level}`) }) })
    if (filters.risk_level_min) tags.push({ key: 'risk_level_min', label: t('filterTags.riskMin', { level: t(`riskLevels.${filters.risk_level_min}`) }) })
    if (filters.risk_factor) {
      const f = RISK_FACTORS.find((rf) => rf.value === filters.risk_factor)
      tags.push({ key: 'risk_factor', label: f ? (lang === 'es' ? f.label_es : f.label) : filters.risk_factor })
    }
    if (filters.is_direct_award) tags.push({ key: 'is_direct_award', label: t('filterTags.directAwards') })
    if (filters.is_single_bid) tags.push({ key: 'is_single_bid', label: t('filterTags.singleBidders') })
    if (filters.min_amount) tags.push({ key: 'min_amount', label: `≥ ${formatCompactMXN(filters.min_amount)}` })
    if (filters.max_amount) tags.push({ key: 'max_amount', label: `≤ ${formatCompactMXN(filters.max_amount)}` })
    if (filters.category_id) tags.push({ key: 'category_id', label: t('filterTags.category', { id: filters.category_id }) })
    return tags
  }, [filters, t, ts])

  // document.title — the archive, or the filtered count + tags.
  const titleTags = activeFilterTags.map((tag) => tag.label).join(', ')
  useDocumentTitle(
    !titleTags
      ? `${t('archiveTitle')} — RUBLI`
      : data && !isFetching
        ? `${t('archiveTitleFiltered', { count: data.pagination.total, formatted: formatNumber(data.pagination.total), tags: titleTags })} — RUBLI`
        : `${titleTags} · ${t('archiveTitle')} — RUBLI`, // count arrives with the results
  )

  // Remove a filter tag — amount tags also clear local input state
  const removeFilterTag = useCallback((key: string) => {
    if (key === 'min_amount') { editMinAmount(''); return }
    if (key === 'max_amount') { editMaxAmount(''); return }
    updateFilter(key, undefined)
  }, [updateFilter, editMinAmount, editMaxAmount])

  // Save current filter to localStorage (defined after activeFilterTags is available)
  const handleSaveFilter = useCallback(() => {
    const params = searchParams.toString()
    if (!params) return
    const label = activeFilterTags.map((tag) => tag.label).join(', ') || t('filters.heading')
    saveFilter(label, params)
    setFilterSavedAnim(true)
    setTimeout(() => setFilterSavedAnim(false), 2000)
  }, [searchParams, activeFilterTags, saveFilter])

  // Filters other than free-text search (the search box already shows that one)
  const filterCount = activeFilterTags.filter((tag) => tag.key !== 'search').length

  // ── En cifras, live from the current filter. With no filter or only sector / year, the
  // statistics endpoint carries every figure (cheap, cached). Any other filter: the counts
  // come from one count query each (exact for the filter); the sum exists server-side only
  // per sector + year, so it prints «—» and says why (never a page-slice sum).
  const total = data?.pagination.total ?? null
  const countFilters = useMemo(() => omit(filters, ['page', 'per_page', 'sort_by', 'sort_order']), [filters])
  const amountScoped = !(filters.search || filters.risk_level || filters.risk_level_min || filters.risk_factor || filters.is_direct_award ||
    filters.is_single_bid || filters.min_amount || filters.max_amount || filters.vendor_id || filters.institution_id || filters.category_id)
  const bySectorYear = !!(filters.sector_id || filters.year)
  // These figures print only in «Lista»; the ladder (Visualización) has its own data.
  const { data: scopedStats } = useQuery({
    queryKey: ['contracts-statistics', filters.sector_id ?? null, filters.year ?? null],
    queryFn: () => contractApi.getStatistics({ sector_id: filters.sector_id, year: filters.year }),
    enabled: vista === 'lista' && amountScoped && bySectorYear,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const stats = !amountScoped ? null : bySectorYear ? (scopedStats ?? null) : (archiveStats ?? null)
  const critKnown = filters.risk_level ? filters.risk_level === 'critical' : null
  const { data: critData } = useQuery({
    queryKey: ['contracts-count', 'critical', countFilters],
    queryFn: () => contractApi.getAll({ ...countFilters, risk_level: 'critical', page: 1, per_page: 1 }),
    enabled: vista === 'lista' && !amountScoped && critKnown == null,
    staleTime: 5 * 60 * 1000,
  })
  const { data: daData } = useQuery({
    queryKey: ['contracts-count', 'da', countFilters],
    queryFn: () => contractApi.getAll({ ...countFilters, is_direct_award: true, page: 1, per_page: 1 }),
    enabled: vista === 'lista' && !amountScoped && !filters.is_direct_award,
    staleTime: 5 * 60 * 1000,
  })
  const critCount = amountScoped
    ? (stats?.critical_risk_count ?? null)
    : critKnown == null ? (critData?.pagination.total ?? null) : total == null ? null : critKnown ? total : 0
  const daCount = amountScoped ? (stats?.direct_award_count ?? null) : filters.is_direct_award ? total : (daData?.pagination.total ?? null)
  const denom = amountScoped ? (stats?.total_contracts ?? null) : total
  // The critical share counts scored contracts only (ComprasMX loads unscored): risk_score >= 0
  // excludes NULLs; a risk filter already implies scored; the stats ladder's level counts are scored.
  const riskFiltered = !!(filters.risk_level || filters.risk_level_min)
  const { data: scoredData } = useQuery({
    queryKey: ['contracts-count', 'scored', countFilters],
    queryFn: () => contractApi.getAll({ ...countFilters, risk_level_min: 'low', page: 1, per_page: 1 }),
    enabled: !amountScoped && !riskFiltered,
    staleTime: 5 * 60 * 1000,
  })
  const scoredDenom = amountScoped
    ? (stats ? stats.low_risk_count + stats.medium_risk_count + stats.high_risk_count + stats.critical_risk_count : null)
    : riskFiltered ? total : (scoredData?.pagination.total ?? null)
  const unscoredN = denom != null && scoredDenom != null ? Math.max(0, denom - scoredDenom) : 0
  const amountMxn = stats?.total_value_mxn ?? null
  const share = (n: number | null) => (n != null && denom ? (n / denom) * 100 : null)
  const critPct = critCount != null && scoredDenom ? (critCount / scoredDenom) * 100 : null
  const daPct = share(daCount)
  const pctFmt = (v: number) => v.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  // Esc clears the filters (the empty row says so), unless a field has focus.
  useEffect(() => {
    if (!hasActiveFilters || vista !== 'lista') return // the ladder owns Esc (dock, zoom)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.closest('[role="dialog"]'))) return
      clearAllFilters()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasActiveFilters, clearAllFilters, vista])

  // Copy link + exports: the register's header at md+, inside the bottom sheet on phones
  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="ct-btn"
        onClick={handleCopyLink}
        title={linkCopied ? t('actions.copied') : t('actions.copyLink')}
        aria-label={t('actions.copyLink')}
      >
        {linkCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="ct-btn"
        onClick={handleExport}
        disabled={isExporting || !data || (data?.pagination?.total ?? 0) === 0}
        title={t('actions.exportCsv')}
        aria-label={t('actions.exportCsv')}
      >
        {isExporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="ct-btn"
        onClick={handleExportExcel}
        disabled={isExportingExcel || !data || (data?.pagination?.total ?? 0) === 0}
        title={t('actions.exportXlsx')}
        aria-label={t('actions.exportXlsx')}
      >
        {isExportingExcel ? <Loader2 className="animate-spin" aria-hidden="true" /> : 'xlsx'}
      </button>
      <TableExportButton data={pageExportData} filename="contracts-page" />
    </div>
  )

  // Live count of the ledger under the current filter (the guidance sentence lives in the foot notes)
  const countNote = (
    <span className="cx-note cx-count" aria-live="polite">
      {data ? `${formatNumber(data.pagination.total)} ${t('common:results', 'resultados')}` : error ? '—' : t('common:loading', 'Cargando...')}
      {data && !hasActiveFilters && noAmountN > 0 && (
        <> {t('countNoAmount', { formatted: formatNumber(noAmountN) })}</>
      )}
    </span>
  )

  // Shortcuts · indicator + procedure · narrowing. At md+ the indicator row is always out and
  // the other two open under «Filtros»; on phones all three live in the bottom sheet.
  const shortcutsRow = (
      <div className="cx-row">
        <span className="cx-label">{t('ct.railShortcuts')}</span>
        {CONTRACT_PRESET_DEFS.map((preset) => {
          const isActive = activePreset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              className="ct-chip"
              title={
                t(preset.descriptionKey)
                + (isActive && data && !isFetching ? ` · ${t('presets.liveCount', { count: data.pagination.total, formatted: formatNumber(data.pagination.total) })}` : '')
              }
              aria-pressed={isActive}
              onClick={() => isActive ? clearAllFilters() : applyPreset(preset.id)}
            >
              {t(preset.labelKey)}
            </button>
          )
        })}
      </div>
  )
  const riskRow = (
      <div className="cx-row">
        <span className="cx-label">{t('ct.railRisk')}</span>
        <div className="contents" role="group" aria-label={t('actions.filterRisk')}>
          {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
            const isActive = filters.risk_level === level
            return (
              <button
                key={level}
                type="button"
                className="ct-chip"
                onClick={() => updateFilter('risk_level', isActive ? undefined : level)}
                style={{ ['--hue' as string]: RISK_COLORS[level], ['--ink' as string]: RISK_TEXT_COLORS[level] }}
                aria-pressed={isActive}
                title={t('actions.filterRiskLevel', { level: t(`riskLevels.${level}`) })}
              >
                <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: RISK_COLORS[level] }} />
                {t(`riskLevels.${level}`)}
              </button>
            )
          })}
        </div>
        <span className="cx-label cx-label-2">{t('ct.railProcedure')}</span>
        <button
          type="button"
          className="ct-chip"
          onClick={() => updateFilter('is_direct_award', filters.is_direct_award ? undefined : true)}
          aria-pressed={!!filters.is_direct_award}
        >
          {t('filters.directAward')}
        </button>
        <button
          type="button"
          className="ct-chip"
          onClick={() => updateFilter('is_single_bid', filters.is_single_bid ? undefined : true)}
          aria-pressed={!!filters.is_single_bid}
        >
          {t('filters.singleBid')}
        </button>
        {!isPhone && countNote}
      </div>
  )
  const narrowRow = (
      <div className="cx-row">
        <span className="cx-label">{t('ct.railNarrow')}</span>
        <select
          className="cx-select"
          value={filters.sector_id || ''}
          onChange={(e) => updateFilter('sector_id', e.target.value ? Number(e.target.value) : undefined)}
          aria-label={t('actions.filterSector')}
        >
          <option value="">{t('filters.allSectors')}</option>
          {SECTORS.map((s) => (
            <option key={s.id} value={s.id}>{ts(s.code)}</option>
          ))}
        </select>
        <select
          className="cx-select"
          value={filters.year || ''}
          onChange={(e) => updateFilter('year', e.target.value ? Number(e.target.value) : undefined)}
          aria-label={t('actions.filterYear')}
        >
          <option value="">{t('filters.allYears')}</option>
          {Array.from({ length: DATA_CUT_YEAR - 2001 }, (_, i) => DATA_CUT_YEAR - i).map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          className="cx-select"
          value={filters.risk_factor || ''}
          onChange={(e) => updateFilter('risk_factor', e.target.value || undefined)}
          aria-label={t('actions.filterFactor')}
        >
          <option value="">{t('filters.allFactors')}</option>
          {RISK_FACTORS.map((f) => (
            <option key={f.value} value={f.value}>{lang === 'es' ? f.label_es : f.label}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          className="cx-amount"
          placeholder={t('filters.minAmountPlaceholder')}
          aria-label={t('filters.minAmount')}
          value={minAmountInput}
          onChange={(e) => { editMinAmount(e.target.value); setActivePreset(null) }}
          min={0}
        />
        <input
          type="number"
          inputMode="numeric"
          className="cx-amount"
          placeholder={t('filters.maxAmountPlaceholder')}
          aria-label={t('filters.maxAmount')}
          value={maxAmountInput}
          onChange={(e) => { editMaxAmount(e.target.value); setActivePreset(null) }}
          min={0}
        />
      </div>
  )
  const filterControls = <>{shortcutsRow}{riskRow}{narrowRow}</>

  // Active filters (each one a removable chip) + save / saved filters
  const activeRow = (activeFilterTags.length > 0 || savedFilters.length > 0) && (
    <div className="cx-row">
      <span className="cx-label">{t('ct.railActive')}</span>
      {activeFilterTags.map((tag) => (
        <button
          key={tag.key}
          type="button"
          className="ct-chip is-x"
          onClick={() => removeFilterTag(tag.key)}
          aria-label={t('actions.removeFilter', { label: tag.label })}
        >
          {tag.label}
          <span aria-hidden="true"><X className="h-3.5 w-3.5" /></span>
        </button>
      ))}
      {hasActiveFilters && (
        <>
          <button type="button" className="ct-chip is-plain" onClick={clearAllFilters}>{t('filters.clearAll')}</button>
          <button type="button" className="ct-chip is-plain" onClick={handleSaveFilter} title={t('actions.saveFilterLabel')}>
            {filterSavedAnim ? t('actions.filterSaved') : t('actions.saveFilter')}
          </button>
        </>
      )}
      {savedFilters.length > 0 && (
        <div className="relative" ref={savedFiltersRef}>
          <button
            type="button"
            className="ct-chip is-plain"
            onClick={() => setSavedFiltersOpen((o) => !o)}
            aria-label={t('actions.showSaved')}
            aria-expanded={savedFiltersOpen}
            aria-haspopup="menu"
          >
            {t('actions.savedCount', { count: savedFilters.length })}
          </button>
          {savedFiltersOpen && (
            <div role="menu" className="cx-menu">
              {savedFilters.map((sf, i) => (
                <div key={`${sf.value}-${i}`}>
                  <button type="button" role="menuitem" onClick={() => handleApplySavedFilter(sf.value)}>
                    {sf.label}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSavedFilter(i)
                      if (savedFilters.length <= 1) setSavedFiltersOpen(false)
                    }}
                    aria-label={t('actions.removeSaved', { label: sf.label })}
                  >
                    <X className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // The ledger's toolbar (it opens the object): search 48 · Filtros · exports, then the chips.
  const rail = (
    <div className="cx-rail">
      <div className="cx-row">
        <div className="cx-search">
          {showSearchLoading
            ? <Loader2 className="animate-spin" aria-hidden="true" />
            : <Search aria-hidden="true" />}
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => { userTypedRef.current = true; setSearchInput(e.target.value) }}
            aria-label={t('actions.searchLabel')}
          />
          {searchInput && (
            <button type="button" onClick={() => { userTypedRef.current = true; setSearchInput('') }} aria-label={t('actions.clearSearch')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="ct-btn"
          onClick={() => (isPhone ? setFiltersOpen(true) : setMoreOpen((o) => !o))}
          aria-haspopup={isPhone ? 'dialog' : undefined}
          aria-expanded={isPhone ? filtersOpen : moreOpen}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('filters.heading')}
          {filterCount > 0 && <span className="tabular-nums">({filterCount})</span>}
        </button>
        {!isPhone && actionButtons}
      </div>
      {!isPhone && riskRow}
      {!isPhone && moreOpen && <>{shortcutsRow}{narrowRow}</>}
      {isPhone && countNote}
      {activeRow}
      {!!filters.year && filters.year <= 2010 && (
        <p role="note" className="cx-note">{t('pre2010Banner')}</p>
      )}
    </div>
  )

  const totalPages = Math.max(1, data?.pagination?.total_pages ?? 1)
  const page = clampPage(filters.page || 1, totalPages)

  // --- Render ---
  const ph = lang === 'es' ? 'es' : 'en'
  const head = (slots: HeadSlots) => (
    <PageHead lang={ph} crumbs={[{ label: t('ct.doc') }]} sticky={vista === 'lista'} {...slots}
      tabs={<ViewSwitch lang={ph} value={vista} onChange={setVista} views={[
        { key: 'visual', es: 'La escalera', en: 'The ladder' },
        { key: 'lista', es: 'El registro', en: 'The register' },
      ]} />} />
  )

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        {vista === 'visual' ? <ContractsLadder lang={ph} onList={() => setVista('lista')} head={head} /> : <>
        {isPhone && (
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            {/* Phones: shortcuts + filters live in a bottom sheet; every control is a 40px+ target. */}
            <DialogContent align="bottom" className="ct cx-rail px-4 pt-4">
              <DialogTitle className="ct-h2">
                {t('filters.heading')}{filterCount > 0 ? ` (${filterCount})` : ''}
              </DialogTitle>
              {filterControls}
              <div className="cx-row">
                <span className="cx-label">{t('actions.exportHeading')}</span>
                {actionButtons}
              </div>
              <button type="button" className="ct-btn is-ink w-full" onClick={() => setFiltersOpen(false)}>
                {data ? t('filters.showResults', { count: data.pagination.total, formatted: formatNumber(data.pagination.total) }) : t('filters.done')}
              </button>
            </DialogContent>
          </Dialog>
        )}

        {/* kit/PageHead (owner 11-06): h1 = the count the filter returns · the question · the register's toolbar */}
        {head({
          finding: data ? (lang === 'es'
            ? <>Con lo que eligió hay <b>{formatNumber(data.pagination.total)}</b> contratos; cada fila abre uno.</>
            : <>With what you picked there are <b>{formatNumber(data.pagination.total)}</b> contracts; each row opens one.</>) : t('archiveTitle'),
          question: lang === 'es' ? '¿Qué contratos hay?' : 'What contracts are there?',
          toolbar: rail,
        })}

        {/* ─── El registro — the object: toolbar + ledger at full measure ─── */}
        <section className="cx-ledger" aria-label={t('ct.register')}>
          <div className="cx-ledger-body">
            <ExpandableProvider>
              <RegisterBoard
                rows={data?.data ?? []}
                lang={lang === 'en' ? 'en' : 'es'}
                label={t('actions.contractsList')}
                sort={{ by: sortBy, order: sortOrder }}
                onSort={handleSort}
                explain
                lead={(c) => <RowLead contract={c} isSelected={compareIds.has(c.id)} onToggleCompare={toggleCompare} lang={lang} />}
                picked={(c) => compareIds.has(c.id)}
                after={(c) => <RowOpen contract={c} lang={lang} />}
                status={isLoading ? (
                  <span className="cx-hold" aria-hidden="true" />
                ) : error ? (
                  <span role="alert">
                    {t('error.failedToLoad')}.{' '}
                    {/* axios messages are English — never print them raw in the Spanish UI */}
                    {(error as Error).message === 'Network Error' ? t('toast.networkError') : t('toast.unexpectedError')}{' '}
                    <button type="button" className="ct-link" onClick={() => refetch()}>{t('actions.retry')}</button>
                  </span>
                ) : data?.data?.length === 0 ? (
                  <span>
                    {hasActiveFilters ? `${t('emptyFiltered')}. ` : `${t('emptyInitialDesc')} `}
                    {hasActiveFilters && (
                      <>
                        <button type="button" className="ct-link" onClick={clearAllFilters}>{t('ct.clearFilters')}</button>
                        <kbd className="ct-mono ml-2 text-[13px] text-text-muted">Esc</kbd>
                      </>
                    )}
                  </span>
                ) : undefined}
              />
            </ExpandableProvider>

            {data && (data?.pagination?.total ?? 0) > 0 && (
              <nav aria-label={t('actions.pagination')} className="ct-pager">
                <span className="ct-pager-n">
                  {(() => {
                    const { start, end } = getPaginationRange(filters.page || 1, filters.per_page || 50, data.pagination?.total ?? 0)
                    return t('actions.rangeOf', { start: formatNumber(start), end: formatNumber(end), total: formatNumber(data.pagination?.total ?? 0) })
                  })()}
                </span>
                <div className="ct-pager-n">
                  <select
                    className="cx-select"
                    value={filters.per_page}
                    onChange={(e) => updateFilter('per_page', Number(e.target.value))}
                    aria-label={t('actions.perPage')}
                  >
                    {isPhone && <option value={20}>20 {t('ct.perPage')}</option>}
                    <option value={25}>25 {t('ct.perPage')}</option>
                    <option value={50}>50 {t('ct.perPage')}</option>
                    <option value={100}>100 {t('ct.perPage')}</option>
                  </select>
                  <button
                    type="button"
                    className="ct-btn"
                    disabled={page <= 1}
                    onClick={() => updateFilter('page', Math.max(1, page - 1))}
                    aria-label={t('actions.prevPage')}
                  >
                    ← {t('ct.prev')}
                  </button>
                  <span>{t('ct.pageOf', { page: formatNumber(page), total: formatNumber(totalPages) })}</span>
                  <button
                    type="button"
                    className="ct-btn"
                    disabled={page >= totalPages}
                    onClick={() => updateFilter('page', Math.min(totalPages, page + 1))}
                    aria-label={t('actions.nextPage')}
                  >
                    {t('ct.next')} →
                  </button>
                </div>
              </nav>
            )}
          </div>
        </section>

        {/* ─── En cifras — live from the current filter ─── */}
        <section className="ct-clauses" aria-labelledby="cx-cl-h">
          <h2 id="cx-cl-h">{t('ct.figures')}</h2>
          <div className="ct-cl-grid">
            <Clause
              id="cx-cl-n"
              title={t('ct.figCount')}
              fig={total != null ? formatNumber(total) : '—'}
              count={total != null ? { value: total, format: (n) => formatNumber(Math.round(n)) } : undefined}
              note={hasActiveFilters ? t('ct.figCountFiltered') : t('ct.figCountAll', { year: DATA_CUT_YEAR })}
            />
            <Clause
              id="cx-cl-monto"
              title={t('ct.figAmount')}
              fig={amountMxn != null ? formatCompactMXN(amountMxn) : '—'}
              note={!amountScoped
                ? t('ct.figAmountNA')
                : `${bySectorYear ? t('ct.figAmountScoped') : t('ct.figAmountAll')}${lang === 'en' && amountMxn != null ? `, ≈${formatCompactUSD(amountMxn)}` : ''}`}
            />
            <Clause
              id="cx-cl-crit"
              title={t('ct.figCrit')}
              fig={critPct != null ? pctFmt(critPct) : '—'}
              count={critPct != null ? { value: critPct, format: pctFmt } : undefined}
              unit="%"
              critical
              note={critCount != null ? `${t('ct.figCritNote', { formatted: formatNumber(critCount) })}${unscoredN > 0 ? ` · ${formatNumber(unscoredN)} ${lang === 'es' ? 'sin indicador' : 'unscored'}` : ''}` : undefined}
            />
            <Clause
              id="cx-cl-da"
              title={t('ct.figDa')}
              fig={daPct != null ? pctFmt(daPct) : '—'}
              count={daPct != null ? { value: daPct, format: pctFmt } : undefined}
              unit="%"
              note={daCount != null ? t('ct.figDaNote', { formatted: formatNumber(daCount) }) : undefined}
            />
          </div>
        </section>

        {/* ─── Los señalados — documented cases first, then high + critical ─── */}
        <SenaladosBand filters={filters} lang={lang} />

        {/* Floating compare bar — in DOM order right after the table so a
            keyboard user reaches it from the last checkbox (D12b § Change 6) */}
        {compareIds.size >= 2 && (
          <div className="cx-compare">
            <span>{t('actions.selectedCount', { count: compareIds.size })}</span>
            <button type="button" className="ct-btn is-ink" ref={compareButtonRef} onClick={() => setIsCompareOpen(true)}>
              <GitCompareArrows aria-hidden="true" />
              {t('actions.compare')}
            </button>
            <button type="button" onClick={clearCompare} className="ct-btn" aria-label={t('actions.clearSelection')}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}

        <ContractCompareModal
          contracts={compareRows ?? []}
          loading={compareLoading}
          returnFocusRef={compareButtonRef}
          open={isCompareOpen}
          onOpenChange={setIsCompareOpen}
        />

        {/* ─── The foot: the former lede + ONE <FootNotes> (DESIGN.md §5.1; the Declaraciones list is retired) ─── */}
        <p className="ct-lede cx-foot-lede">{t('archiveDek')}</p>
        <FootNotes
          lang={lang === 'en' ? 'en' : 'es'}
          items={[t('guidance'), t('dictionary.frozen'), t('dictionary.export'), t('dictionary.directAward'), t('dictionary.singleBid'), t('dictionary.risk'), t('dictionary.category')]}
        />
        </>}
      </div>
    </article>
  )
}

// =============================================================================
// Register row extras: compare box + quick look, and the opened card
// =============================================================================

function RowLead({ contract, isSelected, onToggleCompare, lang }: {
  contract: ContractListItem
  isSelected: boolean
  onToggleCompare: (id: number) => void
  lang: string
}) {
  const { t } = useTranslation('contracts')
  const { toggle, isExpanded } = useExpandable()
  return (
    <>
      <label className="cx-check">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleCompare(contract.id)}
          aria-label={lang === 'es' ? `Comparar contrato ${contract.contract_number || contract.id}` : `Select contract ${contract.contract_number || contract.id} for comparison`}
        />
      </label>
      <button
        id={`cx-peek-${contract.id}`}
        type="button"
        className="cx-peek"
        onClick={() => toggle(contract.id)}
        aria-expanded={isExpanded(contract.id)}
        aria-label={t('table.peek', 'Quick look')}
        title={t('table.peek', 'Quick look')}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </>
  )
}

/** The opened record — «La ficha», the same card the ladder docks (archive README 2026-10-28, A). */
function RowOpen({ contract, lang }: { contract: ContractListItem; lang: string }) {
  const { t } = useTranslation('contracts')
  const { toggle, isExpanded } = useExpandable()
  const expanded = isExpanded(contract.id)
  // the card takes focus when it opens; closing it hands focus back to the row's «›»
  const cardRef = React.useRef<HTMLElement>(null)
  React.useEffect(() => { if (expanded) cardRef.current?.focus({ preventScroll: true }) }, [expanded])
  if (!expanded) return null
  return (
    <li className="cx-open rg-open">
      <ContractCard ref={cardRef} id={contract.id} lang={lang === 'en' ? 'en' : 'es'}
        onClose={() => { toggle(contract.id); document.getElementById(`cx-peek-${contract.id}`)?.focus() }}
        actions={<>
          {contract.contract_number && (
            <a
              href={`https://compranet.hacienda.gob.mx/esop/toolkit/opportunity/opportunityDetail.do?opportunityId=${encodeURIComponent(contract.contract_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-link inline-flex min-h-10 items-center gap-1"
            >
              CompraNet <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only"> {t('actions.opensNewTab')}</span>
            </a>
          )}
          <RiskFeedbackButton entityType="contract" entityId={contract.id} className="h-10 w-10" />
          <AddToDossierButton
            entityType="contract"
            entityId={contract.id}
            entityName={contract.title ?? contract.contract_number ?? `${lang === 'es' ? 'Contrato' : 'Contract'} #${contract.id}`}
            iconOnly
            className="h-10 w-10"
          />
        </>} />
    </li>
  )
}

export default Contracts
