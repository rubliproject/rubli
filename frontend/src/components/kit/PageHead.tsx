/**
 * PageHead — the one page head (owner 2026-11-06, via RED: «we have to format headers better all the time»).
 * Five rows, one left edge, one spacing scale (8 / 16 / 24 / 40 px — pagehead.css):
 *   1 crumbs (DocHead) + tabs · 2 h1 = THE finding (one per head; no PageQuestion strip beside it)
 *   3 the page's question, smaller than h1 · 4 Mariana's three lines (ReadLines) · 5 toolbar + legend.
 * `ReadLines` is also every block's «Qué estás viendo · Cómo se lee · Qué significa» (three equal columns ≥ 901 px,
 * dt above dd, the three bodies on one baseline).
 * Every routed page's head (owner 2026-11-09 «the fucking headers again»; inventory + gate: docs/HEADERS_2026-11-09.md,
 * `npm run proof:head`). No page builds its own head, strip or second title before its first content object.
 */
import type { ReactNode } from 'react'
import { DocHead, type Crumb } from '@/components/contrato/DocHead'
import { preludeFor } from '@/lib/nav/prelude'
import './pagehead.css'

type Lang = 'es' | 'en'
export interface Lines { see: ReactNode; read: ReactNode; means: ReactNode }

export function ReadLines({ lines, lang, className }: { lines: Lines; lang: Lang; className?: string }) {
  const en = lang === 'en'
  return (
    <dl className={['ph-read', className].filter(Boolean).join(' ')}>
      <div><dt>{en ? 'What you see' : 'Qué estás viendo'}</dt><dd>{lines.see}</dd></div>
      <div><dt>{en ? 'How to read it' : 'Cómo se lee'}</dt><dd>{lines.read}</dd></div>
      <div><dt className="is-means">{en ? 'What it means' : 'Qué significa'}</dt><dd><b>{lines.means}</b></dd></div>
    </dl>
  )
}

export function PageHead({ crumbs, meta, tabs, actions, kicker, finding, toolbar, lang, sticky }: {
  crumbs: Crumb[]
  /** A list page pins the crumbs row (DocHead `sticky`): it then sits outside the header box so it can stick. */
  sticky?: boolean
  meta?: ReactNode
  tabs?: ReactNode
  /** Small controls on the crumbs row's right: the page tour (`<PageQuestion bare …/>`, «Cómo leer esto»), a stepper. */
  actions?: ReactNode
  /** The entity / page name, small, above the finding. */
  kicker?: ReactNode
  /** h1: the one finding of the page. */
  finding: ReactNode
  question?: ReactNode
  lines?: Lines
  toolbar?: ReactNode
  lang: Lang
}) {
  const pre = preludeFor(window.location.pathname)?.[lang]
  const doc = <DocHead trail={crumbs} meta={meta} views={tabs} actions={actions} sticky={sticky} />
  return (<>
    {sticky && doc}
    <header className="ph">
      {!sticky && doc}
      <div className="ph-body">
        {pre && <p className="ph-prelude"><b>{pre[0]}</b> {pre[1]} <span>→ {pre[2]}</span></p>}
        {kicker && <p className="ph-kicker">{kicker}</p>}
        <h1 className="ph-finding">{finding}</h1>
        {/* owner 11-09: «self-explanatory… no more than 2 sentences» — the head is the prelude line + the h1 finding;
            `question` / `lines` are kept in the props for callers but no longer printed */}
        {toolbar && <div className="ph-toolbar">{toolbar}</div>}
      </div>
    </header>
  </>)
}

/** A prose lede → [the first sentence as the head's finding, the rest]; null when there is no short first sentence
 *  (empty, no sentence break, or over `max` characters) — the caller then keeps its name as the h1. Abbreviations
 *  («S.A.», «Sr.», «EE.UU.») never end the sentence. No regex lookbehind (Safari < 16.4 cannot parse one). */
const ABBR = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'mtro', 'mtra', 'no', 'núm', 'art', 'mr', 'mrs', 'ms', 'st', 'co', 'inc', 'dept', 'vs'])
export function splitFinding(text: string | null | undefined, max = 220): [string, string | null] | null {
  const t = (text ?? '').trim()
  const re = /[.!?]\s+(?=[A-ZÁÉÍÓÚÑ¿¡«"])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const word = t.slice(0, m.index).split(/\s/).pop() ?? ''
    if (word.includes('.') || ABBR.has(word.toLowerCase())) continue
    const first = t.slice(0, m.index + 1)
    return first.length <= max ? [first, t.slice(m.index + 1).trim() || null] : null
  }
  return t && t.length <= max ? [t, null] : null
}
