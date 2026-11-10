/**
 * «El arranque» — the narrow version (docs/patrones_verdicts/SUMMARY.md, 2026-11-04: SAVE, narrow). One finding:
 * firms under a year old at their first contract that took ≥ 90% of their first-year money by direct award (from
 * 2019, when the age is known for almost every firm; APP special-purpose companies excluded). The sky keeps every
 * firm as a grey-to-brown dot in the year of its first contract; the finding is red. No cohort or sexenio
 * comparison (confounded: the no-bid share of all CompraNet rose too). The drill is the list of the finding.
 */
import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { fdate } from '@/components/newtabs/ntShared'
import { formatCompactMXN } from '@/lib/utils'
import { CAT, CRIT_FROM, OTHER, SEAL, YEARS, critical, hash, young, type ArranqueModel, type ArrRow, type Bucket } from '@/lib/destiempo/model'
import { arranqueHead, arranqueLectura, money, n1, num, pctA, vn, type Lang } from '@/lib/destiempo/lectura'
import { Chapter, More, isPhoneW } from './Chapter'

export const bucketLabel = (b: Bucket, en: boolean) =>
  ({ lt180: en ? 'under 6 months' : 'menos de 6 meses', lt365: en ? 'under 1 year' : 'menos de 1 año', lt5y: en ? '1–5 years' : '1–5 años', ge5y: en ? '5 years or more' : '5 años o más', before: en ? 'RFC after the contract' : 'RFC posterior' } as Record<string, string>)[b ?? ''] ?? '—'
const colorOf = (r: ArrRow) => (critical(r) ? SEAL : r.incorp_bucket === 'ge5y' ? CAT[0] : r.incorp_bucket === 'lt5y' ? CAT[1] : young(r) ? CAT[2] : OTHER)

export function ArranqueChapter({ M, lang }: { M: ArranqueModel; lang: Lang }) {
  const en = lang === 'en', L = (es: string, e: string) => (en ? e : es)
  const { F, co, meta } = M
  const ref = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(ref)
  const phone = isPhoneW(W)
  const head = arranqueHead(M, lang), claims = arranqueLectura(M, lang)

  const svg = useMemo(() => {
    if (!W) return null
    const Lm = phone ? 50 : en ? 76 : 56, Rm = phone ? 4 : 16, span = W - Lm - Rm, cw = span / YEARS.length
    const X = (i: number) => Lm + i * cw, XM = (i: number) => X(i) + cw / 2
    const TOP = phone ? 16 : 20, RIB = phone ? 200 : 236, yAx = TOP + RIB, H = yAx + 24
    const lo = 2, hi = Math.log10(32000), Y = (m: number) => yAx - ((Math.log10(Math.max(100, m)) - lo) / (hi - lo)) * RIB
    const dots = co.flatMap((cc, i) => cc.rows.map((r) => ({ r, cx: XM(i) + (hash(r.vendor_id ?? r.first_contract_id) - 0.5) * cw * 0.84, cy: Y(r.y1_mxn / 1e6) })))
      .sort((a, b) => Number(critical(a.r)) - Number(critical(b.r)))
    return (
      <svg className="dt-g" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={L('Cada empresa, un punto en el año de su primer contrato; altura = dinero del primer año', 'Each firm, a dot in the year of its first contract; height = first-year money')}>
        <rect className="chap" x={Lm} y={TOP} width={span} height={RIB} />
        {[100, 1000, 10000].map((v) => (
          <g key={v}>
            <line className={v === 100 ? 'cut' : 'axis'} x1={Lm} y1={Y(v)} x2={W - Rm} y2={Y(v)} strokeDasharray={v === 100 ? undefined : '2 3'} />
            <text className="yr" x={Lm - 4} y={Y(v) + 4} textAnchor="end">{phone ? (v === 10000 ? L('10 mil', '10k') : num(v, lang)) : v === 100 ? `100 ${L('MDP', 'M MXN')}` : num(v, lang)}</text>
          </g>
        ))}
        {!phone && <text className="chf" x={Lm - 4} y={Y(100) + 16} textAnchor="end">{L('piso', 'floor')}</text>}
        {co.map((cc, i) => <text key={cc.y} className="yr" x={XM(i)} y={yAx + 14} textAnchor="middle">{phone ? String(cc.y).slice(2) : cc.y}</text>)}
        <g className="dots">
          {dots.map(({ r, cx, cy }, k) => {
            const isC = critical(r)
            return (
              <circle key={k} cx={cx} cy={cy} r={isC ? (phone ? 4 : 5.5) : phone ? 2 : 2.6} className={isC ? 'crit' : undefined} strokeWidth={isC ? 1.5 : r.flag_10b ? 1 : 0}
                style={{ fill: colorOf(r), fillOpacity: isC ? 1 : 0.45, stroke: isC ? undefined : r.flag_10b ? 'var(--color-text-primary)' : undefined }}>
                <title>{`${vn(r.vendor_name, 60) || L('sin nombre en el registro', 'no name in the register')} · ${L('primer contrato', 'first contract')} ${fdate(r.first_date, lang)} · ${money(r.y1_mxn, lang)} ${L('en el primer año', 'in the first year')} (${n1(r.y1_n, L('contrato', 'contract'), L('contratos', 'contracts'), lang)}, ${L('directa', 'no-bid')} ${pctA(r.y1_da_share, lang)})${r.incorp_bucket ? ' · ' + bucketLabel(r.incorp_bucket, en) : ''}`}</title>
              </circle>
            )
          })}
        </g>
      </svg>
    )
  }, [W, phone, en, co, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = F.crit
  const drill = (fit: number) => (
    <>
      <div className="dt-drillhd">
        <span><b>{num(rows.length, lang)}</b> {L(`empresas desde ${CRIT_FROM} · menos de un año al firmar · 90% o más por adjudicación directa`, `firms since ${CRIT_FROM} · under a year old when they signed · 90% or more by direct award`)} · {money(F.crit_m, lang)}</span>
      </div>
      <ul className="dt-rows arr">
        <li className="hd"><span>{L('Empresa', 'Firm')}</span><span className="dt-hm">{L('Primer contrato', 'First contract')}</span><span className="m">{phone ? L('Monto', 'Amount') : L('Primer año', 'First year')}</span><span className="m">{phone ? L('Contr.', 'Contr.') : L('Contratos', 'Contracts')}</span><span className="m">{phone ? L('Dir.', 'No-bid') : L('Directa', 'No-bid')}</span><span className="dt-hm">{L('Antigüedad', 'Age')}</span></li>
        {rows.slice(0, fit).map((r) => (
          <li key={r.first_contract_id} className="is-crit">
            <span className="who">{r.vendor_id != null && r.vendor_name ? <EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor_name} variant="name" className="dt-ent" /> : <span className="dt-mono">{L('sin nombre en el registro', 'no name in the register')}</span>}</span>
            <span className="dt-hm"><Link to={`/contracts/${r.first_contract_id}`}>{fdate(r.first_date, lang)}</Link></span>
            <span className="m"><b>{formatCompactMXN(r.y1_mxn)}</b>{r.flag_10b ? ' †' : ''}</span>
            <span className="m">{num(r.y1_n, lang)}</span>
            <span className="m b">{pctA(r.y1_da_share, lang)}</span>
            <span className="dt-hm dt-seal">{bucketLabel(r.incorp_bucket, en)}</span>
          </li>
        ))}
        <More n={rows.length - fit} to="/arranque?vista=lista" lang={lang} />
      </ul>
    </>
  )

  const sw = (col: string) => <i style={{ background: col }} />
  return (
    <Chapter id="arranque" level={1} lang={lang}
      h={head.h1} meta={head.meta}
      verdict={{ read: num(F.crit.length, lang), seal: true, lvl: L(`empresas desde ${CRIT_FROM}`, `firms since ${CRIT_FROM}`), tier: `${L('menos de un año de constituidas · ≥ 90% directa', 'under a year old · ≥ 90% no-bid')} · ${money(F.crit_m, lang)}`,
        lede: en
          ? <>A firm is born, and before its first birthday it is already receiving hundreds of millions from the federal government with no tender. It is the exception: the typical firm that arrives big is {F.med_years != null ? n1(Math.round(F.med_years), 'year', 'years', lang) : 'several years'} old. In red, the ones that were under a year old and received almost everything by direct award. Being new and big proves no wrongdoing: it is a risk indicator, and a reason to look at the record.</>
          : <>Una empresa nace, y antes de cumplir un año ya recibe cientos de millones del gobierno federal sin pasar por una licitación. Es la excepción: la empresa típica que llega grande tiene {F.med_years != null ? n1(Math.round(F.med_years), 'año', 'años', lang) : 'varios años'} de vida. En rojo, las que tenían menos de un año y recibieron casi todo por adjudicación directa. Ser nueva y grande no prueba una irregularidad: es un indicador de riesgo, y una razón para revisar el expediente.</> }}
      cifras={[
        { n: num(F.crit.length, lang), seal: true, t: L(`empresas desde ${CRIT_FROM} con menos de un año y ≥ 90% por adjudicación directa · ${money(F.crit_m, lang)} en su primer año; ${num(F.crit_lt180, lang)} tenían menos de seis meses`, `firms since ${CRIT_FROM} under a year old with ≥ 90% by direct award · ${money(F.crit_m, lang)} in their first year; ${num(F.crit_lt180, lang)} were under six months old`) },
        ...(F.med_years != null ? [{ n: n1(Math.round(F.med_years), L('año', 'year'), L('años', 'years'), lang), t: L(`de antigüedad mediana al firmar entre las ${num(meta.n, lang)} empresas que pasaron de 100 MDP en su primer año: las de rojo son la excepción`, `median age at signing among the ${num(meta.n, lang)} firms that passed 100 M MXN in their first year: the red ones are the exception`) }] : []),
      ]}
      graphic={<div className="dt-graphic" ref={ref}>{svg}</div>}
      caption={en
        ? <><b>x</b> = year of the first contract · <b>y</b> = first-year money (log scale, 100 M MXN floor) · <b>colour</b> = age at signing: {sw(CAT[0])} 5 years or more · {sw(CAT[1])} 1–5 years · {sw(CAT[2])} under 1 year · {sw(OTHER)} no company RFC · <b>red</b> = since {CRIT_FROM}, under 1 year and ≥ 90% no-bid · <b>ring</b> = includes a contract above 10,000 M MXN (†).</>
        : <><b>x</b> = año del primer contrato · <b>y</b> = dinero del primer año (escala log, piso 100 MDP) · <b>color</b> = antigüedad al firmar: {sw(CAT[0])} 5 años o más · {sw(CAT[1])} 1–5 años · {sw(CAT[2])} menos de 1 año · {sw(OTHER)} sin RFC de persona moral · <b>rojo</b> = desde {CRIT_FROM}, menos de 1 año y ≥ 90% directa · <b>aro</b> = incluye un contrato de más de 10,000 MDP (†).</>}
      railK={L('§ quién llega grande y nueva', '§ who arrives big and new')} claims={claims}
      drillTitle={L('La lista', 'The list')} drillK={L('§ empresa → primer contrato → expediente', '§ firm → first contract → file')}
      stack={[{ key: 'lista', label: L(`las ${num(rows.length, lang)}`, `the ${num(rows.length, lang)}`) }]} onCrumb={() => {}} drill={drill} focusTick={0}
      notes={L(`El primer contrato es el válido más antiguo en CompraNet, de 2011 en adelante; una empresa cuenta si los contratos de los 365 días siguientes suman 100 MDP o más (umbral estadístico, no legal). La antigüedad sale del RFC de persona moral (ni el RFC ni la fecha se publican); se conoce para 93% de las empresas desde 2019 y para 37% antes, por eso la cuenta empieza en 2019. Quedan fuera las sociedades de propósito específico que la ley de asociaciones público-privadas exige crear para un contrato (por ejemplo APP Arriaga–Tapachula o Consorcio Carretero Campeche–Mérida): nacen para ese contrato, así que su edad no dice nada. Personas físicas excluidas (${num(meta.n_persona_fisica, lang)}); ${num(meta.n_dropped_prior_name, lang)} reconstituciones por nombre y ${num(meta.n_public_dropped, lang)} organismos públicos quitados. Revisamos las empresas en rojo contra nuestras copias de la lista 69-B del SAT y de proveedores sancionados por la SFP (4 nov 2026): ninguna aparece. Es un piso: cuenta solo empresas con RFC utilizable. Esta página no compara gobiernos ni periodos.`,
        `The first contract is the earliest valid one in CompraNet, 2011 onward; a firm counts when the contracts of the next 365 days add up to 100 M MXN or more (a statistical threshold, not a legal one). Age comes from the company RFC (neither the RFC nor the date is published); it is known for 93% of the firms since 2019 and for 37% before, so the count starts in 2019. Special-purpose companies that the public-private partnership law requires to be created for one contract are left out (for example APP Arriaga–Tapachula or Consorcio Carretero Campeche–Mérida): they are born for that contract, so their age says nothing. Individuals excluded (${num(meta.n_persona_fisica, lang)}); ${num(meta.n_dropped_prior_name, lang)} re-incorporations by name and ${num(meta.n_public_dropped, lang)} public bodies dropped. We checked the red firms against our copies of the SAT 69-B list and of the SFP's sanctioned suppliers (Nov 4, 2026): none appears. It is a floor: it counts only firms with a usable RFC. This page compares no governments or periods.`)}
    />
  )
}
