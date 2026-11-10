// Split out of SkyFinder.tsx so that file exports only components (react-refresh/only-export-components).
import { WORLD, type SkyManifest } from '@/lib/atlas/sky/geometry'

/**
 * §2.6 density nebula: Σ tie money per star (V includes the remainder bands) splatted at
 * star positions on a 512² bitmap, alpha by log V, blurred once with ctx.filter.
 * ponytail: no 3-pass box-blur fallback — where ctx.filter is missing the shade is unblurred discs.
 */
export function nebulaBitmap(m: SkyManifest, ink: string): HTMLCanvasElement {
  const N = 512, sc = N / WORLD, S = m.stars
  const raw = document.createElement('canvas')
  raw.width = raw.height = N
  const g = raw.getContext('2d')!
  g.fillStyle = ink
  for (let i = 0; i < S.id.length; i++) {
    g.globalAlpha = 0.04 + 0.22 * Math.min(1, Math.max(0, Math.log10(Math.max(S.v[i], 1) / 1e8) / 4))
    g.beginPath()
    g.arc(S.x[i] * sc, S.y[i] * sc, Math.max(1.5, 2.5 * S.r[i] * sc), 0, Math.PI * 2)
    g.fill()
  }
  const out = document.createElement('canvas')
  out.width = out.height = N
  const o = out.getContext('2d')!
  o.filter = 'blur(6px)'
  if (o.filter !== 'blur(6px)') {
    // no ctx.filter (older Safari): a cheap box blur — downsample ×8, upsample smoothed. Never a blank.
    const t = document.createElement('canvas')
    t.width = t.height = N / 8
    const tg = t.getContext('2d')!
    tg.imageSmoothingEnabled = true
    tg.drawImage(raw, 0, 0, N / 8, N / 8)
    o.imageSmoothingEnabled = true
    o.drawImage(t, 0, 0, N, N)
    return out
  }
  o.drawImage(raw, 0, 0)
  return out
}
