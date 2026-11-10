// Split out of FlightPlayer.tsx so that file exports only components (react-refresh/only-export-components).
import type { HopTarget } from './SkyEngine'
import type { StoryChapter } from '@/lib/atlas-stories'
import { PERIOD_KEYS } from '@/lib/atlas/sky/url-state'
import type { SkyBodies, SkyManifest, SkySystem } from '@/lib/atlas/sky/geometry'

export interface CompiledWaypoint {
  target: HopTarget
  /** star index framed, or null */
  star: number | null
  /** sexenio index (fox … sheinbaum) */
  period: number | null
  /** ranking-safe focal vendors (planet first), only once the host system is known */
  focus: { vendor_id: number; name: string }[]
  /** body indices to ring (desktop; empty on phone) */
  highlight: number[]
}

/** Pure: a chapter + the sky → camera target, lit sexenio and the named, ringed bodies. */
export function compileWaypoint(ch: StoryChapter, manifest: SkyManifest, bodies: SkyBodies | null, system: SkySystem | null): CompiledWaypoint {
  const S = manifest.stars
  const at = ch.at
  const period = at.period ? PERIOD_KEYS.indexOf(at.period) : -1
  let star: number | null = null
  if (at.star != null) {
    const k = manifest.inst_map.raw.indexOf(at.star)
    const canon = k >= 0 ? manifest.inst_map.canon[k] : at.star
    const i = S.id.indexOf(canon)
    star = i >= 0 ? i : null
  }
  const target: HopTarget = star != null ? { kind: 'star', idx: star } : at.sector != null ? { kind: 'sector', id: at.sector } : { kind: 'home' }
  const focus: CompiledWaypoint['focus'] = []
  const highlight: number[] = []
  if (star != null && system && system.star.id === S.id[star]) {
    const safe = new Set(system.ranked)
    for (const v of [...(at.planet != null ? [at.planet] : []), ...(at.highlight ?? [])]) {
      const row = safe.has(v) ? system.bodies.find((b) => b.vendor_id === v) : undefined
      if (!row || focus.some((f) => f.vendor_id === v)) continue
      focus.push({ vendor_id: v, name: row.name })
      const bi = bodies?.index.get(v)
      if (bi !== undefined) highlight.push(bi)
    }
  }
  return { target, star, period: period >= 0 ? period : null, focus, highlight }
}
