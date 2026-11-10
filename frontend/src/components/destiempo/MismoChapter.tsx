/**
 * Chapter «El mismo día» — «La pared del tope»: every same-day lot a dot on how close its largest piece sits to the
 * PEF cap, one row per buyer; the cap is a wall, red = within 2%. Drill (hash `#mismo-dia:<buyer>:v<i>:<fecha>`):
 * buyer → vendor → day → contracts. Personas físicas are named as CompraNet publishes them and labelled «persona física»
 * (the hash holds a vendor INDEX, never an id). Concept: src/common.js buildMismo().
 */
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { fdate } from '@/components/newtabs/ntShared'
import { formatCompactMXN } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import { MAYPO, SEAL, byVendor, hash, nearCap, ratio, sum, type MismoModel, type MismoRowDef, type VendorAgg } from '@/lib/destiempo/model'
import { mismoHead, mismoLectura, money, n1, num, pct, pesos, pfLabel, vn, type Lang } from '@/lib/destiempo/lectura'
import { Chapter, More, RowHits, isPhoneW, useHashDrill, type Level } from './Chapter'
import { CAPTURA_TITLE } from '@/lib/captura/title'

const XMIN = 0.5

export function MismoChapter({ M, lang, level }: { M: MismoModel; lang: Lang; level: 1 | 2 }) {
  const en = lang === 'en', L = (es: string, e: string) => (en ? e : es)
  const { F, meta, rowDefs } = M
  const ref = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(ref)
  const phone = isPhoneW(W)
  const [hashKeys, setHash] = useHashDrill('mismo-dia')
  const [tick, setTick] = useState(0)
  const label = (rd: MismoRowDef) => (rd.k === 'otros' ? L(`otros ${M.restBuyers} compradores`, `${M.restBuyers} other buyers`) : rd.label)
  const vlabel = (v: VendorAgg) => (!v.v ? (v.pf ? L('persona física', 'individual') : L('sin nombre en el registro', 'no name in the register')) : vn(v.v, 30) + (v.pf ? pfLabel(lang) : ''))
  const open = (k: string[]) => { setHash(k); setTick((t) => t + 1) }

  // default (no hash): IMSS's vendors — the lead lot's firm heads the list
  const imss = rowDefs.find((r) => r.k === 'imss') ?? rowDefs[0]
  const defKeys = [imss.k]
  const keys = hashKeys && rowDefs.some((r) => r.k === hashKeys[0]) ? hashKeys : defKeys
  const rd = rowDefs.find((r) => r.k === keys[0])!
  const vs = useMemo(() => byVendor(rd.rows), [rd])
  const vi = keys[1] && /^v\d+$/.test(keys[1]) ? +keys[1].slice(1) : -1
  const vv = vs[vi]
  const lot = vv && keys[2] ? vv.rows.find((r) => r.contract_date === keys[2]) : undefined
  const stack: Level[] = [{ key: rd.k, label: label(rd) }, ...(vv ? [{ key: `v${vi}`, label: vlabel(vv) }] : []), ...(vv && lot ? [{ key: lot.contract_date, label: `${fdate(lot.contract_date, lang)} · ${lot.n} ${L('piezas', 'pieces')}` }] : [])]

  const head = mismoHead(M, lang), claims = mismoLectura(M, lang)

  const svg = useMemo(() => {
    if (!W) return null
    const Lm = phone ? 0 : 196, Rm = phone ? 22 : 26, FOLD = phone ? 20 : 30, span = W - Lm - Rm - FOLD
    const x = (q: number) => Lm + FOLD + ((q - XMIN) / (1 - XMIN)) * span
    const RH = phone ? 40 : 46, TOP = 50, H = TOP + rowDefs.length * RH + 8, PAD = phone ? 17 : 4
    const qs = [0.5, 0.6, 0.7, 0.8, 0.9, 1]
    const hits = rowDefs.map((r, j) => ({ key: r.k, y0: TOP + j * RH, h: RH, name: L(`${label(r)}: ${num(r.rows.length, lang)} lotes, abrir sus empresas`, `${label(r)}: ${num(r.rows.length, lang)} lots, open its vendors`) }))
    return { H, hits, el: (
      <svg className="dt-g" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={L('Cada lote, un punto según qué tan cerca del tope quedó su pieza mayor, por comprador', 'Each lot, a dot by how close its largest piece sits to the cap, by buyer')}>
        {qs.map((q) => (
          <g key={q}>
            <line className="axis" x1={x(q)} y1={TOP - 6} x2={x(q)} y2={H - 8} />
            {q < 1 && !(phone && q < 0.55) && <text className="yr" x={x(q)} y={TOP - 12} textAnchor="middle">{`${Math.round(q * 100)}%`}</text>}
          </g>
        ))}
        <text className="yr" x={phone ? 0 : Lm + FOLD / 2} y={TOP - 12} textAnchor={phone ? 'start' : 'middle'}>{'< 50'}</text>
        <rect className="wall" x={x(0.98)} y={TOP - 6} width={x(1) - x(0.98)} height={H - TOP - 2} />
        <line className="cut" x1={x(1)} y1={TOP - 34} x2={x(1)} y2={H - 8} strokeWidth={2} />
        <text className="ch" x={x(1) - 5} y={TOP - 34} textAnchor="end">{L('tope mínimo PEF', 'lowest PEF cap')}</text>
        <text className="yr" x={x(1) - 4} y={TOP - 12} textAnchor="end">{'100%'}</text>
        {rowDefs.map((r, j) => {
          const y0 = TOP + j * RH, mid = y0 + RH / 2, nr = r.rows.filter(nearCap).length
          const lab = phone ? label(r).replace(' · Alim. Bienestar', ' · AB') : label(r)
          return (
            <g key={r.k}>
              {j > 0 && <line className="axis" x1={Lm} y1={y0} x2={W - Rm} y2={y0} />}
              {phone ? (
                <><text className="lanek" x={2} y={y0 + 11} style={{ fill: r.color, fontSize: 12 }}>{lab}</text>
                  <text className="lanem" x={W - Rm} y={y0 + 11} textAnchor="end" style={nr ? { fill: SEAL } : undefined}>{`${num(r.rows.length, lang)} ${L('lotes', 'lots')} · ${nr} ${L('al tope', 'at the cap')}`}</text></>
              ) : (
                <><text className="lanek" x={0} y={mid - 9} style={{ fill: r.color }}>{lab}</text>
                  <text className="lanem" x={0} y={mid + 4}>{`${num(r.rows.length, lang)} ${L('lotes', 'lots')} · ${num(sum(r.rows.map((l) => l.n)), lang)} ${L('piezas', 'pieces')}`}</text>
                  <text className="lanem" x={0} y={mid + 17} style={nr ? { fill: SEAL, fontWeight: 700 } : undefined}>{`${nr} ${L('al tope', 'at the cap')}`}</text></>
              )}
              <g className="dots">
                {r.rows.map((l, k) => ({ l, k })).sort((a, b) => Number(nearCap(a.l)) - Number(nearCap(b.l))).map(({ l, k }) => {
                  const q = ratio(l), red = nearCap(l)
                  const cx = q < XMIN ? Lm + FOLD / 2 + (hash(k) - 0.5) * FOLD * 0.6 : x(q)
                  const rr = Math.min(phone ? 5 : 7, 1.3 + 0.33 * Math.sqrt(l.n))
                  const cy = y0 + PAD + rr + hash(k * 3 + 2) * (RH - PAD - 4 - 2 * rr)
                  return (
                    <circle key={k} cx={cx} cy={cy} r={rr} className={red ? 'crit' : undefined} strokeWidth={red ? 1 : 0} style={{ fill: red ? SEAL : r.color, fillOpacity: red ? 0.95 : 0.5 }}>
                      <title>{`${fdate(l.contract_date, lang)} · ${l.siglas || ''} → ${l.vendor_name ? vn(l.vendor_name, 50) : L('sin nombre en el registro', 'no name in the register')}${l.is_pf ? pfLabel(lang) : ''} · ${n1(l.n, L('contrato directo', 'no-bid contract'), L('contratos directos', 'no-bid contracts'), lang)} · ${L('suma', 'total')} ${pesos(l.sum_mxn, lang)} · ${L('pieza mayor', 'largest piece')} ${pesos(l.max_mxn, lang)} = ${pct(q, lang, 1)} ${L('del tope', 'of the cap')} ${pesos(l.low_cap_mxn, lang)}`}</title>
                    </circle>
                  )
                })}
              </g>
            </g>
          )
        })}
      </svg>
    ) }
  }, [W, phone, en, rowDefs, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const drill = (fit: number) => {
    if (vv && lot) {
      return (
        <>
          <div className="dt-drillhd">
            <span><b>{vlabel(vv)}</b> · {lot.siglas || ''} · {fdate(lot.contract_date, lang)} · {L(`${lot.n} contratos directos, cada uno bajo el tope mínimo ${pesos(lot.low_cap_mxn, lang)} (PEF ${lot.year}); juntos ${pesos(lot.sum_mxn, lang)}, ${(lot.sum_mxn / lot.high_cap_mxn).toFixed(2)} veces el tope máximo ${pesos(lot.high_cap_mxn, lang)}`, `${lot.n} no-bid contracts, each under the lowest cap ${pesos(lot.low_cap_mxn, lang)} (PEF ${lot.year}); together ${pesos(lot.sum_mxn, lang)}, ${(lot.sum_mxn / lot.high_cap_mxn).toFixed(2)} times the highest cap ${pesos(lot.high_cap_mxn, lang)}`)}</span>
            <span className="dt-seal">{L('patrón compatible con fraccionamiento: indicio, no conclusión', 'pattern consistent with splitting: a lead, not a conclusion')}</span>
          </div>
          <p className="dt-ids">
            {lot.contract_ids.map((id) => <Link key={id} to={`/contracts/${id}`}>{id}</Link>)}
          </p>
        </>
      )
    }
    if (vv) {
      const rows = [...vv.rows].sort((a, b) => b.contract_date.localeCompare(a.contract_date))
      return (
        <>
          <div className="dt-drillhd">
            {vv.vid != null && vv.v && <span><EntityIdentityChip type="vendor" id={vv.vid} name={vv.v} variant="name" className="dt-ent" />{vv.pf && <span className="dt-pf">{pfLabel(lang)}</span>}</span>}
            <Link to="/captura">{L(`${CAPTURA_TITLE.es} →`, `${CAPTURA_TITLE.en} →`)}</Link>
            {vv.vid === MAYPO.vid ? <Link to={`/aria/caso/${MAYPO.vid}`}>{L('su caso en Focos Rojos →', 'its Red Flags case →')}</Link> : <Link to="/aria">{L('Focos Rojos →', 'Red Flags →')}</Link>}
            <span><b>{num(vv.lots, lang)}</b> {L('días', 'days')} · <b>{num(vv.pieces, lang)}</b> {L('contratos', 'contracts')} · {money(vv.s, lang)} · {vv.yrs.join(', ')}</span>
          </div>
          <ul className="dt-rows lots">
            <li className="hd"><span>{L('Día', 'Day')}</span><span className="m">{L('Piezas', 'Pieces')}</span><span className="m">{L('Suma', 'Total')}</span><span className="m">{L('Pieza mayor', 'Largest')}</span><span className="m">{L('% del tope', '% of cap')}</span><span className="dt-hm m">{L('× tope máx.', '× top cap')}</span></li>
            {rows.slice(0, fit).map((r) => (
              <li key={r.contract_date + r.cls} className={nearCap(r) ? 'is-crit' : undefined}>
                <span><button type="button" className="ink" onClick={() => open([rd.k, `v${vi}`, r.contract_date])}>{fdate(r.contract_date, lang)}</button></span>
                <span className="m">{r.n}</span><span className="m">{formatCompactMXN(r.sum_mxn)}</span><span className="m">{pesos(r.max_mxn, lang)}</span>
                <span className={`m${nearCap(r) ? ' dt-seal' : ''}`}><b>{pct(ratio(r), lang, 1)}</b></span><span className="dt-hm m">{(r.sum_mxn / r.high_cap_mxn).toFixed(2)}</span>
              </li>
            ))}
            <More n={rows.length - fit} to="/antes-del-fallo?vista=lista#mismo-dia" lang={lang} />
          </ul>
        </>
      )
    }
    return (
      <>
        <div className="dt-drillhd">
          {rd.iid != null && <><EntityIdentityChip type="institution" id={rd.iid} name={rd.rows.find((r) => r.institution_id === rd.iid)?.institution_name ?? label(rd)} variant="name" className="dt-ent" /><Link to={cieloHref({ star: rd.iid })}>{L('ver en El Mapa →', 'see it in El Mapa →')}</Link></>}
          <span><b>{num(rd.rows.length, lang)}</b> {L('lotes', 'lots')} · <b>{num(vs.length, lang)}</b> {L('empresas', 'vendors')} · {num(rd.rows.filter(nearCap).length, lang)} {L('con la pieza mayor a ≤ 2% del tope', 'with the largest piece within 2% of the cap')}</span>
        </div>
        <ul className="dt-rows vs">
          <li className="hd"><span>{L('Empresa', 'Vendor')}</span><span className="m">{L('Días', 'Days')}</span><span className="m">{phone ? L('Contr.', 'Contr.') : L('Contratos', 'Contracts')}</span><span className="m">{phone ? 'MDP' : L('Monto', 'Amount')}</span><span className="m">{L('Al tope', 'At cap')}</span><span className="dt-hm">{L('Años', 'Years')}</span></li>
          {vs.slice(0, fit).map((v, i) => (
            <li key={v.key}>
              <span className="who"><button type="button" className="ink dt-ent" onClick={() => open([rd.k, `v${i}`])}>{v.v ? vn(v.v, 60) : vlabel(v)}</button>{v.pf && <span className="dt-pf">{pfLabel(lang)}</span>}{v.soe && <small>{L('empresa pública', 'state company')}</small>}</span>
              <span className="m"><b>{num(v.lots, lang)}</b></span><span className="m">{num(v.pieces, lang)}</span><span className="m">{formatCompactMXN(v.s)}</span>
              <span className={`m${v.near ? ' dt-seal' : ''}`}>{v.near || '—'}</span><span className="dt-hm dt-mono">{v.yrs.map((y) => String(y).slice(2)).join(' ')}</span>
            </li>
          ))}
          {vs.length > fit && <li><span className="dt-more">{num(vs.length - fit, lang)} {L('más', 'more')}</span></li>}
        </ul>
      </>
    )
  }

  const y0 = F.y_first, by25 = F.y2025, by24 = F.y2024
  return (
    <Chapter id="mismo-dia" level={level} lang={lang}
      kicker={L('Capítulo · El mismo día', 'Chapter · The same day')} source={L('CompraNet 2019–2025 · PEF Anexo 9', 'CompraNet 2019–2025 · PEF Annex 9')}
      h={head.h1} meta={head.meta}
      verdict={{ read: num(F.near, lang), seal: true, lvl: L('lotes con la pieza mayor a 2% del tope o menos', 'lots with the largest piece within 2% of the cap'), tier: `${num(F.n95, lang)} ${L('a 5%', 'within 5%')} · ${num(F.n90, lang)} ${L('a 10%', 'within 10%')}`,
        lede: en
          ? <>One day a supplier receives contract after contract from a federal buyer, every one under the cap that allows buying without a tender{F.lead_above.length ? '; one more, that same day, goes over it' : ''}. Each lot is a lead, not a conclusion: fictitious caps yield almost as many lots, so the legal cap does not stand out in the count. What does stand out is <b>who</b> grazes it, and how often.</>
          : <>Un día, un proveedor recibe de un comprador federal un contrato tras otro, todos por debajo del tope que permite comprar sin concurso{F.lead_above.length ? '; uno más, ese mismo día, lo pasa' : ''}. Cada lote es un indicio, no una conclusión: con topes ficticios salen casi tantos lotes, así que el tope legal no destaca en la cuenta. Lo que sí destaca es <b>quién</b> lo roza y cuántas veces.</> }}
      cifras={[
        { n: num(F.n, lang), t: L(`lotes del mismo día, 2019–2025: ${num(meta.contracts, lang)} contratos directos bajo el tope, ${num(meta.vendors, lang)} empresas, ${num(meta.institutions, lang)} compradores${meta.apf_buyers ? ` de ${num(meta.apf_buyers, lang)}` : ''}`, `same-day lots, 2019–2025: ${num(meta.contracts, lang)} no-bid contracts under the cap, ${num(meta.vendors, lang)} firms, ${num(meta.institutions, lang)} buyers${meta.apf_buyers ? ` out of ${num(meta.apf_buyers, lang)}` : ''}`) },
        { n: num(F.near, lang), seal: true, t: L(`lotes con la pieza mayor a ≤ 2% del tope; mediana de todos: ${pct(F.med_ratio, lang)} del tope`, `lots with the largest piece within 2% of the cap; median of all: ${pct(F.med_ratio, lang)} of the cap`) },
        ...(F.topV ? [{ n: num(F.topV.lots, lang), t: L(`días en que ${F.topVBuyer} dio contratos directos a ${vn(F.topV.v, 30)}: ${num(F.topV.pieces, lang)} contratos, ${money(F.topV.s, lang)}, ${F.topV.near} al tope`, `days on which ${F.topVBuyer} gave no-bid contracts to ${vn(F.topV.v, 30)}: ${num(F.topV.pieces, lang)} contracts, ${money(F.topV.s, lang)}, ${F.topV.near} at the cap`) }] : []),
        ...(F.maypo ? [{ n: num(F.maypo.lots, lang), t: L(`días del IMSS con ${vn(F.maypo.v, 30)}: ${num(F.maypo.pieces, lang)} contratos, ${F.maypo.near} al tope — la empresa que Focos Rojos ya sigue`, `IMSS days with ${vn(F.maypo.v, 30)}: ${num(F.maypo.pieces, lang)} contracts, ${F.maypo.near} at the cap — the firm Red Flags already follows`) }] : []),
        { n: num(F.cur_n, lang), t: L(`lotes en 2024–2025 (${F.cur_near} al tope, ${F.cur_v} empresas con nombre)${y0 && by24 && by25 ? `: la cuenta cayó de ${num(y0.n, lang)} en ${y0.y} a ${num(by24.n, lang)} y ${num(by25.n, lang)}` : ''}`, `lots in 2024–2025 (${F.cur_near} at the cap, ${F.cur_v} named firms)${y0 && by24 && by25 ? `: the count fell from ${num(y0.n, lang)} in ${y0.y} to ${num(by24.n, lang)} and ${num(by25.n, lang)}` : ''}`) },
      ]}
      graphic={<div className="dt-graphic" ref={ref}>{svg?.el}{svg && <RowHits rows={svg.hits} H={svg.H} pressed={rd.k} onOpen={(k) => open([k])} label={L('Abrir el expediente de una fila', 'Open a row')} />}</div>}
      caption={en
        ? <><b>Rows</b> = buyers · <b>x</b> = the lot's largest contract as % of its year's lowest direct-award cap (PEF Annex 9, LAASSP; lots under 50% folded left) · <b>area</b> ∝ contracts in the lot · <b>red</b> = within 2% of the cap · the line is the cap. Each row is a button: it opens its vendors → their days → the contracts.</>
        : <><b>Filas</b> = compradores · <b>x</b> = contrato mayor del lote como % del tope mínimo de adjudicación directa de su año (PEF Anexo 9, LAASSP; los lotes bajo 50%, a la izquierda) · <b>área</b> ∝ contratos del lote · <b>rojo</b> = a 2% del tope o menos · la raya es el tope. Cada fila es un botón: abre sus empresas → sus días → los contratos.</>}
      railK={L('§ quién roza el tope', '§ who grazes the cap')} claims={claims}
      drillTitle={L('El lote', 'The lot')} drillK={L('§ comprador → empresa → día → contratos', '§ buyer → vendor → day → contracts')}
      stack={stack} onCrumb={(i) => open(keys.slice(0, i + 1))} drill={drill} focusTick={tick}
      notes={L(`Universo: adjudicaciones directas con monto válido de CompraNet, 2019–2025, de compradores federales de la APF; se excluyen órganos autónomos, judiciales y legislativos, Pemex, CFE y universidades autónomas. Un lote agrupa piezas bajo el tope mínimo de su año por institución × empresa × día × régimen, con 2 piezas o más y suma mayor al tope máximo × 1.16. El comprador es toda la institución: la mayor fuente de falsos positivos. La LAASSP (art. 42 hasta abril de 2025, art. 55 desde entonces) prohíbe fraccionar; el texto del DOF no está transcrito aquí. Personas físicas (${num(meta.n_pf_lots, lang)} lotes) nombradas como las publica CompraNet, marcadas «persona física»; su RFC no se publica. Nunca se suma un total en pesos «fraccionado».`,
        `Universe: CompraNet direct awards with a valid amount, 2019–2025, from federal (APF) buyers; autonomous, judicial and legislative bodies, Pemex, CFE and autonomous universities are excluded. A lot groups pieces under their year's lowest cap by institution × vendor × day × schedule, with 2 pieces or more and a total above the highest cap × 1.16. The buyer is the whole institution: the largest source of false positives. LAASSP (art. 42 until April 2025, art. 55 since) forbids splitting; the DOF wording is not transcribed here. Individuals (${num(meta.n_pf_lots, lang)} lots) are named as CompraNet publishes them and labelled «individual»; their RFC is never published. No «split» peso total is ever summed.`)}
    />
  )
}
