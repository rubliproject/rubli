/**
 * MonedasScene — «Las monedas» in volume (lazy; three.js in vendor-three). Orthographic, one stack per
 * column of the DOM label grid: the camera frames exactly n columns, so stack k stands over label column k.
 * Coins are one InstancedMesh per stack (brushed metal, seam tone every 5, red top coin = crítico);
 * the slipped-decimal ghost is a dashed wire cylinder behind-right of this contract's stack.
 * Drag turns within ±0.35 rad and springs back on release; ←/→ nudge; ↑/↓ walk; Enter / click opens.
 */
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { tokenColor, useScene, type SceneCtx, type SceneHandle, type SceneStatus } from '@/components/kit/motion/scene'
import { bindDrag, fitLight, makeStage, orbit, placeOrtho, spring } from '@/components/kit/motion/stage'
import type { CoinStack } from '@/lib/contract/objects'
import { COIN } from './LasMonedas'

interface Props {
  stacks: CoinStack[]
  label: string
  onStatus: (s: SceneStatus) => void
  onHot: (k: number | null, walk?: boolean) => void
  onOpen: (k: number) => void
}

export default function MonedasScene({ stacks, label, onStatus, onHot, onOpen }: Props) {
  const api = useRef<{ walk: (d: number) => void; open: () => void; nudge: (d: number) => void }>({ walk: () => {}, open: () => {}, nudge: () => {} })
  const cb = useRef({ onHot, onOpen }); cb.current = { onHot, onOpen }

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const { R, H, GAP, AZ, EL } = COIN
    const n = stacks.length
    const { cam, key } = makeStage(ctx.scene, { shadow: ctx.width < 600 ? 1024 : 1536, floor: 0.18, keyI: 2.0, fillI: 2.2 })
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    ctx.renderer.shadowMap.autoUpdate = false // the light never moves: one shadow pass, not one per frame
    ctx.renderer.shadowMap.needsUpdate = true
    const light = tokenColor('--color-background-elevated'), seam = tokenColor('--color-text-muted'), crit = tokenColor('--color-risk-critical'), ink = tokenColor('--color-text-primary')
    const geo = new THREE.CylinderGeometry(R, R, H * 0.9, 48)
    const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2 })
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    const root = new THREE.Group(); ctx.scene.add(root)
    const hits: THREE.Mesh[] = []
    const M = new THREE.Matrix4()
    stacks.forEach((s, k) => {
      const x = (k - (n - 1) / 2) * GAP
      if (s.coins > 0) {
        const im = new THREE.InstancedMesh(geo, metal, s.coins)
        for (let j = 0; j < s.coins; j++) {
          M.makeTranslation(x, j * H + H / 2, 0); im.setMatrixAt(j, M)
          im.setColorAt(j, s.critical && j === s.coins - 1 ? crit : (j + 1) % 5 === 0 ? seam : light)
        }
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        im.castShadow = true; im.receiveShadow = true
        root.add(im)
      } else {
        // under half a coin: nothing is struck; a faint ring marks the place
        const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.96, R, 48), new THREE.MeshBasicMaterial({ color: seam, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.01, 0); root.add(ring)
      }
      const hh = Math.max(0.4, s.coins * H)
      const hit = new THREE.Mesh(new THREE.BoxGeometry(R * 2.4, hh, R * 2.4), hitMat)
      hit.position.set(x, hh / 2, 0); hit.userData.k = k
      root.add(hit); hits.push(hit)
      if (s.ghost != null && s.ghost > 0) {
        const gh = s.ghost * H
        const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(R, R, gh, 24)), new THREE.LineDashedMaterial({ color: ink, dashSize: 0.25, gapSize: 0.18 }))
        wire.computeLineDistances(); wire.position.set(x + 1.3, gh / 2, -2.4); root.add(wire)
      }
    })
    const bb = new THREE.Box3().setFromObject(root)
    fitLight(key, bb)
    const o = orbit(AZ, EL)
    const target = new THREE.Vector3(0, 0, 0)
    const V = new THREE.Vector3()
    let W = ctx.width, Hh = ctx.height, hot = -1, cursor = -1
    const corners: THREE.Vector3[] = []
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z))
    const halfW = (n * GAP * Math.cos(AZ)) / 2
    const place = () => {
      placeOrtho(cam, target, o, halfW, W / Hh)
      let lo = Infinity
      for (const c of corners) { V.copy(c).applyMatrix4(cam.matrixWorldInverse); lo = Math.min(lo, V.y) }
      const span = (2 * halfW) / (W / Hh)
      cam.bottom = lo - 0.35; cam.top = cam.bottom + span
      cam.updateProjectionMatrix()
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pickAt = (e: PointerEvent | MouseEvent) => {
      const r = ctx.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const h = ray.intersectObjects(hits, false)[0]
      return h ? (h.object.userData.k as number) : -1
    }
    let wake = () => {}
    const drag = bindDrag(ctx.canvas, o, 0.35, 0.12, () => wake())
    const onMove = (e: PointerEvent) => { if (o.held) return; const k = pickAt(e); if (k !== hot) { hot = k; cb.current.onHot(k < 0 ? null : k); ctx.canvas.style.cursor = k >= 0 && !stacks[k].self ? 'pointer' : '' } }
    const onLeave = () => { hot = -1; if (cursor < 0) cb.current.onHot(null) }
    const onClick = (e: MouseEvent) => { if (o.moved) return; const k = pickAt(e); if (k >= 0) cb.current.onOpen(k) }
    ctx.canvas.addEventListener('pointermove', onMove)
    ctx.canvas.addEventListener('pointerleave', onLeave)
    ctx.canvas.addEventListener('click', onClick)
    api.current = {
      walk: (d) => { cursor = (cursor + d + n) % n; cb.current.onHot(cursor, true) },
      open: () => { if (cursor >= 0) cb.current.onOpen(cursor) },
      nudge: (d) => { o.az = Math.min(o.az0 + 0.35, Math.max(o.az0 - 0.35, o.az + d)); wake() },
    }
    return {
      frame: (_t, dt) => {
        wake = () => s.wake()
        const moving = spring(o, dt)
        place()
        ctx.renderer.render(ctx.scene, cam)
        return moving || o.held
      },
      resize: (w, h) => { W = w; Hh = h },
      dispose: () => {
        drag.dispose()
        ctx.canvas.removeEventListener('pointermove', onMove)
        ctx.canvas.removeEventListener('pointerleave', onLeave)
        ctx.canvas.removeEventListener('click', onClick)
        hitMat.dispose(); metal.dispose(); geo.dispose()
      },
    }
  }, [stacks]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = useScene(setup)
  useEffect(() => { onStatus(s.status) }, [s.status, onStatus])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); api.current.walk(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); api.current.nudge(e.key === 'ArrowRight' ? 0.12 : -0.12) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.current.open() }
  }
  return (
    <div className="obj-gl" tabIndex={0} role="group" aria-label={label} onKeyDown={onKey}>
      <canvas ref={s.ref} role="img" aria-label={label} />
    </div>
  )
}
