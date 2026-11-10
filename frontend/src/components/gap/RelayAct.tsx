/**
 * Act I · The relay — three dated paragraphs (left) beside «the reading,
 * measured» funnel (right). gap-relevo spec § G2. Every funnel row with a
 * matching register filter is a button that applies it; a stage the payload
 * does not carry is omitted, never faked.
 */
import { Reveal } from '@/components/contrato/Reveal'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import type { GapSummaryResponse } from '@/api/types'

type Filter = Record<string, string>

interface Row {
  key: string
  label: string
  value: number
  read: boolean
  note: React.ReactNode
  filter?: Filter
}

/** `part='funnel'` is the page's object (the reading, measured, at full measure); `part='text'` the dated relay + what was not read. */
export function RelayAct({ summary, isEs, onFilter, part }: { summary: GapSummaryResponse; isEs: boolean; onFilter: (f: Filter) => void; part: 'funnel' | 'text' }) {
  const f = summary.funnel
  const lv = summary.by_buyer_level ?? {}
  const levels = (
    [['federal', 'federal', 'federal'], ['state', 'estatal', 'state'], ['municipal', 'municipal', 'municipal'], ['autonomous', 'autónomo', 'autonomous']] as const
  ).filter(([k]) => (lv[k] ?? 0) > 0).map(([k, es, en]) => `${isEs ? es : en} ${formatNumber(lv[k])}`).join(' · ')

  const rows: Row[] = []
  if (f) {
    rows.push({ key: 'listed', label: isEs ? 'Procedimientos listados' : 'Procedures listed', value: f.listed, read: true, note: levels, filter: {} })
    rows.push({ key: 'da', label: isEs ? 'Adjudicaciones directas en alcance' : 'Direct awards in OCR scope', value: f.da_in_scope, read: true,
      note: isEs ? 'las actas de licitación, de varias páginas, no se leyeron — decisión de alcance' : "tenders' multi-page actas not read — a scope choice", filter: { art: 'any-da' } })
    if (f.letters_read != null) {
      rows.push({ key: 'letters', label: isEs ? 'Oficios de adjudicación leídos' : 'Award letters read', value: f.letters_read, read: true,
        note: isEs ? 'OCR de hasta 2 páginas por oficio' : 'OCR of up to 2 pages per letter' })
    } else if (f.letters_found != null) {
      rows.push({ key: 'letters', label: isEs ? 'Oficios de adjudicación localizados' : 'Award letters located', value: f.letters_found, read: true,
        note: isEs ? 'en los anexos del procedimiento; leídos por OCR, hasta 2 páginas' : "in the procedure's annexes; read by OCR, up to 2 pages" })
    }
    rows.push({ key: 'amounts', label: isEs ? 'Monto leído del oficio' : 'Amount read off the letter', value: f.amounts_read, read: true,
      note: `${formatCompactMXN(f.amounts_read_sum)} ${isEs ? 'leídos' : 'read'}`, filter: { src: 'ocr' } })
    rows.push({ key: 'est', label: isEs ? 'Monto estimado en su lugar' : 'Amount estimated instead', value: f.estimated, read: false,
      note: `${formatCompactMXN(f.estimated_sum)} ${isEs ? 'de partidas de ComprasMX — un número de otra naturaleza' : 'from ComprasMX line items — a different kind of number'}`, filter: { src: 'est' } })
    const top = f.self_buyer_top
    rows.push({ key: 'vendor', label: isEs ? 'Proveedor nombrado en el oficio' : 'Vendor named on the letter', value: f.vendor_named, read: true,
      note: (
        <>
          <button type="button" onClick={() => onFilter({ flag: 'self_buyer' })} className="gap-note-btn">
            {isEs ? `${formatNumber(f.self_buyer)} nombran al propio comprador` : `${formatNumber(f.self_buyer)} name the buyer itself`}
          </button>
          {top && (isEs ? ` (${top.siglas}: ${formatNumber(top.count)})` : ` (${top.siglas} alone: ${formatNumber(top.count)})`)}
          {f.illegible != null && (isEs ? ` · ${formatNumber(f.illegible)} ilegibles` : ` · ${formatNumber(f.illegible)} illegible`)}
        </>
      ) })
    rows.push({ key: 'rfc', label: isEs ? 'Empresas identificadas por RFC' : 'Companies identified by RFC', value: f.companies_rfc, read: true,
      note: isEs
        ? `${formatNumber(f.companies_rfc_in_corpus)} ya en el corpus de RUBLI · ${formatNumber(f.companies_rfc - f.companies_rfc_in_corpus)} nuevas`
        : `${formatNumber(f.companies_rfc_in_corpus)} already in RUBLI's corpus · ${formatNumber(f.companies_rfc - f.companies_rfc_in_corpus)} new`,
      filter: { vend: 'rfc' } })
  }

  const paras = [
    { date: isEs ? 'abr 2025' : 'Apr 2025', head: isEs ? 'La ley.' : 'The law.',
      text: isEs
        ? 'La nueva LAASSP (DOF 16 abr 2025) abolió CompraNet. Su sucesor, ComprasMX, lista procedimientos pero no publica datos abiertos: ganador y precio solo existen dentro del oficio que cada comprador escanea y sube.'
        : 'The new LAASSP (DOF 16 Apr 2025) abolished CompraNet. Its successor, ComprasMX, lists procedures but publishes no bulk data: winner and price live only inside the award letter each buyer scans and uploads.' },
    { date: isEs ? '28 sep 2025' : '28 Sep 2025', head: isEs ? 'El último registro.' : 'The last record.',
      text: isEs
        ? 'La última fila del archivo federal es del 28 de septiembre de 2025. Después de esa fecha nada existe como dato en ningún sitio del Estado.'
        : "The federal bulk feed's last row is dated 28 September 2025. Nothing after it exists as data anywhere in the Mexican state." },
    { date: isEs ? 'oct 2025 en adelante' : 'Oct 2025 onward', head: isEs ? 'El relevo.' : 'The relay.',
      text: isEs
        ? 'RUBLI reprodujo la firma de peticiones de ComprasMX, listó cada procedimiento posterior, descargó cada oficio de adjudicación directa y lo leyó por OCR. Lo que sigue es el registro público de las compras federales, continuado por nosotros. La columna derecha dice exactamente cuánto de él pudimos leer.'
        : 'RUBLI reproduced ComprasMX\'s request signature, listed every procedure since, pulled every direct-award letter and read it by OCR. What follows is the public record of federal purchasing, continued by us. The right column says exactly how much of it we could read.' },
  ]

  if (part === 'funnel') return f ? (
        <figure aria-labelledby="gap-reading-h" className="ct-rb-compact" data-object>
          <h3 id="gap-reading-h" className="ct-annex-h">
            <span>{isEs ? 'La lectura, medida' : 'The reading, measured'}</span>
            <span className="ct-mono">{isEs ? 'de los procedimientos listados' : 'of the procedures listed'}</span>
          </h3>
          <Reveal role="list" aria-label={isEs ? 'La lectura, medida' : 'The reading, measured'}>
            <div className="ct-axis" aria-hidden="true">
              <div className="ct-trk">
                {[0, 25, 50, 75, 100].map((k) => (
                  <span key={k} style={{ left: `${k}%`, transform: k === 0 ? 'none' : k === 100 ? 'translateX(-100%)' : undefined }}>{k}%</span>
                ))}
              </div>
            </div>
            {rows.map((r, i) => {
              const body = (
                <>
                  <div className="ct-nm">{r.label}<small>{r.note}</small></div>
                  <div className="ct-trk" style={{ ['--v' as string]: `${Math.min(1, r.value / Math.max(1, f.listed)) * 100}%`, ['--c' as string]: r.read ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    <i style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }} />
                  </div>
                  <div className="ct-val">{formatNumber(r.value)}</div>
                </>
              )
              return r.filter ? (
                <button key={r.key} type="button" role="listitem" className="ct-brow" onClick={() => onFilter(r.filter!)}
                  aria-label={isEs ? `${r.label}: ${formatNumber(r.value)}. Abrir estas filas en el registro` : `${r.label}: ${formatNumber(r.value)}. Open these rows in the register`}>
                  {body}
                </button>
              ) : <div key={r.key} role="listitem" className="ct-brow">{body}</div>
            })}
          </Reveal>
        </figure>
  ) : null

  return (
    <div className="gap-relay">
      <div>
        {paras.map((p) => (
          <p key={p.date}>
            <span className="gap-date">{p.date}</span>
            <b>{p.head}</b> {p.text}
          </p>
        ))}
        <p className="ct-note">
          {isEs
            ? 'Alerta = indicador estructural (sin concurso, monto no revelado, puerta de proveedor único, concentración, magnitud), no el modelo v0.9.2, que califica los contratos de los datos abiertos de ComprasMX y no estas filas recuperadas.'
            : 'Alert = structural indicator (no-bid, undisclosed amount, sole-source door, concentration, magnitude), not the v0.9.2 model, which scores the contracts in ComprasMX’s open data, not these recovered rows.'}
        </p>
      </div>
      <div>
        {f && f.letters_found != null && (
          <div className="gap-unread">
            <h3 className="ct-annex-h">{isEs ? 'Lo que no se leyó' : 'What was not read'}</h3>
            <ul>
              {[
                [f.listed - f.da_in_scope, isEs ? 'licitaciones e invitaciones: sus actas de varias páginas no se leyeron' : 'tenders and invitations: their multi-page actas were not read'],
                [f.da_in_scope - f.letters_found, isEs ? 'adjudicaciones directas sin oficio de fallo localizado' : 'direct awards with no award letter located'],
                [f.letters_found - f.amounts_read, isEs ? 'oficios sin un monto legible: se muestran vacíos, nunca estimados' : 'letters with no legible amount: shown empty, never estimated into the totals'],
                [f.neither, isEs ? 'adjudicaciones directas sin ganador ni monto leídos: el apagón dentro del apagón' : 'direct awards with neither winner nor amount read: the blackout inside the blackout'],
              ].map(([n, t]) => (
                <li key={String(t)}>
                  <span>{formatNumber(n as number)}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
