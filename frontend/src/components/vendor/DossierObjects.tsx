/**
 * The dossier objects — the signature layer under the loved sexenio spine (owner pick 2026-10-29,
 * _explore/dossier_objects_2026-10-29 README «Final picks» + «Round 3d», REVIEW_FINAL «SHIP-TO-BUILD»):
 *   VendorColumna      «La columna» (after Brancusi) — module = year, width = money, tone = share without a tender
 *   InstitutionAlbers  «Homenaje al cuadrado» (after Albers) — square = administration, area = money, tone = idem
 * The spine stays the plane; «ver en plano» swaps the volume for its year/term list (the 2D twin). three.js is
 * lazy (kit/motion → vendor-three chunk) and mounts only near the viewport (Defer).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Defer } from '@/components/kit/Defer'
import { Sculpture } from '@/components/kit/motion'
import type { InstitutionVendorsTimelineResponse, VendorInstitutionsTimelineResponse } from '@/api/types'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { buildExpediente } from '@/lib/vendor/expediente'
import {
  albersClaims, albersSlabs, albersSpec, columnClaims, columnModules, columnSpec, laneName, type ObjClaim, type Slab,
} from '@/lib/vendor/objects'
import { YearCard, type Pick } from './VendorExpediente'

type Lang = 'es' | 'en'
const pct = (x: number) => `${Math.round(x * 100)}%`

function Tones({ lang }: { lang: Lang }) {
  return (
    <>
    <span className="vd-obj-tones">
      {lang === 'en' ? 'Tone' : 'Tono'}:
      <span aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((v) => <i key={v} style={{ background: `color-mix(in srgb, var(--color-text-primary) ${Math.round(12 + 70 * v)}%, var(--color-background))` }} />)}</span>
      0 → 100% {lang === 'en' ? 'without a tender' : 'sin licitación'}
    </span>
    {/* its own unbreakable group: the line may wrap between the two keys (390), never run off the edge */}
    {' '}<span className="vd-obj-tones"><i className="vd-obj-hatch" aria-hidden="true" /> {lang === 'en' ? 'hatched = no data (before 2011)' : 'rayado = sin dato (antes de 2011)'}</span>
    </>
  )
}

/** An element's rendered height (Albers: the squares' stage matches the term card). */
function useHeight(ref: RefObject<HTMLElement | null>) {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setH((o) => (Math.abs(o - el.offsetHeight) > 1 ? el.offsetHeight : o)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return h
}

/** A tap on a phone opens the card below the stage: bring it into view (desktop: it is already beside). */
function useBringIntoView(ref: RefObject<HTMLElement | null>, seq: number, phone: boolean) {
  useEffect(() => {
    if (!seq || !phone) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [seq]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The block's frame: § kicker, the claim (one number), the plane toggle; the stage and its side column. */
function ObjectBlock({ id, kicker, claims, flat, setFlat, gl, stage, side, card, cardRef, wide, lang }: {
  id: string; kicker: string; claims: ObjClaim[]; flat: boolean; setFlat: (f: boolean) => void; gl: boolean
  stage: ReactNode; side: ReactNode; card: ReactNode; cardRef: RefObject<HTMLDivElement | null>; wide: boolean; lang: Lang
}) {
  const en = lang === 'en'
  const [lead, ...rest] = claims
  return (
    <section className="vd-obj" aria-labelledby={`${id}-h`}>
      <div className="vd-obj-h">
        <span className="vd-obj-k">§ {kicker}</span>
        <h3 id={`${id}-h`}>{lead ? (en ? lead.en : lead.es) : kicker}</h3>
        {gl && (
          <button type="button" className="vd-obj-flat" aria-pressed={flat} onClick={() => setFlat(!flat)}>
            {flat ? (en ? 'see it in volume ↑' : 'ver en volumen ↑') : (en ? 'see it flat ↓' : 'ver en plano ↓')}
          </button>
        )}
      </div>
      {wide ? (
        // Albers: the squares beside the term's card (the stage matches the card's height), the reading below
        <>
          <div className="vd-obj-b is-wide">
            <div className="vd-obj-stage">{stage}</div>
            <div ref={cardRef} className="vd-obj-card">{card}</div>
          </div>
          <div className="vd-obj-text is-below">
            {rest.map((c) => <p key={c.key} className="vd-obj-claim">{en ? c.en : c.es}</p>)}
            {side}
          </div>
        </>
      ) : (
        <div className="vd-obj-b">
          <div className="vd-obj-stage">{stage}</div>
          <div className="vd-obj-side">
            <div className="vd-obj-text">
              {rest.map((c) => <p key={c.key} className="vd-obj-claim">{en ? c.en : c.es}</p>)}
              {side}
            </div>
            <div ref={cardRef} className="vd-obj-card">{card}</div>
          </div>
        </div>
      )}
    </section>
  )
}

// ═══ «La columna» ═══
export function VendorColumna({ data, vendorId, caseSpan, lang }: {
  data: VendorInstitutionsTimelineResponse | undefined
  vendorId: number
  caseSpan?: { from: number; to: number } | null
  lang: Lang
}) {
  const en = lang === 'en'
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const phone = width > 0 && width < 640
  const [flat, setFlat] = useState(false)
  const [gl, setGl] = useState(true)
  const [hot, setHot] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [seq, setSeq] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  useBringIntoView(cardRef, seq, phone)
  const m = useMemo(() => (data ? buildExpediente(data) : null), [data])
  const mods = useMemo(() => (m ? columnModules(m, caseSpan) : []), [m, caseSpan])
  const spec = useMemo(() => columnSpec(mods, lang, phone), [mods, lang, phone])
  const claims = useMemo(() => columnClaims(mods), [mods])
  // the side holds the year in hand: the one read (hover, ↑/↓), else the one opened (click, Enter), else the widest
  const onOpen = useCallback((i: number) => { setPinned(mods[i].year); setSeq((n) => n + 1) }, [mods])
  const onStatus = useCallback((s: string) => setGl(s !== 'nogl'), [])
  if (!m || mods.length < 2) return <div ref={ref} />
  // by its module count. Desktop used to follow the side's measured height, but that ref was null when the effect
  // ran (this early-returns before data), so it stayed 0 and every record got 380 px: 25 years = 15 px a module, a hairline.
  // On desktop the side (key + card) is sticky beside a taller column (vendor.css).
  const byCount = 60 + mods.length * 22
  const h = phone ? Math.min(520, Math.max(240, byCount)) : Math.min(620, Math.max(380, byCount))
  const live = mods.filter((d) => d.n > 0)
  const year = hot != null ? mods[hot].year : pinned ?? live.reduce((b, d) => (d.amount > b.amount ? d : b), live[0]).year
  const pick: Pick = { year, lane: null, from: null }
  const nav = { scrub: null, setScrub: () => {}, pick, setPick: () => {}, say: () => {}, contractsHref: `/contracts?vendor_id=${vendorId}` }
  const twin = {
    caption: en ? 'The column as a list: one row per year.' : 'La columna como lista: una fila por año.',
    head: [en ? 'Year' : 'Año', en ? 'Money' : 'Dinero', en ? 'Contracts' : 'Contratos', en ? 'Without a tender' : 'Sin licitación'],
    rows: mods.map((d) => [d.year, d.n ? formatCompactMXN(d.amount) : '—', d.n ? formatNumber(d.n) : '—', d.da != null ? pct(d.da) : '—']),
  }
  return (
    <div ref={ref}>
      <ObjectBlock id="vd-col" kicker={en ? 'The column' : 'La columna'} claims={claims} flat={flat} setFlat={setFlat} gl={gl} wide={false} lang={lang} cardRef={cardRef}
        card={!flat && <YearCard quiet m={m} pick={pick} nav={nav} lang={lang} back={() => {}} />}
        stage={
          <Defer minHeight={h}>
            <Sculpture spec={spec} height={h} flat={flat} twin={twin} onOpen={onOpen} onStatus={onStatus} onHot={setHot}
              label={en
                ? 'The column in volume: one module per year, width = money, tone = share without a tender. Up and down arrows walk the years, Enter opens one, left and right turn it.'
                : 'La columna en volumen: un módulo por año, anchura = dinero, tono = parte sin licitación. Las flechas ↑ ↓ recorren los años, Enter abre uno, ← → la giran.'} />
          </Defer>
        }
        side={
          <>
            <p className="vd-obj-key">
              {en
                ? <><b>one module = one year</b> ({mods[0].year} at the base) · <b>width</b> = money of the year (linear, no floor) · <b>tone</b> = share of its contracts without a tender · <b>hatched</b> = before 2011, no procedure on record (no data, not a low share) · <b>dotted</b> = no contracts · <b>ink plate</b> = a new administration{caseSpan ? <> · <b>red</b> = years of the documented case</> : null}.</>
                : <><b>un módulo = un año</b> ({mods[0].year} en la base) · <b>anchura</b> = dinero del año (lineal, sin piso) · <b>tono</b> = parte de sus contratos sin licitación · <b>rayado</b> = antes de 2011, sin procedimiento registrado (sin dato, no una parte baja) · <b>punteado</b> = sin contratos · <b>placa de tinta</b> = cambio de sexenio{caseSpan ? <> · <b>rojo</b> = años del caso documentado</> : null}.</>}
              {' '}<Tones lang={lang} />
            </p>
            <p className="vd-obj-credit">{en ? 'After Constantin Brancusi, “Endless Column” (1918–1938).' : 'Según Constantin Brancusi, «Columna sin fin» (1918–1938).'}</p>
          </>
        } />
    </div>
  )
}

function TermCard({ term, institutionId, lang }: { term: Slab; institutionId: number; lang: Lang }) {
  const en = lang === 'en'
  return (
    <div className="vd-exp-card">
      <div className="vd-exp-card-h">
        <b>{term.chapter.name}</b>
        <span>{term.chapter.from}–{term.chapter.to}</span>
      </div>
      <dl className="vd-exp-card-d">
        <div><dt>{en ? 'Money' : 'Dinero'}</dt><dd>{formatDualCurrency(term.chapter.amount)}<small> · {pct(term.chapter.share)} {en ? 'of the record' : 'del expediente'}</small></dd></div>
        <div><dt>{en ? 'Contracts' : 'Contratos'}</dt><dd>{formatNumber(term.chapter.n)}</dd></div>
        <div><dt>{en ? 'Without a tender' : 'Sin licitación'}</dt><dd>{term.chapter.da != null ? pct(term.chapter.da) : (en ? 'not recorded before 2011' : 'sin registro antes de 2011')}</dd></div>
      </dl>
      <ul className="vd-exp-card-l" aria-label={en ? 'Its largest suppliers of the term' : 'Sus mayores proveedores del sexenio'}>
        {term.inner.map((r) => (
          <li key={r.lane.id}>
            <i style={{ background: r.lane.color }} aria-hidden="true" />
            <EntityIdentityChip type="vendor" id={r.lane.id} name={r.lane.name} variant="name" className="vd-exp-chip">{laneName(r.lane, lang)}</EntityIdentityChip>
            <span>{pct(r.share)}</span>
          </li>
        ))}
      </ul>
      <p className="vd-exp-card-a">
        <Link className="ct-link" to={`/contracts?institution_id=${institutionId}`}>{en ? 'Open its contracts →' : 'Abrir sus contratos →'}</Link>
      </p>
    </div>
  )
}

// ═══ «Homenaje al cuadrado» ═══
export function InstitutionAlbers({ data, institutionId, lang }: {
  data: InstitutionVendorsTimelineResponse | undefined
  institutionId: number
  lang: Lang
}) {
  const en = lang === 'en'
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const phone = width > 0 && width < 640
  const [flat, setFlat] = useState(false)
  const [gl, setGl] = useState(true)
  const [hot, setHot] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [seq, setSeq] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const cardH = useHeight(cardRef)
  useBringIntoView(cardRef, seq, phone)
  const m = useMemo(() => (data ? buildExpediente(data) : null), [data])
  const slabs = useMemo(() => (m ? albersSlabs(m) : []), [m])
  const spec = useMemo(() => albersSpec(slabs, lang, phone), [slabs, lang, phone])
  const claims = useMemo(() => albersClaims(slabs), [slabs])
  // a pick key is «chapter» or «chapter:lane»: either opens the term
  const termOf = useCallback((i: number) => slabs.findIndex((s) => s.chapter.key === spec.picks[i].key.split(':')[0]), [slabs, spec])
  const onOpen = useCallback((i: number) => { setPinned(termOf(i)); setSeq((n) => n + 1) }, [termOf])
  const onStatus = useCallback((s: string) => setGl(s !== 'nogl'), [])
  if (!m || slabs.length < 2) return <div ref={ref} />
  // the box takes the squares' own aspect (no empty paper above and below) plus the label room
  // phone: the squares' own aspect plus label room; desktop: as tall as the term's card beside it (they end together;
  // the squares fit inside either way)
  const h = Math.round(phone ? Math.min(420, Math.max(160, width * (spec.aspect ?? 0.3) + 2 * spec.margin.y + 28)) : Math.max(220, cardH - 24))
  const twin = {
    caption: en ? 'The squares as a list: one row per administration and its three largest suppliers.' : 'Los cuadrados como lista: una fila por sexenio y sus tres mayores proveedores.',
    head: [en ? 'Administration' : 'Sexenio', en ? 'Money' : 'Dinero', en ? 'Share' : 'Parte', en ? 'Without a tender' : 'Sin licitación', en ? 'Largest suppliers' : 'Mayores proveedores'],
    rows: slabs.map((s) => [`${s.chapter.name} ${s.chapter.from}–${s.chapter.to}`, formatCompactMXN(s.chapter.amount), pct(s.chapter.share), s.chapter.da != null ? pct(s.chapter.da) : '—',
      s.inner.map((r) => `${laneName(r.lane, lang)} ${pct(r.share)}`).join(' · ')]),
  }
  const ti = hot != null ? termOf(hot) : pinned ?? slabs.reduce((b, s, k) => (s.chapter.amount > slabs[b].chapter.amount ? k : b), 0)
  const term = !flat && ti >= 0 ? slabs[ti] : null
  return (
    <div ref={ref}>
      <ObjectBlock id="inst-alb" kicker={en ? 'Homage to the square' : 'Homenaje al cuadrado'} claims={claims} flat={flat} setFlat={setFlat} gl={gl} wide lang={lang} cardRef={cardRef}
        card={term && <TermCard term={term} institutionId={institutionId} lang={lang} />}
        stage={
          <Defer minHeight={h}>
            <Sculpture spec={spec} height={h} flat={flat} twin={twin} onOpen={onOpen} onStatus={onStatus} onHot={setHot}
              label={en
                ? 'One square per administration: area = money, tone = share without a tender; inside, its three largest suppliers. Up and down arrows walk the squares, Enter opens one.'
                : 'Un cuadrado por sexenio: área = dinero, tono = parte sin licitación; dentro, sus tres mayores proveedores. Las flechas ↑ ↓ recorren los cuadrados, Enter abre uno.'} />
          </Defer>
        }
        side={
          <>
            <p className="vd-obj-key">
              {en
                ? <><b>one square = one administration</b> · <b>area</b> = its money (side = square root) · <b>tone</b> = share of its contracts without a tender · <b>hatched</b> = before 2011, no procedure on record (no data) · <b>inner squares</b> = its three largest among the institution's {m.lanes.length} largest suppliers, area = their money on the same scale (never shrunk to fit), each a step higher.</>
                : <><b>un cuadrado = un sexenio</b> · <b>área</b> = su dinero (lado = raíz) · <b>tono</b> = parte de sus contratos sin licitación · <b>rayado</b> = antes de 2011, sin procedimiento registrado (sin dato) · <b>cuadrados interiores</b> = sus tres mayores entre los {m.lanes.length} mayores proveedores de la institución, área = su dinero en la misma escala (nunca reducida para caber), cada uno un escalón más alto.</>}
              {' '}<Tones lang={lang} />
            </p>
            <p className="vd-obj-credit">{en ? 'After Josef Albers, “Homage to the Square” (1950–1976).' : 'Según Josef Albers, «Homenaje al cuadrado» (1950–1976).'}</p>
          </>
        } />
    </div>
  )
}
