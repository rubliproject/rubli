/**
 * AuthShell — /login and /register on «El Contrato» (DESIGN.md §5 tool surface).
 * These routes live outside MainLayout, so the shell brings its own TopBar and Firmas.
 * DocHead → one-line cover (is-op) → the form (5fr) beside a short facts list (7fr).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/contrato/TopBar'
import { PageHead } from '@/components/kit/PageHead'
import { useLang } from '@/components/contrato/nav'
import { Firmas } from '@/components/contrato/Firmas'
import { DATASET_DOI } from '@/lib/constants'
import '@/components/contrato/contrato.css'
import './auth.css'

interface AuthShellProps {
  /** The h1 (one line). */
  title: string
  /** One-line lede under the h1. */
  lede?: string
  /** The form. */
  children: ReactNode
  /** Last crumb in the DocHead. */
  crumb?: string
}

export function AuthShell({ title, lede, children, crumb }: AuthShellProps) {
  const { t } = useTranslation('auth')
  const lang = useLang()
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main id="main-content" tabIndex={-1}>
        <article className="ct ct-page ct-sheet">
          <div className="ct-wrap">
            <PageHead lang={lang} crumbs={[{ label: t('crumb') }, ...(crumb ? [{ label: crumb }] : [])]} finding={title} question={lede} />
            <div className="au-grid" data-object>
              <div>{children}</div>
              <section className="au-facts" aria-labelledby="au-facts-h">
                <h2 id="au-facts-h">{t('facts.title')}</h2>
                <dl>
                  <div><dt>{t('facts.open')}</dt><dd>{t('facts.openBody')}</dd></div>
                  <div><dt>{t('facts.account')}</dt><dd>{t('facts.accountBody')}</dd></div>
                  <div><dt>{t('facts.privacy')}</dt><dd>{t('facts.privacyBody')} <Link to="/privacy" className="ct-link">{t('facts.privacyLink')}</Link>.</dd></div>
                  <div><dt>{t('facts.data')}</dt><dd>{t('facts.dataBody')} <a href={`https://doi.org/${DATASET_DOI}`} target="_blank" rel="noopener noreferrer" className="ct-link ct-mono">{DATASET_DOI}</a>.</dd></div>
                </dl>
              </section>
            </div>
          </div>
        </article>
      </main>
      <Firmas />
    </div>
  )
}
