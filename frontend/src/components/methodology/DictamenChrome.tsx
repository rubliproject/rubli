/**
 * AnnexFold — a folding sub-section of /methodology on «El Contrato» (DESIGN.md §8 Tabs/Button):
 * a 44px SC toggle over a rule; closed content still prints.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function AnnexFold({ id, title, defaultOpen = false, children }: {
  id: string
  title: { en: string; es: string }
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const { i18n } = useTranslation()
  const es = i18n.language.startsWith('es')
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = `annex-content-${id}`
  return (
    <div id={id} className="mt-fold scroll-mt-4">
      <button type="button" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} aria-controls={contentId}>
        <span>{es ? title.es : title.en}</span>
        <span aria-hidden="true" className="mt-fold-mark">{isOpen ? '−' : '+'}</span>
      </button>
      {/* opens in place with the grid-rows fold (contrato.css .ct-fold); closed content still prints */}
      <div className="ct-fold mt-fold-anim" data-open={isOpen || undefined} inert={!isOpen}>
        <div>
          <div id={contentId} className="mt-body mt-fold-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
