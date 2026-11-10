// ---------------------------------------------------------------------------
// PlanaDesk — «El sumario»: the rest of the stories as one ruled list.
//
// The owner's constitution for this page is "just list the stories, like the Guardian
// front page." One row per story: the type kicker, then headline, brief and agate
// rubric. Ordered by the status ladder (advanced cases first, raw data leads last):
// an ORDER, not an invented taxonomy. Each row's headline carries a stretched link.
// ---------------------------------------------------------------------------

import { Link } from 'react-router-dom'
import { AgateRubric, PlanaKicker, type PlanaStory } from './plana-parts'
import { glueDashes } from '@/lib/typography'

export function PlanaDesk({ stories, lang }: { stories: PlanaStory[]; lang: 'en' | 'es' }) {
  if (stories.length === 0) return null
  return (
    <ol role="list" className="jx-desk">
      {stories.map((s) => (
        <li key={s.slug} className="jx-item jx-story">
          <PlanaKicker story={s} />
          <div>
            <h3><Link to={`/stories/${s.slug}`}>{s.headline}</Link></h3>
            <p>{glueDashes(s.brief)}</p>
            <AgateRubric story={s} lang={lang} />
          </div>
        </li>
      ))}
    </ol>
  )
}
