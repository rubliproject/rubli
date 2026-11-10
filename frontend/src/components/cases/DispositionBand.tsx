/**
 * DispositionBand — now one quiet filter row «Cómo terminó» (owner 11-05 SAND-2: the six boxes looked «horrible»).
 * Was: the index hero chart, one stacked proportion band of the
 * 43 documented cases by legal disposition, ordered worst → resolved, with
 * the lone-conviction sliver called out by an ochre tick.
 *
 * Precedent: ProPublica *Bailout Tracker* accountability band (disposition-
 * sorted share bar). Cover-the-captions: with every label hidden the reader
 * still sees a band that is overwhelmingly red-and-amber with a hairline
 * neutral sliver at the far end — the geometry IS the argument.
 *
 * The legend is the control (PARALLAX D5 Change 4): each legend item is a
 * button carrying the dot, the label and the count, so the filter is reachable
 * by keyboard and readable without colour. The band's segments stay clickable
 * for the mouse but leave the accessibility tree and the tab order — they are
 * the picture, not the interface.
 */
import {
  DISPOSITION_ORDER,
  dispositionFor,
  dispositionLabel,
  type Lang,
} from './casesVocab'

export interface DispositionCount {
  legal_status: string
  count: number
}

export function DispositionBand({
  counts,
  activeStatus,
  onSelect,
  lang,
}: {
  counts: DispositionCount[]
  activeStatus: string | null
  onSelect: (status: string | null) => void
  lang: Lang
}) {
  const byStatus = new Map(counts.map((c) => [c.legal_status, c.count]))
  const ordered = DISPOSITION_ORDER.filter((s) => (byStatus.get(s) ?? 0) > 0)
  const total = ordered.reduce((a, s) => a + (byStatus.get(s) ?? 0), 0)
  if (!total) return null

  const convictedCount = byStatus.get('convicted') ?? 0

  // Owner 11-05 (SAND-2): the six-box band read «horrible». One quiet row of the same filter buttons, beside «Tipo».
  return (
    <div className="cl-types cl-ends" role="group" aria-label={lang === 'es' ? `Cómo terminaron los ${total} casos; elija uno para filtrar` : `How the ${total} cases ended; pick one to filter`}>
      <span className="cl-strip-k" aria-hidden="true">{lang === 'es' ? 'Cómo terminó' : 'How it ended'}</span>
      {ordered.map((status) => {
        const meta = dispositionFor(status)
        const n = byStatus.get(status) ?? 0
        const active = activeStatus === status
        return (
          <button key={status} type="button" aria-pressed={active} data-dim={activeStatus && !active ? '' : undefined} onClick={() => onSelect(active ? null : status)}>
            <span className="cl-status" style={{ ['--c' as string]: meta.fill }}>
              <i aria-hidden="true" className={meta.ring ? 'is-ring' : undefined} />
              {dispositionLabel(status, lang)}
            </span>
            <span className="cl-n">{n}</span>
            {meta.ring && convictedCount === 1 && <em className="cl-only">{lang === 'es' ? 'la única' : 'the only one'}</em>}
          </button>
        )
      })}
    </div>
  )
}
