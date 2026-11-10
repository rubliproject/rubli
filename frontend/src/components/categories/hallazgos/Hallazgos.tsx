/**
 * /categories «Tendencias» — four findings about what the country buys (TEAL 2026-11-05, owner direction:
 * «right now it spews facts»). Each finding = a question kicker · ONE plain sentence (≤ 15 words, example
 * first, shown only when true: buildFindings) · ONE chart · «Cómo leer esto», whose numbered steps sit ON the
 * chart as pins (anatomy callouts; never a second graphic) · a row of drill links. Then the drill layer
 * (category → buyers × years → contracts → dossiers), a disclosure synced to ?capa=20.
 * Data: GET /categories/hallazgos (precomputed). Every figure is computed in lib/categories/hallazgosModel.ts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { categoriesApi } from '@/api/client'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { formatCompactMXN, formatDualCurrency } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { cieloHref } from '@/lib/vista'
import { buildFindings, buildModel, cien, ID, type FindingKey, type Lang } from '@/lib/categories/hallazgosModel'
import { Carriles, Duenos, Medicina, Reglas, Relevo } from './charts'
import './hallazgos.css'

const ROMAN = ['I', 'II', 'III', 'IV']
/** Register titles arrive in capitals: sentence case, keeping codes (words with digits, or a single code) as written. */
const sentence = (s: string | null) => {
  if (!s) return '—'
  if (!/\s/.test(s.trim())) return s
  const out = s.split(' ').map((w) => (/\d/.test(w) ? w : w.toLowerCase())).join(' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
const LEVEL: Record<Lang, Record<string, string>> = {
  es: { critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' },
  en: { critical: 'critical', high: 'high', medium: 'medium', low: 'low' },
}

/** «· persona física» after an individual's name (owner 2026-10-29: named, labelled; FocosWall pattern). */
function PF({ lang }: { lang: Lang }) {
  return <span className="mute">{lang === 'en' ? ' · individual' : ' · persona física'}</span>
}

/** «Cómo leer esto»: numbered steps; each number is also a pin on the chart, where that step points. */
function Read({ steps, note, lang }: { steps: (string | null)[]; note?: ReactNode; lang: Lang }) {
  return (
    <aside className="hz-read" aria-label={lang === 'es' ? 'Cómo leer esto' : 'How to read this'}>
      <h4>{lang === 'es' ? 'Cómo leer esto' : 'How to read this'}</h4>
      <ol>{steps.filter((st): st is string => !!st).map((st, i) => <li key={i}><span className="pin-n" aria-hidden="true">{i + 1}</span><span>{st}</span></li>)}</ol>
      {note && <p className="hz-note">{note}</p>}
    </aside>
  )
}

/** One finding: question kicker · the sentence · the chart · «Cómo leer esto» beside it (below on a phone) · drill links.
 *  On a desktop row the chart takes the height the reading column leaves free, so the two columns end together. */
function Chapter({ i, q, h, chart, read, drill, lang }: { i: number; q: string; h: string; chart: (grow: number) => ReactNode; read: ReactNode; drill: ReactNode; lang: Lang }) {
  const leftRef = useRef<HTMLDivElement>(null), railRef = useRef<HTMLDivElement>(null)
  const [grow, setGrow] = useState(0)
  useEffect(() => {
    const l = leftRef.current, r = railRef.current
    if (!l || !r) return
    const ro = new ResizeObserver(() => {
      const side = l.getBoundingClientRect().top === r.getBoundingClientRect().top   // two columns, not stacked
      setGrow((g) => { const next = side ? Math.max(-80, Math.min(120, Math.round(g + r.offsetHeight - l.offsetHeight))) : 0; return Math.abs(next - g) < 4 ? g : next })
    })
    ro.observe(l); ro.observe(r)
    return () => ro.disconnect()
  }, [])
  return (
    <section className="hz-ch" id={`hal-${i + 1}`} aria-labelledby={`hal-${i + 1}-h`}>
      <p className="hz-q"><span className="r">{ROMAN[i]}.</span> {q}</p>
      <h3 id={`hal-${i + 1}-h`}>{h}</h3>
      <div className="hz-obj">
        <div className="hz-left" ref={leftRef}>
          <div className="hz-fig">{chart(grow)}</div>
        </div>
        {/* BLUE simplify 11-05: the drill links sit under «Cómo leer esto»; the chart takes the rail's height (−80…+120) */}
        <div ref={railRef}>{read}<div className="hz-drill"><b>{lang === 'es' ? 'Abrir' : 'Open'} →</b> {drill}</div></div>
      </div>
    </section>
  )
}

export default function Hallazgos({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const t = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  // the buyer sector, as the Bodega's filter (owner 11-06: «can you give me findings by sector?»)
  const secRaw = Number(params.get('sector'))
  const sec = SECTORS.find((s) => s.id === secRaw) ?? null
  const { data, isLoading, isError } = useQuery({ queryKey: ['categories', 'hallazgos', sec?.id ?? null], queryFn: () => categoriesApi.getHallazgos(sec?.id), staleTime: 600_000 })
  const m = useMemo(() => (data ? buildModel(data) : null), [data])
  const findings = useMemo(() => (m ? buildFindings(m) : []), [m])
  const ref = useRef<HTMLDivElement>(null)
  const w = useMeasuredWidth(ref)
  const capa = params.get('capa') === String(ID.med)
  const setCapa = (open: boolean) => setParams((prev) => {
    const out = new URLSearchParams(prev)
    if (open) out.set('capa', String(ID.med)); else out.delete('capa')
    return out
  }, { replace: true })
  const openBtn = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const opened = useRef(false)
  // focus the layer's heading when the reader opens it (not on a deep-link load)
  useEffect(() => {
    if (!opened.current) return
    if (capa) titleRef.current?.focus({ preventScroll: false })
    else openBtn.current?.focus()   // closed by the reader → focus returns to the opener
  }, [capa])

  if (isError) return <p role="alert" className="ct-note">{t('No se pudieron cargar los hallazgos. Vuelva a intentarlo.', 'Unable to load the findings. Please try again.')}</p>
  if (isLoading || !m) return <div ref={ref}><Skeleton className="h-[900px] w-full" /></div>

  const phone = w > 0 && w < 600
  const leftW = w ? (phone ? w : Math.max(320, w - 300 - 32)) : 0
  const { f1, f2, f3 } = m
  const sw = f1.switchYear
  const fuel = f3.byCat(ID.fuel)
  const lab = m.f4.find((s) => s.cat === ID.lab)
  const labIMSS = lab?.rows.find((r) => r.id === ID.imss), labISSSTE = lab?.rows.find((r) => r.id === ID.issste)
  const mxAsOf = m.p.mx_asof ? new Date(`${m.p.mx_asof}T12:00:00`).toLocaleDateString(en ? 'en-US' : 'es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const birYears = 2025 - f2.bir_life_y0 + 1

  // one block per finding that holds; the order follows the page's questions (PAGE_QUESTIONS.md, Categorías)
  const dueno = findings.find((f) => f.key === 'dueno')
  const duenoRow = dueno?.cat != null ? f3.byCat(dueno.cat) : undefined
  const block: Record<FindingKey, { q: string; chart: (g: number) => ReactNode; read: ReactNode; drill: ReactNode }> = {
    medicina: {
      q: t('¿Cuánto se compró sin licitar?', 'How much was bought with no tender?'),
      chart: (g) => leftW > 0 && <Medicina m={m} w={leftW} lang={lang} grow={g} />,
      read: <Read lang={lang} steps={[
        t('Un punto, un año. Más grande, más dinero.', 'One dot, one year. Bigger, more money.'),
        t(`Más alto, más sin concurso. Desde ${sw}, más de la mitad.`, `Higher, more with no tender. Since ${sw}, over half.`),
        t('Gris: todo el gobierno. Subió menos.', 'Grey: all of government. It rose less.'),
        f1.mx.m > 0 ? t(`MX, el registro nuevo: ${cien(f1.mx.da)} de cada 100.`, `MX, the new register: ${cien(f1.mx.da)} of every 100.`) : null,
      ]} />,
      drill: <>
        <EntityIdentityChip type="category" id={ID.med} name={m.catName(ID.med, lang)} variant="name" className="hz-link">{t('Medicamentos · la categoría', 'Medicines · the category')}</EntityIdentityChip>{' '}
        <Link className="hz-link" to={`/contracts?category_id=${ID.med}&year=2024&is_direct_award=true`}>{t('contratos 2024 sin concurso', '2024 contracts with no tender')}</Link>
      </>,
    },
    birmex: {
      q: t('¿Qué dependencia compra las medicinas?', 'Which agency buys the medicines?'),
      chart: (g) => leftW > 0 && <Relevo m={m} w={leftW} lang={lang} grow={g} />,
      read: <Read lang={lang} steps={[
        t('Una franja, un comprador. Más gruesa, más dinero.', 'One band, one buyer. Thicker, more money.'),
        t(`Punteada: BIRMEX en ${birYears} años de CompraNet.`, `Dotted: BIRMEX in ${birYears} years of CompraNet.`),
        t('MX: un año de ComprasMX. Casi todo, BIRMEX.', 'MX: one year of ComprasMX. Almost all BIRMEX.'),
        t('El salto de 2025 es el IMSS.', 'The 2025 jump is IMSS.'),
      ]} note={t(`${f2.bir_flag_n} contratos de más de 10,000 MDP, en revisión.`, `${f2.bir_flag_n} contracts above 10,000 million pesos, under review.`)} />,
      drill: <>
        <EntityIdentityChip type="institution" id={ID.birmex} name="BIRMEX" variant="name" className="hz-link">{t('BIRMEX · expediente', 'BIRMEX · dossier')}</EntityIdentityChip>{' '}
        <Link className="hz-link" to="/gap">{t('ComprasMX · el registro nuevo', 'ComprasMX · the new register')}</Link>
      </>,
    },
    combustible: {
      q: t('¿Quién vende más?', 'Who sells the most?'),
      chart: (g) => leftW > 0 && <Duenos m={m} w={leftW} lang={lang} grow={g} />,
      read: <Read lang={lang} steps={[
        t('Una línea, una categoría. Izquierda: 2019–24.', 'One line, one category. Left: 2019–24.'),
        t('Derecha: 2025. Altura: lo que cobra su mayor proveedor.', 'Right: 2025. Height: what its top supplier takes.'),
        fuel ? t(`Violeta: combustible. Edenred, de ${cien(fuel.share_before)} a ${cien(fuel.share)}.`, `Violet: fuel. Edenred, from ${cien(fuel.share_before)} to ${cien(fuel.share)}.`) : null,
      ]} />,
      drill: <>
        <EntityIdentityChip type="vendor" id={ID.edenred} name="Edenred" variant="name" className="hz-link">{t('Edenred · expediente', 'Edenred · dossier')}</EntityIdentityChip>{' '}
        <EntityIdentityChip type="category" id={ID.fuel} name={m.catName(ID.fuel, lang)} variant="name" className="hz-link">{t('Combustibles · la categoría', 'Fuel · the category')}</EntityIdentityChip>
      </>,
    },
    dueno: {
      q: t('¿Quién vende más?', 'Who sells the most?'),
      chart: (g) => leftW > 0 && <Duenos m={m} w={leftW} lang={lang} grow={g} hi={dueno?.cat} />,
      read: <Read lang={lang} steps={[
        t('Una línea, una categoría. Izquierda: 2019–24.', 'One line, one category. Left: 2019–24.'),
        t('Derecha: 2025. Altura: lo que cobra su mayor proveedor.', 'Right: 2025. Height: what its top supplier takes.'),
        duenoRow ? t(`En color: ${m.catName(duenoRow.cat, 'es').toLowerCase()}, de ${cien(duenoRow.share_before)} a ${cien(duenoRow.share)}.`, `In colour: ${m.catName(duenoRow.cat, 'en').toLowerCase()}, from ${cien(duenoRow.share_before)} to ${cien(duenoRow.share)}.`) : null,
      ]} />,
      drill: duenoRow ? <>
        {duenoRow.v != null && m.vendorName(duenoRow.v) && <EntityIdentityChip type="vendor" id={duenoRow.v} name={m.vendorName(duenoRow.v)!} personaFisica={m.isPF(duenoRow.v)} variant="name" className="hz-link" />}{' '}
        <EntityIdentityChip type="category" id={duenoRow.cat} name={m.catName(duenoRow.cat, lang)} variant="name" className="hz-link">{t(`${m.catName(duenoRow.cat, 'es')} · la categoría`, `${m.catName(duenoRow.cat, 'en')} · the category`)}</EntityIdentityChip>
      </> : null,
    },
    laboratorio: {
      q: t('¿Compran igual todas las dependencias?', 'Do all agencies buy the same way?'),
      chart: (g) => leftW > 0 && <Reglas m={m} w={leftW} lang={lang} grow={g} />,
      read: <Read lang={lang} steps={[
        t('Un punto, un comprador. Más a la derecha, más sin concurso.', 'One dot, one buyer. Further right, more with no tender.'),
        labIMSS ? t(`IMSS, azul: ${cien(labIMSS.da)} de cada 100.`, `IMSS, blue: ${cien(labIMSS.da)} of every 100.`) : null,
        labISSSTE ? t(`ISSSTE, verde azulado: ${cien(labISSSTE.da)}. Mismo producto.`, `ISSSTE, teal: ${cien(labISSSTE.da)}. Same product.`) : null,
      ]} />,
      drill: <>
        <EntityIdentityChip type="institution" id={ID.imss} name="IMSS" variant="name" className="hz-link">{t('IMSS · expediente', 'IMSS · dossier')}</EntityIdentityChip>{' '}
        <EntityIdentityChip type="institution" id={ID.issste} name="ISSSTE" variant="name" className="hz-link">{t('ISSSTE · expediente', 'ISSSTE · dossier')}</EntityIdentityChip>{' '}
        <EntityIdentityChip type="category" id={ID.lab} name={m.catName(ID.lab, lang)} variant="name" className="hz-link">{t('Laboratorio · la categoría', 'Laboratory · the category')}</EntityIdentityChip>
      </>,
    },
  }

  const drill2024 = m.p.drill
  const n2024 = f1.years.find((y) => y.y === 2024)?.n ?? 0, y2025 = f1.years.find((y) => y.y === 2025)

  return (
    <div className="hz" ref={ref}>
      <header className="hz-head">
        <h2>{sec ? t(`Tendencias de lo que compra ${sec.name.toLowerCase()}`, `Trends in what ${sec.nameEN.toLowerCase()} buys`) : t('Tendencias de lo que compra el país', 'Trends in what the country buys')}</h2>
        <p className="meta">CompraNet {t('al', 'to')} 28 sep 2025 · ComprasMX {t('al', 'to')} {mxAsOf}</p>
      </header>

      {sec && findings.length === 0 && (
        <p className="ct-note">{t(`En ${sec.name.toLowerCase()} ningún hallazgo se sostiene con estos datos; quite el filtro de sector para ver los del país.`, `In ${sec.nameEN.toLowerCase()} no finding holds on this data; clear the sector filter to see the national ones.`)}</p>
      )}
      {findings.map((f, i) => {
        const b = block[f.key]
        return <Chapter key={f.key} i={i} q={b.q} h={f[lang]} chart={b.chart} read={b.read} drill={b.drill} lang={lang} />
      })}

      {(!sec || sec.id === 1) && <section className="hz-layer" aria-labelledby="hal-capa-h">
        <h3 id="hal-capa-h"><span>{t('La capa de detalle', 'The detail layer')}</span></h3>
        {!capa && (
          <button ref={openBtn} type="button" className="hz-open" aria-expanded={false} aria-controls="hal-capa" onClick={() => { opened.current = true; setCapa(true) }}>
            {t('Abrir la capa de detalle', 'Open the detail layer')} → {m.catName(ID.med, lang)} · 2024
          </button>
        )}
        {capa && (
          <div id="hal-capa" className="hz-drawer" role="region" aria-labelledby="hal-capa-t"
            onKeyDown={(e) => { if (e.key === 'Escape') { opened.current = true; setCapa(false) } }}>
            <div className="dh">
              <span>{t('Medicinas', 'Medicines')} › {m.catName(ID.med, lang)} › 2024</span>
              <button type="button" aria-label={t('Cerrar la capa de detalle', 'Close the detail layer')} aria-expanded={true} aria-controls="hal-capa" onClick={() => { opened.current = true; setCapa(false) }}>✕</button>
            </div>
            <h4 id="hal-capa-t" tabIndex={-1} ref={titleRef}>{m.catName(ID.med, lang)}</h4>
            <p className="meta">2019–25: <b>{formatCompactMXN(f2.series.reduce((a, s) => a + s.vals.reduce((p, q) => p + q, 0), 0))}</b> · {f1.years.filter((y) => y.y >= 2019).reduce((a, r) => a + r.n, 0).toLocaleString(en ? 'en-US' : 'es-MX')} {t('contratos', 'contracts')} · <b>{y2025?.nv.toLocaleString(en ? 'en-US' : 'es-MX')}</b> {t('proveedores y', 'suppliers and')} <b>{y2025?.ni.toLocaleString(en ? 'en-US' : 'es-MX')}</b> {t('compradores en 2025', 'buyers in 2025')} · ComprasMX <b>{formatDualCurrency(f2.mx_total)}</b></p>
            <div className="lvl">
              <div className="lk">{t('Compradores · 2019–2025 · MX', 'Buyers · 2019–2025 · MX')}</div>
              {w > 0 && <Carriles m={m} w={Math.max(280, w - (phone ? 26 : 34))} lang={lang} />}
              <p className="hz-cap">{t('celda = dinero del comprador en el año', 'cell = the buyer’s money in the year')} ({t('tope', 'peak')} {formatCompactMXN(f2.imss2025)}, IMSS 2025); MX = ComprasMX 2025–26, {t('montos máximos.', 'maximum amounts.')}</p>
            </div>
            <div className="lvl">
              <div className="lk">{t(`Contratos 2024 · los ${drill2024.length} más grandes (de ${n2024.toLocaleString('es-MX')})`, `2024 contracts · the ${drill2024.length} largest (of ${n2024.toLocaleString('en-US')})`)}</div>
              <table className="hz-ledger hz-drill-t">
                <thead><tr><th scope="col">{t('Contrato', 'Contract')}</th><th scope="col" className="hm">{t('Proveedor · comprador', 'Supplier · buyer')}</th><th scope="col" className="n">{t('Monto', 'Amount')}</th><th scope="col" className="n">{t('Proc.', 'Proc.')}</th><th scope="col" className="n">{t('Indicador de riesgo', 'Risk indicator')}</th></tr></thead>
                <tbody>{drill2024.map((r) => {
                  const vn = m.vendorName(r.vid), inst = m.p.institutions[String(r.iid)]
                  const who = <>{vn && r.vid != null ? <EntityIdentityChip type="vendor" id={r.vid} name={vn} variant="name" className="hz-link">{formatVendorName(vn, 34)}</EntityIdentityChip> : t('sin nombre en el registro', 'no name in the register')}{m.isPF(r.vid) && <PF lang={lang} />} · <EntityIdentityChip type="institution" id={r.iid} name={inst?.name ?? String(r.iid)} variant="name" className="hz-link">{m.instShort(r.iid)}</EntityIdentityChip></>
                  const title = sentence(r.t)
                  return (
                    <tr key={r.id}>
                      <td><Link className="hz-link" to={`/contracts/${r.id}`}><span className="mono">{(r.d ?? '').slice(0, 7)}</span> · {title.length > 44 ? `${title.slice(0, 43)}…` : title}</Link><span className="hp">{who}</span></td>
                      <td className="hm">{who}</td>
                      <td className="n">{formatCompactMXN(r.m)}</td>
                      <td className="n">{r.da ? t('AD', 'DA') : t('LP', 'OT')}</td>
                      <td className="n">{r.r == null ? '—' : <>{r.r.toFixed(2)} <span className="mute">{LEVEL[lang][getRiskLevelFromScore(r.r)]}</span></>}</td>
                    </tr>)
                })}</tbody>
              </table>
              <p className="hz-caveat">{t(
                'Indicador de riesgo del modelo vigente: mide parecido con casos documentados; no mide corrupción. En contratos de más de 1,000 MDP el indicador tiende a saturar en 1.00, lo que dice más del tamaño que del contrato.',
                'Risk indicator of the current model: it measures resemblance to documented cases; it does not measure corruption. On contracts above 1,000 million pesos it tends to saturate at 1.00, which says more about size than about the contract.')}</p>
            </div>
            <div className="hz-links">
              <EntityIdentityChip type="institution" id={ID.imss} name="IMSS" variant="name" className="hz-link">{t('IMSS · expediente →', 'IMSS · dossier →')}</EntityIdentityChip>
              <EntityIdentityChip type="institution" id={ID.birmex} name="BIRMEX" variant="name" className="hz-link">{t('BIRMEX · expediente →', 'BIRMEX · dossier →')}</EntityIdentityChip>
              <Link className="hz-link" to={`/contracts?category_id=${ID.med}&year=2024`}>{t('Todos los contratos 2024 →', 'All 2024 contracts →')}</Link>
              <Link className="hz-link" to={cieloHref({ star: ID.imss })}>{t('IMSS en El Mapa →', 'IMSS on El Mapa →')}</Link>
              <Link className="hz-link" to={`/captura?inst=${ID.imss}`}>{t('Captura · IMSS →', 'Capture · IMSS →')}</Link>
              <Link className="hz-link" to="/aria">{t('Focos Rojos →', 'Red Flags →')}</Link>
            </div>
          </div>
        )}
      </section>}

      <p className="hz-firma">{t(
        'Un hallazgo describe el registro; no prueba irregularidad.',
        'A finding describes the register; it does not prove wrongdoing.')}</p>
    </div>
  )
}
