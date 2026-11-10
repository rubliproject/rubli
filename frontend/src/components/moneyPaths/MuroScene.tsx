/**
 * MuroScene — renders a money-path Spec (lib/moneyPaths/muro.ts) in three.js. LAZY: only Objeto imports it, through
 * React.lazy, so three stays in `vendor-three` and off the first paint (rubli-motion-viz §2).
 * Kit lifecycle (useScene): DPR cap, off-screen / hidden-tab pause, sleep when still, dispose, dark-mode re-tone (rebuild on
 * edition). Orthographic camera (heights compare): it frames the box of the rung in view and eases between rungs
 * (700 ms; a cut under reduced motion). The fills rise once (1 s, left to right) and the struck coins travel tray to
 * tray (1.1 s); reduced motion = final state. Labels are DOM (HTML owns glyphs, GL owns geometry).
 * Keyboard: ← → turn a little · ↑ ↓ walk the pieces (one stop per piece) · Enter opens.
 */
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { cssToken, tokenColor, styleColor, useScene, type SceneCtx, type SceneHandle, type SceneStatus } from '@/components/kit/motion/scene'
import { bindDrag, makeStage, orbit, spring } from '@/components/kit/motion/stage'
import { COIN, type Box, type Open, type SheetRec, type Spec, type Wall } from '@/lib/moneyPaths/muro'

interface Props {
  spec: Spec
  focus: string
  label: string
  reduced: boolean
  onStatus: (s: SceneStatus) => void
  onHot: (t: string) => void
  onOpen: (o: Open) => void
}

const col = (c: string) => (c.startsWith('var(') ? tokenColor(c.slice(4, -1)) : c.startsWith('--') ? tokenColor(c) : styleColor(c))
const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)
const toB3 = (b: Box) => new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))

/** An open box: five slabs merged into one geometry (open to +z). */
function hollow(w: number, h: number, d: number, th: number) {
  const parts = [[w, h, th, 0, 0, -d / 2 + th / 2], [w, th, d, 0, -h / 2 + th / 2, 0], [w, th, d, 0, h / 2 - th / 2, 0], [th, h, d, -w / 2 + th / 2, 0, 0], [th, h, d, w / 2 - th / 2, 0, 0]]
  const pos: number[] = [], nor: number[] = []
  for (const [pw, ph, pd, x, y, z] of parts) {
    const g = new THREE.BoxGeometry(pw, ph, pd).toNonIndexed(), p = g.attributes.position.array, q = g.attributes.normal.array
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i] + x, p[i + 1] + y, p[i + 2] + z); nor.push(q[i], q[i + 1], q[i + 2]) }
    g.dispose()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return geo
}

/** «Lo que no se ve» hatch (one meaning sitewide), drawn from the tokens. */
function hatchTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = cssToken('--color-background'); g.fillRect(0, 0, 64, 64)
  g.strokeStyle = cssToken('--color-ramp-ink-3'); g.lineWidth = 3
  for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke() }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The stamped sheet as a canvas texture, in the site's faces and tokens. */
function sheetTex(rec: SheetRec, W: number, H: number) {
  const ppu = 40, c = document.createElement('canvas'), w = W * ppu, h = H * ppu
  c.width = Math.round(w * 2); c.height = Math.round(h * 2)
  const g = c.getContext('2d')!; g.scale(2, 2)
  const ink = cssToken('--color-text-primary'), gray = cssToken('--color-text-muted'), crit = cssToken('--color-risk-critical-text')
  const serif = '"Spectral", Georgia, serif', mono = '"IBM Plex Mono", monospace'
  g.fillStyle = cssToken('--color-background'); g.fillRect(0, 0, w, h)
  const wrap = (s: string, x: number, y: number, maxW: number, lh: number) => { let line = '', yy = y; for (const wd of s.split(' ')) { const test = line ? `${line} ${wd}` : wd; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = wd; yy += lh } else line = test } g.fillText(line, x, yy); return yy + lh }
  g.fillStyle = gray; g.font = `400 11px ${mono}`; g.fillText(rec.head, 16, 22); g.fillStyle = ink; g.fillRect(16, 28, w - 32, 1)
  g.font = `600 14px ${serif}`; let y = Math.max(wrap(`«${rec.title}»`, 16, 48, w - 128, 17), 120)
  for (const [k, v] of rec.rows) { g.fillStyle = gray; g.font = `600 10px ${serif}`; g.fillText(k, 16, y); g.fillStyle = ink; g.font = `400 12px ${serif}`; y = wrap(v, 86, y, w - 102, 15) + 2 }
  // round stamp: the legal basis as recorded (dashed hollow = not recorded)
  const rx = w - 62, ry = 70, rr = 40
  g.save(); g.strokeStyle = rec.article ? ink : gray; g.lineWidth = 2; if (!rec.article) g.setLineDash([4, 4])
  g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; g.beginPath(); g.arc(rx, ry, rr - 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([])
  g.fillStyle = rec.article ? ink : gray; g.font = `600 8px ${serif}`
  let a = -Math.PI / 2 - (rec.ring.length * 0.085) / 2
  for (const ch of rec.ring) { g.save(); g.translate(rx + (rr - 6) * Math.cos(a), ry + (rr - 6) * Math.sin(a)); g.rotate(a + Math.PI / 2); g.fillText(ch, -2, 0); g.restore(); a += 0.085 }
  g.font = `700 10px ${mono}`; g.textAlign = 'center'
  ;(rec.article ?? rec.artNone).split('\n').forEach((ln, i) => g.fillText(ln, rx, ry + 4 + i * 12)); g.restore()
  // box stamps: recorded (solid), crítico (red), not recorded (dashed hollow)
  const by = h - 36 * Math.ceil(rec.stamps.length / 2) - 10
  rec.stamps.forEach(([t1, t2, st], i) => {
    const x = 16 + (i % 2) * ((w - 32) / 2 + 4), yy = by + Math.floor(i / 2) * 36, bw = (w - 36) / 2
    g.save(); g.strokeStyle = st === 'crit' ? crit : st === 'none' ? gray : ink; g.lineWidth = 2; if (st === 'none') g.setLineDash([4, 3])
    g.strokeRect(x, yy, bw, 30); g.setLineDash([]); g.fillStyle = g.strokeStyle
    const fit = (s: string, f: string) => { g.font = f; let tx = s; while (tx.length > 2 && g.measureText(tx).width > bw - 12) tx = `${tx.slice(0, -2)}…`; return tx }
    g.fillText(fit(t1, `700 9px ${serif}`), x + 6, yy + 12); g.fillText(fit(t2, `400 9px ${mono}`), x + 6, yy + 24); g.restore()
  })
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return tex
}

export default function MuroScene({ spec, focus, label, reduced, onStatus, onHot, onOpen }: Props) {
  const lblRef = useRef<HTMLDivElement>(null)
  const api = useRef({ focus: (_k: string) => {}, walk: (_d: number) => {}, open: () => {}, nudge: (_d: number) => {} })
  const cb = useRef({ onHot, onOpen }); cb.current = { onHot, onOpen }
  const focusRef = useRef(focus); focusRef.current = focus

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const phone = ctx.width < 640
    const { cam, key } = makeStage(ctx.scene, { shadow: phone ? 1024 : 2048, floor: 0.2, keyI: 2.6, fillI: 2.3 })
    ctx.renderer.shadowMap.enabled = true; ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    ctx.renderer.shadowMap.autoUpdate = false
    const root = new THREE.Group(); ctx.scene.add(root)
    const paper = tokenColor('--color-background'), ink = tokenColor('--color-text-primary')
    const plaster = (c: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0, ...o })
    const hatch = hatchTex()
    const hatchMat = () => new THREE.MeshStandardMaterial({ map: hatch, roughness: 0.95, metalness: 0 })
    const M = new THREE.Matrix4()
    const anims: { t0: number; dur: number; fn: (u: number) => void }[] = []
    const anim = (dur: number, fn: (u: number) => void) => { if (reduced) { fn(1); return } fn(0); anims.push({ t0: performance.now(), dur, fn }) }
    const picks: THREE.Object3D[] = []

    // ── walls ──
    const wall = (wl: Wall) => {
      const { w, h, d, cells } = wl, th = wl.th ?? 0.12, ih = h - 2 * th, iw = w - 2 * th - 0.16, id = d - th - 0.16, N = cells.length
      const x0 = Math.min(...cells.map((c) => c.x))
      const shells = new THREE.InstancedMesh(hollow(w, h, d, th), plaster(paper), N)
      cells.forEach((c, i) => { M.makeTranslation(c.x, c.y, 0); shells.setMatrixAt(i, M) })
      shells.castShadow = true; shells.receiveShadow = true; shells.userData.cells = cells; root.add(shells); picks.push(shells)
      const block = (list: typeof cells, val: (c: (typeof cells)[number]) => number, color: (c: (typeof cells)[number]) => THREE.Color, dz: number, grow: number) => {
        if (!list.length) return
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(iw + grow, 1, id + grow), plaster(0xffffff), list.length)
        list.forEach((c, k) => im.setColorAt(k, color(c)))
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        im.castShadow = true; im.receiveShadow = true; root.add(im)
        const set = (u: number) => { list.forEach((c, k) => { const p = Math.min(1, Math.max(0, u * 1.6 - (c.x - x0) * 0.004)), fh = Math.max(0.03, Math.min(1, val(c)) * ih * p); M.makeScale(1, fh, 1); M.setPosition(c.x, c.y - h / 2 + th + fh / 2, th / 2 + dz); im.setMatrixAt(k, M) }); im.instanceMatrix.needsUpdate = true }
        anim(1000, set)
      }
      const grey = tokenColor('--color-ramp-ink-3'), greyLight = tokenColor('--color-ramp-ink-2')
      block(cells.filter((c) => (c.fill ?? 0) > 0), (c) => c.fill ?? 0, (c) => (c.cap != null ? greyLight : grey), 0, 0)
      block(cells.filter((c) => (c.cap ?? 0) > 0), (c) => c.cap ?? 0, (c) => (c.band ? col(c.band) : grey), 0.01, 0.02)
      const lips = cells.filter((c) => c.lip)
      if (lips.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w + 0.3, th * 1.2, 0.5), plaster(ink), lips.length); lips.forEach((c, k) => { M.makeTranslation(c.x, c.y + h / 2 + th * 0.6, d / 2 + 0.25); im.setMatrixAt(k, M) }); im.castShadow = true; root.add(im) }
      const crits = cells.filter((c) => c.crit)
      if (crits.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, th * 2, d), plaster(tokenColor('--color-risk-critical')), crits.length); crits.forEach((c, k) => { M.makeTranslation(c.x, c.y + h / 2 + th, 0); im.setMatrixAt(k, M) }); im.castShadow = true; root.add(im) }
      const ghosts = cells.filter((c) => c.ghost != null && c.ghost > (c.fill ?? 0))
      if (ghosts.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(iw, 1, id), plaster(greyLight, { transparent: true, opacity: 0.35 }), ghosts.length); ghosts.forEach((c, k) => { const f0 = (c.fill ?? 0) * ih, g1 = (c.ghost ?? 0) * ih; M.makeScale(1, g1 - f0, 1); M.setPosition(c.x, c.y - h / 2 + th + f0 + (g1 - f0) / 2, th / 2); im.setMatrixAt(k, M) }); root.add(im) }
      const lids = cells.filter((c) => c.lid)
      if (lids.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, th), hatchMat(), lids.length); lids.forEach((c, k) => { M.makeTranslation(c.x, c.y, d / 2 - th / 2); im.setMatrixAt(k, M) }); im.castShadow = true; root.add(im) }
      const darks = cells.filter((c) => c.dark)
      if (darks.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(iw, ih, th), hatchMat(), darks.length); darks.forEach((c, k) => { M.makeTranslation(c.x, c.y, -d / 2 + th * 1.6); im.setMatrixAt(k, M) }); root.add(im) }
      for (const c of cells.filter((q) => q.hi)) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1)), new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.9 })); e.position.set(c.x, c.y, 0); root.add(e) }
    }
    spec.walls.forEach(wall)

    // ── floors ──
    for (const f of spec.floors) { const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.25, f.d), plaster(tokenColor('--color-ramp-ink-1'))); m.position.set(f.x, (f.y ?? 0) + 0.125, f.z); m.receiveShadow = true; root.add(m) }

    // ── trays of coins (Rastro): struck coins travel in from the tray before (the first from below); blanks lie flat ──
    if (spec.trays.length) {
      const { P, R, H } = COIN
      const coinGeo = new THREE.CylinderGeometry(R, R, H * 0.9, 36), slugGeo = new THREE.CylinderGeometry(R * 0.88, R * 0.88, H * 0.3, 24)
      const metal = new THREE.MeshStandardMaterial({ color: tokenColor('--color-ramp-ink-3'), roughness: 0.42, metalness: 0.65 })
      const metalCrit = new THREE.MeshStandardMaterial({ color: tokenColor('--color-risk-critical'), roughness: 0.42, metalness: 0.5 })
      const slugMat = plaster(paper)
      const cell = (x0: number, z0: number, i: number): [number, number] => [x0 + (i % 10) * P, z0 + Math.floor(i / 10) * P]
      spec.trays.forEach((tr, k) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(10 * P + 0.9, 0.25, 10 * P + 0.9), plaster(tokenColor(tr.seal ? '--color-ramp-red-1' : '--color-ramp-ink-1')))
        m.position.set(tr.x + 4.5 * P, 0.125, tr.z + 4.5 * P); m.castShadow = true; m.receiveShadow = true; m.userData.stop = tr.stop; m.userData.t = tr.t; root.add(m); picks.push(m)
        const y = 0.25 + H / 2
        if (tr.struck > 0) {
          const im = new THREE.InstancedMesh(coinGeo, tr.seal ? metalCrit : metal, tr.struck); im.castShadow = true; im.receiveShadow = true; root.add(im)
          const to = Array.from({ length: tr.struck }, (_, i) => cell(tr.x, tr.z, i))
          const prev = spec.trays[k - 1]
          const from = to.map(([x, z], i) => (prev ? [...cell(prev.x, prev.z, i), y] : [x, z, -1.5])) as [number, number, number][]
          const set = (u: number) => { const S = 0.55; to.forEach(([x, z], i) => { const p = Math.min(1, Math.max(0, u * (1 + S) - (i / to.length) * S)), q = 1 - Math.pow(1 - p, 2), a = from[i]; const ay = prev ? y : -1.5; M.makeTranslation(a[0] + (x - a[0]) * q, ay + (y - ay) * q + Math.sin(q * Math.PI) * 2.2, a[1] + (z - a[1]) * q); im.setMatrixAt(i, M) }); im.instanceMatrix.needsUpdate = true }
          anim(1100, set)
        }
        const blanks = 100 - tr.struck
        if (blanks > 0) { const im = new THREE.InstancedMesh(slugGeo, slugMat, blanks); for (let i = 0; i < blanks; i++) { const [x, z] = cell(tr.x, tr.z, tr.struck + i); M.makeTranslation(x, 0.25 + H * 0.15, z); im.setMatrixAt(i, M) } im.receiveShadow = true; root.add(im) }
      })
    }
    for (const v of spec.vaults) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(v.w, v.h, v.d), hatchMat()); m.position.set(v.x, v.h / 2, v.z); m.castShadow = true; m.receiveShadow = true; m.userData.stop = v.stop; m.userData.t = v.t; root.add(m); picks.push(m)
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.5 })); e.position.copy(m.position); root.add(e)
    }
    // ── the sheet: a thin box; the texture on its face (up when lying, front when standing) ──
    if (spec.sheet) {
      const s = spec.sheet, p = plaster(paper), face = new THREE.MeshStandardMaterial({ map: sheetTex(s.rec, s.w, s.h), roughness: 0.9 })
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.1, s.h), [p, p, face, p, p, p])
      if (s.stand) { m.rotation.x = Math.PI / 2; m.position.set(s.x, s.y + s.h / 2, s.z) } else m.position.set(s.x, s.y, s.z)
      if (s.rotY) m.rotation.y = s.rotY
      m.castShadow = true; m.receiveShadow = true; m.userData.stop = s.stop; m.userData.t = s.t; root.add(m); picks.push(m)
    }

    // ── light, camera ──
    const allB = new THREE.Box3().setFromObject(root)
    const c0 = allB.getCenter(new THREE.Vector3()), s0 = allB.getSize(new THREE.Vector3()), r = Math.max(s0.x, s0.z) * 0.8 + 10
    key.position.set(c0.x - 60, 120, c0.z + 80); key.target.position.copy(c0)
    Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 }); key.shadow.camera.updateProjectionMatrix()
    ctx.renderer.shadowMap.needsUpdate = true
    const o = orbit(spec.view.az, spec.view.el)
    const states: Record<string, THREE.Box3> = Object.fromEntries(Object.entries(spec.states).map(([k, b]) => [k, toB3(b)]))
    const cur = (states[focusRef.current] ?? states.all).clone(), from = cur.clone(), goal = cur.clone()
    let fT0 = 0, focusing = false, W = ctx.width, Hh = ctx.height
    const V = new THREE.Vector3(), target = new THREE.Vector3(), corners = Array.from({ length: 8 }, () => new THREE.Vector3())
    const place = () => {
      const mn = cur.min, mx = cur.max
      corners.forEach((c, i) => c.set(i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z))
      cur.getCenter(target)
      const d = 300
      cam.position.set(target.x + d * Math.cos(o.el) * Math.sin(o.az), target.y + d * Math.sin(o.el), target.z + d * Math.cos(o.el) * Math.cos(o.az)); cam.lookAt(target); cam.updateMatrixWorld()
      let l = Infinity, rr = -Infinity, b = Infinity, t = -Infinity
      for (const c of corners) { V.copy(c).applyMatrix4(cam.matrixWorldInverse); l = Math.min(l, V.x); rr = Math.max(rr, V.x); b = Math.min(b, V.y); t = Math.max(t, V.y) }
      const asp = W / Hh, half = Math.max(((t - b) / 2) * spec.view.pad, (((rr - l) / 2) * spec.view.pad) / asp) * (phone ? 1.04 : 1), cx = (l + rr) / 2, cy = (b + t) / 2
      cam.left = cx - half * asp; cam.right = cx + half * asp; cam.top = cy + half; cam.bottom = cy - half; cam.near = 1; cam.far = 1000
      cam.updateProjectionMatrix()
    }
    // ── DOM labels ──
    const host = lblRef.current!
    host.replaceChildren()
    const lbls = spec.labels.map((lb) => {
      const el = document.createElement('div'); el.className = `mp-lbl is-${lb.cls}`; el.textContent = lb.text
      if (lb.small) { const sm = document.createElement('small'); sm.textContent = lb.small; el.appendChild(sm) }
      host.appendChild(el); return { el, p: new THREE.Vector3(...lb.p), a: lb.anchor, w: 0, h: 0 }
    })
    const drawLabels = () => {
      for (const lb of lbls) {
        V.copy(lb.p).project(cam)
        const x = ((V.x + 1) / 2) * W, y = ((1 - V.y) / 2) * Hh
        // a label the frame would cut is not drawn at all (its piece still reads out on hover and in the list)
        if (!lb.w) { lb.el.style.display = ''; lb.w = lb.el.offsetWidth; lb.h = lb.el.offsetHeight }
        const x0 = x - (lb.a === 'l' ? 0 : lb.a === 'r' ? lb.w : lb.w / 2), y0 = y - (lb.a === 'b' ? 0 : lb.a === 't' ? lb.h : lb.h / 2)
        const out = x0 < 0 || x0 + lb.w > W || y0 < 0 || y0 + lb.h > Hh
        lb.el.style.display = out ? 'none' : ''
        if (!out) lb.el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`
      }
    }
    // ── picking, the hot outline, keyboard ──
    let hotStop = -1, cursor = -1, outline: THREE.LineSegments | null = null
    const outlineMat = new THREE.LineBasicMaterial({ color: ink })
    const mark = (k: number) => {
      if (outline) { root.remove(outline); outline.geometry.dispose(); outline = null }
      if (k < 0) return
      const b = toB3(spec.stops[k].box), sz = b.getSize(new THREE.Vector3())
      outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x + 0.3, sz.y + 0.3, sz.z + 0.3)), outlineMat)
      b.getCenter(outline.position); root.add(outline)
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pickAt = (e: PointerEvent | MouseEvent): { t: string; stop: number } | null => {
      const rc = ctx.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const h = ray.intersectObjects(picks, false)[0]
      if (!h) return null
      const cells = h.object.userData.cells as Wall['cells'] | undefined
      if (cells && h.instanceId != null) return { t: cells[h.instanceId].t, stop: cells[h.instanceId].stop }
      return { t: h.object.userData.t as string, stop: h.object.userData.stop as number }
    }
    let wake = () => {}
    const drag = bindDrag(ctx.canvas, o, 0.35, 0.25, () => wake())
    const onMove = (e: PointerEvent) => {
      if (o.held) return
      const p = pickAt(e)
      ctx.canvas.style.cursor = p && spec.stops[p.stop]?.open ? 'pointer' : ''
      cb.current.onHot(p ? p.t : '')
    }
    const onLeave = () => { if (cursor < 0) cb.current.onHot('') }
    const onClick = (e: MouseEvent) => { if (o.moved) return; const p = pickAt(e); const op = p ? spec.stops[p.stop]?.open : undefined; if (op) cb.current.onOpen(op) }
    ctx.canvas.addEventListener('pointermove', onMove); ctx.canvas.addEventListener('pointerleave', onLeave); ctx.canvas.addEventListener('click', onClick)
    api.current = {
      focus: (k) => { const b = states[k] ?? states.all; if (reduced) { cur.copy(b); focusing = false } else { from.copy(cur); goal.copy(b); fT0 = performance.now(); focusing = true } wake() },
      walk: (d) => { const n = spec.stops.length; cursor = (cursor + d + n) % n; hotStop = cursor; mark(cursor); cb.current.onHot(spec.stops[cursor].t); wake() },
      open: () => { const op = hotStop >= 0 ? spec.stops[hotStop].open : undefined; if (op) cb.current.onOpen(op) },
      nudge: (d) => { o.az = Math.min(o.az0 + 0.35, Math.max(o.az0 - 0.35, o.az + d)); wake() },
    }
    return {
      frame: (_t, _dt) => {
        wake = () => sc.wake()
        const now = performance.now()
        let moving = spring(o, _dt) || o.held
        if (focusing) { const u = ease((now - fT0) / 700); cur.min.lerpVectors(from.min, goal.min, u); cur.max.lerpVectors(from.max, goal.max, u); if (u >= 1) focusing = false; moving = true }
        if (anims.length) ctx.renderer.shadowMap.needsUpdate = true
        for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i], u = (now - a.t0) / a.dur; a.fn(ease(u)); moving = true; if (u >= 1) anims.splice(i, 1) }
        place()
        ctx.renderer.render(ctx.scene, cam)
        drawLabels()
        return moving
      },
      resize: (w, h) => { W = w; Hh = h },
      dispose: () => {
        drag.dispose()
        ctx.canvas.removeEventListener('pointermove', onMove); ctx.canvas.removeEventListener('pointerleave', onLeave); ctx.canvas.removeEventListener('click', onClick)
        if (outline) outline.geometry.dispose()
        outlineMat.dispose(); hatch.dispose(); host.replaceChildren()
        root.traverse((x) => { const mm = (x as THREE.Mesh).material; for (const mt of Array.isArray(mm) ? mm : mm ? [mm] : []) (mt as THREE.MeshStandardMaterial).map?.dispose() })
      },
    }
  }, [spec, reduced])
  const sc = useScene(setup)
  useEffect(() => { onStatus(sc.status) }, [sc.status, onStatus])
  useEffect(() => { api.current.focus(focus) }, [focus])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); api.current.walk(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); api.current.nudge(e.key === 'ArrowRight' ? 0.08 : -0.08) }
    else if (e.key === 'Enter') { e.preventDefault(); api.current.open() }
  }
  return (
    <div className="mp-gl" tabIndex={0} role="application" aria-label={label} onKeyDown={onKey}>
      <canvas ref={sc.ref} role="img" aria-label={spec.aria} />
      <div className="mp-lbls" ref={lblRef} aria-hidden="true" />
    </div>
  )
}
