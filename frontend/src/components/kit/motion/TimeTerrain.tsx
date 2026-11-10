/**
 * TimeTerrain — columns (years or sexenios) × lanes (counterparts) × money, as an orbitable field of
 * columns on the sexenio spine. Honest: ORTHOGRAPHIC camera (equal heights look equal at any depth),
 * height is the only encoding (footprints constant), tilt limited so nothing hides a comparison,
 * lanes in data order (largest in front). One InstancedMesh; matrices change only during the
 * 900 ms entrance and while dragging. Reduced motion: final state, no entrance.
 */
import { useCallback, useRef, useState } from 'react'
import * as THREE from 'three'
import { formatCompactMXN } from '@/lib/utils'
import type { TerrainData } from './data'
import { FlatToggle, MotionTable } from './MotionTable'
import { easeOut, project, styleColor, tokenColor, useReducedMotion, useScene, type SceneCtx, type SceneHandle } from './scene'
import './motion.css'

const H = 3.2, ENTER = 0.9
const YAW0 = -0.55, PITCH0 = 0.5 // ≈ −32° / 29°: the ≤ 30° tilt of the guardrails

export interface TimeTerrainProps {
  data: TerrainData
  lang: 'es' | 'en'
  /** The key row's bold lead («Dinero por año y contraparte» by default). */
  title?: string
  height?: number
  onSelect?: (hit: { lane: TerrainData['lanes'][number]; col: string; value: number }) => void
}

export default function TimeTerrain({ data, lang, title, height = 300, onSelect }: TimeTerrainProps) {
  const en = lang === 'en'
  const reduced = useReducedMotion()
  const [flat, setFlat] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; lane: number; col: number } | null>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const wakeRef = useRef<() => void>(() => {})
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect // an inline callback must not rebuild the scene
  const nl = data.lanes.length, nc = data.cols.length

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const geo = new THREE.BoxGeometry(0.72, 1, 0.72).translate(0, 0.5, 0)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), nl * nc)
    const dummy = new THREE.Object3D()
    const hAt = (l: number, c: number) => (data.cells[l][c] / data.vmax) * H
    const place = (k: number) => {
      for (let l = 0; l < nl; l++) for (let c = 0; c < nc; c++) {
        const i = l * nc + c, h = Math.max(0.01, hAt(l, c) * k)
        dummy.position.set(c, 0, nl - 1 - l); dummy.scale.set(1, h, 1); dummy.updateMatrix() // lane 0 (largest) in front: nothing hides it
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    data.lanes.forEach((ln, l) => { const col = styleColor(ln.color); for (let c = 0; c < nc; c++) mesh.setColorAt(l * nc + c, col) })
    place(reduced ? 1 : 0)
    ctx.scene.add(mesh)
    // sexenio bands on the floor, alternating two paper tints
    const tints = [tokenColor('--color-background-elevated'), tokenColor('--color-border')]
    data.bands.forEach((b, i) => {
      const w = b.to - b.from + 1
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, nl + 0.6), new THREE.MeshBasicMaterial({ color: tints[i % 2] }))
      plane.rotation.x = -Math.PI / 2; plane.position.set(b.from + w / 2 - 0.5, -0.02, (nl - 1) / 2)
      ctx.scene.add(plane)
    })
    ctx.scene.add(new THREE.AmbientLight(0xffffff, 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-3, 6, 4); ctx.scene.add(sun)

    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    const centre = new THREE.Vector3((nc - 1) / 2, H * 0.25, (nl - 1) / 2)
    const view = { yaw: YAW0, pitch: PITCH0 }
    let cw = ctx.width, ch = ctx.height
    // the whole grid (and its tallest column) always fits: frustum from the grid's corners in camera space,
    // with room on the right for the lane names — at any yaw, pitch or viewport
    const corners = [-0.6, nc - 0.4].flatMap((x) => [0, H].flatMap((y) => [-0.6, nl - 0.4].map((z) => new THREE.Vector3(x, y, z))))
    const cv = new THREE.Vector3()
    const fit = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const c of corners) { cv.copy(c).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, cv.x); x1 = Math.max(x1, cv.x); y0 = Math.min(y0, cv.y); y1 = Math.max(y1, cv.y) }
      const sw = (x1 - x0) * 1.04 + (x1 - x0) * (96 / cw), sh = (y1 - y0) * 1.08, a = cw / ch
      let hw = sw / 2, hh = sh / 2
      if (hw / hh < a) hw = hh * a; else hh = hw / a
      const cx = (x0 + x1) / 2 + (sw - (x1 - x0)) / 2 - (x1 - x0) * 0.02, cy = (y0 + y1) / 2
      cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh
      cam.updateProjectionMatrix()
    }
    const aim = () => {
      const r = 40
      cam.position.set(centre.x + r * Math.cos(view.pitch) * Math.sin(view.yaw), centre.y + r * Math.sin(view.pitch), centre.z + r * Math.cos(view.pitch) * Math.cos(view.yaw))
      cam.lookAt(centre); cam.updateMatrixWorld(); fit()
    }
    aim()

    // drag to orbit (bounded), hover to read, click to drill
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null, moved = false
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let lastHit = -1
    const hit = (ev: PointerEvent) => {
      const r = ctx.canvas.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const i = ray.intersectObject(mesh, false)[0]?.instanceId ?? -1
      return { i, x: ev.clientX - r.left, y: ev.clientY - r.top }
    }
    const onDown = (ev: PointerEvent) => { drag = { x: ev.clientX, y: ev.clientY, ...view }; moved = false; ctx.canvas.setPointerCapture(ev.pointerId) }
    const onMove = (ev: PointerEvent) => {
      if (drag) {
        view.yaw = Math.max(-1.4, Math.min(1.4, drag.yaw + (ev.clientX - drag.x) * 0.008))
        view.pitch = Math.max(0.2, Math.min(1.1, drag.pitch - (ev.clientY - drag.y) * 0.008))
        if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) moved = true
        aim(); wakeRef.current()
        return
      }
      const { i, x, y } = hit(ev)
      if (i !== lastHit || i >= 0) { lastHit = i; setTip(i >= 0 ? { x, y, lane: Math.floor(i / nc), col: i % nc } : null) }
    }
    const onUp = (ev: PointerEvent) => {
      if (drag && !moved) { const { i } = hit(ev); if (i >= 0) onSelectRef.current?.({ lane: data.lanes[Math.floor(i / nc)], col: data.cols[i % nc], value: data.cells[Math.floor(i / nc)][i % nc] }) }
      drag = null
    }
    const onLeave = () => { lastHit = -1; setTip(null) }
    ctx.canvas.addEventListener('pointerdown', onDown); ctx.canvas.addEventListener('pointermove', onMove)
    ctx.canvas.addEventListener('pointerup', onUp); ctx.canvas.addEventListener('pointerleave', onLeave)

    // labels: lane names past the last column (hidden when they would stack), band names on the floor
    const labels = Array.from(labelsRef.current?.children ?? []) as HTMLElement[]
    const anchors: THREE.Vector3[] = [
      ...data.lanes.map((_, l) => new THREE.Vector3(nc - 0.2, 0, nl - 1 - l)),
      ...data.bands.map((b) => new THREE.Vector3(b.from + (b.to - b.from) / 2, 0, nl - 0.2)),
    ]
    const placeLabels = () => {
      let lastY = -Infinity
      anchors.forEach((a, i) => {
        const el = labels[i]; if (!el) return
        const p = project(a, cam, ctx.canvas.clientWidth, ctx.canvas.clientHeight)
        // lane names only where there is room (desktop); phones read the legend row and the tooltip
        if (i < nl) { el.hidden = cw < 900 || Math.abs(p.y - lastY) < 13; if (!el.hidden) lastY = p.y }
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(${i < nl ? '6px' : '-50%'}, -50%)`
      })
    }
    const t0 = performance.now() / 1000
    return {
      frame(t) {
        const k = reduced ? 1 : easeOut((t - t0) / ENTER)
        if (k < 1 || t - t0 < ENTER + 0.05) place(k)
        placeLabels()
        ctx.renderer.render(ctx.scene, cam)
        return k < 1 || drag != null
      },
      resize(w, h) { cw = w; ch = h; aim() },
      dispose() {
        ctx.canvas.removeEventListener('pointerdown', onDown); ctx.canvas.removeEventListener('pointermove', onMove)
        ctx.canvas.removeEventListener('pointerup', onUp); ctx.canvas.removeEventListener('pointerleave', onLeave)
      },
    }
  }, [data, reduced, nl, nc])

  const { ref, status, wake } = useScene(flat ? null : setup)
  wakeRef.current = wake
  const showTable = flat || status === 'nogl'

  const caption = en
    ? `${data.lanes.length} lanes × ${nc} columns; column height is the money (top ${formatCompactMXN(data.vmax)}).`
    : `${data.lanes.length} carriles × ${nc} columnas; la altura es el dinero (tope ${formatCompactMXN(data.vmax)}).`
  const rows = data.lanes.map((l, i) => [l.label, ...data.cells[i].map((v) => (v > 0 ? formatCompactMXN(v) : '—'))])

  return (
    <figure className="mk">
      <div className="mk-key" style={{ marginBottom: 6 }}>
        <span><b>{title ?? (en ? 'Money by year and counterpart' : 'Dinero por año y contraparte')}</b> · {en ? 'height = money, top' : 'altura = dinero, tope'} {formatCompactMXN(data.vmax)}</span>
        <span>{en ? 'drag to turn · hover to read · click to open' : 'arrastre para girar · pase el cursor para leer · clic para abrir'}</span>
        <FlatToggle flat={showTable} setFlat={setFlat} lang={lang} />
      </div>
      {!showTable && (
        <div className="mk-box is-grab" style={{ height }} role="img" aria-label={caption}>
          <canvas ref={ref} />
          <div ref={labelsRef} aria-hidden="true">
            {data.lanes.map((l) => <div key={`l${l.id}`} className="mk-lbl" style={{ color: l.color, transform: 'translate(-200px,-200px)' }}>{l.label}</div>)}
            {data.bands.map((b, i) => <div key={`b${i}`} className="mk-lbl is-muted is-mono">{b.label}</div>)}
          </div>
          {tip && (
            <div className="mk-tip" style={{ left: tip.x, top: tip.y }}>
              <b>{data.lanes[tip.lane].label}</b> · {data.cols[tip.col]} · {formatCompactMXN(data.cells[tip.lane][tip.col])}
            </div>
          )}
        </div>
      )}
      {!showTable && (
        <div className="mk-key" style={{ marginTop: 6 }}>
          {data.lanes.map((l) => <span key={l.id}><i style={{ background: l.color }} />{l.label}</span>)}
        </div>
      )}
      <MotionTable visible={showTable} caption={caption} head={[en ? 'Lane' : 'Carril', ...data.cols]} rows={rows} />
    </figure>
  )
}
