/**
 * «El relevo de 2018» — interactive story (concept A «El pulso», owner pick 2026-10-20).
 * Hosted by StoryNarrative through `StoryDef.component = 'relevo2018'`.
 *
 *   L0  the thirteen-year pulse rises left → right once per session, then the camera dives into 2018
 *   L1  hover any mark = one mono tip; ledger rows ⇄ marks light each other
 *   L2  click a mark = the dock (week · institution · cohort cut · distributor block)
 *   L3  the dock opens an institution's / a distributor's contracts → /contracts/:id
 *   L5  ?cap=cierre|instituciones|barrido|medicinas|2024 · «Citar» copies one sentence + its URL
 *   keys ↓ ↑ j k PageDown PageUp step the chapters while the story is on screen
 *
 * Data: /data/relevo2018.json (backend/scripts/extract_relevo2018.py, read-only on the DB).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { CATEGORICAL, FLAG_THRESHOLD, SECTORS } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { buildCopy, CHAPTER_KEYS, DISTS, ERAS, f0, fmt, pcInt, type Chapter, type Lang, type RelevoData, type Row } from './copy'
import { createInstrument, PHASE_TEXT, STEPS, type Instrument, type Pick } from './instrument'
import './relevo2018.css'

const SLUG = 'el-relevo-de-2018'
const BEAT_KEY = 'rubli_beat_relevo2018'
const secCode = (id: number) => SECTORS.find((s) => s.id === id)?.code ?? 'otros'
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** `**bold**` runs → <b>. */
function rich(s: string) {
  return s.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))
}

/** A claim numeral: shows its final value until its chapter first arms, then counts up once (700 ms). */
function Count({ to, run }: { to: number; run: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!run || !el || reducedMotion()) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => { const k = Math.max(0, Math.min(1, (now - t0) / 700)); el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); el.textContent = String(to) }
  }, [run, to])
  return <span ref={ref} className="rl-n">{to}</span>
}

function useData() {
  return useQuery({
    queryKey: ['story', 'relevo2018'],
    queryFn: async (): Promise<RelevoData> => { const r = await fetch('/data/relevo2018.json'); if (!r.ok) throw new Error(`relevo2018.json ${r.status}`); return r.json() },
    staleTime: Infinity,
  })
}

export default function Relevo2018() {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es'
  const q = useData()
  const R = q.data
  const copy = useMemo(() => (R ? buildCopy(R, lang) : null), [R, lang])
  const { T } = fmt(lang)

  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const chRefs = useRef<(HTMLElement | null)[]>([])
  const inst = useRef<Instrument | null>(null)
  const [armed, setArmed] = useState(false)
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState<Set<number>>(() => new Set())
  const [mark, setMark] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [cited, setCited] = useState<string | null>(null)

  const absTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY
  const scrollToCh = useCallback((i: number, instant = false) => {
    const el = chRefs.current[i], stage = stageRef.current
    if (!el || !stage) return
    window.scrollTo({ top: Math.max(0, absTop(el) - stage.offsetHeight - 8), behavior: instant || reducedMotion() ? 'auto' : 'smooth' })
  }, [])

  // build the instrument once per data × language; L0 beat on the first visit of the session
  useEffect(() => {
    const host = hostRef.current
    if (!R || !host) return
    const ins = createInstrument(host, R, lang, { onMark: setMark, onPick: setPick })
    inst.current = ins
    const cap = new URLSearchParams(window.location.search).get('cap')
    const start = Math.max(0, CHAPTER_KEYS.indexOf(cap as Chapter['key']))
    let first = true
    try { first = !sessionStorage.getItem(BEAT_KEY); sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private mode: beat every time */ }
    const arm = () => { ins.go(start); setStep(start); setArmed(true); if (cap) scrollToCh(start, true) }
    if (first && !cap) ins.beat(arm); else arm()
    const ro = new ResizeObserver(() => ins.resize())
    ro.observe(host)
    return () => { ro.disconnect(); ins.destroy(); inst.current = null; setArmed(false) }
  }, [R, lang, scrollToCh])

  // scroll drives the chapters: the active one is the last whose top crossed the instrument's foot
  useEffect(() => {
    if (!armed) return
    const onScroll = () => {
      const stage = stageRef.current; if (!stage) return
      const line = stage.getBoundingClientRect().bottom + 24
      let best = 0
      chRefs.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= line) best = i })
      setStep(best)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [armed])

  useEffect(() => {
    if (!armed) return
    inst.current?.go(step)
    setSeen((s) => (s.has(step) ? s : new Set(s).add(step)))
    const u = new URL(window.location.href)
    if (step === 0 && !u.searchParams.has('cap')) return
    u.searchParams.set('cap', CHAPTER_KEYS[step])
    window.history.replaceState(window.history.state, '', u)
  }, [step, armed])

  useEffect(() => { inst.current?.mark(mark) }, [mark])

  // keys: ↓ ↑ j k PageDown PageUp while the story is on screen; Esc closes the dock
  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Escape') { setPick(null); return }
      const last = chRefs.current[chRefs.current.length - 1], stage = stageRef.current
      if (!last || !stage) return
      const r = stage.parentElement!.getBoundingClientRect()
      if (r.top > window.innerHeight * 0.5 || r.bottom < window.innerHeight * 0.5) return
      const down = e.key === 'ArrowDown' || e.key === 'j' || e.key === 'PageDown'
      const up = e.key === 'ArrowUp' || e.key === 'k' || e.key === 'PageUp'
      if (!down && !up) return
      const next = step + (down ? 1 : -1)
      if (next < 0 || next >= CHAPTER_KEYS.length) return
      e.preventDefault(); setStep(next); scrollToCh(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, step, scrollToCh])

  const cite = (c: Chapter) => {
    const sentence = `${c.claim.a}${c.claim.n ?? ''}${c.claim.b}`.trim()
    const url = `${window.location.origin}/stories/${SLUG}?cap=${c.key}`
    const text = `${sentence} — RUBLI, «${copy!.title}». ${url}`
    navigator.clipboard?.writeText(text).then(() => { setCited(c.key); window.setTimeout(() => setCited(null), 1800) }, () => setCited(null))
  }

  if (q.isError) return <p className="rl-err">{T('No se pudieron cargar los datos de esta historia.', 'The data for this story could not be loaded.')}</p>

  return (
    <div className="rl" data-step={step}>
      <header className="rl-cover">
        <h1><small>{copy?.kicker ?? T('Historia', 'Story')}</small>{copy?.title ?? T('El relevo de 2018', 'The 2018 handover')}</h1>
        <p className="rl-lede">{copy?.lede}</p>
      </header>

      <div className="rl-stage" ref={stageRef}>
        <div className="rl-plot" ref={hostRef} aria-busy={!R}>
          <svg role="img" aria-label={T('Dinero federal contratado por semana, 2013–2025, y la capa de cada capítulo', 'Federal money contracted per week, 2013–2025, and each chapter’s layer')} />
          <div className="rl-tip" hidden role="status" />
        </div>
        <Legend step={step} lang={lang} />
        {pick && R && <Dock pick={pick} R={R} lang={lang} onClose={() => setPick(null)} />}
      </div>

      {copy && copy.chapters.map((c, i) => (
        <section key={c.key} id={`cap-${c.key}`} ref={(el) => { chRefs.current[i] = el }} className={`rl-ch${i === step ? ' on' : ''}${seen.has(i) ? ' seen' : ''}`} aria-labelledby={`cap-${c.key}-h`}>
          <div className="rl-text">
            <p className="rl-kick">
              <span>§ {c.num}</span><b>{c.kick}</b>
              <span className="rl-era" style={{ color: CATEGORICAL[ERAS.find((e) => e.k === c.era)!.c] }}>{ERAS.find((e) => e.k === c.era)!.n}</span>
            </p>
            <h2 className="rl-claim" id={`cap-${c.key}-h`}>{c.claim.a}{c.claim.n != null && <Count to={c.claim.n} run={seen.has(i)} />}{c.claim.b}</h2>
            <p className="rl-sent">{c.sents.map((s, k) => <Fragment key={k}>{k > 0 && ' '}{rich(s)}</Fragment>)}</p>
          </div>
          <div className="rl-side">
            <Ledger rows={c.ledger} R={R!} mark={mark} setMark={setMark} />
            <p className="rl-src">
              {T('Fuentes', 'Sources')}{' · '}
              {c.src.map(([n, u], k) => <Fragment key={u}>{k > 0 && ' · '}<a href={u} target="_blank" rel="noopener noreferrer">{n}</a></Fragment>)}
            </p>
            <div className="rl-act">
              <button type="button" className="rl-btn" onClick={() => cite(c)}>{cited === c.key ? T('Copiado', 'Copied') : T('Citar', 'Cite')}</button>
              <span className="rl-hint" aria-live="polite">{cited === c.key ? T('una oración y su enlace, en el portapapeles', 'one sentence and its link, on the clipboard') : `?cap=${c.key}`}</span>
            </div>
          </div>
        </section>
      ))}
      {copy && <p className="rl-foot">{copy.foot}</p>}
    </div>
  )
}

function Ledger({ rows, R, mark, setMark }: { rows: Chapter['ledger']; R: RelevoData; mark: string | null; setMark: (m: string | null) => void }) {
  return (
    <div className="rl-ledg">
      {rows.map((r, i) => (
        <div key={i} className={`rl-row${r.mk && r.mk === mark ? ' on' : ''}`} onPointerEnter={() => r.mk && setMark(r.mk)} onPointerLeave={() => r.mk && setMark(null)}>
          <span className="rl-k">
            {r.inst != null
              ? <EntityIdentityChip type="institution" id={r.inst} name={r.k} size="sm" sectorCode={secCode(R.inst_names[r.inst]?.c ?? 12)} fullName inline hideIcon />
              : r.k}
          </span>
          <span className="rl-tr">{r.s != null && <i style={{ ['--s' as string]: Math.min(1, r.s) }} />}</span>
          <span className="rl-v">{rich(r.v)}</span>
        </div>
      ))}
    </div>
  )
}

function Legend({ step, lang }: { step: number; lang: Lang }) {
  const { T } = fmt(lang)
  const kind = STEPS[step]?.y
  return (
    <div className="rl-legend">
      {(kind === 'money' && step === 0) && <>
        {SECTORS.map((s) => <span key={s.id} className="rl-lg-sec"><i style={{ background: `color-mix(in srgb, ${s.color} 46%, white)` }} />{lang === 'en' ? s.nameEN : s.name}</span>)}
        <span className="rl-lg-m">{T('color = sector', 'colour = sector')}</span>
        <span><i className="rl-sw-line" />{T('mediana 2013–2017', '2013–2017 median')}</span>
        <span><i className="rl-sw-cp" />CFE · PEMEX</span>
        <span><i className="rl-sw-red" />{T('cierre, 23 ago – 30 nov', 'shutdown, 23 Aug – 30 Nov')}</span>
      </>}
      {kind === 'ratio' && <>
        <span><i className="rl-sw-lo" />{T('bajo 0.7 de su propio ritmo', 'under 0.7 of its own pace')}</span>
        <span><i className="rl-sw-hi" />{T('0.7 o más', '0.7 or more')}</span>
        <span>{T('color = sector de la institución · cada cuadro, una institución', 'colour = the institution’s sector · each square, one institution')}</span>
      </>}
      {(kind === 'coh' || step === 4) && <>
        {ERAS.map((e) => <span key={e.k}><i style={{ background: CATEGORICAL[e.c] }} />{e.n}</span>)}
        <span><i className="rl-sw-lost" />{T('dejaron de venderle al gobierno', 'stopped selling to the government')}</span>
        <span>{T('color = gobierno en el que cae el corte', 'colour = the government the cut falls in')}</span>
      </>}
      {kind === 'none' && <>
        {DISTS.map((d) => <span key={d.k}><i style={{ background: CATEGORICAL[d.c] }} />{d.n}</span>)}
        <span><i className="rl-sw-open" />{T('licitación abierta', 'tender open')}</span>
        <span><i className="rl-sw-hatch" />{T('fallada bajo Peña Nieto', 'awarded under Peña Nieto')}</span>
        <span><i className="rl-sw-solid" />{T('fallada o adjudicada bajo López Obrador', 'awarded under López Obrador')}</span>
        <span><i className="rl-sw-red" />{T('veto', 'veto')}</span>
      </>}
      <span className="rl-keys">↓ ↑ {T('capítulos · clic en una marca: detalle', 'chapters · click a mark: detail')}</span>
    </div>
  )
}

/** One contract row of a drill list: the contract link, buyer and vendor chips. */
function ContractRow({ r, R, lang, showBuyer = true }: { r: Row; R: RelevoData; lang: Lang; showBuyer?: boolean }) {
  const { dshort, T } = fmt(lang)
  const [id, d, a, ins, vid, vn, da, pn] = r
  return (
    <li className="rl-crow">
      <Link to={`/contracts/${id}`} className="rl-clink">
        <span>{dshort(d)} {d.slice(0, 4)}</span>
        <b>{formatCompactMXN(a)}{a > FLAG_THRESHOLD ? ' †' : ''}</b>
        <span>{pn ?? (da ? T('adjudicación directa', 'direct award') : T('procedimiento competido', 'competitive procedure'))}</span>
      </Link>
      <span className="rl-cchips">
        {showBuyer && ins != null && <EntityIdentityChip type="institution" id={ins} name={R.inst_lbl[ins] ?? String(ins)} size="xs" hideIcon fullName inline />}
        {vid != null && <EntityIdentityChip type="vendor" id={vid} name={vn} size="xs" hideIcon fullName inline />}
      </span>
    </li>
  )
}

function Dock({ pick, R, lang, onClose }: { pick: Pick; R: RelevoData; lang: Lang; onClose: () => void }) {
  const { T, dlong, bn, en } = fmt(lang)
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setOpen(false); closeRef.current?.focus({ preventScroll: true }) }, [pick])
  let head: React.ReactNode = null, body: React.ReactNode = null
  if (pick.kind === 'week') {
    const w = R.weeks[pick.i], rows = R.drill_week[w.w] ?? []
    const secs = w.s.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 6)
    const max = secs[0]?.[0] || 1
    head = <><small>{T('Semana', 'Week')}</small>{T('semana del', 'week of')} {dlong(w.w)}</>
    body = <>
      <p className="rl-dfig"><b>{bn(w.vx)}</b> · {f0(w.nx)} {T('contratos, sin CFE ni PEMEX', 'contracts, excl. CFE and PEMEX')}{w.v - w.vx > 5e7 ? <> · {T('con ellas', 'with them')} {bn(w.v)}</> : null}</p>
      <ul className="rl-dlist">{secs.map(([v, k]) => <li key={k} className="rl-drow"><span><i className="rl-sq" style={{ background: SECTORS[k].color }} />{en ? SECTORS[k].nameEN : SECTORS[k].name}</span><span className="rl-tr"><i style={{ ['--s' as string]: v / max, background: SECTORS[k].color }} /></span><span>{formatCompactMXN(v * 1e6)}</span></li>)}</ul>
      {rows.length > 0
        ? <><p className="rl-dsub">{T('Los contratos más grandes de la semana', 'The week’s largest contracts')}</p><ul className="rl-clist">{rows.map((r) => <ContractRow key={r[0]} r={r} R={R} lang={lang} />)}</ul></>
        : <p className="rl-dnote">{T('La lista de contratos por semana cubre de julio de 2017 a junio de 2019.', 'The weekly contract list covers July 2017 to June 2019.')}</p>}
    </>
  } else if (pick.kind === 'inst') {
    const n = R.inst_names[pick.id]
    const paces = [2016, 2017, 2018, 2019, 2021].map((y) => [y, R.inst[String(y)].r.find(([id]) => id === pick.id)?.[1]] as const)
    head = <><small>{T('Institución', 'Institution')}</small><EntityIdentityChip type="institution" id={pick.id} name={n?.n ?? String(pick.id)} size="md" sectorCode={secCode(n?.c ?? 12)} fullName /></>
    body = <>
      <p className="rl-dfig">{T('Ritmo propio en el otoño (23 ago – 30 nov ÷ enero–julio, contra su mediana 2013–2017)', 'Own autumn pace (23 Aug – 30 Nov ÷ January–July, against its 2013–2017 median)')}</p>
      <ul className="rl-dlist">{paces.map(([y, r]) => <li key={y} className={`rl-drow${y === 2018 ? ' is18' : ''}`}><span>{T('otoño', 'autumn')} {y}</span><span className="rl-tr rl-tr07">{r != null && <i style={{ ['--s' as string]: Math.min(1, r / 2) }} />}</span><span>{r != null ? r.toFixed(2) : T('sin dato', 'no data')}</span></li>)}</ul>
      {n && <p className="rl-dnote">23 {en ? 'Aug' : 'ago'} – 30 nov 2018: <b>{formatCompactMXN(n.w18)}</b> · {T('promedio 2013–2017 del mismo tramo', '2013–2017 average, same stretch')} {formatCompactMXN(n.base)}</p>}
      {n && n.k.n > 0 && <>
        <button type="button" className="rl-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? T('Cerrar sus contratos', 'Close its contracts') : T(`Abrir sus ${f0(n.k.n)} contratos del otoño de 2018`, `Open its ${f0(n.k.n)} contracts of autumn 2018`)}</button>
        {open && <ul className="rl-clist">{n.k.k.map((r) => <ContractRow key={r[0]} r={r} R={R} lang={lang} showBuyer={false} />)}{n.k.n > n.k.k.length && <li className="rl-dnote">{T(`Los ${n.k.k.length} más grandes de ${f0(n.k.n)}`, `The ${n.k.k.length} largest of ${f0(n.k.n)}`)}</li>}</ul>}
      </>}
    </>
  } else if (pick.kind === 'cut') {
    const d = R.surv.find((s) => s.t === pick.t)!
    head = <><small>{T('Corte de proveedores', 'Vendor cut')}</small>{T('corte del', 'cut of')} {dlong(d.t)}</>
    body = <ul className="rl-dlist">
      <li className="rl-drow"><span>{T('Proveedores con más de 1 MDP en los doce meses previos', 'Vendors with more than 1 M MXN in the twelve months before')}</span><span /><span>{f0(d.c_n)}</span></li>
      <li className="rl-drow"><span>{T('Volvieron a firmar en doce meses', 'Signed again within twelve months')}</span><span className="rl-tr"><i style={{ ['--s' as string]: d.c_y1 ?? 0 }} /></span><span>{pcInt(d.c_y1 ?? 0)}%</span></li>
      {d.rfc_y1 != null && <li className="rl-drow"><span>{T('Con RFC de empresa', 'By company tax id')}</span><span className="rl-tr"><i style={{ ['--s' as string]: d.rfc_y1 }} /></span><span>{pcInt(d.rfc_y1)}%</span></li>}
      {d.c_y2 != null && <li className="rl-drow"><span>{T('Segundo año', 'Year two')}{d.t >= '2018' && d.t < '2020' ? ` (${T('cruza con la pandemia', 'overlaps the pandemic')})` : ''}</span><span className="rl-tr"><i style={{ ['--s' as string]: d.c_y2 }} /></span><span>{pcInt(d.c_y2)}%</span></li>}
      {d.t === '2024-10-01' && <li className="rl-dnote">{T('Solo CompraNet, hasta el 28 de septiembre de 2025: dos días antes de cerrar el año.', 'CompraNet only, to 28 September 2025: two days short of the year.')}</li>}
    </ul>
  } else {
    const dist = DISTS.find((x) => x.k === pick.d)!, info = R.meds.dist[pick.d], dr = R.meds.drill[pick.d]
    const procs = R.meds.procs.filter((p) => p.phase === pick.p && (p.split[pick.d] ?? 0) > 0).sort((a, b) => (b.split[pick.d] ?? 0) - (a.split[pick.d] ?? 0)).slice(0, 6)
    head = <><small>{T('Distribuidora', 'Distributor')}</small><EntityIdentityChip type="vendor" id={dr.vid} name={dist.n} size="md" sectorCode="salud" fullName /></>
    body = <>
      <p className="rl-dfig"><b>{bn((info.phases[pick.p] ?? 0) * 1e9)}</b> · {en ? PHASE_TEXT[pick.p].en : PHASE_TEXT[pick.p].es}</p>
      {procs.length > 0 && <ul className="rl-dlist">{procs.map((p) => <li key={p.id} className="rl-prow"><span className="rl-pn">{p.id}<small>{p.buyer} · {T('publicada', 'published')} {p.pub ?? '—'} · {T('fallo', 'award')} {p.award ?? '—'}</small></span><span>{bn((p.split[pick.d] ?? 0) * 1e9)}</span></li>)}</ul>}
      <button type="button" className="rl-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? T('Cerrar sus contratos', 'Close its contracts') : T(`Abrir sus ${f0(dr.n)} contratos del 1 dic 2018 al 10 mar 2019`, `Open its ${f0(dr.n)} contracts, 1 Dec 2018 – 10 Mar 2019`)}</button>
      {open && <ul className="rl-clist">{dr.k.map((r) => <ContractRow key={r[0]} r={r} R={R} lang={lang} />)}{dr.n > dr.k.length && <li className="rl-dnote">{T(`Los ${dr.k.length} más grandes de ${f0(dr.n)}`, `The ${dr.k.length} largest of ${f0(dr.n)}`)}</li>}</ul>}
    </>
  }
  return (
    <aside className="rl-dock" role="dialog" aria-label={T('Detalle de la marca', 'Mark detail')}>
      <div className="rl-dhead"><h3>{head}</h3><button ref={closeRef} type="button" className="rl-x" onClick={onClose} aria-label={T('Cerrar detalle (Esc)', 'Close detail (Esc)')}>×</button></div>
      {body}
    </aside>
  )
}
