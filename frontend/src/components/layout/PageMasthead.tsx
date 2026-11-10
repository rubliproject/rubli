/**
 * PageMasthead — the one page header («EL ÍNDICE», face spec § 3).
 *
 * Every page opens with the same three facts in the same places: its numeral,
 * its name, and (on the five front pages) the edition it belongs to.
 *
 *   portada          sentence-led page (Panel, Sala de Redacción, La Galería — index links since 2026-10-05)
 *   portada-compact  plate-led front page strip (El Mapa, El Atlas — adopted in S2)
 *   indice           index pages
 *   expediente       dossiers (6 px sector rail instead of the head rule)
 *   story            story heads
 *
 * Exact px live in `index.css` (`.mh-*`, three media steps, no clamp). No
 * entrance motion. The root reports whether it is on screen through
 * `html[data-mh]`, which the Header uses to swap the crumb for the running head.
 */
import { useDataCut } from '@/lib/useDataCut'
import { isValidElement, useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cn, formatNumber } from '@/lib/utils'
import { tidyNodes } from '@/lib/typography'
import { CURRENT_MODEL_VERSION } from '@/lib/constants'
import { DATA_QUALITY_QUERY, FRONT_PAGES, entryFor, folioFor, formatCut, nextFront, numeralOf } from '@/lib/nav/toc'

export type MastheadVariant = 'portada' | 'portada-compact' | 'indice' | 'expediente' | 'story'

export interface PageMastheadProps {
  variant: MastheadVariant
  /** Slot 2 — the page's shipped kicker words, verbatim (no leading «§»). */
  kicker: ReactNode
  /** The h1. */
  title: ReactNode
  /** Slot 3 — `2002–2026`, an entity's active years, or a window. */
  range?: ReactNode
  /** Slot 1 override: a dossier's printed id or a story's `IV·06`. Defaults to the route's numeral, else `RUBLI`. */
  folio?: ReactNode
  /** Route to number from; defaults to the current location. */
  route?: string
  /** `figure` sets the caller's title node in the figures face (contract amount). */
  titleStyle?: 'words' | 'figure'
  /** `tidyNodes` phrase cap for the h1 accent fragments. */
  titleMax?: number
  /** Hide the h1 text while its live figures load (keeps its box). */
  titlePending?: boolean
  dek?: ReactNode
  /** Authored phone dek (the dek's first sentence, verbatim) — shown < 640 px instead of `dek` (§ 8). */
  dekShort?: ReactNode
  /** Fixed 24 px slot under the h1 (the dashboard's live-data pill). */
  status?: ReactNode
  /** Rendered between the dek and the foot hairline. */
  children?: ReactNode
  /** Right end of the eyebrow row (Print / PDF). */
  actions?: ReactNode
  /** Índice ear (≤ 3 figures). */
  ear?: ReactNode
  /** Dossier aside (seal / verdict card). */
  aside?: ReactNode
  /** Dossier sector rail colour (hex via style, never className). */
  rail?: string
  /** Screen-reader name for the rail colour. */
  railLabel?: string
  /** The edition line; defaults on for the two portada variants. */
  edition?: boolean
  className?: string
}

/** Middot-joined eyebrow; each sub-label is its own nowrap unit. */
// A held item keeps its room while its data loads: `.mh-held` paints its `data-hold` text
// invisibly from CSS, so no placeholder figure ever enters the text. Its separator is held too.
const isHeld = (x: ReactNode) => isValidElement<{ 'data-hold'?: string }>(x) && x.props['data-hold'] !== undefined

function Units({ items }: { items: ReactNode[] }) {
  const present = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '')
  return (
    <>
      {present.map((it, i) => (
        <span key={i} className="mh-unit">
          {it}
          {i < present.length - 1 && (isHeld(present[i + 1])
            ? <span className="mh-sep mh-held" aria-hidden="true" data-hold="·" />
            : <span className="mh-sep" aria-hidden="true">·</span>)}
        </span>
      ))}
    </>
  )
}

export function EditionLine({ compact = false, route }: { compact?: boolean; route: string }) {
  const cut = useDataCut()
  const { t, i18n } = useTranslation('common')
  const { t: tn } = useTranslation('nav')
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const { data, isLoading } = useQuery(DATA_QUALITY_QUERY)
  const count = data?.analyzed_contracts
  const current = entryFor(route)

  const facts: ReactNode[] = [
    <abbr key="cut" title={t('edition.cutTitle')} className="mh-abbr">
      {t('edition.cut', { date: formatCut(cut, lang) })}
    </abbr>,
    // the version keeps its lowercase «v» inside the uppercase line
    <span key="model">{t('edition.model', { v: '' }).trim()} <span className="mh-ver">{CURRENT_MODEL_VERSION}</span></span>,
    // The count drops with its separator while loading or when absent — never a typed fallback.
    !compact && typeof count === 'number' ? (
      <abbr key="count" title={t('edition.countTitle')} className="mh-abbr">
        {t('edition.count', { n: formatNumber(count) })}
      </abbr>
    ) : !compact && isLoading ? (
      // PERF launch § 6 (CLS): hold the count's room while it loads — invisible, and the
      // mono face makes any 7-digit figure the same width — so the line does not wrap late.
      <span key="count" className="mh-held" aria-hidden="true" data-hold={t('edition.count', { n: formatNumber(1_000_000) })} />
    ) : null,
  ]

  return (
    <div className={cn('mh-edition', compact && 'mh-edition--compact')}>
      <p className="mh-edition-facts"><Units items={facts} /></p>
      <nav aria-label={t('edition.indexAria')} className="mh-edition-index">
        {FRONT_PAGES.map((e) => {
          const n = numeralOf(e)
          const here = e === current
          return here ? (
            <span key={e.href} aria-current="page" className="mh-index-here">
              {n} <span>{tn(`toc.${e.key}`)}</span>
            </span>
          ) : (
            <Link key={e.href} to={e.href} className="mh-index-link" aria-label={`${n} · ${tn(`toc.${e.key}`)}`}>
              {n}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function PageMasthead({
  variant, kicker, title, range, folio, route, titleStyle = 'words', titleMax, titlePending,
  dek, dekShort, status, children, actions, ear, aside, rail, railLabel, edition, className,
}: PageMastheadProps) {
  const location = useLocation()
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const path = route ?? location.pathname
  const rootRef = useRef<HTMLElement>(null)

  // Running-head switch: one observer, CSS does the rest (no Header re-render).
  useEffect(() => {
    const el = rootRef.current
    const html = document.documentElement
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => html.setAttribute('data-mh', entry.isIntersecting ? 'on' : 'off'),
      { rootMargin: '-44px 0px 0px 0px' },
    )
    io.observe(el)
    return () => { io.disconnect(); html.removeAttribute('data-mh') }
  }, [])

  const numeral = folioFor(path)
  const address: ReactNode = folio ?? numeral ?? 'RUBLI'
  const offToc = folio == null && numeral == null
  const isFront = variant === 'portada' || variant === 'portada-compact'
  const showEdition = edition ?? isFront
  // The brand already sits in the address slot: «RUBLI · RUBLI REPORTE…» → «RUBLI · REPORTE…».
  const kick = offToc && typeof kicker === 'string' && kicker.startsWith('RUBLI ') ? kicker.slice(6) : kicker
  // Plate-led strip: the edition rides the eyebrow row's right end (29 px total).
  const rowEnd = variant === 'portada-compact' && showEdition
    ? <>{actions}<EditionLine compact route={path} /></>
    : actions

  const eyebrowRow = (
    <div className="mh-eyebrow-row">
      <p className="mh-eyebrow">
        <span className={cn('mh-num', offToc && 'mh-num--brand')}>{address}</span>
        <span className="mh-unit mh-unit--kicker">
          <span className="mh-sep mh-num-sep" aria-hidden="true">·</span>
          <Units items={[kick, range]} />
        </span>
      </p>
      {rowEnd && <div className="mh-actions">{rowEnd}</div>}
    </div>
  )

  const h1 = (
    <h1
      className={cn('mh-h1', `mh-h1--${variant}`, titleStyle === 'figure' && 'mh-h1--figure')}
      style={titlePending ? { visibility: 'hidden' } : undefined}
    >
      {titleStyle === 'figure' ? title : tidyNodes(title, lang, titleMax)}
    </h1>
  )

  return (
    <header
      ref={rootRef}
      data-masthead={variant}
      // One left edge: numeral, kicker, h1, dek and rail all start at the content
      // edge. (The ≥1280 hanging-numeral gutter set the h1 48px right of the
      // eyebrow and of the body below it — retired 2026-10-07.)
      className={cn('mh', `mh--${variant}`, className)}
    >
      {showEdition && variant === 'portada' && <EditionLine route={path} />}
      {variant === 'expediente' && rail && (
        <div className="mh-rail" style={{ background: rail }}>
          {railLabel && <span className="sr-only">{railLabel}</span>}
        </div>
      )}
      {variant === 'story' && <div className="mh-rule" aria-hidden="true" />}

      {/* The plate-led strip spans the full header width, above the ear (§ 3.5). */}
      {variant === 'portada-compact' && eyebrowRow}
      <div className={cn('mh-body', ear && 'mh-body--ear', aside && 'mh-body--aside')}>
        <div className="mh-main">
          {variant !== 'portada-compact' && eyebrowRow}
          {h1}
          {status !== undefined && <div className="mh-status">{status}</div>}
          {dek && (
            <p className={cn('mh-dek', `mh-dek--${variant}`)} data-deck>
              {dekShort
                ? <><span className="mh-dek-full">{tidyNodes(dek, lang)}</span><span className="mh-dek-short">{tidyNodes(dekShort, lang)}</span></>
                : tidyNodes(dek, lang)}
            </p>
          )}
          {children}
        </div>
        {ear && <div className="mh-ear">{ear}</div>}
        {aside && <aside className="mh-aside">{aside}</aside>}
      </div>
      <div className="mh-foot" aria-hidden="true" />
    </header>
  )
}

/** `SIGUE EN II · SEXENIOS →` — the front page's jump line, from `nextFront` (§ 6). */
export function JumpLine({ from, label }: { from: string; label?: string }) {
  const { t } = useTranslation('common')
  const { t: tn } = useTranslation('nav')
  const next = nextFront(from)
  if (!next) return null
  return (
    <p className="mh-jump">
      <Link to={next.href} className="mh-jump-link">
        {label ?? t('jump.next', { n: numeralOf(next), name: tn(`toc.${next.key}`) })}
      </Link>
    </p>
  )
}
