/**
 * LegalSection — one numbered section of /privacy or /terms in the Plataforma shell:
 * the h2 over a 2px ink rule, body in two prose columns (legal.css).
 */
import type { ReactNode } from 'react'
import './legal.css'

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="plt-sec scroll-mt-12" aria-labelledby={`${id}-h`}>
      <div className="plt-sec-head is-solo"><h2 id={`${id}-h`}>{title}</h2></div>
      <div className="plt-body lg-body">{children}</div>
    </section>
  )
}

/** Inline literal (a storage key, an email subject): mono, no box. */
export function LegalTag({ children }: { children: ReactNode }) {
  return <code className="lg-tag">{children}</code>
}
