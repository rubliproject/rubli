import { lazy, Suspense, useState } from 'react'
import { NotFound } from './pages/NotFound'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api, ariaApi, categoriesApi } from '@/api/client'
import { capturaApi } from '@/api/captura'
import { noSeVeApi } from '@/api/noSeVe'
import { dataCutQuery } from '@/lib/useDataCut'
import { executiveSummaryQuery } from '@/hooks/useExecutiveSummary'
import { prefetchVendorDossier } from '@/hooks/useVendorData'
import { dashboardBundleQuery } from '@/hooks/useExecutiveData'
import { skyManifestQuery } from '@/lib/atlas/sky/useSky'
import { eventsQuery } from '@/lib/wire'
import { AuthProvider } from '@/contexts/AuthProvider'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react-router'
import { ToastProvider } from '@/components/ui/toast'
import { MainLayout } from '@/components/layout/MainLayout'
import { SuspenseBoundary } from '@/components/SuspenseBoundary'
import {
  TablePageSkeleton,
  CardGridSkeleton,
  DetailPageSkeleton,
  GenericPageSkeleton,
} from '@/components/LoadingSkeleton'
import { EntityDrawerProvider } from '@/contexts/EntityDrawerProvider'
import Mapa from '@/pages/Mapa'
import { cieloHref, loadCielo, loadLista, vistaOf } from '@/lib/vista'
import { useEntityDrawer } from '@/contexts/EntityDrawerContext'
import { WayfindingProvider } from '@/lib/nav/WayfindingProviders'
import { FALLO_LIVE, FILMS_LIVE, GAP_LIVE, RASTRO_LIVE, STORIES_LIVE } from '@/lib/constants'
const EntityProfileDrawer = lazy(() =>
  import('@/components/EntityProfileDrawer').then(m => ({ default: m.EntityProfileDrawer }))
)

// PERF launch § 4: fetch the drawer chunk (and the recharts it draws with) on the
// first open, not on every page load. It renders nothing while closed anyway.
function LazyEntityDrawer() {
  const { state } = useEntityDrawer()
  const [opened, setOpened] = useState(false)
  if (state.entityId !== null && !opened) setOpened(true)
  return opened ? <Suspense fallback={null}><EntityProfileDrawer /></Suspense> : null
}

// El Mapa merge (spec _polish/merge/SPEC.md § 3): /explore and /spatial are Lista on `/mapa`,
// the old sky routes are Cielo on `/mapa?vista=vinculos` — both keep every query param.
// «Lo que no se ve» was renamed «Gasto a ciegas» (owner 2026-10-28); the old address keeps ?ente=&anio=.
function ToGastoACiegas() {
  const { search } = useLocation()
  return <Navigate to={`/gasto-a-ciegas${search}`} replace />
}

// «A destiempo» merged «El mismo día» into /antes-del-fallo as its second chapter (concept D, 2026-10-28):
// /mismo-dia keeps its query (?vista=lista) and lands on that chapter.
function ToMismoDia() {
  const { search } = useLocation()
  return <Navigate to={FALLO_LIVE ? `/antes-del-fallo${search}#mismo-dia` : '/'} replace />
}

function ToLista() {
  const { search } = useLocation()
  return <Navigate to={`/mapa${search}`} replace />
}
// `/` is the Portada (Dashboard). El Mapa lives at `/mapa`; an old shared `/?vista=…` / `/?s=…&i=…`
// link carries a Mapa query param and is sent there with every param kept. A plain `/` stays the Portada.
const MAPA_PARAMS = ['vista', 'zoom', 'lens', 'tab', 'star', 'planet', 'moon', 'pins', 'pin', 'vuelo', 'trail', 'period', 'yr', 'year', 'cam', 'cmp', 'lv', 'scope', 'story', 'vendor', 'code', 's', 'i', 'v', 'c']
function PortadaOrMapa() {
  const { search } = useLocation()
  const q = new URLSearchParams(search)
  if (MAPA_PARAMS.some((k) => q.has(k))) return <Navigate to={`/mapa${search}`} replace />
  return (
    <SuspenseBoundary fallback={<GenericPageSkeleton />}>
      <Executive />
    </SuspenseBoundary>
  )
}
function ToPortada() {
  const { search } = useLocation()
  return <Navigate to={`/${search}`} replace />
}
// merge § 6 step 3: /network is retired. A community opens La Trama inside the
// Vínculos view; a vendor or institution view goes to that dossier's own page.
function NetworkRedirect() {
  const q = new URLSearchParams(useLocation().search)
  const id = (k: string) => (/^\d{1,10}$/.test(q.get(k) ?? '') ? q.get(k) : null)
  const comm = id('comm') ?? id('community')
  const to = id('vendor') ? `/vendors/${id('vendor')}`
    : q.get('lens') === 'institutions' && id('inst') ? `/institutions/${id('inst')}`
    : cieloHref({ tab: comm ? `trama.${comm}` : 'trama' })
  return <Navigate to={to} replace />
}
function CommunityToTrama() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={cieloHref(/^\d{1,6}$/.test(id ?? '') ? { tab: `trama.${id}` } : { tab: 'trama' })} replace />
}
function ToCielo() {
  const { search } = useLocation()
  return <Navigate to={cieloHref(search)} replace />
}

// Lazy load all page components for code splitting
const Contracts = lazy(() => import('@/pages/Contracts'))
const ContractDetail = lazy(() => import('@/pages/ContractDetail'))
const ContractDossier = lazy(() => import('@/pages/ContractDossier'))
const ExploreLegacy = lazy(() => import('@/pages/explore'))
const Methodology = lazy(() => import('@/pages/Methodology'))
const VendorProfile = lazy(() => import('@/pages/VendorProfile'))
const loadVendorDossier = () => import('@/pages/VendorDossier')
const VendorDossier = lazy(loadVendorDossier)
const InstitutionThread = lazy(() => import('@/pages/InstitutionThread'))
const InstitutionDossier = lazy(() => import('@/pages/InstitutionDossier'))
const OfficialProfile = lazy(() => import('@/pages/OfficialProfile'))
// El Mapa (`/mapa`) loads its two views — Lista (SpatialMap) and Cielo (Atlas) — in pages/Mapa.tsx.
// 2026-05-11 Gap 2: /vendors/:id and /institutions/:id now redirect to
// the /explore deep link. The legacy dossier components survive at
// /print/vendors/:id and /print/institutions/:id for the printable
// surface. See docs/SCAFFOLDING_OF_THE_UNIVERSE.md Gap 2.
// Both DeepLinkRedirect components retired 2026-05-25/26 (DESIGNUS rounds 6+7):
// /vendors/:id → VendorDossier · /institutions/:id → InstitutionDossier.
const Gap = lazy(() => import('@/pages/Gap'))
const ADestiempo = lazy(() => import('@/pages/ADestiempo'))
// Landing pages (YELLOW perf 11-04): each loader starts the page's first query with its chunk, same key and
// fetcher as the page, so the data no longer waits for the chunk to download, run and render (~1.2 s on a phone).
const loadArranque = () => {
  void queryClient.prefetchQuery({ queryKey: ['newtabs', 'arranque'], queryFn: () => api.get('/newtabs/arranque', { timeout: 120_000 }).then((r) => r.data), staleTime: 60 * 60_000 })
  return import('@/pages/Arranque')
}
const Arranque = lazy(loadArranque)
const Rastro = lazy(() => import('@/pages/Rastro'))
const RastroRegistro = lazy(() => import('@/pages/RastroRegistro'))
const SectorProfile = lazy(() => import('@/pages/SectorProfile'))
const SectorDossier = lazy(() => import('@/pages/SectorDossier'))
const Administrations = lazy(() => import('@/pages/Administrations'))
// Dev-only: the motion kit on real data (/dev/motion-kit). The false branch tree-shakes out of prod builds.
const MotionKitDemo = import.meta.env.DEV ? lazy(() => import('@/pages/dev/MotionKitDemo')) : null
// PriceIntelligence — orphan removed 2026-05-07 (Audit Fix M); /price-analysis
// route now redirects to /sectors. Component file preserved for v1.1 if a
// real consumer surfaces.
// v1.0 launch cuts — components retained on disk for v1.1, no longer imported.
// See docs/RUBLI_v1.0_LAUNCH_PLAN.md for the cut list.
//   ModelTransparency        → /methodology
//   Investigation/Case       → /aria
//   YearInReview             → /
//   VendorCompare            → /sectors
//   CorruptionClusters       → /atlas
//   ProcurementCalendar      → /
const loadExecutive = () => import('@/pages/Executive')
const Executive = lazy(loadExecutive)
// The page's one query starts with its chunk download, not after the chunk has
// loaded and rendered (~0.7 s later on a throttled phone).
const loadCategoriesIndex = () => {
  void queryClient.prefetchQuery({ queryKey: ['categories', 'summary'], queryFn: () => categoriesApi.getSummary(), staleTime: 600_000 })
  // The default tab's field payload too, so it doesn't wait on the Anaquel chunk.
  void queryClient.prefetchQuery({ queryKey: ['categories', 'field'], queryFn: () => categoriesApi.getField(), staleTime: 600_000 })
  return import('@/pages/CategoriesIndex')
}
const CategoriesIndex = lazy(loadCategoriesIndex)
const CategoryProfile = lazy(() => import('@/pages/CategoryProfile'))
const CategoryDossier = lazy(() => import('@/pages/CategoryDossier'))
const CaseLibrary = lazy(() => import('@/pages/CaseLibrary'))
const CaseDetail = lazy(() => import('@/pages/CaseDetail'))
const CaseDossier = lazy(() => import('@/pages/CaseDossier'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const AriaQueue = lazy(() => import('@/pages/AriaQueue'))
// Focos Rojos «El mapa de la fila» (owner 2026-11-02, final Fable round) rides /aria?ver=mapa
const AriaMapa = lazy(() => import('@/pages/AriaMapa'))
// «¿Quién muestra más señales de riesgo…?» (concept round 2026-11-03) is the DEFAULT /aria since rc4 (owner 11-04);
// the previous queue lives at /aria?ver=clasico.
const loadAriaConcept = () => {
  void queryClient.prefetchQuery({ queryKey: ['aria-escenario'], queryFn: () => ariaApi.getEscenario(), staleTime: 3_600_000 })
  return import('@/pages/AriaConcept')
}
const AriaConcept = lazy(loadAriaConcept)
// Deep links that carry the classic queue's own filters (vendor, ids, pattern, tier, q, category_id, open) keep landing on it.
const ARIA_CLASSIC_PARAMS = ['vendor', 'ids', 'pattern', 'tier', 'q', 'category_id', 'open']
function AriaEntry() {
  const { search } = useLocation()
  const p = new URLSearchParams(search)
  const ver = p.get('ver')
  if (!ver && ARIA_CLASSIC_PARAMS.some((k) => p.has(k))) { p.set('ver', 'clasico'); return <Navigate to={`/aria?${p}`} replace /> }
  return ver === 'clasico' ? <AriaQueue /> : ver === 'mapa' ? <AriaMapa /> : <AriaConcept />
}
const AriaCase = lazy(() => import('@/pages/AriaCase'))
const loadCaptura = () => {
  if (!new URLSearchParams(window.location.search).has('vista')) {
    void queryClient.prefetchQuery({ queryKey: ['captura', 'plates', 'federal'], queryFn: () => capturaApi.plates('federal'), staleTime: 30 * 60 * 1000 })
  }
  return import('@/pages/Captura')
}
const Captura = lazy(loadCaptura)
const loadNoSeVe = () => {
  void queryClient.prefetchQuery({ queryKey: ['no-se-ve', 'page'], queryFn: () => noSeVeApi.page(), staleTime: 60 * 60 * 1000 })
  return import('@/pages/NoSeVe')
}
const NoSeVe = lazy(loadNoSeVe)
const Journalists = lazy(() => import('@/pages/Journalists'))
const StoryNarrative = lazy(() => import('@/pages/StoryNarrative'))
const InstitutionLeague = lazy(() => import('@/pages/InstitutionLeague'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const About = lazy(() => import('@/pages/About'))
const Terms = lazy(() => import('@/pages/Terms'))
const ChartCatalog = lazy(() => import('@/pages/_dev/ChartCatalog'))
const KitPage = lazy(() => import('@/pages/dev/Kit'))
// dev builds only: the import is dropped from the prod bundle, so the specimen never ships
const DevPatterns = import.meta.env.DEV ? lazy(() => import('@/pages/_dev/Patterns')) : null
const PatternDossier = lazy(() => import('@/pages/PatternDossier'))
const Gallery = lazy(() => import('@/pages/Gallery'))
const Press = lazy(() => import('@/pages/Press'))
const Datos = lazy(() => import('@/pages/Datos'))

// /atlas/stories/:slug → the sky's flight (spec .claude/designs/atlas-2026-10-02-spec.md §3.11.6)
function StoryToFlight() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={cieloHref({ vuelo: slug ?? '' })} replace />
}

// Redirect /sector/:id → /sectors/:id (singular alias)
function SectorRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/sectors/${id}`} replace />
}

// /thread/:vendorId retired 2026-06-07 — the vendor narrative was folded into
// the single /vendors/:id dossier. Redirect preserves external/bookmarked
// thread links (same pattern as /observatorio → the Cielo view of /).
function ThreadRedirect() {
  const { vendorId } = useParams<{ vendorId: string }>()
  return <Navigate to={`/vendors/${vendorId}`} replace />
}

// /patterns/:code/constellation retired 2026-09 with the legacy zoom engine. The sky
// (spec §3.10) no longer draws pattern cohorts: the link lands on the pattern's own
// dossier, which carries its vendors and the hand-off to /aria.
function PatternCohortRedirect() {
  const { code } = useParams<{ code: string }>()
  return <Navigate to={`/patterns/${encodeURIComponent(code ?? '')}`} replace />
}

// Enhanced QueryClient configuration for better caching and UX
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Global error handler — logs all query failures to console.
    // Individual components can add their own error UI on top.
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[QueryClient]', msg);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache after unmount
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status != null && status >= 400 && status < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

// Landing on one of these routes: start its chunk (and data) now, while the shell
// evaluates and renders, rather than when the router first renders it — ~1.5 s
// later on a throttled phone. import() is cached, so lazy() reuses the request.
{
  const path = window.location.pathname
  const vendorId = path.match(/^\/vendors\/(\d+)\/?$/)?.[1]
  if (vendorId) prefetchVendorDossier(queryClient, Number(vendorId))
  const search = window.location.search
  // El Mapa: /mapa, the /explore and /vendors aliases, or an old `/?vista=…` link (PortadaOrMapa).
  const mapa = /^\/(mapa|explore|vendors)\/?$/.test(path)
    || (path === '/' && MAPA_PARAMS.some((k) => new URLSearchParams(search).has(k)))
  const early = /^\/categories\/?$/.test(path) ? loadCategoriesIndex
    : vendorId ? loadVendorDossier
    : mapa ? (vistaOf(search) === 'cielo' ? loadCielo : loadLista)
    : path === '/' ? loadExecutive
    : /^\/aria\/?$/.test(path) && !new URLSearchParams(search).has('ver') && !ARIA_CLASSIC_PARAMS.some((k) => new URLSearchParams(search).has(k)) ? loadAriaConcept
    : /^\/captura\/?$/.test(path) ? loadCaptura
    : /^\/gasto-a-ciegas\/?$/.test(path) ? loadNoSeVe
    : /^\/arranque\/?$/.test(path) ? loadArranque
    : null
  // Every page's top bar waits on these two (LiveStatus is the LCP element on most pages): start them
  // with the shell, not after the route chunk renders the bar (~1.4 s later on a throttled phone).
  void queryClient.prefetchQuery(dataCutQuery)
  void queryClient.prefetchQuery(executiveSummaryQuery)
  // Portada's first screen waits on the sky manifest + the dashboard bundle: start both with the chunk.
  if (early === loadExecutive) {
    void queryClient.prefetchQuery(skyManifestQuery)
    void queryClient.prefetchQuery(dashboardBundleQuery)
    // the wire + «Lo más reciente» (one precomputed feed, ~20 KB gz): no wait on the Portada chunk
    void queryClient.prefetchQuery(eventsQuery)
  }
  // A failed fetch surfaces through lazy() and the route's error boundary.
  early?.().catch(() => {})
}

// Auth gate — every app route lives under MainLayout, which is wrapped in this.
// While the stored token is being validated, show a skeleton; if there's no
// authenticated user, bounce to the login wall. Mirrors the backend middleware.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // RUBLI is open to everyone by default. Set VITE_REQUIRE_AUTH=1 to restore
  // the login wall (mirrors the backend RUBLI_REQUIRE_AUTH gate).
  const requireAuth = import.meta.env.VITE_REQUIRE_AUTH === '1'
  const { user, isLoading } = useAuth()
  if (!requireAuth) return <>{children}</>
  if (isLoading) return <GenericPageSkeleton />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* PARALLAX D1 § Change 5 / Track B: the house MotionConfig (reducedMotion="user" + T.base) now
          loads with each route in SuspenseBoundary → MotionScope, not on every first paint (launch
          audit 2026-10-28 S1). Nothing eager imports framer-motion; keep it that way, or wrap it. */}
      <ToastProvider>
          <AuthProvider>
          <EntityDrawerProvider>
          <BrowserRouter>
          <NuqsAdapter>
          <WayfindingProvider>
          {/* Backstop for anything outside a route boundary that suspends on a lazy i18n namespace. */}
          <Suspense fallback={null}>
          <Routes>
            {MotionKitDemo && <Route path="dev/motion-kit" element={<SuspenseBoundary fallback={null}><MotionKitDemo /></SuspenseBoundary>} />}
            {/* Public auth pages — full-screen, no sidebar */}
            <Route
              path="login"
              element={
                <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                  <LoginPage />
                </SuspenseBoundary>
              }
            />
            <Route
              path="register"
              element={
                <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                  <RegisterPage />
                </SuspenseBoundary>
              }
            />
            {/* Retired: /intro and /landing now redirect to the front page (/) */}
            <Route path="intro" element={<Navigate to="/" replace />} />
            <Route path="landing" element={<Navigate to="/" replace />} />
            {/* Internal — visual canon for canonical chart primitives. Not in main nav. */}
            <Route
              path="_dev/charts"
              element={
                <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                  <ChartCatalog />
                </SuspenseBoundary>
              }
            />
            {/* kit/patterns specimen (DESIGN.md § Patrones) — dev builds only, never in prod */}
            {DevPatterns && (
              <Route
                path="_dev/patterns"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <DevPatterns />
                  </SuspenseBoundary>
                }
              />
            )}
            <Route
              path="_dev/kit"
              element={
                <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                  <KitPage />
                </SuspenseBoundary>
              }
            />
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              {/* 2026-10-20: the Portada (Dashboard) is the front door at `/`; El Mapa moved to `/mapa`. */}
              <Route index element={<PortadaOrMapa />} />
              <Route path="mapa" element={<Mapa />} />
              {/* /dashboard was the Portada's old address; `/` is canonical now (search kept). */}
              <Route path="dashboard" element={<ToPortada />} />
              {/* Legacy aliases — all funnel into the Portada (`/`). */}
              <Route path="executive" element={<Navigate to="/" replace />} />
              <Route path="executive-summary" element={<Navigate to="/" replace />} />
              <Route
                path="report-card"
                element={<Navigate to="/institutions?tab=reporte" replace />}
              />
              {/* Institution URL aliases — various guessed routes all land on /institutions */}
              <Route path="institution-ranking" element={<Navigate to="/institutions" replace />} />
              <Route path="league" element={<Navigate to="/institutions" replace />} />
              <Route path="institution-league" element={<Navigate to="/institutions" replace />} />
              {/* Legacy /explore page (CardGrid catalog) — moved to /explore/legacy
                  to free /explore for the spatial-nav rebuild. */}
              <Route
                path="explore/legacy"
                element={
                  <SuspenseBoundary fallback={<CardGridSkeleton />}>
                    <ExploreLegacy />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="administrations"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Administrations />
                  </SuspenseBoundary>
                }
              />
              {/* the current term lives inside Sexenios (owner 2026-10-28) */}
              <Route path="sexenio-actual" element={<Navigate to="/administrations?g=sheinbaum" replace />} />
              {/* /categories — standalone landmark index page (SITE_IA.md) */}
              <Route
                path="categories"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CategoriesIndex />
                  </SuspenseBoundary>
                }
              />
              {/* 2026-05-27 Phase 5: /categories/:id is the canonical
                  unified category dossier. Replaces CategoryProfile
                  card-grid. /print/categories/:id preserves the legacy
                  surface for printable / reference use. */}
              <Route
                path="categories/:id"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CategoryDossier />
                  </SuspenseBoundary>
                }
              />
              {/* the subcategory mode of the same template, keyed by the stable code (PROFILE_CONTENT_CATEGORY § Subcategory profile) */}
              <Route
                path="categories/:id/sub/:code"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CategoryDossier />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="print/categories/:id"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CategoryProfile />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="contracts"
                element={
                  <SuspenseBoundary fallback={<TablePageSkeleton />}>
                    <Contracts />
                  </SuspenseBoundary>
                }
              />
              {/* 2026-05-27 Phase 4: /contracts/:id is the canonical
                  unified contract dossier. Replaces ContractDetail.
                  /print/contracts/:id preserves the legacy surface. */}
              <Route
                path="contracts/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <ContractDossier />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="print/contracts/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <ContractDetail />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="network"
                element={<NetworkRedirect />}
              />
              <Route path="network/community/:id" element={<CommunityToTrama />} />
              {/* /workspace dropped in v1.0 — RUBLI is a publication, not a workbench */}
              <Route path="workspace" element={<Navigate to="/" replace />} />
              <Route path="watchlist" element={<Navigate to="/" replace />} />
              {/* v1.0 launch cut — Investigation surfaces overlap with /aria.
                  Component files preserved for v1.1. See docs/RUBLI_v1.0_LAUNCH_PLAN.md. */}
              <Route path="investigation/:caseId" element={<Navigate to="/aria" replace />} />
              <Route path="investigation" element={<Navigate to="/aria" replace />} />
              <Route path="fila" element={<Navigate to="/aria" replace />} />
              <Route
                path="aria"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <AriaEntry />
                  </SuspenseBoundary>
                }
              />
              {/* one case of Focos Rojos: the vendor template + the case layer (owner 2026-10-27);
                  under /aria, so the noindex prefix and the TOC folio cover it */}
              <Route
                path="aria/caso/:vendorId"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <AriaCase />
                  </SuspenseBoundary>
                }
              />
              {/* /patterns index retired 2026-06-07 — Atlas (default lens =
                  patterns) is the canonical pattern index and already deep-links
                  into the dossiers. Index content migrated into PatternDossier
                  (§ How to investigate + § Los Siete Patrones). */}
              <Route path="patterns" element={<ToCielo />} />
              {/* /patterns/:code/constellation (legacy zoom engine, unlinked) removed 2026-09 —
                  retargeted to the pattern dossier /patterns/:code (atlas spec §3.10) */}
              <Route path="patterns/:code/constellation" element={<PatternCohortRedirect />} />
              <Route
                path="patterns/:code"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <PatternDossier />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="captura"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Captura />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="gasto-a-ciegas"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <NoSeVe />
                  </SuspenseBoundary>
                }
              />
              <Route path="no-se-ve" element={<ToGastoACiegas />} />
              {/* Legacy aliases → canonical /captura */}
              <Route path="relationships" element={<Navigate to="/captura" replace />} />
              {/* /intersection retired 2026-06-08 — its value (the model-vs-
                  official-record near-miss) is a credibility argument, now an
                  exhibit on /methodology; the leads live in /aria. */}
              <Route path="intersection" element={<Navigate to="/methodology#two-worlds" replace />} />
              <Route path="capture" element={<Navigate to="/captura" replace />} />
              {/* v1.0 launch cut — CorruptionClusters subsumed by /atlas. */}
              <Route path="clusters" element={<ToCielo />} />
              {/* The story player is retired: a story is a flight over the sky (spec §3.11.6) */}
              <Route path="atlas/stories/:slug" element={<StoryToFlight />} />
              {/* El Mapa merge (2026-10-08): the sky is the Cielo view of `/`. */}
              <Route path="atlas" element={<ToCielo />} />
              <Route path="observatorio" element={<ToCielo />} />
              <Route path="observatory"  element={<ToCielo />} />
              <Route path="spatial" element={<ToLista />} />
              {/* owner 2026-10-27: /sectors duplicated El Mapa · Cifras (El Reparto) — every old link lands there */}
              <Route path="sectors" element={<ToLista />} />
              <Route path="prensa" element={<Navigate to="/press" replace />} />
              <Route path="data" element={<Navigate to="/datos" replace />} />
              <Route
                path="datos"
                element={
                  <SuspenseBoundary fallback={<div className="p-8" />}>
                    <Datos />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="press"
                element={
                  <SuspenseBoundary fallback={<div className="p-8" />}>
                    <Press />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="antes-del-fallo"
                element={FALLO_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <ADestiempo />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />
              <Route
                path="arranque"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Arranque />
                  </SuspenseBoundary>
                }
              />
              <Route path="mismo-dia" element={<ToMismoDia />} />
              <Route
                path="rastro"
                element={RASTRO_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Rastro />
                  </SuspenseBoundary>
                ) : <Navigate to="/gasto-a-ciegas" replace />}
              />
              <Route
                path="rastro/registro"
                element={RASTRO_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <RastroRegistro />
                  </SuspenseBoundary>
                ) : <Navigate to="/gasto-a-ciegas" replace />}
              />
              <Route
                path="gap"
                element={GAP_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Gap />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />
              {/* 2026-05-26 DESIGNUS round 8: /sectors/:id is the canonical
                  unified sector dossier (SectorDossier). Replaces the legacy
                  SectorProfile 4-tab card-grid. /print/sectors/:id reserved
                  for future printable surface (SectorProfile preserved on
                  disk for reference). */}
              <Route
                path="sectors/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <SectorDossier />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="print/sectors/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <SectorProfile />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="methodology"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Methodology />
                  </SuspenseBoundary>
                }
              />
              <Route path="limitations" element={<Navigate to="/methodology" replace />} />
              <Route
                path="cases"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CaseLibrary />
                  </SuspenseBoundary>
                }
              />
              {/* 2026-05-27 Phase 6: /cases/:slug is the canonical
                  unified case dossier. Replaces CaseDetail (2,586 LOC).
                  /print/cases/:slug preserves the legacy surface. */}
              <Route
                path="cases/:slug"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CaseDossier />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="print/cases/:slug"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <CaseDetail />
                  </SuspenseBoundary>
                }
              />
              <Route path="ground-truth" element={<Navigate to="/model" replace />} />
              <Route path="state-expenditure" element={<Navigate to="/administrations" replace />} />
              <Route path="state-expenditure/:code" element={<Navigate to="/administrations" replace />} />
              {/* v1.0 launch cut — YearInReview not core to journalism MVP. */}
              <Route path="year-in-review" element={<Navigate to="/" replace />} />
              <Route path="year-in-review/:year" element={<Navigate to="/" replace />} />
              <Route path="institutions/health" element={<Navigate to="/institutions" replace />} />
              <Route path="institutions/scorecards" element={<Navigate to="/institutions" replace />} />
              <Route path="institutions/fichas" element={<Navigate to="/institutions" replace />} />
              <Route path="price-intelligence" element={<Navigate to="/price-analysis" replace />} />
              <Route path="model-transparency" element={<Navigate to="/model" replace />} />
              {/* v1.0 launch cut — PriceIntelligence is fully built but
                  has zero inbound links anywhere in the codebase (per audit
                  Issue #003 in chart inventory). Redirected to /sectors;
                  component preserved for v1.1 if a real consumer surfaces. */}
              <Route path="price-analysis" element={<Navigate to="/sectors" replace />} />
              {/* v1.0 launch cut — ModelTransparency subsumed by /methodology. */}
              <Route path="model" element={<Navigate to="/methodology" replace />} />
              {/* 2026-05-11 Gap 2: /vendors/:id and /institutions/:id
                  now resolve into the spatial universe. The redirect
                  component fetches the entity, computes the parent
                  sector + institution, and Navigate-replaces to
                  /explore?s=…&i=…&v=…. Legacy dossier survives at
                  /print/vendors/:id for printable / fallback use.
                  Pass ?print=1 to bypass the redirect.
                  See docs/SCAFFOLDING_OF_THE_UNIVERSE.md Gap 2. */}
              {/* 2026-05-25 DESIGNUS round 6 final: /vendors/:id is the
                  canonical unified dossier (VendorDossier). Replaces the
                  Gap 2 redirect-into-/explore behavior. /explore stays the
                  entry instrument; the dossier is the destination.
                  Legacy /print/vendors/:id still renders VendorProfile. */}
              <Route
                path="vendors/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <VendorDossier />
                  </SuspenseBoundary>
                }
              />
              {/* 2026-05-26 DESIGNUS round 7: /institutions/:id is the
                  canonical unified institution dossier (InstitutionDossier).
                  Replaces the Gap 2 redirect-into-/explore behavior. The
                  legacy /print/institutions/:id still renders InstitutionThread. */}
              <Route
                path="institutions/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <InstitutionDossier />
                  </SuspenseBoundary>
                }
              />
              {/* 2026-06-14: /officials/:name — per-official rollup
                  (Responsable de la Unidad Compradora), the destination the
                  /contracts/:id acta RESPONSABLE row links into. */}
              <Route
                path="officials/:name"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <OfficialProfile />
                  </SuspenseBoundary>
                }
              />
              {/* Legacy dossier routes — printable surface. Pre-2026-05-11
                  these lived at /vendors/:id and /institutions/:id. */}
              <Route
                path="print/vendors/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <VendorProfile />
                  </SuspenseBoundary>
                }
              />
              {/* M5 2026-05-18: InstitutionThread promoted to canonical dossier. */}
              <Route
                path="print/institutions/:id"
                element={
                  <SuspenseBoundary fallback={<DetailPageSkeleton />}>
                    <InstitutionThread />
                  </SuspenseBoundary>
                }
              />
              {/* thread-draft route removed — InstitutionThread now lives at
                  print/institutions/:id (canonical). Old draft URL no longer needed. */}
              <Route path="explore" element={<ToLista />} />
              <Route
                path="settings"
                element={<Navigate to="/" replace />} /* eval 11-09: was public and showed the DB file name + an admin action */
              />

              {/* Redirects from merged/renamed pages */}
              {/* Legacy alias — the retired money-flow surface folded into /captura. */}
              <Route path="money-flow" element={<Navigate to="/captura" replace />} />
              {/* Plural/singular + recent-rename aliases kept for external links */}
              <Route path="networks" element={<NetworkRedirect />} />
              <Route path="institution-health" element={<Navigate to="/institutions" replace />} />

              {/* v1.0 launch cuts — vendor compare + procurement calendar deferred to v1.1. */}
              <Route path="vendors/compare" element={<Navigate to="/sectors" replace />} />
              <Route path="procurement-calendar" element={<Navigate to="/" replace />} />
              <Route
                path="journalists"
                element={STORIES_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Journalists />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />

              {/* Story narratives — investigative journalism pieces */}
              <Route
                path="stories/:slug"
                element={STORIES_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <StoryNarrative />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />

              {/* «El Registro» presentation film — memorable route → the gallery player */}
              <Route path="registro" element={<Navigate to={FILMS_LIVE ? '/gallery/el-registro' : '/'} replace />} />

              {/* La Galería — narrated motion films (StoryFilm) + animated story players */}
              <Route
                path="gallery"
                element={FILMS_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Gallery />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />
              <Route
                path="gallery/:slug"
                element={FILMS_LIVE ? (
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Gallery />
                  </SuspenseBoundary>
                ) : <Navigate to="/" replace />}
              />

              {/* English-slug aliases for Observatory story titles → canonical Spanish slugs */}
              <Route path="stories/the-pharmaceutical-cartel" element={<Navigate to="/stories/el-monopolio-invisible" replace />} />
              <Route path="stories/the-intermediary-industry" element={<Navigate to="/stories/la-industria-del-intermediario" replace />} />
              <Route path="stories/the-covid-year" element={<Navigate to="/stories/el-ano-de-la-emergencia" replace />} />
              <Route path="stories/the-ghost-army" element={<Navigate to="/stories/el-ejercito-fantasma" replace />} />
              <Route path="stories/the-big-price" element={<Navigate to="/stories/el-gran-precio" replace />} />
              <Route path="stories/the-invisible-monopoly" element={<Navigate to="/stories/el-monopolio-invisible" replace />} />
              <Route path="stories/the-illusion-of-competition" element={<Navigate to="/stories/la-ilusion-competitiva" replace />} />
              <Route path="stories/institutional-capture" element={<Navigate to="/stories/captura-institucional" replace />} />
              <Route path="stories/the-tide-of-awards" element={<Navigate to="/stories/marea-de-adjudicaciones" replace />} />
              <Route path="stories/the-decade-of-risk" element={<Navigate to="/stories/el-sexenio-del-riesgo" replace />} />
              <Route path="stories/the-300k-threshold" element={<Navigate to="/stories/el-umbral-de-los-300k" replace />} />

              {/* Retired compare route — redirects to the league. */}
              <Route path="institutions/compare" element={<Navigate to="/institutions" replace />} />

              {/* Route aliases — singular/plural spelling variants */}
              <Route path="sector" element={<Navigate to="/sectors" replace />} />
              <Route path="sector/:id" element={<SectorRedirect />} />
              <Route path="scandals" element={<Navigate to="/cases" replace />} />

              {/* Retired: /collusion merged into La Trama (Vínculos). */}
              <Route path="collusion" element={<NetworkRedirect />} />

              <Route
                path="scorecards"
                element={<Navigate to="/institutions" replace />}
              />

              {/* Redirects from old routes */}
              <Route path="vendors" element={<Navigate to="/explore?tab=vendors" replace />} />
              <Route
                path="institutions"
                element={
                  <SuspenseBoundary fallback={<TablePageSkeleton />}>
                    <InstitutionLeague />
                  </SuspenseBoundary>
                }
              />

              {/* Route aliases — common plural/alternate spellings */}
              <Route path="investigations" element={<Navigate to="/investigation" replace />} />
              <Route path="for-journalists" element={<Navigate to="/journalists" replace />} />
              <Route path="newsroom" element={<Navigate to="/journalists" replace />} />
              <Route path="stories" element={<Navigate to="/journalists" replace />} />
              <Route path="metodologia" element={<Navigate to="/methodology" replace />} />
              <Route path="cases-library" element={<Navigate to="/cases" replace />} />

              {/* Red Thread retired 2026-06-07 — folded into the single
                  /vendors/:id dossier (its six chapters duplicated the
                  dossier's reference sections). Kept as redirects so external
                  links and demos don't 404. */}
              <Route path="thread" element={<Navigate to="/aria" replace />} />
              <Route path="thread/:vendorId" element={<ThreadRedirect />} />

              {/* Retired: /states merged into /administrations. */}
              <Route path="states" element={<Navigate to="/administrations" replace />} />

              <Route
                path="acerca"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <About />
                  </SuspenseBoundary>
                }
              />
              <Route path="about" element={<Navigate to="/acerca" replace />} />
              <Route
                path="privacy"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Privacy />
                  </SuspenseBoundary>
                }
              />
              <Route
                path="terms"
                element={
                  <SuspenseBoundary fallback={<GenericPageSkeleton />}>
                    <Terms />
                  </SuspenseBoundary>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
          <LazyEntityDrawer />
          </WayfindingProvider>
          </NuqsAdapter>
          </BrowserRouter>
          </EntityDrawerProvider>
          </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
