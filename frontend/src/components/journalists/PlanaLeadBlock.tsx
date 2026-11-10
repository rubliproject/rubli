// ---------------------------------------------------------------------------
// PlanaLeadBlock — «En portada»: the A1 lead (7fr) and the off-lead (5fr), on the
// Contrato grid. Each block is an <article> whose headline carries a stretched <Link>
// to /stories/:slug; the tour link is a sibling above it.
// ---------------------------------------------------------------------------

import { Link } from 'react-router-dom'
import { AgateRubric, PlanaKicker, type PlanaStory } from './plana-parts'
import { glueDashes } from '@/lib/typography'

function Story({ story, lang, className }: { story: PlanaStory; lang: 'en' | 'es'; className: string }) {
  return (
    <article className={`jx-story ${className}`}>
      <PlanaKicker story={story} />
      <h3><Link to={`/stories/${story.slug}`}>{story.headline}</Link></h3>
      <p>{glueDashes(story.brief)}</p>
      <AgateRubric story={story} lang={lang} />
    </article>
  )
}

export function PlanaLeadBlock({ lead, offLead, lang }: { lead: PlanaStory; offLead: PlanaStory | null; lang: 'en' | 'es' }) {
  if (!offLead) return <Story story={lead} lang={lang} className="jx-lead" />
  return (
    <div className="jx-a1">
      <Story story={lead} lang={lang} className="jx-lead" />
      <Story story={offLead} lang={lang} className="jx-off" />
    </div>
  )
}
