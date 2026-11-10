/**
 * El Tamiz — /institutions, tab 1 («Por pesos» spec §3; round 1: institutions-tamiz §2).
 *
 * One field, five steps, three lenses. The dot field (one dot = one
 * institution) opens the walk; the money lens turns the same dots into a
 * waffle (1 cell = 10,000 MDP; or 3,000 contracts): each dot glides to its
 * block centre and fades through the shared DotField tween, then the cells
 * fade in row by row. That transformation is the finding — 829 municipal dots
 * collapse into ~20 cells while IMSS is a 182-cell block. Every number is
 * computed from the payload (moneyFacts); the ex-IMSS share is always printed
 * beside the federal D/F share. Precedents: NYT Upshot unit charts / object
 * constancy; FT Visual Vocabulary deviation readout for the row shares.
 */
import { coverageShort } from '@/lib/institution/coverage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeftRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { TIER_STYLES, gradeToTierKey, gradeOutOf10, gradeWord, gradeBandFromLetter } from '@/lib/tiers'
import { SECTORS, getSectorName } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import {
  buildRows, isDeficient, layoutField, moneyFacts, pillarName, rowLabel, scoreToX, zoomDim,
  STEPS, STEP_LENS, OTHER_KEY,
  type BandSpec, type Dim, type FieldInst, type FieldModel, type Geometry, type Lens, type Level, type Row, type Step,
} from '@/lib/institutions/field'
import { layoutWaffle, morphLayout, dfShare, UNIT_SIZE, type WaffleGroup } from '@/lib/institutions/waffle'
import { TamizField, type Ease } from './TamizField'
import { TamizWaffle, type WaffleHover } from './TamizWaffle'
import { StepRail } from './StepRail'
import { TamizSearch } from './TamizSearch'
import { TamizBrush } from './TamizBrush'
import { TrendChip, TREND_YEARS, trendDetail } from './TrendChip'
import { TamizCompare } from './TamizCompare'
import { formatRange, parseRange, selectRange, type Range } from '@/lib/institutions/brush'
import { useIsMobile } from '@/hooks/useIsMobile'

const STEP_TITLES: [es: string, en: string][] = [
  ['Las instituciones', 'The institutions'],
  ['El dinero', 'The money'],
  ['Dentro del gobierno federal', 'Inside the federal government'],
  ['Los grandes compradores', 'The big buyers'],
  ['Estados y municipios', 'States and municipalities'],
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const ENTER_KEY = 'rubli_tamiz_entered_v1'
const LEVELS: Level[] = ['federal', 'state', 'municipal']

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const pct0 = (v: number) => `${Math.round(v * 100)}%`
const sectorName = (lang: string) => (id: number) => {
  const s = SECTORS.find((q) => q.id === id)
  return s ? getSectorName(s.code, lang === 'en' ? 'en' : 'es') : String(id)
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] ct-sc text-text-muted">{children}</p>
}

export interface TamizProps {
  model: FieldModel
  lang: string
  /** Step CTA: open El Registro filtered to `dim:key` (null = everyone), remembering the step; `rango` = brushed score range. */
  onExplore: (filter: string | null, step: Step, rango?: string | null) => void
}

export function ElTamiz({ model, lang, onExplore }: TamizProps) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const insts = model.insts
  const [sp, setSp] = useSearchParams()
  const reduced = !!useReducedMotion()
  const facts = useMemo(() => moneyFacts(model), [model])

  // ── URL state ────────────────────────────────────────────────────────────
  const pasoParam = sp.get('paso')
  const step: Step = (STEPS as readonly string[]).includes(pasoParam ?? '') ? (pasoParam as Step) : 'instituciones'
  const stepIdx = STEPS.indexOf(step)
  const lenteParam = sp.get('lente') as Lens | null
  const lens: Lens = lenteParam && ['instituciones', 'pesos', 'contratos'].includes(lenteParam) ? lenteParam : STEP_LENS[step]
  const nivelParam = sp.get('nivel')
  // Steps III–IV look inside the federal government; the others show every level (a chip overrides).
  const nivel: Level | null = nivelParam === 'todos' ? null
    : LEVELS.includes(nivelParam as Level) ? (nivelParam as Level)
      : step === 'federal' || step === 'grandes' ? 'federal' : null
  const zoom = lens === 'instituciones' ? sp.get('zoom') : null
  const instParam = Number(sp.get('inst')) || null
  // Compare (phase 2 § 2): ?vs=B beside ?inst=A; «picking» = waiting for B (dot click or search).
  const vsParam = instParam != null ? Number(sp.get('vs')) || null : null
  const [picking, setPicking] = useState(false)
  const sinImss = step === 'grandes' && sp.get('sinimss') === '1'
  // Score-range brush (phase 2 § 1): dot lens only. A drag drafts locally; release writes ?rango=.
  const urlRange = lens === 'instituciones' ? parseRange(sp.get('rango'), model.xMin, model.xMax) : null
  const [draft, setDraft] = useState<Range | null | undefined>(undefined)
  const brushRange = draft !== undefined ? draft : urlRange
  const hasRange = urlRange != null
  const [bLo, bHi] = brushRange ?? [NaN, NaN]
  const band = useMemo((): Range | null => (Number.isNaN(bLo) ? null : [bLo, bHi]), [bLo, bHi])

  const patch = useCallback((u: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSp(next, { replace, preventScrollReset: true })
  }, [sp, setSp])

  // Autoplay pauses on any interaction.
  const [pauseSignal, setPauseSignal] = useState(0)
  const [playing, setPlaying] = useState(false)
  const interact = () => setPauseSignal((s) => s + 1)

  // ── Membership ───────────────────────────────────────────────────────────
  const all = useMemo(() => insts.map((_, i) => i), [insts])
  const inScope = useCallback((i: FieldInst) => {
    if (nivel) return i.level === nivel
    if (step === 'locales') return i.level !== 'federal'
    return true
  }, [nivel, step])
  const scoped = useMemo(() => all.filter((k) => inScope(insts[k])), [all, insts, inScope])
  const outside = useMemo(() => all.filter((k) => !inScope(insts[k])), [all, insts, inScope])
  const exclude = useMemo(() => (sinImss && facts.top != null ? new Set([facts.top]) : undefined), [sinImss, facts.top])

  // ── Dot field (lens instituciones) ───────────────────────────────────────
  const dim: Dim = step === 'instituciones' ? (nivel ? 'type' : 'all')
    : step === 'dinero' ? 'level'
      : step === 'locales' ? 'grp'
        : 'type'
  const rows = useMemo(() => buildRows(model, scoped, dim), [model, scoped, dim])
  const zoomRow = zoom ? rows.find((r) => r.key === zoom) ?? null : null
  const subDim = zoomDim(model, dim)
  const subRows = useMemo(() => (zoomRow ? buildRows(model, zoomRow.members, subDim) : []), [zoomRow, model, subDim])
  const scores = useMemo(() => Float32Array.from(insts, (i) => i.total_score), [insts])
  const colorGrades = useMemo(() => insts.map((i) => (isDeficient(i) ? i.grade : null)), [insts])
  const idxById = useMemo(() => new Map(insts.map((i, k) => [i.id, k])), [insts])

  // ── Geometry ─────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const s100 = (i: FieldInst) => (i.total_score * 100) / model.xMax
  const mobile = useIsMobile(639)
  const sheet = useIsMobile(1023)
  const geom: Geometry = useMemo(() => {
    const ax = { xMin: model.xMin, xMax: model.xMax }
    if (mobile) return { width, plotX0: 8, plotW: width - 16, ...ax, r: 2, gap: 0.5, labelH: 18, axisH: 20, railH: 12, minRowH: 18, maxH: 300 }
    const labelW = Math.min(230, Math.max(180, Math.round(width * 0.24)))
    // Readout column holds the D/F share three ways (inst. · pesos · contratos), two lines.
    const readW = 210
    return { width, plotX0: labelW, plotW: Math.max(200, width - labelW - readW), ...ax, r: 2.6, gap: 0.6, labelH: 0, axisH: 22, railH: 14, minRowH: 48, maxH: 680 }
  }, [width, mobile, model.xMin, model.xMax])

  const specs: BandSpec[] = useMemo(() => {
    const main = rows.flatMap((r): BandSpec[] => {
      if (!zoomRow) return [{ key: r.key, members: r.members }]
      if (r.key !== zoomRow.key) return [{ key: r.key, members: r.members, rail: true }]
      return subRows.map((s) => ({ key: `${r.key}/${s.key}`, members: s.members, depth: 1 }))
    })
    // Out-of-scope institutions stay on screen as one faint rail: the denominator never vanishes.
    return outside.length ? [...main, { key: '__outside', members: outside, rail: true }] : main
  }, [rows, zoomRow, subRows, outside])
  const dotLayout = useMemo(() => (width > 0 ? layoutField(scores, specs, geom) : null), [scores, specs, geom, width])

  // ── Waffle (lens pesos / contratos) ──────────────────────────────────────
  const unit = lens === 'contratos' ? 'contratos' : 'pesos'
  const waffleGroups: WaffleGroup[] = useMemo(() => {
    if (step === 'federal' || step === 'grandes') {
      const fed = scoped.filter((k) => insts[k].level === 'federal')
      const fams = new Map<string, number[]>()
      for (const k of fed) fams.set(insts[k].group, [...(fams.get(insts[k].group) ?? []), k])
      const groups = [...fams].map(([key, members]) => ({ key, members }))
        .sort((a, b) => b.members.reduce((s, k) => s + insts[k].total_amount_mxn, 0) - a.members.reduce((s, k) => s + insts[k].total_amount_mxn, 0))
      const rest = all.filter((k) => insts[k].level !== 'federal')
      return [...groups, { key: '__subnational', members: rest }]
    }
    return LEVELS.map((lv) => ({ key: lv, members: all.filter((k) => insts[k].level === lv && inScope(insts[k])) }))
      .filter((g) => g.members.length)
  }, [step, scoped, all, insts, inScope])
  const cell = mobile ? 10 : width >= 1100 ? 13 : 11
  const waffle = useMemo(() => (width > 0 ? layoutWaffle(model, waffleGroups, unit, {
    width, size: cell, gap: 2, labelH: 30, groupGap: 14, exclude,
  }) : null), [model, waffleGroups, unit, width, mobile, cell, exclude])
  const waffleOn = lens !== 'instituciones'
  const layout = useMemo(() => {
    if (!dotLayout) return null
    if (!waffleOn || !waffle) return dotLayout
    return morphLayout(waffle, insts.length, dotLayout.dotR)
  }, [dotLayout, waffleOn, waffle, insts.length])

  // Motion: zoom 380 · lens morph 420 · regroup 420, all cubic-out (no overshoot).
  const prev = useRef({ zoom, lens, step })
  const motion = useMemo((): { ms: number; ease: Ease } => {
    const p = prev.current
    const m: { ms: number; ease: Ease } = p.zoom !== zoom ? { ms: 380, ease: 'out' } : { ms: 420, ease: 'out' }
    prev.current = { zoom, lens, step }
    return m
  }, [zoom, lens, step])

  const [enter] = useState(() => {
    if (step !== 'instituciones' || lens !== 'instituciones') return false
    try { return sessionStorage.getItem(ENTER_KEY) == null } catch { return false }
  })
  useEffect(() => {
    try { sessionStorage.setItem(ENTER_KEY, '1') } catch { /* storage unavailable */ }
  }, [])

  // ── Interaction ──────────────────────────────────────────────────────────
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [wHover, setWHover] = useState<WaffleHover | null>(null)
  const pinned = instParam != null ? idxById.get(instParam) ?? null : null
  const vsIdx = vsParam != null && vsParam !== instParam ? idxById.get(vsParam) ?? null : null
  const comparing = pinned != null && (picking || vsIdx != null)
  /** A dot or block click: picks B while comparing, else pins. */
  const pickInst = (k: number | null) => {
    if (k == null) { if (!comparing) patch({ inst: null }); return }
    if (comparing) {
      if (k !== pinned) { setPicking(false); patch({ vs: String(insts[k].id) }, true) }
      return
    }
    patch({ inst: String(insts[k].id), vs: null })
  }
  const closeCompare = useCallback(() => { setPicking(false); patch({ vs: null }, true) }, [patch])
  useEffect(() => { if (instParam == null) setPicking(false) }, [instParam])
  const selection = useMemo(() => (band ? selectRange(model, scoped, band) : null), [band, model, scoped])
  const focusSet = useMemo(() => {
    const z = zoomRow ? new Set(zoomRow.members) : null
    if (!selection) return z
    return new Set(z ? selection.members.filter((k) => z.has(k)) : selection.members)
  }, [zoomRow, selection])
  const commitRange = useCallback((r: Range | null) => {
    setDraft(undefined)
    patch({ rango: r ? formatRange(r) : null }, true)
  }, [patch])
  const zoomTo = (key: string | null) => { interact(); patch({ zoom: key }) }

  const goStep = useCallback((i: number) => {
    const s = STEPS[Math.max(0, Math.min(STEPS.length - 1, i))]
    patch({ paso: s === 'instituciones' ? null : s, lente: null, zoom: null, nivel: null, sinimss: null })
  }, [patch])

  // Drawer prev/next walks the pinned dot's current row, worst first; ties by id.
  const walk = useMemo(() => {
    if (pinned == null) return null
    const src = (zoomRow ? subRows : []).find((r) => r.members.includes(pinned)) ?? rows.find((r) => r.members.includes(pinned))
    if (!src) return null
    const order = [...src.members].sort((a, b) => scores[a] - scores[b] || insts[a].id - insts[b].id)
    return { order, k: order.indexOf(pinned), key: src.key, sub: src !== rows.find((r) => r.key === src.key) }
  }, [pinned, zoomRow, subRows, rows, scores, insts])
  const stepPin = useCallback((d: -1 | 1) => {
    if (!walk) return
    const j = walk.k + d
    if (j < 0 || j >= walk.order.length) return
    patch({ inst: String(insts[walk.order[j]].id) }, true)
  }, [walk, insts, patch])

  // Keys: Esc closes drawer → zoom; ←/→ walk the drawer when one is open, else the steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (comparing) closeCompare()
        else if (instParam != null) patch({ inst: null })
        else if (zoom) patch({ zoom: null })
        else if (hasRange) patch({ rango: null }, true)
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute('role') === 'tab')) return
      e.preventDefault()
      const d = e.key === 'ArrowLeft' ? -1 : 1
      if (comparing) return
      if (instParam != null) stepPin(d)
      else { setPauseSignal((s) => s + 1); goStep(stepIdx + d) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [instParam, zoom, hasRange, comparing, closeCompare, patch, stepPin, goStep, stepIdx])

  const flyTo = (k: number) => {
    interact()
    patch({ inst: String(insts[k].id), zoom: null, nivel: inScope(insts[k]) ? nivelParam : 'todos' })
    fieldRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  // ── Copy (all computed) ──────────────────────────────────────────────────
  const label = (d: Dim, k: string) => (k === '__outside' ? L('Fuera del filtro', 'Outside the filter') : rowLabel(d, k, lang, sectorName(lang), model))
  const topInst = facts.top != null ? insts[facts.top] : null
  const topName = topInst ? (topInst.siglas || formatEntityName('institution', topInst.name, 'sm')) : ''
  const fed = facts.federal
  const fam = facts.topFamily
  const famLabel = fam ? rowLabel('grp', fam.key, lang, sectorName(lang), model) : ''
  const fraction = (r: number) => (r >= 0.08 && r <= 0.125 ? L('una décima parte', 'a tenth') : r >= 0.18 && r <= 0.22 ? L('una quinta parte', 'a fifth') : pct0(r))
  const muniProvisional = (() => {
    const mm = insts.filter((i) => i.level === 'municipal')
    return mm.length ? mm.filter((i) => i.provisional).length / mm.length : 0
  })()
  const exTopClause = L(`sin ${topName}, ${pct(facts.federalPctValExTop)}`, `without ${topName}, ${pct(facts.federalPctValExTop)}`)
  const sentence = (() => {
    switch (step) {
      case 'instituciones':
        return L(
          `${formatNumber(facts.total.n)} instituciones calificadas; ${formatNumber(facts.byLevel.municipal.n)} son municipales y ${formatNumber(facts.byLevel.federal.n)} federales. ${formatNumber(facts.total.def)} reprueban (menos de 6 de 10). Así, contadas una por una, todas pesan igual.`,
          `${formatNumber(facts.total.n)} graded institutions; ${formatNumber(facts.byLevel.municipal.n)} are municipal and ${formatNumber(facts.byLevel.federal.n)} federal. ${formatNumber(facts.total.def)} fail (under 6 out of 10). Counted one by one, they all weigh the same.`,
        )
      case 'dinero':
        return L(
          `Por pesos, el retrato se invierte: ${pct0(fed.val / facts.total.val)} del dinero es federal (${formatCompactMXN(fed.val)}); lo municipal, ${pct0(facts.byLevel.municipal.val / facts.total.val)}. Los ${formatNumber(facts.municipios.n)} ayuntamientos juntos compraron ${fraction(facts.municipiosOverTop)} de lo que compró ${topName}.`,
          `By pesos the picture flips: ${pct0(fed.val / facts.total.val)} of the money is federal (${formatCompactMXN(fed.val)}); municipal, ${pct0(facts.byLevel.municipal.val / facts.total.val)}. The ${formatNumber(facts.municipios.n)} ayuntamientos together bought ${fraction(facts.municipiosOverTop)} of what ${topName} bought.`,
        )
      case 'federal':
        return L(
          `${famLabel}: ${fam?.rate.def ?? 0} de ${fam?.rate.n ?? 0} instituciones reprueban, pero ${pct0(fam?.rate.pctVal ?? 0)} de sus pesos (${formatCompactMXN(fam?.rate.defVal ?? 0)}).`
            + (facts.federalDriver ? ` A los federales reprobados lo que más les resta es ${pillarName(model, facts.federalDriver.key, lang)} (${pct0(facts.federalDriver.share)} de los casos).` : ''),
          `${famLabel}: ${fam?.rate.def ?? 0} of ${fam?.rate.n ?? 0} institutions fail, yet ${pct0(fam?.rate.pctVal ?? 0)} of its pesos (${formatCompactMXN(fam?.rate.defVal ?? 0)}).`
            + (facts.federalDriver ? ` For the failing federal buyers, ${pillarName(model, facts.federalDriver.key, lang)} costs the most (${pct0(facts.federalDriver.share)} of cases).` : ''),
        )
      case 'grandes':
        return L(
          `${topName} solo —calificación ${topInst ? gradeOutOf10(s100(topInst)) : ''}, ${formatCompactMXN(topInst?.total_amount_mxn ?? 0)}— es ${pct0(facts.topShareOfFederal)} de los pesos federales y ${pct0(facts.topShareOfFederalDf)} de los pesos federales de compradores reprobados. ${pct(fed.pctVal)} de los pesos federales pasó por compradores reprobados; ${exTopClause}.`,
          `${topName} alone — grade ${topInst ? gradeOutOf10(s100(topInst)) : ''}, ${formatCompactMXN(topInst?.total_amount_mxn ?? 0)} — is ${pct0(facts.topShareOfFederal)} of federal pesos and ${pct0(facts.topShareOfFederalDf)} of federal pesos from failing buyers. ${pct(fed.pctVal)} of federal pesos went through failing buyers; ${exTopClause}.`,
        )
      case 'locales':
        return L(
          `${pct0(facts.municipalDfDotShare)} de las instituciones reprobadas son municipales, pero sólo ${pct0(facts.municipalDfValShare)} del dinero reprobado. ${pct0(muniProvisional)} de las municipales son provisionales, y CompraNet sólo registra la parte federal del gasto municipal.`,
          `${pct0(facts.municipalDfDotShare)} of failing institutions are municipal, yet only ${pct0(facts.municipalDfValShare)} of the failing money. ${pct0(muniProvisional)} of municipal grades are provisional, and CompraNet only records the federally funded slice of municipal spending.`,
        )
    }
  })()

  // Live share readout for the money lens (values, not rounded cells).
  const shareNow = dfShare(model, scoped, unit, exclude)
  const cta: { filter: string | null; label: string } = (() => {
    switch (step) {
      case 'instituciones': return { filter: null, label: L(`Ver las ${formatNumber(facts.total.n)} en el registro`, `See all ${formatNumber(facts.total.n)} in the register`) }
      case 'dinero': return { filter: 'level:federal', label: L(`Ver las ${formatNumber(fed.n)} federales, por gasto`, `See the ${formatNumber(fed.n)} federal buyers, by spend`) }
      case 'federal': return { filter: fam ? `grp:${fam.key}` : 'level:federal', label: L(`Ver ${famLabel.toLowerCase()} (${fam?.rate.n ?? 0})`, `See ${famLabel.toLowerCase()} (${fam?.rate.n ?? 0})`) }
      case 'grandes': return { filter: 'level:federal', label: L('Ver los compradores federales, del mayor al menor', 'See the federal buyers, largest first') }
      case 'locales': return { filter: 'grp:municipal|municipio', label: L(`Ver los ${formatNumber(facts.municipios.n)} ayuntamientos`, `See the ${formatNumber(facts.municipios.n)} ayuntamientos`) }
    }
  })()

  const scopePesos = nivel === 'federal' ? L('de los pesos federales', 'of federal pesos')
    : nivel === 'state' ? L('de los pesos estatales', 'of state pesos')
      : nivel === 'municipal' ? L('de los pesos municipales', 'of municipal pesos')
        : step === 'locales' ? L('de los pesos estatales y municipales', 'of state and municipal pesos')
          : L('de todos los pesos calificados', 'of all graded pesos')
  const levelChip = (lv: Level | null) => {
    if (!lv) return L(`Todos · ${formatNumber(facts.total.n)}`, `All · ${formatNumber(facts.total.n)}`)
    const r = facts.byLevel[lv]
    const name = { federal: L('Federal', 'Federal'), state: L('Estatal', 'State'), municipal: L('Municipal', 'Municipal') }[lv]
    return L(`${name} · ${formatNumber(r.n)} · ${pct0(r.val / facts.total.val)} del gasto`, `${name} · ${formatNumber(r.n)} · ${pct0(r.val / facts.total.val)} of spend`)
  }

  const pinnedInst = pinned != null ? insts[pinned] : null
  const scoreLine = (i: FieldInst) => `${gradeOutOf10(s100(i))} · ${gradeWord(s100(i), lang === 'en' ? 'en' : 'es')}${i.provisional && i.score_lo != null ? ` · ${L('provisional', 'provisional')} ${Math.round(i.score_lo)}–${Math.round(i.score_hi ?? i.score_lo)}` : ''}`
  const groupName = (key: string) => key === '__subnational' ? L('Estatal y municipal', 'State and municipal')
    : key.includes('|') ? rowLabel('grp', key, lang, sectorName(lang), model)
      : rowLabel('level', key, lang, sectorName(lang), model)
  const unitLabel = unit === 'pesos' ? L('1 celda = 10 mil millones de pesos · 2002–2025', '1 cell = 10 billion pesos · 2002–2025')
    : L(`1 celda = ${formatNumber(UNIT_SIZE.contratos)} contratos · 2002–2025`, `1 cell = ${formatNumber(UNIT_SIZE.contratos)} contracts · 2002–2025`)
  // Step IV labels the D/F heavyweights; step II labels just the top buyer.
  const labelled = !waffle ? [] : waffle.blocks.filter((b) => b.inst != null && b.cells > 0
    && (step === 'grandes' ? isDeficient(insts[b.inst]) || b.cells >= 60 : b.inst === facts.top)).slice(0, mobile ? 4 : 8)

  const drawer = pinnedInst && comparing ? (
    <TamizCompare
      docked={!sheet}
      model={model}
      a={pinnedInst}
      b={vsIdx != null ? insts[vsIdx] : null}
      lang={lang}
      onClose={closeCompare}
      onPick={(k) => pickInst(k)}
      onSwap={() => vsIdx != null && patch({ inst: String(insts[vsIdx].id), vs: String(pinnedInst.id) }, true)}
    />
  ) : pinnedInst ? (
    <TamizDrawer
      docked={!sheet}
      model={model}
      inst={pinnedInst}
      lang={lang}
      onClose={() => patch({ inst: null })}
      walk={walk ? {
        k: walk.k,
        n: walk.order.length,
        label: label(walk.sub ? subDim : dim, walk.key),
        prev: walk.k > 0 ? insts[walk.order[walk.k - 1]].name : null,
        next: walk.k < walk.order.length - 1 ? insts[walk.order[walk.k + 1]].name : null,
      } : null}
      onStep={stepPin}
      onCompare={() => setPicking(true)}
    />
  ) : null

  const rowReadout = (r: Row, small: boolean, rail: boolean) => (
    <span className={`whitespace-nowrap font-mono tabular-nums ${small ? 'text-text-muted' : 'text-text-primary'}`}
      title={small ? L('n chica: menos de 30 instituciones, tasa inestable', 'small n: fewer than 30 institutions, unstable rate') : undefined}>
      <span className="text-[13px] font-semibold">{pct(r.pct)}</span>
      <span className="text-[13px] text-text-muted"> {L('inst.', 'inst.')}</span>
      {!rail && !mobile && (
        <span className="block whitespace-normal text-[12px] leading-tight text-text-muted">
          {L('pesos', 'pesos')} {pct0(r.pctVal)} · {L('contratos', 'contracts')} {pct0(r.pctN)} · n={formatNumber(r.n)}
        </span>
      )}
    </span>
  )

  return (
    <div className="space-y-6">
      <section id="tamiz" aria-labelledby="tamiz-step-title" className="scroll-mt-16 flex flex-col gap-4">
        {/* Toolbar: lens · level chips · search */}
        <div className="order-2 sm:order-1 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div role="radiogroup" aria-label={L('Contar por', 'Count by')} className="inline-flex min-h-11 self-start overflow-hidden rounded-sm border border-border text-[12px] ct-sc">
            {(['instituciones', 'pesos', 'contratos'] as Lens[]).map((l, k) => (
              <button key={l} type="button" role="radio" aria-checked={lens === l}
                onClick={() => { interact(); patch({ lente: l === STEP_LENS[step] ? null : l, zoom: null }, true) }}
                className={`px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${k ? 'border-l border-border' : ''} ${lens === l ? 'bg-background-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
                {{ instituciones: L('Por instituciones', 'By institutions'), pesos: L('Por pesos', 'By pesos'), contratos: L('Por contratos', 'By contracts') }[l]}
              </button>
            ))}
          </div>
          <TamizSearch insts={insts} lang={lang} onPick={flyTo} />
        </div>
        <div role="radiogroup" aria-label={L('Nivel de gobierno', 'Level of government')} className="order-2 sm:order-1 flex gap-1.5 overflow-x-auto pb-1">
          {([null, ...LEVELS] as (Level | null)[]).map((lv) => (
            <button key={lv ?? 'all'} type="button" role="radio" aria-checked={nivel === lv}
              onClick={() => { interact(); patch({ nivel: lv ?? 'todos', zoom: null }, true) }}
              className={`flex-shrink-0 min-h-9 rounded-sm border px-3 text-[13px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${nivel === lv ? 'border-text-primary bg-background-elevated text-text-primary' : 'border-border text-text-muted hover:text-text-secondary'}`}>
              {levelChip(lv)}
            </button>
          ))}
        </div>
        {!waffleOn && (
          <div className="order-2 sm:order-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            <RangeInputs range={urlRange} xMin={model.xMin} xMax={model.xMax} lang={lang} onCommit={(r) => { interact(); commitRange(r) }} />
            {!brushRange && (
              <button type="button" onClick={() => { interact(); commitRange([model.deficientBelow - 4, model.deficientBelow + 4]) }}
                className="inline-flex min-h-9 items-center rounded-sm border border-border px-3 text-text-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {L(`En el borde de 6 · ${model.deficientBelow - 4}–${model.deficientBelow + 4} puntos`, `On the 6 borderline · ${model.deficientBelow - 4}–${model.deficientBelow + 4} points`)}
              </button>
            )}
            {selection && band && (
              <>
                <span className="tabular-nums text-text-primary" aria-live="polite">
                  <strong className="font-semibold">{band[0]}–{band[1]}</strong>
                  {' · '}{formatNumber(selection.n)} {L(selection.n === 1 ? 'institución' : 'instituciones', selection.n === 1 ? 'institution' : 'institutions')}
                  {' · '}{formatCompactMXN(selection.val)}
                  {' · '}<strong className="font-semibold">{pct(selection.share)}</strong> {scopePesos}
                </span>
                {urlRange && (
                  <button type="button" onClick={() => onExplore(nivel ? `level:${nivel}` : null, step, formatRange(urlRange))}
                    className="inline-flex min-h-9 items-center rounded-sm border border-text-primary bg-background-elevated px-3 ct-sc text-text-primary hover:border-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {L('Ver en el registro →', 'See in the register →')}
                  </button>
                )}
              </>
            )}
            {urlRange && (
              <button type="button" onClick={() => { interact(); commitRange(null) }} aria-label={L('Quitar el rango', 'Clear the range')}
                className="inline-flex min-h-9 min-w-9 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Field (mobile: sticky inside this section only — never over focused content) */}
        <div ref={fieldRef} onPointerDown={interact} className="order-1 sm:order-2 sticky top-[calc(2.75rem+var(--sat,0px))] z-10 -mx-4 bg-background px-4 pb-2 sm:static sm:mx-0 sm:px-0 sm:pb-0 lg:flex lg:items-start lg:gap-4">
          <div className="min-w-0 lg:flex-1">
            {zoomRow && (
              <div className="mb-1 flex flex-wrap items-center gap-1 text-[13px]">
                <button type="button" onClick={() => zoomTo(null)} className="min-h-8 px-1 text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{L('Todas', 'All')}</button>
                <span aria-hidden="true" className="text-text-muted">›</span>
                <span className="text-text-primary">{label(dim, zoomRow.key)}</span>
                <span className="ml-2 text-text-muted">{L('Esc para volver', 'Esc to go back')}</span>
              </div>
            )}
            {layout && !waffleOn && (
              <TamizBrush plotX0={geom.plotX0} plotW={geom.plotW} xMin={geom.xMin} xMax={geom.xMax} deficientBelow={model.deficientBelow}
                range={brushRange} touch={mobile} reduced={reduced} onDraft={setDraft} onCommit={commitRange} lang={lang} />
            )}
            <div ref={wrapRef} className="relative" style={mobile ? { maxHeight: 300, overflowY: 'auto' } : undefined}>
              {layout && !waffleOn && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: geom.axisH }}>
                  {[model.xMin, ...model.lines, model.xMax].map((p) => (
                    <span key={p} className="absolute top-0.5 -translate-x-1/2 text-[12px] font-mono text-text-muted" style={{ left: scoreToX(p, geom) }}>{gradeOutOf10(p * 100 / model.xMax)}</span>
                  ))}
                  <span className="absolute top-3.5 -translate-x-1/2 whitespace-nowrap text-[12px] text-text-muted" style={{ left: scoreToX(0.6 * model.xMax, geom) }}>{L('6 = aprobada', '6 = pass')}</span>
                </div>
              )}
              {layout && (
                <TamizField
                  insts={insts}
                  layout={layout}
                  plotX0={geom.plotX0}
                  plotW={geom.plotW}
                  xMin={geom.xMin}
                  xMax={geom.xMax}
                  lines={waffleOn ? [] : model.lines}
                  deficientLine={waffleOn ? -1 : model.deficientBelow}
                  band={waffleOn ? null : band}
                  colorGrades={colorGrades}
                  ring={false}
                  duration={motion.ms}
                  ease={motion.ease}
                  reduced={reduced}
                  hoverIdx={waffleOn ? null : hover?.i ?? pinned}
                  focusSet={focusSet}
                  hitRadius={waffleOn ? 0 : 12}
                  onHover={(i, x, y) => setHover(waffleOn || i == null ? null : { i, x, y })}
                  onPick={(i) => { if (!waffleOn) pickInst(i) }}
                  ariaLabel={sentence}
                  enter={enter}
                />
              )}
              {waffle && (
                <TamizWaffle
                  layout={waffle}
                  visible={waffleOn}
                  reduced={reduced}
                  dimNonDf={step === 'grandes'}
                  onHover={setWHover}
                  onPick={pickInst}
                  ariaLabel={`${sentence} ${unitLabel}`}
                >
                  {waffle.groups.map((g) => {
                    const share = dfShare(model, g.members, unit, exclude)
                    return (
                      <div key={g.key} className="pointer-events-none absolute left-0 flex items-baseline gap-2 text-[12px]" style={{ top: g.y0 + 4 }}>
                        <span className="text-text-primary" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 15 }}>{groupName(g.key)}</span>
                        <span className="font-mono tabular-nums text-text-muted">
                          {unit === 'pesos' ? formatCompactMXN(g.value) : `${formatNumber(g.value)} ${L('contratos', 'contracts')}`}
                          {' · '}{pct0(share)} {L('reprobadas', 'failing')}
                        </span>
                      </div>
                    )
                  })}
                  {labelled.map((b) => {
                    const c = waffle.centroid.get(b.key)
                    if (!c || b.inst == null) return null
                    const i = insts[b.inst]
                    return (
                      <span key={b.key} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-background/85 px-1 font-mono text-[13px] text-text-primary"
                        style={{ left: c.x, top: c.y, transitionDelay: '200ms' }}>
                        {i.siglas || formatEntityName('institution', i.name, 'sm')} {gradeOutOf10(s100(i))}
                      </span>
                    )
                  })}
                </TamizWaffle>
              )}
              {/* Row labels + readouts (dot lens only) */}
              {layout && !waffleOn && layout.bands.map((b) => {
                const [rk, sk] = b.key.split('/')
                const r = b.key === '__outside' ? null : b.depth === 1 ? subRows.find((q) => q.key === sk) : rows.find((q) => q.key === rk)
                const d = b.depth === 1 ? subDim : dim
                const name = label(d, b.key === '__outside' ? '__outside' : r?.key ?? '')
                const trans = reduced ? 'none' : `transform ${motion.ms}ms cubic-bezier(0.33,1,0.68,1)`
                const zoomable = !!r && b.depth === 0 && dim !== 'all' && r.key !== OTHER_KEY
                if (mobile) {
                  if (b.rail) return null
                  return (
                    <div key={b.key} className="absolute inset-x-0 top-0 flex items-baseline justify-between gap-2 text-[12px]" style={{ transform: `translateY(${b.y0}px)`, transition: trans, height: geom.labelH }}>
                      {zoomable ? (
                        <button type="button" onClick={() => zoomTo(zoomRow?.key === r!.key ? null : r!.key)} aria-expanded={zoomRow?.key === r!.key} className="truncate text-left text-text-secondary underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{name} · n={r!.n}</button>
                      ) : (
                        <span className={`truncate ${b.depth ? 'pl-3' : ''} text-text-secondary`}>{name}{r ? ` · n=${r.n}` : ''}</span>
                      )}
                      {r && rowReadout(r, r.n < 30, false)}
                    </div>
                  )
                }
                return (
                  <div key={b.key} className="pointer-events-none absolute inset-x-0 top-0" style={{ transform: `translateY(${b.rail ? b.y0 : b.mid - 14}px)`, transition: trans }}>
                    <div className="flex items-start justify-between">
                      <div style={{ width: geom.plotX0 - 12 }} className={`pointer-events-auto ${b.depth ? 'pl-4' : ''}`}>
                        {zoomable ? (
                          <button type="button" onClick={() => zoomTo(zoomRow?.key === r!.key ? null : r!.key)} aria-expanded={zoomRow?.key === r!.key}
                            aria-label={L(`${name}: ${pct(r!.pct)} reprobadas; ${pct0(r!.pctVal)} de sus pesos. Desglosar.`, `${name}: ${pct(r!.pct)} failing; ${pct0(r!.pctVal)} of its pesos. Break down.`)}
                            className={`block w-full text-left leading-tight hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${b.rail ? 'text-[13px] text-text-muted' : 'text-[13px] text-text-secondary'}`}
                            style={b.rail ? undefined : { fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 15 }}>
                            {name}
                          </button>
                        ) : (
                          <span className={`block leading-tight ${b.rail ? 'text-[13px] text-text-muted' : b.depth ? 'text-[13px] text-text-secondary' : 'text-text-primary'}`} style={b.rail || b.depth ? undefined : { fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 15 }}>{name}</span>
                        )}
                      </div>
                      {!b.rail && r && <div className="w-[200px] text-right">{rowReadout(r, r.n < 30, b.rail)}</div>}
                    </div>
                  </div>
                )
              })}
              {!waffleOn && hover && (pinned == null || comparing) && (
                <div role="presentation" className="pointer-events-none absolute z-20 max-w-[280px] rounded-sm border border-border bg-background-elevated px-2.5 py-1.5 text-[12px]"
                  style={{ left: Math.min(hover.x + 12, Math.max(0, width - 290)), top: hover.y + 12 }}>
                  <span className="block text-text-primary">{formatEntityName('institution', insts[hover.i].name, 'full')}</span>
                  <span className="font-mono tabular-nums text-text-muted">{scoreLine(insts[hover.i])} · {formatCompactMXN(insts[hover.i].total_amount_mxn)}</span>
                </div>
              )}
              {waffleOn && wHover && waffle && (() => {
                const b = waffle.blocks.find((q) => q.key === wHover.block)
                if (!b) return null
                const hist = b.historical ? L(' · ya no compra en CompraNet', ' · no longer buys on CompraNet') : ''
                return (
                  <div role="presentation" className="pointer-events-none absolute z-20 max-w-[300px] rounded-sm border border-border bg-background-elevated px-2.5 py-1.5 text-[12px]"
                    style={{ left: Math.min(wHover.x + 12, Math.max(0, width - 310)), top: wHover.y + 12 }}>
                    <span className="block text-text-primary">
                      {b.inst != null ? formatEntityName('institution', insts[b.inst].name, 'full')
                        : L(`${formatNumber(b.members.length)} instituciones · ${gradeBandFromLetter(b.grade, 'es')} · ${groupName(b.group)}`, `${formatNumber(b.members.length)} institutions · ${gradeBandFromLetter(b.grade, 'en')} · ${groupName(b.group)}`)}
                    </span>
                    <span className="tabular-nums text-text-muted">
                      {gradeBandFromLetter(b.grade, lang === 'en' ? 'en' : 'es')} · {unit === 'pesos' ? formatCompactMXN(b.value) : `${formatNumber(b.value)} ${L('contratos', 'contracts')}`} · {formatNumber(b.cells)} {L('celdas', 'cells')}{hist}
                      {b.inst != null ? L(' · clic: ficha', ' · click: card') : ''}
                    </span>
                  </div>
                )
              })()}
            </div>
            {/* Legend */}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-muted">
              <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: TIER_STYLES.Deficiente.color }} />{L('reprobada: menos de 6 de 10', 'failed: under 6 out of 10')}</span>
              {waffleOn ? (
                <>
                  <span>{unitLabel}</span>
                  <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 align-middle" style={{ background: `repeating-linear-gradient(45deg, ${TIER_STYLES.Satisfactorio.color} 0 2px, transparent 2px 4px)` }} />{L('rayado: ya no compra en CompraNet (sin contratos desde 2022)', 'hatched: no longer buys on CompraNet (no contract since 2022)')}</span>
                  <span>{L('contorno: un solo comprador', 'outline: one buyer')}</span>
                </>
              ) : (
                <>
                  <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full align-middle bg-text-muted" />{L('el resto', 'the rest')}</span>
                  <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full border border-text-muted align-middle" />{L('círculo vacío: calificación provisional (pocos contratos o mucha incertidumbre)', 'open circle: provisional grade (too few contracts or too uncertain)')}</span>
                  <span>{L('eje: calificación de 0 a 10; 6 = aprobada', 'axis: grade 0 to 10; 6 = pass')}</span>
                </>
              )}
            </p>
          </div>
          {pinnedInst && !sheet && !comparing && drawer}
        </div>
        {pinnedInst && !sheet && comparing && <div className="order-2">{drawer}</div>}

        {/* Rail + step card. Mobile: controls keep a scroll margin the height of the sticky field (WCAG Focus Not Obscured). */}
        <div className="order-3 space-y-4 [&_button]:scroll-mt-[360px] sm:[&_button]:scroll-mt-0">
          <StepRail titles={STEP_TITLES} index={stepIdx} onGo={goStep} lang={lang} reduced={reduced} watchRef={fieldRef}
            pauseSignal={pauseSignal} onPlayingChange={setPlaying} />
          <div>
            <Kicker>§ {ROMAN[stepIdx]} · {en ? STEP_TITLES[stepIdx][1] : STEP_TITLES[stepIdx][0]}</Kicker>
            <p id="tamiz-step-title" className="mt-1.5 text-text-primary" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 19, lineHeight: 1.4 }}>
              {sentence}
            </p>
            {/* Muted during autoplay so a reader is not re-announced every 9 s; the last step is announced. */}
            <p className="sr-only" aria-live="polite">{!playing || stepIdx === STEPS.length - 1 ? sentence : ''}</p>
            {step === 'grandes' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" role="switch" aria-checked={sinImss}
                  onClick={() => { interact(); patch({ sinimss: sinImss ? null : '1' }, true) }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-border px-3 text-[12px] ct-sc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span aria-hidden="true" className={`inline-block h-4 w-7 rounded-full border border-border p-0.5 transition-colors ${sinImss ? 'bg-background-elevated' : ''}`}>
                    <span className={`block h-2.5 w-2.5 rounded-full bg-text-primary transition-transform ${sinImss ? 'translate-x-3' : ''}`} />
                  </span>
                  {L(`Sin ${topName}`, `Without ${topName}`)}
                </button>
                <span className="text-[13px] tabular-nums text-text-primary" aria-live="polite">
                  {L('Pesos federales en instituciones reprobadas: ', 'Federal pesos in failing institutions: ')}<strong>{pct(shareNow)}</strong>
                  <span className="text-text-muted"> {sinImss ? L(`(con ${topName}: ${pct(fed.pctVal)})`, `(with ${topName}: ${pct(fed.pctVal)})`) : L(`(sin ${topName}: ${pct(facts.federalPctValExTop)})`, `(without ${topName}: ${pct(facts.federalPctValExTop)})`)}</span>
                </span>
              </div>
            )}
            {step === 'grandes' && (
              <p className="mt-2 ct-note">
                {L(
                  `Rayado: ${pct0(facts.historicalShareOfFederal)} del gasto federal es de compradores que ya no compran en CompraNet. PEMEX y CFE se califican con datos que terminan en 2018: después, CompraNet casi no ve sus compras (cobertura ≈ 0%).`,
                  `Hatched: ${pct0(facts.historicalShareOfFederal)} of federal spend belongs to buyers that no longer buy on CompraNet. PEMEX and CFE are graded on data that ends in 2018; after that CompraNet barely sees their buying (coverage ≈ 0%).`,
                )}
              </p>
            )}
            {step === 'grandes' && topInst && (
              <p className="mt-2 text-[13px] text-text-secondary">
                {L('Abrir la ficha: ', 'Open the dossier: ')}
                <EntityIdentityChip type="institution" id={topInst.id} name={topInst.name} variant="name" className="underline underline-offset-2" />
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onExplore(cta.filter, step)}
                className="inline-flex min-h-11 items-center rounded-sm border border-text-primary bg-background-elevated px-4 text-[13px] ct-sc text-text-primary hover:border-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
                {cta.label} →
              </button>
              {stepIdx < STEPS.length - 1 && (
                <button type="button" onClick={() => { interact(); goStep(stepIdx + 1) }} className="min-h-11 px-2 text-[13px] text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {L(`Siguiente: ${STEP_TITLES[stepIdx + 1][0].toLowerCase()} →`, `Next: ${STEP_TITLES[stepIdx + 1][1].toLowerCase()} →`)}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {pinnedInst && sheet && drawer}
    </div>
  )
}

/** Keyboard path for the brush: two whole-point inputs; a valid pair commits, two blanks clear. */
function RangeInputs({ range, xMin, xMax, lang, onCommit }: {
  range: Range | null
  xMin: number
  xMax: number
  lang: string
  onCommit: (r: Range | null) => void
}) {
  const en = lang === 'en'
  const [lo, setLo] = useState(range ? String(range[0]) : '')
  const [hi, setHi] = useState(range ? String(range[1]) : '')
  const [rLo, rHi] = range ?? [null, null]
  useEffect(() => {
    setLo(rLo == null ? '' : String(rLo))
    setHi(rHi == null ? '' : String(rHi))
  }, [rLo, rHi])
  const change = (nLo: string, nHi: string) => {
    setLo(nLo)
    setHi(nHi)
    if (!nLo && !nHi) { if (range) onCommit(null); return }
    const r = parseRange(`${nLo}-${nHi}`, xMin, xMax)
    if (r && (r[0] !== rLo || r[1] !== rHi)) onCommit(r)
  }
  const cls = 'min-h-11 w-16 rounded-sm border border-border bg-background px-2 text-[13px] tabular-nums text-text-primary focus:border-text-primary focus:outline-none'
  return (
    <fieldset className="inline-flex items-center gap-1.5">
      <legend className="sr-only">{en ? `Points range, ${xMin} to ${xMax}` : `Rango de puntos, ${xMin} a ${xMax}`}</legend>
      <span aria-hidden="true" className="ct-sc text-text-muted">{en ? 'Points' : 'Puntos'}</span>
      <label className="sr-only" htmlFor="tamiz-rango-lo">{en ? 'From' : 'Desde'}</label>
      <input id="tamiz-rango-lo" type="number" inputMode="numeric" min={xMin} max={xMax} step={1} value={lo} placeholder={String(xMin)}
        onChange={(e) => change(e.target.value, hi)} className={cls} />
      <span aria-hidden="true" className="text-text-muted">–</span>
      <label className="sr-only" htmlFor="tamiz-rango-hi">{en ? 'To' : 'Hasta'}</label>
      <input id="tamiz-rango-hi" type="number" inputMode="numeric" min={xMin} max={xMax} step={1} value={hi} placeholder={String(xMax)}
        onChange={(e) => change(lo, e.target.value)} className={cls} />
    </fieldset>
  )
}

function TamizDrawer({ model, inst, lang, onClose, walk, onStep, onCompare, docked = false }: {
  /** Desktop column beside the field (sticky); false = mobile/tablet bottom sheet. */
  docked?: boolean
  model: FieldModel
  inst: FieldInst
  lang: string
  onClose: () => void
  /** Position in the current row order (worst first) + neighbour names; null outside a row. */
  walk: { k: number; n: number; label: string; prev: string | null; next: string | null } | null
  onStep: (d: -1 | 1) => void
  onCompare: () => void
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const v3 = model.method === 'v3'
  const s100 = (i: FieldInst) => (i.total_score * 100) / model.xMax
  const tier = TIER_STYLES[gradeToTierKey(inst.grade)]
  const pillar = model.pillars.find((p) => p.key === inst.loss.key)
  const closeRef = useRef<HTMLButtonElement>(null)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const a = document.activeElement
    if (walk && a === prevRef.current && walk.prev == null) nextRef.current?.focus()
    if (walk && a === nextRef.current && walk.next == null) prevRef.current?.focus()
  }, [walk])
  const fmt = (n: string) => formatEntityName('institution', n, 'full')
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="tamiz-drawer-title"
      className={docked
        ? 'sticky top-4 w-[320px] shrink-0 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-sm border border-border bg-background-elevated p-4'
        : 'fixed inset-x-0 bottom-[calc(56px+var(--sab,0px))] z-40 max-h-[60vh] overflow-y-auto rounded-t-md border-t border-border bg-background-elevated p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:w-[360px] sm:rounded-sm sm:border'}
    >
      <div className="flex items-start justify-between gap-2">
        <p id="tamiz-drawer-title" className="text-[13px] ct-sc text-text-muted">{L('§ Ficha rápida', '§ Quick card')}</p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={L('Cerrar', 'Close')} className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1">
        <EntityIdentityChip type="institution" id={inst.id} name={inst.name} variant="name" fullName className="text-[16px] text-text-primary hover:underline underline-offset-2" />
      </div>
      <p className="mt-2 font-mono tabular-nums">
        <span className="text-[22px] font-bold" style={{ color: tier.ink }}>{gradeOutOf10(s100(inst))}</span>
        <span className="ml-2 text-[14px] text-text-secondary">{L('de 10', 'of 10')} · {gradeWord(s100(inst), lang === 'en' ? 'en' : 'es')}</span>
        {inst.provisional && (
          <span className="ml-2 rounded-sm border border-dashed border-text-muted px-1.5 py-0.5 text-[13px] ct-sc text-text-muted">
            {L('provisional', 'provisional')}{inst.score_lo != null ? ` · ${Math.round(inst.score_lo)}–${Math.round(inst.score_hi ?? inst.score_lo)}` : ''}
          </span>
        )}
      </p>
      <p className="mt-1 font-mono text-[12px] tabular-nums text-text-secondary">
        {formatCompactMXN(inst.total_amount_mxn)} · {formatNumber(inst.total_contracts)} {L('contratos', 'contracts')}
        {inst.historical != null && (
          <span className={`ml-2 rounded-sm border px-1.5 py-0.5 text-[13px] ${inst.historical ? 'border-text-muted text-text-muted' : 'border-border text-text-secondary'}`}>
            {inst.historical ? L(`Histórica · último contrato ${inst.last_year ?? '—'}`, `Historical · last contract ${inst.last_year ?? '—'}`) : L('Activa', 'Active')}
          </span>
        )}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-text-secondary">
        {L('Lo que más le costó: ', 'What cost it most: ')}
        <strong className="font-semibold text-text-primary">{pillarName(model, inst.loss.key, lang)}</strong>
        {v3
          ? L(` — restó ${inst.loss.lost.toFixed(1)} de los 100 puntos.`, ` — took ${inst.loss.lost.toFixed(1)} of the 100 points.`)
          : L(` — perdió ${inst.loss.lost.toFixed(1)} de ${pillar?.max ?? ''} puntos.`, ` — lost ${inst.loss.lost.toFixed(1)} of ${pillar?.max ?? ''} points.`)}
      </p>
      {inst.flagged_n > 0 && (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: TIER_STYLES.Regular.ink }}>
          {L(
            `Incluye ${inst.flagged_n} ${inst.flagged_n === 1 ? 'contrato' : 'contratos'} de más de 10 mil MDP en revisión (${formatCompactMXN(inst.flagged_value_mxn)}, ${pct0(inst.flagged_value_mxn / (inst.total_amount_mxn || 1))} de su gasto).`,
            `Includes ${inst.flagged_n} ${inst.flagged_n === 1 ? 'contract' : 'contracts'} over 10 billion pesos under review (${formatCompactMXN(inst.flagged_value_mxn)}, ${pct0(inst.flagged_value_mxn / (inst.total_amount_mxn || 1))} of its spend).`,
          )}
        </p>
      )}
      {v3 && inst.alt_grade && (
        <p className="mt-2 text-[12px] tabular-nums text-text-muted">
          {L('Antes (v2, oficial hasta oct. 2026): ', 'Before (v2, official until Oct 2026): ')}
          <span className="text-text-secondary">{gradeOutOf10(inst.alt_score)} · {gradeWord(inst.alt_score, lang === 'en' ? 'en' : 'es')}</span>
        </p>
      )}
      {v3 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-snug text-text-secondary">
          <span>{L(`Tendencia ${TREND_YEARS}, por número de contratos:`, `Trend ${TREND_YEARS}, by number of contracts:`)}</span>
          {inst.trend
            ? <><TrendChip trend={inst.trend} slope={inst.trend_slope} lang={lang} /><span className="font-mono tabular-nums text-text-muted">{trendDetail(inst.trend_slope, lang)}</span></>
            : <span className="text-text-muted">{L('sin años suficientes', 'not enough years')}</span>}
        </p>
      )}
      {v3 && inst.coverage && (
        <p className="mt-2 text-[12px] leading-snug text-text-secondary">{coverageShort(inst.coverage, lang)}</p>
      )}
      {walk && walk.n > 1 && (
        <nav aria-label={L('Recorrer el grupo', 'Step through the group')} className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
          <button ref={prevRef} type="button" onClick={() => onStep(-1)} disabled={walk.prev == null}
            aria-label={walk.prev ? L(`Anterior: ${fmt(walk.prev)}`, `Previous: ${fmt(walk.prev)}`) : L('Anterior', 'Previous')} aria-keyshortcuts="ArrowLeft"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-text-secondary hover:text-text-primary disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 text-center text-[13px] leading-tight text-text-muted" aria-live="polite">
            <span className="tabular-nums text-text-secondary">{walk.k + 1} / {walk.n}</span>
            <span className="block truncate">{walk.label} · {L('peor primero · ← →', 'worst first · ← →')}</span>
          </p>
          <button ref={nextRef} type="button" onClick={() => onStep(1)} disabled={walk.next == null}
            aria-label={walk.next ? L(`Siguiente: ${fmt(walk.next)}`, `Next: ${fmt(walk.next)}`) : L('Siguiente', 'Next')} aria-keyshortcuts="ArrowRight"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-text-secondary hover:text-text-primary disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
      <button type="button" onClick={onCompare}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-border text-[12px] ct-sc text-text-secondary hover:border-text-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />{L('Comparar con otra', 'Compare with another')}
      </button>
      <Link to={`/institutions/${inst.id}`} className="mt-1 inline-flex min-h-11 items-center text-[13px] ct-sc text-accent-hover underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {L('Abrir la ficha completa →', 'Open the full dossier →')}
      </Link>
    </aside>
  )
}
