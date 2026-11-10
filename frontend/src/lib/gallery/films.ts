/**
 * films.ts — the film model for the StoryFilm engine, and the films themselves.
 *
 * A film is a list of beats, one narration clip each. A beat is drawn either by the
 * engine's particle modes (the Intro: one field of contract pages morphing between
 * shapes) or, for the story films, by a hand-built scene (`mode: 'scene'`) from the
 * film's module in components/gallery/films/. The scripts live in story-films.json.
 *
 * Cinematic colours live here on purpose — lib/ is outside the token-lint scope,
 * so the engine component (StoryFilm.tsx) stays free of raw hex and reads the
 * palette from the film def instead.
 */

import storyFilms from './story-films.json'

export type FilmMode =
  | 'field'
  | 'dissolve'
  | 'portal'
  | 'decode'
  | 'reassemble'
  | 'split'
  | 'benchmark'
  | 'redact'
  | 'valuescan'
  | 'spotlight'
  | 'gauge'
  | 'categorygrid'
  | 'modelnet'
  | 'network'
  | 'torch'
  | 'mark'
  | 'ribbon'
  | 'ribbontear'
  | 'titlecard'
  // El Registro (2026-07-02) — results-forward presentation film.
  | 'torrent'
  | 'strata'
  | 'ghosts'
  | 'monopoly'
  | 'lattice'
  | 'mass'
  // Intro recut (2026-10-03) — the closing ring around the wordmark.
  | 'halo'
  // Story films (2026-10-03) — a column chart built from the contract pages.
  | 'bars'
  // A hand-built shot from the film's own scene module (components/gallery/films/<slug>.ts).
  | 'scene'

export interface FilmStat {
  format: 'int' | 'pct' | 'currencyB' | 'currencyT' | 'text'
  target?: number
  text?: string
  /** Spanish variant of a `text` stat (e.g. "370M" / "370 MDP"). */
  textEs?: string
  /** decimals for pct / currency (defaults: pct 0–1, B 1, T 2). */
  decimals?: number
  prefix?: string
  suffix?: string
  /** force the accusing red (e.g. the diverted total, the blackout date). */
  red?: boolean
  /** count-up duration override (ms); defaults to 2200. */
  countMs?: number
  /** peso amount → engine renders a computed ≈US$ sub-line via formatCompactUSD (dual currency). */
  mxn?: number
  label: { en: string; es: string }
}

/**
 * Where the stat sits (Intro redesign, 2026-07-03). Kills the "everything piled
 * dead-center" overlap: each beat picks ONE slot and consecutive beats vary.
 * 'hero' (center sledgehammer, ≤3/film) · 'rail-left'/'rail-right' (side rail) ·
 * 'stamp' (rotated archival corner, for dates/case names) · 'none' (scene alone).
 */
export type StatSlot = 'hero' | 'rail-left' | 'rail-right' | 'stamp' | 'none'

/** A DOM label pinned at %-coords over the stage — the single text authority for scene annotations. */
export interface FilmAnnotation {
  x: number; y: number
  text: { en: string; es: string }
  mono?: boolean
  red?: boolean
}

/** Data for the `bars` mode: one column per value, pages stacked to its height. */
export interface FilmBars {
  values: number[]
  /** tick labels under the columns (years, acronyms). */
  labels?: string[]
  labelsEs?: string[]
  /** column indexes drawn in the accent red. */
  red?: number[]
  /** a dashed reference line at this value (an EU threshold, a risk cut-off). */
  line?: number
}

export interface FilmLayout {
  slot: StatSlot
  /** render the stat numeral in mono (baseline/tally treatments) rather than serif italic. */
  mono?: boolean
  /** dim scene ink in the center cell while a hero stat is live. */
  clearCenter?: boolean
  annotations?: FilmAnnotation[]
}

export interface FilmBeat {
  id: string
  mode: FilmMode
  tag: { en: string; es: string }
  caption: { en: string; es: string }
  /** Fallback dwell when sound is off; with narration on, the VO clip drives pacing. */
  durationMs: number
  stat?: FilmStat
  /** Reference marker for benchmark/split (e.g. the OECD ceiling). */
  ref?: { value: number; label: { en: string; es: string } }
  verdict?: { en: string; es: string }
  // ── 15-min chaptered film (el-expediente) ──
  /** chapter index for wayfinding + progress grouping (0 = cold open). */
  chapter?: number
  /** act roman numeral, only on titlecard beats. */
  act?: string
  /** chapter wayfinding cue shown top-left (e.g. "CH.1 · EL APAGÓN"). */
  chapterLabel?: { en: string; es: string }
  /** titlecard text. */
  cardKicker?: { en: string; es: string }
  cardTitle?: { en: string; es: string }
  /** honesty provenance, rendered as small agate under the stat. */
  agate?: { en: string; es: string }
  /** a beat that paces on durationMs with no narration (engineered silence). */
  silence?: boolean
  /** the music bed drops out for this beat (the blackout is heard as well as seen). */
  hush?: boolean
  /** share (0–1) shown in red by `split`, `benchmark` and `gauge`. */
  frac?: number
  /** `monopoly`: [vendors on the ring, how many of them red]. */
  ring?: [number, number]
  /** `network`: number of clusters (default 7). */
  clusters?: number
  bars?: FilmBars
  /** key of this shot's draw function in the film's scene module (mode 'scene'). */
  scene?: string
  /** length of the narration clip in ms, per language (written by gen_film_vo.py). */
  clip?: { en?: number; es?: number }
  /** sentence start times as a fraction of the narration clip, per language (written by gen_film_vo.py). */
  cues?: { en?: number[]; es?: number[] }
  /**
   * Rendering medium for this beat's canvas layer (El Teatro de Papel, 2026-07-03).
   * 'objects' → a cut-vector object scene from SCENES[mode]; 'particles' (default) →
   * the legacy particle-morph engine. Lets object scenes land incrementally with a
   * particle fallback, so nothing blocks launch. DOM overlays (stat/subtitle/VO) are
   * renderer-independent.
   */
  renderer?: 'objects' | 'particles'
  /** stat placement + scene annotations (Intro redesign 2026-07-03). Absent → hero-center legacy. */
  layout?: FilmLayout
}

export interface FilmPalette {
  bg: string
  /** "r,g,b" channels (used with per-particle alpha). */
  ink: string
  dim: string
  accentRGB: string
  /** accent as a hex/colour string for lines + bars. */
  accent: string
}

export interface FilmDef {
  slug: string
  /** Newsroom story this film leads to from its end card. */
  story?: string
  /** what the film is, on its gallery card ("The feature", "Microcosm · the heist"). */
  kicker?: { en: string; es: string }
  /** gallery shelf: 'findings' = RUBLI's own verified investigations; default = the main shelf. */
  section?: 'findings'
  title: { en: string; es: string }
  subtitle: { en: string; es: string }
  /** one-line hook on the gallery card; falls back to `subtitle`. */
  hook?: { en: string; es: string }
  /** the unit drawn per particle — a contract glyph (document) or a plain dot. */
  glyph: 'doc' | 'dot'
  particleCount: number
  daFraction: number
  valueFraction: number
  palette: FilmPalette
  /** films not built from `beats` (the Remotion «El Relevo») state their own length. */
  runtimeMs?: number
  beats: FilmBeat[]
}

// El Expediente — the house palette. Warm ink-black ground, bone / aged-paper
// document glyphs, one accusing red that appears only on the corrupt unit.
const PALETTE_BLACKOUT: FilmPalette = {
  bg: '#0c0a09',
  ink: '232,226,212',
  dim: '140,134,123',
  accentRGB: '220,38,38',
  accent: '#dc2626',
}

// Presidential-term identity colours (Fox · Calderón · Peña Nieto · AMLO · Sheinbaum).
// Identity, never risk — used by the sexenio time-ribbon in el-expediente.
export const SEXENIO_COLORS = ['#3b82f6', '#22d3ee', '#f97316', '#8b5cf6', '#ec4899']

// ── Story films ───────────────────────────────────────────────────────────────
// The Intro and one film per Newsroom story live in story-films.json: the caption there
// is the narration verbatim, and frontend/scripts/gen_film_vo.py reads the same file to
// voice it (and writes back each beat's `durationMs` and subtitle `cues`). Bilingual
// fields are [en, es] pairs.
type Pair = [string, string]
interface RawBeat extends Pick<FilmBeat, 'id' | 'mode' | 'hush' | 'renderer' | 'frac' | 'ring' | 'clusters' | 'bars' | 'cues' | 'scene' | 'clip'> {
  tag: Pair
  cap: Pair
  slot?: StatSlot
  mono?: boolean
  stat?: Omit<FilmStat, 'label'> & { label: Pair }
  verdict?: Pair
  ref?: { value: number; label: Pair }
  annotations?: { x: number; y: number; text: Pair }[]
  durationMs?: number
}
interface RawFilm { title: Pair; subtitle: Pair; hook?: Pair; runtimeMs?: number; kicker?: Pair; story?: string; section?: 'findings'; hidden?: boolean; beats: RawBeat[] }

const pair = ([en, es]: Pair) => ({ en, es })

function storyFilm(slug: string, f: RawFilm): FilmDef {
  return {
    slug, story: f.story, section: f.section, kicker: f.kicker && pair(f.kicker), title: pair(f.title), subtitle: pair(f.subtitle),
    hook: f.hook && pair(f.hook), runtimeMs: f.runtimeMs,
    glyph: 'doc', particleCount: 1100, daFraction: 0.787, valueFraction: 0.25, palette: PALETTE_BLACKOUT,
    beats: f.beats.map(({ tag, cap, slot, mono, stat, verdict, ref, annotations, durationMs, ...rest }) => ({
      ...rest,
      tag: pair(tag), caption: pair(cap), durationMs: durationMs ?? 8000,
      layout: { slot: slot ?? 'none', mono, annotations: annotations?.map((a) => ({ x: a.x, y: a.y, text: pair(a.text), mono: true })) },
      stat: stat && { ...stat, label: pair(stat.label) },
      verdict: verdict && pair(verdict),
      ref: ref && { value: ref.value, label: pair(ref.label) },
    })),
  }
}

const RAW = Object.entries(storyFilms as unknown as Record<string, RawFilm>)
// `hidden` films stay in the script file (being re-cut) but are off the gallery and their URL in
// production builds; the dev server still plays them so they can be built and reviewed.
const isHidden = (f: RawFilm) => !!f.hidden && !import.meta.env.DEV
export const HIDDEN_FILMS = new Set(RAW.filter(([, f]) => isHidden(f)).map(([slug]) => slug))
export const FILMS: Record<string, FilmDef> = Object.fromEntries(
  RAW.filter(([, f]) => !isHidden(f)).map(([slug, f]) => [slug, storyFilm(slug, f)]),
)

/** The film's still (public/gallery-posters/ — not under public/gallery/, which would shadow the /gallery route in nginx), used as the Remotion player's poster. */
export const filmPoster = (slug: string, lang: 'en' | 'es') => `/gallery-posters/${slug}-${lang}.jpg`
