/** «Si sigue así» callout: kicker · one bold sentence · one muted caveat (docs/PREDICTIONS_RESEARCH_2026-11-06.md). Nothing when there is nothing to say. */
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { PredictionText } from '@/lib/predictions'
import './prediction.css'

export function PredictionCallout({ text }: { text: PredictionText | null }) {
  if (!text) return null
  return (
    <aside className="pred" aria-label={text.kicker}>
      <p className="pred-k">{text.kicker}</p>
      <p className="pred-finding">{text.finding}</p>
      {text.segs && <p className="pred-finding">{text.segs.map((g, i) => typeof g === 'string' ? g
        : <EntityIdentityChip key={i} type="institution" id={g.id} name={g.name} variant="name" size="inherit" />)}</p>}
      <p className="pred-caveat">{text.caveat}</p>
    </aside>
  )
}
