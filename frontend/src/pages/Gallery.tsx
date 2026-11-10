/**
 * Gallery — «La sala» / Screening room (renamed from «La Galería» in rc4, owner 2026-11-04).
 *
 * The films: the Intro, the 2002–2025 history, and four microcosms — narrated, hand-drawn,
 * in both languages (lib/gallery/story-films.json + components/gallery/films/*).
 *
 *   /gallery        → the films
 *   /gallery/:slug  → one film. A Newsroom story slug with no film of its own still plays
 *                     its data-driven explainer (StoryAnimationPlayer), off the grid.
 */
import { lazy, Suspense, useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Play, ArrowLeft } from 'lucide-react'
import { STORIES } from '@/lib/story-content'
import { StoryAnimationPlayer } from '@/components/gallery/StoryAnimationPlayer'
import { StoryFilm } from '@/components/gallery/StoryFilm'
import { FILMS, HIDDEN_FILMS, type FilmDef } from '@/lib/gallery/films'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import '@/components/gallery/gallery.css'
import { STORIES_LIVE } from '@/lib/constants'

// «El Relevo» is built in Remotion (src/remotion/relevo); its player chunk loads only on its own page.
const REMOTION_FILMS = new Set(['el-monopolio-invisible'])
const RelevoPlayer = lazy(() => import('@/components/gallery/RelevoPlayer'))

const filmMs = (f: FilmDef) => f.runtimeMs ?? f.beats.reduce((a, b) => a + b.durationMs, 0)

function filmRuntime(f: FilmDef): string {
  const s = Math.round(filmMs(f) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function FilmCard({ f, lang, wide = false }: { f: FilmDef; lang: 'en' | 'es'; wide?: boolean }) {
  return (
    <Link to={`/gallery/${f.slug}`} className={`gl-card${wide ? ' is-wide' : ''}`}>
      <div className="gl-kick">
        <span>{f.kicker ? f.kicker[lang] : lang === 'es' ? 'Película' : 'Film'}</span>
        <span className="ct-mono">{filmRuntime(f)}</span>
      </div>
      <h3>{f.title[lang]}</h3>
      <p>{(f.hook ?? f.subtitle)[lang]}</p>
      <span className="gl-sp" aria-hidden />
      <span className="gl-watch"><Play className="h-4 w-4" aria-hidden /> {lang === 'es' ? 'Ver' : 'Watch'}</span>
    </Link>
  )
}

export default function Gallery() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'

  const story = useMemo(() => (slug ? STORIES.find((s) => s.slug === slug) : undefined), [slug])
  const filmDef = useMemo(() => (slug ? FILMS[slug] : undefined), [slug])
  const films = Object.values(FILMS)

  const es = lang === 'es'
  const trail = [{ label: es ? 'Descubrir' : 'Discover' }, { label: es ? 'La sala' : 'Screening room', to: slug ? '/gallery' : undefined }]

  // ── Player view ──
  if (slug && HIDDEN_FILMS.has(slug)) return <Navigate to="/gallery" replace />
  if (slug) {
    if (!story && !filmDef) {
      return (
        <article className="ct ct-page ct-sheet" data-frame>
          <div className="ct-wrap">
            <DocHead trail={trail} />
            <Cover className="is-op" title={es ? 'Película no encontrada' : 'Film not found'} />
            <Link to="/gallery" className="gl-back"><ArrowLeft className="h-4 w-4" aria-hidden /> {es ? 'Volver a La sala' : 'Back to the Screening room'}</Link>
          </div>
        </article>
      )
    }
    // the end card leads into the long read behind the film, or into the platform
    const readSlug = filmDef?.story ?? story?.slug
    const others = films.filter((f) => f.slug !== slug).slice(0, 3)
    const title = filmDef ? filmDef.title[lang] : story ? (es ? story.headline_es ?? story.headline : story.headline) : ''
    return (
      <article className="ct ct-page ct-sheet" data-frame>
        <div className="ct-wrap">
          <DocHead trail={[...trail, { label: String(title) }]} />
          <div className="gl-player">
            {filmDef && REMOTION_FILMS.has(filmDef.slug) ? (
              <Suspense fallback={<div className="aspect-video w-full bg-background-elevated" />}>
                <RelevoPlayer
                  key={slug}
                  slug={filmDef.slug}
                  lang={lang}
                  onOpenFull={() => navigate(readSlug && STORIES_LIVE ? `/stories/${readSlug}` : '/')}
                />
              </Suspense>
            ) : filmDef ? (
              <StoryFilm
                key={slug}
                film={filmDef}
                lang={lang}
                onOpenFull={() => navigate(readSlug && STORIES_LIVE ? `/stories/${readSlug}` : '/')}
                openLabel={readSlug && STORIES_LIVE ? undefined : { en: 'Enter the platform', es: 'Entrar a la plataforma' }}
              />
            ) : story ? (
              <StoryAnimationPlayer
                key={slug}
                story={story}
                lang={lang}
                onClose={() => navigate('/gallery')}
                onOpenFull={() => navigate(STORIES_LIVE ? `/stories/${story.slug}` : '/')}
              />
            ) : null}
          </div>
          <section className="ct-section" aria-labelledby="gl-more-h">
            <div className="ct-annex-row"><h2 id="gl-more-h" className="ct-h2">{es ? 'Sigue viendo' : 'Keep watching'}</h2></div>
            <div className="ct-section-body">
              <div className="gl-grid is-3">
                {others.map((f) => <FilmCard key={f.slug} f={f} lang={lang} />)}
              </div>
            </div>
          </section>
        </div>
      </article>
    )
  }

  // ── Grid view ──
  const main = films.filter((f) => !f.section)
  const totalMin = Math.round(films.reduce((a, f) => a + filmMs(f), 0) / 60000)
  return (
    <article className="ct ct-page ct-sheet" data-frame>
      <div className="ct-wrap">
        <DocHead trail={trail} meta={<>{t('gallery.range', { n: films.length }).toLowerCase()} · {totalMin} min</>} />
        <Cover
          className="is-op"
          title={es ? 'La sala' : 'Screening room'}
          lede={es
            ? 'Una historia larga y cuatro de cerca, en español e inglés. Cada película termina en el reportaje completo.'
            : 'One long story and four close-ups, in English and Spanish. Each film ends at the full written story.'}
        />
        {/* the two long films lead on one row; the close-ups share the next and fill it.
            The hidden h2 keeps the outline h1 → h2 → card h3 (launch audit 2026-10-28 N1). */}
        <section aria-labelledby="gl-films-h">
          <h2 id="gl-films-h" className="sr-only">{es ? 'Las películas' : 'The films'}</h2>
          <div className="gl-grid is-2 mt-4" data-object>
            {main.slice(0, 2).map((f) => <FilmCard key={f.slug} f={f} lang={lang} wide />)}
          </div>
          <div className="gl-grid is-flow is-cont">
            {main.slice(2).map((f) => <FilmCard key={f.slug} f={f} lang={lang} />)}
          </div>
        </section>

        {/* RUBLI's own investigations: found in the data, checked against outside records */}
        <section className="ct-section" aria-labelledby="gl-own-h">
          <div className="ct-annex-row"><h2 id="gl-own-h" className="ct-h2">{es ? 'Hallazgos propios' : 'Our findings'}</h2></div>
          <p className="ct-annex-lede">
            {es
              ? 'Patrones que encontramos en el registro y verificamos contra documentos oficiales antes de publicarlos. Describen contratos, no culpas. Aún no hemos pedido la postura de las instituciones y empresas nombradas; la añadiremos cuando respondan.'
              : 'Patterns we found in the record and checked against official documents before publishing. They describe contracts, not guilt. We have not yet asked the institutions and companies named for comment; their replies will be added when they give them.'}
          </p>
          <div className="ct-section-body">
            <div className="gl-grid is-3">
              {films.filter((f) => f.section === 'findings').map((f) => <FilmCard key={f.slug} f={f} lang={lang} />)}
            </div>
          </div>
        </section>
      </div>
    </article>
  )
}
