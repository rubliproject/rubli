/**
 * DossierSection — a plain «El Contrato» section for the category and sector dossiers
 * (DESIGN.md §5, §4.2): ink rule · h2 · optional mono meta on the right · body. No ordinals,
 * no § kickers, no sector-tinted rules.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './dossier.css'

import { SecCite } from '@/components/dossier/layers'
import { useLang } from '@/components/contrato/nav'
export function DossierSection({ id, title, meta, cite, lede, children }: {
  id: string
  title: string
  meta?: ReactNode
  /** L5 «Citar»: the sentence copied with the link (components/dossier/layers). */
  cite?: string | null
  lede?: ReactNode
  children: ReactNode
}) {
  const lang = useLang()
  return (
    <section id={id} className="ct-section scroll-mt-20" aria-labelledby={`${id}-h`}>
      <div className="ct-annex-row">
        <h2 id={`${id}-h`} className="ct-h2">{title}</h2>
        {meta && <span className="cd-meta">{meta}</span>}
        {cite && <SecCite sec={id} text={cite} lang={lang} />}
      </div>
      {lede && <p className="ct-annex-lede">{lede}</p>}
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

/** Sibling stepper for the DocHead meta (replaces the WayfindingSpine): «‹ 2 / 72 ›». */
export function StepMeta({ prevTo, nextTo, index, total, en }: { prevTo: string | null; nextTo: string | null; index: number; total: number; en: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {prevTo ? <Link to={prevTo} className="ct-link" aria-label={en ? 'Previous' : 'Anterior'}>‹</Link> : <span aria-hidden="true">‹</span>}
      <span>{index} / {total}</span>
      {nextTo ? <Link to={nextTo} className="ct-link" aria-label={en ? 'Next' : 'Siguiente'}>›</Link> : <span aria-hidden="true">›</span>}
    </span>
  )
}
