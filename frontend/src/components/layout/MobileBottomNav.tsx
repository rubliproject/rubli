/**
 * MobileBottomNav — iOS/Android-style bottom navigation bar for mobile screens.
 * Renders only on < md breakpoint. 4 primary destinations + "More" to open the sidebar.
 *
 * PARALLAX D1 § Change 4 (2026-09-17):
 *  - El Mapa (`/`) is in. It is the homepage and the platform's front door, and
 *    it has been mobile-native since 2026-06-23. The Network came out: a force
 *    graph is the least usable surface on a 390px screen.
 *  - `/` no longer lights up the Dashboard tab. Each tab claims only its route.
 *  - Labels are no longer clamped to 56px, so "Dashboard" and "Focos Rojos" read
 *    whole instead of clipping mid-word.
 *  - The landmark label is `nav.quickNavigation`, distinct from the sidebar's
 *    "Main navigation" (it used to borrow the INVESTIGAR section heading).
 *
 * Face S1 (spec § 8): the four destinations come from the registry's `phone`
 * rows (II, III, VI, X since the Portada took row I on 2026-10-08), each with its numeral above the label; the fifth slot
 * is «Índice», which opens the drawer. Labels wrap to two lines, never truncate.
 */

import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { History, Shield, BarChart3, Library, Map, Menu, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOC, entryFor, numeralOf } from '@/lib/nav/toc'

const ICONS: Record<string, LucideIcon> = { Map, History, Library, Shield, BarChart3 }
const PHONE = TOC.filter((e) => e.phone)

interface Props {
  onMenuClick: () => void
  /** True while the mobile drawer is open — takes the bar out of the tab order. */
  inert?: boolean
}

export function MobileBottomNav({ onMenuClick, inert }: Props) {
  const location = useLocation()
  const { t } = useTranslation('nav')

  const active = entryFor(location.pathname)

  return (
    <nav
      inert={inert || undefined}
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-border bg-background-card/95 backdrop-blur-md md:hidden"
      aria-label={t('quickNavigation')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {PHONE.map((entry) => {
        const Icon = ICONS[entry.icon ?? ''] ?? Menu
        const isActive = entry === active
        return (
          <NavLink
            key={entry.href}
            to={entry.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-start gap-0.5 pt-2 pb-1.5 min-h-[56px] text-[12px] font-medium transition-colors touch-manipulation',
              isActive
                ? 'text-accent'
                : 'text-text-muted active:text-text-primary'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn('h-5 w-5', isActive ? 'text-accent' : 'text-text-muted')}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] leading-none tabular-nums" aria-hidden="true">{numeralOf(entry)}</span>
            <span className="px-0.5 text-center leading-[1.1] whitespace-nowrap">{t(`tocShort.${entry.key}`, { defaultValue: t(`toc.${entry.key}`) })}</span>
          </NavLink>
        )
      })}

      {/* More — opens full sidebar overlay */}
      <button
        onClick={onMenuClick}
        className="flex flex-1 flex-col items-center justify-start gap-0.5 pt-2 pb-1.5 min-h-[56px] text-[12px] font-medium text-text-muted active:text-text-primary transition-colors touch-manipulation"
        aria-label={t('toc.indexOpen')}
      >
        <Menu className="h-5 w-5 text-text-muted" aria-hidden="true" />
        <span className="font-mono text-[10px] leading-none invisible" aria-hidden="true">·</span>
        <span className="px-0.5 text-center leading-[1.1] whitespace-nowrap">{t('toc.index')}</span>
      </button>
    </nav>
  )
}
