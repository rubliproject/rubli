/** WebGL feature test without importing three.js (pages call it before the lazy scene chunk loads). */
export function hasWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
export type GlStatus = 'idle' | 'ok' | 'nogl'
