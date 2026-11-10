/**
 * Chapter «Empezó antes del fallo» — «La regla del fallo»: every contract a dot on the days it started before the
 * award, one row per institution; red only for the ones that started before bids were opened. Drill (hash
 * `#fallo:<inst>:<fecha>`): institution → batch awards → contracts → supplier. Concept: src/common.js buildFallo().
 */
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { fdate } from '@/components/newtabs/ntShared'
import { formatCompactMXN } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import { SEAL, hash, isPreApe, median, sum, type FalloModel, type FalloRowDef } from '@/lib/destiempo/model'
import { falloHead, falloLectura, money, n1, num, pct, pfLabel, vn, type Lang } from '@/lib/destiempo/lectura'
import { Chapter, More, RowHits, isPhoneW, useHashDrill, type Level } from './Chapter'

const XMIN = -45

export function FalloChapter({ M, lang, level }: { M: FalloModel; lang: Lang; level: 1 | 2 }) {
  const en = lang === 'en', L = (es: string, e: string) => (en ? e : es)
  const { F, meta: m, rowDefs } = M
  const ref = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(ref)
  const phone = isPhoneW(W)
  const [hashKeys, setHash] = useHashDrill('fallo')
  const [tick, setTick] = useState(0)
  const label = (rd: FalloRowDef) => (rd.k === 'otras' ? L(`otras ${M.restCount}`, `${M.restCount} others`) : rd.label)
  // default (no hash): the lead institution, and on desktop its largest batch award
  const keys = hashKeys && rowDefs.some((r) => r.k === hashKeys[0]) ? hashKeys : [rowDefs[0].k, ...(phone || !F.leadDates[0] ? [] : [F.leadDates[0][0]])]
  const rd = rowDefs.find((r) => r.k === keys[0])!
  const open = (k: string[]) => { setHash(k); setTick((t) => t + 1) }
  const stack: Level[] = [{ key: rd.k, label: label(rd) }, ...(keys[1] ? [{ key: keys[1], label: L(`fallo del ${fdate(keys[1], lang)}`, `award of ${fdate(keys[1], lang)}`) }] : [])]

  const head = falloHead(M, lang), claims = falloLectura(M, lang)
  const lead = m && M.R.length ? rowDefs[0] : null
  const sedDatesN = sum(F.leadDates.map((d) => d[1]))

  // ── the ruler ──
  const svg = useMemo(() => {
    if (!W) return null
    const Lm = phone ? 0 : 132, Rm = phone ? 8 : en ? 112 : 96, FOLD = phone ? 26 : 34, span = W - Lm - Rm - FOLD
    const x = (d: number) => Lm + FOLD + ((d - XMIN) / (0 - XMIN)) * span
    const RH = phone ? 38 : 40, TOP = 46, H = TOP + rowDefs.length * RH + 8, PAD = phone ? 17 : 4
    const ticks = Array.from({ length: 10 }, (_, i) => XMIN + i * 5)
    const hits = rowDefs.map((r, j) => ({ key: r.k, y0: TOP + j * RH, h: RH, name: L(`${label(r)}: ${num(r.n, lang)} contratos que empezaron antes del fallo, abrir sus fallos`, `${label(r)}: ${num(r.n, lang)} contracts started before the award, open its award dates`) }))
    return { H, hits, el: (
      <svg className="dt-g" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={L('Cada contrato, un punto en los días que empezó antes del fallo, por institución', 'Each contract, a dot on the days it started before the award, by institution')}>
        {ticks.map((d) => (
          <g key={d}>
            <line className="axis" x1={x(d)} y1={TOP - 6} x2={x(d)} y2={H - 8} />
            {d > XMIN && (!phone || d % 15 === 0) && <text className="yr" x={x(d)} y={TOP - 12} textAnchor="middle">{d === 0 ? '0' : d}</text>}
          </g>
        ))}
        <text className="yr" x={phone ? 0 : Lm + FOLD / 2} y={TOP - 12} textAnchor={phone ? 'start' : 'middle'}>{'> 45'}</text>
        {([[m.med.pub, L('publicación', 'published')], [m.med.ape, L('apertura', 'opening')]] as const).map(([d, lab]) => d != null && d >= XMIN && (
          <g key={lab}><line className="seam" x1={x(d)} y1={TOP - 28} x2={x(d)} y2={H - 8} />{!phone && <text className="chf" x={x(d) + 4} y={TOP - 30}>{lab}</text>}</g>
        ))}
        <line className="cut" x1={x(0)} y1={TOP - 30} x2={x(0)} y2={H - 8} strokeWidth={2} />
        <text className="ch" x={x(0) - 4} y={TOP - 30} textAnchor="end">{L('fallo', 'award')}</text>
        {!phone && <text className="chf" x={x(0) + 5} y={TOP - 12}>{L('← días antes', '← days before')}</text>}
        {rowDefs.map((r, j) => {
          const y0 = TOP + j * RH, mid = y0 + RH / 2
          const sub = `${num(r.n, lang)}/${num(r.pop, lang)} ${L('contratos', 'contracts')} · ${pct(r.n / r.pop, lang, 1)}`
          return (
            <g key={r.k}>
              {j > 0 && <line className="axis" x1={Lm} y1={y0} x2={W - Rm} y2={y0} />}
              {phone ? (
                <><text className="lanek" x={2} y={y0 + 11} style={{ fill: r.color, fontSize: 12 }}>{label(r)}</text><text className="lanem" x={W - Rm} y={y0 + 11} textAnchor="end">{sub}</text></>
              ) : (
                <><text className="lanek" x={0} y={mid - 3} style={{ fill: r.color }}>{label(r)}</text><text className="lanem" x={0} y={mid + 11}>{sub}</text>
                  <text className="lanem" x={W} y={mid + 4} textAnchor="end">{money(r.v * 1e6, lang)}</text></>
              )}
              <g className="dots">
                {[...r.rows.map((row, k) => ({ row, k }))].sort((a, b) => Number(isPreApe(a.row)) - Number(isPreApe(b.row))).map(({ row, k }) => {
                  const red = isPreApe(row)
                  const cx = row.ini < XMIN ? Lm + FOLD / 2 + (hash(k) - 0.5) * FOLD * 0.6 : x(row.ini) + (hash(k) - 0.5) * (span / 45) * 0.9
                  const rr = Math.min(phone ? 6 : 9, (phone ? 1.3 : 1.6) + 0.24 * Math.sqrt(row.amt))
                  const cy = y0 + PAD + rr + hash(k * 7 + 1) * (RH - PAD - 4 - 2 * rr)
                  return (
                    <circle key={k} cx={cx} cy={cy} r={rr} className={red ? 'crit' : undefined} style={{ fill: red ? SEAL : r.color, fillOpacity: red ? 0.95 : 0.55 }} strokeWidth={red ? 1 : 0}>
                      <title>{`${row.v ? vn(row.v, 60) + (row.pf ? pfLabel(lang) : '') : L('sin nombre en el registro', 'no name in the register')} · ${money(row.amt * 1e6, lang)} · ${L(`empezó ${n1(-row.ini, 'día', 'días', lang)} antes del fallo`, `started ${n1(-row.ini, 'day', 'days', lang)} before the award`)} (${fdate(row.fallo, lang)})${red ? L(' · antes de la apertura', ' · before bids opened') : ''}`}</title>
                    </circle>
                  )
                })}
              </g>
            </g>
          )
        })}
      </svg>
    ) }
  }, [W, phone, en, rowDefs, m, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── the drill ──
  const drill = (fit: number) => {
    if (keys[1]) {
      const rows = rd.rows.filter((r) => r.fallo === keys[1]).sort((a, b) => b.amt - a.amt)
      return (
        <ul className="dt-rows fallo">
          <li className="hd"><span>{L('Días', 'Days')}</span><span>{L('Proveedor', 'Supplier')}</span><span className="dt-hm">{L('Objeto', 'Object')}</span><span className="m">{L('Monto', 'Amount')}</span><span className="dt-hm">{L('Proced.', 'Procedure')}</span><span className="dt-hm">{L('Registro', 'Record')}</span></li>
          {rows.slice(0, fit).map((r, i) => {
            const red = isPreApe(r)
            return (
              <li key={i} className={red ? 'is-crit' : undefined}>
                <span className={`m${red ? ' dt-seal' : ''}`} style={{ textAlign: 'left' }}><b>{-r.ini}</b>{red && <small className="seal">{L('antes de la apertura', 'before bids opened')}</small>}</span>
                <span className="who">{r.v ? (r.vid != null ? <EntityIdentityChip type="vendor" id={r.vid} name={r.v} variant="name" className="dt-ent" /> : <b className="dt-ent">{vn(r.v, 60)}</b>) : <span className="dt-mono">{L('sin nombre en el registro', 'no name in the register')}</span>}{r.pf && <span className="dt-pf">{pfLabel(lang)}</span>}</span>
                <span className="obj dt-hm">{r.t}</span>
                <span className="m"><b>{formatCompactMXN(r.amt * 1e6)}</b></span>
                <span className="dt-hm"><span className={`tag${r.lp ? ' lic' : ''}`}>{r.lp ? L('licitación', 'tender') : L('invitación', 'invitation')}</span></span>
                <span className="dt-hm dt-mono">{r.cid ? <Link to={`/contracts/${r.cid}`}>{r.code}</Link> : r.code}</span>
              </li>
            )
          })}
          <More n={rows.length - fit} to="/antes-del-fallo?vista=lista" lang={lang} />
        </ul>
      )
    }
    const by = Object.entries(rd.rows.reduce<Record<string, { n: number; v: number; d: number[]; red: number }>>((a, r) => {
      const s = (a[r.fallo] ??= { n: 0, v: 0, d: [], red: 0 }); s.n++; s.v += r.amt; s.d.push(r.ini); s.red += isPreApe(r) ? 1 : 0; return a
    }, {})).sort((a, b) => b[1].n - a[1].n)
    return (
      <>
        <div className="dt-drillhd">
          {rd.iid != null && <><EntityIdentityChip type="institution" id={rd.iid} name={label(rd)} variant="name" className="dt-ent" /><Link to={cieloHref({ star: rd.iid })}>{L('ver en El Mapa →', 'see it in El Mapa →')}</Link></>}
          <span><b>{num(rd.n, lang)}</b> {L('contratos en', 'contracts in')} <b>{by.length}</b> {L('fallos distintos', 'distinct awards')} · {money(rd.v * 1e6, lang)}</span>
        </div>
        <ul className="dt-rows dates">
          <li className="hd"><span>{L('Fallo', 'Award')}</span><span className="m">{L('Contratos', 'Contracts')}</span><span className="m">{L('Monto', 'Amount')}</span><span className="dt-hm m">{L('Mediana días antes', 'Median days before')}</span><span className="dt-hm m">{L('Antes de la apertura', 'Before bids opened')}</span></li>
          {by.slice(0, 12).map(([d, s]) => (
            <li key={d}>
              <span><button type="button" className="ink" onClick={() => open([rd.k, d])}>{fdate(d, lang)}</button></span>
              <span className="m"><b>{num(s.n, lang)}</b></span><span className="m">{formatCompactMXN(s.v * 1e6)}</span>
              <span className="dt-hm m">{-(median(s.d) ?? 0)}</span><span className={`dt-hm m${s.red ? ' dt-seal' : ''}`}>{s.red || '—'}</span>
            </li>
          ))}
        </ul>
      </>
    )
  }

  if (!lead) return null
  const oneIn = Math.round(1 / F.lead_proc_rate)
  return (
    <Chapter id="fallo" level={level} lang={lang}
      kicker={L('Capítulo · Empezó antes del fallo', 'Chapter · Work began before the award')} source="ComprasMX 2025–2026"
      h={head.h1} meta={head.meta}
      verdict={{ read: pct(F.lead_proc_rate, lang, 1), lvl: L(`de los concursos de la ${F.lead_k}`, `of ${F.lead_k} tenders`), tier: `${num(F.lead_proc, lang)} ${L('de', 'of')} ${num(F.lead_pop_proc, lang)} · APF ${pct(F.proc_rate, lang, 1)}`,
        lede: F.lead_k === 'SEDENA'
          ? (en ? <>On the base the work is already under way — uniforms, boots, medicines — and the paper naming the winner arrives days later. How often? One in {oneIn === 10 ? 'ten' : num(oneIn, lang)} Army tenders. And in <b>{num(F.pre_ape, lang)}</b> contracts, in red, the work started <b>before anyone could bid</b>. Starting early proves nothing on its own: it is a calendar risk indicator.</>
            : <>En el cuartel el trabajo ya corre —uniformes, botas, medicinas— y el papel que dice quién ganó llega días después. ¿Cuántas veces? Uno de cada {oneIn === 10 ? 'diez' : num(oneIn, lang)} concursos del Ejército. Y en <b>{num(F.pre_ape, lang)}</b> contratos, en rojo, el trabajo arrancó <b>antes de que alguien pudiera ofertar</b>. Empezar antes no prueba nada por sí solo: es un indicador de riesgo del calendario.</>)
          : (en ? <>The work starts, and the paper naming the winner arrives days later. In <b>{num(F.pre_ape, lang)}</b> contracts, in red, it started <b>before anyone could bid</b>. Starting early proves nothing on its own: it is a calendar risk indicator.</>
            : <>El trabajo arranca y el papel que dice quién ganó llega días después. En <b>{num(F.pre_ape, lang)}</b> contratos, en rojo, arrancó <b>antes de que alguien pudiera ofertar</b>. Empezar antes no prueba nada por sí solo: es un indicador de riesgo del calendario.</>) }}
      cifras={[
        { n: `${num(F.lead_proc, lang)} ${L('de', 'of')} ${num(F.lead_pop_proc, lang)}`, t: L(`concursos de la ${F.lead_k} empezaron antes del fallo: ${num(F.lead_n, lang)} contratos; tres fallos concentran ${num(sedDatesN, lang)}`, `${F.lead_k} tenders started before the award: ${num(F.lead_n, lang)} contracts; three award dates hold ${num(sedDatesN, lang)}`) },
        { n: num(F.n, lang), t: L(`contratos con concurso en toda la APF empezaron antes del fallo (${num(F.procs, lang)} concursos, ${pct(F.proc_rate, lang, 1)} de ${num(m.pop_proc, lang)}) · ${money(F.v * 1e6, lang)}`, `competitive contracts across the federal government started before the award (${num(F.procs, lang)} tenders, ${pct(F.proc_rate, lang, 1)} of ${num(m.pop_proc, lang)}) · ${money(F.v * 1e6, lang)}`) },
        ...(F.iss_n ? [{ n: money(F.iss_v * 1e6, lang), t: L(`del ISSSTE, ${pct(F.iss_share, lang)} del dinero: ${num(F.iss_n, lang)} contratos${F.iss_jan_fallo ? `, ${num(F.iss_jan, lang)} empezaron el 1 de enero con fallo del ${fdate(F.iss_jan_fallo, lang)}` : ''}`, `at ISSSTE, ${pct(F.iss_share, lang)} of the money: ${num(F.iss_n, lang)} contracts${F.iss_jan_fallo ? `, ${num(F.iss_jan, lang)} started on 1 January with the award on ${fdate(F.iss_jan_fallo, lang)}` : ''}`) }] : []),
        { n: num(F.pre_ape, lang), seal: true, t: L(`empezaron antes de la apertura de propuestas · ${money(F.pre_ape_v * 1e6, lang)} · ${num(F.pre_pub, lang)} antes de publicarse`, `started before bids were opened · ${money(F.pre_ape_v * 1e6, lang)} · ${num(F.pre_pub, lang)} before the call was published`) },
        { n: num(F.within7, lang), t: L(`(${pct(F.within7 / F.n, lang)}) empezaron en la semana previa al fallo; mediana ${F.medDays} días`, `(${pct(F.within7 / F.n, lang)}) started in the week before the award; median ${F.medDays} days`) },
      ]}
      graphic={<div className="dt-graphic" ref={ref}>{svg?.el}{svg && <RowHits rows={svg.hits} H={svg.H} pressed={rd.k} onOpen={(k) => open([k])} label={L('Abrir el expediente de una fila', 'Open a row')} />}</div>}
      caption={en
        ? <><b>Rows</b> = the 7 institutions with most contracts, and the rest · <b>x</b> = days between the contract's start and the award (more than 45 days: folded left) · <b>area</b> ∝ amount · <b>red</b> = started before bids were opened · <b>dotted</b> = median publication ({m.med.pub} d) and bid opening ({m.med.ape} d) of the {num(m.pop_n, lang)}; the median signature comes {m.med.fir} days <em>after</em> the award. Each row is a button: it opens its award dates and contracts.</>
        : <><b>Filas</b> = las 7 instituciones con más contratos y el resto · <b>x</b> = días entre el inicio del contrato y el fallo (los de más de 45 días, a la izquierda) · <b>área</b> ∝ monto · <b>rojo</b> = empezó antes de la apertura de propuestas · <b>punteadas</b> = publicación ({m.med.pub} d) y apertura ({m.med.ape} d) medianas de los {num(m.pop_n, lang)}; la firma mediana llega {m.med.fir} días <em>después</em> del fallo. Cada fila es un botón: abre sus fallos y contratos.</>}
      railK={L('§ el calendario', '§ the calendar')} claims={claims}
      drillTitle={L('El expediente', 'The file')} drillK={L('§ institución → fallos en lote → contratos → proveedor', '§ institution → batch awards → contracts → supplier')}
      stack={stack} onCrumb={(i) => open(keys.slice(0, i + 1))} drill={drill} focusTick={tick}
      notes={L(`Universo: contratos de la APF con licitación pública o invitación a cuando menos tres, con fecha de fallo y de inicio, en ComprasMX 2025–2026 (${num(m.pop_n, lang)} contratos, ${num(m.pop_proc, lang)} concursos). Las horas se leen como UTC y se restan 6 horas antes de tomar la fecha. ${num(m.signed_before_fallo, lang)} aparecen firmados antes del fallo, probable error de captura; ${num(m.jan1_n, lang)} empiezan el 1 de enero (continuidad y compras consolidadas tardías). La lectura legal (LAASSP art. 46) no se ha verificado contra el texto de 2025. Montos de más de 100,000 MDP excluidos. Las personas físicas se nombran como las publica ComprasMX, marcadas «persona física»; su RFC no se publica.`,
        `Universe: federal (APF) contracts by public tender or invitation to at least three, with an award and a start date, in ComprasMX 2025–2026 (${num(m.pop_n, lang)} contracts, ${num(m.pop_proc, lang)} tenders). Stamps are read as UTC and shifted 6 hours before taking the date. ${num(m.signed_before_fallo, lang)} appear signed before the award, a likely data-entry error; ${num(m.jan1_n, lang)} start on 1 January (continuity services and late consolidated purchases). The legal reading (LAASSP art. 46) has not been checked against the 2025 text. Amounts above 100,000 M MXN excluded. Individuals (personas físicas) are named as ComprasMX publishes them and labelled «individual»; their RFC is never published.`)}
    />
  )
}
