// ---------------------------------------------------------------------------
// La Primera Plana — shared front-page parts, on «El Contrato» (DESIGN.md §2, §6).
//
// The story shape the page maps into, the type kicker (a 10px categorical square +
// Spectral SC), the agate rubric (status by INK WEIGHT, never color: there is no green
// anywhere) and the Atlas tour link. No charts, no SVG, no stat meters.
// ---------------------------------------------------------------------------

import { cieloHref } from '@/lib/vista'
import { Link } from 'react-router-dom'
import { findStoryByLongformSlug } from '@/lib/atlas-stories'

/** One localized story, pre-shaped by the page so the parts are pure renderers. */
export interface PlanaStory {
  slug: string
  headline: string
  brief: string
  color: string // categorical mark (getCaseFraudColor), applied via style only
  ink: string // its text twin (CATEGORICAL_TEXT)
  typeLabel: string // localized, sentence case (small caps via Spectral SC)
  statusLabel: string // t(`status.${status}`), sentence case
  statusRank: 'consequence' | 'reported' | 'lead' // drives the ink-weight ladder
  eraLabel: string // t(`eraLabel.${era}`), carries its own year range
  contractsLabel: string | null // "1,931,317 contratos": lead / off-lead only
}

export function PlanaKicker({ story }: { story: PlanaStory }) {
  return (
    <div className="jx-kicker" style={{ ['--ink' as string]: story.ink }}>
      <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: story.color }} />
      {story.typeLabel}
    </div>
  )
}

// The matching Atlas tour (renders nothing unless the slug binds a longform tour).
// A SIBLING of the headline's stretched link, never inside it, and above its ::after.
export function PlanaTourBadge({ slug, ink, lang }: { slug: string; ink: string; lang: 'en' | 'es' }) {
  const tour = findStoryByLongformSlug(slug)
  if (!tour) return null
  return (
    <Link
      to={cieloHref({ story: tour.id })}
      className="jx-tour"
      style={{ ['--ink' as string]: ink }}
      aria-label={
        lang === 'en'
          ? `${tour.duration} connections tour: ${tour.title.en}`
          : `Recorrido de ${tour.duration} por los vínculos: ${tour.title.es}`
      }
    >
      {lang === 'en' ? `${tour.duration} tour · connections` : `Recorrido ${tour.duration} · vínculos`}
    </Link>
  )
}

// One agate line under each story: the reporting status (distance to consequence, in
// ink weight), the era and, on the lead and off-lead only, the contract count.
export function AgateRubric({ story, lang }: { story: PlanaStory; lang: 'en' | 'es' }) {
  return (
    <div className="jx-rubric">
      <b className={`is-${story.statusRank}`}>{story.statusLabel}</b>
      <span>{story.eraLabel}</span>
      {story.contractsLabel && <span>{story.contractsLabel}</span>}
      <PlanaTourBadge slug={story.slug} ink={story.ink} lang={lang} />
    </div>
  )
}
