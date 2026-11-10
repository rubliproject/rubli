/**
 * Dossier depth layers (lead 2026-10-21, «have we built in layers to all that we have deployed?»)
 * for /vendors/:id, /institutions/:id, /sectors/:id — all in place, none makes the page taller:
 *
 *   L1  HotProvider + useHot: a mark and its ledger rows light together (one key, `i:12`, `y:2019`).
 *   L3  DrillToggle + ContractDrill: a buyer / vendor / year / category row opens, inline, the
 *       largest contracts behind it, each a link to /contracts/:id. Esc or «Cerrar» closes and
 *       returns focus to the toggle.
 *   L5  ?sec=<section>&row=<key> holds the opened row (a drill pushes history, Back closes it);
 *       a reload restores it and scrolls there. SecCite («Citar») sets ?sec= then copies one
 *       sentence + the link (useCite, components/newtabs/ntShared — the one Citar helper).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { contractApi } from '@/api/client'
import type { ContractFilterParams } from '@/api/types'
import { RiskGauge } from '@/components/contrato/RiskGauge'
import { SourceTag } from '@/components/contrato/SourceTag'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { CiteBtn, useCite } from '@/components/newtabs/ntShared'
import { formatCompactMXN, formatNumber, shortenContractName } from '@/lib/utils'
import './layers.css'

type Lang = 'en' | 'es'

// ── L1 linked hover ───────────────────────────────────────────────────────
const HotCtx = createContext<[string | null, (k: string | null) => void]>([null, () => {}])

export function HotProvider({ children }: { children: ReactNode }) {
  const state = useState<string | null>(null)
  return <HotCtx.Provider value={state}>{children}</HotCtx.Provider>
}

/** `[hot key, bind(key)]` — bind spreads the pointer + focus handlers onto a row or mark. */
export function useHot() {
  const [hot, setHot] = useContext(HotCtx)
  const bind = useCallback((key: string) => ({
    onPointerEnter: () => setHot(key),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(key),
    onBlur: () => setHot(null),
  }), [setHot])
  return [hot, bind] as const
}

/** useHot as a render prop, for JSX written inline in the page that renders the provider. */
export function WithHot({ children }: { children: (hot: string | null, bind: ReturnType<typeof useHot>[1]) => ReactNode }) {
  const [hot, bind] = useHot()
  return <>{children(hot, bind)}</>
}

// ── L5 URL state ──────────────────────────────────────────────────────────
/** ?sec=&row= — the opened drill. Keeps location.state (the wayfinding origin) across changes. */
export function useLayer() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const sec = params.get('sec')
  const row = params.get('row')
  const set = useCallback((s: string | null, r: string | null, push: boolean) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (s) n.set('sec', s); else n.delete('sec')
      if (r) n.set('row', r); else n.delete('row')
      return n
    }, { replace: !push, state: location.state })
  }, [setParams, location.state])
  return {
    sec,
    row,
    isOpen: (s: string, r: string | number) => sec === s && row === String(r),
    toggle: (s: string, r: string | number) => (sec === s && row === String(r) ? set(s, null, false) : set(s, String(r), true)),
    close: () => set(sec, null, false),
    /** Point the URL at a section (Citar), keeping an opened row of the same section. */
    point: (s: string) => set(s, sec === s ? row : null, false),
  }
}

/** On arrival with ?sec= (a cited or shared link, or Back from a drill), scroll to the opened row or the
 *  section once it renders — and keep it there while the sections above it finish loading and grow,
 *  until the reader scrolls or the layout holds still for ~1 s. */
export function useLayerRestore() {
  const [params] = useSearchParams()
  const first = useRef({ sec: params.get('sec'), row: params.get('row') })
  useEffect(() => {
    const { sec, row } = first.current
    if (!sec) return
    let n = 0, still = 0, lastTop: number | null = null
    const find = () => (row && document.querySelector(`[data-drill="${CSS.escape(`${sec}:${row}`)}"]`))
      || document.querySelector(`[data-sec="${CSS.escape(sec)}"]`)
      || document.getElementById(sec)
    const stop = () => {
      window.clearInterval(id)
      for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(ev, stop)
    }
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(ev, stop, { passive: true })
    const id = window.setInterval(() => {
      const el = find()
      if (!el) { if (++n > 60) stop(); return }
      const top = el.getBoundingClientRect().top + window.scrollY
      if (top !== lastTop) { el.scrollIntoView({ block: row ? 'center' : 'start' }); lastTop = top; still = 0 }
      else if (++still >= 4 || ++n > 60) stop()
    }, 250)
    return stop
  }, [])
}

// ── L3 drill ──────────────────────────────────────────────────────────────
const drillId = (sec: string, row: string | number) => `dl-${sec}-${row}`

/** The row's value as its own toggle (the name stays the entity link): «15.3 MMDP ▸». */
export function DrillToggle({ sec, row, open, onToggle, children, lang, what }: {
  sec: string; row: string | number; open: boolean; onToggle: () => void; children: ReactNode; lang: Lang
  /** What opens, for the accessible name: «los contratos con IMSS». */
  what: string
}) {
  return (
    <button
      type="button"
      id={`${drillId(sec, row)}-t`}
      className="dl-toggle"
      aria-expanded={open}
      aria-controls={drillId(sec, row)}
      onClick={onToggle}
    >
      {/* WCAG 2.5.3: the name starts with the visible value; the action rides along off-screen */}
      {children}<span className="sr-only"> — {lang === 'en' ? (open ? 'Close' : 'Open') : (open ? 'Cerrar' : 'Abrir')} {what}</span><span className="dl-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>
  )
}

/** The largest contracts behind a row, inline. `show` = the counterpart column (vendor or buyer). */
export function ContractDrill({ sec, row, filter, show, lang, onClose, title }: {
  sec: string; row: string | number; filter: ContractFilterParams; show?: 'vendor' | 'institution'
  lang: Lang; onClose: () => void; title: string
}) {
  const en = lang === 'en'
  const ref = useRef<HTMLDivElement>(null)
  const q = useQuery({
    queryKey: ['dossier-drill', filter],
    queryFn: () => contractApi.getAll({ ...filter, per_page: 5, sort_by: 'amount_mxn', sort_order: 'desc' }),
    staleTime: 5 * 60_000,
  })
  const close = useCallback(() => {
    onClose()
    document.getElementById(`${drillId(sec, row)}-t`)?.focus()
  }, [onClose, sec, row])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
  const all = useMemo(() => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(filter)) if (v != null) p.set(k, String(v))
    p.set('sort_by', 'amount_mxn')
    return `/contracts?${p}`
  }, [filter])
  const rows = q.data?.data ?? []
  const total = q.data?.pagination?.total ?? 0
  return (
    <div ref={ref} id={drillId(sec, row)} className="dl-drill" data-drill={`${sec}:${row}`} role="region" aria-label={title} aria-busy={q.isLoading || undefined}>
      <div className="dl-head">
        <span>{title}{total > 0 ? ` · ${en ? `largest ${rows.length} of ${formatNumber(total)}` : `los ${rows.length} mayores de ${formatNumber(total)}`}` : ''}</span>
        <button type="button" className="dl-x" onClick={close}>{en ? 'Close' : 'Cerrar'}</button>
      </div>
      {q.isLoading ? (
        <p className="dl-note">{en ? 'Reading the register…' : 'Leyendo el registro…'}</p>
      ) : q.isError ? (
        <p className="dl-note">{en ? 'The register did not answer. ' : 'El registro no respondió. '}<button type="button" className="ct-link" onClick={() => q.refetch()}>{en ? 'Retry' : 'Reintentar'}</button></p>
      ) : rows.length === 0 ? (
        <p className="dl-note">{en ? 'No contracts behind this row.' : 'Sin contratos detrás de esta fila.'}</p>
      ) : (
        <ol>
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={`/contracts/${c.id}`} className="ct-link dl-t">{c.title ? shortenContractName(c.title, Infinity) : `${en ? 'Contract' : 'Contrato'} #${c.contract_number ?? c.id}`}</Link>
              {show === 'vendor' && c.vendor_id && c.vendor_name && <span className="dl-who"><EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor_name} variant="name" fullName /></span>}
              {show === 'institution' && c.institution_id && c.institution_name && <span className="dl-who"><EntityIdentityChip type="institution" id={c.institution_id} name={c.institution_name} variant="name" fullName /></span>}
              <span className="dl-y">{c.contract_year ?? '—'}<SourceTag struct={c.source_structure} score={c.risk_score} ver={c.risk_model_version} /></span>
              <span className="dl-m">{formatCompactMXN(c.amount_mxn ?? 0)}</span>
              <span className="dl-r"><RiskGauge value={c.risk_score} /></span>
            </li>
          ))}
        </ol>
      )}
      {total > rows.length && <Link to={all} className="ct-more ct-link">{en ? `All ${formatNumber(total)} in the Archive` : `Los ${formatNumber(total)} en El Archivo`}</Link>}
    </div>
  )
}

// ── L5 «Citar» ────────────────────────────────────────────────────────────
/** «Citar» for a section: points ?sec= at it, then copies the sentence + the link. Sits on a heading line. */
export function SecCite({ sec, text, lang }: { sec: string; text: string; lang: Lang }) {
  const layer = useLayer()
  const [copied, cite] = useCite()
  return (
    <span className="dl-cite">
      <CiteBtn
        lang={lang}
        on={copied === sec}
        onClick={() => {
          layer.point(sec)
          // the URL the router is about to commit, built here rather than read back a frame later
          const u = new URL(window.location.href)
          u.searchParams.set('sec', sec)
          if (layer.sec !== sec) u.searchParams.delete('row')
          cite(sec, text, u.toString())
        }}
      />
    </span>
  )
}
