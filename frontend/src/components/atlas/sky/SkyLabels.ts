/**
 * SkyLabels — «El Atlas» label layer. Spec .claude/designs/atlas-2026-10-02-spec.md §3.2
 * (Nomic Atlas LOD labels). A pool of ≤ 60 DOM refs written imperatively: the
 * label SET is chosen on zoom `end` (or ≤ every 100 ms), positions are written
 * every frame. Greedy collision on a 24 px grid; a colliding label is DROPPED,
 * never truncated; names wrap at 220 px. Upright EB Garamond + Plex Mono, 10 px floor.
 *
 * Budgets (BLUE simplify 11-05): Z0 10 star + 12 sector (a framed sector: its top 10 stars + the sector names) · Z1 the located system's 8 largest bodies ·
 * Z2 the focused planet only (the rest is hover).
 * Z0 carry-over (S1): a top-V star label tries right → left → below before it drops.
 * Instruments §4.3 landmarks: at Z0 the 24 top-V stars (68.5% of the money) are claimed first,
 * right after the furniture and before the sector names, and also try above.
 */
import type { SkyManifest, SkySystem, SkyBodies } from '@/lib/atlas/sky/geometry'
import { starPx } from '@/lib/atlas/sky/geometry'
import { formatCompactMXN } from '@/lib/utils'
import { textInk } from '@/lib/constants' // 10px sector labels take the AA text twin (weekend D4)

export const LABEL_POOL = 60
const GRID = 24
/** Z0 landmarks claimed before the sector names (instruments §4.3) */
const LANDMARKS = 5   // CYAN-2 11-05 (owner «a big data dump»): five names
export const WRAP = 220
export const FONT_MONO = '"IBM Plex Mono", "JetBrains Mono", monospace'
export const FONT_SERIF = '"Spectral", Georgia, serif'  // DESIGN.md §2: Spectral / Spectral SC / Plex Mono only

export interface LabelSlot {
  kind: 'sector' | 'star' | 'body'
  /** world anchor */
  wx: number
  /** sky-dive L4: a star label's index — its anchor follows the lens glide every frame */
  si?: number
  wy: number
  /** screen offset + CSS anchor translate */
  dx: number
  dy: number
  anchor: string
  text: string
  color: string
  /** §3.9 verb «Enfocar»: Tab focuses the label, Enter flies — `s:{star idx}` · `b:{body idx}` · `g:{sector id}` */
  target: string
  /** name + value, the button's accessible name */
  aria: string
}

export interface LabelInput {
  w: number; h: number; rho: number; X0: number; Y0: number
  level: 0 | 1 | 2
  lang: 'en' | 'es'
  manifest: SkyManifest
  starOrder: Int32Array
  starNames: string[]
  sectorColor: Record<number, string>
  bodies: SkyBodies | null
  /** the located system (Z1/Z2) and its names */
  system: SkySystem | null
  bodyNames: Map<number, string>
  focusBody: number | null
  /** canvas furniture (period bar, legend, search, stamps, finder): [x, y, w, h] claimed before any label */
  reserved: [number, number, number, number][]
  /** sky-dive: the framed sector (cluster level) — only its 10 largest stars are named, the rest stay quiet dots */
  framed?: number | null
  /** sky-dive L4: star positions as drawn (the lens), default the chart's */
  starX?: ArrayLike<number>
  starY?: ArrayLike<number>
  /** sky-dive (owner 2026-10-21, «names covered by the dots»): screen marks a label may not touch —
   *  [x, y, r, key] with key = the label target that owns the mark (`s:3`, `b:12`) or '' */
  marks?: Mark[]
  /** sky-dive round 2: filled with the targets (`s:3`, `b:12`) of names in the budget (the framed sector's 10 largest stars, the system's 12 largest bodies) dropped for lack of space
   *  — the dock lists them as «+N sin etiqueta»; hover still names them */
  dropped?: string[]
  /** 2026-11-04 the overview «Riesgo» arrangement: only these stars are named (most money at high or critical risk
   *  first), each with its share; no sector names (the sectors are not where the dots are) */
  riskOrder?: Int32Array
}
export type Mark = [number, number, number, string]

/** A grid over the marks so a label box tests only the marks near it. */
function markGrid(marks: Mark[]) {
  const cells = new Map<number, Mark[]>()
  for (const m of marks) {
    const c0 = Math.floor((m[0] - m[2]) / GRID), c1 = Math.floor((m[0] + m[2]) / GRID)
    const r0 = Math.floor((m[1] - m[2]) / GRID), r1 = Math.floor((m[1] + m[2]) / GRID)
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      const k = c * 4096 + r
      const list = cells.get(k)
      if (list) list.push(m); else cells.set(k, [m])
    }
  }
  /** true when the box [x, y, w, h] (2 px air) touches a mark not owned by `own` */
  return (x: number, y: number, bw: number, bh: number, own: string) => {
    const c0 = Math.floor(x / GRID), c1 = Math.floor((x + bw) / GRID), r0 = Math.floor(y / GRID), r1 = Math.floor((y + bh) / GRID)
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      for (const [mx, my, mr, key] of cells.get(c * 4096 + r) ?? []) {
        if (key && key === own) continue
        const dx = mx - Math.max(x - 2, Math.min(mx, x + bw + 2)), dy = my - Math.max(y - 2, Math.min(my, y + bh + 2))
        if (dx * dx + dy * dy < mr * mr) return true
      }
    }
    return false
  }
}

/** sky-dive: names at the cluster level */
const FRAMED_NAMES = 10

/** Character-width estimate → [width, height] of a label that wraps at 220 px. */
function box(text: string, charPx: number, linePx: number): [number, number] {
  const est = text.length * charPx
  return [Math.min(WRAP, est), linePx * Math.max(1, Math.ceil(est / WRAP))]
}

export function chooseLabels(L: LabelInput): LabelSlot[] {
  const { w, h, rho, X0, Y0, manifest, starNames } = L
  const S = manifest.stars
  const SX = L.starX ?? S.x, SY = L.starY ?? S.y
  const risk = L.level === 0 && L.riskOrder ? L.riskOrder : null
  const starOrder = risk ?? (L.framed != null ? L.starOrder.filter((i) => S.sector[i] === L.framed) : L.starOrder)
  const nameOf = (i: number) => risk ? `${S.siglas[i] || starNames[i]} · ${Math.round(S.h[i] * 100)}%` : starNames[i]
  const taken = new Set<number>()
  /** A label must fit whole inside the free canvas (left of the dock from Z1) — it is dropped, never clipped. */
  const claimCell = (x: number, y: number, bw: number, bh: number, reserve = false) => {
    if (!reserve && (x < 0 || y < 0 || x + bw > w || y + bh > h)) return false
    const c0 = Math.floor(x / GRID), c1 = Math.floor((x + bw) / GRID)
    const r0 = Math.floor(y / GRID), r1 = Math.floor((y + bh) / GRID)
    // furniture always claims its cells: two rects sharing a grid cell (finder + stamps) must not drop the second
    if (!reserve) for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (taken.has(c * 4096 + r)) return false
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) taken.add(c * 4096 + r)
    return true
  }
  for (const [x, y, bw, bh] of L.reserved) claimCell(x, y, bw, bh, true)
  const onMark = L.marks?.length ? markGrid(L.marks) : null
  /** a label cell is claimed only when it also stays clear of every mark but its own */
  const claimFree = (x: number, y: number, bw: number, bh: number, own: string) =>
    !(onMark && onMark(x, y, bw, bh, own)) && claimCell(x, y, bw, bh)
  const out: LabelSlot[] = []
  const onScreen = (sx: number, sy: number) => sx >= 0 && sx <= w && sy >= 0 && sy <= h

  // Z2: the focused planet only.
  if (L.level === 2) {
    const b = L.focusBody
    if (b != null && L.bodies) {
      const name = L.bodyNames.get(L.bodies.vendorId[b])
      // right-below the planet first (the amount-ring captions own 12 o'clock), then the other three corners;
      // a name that would sit on a moon is dropped (the dock carries it)
      if (name) {
        const sx = L.bodies.x[b] * rho + X0, sy = L.bodies.y[b] * rho + Y0, d = L.bodies.rp[b] + 6
        const [bw, bh] = box(name, 6.2, 15)
        for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
          const x = fx > 0 ? sx + d : sx - d - bw, y = fy > 0 ? sy + 2 : sy - 2 - bh
          if (claimFree(x, y, bw, bh, `b:${b}`)) {
            out.push({ kind: 'body', wx: L.bodies.x[b], wy: L.bodies.y[b], dx: fx * d, dy: fy * 2, anchor: `translate(${fx > 0 ? 0 : -100}%, ${fy > 0 ? 0 : -100}%)`, text: name, color: '', target: `b:${b}`, aria: name })
            break
          }
        }
      }
    }
    return out
  }

  // §4.3 landmarks: at Z0 no star label may cover a top-10 star's dot (IMSS's name used to sit on ISSSTE)
  const dots: [number, number, number][] = []
  if (L.level === 0 && !risk) for (let n = 0; n < 10 && n < starOrder.length; n++) dots.push([SX[starOrder[n]] * rho + X0, SY[starOrder[n]] * rho + Y0, starOrder[n]])
  // stars (pre-sorted by V); at Z0 each tries right → left → below → above → the four corners before it drops
  const takeStars = (upTo: number, from: { n: number }, alternates: boolean, drop?: string[]) => {
    for (; from.n < starOrder.length && out.length < upTo; from.n++) {
      const before = out.length
      const i = starOrder[from.n]
      const claim = (x: number, y: number, bw: number, bh: number) =>
        !dots.some(([px, py, j]) => j !== i && px >= x - 3 && px <= x + bw + 3 && py >= y - 3 && py <= y + bh + 3) && claimFree(x, y, bw, bh, `s:${i}`)
      const sx = SX[i] * rho + X0, sy = SY[i] * rho + Y0
      if (!onScreen(sx, sy)) continue
      const [bw, bh] = box(nameOf(i), 6.6, 16)
      const r = starPx(S.v[i]) + 4
      const base = { kind: 'star' as const, wx: SX[i], wy: SY[i], si: i, text: nameOf(i), color: '', target: `s:${i}`, aria: `${risk ? `${starNames[i]} · ${Math.round(S.h[i] * 100)}%` : starNames[i]} · ${formatCompactMXN(S.v[i])}` }
      if (claim(sx + r, sy - bh / 2, bw, bh)) out.push({ ...base, dx: r, dy: 0, anchor: 'translate(0, -50%)' })
      else if (alternates && claim(sx - r - bw, sy - bh / 2, bw, bh)) out.push({ ...base, dx: -r, dy: 0, anchor: 'translate(-100%, -50%)' })
      else if (alternates && claim(sx - bw / 2, sy + r, bw, bh)) out.push({ ...base, dx: 0, dy: r, anchor: 'translate(-50%, 0)' })
      else if (alternates && claim(sx - bw / 2, sy - r - bh, bw, bh)) out.push({ ...base, dx: 0, dy: -r, anchor: 'translate(-50%, -100%)' })
      // §4.3: the four corners touching the star (8 positions in all) before the label drops
      else if (alternates) {
        // the four corners touching the star, then (sky-dive, labels clear of marks) the same eight spots one step further out
        let done = false
        for (const d of [r * 0.7, r + 10]) {
          for (const [fx, fy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            if (claim(fx > 0 ? sx + d : sx - d - bw, fy > 0 ? sy + d : sy - d - bh, bw, bh)) {
              out.push({ ...base, dx: fx * d, dy: fy * d, anchor: `translate(${fx > 0 ? 0 : -100}%, ${fy > 0 ? 0 : -100}%)` })
              done = true
              break
            }
          }
          if (done || !L.marks?.length) break
          if (d > r) break
          const far = r + 12
          if (claim(sx + far, sy - bh / 2, bw, bh)) { out.push({ ...base, dx: far, dy: 0, anchor: 'translate(0, -50%)' }); break }
          if (claim(sx - far - bw, sy - bh / 2, bw, bh)) { out.push({ ...base, dx: -far, dy: 0, anchor: 'translate(-100%, -50%)' }); break }
        }
      }
      // the overview «Riesgo» names are the view's payload: before one drops, it tries a row or two up or down
      if (out.length === before && risk) {
        for (const dy of [-24, 24, -48, 48]) {
          if (claim(sx + r, sy + dy - bh / 2, bw, bh)) { out.push({ ...base, dx: r, dy, anchor: 'translate(0, -50%)' }); break }
          if (claim(sx - r - bw, sy + dy - bh / 2, bw, bh)) { out.push({ ...base, dx: -r, dy, anchor: 'translate(-100%, -50%)' }); break }
        }
      }
      // last resort (CYAN 2026-11-04): beside its dot over the unnamed dots (the paper knockout keeps it legible)
      if (out.length === before && risk) {
        if (claimCell(sx + r, sy - bh / 2, bw, bh)) out.push({ ...base, dx: r, dy: 0, anchor: 'translate(0, -50%)' })
        else if (claimCell(sx - r - bw, sy - bh / 2, bw, bh)) out.push({ ...base, dx: -r, dy: 0, anchor: 'translate(-100%, -50%)' })
      }
      if (out.length === before && from.n < upTo) drop?.push(`s:${i}`) // only the names meant to be there (the top upTo)
    }
  }
  const cursor = { n: 0 }

  if (risk) {
    takeStars(risk.length, cursor, true)
    return out
  }
  if (L.level === 0) {
    takeStars(L.framed != null ? FRAMED_NAMES : LANDMARKS, cursor, true, L.framed != null ? L.dropped : undefined)
    manifest.sectors.forEach((g) => {
      const sx = g.x * rho + X0
      const top = (g.y - g.r) * rho + Y0, bottom = (g.y + g.r) * rho + Y0
      const name = L.lang === 'en' ? g.name_en : g.name_es
      const bw = name.length * 8 + 8
      if (sx < -bw || sx > w + bw || bottom < 0 || top > h) return
      const base = { kind: 'sector' as const, wx: g.x, text: name, color: textInk((L.sectorColor[g.id] ?? '').trim()), target: `g:${g.id}`, aria: `${name} · ${formatCompactMXN(g.value)}` }
      const top_ = { ...base, wy: g.y - g.r, dx: 0, dy: -6, anchor: 'translate(-50%, -100%)' }
      // top of the disc → foot → left → right; if all four collide the name is DROPPED (the disc hue still
      // names the sector) — a sector name never overprints a star label (judge round 1)
      const midY = g.y * rho + Y0, side = g.r * rho
      if (claimFree(sx - bw / 2, top - 18, bw, 16, '')) out.push(top_)
      else if (claimFree(sx - bw / 2, bottom + 2, bw, 16, '')) out.push({ ...base, wy: g.y + g.r, dx: 0, dy: 4, anchor: 'translate(-50%, 0)' })
      else if (claimFree(sx - side - 4 - bw, midY - 8, bw, 16, '')) out.push({ ...base, wx: g.x - g.r, wy: g.y, dx: -4, dy: 0, anchor: 'translate(-100%, -50%)' })
      else if (claimFree(sx + side + 4, midY - 8, bw, 16, '')) out.push({ ...base, wx: g.x + g.r, wy: g.y, dx: 4, dy: 0, anchor: 'translate(0, -50%)' })
    })
    return out
  }

  // Z1: the located system's 12 largest bodies first (sky-dive: the rest stay quiet dots, named on hover), then star names, total 24
  const sys = L.system
  if (sys && L.bodies) {
    const B = L.bodies
    const hx = (id: number) => {
      const i = B.index.get(id)
      return i === undefined ? null : i
    }
    for (const sb of sys.bodies) {
      if (out.length >= 8) break
      const i = hx(sb.vendor_id)
      if (i == null) continue
      const sx = B.x[i] * rho + X0, sy = B.y[i] * rho + Y0
      if (!onScreen(sx, sy)) continue
      const name = L.bodyNames.get(sb.vendor_id) ?? sb.name
      const [bw, bh] = box(name, 6.2, 15)
      const r = B.rp[i] + 3
      // outward radial side: right of the body if it sits right of its star, else left
      const right = B.x[i] >= S.x[B.hostIdx[i]]
      // outward side first, then the other side; never on another body or star
      const fits = (rt: boolean) => rt ? claimFree(sx + r, sy - bh / 2, bw, bh, `b:${i}`) : claimFree(sx - r - bw, sy - bh / 2, bw, bh, `b:${i}`)
      const side = fits(right) ? right : fits(!right) ? !right : null
      if (side != null) out.push({ kind: 'body', wx: B.x[i], wy: B.y[i], dx: side ? r : -r, dy: 0,
        anchor: side ? 'translate(0, -50%)' : 'translate(-100%, -50%)', text: name, color: '',
        target: `b:${i}`, aria: `${name} · ${formatCompactMXN(sb.value_mxn)}` })   // BLUE simplify: a dropped supplier stays a quiet dot, named on hover (the rail lists the largest)
    }
  }
  return out   // Z1: its own suppliers only; other agencies are named on hover
}

/** Write text / kind / colour once per label-set change. */
export function writeLabels(slots: LabelSlot[], els: (HTMLButtonElement | null)[]) {
  for (let k = 0; k < LABEL_POOL; k++) {
    const el = els[k]
    if (!el) continue
    const s = slots[k]
    if (!s) { el.hidden = true; continue }
    el.hidden = false
    el.textContent = s.text
    el.dataset.kind = s.kind
    el.dataset.t = s.target
    el.setAttribute('aria-label', s.aria)
    el.style.color = s.color
  }
}

/** Every frame: transforms only. */
export function placeLabels(slots: LabelSlot[], els: (HTMLButtonElement | null)[], rho: number, X0: number, Y0: number, starX?: ArrayLike<number>, starY?: ArrayLike<number>) {
  for (let k = 0; k < slots.length && k < LABEL_POOL; k++) {
    const el = els[k], s = slots[k]
    if (!el || !s) continue
    const wx = starX && s.si != null ? starX[s.si] : s.wx, wy = starY && s.si != null ? starY[s.si] : s.wy
    el.style.transform = `translate3d(${wx * rho + X0 + s.dx}px, ${wy * rho + Y0 + s.dy}px, 0) ${s.anchor}`
  }
}
