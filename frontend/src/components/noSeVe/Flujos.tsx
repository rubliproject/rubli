/**
 * «A dónde se fue» (concept C) — chapter II's object: one entity's 2024 budget as a flow. Top strip = the whole
 * exercised budget (100%) split into salaries · purchases and works · trust contributions (partida 46101) ·
 * other transfers · the rest; the purchases-and-works slice opens downward into its own strip: with a contract
 * in the register (solid) and without one in view (outline). A trust contribution is in the public accounts,
 * but it never produces a contract — the page says «no deja contrato», never «desaparece».
 * Normalised per entity (each strip = 100%), so the magnitude rides in the label. Names open the drawer.
 */
import { useRef } from 'react'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { CATEGORICAL, RAMP_INK } from '@/lib/constants'
import { money, moneyDual, num, pct, share, type Lang } from '@/lib/noSeVe/lectura'
import { idx, type Ent, type Model } from '@/lib/noSeVe/model'
import { useCajon } from './cajonState'

export const FLOW_KEYS = ['sedena', 'tren-maya-sa', 'ciit', 'semar', 'imss'] as const

const SEG = [
  { k: 'nom', es: 'nómina', en: 'salaries', fill: RAMP_INK[1] },
  { k: 'buy', es: 'compras y obra', en: 'purchases, works', fill: CATEGORICAL[1] },
  { k: 'tr', es: 'fideicomisos', en: 'trusts', fill: CATEGORICAL[0] },
  { k: 'tx', es: 'otras transferencias', en: 'other transfers', fill: RAMP_INK[2] },
  { k: 'rest', es: 'resto', en: 'rest', fill: RAMP_INK[0] },
] as const

export function segments(e: Ent, k: number) {
  const tot = e.tot[k], nom = e.cap1[k], buy = e.ex[k], tr = e.tr[k], tx = Math.max(0, e.cap4[k] - tr)
  const rest = Math.max(0, tot - nom - buy - tr - tx)
  return { tot, v: { nom, buy, tr, tx, rest } as Record<(typeof SEG)[number]['k'], number> }
}

export function FlowKey({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  return (
    <ul className="nsv-keys" aria-label={en ? 'Flow key' : 'Clave del flujo'}>
      {SEG.map((s) => <li key={s.k}><i style={{ background: s.fill }} aria-hidden="true" /><span>{en ? s.en : s.es}</span></li>)}
      <li><i className="is-hollow" aria-hidden="true" /><span>{en ? 'purchases without a contract in view' : 'compras sin contrato a la vista'}</span></li>
    </ul>
  )
}

export function Flujos({ m, lang, year = 2024 }: { m: Model; lang: Lang; year?: number }) {
  const k = idx(m, year)
  const ents = FLOW_KEYS.map((key) => m.by.get(key)).filter((e): e is Ent => !!e && k >= 0 && e.tot[k] > 0)
  return (
    <div className="nsv-flows">
      {ents.map((e) => <Flow key={e.key} e={e} k={k} year={year} lang={lang} />)}
    </div>
  )
}

function Flow({ e, k, year, lang }: { e: Ent; k: number; year: number; lang: Lang }) {
  const en = lang === 'en'
  const open = useCajon()
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const phone = width < 640
  const { tot, v } = segments(e, k)
  const W = width
  const hA = phone ? 20 : 24, gap = phone ? 22 : 30, hB = phone ? 14 : 16
  let x = 0
  const segs = SEG.map((s) => { const w = (v[s.k] / tot) * W; const r = { ...s, x, w }; x += w; return r })
  const buy = segs[1], vis = e.vis[k], seen = buy.w > 0 ? Math.min(1, vis / v.buy) : 0
  const H = hA + gap + hB
  const big = SEG.filter((s) => v[s.k] / tot >= 0.02)
  return (
    <div className="nsv-flow" ref={ref}>
      <div className="nsv-flow-who">
        <button type="button" className="nsv-ente" data-ente={e.key} onClick={() => open({ ente: e.key, anio: year })}>{e.short}</button>
        <span className="cr-m cr-gray">{en ? 'budget' : 'presupuesto'} {year}: <b>{moneyDual(tot, lang, year)}</b></span>
      </div>
      <div style={width ? undefined : { minHeight: 70 }}>
        {width > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={en
            ? `${e.short} ${year}: ${big.map((s) => `${s.en} ${pct(v[s.k] / tot, 'en')}`).join(', ')}; purchases with a contract ${share(vis / Math.max(1, v.buy), 'en')}`
            : `${e.short} ${year}: ${big.map((s) => `${s.es} ${pct(v[s.k] / tot)}`).join(', ')}; compras con contrato ${share(vis / Math.max(1, v.buy))}`}>
          {segs.map((s) => s.w > 0.5 && <rect key={s.k} x={s.x} y={0} width={s.w} height={hA} fill={s.fill} stroke={s.k === 'rest' ? RAMP_INK[1] : undefined} />)}
          {buy.w > 0 && <path d={`M${buy.x},${hA} L${buy.x + buy.w},${hA} L${W},${hA + gap} L0,${hA + gap} Z`} fill={CATEGORICAL[1]} fillOpacity={0.1} />}
          {buy.w > 0 && <>
            <rect x={0.5} y={hA + gap + 0.5} width={W - 1} height={hB - 1} className="nsv-hollow" />
            <rect x={0} y={hA + gap} width={seen * W} height={hB} fill={CATEGORICAL[1]} />
          </>}
        </svg>}
        <p className="nsv-flow-l cr-m">
          {big.map((s, i) => (
            <span key={s.k}>{i > 0 && ' · '}<i style={{ background: s.fill }} aria-hidden="true" />{en ? s.en : s.es} <b>{pct(v[s.k] / tot, lang)}</b></span>
          ))}
        </p>
        <p className="nsv-flow-l cr-m">
          {en ? 'purchases and works ' : 'compras y obra '}<b>{money(v.buy, lang)}</b> → {en ? 'with a contract ' : 'con contrato '}
          <b className={vis / Math.max(1, v.buy) < 0.25 ? 'is-dark' : undefined}>{share(vis / Math.max(1, v.buy), lang)}</b> ({money(vis, lang)} · {num(e.n[k], lang)} {en ? 'contracts' : 'contratos'})
          {v.tr > 0 && <> · {en ? 'into trusts ' : 'a fideicomisos '}<b>{money(v.tr, lang)}</b>{en ? ', no contract' : ', sin contrato'}</>}
        </p>
      </div>
    </div>
  )
}
