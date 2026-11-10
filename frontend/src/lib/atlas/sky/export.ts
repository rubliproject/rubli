/**
 * «Exportar / Export» — CSV built client-side from the rows on screen. Spec
 * .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.8 (F24, F16; Datawrapper footer).
 * Public basis only: a body is exported when it is in `system.ranked` (ranking_safe) and carries a
 * name; withheld rows are dropped and counted. Every row carries layout_version, data_cut,
 * risk_basis and view_url; the last row counts n_requested · n_public · n_withheld · n_not_drawn.
 * Star rows use manifest columns only. No RFC column, ever. The PNG plate (S3, F23) is the canvas + a drawn colophon.
 */
import type { SkyManifest, SkySystem } from './geometry'

type Cell = string | number | null | undefined
export interface CsvMeta { layout_version: string; data_cut: string; risk_basis: string; view_url: string }
export interface CsvCounts { n_requested: number; n_public: number; n_withheld: number; n_not_drawn: number }
export interface CsvPart { head: string[]; rows: Cell[][]; counts: CsvCounts }

export const csvCell = (v: Cell) => {
  let s = v == null ? '' : String(v)
  // A text cell starting with = + - @ (or tab/CR) runs as a formula in Excel /
  // Sheets — COMPRANET titles are untrusted text, so neutralise with a quote.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ?`"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function csvText(meta: CsvMeta, part: CsvPart): string {
  const m = [meta.layout_version, meta.data_cut, meta.risk_basis, meta.view_url]
  const c = part.counts
  return [
    ['layout_version', 'data_cut', 'risk_basis', 'view_url', ...part.head],
    ...part.rows.map((r) => [...m, ...r]),
    ['n_requested', c.n_requested, 'n_public', c.n_public, 'n_withheld', c.n_withheld, 'n_not_drawn', c.n_not_drawn],
  ].map((r) => r.map(csvCell).join(',')).join('\n')
}

const BODY_HEAD = ['vendor_id', 'name', 'institution_id', 'institution_name', 'share_here', 'value_mxn_here', 'first_year', 'last_year', 'n_contracts_here', 'risk_indicator_here']

/** «Este sistema»: the drawn bodies on the public basis; the remainder band counts as not drawn. */
export function systemPart(sys: SkySystem): CsvPart {
  const safe = new Set(sys.ranked)
  const pub = sys.bodies.filter((b) => safe.has(b.vendor_id) && b.name)
  return {
    head: BODY_HEAD,
    rows: [...pub].sort((a, b) => b.value_mxn - a.value_mxn).map((b) => [
      b.vendor_id, b.name, sys.star.id, sys.star.name, b.share, b.value_mxn, b.first_year, b.last_year, b.n_contracts_here, b.risk_here,
    ]),
    counts: {
      n_requested: sys.bodies.length, n_public: pub.length, n_withheld: sys.bodies.length - pub.length,
      n_not_drawn: sys.remainder.reduce((t, r) => t + r[2], 0),
    },
  }
}

/** Stars (Sector scope, or pinned stars): manifest columns only. */
export function starPart(m: SkyManifest, idxs: number[]): CsvPart {
  const S = m.stars
  const sec = new Map(m.sectors.map((g) => [g.id, g.code]))
  return {
    head: ['institution_id', 'name', 'siglas', 'sector', 'value_mxn', 'halo_h', 'n_vendors', 'n_drawn'],
    rows: idxs.map((i) => [S.id[i], S.name[i], S.siglas[i], sec.get(S.sector[i]) ?? '', S.v[i], S.h[i], S.nv[i], S.drawn[i]]),
    counts: { n_requested: idxs.length, n_public: idxs.length, n_withheld: 0, n_not_drawn: 0 },
  }
}

// ── §3.8 PNG plate (F23): the canvas snapshot + a drawn header and colophon — geometry only, no DOM label ──
export const PLATE_HEAD = 64
export const PLATE_FOOT = 72
export interface PlateText { title: string; path: string; level: string; colophon: string[] }
/** `width`: css px of the canvas kept from the left (the free area — the dock covers the rest) */
export interface PlateExtra { width: number; pins: { x: number; y: number; n: number }[]; finder: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null }

/** Compose the plate at the snapshot's DPR: 64 px header, the canvas (finder in its corner, pins as ▾ + digit, no
 *  names), a 72 px colophon. Every text line is passed in; nothing on the plate is read from the DOM labels. */
export function plateCanvas(snap: HTMLCanvasElement, dpr: number, t: PlateText, x: PlateExtra): HTMLCanvasElement {
  const css = (n: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb
  const bg = css('--color-background', 'white'), ink = css('--color-text-primary', 'black'), muted = css('--color-text-muted', 'gray')
  const W = Math.min(x.width, snap.width / dpr), H = snap.height / dpr
  const out = document.createElement('canvas')
  out.width = Math.round(W * dpr)
  out.height = Math.round((H + PLATE_HEAD + PLATE_FOOT) * dpr)
  const g = out.getContext('2d')!
  g.scale(dpr, dpr)
  g.fillStyle = bg
  g.fillRect(0, 0, W, H + PLATE_HEAD + PLATE_FOOT)
  const mono = '"IBM Plex Mono", "JetBrains Mono", monospace'
  g.textBaseline = 'top'
  g.fillStyle = ink
  g.font = `11px ${mono}`
  g.fillText(t.title, 16, 12)
  g.font = `15px "EB Garamond", Georgia, serif`
  g.fillText(t.path, 16, 28)
  g.font = `10px ${mono}`
  g.fillStyle = muted
  g.fillText(t.level, 16, 48)
  g.drawImage(snap, 0, 0, W * dpr, snap.height, 0, PLATE_HEAD, W, H)
  if (x.finder) g.drawImage(x.finder.canvas, x.finder.x, PLATE_HEAD + x.finder.y, x.finder.w, x.finder.h)
  g.fillStyle = ink
  g.font = `10px ${mono}`
  g.textAlign = 'center'
  for (const p of x.pins) {
    const py = PLATE_HEAD + p.y
    g.beginPath(); g.moveTo(p.x - 4.5, py - 12); g.lineTo(p.x + 4.5, py - 12); g.lineTo(p.x, py); g.closePath(); g.fill()
    g.fillText(String(p.n), p.x, py - 24)
  }
  g.textAlign = 'left'
  g.strokeStyle = muted
  g.lineWidth = 0.5
  g.beginPath(); g.moveTo(0, PLATE_HEAD + H + 0.5); g.lineTo(W, PLATE_HEAD + H + 0.5); g.stroke()
  g.fillStyle = muted
  t.colophon.slice(0, 5).forEach((line, k) => g.fillText(line, 16, PLATE_HEAD + H + 6 + 13 * k, W - 32))
  return out
}

export function downloadCanvas(filename: string, c: HTMLCanvasElement) {
  c.toBlob((b) => {
    if (!b) return
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** Pins: one row per pin; `vendor_name: null` = withheld (dropped, counted), `undefined` = not yet fetched (id only). */
export interface PinRow { institution_id: number | null; institution_name: string; vendor_id: number | null; vendor_name?: string | null; contract_id: number | null }
export function pinsPart(pins: PinRow[]): CsvPart {
  const pub = pins.filter((p) => p.vendor_name !== null)
  return {
    head: ['institution_id', 'institution_name', 'vendor_id', 'vendor_name', 'contract_id'],
    rows: pub.map((p) => [p.institution_id, p.institution_name, p.vendor_id, p.vendor_name ?? '', p.contract_id]),
    counts: { n_requested: pins.length, n_public: pub.length, n_withheld: pins.length - pub.length, n_not_drawn: 0 },
  }
}
