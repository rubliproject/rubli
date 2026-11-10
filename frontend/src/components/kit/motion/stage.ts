/**
 * Stage — the lit, still-object setup the dossier objects share (El sello's relief, Las monedas, El tablero):
 * an ORTHOGRAPHIC camera on a bounded orbit around a target, one soft key light whose shadow camera fits the
 * object, a hemisphere fill and a shadow-only floor. Light and shadow model the form only; no value is encoded
 * in them (rubli-motion-viz §1). `spring` returns a turned piece to its hero angle on release.
 */
import * as THREE from 'three'

/** `moved` = the last gesture turned the piece (so its click is not an «open»). */
export interface Orbit { az: number; el: number; az0: number; el0: number; vAz: number; vEl: number; held: boolean; moved: boolean }

export function makeStage(scene: THREE.Scene, opts: { shadow: number; floor?: number; keyI?: number; fillI?: number }) {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
  const key = new THREE.DirectionalLight(0xffffff, opts.keyI ?? 0.8)
  key.castShadow = true
  key.shadow.mapSize.set(opts.shadow, opts.shadow)
  key.shadow.radius = 4
  key.shadow.bias = -0.0006
  scene.add(key, key.target, new THREE.HemisphereLight(0xffffff, 0xd8d8d8, opts.fillI ?? 0.95))
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: opts.floor ?? 0.16 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  return { cam, key, floor }
}

/** Point the key light and size its shadow frustum to a box (so contact shadows exist everywhere, no more). */
export function fitLight(key: THREE.DirectionalLight, box: THREE.Box3) {
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
  const r = Math.max(s.x, s.y, s.z) * 0.8 + 1
  key.position.set(c.x - r * 0.7, c.y + r * 1.8, c.z - r * 0.6)
  key.target.position.copy(c)
  const sc = key.shadow.camera
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.5; sc.far = r * 5
  sc.updateProjectionMatrix()
}

/** Place the camera on the orbit and frame `halfW` world units either side of the target (height from the aspect). */
export function placeOrtho(cam: THREE.OrthographicCamera, target: THREE.Vector3, o: Orbit, halfW: number, aspect: number, shiftY = 0) {
  const d = 200
  cam.position.set(target.x + d * Math.cos(o.el) * Math.sin(o.az), target.y + d * Math.sin(o.el), target.z + d * Math.cos(o.el) * Math.cos(o.az))
  cam.lookAt(target)
  const halfH = halfW / aspect
  cam.left = -halfW; cam.right = halfW; cam.top = halfH + shiftY; cam.bottom = -halfH + shiftY
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

/** Critically damped return to the hero angle while not held; true while still moving. */
export function spring(o: Orbit, dt: number, k = 60): boolean {
  if (o.held) return false
  const c = 2 * Math.sqrt(k)
  o.vAz += (-(o.az - o.az0) * k - o.vAz * c) * dt; o.az += o.vAz * dt
  o.vEl += (-(o.el - o.el0) * k - o.vEl * c) * dt; o.el += o.vEl * dt
  const moving = Math.abs(o.az - o.az0) > 1e-4 || Math.abs(o.el - o.el0) > 1e-4 || Math.abs(o.vAz) > 1e-4 || Math.abs(o.vEl) > 1e-4
  if (!moving) { o.az = o.az0; o.el = o.el0; o.vAz = o.vEl = 0 }
  return moving
}

export const orbit = (az: number, el: number): Orbit => ({ az, el, az0: az, el0: el, vAz: 0, vEl: 0, held: false, moved: false })

/** Drag within a clamp (±dAz, ±dEl around the hero angle); the spring takes it home on release. */
export function bindDrag(canvas: HTMLCanvasElement, o: Orbit, dAz: number, dEl: number, wake: () => void) {
  let from: { x: number; y: number; az: number; el: number } | null = null
  const down = (e: PointerEvent) => { from = { x: e.clientX, y: e.clientY, az: o.az, el: o.el }; o.held = true; o.moved = false; canvas.setPointerCapture?.(e.pointerId) }
  const move = (e: PointerEvent) => {
    if (!from) return
    if (Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 4) o.moved = true
    o.az = Math.min(o.az0 + dAz, Math.max(o.az0 - dAz, from.az + (e.clientX - from.x) * 0.006))
    o.el = Math.min(o.el0 + dEl, Math.max(o.el0 - dEl, from.el + (e.clientY - from.y) * 0.004))
    wake()
  }
  const up = () => { if (!from) return; from = null; o.held = false; wake() }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  return {
    dispose: () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    },
  }
}
