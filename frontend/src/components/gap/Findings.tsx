/** What the file says — four curated findings, one per ruled row: the claim 7fr | its evidence 5fr. gap-relevo spec § G3. */
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RISK_COLORS } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { FINDINGS, FINDINGS_AS_OF } from '@/lib/gap/findings'

export function Findings({ isEs, onFilter }: { isEs: boolean; onFilter: (f: Record<string, string>) => void }) {
  return (
    <div>
      {FINDINGS.map((f) => (
        <article key={f.key} className="gap-find">
          <div>
            <div className="gap-kicker">
              <span>{isEs ? f.kicker.es : f.kicker.en}</span>
              <span className="ct-mono">{FINDINGS_AS_OF}</span>
            </div>
            <h3>{isEs ? f.headline.es : f.headline.en}</h3>
            <p>{isEs ? f.body.es : f.body.en}</p>
            <button type="button" onClick={() => onFilter(f.filter)} className="ct-more ct-link">
              {isEs ? `Abrir las ${formatNumber(f.rows)} filas en el registro` : `Open the ${formatNumber(f.rows)} rows in the register`}
            </button>
          </div>
          <div className="gap-find-ev">
            {f.stats.length > 0 && (
              <dl className="gap-stats">
                {f.stats.map((s) => (
                  <div key={s.value}>
                    <dt>{s.value}</dt>
                    <dd>{isEs ? s.label.es : s.label.en}</dd>
                  </div>
                ))}
              </dl>
            )}
            {f.pairs && (
              <ul className="gap-pairs" aria-label={isEs ? 'Adjudicación directa, antes y después del apagón' : 'Direct award, before and after the blackout'}>
                {f.pairs.map((p) => {
                  const d = p.after - p.before
                  return (
                    <li key={p.id}>
                      <span><EntityIdentityChip type="institution" id={p.id} name={p.name} variant="name" size="inherit" fullName /></span>
                      <span className="ct-mono">
                        <span className="text-text-muted">{p.before.toFixed(1)}%</span> → <b style={{ color: d >= 5 ? RISK_COLORS.critical : undefined }}>{p.after.toFixed(1)}%</b>
                      </span>
                      <span className="text-text-muted">{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pp {isEs ? 'sin concurso' : 'no-bid'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            {f.entities.length > 0 && (
              <div className="gap-ents">
                {f.entities.map((e) => (
                  <span key={e.name}>
                    {e.id
                      ? <EntityIdentityChip type={e.type} id={e.id} name={e.name} variant="name" fullName />
                      : <span>{formatVendorName(e.name, 999)}</span>}
                    {e.note && <span className="ct-mono"> {e.note}</span>}
                  </span>
                ))}
              </div>
            )}
            <div className="gap-find-q">{isEs ? 'Consulta' : 'Query'}: {isEs ? f.query.es : f.query.en}</div>
          </div>
        </article>
      ))}
    </div>
  )
}
