/**
 * Firmas — the site footer, on every route (MainLayout + AuthShell). DESIGN.md §5 / §8 «Signature block»,
 * rewritten 2026-11-02 (owner: «doesn't look professional … look at all those lines»): one tinted band, no
 * rules; the project line at left, the site map in five groups read from the shell's nav registry
 * (NAV_GROUPS, so the footer and the top bar never disagree) plus the documents, and ONE meta line
 * (authorship · model · cut · dataset DOI · licences · contact) with the language and night controls.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { CURRENT_MODEL_VERSION, DATASET_DOI, DATASET_VERSION, MODEL_AUC, PLATFORM_VERSION } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { useDataCut } from '@/lib/useDataCut'
import { NAV_GROUPS, useLang, type NavGroup } from './nav'
import { EditionToggle } from './LiveStatus'

type Item = { label: string; to?: string; href?: string }

export function Firmas() {
  const { t, i18n } = useTranslation('nav')
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const cut = useDataCut()
  const { user, logout } = useAuth()

  const pages = (...ids: NavGroup['id'][]): Item[] =>
    NAV_GROUPS.filter((g) => ids.includes(g.id)).flatMap((g) => g.items.map((i) => ({ label: t(`toc.${i.key}`), to: i.href })))
  const groups: { id: string; title: string; items: Item[] }[] = [
    { id: 'explorar', title: L('Explorar', 'Explore'), items: pages('descubrir', 'explorar') },
    { id: 'investigar', title: L('Investigar', 'Investigate'), items: pages('investigar') },
    { id: 'analisis', title: L('Análisis', 'Analysis'), items: pages('analisis') },
    {
      id: 'datos', title: L('Datos y método', 'Data and method'), items: [
        ...pages('plataforma'),
        { label: L('Datos abiertos (Zenodo)', 'Open data (Zenodo)'), href: `https://doi.org/${DATASET_DOI}` },
        { label: L('Guía para periodistas', 'Guide for journalists'), to: '/press#use' },
      ],
    },
    {
      id: 'proyecto', title: L('Proyecto', 'Project'), items: [
        { label: L('Acerca de RUBLI', 'About RUBLI'), to: '/acerca' },
        { label: L('Privacidad', 'Privacy'), to: '/privacy' },
        { label: L('Términos', 'Terms'), to: '/terms' },
        { label: L('Correcciones y contacto', 'Corrections and contact'), to: '/press#contact' },
      ],
    },
  ]

  const setLang = (next: 'es' | 'en') => {
    i18n.changeLanguage(next)
    document.documentElement.lang = next
  }

  return (
    <footer className="ct sf">
      <div className="ct-wrap ct-firmas">
        <div className="sf-grid">
          <div className="sf-about">
            <b translate="no">RUBLI {PLATFORM_VERSION}</b>
            <p>
              {L(
                'Plataforma abierta para leer las contrataciones públicas federales de México, 2002–2026. Los indicadores de riesgo no son pruebas de corrupción.',
                'An open platform for reading Mexico’s federal public procurement, 2002–2026. Risk indicators are not proof of corruption.',
              )}
            </p>
          </div>
          <nav className="sf-nav" aria-label={L('Mapa del sitio', 'Site map')}>
            {groups.map((g) => (
              <div key={g.id}>
                <h2 className="sf-h" id={`sf-${g.id}`}>{g.title}</h2>
                <ul aria-labelledby={`sf-${g.id}`}>
                  {g.items.map((i) => (
                    <li key={i.label}>
                      {i.to
                        ? <Link to={i.to}>{i.label}</Link>
                        : <a href={i.href} target="_blank" rel="noopener noreferrer">{i.label}</a>}
                    </li>
                  ))}
                  {g.id === 'proyecto' && (
                    <li>
                      {user
                        ? <button type="button" onClick={logout}>{L('Salir', 'Sign out')}</button>
                        : <Link to="/login">{L('Entrar', 'Sign in')}</Link>}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="sf-meta">
          <p>
            <span>© 2026 {L('Proyecto RUBLI', 'RUBLI Project')}</span>
            <span>{L('Modelo', 'Model')} {CURRENT_MODEL_VERSION} · AUC {MODEL_AUC}</span>
            <span>{L('Corte', 'Cut-off')} {formatCut(cut, lang)}</span>
            <span>{L('Datos', 'Data')} {DATASET_VERSION} · DOI <a href={`https://doi.org/${DATASET_DOI}`} target="_blank" rel="noopener noreferrer">{DATASET_DOI}</a></span>
            <span>{L('Sitio', 'Site')} CC BY-NC 4.0 · {L('código', 'code')} Apache 2.0</span>
            <span><a href="mailto:prensa@rubli.xyz">prensa@rubli.xyz</a></span>
          </p>
          <div className="sf-tools">
            <div className="ct-lang" role="group" aria-label={L('Idioma', 'Language')}>
              <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')} lang="es">ES</button>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">EN</button>
            </div>
            <EditionToggle />
          </div>
        </div>
      </div>
    </footer>
  )
}
