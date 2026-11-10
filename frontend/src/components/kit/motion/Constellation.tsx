/**
 * Constellation — an entity and its counterparts as a small 3D graph you fly into.
 * Honest: node screen AREA ∝ money (sqrt radius, no size attenuation — perspective never shrinks a value),
 * depth carries no value (position is layout only), colour = lane colour / grey for the rest.
 * Layout: precomputed `positions` when given (iPhone / server), else the tiny CPU force in data.ts.
 * Fly: click a node → the camera dollies to it (700 ms; a jump under reduced motion) and `onSelect` fires.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { formatCompactMXN } from '@/lib/utils'
import { layoutGraph, radiusFor, type GraphData, type GraphNode } from './data'
import { FlatToggle, MotionTable } from './MotionTable'
import { easeOut, project, styleColor, tokenColor, useReducedMotion, useScene, type SceneCtx, type SceneHandle } from './scene'
import './motion.css'

const VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; varying vec3 vC;
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize; vC = aColor; }`
const FRAG = /* glsl */ `
precision mediump float; varying vec3 vC; uniform vec3 uRim;
void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(mix(vC, uRim, step(0.19, d)), 1.0); }`

export interface ConstellationProps {
  data: GraphData
  lang: 'es' | 'en'
  height?: number
  /** xyz triples in [-1, 1], one per node; skips the layout (ship these for phones). */
  positions?: Float32Array
  /** How many nodes carry a name (the largest); the picked node always does. */
  labels?: number
  onSelect?: (node: GraphNode | null) => void
}

export default function Constellation({ data, lang, height = 320, positions, labels, onSelect }: ConstellationProps) {
  labels ??= typeof window !== 'undefined' && window.innerWidth < 600 ? 4 : 8
  const en = lang === 'en'
  const reduced = useReducedMotion()
  const [flat, setFlat] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const wakeRef = useRef<() => void>(() => {})
  const flyRef = useRef<(i: number | null) => void>(() => {})
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect // an inline callback must not rebuild the scene
  const pos = useMemo(() => positions ?? layoutGraph(data), [data, positions])
  const vmax = useMemo(() => Math.max(...data.nodes.filter((n) => !n.isCenter).map((n) => n.value), 1), [data])
  const named = useMemo(() => {
    const idx = data.nodes.map((_, i) => i).filter((i) => !data.nodes[i].isCenter).sort((a, b) => data.nodes[b].value - data.nodes[a].value).slice(0, labels)
    return [0, ...idx]
  }, [data, labels])

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const n = data.nodes.length
    const size = new Float32Array(n), col = new Float32Array(n * 3)
    data.nodes.forEach((d, i) => {
      size[i] = 2 * (d.isCenter ? 7 : radiusFor(d.value, vmax, 2.5, 16)) * ctx.dpr
      const c = styleColor(d.color); col.set([c.r, c.g, c.b], i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uRim: { value: tokenColor('--color-background') } } }))
    ctx.scene.add(pts)
    const lp = new Float32Array(data.links.length * 6)
    data.links.forEach((l, i) => { lp.set(pos.subarray(l.source * 3, l.source * 3 + 3), i * 6); lp.set(pos.subarray(l.target * 3, l.target * 3 + 3), i * 6 + 3) })
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3))
    ctx.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: tokenColor('--color-ramp-ink-2'), transparent: true, opacity: 0.45 })))

    const cam = new THREE.PerspectiveCamera(42, ctx.width / ctx.height, 0.05, 50)
    const view = { yaw: 0.4, pitch: 0.25, dist: 3.2, target: new THREE.Vector3() }
    const goal = { dist: 3.2, target: new THREE.Vector3() }
    let flyT0 = -1, flyFrom = { dist: 3.2, target: new THREE.Vector3() }
    const aim = () => {
      cam.position.set(view.target.x + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw), view.target.y + view.dist * Math.sin(view.pitch), view.target.z + view.dist * Math.cos(view.pitch) * Math.cos(view.yaw))
      cam.lookAt(view.target); cam.updateMatrixWorld()
    }
    const fly = (i: number | null) => {
      goal.dist = i == null ? 3.2 : 1.1
      goal.target.set(...(i == null ? [0, 0, 0] : [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]) as [number, number, number])
      if (reduced) { view.dist = goal.dist; view.target.copy(goal.target); aim(); flyT0 = -1 }
      else { flyT0 = performance.now() / 1000; flyFrom = { dist: view.dist, target: view.target.clone() } }
      wakeRef.current()
    }
    flyRef.current = fly

    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null, moved = false, touched = false
    const nearest = (ev: PointerEvent) => {
      const r = ctx.canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top
      let best = -1, bd = Infinity
      for (let i = 0; i < n; i++) {
        const p = project({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] }, cam, r.width, r.height)
        if (p.behind) continue
        const d = Math.hypot(p.x - x, p.y - y) - size[i] / (2 * ctx.dpr) - 4
        if (d < bd) { bd = d; best = i }
      }
      return bd <= 0 ? best : -1
    }
    const onDown = (ev: PointerEvent) => { drag = { x: ev.clientX, y: ev.clientY, yaw: view.yaw, pitch: view.pitch }; moved = false; ctx.canvas.setPointerCapture(ev.pointerId) }
    const onMove = (ev: PointerEvent) => {
      if (!drag) return
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) { moved = true; touched = true }
      view.yaw = drag.yaw + (ev.clientX - drag.x) * 0.008
      view.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch - (ev.clientY - drag.y) * 0.008))
      aim(); wakeRef.current()
    }
    const onUp = (ev: PointerEvent) => {
      if (drag && !moved) { const i = nearest(ev); const pick = i > 0 ? i : null; setPicked(pick); fly(pick); onSelectRef.current?.(pick == null ? null : data.nodes[pick]) }
      drag = null
    }
    ctx.canvas.addEventListener('pointerdown', onDown); ctx.canvas.addEventListener('pointermove', onMove); ctx.canvas.addEventListener('pointerup', onUp)

    const els = Array.from(labelsRef.current?.children ?? []) as HTMLElement[]
    const placeLabels = () => els.forEach((el) => {
      const i = Number(el.dataset.i)
      const p = project({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] }, cam, ctx.canvas.clientWidth, ctx.canvas.clientHeight)
      el.hidden = p.behind
      // keep the name inside the box: shift it in from the edges instead of cutting it
      const half = el.offsetWidth / 2, x = Math.max(half + 2, Math.min(ctx.canvas.clientWidth - half - 2, p.x))
      el.style.transform = `translate(${x}px, ${p.y + size[i] / (2 * ctx.dpr) + 2}px) translate(-50%, 0)`
    })
    aim()
    return {
      frame(t, dt) {
        let busy = false
        if (flyT0 >= 0) {
          const k = easeOut((t - flyT0) / 0.7)
          view.dist = flyFrom.dist + (goal.dist - flyFrom.dist) * k
          view.target.lerpVectors(flyFrom.target, goal.target, k)
          if (k >= 1) flyT0 = -1; else busy = true
        }
        if (!reduced && !touched && flyT0 < 0 && goal.dist > 2) { view.yaw += dt * 0.08; busy = true }
        aim(); placeLabels()
        ctx.renderer.render(ctx.scene, cam)
        return busy || drag != null
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix() },
      dispose() { ctx.canvas.removeEventListener('pointerdown', onDown); ctx.canvas.removeEventListener('pointermove', onMove); ctx.canvas.removeEventListener('pointerup', onUp) },
    }
  }, [data, pos, vmax, reduced])

  const { ref, status, wake } = useScene(flat ? null : setup)
  wakeRef.current = wake
  const showTable = flat || status === 'nogl'
  const shown = picked != null && !named.includes(picked) ? [...named, picked] : named

  const caption = en
    ? `${data.nodes[0].label} and its ${data.nodes.length - 1} counterparts; dot area is the money.`
    : `${data.nodes[0].label} y sus ${data.nodes.length - 1} contrapartes; el área del punto es el dinero.`
  const rows = data.nodes.slice(1).map((d) => [d.label, formatCompactMXN(d.value), `${Math.round((100 * d.value) / (data.total || 1))}%`, d.year])

  return (
    <figure className="mk">
      <div className="mk-key" style={{ marginBottom: 6 }}>
        <span><b>{en ? 'Its panorama' : 'Su panorama'}</b> · {en ? 'area = money · closer = larger share' : 'área = dinero · más cerca = mayor parte'}</span>
        <span>{en ? 'drag to turn · click a dot to fly in · click the void to return' : 'arrastre para girar · clic en un punto para acercarse · clic al vacío para volver'}</span>
        <FlatToggle flat={showTable} setFlat={setFlat} lang={lang} />
      </div>
      {!showTable && (
        <div className="mk-box is-grab" style={{ height }} role="img" aria-label={caption}>
          <canvas ref={ref} />
          <div ref={labelsRef} aria-hidden="true">
            {shown.map((i) => (
              <div key={i} data-i={i} className={i === 0 || i === picked ? 'mk-lbl' : 'mk-lbl is-muted'} style={i === picked ? { color: data.nodes[i].color } : undefined}>
                {data.nodes[i].label}{i === picked ? ` · ${formatCompactMXN(data.nodes[i].value)}` : ''}
              </div>
            ))}
          </div>
          {picked != null && (
            <button type="button" className="mk-ctl" style={{ position: 'absolute', right: 8, top: 8 }} onClick={() => { setPicked(null); flyRef.current(null); onSelect?.(null) }}>
              <span aria-pressed="true" style={{ padding: '5px 8px' }}>{en ? '← back' : '← volver'}</span>
            </button>
          )}
        </div>
      )}
      <MotionTable visible={showTable} caption={caption} head={[en ? 'Counterpart' : 'Contraparte', 'MXN', '%', en ? 'Since' : 'Desde']} rows={rows} />
    </figure>
  )
}
