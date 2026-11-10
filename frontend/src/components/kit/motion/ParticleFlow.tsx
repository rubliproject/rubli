/**
 * ParticleFlow — money as particles from source lanes to one sink, year by year.
 * Honest: 1 particle = one stated quantum of MXN (legend), counts round from the real amounts; lanes are
 * ordered by the data. GPU-only motion: one buffer uploaded once, one `uT` uniform per frame.
 * Reduced motion: every particle at rest along its path (density = money), no clock.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { formatCompactMXN } from '@/lib/utils'
import { particleBudget, type FlowData } from './data'
import { FlatToggle, MotionTable } from './MotionTable'
import { useReducedMotion, useScene, styleColor, type SceneCtx, type SceneHandle } from './scene'
import './motion.css'

const LOOP = 14, HOLD = 2.5, TRAVEL = 0.35
const X1 = 0.93
/** The source names sit in a column on the left; the paths start after it (wider column on phones). */
const x0For = (width: number) => (width < 600 ? 0.42 : 0.24)

const VERT = /* glsl */ `
attribute vec2 aP0; attribute vec2 aP1; attribute vec2 aP2; attribute vec2 aP3;
attribute float aEmit; attribute float aSeed; attribute float aOff; attribute vec3 aColor;
uniform float uT; uniform float uStatic; uniform float uSize; uniform float uAspect;
varying vec3 vC; varying float vA;
void main() {
  float s = uStatic > 0.5 ? aSeed : (uT - aEmit) / ${TRAVEL.toFixed(3)};
  float alive = step(0.0, s) * step(s, 1.0);
  float u = clamp(s, 0.0, 1.0), v = 1.0 - u;
  vec2 p = v*v*v*aP0 + 3.0*v*v*u*aP1 + 3.0*v*u*u*aP2 + u*u*u*aP3;
  vec2 d = normalize(3.0*v*v*(aP1-aP0) + 6.0*v*u*(aP2-aP1) + 3.0*u*u*(aP3-aP2) + vec2(1e-4, 0.0));
  p += vec2(-d.y, d.x) * aOff * vec2(1.0 / uAspect, 1.0) * (1.0 - 0.6 * u);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  gl_PointSize = uSize * alive;
  vC = aColor; vA = alive * (uStatic > 0.5 ? 0.75 : 0.55 + 0.45 * v);
}`
const FRAG = /* glsl */ `
precision mediump float; varying vec3 vC; varying float vA;
void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vC, vA); }`

export interface ParticleFlowProps {
  data: FlowData
  lang: 'es' | 'en'
  /** Canvas height in px (default 260). */
  height?: number
  /** Particle cap: 4 000 on phones, 12 000 on desktop by default. */
  cap?: number
  onSelectSource?: (id: number | null) => void
}

export default function ParticleFlow({ data, lang, height = 260, cap, onSelectSource }: ParticleFlowProps) {
  const en = lang === 'en'
  const reduced = useReducedMotion()
  const [flat, setFlat] = useState(false)
  const [year, setYear] = useState<number>(data.years[0])
  const [arrived, setArrived] = useState(0)
  const clock = useRef({ manual: null as number | null, u: 0 })
  const n = data.sources.length
  const yOf = (i: number) => 0.9 - (0.8 * (i + 0.5)) / n
  const [x0, setX0] = useState(() => x0For(typeof window !== 'undefined' ? window.innerWidth : 1200))
  const budget = useMemo(() => particleBudget(data.edges, cap ?? (typeof window !== 'undefined' && window.innerWidth < 600 ? 4000 : 12000)), [data, cap])

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const total = budget.counts.reduce((s, c) => s + c, 0)
    const P0 = new Float32Array(total * 2), P1 = new Float32Array(total * 2), P2 = new Float32Array(total * 2), P3 = new Float32Array(total * 2)
    const emit = new Float32Array(total), seed = new Float32Array(total), off = new Float32Array(total), col = new Float32Array(total * 3)
    const ny = data.years.length, half = Math.min(0.035, 0.3 / n)
    const X0 = x0For(ctx.width), XM = X0 + (X1 - X0) * 0.45
    setX0(X0)
    let k = 0, rnd = 12345
    const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    data.edges.forEach((e, ei) => {
      const ys = yOf(e.source), c = styleColor(data.sources[e.source].color), yi = data.years.indexOf(e.year)
      for (let j = 0; j < budget.counts[ei]; j++, k++) {
        P0.set([X0, ys], k * 2); P1.set([XM, ys], k * 2); P2.set([XM + 0.12, 0.5], k * 2); P3.set([X1, 0.5], k * 2)
        emit[k] = ((yi + rand()) / ny) * (1 - TRAVEL); seed[k] = rand(); off[k] = (rand() * 2 - 1) * half
        col.set([c.r, c.g, c.b], k * 3)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
    g.setAttribute('aP0', new THREE.BufferAttribute(P0, 2)); g.setAttribute('aP1', new THREE.BufferAttribute(P1, 2))
    g.setAttribute('aP2', new THREE.BufferAttribute(P2, 2)); g.setAttribute('aP3', new THREE.BufferAttribute(P3, 2))
    g.setAttribute('aEmit', new THREE.BufferAttribute(emit, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.5, 0), 1)
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uStatic: { value: reduced ? 1 : 0 }, uSize: { value: 3.2 * ctx.dpr }, uAspect: { value: ctx.width / ctx.height } },
    })
    const pts = new THREE.Points(g, mat)
    pts.frustumCulled = false
    ctx.scene.add(pts)
    const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    const edgesByYear = data.years.map((y) => data.edges.filter((e) => e.year < y).reduce((s, e) => s + e.amount, 0))
    let shownYear = -1, shownArr = -1
    return {
      frame(t) {
        const c = clock.current
        const u = c.manual ?? (reduced ? 1 : Math.min(1, (t % (LOOP + HOLD)) / LOOP))
        c.u = u
        mat.uniforms.uT.value = u
        const yi = Math.min(ny - 1, Math.floor((u / (1 - TRAVEL)) * ny))
        if (yi !== shownYear) { shownYear = yi; setYear(data.years[yi]) }
        const arr = u >= 1 ? data.total : edgesByYear[yi]
        if (arr !== shownArr) { shownArr = arr; setArrived(arr) }
        ctx.renderer.render(ctx.scene, cam)
        return !reduced && c.manual == null
      },
      resize(w, h) { mat.uniforms.uAspect.value = w / h },
    }
  }, [data, budget, reduced, n])

  const { ref, status, wake } = useScene(flat ? null : setup)
  const showTable = flat || status === 'nogl'
  const scrub = (v: number) => { clock.current.manual = v; wake() }
  useEffect(() => { if (!flat) { clock.current.manual = null; wake() } }, [flat, wake])

  const rows = data.sources.map((s) => [s.label, formatCompactMXN(s.amount), `${Math.round((100 * s.amount) / (data.total || 1))}%`])
  const label = en
    ? `Money from ${n} sources into ${data.sink.label}, ${data.years[0]}–${data.years.at(-1)}; one particle is ${formatCompactMXN(budget.quantum)}.`
    : `Dinero de ${n} fuentes hacia ${data.sink.label}, ${data.years[0]}–${data.years.at(-1)}; un punto es ${formatCompactMXN(budget.quantum)}.`

  return (
    <figure className="mk">
      <div className="mk-key" style={{ marginBottom: 6 }}>
        <span><b>{en ? 'Money in motion' : 'El dinero en movimiento'}</b> · {en ? '1 particle =' : '1 punto ='} {formatCompactMXN(budget.quantum)}</span>
        <span>{en ? 'left: who pays · right: who receives · drag the year' : 'izquierda: quién paga · derecha: quién recibe · arrastre el año'}</span>
        <FlatToggle flat={showTable} setFlat={setFlat} lang={lang} />
      </div>
      {!showTable && (
        <div className="mk-box" style={{ height }} role="img" aria-label={label}>
          <canvas ref={ref} />
          {data.sources.map((s, i) => (
            <button key={i} type="button" className="mk-lbl is-hit" onClick={() => onSelectSource?.(s.id)} title={`${s.label} · ${formatCompactMXN(s.amount)}`}
              style={{ transform: 'translate(-100%, -50%)', left: `calc(${x0 * 100}% - 6px)`, top: `${(1 - yOf(i)) * 100}%`, maxWidth: `calc(${x0 * 100}% - 10px)`, whiteSpace: 'normal', lineHeight: 1.05, textAlign: 'right', color: s.color, background: 'transparent', border: 0, padding: 0 }}>
              {s.label} <span style={{ fontWeight: 400, fontFamily: 'var(--font-mono)' }}>{Math.round((100 * s.amount) / (data.total || 1))}%</span>
            </button>
          ))}
          <div className="mk-lbl" style={{ left: `${X1 * 100}%`, top: '50%', transform: 'translate(-100%, -50%)', marginLeft: -8 }}>{data.sink.label}</div>
        </div>
      )}
      {!showTable && (
        <div className="mk-clock">
          <span>{data.years[0]}</span>
          <input type="range" min={0} max={1000} step={1} aria-label={en ? 'Year' : 'Año'} value={Math.round(clock.current.u * 1000)}
            onChange={(e) => scrub(Number(e.target.value) / 1000)} onDoubleClick={() => { clock.current.manual = null; wake() }} />
          <span>{data.years.at(-1)}</span>
          <output>{year} · {en ? 'arrived' : 'llegado'} {formatCompactMXN(arrived)}</output>
        </div>
      )}
      <MotionTable visible={showTable} caption={label} head={[en ? 'Source' : 'Fuente', 'MXN', '%']} rows={rows} />
    </figure>
  )
}
