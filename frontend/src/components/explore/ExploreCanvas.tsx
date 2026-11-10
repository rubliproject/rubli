/**
 * ExploreCanvas — El Mapa: four nested HTML registers driven by ExploreState.
 *
 * Z0 «El Índice» — 12-row sector ledger, each row carrying its 3 biggest buyers
 * Z1 — institution register inside the focused sector
 * Z2 — vendor register of the focused institution (rank by spend, paged tail)
 * Z3 — contract register of the focused vendor; Z4 drawer over it
 *
 * ESC pops one level via the explore reducer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import i18n from '@/i18n'
import { dataQualityLevel } from '@/lib/tiers'
import { useNavigate } from 'react-router-dom'
import { atlasApi, sectorApi, type SpatialInstitution } from '@/api/client'
import type { ContractListItem } from '@/api/types'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  RISK_INK_ON_PLATE,
  getRiskLevelFromScore,
  MAPA_SECTOR_COLORS as SECTOR_COLORS,
  SECTORS,
  PATTERN_COLORS,
  DATA_CUT_YEAR,
} from '@/lib/constants'
import { formatCompactMXN, formatCompactUSD, formatCompactUSDByYear, formatNumber, shortenContractName, safeHttpUrl } from '@/lib/utils'
import { glueDashes } from '@/lib/typography'
import { cleanContractDescription, computeContractFlags, type ContractFlags } from '@/lib/contract-audit'
import { formatVendorName } from '@/lib/vendor/formatName'
import { factorLabel } from '@/lib/contracts/ficha'
import { localizeProcedure } from '@/lib/contract-format'
import { ADMIN_DISPLAY_ACCENTED, getAdministrationByYear } from '@/lib/administrations'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileRegisterRow } from '@/components/mobile/MobileRegisterRow'
import { ShareViewButton } from './CanvasControls'
import {
  useExploreState,
  useExploreDispatch,
  useCurrentFocus,
  type Focus,
} from './ExploreState'
import { Z_EASE, Z_LAYOUT_DURATION_S, Z_BAND_S, Z_CASCADE_STEP_S, Z_TREEMAP_DELAY_S, Z_DRAWER_S, ZBreadcrumb, ZKickerBand, Z_FOCUS_RING, Z_FOCUS_RING_INSET, ZFooterLink, ZSortToggle, Z_GUTTER, type CrumbSegment } from './ZPrimitives'
import { useBandVariants } from './bandVariants'
import { sectorLine } from './sectorLines'

import { T } from '@/lib/motion'
import { PageMasthead } from '@/components/layout/PageMasthead'
import { DATA_QUALITY_QUERY } from '@/lib/nav/toc'
import { DotBar } from '@/components/ui/DotBar'
import { VistaBlock } from '@/components/layout/VistaSwitch'
import { inferSiglasFromName } from '@/lib/entity/siglas'

// computeZ2Badges reads aria:patterns through i18n.t (no hook to suspend on):
// start that namespace with this chunk, long before the Z2 rows have data.
void i18n.loadNamespaces('aria')
// ────────────────────────────────────────────────────────────────────────────
// Layout — independent of the legacy constellation
// ────────────────────────────────────────────────────────────────────────────

// formatCompactUSD imported from @/lib/utils (uses the canonical
// exchange-rate helper). Local duplicate removed 2026-05-21.

// W4 (Day-5): the DB ships unaccented Spanish sector names ("Educacion").
// Display-level correction keyed on the exact API string — EN names and
// richer ES strings ("Medio Ambiente") pass through untouched. A DB-level
// `UPDATE sectors SET name_es` is Phase-2 (blast radius across every
// surface reading name_es). Do NOT rebind to SECTORS here: its nameEN
// ("Governance") regresses the API's editorial EN names ("Interior").
const ES_SECTOR_ACCENTS: Record<string, string> = {
  Educacion: 'Educación',
  Energia: 'Energía',
  Gobernacion: 'Gobernación',
  Tecnologia: 'Tecnología',
}
function fixEsSectorName(name: string | null | undefined): string {
  if (!name) return ''
  return ES_SECTOR_ACCENTS[name] ?? name
}


// ────────────────────────────────────────────────────────────────────────────
// ExploreCanvas
// ────────────────────────────────────────────────────────────────────────────

export interface ExploreCanvasProps {
  lang: 'en' | 'es'
  /** Notify parent when the user hovers / focuses something — drives the briefing panel. */
  onFocusChange?: (focus: Focus) => void
}

export function ExploreCanvas({ lang, onFocusChange }: ExploreCanvasProps) {
  const state = useExploreState()
  const dispatch = useExploreDispatch()
  const focus = useCurrentFocus(state)

  // Notify parent when focus changes
  useEffect(() => {
    onFocusChange?.(focus)
  }, [focus, onFocusChange])

  // Notify parent on hover too
  useEffect(() => {
    if (state.hover) {
      // Synthesize a focus-shaped event for the panel.
      onFocusChange?.({ ...focus })
    }
    // We re-fire focus on hover so the panel can flicker between hover preview and focus persistent
    // Actually — the panel reads state.hover directly via context. So no-op here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hover])

  // Keyboard shortcuts:
  //   Esc / Backspace / b → pop one level
  //   0 / Home → reset to system view
  // All ignored when typing into an input or textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // Cmd/Ctrl+K is the search shortcut — owned by SearchOverlay; skip here.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return

      if (e.key === 'Escape' || e.key === 'Backspace' || e.key.toLowerCase() === 'b') {
        e.preventDefault()
        dispatch({ type: 'pop-focus' })
      } else if (e.key === '0' || e.key === 'Home') {
        e.preventDefault()
        dispatch({ type: 'reset-to-system' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return (
    <div
      className="w-full"
      style={{
        background: 'var(--color-background, #faf9f6)',
        height: '100%',
      }}
    >
      {/* Floating Back button removed (2026-05-21): each Z-level now
          renders its own breadcrumb (BREAKDOWN · HEALTH · IMSS · ...) via
          ZBreadcrumb, which covers wayfinding. Esc-key pop still works
          via the keyboard listener; the breadcrumb shows "ESC ↩" at
          the right edge as a passive affordance. */}

      {/* Z0 HTML overlay — El Panorama sector intelligence card grid */}
      {focus.kind === 'system' && (
        <Z0Panel lang={lang} dispatch={dispatch} />
      )}

      {/* Z1 HTML overlay — editorial institution list replaces SVG bubble scatter */}
      {focus.kind === 'sector' && (
        <Z1Panel
          key={`z1panel-${focus.sectorId}`}
          sectorId={focus.sectorId}
          sectorCode={focus.sectorCode}
          lang={lang}
          dispatch={dispatch}
        />
      )}

      {/* Z2 HTML overlay — vendor ranked list replaces SVG bubble scatter */}
      {focus.kind === 'institution' && (
        <Z2Panel
          key={`z2panel-${focus.institutionId}`}
          institutionId={focus.institutionId}
          institutionName={focus.institutionName}
          lang={lang}
          dispatch={dispatch}
        />
      )}

      {/* Z3 HTML overlay — contract list replaces SVG scatter */}
      {(focus.kind === 'vendor' || focus.kind === 'contract') && (() => {
        const parentVendor = focus.kind === 'vendor'
          ? focus
          : [...state.stack].reverse().find((f): f is Extract<Focus, { kind: 'vendor' }> => f.kind === 'vendor')
        if (!parentVendor) return null
        // Walk the focus stack for breadcrumb ancestry. Z3 can be reached
        // via Z0→Z1→Z2→Z3 (full ancestry), Z0→Z1→Z3 (search shortcut, no
        // institution), or deep-link (no ancestry). All three render
        // cleanly — missing crumbs just disappear.
        const ancestrySector = [...state.stack].reverse().find(
          (f): f is Extract<Focus, { kind: 'sector' }> => f.kind === 'sector',
        ) ?? null
        const ancestryInstitution = [...state.stack].reverse().find(
          (f): f is Extract<Focus, { kind: 'institution' }> => f.kind === 'institution',
        ) ?? null
        return (
          <Z3Panel
            key={`z3panel-${parentVendor.vendorId}`}
            vendorId={parentVendor.vendorId}
            vendorName={parentVendor.vendorName}
            ancestrySectorId={ancestrySector?.sectorId ?? null}
            ancestrySectorCode={ancestrySector?.sectorCode ?? null}
            ancestryInstitutionId={ancestryInstitution?.institutionId ?? null}
            ancestryInstitutionName={ancestryInstitution?.institutionName ?? null}
            ancestryInstitutionSiglas={ancestryInstitution?.institutionSiglas ?? null}
            lang={lang}
            dispatch={dispatch}
            highlightContractId={focus.kind === 'contract' ? focus.contractId : null}
          />
        )
      })()}

      {/* Z4 HTML overlay — contract drawer slides in from the right when
          focus is on a specific contract. Z3 stays visible behind it so
          the constellation of sibling contracts is never lost. */}
      <AnimatePresence>
        {focus.kind === 'contract' && (
          <Z4Drawer
            key={`z4drawer-${focus.contractId}`}
            contractId={focus.contractId}
            lang={lang}
            dispatch={dispatch}
            sectorAccent={(() => {
              const s = [...state.stack].reverse().find((f): f is Extract<Focus, { kind: 'sector' }> => f.kind === 'sector')
              return s ? SECTOR_COLORS[s.sectorCode] ?? '#64748b' : '#64748b'
            })()}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// Z-level sort-key types (all levels now use inline mode literals)
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Z0Panel — «El Índice» (elmapa-2026-10-05 § Z0)
//
// The 12 sectors as one ranked ledger (NYT Upshot ranked-table grammar): rank ·
// name + tag · share-of-total DotBar · spend · critical share · the 3 biggest
// buyers as doors. A sector row drills to Z1; a door drills straight to Z2.
// Replaced the treemap, whose small cells clipped their own labels (Technology
// cell 92 px wide) and which restated /sectors' Marimekko.
// ────────────────────────────────────────────────────────────────────────────

// Sector lines (rank-checked against the live rows) live in ./sectorLines.

// rank · sector · share · spend · critical · doors (desktop ≥ lg)
const Z0_GRID = 'lg:grid-cols-[32px_minmax(180px,1fr)_112px_128px_72px_minmax(580px,2.1fr)]'

function Z0Panel({
  lang,
  dispatch,
}: {
  lang: 'en' | 'es'
  dispatch: ReturnType<typeof useExploreDispatch>
}) {
  const [mode, setMode] = useState<'spend' | 'risk'>('spend')

  // Reduced-motion gate: opacity-only arrival, snap layout.
  const prefersReducedMotion = useReducedMotion() ?? false
  const trans = (duration: number, delay = 0) =>
    prefersReducedMotion
      ? T.none
      : { duration, delay, ease: Z_EASE }

  const bandVariants: Variants = {
    hidden: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    visible: (custom: number) => ({
      opacity: 1,
      y: 0,
      transition: trans(Z_BAND_S, custom * Z_CASCADE_STEP_S),
    }),
  }
  const listVariants: Variants = {
    hidden: {},
    visible: { transition: prefersReducedMotion ? { staggerChildren: 0 } : { delayChildren: Z_TREEMAP_DELAY_S, staggerChildren: 0.04 } },
  }
  const cellVariants: Variants = {
    hidden: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: trans(Z_BAND_S) },
  }
  const layoutTransition = prefersReducedMotion
    ? T.none
    : { duration: Z_LAYOUT_DURATION_S, ease: Z_EASE }

  const { data: treemapData, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['explore', 'z0-treemap'],
    queryFn: () => sectorApi.getTreemap(),
    staleTime: 30 * 60 * 1000,
  })

  const sectors = treemapData?.sectors ?? []
  const totalSpend = treemapData?.total_value_mxn ?? 0
  const totalCritical = treemapData?.total_critical_count ?? 0
  // The edition's one count (face spec F2) — not the treemap rows' sum.
  const { data: dataQuality } = useQuery(DATA_QUALITY_QUERY)
  const analyzedCount = dataQuality?.analyzed_contracts
  const rows = useMemo(
    () => [...sectors].sort((a, b) => (mode === 'risk'
      ? b.critical_share_pct - a.critical_share_pct || b.total_value_mxn - a.total_value_mxn
      : b.total_value_mxn - a.total_value_mxn)),
    [sectors, mode],
  )

  const drillSector = (sectorId: number, sectorCode: string) =>
    dispatch({ type: 'drill-into-sector', sectorId, sectorCode })
  // A door is two drills: the reducer truncates the stack per level, so the
  // crumb trail reads Reparto ▸ Sector ▸ Institución exactly as if walked.
  const openDoor = (sectorId: number, sectorCode: string, institutionId: number, institutionName: string) => {
    dispatch({ type: 'drill-into-sector', sectorId, sectorCode })
    dispatch({ type: 'drill-into-institution', institutionId, institutionName })
  }

  // ── Headline / kicker strings ────────────────────────────────────────────
  const isEs = lang === 'es'
  const headline = isEs ? 'Cómo reparte México su gasto' : 'How Mexico divides'
  // Weekend F5: the spend comes from the treemap payload (was a typed 9.9).
  const spendT = totalSpend > 0 ? (totalSpend / 1e12).toLocaleString(isEs ? 'es-MX' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null
  const headlineSub = spendT
    ? (isEs ? `${spendT} billones de pesos` : `${spendT} trillion pesos`)
    : isLoading ? ' ' : (isEs ? 'cifra no disponible' : 'figure unavailable')
  const colHeads = isEs
    ? ['Sector', 'Parte', 'Gasto', 'Críticos', 'Mayores compradores']
    : ['Sector', 'Share', 'Spend', 'Critical', 'Biggest buyers']

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      data-explore-panel="true"
      className="absolute inset-0 z-[5] flex flex-col"
      style={{ background: 'var(--color-background)', overflow: 'hidden' }}
    >
      {/* Masthead — plate-led compact front page (face spec § 3.5, § 7):
          strip `I · EL REPARTO · 2002–2026` + edition, h1 30/28/24, the
          compass line as children, spend · critical · sort as the ear. */}
      <motion.div
        variants={bandVariants}
        custom={0}
        className={`${Z_GUTTER} pb-3 flex-shrink-0`}
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <PageMasthead
          variant="portada-compact"
          route="/mapa"
          kicker={isEs ? 'EL REPARTO' : 'THE SPOILS'}
          range={`2002–${DATA_CUT_YEAR}`}
          titlePending={isLoading}
          title={<>
            {headline}{' '}
            <span style={{ fontWeight: 600, color: 'var(--color-accent-text)' }}>{headlineSub}</span>
          </>}
          ear={
            <div className="flex w-full flex-row items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:gap-2">
            <div className={`flex items-baseline gap-5 justify-end whitespace-nowrap${treemapData ? '' : ' invisible'}`} aria-hidden={treemapData ? undefined : true}>
              <div className="text-right hidden sm:block">
                <div
                  className="font-mono tabular-nums text-text-primary leading-tight"
                  style={{ fontSize: 18, fontWeight: 700 }}
                >
                  {formatCompactMXN(totalSpend)}
                </div>
                <div className="ct-sc text-[13px] text-text-muted whitespace-nowrap">
                  {isEs ? 'gasto federal' : 'federal spend'}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-mono tabular-nums leading-tight"
                  style={{ fontSize: 18, fontWeight: 700, color: RISK_TEXT_COLORS.critical }}
                >
                  {formatNumber(totalCritical)}
                </div>
                <div className="ct-sc text-[13px] text-text-muted whitespace-nowrap">
                  {isEs ? 'contratos críticos' : 'critical contracts'}
                </div>
              </div>
            </div>
              {/* «Vínculos · Cifras» beside the sort (it used to be a band above the map). */}
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <ZSortToggle
                  modes={['spend', 'risk'] as const}
                  active={mode}
                  onChange={setMode}
                  riskMode="risk"
                  labelFor={(m) => isEs ? (m === 'spend' ? 'ORDENAR · GASTO' : 'RIESGO') : (m === 'spend' ? 'SORT · SPEND' : 'RISK')}
                />
                <VistaBlock />
              </div>
            </div>
          }
        >
          {/* Compass line (NYT Upshot in-header instruction). The count is the
              edition's one count, `analyzed_contracts` — dropped while loading,
              never a typed fallback; its slot is reserved (Weekend D1, CLS).
              One line at 760 px: the ⌘K hint lives on the Search chip. */}
          <p
            className="font-serif hidden sm:block"
            style={{
              fontSize: 12,
              letterSpacing: 0,
              color: 'var(--color-text-secondary)',
              marginTop: 4,
              maxWidth: 'none',
              minHeight: '1lh',
            }}
          >
            {sectors.length > 0 && glueDashes(isEs
              ? `${typeof analyzedCount === 'number' ? `${formatNumber(analyzedCount)} contratos con importe válido · ` : ''}${sectors.length} sectores — abra un sector o uno de sus mayores compradores`
              : `${typeof analyzedCount === 'number' ? `${formatNumber(analyzedCount)} contracts with a valid amount · ` : ''}${sectors.length} sectors — open a sector or one of its biggest buyers`)}
          </p>
        </PageMasthead>
      </motion.div>

      {/* The ledger — its own band in the entrance cascade */}
      <motion.div
        variants={bandVariants}
        custom={2}
        className={`flex-1 min-h-0 overflow-y-auto ${Z_GUTTER} pb-12`}
      >
        {isLoading && (
          <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {isEs ? 'cargando...' : 'loading...'}
          </div>
        )}
        {!isLoading && isError && !treemapData && (
          <div role="alert" className="py-12 text-center">
            <p className="font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {isEs ? 'No se pudo cargar el reparto del gasto: el servidor no respondió.' : 'We could not load the breakdown. The server did not respond.'}
            </p>
            <button type="button" onClick={() => refetch()} disabled={isFetching}
              className="mt-4 inline-flex min-h-11 items-center px-4 border border-border font-serif text-[12px] text-text-primary hover:border-border-hover">
              {isFetching ? (isEs ? 'Reintentando…' : 'Retrying…') : (isEs ? 'Reintentar' : 'Retry')}
            </button>
          </div>
        )}
        {!isLoading && rows.length > 0 && (
          <>
            {/* the sector's money here = contracts classed in it; a drill's headline = its institutions' spend (owner 2026-10-30) */}
            <p className="pt-2 font-mono text-[11px] text-text-muted">
              {isEs ? 'Gasto: contratos clasificados en cada sector (Vínculos suma por el sector de la dependencia compradora)' : "Spend: contracts classed in each sector (Vínculos sums by the buying agency's sector)"}
            </p>
            <div
              aria-hidden="true"
              className={`hidden lg:grid ${Z0_GRID} gap-x-4 items-end py-2 ct-sc text-[13px] text-text-muted`}
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span />
              <span>{colHeads[0]}</span>
              <span>{colHeads[1]}</span>
              <span className="text-right">{colHeads[2]}</span>
              <span className="text-right">{colHeads[3]}</span>
              <span className="pl-2">{colHeads[4]}</span>
            </div>
            <motion.ol variants={listVariants} role="list">
              {rows.map((s, i) => {
                const color = SECTOR_COLORS[s.sector_code] ?? '#64748b'
                const label = isEs ? fixEsSectorName(s.sector_name_es) : s.sector_name_en
                const spendPct = totalSpend > 0 ? (s.total_value_mxn / totalSpend) * 100 : 0
                const editorial = sectorLine(s.sector_code, sectors, isEs)
                const critInk = riskInk(RISK_COLORS[getRiskLevelFromScore(s.critical_share_pct / 100)])
                const critColor = getRiskLevelFromScore(s.critical_share_pct / 100) === 'low' ? 'var(--color-text-muted)' : critInk
                const top3 = s.top_institutions.slice(0, 3)
                const sigMap = disambiguateSiglas(top3)
                return (
                  <motion.li
                    key={s.sector_id}
                    layout
                    layoutId={`explore-cell-${s.sector_id}`}
                    variants={cellVariants}
                    transition={{ layout: layoutTransition }}
                    onClick={() => drillSector(s.sector_id, s.sector_code)}
                    className={`group relative grid grid-cols-[28px_minmax(0,1fr)_auto] ${Z0_GRID} gap-x-4 gap-y-2 items-center py-1.5 cursor-pointer hover:bg-background-elevated focus-within:bg-background-elevated`}
                    style={{ borderBottom: '1px solid var(--color-border)', maxWidth: 'none', minHeight: 52 }}
                  >
                    {/* 4 px sector rule on hover / focus */}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      style={{ background: color, marginLeft: -12 }}
                    />
                    <span className="font-mono text-[11px] tabular-nums text-text-muted self-start pt-1.5 lg:self-center lg:pt-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 lg:col-span-2">
                      <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); drillSector(s.sector_id, s.sector_code) }}
                        className={`text-left rounded-sm ${Z_FOCUS_RING}`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        aria-label={isEs
                          ? `${label}, ${formatCompactMXN(s.total_value_mxn)}, ${spendPct.toFixed(1)}% del gasto federal — abrir sector`
                          : `${label}, ${formatCompactMXN(s.total_value_mxn)}, ${spendPct.toFixed(1)}% of federal spend — open sector`}
                      >
                        <span
                          className="block text-text-primary leading-[1.1]"
                          style={{ fontFamily: 'var(--font-family-editorial)', fontSize: 'clamp(18px, 1.5vw, 20px)', fontWeight: 500 }}
                        >
                          {label}
                        </span>
                      </button>
                      <span className="hidden lg:flex items-center ml-auto w-[112px] flex-shrink-0">
                        <DotBar
                          value={spendPct}
                          max={100}
                          color={color}
                          ariaLabel={isEs ? `${spendPct.toFixed(1)}% del gasto federal` : `${spendPct.toFixed(1)}% of federal spend`}
                        />
                      </span>
                      </div>
                      {/* Whole sentence, never a one-line ellipsis: the tag runs
                          under the name and share tracks, clamped at 2 lines. */}
                      {editorial && (
                        <span className="block text-[12px] leading-4 text-text-secondary line-clamp-2">
                          {editorial}
                        </span>
                      )}
                      {/* share bar sits under the name below lg */}
                      <span className="flex lg:hidden items-center gap-2 mt-1.5">
                        <DotBar value={spendPct} max={100} color={color} />
                        <span className="font-mono text-[11px] tabular-nums text-text-muted">{spendPct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <span className="text-right self-start lg:self-center" title={`${formatCompactUSD(s.total_value_mxn)} · ${isEs ? `contratos clasificados en ${label}` : `contracts classed as ${label}`}`}>
                      <span className="block font-mono text-[14px] font-bold tabular-nums text-text-primary whitespace-nowrap">
                        {formatCompactMXN(s.total_value_mxn)}
                      </span>
                      <span className="hidden lg:block font-mono text-[11px] tabular-nums text-text-muted">{spendPct.toFixed(1)}%</span>
                      <span className="block lg:hidden font-mono text-[12px] tabular-nums" style={{ color: critColor }}>
                        {s.critical_share_pct.toFixed(1)}% {isEs ? 'crít.' : 'crit.'}
                      </span>
                    </span>
                    <span className="hidden lg:block text-right">
                      <span className="block font-mono text-[14px] font-bold tabular-nums" style={{ color: critColor }}>
                        {s.critical_share_pct.toFixed(1)}%
                      </span>
                      <span className="block font-mono text-[11px] text-text-muted">{isEs ? 'crít.' : 'crit.'}</span>
                    </span>
                    {/* Doors — in-surface drills to Z2 (not links: the dossier
                        exits stay the ZFooterLinks). */}
                    <span className="col-span-3 lg:col-span-1 grid grid-cols-3 gap-2 lg:pl-2 min-w-0">
                      {top3.map((inst) => {
                        const eff = sigMap.get(inst.institution_id) ?? null
                        const short = shortInstitutionLabel(inst.name, eff)
                        return (
                          <button
                            key={inst.institution_id}
                            type="button"
                            title={inst.name}
                            onClick={(e) => { e.stopPropagation(); openDoor(s.sector_id, s.sector_code, inst.institution_id, inst.name) }}
                            className={`flex items-center gap-1.5 min-h-11 lg:min-h-8 py-1 px-2 min-w-0 rounded-sm hover:bg-background-card transition-colors ${Z_FOCUS_RING}`}
                            style={{ border: '1px solid var(--color-border)', background: 'var(--color-background)', cursor: 'pointer' }}
                            aria-label={isEs
                              ? `${short}, ${inst.share_pct.toFixed(1)}% del gasto de ${label} — abrir institución`
                              : `${short}, ${inst.share_pct.toFixed(1)}% of ${label} spend — open institution`}
                          >
                            <span className="hidden sm:inline-flex">
                              <InstitutionLogo
                                logoSrc={logoSrcForSiglas(eff, inst.name)}
                                acronym={short}
                                fallbackBg={color}
                                fallbackColor="#ffffff"
                              />
                            </span>
                            <span className="font-mono text-[12px] font-bold text-text-primary min-w-0 leading-tight [overflow-wrap:normal]">{short}</span>
                            <span className="ml-auto font-mono text-[12px] tabular-nums text-text-muted flex-shrink-0">{inst.share_pct.toFixed(0)}%</span>
                          </button>
                        )
                      })}
                    </span>
                  </motion.li>
                )
              })}
            </motion.ol>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}


/**
 * Editorial title-case for institution / vendor names.
 *
 * COMPRANET stores most institutions as ALL-CAPS — perfectly fine for a
 * spreadsheet, terrible for editorial typography. We normalize at render
 * time so the data layer stays untouched but the eye reads natural
 * Spanish: "Instituto Mexicano del Seguro Social" instead of
 * "INSTITUTO MEXICANO DEL SEGURO SOCIAL".
 *
 * Rules:
 *  - Strings that already have mixed case are returned untouched.
 *  - Spanish connectives (de / del / la / y / etc.) lowercase unless
 *    they're the first word.
 *  - Known siglas / corporate-form tokens stay uppercase: S.A., C.V.,
 *    A.C., S.C., II, III, IV, etc. plus any pre-existing all-caps
 *    siglas the fallback map already knows (IMSS, ISSSTE, SCT...).
 *  - Hyphenated tokens get each segment cased independently
 *    (IMSS-Bienestar reads correctly).
 *  - "México" / accents preserved from the source.
 *
 * NOT a truncator. Names of any length are returned in full — the
 * caller's layout is responsible for wrapping.
 */
const LOWERCASE_CONNECTIVES = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'e', 'o', 'u', 'a',
  'para', 'por', 'al', 'con', 'sin', 'sobre', 'entre', 'desde',
])
const UPPERCASE_TOKENS = new Set([
  'S.A.', 'S.A', 'C.V.', 'C.V', 'S.A.B.', 'A.C.', 'A.C', 'S.C.', 'I.E.', 'S.N.C.',
  'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII',
])

function capitalizeWord(w: string): string {
  if (!w) return w
  // Preserve all-caps siglas already known to be acronyms (IMSS, etc.)
  if (UPPERCASE_TOKENS.has(w.toUpperCase())) return w.toUpperCase()
  // Hyphenated segments — capitalize each part
  if (w.includes('-')) {
    return w.split('-').map((seg) => capitalizeWord(seg)).join('-')
  }
  // Lowercase everything then uppercase first letter (handles accents correctly)
  const lower = w.toLowerCase()
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
}

function toEditorialCase(s: string | null | undefined): string {
  if (!s) return ''
  const trimmed = s.trim()
  if (!trimmed) return trimmed
  // If string already contains lowercase letters, assume it's already
  // properly cased — don't double-process it.
  if (/[a-záéíóúñü]/.test(trimmed)) return trimmed

  // Split keeping whitespace tokens so we can rejoin verbatim
  const tokens = trimmed.split(/(\s+)/)
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return tok
    // Preserve fully-uppercase corporate forms (S.A., A.C., etc.)
    if (UPPERCASE_TOKENS.has(tok.toUpperCase())) return tok.toUpperCase()
    const lower = tok.toLowerCase()
    // First non-space token always capitalized
    const isFirst = i === 0 || (i > 0 && tokens.slice(0, i).every((t) => /^\s+$/.test(t)))
    if (isFirst) return capitalizeWord(tok)
    if (LOWERCASE_CONNECTIVES.has(lower)) return lower
    return capitalizeWord(tok)
  }).join('')
}


// Spanish connective words we strip when generating initials from a name.
// Same list as toEditorialCase but ALL lowercase (caller has already lowercased).
const ACRONYM_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'e', 'o', 'u', 'a',
  'para', 'por', 'al', 'con', 'sin', 'sobre', 'entre', 'desde', 'sa', 'cv',
  'sc', 'ac', 'snc', 'sab',
])

/**
 * Generate a 3-5 char acronym from the FIRST LETTERS of significant words.
 * No truncation, no "..." — every institution gets a real chip.
 *
 * Examples:
 *   "Instituto Nacional de Cardiología Ignacio Chávez"  → INCIC
 *   "Hospital Regional de Alta Especialidad del Bajío"  → HRAEB
 *   "Universidad Autónoma Metropolitana"                → UAM
 *   "Comisión Federal de Electricidad"                  → CFE
 *   "BC-Comisión Estatal de Servicios Públicos"          → BCCESP
 *   "Diconsa, S.A. de C.V."                              → DICONSA  (whole single word kept)
 *
 * Rules:
 *  - State-code prefix kept as a single token: "BC-Comisión ..." → starts BC + ...
 *  - Punctuation stripped
 *  - Connective Spanish words filtered out
 *  - If the result is < 2 chars, fall back to the first 4 letters of the cleaned name
 *  - Capped at 6 chars so the 22x22 chip stays readable
 */
function acronymFromName(name: string): string {
  if (!name) return '—'
  // Normalize: strip accents for letter extraction, but keep state prefix
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[,.;:()&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return '—'

  // Honor state-code prefix as a unit (BC-, OAX-, PUE-, ...)
  const stateMatch = stripped.match(/^([A-Z]{2,4})-/)
  const statePrefix = stateMatch ? stateMatch[1] : ''
  const body = stateMatch ? stripped.slice(stateMatch[0].length) : stripped

  // If the whole body is one word (e.g. "Diconsa", "Pemex"), return it
  // uppercased as the chip — that IS the brand name.
  const tokens = body.split(' ').filter(Boolean)
  if (tokens.length === 1) {
    const single = tokens[0].toUpperCase()
    return statePrefix ? `${statePrefix}${single.slice(0, 6 - statePrefix.length)}` : single.slice(0, 6)
  }

  // Multi-word: take first letter of each non-stopword token
  const initials = tokens
    .filter((t) => !ACRONYM_STOPWORDS.has(t.toLowerCase()))
    .map((t) => t[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .join('')

  const acronym = statePrefix + initials
  if (acronym.length >= 2) return acronym.slice(0, 6)

  // Last resort: first 4 letters of body, uppercased. Still no ellipsis.
  return (statePrefix + body.replace(/\s/g, '').slice(0, 4 - statePrefix.length)).toUpperCase()
}

/**
 * Short institution label resolved in priority order:
 *   1. siglas from the API (truth)
 *   2. NAME_TO_SIGLAS_FALLBACK map (manually curated common cases)
 *   3. acronymFromName() (auto-generated initials — never returns "...")
 */
function shortInstitutionLabel(name: string, siglas?: string | null): string {
  if (siglas && siglas.trim()) return siglas.trim().toUpperCase()
  const inferred = inferSiglasFromName(name)
  if (inferred) return inferred
  return acronymFromName(name)
}

// Official logos in frontend/public/logos/ (sources + licenses in SOURCES.md).
// Map siglas (as shown on the chip) -> file name incl. extension. Anything
// unmapped renders the monogram chip. Aliases cover renames (SCT -> SICT)
// and PEMEX subsidiaries (same parent mark).
const LOGO_FILE_MAP: Record<string, string> = {
  AEM: 'aem.svg',
  AICM: 'aicm.jpg',
  'ALIMENTACION-BIENESTAR': 'alimentacion-bienestar.png',
  ANAM: 'anam.png',
  ASA: 'asa.svg',
  'BANCO-BIENESTAR': 'banco-bienestar.png',
  BANCOMEXT: 'bancomext.png',
  BANJERCITO: 'banjercito.svg',
  BANOBRAS: 'banobras.png',
  BIENESTAR: 'bienestar.png',
  CANAL22: 'canal22.svg',
  CAPUFE: 'capufe.svg',
  CENAM: 'cenam.jpg',
  CFE: 'cfe.svg',
  CHAPINGO: 'chapingo.png',
  CIDE: 'cide.png',
  CIIT: 'ciit.svg',
  CJEF: 'cjef.png',
  CMM: 'cmm.svg',
  CNBV: 'cnbv.svg',
  CNH: 'cnh.png',
  CNI: 'cni.svg',
  COFECE: 'cofece.svg',
  COFEPRIS: 'cofepris.jpg',
  COFETEL: 'cofetel.jpg',
  COLBACH: 'colbach.svg',
  COLEF: 'colef.jpg',
  CONACYT: 'conacyt.png',
  CONADIS: 'conadis.png',
  CONAFOR: 'conafor.png',
  CONAGUA: 'conagua.svg',
  CONALEP: 'conalep.svg',
  CONALITEG: 'conaliteg.jpg',
  CONAMER: 'conamer.jpg',
  CONANP: 'conanp.png',
  CONAPESCA: 'conapesca.png',
  CONAPRED: 'conapred.png',
  CONAVI: 'conavi.png',
  CONEVAL: 'coneval.svg',
  CONSAR: 'consar.jpg',
  CRE: 'cre.png',
  CULTURA: 'cultura.png',
  DICONSA: 'diconsa.png',
  DIF: 'dif.svg',
  FCE: 'fce.svg',
  FGR: 'fgr.png',
  FIRCO: 'firco.png',
  FND: 'fnd.png',
  FONART: 'fonart.png',
  FONATUR: 'fonatur.svg',
  GN: 'gn.png',
  HGM: 'hgm.png',
  HIM: 'him.png',
  IFE: 'ife.svg',
  IFT: 'ift.svg',
  IMCINE: 'imcine.png',
  IMER: 'imer.png',
  IMJUVE: 'imjuve.png',
  IMSS: 'imss.svg',
  'IMSS-B': 'imss-b.svg',
  IMSSBIENESTAR: 'imss-b.svg',
  IMTA: 'imta.png',
  INAI: 'inai.png',
  INALI: 'inali.png',
  INAPAM: 'inapam.png',
  INCMNSZ: 'incmnsz.png',
  INDAABIN: 'indaabin.png',
  INDEP: 'indep.png',
  INEA: 'inea.png',
  INECC: 'inecc.svg',
  INEE: 'inee.svg',
  INEGI: 'inegi.png',
  INFONACOT: 'infonacot.svg',
  INIFAP: 'inifap.jpg',
  INIFED: 'inifed.png',
  INM: 'inm.png',
  INMEGEN: 'inmegen.jpg',
  INNN: 'innn.png',
  INP: 'inp.png',
  INPER: 'inper.jpg',
  INPI: 'inpi.png',
  INSABI: 'insabi.svg',
  INSP: 'insp.jpg',
  INSUS: 'insus.png',
  IPAB: 'ipab.png',
  IPN: 'ipn.png',
  ISSFAM: 'issfam.png',
  ISSSTE: 'issste.png',
  LICONSA: 'liconsa.svg',
  LOTENAL: 'lotenal.svg',
  MEXICANA: 'mexicana.svg',
  MUJERES: 'mujeres.png',
  NAFIN: 'nafin.svg',
  NOTIMEX: 'notimex.png',
  PA: 'pa.png',
  PEMEX: 'pemex.svg',
  'PEMEX-EP': 'pemex.svg',
  'PEMEX-R': 'pemex.svg',
  POLICIAFEDERAL: 'policiafederal.png',
  PROFECO: 'profeco.svg',
  PROFEPA: 'profepa.png',
  PRONOSTICOS: 'pronosticos.svg',
  RADIOEDUCACION: 'radioeducacion.png',
  SADER: 'sader.png',
  SALUD: 'ssa.png',
  SAT: 'sat.svg',
  SCT: 'sct.png',
  SE: 'se.png',
  SECIHTI: 'secihti.png',
  SECTUR: 'sectur.png',
  SEDATU: 'sedatu.png',
  SEDENA: 'sedena.png',
  SEDESOL: 'sedesol.png',
  SEGALMEX: 'segalmex.svg',
  SEGOB: 'segob.png',
  SEMAR: 'semar.png',
  SEMARNAT: 'semarnat.png',
  SENASICA: 'senasica.png',
  SENER: 'sener.png',
  SEP: 'sep.png',
  SEPOMEX: 'sepomex.png',
  SESNSP: 'sesnsp.png',
  SFP: 'sfp.png',
  SGM: 'sgm.png',
  SHCP: 'shcp.png',
  SHF: 'shf.svg',
  SICT: 'sict.png',
  SPR: 'spr.svg',
  SRE: 'sre.png',
  SSA: 'ssa.png',
  SSF: 'ssf.png',
  SSPC: 'sspc.png',
  STPS: 'stps.png',
  TECNM: 'tecnm.png',
  TELECOMM: 'telecomm.jpg',
  TFJA: 'tfja.png',
  TRENMAYA: 'trenmaya.svg',
  UAM: 'uam.svg',
  UNADM: 'unadm.png',
  XEIPN: 'xeipn.png',
}

function logoSrcForSiglas(siglas: string | null | undefined, name?: string): string | null {
  // 'ALIMENTACIÓN PARA EL BIENESTAR' resolves to siglas BIENESTAR (the Secretaría) — keep its own mark.
  if (name && /^ALIMENTACI[ÓO]N PARA EL BIENESTAR/i.test(name.trim())) return `/logos/${LOGO_FILE_MAP['ALIMENTACION-BIENESTAR']}`
  if (!siglas) return null
  const file = LOGO_FILE_MAP[siglas.trim().toUpperCase()]
  return file ? `/logos/${file}` : null
}

// Resolve effective siglas: API value first, else infer from name. Used
// for both label display and logo lookup so an institution missing a
// DB siglas can still pick up its known logo file.
function effectiveSiglas(name: string, siglas: string | null | undefined): string | null {
  if (siglas && siglas.trim()) return siglas.trim().toUpperCase()
  return inferSiglasFromName(name)
}

// W3a (Day-5): two distinct institutions can ship the SAME API siglas
// (DB-verified: ids 311/314 both "PEMEX"; 1327/3785 both "DICONSA"). On a
// collision inside one rendered list, re-resolve the colliders by name
// through NAME_TO_SIGLAS_FALLBACK (PEMEX-EP / PEMEX-R / BIENESTAR are
// curated there) — disambiguate the label, never merge the rows.
function disambiguateSiglas(
  insts: ReadonlyArray<{ institution_id: number; name: string; siglas?: string | null }>,
): Map<number, string | null> {
  const eff = new Map<number, string | null>()
  const counts = new Map<string, number>()
  for (const i of insts) {
    const s = effectiveSiglas(i.name, i.siglas)
    eff.set(i.institution_id, s)
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  for (const i of insts) {
    const s = eff.get(i.institution_id)
    if (s && (counts.get(s) ?? 0) > 1) {
      const byName = inferSiglasFromName(i.name)
      if (byName && byName !== s) eff.set(i.institution_id, byName)
    }
  }
  return eff
}

// 22×22 institution logo. Shows the official logo from /logos/<file>
// if mapped via LOGO_FILE_MAP, otherwise a 22×22 monogram chip. The full
// siglas always sit beside the chip, so the chip carries one letter at the
// 11 px floor (elmapa § 2 D2) instead of a 7–9 px acronym.
function InstitutionLogo({
  logoSrc,
  acronym,
  fallbackBg,
  fallbackColor,
}: {
  logoSrc: string | null
  acronym: string
  fallbackBg: string
  fallbackColor: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  // Wide wordmarks widen the box (cap 36 px) instead of shrinking to an unreadable sliver; the image stays object-fit: contain.
  const [ratio, setRatio] = useState(1)
  const showImg = logoSrc && !imgFailed
  const chipText = acronym.slice(0, 1)
  const fontSize = 11
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center rounded-sm overflow-hidden"
      style={{
        width: showImg ? Math.min(36, Math.max(22, Math.round(18 * ratio) + 4)) : 22,
        height: 22,
        background: showImg ? '#ffffff' : fallbackBg,
        padding: showImg ? 2 : 0,
      }}
      aria-hidden="true"
    >
      {showImg ? (
        <img
          src={logoSrc}
          alt=""
          onError={() => setImgFailed(true)}
          onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h) setRatio(w / h) }}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          loading="lazy"
        />
      ) : (
        <span
          className="font-mono"
          style={{
            fontSize,
            fontWeight: 800,
            color: fallbackColor,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          {chipText}
        </span>
      )}
    </span>
  )
}


// D15 § 1: register rows are <li>; the site-wide 68ch measure on `main li`
// (index.css, unlayered — beats any Tailwind max-w utility) capped every row at
// ~686 px and squeezed Z1's name column to one word per line. Rows are not prose.
// elmapa § 2 D2: off-screen rows skip layout/paint (Z2 can reach ~270 rows).
const REGISTER_LI_STYLE: React.CSSProperties = { maxWidth: 'none', contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' }

// D15 judge 1: one track list per register, shared by its column header and
// its rows, so every header label sits over its own column (the flex header
// let wide labels run into their neighbours: "INSTITUTIONFULL NAME").
// Z1 (elmapa § Z1): rank · logo+siglas · name (+ contracts/DA agate) · HR bar · spend · risk
const Z1_GRID = '40px 96px minmax(0, 1fr) 160px 140px 64px'

// D15 § 2: RISK_COLORS are FILL hues — as type they fail AA on the page paper
// (critical 3.57:1, high 2.04:1). Any risk-coloured number, label or glyph
// routes through this to its ink twin (critical red-700; high/medium amber-800,
// which also clear 4.5:1 on the #faf9f6 page where RISK_TEXT_COLORS.high does not).
// Fills, bars, dots and rails keep RISK_COLORS.
function riskInk(color: string): string {
  if (color === RISK_COLORS.critical) return RISK_TEXT_COLORS.critical
  if (color === RISK_COLORS.high) return RISK_INK_ON_PLATE.high
  if (color === RISK_COLORS.medium) return RISK_INK_ON_PLATE.medium
  return color
}

function Z1Panel({
  sectorId,
  sectorCode,
  lang,
  dispatch,
}: {
  sectorId: number
  sectorCode: string
  lang: 'en' | 'es'
  dispatch: ReturnType<typeof useExploreDispatch>
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['explore', 'z1', sectorId],
    queryFn: () => atlasApi.getSectorInstitutionsSpatial({ sectorId, limit: 60 }),
    enabled: sectorId > 0 && sectorId <= 12,
    staleTime: 10 * 60 * 1000,
  })

  const sectorAccent = SECTOR_COLORS[sectorCode] ?? '#64748b'
  const institutions = data?.institutions ?? []
  // D15 § 3: the endpoint returns the 60 largest-by-spend rows (≥ 50 contracts);
  // the sector is every institution assigned to it. Shares, the headline and
  // the pull line are of the SECTOR, never of the loaded rows.
  const loadedSpend = institutions.reduce((s, i) => s + i.total_amount_mxn, 0)
  const totalSectorSpend = Math.max(data?.sector_total_value_mxn ?? 0, loadedSpend)
  const sectorInstCount = Math.max(data?.sector_institution_count ?? 0, institutions.length)
  const coverPct = totalSectorSpend > 0 ? Math.round((loadedSpend / totalSectorSpend) * 100) : 0
  const isPartial = sectorInstCount > institutions.length
  const sectorName = lang === 'es' ? fixEsSectorName(data?.sector_name_es) || sectorCode : (data?.sector_name_en ?? sectorCode)

  // Editorial dek: top-3 concentration finding
  const top3Share = institutions.slice(0, 3).reduce((s, i) => s + i.total_amount_mxn, 0)
  const top3Pct = totalSectorSpend > 0 ? Math.round((top3Share / totalSectorSpend) * 100) : 0
  const top1 = institutions[0]
  const top1Pct = top1 && totalSectorSpend > 0 ? Math.round((top1.total_amount_mxn / totalSectorSpend) * 100) : 0
  // Σ ranks 2–10 — the pull-line's "more than the rest combined" guard input.
  const restTop10Pct = totalSectorSpend > 0
    ? Math.round((institutions.slice(1, 10).reduce((s, i) => s + i.total_amount_mxn, 0) / totalSectorSpend) * 100)
    : 0

  const [mode, setMode] = useState<'spend' | 'risk'>('spend')

  const prefersReducedMotion = useReducedMotion() ?? false
  const bandVariants = useBandVariants(prefersReducedMotion)
  const layoutTransition = prefersReducedMotion ? T.none : { duration: Z_LAYOUT_DURATION_S, ease: Z_EASE }

  // Sorted institutions — full list, no truncation. The treemap was killed
  // here (Z1 has 60 entities — too many for a glance treemap; smaller cells
  // collapse to indistinguishable squares). Register form puts every name
  // on screen with its spend bar + risk pill — the journalist can scan the
  // entire sector in one scroll.
  const sortedInstitutions = useMemo(() => {
    return [...(data?.institutions ?? [])].sort((a, b) =>
      mode === 'risk'
        ? (b.risk ?? 0) - (a.risk ?? 0) || b.total_amount_mxn - a.total_amount_mxn
        : b.total_amount_mxn - a.total_amount_mxn
    )
  }, [data?.institutions, mode])


  // Risk-tier shelves. When sorted by RISK, group by tier. When sorted by
  // SPEND, shelves dissolve to a flat ranked list (matching Z2's canon).
  const useShelf = mode === 'risk'
  const isMobile = useIsMobile()
  // Canonical thresholds via getRiskLevelFromScore (hard rule #2).
  const shelfCritical = useShelf ? sortedInstitutions.filter((i) => getRiskLevelFromScore(i.risk ?? 0) === 'critical') : []
  const shelfHigh     = useShelf ? sortedInstitutions.filter((i) => getRiskLevelFromScore(i.risk ?? 0) === 'high') : []
  const shelfMedium   = useShelf ? sortedInstitutions.filter((i) => getRiskLevelFromScore(i.risk ?? 0) === 'medium') : []
  const shelfRoutine  = useShelf ? sortedInstitutions.filter((i) => getRiskLevelFromScore(i.risk ?? 0) === 'low') : sortedInstitutions

  const crumbs: CrumbSegment[] = [
    { label: lang === 'en' ? 'Breakdown' : 'Reparto', onClick: () => dispatch({ type: 'reset-to-system' }) },
    { label: sectorName, sectorCode },
  ]

  return (
    <div
      className="absolute inset-0 z-[5] overflow-hidden flex flex-col"
      data-explore-panel="true"
      style={{ background: 'var(--color-background)', top: 0 }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        className="absolute inset-0 flex flex-col max-sm:overflow-y-auto max-sm:scroll-pt-28"
      >
        {/* Breadcrumb — replaces the "Z1 · INSTITUTIONS" debug kicker */}
        <ZBreadcrumb
          segments={crumbs}
          lang={lang}
          controls={
            <ZSortToggle
              modes={['spend', 'risk'] as const}
              active={mode}
              onChange={setMode}
              riskMode="risk"
              labelFor={(m) => lang === 'en' ? m.toUpperCase() : (m === 'spend' ? 'GASTO' : 'RIESGO')}
            />
          }
          actions={!isLoading && institutions.length > 0 && <>
            <ShareViewButton lang={lang} />
            <ZFooterLink compact href={`/sectors/${sectorId}`} lang={lang} />
          </>}
        />

        {/* Sector-color top rail — 4px slab that carries layoutId="explore-cell-${sectorId}"
            so framer-motion expands the Z0 sector cell into this rail on drill-in.
            The rectangle metaphor doesn't survive 60-entity scale, but the sector
            COLOR identity stays present at the top of every Z1 view. */}
        <motion.div
          layoutId={`explore-cell-${sectorId}`}
          transition={{ layout: layoutTransition }}
          style={{ height: 4, background: sectorAccent, flexShrink: 0 }}
          aria-hidden="true"
        />

        {/* Editorial header — kicker + headline + stat band */}
        <ZKickerBand
          custom={0}
          variants={bandVariants}
          kicker={lang === 'en' ? `§ INSIDE ${sectorName.toUpperCase()}` : `§ DENTRO DE ${sectorName.toUpperCase()}`}
          headline={
            lang === 'en'
              ? <>Who spends the <em style={{ fontStyle: 'normal', fontWeight: 800 }}>{isLoading ? '…' : formatCompactMXN(totalSectorSpend)}</em> in {sectorName}</>
              : <>Quién gasta los <em style={{ fontStyle: 'normal', fontWeight: 800 }}>{isLoading ? '…' : formatCompactMXN(totalSectorSpend)}</em> de {sectorName}</>
          }
          stat={
            isLoading
              ? '...'
              : `${lang === 'en' ? `Spending by ${sectorName} institutions` : `Gasto de las instituciones de ${sectorName}`} · ` + (isPartial
                ? (lang === 'en'
                  ? `${institutions.length} of ${formatNumber(sectorInstCount)} institutions shown · ${coverPct}% of the sector's spend · top 3 share ${top3Pct}%`
                  : `${institutions.length} de ${formatNumber(sectorInstCount)} instituciones · ${coverPct}% del gasto del sector · las 3 mayores con el ${top3Pct}%`)
                : (lang === 'en'
                  ? `${institutions.length} institutions · top 3 share ${top3Pct}%`
                  : `${institutions.length} instituciones · las 3 mayores con el ${top3Pct}%`))
          }
          lang={lang}
          caption={!isLoading && institutions.length > 0 && (isPartial
            ? (lang === 'en'
              ? `${institutions.length} of ${formatNumber(sectorInstCount)} institutions`
              : `${institutions.length} de ${formatNumber(sectorInstCount)} instituciones`)
            : (lang === 'en'
              ? `${institutions.length} institutions`
              : `${institutions.length} instituciones`))}
          /* Lede — the concentration finding opens the register (elmapa § Z1.3).
             The "more than the rest of the top 10" frame renders only when
             top-1 actually exceeds ranks 2–10 summed (Day-5 guard). */
          lede={!isLoading && top1 && top1Pct >= 25 && (
            top1Pct > restTop10Pct ? (
              lang === 'en'
                ? <><strong className="font-semibold text-text-primary">{shortInstitutionLabel(top1.name, effectiveSiglas(top1.name, null))}</strong> alone manages <strong className="font-semibold">{top1Pct}%</strong> of the sector's spend — more than the rest of the top 10 combined.</>
                : <><strong className="font-semibold text-text-primary">{shortInstitutionLabel(top1.name, effectiveSiglas(top1.name, null))}</strong> solo maneja el <strong className="font-semibold">{top1Pct}%</strong> del gasto del sector — más que el resto de los 10 mayores combinados.</>
            ) : (
              lang === 'en'
                ? <><strong className="font-semibold text-text-primary">{shortInstitutionLabel(top1.name, effectiveSiglas(top1.name, null))}</strong> leads with <strong className="font-semibold">{top1Pct}%</strong> of the sector's spend — the top 10 together absorb <strong className="font-semibold">{top1Pct + restTop10Pct}%</strong>.</>
                : <><strong className="font-semibold text-text-primary">{shortInstitutionLabel(top1.name, effectiveSiglas(top1.name, null))}</strong> encabeza con el <strong className="font-semibold">{top1Pct}%</strong> del gasto del sector — los 10 mayores concentran el <strong className="font-semibold">{top1Pct + restTop10Pct}%</strong>.</>
            )
          )}
        />

        {/* Scrollable register — band 2.
            Vertical list of every institution in the sector, never truncated.
            Risk-tier shelf headers appear when sorted by RISK; dissolve to a
            flat ranked list when sorted by SPEND. */}
        <motion.div
          variants={bandVariants}
          custom={2}
          className={`max-sm:flex-none sm:flex-1 sm:min-h-0 sm:overflow-auto sm:scroll-pt-10 ${Z_GUTTER} mb-2`}
        >
          {/* min-width keeps the desktop column grid intact on phones; the
              container scrolls horizontally instead of collapsing the name
              column to zero (a no-op on desktop where the panel is wider). */}
          <div className={isMobile ? '' : 'min-w-[900px]'}>
          {isLoading && (
            <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'en' ? 'loading...' : 'cargando...'}
            </div>
          )}
          {!isMobile && !isLoading && sortedInstitutions.length > 0 && <Z1ColumnHeader lang={lang} />}
          {!isLoading && !useShelf && (
            <ul role="list" className={isMobile ? 'divide-y divide-border/40' : 'space-y-px'}>
              {sortedInstitutions.map((inst, i) => (
                <Z1Row
                  key={inst.institution_id}
                  inst={inst}
                  rank={i + 1}
                  totalSectorSpend={totalSectorSpend}
                  sectorAccent={sectorAccent}
                  dispatch={dispatch}
                  lang={lang}
                  layoutTransition={layoutTransition}
                  prefersReducedMotion={prefersReducedMotion}
                  isMobile={isMobile}
                />
              ))}
            </ul>
          )}
          {!isLoading && useShelf && (
            <div className="space-y-2">
              <Z1Shelf
                title={lang === 'en' ? 'CRITICAL · INVESTIGATE' : 'Riesgo crítico'}
                color={RISK_COLORS.critical}
                items={shelfCritical}
                totalSectorSpend={totalSectorSpend}
                sectorAccent={sectorAccent}
                dispatch={dispatch}
                lang={lang}
                layoutTransition={layoutTransition}
                prefersReducedMotion={prefersReducedMotion}
                defaultOpen
              />
              <Z1Shelf
                title={lang === 'en' ? 'HIGH PRIORITY · REVIEW' : 'Riesgo alto'}
                color={RISK_COLORS.high}
                items={shelfHigh}
                totalSectorSpend={totalSectorSpend}
                sectorAccent={sectorAccent}
                dispatch={dispatch}
                lang={lang}
                layoutTransition={layoutTransition}
                prefersReducedMotion={prefersReducedMotion}
                defaultOpen
              />
              <Z1Shelf
                title={lang === 'en' ? 'MEDIUM RISK' : 'RIESGO MEDIO'}
                color={RISK_COLORS.medium}
                items={shelfMedium}
                totalSectorSpend={totalSectorSpend}
                sectorAccent={sectorAccent}
                dispatch={dispatch}
                lang={lang}
                layoutTransition={layoutTransition}
                prefersReducedMotion={prefersReducedMotion}
                defaultOpen
              />
              <Z1Shelf
                title={lang === 'en' ? 'ROUTINE · LOW RISK' : 'Riesgo bajo'}
                color="var(--color-text-muted)"
                items={shelfRoutine}
                totalSectorSpend={totalSectorSpend}
                sectorAccent={sectorAccent}
                dispatch={dispatch}
                lang={lang}
                layoutTransition={layoutTransition}
                prefersReducedMotion={prefersReducedMotion}
                defaultOpen   /* expanded by default per user feedback — no clicking to reveal */
              />
            </div>
          )}
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}

// ─── Z1 subcomponents — single row + collapsible shelf ──────────────────────

/**
 * Column-header strip rendered above the Z1 institution list. Names what
 * each column means in plain language — readers shouldn't have to infer
 * what "DA" or "HR" stand for. Title attribute (hover tooltip) carries
 * the full definition. Sticky-top inside the scroll container.
 *
 * Widths MUST match Z1Row's columns exactly:
 *   rank 20 · logo+chip 88 · name flex · HR-bar 130 · spend 128 ·
 *   contracts 70 · DA 56 · risk 56
 */
function Z1ColumnHeader({ lang }: { lang: 'en' | 'es' }) {
  const isEs = lang === 'es'
  const headerCell: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'var(--font-family-mono, monospace)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted)',
    lineHeight: 1.3,
    // one line, one baseline: every cell carries the sort cells' 2px rule slot
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: '2px solid transparent',
  }
  return (
    <div
      className="grid items-center gap-x-3 px-2 pt-1.5 pb-1 mb-1 sticky top-0 z-[2]"
      style={{ gridTemplateColumns: Z1_GRID,
        background: 'var(--color-background)',
        borderBottom: '1px solid var(--color-border)',
      }}
      role="row"
    >
      <span role="columnheader" aria-label={isEs ? 'rango' : 'rank'} />
      <span style={headerCell} role="columnheader" title={isEs ? 'Siglas de la institución' : 'Institution acronym'}>
        {isEs ? 'Institución' : 'Institution'}
      </span>
      <span style={headerCell} role="columnheader">
        {isEs ? 'Nombre · contratos · adj. directa' : 'Name · contracts · direct award'}
      </span>
      <span
        style={headerCell}
        role="columnheader"
        title={
          isEs
            ? 'Tasa de contratos de alto riesgo: % de contratos marcados como alto o crítico por el modelo de riesgo.'
            : 'High-risk contract rate: % of this institution\'s contracts flagged high or critical by the risk model.'
        }
      >
        {isEs ? '% alto riesgo' : '% high risk'}
      </span>
      <span
        className="text-right"
        style={headerCell}
        role="columnheader"
        title={isEs ? 'Gasto acumulado en pesos y porcentaje del gasto del sector.' : 'Total spend in pesos and share of the sector\'s spend.'}
      >
        {isEs ? 'Gasto' : 'Spend'}
      </span>
      <span
        className="text-right"
        style={headerCell}
        role="columnheader"
        title={
          isEs
            ? 'Indicador de riesgo promedio del modelo (0–100). Crítico ≥ 60.'
            : 'Average risk indicator from the model (0–100). Critical ≥ 60.'
        }
      >
        {isEs ? 'Riesgo' : 'Risk'}
      </span>
    </div>
  )
}

function Z1Row({
  inst,
  rank,
  totalSectorSpend,
  sectorAccent,
  dispatch,
  lang,
  layoutTransition,
  prefersReducedMotion,
  isMobile,
}: {
  inst: SpatialInstitution
  rank: number
  totalSectorSpend: number
  sectorAccent: string
  dispatch: ReturnType<typeof useExploreDispatch>
  lang: 'en' | 'es'
  layoutTransition: { duration: number; ease?: typeof Z_EASE }
  prefersReducedMotion: boolean
  isMobile?: boolean
}) {
  const risk = inst.risk ?? 0
  // Canonical thresholds (hard rule #2) — low renders muted, never green.
  const riskTier = getRiskLevelFromScore(risk)
  const riskColor = riskTier === 'low' ? 'var(--color-text-muted)' : RISK_COLORS[riskTier]
  const share = totalSectorSpend > 0 ? (inst.total_amount_mxn / totalSectorSpend) * 100 : 0
  const eff = effectiveSiglas(inst.name, null)
  const acronym = shortInstitutionLabel(inst.name, eff)
  const logoSrc = logoSrcForSiglas(eff, inst.name)
  const riskPct = Math.round(risk * 100)

  // Editorial encodings — replace the generic "proportion-of-max" grey bar
  // that said nothing between institutions. New row carries five
  // procurement red-flag dimensions per institution:
  //
  //   1. Spend (MXN absolute) + share % of sector       — the money story
  //   2. # Contracts                                     — magnitude of activity
  //   3. HR% bar (high-risk-contract rate, red, fills)  — the procurement signal
  //   4. DA% (direct-award rate)                        — non-competitive flag
  //   5. Avg risk score (existing risk pill)             — model verdict
  //
  // HR% varies hugely between institutions (some 80%+, some near 0%), so the
  // bar's LENGTH visibly differentiates rows in a way the grey bar never did.
  const hrPct = inst.high_risk_pct ?? 0
  const daPct = inst.direct_award_pct ?? 0
  const hrBarPct = Math.min(100, Math.max(0, hrPct))
  const hrBarColor = hrPct >= 50 ? RISK_COLORS.critical : hrPct >= 25 ? RISK_COLORS.high : hrPct >= 10 ? RISK_COLORS.medium : 'var(--color-text-muted)'
  const daColor = daPct >= 80 ? RISK_COLORS.critical : daPct >= 50 ? RISK_COLORS.high : daPct >= 25 ? RISK_COLORS.medium : 'var(--color-text-muted)'

  // Mobile-native compact card — replaces the desktop multi-column table row.
  if (isMobile) {
    return (
      <MobileRegisterRow
        rank={rank}
        code={acronym}
        title={toEditorialCase(inst.name)}
        onClick={() => dispatch({ type: 'drill-into-institution', institutionId: inst.institution_id, institutionName: inst.name })}
        ariaLabel={`${inst.name}, ${formatCompactMXN(inst.total_amount_mxn)}, ${lang === 'en' ? 'high-risk' : 'alto riesgo'} ${hrPct.toFixed(0)}%, ${lang === 'en' ? 'direct award' : 'adjudicación directa'} ${daPct.toFixed(0)}%, ${lang === 'en' ? 'avg risk indicator' : 'indicador de riesgo promedio'} ${riskPct}/100`}
        chips={[
          { value: formatCompactMXN(inst.total_amount_mxn), bold: true },
          { value: `${hrPct.toFixed(0)}% HR`, color: riskInk(hrBarColor) },
          { value: `${daPct.toFixed(0)}% DA` },
          { value: `${riskPct}`, color: riskInk(riskColor), dot: true },
        ]}
      />
    )
  }

  return (
    <motion.li
      style={REGISTER_LI_STYLE}
      layout
      layoutId={`explore-inst-${inst.institution_id}`}
      transition={{ layout: layoutTransition }}
      whileHover={prefersReducedMotion ? undefined : { backgroundColor: 'var(--color-background-card)', transition: T.instant }}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'drill-into-institution', institutionId: inst.institution_id, institutionName: inst.name })}
        className={`w-full text-left grid items-center gap-x-3 px-2 py-3 rounded-sm cursor-pointer ${Z_FOCUS_RING_INSET}`}
        style={{ background: 'transparent', gridTemplateColumns: Z1_GRID }}
        title={lang === 'en'
          ? `${inst.name} — ${formatCompactMXN(inst.total_amount_mxn)} (≈${formatCompactUSD(inst.total_amount_mxn)}) — ${inst.total_contracts} contracts — HR ${hrPct.toFixed(0)}% — DA ${daPct.toFixed(0)}% — avg risk indicator ${riskPct}/100`
          : `${inst.name} — ${formatCompactMXN(inst.total_amount_mxn)} (≈${formatCompactUSD(inst.total_amount_mxn)}) — ${inst.total_contracts} contratos · alto riesgo ${hrPct.toFixed(0)}% · adjudicación directa ${daPct.toFixed(0)}% · indicador de riesgo promedio ${riskPct}/100`}
        aria-label={lang === 'en'
          ? `${inst.name}, ${formatCompactMXN(inst.total_amount_mxn)}, ${inst.total_contracts} contracts, high-risk rate ${hrPct.toFixed(0)} percent, direct-award rate ${daPct.toFixed(0)} percent, average risk indicator ${riskPct} of 100`
          : `${inst.name}, ${formatCompactMXN(inst.total_amount_mxn)}, ${inst.total_contracts} contratos, tasa de alto riesgo ${hrPct.toFixed(0)} por ciento, adjudicación directa ${daPct.toFixed(0)} por ciento, indicador de riesgo promedio ${riskPct} de 100`}
      >
        <span className="font-mono tabular-nums text-right" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {rank}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <InstitutionLogo
            logoSrc={logoSrc}
            acronym={acronym}
            fallbackBg={`${sectorAccent}22`}
            fallbackColor={sectorAccent}
          />
          <span className="font-mono uppercase tracking-[0.06em] truncate" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {acronym}
          </span>
        </span>
        {/* Name never truncates (wraps); contracts + DA ride an agate line. */}
        <span className="min-w-0">
          <span className="block leading-snug" style={{ fontSize: 15, color: 'var(--color-text-primary)', whiteSpace: 'normal' }}>
            {toEditorialCase(inst.name)}
          </span>
          <span className="block font-mono tabular-nums mt-0.5" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {formatNumber(inst.total_contracts)} {lang === 'en' ? 'contracts' : 'contratos'}
            {' · '}
            <span style={{ color: daPct >= 25 ? riskInk(daColor) : undefined, fontWeight: daPct >= 25 ? 700 : 400 }}>{daPct.toFixed(0)}%</span>
            {' '}{lang === 'en' ? 'direct award' : 'adj. directa'}
          </span>
        </span>
        {/* HR% bar — length = high-risk-contract rate; colour escalates. */}
        <span className="flex items-center gap-2">
          <span
            className="relative flex-1 h-[6px] rounded-sm overflow-hidden"
            style={{ background: 'var(--color-background-elevated)' }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-sm transition-[width]"
              style={{ width: `${hrBarPct}%`, background: hrBarColor, opacity: 0.92 }}
            />
            {[25, 50, 75].map((t) => (
              <span
                key={t}
                className="absolute inset-y-0 w-px"
                style={{ left: `${t}%`, background: 'rgba(0,0,0,0.10)' }}
              />
            ))}
          </span>
          <span className="font-mono tabular-nums text-right whitespace-nowrap" style={{ fontSize: 13, fontWeight: 700, color: riskInk(hrBarColor), minWidth: 40 }}>
            {hrPct.toFixed(0)}<span className="text-[11px] font-normal" style={{ color: 'var(--color-text-muted)', marginLeft: 1 }}>%</span>
          </span>
        </span>
        {/* Spend — two lines; USD lives in the row title. */}
        <span className="text-right" style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
          <span className="block font-mono tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {formatCompactMXN(inst.total_amount_mxn)}
          </span>
          <span className="block font-mono tabular-nums" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {share.toFixed(1)}% {lang === 'en' ? 'of sector' : 'del sector'}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-mono tabular-nums font-bold" style={{ fontSize: 14, color: riskInk(riskColor) }}>
            {riskPct}
          </span>
          <span className="block font-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {lang === 'en' ? 'risk' : 'riesgo'}
          </span>
        </span>
      </button>
    </motion.li>
  )
}

function Z1Shelf({
  title,
  color,
  items,
  totalSectorSpend,
  sectorAccent,
  dispatch,
  lang,
  layoutTransition,
  prefersReducedMotion,
  defaultOpen,
}: {
  title: string
  color: string
  items: SpatialInstitution[]
  totalSectorSpend: number
  sectorAccent: string
  dispatch: ReturnType<typeof useExploreDispatch>
  lang: 'en' | 'es'
  layoutTransition: { duration: number; ease?: typeof Z_EASE }
  prefersReducedMotion: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isMobile = useIsMobile()
  if (items.length === 0) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm font-mono uppercase tracking-[0.14em] cursor-pointer ${Z_FOCUS_RING_INSET}`}
        style={{ fontSize: 13, color: riskInk(color), background: `${color}10`, fontWeight: 700 }}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="flex-1 text-left">{title}</span>
        <span className="font-mono tabular-nums" style={{ fontSize: 12 }}>{items.length}</span>
      </button>
      {open && (
        <ul role="list" className={isMobile ? 'divide-y divide-border/40 mt-0.5' : 'space-y-px mt-0.5'}>
          {items.map((inst, i) => (
            <Z1Row
              key={inst.institution_id}
              inst={inst}
              rank={i + 1}
              totalSectorSpend={totalSectorSpend}
              sectorAccent={sectorAccent}
              dispatch={dispatch}
              lang={lang}
              layoutTransition={layoutTransition}
              prefersReducedMotion={prefersReducedMotion}
              isMobile={isMobile}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Z2Panel — «El Padrón»: institution → vendor register (elmapa § Z2)
// The register is the hero: a 3-band header (crumb · kicker · lede), rank by
// spend as the default structure, every row in one anatomy, and a paged tail
// that reaches past the pool's top 50 through /institutions/{id}/vendors
// (ProPublica Bailout Tracker: accountability table, no blank cells).
// Data: /institutions/{id}/vendor-pool (top 50 with flags) + the paged list.
// ────────────────────────────────────────────────────────────────────────────

// 'hr' | 'da' | 'sb' added 2026-06-12 (El Padrón Vivo): the formerly-dead
// columns are now interrogable — clicking their headers sorts the register.
type Z2Mode = 'spend' | 'risk' | 'hr' | 'da' | 'sb'
type VendorPoolItem = import('@/api/types').VendorPoolItem

// The pool is the top 50 by spend and /institutions/{id}/vendors pages the
// same spend-ranked register, so the tail starts at offset 50, in two 50-row
// pages per click (ranks 51–150, 151–250, …).
const Z2_POOL_N = 50
const Z2_TAIL_BATCH = 100

function Z2Panel({
  institutionId,
  institutionName,
  lang,
  dispatch,
}: {
  institutionId: number
  institutionName: string
  lang: 'en' | 'es'
  dispatch: ReturnType<typeof useExploreDispatch>
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['explore', 'z2-pool', institutionId],
    queryFn: async () => {
      const { institutionApi } = await import('@/api/client')
      return institutionApi.getVendorPool(institutionId, 50)
    },
    enabled: institutionId > 0,
    staleTime: 10 * 60 * 1000,
  })

  // Paged tail — requested on the first load-more click, then page by page.
  const [tailRequested, setTailRequested] = useState(false)
  const tail = useInfiniteQuery({
    queryKey: ['explore', 'z2-tail', institutionId],
    queryFn: async ({ pageParam }) => {
      const { institutionApi } = await import('@/api/client')
      const [a, b] = await Promise.all([
        institutionApi.getVendors(institutionId, 50, pageParam * 2),
        institutionApi.getVendors(institutionId, 50, pageParam * 2 + 1),
      ])
      return { data: [...a.data, ...b.data], total: b.total || a.total }
    },
    initialPageParam: 1,
    getNextPageParam: (last, all) => (Z2_POOL_N + all.length * Z2_TAIL_BATCH < last.total ? all.length + 1 : undefined),
    enabled: tailRequested && institutionId > 0,
    staleTime: 10 * 60 * 1000,
    // Defensive: if a page ever outlasts the edge timeout, fail once and say so.
    retry: false,
  })

  const pool = data?.data ?? []
  const sectorId = data?.sector_id ?? null
  const sectorRow = SECTORS.find((s) => s.id === sectorId)
  const sectorCode = sectorRow?.code ?? 'otros'
  const sectorAccent = SECTOR_COLORS[sectorCode] ?? '#64748b'
  const sectorName = lang === 'es' ? (sectorRow?.name ?? '') : (sectorRow?.nameEN ?? '')
  const instSpend = data?.institution_total_value_mxn ?? 0
  const instContracts = data?.institution_total_contracts ?? 0
  const instVendorCount = data?.institution_vendor_count ?? 0
  const instDaPct = data?.institution_direct_award_pct ?? 0
  const top10Share = data?.top10_share_pct ?? 0

  // Editorial title-cased institution name. Prefer the data-loaded name
  // (full canonical "Instituto Mexicano del Seguro Social") over the URL
  // placeholder (e.g. "Institution 251" when deep-linked without state).
  const instTitle = toEditorialCase(data?.institution_name ?? institutionName)
  const siglas = data?.siglas ?? null
  const instShort = shortInstitutionLabel(data?.institution_name ?? institutionName, effectiveSiglas(data?.institution_name ?? institutionName, siglas))
  // D15 § 7: a deep link hydrates "Institution 251"; once the pool loads,
  // write the real name + siglas back into the focus stack (ids unchanged).
  const loadedInstName = data?.institution_name ?? null
  useEffect(() => {
    if (loadedInstName) dispatch({ type: 'rename-focus', institutionId, institutionName: loadedInstName, institutionSiglas: siglas })
  }, [loadedInstName, siglas, institutionId, dispatch])

  // Tail rows in the pool's shape: flags unknown (null → the pending glyph,
  // never a fake 0), no badges. `rfc` is dropped here and never rendered.
  const tailRows = useMemo<VendorPoolItem[]>(() => {
    const seen = new Set(pool.map((v) => v.vendor_id))
    const out: VendorPoolItem[] = []
    for (const page of tail.data?.pages ?? []) {
      for (const r of page.data) {
        if (seen.has(r.vendor_id)) continue
        seen.add(r.vendor_id)
        out.push({
          rank: 0,
          vendor_id: r.vendor_id,
          vendor_name: r.vendor_name,
          contract_count: r.contract_count,
          total_value_mxn: r.total_value_mxn,
          share_of_institution_pct: instSpend > 0 ? (r.total_value_mxn / instSpend) * 100 : 0,
          first_year: r.first_year ?? null,
          last_year: r.last_year ?? null,
          avg_risk_score: r.avg_risk_score ?? null,
          high_risk_count: null,
          high_risk_pct: null,
          direct_award_count: null,
          direct_award_pct: null,
          single_bid_count: null,
          single_bid_pct: null,
          in_ground_truth: 0,
        })
      }
    }
    return out
  }, [pool, tail.data, instSpend])
  const tailIds = useMemo(() => new Set(tailRows.map((v) => v.vendor_id)), [tailRows])
  const vendors = useMemo(() => [...pool, ...tailRows], [pool, tailRows])
  const registerTotal = tail.data?.pages[0]?.total ?? instVendorCount
  const shown = vendors.length
  const pagesLoaded = tail.data?.pages.length ?? 0
  const nextBatch = Math.min(Z2_TAIL_BATCH, registerTotal - (Z2_POOL_N + pagesLoaded * Z2_TAIL_BATCH))
  const canLoadMore = !isLoading && !isError && shown > 0 && shown < registerTotal && nextBatch > 0
  const loadMore = () => {
    if (!tailRequested) setTailRequested(true)
    else tail.fetchNextPage()
  }

  const [mode, setMode] = useState<Z2Mode>('spend')

  const prefersReducedMotion = useReducedMotion() ?? false
  const bandVariants = useBandVariants(prefersReducedMotion)
  const layoutTransition = prefersReducedMotion ? T.none : { duration: Z_LAYOUT_DURATION_S, ease: Z_EASE }

  // Client sort over the loaded set only (the pages arrive value-desc).
  const sortedVendors = useMemo(() => {
    const bySpend = (a: VendorPoolItem, b: VendorPoolItem) => b.total_value_mxn - a.total_value_mxn
    return [...vendors].sort((a, b) => {
      switch (mode) {
        case 'risk': return (b.avg_risk_score ?? 0) - (a.avg_risk_score ?? 0) || bySpend(a, b)
        case 'hr':   return (b.high_risk_pct ?? -1) - (a.high_risk_pct ?? -1) || bySpend(a, b)
        case 'da':   return (b.direct_award_pct ?? -1) - (a.direct_award_pct ?? -1) || bySpend(a, b)
        case 'sb':   return (b.single_award_pct ?? -1) - (a.single_award_pct ?? -1) || bySpend(a, b)
        default:     return bySpend(a, b)
      }
    })
  }, [vendors, mode])

  // Pool concentration — ALWAYS rank-by-spend over the top-50 pool, independent
  // of the active sort. Feeds the lede's trailing clause.
  const spine = useMemo(() => {
    if (!pool.length) return null
    const sum = (arr: VendorPoolItem[]) => arr.reduce((s, v) => s + (v.share_of_institution_pct || 0), 0)
    return { pool: sum(pool), gtShare: sum(pool.filter((v) => v.in_ground_truth === 1)) }
  }, [pool])

  // Risk-tier shelves when sorted by RISK; rank by spend otherwise.
  const useShelf = mode === 'risk'
  const isMobile = useIsMobile()
  // Canonical thresholds via getRiskLevelFromScore (hard rule #2).
  const shelfCritical = useShelf ? sortedVendors.filter((v) => getRiskLevelFromScore(v.avg_risk_score ?? 0) === 'critical') : []
  const shelfHigh     = useShelf ? sortedVendors.filter((v) => getRiskLevelFromScore(v.avg_risk_score ?? 0) === 'high') : []
  const shelfMedium   = useShelf ? sortedVendors.filter((v) => getRiskLevelFromScore(v.avg_risk_score ?? 0) === 'medium') : []
  const shelfLow      = useShelf ? sortedVendors.filter((v) => getRiskLevelFromScore(v.avg_risk_score ?? 0) === 'low') : []

  // Editorial lede — picks the strongest narrative frame from the data.
  // Priority: confirmed-corruption count → tier-1 count → concentration →
  // top10 absorption → dispersion fallback. "10 largest" is rank-by-SPEND
  // regardless of the active sort.
  const top10 = useMemo(
    () => [...pool].sort((a, b) => b.total_value_mxn - a.total_value_mxn).slice(0, 10),
    [pool],
  )
  const gtInTop10 = top10.filter((v) => v.in_ground_truth === 1).length
  const t1InTop10 = top10.filter((v) => v.ips_tier === 1).length
  const gtSpendShare = top10.filter((v) => v.in_ground_truth === 1).reduce((s, v) => s + v.share_of_institution_pct, 0)
  const top1 = top10[0]
  const top1Pct = data?.top1_share_pct ?? 0
  const pullLine: React.ReactNode = (() => {
    if (gtInTop10 >= 3) {
      const shareStr = `${gtSpendShare.toFixed(1)}%`
      return lang === 'en'
        ? <><strong className="font-semibold text-text-primary">{gtInTop10} of {instTitle}'s 10 largest suppliers</strong> are named in documented cases — together they take <strong className="font-semibold">{shareStr}</strong> of its spend.</>
        : <><strong className="font-semibold text-text-primary">{gtInTop10} de los 10 mayores proveedores</strong> de {instTitle} figuran en casos documentados — juntos reciben el <strong className="font-semibold">{shareStr}</strong> de su gasto.</>
    }
    if (t1InTop10 >= 5) {
      return lang === 'en'
        ? <><strong className="font-semibold text-text-primary">{t1InTop10} of the top 10 vendors</strong> sit in ARIA's Tier-1 investigative queue — the highest-priority cohort in the entire database.</>
        : <><strong className="font-semibold text-text-primary">{t1InTop10} de los 10 mayores proveedores</strong> están en la fila Tier-1 de ARIA — la cohorte de máxima prioridad de toda la base.</>
    }
    if (top1Pct >= 10 && top1) {
      const t1Name = toEditorialCase(formatVendorName(top1.vendor_name, 120))
      return lang === 'en'
        ? <><strong className="font-semibold text-text-primary">{t1Name}</strong> alone takes <strong className="font-semibold">{top1Pct.toFixed(1)}%</strong> of {instTitle}'s spend — the top 10 capture <strong className="font-semibold">{top10Share.toFixed(0)}%</strong> combined.</>
        : <><strong className="font-semibold text-text-primary">{t1Name}</strong> se lleva el <strong className="font-semibold">{top1Pct.toFixed(1)}%</strong> del gasto de {instTitle} — los 10 mayores concentran el <strong className="font-semibold">{top10Share.toFixed(0)}%</strong> combinado.</>
    }
    if (top10Share >= 50) {
      return lang === 'en'
        ? <>The <strong className="font-semibold text-text-primary">top 10 vendors absorb {top10Share.toFixed(0)}%</strong> of {instTitle}'s spend.</>
        : <>Los <strong className="font-semibold text-text-primary">10 mayores proveedores concentran el {top10Share.toFixed(0)}%</strong> del gasto de {instTitle}.</>
    }
    // Dispersion fallback
    return lang === 'en'
      ? <>{instTitle}'s spend is dispersed — no single vendor exceeds <strong className="font-semibold">{top1Pct.toFixed(1)}%</strong>, but the top 10 together capture <strong className="font-semibold">{top10Share.toFixed(0)}%</strong>.</>
      : <>El gasto de {instTitle} está disperso — ningún proveedor supera el <strong className="font-semibold">{top1Pct.toFixed(1)}%</strong>, pero los 10 mayores concentran el <strong className="font-semibold">{top10Share.toFixed(0)}%</strong>.</>
  })()
  // Trailing clause — replaces the old capture-spine bar (elmapa § Z2 band 3).
  const ledeTail = spine && pool.length > 0
    ? (lang === 'en'
      ? ` The ${pool.length} largest take ${spine.pool.toFixed(0)}% · ${spine.gtShare.toFixed(1)}% in documented GT cases.`
      : ` Los ${pool.length} mayores concentran el ${spine.pool.toFixed(0)}% · ${spine.gtShare.toFixed(1)}% en casos documentados.`)
    : null

  // Breadcrumb: BREAKDOWN ▸ SECTOR ▸ INSTITUTION
  const crumbs: CrumbSegment[] = [
    { label: lang === 'en' ? 'Breakdown' : 'Reparto', onClick: () => dispatch({ type: 'reset-to-system' }) },
    { label: sectorName || sectorCode, sectorCode, onClick: () => dispatch({ type: 'pop-to-level', level: 1 }) },
    { label: instShort },
  ]

  const rowProps = { sectorAccent, dispatch, lang, layoutTransition, prefersReducedMotion, tailIds }
  const shelves: Array<{ title: string; color: string; items: VendorPoolItem[] }> = [
    { title: lang === 'en' ? 'CRITICAL · INVESTIGATE' : 'Riesgo crítico', color: RISK_COLORS.critical, items: shelfCritical },
    { title: lang === 'en' ? 'HIGH PRIORITY · REVIEW' : 'Riesgo alto', color: RISK_COLORS.high, items: shelfHigh },
    { title: lang === 'en' ? 'MEDIUM RISK' : 'RIESGO MEDIO', color: RISK_COLORS.medium, items: shelfMedium },
    { title: lang === 'en' ? 'LOW RISK' : 'RIESGO BAJO', color: 'var(--color-text-muted)', items: shelfLow },
  ]
  const moreOnlyInDossier = Math.max(0, instVendorCount - registerTotal)

  return (
    <div
      className="absolute inset-0 z-[5] overflow-hidden flex flex-col"
      data-explore-panel="true"
      style={{ background: 'var(--color-background)', top: 0 }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        className="absolute inset-0 flex flex-col max-sm:overflow-y-auto max-sm:scroll-pt-28"
      >
        <ZBreadcrumb
          segments={crumbs}
          lang={lang}
          controls={
            <ZSortToggle
              modes={['spend', 'risk'] as Z2Mode[]}
              active={mode === 'risk' ? 'risk' : 'spend'}
              onChange={setMode}
              riskMode={'risk' as Z2Mode}
              labelFor={(m) => lang === 'en' ? (m === 'spend' ? 'SPEND' : 'RISK TIERS') : (m === 'spend' ? 'GASTO' : 'POR RIESGO')}
            />
          }
          actions={!isLoading && sortedVendors.length > 0 && <>
            <ShareViewButton lang={lang} />
            <ZFooterLink compact href={`/institutions/${institutionId}`} lang={lang} />
          </>}
        />

        {/* Sector-color top rail — carries layoutId="explore-inst-${id}" so
            the Z1 row morphs into this band on drill-in. */}
        <motion.div
          layoutId={`explore-inst-${institutionId}`}
          transition={{ layout: layoutTransition }}
          style={{ height: 4, background: sectorAccent, flexShrink: 0 }}
          aria-hidden="true"
        />

        <ZKickerBand
          custom={0}
          variants={bandVariants}
          kicker={lang === 'en' ? '§ LA CAPTURA · INSTITUTION' : '§ LA CAPTURA · INSTITUCIÓN'}
          headline={
            lang === 'en'
              ? <>{instShort} — <em style={{ fontStyle: 'normal', fontWeight: 800 }}>who gets the money?</em></>
              : <>{instShort} — <em style={{ fontStyle: 'normal', fontWeight: 800 }}>¿quién recibe el dinero?</em></>
          }
          stat={
            isLoading
              ? '...'
              : lang === 'en'
                ? `${instTitle} · ${formatNumber(instVendorCount)} vendors · ${formatCompactMXN(instSpend)} · ${formatNumber(instContracts)} contracts · ${instDaPct.toFixed(0)}% direct award`
                : `${instTitle} · ${formatNumber(instVendorCount)} proveedores · ${formatCompactMXN(instSpend)} · ${formatNumber(instContracts)} contratos · ${instDaPct.toFixed(0)}% adj. directa`
          }
          lang={lang}
          caption={!isLoading && sortedVendors.length > 0 && (lang === 'en'
            ? `top ${formatNumber(shown)} of ${formatNumber(instVendorCount)} vendors`
            : `los ${formatNumber(shown)} mayores de ${formatNumber(instVendorCount)} proveedores`)}
          /* Verdict lede — the computed finding opens the register. */
          lede={!isLoading && pool.length > 0 && <>{pullLine}{ledeTail}</>}
        />

        {/* Scrollable register */}
        <motion.div
          variants={bandVariants}
          custom={2}
          className={`max-sm:flex-none sm:flex-1 sm:min-h-0 sm:overflow-auto sm:scroll-pt-10 ${Z_GUTTER} mb-2`}
        >
          {/* min-width keeps the desktop column grid intact on narrow
              desktops; mobile renders cards. */}
          <div className={isMobile ? '' : 'min-w-[900px]'}>
          {isLoading && (
            <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'en' ? 'loading...' : 'cargando...'}
            </div>
          )}
          {isError && !isLoading && (
            <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'en' ? 'no vendor data available.' : 'sin datos de proveedores.'}
            </div>
          )}
          {!isMobile && !isLoading && !isError && sortedVendors.length > 0 && (
            <Z2ColumnHeader lang={lang} mode={mode} onSort={setMode} />
          )}
          {!isLoading && !isError && !useShelf && (
            <ul role="list" className={isMobile ? 'divide-y divide-border/40' : 'space-y-px'}>
              {sortedVendors.map((v, i) => (
                <Z2Row key={v.vendor_id} v={v} rank={i + 1} {...rowProps} />
              ))}
            </ul>
          )}
          {!isLoading && !isError && useShelf && (
            <div className="space-y-2">
              {shelves.map((sh) => (
                <Z2Shelf key={sh.title} title={sh.title} color={sh.color} items={sh.items} {...rowProps} />
              ))}
            </div>
          )}

          {/* Paged tail — every listed vendor reachable, one anatomy. */}
          {canLoadMore && !tail.isError && (
            <button
              type="button"
              data-load-more=""
              onClick={loadMore}
              disabled={tail.isFetching}
              className={`w-full mt-2 flex items-center justify-center gap-2 font-serif rounded-sm cursor-pointer hover:bg-background-card transition-colors ${Z_FOCUS_RING}`}
              style={{ minHeight: 44, fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-background)' }}
              aria-label={lang === 'en'
                ? `Load the next ${nextBatch} vendors — ${formatNumber(registerTotal - shown)} more in the register`
                : `Cargar los siguientes ${nextBatch} proveedores — ${formatNumber(registerTotal - shown)} más en el registro`}
            >
              {tail.isFetching
                ? (lang === 'en' ? 'loading...' : 'cargando...')
                : (lang === 'en'
                  ? <>Load the next {nextBatch} <span className="font-normal normal-case text-text-muted">· {formatNumber(registerTotal - shown)} more in the register</span></>
                  : <>Cargar los siguientes {nextBatch} <span className="font-normal normal-case text-text-muted">· {formatNumber(registerTotal - shown)} más en el registro</span></>)}
            </button>
          )}
          {tail.isError && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-serif tabular-nums text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              <span>
                {lang === 'en'
                  ? `This register is too large to page here (${formatNumber(registerTotal)} vendors) — the rest lives in the full dossier`
                  : `Este registro es demasiado grande para paginarlo aquí (${formatNumber(registerTotal)} proveedores) — el resto está en la ficha completa`}
              </span>
              <ZFooterLink href={`/institutions/${institutionId}`} lang={lang} />
            </div>
          )}
          {!isLoading && !isError && shown > 0 && shown >= registerTotal && tailRequested && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-serif tabular-nums text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              <span>
                {lang === 'en'
                  ? `${formatNumber(registerTotal)} vendors in the register${moreOnlyInDossier > 0 ? ` · ${formatNumber(moreOnlyInDossier)} more only in the full dossier` : ''}`
                  : `${formatNumber(registerTotal)} proveedores en el registro${moreOnlyInDossier > 0 ? ` · ${formatNumber(moreOnlyInDossier)} más sólo en la ficha completa` : ''}`}
              </span>
              {moreOnlyInDossier > 0 && <ZFooterLink href={`/institutions/${institutionId}`} lang={lang} />}
            </div>
          )}
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}

// ─── Z2 subcomponents — column header, row, shelf ───────────────────────────

// Z2 (elmapa § Z2): rank · initials · vendor+agate · flags · HR bar · spend · DA · SB · risk
const Z2_GRID = '40px 36px minmax(0, 1fr) 112px 150px 128px 60px 60px 64px'

function Z2ColumnHeader({
  lang,
  mode,
  onSort,
}: {
  lang: 'en' | 'es'
  /** Active sort — data columns are interrogable (FT markets-table rule). */
  mode: Z2Mode
  onSort: (m: Z2Mode) => void
}) {
  const isEs = lang === 'es'
  const headerCell: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'var(--font-family-mono, monospace)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted)',
    lineHeight: 1.3,
    // one line, one baseline: every cell carries the sort cells' 2px rule slot
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: '2px solid transparent',
  }
  // Sortable header cell — plain button in the same type, accent underline
  // when it owns the sort. aria-sort lives on the wrapping columnheader.
  const sortableCell = (m: Z2Mode, title: string, children: React.ReactNode, align: 'left' | 'right' = 'right') => {
    const active = mode === m
    return (
      <span
        style={{ textAlign: align }}
        role="columnheader"
        aria-sort={active ? 'descending' : 'none'}
        title={title}
      >
        <button
          type="button"
          onClick={() => onSort(m)}
          className={`cursor-pointer ${Z_FOCUS_RING}`}
          style={{
            // shorthand first, so the active column's borderBottom (and headerCell's slot) survive
            border: 'none',
            ...headerCell,
            background: 'none',
            padding: 0,
            textAlign: align,
            width: '100%',
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
          }}
        >
          {children}
        </button>
      </span>
    )
  }
  return (
    <div
      className="grid items-center gap-x-3 px-2 pt-1.5 pb-1 mb-1 sticky top-0 z-[2]"
      style={{ gridTemplateColumns: Z2_GRID,
        background: 'var(--color-background)',
        borderBottom: '1px solid var(--color-border)',
      }}
      role="row"
    >
      <span role="columnheader" aria-label={isEs ? 'rango' : 'rank'} />
      <span role="columnheader" aria-hidden="true" />
      <span style={headerCell} role="columnheader">
        {isEs ? 'Proveedor · antigüedad · contratos' : 'Vendor · tenure · contracts'}
      </span>
      <span
        className="text-right"
        style={headerCell}
        role="columnheader"
        title={
          isEs
            ? 'Etiquetas: «dominante» (recibe el 10% o más del gasto de la institución), «caso documentado», «nivel 1 de la fila de investigación» y el nombre del patrón de riesgo.'
            : 'Investigative tags: DOMINANT (≥10% of institution spend), GT (in RUBLI’s labelled case set), T1 (ARIA Tier 1, anchored on that set), detected P1–P7 patterns.'
        }
      >
        {isEs ? 'Etiquetas' : 'Flags'}
      </span>
      {sortableCell(
        'hr',
        isEs
          ? 'Tasa de contratos de alto riesgo del proveedor con esta institución: % marcados como alto o crítico por el modelo. Clic para ordenar.'
          : 'High-risk contract rate for this vendor at this institution: % flagged high or critical by the risk model. Click to sort.',
        isEs ? '% alto riesgo' : '% high risk',
        'left',
      )}
      {sortableCell(
        'spend',
        isEs
          ? 'Gasto acumulado del proveedor con esta institución y % del gasto total. Clic para ordenar.'
          : 'Total spend this vendor has received from this institution, and its share. Click to sort.',
        isEs ? 'Gasto' : 'Spend',
      )}
      {sortableCell(
        'da',
        isEs
          ? 'Adjudicación directa: % de contratos del proveedor con esta institución otorgados sin licitación pública. Clic para ordenar.'
          : "Direct-award rate: % of this vendor's contracts here awarded without an open bid. Click to sort.",
        isEs ? 'AD' : 'DA',
      )}
      {sortableCell(
        'sb',
        isEs
          ? 'Un solo adjudicado: % de los contratos del proveedor en procedimientos competitivos donde fue el único adjudicado. Clic para ordenar.'
          : 'Single-award rate: % of this vendor\'s contracts in competitive procedures where it was the only winner. Click to sort.',
        isEs ? 'UP' : 'SB',
      )}
      {sortableCell(
        'risk',
        isEs
          ? 'Indicador promedio de riesgo del modelo para los contratos de este proveedor con esta institución (0–100). Crítico ≥ 60. Clic para ordenar.'
          : "Average risk indicator from the model for this vendor's contracts here (0–100). Critical ≥ 60. Click to sort.",
        isEs ? 'Riesgo' : 'Risk',
      )}
    </div>
  )
}

/**
 * Single vendor row in the Z2 register — one anatomy for the pool's top 50
 * and for paged-tail rows (whose flag cells render the pending glyph).
 * Layout matches Z2ColumnHeader via Z2_GRID. Click drills into Z3.
 */
function Z2Row({
  v,
  rank,
  sectorAccent,
  dispatch,
  lang,
  layoutTransition,
  prefersReducedMotion,
  tailIds,
}: {
  v: VendorPoolItem
  rank: number
  sectorAccent: string
  dispatch: ReturnType<typeof useExploreDispatch>
  lang: 'en' | 'es'
  layoutTransition: { duration: number; ease?: typeof Z_EASE }
  prefersReducedMotion: boolean
  /** Paged-tail rows skip the layout animation (perf, § 6). */
  tailIds: Set<number>
}) {
  const isMobile = useIsMobile()
  const score = v.avg_risk_score ?? 0
  const riskPct = Math.round(score * 100)
  // Canonical thresholds (hard rule #2) — low renders muted, never green.
  const riskLevel = getRiskLevelFromScore(score)
  const riskColor = riskLevel === 'low' ? 'var(--color-text-muted)' : RISK_COLORS[riskLevel]

  // null flags = row outside the flagged pool (paged tail) or newer than the
  // last backfill cut — renders a quiet pending dot, never a fake 0.
  const flagsKnown = v.high_risk_pct != null
  const hrPct = v.high_risk_pct ?? 0
  const daPct = v.direct_award_pct ?? 0
  // Single award of competitive procedures (D20); not colour-flagged.
  const sbPct = v.single_award_pct ?? 0
  const hrBarPct = Math.min(100, Math.max(0, hrPct))
  const hrBarColor = hrPct >= 50 ? RISK_COLORS.critical : hrPct >= 25 ? RISK_COLORS.high : hrPct >= 10 ? RISK_COLORS.medium : 'var(--color-text-muted)'
  const daColor = daPct >= 80 ? RISK_COLORS.critical : daPct >= 50 ? RISK_COLORS.high : daPct >= 25 ? RISK_COLORS.medium : 'var(--color-text-muted)'
  const sbColor = 'var(--color-text-muted)'
  const pendingTitle = lang === 'en' ? 'computed at the next refresh' : 'se calcula en el próximo corte'
  const pendingGlyph = (
    <span style={{ color: 'var(--color-text-muted)', opacity: 0.6 }} title={pendingTitle}>
      <span aria-hidden="true">·</span>
      <span className="sr-only">{pendingTitle}</span>
    </span>
  )

  // Tenure + contracts agate (OCCRP Aleph registry line).
  const agate = (() => {
    const contracts = `${formatNumber(v.contract_count)} ${lang === 'en' ? 'contracts' : 'contratos'}`
    if (v.first_year == null) return contracts
    const last = v.last_year ?? 2025
    const years = last - v.first_year + 1
    if (years <= 1) {
      return lang === 'en' ? `since ${v.first_year} · ${contracts}` : `desde ${v.first_year} · ${contracts}`
    }
    return lang === 'en'
      ? `since ${v.first_year} · ${years} yrs · ${contracts}`
      : `desde ${v.first_year} · ${years} años · ${contracts}`
  })()

  // Vendor initials chip — no logo registry for vendors (1000s of names),
  // so we synthesize a 2-char initial tile in the sector accent.
  const cleanName = formatVendorName(v.vendor_name, 300)
  const initials = (() => {
    const parts = cleanName.replace(/^(GRUPO|LABORATORIOS?|DISTRIBUIDORA|FARMAC[ÉE]UTIC[OA]S?)\s+/i, '').split(/\s+/).filter(Boolean)
    const first = (parts[0]?.[0] ?? '?').toUpperCase()
    const second = (parts[1]?.[0] ?? parts[0]?.[1] ?? '').toUpperCase()
    return (first + second).slice(0, 2) || '?'
  })()

  // Role badges — priority-ordered, max 2 visible.
  const badges = computeZ2Badges(v, lang)
  const editorialName = toEditorialCase(cleanName)
  const drill = () => dispatch({ type: 'drill-into-vendor', vendorId: v.vendor_id, vendorName: cleanName })

  // Mobile-native compact card — replaces the desktop multi-column vendor row.
  if (isMobile) {
    return (
      <MobileRegisterRow
        rank={rank}
        title={editorialName}
        onClick={drill}
        ariaLabel={`${cleanName}, ${formatCompactMXN(v.total_value_mxn)}, ${lang === 'en' ? 'avg risk indicator' : 'indicador de riesgo promedio'} ${riskPct}/100`}
        chips={[
          ...badges.map((b) => ({ value: b.label, color: riskInk(b.color) })),
          { value: formatCompactMXN(v.total_value_mxn), bold: true },
          ...(flagsKnown ? [{ value: `${daPct.toFixed(0)}% DA` }] : []),
          { value: `${riskPct}`, color: riskInk(riskColor), dot: true },
        ]}
      />
    )
  }

  const pctCell = (known: boolean, pct: number, color: string) => (
    <span className="text-right font-mono tabular-nums font-bold" style={{ fontSize: 13, color: known ? riskInk(color) : 'var(--color-text-muted)' }}>
      {known ? <>{pct.toFixed(0)}<span className="text-[11px] font-normal" style={{ color: 'var(--color-text-muted)', marginLeft: 1 }}>%</span></> : pendingGlyph}
    </span>
  )

  return (
    <motion.li
      style={REGISTER_LI_STYLE}
      layout={!tailIds.has(v.vendor_id)}
      layoutId={tailIds.has(v.vendor_id) ? undefined : `explore-vendor-${v.vendor_id}`}
      transition={{ layout: layoutTransition }}
      whileHover={prefersReducedMotion ? undefined : { backgroundColor: 'var(--color-background-card)', transition: T.instant }}
    >
      <button
        type="button"
        onClick={drill}
        className={`w-full text-left grid items-center gap-x-3 px-2 py-3 rounded-sm cursor-pointer ${Z_FOCUS_RING_INSET}`}
        style={{ background: 'transparent', gridTemplateColumns: Z2_GRID }}
        title={lang === 'en'
          ? `${cleanName} — ${formatCompactMXN(v.total_value_mxn)} (≈${formatCompactUSD(v.total_value_mxn)}, ${v.share_of_institution_pct.toFixed(1)}%) — ${formatNumber(v.contract_count)} contracts${flagsKnown ? ` — HR ${hrPct.toFixed(0)}% — DA ${daPct.toFixed(0)}% — SB ${sbPct.toFixed(0)}%` : ''} — avg risk indicator ${riskPct}/100`
          : `${cleanName} — ${formatCompactMXN(v.total_value_mxn)} (≈${formatCompactUSD(v.total_value_mxn)}, ${v.share_of_institution_pct.toFixed(1)}%) — ${formatNumber(v.contract_count)} contratos${flagsKnown ? ` · alto riesgo ${hrPct.toFixed(0)}% · adjudicación directa ${daPct.toFixed(0)}% · un solo adjudicado ${sbPct.toFixed(0)}%` : ''} · indicador de riesgo promedio ${riskPct}/100`}
        aria-label={lang === 'en'
          ? `${cleanName}, rank ${rank}, ${formatCompactMXN(v.total_value_mxn)}, ${v.contract_count} contracts${flagsKnown ? `, high-risk rate ${hrPct.toFixed(0)} percent` : ''}`
          : `${cleanName}, posición ${rank}, ${formatCompactMXN(v.total_value_mxn)}, ${v.contract_count} contratos${flagsKnown ? `, tasa de alto riesgo ${hrPct.toFixed(0)} por ciento` : ''}`}
      >
        <span className="font-mono tabular-nums text-right" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {rank}
        </span>
        <span
          className="flex items-center justify-center rounded-sm font-mono"
          style={{
            width: 32,
            height: 32,
            background: `${sectorAccent}1f`,
            color: sectorAccent,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        {/* Full vendor name — wraps, never truncated — with the agate under it */}
        <span className="min-w-0">
          <span className="block leading-snug" style={{ fontSize: 15, color: 'var(--color-text-primary)', whiteSpace: 'normal' }}>
            {editorialName}
          </span>
          <span className="block font-mono tabular-nums" style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {agate}
          </span>
        </span>
        {/* Badge stack — official-registry seals (bordered stamps) outrank
            model badges (filled chips): EFOS > SANC > DESAP > GT > … */}
        <span className="flex flex-wrap items-center gap-1 justify-end">
          {badges.map((b, i) => (
            <span
              key={i}
              className="font-mono uppercase tracking-[0.08em] px-1 py-0.5 rounded-sm whitespace-nowrap"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: riskInk(b.color),
                background: b.seal ? 'transparent' : `${b.color}1f`,
                border: b.seal ? `1px solid ${b.color}` : `1px solid ${b.color}33`,
              }}
              title={b.tooltip}
            >
              {b.label}
            </span>
          ))}
        </span>
        {/* HR% bar — high-risk contract rate, scoped to (vendor × institution) */}
        <span className="flex items-center gap-2">
          <span
            className="relative flex-1 h-[6px] rounded-sm overflow-hidden"
            style={{ background: 'var(--color-background-elevated)' }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-sm transition-[width]"
              style={{ width: `${hrBarPct}%`, background: hrBarColor, opacity: 0.92 }}
            />
            {[25, 50, 75].map((t) => (
              <span
                key={t}
                className="absolute inset-y-0 w-px"
                style={{ left: `${t}%`, background: 'rgba(0,0,0,0.10)' }}
              />
            ))}
          </span>
          <span className="font-mono tabular-nums text-right" style={{ fontSize: 13, fontWeight: 700, color: riskInk(hrBarColor), minWidth: 36 }}>
            {flagsKnown ? <>{hrPct.toFixed(0)}<span className="text-[11px] font-normal" style={{ color: 'var(--color-text-muted)', marginLeft: 1 }}>%</span></> : pendingGlyph}
          </span>
        </span>
        {/* Spend — two lines; USD lives in the row title. */}
        <span className="text-right" style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
          <span className="block font-mono tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {formatCompactMXN(v.total_value_mxn)}
          </span>
          <span className="block font-mono tabular-nums" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {v.share_of_institution_pct > 0 && v.share_of_institution_pct < 0.05 ? '<0.1' : v.share_of_institution_pct.toFixed(1)}% {lang === 'en' ? 'of spend' : 'del gasto'}
          </span>
        </span>
        {pctCell(flagsKnown, daPct, daColor)}
        {pctCell(flagsKnown, sbPct, sbColor)}
        <span className="text-right">
          <span className="block font-mono tabular-nums font-bold" style={{ fontSize: 14, color: riskInk(riskColor) }}>
            {score > 0 ? riskPct : '—'}
          </span>
          <span className="block font-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {lang === 'en' ? 'risk' : 'riesgo'}
          </span>
        </span>
      </button>
    </motion.li>
  )
}

/** Collapsible risk-tier shelf grouping Z2 rows (RISK TIERS view). */
function Z2Shelf({
  title,
  color,
  items,
  sectorAccent,
  dispatch,
  lang,
  layoutTransition,
  prefersReducedMotion,
  tailIds,
}: {
  title: string
  color: string
  items: VendorPoolItem[]
  sectorAccent: string
  dispatch: ReturnType<typeof useExploreDispatch>
  lang: 'en' | 'es'
  layoutTransition: { duration: number; ease?: typeof Z_EASE }
  prefersReducedMotion: boolean
  tailIds: Set<number>
}) {
  const [open, setOpen] = useState(true)
  const isMobile = useIsMobile()
  if (items.length === 0) return null
  const shelfSpend = items.reduce((s, v) => s + (v.total_value_mxn ?? 0), 0)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm font-mono uppercase tracking-[0.14em] cursor-pointer ${Z_FOCUS_RING_INSET}`}
        style={{ fontSize: 13, color: riskInk(color), background: `${color}10`, fontWeight: 700 }}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="flex-1 text-left">{title}</span>
        <span className="font-mono tabular-nums normal-case" style={{ fontSize: 13 }}>{formatCompactMXN(shelfSpend)}</span>
        <span className="font-mono tabular-nums" style={{ fontSize: 12 }}>{items.length}</span>
      </button>
      {open && (
        <ul role="list" className={isMobile ? 'divide-y divide-border/40 mt-0.5' : 'space-y-px mt-0.5'}>
          {items.map((v, i) => (
            <Z2Row
              key={v.vendor_id}
              v={v}
              rank={i + 1}
              sectorAccent={sectorAccent}
              dispatch={dispatch}
              lang={lang}
              layoutTransition={layoutTransition}
              prefersReducedMotion={prefersReducedMotion}
              tailIds={tailIds}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Compute the visible badges for a Z2 vendor row. Returns at most 2 in
 * priority order: official-registry seals (EFOS → SANC → DESAP — documentary
 * facts, rendered as bordered stamps) → GT → DOMINANT → T1 → pattern
 * (P1-P7) → T2. Each badge carries its own color + localized tooltip.
 */
function computeZ2Badges(
  v: import('@/api/types').VendorPoolItem,
  lang: 'en' | 'es',
): Array<{ label: string; color: string; tooltip: string; seal?: boolean }> {
  const out: Array<{ label: string; color: string; tooltip: string; seal?: boolean }> = []
  const isEs = lang === 'es'

  // Official-registry seals — the State's own blacklists (OCCRP ID
  // sanctions-tracker mechanic). Authority-voiced, never risk-scaled.
  if (v.is_efos_definitivo === 1) {
    out.push({
      label: 'EFOS',
      color: RISK_COLORS.critical,
      seal: true,
      tooltip: isEs
        ? 'En la lista definitiva del SAT de empresas que facturan operaciones simuladas (EFOS)'
        : 'SAT final EFOS listing — invoices declared simulated',
    })
  }
  if (out.length < 2 && v.is_sfp_sanctioned === 1) {
    out.push({
      label: 'SANC',
      color: RISK_COLORS.critical,
      seal: true,
      tooltip: isEs ? 'Sanción SFP en el registro' : 'SFP sanction on record',
    })
  }
  if (out.length < 2 && v.is_disappeared === 1) {
    out.push({
      label: 'DESAP',
      color: RISK_COLORS.critical,
      seal: true,
      tooltip: isEs ? 'Proveedor no localizado (SAT)' : 'Vendor not located (SAT)',
    })
  }

  if (out.length < 2 && v.in_ground_truth === 1) {
    out.push({
      label: 'GT',
      color: RISK_COLORS.critical,
      tooltip: isEs ? 'Figura en un caso documentado' : 'Named in a documented case (Ground Truth)',
    })
  }

  if (v.share_of_institution_pct >= 10) {
    out.push({
      label: isEs ? 'DOMINANTE' : 'DOMINANT',
      color: RISK_COLORS.high,
      tooltip: isEs
        ? `Concentra ${v.share_of_institution_pct.toFixed(1)}% del gasto de esta institución (≥10%)`
        : `Captures ${v.share_of_institution_pct.toFixed(1)}% of this institution's spend (≥10%)`,
    })
  }

  if (out.length < 2 && v.ips_tier === 1) {
    out.push({
      label: 'T1',
      color: RISK_COLORS.critical,
      tooltip: isEs ? 'Nivel 1 de ARIA: máxima prioridad de investigación' : 'ARIA Tier-1 cohort: highest investigative priority',
    })
  }

  if (out.length < 2 && v.primary_pattern) {
    // D15 judge 1: each chip names the pattern it carries — the short form of
    // aria:patterns.P* (the names the queue, chips and dossiers use). The old
    // map mislabelled five of seven (P1 Monopoly printed a bid-rigging /
    // bribery chip, P4 co-award a kickback, P5 overpricing a rotation, P7 a dump).
    const labels: Record<string, [string, string]> = {
      P1: ['SECTOR SHARE', 'PESO SECTOR'],
      P2: ['NO RFC', 'SIN RFC'],
      P3: ['INTERMED.', 'INTERMED.'],
      P4: ['CO-AWARD', 'COADJUD.'],
      P5: ['AMOUNT', 'MONTO'],
      P6: ['ONE BUYER', 'UN COMPRADOR'],
      P7: ['DOC. CASE', 'CASO DOC.'],
    }
    const pair = labels[v.primary_pattern]
    if (pair) {
      const patternName = i18n.t(`aria:patterns.${v.primary_pattern}`, { lng: isEs ? 'es' : 'en' })
      out.push({
        label: pair[isEs ? 1 : 0],
        color: PATTERN_COLORS[v.primary_pattern] ?? RISK_COLORS.high,
        tooltip: isEs
          ? `Patrón ${v.primary_pattern} · ${patternName} (detectado por ARIA)`
          : `Pattern ${v.primary_pattern} · ${patternName} (ARIA-detected)`,
      })
    }
  }

  if (out.length < 2 && v.ips_tier === 2) {
    out.push({
      label: 'T2',
      color: RISK_COLORS.high,
      tooltip: isEs ? 'Nivel 2 de ARIA' : 'ARIA Tier-2 cohort',
    })
  }

  return out.slice(0, 2)
}

// ────────────────────────────────────────────────────────────────────────────
// Z3Panel — editorial contract view: "LOS 3 QUE IMPORTAN" + year bars + full list
// ────────────────────────────────────────────────────────────────────────────

type Z3Mode = 'time' | 'risk' | 'weight'

function Z3Panel({
  vendorId,
  vendorName,
  ancestrySectorId,
  ancestrySectorCode,
  ancestryInstitutionId,
  ancestryInstitutionName,
  ancestryInstitutionSiglas,
  lang,
  dispatch,
  highlightContractId,
}: {
  vendorId: number
  vendorName: string
  ancestrySectorId: number | null
  ancestrySectorCode: string | null
  ancestryInstitutionId: number | null
  ancestryInstitutionName: string | null
  ancestryInstitutionSiglas?: string | null
  lang: 'en' | 'es'
  dispatch: ReturnType<typeof useExploreDispatch>
  highlightContractId?: number | null
}) {
  const isMobile = useIsMobile()
  const { data, isLoading, isError } = useQuery({
    // the breadcrumb's institution scopes the register (Salud › IMSS › vendor = its IMSS contracts)
    queryKey: ['explore', 'z3', vendorId, ancestryInstitutionId],
    queryFn: async () => {
      const { vendorApi } = await import('@/api/client')
      return vendorApi.getContracts(vendorId, { per_page: 100, ...(ancestryInstitutionId ? { institution_id: ancestryInstitutionId } : {}) })
    },
    enabled: vendorId > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Peer comparison — sector medians + percentiles for the DEVIATION LEDGER.
  // Non-blocking: the page renders without it (ledger degrades to vendor-only
  // values + dimmed ticks). The vendor's OWN rates are computed from the
  // fetched rows below — a deliberate sample-basis choice. (A 2026-06-12
  // 150-vendor audit verified vendor_stats da/sb/hr are clean; the old
  // "corrupted" note here was stale.)
  const { data: peerData } = useQuery({
    queryKey: ['explore', 'z3-peers', vendorId],
    queryFn: async () => {
      const { vendorApi } = await import('@/api/client')
      return vendorApi.getPeerComparison(vendorId)
    },
    enabled: vendorId > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Population aggregate — full-vendor counts + per-year histogram, so the
  // census + activity make population-scale claims instead of sample ones (the
  // register list itself stays the ≤100-row sample). Non-blocking.
  const { data: aggData } = useQuery({
    queryKey: ['explore', 'z3-agg', vendorId],
    queryFn: async () => {
      const { vendorApi } = await import('@/api/client')
      return vendorApi.getContractAggregate(vendorId)
    },
    enabled: vendorId > 0,
    staleTime: 5 * 60 * 1000,
  })

  const contracts = data?.data ?? []
  const totalContractSpend = contracts.reduce((s, c) => s + (Number(c.amount_mxn) || 0), 0)

  // Vendor's primary sector — prefer ancestry (we came from there) over
  // mode of the contract sectors. Falls back to mode if deep-linked.
  const sectorFromContracts = (() => {
    const counts = new Map<number, number>()
    contracts.forEach((c) => {
      const sid = Number(c.sector_id ?? 0)
      if (sid > 0) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    })
    let best: number | null = null
    let bestN = 0
    counts.forEach((n, sid) => {
      if (n > bestN) { best = sid; bestN = n }
    })
    return best
  })()
  const effectiveSectorId = ancestrySectorId ?? sectorFromContracts
  const sectorRow = SECTORS.find((s) => s.id === effectiveSectorId)
  const sectorCode = ancestrySectorCode ?? sectorRow?.code ?? 'otros'
  const sectorAccent = SECTOR_COLORS[sectorCode] ?? '#64748b'
  const sectorName = lang === 'es' ? (sectorRow?.name ?? '') : (sectorRow?.nameEN ?? '')

  // Procedure-flag aggregates for the kicker stat row
  const directAwardN = contracts.filter((c) => c.is_direct_award).length
  const singleBidN = contracts.filter((c) => c.is_single_bid).length
  const daPct = contracts.length > 0 ? (directAwardN / contracts.length) * 100 : 0
  // Single award of COMPETITIVE procedures (D20), matching the peer endpoint's single_bid_competitive_pct.
  const competitiveN = contracts.length - directAwardN
  const singleBidPct = competitiveN > 0 ? (singleBidN / competitiveN) * 100 : 0
  const avgRisk = contracts.length > 0 ? contracts.reduce((s, c) => s + (Number(c.risk_score) || 0), 0) / contracts.length : 0
  const vendorPricePer = contracts.length > 0 ? totalContractSpend / contracts.length : 0
  const sampleCount = contracts.length

  // Multi-sector detection — comparing a conglomerate to one sector median is
  // apples-to-oranges. Flag (but still show, per design) when the top sector
  // holds < 70% of contracts.
  const sectorShare = (() => {
    if (contracts.length === 0) return 1
    const counts = new Map<number, number>()
    contracts.forEach((c) => { const s = Number(c.sector_id ?? 0); if (s > 0) counts.set(s, (counts.get(s) ?? 0) + 1) })
    const top = Math.max(0, ...counts.values())
    return top / contracts.length
  })()
  const multiSector = contracts.length > 0 && sectorShare < 0.7

  // ─── DEVIATION LEDGER model ────────────────────────────────────────────────
  // The ledger compares the vendor to its sector on a POPULATION basis
  // (vendor_stats via the peer endpoint), NEVER the ≤100-row fetch — that sample
  // is unrepresentative for large vendors (a 6,303-contract vendor returns 100
  // rows). Units from the endpoint: direct_award_pct / single_bid_pct are stored
  // 0–100; avg_risk_score is a 0–1 fraction (→ ×100); price/value are MXN.
  // Vendor values fall back to the sample only when the endpoint is unavailable.
  const peerOf = (k: string) => (peerData?.metrics ?? []).find((m) => m.metric === k)
  const clampPct = (v: number | null | undefined) => (v == null ? null : Math.max(0, Math.min(100, v)))
  const ratioOf = (v: number, m: number | null) => (m && m > 0 ? v / m : null)
  const daV = peerOf('direct_award_pct'); const sbV = peerOf('single_bid_competitive_pct')
  const rkV = peerOf('avg_risk_score'); const ppV = peerOf('price_per_contract')
  const popContracts = peerOf('total_contracts')?.value ?? null
  const popValue = peerOf('total_value_mxn')?.value ?? null
  // Context strip uses the population totals (fall back to the sample).
  const ctxCount = popContracts ?? sampleCount
  const ctxValue = popValue ?? totalContractSpend
  const isSample = popContracts != null && popContracts > sampleCount

  const daVendor = clampPct(daV?.value) ?? daPct
  const sbVendor = clampPct(sbV?.value) ?? singleBidPct
  const rkVendor = rkV?.value != null ? rkV.value * 100 : avgRisk * 100
  const ppVendor = ppV?.value ?? vendorPricePer
  const daMedian = clampPct(daV?.peer_median)
  const sbMedian = clampPct(sbV?.peer_median)
  const rkMedian = rkV?.peer_median != null ? rkV.peer_median * 100 : null
  const ppMedian = ppV?.peer_median ?? null
  const smallN = ctxCount > 0 && ctxCount < 5

  const ledgerRows: Z3LedgerRow[] = [
    {
      key: 'direct_award',
      label: lang === 'en' ? 'Direct award' : 'Adj. directa',
      kind: 'pct', vendorVal: daVendor, medianVal: daMedian,
      percentile: daV?.percentile ?? null,
      absoluteRef: { value: 10, label: 'EU' },
      alarm: daVendor >= 75, ratio: ratioOf(daVendor, daMedian),
    },
    {
      key: 'single_bid',
      label: lang === 'en' ? 'Single award' : 'Un solo adjudicado',
      kind: 'pct', vendorVal: sbVendor, medianVal: sbMedian,
      percentile: sbV?.percentile ?? null,
      absoluteRef: null, alarm: sbVendor >= 50, ratio: ratioOf(sbVendor, sbMedian),
    },
    {
      key: 'risk',
      label: lang === 'en' ? 'Avg risk indicator' : 'Indicador de riesgo prom.',
      // D15 § 4: the indicator is a 0–100 score, never a percentage
      kind: 'score', vendorVal: rkVendor, medianVal: rkMedian,
      percentile: rkV?.percentile ?? null,
      absoluteRef: null, alarm: rkVendor >= 40, ratio: ratioOf(rkVendor, rkMedian),
    },
    {
      key: 'price',
      label: lang === 'en' ? 'Price / contract' : 'Precio / contrato',
      kind: 'mxn', vendorVal: ppVendor, medianVal: ppMedian,
      percentile: ppV?.percentile ?? null,
      absoluteRef: null,
      alarm: (ppV?.percentile ?? 0) >= 90,
      ratio: ratioOf(ppVendor, ppMedian),
    },
  ]

  // Pick the strongest PROCEDURALLY-MEANINGFUL deviation for the headline finding.
  // Prefer a genuine OVER-norm deviation (vendor above the sector median) by
  // severity order, so the headline never reads "0.79× the norm" for a value
  // that's alarming in absolute terms but below its (captured) sector's median.
  const strongest = (() => {
    const order: Z3LedgerRow['key'][] = ['direct_award', 'single_bid', 'risk', 'price']
    const byKey = (k: Z3LedgerRow['key']) => ledgerRows.find((r) => r.key === k)!
    const isOver = (r: Z3LedgerRow) => r.medianVal != null && r.vendorVal > r.medianVal
    // 1) genuine over-norm + meaningful (ratio ≥ 1.5 or alarm), by severity
    for (const k of order) {
      const r = byKey(k)
      if (isOver(r) && (r.alarm || (r.ratio != null && r.ratio >= 1.5))) return r
    }
    // 2) absolute-alarm even if at/below the (captured) sector median
    for (const k of order) {
      const r = byKey(k)
      if (r.alarm) return r
    }
    // 3) highest percentile row, else null
    const withP = ledgerRows.filter((r) => r.percentile != null)
    if (withP.length) return withP.reduce((b, r) => ((r.percentile ?? 0) > (b.percentile ?? 0) ? r : b))
    return null
  })()

  // Activity span + burst — stated as text in the census line (elmapa § Z3:
  // the year and month strips are cut). Population years when the aggregate
  // has landed, else the fetched sample.
  const activity = (() => {
    const pop = (aggData?.by_year ?? []).filter((b) => b.year >= 2002 && b.year <= 2030 && b.count > 0)
    const sampleYears = new Map<number, number>()
    contracts.forEach((c) => {
      const y = Number(c.contract_year ?? 0)
      if (y >= 2002 && y <= 2030) sampleYears.set(y, (sampleYears.get(y) ?? 0) + 1)
    })
    const buckets = pop.length > 0
      ? pop.map((b) => ({ year: b.year, count: b.count }))
      : Array.from(sampleYears, ([year, count]) => ({ year, count }))
    if (buckets.length === 0) return null
    const total = buckets.reduce((sum, b) => sum + b.count, 0)
    const peak = buckets.reduce((a, b) => (b.count > a.count ? b : a))
    const years = buckets.map((b) => b.year)
    return { y1: Math.min(...years), y2: Math.max(...years), total, peak, concentrated: buckets.length > 1 && peak.count / total >= 0.6 }
  })()
  const activityClauses: string[] = (() => {
    if (!activity) return []
    const { y1, y2, total, peak, concentrated } = activity
    if (y1 === y2) return [lang === 'en' ? `all in ${y1}` : `todo en ${y1}`]
    const a1 = getAdministrationByYear(y1)
    const a2 = getAdministrationByYear(y2)
    const admins = a1 && a2
      ? (a1.key === a2.key ? ` · ${ADMIN_DISPLAY_ACCENTED[a1.key]}` : ` · ${ADMIN_DISPLAY_ACCENTED[a1.key]} → ${ADMIN_DISPLAY_ACCENTED[a2.key]}`)
      : ''
    const out = [lang === 'en' ? `active ${y1}–${y2}${admins}` : `activo ${y1}–${y2}${admins}`]
    if (concentrated) out.push(lang === 'en' ? `${formatNumber(peak.count)} of ${formatNumber(total)} in ${peak.year}` : `${formatNumber(peak.count)} de ${formatNumber(total)} en ${peak.year}`)
    return out
  })()

  // ─── EL EXPEDIENTE — per-contract forensic flags (client-side, over the
  // fetched sample). The flag gutter replaces the uniform risk dot: each slot
  // lights only when its signal fires, so a monotonous burst renders the repeat
  // slot as a solid vertical rail and the outliers as the dark gaps in it.
  const flagData = (() => {
    // De-dup (2026-06-03): per-contract classification + census now come from the
    // shared lib/contract-audit — single source of truth with the dossier register
    // (VendorActivityTab § El Expediente). Previously this was a ~70-line inline
    // copy that could silently drift from the dossier's.
    const audit = computeContractFlags(contracts)
    return { info: audit.info, census: audit.census }
  })()

  // Sort for the contracts register
  const [mode, setMode] = useState<Z3Mode>('weight')
  const sortedContracts = useMemo(() => {
    const flagCount = (c: ContractListItem) => flagData.info.get(c.id)?.count ?? 0
    return [...contracts].sort((a, b) =>
      mode === 'weight'
        ? flagCount(b) - flagCount(a) || (Number(b.amount_mxn) || 0) - (Number(a.amount_mxn) || 0)
        : mode === 'risk'
          ? (Number(b.risk_score) || 0) - (Number(a.risk_score) || 0) || (Number(b.amount_mxn) || 0) - (Number(a.amount_mxn) || 0)
          : (Number(b.contract_year) || 0) - (Number(a.contract_year) || 0) || (Number(b.amount_mxn) || 0) - (Number(a.amount_mxn) || 0),
    )
  }, [contracts, mode, flagData])

  const prefersReducedMotion = useReducedMotion() ?? false
  const bandVariants = useBandVariants(prefersReducedMotion)
  const layoutTransition = prefersReducedMotion ? T.none : { duration: Z_LAYOUT_DURATION_S, ease: Z_EASE }

  // Editorial vendor name + display. On a direct deep-link (no drill-through
  // state) the `vendorName` prop is the URL placeholder "Vendor 13885" — fall
  // back to the vendor_name carried on the fetched contract rows so the
  // headline + breadcrumb show the real name, not the id.
  const isPlaceholderName = /^Vendor\s+\d+$/i.test(vendorName?.trim() ?? '')
  const resolvedVendorName = (isPlaceholderName
    ? (contracts.find((c) => (c as ContractListItem).vendor_name)?.vendor_name ?? vendorName)
    : vendorName)
  const cleanName = formatVendorName(resolvedVendorName, 300)
  const editorialName = toEditorialCase(cleanName)

  // D15 § 7: write loaded names back over the deep-link placeholders so the
  // crumb trail never reads "Institution 251" (ids, URL and query keys stay).
  useEffect(() => {
    if (isPlaceholderName && resolvedVendorName && resolvedVendorName !== vendorName) {
      dispatch({ type: 'rename-focus', vendorId, vendorName: resolvedVendorName })
    }
  }, [isPlaceholderName, resolvedVendorName, vendorName, vendorId, dispatch])
  const instIsPlaceholder = ancestryInstitutionId != null && (!ancestryInstitutionName || /^Institution\s+\d+$/i.test(ancestryInstitutionName.trim()))
  const { data: ancestryInst } = useQuery({
    queryKey: ['explore', 'z3-ancestry-institution', ancestryInstitutionId],
    queryFn: async () => {
      const { institutionApi } = await import('@/api/client')
      return institutionApi.getById(ancestryInstitutionId as number)
    },
    enabled: instIsPlaceholder,
    staleTime: 30 * 60 * 1000,
  })
  useEffect(() => {
    if (instIsPlaceholder && ancestryInst?.name && ancestryInstitutionId != null) {
      dispatch({ type: 'rename-focus', institutionId: ancestryInstitutionId, institutionName: ancestryInst.name, institutionSiglas: ancestryInst.siglas ?? null })
    }
  }, [instIsPlaceholder, ancestryInst, ancestryInstitutionId, dispatch])

  // Breadcrumb ancestry — crumbs that don't apply quietly disappear
  const crumbs: CrumbSegment[] = [
    { label: lang === 'en' ? 'Breakdown' : 'Reparto', onClick: () => dispatch({ type: 'reset-to-system' }) },
  ]
  if (ancestrySectorId != null) {
    crumbs.push({ label: sectorName || sectorCode, sectorCode, onClick: () => dispatch({ type: 'pop-to-level', level: 1 }) })
  }
  if (ancestryInstitutionId != null) {
    const instLabel = instIsPlaceholder
      ? `${lang === 'en' ? 'Institution' : 'Institución'} ${ancestryInstitutionId}`
      : shortInstitutionLabel(ancestryInstitutionName as string, effectiveSiglas(ancestryInstitutionName as string, ancestryInstitutionSiglas))
    crumbs.push({ label: instLabel, onClick: () => dispatch({ type: 'pop-to-level', level: 2 }) })
  }
  crumbs.push({ label: editorialName })

  const RENDER_LIMIT = 50
  const visibleContracts = sortedContracts.slice(0, RENDER_LIMIT)
  // the register's own population: the vendor at the breadcrumb's institution, or the whole vendor
  const listTotal = data?.pagination?.total ?? ctxCount
  const instLabel = ancestryInstitutionId ? (ancestryInstitutionSiglas || ancestryInstitutionName) : null
  const allHref = `/contracts?vista=lista&vendor_id=${vendorId}${ancestryInstitutionId ? `&institution_id=${ancestryInstitutionId}` : ''}`

  return (
    <div
      className="absolute inset-0 z-[5] overflow-hidden flex flex-col"
      data-explore-panel="true"
      style={{ background: 'var(--color-background)', top: 0 }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        className="absolute inset-0 flex flex-col max-sm:overflow-y-auto max-sm:scroll-pt-28"
      >
        {/* Breadcrumb */}
        <ZBreadcrumb
          segments={crumbs}
          lang={lang}
          actions={!isLoading && !isError && contracts.length > 0 && <>
            <ShareViewButton lang={lang} />
            <ZFooterLink compact href={`/vendors/${vendorId}`} lang={lang} />
          </>}
        />

        {/* Sector-color rail — Z2's vendor chip morphs into this on drill-in */}
        <motion.div
          layoutId={`explore-vendor-${vendorId}`}
          transition={{ layout: layoutTransition }}
          style={{ height: 4, background: sectorAccent, flexShrink: 0 }}
          aria-hidden="true"
        />

        {/* Editorial header */}
        <ZKickerBand
          custom={0}
          variants={bandVariants}
          kicker={lang === 'en' ? '§ EL HISTORIAL · VENDOR DEEP' : '§ EL HISTORIAL · PROVEEDOR'}
          headline={
            lang === 'en'
              ? <>{editorialName} — <em style={{ fontStyle: 'normal', fontWeight: 800 }}>how far from the norm</em></>
              : <>{editorialName} — <em style={{ fontStyle: 'normal', fontWeight: 800 }}>qué tan lejos de la norma</em></>
          }
          lang={lang}
          caption={!isLoading && !isError && contracts.length > 0 && (lang === 'en'
            ? `${visibleContracts.length} of ${formatNumber(listTotal)} shown${instLabel ? ` · ${instLabel}` : ''}`
            : `${visibleContracts.length} de ${formatNumber(listTotal)} mostrados${instLabel ? ` · ${instLabel}` : ''}`)}
        />

        {/* Scrollable middle — timeline + top-3 + toggle + register */}
        <motion.div
          variants={bandVariants}
          custom={1}
          className={`max-sm:flex-none sm:flex-1 sm:min-h-0 sm:overflow-y-auto ${Z_GUTTER}`}
        >
          {isLoading && (
            <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'en' ? 'loading...' : 'cargando...'}
            </div>
          )}
          {isError && !isLoading && (
            <div className="py-12 text-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'en' ? 'no contracts found.' : 'sin contratos disponibles.'}
            </div>
          )}

          {/* ─── EL DESVÍO — indictment finding + deviation ledger spine ──────
              The page reads as one argument: a prose FINDING (the strongest
              deviation, stated once), then the DEVIATION LEDGER (the proof,
              fixed geometry at any N), then CONTEXT (the magnitudes the ratios
              normalize away), then self-suppressing evidence modules. */}
          {!isLoading && !isError && contracts.length > 0 && (
            <>
              <Z3VerdictLine
                strongest={strongest}
                vendorName={editorialName}
                smallN={smallN}
                ctxCount={ctxCount}
                ctxValue={ctxValue}
                lang={lang}
              />
              <Z3DeviationBand rows={ledgerRows} strongestKey={strongest?.key ?? null} smallN={smallN} multiSector={multiSector} lang={lang} />

            </>
          )}

          {/* ─── EL EXPEDIENTE — census header + flag-weight sort. The census
              counts the lit flags as a prosecutorial sentence BEFORE you scroll;
              all counts are sample-scoped ("Muestra de N") when isSample, since
              the register is the ≤100-row sample, not the population. */}
          {!isLoading && !isError && contracts.length > 0 && (
            <div className="pt-4 pb-1.5">
              <h2 className="font-mono uppercase mb-1 font-normal" style={{ fontSize: 13, letterSpacing: '0.18em', color: 'var(--color-text-muted)', maxWidth: 'none' }}>
                <span style={{ color: OCHRE, fontStyle: 'normal', fontWeight: 600 }}>§ {lang === 'en' ? 'The record' : 'El expediente'}</span>
                <span aria-hidden="true" style={{ margin: '0 7px', opacity: 0.45 }}>·</span>
                <span style={{ fontWeight: 300 }}>{lang === 'en' ? 'the evidence' : 'la evidencia'}</span>
              </h2>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-family-editorial)', color: 'var(--color-text-secondary)', lineHeight: 1.4, maxWidth: 'none' }}>
                {(() => {
                  const cl: string[] = []
                  if (aggData) {
                    // POPULATION census — full-vendor counts, no sample caveat.
                    const tot = aggData.total_contracts
                    if (aggData.no_competition > 0) cl.push(lang === 'en'
                      ? `${formatNumber(aggData.no_competition)} of ${formatNumber(tot)} without competition`
                      : `${formatNumber(aggData.no_competition)} de ${formatNumber(tot)} sin licitación`)
                    else cl.push(lang === 'en' ? `${formatNumber(tot)} contracts` : `${formatNumber(tot)} contratos`)
                    if (aggData.repeat_rows > 0) {
                      const pk = aggData.peak_mult >= 3 && aggData.peak_amount != null ? ` (${formatCompactMXN(aggData.peak_amount)} ×${aggData.peak_mult})` : ''
                      cl.push(lang === 'en' ? `${aggData.repeat_rows} repeated amounts${pk}` : `${aggData.repeat_rows} montos repetidos${pk}`)
                    }
                    return [...cl, ...activityClauses].join('  ·  ')
                  }
                  // Fallback — sample census (aggregate unavailable).
                  const cs = flagData.census
                  cl.push(isSample
                    ? (lang === 'en' ? `Sample of ${formatNumber(cs.shown)}` : `Muestra de ${formatNumber(cs.shown)}`)
                    : (lang === 'en' ? `${formatNumber(cs.shown)} contracts` : `${formatNumber(cs.shown)} contratos`))
                  if (cs.repeatedRows > 0) {
                    const topClause = cs.topObjN >= 3 ? ` (${cs.topObj} ×${cs.topObjN})` : ''
                    cl.push(lang === 'en' ? `${cs.repeatedRows} repeated${topClause}` : `${cs.repeatedRows} repetidos${topClause}`)
                  }
                  if (cs.noCompetition > 0) cl.push(lang === 'en' ? `${cs.noCompetition} without competition` : `${cs.noCompetition} sin licitación`)
                  if (cs.peakMult >= 3) cl.push(lang === 'en' ? `peak ${formatCompactMXN(cs.peakAmt)} ×${cs.peakMult}` : `pico ${formatCompactMXN(cs.peakAmt)} ×${cs.peakMult}`)
                  return [...cl, ...activityClauses].join('  ·  ')
                })()}
              </p>
              <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 font-mono" style={{ fontSize: 11, letterSpacing: '0.02em', color: 'var(--color-text-muted)' }}>
                  <span><span style={{ color: OCHRE, fontWeight: 700 }}>≡</span> {lang === 'en' ? 'repeat' : 'repetido'}</span>
                  <span><span style={{ color: RISK_TEXT_COLORS.critical, fontWeight: 700 }}>①</span> {lang === 'en' ? 'single award' : 'un solo adjudicado'}</span>
                  <span><span style={{ color: RISK_INK_ON_PLATE.medium, fontWeight: 700 }}>▲</span> {lang === 'en' ? 'top decile' : 'decil'}</span>
                  <span><span style={{ color: OCHRE, fontWeight: 700 }}>↻</span> {lang === 'en' ? 'amendment' : 'convenio'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ZSortToggle
                    modes={['weight', 'risk', 'time'] as const}
                    active={mode}
                    onChange={setMode}
                    riskMode="risk"
                    labelFor={(m) => lang === 'en'
                      ? (m === 'weight' ? 'FLAGS' : m.toUpperCase())
                      : (m === 'weight' ? 'SEÑAL' : m === 'risk' ? 'RIESGO' : 'TIEMPO')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Register scrolls horizontally on phones — its column grid is too
              wide for ~390px. Wraps only the register (the timeline + deviation
              grid above fit natively); a no-op on desktop (panel wider). */}
          <div className={isMobile ? '' : 'overflow-x-auto'}>
          <div className={isMobile ? '' : 'min-w-[720px]'}>
          {/* Column header — aligns with the table row (desktop only; mobile uses cards) */}
          {!isMobile && !isLoading && !isError && visibleContracts.length > 0 && (
            <div className="flex items-center gap-2.5 pl-2.5 pr-2 pb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span className="flex-shrink-0 text-right font-mono uppercase" style={{ width: 112, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'Amount' : 'Monto'}
              </span>
              <span className="flex-shrink-0 text-right font-mono uppercase" style={{ width: 70, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                ≈USD
              </span>
              <span className="flex-shrink-0 text-right font-mono uppercase" style={{ width: 56, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'Flags' : 'Señal'}
              </span>
              <span className="flex-shrink-0 font-mono uppercase" style={{ width: 60, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'Date' : 'Fecha'}
              </span>
              <span className="flex-shrink-0 font-mono uppercase" style={{ width: 96, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'Procedure' : 'Procedim.'}
              </span>
              <span className="flex-shrink-0 font-mono uppercase" style={{ width: 150, fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'File' : 'Expediente'}
              </span>
              <span className="flex-1 min-w-0 font-mono uppercase" style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>
                {lang === 'en' ? 'Object' : 'Objeto'}
              </span>
            </div>
          )}

          {/* Dense register — top 30 contracts, disclosure to /vendors/{id} for full list */}
          {!isLoading && !isError && visibleContracts.length > 0 && (
            <ul role="list" className={isMobile ? 'divide-y divide-border/40' : 'space-y-px'}>
              {visibleContracts.map((c) => (
                <Z3ContractRow
                  key={c.id}
                  c={c}
                  flags={flagData.info.get(c.id) ?? { repeated: false, repeatAmt: 0, repeatObj: 0, singleBid: false, decile: false, amendment: false, round: false, count: 0 }}
                  isHighlighted={c.id === highlightContractId}
                  dispatch={dispatch}
                  lang={lang}
                  prefersReducedMotion={prefersReducedMotion}
                />
              ))}
            </ul>
          )}
          </div>
          </div>

          {/* "view all" disclosure when we have more than RENDER_LIMIT */}
          {!isLoading && !isError && listTotal > visibleContracts.length && (
            <div className="pt-3 pb-4">
              <ZFooterLink
                href={allHref}
                lang={lang}
                label={lang === 'en'
                  ? `View all ${formatNumber(listTotal)} contracts${instLabel ? ` at ${instLabel}` : ''}`
                  : `Ver los ${formatNumber(listTotal)} contratos${instLabel ? ` en ${instLabel}` : ''}`}
              />
            </div>
          )}
        </motion.div>

      </motion.div>
    </div>
  )
}

// ─── Z3 subcomponents ───────────────────────────────────────────────────────

// cleanContractDescription + the per-row flag classification now live in the
// shared @/lib/contract-audit (imported above) — single source of truth with the
// dossier register (VendorActivityTab § El Expediente). The ~50-line inline copies
// that used to live here were verbatim duplicates that could silently drift.
// Z3RowFlags is the shared ContractFlags shape (kept as a local alias so the many
// Z3ContractRow call sites don't churn).
type Z3RowFlags = ContractFlags

function Z3ContractRow({
  c,
  flags,
  isHighlighted,
  dispatch,
  lang,
  prefersReducedMotion,
}: {
  c: ContractListItem
  flags: Z3RowFlags
  isHighlighted: boolean
  dispatch: ReturnType<typeof useExploreDispatch>
  lang: 'en' | 'es'
  prefersReducedMotion: boolean
}) {
  const isMobile = useIsMobile()
  const score = Number(c.risk_score ?? 0)
  const rail = RISK_COLORS[getRiskLevelFromScore(score)]
  const amount = Number(c.amount_mxn ?? 0)
  // D15 § 7: the whole object (no 90-char '…' cut) — the cell clamps to two
  // lines and its title carries the rest; the file shows its whole code.
  const { objeto, code: fileCode, moreCodes } = cleanContractDescription((c as ContractListItem & { title?: string }).title ?? '', Infinity)
  const expediente = fileCode ? (moreCodes > 0 ? `${fileCode} +${moreCodes}` : fileCode) : null
  const noObject = !objeto
  // Money is INK by default; it flips critical-red ONLY on compound anomalies
  // (≥2 lit flags) — so color pulls the eye to genuinely stacked rows, not to
  // the uniform high-risk of a captured vendor.
  const moneyColor = flags.count >= 2 ? RISK_TEXT_COLORS.critical : 'var(--color-text-primary)'

  // The flag gutter — slots light only when their signal fires. Glyphs differ
  // by FORM (not color alone) and each carries an aria-label (WCAG).
  const repeatLabel = flags.repeatObj >= 3
    ? (lang === 'en' ? `same object repeated ${flags.repeatObj}× in sample` : `mismo objeto repetido ${flags.repeatObj}× en la muestra`)
    : (lang === 'en' ? `amount repeated ${flags.repeatAmt}× in sample — possible split` : `monto repetido ${flags.repeatAmt}× en la muestra — posible fraccionamiento`)
  const slots: Array<{ on: boolean; glyph: string; color: string; label: string }> = [
    { on: flags.repeated, glyph: '≡', color: OCHRE, label: repeatLabel },
    { on: flags.singleBid, glyph: '①', color: RISK_TEXT_COLORS.critical, label: lang === 'en' ? 'single award' : 'un solo adjudicado' },
    { on: flags.decile, glyph: '▲', color: RISK_INK_ON_PLATE.medium, label: lang === 'en' ? "top-decile amount for this vendor" : 'monto en el decil superior del proveedor' },
    { on: flags.amendment, glyph: '↻', color: OCHRE, label: lang === 'en' ? 'amendment / convenio (text-derived)' : 'convenio modificatorio (según texto)' },
  ]
  const yr = Number(c.contract_year)
  // FECHA column — month + year from contract_date, falling back to the year.
  const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
  const cd = (c as ContractListItem & { contract_date?: string }).contract_date ?? ''
  const dm = /^(\d{4})-(\d{2})/.exec(cd)
  const fecha = dm ? `${MES[Number(dm[2]) - 1]} '${dm[1].slice(2)}` : (yr ? `'${String(yr).slice(2)}` : '—')
  // PROC column — compact procedure label; direct-award rendered in ochre.
  const ptRaw = ((c as ContractListItem & { procedure_type?: string }).procedure_type ?? '').toLowerCase()
  const proc = ptRaw.includes('marco') ? (lang === 'en' ? 'FRAMEWORK' : 'C. MARCO')
    : ptRaw.includes('invitaci') ? (lang === 'en' ? 'INVITATION' : 'INVITACIÓN')
    : (ptRaw.includes('licitaci') || ptRaw.includes('open') || ptRaw.includes('bid')) ? (lang === 'en' ? 'OPEN BID' : 'LICITACIÓN')
    : (c.is_direct_award || ptRaw.includes('adjudicaci') || ptRaw.includes('direct')) ? (lang === 'en' ? 'DIRECT' : 'ADJ. DIRECTA')
    : '—'
  const title = `${fecha} · ${formatCompactMXN(amount)} · ${proc}${expediente ? ` · ${expediente}` : ''}${flags.repeated ? ` · ${repeatLabel}` : ''}\n${objeto ?? ''}`

  // Mobile-native compact card — replaces the desktop multi-column contract row.
  if (isMobile) {
    return (
      <MobileRegisterRow
        title={objeto || expediente || (lang === 'en' ? '(no description)' : '(sin descripción)')}
        clampTitle
        onClick={() => dispatch({ type: 'drill-into-contract', contractId: c.id })}
        ariaLabel={`${objeto ?? expediente ?? 'contract'}, ${formatCompactMXN(amount)}, ${fecha}, ${proc}, ${lang === 'en' ? 'risk indicator' : 'indicador de riesgo'} ${Math.round(score * 100)}/100`}
        chips={[
          { value: formatCompactMXN(amount), bold: true, color: flags.count >= 2 ? RISK_TEXT_COLORS.critical : undefined },
          { value: fecha },
          { value: proc, color: proc === 'DIRECT' || proc === 'ADJ. DIRECTA' ? OCHRE : undefined },
          ...slots.filter((s) => s.on).map((s) => ({ value: s.glyph, color: s.color })),
          { value: `${Math.round(score * 100)}`, color: riskInk(rail), dot: true },
        ]}
      />
    )
  }

  return (
    <motion.li
      whileHover={prefersReducedMotion ? undefined : { backgroundColor: 'var(--color-background-card)', transition: T.instant }}
      style={isHighlighted ? { ...REGISTER_LI_STYLE, background: `${rail}14` } : REGISTER_LI_STYLE}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'drill-into-contract', contractId: c.id })}
        className={`w-full text-left flex items-center gap-2.5 pl-2.5 pr-2 py-2 cursor-pointer ${Z_FOCUS_RING_INSET}`}
        style={{
          background: 'transparent',
          borderLeft: `2px solid ${rail}`,
          boxShadow: c.is_direct_award ? `inset 1px 0 0 ${OCHRE}` : undefined,
          borderBottom: '1px solid var(--color-border)',
        }}
        title={title}
      >
        {/* MONEY */}
        <span className="flex-shrink-0 font-mono tabular-nums text-right whitespace-nowrap" style={{ width: 112, fontSize: 13, fontWeight: 700, color: moneyColor }}>
          {formatCompactMXN(amount)}
        </span>

        {/* USD — converted at the contract's own year rate (MXN_USD_RATES) */}
        <span className="flex-shrink-0 text-right font-mono tabular-nums" style={{ width: 70, fontSize: 11, color: 'var(--color-text-muted)' }}>
          {amount > 0 ? `≈${formatCompactUSDByYear(amount, yr).replace(' USD', '')}` : ''}
        </span>

        {/* FLAG GUTTER — the anchor channel */}
        <span className="flex-shrink-0 flex items-center justify-end gap-[3px]" style={{ width: 56 }} aria-label={lang === 'en' ? 'flags' : 'señales'}>
          {slots.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center justify-center font-mono"
              style={{ width: 11, height: 11, fontSize: 12, lineHeight: 1, fontWeight: 700, color: s.on ? s.color : 'var(--color-border)', opacity: s.on ? 1 : 0.3 }}
              title={s.on ? s.label : ''}
              aria-label={s.on ? s.label : undefined}
              aria-hidden={s.on ? undefined : true}
            >
              {s.on ? s.glyph : '·'}
            </span>
          ))}
        </span>

        {/* FECHA */}
        <span className="flex-shrink-0 font-mono tabular-nums" style={{ width: 60, fontSize: 11, color: 'var(--color-text-muted)' }}>
          {fecha}
        </span>

        {/* PROCEDIMIENTO — direct-award in ochre (the baseline pathology), else muted */}
        <span
          className="flex-shrink-0 font-mono uppercase whitespace-nowrap"
          style={{ width: 108, fontSize: 13, letterSpacing: '0.04em', color: c.is_direct_award ? OCHRE : 'var(--color-text-muted)', fontWeight: c.is_direct_award ? 600 : 400 }}
        >
          {proc}
        </span>

        {/* EXPEDIENTE — the contract reference, always its own column (mono, demoted) */}
        <span className="flex-shrink-0 font-mono" style={{ width: 150, fontSize: 11, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
          {expediente ?? '—'}
        </span>

        {/* OBJETO — the prose, flexing last so it fills to the right edge (no mid-row gap) */}
        <span
          className="flex-1 min-w-0 line-clamp-2"
          style={{ fontSize: 13, lineHeight: 1.3, fontFamily: 'var(--font-family-editorial)', color: noObject ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
          title={objeto ?? undefined}
        >
          {objeto ?? <span style={{ fontStyle: 'normal' }}>—</span>}
        </span>
      </button>
    </motion.li>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// EL DESVÍO — the deviation-ledger spine. A vendor is a row of DEVIATIONS from
// its sector's norm, not a timeline of contracts. Ink is driven by deviation
// magnitude, never data volume — so a 1-contract vendor and a 4000-contract
// vendor render with identical geometry, and sparse data can never skew it.
// Reference: FT bullet-vs-benchmark, NYT Upshot sledgehammer, ProPublica.
// ════════════════════════════════════════════════════════════════════════════

export type Z3LedgerRow = {
  key: 'direct_award' | 'single_bid' | 'risk' | 'price'
  label: string
  kind: 'pct' | 'mxn' | 'score'
  vendorVal: number
  medianVal: number | null
  percentile: number | null
  absoluteRef: { value: number; label: string } | null
  alarm: boolean
  ratio: number | null
}

const OCHRE = '#a06820'
const REF_CYAN = '#0891b2'

// The verdict line — one prose finding (the strongest deviation, stated once)
// with the population count·spend tail folded in on the right (ex-Z3ContextStrip,
// so scale rides alongside the ratio and the old standalone context line dies).
// Numbers in strong weight + deviation hue. Below ~5 contracts the verb softens
// to "se desvía" (a true ratio, but not an accusation).
function Z3VerdictLine({
  strongest,
  vendorName,
  smallN,
  ctxCount,
  ctxValue,
  lang,
}: {
  strongest: Z3LedgerRow | null
  vendorName: string
  smallN: boolean
  ctxCount: number
  ctxValue: number
  lang: 'en' | 'es'
}) {
  const accent = strongest?.alarm ? RISK_COLORS.critical : OCHRE
  const strong = (s: string) => (
    <span style={{ fontWeight: 700, color: riskInk(accent), fontStyle: 'normal' }}>{s}</span>
  )
  const fmtNum = (r: Z3LedgerRow, v: number) => (r.kind === 'mxn' ? formatCompactMXN(v) : r.kind === 'score' ? `${v.toFixed(0)} /100` : `${v.toFixed(0)}%`)
  const fmtVal = (r: Z3LedgerRow) => fmtNum(r, r.vendorVal)
  const fmtMed = (r: Z3LedgerRow) => (r.medianVal == null ? '—' : fmtNum(r, r.medianVal))

  let body: React.ReactNode
  if (!strongest) {
    body = lang === 'en'
      ? <>{vendorName} <span>operates close to the sector norm on the measured indicators.</span></>
      : <>{vendorName} <span>opera cerca de la norma del sector en los indicadores medidos.</span></>
  } else if (smallN && strongest.ratio != null) {
    body = lang === 'en'
      ? <>{vendorName} deviates {strong(`${strongest.ratio.toFixed(1)}×`)} from the sector norm on {strongest.label.toLowerCase()} ({fmtVal(strongest)} vs {fmtMed(strongest)}).</>
      : <>{vendorName} se desvía {strong(`${strongest.ratio.toFixed(1)}×`)} de la norma del sector en {strongest.label.toLowerCase()} ({fmtVal(strongest)} vs {fmtMed(strongest)}).</>
  } else {
    const r = strongest
    const ratioClause = r.ratio != null
      ? (lang === 'en' ? <> — {strong(`${r.ratio.toFixed(1)}×`)} the sector norm ({fmtMed(r)})</> : <> — {strong(`${r.ratio.toFixed(1)}×`)} la norma del sector ({fmtMed(r)})</>)
      : (r.percentile != null ? (lang === 'en' ? <> — {strong(`p${Math.round(r.percentile)}`)} in its sector</> : <> — {strong(`percentil ${Math.round(r.percentile)}`)} del sector</>) : null)
    if (r.key === 'direct_award') {
      body = lang === 'en'
        ? <>{vendorName} took {strong(fmtVal(r))} of its contracts without competition{ratioClause}.</>
        : <>{vendorName} obtuvo el {strong(fmtVal(r))} de sus contratos sin licitación{ratioClause}.</>
    } else if (r.key === 'single_bid') {
      body = lang === 'en'
        ? <>{vendorName} won {strong(fmtVal(r))} of its contracts as the only winner{ratioClause}.</>
        : <>{vendorName} ganó el {strong(fmtVal(r))} de sus contratos como único adjudicado{ratioClause}.</>
    } else if (r.key === 'risk') {
      body = lang === 'en'
        ? <>{vendorName} carries an average risk indicator of {strong(fmtVal(r))}{ratioClause}.</>
        : <>{vendorName} tiene un indicador de riesgo promedio de {strong(fmtVal(r))}{ratioClause}.</>
    } else {
      body = lang === 'en'
        ? <>{vendorName} paid {strong(fmtVal(r))} per contract{ratioClause}.</>
        : <>{vendorName} pagó {strong(fmtVal(r))} por contrato{ratioClause}.</>
    }
  }

  return (
    <div className="pt-1 pb-2 flex items-start gap-3">
      <span className="inline-block self-stretch w-[3px] flex-shrink-0 rounded-sm" style={{ background: accent }} aria-hidden="true" />
      <p className="text-text-secondary leading-snug flex-1 min-w-0" style={{ fontSize: 14, fontFamily: 'var(--font-family-editorial)', fontStyle: 'normal' }}>
        {body}
      </p>
      <span className="hidden min-[480px]:inline-block flex-shrink-0 font-mono tabular-nums text-right whitespace-nowrap" style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
        {formatNumber(ctxCount)} · {formatCompactMXN(ctxValue)} ≈ {formatCompactUSD(ctxValue)}
      </span>
    </div>
  )
}

// One bullet-vs-benchmark row. Geometry is identical for every vendor; the
// deviation WEDGE between the vendor marker and the sector median tick IS the
// finding. Dual-anchored: a sector-median tick AND (where relevant) an absolute
// reference (OECD 25%), so a captured sector's norm can't read as exoneration.
function Z3DeviationCell({ row, isStrongest, smallN, lang }: { row: Z3LedgerRow; isStrongest: boolean; smallN: boolean; lang: 'en' | 'es' }) {
  const hasMedian = row.medianVal != null
  const domainMax = row.kind === 'pct' || row.kind === 'score'
    ? 100
    : Math.max(row.vendorVal, row.medianVal ?? 0, 1) * 1.5
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const vPos = clamp(row.vendorVal / domainMax)
  const mPos = hasMedian ? clamp((row.medianVal as number) / domainMax) : null
  const refPos = row.absoluteRef ? clamp(row.absoluteRef.value / domainMax) : null
  const overNorm = hasMedian && row.vendorVal > (row.medianVal as number)
  // Color semantics (warms the band out of an all-grey read): the avg-risk metric
  // carries its own risk-level hue (medium/high → amber, critical → red, low →
  // muted); any alarm goes critical; any metric running OVER the sector norm takes
  // the ochre deviation accent. Below-norm non-risk metrics stay ink/muted — never
  // green for low risk (Bible §3.10).
  const riskHue = row.key === 'risk' ? RISK_COLORS[getRiskLevelFromScore(row.vendorVal / 100)] : null
  const hue = row.alarm ? RISK_COLORS.critical : (riskHue ?? (overNorm ? OCHRE : null))
  const wedgeColor = hue ?? 'var(--color-text-muted)'
  // Compact money for the readout — abbreviate even below 1M (formatCompactMXN
  // returns full pesos under 1M, which overflows the narrow cell).
  const fmtMoney = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} MDP` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `$${Math.round(v)}`)
  const fmt = (v: number) => (row.kind === 'mxn' ? fmtMoney(v) : row.kind === 'score' ? `${v.toFixed(0)} /100` : `${v.toFixed(0)}%`)
  const lo = mPos != null ? Math.min(vPos, mPos) : vPos
  const hi = mPos != null ? Math.max(vPos, mPos) : vPos
  const valColor = hue ? riskInk(hue) : 'var(--color-text-primary)'
  const dotColor = hue ?? 'var(--color-text-secondary)'
  const ratioColor = hue ? riskInk(hue) : 'var(--color-text-muted)'
  const accentBorder = isStrongest ? (hue ?? OCHRE) : 'transparent'
  // FT "emphasis": only the strongest cell keeps its hue; the rest read in ink.
  const ink = (c: string) => (isStrongest ? c : 'var(--color-text-primary)')
  const legend = [
    hasMedian ? (lang === 'en' ? `sector median ${fmt(row.medianVal as number)}` : `mediana del sector ${fmt(row.medianVal as number)}`) : null,
    row.absoluteRef ? (lang === 'en' ? `EU benchmark ${row.absoluteRef.value}%` : `referencia UE ${row.absoluteRef.value}%`) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col" style={{ borderTop: `2px solid ${accentBorder}`, paddingTop: 4 }} title={legend || undefined}>
      {/* eyebrow */}
      <span className="font-mono uppercase leading-tight" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
        {row.label}
      </span>
      {/* value · ratio · percentile on one line */}
      <span className="flex items-baseline gap-1.5" style={{ marginTop: 2 }}>
        <span className="font-mono tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: ink(valColor), lineHeight: 1 }}>
          {fmt(row.vendorVal)}
        </span>
        <span className="font-mono tabular-nums" style={{ fontSize: 11, color: ink(ratioColor) }}>
          {row.ratio != null ? `${row.ratio.toFixed(1)}×` : hasMedian ? `vs ${fmt(row.medianVal as number)}` : '·'}
        </span>
        {row.percentile != null && (
          <span className="font-mono tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' }}>
            p{Math.round(row.percentile)}
          </span>
        )}
      </span>
      {/* mini bullet track — same five layers as the old full-width row, at a
          quarter of the width so the vendor marker lands meaningfully */}
      <span className="relative block" style={{ height: 13, marginTop: 3 }}>
        <span aria-hidden="true" className="absolute left-0 right-0" style={{ top: '50%', height: 2, background: 'var(--color-border)', borderRadius: 1, transform: 'translateY(-50%)' }} />
        {mPos != null && hi > lo && (
          <span
            aria-hidden="true"
            className="absolute"
            style={{
              left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, top: '50%', height: 6,
              transform: 'translateY(-50%)',
              background: smallN ? 'transparent' : (isStrongest ? wedgeColor : 'var(--color-text-muted)'),
              border: smallN ? `1px dashed ${isStrongest ? wedgeColor : 'var(--color-text-muted)'}` : 'none',
              opacity: smallN ? 0.7 : (overNorm ? 0.85 : 0.45),
              borderRadius: 1,
            }}
          />
        )}
        {refPos != null && (
          <span aria-hidden="true" className="absolute" style={{ left: `${refPos * 100}%`, top: 0, bottom: 0, width: 1.5, background: REF_CYAN }} title={`${row.absoluteRef?.label} ${row.absoluteRef?.value}%`} />
        )}
        {mPos != null && (
          <span aria-hidden="true" className="absolute" style={{ left: `${mPos * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--color-text-secondary)', opacity: 0.7 }} />
        )}
        <span className="absolute rounded-full" style={{ left: `${vPos * 100}%`, top: '50%', width: 8, height: 8, marginLeft: -4, transform: 'translateY(-50%)', background: ink(dotColor), boxShadow: '0 0 0 2px var(--color-background)' }} />
      </span>
    </div>
  )
}

function Z3DeviationBand({ rows, strongestKey, smallN, multiSector, lang }: { rows: Z3LedgerRow[]; strongestKey: Z3LedgerRow['key'] | null; smallN: boolean; multiSector: boolean; lang: 'en' | 'es' }) {
  return (
    <div className="pb-1" role="group" aria-label={lang === 'en' ? 'The deviation — vs the sector norm' : 'La desviación frente a la mediana del sector'}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {rows.map((r) => <Z3DeviationCell key={r.key} row={r} isStrongest={r.key === strongestKey} smallN={smallN} lang={lang} />)}
      </div>
      {(smallN || multiSector) && (
        <div className="mt-2 font-serif" style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'normal' }}>
          {smallN && (lang === 'en' ? 'few contracts — interpret deviations with caution. ' : 'pocos contratos: interprete las desviaciones con cautela. ')}
          {multiSector && (lang === 'en' ? 'multi-sector vendor — sector baseline approximate.' : 'proveedor multi-sector — base sectorial aproximada.')}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Z4 — Contract drawer
// Slides in from the right at 440px when focus.kind === 'contract'. The
// Z3 register stays visible behind it (compressed on the left) so the
// reader never loses the constellation of sibling contracts.
// Inline preview, not a full page — "Open full contract page ↗" links
// to the canonical /contracts/:id dossier for the deep dive.
// ────────────────────────────────────────────────────────────────────────────

function Z4Drawer({
  contractId,
  lang,
  dispatch,
  sectorAccent,
}: {
  contractId: number
  lang: 'en' | 'es'
  dispatch: ReturnType<typeof useExploreDispatch>
  sectorAccent: string
}) {
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion() ?? false

  // D15 § 6 — dialog focus (the Day 13b pattern): the drawer takes focus on
  // open and hands it back to the element that opened it (the Z3 row) on close.
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // Esc closes the drawer — pops back to Z3 vendor focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'pop-to-level', level: 3 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const { data: contract, isLoading } = useQuery({
    queryKey: ['explore', 'z4-contract', contractId],
    queryFn: async () => {
      const { contractApi } = await import('@/api/client')
      return contractApi.getById(contractId)
    },
    enabled: contractId > 0,
    staleTime: 10 * 60 * 1000,
  })

  const { data: explanation } = useQuery({
    queryKey: ['explore', 'z4-explain', contractId],
    queryFn: async () => {
      const { contractApi } = await import('@/api/client')
      return contractApi.getRiskExplanation(contractId)
    },
    enabled: contractId > 0,
    staleTime: 10 * 60 * 1000,
  })

  const score = Number(contract?.risk_score ?? 0)
  const level = score > 0 ? getRiskLevelFromScore(score) : 'low'
  const fill = RISK_COLORS[level]
  const riskPct = score > 0 ? Math.round(score * 100) : null

  // Top-3 SHAP contributors — sorted by absolute contribution descending,
  // then filtered to positive (risk-increasing) and negative (protective).
  const topContributors = (() => {
    const features = explanation?.features ?? []
    return [...features].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4)
  })()

  // Signals row — high-signal procurement flags
  const signals: Array<{ label: string; color: string; tooltip: string }> = []
  if (contract?.is_direct_award) {
    signals.push({
      label: lang === 'en' ? 'DIRECT AWARD' : 'ADJ. DIRECTA',
      color: RISK_COLORS.high,
      tooltip: lang === 'en' ? 'Awarded without an open bid' : 'Otorgado sin licitación pública',
    })
  }
  if (contract?.is_single_bid) {
    signals.push({
      label: lang === 'en' ? 'SINGLE AWARD' : 'UN SOLO ADJUDICADO',
      color: RISK_COLORS.critical,
      tooltip: lang === 'en' ? 'Competitive procedure with only one winner' : 'Procedimiento competitivo con un solo adjudicado',
    })
  }
  if (contract && Number(contract.amount_mxn) > 500_000_000) {
    signals.push({
      label: lang === 'en' ? 'LARGE' : 'ALTO MONTO',
      color: RISK_COLORS.medium,
      tooltip: lang === 'en' ? 'Contract value exceeds 500M MXN' : 'Valor del contrato supera 500 MDP',
    })
  }
  if (contract?.is_year_end) {
    signals.push({
      label: lang === 'en' ? 'YEAR-END' : 'FIN DE AÑO',
      color: RISK_COLORS.medium,
      tooltip: lang === 'en' ? 'Awarded in November or December' : 'Otorgado en noviembre o diciembre',
    })
  }
  if (contract?.is_threshold_gaming) {
    signals.push({
      label: lang === 'en' ? 'THRESHOLD GAMING' : 'AL FILO DEL UMBRAL',
      color: RISK_COLORS.critical,
      tooltip: lang === 'en' ? 'Amount suspiciously close to procedure threshold' : 'Monto cerca del umbral del procedimiento',
    })
  }
  if (contract?.is_framework) {
    signals.push({
      label: lang === 'en' ? 'FRAMEWORK' : 'CONVENIO MARCO',
      color: 'var(--color-text-secondary)',
      tooltip: lang === 'en' ? 'Framework / open-order contract' : 'Convenio marco / abierto',
    })
  }

  // Localized risk-level label + a one-sentence editorial lede assembled from
  // the contract's own fields — gives the drawer a voice on first read and lets
  // the amount be the single Playfair hero (risk demotes to a chip beside it).
  const levelLabel = lang === 'en'
    ? level
    : (({ low: 'bajo', medium: 'medio', high: 'alto', critical: 'crítico' } as Record<string, string>)[level] ?? level)
  const ledeText = (() => {
    const amountStr = formatCompactMXN(Number(contract?.amount_mxn ?? 0))
    const procPhrase = contract?.is_direct_award
      ? (lang === 'en' ? 'by direct award' : 'por adjudicación directa')
      : contract?.is_single_bid
        ? (lang === 'en' ? 'as the single winner' : 'como único adjudicado')
        : (lang === 'en' ? 'by open bid' : 'por licitación')
    const inst = contract?.institution_name ? toEditorialCase(contract.institution_name) : null
    const vend = contract?.vendor_name ? toEditorialCase(formatVendorName(contract.vendor_name, 60)) : null
    const riskClause = riskPct != null
      ? (lang === 'en' ? ` The model scores it ${riskPct}/100 — ${levelLabel}.` : ` Su indicador de riesgo es ${riskPct} de 100 (${levelLabel}).`)
      : ''
    if (inst && vend) return lang === 'en'
      ? `${inst} awarded ${amountStr} to ${vend} ${procPhrase}.${riskClause}`
      : `${inst} adjudicó ${amountStr} a ${vend} ${procPhrase}.${riskClause}`
    if (vend) return lang === 'en'
      ? `${vend} received ${amountStr} ${procPhrase}.${riskClause}`
      : `${vend} recibió ${amountStr} ${procPhrase}.${riskClause}`
    return lang === 'en'
      ? `${amountStr} contract, ${procPhrase}.${riskClause}`
      : `Contrato de ${amountStr}, ${procPhrase}.${riskClause}`
  })()

  return (
    <>
      {/* Dismiss-on-outside-click overlay — invisible scrim, clicking it
          pops to Z3. Not a darkened backdrop because we want Z3 fully
          visible behind the drawer. */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={T.fast}
        className="absolute inset-0 z-[6] cursor-default"
        style={{ background: 'transparent' }}
        onClick={() => dispatch({ type: 'pop-to-level', level: 3 })}
        aria-label={lang === 'en' ? 'Close contract drawer' : 'Cerrar panel del contrato'}
      />
      {/* The drawer itself */}
      <motion.aside
        initial={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
        animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
        transition={prefersReducedMotion ? T.none : { duration: Z_DRAWER_S, ease: Z_EASE }}
        className="absolute right-0 z-[7] flex flex-col overflow-hidden"
        style={{
          top: 0,
          bottom: 0,
          width: 'min(440px, 100vw)',
          background: 'var(--color-background)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.18)',
        }}
        role="dialog"
        aria-modal="false"
        aria-label={lang === 'en' ? 'Contract dossier preview' : 'Vista previa del contrato'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top sector-color rail — visual continuity with Z1/Z2/Z3 */}
        <div style={{ height: 6, background: sectorAccent, flexShrink: 0 }} aria-hidden="true" />

        {/* Close button */}
        <div className="px-4 sm:px-5 pt-3 flex items-center justify-between flex-shrink-0">
          <span className="font-mono text-[12px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-accent-text)' }}>
            {lang === 'en' ? '§ EL CONTRATO · CONTRACT DEEP' : '§ EL CONTRATO · CONTRATO'}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => dispatch({ type: 'pop-to-level', level: 3 })}
            className={`font-mono text-[14px] leading-none px-1.5 py-0.5 rounded-sm cursor-pointer hover:opacity-70 transition-opacity ${Z_FOCUS_RING}`}
            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none' }}
            aria-label={lang === 'en' ? 'Close' : 'Cerrar'}
            title={lang === 'en' ? 'Esc to close' : 'Esc para cerrar'}
          >
            ×
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center font-serif text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {lang === 'en' ? 'loading contract...' : 'cargando contrato...'}
          </div>
        )}

        {/* Body */}
        {!isLoading && contract && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-4">
            {/* Contract number */}
            {contract.contract_number && (
              <div className="font-mono text-[12px] tabular-nums pt-2 mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                #{contract.contract_number}
              </div>
            )}

            {/* Verdict lede — one editorial sentence (sector-rule) */}
            <p
              className="leading-snug mb-3"
              style={{
                fontFamily: 'var(--font-family-editorial)',
                fontStyle: 'normal',
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                borderLeft: `2px solid ${sectorAccent}`,
                paddingLeft: 10,
              }}
            >
              {ledeText}
            </p>

            {/* Fused fact-strip — amount is the lone Playfair hero; risk demotes
                to a number + level chip + thin bar on the right (no second hero) */}
            <div
              className="flex items-stretch justify-between gap-4 py-2.5"
              style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="min-w-0">
                <div
                  className="font-serif tabular-nums leading-none"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 800, fontStyle: 'normal', color: riskInk(fill), letterSpacing: '-0.015em' }}
                >
                  {formatCompactMXN(Number(contract.amount_mxn ?? 0))}
                </div>
                <div className="font-mono text-[12px] tabular-nums mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  ≈ {formatCompactUSD(Number(contract.amount_mxn ?? 0), contract.contract_year ?? undefined)} · {contract.contract_year ?? '—'}
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end justify-center" style={{ minWidth: 132 }}>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {lang === 'en' ? 'Risk' : 'Riesgo'}
                </div>
                {riskPct == null ? (
                  <span className="font-mono text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    {lang === 'en' ? 'Not scored' : 'Sin indicador de riesgo'}
                  </span>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: riskInk(fill), lineHeight: 1 }}>{riskPct}</span>
                      <span className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>/100</span>
                      <span
                        className="font-mono text-[11px] uppercase tracking-[0.10em] px-1 py-0.5 rounded-sm"
                        style={{ background: `${fill}1f`, color: riskInk(fill), fontWeight: 700, border: `1px solid ${fill}44` }}
                      >
                        {levelLabel}
                      </span>
                    </div>
                    <div className="relative mt-1.5 rounded-sm overflow-hidden" style={{ height: 4, width: 128, background: 'var(--color-background-elevated)' }} aria-hidden="true">
                      <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.min(100, riskPct)}%`, background: fill, opacity: 0.92 }} />
                      {[25, 40, 60].map((t) => (
                        <span key={t} className="absolute inset-y-0 w-px" style={{ left: `${t}%`, background: 'rgba(0,0,0,0.10)' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Description — COMPRANET ships ALL-CAPS; shortenContractName gives
                the canonical sentence-case + institution-abbrev treatment. */}
            {(contract.description ?? contract.title) && (
              <p
                className="leading-snug"
                style={{ fontFamily: 'var(--font-family-editorial)', fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 14, marginBottom: 14 }}
              >
                {shortenContractName((contract.description ?? contract.title) ?? '', 240)}
              </p>
            )}

            {/* Parties + Procedure — one 2-column grid (was two stacked sections) */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              {/* Parties column */}
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {lang === 'en' ? 'Parties' : 'Partes'}
                </div>
                <div className="space-y-1.5">
                  {contract.vendor_id && contract.vendor_name && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'drill-into-vendor', vendorId: contract.vendor_id!, vendorName: contract.vendor_name! })}
                      className={`block w-full text-left cursor-pointer hover:opacity-70 transition-opacity ${Z_FOCUS_RING}`}
                    >
                      <span className="block font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: 'var(--color-text-muted)' }}>
                        {lang === 'en' ? 'Vendor' : 'Proveedor'}
                      </span>
                      <span className="block text-[11.5px] leading-snug" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {toEditorialCase(formatVendorName(contract.vendor_name, 200))} ↗
                      </span>
                    </button>
                  )}
                  {contract.institution_id && contract.institution_name && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'drill-into-institution', institutionId: contract.institution_id!, institutionName: contract.institution_name! })}
                      className={`block w-full text-left cursor-pointer hover:opacity-70 transition-opacity ${Z_FOCUS_RING}`}
                    >
                      <span className="block font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: 'var(--color-text-muted)' }}>
                        {lang === 'en' ? 'Institution' : 'Institución'}
                      </span>
                      <span className="block text-[11.5px] leading-snug" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {toEditorialCase(contract.institution_name)} ↗
                      </span>
                    </button>
                  )}
                  {contract.sector_name && (
                    <div>
                      <span className="block font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: 'var(--color-text-muted)' }}>
                        {lang === 'en' ? 'Sector' : 'Sector'}
                      </span>
                      <span className="block text-[11.5px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                        {contract.sector_name}
                      </span>
                    </div>
                  )}
                </div>
                {signals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {signals.map((s, i) => (
                      <span
                        key={i}
                        className="font-mono text-[11px] uppercase tracking-[0.08em] px-1 py-0.5 rounded-sm"
                        style={{ background: `${s.color}1f`, color: riskInk(s.color), border: `1px solid ${s.color}44`, fontWeight: 700 }}
                        title={s.tooltip}
                      >
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Procedure column */}
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {lang === 'en' ? 'Procedure' : 'Procedimiento'}
                </div>
                <dl className="space-y-1">
                  {contract.procedure_number && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'No.' : 'Núm.'} value={contract.procedure_number} mono />
                  )}
                  {(contract.procedure_type_normalized ?? contract.procedure_type) && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'Type' : 'Tipo'} value={localizeProcedure(contract.procedure_type_normalized ?? contract.procedure_type, lang)} />
                  )}
                  {contract.award_date && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'Awarded' : 'Otorgado'} value={contract.award_date} mono />
                  )}
                  {contract.contract_date && !contract.award_date && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'Date' : 'Fecha'} value={contract.contract_date} mono />
                  )}
                  {contract.publication_date && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'Published' : 'Publicado'} value={contract.publication_date} mono />
                  )}
                  {contract.data_quality_grade && (
                    <Z4ProcedureRow lang={lang} label={lang === 'en' ? 'Quality' : 'Calidad'} value={dataQualityLevel(contract.data_quality_grade, lang === 'en' ? 'en' : 'es')} />
                  )}
                </dl>
                {contract.url && (
                  <a
                    href={safeHttpUrl(contract.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1.5 font-serif text-[13px] underline underline-offset-[3px] hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {lang === 'en' ? 'Source' : 'Fuente'} ↗
                  </a>
                )}
              </div>
            </div>

            {/* Why the model scored it — SHAP as inline pills (top 3) */}
            {explanation?.explanation_available && topContributors.length > 0 && (
              <div className="mt-3" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {lang === 'en' ? 'Why the model scored it' : 'Qué sube o baja su indicador de riesgo'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {topContributors.slice(0, 3).map((f, i) => {
                    const isPositive = f.contribution > 0
                    const factorColor = isPositive ? fill : 'var(--color-text-muted)'
                    const sign = isPositive ? '+' : ''
                    return (
                      <span
                        key={i}
                        className="inline-flex items-baseline gap-1 font-mono text-[13px] px-1.5 py-0.5 rounded-sm"
                        style={{ background: `${factorColor}14`, border: `1px solid ${factorColor}33`, color: 'var(--color-text-primary)' }}
                      >
                        <span aria-hidden="true" style={{ color: factorColor, fontWeight: 700 }}>{isPositive ? '▲' : '▽'}</span>
                        <span>{factorLabel(f, lang)}</span>
                        <span className="tabular-nums" style={{ color: riskInk(factorColor), fontWeight: 700 }}>{sign}{f.contribution.toFixed(2)}</span>
                      </span>
                    )
                  })}
                </div>
                {explanation.model_version && (
                  <div className="font-mono text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    {lang === 'en' ? 'model' : 'modelo'} {explanation.model_version}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer — outbound to canonical contract page */}
        {!isLoading && contract && (
          <div
            className="px-4 sm:px-5 py-3 flex-shrink-0 flex items-center justify-between"
            style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-background)' }}
          >
            <span className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--color-text-muted)', maxWidth: '45%' }}>
              #{contract.id}{contract.sector_name ? ` · ${contract.sector_name}` : ''}
            </span>
            <button
              type="button"
              onClick={() => navigate(`/contracts/${contract.id}`)}
              className={`inline-flex items-center gap-1.5 font-serif text-[12px] underline underline-offset-[3px] hover:opacity-70 transition-opacity ${Z_FOCUS_RING}`}
              style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {lang === 'en' ? 'Open full contract page' : 'Ver ficha completa'} ↗
            </button>
          </div>
        )}
      </motion.aside>
    </>
  )
}

/** Procedure-row helper used inside Z4Drawer. Label stacked over value so the
 *  long procedure number gets the full (narrow) grid-cell width and wraps
 *  cleanly instead of being crushed beside a fixed-width label. */
function Z4ProcedureRow({ label, value, mono = false }: { lang: 'en' | 'es'; label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt
        className="font-mono text-[11px] uppercase tracking-[0.10em]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </dt>
      <dd
        className="text-[13px] leading-snug break-words"
        style={{
          color: 'var(--color-text-primary)',
          fontFamily: mono ? 'var(--font-family-mono, monospace)' : undefined,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
