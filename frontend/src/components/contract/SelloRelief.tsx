/**
 * SelloRelief — the 3D plate under «El sello» (lazy; three.js stays in vendor-three).
 * Top-down orthographic scene where 1 world unit = 1 CSS px of the sheet's box, so each raised plate sits
 * exactly under its HTML stamp: the text stays real DOM (≥ 12 px, selectable by screen readers), the
 * canvas only adds the relief (plates + soft contact shadows). Static: one render per layout change.
 */
import { useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { tokenColor, useScene, type SceneCtx, type SceneHandle, type SceneStatus } from '@/components/kit/motion/scene'
import { makeStage } from '@/components/kit/motion/stage'

export default function SelloRelief({ onStatus }: { onStatus: (s: SceneStatus) => void }) {
  const setup = useCallback((ctx: SceneCtx): SceneHandle => {
    const box = ctx.canvas.parentElement as HTMLElement
    const { cam, key, floor } = makeStage(ctx.scene, { shadow: 2048, floor: 0.14, keyI: 1.2, fillI: 2.9 })
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const paper = new THREE.MeshStandardMaterial({ color: tokenColor('--color-background'), roughness: 0.92, metalness: 0 })
    const plates = new THREE.Group(); ctx.scene.add(plates)
    let W = ctx.width, H = ctx.height, dirty = true

    const build = () => {
      plates.children.forEach((m) => (m as THREE.Mesh).geometry.dispose())
      plates.clear()
      const b = box.getBoundingClientRect()
      const at = (el: Element, depth: number, lift: number, round: boolean) => {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) return
        const geo = round ? new THREE.CylinderGeometry(Math.min(r.width, r.height) / 2, Math.min(r.width, r.height) / 2, depth, 64) : new THREE.BoxGeometry(r.width, depth, r.height)
        const m = new THREE.Mesh(geo, paper)
        m.position.set(r.left - b.left + r.width / 2 - W / 2, lift + depth / 2, r.top - b.top + r.height / 2 - H / 2)
        m.castShadow = true; m.receiveShadow = true
        plates.add(m)
      }
      const doc = box.querySelector('.sl-doc')
      if (doc) at(doc, 5, 0, false)
      box.querySelectorAll('.sl-stamp').forEach((st) => at(st, 9, 5, st.classList.contains('is-ring')))
      cam.left = -W / 2; cam.right = W / 2; cam.top = H / 2; cam.bottom = -H / 2; cam.near = 1; cam.far = 2000
      cam.position.set(0, 1000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix()
      key.position.set(-W * 0.35, 700, -H * 0.3); key.target.position.set(0, 0, 0)
      const sc = key.shadow.camera
      sc.left = -W; sc.right = W; sc.top = H; sc.bottom = -H; sc.near = 1; sc.far = 2000; sc.updateProjectionMatrix()
      floor.scale.set(Math.max(1, W / 200), Math.max(1, H / 200), 1)
    }

    const onFonts = () => { dirty = true; ctx.canvas.dispatchEvent(new Event('sl-wake')) }
    document.fonts?.ready.then(onFonts).catch(() => {})
    return {
      frame: () => {
        if (dirty) { build(); dirty = false }
        ctx.renderer.render(ctx.scene, cam)
        return false
      },
      resize: (w, h) => { W = w; H = h; dirty = true },
      dispose: () => { plates.children.forEach((m) => (m as THREE.Mesh).geometry.dispose()); paper.dispose() },
    }
  }, [])
  const s = useScene(setup)
  useEffect(() => { onStatus(s.status) }, [s.status, onStatus])
  // fonts settling re-measure: the setup flags dirty and asks for one frame
  useEffect(() => {
    const c = s.ref.current
    if (!c) return
    const w = () => s.wake()
    c.addEventListener('sl-wake', w)
    return () => c.removeEventListener('sl-wake', w)
  }, [s])
  return <canvas ref={s.ref} className="sl-canvas" aria-hidden="true" />
}
