/**
 * TableroScene — «El tablero» in volume (lazy; three.js in vendor-three). Orthographic, near-frontal
 * (el 1.22 rad); a plaster board, pin heads (sphere: ink adds · paper + ring subtracts · red = the case),
 * threads from the supplier's pin whose radius is ONE function of the fact's share (threadRadius).
 * Labels are DOM links projected every frame, anchored right of the head (never over it); the centre
 * label sits left of its pin. Tilt only: drag ±0.12 / ±0.08 rad, springs back on release, so labels stay
 * on their pins. Threads grow once (≤ 1 s); reduced motion = the final board.
 */
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { project, tokenColor, useReducedMotion, useScene, type SceneCtx, type SceneHandle, type SceneStatus } from '@/components/kit/motion/scene'
import { bindDrag, fitLight, makeStage, orbit, placeOrtho, spring } from '@/components/kit/motion/stage'
import { groupLabel, threadRadius, type Layout, type Pin } from '@/lib/aria/tablero'
import { PinLabel } from './ElTablero'

interface Props {
  layout: Layout
  centre: { name: string; sub: string }
  lang: 'es' | 'en'
  label: string
  onStatus: (s: SceneStatus) => void
  onHot: (p: Pin | null, walk?: { k: number; n: number }) => void
}

const HEAD = 0.36, Y = 1.05, GROW = 0.8

export default function TableroScene({ layout, centre, lang, label, onStatus, onHot }: Props) {
  const phone = layout.w < 30
  const nav = useNavigate()
  const reduced = useReducedMotion()
  const lblRef = useRef<HTMLDivElement>(null)
  const api = useRef<{ walk: (d: number) => void; open: () => void }>({ walk: () => {}, open: () => {} })
  const cb = useRef({ onHot, nav }); cb.current = { onHot, nav }

  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const { cam, key } = makeStage(ctx.scene, { shadow: ctx.width < 600 ? 768 : 2048, floor: 0.12, keyI: 1.1, fillI: 1.9 })
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap
    // the light never moves: the shadow map is redrawn only while the threads grow, not on every turn
    ctx.renderer.shadowMap.autoUpdate = false
    ctx.renderer.shadowMap.needsUpdate = true
    const ink = tokenColor('--color-text-primary'), paper = tokenColor('--color-background'), crit = tokenColor('--color-risk-critical'), muted = tokenColor('--color-text-muted'), board = tokenColor('--color-background-elevated')
    const mats: THREE.Material[] = []
    const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m)
    const plaster = mat(new THREE.MeshStandardMaterial({ color: board, roughness: 0.95 }))
    const inkM = mat(new THREE.MeshStandardMaterial({ color: ink, roughness: 0.6 }))
    const redM = mat(new THREE.MeshStandardMaterial({ color: crit, roughness: 0.55 }))
    const paperM = mat(new THREE.MeshStandardMaterial({ color: paper, roughness: 0.7 }))
    const mutedM = mat(new THREE.MeshStandardMaterial({ color: muted, roughness: 0.6 }))
    const steel = mat(new THREE.MeshStandardMaterial({ color: muted, roughness: 0.4, metalness: 0.6 }))
    const hitM = mat(new THREE.MeshBasicMaterial({ visible: false }))
    const root = new THREE.Group(); ctx.scene.add(root)
    const { w, h, centre: c0, placed } = layout
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, h), plaster)
    slab.position.y = 0.2; slab.receiveShadow = true; root.add(slab)
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), mat(new THREE.LineBasicMaterial({ color: muted, transparent: true, opacity: 0.6 })))
    rim.position.copy(slab.position); root.add(rim)
    const headGeo = new THREE.SphereGeometry(HEAD, 20, 14), stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), hitGeo = new THREE.SphereGeometry(HEAD * 2, 8, 6)
    const ringGeo = new THREE.TorusGeometry(HEAD, 0.06, 8, 28)
    const hits: THREE.Mesh[] = []
    const pinAt = (x: number, z: number, m: THREE.Material, r = 1) => {
      const head = new THREE.Mesh(headGeo, m); head.scale.setScalar(r); head.position.set(x, Y, z); head.castShadow = true; root.add(head)
      const stem = new THREE.Mesh(stemGeo, steel); stem.position.set(x, 0.75, z); stem.castShadow = true; root.add(stem)
    }
    pinAt(c0.x, c0.z, inkM, 1.35)
    const threads: Array<{ m: THREE.Mesh; len: number; delay: number }> = []
    const A = new THREE.Vector3(c0.x, Y, c0.z), up = new THREE.Vector3(0, 1, 0)
    placed.forEach((pl, k) => {
      const p = pl.pin
      pinAt(pl.x, pl.z, p.red ? redM : p.neg ? paperM : inkM)
      if (p.neg) { const ring = new THREE.Mesh(ringGeo, inkM); ring.rotation.x = Math.PI / 2; ring.position.set(pl.x, Y, pl.z); root.add(ring) }
      const hit = new THREE.Mesh(hitGeo, hitM); hit.position.set(pl.x, Y, pl.z); hit.userData.k = k; root.add(hit); hits.push(hit)
      const B = new THREE.Vector3(pl.x, Y, pl.z), dir = B.clone().sub(A), len = dir.length()
      const r = threadRadius(p.w)
      // pivot at the supplier's pin: the thread grows from there along its own axis
      const geo = new THREE.CylinderGeometry(r, r, 1, 10); geo.translate(0, 0.5, 0)
      const m = new THREE.Mesh(geo, p.red ? redM : p.neg ? mutedM : inkM)
      m.position.copy(A); m.quaternion.setFromUnitVectors(up, dir.normalize()); m.scale.set(1, reduced ? len : 0.0001, 1)
      m.castShadow = true; root.add(m)
      threads.push({ m, len, delay: (k / Math.max(1, placed.length)) * 0.35 })
    })
    fitLight(key, new THREE.Box3().setFromObject(slab).expandByScalar(2))
    const o = orbit(0, 1.22)
    const target = new THREE.Vector3(0, 0.4, 0)
    let W = ctx.width, H = ctx.height, t0 = -1, cursor = -1, hot = -1
    const halfW = w / 2 + 1
    const lbls = lblRef.current
    const els = lbls ? Array.from(lbls.querySelectorAll<HTMLElement>('[data-at]')) : []
    const at = els.map((el) => el.dataset.at!.split(',').map(Number))
    let sized = false
    const placeLabels = () => {
      els.forEach((el, i) => {
        const [x, y, z] = at[i]
        const q = project({ x, y, z }, cam, W, H)
        const a = el.dataset.anchor
        el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) ${a === 'r' ? 'translate(-100%, -50%)' : a === 'b' ? 'translate(-50%, -100%)' : a === 'bl' ? 'translate(0, -100%)' : 'translate(0, -50%)'}`
        // never past the board's edge: the label's width is capped by the room on its side
        const mw = `min(var(--tb-max), ${Math.max(60, Math.round((a === 'r' ? q.x : a === 'b' ? Math.min(q.x, W - q.x) * 2 : W - q.x) - 6))}px)`
        if (!sized && el.dataset.mw !== mw) { el.dataset.mw = mw; el.style.maxWidth = mw } // widths fit at the hero angle only: a width write re-lays the label
      })
      if (!o.held && Math.abs(o.az - o.az0) < 1e-3 && Math.abs(o.el - o.el0) < 1e-3) sized = true
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pickAt = (e: MouseEvent) => {
      const r = ctx.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const hh = ray.intersectObjects(hits, false)[0]
      return hh ? (hh.object.userData.k as number) : -1
    }
    let wake = () => {}
    const drag = bindDrag(ctx.canvas, o, 0.12, 0.08, () => wake())
    const onMove = (e: PointerEvent) => { if (o.held) return; const k = pickAt(e); if (k !== hot) { hot = k; cb.current.onHot(k < 0 ? null : placed[k].pin); ctx.canvas.style.cursor = k >= 0 && placed[k].pin.href ? 'pointer' : '' } }
    const onClick = (e: MouseEvent) => { if (o.moved) return; const k = pickAt(e); const href = k >= 0 ? placed[k].pin.href : null; if (href) cb.current.nav(href) }
    const onLeave = () => { hot = -1; if (cursor < 0) cb.current.onHot(null) }
    ctx.canvas.addEventListener('pointermove', onMove)
    ctx.canvas.addEventListener('click', onClick)
    ctx.canvas.addEventListener('pointerleave', onLeave)
    api.current = {
      walk: (d) => { const n = placed.length; if (!n) return; cursor = (cursor + d + n) % n; cb.current.onHot(placed[cursor].pin, { k: cursor, n }) },
      open: () => { const href = cursor >= 0 ? placed[cursor].pin.href : null; if (href) cb.current.nav(href) },
    }
    return {
      frame: (t, dt) => {
        wake = () => s.wake()
        if (t0 < 0) t0 = t
        let growing = false
        if (!reduced) for (const th of threads) {
          const u = Math.min(1, Math.max(0, (t - t0 - th.delay) / GROW))
          const e = 1 - Math.pow(1 - u, 3)
          th.m.scale.y = Math.max(0.0001, e * th.len)
          if (u < 1) growing = true
        }
        if (growing) ctx.renderer.shadowMap.needsUpdate = true
        const moving = spring(o, dt)
        placeOrtho(cam, target, o, halfW, W / H)
        ctx.renderer.render(ctx.scene, cam)
        placeLabels()
        return growing || moving || o.held
      },
      resize: (ww, hh) => { W = ww; H = hh; sized = false },
      dispose: () => {
        drag.dispose()
        ctx.canvas.removeEventListener('pointermove', onMove)
        ctx.canvas.removeEventListener('click', onClick)
        ctx.canvas.removeEventListener('pointerleave', onLeave)
        mats.forEach((m) => m.dispose())
      },
    }
  }, [layout, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = useScene(setup)
  useEffect(() => { onStatus(s.status) }, [s.status, onStatus])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); api.current.walk(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'Enter' || e.key === ' ') { if (e.target === e.currentTarget) { e.preventDefault(); api.current.open() } }
  }
  const off = HEAD + 0.45
  return (
    <div className="obj-gl tb-gl" tabIndex={0} role="group" aria-label={label} onKeyDown={onKey}>
      <canvas ref={s.ref} role="img" aria-label={label} />
      <div className="tb-lbls" ref={lblRef}>
        <div className={`tb-lbl is-centre${phone ? ' is-bl' : ''}`} data-at={`${layout.centre.x - (phone ? 0.5 : 0)},${Y},${layout.centre.z - HEAD * 1.35 - 0.3}`} data-anchor={phone ? 'bl' : 'b'}><b>{centre.name}</b><small>{centre.sub}</small></div>
        {layout.heads.map((g) => <div key={g.group} className={`tb-lbl is-head${g.side === 'l' ? ' is-l' : ''}`} data-at={`${g.x + (g.side === 'l' ? 0.3 : -0.3)},0.4,${g.z}`} data-anchor={g.side === 'l' ? 'r' : undefined}>{groupLabel(g.group, lang)}</div>)}
        {layout.placed.map((pl) => (
          <div key={pl.pin.key} className={`tb-lbl${pl.pin.red ? ' is-red' : ''}${pl.side === 'l' ? ' is-l' : ''}`} data-at={`${pl.x + (pl.side === 'l' ? -off : off)},${Y},${pl.z}`} data-anchor={pl.side === 'l' ? 'r' : undefined}>{pl.kicker && <span className="tb-k">{groupLabel(pl.kicker, lang)}</span>}<PinLabel p={pl.pin} /></div>
        ))}
      </div>
    </div>
  )
}
