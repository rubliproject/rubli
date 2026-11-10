/**
 * «La cinta sellada» (concept B) — chapter I's object: the Tren Maya project 2020–2026 on the sexenio spine.
 * Red ribbon = what the project EXERCISED on purchases + works each year (Cuenta Pública, cartera 2021W3N0001),
 * stacked by the unit that spent it; ink ribbon = what was SIGNED that year in contracts naming the train, any
 * buyer — the same axis, so 2020–21 shows the ink wider than the red and from 2022 the red swells while the ink
 * thins to a line. Numerals = contracts ÷ exercised. Facts = numbered ticks at the month on the axis, read in the
 * list under the plate (the decrees, the Court, the trusts, the blackout) — a list, so no label can sit on a leader.
 * The red ribbon stops at the last Cuenta Pública year (a seam, labelled): past it (2026) only the ink runs —
 * contracts yes, exercised not yet published — and no numeral is printed, because there is nothing to divide by.
 * Every year column opens that year's layer of the drawer; the band keys open the units.
 * HTML owns the clickable words, SVG owns the geometry (measured px).
 */
import { useRef } from 'react'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { smooth } from '@/lib/vendor/expediente'
import { money, num, share, type Lang } from '@/lib/noSeVe/lectura'
import { idx, type Model } from '@/lib/noSeVe/model'
import { useCajon } from './cajonState'

/** Band order bottom-up from the axis, with the entity a key opens (the fund itself has no row of its own). */
const BANDS: { ur: string; op: number; es: string; en: string; ente?: string }[] = [
  { ur: 'W3N', op: 0.4, es: 'FONATUR (fondo)', en: 'FONATUR (fund)' },
  { ur: 'W3X', op: 0.55, es: 'FONATUR Tren Maya', en: 'FONATUR Tren Maya', ente: 'fonatur-tren-maya' },
  { ur: 'H0M', op: 0.85, es: 'Tren Maya S.A.', en: 'Tren Maya S.A.', ente: 'tren-maya-sa' },
  { ur: 'otros', op: 0.3, es: 'INAH y otros', en: 'INAH and others' },
]

export interface Fact { at: number; es: string; en: string; red?: boolean }

export function facts(m: Model): Fact[] {
  const k24 = idx(m, 2024), sed = m.by.get('sedena'), P = m.proj
  const post = m.axis.map((y, k) => ({ y, k })).filter((a) => a.k >= m.years.length && P.nAx[a.k] > 0)
  const out: Fact[] = [
    { at: 2020.5, es: `firmas: ${money(m.proj.vis[0], 'es')}`, en: `signed: ${money(m.proj.vis[0], 'en')}` },
    { at: 2021 + 10.7 / 12, es: 'decreto · 22 nov 2021', en: 'decree · 22 Nov 2021', red: true },
    { at: m.peak.y + 0.5, es: `tope: ${money(m.peak.ex, 'es')}`, en: `peak: ${money(m.peak.ex, 'en')}` },
    { at: 2023 + 4.6 / 12, es: 'la SCJN lo anula · 2.º decreto, 18 may 2023', en: 'Court strikes it · 2nd decree, 18 May 2023', red: true },
    { at: 2025 + 8.9 / 12, es: 'apagón de CompraNet · 28 sep', en: 'CompraNet blackout · 28 Sep', red: true },
    // after the blackout the record continues in ComprasMX, to the data cut (DATA_CUT_ISO)
    ...post.map(({ y, k }) => ({ at: y + 0.5, es: `sigue en ComprasMX: ${num(P.nAx[k])} contratos · ${money(P.visAx[k], 'es')} al corte`, en: `continues in ComprasMX: ${num(P.nAx[k], 'en')} contracts · ${money(P.visAx[k], 'en')} to the cut-off` })),
  ]
  if (sed && k24 >= 0 && sed.tr[k24] > 0) out.push({ at: 2024.5, es: `SEDENA → fideicomisos ${money(sed.tr[k24], 'es')}`, en: `SEDENA → trusts ${money(sed.tr[k24], 'en')}` })
  return out.sort((a, b) => a.at - b.at)
}

export function Cinta({ m, lang }: { m: Model; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const en = lang === 'en'
  const open = useCajon()
  const phone = width > 0 && width < 640
  const P = m.proj, N = m.years.length, NA = m.axis.length, y0 = m.years[0], yCP = m.years[N - 1]
  const fs = facts(m)

  const keys = (
    <ul className="nsv-keys" aria-label={en ? 'Ribbon key' : 'Clave de la cinta'}>
      {BANDS.map((b) => (
        <li key={b.ur}>
          <i style={{ background: 'var(--color-accent)', opacity: b.op }} aria-hidden="true" />
          {b.ente ? <button type="button" data-ente={b.ente} onClick={() => open({ ente: b.ente })}>{en ? b.en : b.es}</button> : <span>{en ? b.en : b.es}</span>}
        </li>
      ))}
      <li><i className="is-ink" aria-hidden="true" /><span>{en ? 'contracts naming the train' : 'contratos que nombran al tren'}</span></li>
    </ul>
  )

  if (!width) return <div ref={ref} className="nsv-cinta" style={{ minHeight: 440 }} />

  const L = phone ? 0 : 96, R = phone ? 34 : 64
  const cw = (width - L - R) / (NA + 0.2)
  const X = (at: number) => L + (at - y0) * cw          // `at` in fractional years: 2021.9 = Nov 2021
  const XM = (k: number) => L + (k + 0.5) * cw
  const TOP = phone ? 34 : 42, RIB = phone ? 168 : 300
  const mid = TOP + RIB / 2, yAx = TOP + RIB, yNum = yAx + 30, yTick = yNum + 10
  const vmax = Math.max(1, ...P.ex, ...P.visAx)
  const yS = (v: number) => (v / vmax) * (RIB / 2 - 2)
  const xCP = L + N * cw   // the seam: the last Cuenta Pública year ends here

  const ticks = fs.map((f) => Math.min(X(f.at), L + NA * cw))
  const H = phone ? yNum + 8 : yTick + 22

  // exercised bands: cumulative edges, each smoothed once, so neighbours share their edge exactly
  const cum: number[][] = [m.years.map(() => 0)]
  BANDS.forEach((b) => { const s = m.projByUr.find((u) => u.ur === b.ur)?.vals ?? m.years.map(() => 0); cum.push(cum[cum.length - 1].map((v, k) => v + s[k])) })
  const band = (j: number, sign: 1 | -1) => {
    const up = cum[j + 1].map((v, k) => [XM(k), mid - sign * yS(v)] as [number, number])
    const dn = cum[j].map((v, k) => [XM(k), mid - sign * yS(v)] as [number, number])
    return `${smooth(up)} L${dn.slice().reverse().map((p) => p.join(',')).join(' L')} Z`
  }
  const vu = P.visAx.map((v, k) => [XM(k), mid - yS(v)] as [number, number]), vd = P.visAx.map((v, k) => [XM(k), mid + yS(v)] as [number, number])
  const amloK = m.years.filter((y) => y <= 2024).length
  const sumK = (a: number[], k0: number, k1: number) => a.slice(k0, k1).reduce((s, v) => s + v, 0)
  const chapters = [
    { k0: 0, k1: amloK, name: 'AMLO' },
    { k0: amloK, k1: NA, name: 'Sheinbaum' },
  ].filter((c) => c.k1 > c.k0)

  return (
    <div ref={ref} className="nsv-cinta">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group"
        aria-label={en ? `The Tren Maya project ${y0}–${m.axis[NA - 1]}: exercised (to ${yCP}) against contracts in view, year by year` : `El proyecto Tren Maya ${y0}–${m.axis[NA - 1]}: lo ejercido (hasta ${yCP}) frente a los contratos a la vista, año por año`}>
        {chapters.map((c, i) => {
          const ex = sumK(P.ex, c.k0, Math.min(c.k1, N)), vis = sumK(P.vis, c.k0, Math.min(c.k1, N))  // CP years only
          const cpOnly = c.k1 > N ? `${m.years[c.k0] === yCP ? yCP : `${m.years[c.k0]}–${yCP}`}: ` : ''
          return (
            <g key={c.name}>
              {i % 2 === 1 && <rect className="vd-exp-chap" x={L + c.k0 * cw} y={TOP - 30} width={(c.k1 - c.k0) * cw} height={yNum - TOP + 36} />}
              <line className="nsv-cut" x1={L + c.k0 * cw} x2={L + c.k0 * cw} y1={TOP - 34} y2={TOP - 18} />
              <text className="nsv-chn" x={L + c.k0 * cw + 5} y={TOP - 21}>{c.name}</text>
              {(!phone || i === 0) && ex > 0 && <text className="vd-exp-yr" x={L + c.k0 * cw + 5} y={TOP - 7}>{`${cpOnly}${money(ex, lang)} · ${share(vis / ex, lang)}`}</text>}
            </g>
          )
        })}
        {BANDS.map((b, j) => ([1, -1] as const).map((s) => <path key={`${b.ur}${s}`} d={band(j, s)} fill="var(--color-accent)" fillOpacity={b.op} />))}
        <path d={`${smooth(vu)} L${vd.slice().reverse().map((p) => p.join(',')).join(' L')} Z`} className="nsv-ink" fillOpacity={0.92} />
        <line className="vd-exp-axis" x1={L} x2={L + NA * cw} y1={mid} y2={mid} strokeDasharray="2 3" />
        {NA > N && <>
          <line className="cg-seam" x1={xCP} x2={xCP} y1={TOP - 2} y2={yAx} />
          {!phone && <text className="vd-exp-yr" x={xCP + 5} y={TOP + 14}>{en ? `exercised: to ${yCP}` : `ejercido: hasta ${yCP}`}</text>}
          {!phone && <text className="vd-exp-yr" x={xCP + 5} y={TOP + 30}>{en ? `${m.axis[N]}: accounts out in ${m.axis[N] + 1}` : `${m.axis[N]}: la Cuenta sale en ${m.axis[N] + 1}`}</text>}
        </>}
        {!phone && <>
          <text className="nsv-rowk" x={0} y={TOP + 14}>{en ? 'Exercised' : 'Ejercido'}</text>
          <text className="vd-exp-yr" x={0} y={TOP + 30}>{en ? 'purchases, works' : 'compras y obra'}</text>
          <text className="nsv-rowk" x={0} y={mid + 4}>{en ? 'Contracts' : 'Contratos'}</text>
          <text className="vd-exp-yr" x={0} y={mid + 20}>{en ? 'in the register' : 'en el registro'}</text>
          <text className="nsv-rowk" x={0} y={yNum + 4}>{en ? 'Seen' : 'Se ve'}</text>
          <text className="nsv-rowk" x={0} y={yTick + 16}>{en ? 'Facts' : 'Hechos'}</text>
        </>}
        {m.axis.map((y, k) => <text key={y} className="vd-exp-yr" x={XM(k)} y={yAx + 16} textAnchor="middle">{phone ? `’${String(y).slice(2)}` : y}</text>)}
        {m.axis.slice(N).map((y, j) => <text key={y} className="vd-exp-yr" x={XM(N + j)} y={yNum + 4} textAnchor="middle">{phone ? '—' : (en ? 'no accounts yet' : 'sin Cuenta aún')}</text>)}
        {m.years.map((y, k) => {
          const s = P.ex[k] > 0 ? P.vis[k] / P.ex[k] : null
          return s == null ? null : <text key={y} className={s < 0.25 ? 'nsv-num is-seal' : 'nsv-num'} x={XM(k)} y={yNum + 4} textAnchor="middle">{share(s, lang)}</text>
        })}
        {!phone && fs.map((f, i) => (
          <g key={i} className={f.red ? 'nsv-ev is-key' : 'nsv-ev'}>
            <line x1={ticks[i]} x2={ticks[i]} y1={yTick - 2} y2={yTick + 4} />
            <text x={ticks[i]} y={yTick + 16} textAnchor="middle">{i + 1}</text>
          </g>
        ))}
        {m.axis.map((y, k) => (
          <rect key={y} className="nsv-col" x={L + k * cw} y={TOP - 4} width={cw} height={yNum - TOP + 12} role="button" tabIndex={0}
            aria-label={k < N
              ? (en ? `${y}: exercised ${money(P.ex[k], 'en')}, contracts ${money(P.vis[k], 'en')} — open the year` : `${y}: ejercido ${money(P.ex[k], 'es')}, contratos ${money(P.vis[k], 'es')} — abrir el año`)
              : (en ? `${y}: contracts ${money(P.visAx[k], 'en')}; exercised not yet published (Public Accounts ${y} come out in ${y + 1}) — open the year` : `${y}: contratos ${money(P.visAx[k], 'es')}; gasto ejercido aún no publicado (la Cuenta Pública ${y} sale en ${y + 1}) — abrir el año`)}
            data-ente={P.key} onClick={() => open({ ente: P.key, anio: y })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open({ ente: P.key, anio: y }) } }} />
        ))}
      </svg>
      <ol className="nsv-facts" aria-label={en ? 'Facts' : 'Hechos'}>
        {fs.map((f, i) => <li key={i} className={f.red ? 'is-key' : undefined}><span className="nsv-fn" aria-hidden="true">{i + 1}</span><b>{Math.floor(f.at)}</b> {en ? f.en : f.es}</li>)}
      </ol>
      {keys}
    </div>
  )
}
