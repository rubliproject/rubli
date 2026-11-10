/**
 * «El Relevo» v3 — the Remotion film (src/remotion/relevo) in the Gallery, via
 * @remotion/player. Lazy-loaded by Gallery.tsx for this one slug, so Remotion's
 * runtime only ships to viewers of this film. Other films keep StoryFilm.
 */
import { useCallback } from 'react'
import { Player } from '@remotion/player'
import { ArrowRight } from 'lucide-react'
import { Relevo } from '@/remotion/relevo/Relevo'
import { FPS, totalFrames } from '@/remotion/relevo/timing'
import { filmPoster } from '@/lib/gallery/films'

type Lang = 'en' | 'es'

export default function RelevoPlayer({ slug, lang, onOpenFull }: { slug: string; lang: Lang; onOpenFull: () => void }) {
  const renderPoster = useCallback(
    () => <img src={filmPoster(slug, lang)} alt="" width={1280} height={720} decoding="async" className="h-full w-full object-cover" />,
    [slug, lang],
  )
  return (
    <div>
      <div className="overflow-hidden rounded-sm bg-background-elevated ring-1 ring-border">
        <Player
          key={lang}
          component={Relevo}
          inputProps={{ lang }}
          durationInFrames={totalFrames(lang)}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          controls
          clickToPlay
          doubleClickToFullscreen
          allowFullscreen
          renderPoster={renderPoster}
          showPosterWhenUnplayed
          showPosterWhenPaused={false}
          posterFillMode="player-size"
          acknowledgeRemotionLicense
          style={{ width: '100%', aspectRatio: '16 / 9' }}
          aria-label={lang === 'en' ? 'Film: The Relay' : 'Película: El Relevo'}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onOpenFull}
          className="inline-flex min-h-11 items-center gap-2 rounded-sm px-2 font-mono text-xs uppercase tracking-[0.08em] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {lang === 'en' ? 'Read the story' : 'Leer la historia'} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
