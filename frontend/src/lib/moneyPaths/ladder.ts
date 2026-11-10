/**
 * «La escalera» — the one registry of the four money-path rungs, shared by /gasto-a-ciegas, /captura and /rastro
 * (concept _explore/money_paths_2026-10-29/README.md § La navegación). Each page holds some rungs (with the instance
 * it shows, computed by the page) and links the rest to the page that holds them. Away rungs carry a qualitative
 * label only: a page never prints another page's figures it has not computed.
 */
import { RASTRO_LIVE } from '@/lib/constants'

export type MpPage = 'gasto' | 'captura' | 'rastro'
export type RungK = 1 | 2 | 3 | 4
type Bi = { es: string; en: string }

export const STEPS: { k: RungK; t: Bi; nosee: Bi }[] = [
  { k: 1, t: { es: 'El presupuesto', en: 'The budget' }, nosee: { es: 'el libro de cuentas no nombra el contrato', en: 'the account book never names the contract' } },
  { k: 2, t: { es: 'Los compradores', en: 'The buyers' }, nosee: { es: 'el registro dice quién cobró, no por qué', en: 'the register says who was paid, not why' } },
  { k: 3, t: { es: 'La pareja', en: 'The pair' }, nosee: { es: 'la razón del contrato no se comprueba desde el registro', en: 'the contract’s reason can’t be checked from the register' } },
  { k: 4, t: { es: 'El contrato', en: 'The contract' }, nosee: { es: 'después de la firma: ni pago, ni entrega, ni precio', en: 'after the signature: no payment, delivery or unit price' } },
]

export const PAGE: Record<MpPage, { href: string; name: Bi }> = {
  gasto: { href: '/gasto-a-ciegas', name: { es: 'Gasto a ciegas', en: 'Blind Spending' } },
  captura: { href: '/captura', name: { es: 'Un comprador, una empresa', en: 'One buyer, one supplier' } },
  rastro: { href: '/rastro', name: { es: 'El rastreo de un peso', en: 'Following one peso' } },
}

/** Which rungs each page holds, and the section each rung scrolls to on that page. */
export const HOLDS: Record<MpPage, Partial<Record<RungK, string>>> = {
  gasto: { 1: 'quien', 2: 'firmado' },
  captura: { 2: 'compradores', 3: 'mp-r3', 4: 'mp-r4' },
  rastro: { 1: 'mp-r1', 2: 'mp-r2', 3: 'mp-r3', 4: 'mp-r4' },
}

/** What an away rung says about the page that holds it (no figures). */
const QUAL: Record<MpPage, Partial<Record<RungK, Bi>>> = {
  gasto: { 1: { es: 'la Cuenta Pública de los entes', en: 'the entities’ public accounts' }, 2: { es: 'un ente: el Tren Maya después del decreto', en: 'one entity: the Tren Maya after the decree' } },
  captura: { 2: { es: 'los compradores y sus proveedores dominantes', en: 'the buyers and their dominant suppliers' }, 3: { es: 'IMSS ← Hemoser', en: 'IMSS ← Hemoser' }, 4: { es: 'el contrato más grande de la pareja', en: 'the pair’s largest contract' } },
  rastro: { 1: { es: 'un peso del IMSS en medicinas, 2024', en: 'one IMSS peso on medicines, 2024' }, 2: { es: 'la compra sin concurso', en: 'the untendered purchase' }, 3: { es: 'IMSS ← Maypo', en: 'IMSS ← Maypo' }, 4: { es: 'el último contrato de 2024', en: 'the last contract of 2024' } },
}

// /rastro rides RASTRO_LIVE (hidden 2026-11-04): while off, no away rung links to it (gasto + captura hold all four)
const ORDER: MpPage[] = ['gasto', 'captura', ...(RASTRO_LIVE ? ['rastro' as const] : [])]
export const hrefOf = (p: MpPage, k: RungK) => `${PAGE[p].href}#${HOLDS[p][k]}`

export interface Rung {
  k: RungK
  t: string
  nosee: string
  here: boolean
  /** the instance this page shows (here) or the holder's qualitative label (away) */
  inst: string
  /** away: where the rung lives */
  href?: string
  also: { name: string; href: string; inst: string }[]
}

export function rungsFor(page: MpPage, inst: Partial<Record<RungK, string>>, lang: 'es' | 'en'): Rung[] {
  return STEPS.map((s) => {
    const others = ORDER.filter((p) => p !== page && HOLDS[p][s.k]).map((p) => ({ name: PAGE[p].name[lang], href: hrefOf(p, s.k), inst: QUAL[p][s.k]![lang] }))
    const here = HOLDS[page][s.k] != null
    const base = { k: s.k, t: s.t[lang], nosee: s.nosee[lang] }
    if (here) return { ...base, here, inst: inst[s.k] ?? QUAL[page][s.k]![lang], also: others }
    return { ...base, here, inst: others[0].inst, href: others[0].href, also: others.slice(1) }
  })
}
