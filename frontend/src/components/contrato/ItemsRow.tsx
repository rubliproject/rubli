/**
 * ItemsRow — the shell's second tier (DESIGN.md §5): the active group's pages
 * behind a 4px group-hue bar; NavLink marks the current one aria-current=page.
 * `aside` carries a page-level switch that used to live in the old header
 * (El Mapa's Cifras | Vínculos). On a phone (≤ 600) the live status is dropped: riding here it clipped
 * the page tabs (AUDIT_DESIGN 2026-11-07 #2).
 */
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { groupFor, useLang } from './nav'

export function ItemsRow({ aside }: { aside?: ReactNode }) {
  const { t } = useTranslation('nav')
  const lang = useLang()
  const group = groupFor(useLocation().pathname)
  return (
    <div className="ct-items" style={{ ['--g' as string]: `var(--g-${group.id})` }}>
      <div className="ct-wrap">
        <nav aria-label={lang === 'en' ? `${group.label.en} pages` : `Páginas de ${group.label.es}`}>
          {group.items.map((i) => (
            <NavLink key={i.href} to={i.href} end={i.href === '/'}>
              {t(`toc.${i.key}`)}
            </NavLink>
          ))}
        </nav>
        {aside && <div className="ct-items-aside">{aside}</div>}
      </div>
    </div>
  )
}
