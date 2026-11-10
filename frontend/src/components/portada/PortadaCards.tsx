/**
 * PortadaCards — the four presentation cards under the Portada objects (owner
 * 2026-10-15: «where are our presentation cards?»). 2026-11-02 («god awful»): one light rule under the
 * section head, no rule per card; rows aligned across cards by subgrid (label · visual 132 · sentence ·
 * «Ver …»; visual 144 = its viewBox, ticks never under 12); short labels; names in the label face, only figures in mono. Each card is a live
 * thumbnail of its page's own object and one sentence; the whole card is the link.
 * Owner phone review 2026-10-29 («this looks goddamn awful»): no display numeral (the count rides
 * in the sentence, bold at 15), one quiet ink visual per card, colour only where it means something.
 *   Focos Rojos · «Nuevos» wall in miniature (the rosette glyph travels)
 *   Casos       · one ink square per public case, a row per sexenio
 *   Sectores    · the five largest sectors + the rest, ruled money shares (the sector square names it)
 *   Sexenios    · direct-award share by contracts, thin ink bars on the EU 10% mark (the one red rule)
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ariaRosettesQuery } from '@/api/entityQueries'
import type { ExecutiveSummaryResponse, ScandalStats } from '@/api/types'
import { paintRosetteAt, type RosetteTuple } from '@/components/kit/rosette'
import { SECTORS } from '@/lib/constants'
import { ADMIN_DISPLAY_ACCENTED, ADMIN_ORDER, type AdministrationKey } from '@/lib/administrations'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

type Lang = 'en' | 'es'

function Card({ to, kicker, label, line, go, children }: { to: string; kicker: string; label: string; line: ReactNode; go: string; children: ReactNode }) {
  return (
    <Link to={to} className="pq-card">
      <span className="pq-k">{kicker}</span>
      <span className="pq-thumb" role="img" aria-label={label}>{children}</span>
      <span className="pq-line">{line}</span>
      <span className="pq-go">{go} <span aria-hidden="true">→</span></span>
    </Link>
  )
}

const NO_VENDORS: Record<string, RosetteTuple[]> = {}
const SKEL_ORDER = Array.from({ length: 16 }, (_, i) => -1 - i)

function FocosThumb({ vendors, order }: { vendors: Record<string, RosetteTuple[]>; order: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1
      if (w < 40 || h < 20) return
      cv.width = w * dpr; cv.height = h * dpr
      const c = cv.getContext('2d')!
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, w, h)
      const cols = 8, rows = 2, cw = w / cols, ch = h / rows, R = Math.min(cw, ch) / 2 - 3
      order.slice(0, cols * rows).forEach((id, i) => {
        const list = (vendors[String(id)] ?? []).slice().sort((a, b) => (a[2] ?? 0) - (b[2] ?? 0))
        paintRosetteAt(c, (i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2, R, list, 1.2)
      })
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [vendors, order])
  return <canvas ref={ref} className="pq-cv" />
}

export function PortadaCards({ lang, summary, cases }: { lang: Lang; summary: ExecutiveSummaryResponse | null; cases: ScandalStats | null }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  // same query as the Focos Rojos wall («Nuevos» default), so the cache is shared
  const ros = useQuery(ariaRosettesQuery(100, 'nuevos'))
  const nuevos = ros.data?.items ?? []
  const order = useMemo(() => nuevos.slice().sort((a, b) => b.ips_final - a.ips_final).map((v) => v.vendor_id), [nuevos])

  const sectors = useMemo(() => {
    const xs = summary?.sectors ?? []
    const tot = xs.reduce((a, x) => a + x.value, 0)
    return { xs: xs.slice().sort((a, b) => b.value - a.value), tot }
  }, [summary])
  const top = sectors.xs[0]
  const topMeta = top ? SECTORS.find((s) => s.code === top.code) : undefined
  const pctOf = (v: number) => Math.round((v / (sectors.tot || 1)) * 100)
  const shelf = [
    ...sectors.xs.slice(0, 5).map((d) => ({ key: d.code, v: d.value, m: SECTORS.find((s) => s.code === d.code) })),
    ...(sectors.xs.length > 5 ? [{ key: 'rest', v: sectors.xs.slice(5).reduce((a, x) => a + x.value, 0), m: undefined }] : []),
  ]
  const shelfMax = Math.max(1, ...shelf.map((d) => d.v))

  const admins = useMemo(() => (summary?.administrations ?? []).map((a, i) => ({ key: ADMIN_ORDER[i] as AdministrationKey | undefined, pct: a.direct_award_pct, years: a.direct_award_years })), [summary])
  const coded = admins.filter((a) => a.pct != null)
  const minDA = coded.length ? Math.min(...coded.map((a) => a.pct!)) : null
  const since = coded[0]?.years?.slice(0, 4) ?? null

  const caseCells = useMemo(() => {
    const by = cases?.cases_by_administration ?? []
    const order: string[] = [...ADMIN_ORDER, 'multiple']
    return order.map((k) => ({ k, n: by.find((b) => b.administration === k)?.count ?? 0 }))
  }, [cases])
  const sq = Math.max(4, Math.min(12, Math.floor((300 - 84 - 28) / Math.max(1, ...caseCells.map((c) => c.n))) - 3))

  return (
    <section className="pq" aria-labelledby="pq-h">
      <h2 id="pq-h" className="pq-h">{L('Otras secciones del registro', 'More of the record')}</h2>
      <div className="pq-grid">
      <Card
        to="/aria"
        go={L('Ver Focos Rojos', 'See Red Flags')}
        kicker={L('Focos Rojos', 'Red Flags')}
        label={L('Los proveedores nuevos de la fila de investigación, cada uno con un diagrama de sus señales', 'The new suppliers of the investigation file, each as a rosette of signals')}
        line={<><b>{nuevos.length ? formatNumber(nuevos.length) : '—'}</b> {L('proveedores sin caso público, con contratos en 2019 o después, reúnen más señales a la vez.', 'suppliers with no public case, with contracts in 2019 or later, stack the most signals at once.')}</>}
      >
        {/* in flight: the same 8 × 2 grid with each rosette's empty reference ring (the final shape, not a grey tile) */}
        <FocosThumb vendors={ros.data?.vendors ?? NO_VENDORS} order={ros.data ? order : SKEL_ORDER} />
      </Card>
      <Card
        to="/cases"
        go={L('Ver los casos', 'See the cases')}
        kicker={L('Casos', 'Cases')}
        label={L('Un cuadro por caso público, en filas por sexenio', 'One square per public case, in rows by administration')}
        line={cases
          ? <><b>{formatNumber(cases.total_cases)}</b> {L(`expedientes públicos con proveedores en el registro; ${formatCompactMXN(cases.total_amount_mxn_low)} documentados.`, `public case files with suppliers in the record; ${formatCompactMXN(cases.total_amount_mxn_low)} documented.`)}</>
          : '—'}
      >
        <svg viewBox="0 0 300 144" preserveAspectRatio="xMinYMin meet">
          {caseCells.map((c, i) => (
            <g key={c.k} transform={`translate(0 ${i * 24})`}>
              <text x="0" y="16" className="pq-tick">{c.k === 'multiple' ? L('varios', 'several') : ADMIN_DISPLAY_ACCENTED[c.k as AdministrationKey]}</text>
              {Array.from({ length: c.n }, (_, j) => <rect key={j} x={84 + j * (sq + 3)} y={17 - sq} width={sq} height={sq} className={c.k === 'multiple' ? 'pq-mark is-rest' : 'pq-mark'} />)}
              <text x={84 + c.n * (sq + 3) + 4} y="16" className="pq-num">{c.n}</text>
            </g>
          ))}
        </svg>
      </Card>
      <Card
        to="/mapa"
        go={L('Ver en El Mapa', 'See on El Mapa')}
        kicker={L('Sectores', 'Sectors')}
        label={L('Parte del dinero de los cinco sectores mayores y del resto', 'Money share of the five largest sectors and the rest')}
        line={top && topMeta
          ? <>{L(`De 12 sectores, ${topMeta.name} concentra `, `Of 12 sectors, ${topMeta.nameEN} holds `)}<b>{pctOf(top.value)}%</b>{L(` del dinero: ${formatCompactMXN(top.value)}.`, ` of the money: ${formatCompactMXN(top.value)}.`)}</>
          : '—'}
      >
        <svg viewBox="0 0 300 144" preserveAspectRatio="xMinYMin meet">
          {shelf.map((d, i) => {
            const w = (d.v / shelfMax) * 120
            return (
              <g key={d.key} transform={`translate(0 ${i * 24})`}>
                {d.m && <rect x="0" y="7" width="10" height="10" style={{ fill: d.m.color }} />}
                <text x="16" y="16" className="pq-tick">{d.m ? (en ? d.m.nameEN : d.m.name) : L(`los otros ${sectors.xs.length - 5}`, `the other ${sectors.xs.length - 5}`)}</text>
                <rect x="132" y="11" width={Math.max(1, w)} height="2" className={d.m ? 'pq-mark' : 'pq-mark is-rest'} />
                <text x={136 + w} y="16" className="pq-num">{pctOf(d.v)}%</text>
              </g>
            )
          })}
        </svg>
      </Card>
      <Card
        to="/administrations"
        go={L('Ver los sexenios', 'See the administrations')}
        kicker={L('Sexenios', 'Administrations')}
        label={L('Parte de los contratos por adjudicación directa en cada sexenio, frente a la línea de 10% de la UE', 'Share of contracts awarded directly in each administration, against the EU 10% line')}
        line={minDA != null && since
          ? <>{L(`Desde ${since}, ningún sexenio bajó del `, `Since ${since}, no administration fell below `)}<b>{Math.floor(minDA)}%</b>{L(' de contratos por adjudicación directa.', ' direct-award contracts.')}</>
          : '—'}
      >
        <svg viewBox="0 0 300 144" preserveAspectRatio="xMinYMin meet">
          <defs>
            <pattern id="pq-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" className="pq-hatch" strokeWidth="1.5" /></pattern>
          </defs>
          {admins.map((a, i) => {
            const w = a.pct == null ? 40 : (a.pct / 100) * 180
            return (
              <g key={i} transform={`translate(0 ${i * 24})`}>
                <text x="0" y="16" className="pq-tick">{a.key ? ADMIN_DISPLAY_ACCENTED[a.key] : ''}</text>
                <rect x="84" y="9" width={w} height="6" className={a.pct == null ? undefined : 'pq-mark'} fill={a.pct == null ? 'url(#pq-hatch)' : undefined} />
                <text x={84 + w + 4} y="16" className={a.pct == null ? 'pq-tick' : 'pq-num'}>{a.pct == null ? L('sin dato', 'no data') : `${Math.round(a.pct)}%`}</text>
              </g>
            )
          })}
          <line x1="102.5" x2="102.5" y1="2" y2="124" className="pq-eu-rule" />
          <text x="102" y="140" textAnchor="middle" className="pq-tick pq-eu">{L('UE 10%', 'EU 10%')}</text>
        </svg>
      </Card>
      </div>
    </section>
  )
}

export default PortadaCards
