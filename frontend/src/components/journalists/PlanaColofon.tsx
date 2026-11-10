// ---------------------------------------------------------------------------
// PlanaColofon — «Declaraciones», the foot of the page (owner 2026-10-15: object first):
// the thesis that used to be the lede, then «Fe de plana» as numbered clauses.
//
// The honesty colophon that closes the front page. Names what the status rubric means,
// states the empty top rung as of this cut, and repeats the platform's two standing
// caveats: the model emits a risk indicator (not a probability of corruption) and the
// source is frozen. Numbered clauses on rules, one link out.
// ---------------------------------------------------------------------------

import { Link } from 'react-router-dom'
import { glueDashes } from '@/lib/typography'
import { CURRENT_MODEL_VERSION } from '@/lib/constants'

export function PlanaColofon({ lang, total, procesadoCount, lede }: { lang: 'en' | 'es'; total: number; procesadoCount: number; lede: string }) {
  const isEs = lang === 'es'

  const clauseI = isEs
    ? 'Cada investigación lleva su rúbrica de avance: «pista de datos» (el patrón existe solo en los datos; no acusa a nadie), «reportado» (la prensa — esta casa u otra — lo ha documentado), «bajo auditoría» (un órgano fiscalizador — ASF, COFECE, OIC — lo ha revisado), «procesado» (existe proceso penal o civil). La rúbrica mide la distancia entre el dato y la consecuencia, no la gravedad del hallazgo.'
    : 'Each investigation carries its progress rubric: “data lead” (the pattern exists only in the data; it accuses no one), “reported” (the press — this desk or another — has documented it), “under audit” (an oversight body — ASF, COFECE, OIC — has reviewed it), “prosecuted” (criminal or civil proceedings exist). The rubric measures the distance between data and consequence, not the gravity of the finding.'

  const clauseII =
    procesadoCount === 0
      ? isEs
        ? `Al corte, ninguna de las ${total} ha llegado a proceso.`
        : `As of this cut, none of the ${total} has reached prosecution.`
      : isEs
        ? `Al corte, ${procesadoCount} de las ${total} han llegado a proceso.`
        : `As of this cut, ${procesadoCount} of the ${total} have reached prosecution.`

  const clauseIII = isEs
    ? `Las cifras dentro de cada historia provienen del modelo ${CURRENT_MODEL_VERSION} y de casos documentados. El modelo emite un indicador de riesgo, no una probabilidad de corrupción; una pista de datos señala un patrón, no un culpable.`
    : `The figures inside each story come from model ${CURRENT_MODEL_VERSION} and from documented cases. The model emits a risk indicator, not a probability of corruption; a data lead names a pattern, not a culprit.`

  const clauseIV = isEs
    ? 'COMPRANET quedó congelado el 28 de septiembre de 2025; desde entonces la fuente son los datos abiertos de ComprasMX, y 2026 es un año parcial (al corte). La cobertura de RFC en 2002–2010 es de 0.1%: los primeros años están subexpuestos.'
    : 'COMPRANET froze on September 28, 2025; since then the source is ComprasMX open data, and 2026 is a partial year (to the cut-off). RFC coverage for 2002–2010 is 0.1%: the early years are underexposed.'

  const clauses = [
    { n: 'I.', body: clauseI },
    { n: 'II.', body: clauseII },
    { n: 'III.', body: clauseIII },
    { n: 'IV.', body: clauseIV },
  ]

  return (
    <section className="ct-section" aria-labelledby="jx-fe-h">
      <div className="ct-annex-row">
        <h2 id="jx-fe-h" className="ct-h2">{isEs ? 'Declaraciones' : 'Declarations'}</h2>
        <div className="ct-annex-aside">
          <Link to="/methodology" className="ct-more ct-link">{isEs ? 'Metodología' : 'Methodology'}</Link>
        </div>
      </div>
      <p className="ct-annex-lede">{lede}</p>
      <div className="ct-section-body">
        <ol className="jx-clauses">
          {clauses.map((c) => (
            <li key={c.n}>
              <span>{c.n}</span>
              <p>{glueDashes(c.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
