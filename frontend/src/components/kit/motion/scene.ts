/**
 * Motion kit — one renderer lifecycle for every three.js primitive (rubli-motion-viz § perf):
 * DPR cap (1.5 on phones, 2 elsewhere), ResizeObserver, pause when off-screen or the tab is hidden,
 * a loop that sleeps when the scene is at rest (`frame` returns false) and wakes on demand,
 * reduced-motion detection, and a full dispose on unmount (geometries, materials, context).
 * Colours come from CSS tokens, resolved through the browser (any colour syntax → rgb).
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { useEdition } from '@/lib/theme'

export interface SceneCtx { renderer: THREE.WebGLRenderer; scene: THREE.Scene; width: number; height: number; dpr: number; canvas: HTMLCanvasElement }
export interface SceneHandle {
  /** Draw one frame. Return false when nothing moves any more: the loop sleeps until `wake()`. */
  frame: (t: number, dt: number) => boolean | void
  resize?: (width: number, height: number) => void
  dispose?: () => void
}
export type SceneStatus = 'idle' | 'ok' | 'nogl'

const tokenCache = new Map<string, string>()
/** `--color-cat-blue` → 'rgb(37, 99, 235)' as the page resolves it (light/dark, any syntax). */
export function cssToken(name: string): string {
  let v = tokenCache.get(name)
  if (v) return v
  const el = document.createElement('i')
  el.style.color = `var(${name})`
  document.body.appendChild(el)
  v = getComputedStyle(el).color || 'rgb(0, 0, 0)'
  el.remove()
  tokenCache.set(name, v)
  return v
}
export const tokenColor = (name: string) => new THREE.Color().setStyle(cssToken(name))
export const styleColor = (css: string) => new THREE.Color().setStyle(css)

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}

export function hasWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export interface SceneApi { ref: RefObject<HTMLCanvasElement | null>; status: SceneStatus; wake: () => void }

/** `setup` builds the scene once per (setup identity); memoize it on the data. */
export function useScene(setup: ((ctx: SceneCtx) => SceneHandle) | null): SceneApi {
  const ref = useRef<HTMLCanvasElement>(null)
  // the dark-mode toggle re-values every token: forget the resolved colours and rebuild the scene (every primitive)
  const edition = useEdition()
  const [status, setStatus] = useState<SceneStatus>('idle')
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !setup) return
    tokenCache.clear()
    if (!hasWebGL()) { setStatus('nogl'); return }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch { setStatus('nogl'); return }
    const scene = new THREE.Scene()
    const box = canvas.parentElement ?? canvas
    const size = () => ({ w: Math.max(1, box.clientWidth), h: Math.max(1, box.clientHeight) })
    let { w, h } = size()
    const dpr = Math.min(window.devicePixelRatio || 1, w < 600 ? 1.5 : 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    const handle = setup({ renderer, scene, width: w, height: h, dpr, canvas })
    setStatus('ok')

    let raf = 0, last = performance.now(), visible = true, awake = true
    const tick = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      awake = handle.frame(now / 1000, dt) !== false
      if (awake) raf = requestAnimationFrame(tick)
    }
    const wake = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick) } }
    wakeRef.current = wake
    wake()

    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) wake() }, { rootMargin: '100px 0px' })
    io.observe(canvas)
    const onVis = () => { if (!document.hidden) wake() }
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(() => {
      const s = size()
      if (s.w === w && s.h === h) return
      w = s.w; h = s.h
      renderer.setSize(w, h, false)
      handle.resize?.(w, h)
      wake()
    })
    ro.observe(box)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect(); ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      handle.dispose?.()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mat of mats) mat.dispose()
      })
      renderer.dispose()
      // no forceContextLoss(): StrictMode re-runs this effect on the SAME canvas, and a lost context
      // makes the second WebGLRenderer throw (null precision). The unmounted canvas is GC'd with its context.
      wakeRef.current = () => {}
    }
  }, [setup, edition])

  return { ref, status, wake: () => wakeRef.current() }
}

/** World → CSS px inside the canvas box; `behind` when the point is past the camera. */
const _v = new THREE.Vector3()
export function project(p: THREE.Vector3Like, camera: THREE.Camera, w: number, h: number): { x: number; y: number; behind: boolean } {
  _v.set(p.x, p.y, p.z).project(camera)
  return { x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h, behind: _v.z > 1 }
}

export const easeOut = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)
