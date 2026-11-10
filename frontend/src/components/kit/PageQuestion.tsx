/**
 * PageQuestion — the page's one guiding question and its reading: the one explanation template for every page
 * (owner 2026-11-03/04, docs/PAGE_QUESTIONS.md; memory feedback_explain_what_am_i_seeing): «hold the hands of our
 * users for a bit, and then we let them see» · «maintain an explanation and play with the graphic itself… why are we
 * having another graphic?».
 *
 * Two layers:
 *  1. The STRIP, always visible: the question as a small kicker (never a headline) and the finding («③ qué significa»,
 *     the strongest line), with the control «Cómo leer esto ▸». About three lines on a desktop.
 *  2. The TOUR, opened by the reader (never auto-forced): a short narration over the page's OWN chart — the explainroo
 *     method of the risk explainer's variant B (script first, each word timed by a reading pace, lib/narration.ts),
 *     smaller and with no second figure. ① qué es → ② cómo se lee are the script's two scenes; ③ qué significa is the
 *     finding itself. A word cue `[#name]` in the script moves the frame: the viewport dims around a ring on the part
 *     that word is about (`cues`: name → selector), and a callout with the caption sits beside it, joined by a leader
 *     line (the anatomy / diagram explainers' label plate: engraved numeral, sans label, thin connector). ③ frames the
 *     finding in the strip and carries the page's next questions as chips. Step dots seek; ‹ › Pausar · Listo · ← → Esc;
 *     focus moves in and back; a bottom sheet on a phone. Reduced motion: no clock, everything inked, steps by hand.
 *
 * On by default on every page (owner 2026-11-04: one look; the three ruled columns are retired); `?pq=0` hides it for
 * the session, for testing. API: question · see · read · means (+ `script`, `cues`, `targets`, `followups`,
 * `findingAt`). Text arrives in the reader's language. Look: kit.css `.pgs`.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useLang, type Lang } from '@/components/contrato/nav'
import { narrate, type NScene } from '@/lib/narration'
import './kit.css'

const LABELS = {
  es: ['', 'Cómo se lee', 'Qué significa', '', '', 'Cargando…', 'Qué es', 'Cómo leer esto', 'Cerrar la guía', 'Anterior', 'Siguiente', 'Paso', 'Y después', 'Guía de lectura', 'Listo', 'Pausar', 'Seguir', 'La respuesta está arriba, en la franja.'],
  en: ['', 'How to read it', 'What it means', '', '', 'Loading…', 'What this is', 'How to read this', 'Close the guide', 'Previous', 'Next', 'Step', 'And then', 'Reading guide', 'Done', 'Pause', 'Resume', 'The answer is above, in the strip.'],
} as const

export interface PageFollowup { label: ReactNode; to?: string; onClick?: () => void }

/** The strip is on by default; `?pq=0` hides it for the session (an escape for testing and clean screenshots, since
 *  El Mapa rewrites its URL); `?pq=1` brings it back. */
export function usePqOn(): boolean {
  const { search } = useLocation()
  const v = new URLSearchParams(search).get('pq')
  try {
    if (v === '0') sessionStorage.setItem('rubli-pq-off', '1')
    else if (v != null) sessionStorage.removeItem('rubli-pq-off')
    return !sessionStorage.getItem('rubli-pq-off')
  } catch {
    return v !== '0'
  }
}

export interface PageQuestionProps {
  /** A string = the board-voice kicker; a node (the /aria question bar, with its own controls) is rendered as is. */
  question: ReactNode
  /** A control on the question's row that changes what the strip describes (El Mapa's arrangement row; CYAN-2). */
  aside?: ReactNode
  /** The tour's two still steps when there is no `script`; with neither, the strip has no tour (a page with no chart). */
  see?: ReactNode
  read?: ReactNode
  /** The finding; null while its data loads (its slot stays reserved, never «—»). */
  means: ReactNode | null
  /** The page prints its finding itself (its h1): the strip leaves it out — one finding, not two — and ③ frames this
   *  selector, its callout repeating `means`. */
  findingAt?: string
  /** Defaults to the site language. */
  lang?: Lang
  /** The tour's narration, in the reader's language: `### 1` (qué es), `### 2` (cómo se lee) and optional `### 3`… scenes, one or two
   *  short sentences each, `[#name]` before a word = frame the part named in `cues` from that word on. Without it the
   *  tour shows `see` and `read` as two still steps. */
  script?: string
  /** Cue name → CSS selector of the part of the page it frames. */
  cues?: Record<string, string>
  /** The part each step frames before its first cue: [①, ②, ③]; a missing one frames the finding. */
  targets?: readonly (string | undefined)[]
  /** The reader's next questions (docs/PAGE_QUESTIONS.md), shown under ③ as chips. */
  followups?: readonly PageFollowup[]
  /** Only the «Cómo leer esto» control (for kit/PageHead's crumbs row, `actions`): the head prints the question and the
   *  finding, so the strip's own rows are left out. Pass `findingAt=".ph-finding"` so ③ frames the h1. */
  bare?: boolean
}

export function PageQuestion(props: PageQuestionProps) {
  const siteLang = useLang()
  const T = LABELS[props.lang ?? siteLang]
  const id = useId()
  if (!usePqOn()) return typeof props.question === 'string' || props.bare ? null : <>{props.question}</>
  return <Strip id={id} T={T} {...props} />
}

/* ───────────────────────────── the strip + the tour ───────────────────────────── */

type Labels = (typeof LABELS)['es'] | (typeof LABELS)['en']
const reduceQ = '(prefers-reduced-motion: reduce)'
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia(reduceQ).matches
const SLOW = 1.6
const HOLD = 5200 // ③ (and a still step) stays this long before the play ends

/** A follow-up that lands on another part of this page (its selector), for `PageFollowup.onClick`. */
export const jumpTo = (sel: string) => () => document.querySelector(sel)?.scrollIntoView?.({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' })

interface Scene { label: string; node?: ReactNode; n?: NScene; t0: number; t1: number; sel?: string }

/** The scenes on one clock: the script's (word-timed) or two stills, then the finding. */
function scenes(T: Labels, p: PageQuestionProps): Scene[] {
  const labels = [T[6], T[1], T[2]]
  const out: Scene[] = []
  let t = 0
  // reader 11-07 «too fast»: the tour reads at SLOW × the narration pace (the films keep theirs)
  const k = (ms: number) => ms * SLOW
  const narr = (p.script ? narrate(`## x\n${p.script}`, 'x').scenes : []).map((s) => ({
    ...s, t0: k(s.t0), t1: k(s.t1),
    words: s.words.map((w) => ({ ...w, t0: k(w.t0), t1: k(w.t1) })),
    cues: Object.fromEntries(Object.entries(s.cues).map(([c, v]) => [c, k(v)])),
  }))
  // demo tours (lib/tours.ts, owner 11-08 «highlight the elements, small pop-ups»): `### 3`, `### 4`… add «cómo se lee» steps
  for (let i = 0; i < Math.max(2, narr.length); i++) {
    const n = narr[i]
    const t1 = n ? t + (n.t1 - n.t0) : t + HOLD
    out.push({ label: labels[Math.min(i, 1)], node: n ? undefined : i === 0 ? p.see : p.read, n, t0: t, t1, sel: p.targets?.[i] })
    t = t1
  }
  const at = p.targets?.[out.length] ?? p.findingAt
  out.push({ label: labels[2], node: at ? p.means : T[17], t0: t, t1: t + HOLD, sel: at })
  return out
}

function Strip({ id, T, ...p }: PageQuestionProps & { id: string; T: Labels }) {
  const [open, setOpen] = useState(false)
  const [still] = useState(reduced)
  const [t, setT] = useState(0)        // the clock, ms from the tour's start
  const [playing, setPlaying] = useState(false)
  const tRef = useRef(0)
  const btn = useRef<HTMLButtonElement>(null)
  const fin = useRef<HTMLParagraphElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const tour = useRef<HTMLDivElement>(null)
  const sc = useMemo(() => scenes(T, p), [T, p.script, p.see, p.read, p.means, p.targets, p.findingAt]) // eslint-disable-line react-hooks/exhaustive-deps -- the fields `scenes` reads
  const n = sc.length
  const total = sc[n - 1].t1
  const i = Math.max(0, sc.findIndex((s) => t < s.t1)) // the scene the clock is in; the last one once it has ended
  const cur = t >= total ? n - 1 : i
  const step = open ? cur + 1 : 0

  const seek = (ms: number, play: boolean) => { tRef.current = ms; setT(ms); setPlaying(play && !still) }
  const openAt = (k: number) => { setOpen(true); seek(sc[k].t0, true) }
  const close = useCallback(() => { setOpen(false); setPlaying(false); btn.current?.focus() }, [])
  const dismiss = () => { setOpen(false); setPlaying(false) } // a follow-up leaves without pulling focus (and the scroll) back

  // the clock: one rAF loop while playing; a scene's cues and words key off it; it stops on the last frame
  useEffect(() => {
    if (!playing || !open) return
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      tRef.current = Math.min(total, tRef.current + Math.min(now - last, 64)); setT(tRef.current) // a hidden tab stops rAF: the time away must not jump the tour to its end
      last = now
      if (tRef.current >= total) { setPlaying(false); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, open, total])

  // Esc closes from anywhere (capture + stop, so the page's own Esc — El Mapa climbs a level — does not fire too)
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, close])
  const onKeys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && cur < n - 1) { e.preventDefault(); openAt(cur + 1) }
    if (e.key === 'ArrowLeft' && cur > 0) { e.preventDefault(); openAt(cur - 1) }
  }
  // focus lands on the tour when it opens (its heading, not a control: readers hear where they are first)
  useEffect(() => { if (open) tour.current?.focus() }, [open])

  // the part framed now: the scene's last cue the clock has passed, else the scene's own part, else the finding
  const s = sc[cur]
  let sel = s.sel
  if (s.n && p.cues) {
    let best = -1
    for (const [name, at] of Object.entries(s.n.cues)) { const when = s.t0 + (at - s.n.t0); if ((still || when <= t) && when >= best && p.cues[name]) { best = when; sel = p.cues[name] } }
  }
  const target = useCallback((): Element | null => (sel ? document.querySelector(sel) : null) ?? fin.current ?? row.current, [sel, cur]) // eslint-disable-line react-hooks/exhaustive-deps -- `cur` re-measures per step
  const keep = useCallback((): Element[] => [row.current].filter((e): e is HTMLDivElement => !!e), [])

  const chips = p.followups?.length ? (
    <div className="pgs-next">
      <span className="pgs-nextk">{T[12]}</span>
      {p.followups.map((f, k) => f.to
        ? <Link key={k} className="pgs-chip" to={f.to} onClick={() => { f.onClick?.(); dismiss() }}>{f.label}</Link>
        : <button key={k} type="button" className="pgs-chip" onClick={() => { f.onClick?.(); dismiss() }}>{f.label}</button>)}
    </div>
  ) : null
  const ended = t >= total
  const body = (
    <div ref={tour} tabIndex={-1} className="pgs-tour" onKeyDown={onKeys}>
      <ol className="pgs-steps" aria-live="polite">
        {sc.map((x, k) => (
          <li key={k} aria-current={cur === k ? 'step' : undefined} hidden={cur !== k}>
            <p className="pgs-l"><span className="pgs-mark" aria-hidden="true">{k + 1}</span>{x.label}</p>
            <div className="pgs-b">
              {x.n
                ? <p className="pgs-words">{x.n.words.map((w, j) => <span key={j} data-in={still || t >= x.t0 + (w.t0 - x.n!.t0) || undefined}>{w.w} </span>)}</p>
                : x.node}
              {k === n - 1 && chips}
            </div>
          </li>
        ))}
      </ol>
      <div className="pgs-ctl" role="group" aria-label={T[11]}>
        <button type="button" className="pgs-arrow" onClick={() => cur > 0 && openAt(cur - 1)} aria-disabled={cur <= 0 || undefined} aria-label={T[9]}>‹</button>
        <ol className="pgs-dots">
          {sc.map((x, k) => (
            <li key={k}>
              <button type="button" className="pgs-mark" aria-current={cur === k ? 'step' : undefined} data-done={cur > k || undefined} aria-label={`${T[11]} ${k + 1}: ${x.label}`} onClick={() => openAt(k)}>
                {k + 1}
                {!still && cur === k && !ended && <i className="pgs-prog" style={{ transform: `scaleX(${Math.min(1, (t - x.t0) / (x.t1 - x.t0))})` }} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="pgs-arrow" onClick={() => cur < n - 1 && openAt(cur + 1)} aria-disabled={cur >= n - 1 || undefined} aria-label={T[10]}>›</button>
        {!still && !ended && <button type="button" className="pgs-done" onClick={() => setPlaying((v) => !v)}>{playing ? T[15] : T[16]}</button>}
        <button type="button" className="pgs-done" onClick={close}>{T[14]}</button>
      </div>
    </div>
  )
  const opener = (p.script || p.see || p.read) && <button ref={btn} type="button" className="pgs-open" aria-expanded={open} aria-controls={`${id}-p`} onClick={() => (open ? close() : openAt(0))}>
    {open ? T[8] : T[7]}<span aria-hidden="true" className="pgs-caret">{open ? '▴' : '▸'}</span>
  </button>
  const callout = open && createPortal(<Callout T={T} id={`${id}-p`} step={step} anchor={target} keep={keep} onClose={close}>{body}</Callout>, document.body)
  if (p.bare) return <div ref={row} className="pgs-bare">{opener}{callout}</div>
  return (
    <section className="pgq pgs" aria-labelledby={`${id}-q`}>
      <div ref={row} className="pgs-row">
        {typeof p.question === 'string' ? <p id={`${id}-q`} className="pgs-q">{p.question}</p> : <div id={`${id}-q`} className="pgs-qx">{p.question}</div>}
        {p.aside}
        {opener}
      </div>
      {!p.findingAt && (
        <p ref={fin} className="pgs-f" aria-busy={p.means == null || undefined}>
          <span className="pgs-mark pgs-mark-f" aria-hidden="true">3</span>
          {p.means ?? <span className="pgq-hold"><span className="sr-only">{T[5]}</span></span>}
        </p>
      )}
      {callout}
    </section>
  )
}

/** The callout beside the part it describes (`place`), the dimmed viewport, the ring on the part and the leader line
 *  between them. A sheet on a phone. Tab wraps inside it (it lives at the end of the document); Esc and × return focus
 *  to the strip. */
function Callout({ T, id, step, anchor, keep, onClose, children }: {
  T: Labels; id: string; step: number; anchor: () => Element | null; keep: () => Element[]; onClose: () => void; children: ReactNode
}) {
  const r = useRect(anchor, step)
  const ks = useRects(keep)
  const box = useRef<HTMLDivElement>(null)
  const [H, setH] = useState(200)
  useLayoutEffect(() => { if (box.current) setH(box.current.offsetHeight) }, [step, r?.top, r?.height])
  const W = 340
  const phone = typeof window !== 'undefined' && window.innerWidth <= 760
  let style: CSSProperties = {}
  let at = { top: 0, left: 0 }
  if (r && !phone) {
    at = place(r, W, H, window.innerWidth, window.innerHeight)
    style = { top: at.top, left: at.left, width: W }
  }
  const wrap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const f = box.current.querySelectorAll<HTMLElement>('button, a[href]')
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  const pad = r && r.height > 320 ? 8 : 4 // a small part (a key, a line) gets a close ring, so it never strikes the row above
  const ring = r ? { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 } : null
  // the leader: from the callout's edge straight to the ring's, only when the callout sits outside the ring
  let lead: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (ring && !phone) {
    const x = Math.min(Math.max(at.left + 40, ring.x + 24), ring.x + ring.w - 24)
    const y = Math.min(Math.max(at.top + 24, ring.y + 12), ring.y + ring.h - 12)
    if (at.top >= ring.y + ring.h) lead = { x1: x, y1: at.top, x2: x, y2: ring.y + ring.h }
    else if (at.top + H <= ring.y) lead = { x1: x, y1: at.top + H, x2: x, y2: ring.y }
    else if (at.left >= ring.x + ring.w) lead = { x1: at.left, y1: y, x2: ring.x + ring.w, y2: y }
    else if (at.left + W <= ring.x) lead = { x1: at.left + W, y1: y, x2: ring.x, y2: y }
    if (lead && Math.hypot(lead.x1 - lead.x2, lead.y1 - lead.y2) < 6) lead = null
  }
  return (
    <>
      <svg className="pgs-spot" aria-hidden="true">
        <defs><mask id="pgs-hole">
          <rect className="pgs-keep" width="100%" height="100%" />
          {ring && <rect className="pgs-cut" x={ring.x} y={ring.y} width={ring.w} height={ring.h} />}
          {ks.map((k, i) => <rect key={i} className="pgs-cut" x={k.left - 4} y={k.top - 4} width={k.width + 8} height={k.height + 8} />)}
        </mask></defs>
        <rect width="100%" height="100%" mask="url(#pgs-hole)" />
        {lead && <g className="pgs-lead"><line x1={lead.x1} y1={lead.y1} x2={lead.x2} y2={lead.y2} /><circle cx={lead.x2} cy={lead.y2} r={3} /></g>}
      </svg>
      {ring && <div className="pgs-ring" aria-hidden="true" style={{ transform: `translate(${ring.x}px, ${ring.y}px)`, width: ring.w, height: ring.h }} />}
      <div ref={box} id={id} className="pgs-call" role="dialog" aria-label={T[13]} style={style} onKeyDown={wrap}>
        <button type="button" className="pgs-x" onClick={onClose} aria-label={T[8]}>×</button>
        {children}
      </div>
    </>
  )
}

/** Where the callout goes (desktop): beside the part — below, above, right, left, the first that fits the viewport
 *  without touching the ring — else (a part as big as the screen: the sky, a long list) in the viewport corner
 *  opposite the part's centre, top-right on a tie (clear of the charts' own controls at top-left). */
export function place(r: { top: number; bottom: number; left: number; right: number }, W: number, H: number, vw: number, vh: number) {
  const G = 28, M = 12
  const cx = (x: number) => Math.min(Math.max(16, x), vw - W - 16)
  const cy = (y: number) => Math.min(Math.max(M, y), Math.max(M, vh - H - M))
  const fits = (p: { top: number; left: number }) => p.top >= M && p.top + H <= vh - M && p.left >= 16 && p.left + W <= vw - 16
  const cands = [
    { top: r.bottom + G, left: cx(r.left) },
    { top: r.top - G - H, left: cx(r.left) },
    { top: cy(r.top), left: r.right + G },
    { top: cy(r.top), left: r.left - G - W },
  ]
  const hit = cands.find(fits)
  if (hit) return hit
  const mx = (Math.max(0, r.left) + Math.min(vw, r.right)) / 2, my = (Math.max(0, r.top) + Math.min(vh, r.bottom)) / 2
  return { top: my > vh / 2 ? cy(Math.max(r.top, 0) + 16) : cy(Math.min(r.bottom, vh) - H - 16), left: mx <= vw / 2 ? cx(Math.min(r.right, vw) - W - 16) : cx(Math.max(r.left, 0) + 16) }
}

/** The anchor's viewport rect, kept current on scroll and resize (and while the document grows); on a new `dep` the
 *  part is brought into view only when it is not: a small part lands centred, a tall one (the sky) by its top. */
function useRect(anchor: () => Element | null, dep: number) {
  const [r, setR] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const el = anchor()
    if (!el) { setR(null); return }
    if (dep && typeof window.scrollTo === 'function') {
      // one scroll call (a second smooth call would cancel the first); on a phone the sheet takes the lower ~45 %
      const b = el.getBoundingClientRect(), vh = window.innerHeight
      const room = window.innerWidth <= 760 ? vh * 0.55 : vh
      const tall = b.height > room * 0.6
      if (b.top < 72 || (tall ? b.top > room - 200 : b.bottom > room - 24)) {
        const head = room < vh ? 128 : 80 // the phone's sticky head is taller
        const top = window.scrollY + b.top - (tall ? head : Math.max(head, (room - b.height) / 2))
        window.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' })
      }
    }
    return watch(() => setR(el.getBoundingClientRect()), el)
  }, [anchor, dep]) // eslint-disable-line react-hooks/exhaustive-deps -- `anchor` reads refs; `dep` names the step
  return r
}

/** Several elements' viewport rects (the strip row), kept current the same way. */
function useRects(get: () => Element[]) {
  const [rs, setRs] = useState<DOMRect[]>([])
  useLayoutEffect(() => watch(() => setRs(get().map((e) => e.getBoundingClientRect()))), [get])
  return rs
}

/** Runs `measure` now and once per frame on scroll, resize or a size change of `el` / the document; returns the undo. */
function watch(measure: () => void, el?: Element) {
  let raf = 0
  const tick = () => { raf = 0; measure() }
  const ask = () => { if (!raf) raf = requestAnimationFrame(tick) }
  tick()
  window.addEventListener('scroll', ask, true)
  window.addEventListener('resize', ask)
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ask) : null
  if (el) ro?.observe(el)
  ro?.observe(document.documentElement)
  return () => { window.removeEventListener('scroll', ask, true); window.removeEventListener('resize', ask); ro?.disconnect(); if (raf) cancelAnimationFrame(raf) }
}
