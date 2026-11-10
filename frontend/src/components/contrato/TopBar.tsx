/**
 * TopBar — the shell's first tier (DESIGN.md §5): the locked mark + RUBLI 1.0,
 * five group tabs (Spectral SC, group-hue underline), the live status + night toggle (template v3,
 * DESIGN.md §5, 2026-10-28), ES/EN, and search.
 * K7 (owner 2026-10-16): each group tab drops its pages down (200 ms ease-out,
 * current page marked) on hover, focus or click; Esc closes. Below 900 px the
 * ItemsRow takes over, as before.
 * Ctrl/⌘ K focuses the page's lead search when it has one (#ct-lead-q),
 * otherwise opens the command palette.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RubliLogoMark } from '@/components/ui/RubliLogoMark'
import { PLATFORM_VERSION } from '@/lib/constants'
import { NAV_GROUPS, PAGE_BLURB, groupFor, useLang } from './nav'
import { EditionToggle, LiveStatus } from './LiveStatus'

const CommandPalette = lazy(() => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })))

export const LEAD_SEARCH_ID = 'ct-lead-q'

export function TopBar() {
  const { i18n } = useTranslation()
  const lang = useLang()
  const { t } = useTranslation('nav')
  const { pathname } = useLocation()
  const active = groupFor(pathname)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMounted, setPaletteMounted] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const closeT = useRef<number | undefined>(undefined)
  const openGroup = (id: string | null) => { window.clearTimeout(closeT.current); setOpen(id) }
  const closeSoon = () => { window.clearTimeout(closeT.current); closeT.current = window.setTimeout(() => setOpen(null), 120) }
  useEffect(() => { setOpen(null) }, [pathname])

  const search = useCallback(() => {
    const lead = document.getElementById(LEAD_SEARCH_ID) as HTMLInputElement | null
    if (lead) {
      lead.scrollIntoView({ block: 'center' })
      lead.focus()
      return
    }
    setPaletteMounted(true)
    setPaletteOpen((o) => !o)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        search()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [search])

  const setLang = (next: 'es' | 'en') => {
    i18n.changeLanguage(next)
    document.documentElement.lang = next
  }

  return (
    <header className="ct-top">
      <div className="ct-wrap">
        <Link to="/" className="ct-brand" translate="no" aria-label={lang === 'en' ? `RUBLI ${PLATFORM_VERSION}, home` : `RUBLI ${PLATFORM_VERSION}, inicio`}>
          <RubliLogoMark size={32} />
          <b>RUBLI</b>{' '}
          <small>{PLATFORM_VERSION}</small>
        </Link>
        <nav className="ct-groups" aria-label={lang === 'en' ? 'Sections' : 'Secciones'} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(null) }}>
          {NAV_GROUPS.map((g) => (
            <div
              key={g.id}
              className="ct-grp"
              data-open={open === g.id || undefined}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') openGroup(g.id) }}
              onPointerLeave={closeSoon}
              onFocus={() => openGroup(g.id)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSoon() }}
              style={{ ['--g' as string]: `var(--g-${g.id})` }}
            >
              <Link
                to={g.items[0].href}
                data-active={g.id === active.id}
                aria-current={g.id === active.id ? 'true' : undefined}
              >
                {g.label[lang]}
              </Link>
              <div className="ct-drop">
                {g.items.map((i) => (
                  <NavLink key={i.href} to={i.href} end={i.href === '/'} onClick={() => setOpen(null)}><b>{t(`toc.${i.key}`)}</b>{PAGE_BLURB[i.key] && <small>{PAGE_BLURB[i.key][lang]}</small>}</NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="ct-tools">
          <LiveStatus />
          <EditionToggle />
          <div className="ct-lang" role="group" aria-label={lang === 'en' ? 'Language' : 'Idioma'}>
            <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')} lang="es">ES</button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">EN</button>
          </div>
          <button type="button" className="ct-search" onClick={search} aria-keyshortcuts="Control+K">
            <span>{lang === 'en' ? 'Search' : 'Buscar'}</span>{' '}
            <kbd>Ctrl&nbsp;K</kbd>
          </button>
        </div>
      </div>
      {paletteMounted && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      )}
    </header>
  )
}
