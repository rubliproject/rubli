/**
 * Monto en letra — a peso amount written out the way a Mexican contract does
 * («Nueve billones novecientos mil millones de pesos 00/100 M.N.»), DESIGN.md §2.
 * Long scale in Spanish (millón, mil millones, billón); short scale in English.
 * Integers only, up to 999,999 billones; the caller rounds.
 */
const ES_U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const ES_T = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const ES_H = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function es999(n: number): string {
  if (n === 100) return 'cien'
  const h = Math.floor(n / 100), r = n % 100
  const tens = r < 30 ? ES_U[r] : ES_T[Math.floor(r / 10)] + (r % 10 ? ' y ' + ES_U[r % 10] : '')
  return [ES_H[h], tens].filter(Boolean).join(' ')
}
function es6(n: number): string { // 0 – 999,999
  const k = Math.floor(n / 1000), r = n % 1000
  return [k === 0 ? '' : k === 1 ? 'mil' : `${es999(k)} mil`, es999(r)].filter(Boolean).join(' ')
}

const EN_U = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function en999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  const tens = r < 20 ? EN_U[r] : EN_T[Math.floor(r / 10)] + (r % 10 ? '-' + EN_U[r % 10] : '')
  return [h ? `${EN_U[h]} hundred` : '', tens].filter(Boolean).join(' ')
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function montoEnLetra(pesos: number, lang: 'es' | 'en'): string {
  const n = Math.round(Math.max(0, pesos))
  if (lang === 'en') {
    const parts: string[] = []
    let rest = n
    for (const [v, w] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']] as const) {
      const q = Math.floor(rest / v); rest -= q * v
      if (q) parts.push(w ? `${en999(q)} ${w}` : en999(q))
    }
    return cap(`${parts.join(' ') || 'zero'} pesos 00/100 M.N.`)
  }
  const bill = Math.floor(n / 1e12), mill = Math.floor((n % 1e12) / 1e6), rest = n % 1e6
  const parts = [
    bill ? (bill === 1 ? 'un billón' : `${es6(bill)} billones`) : '',
    mill ? (mill === 1 ? 'un millón' : `${es6(mill)} millones`) : '',
    es6(rest),
  ].filter(Boolean)
  const de = rest === 0 && (bill || mill) ? ' de' : '' // «nueve billones de pesos», «mil pesos»
  return cap(`${parts.join(' ') || 'cero'}${de} pesos 00/100 M.N.`)
}
