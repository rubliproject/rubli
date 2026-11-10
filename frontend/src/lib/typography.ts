/**
 * Typographic glue — the line-break control CSS cannot express.
 *
 * `text-wrap: balance | pretty` (index.css § measure) evens out line lengths
 * but is phrase-blind: it will end a line on a lone dash, an article, or the
 * first word of an accent phrase ("The Cash Count: nine / trillion pesos").
 * These helpers swap ordinary spaces for U+00A0 (no-break space) at the few
 * places a break reads wrong. Display copy only — never i18n JSON, never
 * running prose (where `pretty` is enough).
 *
 * docs/FRONTEND_WEEKEND_2026-10-03.md § Track A
 */
import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

const NB = String.fromCharCode(0xa0) // U+00A0 no-break space

/** One-syllable function words that must not end a line (glued to the next word). */
const GLUE_WORDS: Record<'es' | 'en', string[]> = {
  es: ['a', 'y', 'o', 'e', 'u', 'de', 'del', 'el', 'la', 'lo', 'los', 'las', 'en', 'un', 'una', 'con', 'por', 'sin'],
  en: ['a', 'an', 'of', 'the', 'on', 'in', 'to', 'at', 'by', 'or', 'and'],
}
const GLUE_RE = {
  es: new RegExp(`(?<=^|[\\s(«“"'])(${GLUE_WORDS.es.join('|')}) +(?=\\S)`, 'giu'),
  en: new RegExp(`(?<=^|[\\s(«“"'])(${GLUE_WORDS.en.join('|')}) +(?=\\S)`, 'giu'),
}

const ALL_GLUE = new Set([...GLUE_WORDS.es, ...GLUE_WORDS.en])

/** Longest no-break run (chars) noOrphan builds — census: 18 chars at 40px overflowed the 318px story column at 390. */
const MAX_GLUE = 16
/** Longest accent phrase glued whole — accents are heavier (600) and sit mid-line, so tighter. */
const MAX_PHRASE = 20

const langKey = (lang: string): 'es' | 'en' => (lang.toLowerCase().startsWith('es') ? 'es' : 'en')

/** Dash never leads a line — the only glue running prose gets. */
export function glueDashes(text: string): string {
  return text.replace(/ +([—–])/g, `${NB}$1`)
}

/** Dash never leads a line; short function words never end one. */
export function tidy(text: string, lang: string): string {
  return glueDashes(text).replace(GLUE_RE[langKey(lang)], `$1${NB}`)
}

/**
 * Join the last two words so a block never ends on a one-word stub.
 * `max` caps the no-break run in chars: the default fits 40px display type in the 318px story
 * column at 390; smaller type can afford more (≈ 318 / (0.48 × font-size)).
 */
export function noOrphan(text: string, max = MAX_GLUE): string {
  // split on ordinary spaces only — U+00A0 runs from `tidy` count as one unit
  const m = /^([\s\S]*[^ ]) +([^ ]+ *)$/.exec(text)
  if (!m) return text
  // already ends on a glued pair — idempotent, unless that pair is «and Disappeared»: a function word
  // plus one word is still a two-word stub, so it takes one more
  if (m[2].includes(NB) && !ALL_GLUE.has(m[2].split(NB)[0].toLowerCase())) return text
  const prev = /[^ ]+$/.exec(m[1])?.[0] ?? ''
  // ponytail: length guard instead of measuring — a glued run wider than the column would overflow at 390px
  const last = m[2].trim()
  if (prev.length + 1 + last.length <= max) return `${m[1]}${NB}${m[2]}`
  // run too long: release the glue inside `prev` («la licitación») so balance can break before the
  // last two words — an article at a line end reads better than a one-word last line
  const k = prev.lastIndexOf(NB)
  if (k < 0) return text
  const head = `${m[1].slice(0, m[1].length - prev.length)}${prev.slice(0, k)} `
  const tail = prev.slice(k + 1)
  return tail.length + 1 + last.length <= max ? `${head}${tail}${NB}${m[2]}` : `${head}${tail} ${m[2]}`
}

/**
 * Pass as `max` for a lede or other running prose: dash glue only, no word or phrase glue —
 * `text-wrap: pretty` owns the ragged edge and long no-break units make it uneven.
 */
export const PROSE = -1

const mapStrings = (node: ReactNode, f: (t: string) => string): ReactNode => {
  if (typeof node === 'string') return f(node)
  if (isValidElement(node) && node.type === Fragment) return mapStrings((node as ReactElement<{ children?: ReactNode }>).props.children, f)
  return Array.isArray(node) ? Children.toArray(node).map((it) => (typeof it === 'string' ? f(it) : it)) : node
}

/** Plain-text content of an accent element short enough to keep whole, else null. */
const shortPhrase = (node: unknown, cap: number): string | null => {
  if (!isValidElement(node) || node.type === Fragment) return null
  const txt = textOf((node as ReactElement<{ children?: ReactNode }>).props.children)
  return txt !== null && txt.length <= cap && / /.test(txt) ? txt : null
}

const textOf = (node: ReactNode): string | null => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    const parts = node.map(textOf)
    return parts.every((p) => p !== null) ? parts.join('') : null
  }
  return null
}

/**
 * `tidy` for React children — headlines with accent spans.
 * String segments get `tidy` (and `noOrphan` on the last one); a short accent
 * phrase (<= 20 chars of plain text) is kept whole; the word leading into an
 * accent stays with it unless a sentence ends there ("More than 7 in 10").
 * Elements are kept (same type, props, key); anything nested deeper is untouched.
 */
export function tidyNodes(node: ReactNode, lang: string, max?: number): ReactNode {
  if (max === PROSE) return mapStrings(node, glueDashes)
  if (typeof node === 'string') return noOrphan(tidy(node, lang), max)
  const phraseMax = max ?? MAX_PHRASE
  if (isValidElement(node) && node.type === Fragment) {
    return tidyNodes((node as ReactElement<{ children?: ReactNode }>).props.children, lang, max)
  }
  if (!Array.isArray(node)) return node
  // merge adjacent strings — JSX `{' '}` arrives as its own child
  const items = Children.toArray(node).reduce<ReturnType<typeof Children.toArray>>((acc, it) => {
    const prev = acc[acc.length - 1]
    if (typeof it === 'string' && typeof prev === 'string') acc[acc.length - 1] = prev + it
    else acc.push(it)
    return acc
  }, [])
  let lastText = -1
  items.forEach((it, i) => { if (typeof it === 'string') lastText = i })
  return items.map((it, i) => {
    if (typeof it === 'string') {
      let s = tidy(it, lang)
      if (i === lastText && i === items.length - 1) s = noOrphan(s, max)
      // the lead-in word rides with the accent only when the accent is one unit («More than 7 in 10»)
      if (shortPhrase(items[i + 1], phraseMax) !== null && /[^\s.:;!?,—–] $/.test(s)) s = s.slice(0, -1) + NB
      return s
    }
    if (isValidElement(it)) {
      const el = it as ReactElement<{ children?: ReactNode }>
      const short = shortPhrase(el, phraseMax)
      if (short !== null) return cloneElement(el, undefined, short.replace(/ +/g, NB))
      // a longer accent may wrap, but never strands its first word at a line end («nine | trillion pesos»)
      const txt = textOf(el.props.children)
      const first = txt === null ? null : /^(\S+) +(\S+)/.exec(txt)
      if (txt !== null && first && first[0].length <= phraseMax) return cloneElement(el, undefined, txt.replace(/ +/, NB))
    }
    return it
  })
}
