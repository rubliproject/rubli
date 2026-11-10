/**
 * The /captura dissection (owner 2026-10-27: «if we put an institution we have to be able to dissect
 * what we traced»). One drawer, three levels, all in the URL (components/captura/dissect.ts):
 *   sector  ?sector=   a ribbon band → its buyers
 *   buyer   ?inst=     its dominant suppliers (share of the company's income, years, lock, money, direct award,
 *                      indicator, ARIA tier, case seal), its share of spend to dominant suppliers by year, and the
 *                      majority holder by year
 *   pair    &pair=     buyer × company: contracts by year, procedure mix, largest contracts, and the doors
 *                      (vendor and buyer dossiers, ARIA case, documented case, El Mapa)
 * Modal on purpose (focus trapped, Esc closes, focus returns to the opener); a side panel on desktop and a
 * bottom sheet on phones (the .cg-dock geometry of La gravedad's dock, reused).
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { capturaApi, type CapturaMajority, type CapturaPairFull, type MajorityRow } from '@/api/captura'
import { vendorApi } from '@/api/client'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { rankNo } from '@/components/kit/ListRow'
import { useModal } from '@/hooks/useModal'
import { CATEGORICAL, SECTORS } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import { cieloHref } from '@/lib/vista'
import { smooth } from '@/lib/vendor/expediente'
import { CHAPTERS, YEARS, type Relevo } from '@/lib/captura/relevo'
import { money, moneyDual, num, pct, type Lang } from '@/lib/captura/lectura'
import { useDissect, type Sel } from './dissect'
import { instLabel } from './LaMitad'
import { Ind, LockStrip } from './Pruebas'
import { CAPTURA_TITLE } from '@/lib/captura/title'

const secName = (id: number | null | undefined, en: boolean) => {
  if (!id) return en ? 'other sectors' : 'otros sectores'
  const s = SECTORS.find((x) => x.id === id)
  return s ? (en ? s.nameEN : s.name).toLowerCase() : '—'
}

export function Diseccion({ sel, m, maj, lang }: { sel: Sel; m: Relevo; maj: CapturaMajority | undefined; lang: Lang }) {
  const en = lang === 'en'
  const open = useDissect()
  const ref = useRef<HTMLElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  useModal(ref, () => open(null))
  const level = sel.inst != null && sel.pair != null ? 'pair' : sel.inst != null ? 'inst' : 'sector'
  const levelKey = `${sel.sector}-${sel.inst}-${sel.pair}`
  // each level change moves focus to the new heading (the dialog stays mounted)
  useEffect(() => { head.current?.focus({ preventScroll: true }); ref.current?.scrollTo({ top: 0 }) }, [levelKey])

  const inst = sel.inst ?? null
  const b = inst != null ? m.buyer.get(inst) : undefined
  const majName = inst != null ? maj?.inst[String(inst)] : undefined
  const ilabel = inst != null ? instLabel(b?.name ?? majName?.[0], b?.siglas ?? majName?.[1]) : ''
  const sectorId = level === 'sector' ? sel.sector ?? 0 : b?.sector_id ?? majName?.[2] ?? null

  const crumbs: { label: string; to: Sel | null }[] = [{ label: CAPTURA_TITLE[en ? 'en' : 'es'], to: null }]
  if (sel.sector != null) crumbs.push({ label: secName(sel.sector, en), to: { sector: sel.sector } })
  if (inst != null) crumbs.push({ label: ilabel, to: { sector: sel.sector, inst } })

  return (
    <>
      <div className="cr-scrim" onClick={() => open(null)} aria-hidden="true" />
      <aside ref={ref} className="cg-dock cr-dock" role="dialog" aria-modal="true" aria-labelledby="cr-d-h">
        <div className="cg-dock-top">
          <i style={{ background: m.colorOf(sectorId) }} aria-hidden="true" />
          <nav className="cr-crumbs" aria-label={en ? 'Dissection path' : 'Ruta de la disección'}>
            {crumbs.map((c, i) => (
              <span key={i}>{i > 0 && ' › '}{i < crumbs.length - 1 || level === 'pair'
                ? <button type="button" onClick={() => open(c.to)}>{c.label}</button>
                : <b aria-current="page">{c.label}</b>}</span>
            ))}
          </nav>
          <button type="button" onClick={() => open(null)}>{en ? 'Close' : 'Cerrar'} <kbd>Esc</kbd></button>
        </div>
        {level === 'sector' && <SectorLevel id={sel.sector ?? 0} m={m} head={head} lang={lang} />}
        {level === 'inst' && <InstLevel id={inst!} sel={sel} m={m} label={ilabel} head={head} lang={lang} />}
        {level === 'pair' && <PairLevel inst={inst!} vid={sel.pair!} m={m} label={ilabel} head={head} lang={lang} />}
      </aside>
    </>
  )
}

type H = { head: React.RefObject<HTMLHeadingElement | null> }

function SectorLevel({ id, m, head, lang }: { id: number; m: Relevo; lang: Lang } & H) {
  const en = lang === 'en'
  const open = useDissect()
  const named = new Set(m.series.filter((s) => s.sector != null).map((s) => s.sector))
  const rows = m.register.filter((b) => (id === 0 ? !named.has(b.sector_id) : b.sector_id === id))
  const s = id === 0 ? m.series.find((x) => x.sector == null) : m.bySector.get(id)
  const fold = useRowFold(rows, 12)
  return (
    <>
      <h2 id="cr-d-h" ref={head} tabIndex={-1} className="cg-dock-h">{en ? 'Buyers in ' : 'Compradores de '}{secName(id, en)}</h2>
      {s && (
        <div className="cg-dock-big">
          <div><b>{num(s.nAll, lang)} → {num(s.nCur, lang)}</b><span>{en ? 'dominant suppliers, ever → current' : 'proveedores dominantes, de siempre → vigentes'}</span></div>
          <div><b>{moneyDual(s.mAll, lang)}</b><span>{en ? 'billed by them since 2002' : 'cobrados por ellas desde 2002'}</span></div>
        </div>
      )}
      <h3 className="cr-d-k">{en ? `${num(rows.length, lang)} buyers with dominant suppliers — open one` : `${num(rows.length, lang)} compradores con proveedores dominantes — abra uno`}</h3>
      <ul className="cr-d-list" id="cr-d-sec">
        {fold.shown.map((b, i) => (
          <li key={b.institution_id}>
            <button type="button" onClick={() => open({ sector: id, inst: b.institution_id })}>
              <span className="cr-no">{rankNo(i + 1)}</span>
              <span className="cr-d-n">{instLabel(b.name, b.siglas)}</span>
              <span className="cr-m">{num(b.n, lang)} · <b>{num(b.cur, lang)}</b> {en ? 'current' : 'vigentes'}</span>
              <span className="cr-m cr-r">{money(b.cap, lang)}</span>
            </button>
          </li>
        ))}
      </ul>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-d-sec" />
    </>
  )
}

/** The buyer's share of spend to its dominant suppliers, year by year: an area on a 0–100% scale, the half dashed. */
function ShareByYear({ yTotal, yCap, lang }: { yTotal: number[]; yCap: number[]; lang: Lang }) {
  const en = lang === 'en'
  const W = 360, H = 72, cw = W / YEARS.length
  // a year with almost no record (< 15% of the median year, e.g. 2002–04) reads as no share, not as 100%
  const nz = yTotal.filter((t) => t > 0).sort((p, q) => p - q), floor = 0.15 * (nz[Math.floor(nz.length / 2)] ?? 0)
  const sh = YEARS.map((_, k) => (yTotal[k] > 0 && yTotal[k] >= floor ? yCap[k] / yTotal[k] : null))
  const y = (v: number) => 4 + (1 - v) * (H - 20)
  const pts = YEARS.map((_, k) => [k * cw + cw / 2, y(sh[k] ?? 0)] as [number, number])
  const best = sh.reduce<number>((bi, v, k) => (v != null && (sh[bi] == null || v > (sh[bi] as number)) ? k : bi), 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cr-d-share" role="img"
      aria-label={en ? 'Share of its spend that went to dominant suppliers, by year' : 'Parte de su gasto que fue a proveedores dominantes, por año'}>
      {CHAPTERS.map((c, i) => <rect key={c.key} className={i % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={(c.a - 2002) * cw} y={0} width={(c.b - c.a + 1) * cw} height={H - 14} />)}
      <line x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} className="cr-halfline" />
      <path d={`${smooth(pts)} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={CATEGORICAL[1]} fillOpacity={0.8} />
      {sh[best] != null && <text className="vd-exp-ind" x={Math.min(W - 30, best * cw + cw / 2)} y={Math.max(12, y(sh[best]!) - 3)} textAnchor="middle">{pct(sh[best]!, lang)}</text>}
      <text className="vd-exp-yr" x={0} y={H - 2}>2002</text>
      <text className="vd-exp-yr" x={W} y={H - 2} textAnchor="end">2025</text>
      <text className="vd-exp-yr" x={W / 2} y={H - 2} textAnchor="middle">{en ? 'dashed = half' : 'punteada = la mitad'}</text>
    </svg>
  )
}

function MajorityByYear({ rows, lang }: { rows: MajorityRow[]; lang: Lang }) {
  const en = lang === 'en'
  const sorted = useMemo(() => [...rows].sort((a, b) => b.year - a.year), [rows])
  const fold = useRowFold(sorted, 8)
  return (
    <>
      <ul className="cr-d-maj" id="cr-d-maj">
        {fold.shown.map((r) => (
          <li key={r.year} className={r.share >= 0.5 ? 'is-half' : undefined}>
            <span className="cr-m cr-gray">{r.year}</span>
            <span>{r.vendor_id && r.vendor
              ? <><EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor} variant="name" size="inherit" />{r.kind === 'pf' && <em className="cr-d-tag">{en ? 'individual' : 'persona física'}</em>}</>
              : r.kind === 'pf' ? (en ? 'a natural person' : 'una persona física') : '—'}
              {r.kind === 'pub' && <em className="cr-d-tag">{en ? 'public body' : 'entidad pública'}</em>}
              {r.cap ? <em className="cr-d-tag is-cap">{en ? 'dominant' : 'dominante'}</em> : null}</span>
            <span className="cr-m cr-r"><b>{pct(r.share, lang)}</b> {en ? 'of' : 'de'} {money(r.total, lang)}</span>
          </li>
        ))}
      </ul>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-d-maj" />
    </>
  )
}

function InstLevel({ id, sel, m, label, head, lang }: { id: number; sel: Sel; m: Relevo; label: string; lang: Lang } & H) {
  const en = lang === 'en'
  const open = useDissect()
  const pb = m.buyer.get(id)
  const bq = useQuery({ queryKey: ['captura', 'buyer', id], queryFn: () => capturaApi.buyer(id), enabled: !!pb, staleTime: 3_600_000, retry: false })
  const mq = useQuery({ queryKey: ['captura', 'majorityOf', id], queryFn: () => capturaApi.majorityOf(id), staleTime: 3_600_000, retry: false })
  const pairs = useMemo(() => [...(bq.data?.pairs ?? [])].sort((a, b) => b.m - a.m), [bq.data])
  const fold = useRowFold(pairs, 10)
  const name = pb?.name ?? mq.data?.years[0]?.inst ?? label
  const cur = pairs.filter((p) => p.y1 >= 2024).length
  const halfYears = (mq.data?.years ?? []).filter((r) => r.share >= 0.5).length
  return (
    <>
      <h2 id="cr-d-h" ref={head} tabIndex={-1} className="cg-dock-h">
        <EntityIdentityChip type="institution" id={id} name={name} variant="name" />
      </h2>
      <p className="cg-dock-of">{secName(pb?.sector_id ?? mq.data?.years[0]?.sector_id, en)}{pb ? ` · ${en ? 'money to dominant suppliers' : 'dinero a proveedores dominantes'} ${moneyDual(pb.cap, lang)}` : ''}</p>
      {pb ? (
        <div className="cg-dock-big">
          <div><b>{pct(pb.cap_share, lang)}</b><span>{en ? 'of its 2002–25 spend went to dominant suppliers' : 'de su gasto 2002–25 fue a proveedores dominantes'}</span></div>
          <div><b>{num(pb.n, lang)}{bq.data ? ` · ${num(cur, lang)}` : ''}</b><span>{en ? 'dominant suppliers · current' : 'proveedores dominantes · vigentes'}</span></div>
        </div>
      ) : (
        <p className="cr-d-note">{en
          ? 'No company lives off this buyer by the dominant-supplier test (≥ 80% of its federal income). Its majority holders are below.'
          : 'Ninguna empresa vive de este comprador por la prueba de proveedor dominante (≥ 80% de su ingreso federal). Sus mayoritarios, abajo.'}</p>
      )}
      {pb && pb.post_n > 0 && <p className="cg-dock-still">{en ? `${num(pb.post_n, lang)} of them still sign in ComprasMX · ${money(pb.post, lang)}` : `${num(pb.post_n, lang)} siguen firmando en ComprasMX · ${money(pb.post, lang)}`}</p>}

      {pb && <>
        <h3 className="cr-d-k">{en ? 'Share of its spend to dominant suppliers, by year' : 'Parte de su gasto a proveedores dominantes, por año'}</h3>
        <ShareByYear yTotal={pb.y_total} yCap={pb.y_cap} lang={lang} />
      </>}

      <h3 className="cr-d-k">{en ? 'Its largest supplier, year by year' : 'Su mayor proveedor, año por año'}
        {mq.data && <span> · {en ? `${halfYears} years with a majority (≥ 50%)` : `${halfYears} años con mayoría (≥ 50%)`}</span>}</h3>
      {mq.isLoading && <p className="cr-d-note">{en ? 'Loading…' : 'Cargando…'}</p>}
      {mq.isError && <p className="cr-d-note">{en ? 'The majority register is not available yet.' : 'El registro de mayorías aún no está disponible.'}</p>}
      {mq.data && (mq.data.years.length
        ? <MajorityByYear rows={mq.data.years} lang={lang} />
        : <p className="cr-d-note">{en ? 'No year with ≥ 100M MXN of spend.' : 'Ningún año con ≥ 100 MDP de gasto.'}</p>)}

      {pb && <>
        <h3 className="cr-d-k">{en ? `Its ${num(pb.n, lang)} dominant suppliers — open one` : `Sus ${num(pb.n, lang)} proveedores dominantes — abra uno`}</h3>
        {bq.isLoading && <p className="cr-d-note">{en ? 'Loading…' : 'Cargando…'}</p>}
        {bq.isError && <p className="cr-d-note">{en ? 'The dominant suppliers failed to load.' : 'No se pudieron cargar los proveedores dominantes.'}</p>}
        <ul className="cr-d-caps" id="cr-d-caps">
          {fold.shown.map((p, i) => (
            <li key={p.vendor_id}>
              <button type="button" onClick={() => open({ sector: sel.sector, inst: id, pair: p.vendor_id })}>
                <span className="cr-no">{rankNo(i + 1)}</span>
                <span className="cr-d-n">{formatVendorName(p.name, 80)}</span>
                <span className="cr-m"><b>{pct(p.sh, lang)}</b> {en ? 'of its income' : 'de su ingreso'} · {p.y0}–{String(p.y1).slice(2)}{p.lockrun ? ` · ${p.lockrun} ${en ? 'locked' : 'bajo candado'}` : ''}</span>
                <span className="cr-m cr-r"><b>{money(p.m, lang)}</b></span>
                <span className="cr-m cr-gray">{p.da != null ? `${en ? 'DA' : 'AD'} ${pct(p.da, lang)}` : (en ? 'DA —' : 'AD —')}</span>
                <span className="cr-m">{en ? 'ind.' : 'ind.'} <Ind r={p.risk} />{p.tier ? ` · ARIA ${en ? 'T' : 'N'}${p.tier}` : ''}</span>
                <span className="cr-seals">{p.gt === 'doc' ? <em className="is-doc">{en ? 'case' : 'caso'}</em> : p.gt === 'lead' ? <em>{en ? 'lead' : 'pista'}</em> : null}{p.post_n > 0 ? <em>{en ? 'signs' : 'sigue'}</em> : null}</span>
              </button>
            </li>
          ))}
        </ul>
        <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-d-caps" />
      </>}

      <Doors>
        <EntityIdentityChip type="institution" id={id} name={name} variant="name" className="is-pri">{en ? 'Buyer dossier' : 'Expediente del comprador'}</EntityIdentityChip>
        <Link to={cieloHref({ star: id })}>{en ? 'On El Mapa' : 'En El Mapa'}</Link>
      </Doors>
    </>
  )
}

function Doors({ children }: { children: ReactNode }) {
  return <div className="cg-dock-acts cr-doors">{children}</div>
}

/** Buyer × company by year: a lane (width = money of the year), the contract count under it, ComprasMX after the seam. */
function PairYears({ by, post, postN, color, lang }: { by: [number, number, number, number | null][]; post: number; postN: number; color: string; lang: Lang }) {
  const en = lang === 'en'
  const W = 360, H = 76, cw = W / (YEARS.length + 1.6), yc = 22
  const m = new Map(by.map((r) => [r[0], r]))
  const mx = Math.max(1, ...by.map((r) => r[2]), post)
  const pts = YEARS.map((y, k) => [k * cw + cw / 2, m.get(y) ? 2 + 16 * Math.sqrt(m.get(y)![2] / mx) : 0] as const)
  const d = `${smooth(pts.map(([x, h]) => [x, yc - h]))} L${pts.slice().reverse().map(([x, h]) => `${x},${yc + h}`).join(' L')} Z`
  const xs = YEARS.length * cw
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cr-d-share" role="img"
      aria-label={en ? 'Its contracts with this buyer, by year' : 'Sus contratos con este comprador, por año'}>
      <line x1={0} x2={xs} y1={yc} y2={yc} className="vd-exp-tenure" />
      <path d={d} fill={color} fillOpacity={0.85} />
      <line x1={xs + 2} x2={xs + 2} y1={0} y2={44} className="cg-seam" />
      {post > 0 && <rect x={xs + 6} y={yc - (2 + 16 * Math.sqrt(post / mx))} width={cw * 1.2} height={2 * (2 + 16 * Math.sqrt(post / mx))} className="cg-ink" />}
      {YEARS.map((y, k) => m.get(y) && (k % 2 === 0 || YEARS.length < 14) ? <text key={y} className="vd-exp-yr" x={k * cw + cw / 2} y={52} textAnchor="middle">{m.get(y)![1]}</text> : null)}
      {postN > 0 && <text className="vd-exp-ind" x={xs + 6} y={52}>{postN}</text>}
      <text className="vd-exp-yr" x={0} y={H - 2}>2002</text>
      <text className="vd-exp-yr" x={xs} y={H - 2} textAnchor="end">2025</text>
      <text className="vd-exp-yr" x={xs + 6} y={H - 2}>MX</text>
    </svg>
  )
}

const PROC: Record<string, [string, string, string]> = {
  licitacion: ['licitación', 'open tender', CATEGORICAL[1]],
  invitacion: ['invitación', 'invitation', CATEGORICAL[5]],
  directa: ['adjudicación directa', 'direct award', CATEGORICAL[0]],
}

function PairLevel({ inst, vid, m, label, head, lang }: { inst: number; vid: number; m: Relevo; label: string; lang: Lang } & H) {
  const en = lang === 'en'
  const q = useQuery({ queryKey: ['captura', 'pair', vid, inst], queryFn: () => capturaApi.pair(vid, inst), staleTime: 3_600_000, retry: false })
  const p: CapturaPairFull | undefined = q.data?.pair
  const gt = useQuery({ queryKey: ['vendor', vid, 'gt-status'], queryFn: () => vendorApi.getGroundTruthStatus(vid), enabled: p?.gt === 'doc', staleTime: 3_600_000, retry: false })
  const slug = gt.data?.cases.find((c) => c.scandal_slug)?.scandal_slug ?? null
  const b = m.buyer.get(inst)
  const color = m.colorOf(b?.sector_id)
  const procTotal = (q.data?.proc ?? []).reduce((s, r) => s + r.m, 0) || 1
  return (
    <>
      <h2 id="cr-d-h" ref={head} tabIndex={-1} className="cg-dock-h">
        {p ? <EntityIdentityChip type="vendor" id={vid} name={p.name} variant="name" /> : (en ? 'Dominant supplier' : 'Proveedor dominante')}
      </h2>
      <p className="cg-dock-of">{en ? 'lives off ' : 'vive de '}<EntityIdentityChip type="institution" id={inst} name={b?.name ?? label} variant="name" /></p>
      {q.isLoading && <p className="cr-d-note">{en ? 'Loading…' : 'Cargando…'}</p>}
      {q.isError && <p className="cr-d-note">{en ? 'Not a dominant supplier of this buyer, or the register is not available.' : 'No es un proveedor dominante de este comprador, o el registro no está disponible.'}</p>}
      {p && <>
        <div className="cg-dock-big">
          <div><b>{pct(p.sh, lang)}</b><span>{en ? 'of its federal income' : 'de su ingreso federal'}</span></div>
          <div><b>{moneyDual(p.m, lang)}{p.flag ? ' †' : ''}</b><span>{en ? 'with this buyer' : 'con este comprador'}</span></div>
        </div>
        {p.post_n > 0 && <p className="cg-dock-still">{en ? 'Still signing after the blackout' : 'Sigue firmando desde el cierre de CompraNet (28 sep 2025)'} · {num(p.post_n, lang)} {en ? 'ComprasMX contracts' : 'contratos en ComprasMX'}{p.post ? ` · ${money(p.post, lang)}` : ''}</p>}
        <dl className="cg-dock-dl">
          <dt>{en ? 'Years with the buyer' : 'Años con el comprador'}</dt><dd>{p.y0}–{p.y1} · {p.ny}</dd>
          <dt>{en ? 'Under lock (≥ 80% of the year)' : 'Bajo candado (≥ 80% del año)'}</dt><dd>{p.lock0 ? `${p.lock0}–${p.lock1} · ${p.lockrun} ${en ? 'in a row' : 'seguidos'}` : (en ? 'no full year' : 'ningún año completo')}</dd>
          <dt>{en ? 'Direct award' : 'Adjudicación directa'}</dt><dd>{p.da == null ? (en ? 'no data (2002–2010)' : 'sin dato (2002–2010)') : `${pct(p.da, lang)} ${en ? 'of 2011+ money' : 'del dinero 2011+'}`}</dd>
          <dt>{en ? 'Contracts' : 'Contratos'}</dt><dd>{num(p.n, lang)}</dd>
          {p.nbuyers != null && <><dt>{en ? 'Other buyers' : 'Otros compradores'}</dt><dd>{num(Math.max(0, p.nbuyers - 1), lang)} · {money(Math.max(0, p.vt - p.m), lang)}</dd></>}
          <dt>{en ? 'Risk indicator' : 'Indicador de riesgo'}</dt><dd><Ind r={p.risk} /></dd>
        </dl>
        {(p.gt || p.tier || p.p6 || p.efos || p.sfp) ? (
          <p className="cg-dock-seals">
            {p.gt === 'doc' && <em className="is-doc">{en ? 'documented case' : 'caso documentado'}</em>}
            {p.gt === 'lead' && <em>{en ? 'case lead' : 'pista'}</em>}
            {p.tier ? <em>ARIA {en ? 'tier' : 'nivel'} {p.tier}</em> : null}
            {p.p6 ? <em>P6 · {en ? 'single-buyer dependence' : 'dependencia de un comprador'}</em> : null}
            {p.efos ? <em>EFOS</em> : null}
            {p.sfp ? <em>SFP</em> : null}
          </p>
        ) : null}
        <h3 className="cr-d-k">{en ? 'Under lock, 2002–2025 · ComprasMX' : 'Bajo candado, 2002–2025 · ComprasMX'}</h3>
        <LockStrip p={p} color={color} />
        {q.data?.by_year && q.data.by_year.length > 0 && <>
          <h3 className="cr-d-k">{en ? 'Contracts by year (width = money, numeral = contracts)' : 'Contratos por año (ancho = dinero, cifra = contratos)'}</h3>
          <PairYears by={q.data.by_year} post={p.post} postN={p.post_n} color={color} lang={lang} />
        </>}
        {q.data?.proc && q.data.proc.length > 0 && <>
          <h3 className="cr-d-k">{en ? 'Procedure, by money' : 'Procedimiento, por dinero'}</h3>
          <ul className="cr-d-proc">
            {q.data.proc.map((r) => {
              const k = PROC[r.type]
              return (
                <li key={r.type}>
                  <i style={{ background: k?.[2] ?? CATEGORICAL[7] }} aria-hidden="true" />
                  <span>{k ? (en ? k[1] : k[0]) : (en ? 'unrecorded / other' : 'sin registro / otro')}</span>
                  <span className="cr-m cr-r">{num(r.n, lang)} · <b>{pct(r.m / procTotal, lang)}</b></span>
                </li>
              )
            })}
          </ul>
        </>}
        <div className="cg-dock-cts">
          <h3>{en ? 'Largest contracts with the buyer' : 'Mayores contratos con el comprador'}</h3>
          {q.data?.contracts.map((c) => (
            <Link key={c.id} to={`/contracts/${c.id}`}>
              <span className="kf-mono">{c.year}</span>
              <span className="kf-mono cg-num"><b>{money(c.amount_mxn, lang)}</b>{c.is_direct_award ? <i> · {en ? 'DA' : 'AD'}</i> : null}</span>
              <span className="cg-t">{c.title ? c.title.charAt(0).toUpperCase() + c.title.slice(1).toLowerCase() : (en ? '(untitled)' : '(sin título)')}</span>
            </Link>
          ))}
        </div>
      </>}
      <Doors>
        <EntityIdentityChip type="vendor" id={vid} name={p?.name ?? ''} variant="name" className="is-pri">{en ? 'Company dossier' : 'Expediente de la empresa'}</EntityIdentityChip>
        {p?.tier ? <Link to={`/aria/caso/${vid}`}>{en ? 'ARIA case' : 'Caso ARIA'}</Link> : null}
        {slug ? <Link to={`/cases/${slug}`}>{en ? 'Documented case' : 'Caso documentado'}</Link> : null}
        <EntityIdentityChip type="institution" id={inst} name={b?.name ?? label} variant="name">{en ? 'Buyer dossier' : 'Expediente del comprador'}</EntityIdentityChip>
        <Link to={cieloHref({ planet: vid })}>{en ? 'On El Mapa' : 'En El Mapa'}</Link>
      </Doors>
    </>
  )
}
