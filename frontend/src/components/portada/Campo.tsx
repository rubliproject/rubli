/**
 * Campo — Portada «El Campo» (owner pick B, 2026-10-15; concept
 * `_ui_v4/concepts/portada/B.html`) on the kit Field: every public vendor of the
 * investigation queue (tiers 1–3) at alto or crítico as one dot: amber and larger = crítico, quiet ink = alto
 * (owner 2026-11-05: no sector hues). x = the vendor's money (log) or its indicador.
 * Lenses Todo · Sector · Procedimiento · Sexenio regroup the SAME dots (Field
 * tween, 500 ms) and the sentence recomputes. L0: the field opens on «Todo» and
 * splits into «Sector» once. Click = docked card → abrir expediente. ?lente=
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import { Field, FieldCard, type FieldAxis, type FieldBand, type FieldRow } from '@/components/kit/Field'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { ADMIN_DISPLAY_ACCENTED, ADMIN_ORDER, getAdministrationByYear } from '@/lib/administrations'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

type Lang = 'en' | 'es'
type Lens = 'todo' | 'sector' | 'proc' | 'sexenio'
const LENSES: Lens[] = ['todo', 'sector', 'proc', 'sexenio']
interface V { id: number; name: string; tier: number; risk: number | null; mxn: number; n: number; sec: number; da: number | null; y0: number | null; doc: boolean; novel: boolean }

const PROC = [
  // share of the supplier's contracts won by adjudicación directa (owner 2026-11-05: name the procedure in plain words)
  { id: 'p0', min: 0.9, es: 'Casi siempre adjudicación directa', en: 'Almost always direct award' },
  { id: 'p1', min: 0.5, es: 'Sobre todo adjudicación directa', en: 'Mostly direct award' },
  { id: 'p2', min: 0.1, es: 'Sobre todo licitación', en: 'Mostly tendered' },
  { id: 'p3', min: -1, es: 'Casi siempre licitación', en: 'Almost always tendered' },
]
const procOf = (da: number | null) => (da == null ? null : PROC.find((p) => da >= p.min)!.id)

export function Campo({ lang, beat }: { lang: Lang; beat: boolean }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  const urlLens = (params.get('lente') as Lens | null) ?? 'sector'
  const [lens, setLensState] = useState<Lens>(beat ? 'todo' : LENSES.includes(urlLens) ? urlLens : 'sector')
  const setLens = (l: Lens) => {
    setLensState(l)
    setOpenBand(null)
    setParams((p) => { const n = new URLSearchParams(p); if (l === 'sector') n.delete('lente'); else n.set('lente', l); return n }, { replace: true })
  }
  const [sortKey, setSortKey] = useState('mxn')
  const [picked, setPicked] = useState<string | null>(null)
  const [openBand, setOpenBand] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['executive', 'vendor-field'], queryFn: () => analysisApi.getVendorField(), staleTime: 600_000 })
  const vs: V[] = useMemo(() => (q.data?.rows ?? []).map((r) => ({
    id: r[0], name: r[1], tier: r[2], risk: r[3], mxn: r[4], n: r[5], sec: r[6], da: r[7], y0: r[8], doc: r[9] === 1, novel: r[10] === 1,
  })), [q.data])

  // L0: open on «Todo», split into the lens once the dots have landed
  useEffect(() => {
    if (!beat || !vs.length || lens !== 'todo') return
    const t = window.setTimeout(() => setLensState(LENSES.includes(urlLens) && urlLens !== 'todo' ? urlLens : 'sector'), 650)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, vs.length])

  const sec = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[11]
  const isCrit = (v: V) => v.risk != null && getRiskLevelFromScore(v.risk) === 'critical'
  const band = (v: V): string => {
    if (lens === 'todo') return 'all'
    if (lens === 'sector') return `s${v.sec}`
    if (lens === 'proc') return procOf(v.da) ?? 'none'
    const a = v.y0 == null ? null : getAdministrationByYear(v.y0)
    return a ? `a-${a.key}` : 'none'
  }
  // owner 2026-11-05 («overloaded with just the points of which sector it is»): one accent only — crítico = amber,
  // larger; alto = quiet ink. No sector hues, no black dots, no red rings (owner 2026-11-02). medio/bajo live in the
  // row's total.
  const shown = useMemo(() => vs.filter((v) => v.risk != null && v.risk >= 0.4), [vs])
  const rows: FieldRow[] = useMemo(() => shown.map((v) => {
    const crit = isCrit(v)
    return {
      id: String(v.id),
      label: v.name,
      bandId: band(v),
      x: { mxn: v.mxn, risk: v.risk },
      fill: crit ? '--color-amber-500' : '--color-border',  // alto = the quiet rule grey (muted ink read as black)
      size: crit ? 1.2 : 0.8,
      meta: { v },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [shown, lens])

  // the row's totals count every supplier of the file (drawn or not): n, críticos, money
  const count = useMemo(() => {
    const count = new Map<string, { n: number; lit: number; mxn: number }>()
    for (const v of vs) {
      const id = band(v)
      const c = count.get(id) ?? { n: 0, lit: 0, mxn: 0 }
      c.n++
      if (isCrit(v)) c.lit++
      c.mxn += v.mxn
      count.set(id, c)
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, lens])
  // owner 2026-11-05 («I don't know what I'm looking at»): every band says, in plain words, how many of each 100
    // of its suppliers carry a critical indicator; the highest rate is named (bands under 100 suppliers can't win it)
  const top = useMemo(() => {
    if (lens === 'todo') return null
    const ids = lens === 'sector' ? SECTORS.map((s) => `s${s.id}`) : lens === 'proc' ? PROC.map((p) => p.id) : ADMIN_ORDER.map((a) => `a-${a}`)
    const rate = (id: string) => { const c = count.get(id); return c && c.n ? c.lit / c.n : 0 }
    const id = ids.filter((i) => (count.get(i)?.n ?? 0) >= 100).sort((a, b) => rate(b) - rate(a))[0]
    return id ? { id, pct: Math.round(rate(id) * 100) } : null
  }, [count, lens])
  const bands: FieldBand[] = useMemo(() => {
    const mk = (id: string, label: string, color: string | null, sortValue: number): FieldBand => {
      const c = count.get(id) ?? { n: 0, lit: 0, mxn: 0 }
      const pct = c.n ? (c.lit / c.n) * 100 : 0
      // a band under 100 suppliers says its counts, not a rate (the «highest rate» only weighs bands of ≥ 100)
      const note = !vs.length ? '' : c.lit === 0 ? L('ninguno es crítico', 'none critical')
        : c.n < 100 ? L(`${c.lit} de ${c.n} son críticos`, `${c.lit} of ${c.n} critical`)
        : pct < 1 ? L('menos de 1 de cada 100 es crítico', 'under 1 in 100 critical')
        : L(`${Math.round(pct)} de cada 100 son críticos`, `${Math.round(pct)} in 100 critical`)
      return {
        id, name: label, sortValue, n: c.n, litCount: c.lit,
        aggregate: vs.length ? formatCompactMXN(c.mxn) : undefined,  // in flight: the row's name only, no false «0»
        // tap a row's name for its detail (owner 2026-11-02: «too much data … hide the secondary detail behind interaction»)
        label: (m: boolean) => (
          <button type="button" className={`pc-band${m ? ' is-m' : ''}`} aria-expanded={openBand === id} aria-controls="pc-detail" onClick={() => setOpenBand(openBand === id ? null : id)}>
            {color && <i style={{ background: color }} aria-hidden="true" />}
            <span className="pc-band-t">
              <span>{label}<span className="pc-band-more" aria-hidden="true">{openBand === id ? ' −' : ' +'}</span></span>
              <span className="pc-band-f">{id === top?.id ? <b>{note}</b> : note}</span>
            </span>
          </button>
        ),
      }
    }
    // in flight the «Todo» opening still draws the 12 sector rows it splits into (the skeleton = the final shape)
    if (lens === 'todo' && vs.length) return [mk('all', L('Todos', 'All'), null, 1)]
    if (lens === 'sector' || lens === 'todo') return SECTORS.map((s) => mk(`s${s.id}`, en ? s.nameEN : s.name, null, count.get(`s${s.id}`)?.n ?? 0))
    if (lens === 'proc') return PROC.map((p, i) => mk(p.id, en ? p.en : p.es, null, 10 - i))
    return ADMIN_ORDER.map((a, i) => mk(`a-${a}`, ADMIN_DISPLAY_ACCENTED[a], null, 10 - i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, top, lens, en, openBand, vs.length])

  const axes: FieldAxis[] = useMemo(() => [
    {
      key: 'mxn', label: { es: 'Monto', en: 'Amount' }, scale: 'log10', domain: [1e6, 2e11],  // floor 1 MDP: a 10 MDP floor clamped the small suppliers into a wall on the left edge
      ticks: [1e6, 1e7, 1e8, 1e9, 1e10, 1e11].map((t, i, a) => ({ at: t, label: `${formatNumber(t / 1e6)}${i >= a.length - 2 ? (en ? 'M MXN' : ' MDP') : ''}`, phone: i % 2 === 0 && i < 5 })),  // phone: 1 · 100 · 10,000 MDP (the last tick clipped at 390)
      rules: [1e7, 1e8, 1e9, 1e10, 1e11].map((t) => ({ at: t, alpha: 0.5 })),
      readoutHead: L('dinero total de la franja', 'total money in the row'),
    },
    {
      key: 'risk', label: { es: 'Indicador', en: 'Indicator' }, scale: 'linear', domain: [0, 1],
      ticks: [0, 0.25, 0.4, 0.6, 1].map((t) => ({ at: t, label: t.toFixed(2), tone: t === 0.6 ? 'crit' as const : undefined })),
      rules: [{ at: 0.25, alpha: 0.5 }, { at: 0.4, alpha: 0.5 }, { at: 0.6, tone: 'crit' as const, alpha: 0.8, wash: 'risk' as const }],
      readoutHead: L('dinero total de la franja', 'total money in the row'),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [en])

  // the one computed sentence, per lens
  const finding = useMemo(() => {
    if (!vs.length) return L('Cargando el campo de proveedores…', 'Loading the supplier field…')
    const crit = vs.filter(isCrit).length
    const sorted = bands.filter((b) => (b.n ?? 0) > 0)
    if (lens === 'todo') return en
      ? `${formatNumber(vs.length)} suppliers in the investigation file; ${formatNumber(crit)} carry a critical indicator.`
      : `${formatNumber(vs.length)} proveedores en la fila de investigación; ${formatNumber(crit)} tienen un indicador de riesgo crítico.`
    const tb = top ? bands.find((b) => b.id === top.id) : undefined
    const highest = tb ? L(`La tasa más alta de proveedores críticos está en «${tb.name}»: ${top!.pct} de cada 100.`, `The highest share of critical suppliers is in «${tb.name}»: ${top!.pct} in 100.`) : ''
    if (lens === 'sector') {
      const b = sorted.slice().sort((x, y) => (y.litCount ?? 0) - (x.litCount ?? 0))[0]
      return `${highest} ${en ? `${b.name} has the most critical suppliers: ${formatNumber(b.litCount ?? 0)} of its ${formatNumber(b.n ?? 0)} suppliers.` : `${b.name} reúne más proveedores críticos: ${formatNumber(b.litCount ?? 0)} de sus ${formatNumber(b.n ?? 0)} proveedores.`}`
    }
    if (lens === 'proc') {
      // denominator = the critical suppliers with a known procedure mix (the four bands, not the rail)
      const lit = (ids: string[]) => bands.filter((b) => ids.includes(b.id)).reduce((a, b) => a + (b.litCount ?? 0), 0)
      const known = lit(PROC.map((p) => p.id))
      const pct = known ? Math.round((lit(['p0', 'p1']) / known) * 100) : 0
      return `${highest} ${en ? `${pct} in 100 critical suppliers won most of their contracts by direct award.`
        : `${pct} de cada 100 proveedores críticos ganaron la mayoría de sus contratos por adjudicación directa.`}`
    }
    // sexenio = the term of the supplier's FIRST contract
    return `${highest} ${L('Cada proveedor va en el sexenio de su primer contrato.', 'Each supplier sits in the term of its first contract.')}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, bands, top, lens, en])

  const pickedV = picked ? (rows.find((r) => r.id === picked)?.meta?.v as V | undefined) : undefined
  const lensName: Record<Lens, string> = { todo: L('Todo', 'All'), sector: L('Sector', 'Sector'), proc: L('Procedimiento', 'Procedure'), sexenio: L('Sexenio', 'Term') }
  return (
    <section className="pc" aria-labelledby="pc-h">
      <div className="pc-head">
        <h2 id="pc-h" className="pc-h">{L('El campo', 'The field')}</h2>
        <div className="gd-lens" role="group" aria-label={L('Lente', 'Lens')}>
          {LENSES.map((l) => <button key={l} type="button" aria-pressed={lens === l} onClick={() => setLens(l)}>{lensName[l]}</button>)}
          <span className="pc-sep" aria-hidden="true" />
          {(['mxn', 'risk'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={sortKey === k} onClick={() => setSortKey(k)}>{k === 'mxn' ? L('Monto', 'Amount') : L('Indicador', 'Indicator')}</button>
          ))}
        </div>
      </div>
      {q.isError ? (
        <p className="ct-note">{L('El campo no cargó. Recargue la página.', 'The field did not load. Reload the page.')}</p>
      ) : (
        <div className={q.isLoading ? 'pc-skel' : undefined} aria-busy={q.isLoading}>
          <Field
            rows={rows}
            loading={q.isLoading}
            bands={bands}
            axes={axes}
            sortKey={sortKey}
            litLegend={[]}
            litLine={false}
            phoneLabelH={34}
            legend={[
              {
                key: 'read',
                mark: 'none' as const,
                label: <span className="pc-read">{sortKey === 'mxn'
                  ? L('Cada punto es un proveedor. Ámbar = indicador de riesgo crítico; gris = alto. Más a la derecha, más dinero: cada raya = 10 veces más. Los de riesgo medio o bajo solo se cuentan.',
                    'Each dot is a supplier. Amber = critical risk indicator; grey = high. Further right, more money: each line = 10 times more. Medium and low risk are only counted.')
                  : L('Cada punto es un proveedor. Ámbar = indicador de riesgo crítico; gris = alto. Más a la derecha, indicador más alto. Los de riesgo medio o bajo solo se cuentan.',
                    'Each dot is a supplier. Amber = critical risk indicator; grey = high. Further right, a higher indicator. Medium and low risk are only counted.')}</span>,
              },
            ]}
            finding={finding}
            hover={(r) => {
              const v = r.meta!.v as V
              return (
                <>
                  <b className="block font-serif text-[15px] font-semibold leading-tight">{formatEntityName('vendor', v.name, 'full')}</b>
                  <span className="kf-mono block text-text-primary">
                    {en ? sec(v.sec).nameEN : sec(v.sec).name} · {L('nivel', 'tier')} {v.tier} · {formatCompactMXN(v.mxn)} · {formatNumber(v.n)} {L('contratos', 'contracts')}
                    <br />{L('indicador', 'indicator')} {v.risk?.toFixed(2) ?? '—'}{v.da != null && ` · ${Math.round(v.da * 100)}% ${L('directas', 'direct')}`}{v.y0 != null && ` · ${L('desde', 'since')} ${v.y0}`}
                    {v.novel && <><br />{L('sin caso público', 'no public case')}</>}
                  </span>
                </>
              )
            }}
            onPick={(r) => setPicked(r ? r.id : null)}
            picked={picked}
            lang={lang}
            maxRows={12}
            unit={{ es: 'proveedores', en: 'suppliers' }}
            railLabel={(m: boolean) => <span className={`pc-band is-rail${m ? ' is-m' : ''}`}>{lens === 'proc' ? L('sin tipo de procedimiento', 'no procedure type') : L('sin año de primer contrato', 'no first-contract year')}</span>}
            railName={L('Sin dato', 'No data')}
            table={{ caption: L('Proveedores por franja', 'Suppliers per field row'), band: L('Fila', 'Row'), n: L('Proveedores', 'Suppliers'), lit: L('Críticos', 'Critical'), agg: L('Monto', 'Amount') }}
          />
        </div>
      )}
      {openBand && (() => {
        const inBand = vs.filter((v) => band(v) === openBand)
        const b = bands.find((x) => x.id === openBand)
        const crit = inBand.filter(isCrit)
        const high = inBand.filter((v) => v.risk != null && getRiskLevelFromScore(v.risk) === 'high').length
        const top = crit.slice().sort((x, y) => y.mxn - x.mxn).slice(0, 3)
        const mxn = inBand.reduce((a, v) => a + v.mxn, 0)
        return (
          <div id="pc-detail" className="pc-detail" role="region" aria-label={b?.name}>
            <p>
              <b>{b?.name}</b>{': '}
              {L(`${formatNumber(inBand.length)} proveedores en la fila de investigación; ${formatNumber(crit.length)} con indicador crítico y ${formatNumber(high)} alto. Monto: ${formatCompactMXN(mxn)}.`,
                `${formatNumber(inBand.length)} suppliers in the investigation file; ${formatNumber(crit.length)} with a critical indicator and ${formatNumber(high)} high. Amount: ${formatCompactMXN(mxn)}.`)}
              {top.length > 0 && <> {L('Los críticos de mayor monto:', 'The largest critical ones:')}</>}
            </p>
            {top.length > 0 && (
              <ul>
                {top.map((v) => (
                  <li key={v.id}><EntityIdentityChip type="vendor" id={v.id} name={v.name} size="inherit" hideIcon fullName inline /> <span className="kf-mono">{formatCompactMXN(v.mxn)}</span></li>
                ))}
              </ul>
            )}
            <button type="button" className="ct-link" onClick={() => setOpenBand(null)}>{L('Cerrar', 'Close')}</button>
          </div>
        )
      })()}
      {pickedV && (
        <FieldCard title={L('Proveedor', 'Supplier')} onClose={() => setPicked(null)} lang={lang} focusKey={pickedV.id}>
          <div className="mt-2"><EntityIdentityChip type="vendor" id={pickedV.id} name={pickedV.name} size="md" riskScore={pickedV.risk} ariaTier={pickedV.tier as 1 | 2 | 3} sectorCode={sec(pickedV.sec).code} fullName /></div>
          <dl className="fw-dl kf-mono mt-3">
            <dt>{L('monto', 'amount')}</dt><dd>{formatCompactMXN(pickedV.mxn)}</dd>
            <dt>{L('contratos', 'contracts')}</dt><dd>{formatNumber(pickedV.n)}</dd>
            <dt>{L('indicador', 'indicator')}</dt><dd>{pickedV.risk?.toFixed(2) ?? '—'}</dd>
            {pickedV.da != null && <><dt>{L('directas', 'direct awards')}</dt><dd>{Math.round(pickedV.da * 100)}% {L('de sus contratos', 'of its contracts')}</dd></>}
            {pickedV.y0 != null && <><dt>{L('primer contrato', 'first contract')}</dt><dd>{pickedV.y0}</dd></>}
            <dt>{L('caso público', 'public case')}</dt><dd>{pickedV.doc ? L('documentado', 'documented') : pickedV.novel ? L('ninguno', 'none') : L('pista sin verificar', 'unverified lead')}</dd>
          </dl>
        </FieldCard>
      )}
    </section>
  )
}

export default Campo
