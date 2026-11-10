/**
 * CategoryDrill — «Qué hay en el anaquel» as a station board: Sector › Categoría › Subcategoría › Proveedores.
 *
 * The language of the Portada's «Salidas» board (DESIGN.md §7, owner 2026-11-03: «take inspiration from … the
 * airport/station scoreboard and the animation-driven work»): one dense panel, mono caps rows, the stations of the
 * drill lit in turn, a symbol legend. By day it is a printed platform timetable (ink on a tint), by night the
 * dark departures board — the same `--sb-*` roles re-valued in index.css (§6.7).
 *
 * The strip beside the rows holds the level's money in the sector colour (one segment per row, ∝ value, 2px gaps;
 * hatched = no kind stated in the contract text; plain rule = everything not listed). Motion explains the zoom:
 * picking a row grows its segment to the whole strip and the next level's segments are drawn inside it; going back
 * shrinks the strip into the segment it came from; the rows flip like a split-flap board as the level changes
 * (420 ms per cell, transform only). Pointer-initiated only — Esc and reduced motion change the level instantly.
 *
 * Subcategories are stored per contract by backend/scripts/classify_subcategories.py (text, Compendio supply
 * groups, partidas). «Compra consolidada» is how a thing was bought, never a kind: it is a share of each row.
 * Where the catch-all swallows the shelf (lib/category/drill.ts subcategorySplit) the level is skipped.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { getRiskLevelFromScore } from '@/lib/constants'
import '@/components/kit/patterns/patterns.css'
import { formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { sentenceCaseCaps } from '@/components/category/CategoryDossierSections'
import { MIN_NAMED_SHARE, consolidatedShare, foldSubs, isUnstated, largestKind, orderSubs, restOf, subcategorySplit, zoomFrom, type DrillLevel } from '@/lib/category/drill'

export interface DrillVendor {
  vendor_id: number
  vendor_name: string
  vendor_value: number
  avg_risk?: number | null
  persona_fisica?: boolean
}
export interface DrillSubRow {
  subcategory_id: number
  code?: string
  name_es: string
  name_en: string
  is_catch_all: boolean
  total_value: number
  avg_risk: number
  example_titles?: string[]
  /** share (0–100) of the value bought through a «compra consolidada» */
  consolidated_value_pct?: number | null
  vendors?: DrillVendor[]
}
export interface DrillCategory {
  category_id: number
  name_es: string
  name_en: string
  total_value: number
  avg_risk?: number | null
}

interface Item {
  key: string
  value: number
  kind: 'item' | 'catch' | 'rest'
  label: string
  risk?: number | null
  /** the name cell (a drill button or an entity chip) */
  name: ReactNode
  note?: string
  /** an example title — hidden on phone, where it would triple the list */
  example?: string
  /** consolidated-purchase share (0–100) — subcategory level only */
  cons?: number | null
  /** row / segment pick (zoom unless keyboard); absent = hover only */
  onPick?: (el: HTMLElement | null, keyboard?: boolean) => void
  /** the Nº when it is not the list position (the current category appended past the shown ones) */
  rank?: number
  current?: boolean
}

type Lang = 'en' | 'es'
const VENDORS_SHOWN = 10
const SIBLINGS_SHOWN = 12
/** DESIGN.md §8.1: a shelf longer than 12 rows shows 10 named kinds + its catch-all, the rest open in place */
const SUBS_SHOWN = 10
/** split-flap: lead 80 + rows × 24 ms + cells × 12 ms, capped at 8 rows; each cell a 420 ms heavy flap (DESIGN.md §7 ≤ 600 per cell; the Portada board's mechanical curve, owner «too fast»): the board settles by ≈ 860 ms */
const FLAP_ROWS = 8
const ZOOM_MS = 520
/** the rows wait for the strip's zoom to get going before they flip: the zoom leads */
const FLAP_LEAD = 80
/** «sin tipo» rows wear the kit pattern sin-dato (DESIGN.md § Patrones) */
const pat = (kind: Item['kind']) => (kind === 'catch' ? ' pat-sin-dato' : '')
const LEVEL_WORD: Record<'critical' | 'high' | 'medium' | 'low', { es: string; en: string }> = {
  critical: { es: 'Crítico', en: 'Critical' }, high: { es: 'Alto', en: 'High' }, medium: { es: 'Medio', en: 'Medium' }, low: { es: 'Bajo', en: 'Low' },
}
const reduceQ = '(prefers-reduced-motion: reduce)'
/** a click with detail 0 came from Enter / Space: Emil — never animate a keyboard-initiated level change */
const byKey = (e: MouseEvent) => e.detail === 0

/** The indicator as the board's status chip: level word + reading, coloured by level (low = gray, never green). */
function Status({ v, lang }: { v?: number | null; lang: Lang }) {
  if (v == null || v <= 0) return <span className="sb-dimtxt">—</span>
  const lvl = getRiskLevelFromScore(v)
  return (
    <span className={`sb-st is-${lvl}`} title={lang === 'es' ? 'indicador de riesgo promedio' : 'mean risk indicator'}>
      {/* floored: 0.598 must never print 0.60 beside «Alto» (the legend says crítico ≥ 0.60) */}
      {lang === 'es' ? LEVEL_WORD[lvl].es : LEVEL_WORD[lvl].en} {(Math.floor(v * 100) / 100).toFixed(2)}
    </span>
  )
}

export function CategoryDrill({
  lang, accent, sectorName, category, siblings, subs, categoryVendors, categoryVendorsTotal,
}: {
  lang: Lang
  /** the sector colour as a CSS value (a token, so the night edition re-values it) */
  accent: string
  sectorName: string | null
  category: DrillCategory
  /** every category of the same sector (incl. this one) */
  siblings: DrillCategory[]
  subs: DrillSubRow[]
  /** the category's own top vendors — the fallback level when subcategories say nothing */
  categoryVendors: DrillVendor[]
  categoryVendorsTotal: number
}) {
  const es = lang === 'es'
  const L = (a: string, b: string) => (es ? a : b)
  const [params, setParams] = useSearchParams()
  const split = useMemo(() => subcategorySplit(subs), [subs])
  const ordered = useMemo(() => orderSubs(subs.filter((s) => s.total_value > 0)), [subs])

  const subId = Number(params.get('sub'))
  const sub = split.useful ? ordered.find((s) => s.subcategory_id === subId) ?? null : null
  const level: DrillLevel = params.get('nivel') === 'sector' && siblings.length > 1 ? 'sector' : sub ? 'sub' : 'category'
  const [hover, setHover] = useState<string | null>(null)
  const [reduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(reduceQ).matches)
  // a zoom re-keys the body, so the clicked control unmounts: hand focus to the reading (a11y)
  const readRef = useRef<HTMLParagraphElement>(null)
  // where focus lands when the level has no reading sentence
  const headRef = useRef<HTMLHeadingElement>(null)
  const listId = useId()
  const stripRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  /** the pending zoom: 'in' = the picked segment's box (fractions of the strip); 'out' = the key to shrink into */
  const zoom = useRef<{ dir: 'in'; at: number; size: number } | { dir: 'out'; key: string } | null>(null)
  const viewKey = `${level}-${sub?.subcategory_id ?? ''}`
  const [animate, setAnimate] = useState(false)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const z = zoom.current
    zoom.current = null
    const strip = stripRef.current
    if (!z || !strip || reduce || typeof strip.animate !== 'function') return
    const vertical = strip.scrollHeight > strip.offsetWidth // desktop strip runs down; the phone strip runs across
    let from: { at: number; size: number } | null = null
    if (z.dir === 'in') from = { at: z.at, size: z.size }
    else {
      const seg = strip.querySelector<HTMLElement>(`[data-k="${z.key}"]`)
      if (seg) from = zoomFrom(vertical ? seg.offsetTop / strip.offsetHeight : seg.offsetLeft / strip.offsetWidth,
        vertical ? seg.offsetHeight / strip.offsetHeight : seg.offsetWidth / strip.offsetWidth)
    }
    if (!from || !(from.size > 0)) return
    const t = vertical
      ? `translateY(${from.at * 100}%) scaleY(${from.size})`
      : `translateX(${from.at * 100}%) scaleX(${from.size})`
    // the new level's segments start packed inside the box they belong to and spread to the whole strip
    strip.animate([{ transform: t }, { transform: 'none' }], { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.7,.2,1)' })
  }, [viewKey, reduce])

  useEffect(() => {
    if (moved.current) (readRef.current ?? headRef.current)?.focus({ preventScroll: true })
    moved.current = false
  }, [viewKey])

  const go = (next: DrillLevel, id?: number, opts?: { from?: HTMLElement | null; backTo?: string; keyboard?: boolean }) => {
    const p = new URLSearchParams(params)
    p.delete('sub'); p.delete('nivel')
    if (next === 'sub' && id != null) p.set('sub', String(id))
    if (next === 'sector') p.set('nivel', 'sector')
    // Emil: never animate a keyboard-initiated level change; pointer picks zoom
    const strip = stripRef.current
    if (!opts?.keyboard && strip) {
      const seg = opts?.from
      if (seg) {
        const vertical = strip.scrollHeight > strip.offsetWidth
        zoom.current = vertical
          ? { dir: 'in', at: seg.offsetTop / strip.offsetHeight, size: seg.offsetHeight / strip.offsetHeight }
          : { dir: 'in', at: seg.offsetLeft / strip.offsetWidth, size: seg.offsetWidth / strip.offsetWidth }
      } else if (opts?.backTo) zoom.current = { dir: 'out', key: opts.backTo }
    }
    setAnimate(!opts?.keyboard)
    setOpen(false)
    moved.current = true
    setParams(p, { replace: true, preventScrollReset: true })
    setHover(null)
  }
  const segOf = (key: string) => stripRef.current?.querySelector<HTMLElement>(`[data-k="${key}"]`) ?? null
  const here = level === 'sector' ? 'sector' : level === 'sub' ? `s${sub?.subcategory_id}` : `c${category.category_id}`

  // Esc climbs back to the category (El Mapa: Esc = back), unless a field has focus.
  useEffect(() => {
    if (level === 'category') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Escape' || e.defaultPrevented || t?.closest('input, textarea, select, [role="dialog"], [role="menu"], [aria-modal="true"]')) return
      go('category', undefined, { keyboard: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, params])

  const catName = es ? category.name_es : category.name_en
  const subName = sub ? (es ? sub.name_es : sub.name_en) : ''
  const vendorRows = (vs: DrillVendor[], total: number): { items: Item[]; total: number } => {
    const shown = [...vs].sort((a, b) => b.vendor_value - a.vendor_value).slice(0, VENDORS_SHOWN)
    const items: Item[] = shown.map((v) => ({
      key: `v${v.vendor_id}`,
      value: v.vendor_value,
      kind: 'item',
      label: formatVendorName(v.vendor_name, 200),
      risk: v.avg_risk,
      name: <EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name} size="inherit" fullName hideIcon inline className="sb-chip" />,
      note: v.persona_fisica ? L('persona física', 'individual') : undefined,
    }))
    return { items, total }
  }

  // ── the items of the current level ──
  let items: Item[]
  let total: number
  let unit: 'vendors' | 'subs' | 'cats'
  if (level === 'sector') {
    const sorted = [...siblings].sort((a, b) => b.total_value - a.total_value)
    let shown = sorted.slice(0, SIBLINGS_SHOWN)
    if (!shown.some((c) => c.category_id === category.category_id)) shown = [...shown.slice(0, SIBLINGS_SHOWN - 1), category]
    total = sorted.reduce((s, c) => s + c.total_value, 0)
    unit = 'cats'
    items = shown.map((c) => {
      const me = c.category_id === category.category_id
      const n = es ? c.name_es : c.name_en
      const pick = (el: HTMLElement | null, keyboard?: boolean) => go('category', undefined, { from: el, keyboard })
      return {
        key: `c${c.category_id}`,
        value: c.total_value,
        kind: 'item' as const,
        label: n,
        risk: c.avg_risk,
        current: me,
        rank: sorted.findIndex((x) => x.category_id === c.category_id) + 1 || undefined,
        onPick: me ? pick : undefined,
        name: me
          ? <button type="button" className="sb-pick" onClick={(e) => pick(segOf(`c${c.category_id}`), byKey(e))} aria-label={L(`${n} — abrir sus minicategorías`, `${n} — open its mini-categories`)}>{n}</button>
          : <EntityIdentityChip type="category" id={c.category_id} name={n} size="inherit" fullName hideIcon inline className="sb-chip" />,
        note: me ? L('esta categoría', 'this category') : undefined,
      }
    })
  } else if (level === 'sub' && sub) {
    ;({ items, total } = vendorRows(sub.vendors ?? [], sub.total_value))
    unit = 'vendors'
  } else if (split.useful) {
    total = split.total
    unit = 'subs'
    items = ordered.map((s) => {
      const n = es ? s.name_es : s.name_en
      const pick = (el: HTMLElement | null, keyboard?: boolean) => go('sub', s.subcategory_id, { from: el, keyboard })
      return {
        key: `s${s.subcategory_id}`,
        value: s.total_value,
        // a «sin clase» shelf (patent / generic only) is a remainder too: hatched, grouped at the end
        kind: s.is_catch_all || isUnstated(s) ? 'catch' as const : 'item' as const,
        label: n,
        risk: s.avg_risk,
        cons: s.consolidated_value_pct,
        onPick: pick,
        name: <button type="button" className="sb-pick" onClick={(e) => pick(segOf(`s${s.subcategory_id}`), byKey(e))} aria-label={L(`${n} — ver sus proveedores`, `${n} — see its vendors`)}>{n}</button>,
        note: s.is_catch_all ? L('el texto del contrato no dice qué tipo', 'the contract text does not say which kind')
          : isUnstated(s) ? L('el texto dice solo «de patente» o «genérico», no qué tipo', 'the text says only «patent» or «generic», not which kind') : undefined,
        example: !s.is_catch_all && !isUnstated(s) && s.example_titles?.[0] ? `${L('p. ej.', 'e.g.')} ${sentenceCaseCaps(s.example_titles[0])}` : undefined,
      }
    })
  } else {
    ;({ items, total } = vendorRows(categoryVendors, Math.max(categoryVendorsTotal, category.total_value)))
    unit = 'vendors'
  }
  const rest = unit === 'subs' ? 0 : restOf(total, items.map((i) => i.value))
  const segs: Item[] = rest > 0
    ? [...items, { key: 'rest', value: rest, kind: 'rest', label: L('el resto', 'the rest'), name: null }]
    : items
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const pct = (v: number) => { const p = share(v); return p >= 10 ? `${Math.round(p)} %` : p >= 0.1 ? `${p.toFixed(1)} %` : '<0.1 %' }

  // ── the one-sentence reading of the level (shown only when true) ──
  const top = items.find((i) => i.kind === 'item')
  const topKind = unit === 'subs' ? largestKind(ordered) : null
  const catchShare = split.catchAll && split.total > 0 ? (split.catchAll.total_value / split.total) * 100 : 0
  // the hatched rows together: the catch-all + the «sin clase» shelves — what the reader sees as «no type»
  const noKindShare = split.total > 0 ? (ordered.filter((x) => x.is_catch_all || isUnstated(x)).reduce((a, x) => a + x.total_value, 0) / split.total) * 100 : 0
  const consAll = unit === 'subs' ? consolidatedShare(ordered) : null
  let reading: string | null = null
  if (level === 'sector' && sectorName) {
    const rank = [...siblings].sort((a, b) => b.total_value - a.total_value).findIndex((c) => c.category_id === category.category_id) + 1
    reading = L(
      `«${catName}» es la ${rank}.ª de ${siblings.length} categorías de ${sectorName}: ${pct(category.total_value)} de su gasto.`,
      `“${catName}” ranks ${rank} of ${siblings.length} categories in ${sectorName}: ${pct(category.total_value)} of its spending.`)
  } else if (level === 'sub' && top) {
    reading = L(`${top.label} se lleva ${pct(top.value)} de «${subName}».`, `${top.label} takes ${pct(top.value)} of “${subName}”.`)
  } else if (unit === 'subs' && topKind) {
    const k = es ? topKind.name_es : topKind.name_en
    const parts = [
      noKindShare >= 5 ? L(`En ${Math.round(noKindShare)} % del monto, el contrato no dice qué tipo (filas rayadas, al final)`, `For ${Math.round(noKindShare)} % of the value, the contract does not say which kind (hatched rows, at the end)`) : null,
      consAll != null && consAll >= 5 ? L(`${Math.round(consAll)} % se compró en compras consolidadas`, `${Math.round(consAll)} % was bought through consolidated purchases`) : null,
    ].filter(Boolean)
    reading = L(`El tipo nombrado más grande es «${k}»: ${pct(topKind.total_value)} del monto`, `The largest named kind is “${k}”: ${pct(topKind.total_value)} of the value`)
      + (parts.length ? `. ${parts.join('. ')}.` : '.')
  } else if (unit === 'vendors' && split.catchAll && split.total > 0 && 1 - split.namedShare > 1 - MIN_NAMED_SHARE) {
    const ca = es ? split.catchAll.name_es : split.catchAll.name_en
    reading = L(
      `El texto de los contratos no separa este anaquel: ${Math.round(catchShare)} % cae en «${ca}», así que va directo a sus proveedores.`,
      `Contract texts do not split this shelf: ${Math.round(catchShare)} % falls in “${ca}”, so it goes straight to its vendors.`)
  } else if (unit === 'vendors' && top) {
    // the shelf went straight to its vendors without a dominant catch-all: line 3 of the guide still says something
    reading = L(`${top.label} se lleva ${pct(top.value)} de «${catName}».`, `${top.label} takes ${pct(top.value)} of “${catName}”.`)
  }

  const seeing = unit === 'subs'
    ? L(`El dinero de «${catName}», partido por lo que cada contrato dice que se compró.`, `The money of “${catName}”, split by what each contract says was bought.`)
    : unit === 'cats'
      ? L(`Las categorías de ${sectorName ?? ''}, por monto.`, `The categories of ${sectorName ?? ''}, by value.`)
      : L(`Quién cobró el dinero de «${sub ? subName : catName}».`, `Who was paid the money of “${sub ? subName : catName}”.`)
  const fold = unit === 'subs' ? foldSubs(ordered, SUBS_SHOWN, open) : null
  const named = ordered.filter((x) => !x.is_catch_all && !isUnstated(x)).length
  const shownKeys = fold ? new Set(fold.shown.map((x) => `s${x.subcategory_id}`)) : null
  const rows = shownKeys ? segs.filter((s) => shownKeys.has(s.key)) : segs
  const hovered = segs.find((s) => s.key === hover)
  // §8.1 fold, placed where the hidden rows are: between the named kinds and the hatched remainders
  const foldAt = fold && named > SUBS_SHOWN + 1 ? (rows.findIndex((r) => r.kind !== 'item') + 1 || rows.length + 1) - 1 : -1
  const foldRow = foldAt < 0 ? null : (
    <li className="sb-row sb-fold-row">
      <button type="button" className="sb-fold" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        {open ? L('Ver menos', 'Show fewer')
          : L(`${String(SUBS_SHOWN + 1).padStart(3, '0')}–${String(named).padStart(3, '0')} · ver ${named - SUBS_SHOWN} más`,
              `${String(SUBS_SHOWN + 1).padStart(3, '0')}–${String(named).padStart(3, '0')} · show ${named - SUBS_SHOWN} more`)}
      </button>
    </li>
  )
  const count = items.filter((i) => i.kind !== 'rest').length
  const nameHead = unit === 'vendors' ? L('Proveedor', 'Vendor') : unit === 'subs' ? L('Minicategoría', 'Mini-category') : L('Categoría', 'Category')
  const listTitle = unit === 'vendors'
    ? L(`Los ${count} mayores proveedores`, `The ${count} largest vendors`)
    : unit === 'subs' ? L(`Las ${count} minicategorías`, `The ${count} mini-categories`)
    : L(`Las ${count} mayores categorías`, `The ${count} largest categories`)
  const showCons = unit === 'subs' && items.some((i) => (i.cons ?? 0) > 0)

  // the four stations of the drill: the lit one is where the reader stands; a dim one is not reached yet
  const stations: { id: string; label: string; on: ((keyboard: boolean) => void) | null; lit: boolean; off?: boolean }[] = [
    ...(sectorName && siblings.length > 1
      ? [{ id: 'sector', label: sectorName, on: (k: boolean) => go('sector', undefined, { backTo: here, keyboard: k }), lit: level === 'sector' }] : []),
    { id: 'cat', label: catName, lit: level === 'category',
      on: level === 'sector' ? (k) => go('category', undefined, { from: segOf(`c${category.category_id}`), keyboard: k }) : (k) => go('category', undefined, { backTo: here, keyboard: k }) },
    ...(split.useful ? [{ id: 'sub', label: sub ? subName : L('Minicategoría', 'Mini-category'), on: null, lit: level === 'sub', off: !sub }] : []),
    { id: 'ven', label: L('Proveedores', 'Vendors'), on: null, lit: false, off: unit !== 'vendors' },
  ]

  const flap = (r: number, c: number): CSSProperties | undefined =>
    animate && !reduce ? { animationDelay: `${FLAP_LEAD + Math.min(r, FLAP_ROWS) * 24 + c * 12}ms` } : undefined

  return (
    <div className={`sb${animate && !reduce ? ' is-moving' : ''}`} style={{ ['--c' as string]: accent }}>
      {/* the level's live caption (owner 11-04: the page's ONE explanation is the strip at the top, kit/PageQuestion;
          the drill keeps one line — where the reader stands and what it shows) */}
      <p className="sb-guide" ref={readRef} tabIndex={-1}>{seeing}{reading && <> <span className="sb-read">{reading}</span></>}</p>
      <div className="sb-head">
        <nav className="sb-trail" aria-label={L('Nivel del desglose', 'Breakdown level')}>
          <ol>
            {stations.map((s) => (
              <li key={s.id} className={`${s.lit ? 'is-lit' : ''}${s.off ? ' is-off' : ''}`}>
                {s.lit || !s.on
                  ? <span aria-current={s.lit ? 'location' : undefined} key={s.lit ? `${s.id}-${viewKey}` : s.id} className="sb-stn">{s.label}</span>
                  : <button type="button" className="sb-stn" onClick={(e) => s.on!(byKey(e))}>{s.label}</button>}
              </li>
            ))}
          </ol>
        </nav>
        <p className="sb-readout" aria-hidden="true">
          {hovered
            ? <>{hovered.label} · <b>{formatCompactMXN(hovered.value)}</b> · {pct(hovered.value)}</>
            : <>{L('Total', 'Total')} <b>{formatCompactMXN(total)}</b>{level !== 'category' ? <span className="sb-esc"> · {L('Esc ↩ vuelve', 'Esc ↩ back')}</span> : null}</>}
        </p>
      </div>

      <div className="sb-body">
        <div className="sb-strip-box" aria-hidden="true">
          <div className="sb-strip" ref={stripRef} key={viewKey}>
            {segs.map((s) => (
              <div
                key={s.key}
                data-k={s.key}
                className={`sb-seg is-${s.kind}${pat(s.kind)}${s.onPick ? ' is-pick' : ''}${hover && hover !== s.key ? ' is-dim' : ''}${s.current ? ' is-current' : ''}`}
                style={{ flexGrow: s.value }}
                title={`${s.label} · ${formatCompactMXN(s.value)} · ${pct(s.value)}`}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onClick={s.onPick ? (e) => s.onPick!(e.currentTarget) : undefined}
              />
            ))}
          </div>
        </div>
        <div className="sb-board">
          <div className={`sb-row sb-cols${showCons ? ' has-cons' : ''}`} aria-hidden="true">
            <span>Nº</span><span>{nameHead}</span><span className="sb-bar-h">{L('Parte', 'Share')}</span>
            <span className="r">{L('Monto', 'Amount')}</span><span className="r">%</span>
            {showCons && <span className="r" title={L('parte comprada en compras consolidadas', 'share bought through consolidated purchases')}>{L('Consol.', 'Consol.')}</span>}
            <span>{L('Indicador', 'Indicator')}</span>
          </div>
          <h3 ref={headRef} tabIndex={-1} className="sr-only">{listTitle}</h3>
          <ol className="sb-list" id={listId} key={viewKey}>
            {rows.map((s, j) => { const i = segs.indexOf(s); return (
              <Fragment key={s.key}>
              {j === foldAt && foldRow}
              <li
                className={`sb-row${showCons ? ' has-cons' : ''}${hover === s.key ? ' is-on' : ''}${s.current ? ' is-current' : ''} is-${s.kind}`}
                aria-current={s.current ? 'true' : undefined}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="sb-c sb-no" style={flap(i, 0)}>{s.kind === 'rest' ? '—' : String(s.rank ?? i + 1).padStart(3, '0')}</span>
                <span className="sb-c sb-name" style={flap(i, 1)}>
                  {s.kind === 'rest'
                    ? <span className="sb-dimtxt">{unit === 'vendors' ? L('Los demás proveedores', 'All other vendors') : L('Las demás categorías', 'All other categories')}</span>
                    : <><i className={`sb-key is-${s.kind}${pat(s.kind)}`} aria-hidden="true" />{s.name}</>}
                  {s.note && <small>{s.note}</small>}
                  {s.example && <small className="sb-ex">{s.example}</small>}
                </span>
                <span className="sb-c sb-bar" aria-hidden="true" style={flap(i, 2)}><i style={{ transform: `scaleX(${Math.max(0.004, Math.min(1, share(s.value) / 100))})` }} className={`is-${s.kind}${pat(s.kind)}`} /></span>
                <span className="sb-c sb-amt r" style={flap(i, 3)}>{formatCompactMXN(s.value)}</span>
                <span className="sb-c sb-pct r" style={flap(i, 4)}>{pct(s.value)}</span>
                {showCons && <span className="sb-c sb-cons r" style={flap(i, 5)}>{s.cons != null && s.kind !== 'rest' ? `${Math.round(s.cons)} %` : ''}</span>}
                <span className="sb-c sb-ind" style={flap(i, showCons ? 6 : 5)}>{s.kind !== 'rest' && <Status v={s.risk} lang={lang} />}</span>
              </li>
              </Fragment>
            ) })}
            {foldAt === rows.length && foldRow}
          </ol>
        </div>
      </div>

      <dl className="sb-legend">
        <div><dt><i className="sb-key is-item" aria-hidden="true" /></dt><dd>{unit === 'vendors' ? L('un proveedor, ∝ su monto', 'one vendor, ∝ its amount') : unit === 'subs' ? L('un tipo nombrado en el texto, ∝ su monto', 'a kind named in the text, ∝ its amount') : L('una categoría, ∝ su monto', 'one category, ∝ its amount')}</dd></div>
        {unit === 'subs' && split.catchAll && <div><dt><i className="sb-key is-catch pat-sin-dato" aria-hidden="true" /></dt><dd>{L('sin tipo en el texto del contrato', 'no kind in the contract text')}</dd></div>}
        {rest > 0 && <div><dt><i className="sb-key is-rest" aria-hidden="true" /></dt><dd>{L('el resto, no listado', 'the rest, not listed')}</dd></div>}
        {showCons && <div className="sb-lg-cons"><dt className="sb-lg-t">{L('Consol.', 'Consol.')}</dt><dd>{L('parte comprada en compras consolidadas: un modo de compra, no un tipo', 'share bought through consolidated purchases: a way of buying, not a kind')}</dd></div>}
        <div><dt><span className="sb-st is-critical">0.60</span></dt><dd>{L('indicador de riesgo promedio: crítico ≥ 0.60 · alto ≥ 0.40 · medio ≥ 0.25 · bajo; señala patrones, no prueba irregularidades', 'mean risk indicator: critical ≥ 0.60 · high ≥ 0.40 · medium ≥ 0.25 · low; it flags patterns, it does not prove wrongdoing')}</dd></div>
      </dl>
    </div>
  )
}

