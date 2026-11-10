import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWayfindingScroll } from '@/hooks/useWayfindingScroll'
import { TopBar } from '@/components/contrato/TopBar'
import { ItemsRow } from '@/components/contrato/ItemsRow'
import { Firmas } from '@/components/contrato/Firmas'
import { IntroOverlay } from '@/components/contrato/IntroOverlay'
import { useRouteMeta } from '@/lib/seo/routeMeta'
import '@/components/contrato/contrato.css'

/** <title>, description, og:* and canonical per route (launch S1). Lived in the
 *  retired Header; the Contrato shell dropped it, so every page shipped the
 *  default title (joker evaluation, 2026-10-19). */
function RouteMeta({ pathname, lang }: { pathname: string; lang: string }) {
  useRouteMeta(pathname, lang)
  return null
}

/**
 * The «Contrato» shell (DESIGN.md §5): top bar → items row → page → firmas.
 * Replaces the sidebar + header + phone bottom bar. The bottom bar is retired:
 * both nav tiers sit at the top and scroll sideways on a phone, its «Índice»
 * opened the retired drawer, and it set 10px labels under the 12px floor.
 *
 * --nav-h tracks the chrome's real height (the top bar wraps to two rows on a
 * phone), so full-height pages subtract one variable instead of a guess.
 */
const onlineSub = (cb: () => void) => {
  window.addEventListener('online', cb); window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}

/** Offline state: the page keeps what it loaded, new figures wait for the connection. */
function OfflineBar({ es }: { es: boolean }) {
  const online = useSyncExternalStore(onlineSub, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div role="status" className="font-mono text-xs text-text-secondary border-b border-border px-3 py-2">
      {es ? 'Sin conexión. Lo ya cargado sigue visible; las cifras nuevas no están disponibles hasta reconectar.' : 'Offline. What has loaded stays visible; new figures are unavailable until you reconnect.'}
    </div>
  )
}

export function MainLayout() {
  const location = useLocation()
  const { t, i18n } = useTranslation('common')
  const chromeRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const firstPath = useRef(true)

  // Router-aware scroll: tops out on drill-in, restores on browser-back,
  // leaves URL-synced filter changes alone (EXPLORAR "El Hilo" P0, F1).
  useWayfindingScroll()

  // Route change → focus <main> so screen readers land on the new page. Keyed on
  // pathname only: search-param filter changes keep focus where it is.
  useEffect(() => {
    if (firstPath.current) { firstPath.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  useEffect(() => {
    const el = chromeRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--nav-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-link">
        {t('skipToContent')}
      </a>

      {/* Before <main>: its layout effect runs ahead of the page's, so pages that
          set their own title (useDocumentTitle) still win, as under the old Header. */}
      <RouteMeta pathname={location.pathname} lang={i18n.language ?? 'es'} />

      <OfflineBar es={!i18n.language?.startsWith('en')} />

      <div ref={chromeRef}>
        <TopBar />
        <ItemsRow />
        {/* El Mapa carries «Vínculos · Cifras» inside each view's own control row — Vínculos on its
            sector row, Cifras in the drill toolbar / Z0 head (owner 2026-10-29 + 2026-11-02: no band above the map) */}
      </div>

      {/* overflow-x: clip, not hidden — hidden makes <main> a scroll container and
          swallows every position: sticky inside it (SD-01 § F1). Pages on the
          template (.ct-page) own their padding through .ct-wrap. */}
      <main
        ref={mainRef}
        id="main-content"
        className="px-3 sm:px-5 py-5 overflow-x-clip has-[.ct-page]:p-0"
        tabIndex={-1}
      >
        {/* Route changes stay still (FIX_BRIEF_R1 § D.6): the page swaps, nothing slides. */}
        <div key={location.pathname} className="h-full">
          <Outlet />
        </div>
      </main>

      <Firmas />

      {/* Same commit as <TopBar>, so both marks share t0 (DESIGN.md §7 intro). */}
      <IntroOverlay />
    </div>
  )
}
