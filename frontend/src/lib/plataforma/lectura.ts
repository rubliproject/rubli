/**
 * «La lectura» for the Plataforma pages (Plataforma.tsx PfShell `lectura`): plain statements, findings
 * first, each ≤ 15 words. A computed claim is returned only when its condition holds (lectura.test.ts).
 */
type Lang = 'es' | 'en'
const L = (lang: Lang, es: string, en: string) => (lang === 'es' ? es : en)

/** «Uno de cada diez contratos sale alto o crítico», from the live high + critical rate (%). */
export function oneInSentence(lang: Lang, rate: number | null | undefined): string | null {
  if (typeof rate !== 'number' || !(rate > 0) || rate > 100) return null
  const n = Math.round(100 / rate)
  return n === 10
    ? L(lang, 'Uno de cada diez contratos sale alto o crítico.', 'One contract in ten comes out high or critical.')
    : L(lang, `Uno de cada ${n} contratos sale alto o crítico.`, `One contract in ${n} comes out high or critical.`)
}

const per100 = (x: number) => Math.round(x * 100)
const valid = (x: number | null | undefined): x is number => typeof x === 'number' && x > 0.5 && x <= 1

export function methodologyLectura(lang: Lang, f: { highRate?: number | null; auc?: number | null; moneyOnly?: number | null }): string[] {
  const out: (string | null)[] = [
    oneInSentence(lang, f.highRate),
    L(lang, 'Mide el parecido con casos documentados. No prueba culpa.', 'It measures resemblance to documented cases. It does not prove guilt.'),
    valid(f.auc)
      ? L(lang, `Entre un proveedor con caso y uno sin caso, acierta ${per100(f.auc)} de cada 100.`, `Given one supplier with a case and one without, it is right ${per100(f.auc)} times in 100.`)
      : null,
    // «almost as well» only while the size-only rule sits within 5 points of the model
    valid(f.auc) && valid(f.moneyOnly) && f.auc - f.moneyOnly < 0.05
      ? L(lang, `Ordenar solo por tamaño acierta casi igual: ${per100(f.moneyOnly)} de cada 100.`, `Ranking by size alone does almost as well: ${per100(f.moneyOnly)} in 100.`)
      : null,
    L(lang, 'No ve lo que pasa después de firmar el contrato.', 'It cannot see what happens after the contract is signed.'),
  ]
  return out.filter((c): c is string => c != null)
}

export function datosLectura(lang: Lang, f: { total?: number | null; release: number; version: string }): string[] {
  const loc = lang === 'es' ? 'es-MX' : 'en-US'
  const more = typeof f.total === 'number' && f.total > f.release ? f.total - f.release : null
  const out: (string | null)[] = [
    L(lang, 'Toda la base se puede descargar gratis, sin RFC.', 'The whole database can be downloaded for free, with no RFCs.'),
    L(lang, 'CompraNet dejó de publicar el 28 de septiembre de 2025.', 'CompraNet stopped publishing on 28 September 2025.'),
    more != null
      ? L(lang, `Hoy el sitio tiene ${more.toLocaleString(loc)} contratos más que la versión ${f.version}.`, `Today the site holds ${more.toLocaleString(loc)} more contracts than release ${f.version}.`)
      : L(lang, `La versión ${f.version} tiene ${f.release.toLocaleString(loc)} contratos.`, `Release ${f.version} holds ${f.release.toLocaleString(loc)} contracts.`),
    L(lang, 'Antes de 2010 los registros son más pobres.', 'Before 2010 the records are thinner.'),
  ]
  return out.filter((c): c is string => c != null)
}

export function pressLectura(lang: Lang, f: { highRate?: number | null }): string[] {
  const out: (string | null)[] = [
    L(lang, 'Un indicador alto dice dónde mirar. No es prueba.', 'A high indicator says where to look. It is not proof.'),
    oneInSentence(lang, f.highRate),
    L(lang, 'Todo es gratis y sin registro.', 'Everything is free, with no sign-up.'),
  ]
  return out.filter((c): c is string => c != null)
}

export function privacyLectura(lang: Lang): string[] {
  return [
    L(lang, 'No pedimos cuenta ni usamos cookies de rastreo.', 'We ask for no account and use no tracking cookies.'),
    L(lang, 'Tampoco usamos analíticas de terceros.', 'Nor do we use third-party analytics.'),
    L(lang, 'Si una persona física vende al gobierno, su nombre aparece marcado.', 'If an individual sells to the government, their name appears, labelled.'),
    L(lang, 'Nunca mostramos su RFC, su CURP ni su domicilio.', 'We never show their RFC, CURP or address.'),
    L(lang, 'Puede pedir una corrección u oponerse. Respondemos en 20 días.', 'You can ask for a correction or object. We answer within 20 days.'),
  ]
}
