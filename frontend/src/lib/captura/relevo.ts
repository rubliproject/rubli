/**
 * /captura «El relevo» — every number on the page, computed from GET /captura/plates (port of
 * _explore/captura_concepts_2026-10-27/build.py). Pure: pinned in relevo.test.ts.
 * «Cautiva» = ≥ 80% of the company's federal income 2002–2025 from one buyer (≥ 50 MDP, ≥ 3 years).
 */
import type { CapturaBuyer, CapturaPair } from '@/api/captura'
import { CATEGORICAL, getRiskLevelFromScore } from '@/lib/constants'

export const Y0 = 2002
export const Y1 = 2025
export const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, k) => Y0 + k)
/** A pair is «vigente» when it has a contract with its buyer in 2024 or 2025. */
export const CURRENT_FROM = 2024

export interface Chapter { key: string; name: string; a: number; b: number; color: string }
/** DESIGN.md §6.3 administrations: Fox C2 · Calderón C6 · Peña Nieto C7 · AMLO C4 · Sheinbaum C5. */
export const CHAPTERS: Chapter[] = [
  { key: 'fox', name: 'Fox', a: 2002, b: 2006, color: CATEGORICAL[1] },
  { key: 'calderon', name: 'Calderón', a: 2007, b: 2012, color: CATEGORICAL[5] },
  { key: 'epn', name: 'Peña Nieto', a: 2013, b: 2018, color: CATEGORICAL[6] },
  { key: 'amlo', name: 'AMLO', a: 2019, b: 2024, color: CATEGORICAL[3] },
  { key: 'sheinbaum', name: 'Sheinbaum', a: 2025, b: 2025, color: CATEGORICAL[4] },
]
export const chapterOf = (y: number) => CHAPTERS.find((c) => c.a <= y && y <= c.b) ?? CHAPTERS[CHAPTERS.length - 1]

/** The IMSS (canonical id), Pemex Exploración y Producción, the CFE — named in the facts and the rail. */
export const IMSS = 251
export const PEP = 311
export const CFE = 104

export interface Series { sector: number | null; vals: number[]; color: string; nAll: number; mAll: number; nCur: number; mCur: number }
export interface YearRow { y: number; total: number; cap: number; share: number }

export interface Relevo {
  years: YearRow[]
  chapters: (Chapter & { share: number; cap: number; total: number })[]
  /** ribbon layers bottom → top: energy first, then by all-time captive money; the rest pooled (sector null) */
  series: Series[]
  bySector: Map<number, Series>
  pairs: number
  buyers: number
  money: number
  cur: CapturaPair[]
  curM: number
  post: number
  postM: number
  doc: number
  lead: number
  riskMean: number | null
  riskCrit: number
  riskN: number
  peak: YearRow | null
  /** first year the buyer stops publishing in CompraNet (y_total = 0 from then to 2025), or null */
  leaves: (id: number) => number | null
  /** the buyer's year with the largest share to captives (spend ≥ 1,000 MDP) */
  buyerPeak: (id: number) => { y: number; share: number; cap: number; total: number } | null
  cohorts: { key: string; name: string; color: string; born: number; alive: number; moneyNow: number }[]
  register: (CapturaBuyer & { cur: number; share2425: number | null })[]
  buyer: Map<number, CapturaBuyer>
  /** a buyer sector's colour on this page = its ribbon layer's (categorical by rank; the rest C8) */
  colorOf: (sectorId: number | null | undefined) => string
}

const SECTOR_ENERGY = 4
const RIBBON_SECTORS = 6

export function buildRelevo(buyers: CapturaBuyer[], pairs: CapturaPair[]): Relevo {
  const buyer = new Map(buyers.map((b) => [b.institution_id, b]))
  const n = YEARS.length
  const years: YearRow[] = YEARS.map((y, k) => {
    const total = buyers.reduce((s, b) => s + (b.y_total[k] ?? 0), 0)
    const cap = buyers.reduce((s, b) => s + (b.y_cap[k] ?? 0), 0)
    return { y, total, cap, share: total > 0 ? cap / total : 0 }
  })
  const chapters = CHAPTERS.map((c) => {
    const rs = years.filter((r) => r.y >= c.a && r.y <= c.b)
    const total = rs.reduce((s, r) => s + r.total, 0), cap = rs.reduce((s, r) => s + r.cap, 0)
    return { ...c, total, cap, share: total > 0 ? cap / total : 0 }
  })

  const sec = new Map<number, Series>()
  const S = (id: number) => {
    let s = sec.get(id)
    if (!s) sec.set(id, (s = { sector: id, vals: Array(n).fill(0), color: CATEGORICAL[7], nAll: 0, mAll: 0, nCur: 0, mCur: 0 }))
    return s
  }
  for (const b of buyers) { const s = S(b.sector_id); b.y_cap.forEach((v, k) => { s.vals[k] += v }) }
  const cur: CapturaPair[] = []
  for (const p of pairs) {
    const b = buyer.get(p.institution_id); if (!b) continue
    const s = S(b.sector_id); s.nAll++; s.mAll += p.m
    if (p.y1 >= CURRENT_FROM) { s.nCur++; s.mCur += p.m; cur.push(p) }
  }
  const ranked = [...sec.values()].sort((a, b) => b.mAll - a.mAll)
  const named = ranked.slice(0, RIBBON_SECTORS)
  named.forEach((s, i) => { s.color = CATEGORICAL[i + 1] })
  const rest = ranked.slice(RIBBON_SECTORS)
  const series: Series[] = [...named].sort((a, b) => (a.sector === SECTOR_ENERGY ? -1 : b.sector === SECTOR_ENERGY ? 1 : 0))
  if (rest.length) {
    series.push(rest.reduce<Series>((o, s) => ({
      ...o, vals: o.vals.map((v, k) => v + s.vals[k]), nAll: o.nAll + s.nAll, mAll: o.mAll + s.mAll, nCur: o.nCur + s.nCur, mCur: o.mCur + s.mCur,
    }), { sector: null, vals: Array(n).fill(0), color: CATEGORICAL[7], nAll: 0, mAll: 0, nCur: 0, mCur: 0 }))
  }

  const risks = pairs.map((p) => p.risk).filter((r): r is number => r != null)
  const peak = years.reduce<YearRow | null>((m, r) => (r.total > 0 && (!m || r.share > m.share) ? r : m), null)
  const leaves = (id: number) => {
    const b = buyer.get(id); if (!b) return null
    let last = -1
    b.y_total.forEach((v, k) => { if (v > 0) last = k })
    return last >= 0 && last < n - 1 ? YEARS[last + 1] : null
  }
  const buyerPeak = (id: number) => {
    const b = buyer.get(id); if (!b) return null
    let best: { y: number; share: number; cap: number; total: number } | null = null
    b.y_total.forEach((t, k) => {
      if (t < 1e9) return
      const share = b.y_cap[k] / t
      if (!best || share > best.share) best = { y: YEARS[k], share, cap: b.y_cap[k], total: t }
    })
    return best
  }
  const cohorts = CHAPTERS.slice(0, 4).map((c) => {
    const ps = pairs.filter((p) => p.y0 >= c.a && p.y0 <= c.b)
    const alive = ps.filter((p) => p.y1 >= CURRENT_FROM)
    return { key: c.key, name: c.name, color: c.color, born: ps.length, alive: alive.length, moneyNow: alive.reduce((s, p) => s + p.m, 0) }
  })
  const curBy = new Map<number, number>()
  for (const p of cur) curBy.set(p.institution_id, (curBy.get(p.institution_id) ?? 0) + 1)
  const register = buyers.map((b) => {
    const t = (b.y_total[n - 2] ?? 0) + (b.y_total[n - 1] ?? 0)
    return { ...b, cur: curBy.get(b.institution_id) ?? 0, share2425: t > 0 ? ((b.y_cap[n - 2] ?? 0) + (b.y_cap[n - 1] ?? 0)) / t : null }
  }).sort((a, b) => b.cap - a.cap)

  return {
    years, chapters, series, bySector: sec,
    pairs: pairs.length, buyers: buyers.length, money: pairs.reduce((s, p) => s + p.m, 0),
    cur, curM: cur.reduce((s, p) => s + p.m, 0),
    post: pairs.filter((p) => p.post_n > 0).length, postM: pairs.reduce((s, p) => s + (p.post_n > 0 ? p.post : 0), 0),
    doc: pairs.filter((p) => p.gt === 'doc').length, lead: pairs.filter((p) => p.gt === 'lead').length,
    riskMean: risks.length ? risks.reduce((s, r) => s + r, 0) / risks.length : null,
    riskCrit: risks.filter((r) => getRiskLevelFromScore(r) === 'critical').length, riskN: risks.length,
    peak, leaves, buyerPeak, cohorts,
    register, buyer,
    colorOf: (id) => (id != null && named.includes(sec.get(id)!) ? sec.get(id)!.color : CATEGORICAL[7]),
  }
}
