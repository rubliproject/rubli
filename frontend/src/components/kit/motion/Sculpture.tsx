/**
 * Sculpture — a still object of pieces in volume: the dossier objects «La columna» (vendor) and «Homenaje al
 * cuadrado» (institution), specs from lib/vendor/objects. Honest (rubli-motion-viz §1): ORTHOGRAPHIC camera,
 * unlit flat tones (the tone IS the data, so no light may shade it), ink edges for form only, no shadows,
 * labels in the DOM. ↑/↓ walk the pieces (aria-live read-out), Enter/Space open, ←/→ turn; drag turns too
 * (a «still» piece only ±0.25 rad). Entrance ≤ 0.9 s, auto-turn 8 s, both off under reduced motion.
 * The 2D twin (`MotionTable`) shows when flat or without WebGL; screen readers always have it.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import type { Piece, SculptureSpec } from '@/lib/vendor/objects'
import { MotionTable } from './MotionTable'
import { cssToken, easeOut, project, tokenColor, useReducedMotion, useScene, type SceneCtx, type SceneHandle, type SceneStatus } from './scene'
import './motion.css'

export interface SculptureProps {
  spec: SculptureSpec
  height: number
  /** The box's accessible name: the takeaway and the keys. */
  label: string
  flat: boolean
  twin: { caption: string; head: string[]; rows: (string | number)[][] }
  onOpen: (pick: number, at: { x: number; y: number }) => void
  onStatus?: (s: SceneStatus) => void
  /** The piece being read (hover or ↑/↓), null when none. */
  onHot?: (pick: number | null) => void
}

const ENTER = 0.9, AUTO = 4 // auto-turn ≤ 5 s (no pause control needed); off under reduced motion

export default function Sculpture({ spec, height, label, flat, twin, onOpen, onStatus, onHot }: SculptureProps) {
  const reduced = useReducedMotion()
  const [read, setRead] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const ctl = useRef<{ hot: (i: number | null) => void; turn: (d: number) => void }>({ hot: () => {}, turn: () => {} })
  const cursor = useRef(-1)
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen
  const onHotRef = useRef(onHot); onHotRef.current = onHot
  const wakeRef = useRef<() => void>(() => {})

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    // phones draw at DPR 1 (flat tones + hairline edges lose nothing; measured on the production build, 390 · CPU ×4)
    if (ctx.width < 600 && ctx.dpr > 1) { ctx.renderer.setPixelRatio(1); ctx.renderer.setSize(ctx.width, ctx.height, false) }
    const ink = tokenColor('--color-text-primary'), paper = tokenColor('--color-background')
    const geos = { oct: new THREE.OctahedronGeometry(0.5, 0), box: new THREE.BoxGeometry(1, 1, 1) }
    const edgeGeos = { oct: new THREE.EdgesGeometry(geos.oct), box: new THREE.EdgesGeometry(geos.box) }
    // NO data (before 2011) = paper with ink hatching, never a ramp tone (dataviz: a missing value must not look like a value)
    const hatch = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32
      const g = c.getContext('2d')
      if (g) {
        g.fillStyle = cssToken('--color-background'); g.fillRect(0, 0, 32, 32)
        g.strokeStyle = cssToken('--color-text-muted'); g.lineWidth = 2
        for (const o of [-32, 0, 32]) { g.beginPath(); g.moveTo(o, 32); g.lineTo(o + 32, 0); g.stroke() }
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const toneOf = (p: Piece) => !p.tone || 'hatch' in p.tone ? paper : 'mix' in p.tone
      // mixed in sRGB, as the legend's CSS color-mix swatch is (three's working space is linear)
      ? paper.clone().convertLinearToSRGB().lerp(ink.clone().convertLinearToSRGB(), 0.12 + 0.7 * Math.min(1, Math.max(0, p.tone.mix))).convertSRGBToLinear()
      : tokenColor(p.tone.token)
    const root = new THREE.Group(); ctx.scene.add(root)
    // batched for a phone's frame budget: one InstancedMesh per shape × fill (flat tones / hatch) and one merged
    // LineSegments per shape × edge opacity — under 10 draw calls instead of two per piece
    const hits: THREE.Object3D[] = []
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v0 = new THREE.Vector3(), s0 = new THREE.Vector3()
    const matrixOf = (p: Piece) => m4.compose(v0.set(...p.at), q0, s0.set(...p.size)).clone()
    const groups = new Map<string, Piece[]>()
    for (const p of spec.pieces) {
      const g = p.shape === 'box' ? 'box' : 'oct'
      const fill = p.shape === 'oct-dash' ? 'dash' : p.tone && 'hatch' in p.tone ? 'hatch' : 'flat'
      groups.set(`${g}|${fill}`, [...(groups.get(`${g}|${fill}`) ?? []), p])
    }
    for (const [k, ps] of groups) {
      const [g, fill] = k.split('|') as ['oct' | 'box', 'dash' | 'hatch' | 'flat']
      if (fill === 'dash') {
        for (const p of ps) { // «sin contratos»: a dotted outline (few per record), with an invisible body to point at
          const e = new THREE.LineSegments(edgeGeos[g], new THREE.LineDashedMaterial({ color: tokenColor('--color-text-muted'), dashSize: 0.08, gapSize: 0.06 }))
          e.applyMatrix4(matrixOf(p)); e.computeLineDistances(); root.add(e)
          const body = new THREE.Mesh(geos[g], new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
          body.applyMatrix4(matrixOf(p)); body.userData.pick = p.pick; root.add(body); if (p.pick != null) hits.push(body)
        }
        continue
      }
      const im = new THREE.InstancedMesh(geos[g], fill === 'hatch' ? new THREE.MeshBasicMaterial({ map: hatch }) : new THREE.MeshBasicMaterial(), ps.length)
      ps.forEach((p, i) => { im.setMatrixAt(i, matrixOf(p)); if (fill === 'flat') im.setColorAt(i, toneOf(p)) })
      im.userData.picks = ps.map((p) => p.pick ?? null)
      root.add(im); hits.push(im)
    }
    // edges merged by (shape, opacity): positions baked through each piece's matrix
    const edgeSets = new Map<string, number[]>()
    for (const p of spec.pieces) {
      if (p.edge <= 0 || p.shape === 'oct-dash') continue
      const g = p.shape === 'box' ? 'box' : 'oct', key = `${g}|${p.edge}`, src = edgeGeos[g].attributes.position, mm = matrixOf(p)
      const out = edgeSets.get(key) ?? []
      for (let i = 0; i < src.count; i++) { v0.fromBufferAttribute(src, i).applyMatrix4(mm); out.push(v0.x, v0.y, v0.z) }
      edgeSets.set(key, out)
    }
    for (const [k, arr] of edgeSets) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      root.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: Number(k.split('|')[1]) })))
    }
    // the piece being read: its edges in full ink (one LineSegments, moved onto it)
    const hi = new THREE.LineSegments<THREE.BufferGeometry>(edgeGeos.oct, new THREE.LineBasicMaterial({ color: ink })); hi.visible = false; hi.matrixAutoUpdate = false; root.add(hi)
    const pieceOf = new Map<number, Piece>(); for (const p of spec.pieces) if (p.pick != null && !pieceOf.has(p.pick)) pieceOf.set(p.pick, p)

    // ── camera: orthographic, fitted to the object's box with room for the DOM labels ──
    const bb = new THREE.Box3()
    for (const p of spec.pieces) { bb.expandByPoint(v0.set(p.at[0] - p.size[0] / 2, p.at[1] - p.size[1] / 2, p.at[2] - p.size[2] / 2)); bb.expandByPoint(v0.set(p.at[0] + p.size[0] / 2, p.at[1] + p.size[1] / 2, p.at[2] + p.size[2] / 2)) }
    const target = bb.getCenter(new THREE.Vector3())
    const corners = [bb.min.x, bb.max.x].flatMap((x) => [bb.min.y, bb.max.y].flatMap((y) => [bb.min.z, bb.max.z].map((z) => new THREE.Vector3(x, y, z))))
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
    const view = { az: spec.view.az, el: spec.view.el }
    let cw = ctx.width, ch = ctx.height
    const cv = new THREE.Vector3()
    const aim = () => {
      const r = 120
      cam.position.set(target.x + r * Math.cos(view.el) * Math.sin(view.az), target.y + r * Math.sin(view.el), target.z + r * Math.cos(view.el) * Math.cos(view.az))
      cam.lookAt(target); cam.updateMatrixWorld()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const c of corners) { cv.copy(c).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, cv.x); x1 = Math.max(x1, cv.x); y0 = Math.min(y0, cv.y); y1 = Math.max(y1, cv.y) }
      const s = Math.max((x1 - x0) / Math.max(40, cw - 2 * spec.margin.x), (y1 - y0) / Math.max(40, ch - 2 * spec.margin.y)) // world units per px
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      cam.left = cx - (cw / 2) * s; cam.right = cx + (cw / 2) * s; cam.top = cy + (ch / 2) * s; cam.bottom = cy - (ch / 2) * s
      cam.updateProjectionMatrix()
    }
    aim()

    // ── labels: DOM, projected each drawn frame, clamped inside the box ──
    const els = Array.from(labelsRef.current?.children ?? []) as HTMLElement[]
    const lp = new THREE.Vector3(), right = new THREE.Vector3()
    const placed: [number, number, number, number][] = []
    // label sizes are read once (and on resize), never per frame: offsetWidth in the loop forced a layout each frame
    let sizes: [number, number][] = []
    const measure = () => { sizes = els.map((el) => [el.offsetWidth, el.offsetHeight]) }
    measure()
    let alive = true
    document.fonts?.ready.then(() => { if (alive) { measure(); wake() } })
    const placeLabels = (k: number) => { placed.length = 0; spec.labels.forEach((l, i) => {
      const el = els[i]; if (!el) return
      lp.set(l.at[0], l.at[1] * k, l.at[2])
      if (l.off) lp.addScaledVector(right.setFromMatrixColumn(cam.matrixWorld, 0), l.off)
      const p = project(lp, cam, cw, ch), [w, h] = sizes[i] ?? [0, 0]
      let x = l.anchor === 'l' ? p.x : l.anchor === 'r' ? p.x - w : p.x - w / 2
      let y = l.anchor === 't' ? p.y + 4 + (l.row ?? 0) * (h + 2) : p.y - h / 2
      x = Math.max(0, Math.min(cw - w, x))
      // a hanging label that would touch one already placed drops a line (narrow phones, near-equal neighbours)
      if (l.anchor === 't') while (placed.some(([px, py, pw, ph]) => x < px + pw + 4 && px < x + w + 4 && y < py + ph && py < y + h)) y += h + 2
      y = Math.max(0, Math.min(ch - h, y))
      placed.push([x, y, w, h])
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }) }

    // ── reading: hover / keyboard light one piece's edges and say it ──
    let hot: number | null = null
    const setHot = (i: number | null) => {
      if (i === hot) return
      hot = i
      const hp = i != null ? pieceOf.get(i) : undefined
      hi.visible = !!hp && hp.shape !== 'oct-dash'
      if (hp) { hi.geometry = hp.shape === 'box' ? edgeGeos.box : edgeGeos.oct; hi.matrix.copy(matrixOf(hp)) }
      setRead(i == null ? '' : spec.picks[i].read)
      onHotRef.current?.(i)
      wake()
    }
    const clampAz = () => { if (spec.view.still) view.az = Math.min(spec.view.az + 0.25, Math.max(spec.view.az - 0.25, view.az)) }
    let auto = spec.view.auto && !reduced
    const turn = (d: number) => { auto = false; view.az += d; clampAz(); aim(); wake() }
    ctl.current = { hot: setHot, turn }

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pickAt = (ev: PointerEvent) => {
      const r = ctx.canvas.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const h = ray.intersectObjects(hits, false)[0]
      if (!h) return null
      const ps = h.object.userData.picks as (number | null)[] | undefined
      return (ps ? ps[h.instanceId ?? -1] : h.object.userData.pick) ?? null
    }
    let drag: { x: number; az: number } | null = null, moved = false
    const onDown = (ev: PointerEvent) => { drag = { x: ev.clientX, az: view.az }; moved = false; ctx.canvas.setPointerCapture(ev.pointerId) }
    const onMove = (ev: PointerEvent) => {
      if (drag) {
        if (Math.abs(ev.clientX - drag.x) > 4) moved = true
        if (moved) { auto = false; view.az = drag.az + (ev.clientX - drag.x) * 0.008; clampAz(); aim(); wake() }
        return
      }
      setHot(pickAt(ev))
    }
    const onUp = (ev: PointerEvent) => {
      // a tap (touch has no hover): read it under the canvas and open it
      if (drag && !moved) { const i = pickAt(ev); if (i != null) { cursor.current = i; setHot(i); onOpenRef.current(i, { x: ev.clientX, y: ev.clientY }) } }
      drag = null
    }
    const onLeave = () => { if (cursor.current < 0) setHot(null) }
    ctx.canvas.addEventListener('pointerdown', onDown); ctx.canvas.addEventListener('pointermove', onMove)
    ctx.canvas.addEventListener('pointerup', onUp); ctx.canvas.addEventListener('pointerleave', onLeave)

    const wake = () => wakeRef.current()
    const t0 = performance.now() / 1000
    return {
      frame(t, dt) {
        const k = reduced ? 1 : easeOut((t - t0) / ENTER)
        root.scale.y = Math.max(0.001, k)
        if (auto && t - t0 < AUTO) { view.az += dt * 0.12; aim() } else auto = false
        ctx.renderer.render(ctx.scene, cam)
        placeLabels(k)
        return k < 1 || auto || drag != null
      },
      resize(w, h) { cw = w; ch = h; measure(); aim() },
      dispose() {
        ctl.current = { hot: () => {}, turn: () => {} }
        ctx.canvas.removeEventListener('pointerdown', onDown); ctx.canvas.removeEventListener('pointermove', onMove)
        ctx.canvas.removeEventListener('pointerup', onUp); ctx.canvas.removeEventListener('pointerleave', onLeave)
        alive = false
        Object.values(edgeGeos).forEach((g) => g.dispose()); hatch.dispose()
      },
    }
  }, [spec, reduced])

  const { ref, status, wake } = useScene(flat ? null : setup)
  wakeRef.current = wake // the scene asks for frames through the hook's wake (sleep-when-still)
  useEffect(() => { onStatus?.(status) }, [status, onStatus])
  const showTable = flat || status === 'nogl'

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = spec.picks.length
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const up = e.key === 'ArrowUp'
      // the first press lands on an end (↑ the first piece, ↓ the last), never skips one
      cursor.current = cursor.current < 0 ? (up ? 0 : n - 1) : (cursor.current + (up ? 1 : -1) + n) % n
      ctl.current.hot(cursor.current)
      setRead(`${cursor.current + 1}/${n} · ${spec.picks[cursor.current].read}`)
    } else if ((e.key === 'Enter' || e.key === ' ') && cursor.current >= 0) {
      e.preventDefault()
      const r = boxRef.current?.getBoundingClientRect()
      onOpenRef.current(cursor.current, { x: (r?.left ?? 0) + (r?.width ?? 0) / 2, y: (r?.top ?? 0) + 24 })
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); ctl.current.turn(e.key === 'ArrowRight' ? 0.12 : -0.12)
    } else if (e.key === 'Escape') { cursor.current = -1; ctl.current.hot(null) }
  }

  return (
    <>
      {!showTable && (
        <div ref={boxRef} className="mk-box is-grab mk-sculpt" style={{ height }} tabIndex={0} role="group" aria-label={label}
          onKeyDown={onKey} onBlur={() => { cursor.current = -1; ctl.current.hot(null) }}>
          <canvas ref={ref} aria-hidden="true" />
          <div ref={labelsRef} aria-hidden="true">
            {spec.labels.map((l, i) => (
              <div key={i} className={l.kind === 'yr' ? 'mk-lbl is-muted is-mono' : 'mk-lbl'} style={{ transform: 'translate(-400px,-400px)' }}>
                {l.text}{l.small && <small> · {l.small}</small>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!showTable && <p className="mk-read" aria-live="polite">{read}</p>}
      <MotionTable visible={showTable} caption={twin.caption} head={twin.head} rows={twin.rows} />
    </>
  )
}
