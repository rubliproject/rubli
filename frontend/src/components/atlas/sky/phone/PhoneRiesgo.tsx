/**
 * PhoneRiesgo — El Mapa's «Riesgo» arrangement on a phone (CYAN 2026-11-04: «390 shows the list, not the sky»).
 * The same chart as desktop's overview lens (SkyEngine LENS_ALL): every agency a disc in its sector's colour,
 * x = share of its money in contracts with a high or critical risk indicator, y = its money (log), the dashed
 * «en conjunto» line and the top-right corner named. The dots glide in from the constellation (the manifest's own
 * x/y, the sky seen whole) over 1.4 s, as on desktop, and glide back before the list returns; reduced motion =
 * the final state. Manifest only: no bin, no free pan (spec atlas-2026-10-02 §4). A tap opens the nearest agency.
 */
import { useEffect, useMemo, useRef } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { starPx, type SkyManifest } from '@/lib/atlas/sky/geometry'
import { mapaRiesgo, RISKY_SHARE } from '@/lib/pageQuestion'
import { formatEntityName } from '@/lib/entity/format'

const WORLD = 10000
const FLOOR = 5 // log10 of the money axis' floor (100 000 MXN), as desktop
const GLIDE_MS = 1400
const PAD = { l: 52, r: 10, t: 40, b: 56 }
const FONT_MONO = '12px "Source Code Pro", ui-monospace, monospace'
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const css = (name: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb

export function PhoneRiesgo({ manifest, lang, width, back, onBackDone, onStar }: {
  manifest: SkyManifest
  lang: 'en' | 'es'
  width: number
  /** glide back to the constellation, then call onBackDone */
  back: boolean
  onBackDone: () => void
  onStar: (i: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const S = manifest.stars
  const H = Math.round(Math.min(520, Math.max(360, width * 1.15)))
  const r = useMemo(() => mapaRiesgo(S, null, 4), [S])
  const geo = useMemo(() => {
    const n = S.id.length, w = width, x0 = PAD.l, x1 = w - PAD.r, y0 = PAD.t, y1 = H - PAD.b
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < n; i++) if (S.v[i] > 0) { const l = Math.log10(S.v[i]); lo = Math.min(lo, l); hi = Math.max(hi, l) }
    lo = Math.min(Math.max(lo, FLOOR), hi)
    // from: the constellation, fitted into the plot box; to: the chart
    const s = Math.min(x1 - x0, y1 - y0) / WORLD, ox = (x0 + x1 - WORLD * s) / 2, oy = (y0 + y1 - WORLD * s) / 2
    const FX = new Float32Array(n), FY = new Float32Array(n), TX = new Float32Array(n), TY = new Float32Array(n), R = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      FX[i] = ox + S.x[i] * s; FY[i] = oy + S.y[i] * s
      const m = hi > lo && S.v[i] > 0 ? Math.max(0, (Math.log10(S.v[i]) - lo) / (hi - lo)) : 0
      TX[i] = x0 + S.h[i] * (x1 - x0); TY[i] = y1 - m * (y1 - y0)
      R[i] = Math.max(1.2, starPx(S.v[i]) * 0.55)
    }
    return { FX, FY, TX, TY, R, lo, hi, x0, x1, y0, y1 }
  }, [S, width, H])
  const at = useRef({ t: 0, X: new Float32Array(0), Y: new Float32Array(0) })
  const backRef = useRef(back)
  backRef.current = back
  const doneRef = useRef(onBackDone)
  doneRef.current = onBackDone

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = width * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d')!
    const col = {
      bg: css('--color-background', '#ffffff'), ink: css('--color-text-primary', '#000000'), muted: css('--color-text-muted', '#444444'),
      risky: css('--color-risk-critical', 'red'),
    }
    const { FX, FY, TX, TY, R, lo, hi, x0, x1, y0, y1 } = geo
    const n = S.id.length
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const X = new Float32Array(n), Y = new Float32Array(n)
    at.current.X = X; at.current.Y = Y
    const ticks = skyCopy('lensTicks', lang).split(' · ')
    const draw = (e: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, H)
      for (let i = 0; i < n; i++) { X[i] = FX[i] + (TX[i] - FX[i]) * e; Y[i] = FY[i] + (TY[i] - FY[i]) * e }
      // axes fade in with the glide
      ctx.globalAlpha = e
      ctx.font = FONT_MONO
      ctx.strokeStyle = col.ink; ctx.fillStyle = col.muted; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x0, y1 + 0.5); ctx.lineTo(x1, y1 + 0.5)
      for (const f of [0, 0.5, 1]) { const x = x0 + f * (x1 - x0); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 4) }
      ctx.stroke()
      ctx.textBaseline = 'top'
      for (const f of [0, 0.5, 1]) { ctx.textAlign = f === 0 ? 'left' : f === 1 ? 'right' : 'center'; ctx.fillText(`${f * 100}%`, x0 + f * (x1 - x0), y1 + 6) }
      // money hairlines (the ones inside the range), labels left
      ctx.globalAlpha = e * 0.14
      ctx.beginPath()
      const yt: [number, string][] = []
      for (const [k, p] of [FLOOR, 6, 8, 10, 12].entries()) {
        if (hi <= lo || p < lo || p > hi || (p === FLOOR && lo !== FLOOR)) continue
        const y = y1 - ((p - lo) / (hi - lo)) * (y1 - y0)
        yt.push([y, ticks[k]]); ctx.moveTo(x0, y); ctx.lineTo(x1, y)
      }
      ctx.stroke()
      ctx.globalAlpha = e
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      for (const [y, t] of yt) ctx.fillText(t.replace(' MDP', '').replace(' MXN', ''), x0 - 4, y)
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(skyCopy('lensAxisMoneyShort', lang), 0, y0 - 22)
      // the x title under the ticks (it is long: «más gasto con indicador de riesgo alto o crítico →»)
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      const xt = skyCopy('lensAxisRiskShort', lang)
      if (ctx.measureText(xt).width <= x1) ctx.fillText(xt, x1, y1 + 22)
      else {
        // two lines, split at the word nearest the middle
        const w = xt.split(' '), k = Math.ceil(w.length / 2)
        ctx.fillText(w.slice(0, k).join(' '), x1, y1 + 22); ctx.fillText(w.slice(k).join(' '), x1, y1 + 37)
      }
      if (r) {
        const xa = x0 + r.avg * (x1 - x0)
        ctx.globalAlpha = e * 0.6
        ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xa, y1); ctx.lineTo(xa, y0 - 4); ctx.stroke(); ctx.setLineDash([])
        ctx.globalAlpha = e
        // the reference sits low, by the x axis (the top belongs to the named corner)
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
        ctx.fillStyle = col.bg; const lw = ctx.measureText(skyCopy('lensAvg', lang, { x: Math.round(r.avg * 100) })).width
        ctx.fillRect(xa - 5 - lw, y1 - 18, lw + 2, 15); ctx.fillStyle = col.muted
        ctx.fillText(skyCopy('lensAvg', lang, { x: Math.round(r.avg * 100) }), xa - 4, y1 - 4)
      }
      // the discs: firm, with a paper ring where they overlap (desktop's overview «Riesgo»)
      ctx.lineWidth = 1; ctx.strokeStyle = col.bg
      // CYAN-2: one accent — red when half or more of the money is at high/critical risk, the rest quiet
      for (const red of [false, true]) {
        const p = new Path2D()
        for (let i = 0; i < n; i++) if ((S.h[i] >= RISKY_SHARE) === red) { p.moveTo(X[i] + R[i], Y[i]); p.arc(X[i], Y[i], R[i], 0, Math.PI * 2) }
        ctx.globalAlpha = red ? 0.6 + 0.25 * e : 0.45; ctx.fillStyle = red ? col.risky : col.muted; ctx.fill(p); if (e > 0) ctx.stroke(p)
      }
      // the named corner: ink rings + names that never collide (4 tries each, else the list below carries it)
      if (r && e > 0.98) {
        ctx.globalAlpha = 1
        ctx.font = FONT_MONO
        // a name avoids the other names and every named disc (its ring included)
        const boxes: [number, number, number, number][] = r.order.map((i) => [X[i] - R[i] - 3, Y[i] - R[i] - 3, 2 * R[i] + 6, 2 * R[i] + 6])
        const hit = (b: [number, number, number, number]) => b[0] < 0 || b[0] + b[2] > width || b[1] < y0 - 20 || boxes.some((o) => b[0] < o[0] + o[2] && o[0] < b[0] + b[2] && b[1] < o[1] + o[3] && o[1] < b[1] + b[3])
        for (const i of r.order) {
          ctx.strokeStyle = col.ink; ctx.lineWidth = 1.25
          ctx.beginPath(); ctx.arc(X[i], Y[i], R[i] + 2, 0, Math.PI * 2); ctx.stroke()
          // siglas only: a whole name never fits beside a dot, and a name is never cut (the list below names it)
          const name = S.siglas[i]
          if (!name) continue
          const tw = ctx.measureText(name).width, d = R[i] + 4
          const tries: [number, number][] = [[X[i] - d - tw, Y[i] - 7], [X[i] + d, Y[i] - 7], [X[i] - tw / 2, Y[i] - d - 14], [X[i] - tw / 2, Y[i] + d], [X[i] - d - tw, Y[i] - 21], [X[i] - d - tw, Y[i] + 7]]
          const ok = tries.map(([bx, by]) => [bx, by, tw, 14] as [number, number, number, number]).find((b) => !hit(b))
          if (!ok) continue
          boxes.push(ok)
          ctx.fillStyle = col.bg; ctx.globalAlpha = 0.85; ctx.fillRect(ok[0] - 1, ok[1], ok[2] + 2, 14); ctx.globalAlpha = 1
          ctx.fillStyle = col.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
          ctx.fillText(name, ok[0], ok[1] + 1)
        }
      }
      ctx.globalAlpha = 1
    }
    let raf = 0
    const from = at.current.t, to = backRef.current ? 0 : 1
    if (reduced || from === to) { at.current.t = to; draw(ease(to)); if (to === 0) doneRef.current(); return }
    const t0 = performance.now(), dur = GLIDE_MS * Math.abs(to - from)
    const tick = (now: number) => {
      const a = Math.min(1, (now - t0) / dur)
      at.current.t = from + (to - from) * a
      draw(ease(at.current.t))
      if (a < 1) raf = requestAnimationFrame(tick)
      else if (to === 0) doneRef.current()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [geo, back, width, H, lang, manifest, S, r])

  const onTap = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const b = ev.currentTarget.getBoundingClientRect(), px = ev.clientX - b.left, py = ev.clientY - b.top
    const { X, Y } = at.current
    let best = -1, bd = 20 * 20
    for (let i = 0; i < X.length; i++) { const d = (X[i] - px) ** 2 + (Y[i] - py) ** 2; if (d < bd) { bd = d; best = i } }
    if (best >= 0) onStar(best)
  }

  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  return (
    <figure style={{ margin: '4px 0 0' }}>
      <canvas
        ref={ref} onPointerUp={onTap} role="img" aria-label={skyCopy('lensStampAll', lang)}
        style={{ width, height: H, display: 'block', touchAction: 'pan-y', cursor: 'pointer' }}
      />
      {/* the named corner as text: whole names, a keyboard and screen-reader path into each agency */}
      {r && (
        <figcaption>
          <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {r.order.map((i) => (
              <li key={i}>
                <button
                  type="button" onClick={() => onStar(i)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                  style={{ display: 'flex', width: '100%', gap: 8, justifyContent: 'space-between', alignItems: 'baseline', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', padding: '8px 0', minHeight: 44, cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: 'var(--font-family-editorial)', fontSize: 15, color: 'var(--color-text-primary)' }}>{formatEntityName('institution', S.name[i], 'full')}</span>
                  <span style={{ fontFamily: 'var(--font-family-archival)', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {Math.round(S.h[i] * 100).toLocaleString(loc)}% {lang === 'en' ? 'high or critical' : 'alto o crítico'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </figcaption>
      )}
    </figure>
  )
}
