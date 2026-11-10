/**
 * The three sculptural objects of concept B2 (docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md § P2, P3, C2):
 *   Columna  «La columna de los 100 pesos» (after Brancusi's Endless Column) — plate = supplier, height = its share,
 *            hue = what it mainly sells (purchase family), tone = sin concurso; «los demás» a compressed cap.
 *   Albers   «Homenaje al cuadrado» — square = a year of this term (Hoy) or a sexenio (Historia), area = money,
 *            hue = the administration (ADMIN_COLORS), tone = sin concurso; inside, its three largest suppliers.
 *   Pilares  three slabs, one per grade pillar; the dashed top = the points lost; the rule = the peer median.
 * Each mark is a button (Enter/Space) with a one-line <title> tooltip; the page opens ONE card under the object.
 */
import { useId } from 'react'
import { familyMeta, familyOf } from '@/lib/categories/families'
import { ADMIN_COLORS } from '@/lib/administrations'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'
import { columnPieces, hueTone, inactiveSince, type Lang, type Panorama, type PanoramaSupplier, type Square, type Vista } from '@/lib/institution/panorama'
import type { PillarView } from '@/lib/institution/anatomy'

const fam = (s: PanoramaSupplier) => (s.main_category_id != null ? familyMeta(familyOf(s.main_category_id)) : null)
const keyAct = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }

function Patterns({ id, hue = 'var(--color-text-muted)' }: { id: string; hue?: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-border)" strokeWidth="1.5" />
      </pattern>
      <pattern id={`${id}-dots`} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill={`color-mix(in srgb, ${hue} 10%, var(--color-background))`} /><rect width="1.2" height="1.2" fill={hue} /></pattern>
    </defs>
  )
}

/** Whole words that fit in maxCh characters; «…» only when not even the first word fits. */
export function fitName(full: string, maxCh: number): string {
  if (full.length <= maxCh) return full
  let out = ''
  for (const w of full.split(' ')) { const next = out ? `${out} ${w}` : w; if (next.length > maxCh) break; out = next }
  return out || `${full.slice(0, Math.max(1, maxCh - 1))}…`
}

export function Columna({ p, lit, picked, onPick, phone, vista, label, lang }: {
  p: Panorama
  /** suppliers kept lit by the lens / the chosen pillar; the rest dim */
  lit: Set<number> | null
  picked: number | null
  onPick: (id: number, el: Element) => void
  phone: boolean
  vista: Vista
  label: string
  lang: Lang
}) {
  const en = lang === 'en'
  const pid = useId().replace(/:/g, '')
  const { pieces, H, halfY } = columnPieces(p)
  // phone: the column + its 200 px of labels centred in the 380 frame; the share sits in the tooltip, not on the line
  const PW = phone ? 92 : 200, W = phone ? 380 : 660, X = phone ? Math.max(48, Math.round((W - PW - 220) / 2)) : 60, T = 18
  // «los demás» and the thin plates take a light tint of the dominant purchase family (owner: no grey)
  const famM = new Map<string, number>()
  for (const s of p.suppliers) { const f = fam(s); if (f) famM.set(f.color, (famM.get(f.color) ?? 0) + s.amount_mxn) }
  const restHue = [...famM.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'var(--color-text-muted)'
  const share = (m: number) => (p.amount_mxn > 0 ? (100 * m) / p.amount_mxn : 0)
  const of100 = (x: number | null) => (x == null ? '—' : x < 1 ? x.toFixed(1) : String(Math.round(x)))
  const restN = Math.max(0, p.vendors - p.suppliers.length)
  if (!pieces.length) return <p className="ib2-note">{en ? `No contracts ${label}.` : `Sin contratos ${label}.`}</p>
  return (
    <svg className="ib2-col" viewBox={`0 0 ${W} ${H + T + 22}`} role="group"
      aria-label={en ? `The column of 100 pesos ${label}: one plate per supplier, height = its share of the money` : `La columna de los 100 pesos ${label}: una placa por proveedor, altura = su parte del dinero`}>
      <Patterns id={pid} hue={restHue} />
      <text x={X} y={12}>{phone ? (en ? `100 pesos ${label}` : `100 pesos ${label}`) : en ? `100 pesos ${label} · colour = what it sells · tone = no tender` : `100 pesos ${label} · color = qué vende · tono = sin concurso`}</text>
      {pieces.map((pc) => {
        if (pc.kind === 'cap') {
          const tx = X + PW + 12, y0 = pc.y + T
          return (
            <g key="cap" className="ib2-cap">
              <rect x={X} y={y0} width={PW} height={pc.h} fill={`url(#${pid}-dots)`} stroke="var(--color-border)" />
              {pc.compressed && <path className="ib2-brk" d={`M${X - 6},${y0 + 14} l${PW / 2 + 6},-8 l${PW / 2 + 6},8`} />}
              <text className="nm" x={tx} y={y0 + 20}>{en ? `the other ${restN.toLocaleString('en-US')} suppliers` : `los demás ${restN.toLocaleString('es-MX')} proveedores`}</text>
              <text x={tx} y={y0 + 36}>{en ? `${of100(share(pc.m))} of every 100 pesos` : `${of100(share(pc.m))} de cada 100 pesos`}{phone ? '' : ` · ${formatCompactMXN(pc.m)}`}</text>
              {phone && <text x={tx} y={y0 + 52}>{formatCompactMXN(pc.m)}</text>}
              {pc.compressed && <text x={tx} y={y0 + (phone ? 68 : 52)}>{en ? `compressed: it would measure ${(pc.trueH / 440).toFixed(1)} columns` : `comprimido: mediría ${(pc.trueH / 440).toFixed(1)} columnas`}</text>}
            </g>
          )
        }
        if (pc.kind === 'tiny') {
          return (
            <g key="tiny">
              <rect x={X} y={pc.y + T} width={PW} height={pc.h} fill={`color-mix(in srgb, ${restHue} 22%, var(--color-background))`} stroke="var(--color-background)" />
              {pc.h >= 11 && <text x={X + PW + 12} y={pc.y + T + pc.h / 2 + 4}>{en ? `${pc.n} smaller ones · ${share(pc.m).toFixed(1)} of 100` : `${pc.n} más pequeños · ${share(pc.m).toFixed(1)} de 100`}</text>}
            </g>
          )
        }
        const s = pc.s, f = fam(s), on = !lit || lit.has(s.vendor_id)
        // owner 11-06 «less …»: fit whole words into the room beside the column; the full name is in the tooltip and the card
        const name = fitName(formatEntityName('vendor', s.vendor_name, 'full'), Math.floor((W - (X + PW + 12) - (phone ? 4 : 90)) / 7.2))
        const gone = vista === 'historia' ? inactiveSince(s) : null
        const fill = f ? hueTone(f.color, s.da_pct) ?? `url(#${pid}-hatch)` : `url(#${pid}-hatch)`
        const tip = `${formatEntityName('vendor', s.vendor_name, 'full')}${s.persona_fisica ? (en ? ' · individual' : ' · persona física') : ''} · ${of100(s.share_pct)} ${en ? 'of 100 pesos' : 'de 100 pesos'} · ${formatCompactMXN(s.amount_mxn)} · ${s.da_pct == null ? '—' : `${Math.round(s.da_pct)} ${en ? 'of 100 with no tender' : 'de 100 sin concurso'}`}${f ? ` · ${en ? f.en : f.es}` : ''}`
        const act = (el: Element) => onPick(s.vendor_id, el)
        return (
          <g key={s.vendor_id} className={`ib2-pl${on ? '' : ' is-off'}${s.in_ground_truth ? ' is-gt' : ''}`} tabIndex={0} role="button" aria-pressed={picked === s.vendor_id}
            data-vid={s.vendor_id} aria-label={tip} onClick={(e) => act(e.currentTarget)} onKeyDown={(e) => keyAct(() => act(e.currentTarget))(e)}>
            <title>{tip}</title>
            <rect x={X} y={pc.y + T} width={PW} height={pc.h} fill={fill} />
            <rect className="hit" x={X} y={pc.y + T} width={PW} height={pc.h} />
            {pc.h >= 14 && (
              <text className="nm" x={X + PW + 12} y={pc.y + T + pc.h / 2 + 4}>
                {name}{s.persona_fisica ? (en ? ' · individual' : ' · persona física') : ''}
                {!phone && <tspan className="sub">{` ${of100(s.share_pct)} ${en ? 'of 100' : 'de 100'}${gone ? (en ? ` · no contracts since ${gone}` : ` · sin contratos desde ${gone}`) : ''}`}</tspan>}
              </text>
            )}
          </g>
        )
      })}
      {halfY != null
        ? <g className="ib2-half"><line x1={X - 8} y1={halfY + T} x2={X + PW + 8} y2={halfY + T} /><text x={X - 8} y={halfY + T - 4} textAnchor="end">{en ? 'half ↑' : 'mitad ↑'}</text></g>
        : <text className="ib2-halftxt" x={X} y={H + T + 16}>{en ? 'half the money falls inside «the others»' : 'la mitad del dinero cae dentro de «los demás»'}</text>}
    </svg>
  )
}

/** P3: one square per year (Hoy) or sexenio (Historia); inside, its three largest suppliers on the same scale. */
export function Albers({ squares, picked, onSquare, onVendor, phone, lang }: {
  squares: Square[]
  picked: string | null
  onSquare: (key: string, el: Element) => void
  onVendor: (id: number, el: Element) => void
  phone: boolean
  lang: Lang
}) {
  const en = lang === 'en'
  const pid = useId().replace(/:/g, '')
  const sq = squares.filter((s) => s.amount > 0)
  if (!sq.length) return <p className="ib2-note">{en ? 'No contracts in this period.' : 'Sin contratos en este periodo.'}</p>
  const H = phone ? 180 : 260, pad = 12, gap = phone ? 10 : 18, label = 20
  const maxA = Math.max(...sq.map((s) => s.amount))
  const unit = (H - 2 * pad - label) / Math.sqrt(maxA)
  let x = pad
  const laid = sq.map((s) => {
    const side = Math.max(14, Math.sqrt(s.amount) * unit)
    const o = { s, side, x, y: H - pad - label - side }
    x += Math.max(side, s.label.length * 7.4) + gap
    return o
  })
  const W = Math.max(x + pad, 320)
  return (
    <svg className="ib2-alb" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W }} role="group"
      aria-label={en ? 'One square per period: area = money, tone = share without a tender' : 'Un cuadrado por periodo: área = dinero, tono = parte sin concurso'}>
      <Patterns id={pid} />
      {laid.map(({ s, side, x: sx, y }) => {
        const hue = ADMIN_COLORS[s.admin]
        const fill = s.partial || s.da == null ? `url(#${pid}-hatch)` : hueTone(hue, s.da) ?? `url(#${pid}-hatch)`
        const tip = `${s.label} · ${formatCompactMXN(s.amount)} · ${s.da == null || s.partial ? (en ? 'no procedure on record before 2011' : 'sin procedimiento registrado antes de 2011') : `${Math.round(s.da)} ${en ? 'of 100 with no tender' : 'de 100 sin concurso'}`}`
        return (
          <g key={s.key}>
            <g className="ib2-sq" tabIndex={0} role="button" aria-pressed={picked === s.key} aria-label={tip}
              onClick={(e) => onSquare(s.key, e.currentTarget)} onKeyDown={(e) => keyAct(() => onSquare(s.key, e.currentTarget))(e)}>
              <title>{tip}</title>
              <rect className="outer" x={sx} y={y} width={side} height={side} fill={fill} />
              <rect x={sx} y={H - pad - 16} width={side} height={3} fill={hue} />
              <text className="nm" x={sx} y={H - pad - 2}>{s.label}</text>
              <text x={side < 90 ? sx : sx + side} y={y - 4} textAnchor={side < 90 ? 'start' : 'end'}>{formatCompactMXN(s.amount)}</text>
            </g>
            {s.top3.map((t, j) => {
              const a = Math.sqrt(t.amount_mxn) * unit, cx = sx + side / 2, by = y + side - 4 - j * 6
              if (a < 4) return null
              const tt = `${formatEntityName('vendor', t.vendor_name, 'full')}${t.persona_fisica ? (en ? ' · individual' : ' · persona física') : ''}: ${formatCompactMXN(t.amount_mxn)}`
              return (
                <rect key={t.vendor_id} className="ib2-inr" x={cx - a / 2} y={by - a} width={a} height={a} tabIndex={0} role="button" aria-label={tt}
                  style={{ opacity: 0.9 - j * 0.25 }} onClick={(e) => onVendor(t.vendor_id, e.currentTarget)} onKeyDown={(e) => keyAct(() => onVendor(t.vendor_id, e.currentTarget))(e)}>
                  <title>{tt}</title>
                </rect>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/** C2: three slabs, a third of the grade each; the dashed top is what it lost; the rule, its peers' median. */
export function Pilares({ pillars, lead, picked, onPick, phone, lang }: {
  pillars: PillarView[]
  phone: boolean
  lead: string | null
  picked: string | null
  onPick: (key: string) => void
  lang: Lang
}) {
  const en = lang === 'en'
  const Wd = phone ? 360 : 640, Hs = 262, top = 30, full = 200, bw = phone ? 84 : 130, gap = (Wd - pillars.length * bw) / (pillars.length + 1)
  const max = pillars[0]?.maxPts ?? 100 / 3
  const y = (pts: number) => top + full - (full * pts) / max
  return (
    <svg className="ib2-pil" viewBox={`0 0 ${Wd} ${Hs}`} role="group" aria-label={en ? 'The pillars: what is left of each and what it lost' : 'Los pilares: lo que queda de cada uno y lo que perdió'}>
      <text x={phone ? 0 : gap} y={top - 12}>{phone ? (en ? `${max.toFixed(1)} = none lost · rule = peers` : `${max.toFixed(1)} = nada perdido · raya = sus pares`) : en ? `${max.toFixed(1)} = no points lost · rule = peers' median · 2002–2026` : `${max.toFixed(1)} = sin puntos perdidos · raya = mediana de sus pares · 2002–2026`}</text>
      {pillars.map((p, k) => {
        const x = gap + k * (bw + gap), kept = Math.max(0, p.maxPts - p.lossPts)
        const peer = p.ref != null ? (p.ref / p.scale) * p.maxPts : null
        const name = en ? p.short_en : p.short_es
        const tip = en
          ? `${p.label_en}: keeps ${kept.toFixed(1)} of ${p.maxPts.toFixed(1)} points, loses ${p.lossPts.toFixed(1)}. Opens who is behind it.`
          : `${p.label_es}: conserva ${kept.toFixed(1)} de ${p.maxPts.toFixed(1)} puntos, pierde ${p.lossPts.toFixed(1)}. Abre quién está detrás.`
        return (
          <g key={p.key} className={`ib2-slab${p.key === lead ? ' is-lead' : ''}`} tabIndex={0} role="button" aria-pressed={picked === p.key} aria-label={tip}
            onClick={() => onPick(p.key)} onKeyDown={keyAct(() => onPick(p.key))}>
            <title>{tip}</title>
            <rect className="lost" x={x} y={y(p.maxPts)} width={bw} height={Math.max(0, y(kept) - y(p.maxPts))} />
            <rect className="keep" x={x} y={y(kept)} width={bw} height={Math.max(1, y(0) - y(kept))} />
            <text className="pts" x={x + bw / 2} y={y(kept) - 6} textAnchor="middle">−{p.lossPts.toFixed(1)}</text>
            {peer != null && <g className="peer"><line x1={x - 6} y1={y(peer)} x2={x + bw + 6} y2={y(peer)} />{!phone && <text x={x + bw + 8} y={y(peer) + 4}>{en ? 'peers' : 'pares'}</text>}</g>}
            <text className="lab" x={x + bw / 2} y={y(0) + 16} textAnchor="middle">{name}</text>
            <text x={x + bw / 2} y={y(0) + 30} textAnchor="middle">{en ? `${kept.toFixed(1)} of ${p.maxPts.toFixed(1)}` : `${kept.toFixed(1)} de ${p.maxPts.toFixed(1)}`}</text>
          </g>
        )
      })}
    </svg>
  )
}
