/**
 * Shared pieces of the new tabs — «El Arranque», «El Mismo Día», «El Rastro de un Peso»
 * (definitions frozen in docs/NEWTABS_DEFINITIONS.md; API backend/api/routers/newtabs.py).
 * Sheet + view switch (copied from AriaQueue: role="group" + aria-pressed), the thesis count-up,
 * URL-state patching, «Citar», date formats and one sortable table with a CSV download (never an RFC).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MotionConfig, useReducedMotion } from 'framer-motion'
import { ViewSwitch as KitViewSwitch } from '@/components/kit/ViewSwitch'
import { FootNotes } from '@/components/kit/FootNotes'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import { api } from '@/api/client'
import { csvCell, downloadCsv } from '@/lib/atlas/sky/export'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import './newtabs.css'

export type Lang = 'es' | 'en'

export const ntGet = <T,>(path: string, params?: Record<string, unknown>) =>
  api.get<T>(`/newtabs/${path}`, { params, timeout: 120_000 }).then((r) => r.data)

// ── formats ───────────────────────────────────────────────────────────────
export const mxn = (v: number) => formatCompactMXN(v)
export const nf = (n: number) => formatNumber(Math.round(n))
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
const MES = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
/** `2024-10-17` → «17 oct 2024» / «Oct 17, 2024». */
export function fdate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return lang === 'en' ? `${MES.en[m - 1]} ${d}, ${y}` : `${d} ${MES.es[m - 1]} ${y}`
}
/** Miles de pesos as the PEF prints them: 284,000 → «284 mil». */
export const capTxt = (v: number, lang: Lang) => (lang === 'en' ? `${nf(v / 1000)}K` : `${nf(v / 1000)} mil`)

// ── chrome ────────────────────────────────────────────────────────────────
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap">{children}</div>
      </article>
    </MotionConfig>
  )
}

export type Vista = 'vis' | 'lista'

/** «Visualización | Lista» — the URL holds it (?vista=lista). */
export function useVista(): [Vista, (v: Vista) => void] {
  const [params, setParams] = useSearchParams()
  const vista: Vista = params.get('vista') === 'lista' ? 'lista' : 'vis'
  const set = useCallback((v: Vista) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (v === 'lista') n.set('vista', 'lista'); else n.delete('vista')
    return n
  }, { replace: true }), [setParams])
  return [vista, set]
}

/** The page's two views, named by what the reader sees (OWNER_REVIEW § G3); pass it to DocHead `views`. */
export function ViewSwitch({ vista, onVista, lang, names }: {
  vista: Vista; onVista: (v: Vista) => void; lang: Lang
  /** [visual, list] names; the default is the old generic pair. */
  names?: [{ es: string; en: string }, { es: string; en: string }]
  /** @deprecated the switch is one line now; notes are ignored. */
  visNote?: string; listNote?: string
}) {
  const [v, l] = names ?? [{ es: 'Visualización', en: 'Visual' }, { es: 'Lista', en: 'List' }]
  return <KitViewSwitch lang={lang} value={vista} onChange={onVista} views={[{ key: 'vis', ...v }, { key: 'lista', ...l }]} />
}

/** Thesis numerals tween once (DESIGN §7); words never move. */
export function CountUp({ to, fmt = nf, className = 'nt-num', ms = 700, delay = 0 }: { to: number; fmt?: (n: number) => string; className?: string; ms?: number; delay?: number }) {
  const reduced = !!useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    const t0 = performance.now() + delay
    let raf = 0
    const f = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / ms))
      el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to, fmt, reduced, ms, delay])
  return <span ref={ref} className={className || undefined}>{fmt(to)}</span>
}

/** Patch the query string (null deletes); `push` adds a history step (drills), else replace (lenses). */
export function useQ() {
  const [params, setParams] = useSearchParams()
  const set = useCallback((patch: Record<string, string | number | null>, push = false) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') n.delete(k); else n.set(k, String(v)) }
      return n
    }, { replace: !push })
  }, [setParams])
  return [params, set] as const
}

/** «Citar»: the sentence + the exact URL (default: this page's) to the clipboard; returns [label state, cite fn]. */
export function useCite(): [string | null, (key: string, text: string, url?: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const cite = useCallback((key: string, text: string, url = window.location.href) => {
    navigator.clipboard?.writeText(`${text} ${url}`).then(
      () => { setCopied(key); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(null), 1600) },
      () => setCopied(null),
    )
  }, [])
  return [copied, cite]
}

/** Esc steps back one level: the first handler that returns true wins. */
export function useEscLadder(steps: Array<(() => boolean) | null>) {
  const ref = useRef(steps)
  ref.current = steps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      for (const s of ref.current) if (s && s()) { e.preventDefault(); return }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

export function CiteBtn({ on, onClick, lang, label }: { on: boolean; onClick: () => void; lang: Lang; label?: string }) {
  return <button type="button" className="nt-cite" onClick={onClick}>{on ? (lang === 'en' ? 'Copied' : 'Copiado') : label ?? (lang === 'en' ? 'Cite' : 'Citar')}</button>
}

/** The page's notes: one collapsed foot line «Notas y fuentes · N» (OWNER_REVIEW § G1). */
export function Notes({ lang, items, lead }: { lang: Lang; items: string[]; lead?: string }) {
  return <FootNotes lang={lang} items={items} lead={lead} />
}

// ── Lista: one sortable ledger with a CSV download ───────────────────────
export interface Col<R> {
  key: string
  label: string
  num?: boolean
  /** Sort value (omit = not sortable). */
  sort?: (r: R) => number | string
  cell: (r: R) => ReactNode
  /** false = CSV only: internal ids and flags the reader does not need on screen. */
  screen?: false
  /** CSV value (omit = not exported). */
  csv?: (r: R) => string | number | null | undefined
}

const PER = 100
/** Column keys that hold an entity (the row's name cell; a second one reads as the muted meta line on a phone). */
const ENTITY_KEYS = new Set(['proveedor', 'comprador', 'categoria', 'contrato'])

export function NtTable<R>({ rows, cols, lang, file, unit, initial, rowKey }: {
  rows: R[]; cols: Col<R>[]; lang: Lang; file: string; unit: { es: string; en: string }
  initial: { key: string; asc?: boolean }; rowKey: (r: R) => string | number
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [key, setKey] = useState(initial.key)
  const [asc, setAsc] = useState(!!initial.asc)
  const [page, setPage] = useState(0)
  const col = cols.find((c) => c.key === key)
  const sorted = useMemo(() => {
    if (!col?.sort) return rows
    const v = col.sort
    const s = [...rows].sort((a, b) => { const x = v(a), y = v(b); return x < y ? -1 : x > y ? 1 : 0 })
    return asc ? s : s.reverse()
  }, [rows, col, asc])
  const pages = Math.max(1, Math.ceil(sorted.length / PER))
  const view = sorted.slice(page * PER, page * PER + PER)
  const sortBy = (c: Col<R>) => {
    if (c.key === key) setAsc(!asc)
    else { setKey(c.key); setAsc(!c.num) }
    setPage(0)
  }
  const shown = cols.filter((c) => c.screen !== false)
  // row anatomy (DESIGN.md §8.1): entity columns are the name cell(s), the first peso column is the row's amount
  const amtKey = shown.find((c) => c.num && c.key.endsWith('_mxn'))?.key
  const cellCls = (c: Col<R>) => (ENTITY_KEYS.has(c.key) ? 'ct-key' : c.key === amtKey ? 'num ct-amt' : c.num ? 'num' : 'ls-txt')
  const csv = () => {
    const ex = cols.filter((c) => c.csv)
    const lines = [ex.map((c) => c.key), ...sorted.map((r) => ex.map((c) => c.csv!(r)))]
    downloadCsv(file, lines.map((x) => x.map(csvCell).join(',')).join('\n'))
  }
  return (
    <section className="nt-list" aria-label={L('Lista', 'List')}>
      <div className="nt-list-bar">
        <span className="ct-note !mt-0">{L(`${nf(rows.length)} ${unit.es} · página ${page + 1} de ${pages}`, `${nf(rows.length)} ${unit.en} · page ${page + 1} of ${pages}`)}</span>
        <span className="nt-list-pg">
          <button type="button" className="ct-chip" disabled={page === 0} onClick={() => setPage(page - 1)}>{L('Anterior', 'Previous')}</button>
          <button type="button" className="ct-chip" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{L('Siguiente', 'Next')}</button>
          <button type="button" className="ct-chip" onClick={csv}>{L('Descargar CSV', 'Download CSV')}</button>
        </span>
      </div>
      <div className="ct-table-wrap">
        <table className="ct-table ct-stack nt-table">
          <thead>
            <tr>
              <RankTh lang={lang} />
              {shown.map((c) => c.sort
                ? <SortHeaderTh key={c.key} field={c.key} label={c.label} activeField={key} order={asc ? 'asc' : 'desc'} onSort={() => sortBy(c)} className={c.num ? 'num' : ''} />
                : <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={rowKey(r)}>
                <RankCell n={page * PER + i + 1} />
                {shown.map((c) => {
                  const cls = cellCls(c)
                  return <td key={c.key} className={cls} data-l={cls === 'ct-key' || cls === 'num ct-amt' ? undefined : c.label.toLowerCase()}>{c.cell(r)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
