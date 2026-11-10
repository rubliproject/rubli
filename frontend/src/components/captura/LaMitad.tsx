/**
 * «La mitad» — /captura's second finding (concept C, grafted under «El relevo»): five sexenio chapters,
 * each with its share of buyer-years (≥ 100 MDP of spend) where ONE company took ≥ 50% of the buyer's
 * spend, and one square per such buyer-year; then «Quién tiene la mitad hoy», the 2024–25 ledger.
 * Mayoría = the buyer depends on the company; dominante = the company depends on the buyer; the seal
 * «dominante» marks where both hold. Every square and every ledger buyer opens the dissection.
 * Data: GET /captura/majority (scripts/precompute_captura_majority.py).
 */
import { useRef } from 'react'
import type { CapturaMajority, MajorityRow } from '@/api/captura'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { rankNo } from '@/components/kit/ListRow'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { formatEntityName } from '@/lib/entity/format'
import { CHAPTERS, chapterOf } from '@/lib/captura/relevo'
import { money, num, pct, type Lang } from '@/lib/captura/lectura'
import { useDissect } from './dissect'

export const instLabel = (name: string | null | undefined, siglas: string | null | undefined) =>
  siglas || formatEntityName('institution', name ?? '—', 'full')

export function LaMitadDots({ d, lang }: { d: CapturaMajority; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const open = useDissect()
  const en = lang === 'en'
  const phone = width > 0 && width < 640
  const sz = phone ? 5 : 6, gap = 2, step = sz + gap
  const byChap = CHAPTERS.map((c) => ({ c, s: d.sex.find((x) => x.a === c.a), dots: d.dots.filter(([, y]) => y >= c.a && y <= c.b).sort((a, b) => a[1] - b[1] || b[2] - a[2]) }))
  const name = (id: number) => { const r = d.inst[String(id)]; return r ? instLabel(r[0], r[1]) : `#${id}` }
  const title = (t: CapturaMajority['dots'][number]) => `${name(t[0])} · ${t[1]} · ${pct(t[2], lang)}${t[3] === 'pf' ? (en ? ' · a natural person' : ' · persona física') : t[3] === 'pub' ? (en ? ' · a public body' : ' · entidad pública') : ''}${t[4] ? (en ? ' · dominant too' : ' · también dominante') : ''}`

  let body = null
  if (width > 0 && !phone) {
    const G = 16, colW = (width - G * 4) / 5, per = Math.max(1, Math.floor((colW - 8) / step))
    const rowsMax = Math.max(1, ...byChap.map((x) => Math.ceil(x.dots.length / per)))
    const T = 92, H = T + rowsMax * step + 22
    body = (
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" className="cr-mitad"
        aria-label={en ? 'Buyer-years where one company took half or more of the spend, by administration' : 'Compradores-año en que una sola empresa cobró la mitad o más del gasto, por sexenio'}>
        {byChap.map(({ c, s, dots }, i) => {
          const x = i * (colW + G)
          return (
            <g key={c.key}>
              <rect className={i % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={x} y={0} width={colW} height={H} />
              <line className="vd-exp-cut" x1={x + 0.5} y1={2} x2={x + 0.5} y2={18} />
              <text className="vd-exp-ch" x={x + 6} y={14}>{c.name}</text>
              {s && s.buyer_years > 0 && <>
                <text className="cr-pc" x={x + 6} y={44} style={{ fill: c.color }}>{pct(s.half / s.buyer_years, lang)}</text>
                <text className="vd-exp-chf" x={x + 6} y={62}>{en ? `${num(s.half, lang)} of ${num(s.buyer_years, lang)} buyer-years` : `${num(s.half)} de ${num(s.buyer_years)} compradores-año`}</text>
                <text className="vd-exp-chf" x={x + 6} y={78}>{en ? `${money(s.money_half, lang)} to one company` : `${money(s.money_half, lang)} a una sola empresa`}</text>
              </>}
              {dots.map((t, k) => (
                <rect key={`${t[0]}-${t[1]}`} className="cr-dot" x={x + 6 + (k % per) * step} y={T + Math.floor(k / per) * step} width={sz} height={sz}
                  fill={c.color} fillOpacity={t[3] === 'co' ? 0.9 : 0.3} onClick={() => open({ inst: t[0] })}>
                  <title>{title(t)}</title>
                </rect>
              ))}
              <text className="vd-exp-chf" x={x + 6} y={H - 6}>{`${c.a}${c.b > c.a ? `–${String(c.b).slice(2)}` : en ? ' · to Sep' : ' · a sep'}`}</text>
            </g>
          )
        })}
      </svg>
    )
  } else if (width > 0) {
    const Lw = 104, per = Math.max(1, Math.floor((width - Lw) / step))
    const hs = byChap.map((x) => Math.max(64, Math.ceil(x.dots.length / per) * step + 12))
    let y0 = 0
    body = (
      <svg width={width} height={hs.reduce((a, b) => a + b, 0)} viewBox={`0 0 ${width} ${hs.reduce((a, b) => a + b, 0)}`} role="img" className="cr-mitad"
        aria-label={en ? 'Buyer-years with a majority company, by administration' : 'Compradores-año con una empresa mayoritaria, por sexenio'}>
        {byChap.map(({ c, s, dots }, i) => {
          const y = y0; y0 += hs[i]
          return (
            <g key={c.key}>
              <rect className={i % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={0} y={y} width={width} height={hs[i]} />
              <text className="vd-exp-ch" x={0} y={y + 14}>{c.name.split(' ')[0]}</text>
              {s && s.buyer_years > 0 && <>
                <text className="cr-pc" x={0} y={y + 38} style={{ fill: c.color }}>{pct(s.half / s.buyer_years, lang)}</text>
                <text className="vd-exp-chf" x={0} y={y + 54}>{`${num(s.half, lang)} ${en ? 'of' : 'de'} ${num(s.buyer_years, lang)}`}</text>
              </>}
              {dots.map((t, k) => (
                <rect key={`${t[0]}-${t[1]}`} className="cr-dot" x={Lw + (k % per) * step} y={y + 6 + Math.floor(k / per) * step} width={sz} height={sz}
                  fill={c.color} fillOpacity={t[3] === 'co' ? 0.9 : 0.3} onClick={() => open({ inst: t[0] })}><title>{title(t)}</title></rect>
              ))}
            </g>
          )
        })}
      </svg>
    )
  }
  return <div ref={ref} className="cr-mitad-wrap" style={width ? undefined : { minHeight: 300 }}>{body}</div>
}

/** «Quién tiene la mitad hoy»: one row per buyer, its latest 2024–25 year with a company ≥ 50%. */
export function MitadLedger({ rows, colorOf, lang }: { rows: MajorityRow[]; colorOf: (sectorId: number) => string; lang: Lang }) {
  const en = lang === 'en'
  const open = useDissect()
  const fold = useRowFold(rows, 6)
  return (
    <>
      <ul className="cr-half" id="cr-half">
        <li className="cr-hd" aria-hidden="true">
          <span className="cr-no">Nº</span>
          <span>{en ? 'Buyer' : 'Comprador'}</span><span>{en ? 'The company holding half' : 'La empresa que tiene la mitad'}</span>
          <span className="cr-hm">{en ? 'its share of the buyer’s year · mark = half' : 'su parte del año del comprador · marca = la mitad'}</span>
          <span className="cr-r">{en ? 'took / spent' : 'cobró / gastó'}</span><span className="cr-hm">{en ? 'seals' : 'sellos'}</span>
        </li>
        {fold.shown.map((r, i) => {
          const color = chapterOf(r.year).color
          return (
            <li key={r.institution_id} className={fold.rowIn(i).trim() || undefined}>
              <span className="cr-no">{rankNo(i + 1)}</span>
              <button type="button" className="cr-who" onClick={() => open({ inst: r.institution_id })}
                aria-label={en ? `Dissect ${instLabel(r.inst, r.siglas)}` : `Diseccionar ${instLabel(r.inst, r.siglas)}`}>
                <i style={{ background: colorOf(r.sector_id) }} aria-hidden="true" />{instLabel(r.inst, r.siglas)}
              </button>
              <span className="cr-v">{r.vendor_id && r.vendor
                ? <><EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor} variant="name" size="inherit" />{r.kind === 'pf' && <em className="cr-d-tag">{en ? 'individual' : 'persona física'}</em>}</>
                : (en ? 'Name not published' : 'Nombre no publicado')}</span>
              <span className="cr-hm cr-ruler" aria-hidden="true">
                <svg viewBox="0 0 200 14" preserveAspectRatio="none">
                  <rect x={0} y={6} width={200} height={2} className="cr-track" />
                  <rect x={0} y={3} width={200 * Math.min(1, r.share)} height={8} fill={color} />
                  <line x1={100} x2={100} y1={0} y2={14} className="cr-halfmark" />
                </svg>
              </span>
              <span className="cr-r cr-m"><b>{pct(r.share, lang)}</b> · {money(r.top_m, lang)}<br />{en ? 'of' : 'de'} {money(r.total, lang)} · {r.year}</span>
              <span className="cr-seals">
                {r.cap ? <em className="is-cap">{en ? 'dominant' : 'dominante'}</em> : null}
                {r.gt === 'doc' ? <em className="is-doc">{en ? 'case' : 'caso'}</em> : r.gt === 'lead' ? <em>{en ? 'lead' : 'pista'}</em> : null}
              </span>
            </li>
          )
        })}
      </ul>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-half" />
    </>
  )
}
