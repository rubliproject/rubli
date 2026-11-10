/**
 * «La columna» — the object (concept C, GREEN round 2026-11-05, README § C). One slab per year, 2002 at the
 * foot, 2025 on top: WIDTH = the year's money (one scale for the whole column); a plate under each government
 * carries its name; RED BEADS on the slab = contracts with indicador de riesgo ≥ 0.60 per 100 (one bead each, 10 max);
 * the share of money without a tender is NOT the slab's tone (the concept's known flaw: two encodings on one part)
 * but a separate small gauge at the row's right end (hatched = not recorded before 2011).
 *
 * Explorable like El Mapa's drill: a slab or plate opens its government (its slabs grow in place, the rest
 * thin out); a slab of the open government opens its year (its risk months, RiskMonths.tsx, open under it). Native buttons;
 * ↑/↓ walk the slabs (roving tab stop), Enter opens, Esc (page) goes back. Motion = CSS height/width with the
 * house tokens (lib/motion); reduced motion → no transition, final state.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { DotBar } from '@/components/ui/DotBar'
import { css, DUR, EASE } from '@/lib/motion'
import { formatCompactMXN } from '@/lib/utils'
import { Retrato } from './Perfil'
import { slugOf, thinYears, type ColYear, type Columna, type Level, type TermSlug } from '@/lib/sexenios/columna'

export type Lens = 0 | 1 | 2 | 3

interface Props {
  data: Columna
  level: Level
  lens: Lens
  lang: 'es' | 'en'
  names: Record<TermSlug, string>
  colors: Record<TermSlug, string>
  ranges: Record<TermSlug, string>
  onTerm: (g: TermSlug) => void
  onYear: (y: number) => void
  /** W7: the open year's head (3 lines + its risk months) and the block under it. */
  yearHead?: ReactNode
  yearSlot?: ReactNode
}

const BEADS = 10

export function pctLabel(x: number | null, lang: 'es' | 'en', digits = 0): string {
  if (x == null) return lang === 'es' ? 'sin dato' : 'no data'
  const n = (100 * x).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return lang === 'es' ? `${n} %` : `${n}%`
}
export function critLabel(c: number | null, lang: 'es' | 'en'): string {
  if (c == null) return '—'
  const n = c.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })
  return lang === 'es' ? `${n} críticos por cada 100` : `${n} critical per 100`
}

/** The accessible and hover reading of one slab. */
export function readSlab(y: ColYear, lang: 'es' | 'en', thin: boolean): string {
  if (thin) return lang === 'es' ? `${y.year} · casi sin registro (${y.contracts} contratos)` : `${y.year} · almost no record (${y.contracts} contracts)`
  const da = y.da_share == null ? (lang === 'es' ? 'sin dato de concurso' : 'tender not recorded') : `${lang === 'es' ? 'sin concurso' : 'no tender'} ${pctLabel(y.da_share, lang)}`
  return `${y.year} · ${formatCompactMXN(y.value)} · ${da} · ${critLabel(y.crit100, lang)}`
}

function Gauge({ share, lang }: { share: number | null; lang: 'es' | 'en' }) {
  return (
    <span className="sxc-gauge" aria-hidden="true" title={pctLabel(share, lang)}>
      {share == null ? <i className="is-none" /> : <i style={{ width: `${Math.round(100 * share)}%` }} />}
    </span>
  )
}

export function ColumnObject({ data, level, lens, lang, names, colors, ranges, onTerm, onYear, yearHead, yearSlot }: Props) {
  const reduce = useReducedMotion()
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const thin = useMemo(() => thinYears(data.years), [data.years])
  const max = useMemo(() => Math.max(...data.years.map((y) => y.value)), [data.years])
  const [hot, setHot] = useState<string | null>(null)
  const [stop, setStop] = useState<number>(data.last_year)
  const listRef = useRef<HTMLOListElement>(null)
  const tr = reduce ? 'none' : css(['height', 'width', 'opacity', 'padding'], DUR.slow, EASE.emphasized)

  // top → bottom: the years still to come, then each government's slabs over its plate
  const rows = useMemo(() => {
    const out: ({ kind: 'year'; y: ColYear; g: TermSlug } | { kind: 'plate'; g: TermSlug })[] = []
    const desc = [...data.years].sort((a, b) => b.year - a.year)
    desc.forEach((y, i) => {
      const g = slugOf(y.term)
      if (!g) return
      out.push({ kind: 'year', y, g })
      const next = desc[i + 1]
      if (!next || next.term !== y.term) out.push({ kind: 'plate', g })
    })
    return out
  }, [data.years])

  const walk = (e: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    const btns = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-year]') ?? [])
    const i = btns.findIndex((b) => b === document.activeElement)
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.max(0, Math.min(btns.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)))
    const b = btns[j]
    if (!b) return
    e.preventDefault()
    setStop(Number(b.dataset.year))
    b.focus()
  }

  const shelf = 'sheinbaum' as TermSlug
  return (
    <div className="sxc-stage" data-lens={lens} data-level={level.y ? 2 : level.g ? 1 : 0}>
      <p className="sxc-read" aria-hidden="true">{hot ?? L('Toque un gobierno o un año para abrirlo.', 'Tap a government or a year to open it.')}</p>
      <ol ref={listRef} className="sxc-col" onKeyDown={walk} aria-label={L('La columna: un bloque por año, 2025 arriba', 'The column: one slab per year, 2025 on top')}>
        <li className="sxc-row sxc-ghost" aria-hidden="true">
          <span className="sxc-yr">2026→</span>
          <span className="sxc-track"><span className="sxc-slab is-ghost" style={{ width: '36%' }}>{L('por venir', 'still to come')}</span></span>
          <span />
        </li>
        {rows.map((r) => {
          if (r.kind === 'plate') {
            const open = level.g === r.g
            return (
              <li key={`p-${r.g}`} className="sxc-row sxc-plate-row">
                <button type="button" className="sxc-plate" data-g={r.g} aria-expanded={open} onClick={() => onTerm(r.g)} style={{ ['--c' as string]: colors[r.g] }}>
                  <span className="sxc-plate-face" aria-hidden="true"><Retrato slug={r.g} size={22} lang={lang} decorative /></span>
                  <span className="sxc-plate-bar" aria-hidden="true" />
                  <span className="sxc-plate-name">{names[r.g]}</span>
                  <span className="sxc-plate-yr">{ranges[r.g]}{r.g === shelf ? ` · ${L('en curso', 'in office')}` : ''}</span>
                </button>
              </li>
            )
          }
          const { y, g } = r
          const inTerm = level.g === g
          const open = level.y === y.year
          const isThin = thin.has(y.year)
          const state = open ? 'open' : inTerm ? 'term' : level.g ? 'off' : 'rest'
          const w = Math.max(1.5, (100 * y.value) / max)
          const reading = readSlab(y, lang, isThin)
          return (
            <li key={y.year} className="sxc-row" data-state={state} style={{ transition: tr }}>
              <span className="sxc-yr">
                <b>{y.year}</b>
                {(state === 'term' || state === 'open') && !isThin && <small>{formatCompactMXN(y.value)}</small>}
              </span>
              <button
                type="button"
                data-year={y.year}
                tabIndex={stop === y.year ? 0 : -1}
                className="sxc-track sxc-hit"
                aria-expanded={inTerm ? open : undefined}
                aria-label={reading}
                onClick={() => (inTerm ? onYear(y.year) : onTerm(g))}
                onMouseEnter={() => setHot(reading)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => { setHot(reading); setStop(y.year) }}
                onBlur={() => setHot(null)}
              >
                <span className={`sxc-slab${isThin ? ' is-thin' : ''}`} style={{ width: `${w}%`, transition: tr }}>
                  {isThin ? <span className="sxc-thin">{L('casi sin registro', 'almost no record')}</span>
                    : state !== 'off' && y.crit100 != null && (
                      <span className="sxc-beads"><DotBar value={Math.min(BEADS, Math.round(y.crit100))} max={BEADS} dots={BEADS} dotR={2.5} dotGap={7} emptyColor="transparent" /></span>
                    )}
                </span>
              </button>
              <span className="sxc-side">
                <Gauge share={isThin ? null : y.da_share} lang={lang} />
                {(state === 'term' || state === 'open') && !isThin && <small>{pctLabel(y.da_share, lang)}</small>}
              </span>
              {open && yearHead && <div className="sxc-yslot">{yearHead}</div>}
              {open && yearSlot && <div className="sxc-yslot">{yearSlot}</div>}
            </li>
          )
        })}
      </ol>
      <div className="sxc-key" aria-hidden="true">
        <span><i className="sxc-key-w" />{L('ancho = dinero del año', 'width = the year’s money')}</span>
        <span><DotBar value={1} max={1} dots={1} dotR={2.5} />{L('1 contrato crítico por cada 100', '1 critical contract per 100')}</span>
        <span><span className="sxc-gauge"><i style={{ width: '40%' }} /></span>{L('sin concurso', 'no tender')}</span>
        <span><span className="sxc-gauge"><i className="is-none" /></span>{L('sin dato (antes de 2011)', 'not recorded (before 2011)')}</span>
      </div>
    </div>
  )
}
