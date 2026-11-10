/**
 * Focos Rojos «El mapa de la fila» (/aria?ver=mapa, owner 2026-11-02 final round) — the pure half:
 * the fila's sky manifest (El Mapa's constellations, only the institutions that hold flagged
 * vendors), the soft pattern names, the ranking rule in words and the standout aspects as phrases.
 * Data: GET /aria/mapa (buyers) and /aria/mapa/vendors (the IPS ranking with aspects).
 */
import type { AriaMapaAspect, AriaMapaInstitution, AriaMapaVendor } from '@/api/types'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { getRiskLevelFromScore } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'

export type Lang = 'es' | 'en'
export const tr = (pair: [string, string], lang: Lang) => pair[lang === 'en' ? 1 : 0]

/** The soft public names (owner 2026-11-02); the official name (patterns.ts) rides as the gloss. */
export const PATTERN_SOFT: Record<string, [string, string]> = {
  P6: ['Comprador único', 'Single buyer'],
  P3: ['Aparece y desaparece', 'Comes and goes'],
  P2: ['Sin historial', 'No track record'],
  P4: ['Mismos competidores', 'Same rivals'],
  P1: ['Peso grande en su sector', 'Large sector share'],
  P5: ['Monto fuera de rango', 'Amount out of range'],
  P7: ['Con registro externo', 'External record'],
}
export const softPattern = (code: string | null | undefined, lang: Lang): string | null =>
  code && PATTERN_SOFT[code] ? tr(PATTERN_SOFT[code], lang) : null

/** The ranking rule, in words (docs/ARIA_SPEC.md § 3 as implemented). */
export const RULE: [string, string] = [
  'Orden: prioridad de investigación (IPS) = indicador de riesgo o anomalía 40 % · modelo anterior 20 % · registros externos 20 % · escala del dinero 20 %. Nivel 1 desde 0.80, nivel 2 desde 0.60, nivel 3 desde 0.40.',
  'Order: investigation priority (IPS) = risk indicator or anomaly 40% · earlier model 20% · external records 20% · scale of the money 20%. Tier 1 from 0.80, tier 2 from 0.60, tier 3 from 0.40.',
]

export const LEVEL_WORD: Record<string, [string, string]> = { critical: ['crítico', 'critical'], high: ['alto', 'high'], medium: ['medio', 'medium'], low: ['bajo', 'low'] }

/**
 * The fila's sky: the same constellations, only the institutions that hold flagged vendors.
 *   radius = log money of ITS flagged vendors · colour = sector · red ring = one of them is tier 1
 * (`h` = 1 when it holds a tier-1 vendor and every sector's p90 is 1, so the sky's own ring rule
 * `h ≥ p90` draws it). Institutions without a star (no id, or merged away) are dropped and counted.
 */
export function filaManifest(m: SkyManifest, insts: AriaMapaInstitution[]): { manifest: SkyManifest; dropped: number } {
  const canon = new Map<number, number>()
  m.inst_map.raw.forEach((r, i) => canon.set(r, m.inst_map.canon[i]))
  const idx = new Map<number, number>()
  m.stars.id.forEach((id, i) => idx.set(id, i))
  const keep: number[] = []
  const v: number[] = [], h: number[] = [], nv: number[] = []
  let dropped = 0
  const seen = new Set<number>()
  for (const d of insts) {
    const id = d.institution_id
    const i = id == null ? undefined : idx.get(canon.get(id) ?? id)
    if (i == null || seen.has(i)) { dropped += 1; continue }
    seen.add(i)
    keep.push(i); v.push(d.value); h.push(d.tier1 > 0 ? 1 : 0); nv.push(d.vendors)
  }
  const pick = <T,>(a: T[]) => keep.map((i) => a[i])
  const s = m.stars
  const stars: SkyManifest['stars'] = {
    ...s, id: pick(s.id), name: pick(s.name), siglas: pick(s.siglas), sector: pick(s.sector), x: pick(s.x), y: pick(s.y),
    r: pick(s.r), v, h, nv, drawn: pick(s.drawn), np: pick(s.np), rem: pick(s.rem), linked: pick(s.linked),
  }
  return { manifest: { ...m, stars, sectors: m.sectors.map((g) => ({ ...g, h_p90: 1 })) }, dropped }
}

/** Years a vendor has been on the record, never 0 (first = last → one year). */
export const spanYears = (v: Pick<AriaMapaVendor, 'first_contract_year' | 'last_contract_year'>) =>
  v.first_contract_year && v.last_contract_year ? Math.max(1, v.last_contract_year - v.first_contract_year + 1) : null

/** One aspect as a short phrase with its number (the owner's «aspects that stand out»). */
export function aspectText(a: AriaMapaAspect, v: AriaMapaVendor, lang: Lang): string {
  const en = lang === 'en'
  const pct = Math.round(a.v * 100)
  switch (a.k) {
    case 'ratio': {
      const n = Math.max(1, Math.round(a.v * 10))
      const inst = formatEntityName('institution', v.top_institution, 'md')
      return en ? `${n} of every 10 contracts with ${inst}` : `${n} de cada 10 contratos con ${inst}`
    }
    case 'da': return en ? `${pct}% of its contracts without a tender` : `${pct} % de sus contratos sin licitación`
    case 'sb': return en ? `single award in ${pct}% of its tenders` : `único adjudicado en ${pct} % de sus licitaciones`
    case 'risk': {
      const lvl = getRiskLevelFromScore(a.v)
      // crítico prints «≥ 0.60», never a saturated 1.00 (DESIGN.md § 0.6)
      const num = lvl === 'critical' ? '≥ 0.60' : a.v.toFixed(2)
      return en ? `risk indicator ${num}, ${tr(LEVEL_WORD[lvl], lang)}` : `indicador de riesgo ${num}, ${tr(LEVEL_WORD[lvl], lang)}`
    }
    case 'vpc': return en ? `${formatCompactMXN(a.v)} per contract on average` : `${formatCompactMXN(a.v)} por contrato, en promedio`
    // the v0.9.2 model's own top inputs, against the vendors of its sector (backend precompute_aria_drivers)
    // PERCENT_RANK 1.0 is «the top of its sector», never «more than 100 %»; the fila is the tail, so the top 5 % reads in words
    case 'vol': return pct >= 95
      ? (en ? 'among the most uneven contract sizes in its sector' : 'montos entre los más dispares de su sector')
      : (en ? `contract sizes more uneven than ${pct}% of its sector` : `montos más dispares que el ${pct} % de su sector`)
    case 'pr': {
      // amounts, never prices; a 1816× ratio reads as an order of magnitude, not a false-precise number
      const x = a.v
      const how = x >= 1000 ? (en ? 'thousands of times' : 'miles de veces') : x >= 100 ? (en ? 'hundreds of times' : 'cientos de veces')
        : x >= 20 ? (en ? 'dozens of times' : 'decenas de veces') : en ? `${x >= 10 ? Math.round(x) : x.toFixed(1)} times` : `${x >= 10 ? Math.round(x) : x.toFixed(1)} veces`
      return en ? `contracts ${how} larger than its sector's median contract` : `contratos ${how} más grandes que el contrato mediano de su sector`
    }
    case 'conc': {
      const p = Math.round(a.pct * 100)
      return p >= 95
        ? (en ? 'among the heaviest suppliers in its sector' : 'entre los proveedores que más pesan en su sector')
        : (en ? `weighs more in its sector than ${p}% of its peers` : `pesa más en su sector que el ${p} % de sus pares`)
    }
    case 'new': {
      const k = spanYears(v) ?? 1
      const yrs = en ? (k === 1 ? '1 year' : `${k} years`) : (k === 1 ? '1 año' : `${k} años`)
      return en ? `appeared in ${a.v}: ${formatCompactMXN(v.total_value_mxn)} in ${yrs}` : `apareció en ${a.v}: ${formatCompactMXN(v.total_value_mxn)} en ${yrs}`
    }
    case 'gone': return en ? `no contracts since ${a.v}` : `sin contratos desde ${a.v}`
    case 'efos': return en ? "on SAT's 69-B list (definitive EFOS)" : 'en la lista 69-B del SAT (EFOS definitivo)'
    case 'sfp': return en ? 'sanctioned by the SFP' : 'sancionado por la SFP'
    case 'gt': return en ? 'linked to a documented case' : 'vinculado a un caso documentado'
  }
}

/** «M» the model alone; SAT · SFP · R(UBLI case) are external records — the puertas stamps, kept. */
export function stamps(v: Pick<AriaMapaVendor, 'is_efos_definitivo' | 'is_sfp_sanctioned' | 'in_ground_truth'>): Array<{ k: 'M' | 'SAT' | 'SFP' | 'R'; on: boolean }> {
  return [
    { k: 'M', on: true },
    { k: 'SAT', on: v.is_efos_definitivo },
    { k: 'SFP', on: v.is_sfp_sanctioned },
    { k: 'R', on: v.in_ground_truth },
  ]
}
