/**
 * The «Plataforma» reading pages (/methodology, /datos, /press, /privacy, /terms), one shell
 * (owner board 2026-10-28: «all of the Plataforma stuff needs to be remade»).
 *
 * kit/PageHead (crumbs → h1 → the question → three lines) → the lede, the sibling pages + the live
 * figures as a label–value ledger | «La lectura» (the dossier rail: plain statements, findings first, each
 * one ≤ 15 words) → the dossiers' sticky SectionIndex → layers, each an h2 with the
 * answer in one sentence beside it, then ONE visual (a PfFlow diagram where a process needs it) and
 * short prose (two balanced columns).
 */
import { MoreLine } from '@/components/kit/MoreLine'
import { PageHead } from '@/components/kit/PageHead'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RISK_COLORS } from '@/lib/constants'
import { SectionIndex, type IndexItem } from '@/components/contrato/SectionIndex'
import { groupFor, useLang } from '@/components/contrato/nav'
import type { Share } from '@/lib/plataforma/figures'
import './plataforma.css'

const PAGES = [
  { to: '/methodology', es: 'Metodología', en: 'Methodology' },
  { to: '/datos', es: 'Los datos', en: 'The data' },
  { to: '/press', es: 'Prensa', en: 'Press' },
  { to: '/privacy', es: 'Privacidad', en: 'Privacy' },
  { to: '/terms', es: 'Términos', en: 'Terms' },
] as const

/** Pages the shell's items row already lists at ≤ 900 px (contrato/nav.ts, group «plataforma»). */
const SHELL_PAGES = new Set(groupFor('/methodology').items.map((i) => i.href))

export interface Fact { k: string; v: ReactNode; n?: ReactNode }

/** The page question and Mariana's three lines (kit/PageHead): a Plataforma page has no chart and no computed finding. */
export interface Guide { q: string; see?: ReactNode; read?: ReactNode; means: ReactNode }

export function PfShell({ title, lede, fullLede, guide, lectura, facts, index, meta, className, children }: {
  title: string
  guide?: Guide
  /** «La lectura»: the page's findings as plain statements; a falsy item is left out (shown only when true). */
  lectura?: ReactNode[]
  lede: ReactNode
  /** keep the lede wrapped: it carries a disclaimer (terms, privacy) — DESIGN.md §3.1 */
  fullLede?: boolean
  facts?: Fact[]
  index: IndexItem[]
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  const lang = useLang()
  const { pathname } = useLocation()
  const es = lang === 'es'
  const reading = (lectura ?? []).filter(Boolean)
  const factList = facts?.length ? (
    <dl className="plt-facts" aria-label={es ? 'Cifras de esta página' : 'This page’s figures'}>
      {facts.map((f) => (
        <div key={f.k}>
          <dt>{f.k}{f.n && <small>{f.n}</small>}</dt>
          <dd>{f.v}</dd>
        </div>
      ))}
    </dl>
  ) : null

  return (
    <article className={['ct ct-page ct-sheet plt', className].filter(Boolean).join(' ')} data-frame>
      <div className="ct-wrap">
        {/* kit/PageHead (owner 11-06): crumbs → h1 = the page (no computed finding here) → the question → the three lines.
            Under it: the lede, the sibling pages and the live figures | «La lectura». */}
        <PageHead lang={lang} crumbs={[{ label: es ? 'Plataforma' : 'Platform' }, { label: title }]} meta={meta}
          finding={title}
          question={guide?.q}
          lines={guide?.see && guide.read ? { see: guide.see, read: guide.read, means: guide.means } : undefined} />
        <div className={reading.length && factList ? 'plt-head' : 'plt-head is-solo'}>
          <div>
            {fullLede ? <p className="plt-lede">{lede}</p> : <MoreLine className="plt-lede">{lede}</MoreLine>}
            <nav className="plt-pages" aria-label={es ? 'Páginas de la plataforma' : 'Platform pages'}>
              {PAGES.map((p) => (
                <Link key={p.to} to={p.to} data-shell={SHELL_PAGES.has(p.to) || undefined} aria-current={pathname === p.to ? 'page' : undefined}>{es ? p.es : p.en}</Link>
              ))}
            </nav>
            {factList}
          </div>
          {reading.length > 0 && (
            <aside className="plt-lec" aria-labelledby="plt-lec-h">
              <h2 id="plt-lec-h" className="plt-lec-h">{es ? 'La lectura' : 'The reading'}</h2>
              {reading.map((c, i) => <p key={i} className="plt-lec-c">{c}</p>)}
            </aside>
          )}
        </div>
        <SectionIndex items={index} label={es ? 'Índice de la página' : 'Page index'} />
        {children}
      </div>
    </article>
  )
}

/** One layer: the h2 with its answer beside it, then the body. */
export function PfSection({ id, title, claim, children }: { id: string; title: string; claim?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="plt-sec scroll-mt-12" aria-labelledby={`${id}-h`}>
      <div className={claim ? 'plt-sec-head' : 'plt-sec-head is-solo'}>
        <h2 id={`${id}-h`}>{title}</h2>
        {claim && <p className="plt-claim">{claim}</p>}
      </div>
      <div className="plt-body">{children}</div>
    </section>
  )
}

/** Short prose set in two balanced columns (one on phones), so no line runs past ~75 characters. */
export function PfProse({ children }: { children: ReactNode }) {
  return <div className="plt-prose">{children}</div>
}

const LEVEL_WORD = {
  critical: { es: 'Crítico', en: 'Critical' },
  high: { es: 'Alto', en: 'High' },
  medium: { es: 'Medio', en: 'Medium' },
  low: { es: 'Bajo', en: 'Low' },
} as const
const FLOOR = { critical: '≥ 0.60', high: '≥ 0.40', medium: '≥ 0.25', low: '< 0.25' } as const
/** Red only for crítico; low wears the muted ink, never green (CLAUDE.md rule 7). */
const levelColor = (l: Share['level']) => (l === 'low' ? 'var(--color-text-muted)' : RISK_COLORS[l])

/**
 * The scored contracts by indicator level: one proportional strip (part of a whole, four ordered
 * levels) with every level labelled under it, since high and medium sit close in hue (dataviz
 * validator: normal-vision ΔE 12 < 15) — identity never rests on colour alone.
 */
export function RiskStrip({ shares }: { shares: Share[] | null }) {
  const lang = useLang()
  const es = lang === 'es'
  const loc = es ? 'es-MX' : 'en-US'
  if (!shares) return <div className="plt-strip-hold" aria-hidden="true" />
  const scored = shares.reduce((a, s) => a + s.count, 0)
  const label = shares.map((s) => `${LEVEL_WORD[s.level][lang]} ${s.pct.toFixed(1)}%`).join(', ')
  return (
    <figure className="plt-strip">
      <div className="plt-strip-bar" role="img" aria-label={(es ? 'Contratos calificados por nivel del indicador: ' : 'Scored contracts by indicator level: ') + label}>
        {shares.map((s) => (
          <span key={s.level} style={{ flexGrow: s.pct, background: levelColor(s.level) }} />
        ))}
      </div>
      <ul className="plt-strip-key" role="list">
        {shares.map((s) => (
          <li key={s.level}>
            <span className="plt-sw" style={{ background: levelColor(s.level) }} aria-hidden="true" />
            <b>{LEVEL_WORD[s.level][lang]}</b> <span className="plt-mono">{FLOOR[s.level]}</span>
            <span className="plt-strip-pct">{s.pct.toFixed(1)}%</span>
            <span className="plt-strip-n">{s.count.toLocaleString(loc)} {es ? 'contratos' : 'contracts'}</span>
          </li>
        ))}
      </ul>
      <figcaption className="ct-note">
        {es
          ? `De ${scored.toLocaleString(loc)} contratos con indicador.`
          : `Of ${scored.toLocaleString(loc)} contracts with an indicator.`}
      </figcaption>
    </figure>
  )
}

/** One step of a PfFlow: a box (number · name · one line), and the label of the arrow that leads into it. */
export interface FlowStep { name: ReactNode; note?: ReactNode; via?: string; focal?: boolean; children?: ReactNode }

/**
 * A process drawn in the diagram-design look (owner 2026-11-04: connected boxes, labelled connectors):
 * hairline boxes on the 4 px grid, orthogonal arrows whose label sits beside the line on a paper mask,
 * the focal box (≤ 1) on an ink rule. Real HTML, so it reads as an ordered list; left → right on a
 * desktop, top → bottom on a phone. Static: nothing moves.
 */
export function PfFlow({ label, steps, caption }: { label: string; steps: FlowStep[]; caption?: ReactNode }) {
  return (
    <figure className="plt-flow" style={{ ['--n' as string]: steps.length }}>
      <ol role="list" aria-label={label}>
        {steps.map((s, i) => (
          <li key={i} className={s.focal ? 'is-focal' : undefined}>
            {i > 0 && <span className="plt-flow-via">{s.via && <span>{s.via}</span>}</span>}
            <div className="plt-flow-box">
              <span className="plt-flow-n" aria-hidden="true">{i + 1}</span>
              <b>{s.name}</b>
              {s.note && <span className="plt-flow-note">{s.note}</span>}
              {s.children}
            </div>
          </li>
        ))}
      </ol>
      {caption && <figcaption className="ct-note">{caption}</figcaption>}
    </figure>
  )
}
